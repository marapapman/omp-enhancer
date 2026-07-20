#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { backup as sqliteBackup, DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import {
  classifyWorkflowRun,
  evaluateWorkflowSummary,
  mergeCustomEventFallbacks,
  parseNdjson,
  summarizeWorkflowEvents,
} from './workflow-events.mjs';
import { pluginWorkspacePaths } from '../plugin-workspaces.js';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const SNAPSHOT_ROOT_IDENTITY = Symbol('snapshotRootIdentity');
const DEFAULT_MATRIX = path.join(SCRIPT_DIR, 'fixtures', 'deepseek-installed-matrix.json');
const WORKTREE_FIXTURE_SKILLS_DIR = path.join(SCRIPT_DIR, 'fixtures', 'skills');
const WORKTREE_ASSETS_DIR = path.join(REPO_ROOT, 'plugins', 'omp-config', 'assets');
const WORKTREE_CONFIG_ALLOWLIST = new Set([
  'skills',
  'modelRoles',
  'loopGuard',
  'compaction',
  'steeringMode',
  'followUpMode',
  'interruptMode',
  'disabledProviders',
  'enabledModels',
  'task',
]);
const ISOLATION_ENV_KEYS = [
  'OMP_PROFILE',
  'PI_PROFILE',
  'PI_CONFIG_DIR',
  'PI_CODING_AGENT_DIR',
  'PI_CODING_AGENT_SESSION_DIR',
  'PI_PACKAGE_DIR',
  'OMP_AUTH_BROKER_URL',
  'OMP_AUTH_BROKER_TOKEN',
  'OMP_AUTH_BROKER_SNAPSHOT_CACHE',
  'OMP_WORKTREE_DIR',
  'OMP_GITHUB_CACHE_DB',
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_STATE_HOME',
  'XDG_CACHE_HOME',
  'XDG_RUNTIME_DIR',
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  'OPENCODE_CONFIG',
  'OPENCODE_CONFIG_DIR',
  'GEMINI_CONFIG_DIR',
];
const PROJECT_EXTENSION_DIRS = [
  ['.omp', 'extensions'],
  ['.pi', 'extensions'],
  ['.claude', 'extensions'],
  ['.opencode', 'plugins'],
  ['.gemini', 'extensions'],
  ['.codex', 'extensions'],
];
const OAUTH_REFRESH_MARGIN_MS = 10 * 60 * 1000;
const CHILD_TERMINATION_GRACE_MS = 500;
const RUN_STATE_FILE = 'run-state.json';
const RUN_LOCK_FILE = '.run.lock';
const activeChildren = new Set();
const activeRunSignalSealers = new Set();
const interruptState = { signal: null, handling: null };
let atomicWriteSequence = 0;
export const DEFAULT_NDJSON_CAPTURE_LIMITS = Object.freeze({
  maxLineCharacters: 2 * 1024 * 1024,
  maxCapturedCharacters: 32 * 1024 * 1024,
  maxCapturedLines: 100_000,
  maxDropSamples: 20,
});

const WORKFLOW_EVENT_TYPES = new Set([
  'agent_start',
  'agent_end',
  'message_end',
  'tool_execution_start',
  'tool_execution_end',
]);

async function writeJsonAtomic(target, value) {
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${atomicWriteSequence += 1}.tmp`,
  );
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function reserveOutputRoot(outputRoot, initialState) {
  await mkdir(outputRoot, { recursive: true });
  const entries = await readdir(outputRoot);
  if (entries.length > 0) {
    throw new Error(`E2E output directory must be empty: ${outputRoot}`);
  }
  await writeFile(path.join(outputRoot, RUN_LOCK_FILE), `${initialState.runId}\n`, { flag: 'wx' });
  await writeJsonAtomic(path.join(outputRoot, RUN_STATE_FILE), initialState);
  return path.join(outputRoot, RUN_STATE_FILE);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function spawnTracked(command, args, options) {
  const ownsProcessGroup = process.platform !== 'win32';
  const child = spawn(command, args, { ...options, detached: ownsProcessGroup });
  let resolveClosed;
  const entry = {
    child,
    pid: child.pid ?? null,
    ownsProcessGroup,
    closed: false,
    closePromise: new Promise((resolve) => { resolveClosed = resolve; }),
    terminationPromise: null,
  };
  activeChildren.add(entry);
  child.once('close', () => {
    entry.closed = true;
    resolveClosed();
  });
  child.once('error', () => {
    if (entry.pid == null && !entry.closed) {
      entry.closed = true;
      resolveClosed();
    }
  });
  return entry;
}

function releaseTrackedChild(entry) {
  activeChildren.delete(entry);
}

function signalChildTree(entry, signal) {
  if (entry.pid == null) return false;
  try {
    if (entry.ownsProcessGroup) process.kill(-entry.pid, signal);
    else entry.child.kill(signal);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

function childTreeExists(entry) {
  if (entry.pid == null) return false;
  try {
    if (entry.ownsProcessGroup) process.kill(-entry.pid, 0);
    else if (entry.child.exitCode === null && entry.child.signalCode === null) return true;
    else return false;
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    if (error?.code === 'EPERM') return true;
    throw error;
  }
}

async function terminateChildTree(entry, graceMs = CHILD_TERMINATION_GRACE_MS) {
  if (entry.terminationPromise) return entry.terminationPromise;
  entry.terminationPromise = (async () => {
    signalChildTree(entry, 'SIGTERM');
    await Promise.race([entry.closePromise, delay(graceMs)]);
    if (childTreeExists(entry)) signalChildTree(entry, 'SIGKILL');
    await Promise.race([entry.closePromise, delay(graceMs)]);
  })();
  return entry.terminationPromise;
}

function forceKillActiveChildren() {
  for (const entry of activeChildren) signalChildTree(entry, 'SIGKILL');
}

function interruptedError() {
  if (!interruptState.signal) return null;
  const error = new Error(`E2E run interrupted by ${interruptState.signal}.`);
  error.code = 'E2E_INTERRUPTED';
  error.receivedSignal = interruptState.signal;
  return error;
}

function throwIfInterrupted() {
  const error = interruptedError();
  if (error) throw error;
}

function exitCodeForSignal(signal) {
  if (signal === 'SIGINT') return 130;
  if (signal === 'SIGTERM') return 143;
  return null;
}

function installHarnessSignalHandlers() {
  const handlers = new Map();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const handler = () => {
      process.exitCode = exitCodeForSignal(signal);
      if (interruptState.signal) {
        forceKillActiveChildren();
        return;
      }
      interruptState.signal = signal;
      interruptState.handling = Promise.allSettled([
        ...[...activeRunSignalSealers].map((seal) => seal(signal)),
        ...[...activeChildren].map((entry) => terminateChildTree(entry)),
      ]);
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  return () => {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  };
}

export function filterWorktreeConfig(source) {
  const lines = String(source ?? '').split(/\r?\n/u);
  const output = [];
  let include = false;
  for (const line of lines) {
    const topLevel = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s|$)/u);
    if (topLevel) include = WORKTREE_CONFIG_ALLOWLIST.has(topLevel[1]);
    if (include) output.push(line);
  }
  const value = output.join('\n').replace(/\n*$/u, '\n');
  if (!/^modelRoles:/mu.test(value) || !/^task:/mu.test(value)) {
    throw new Error('Worktree config must contain allowlisted modelRoles and task sections.');
  }
  return value;
}

export function buildIsolatedEnvironment({ baseEnv = process.env, stateRoot, agentDir, sessionDir }) {
  const env = { ...baseEnv };
  for (const key of ISOLATION_ENV_KEYS) delete env[key];
  env.HOME = stateRoot;
  env.PI_CODING_AGENT_DIR = agentDir;
  env.PI_CODING_AGENT_SESSION_DIR = sessionDir;
  return env;
}

export async function backupSqliteDatabase(sourcePath, destinationPath) {
  const sourceInfo = await stat(sourcePath);
  if (!sourceInfo.isFile()) throw new Error('The active OMP agent database is not a regular file.');
  await mkdir(path.dirname(destinationPath), { recursive: true, mode: 0o700 });
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    await sqliteBackup(source, destinationPath);
  } finally {
    source.close();
  }
  await chmod(destinationPath, 0o600);
}

function parseModelRoleProviders(config) {
  const providers = new Set();
  let inModelRoles = false;
  for (const line of String(config ?? '').split(/\r?\n/u)) {
    const topLevel = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:\s|$)/u);
    if (topLevel) {
      inModelRoles = topLevel[1] === 'modelRoles';
      continue;
    }
    if (!inModelRoles) continue;
    const selector = line.match(/^\s+[^:#]+:\s*["']?([^\s"'#]+)["']?/u)?.[1];
    const slash = selector?.indexOf('/');
    if (slash > 0) providers.add(selector.slice(0, slash));
  }
  return providers;
}

function normalizeCredentialExpiry(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function assertOauthSnapshotFresh(databasePath, providers, minimumValidityMs) {
  if (!providers?.size) return;
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const hasCredentials = database.prepare(
      "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'auth_credentials'",
    ).get();
    if (!hasCredentials) return;
    const credentials = database.prepare([
      'SELECT provider, data',
      'FROM auth_credentials',
      "WHERE credential_type = 'oauth' AND disabled_cause IS NULL",
    ].join(' ')).all();
    for (const credential of credentials) {
      if (!providers.has(credential.provider)) continue;
      let data;
      try {
        data = JSON.parse(credential.data);
      } catch {
        throw new Error(`Cannot safely isolate OAuth for ${credential.provider}: credential expiry is unreadable.`);
      }
      const expiry = normalizeCredentialExpiry(
        data.expires ?? data.expiresAt ?? data.expiry ?? data.expiryDate,
      );
      if (expiry == null) {
        throw new Error(`Cannot safely isolate OAuth for ${credential.provider}: credential expiry is unknown.`);
      }
      if (expiry <= Date.now() + minimumValidityMs) {
        throw new Error(
          `Cannot safely isolate OAuth for ${credential.provider}: access may expire during the run and rotate the host refresh token.`,
        );
      }
    }
  } finally {
    database.close();
  }
}

async function pathIsDirectory(value) {
  try {
    return (await stat(value)).isDirectory();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function findProjectAnchor(cwd) {
  const start = path.resolve(cwd);
  const hostHome = path.resolve(os.homedir());
  for (const marker of ['.omp', '.git']) {
    let current = start;
    while (current !== hostHome) {
      if (await pathIsDirectory(path.join(current, marker))) return current;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
  return null;
}

function pluginNameFromRegistryId(pluginId) {
  const separator = String(pluginId).lastIndexOf('@');
  return separator > 0 ? pluginId.slice(0, separator) : String(pluginId);
}

async function readJsonForPreflight(filePath, relativePath, conflicts) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    conflicts.push(`${relativePath}: unreadable or invalid JSON`);
    return null;
  }
}

function configDeclaresExtensions(source) {
  const lines = String(source ?? '').split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^extensions:\s*(.*)$/u);
    if (!match) continue;
    const inline = match[1].trim();
    if (inline && inline !== '[]' && inline !== '{}') return true;
    for (let next = index + 1; next < lines.length; next += 1) {
      if (/^[A-Za-z][A-Za-z0-9_-]*:/u.test(lines[next])) break;
      if (lines[next].trim() && !lines[next].trim().startsWith('#')) return true;
    }
  }
  return false;
}

export async function findProjectPluginConflicts(cwd, pluginNames) {
  const projectRoot = await findProjectAnchor(cwd);
  if (!projectRoot) return [];
  const names = pluginNames instanceof Set ? pluginNames : new Set(pluginNames ?? []);
  const conflicts = [];

  const registryRelative = path.join('.omp', 'plugins', 'installed_plugins.json');
  const registry = await readJsonForPreflight(
    path.join(projectRoot, registryRelative),
    registryRelative,
    conflicts,
  );
  for (const [pluginId, entries] of Object.entries(registry?.plugins ?? {})) {
    const pluginName = pluginNameFromRegistryId(pluginId);
    if (names.has(pluginName)
      && Array.isArray(entries)
      && entries.some((entry) => entry?.enabled !== false)) {
      conflicts.push(`${registryRelative}: ${pluginName}`);
    }
  }

  const packageRelative = path.join('.omp', 'plugins', 'package.json');
  const pluginPackage = await readJsonForPreflight(
    path.join(projectRoot, packageRelative),
    packageRelative,
    conflicts,
  );
  for (const pluginName of Object.keys(pluginPackage?.dependencies ?? {})) {
    if (names.has(pluginName)) conflicts.push(`${packageRelative}: ${pluginName}`);
  }

  const lockRelative = path.join('.omp', 'plugins', 'omp-plugins.lock.json');
  const lock = await readJsonForPreflight(
    path.join(projectRoot, lockRelative),
    lockRelative,
    conflicts,
  );
  for (const [pluginName, state] of Object.entries(lock?.plugins ?? {})) {
    if (names.has(pluginName) && state?.enabled !== false) {
      conflicts.push(`${lockRelative}: ${pluginName}`);
    }
  }

  for (const segments of PROJECT_EXTENSION_DIRS) {
    const extensionDir = path.join(projectRoot, ...segments);
    let entries;
    try {
      entries = await readdir(extensionDir);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      conflicts.push(`${path.join(...segments)}: cannot prove extension isolation`);
      continue;
    }
    if (entries.length > 0) {
      conflicts.push(`${path.join(...segments)}: opaque project extension source`);
    }
  }

  for (const segments of [['.omp', 'config.yml'], ['.omp', 'config.yaml'], ['.pi', 'config.yml'], ['.pi', 'config.yaml']]) {
    const configPath = path.join(projectRoot, ...segments);
    try {
      if (configDeclaresExtensions(await readFile(configPath, 'utf8'))) {
        conflicts.push(`${path.join(...segments)}: extensions setting`);
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') conflicts.push(`${path.join(...segments)}: cannot prove extension isolation`);
    }
  }

  return [...new Set(conflicts)].sort();
}

export async function assertNoProjectPluginConflicts(cwd, pluginNames) {
  const conflicts = await findProjectPluginConflicts(cwd, pluginNames);
  if (conflicts.length > 0) {
    throw new Error(
      `Worktree E2E project-local plugin sources could duplicate worktree plugins: ${conflicts.join('; ')}`,
    );
  }
}

async function sourceExists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function seedFixtureSkills(sourceRoot, agentDir) {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9-]*$/u.test(entry.name)) {
      throw new Error(`Invalid E2E fixture Skill directory: ${entry.name}`);
    }
    const source = path.join(sourceRoot, entry.name, 'SKILL.md');
    const targetDir = path.join(agentDir, 'skills', entry.name);
    await mkdir(targetDir, { recursive: true, mode: 0o700 });
    await copyFile(source, path.join(targetDir, 'SKILL.md'));
    await chmod(path.join(targetDir, 'SKILL.md'), 0o600);
  }
}

export async function prepareWorktreeIsolation(options = {}) {
  const assetsDir = path.resolve(options.assetsDir ?? WORKTREE_ASSETS_DIR);
  const baseEnv = options.baseEnv ?? process.env;
  const hostHome = path.resolve(baseEnv.HOME || os.homedir());
  const hostAgentDir = path.resolve(options.hostAgentDir
    ?? baseEnv.PI_CODING_AGENT_DIR
    ?? path.join(hostHome, '.omp', 'agent'));
  const stateParent = path.resolve(options.stateParent ?? os.tmpdir());
  await mkdir(stateParent, { recursive: true, mode: 0o700 });
  const stateRoot = await mkdtemp(path.join(stateParent, 'omp-e2e-worktree-state-'));
  const agentDir = path.join(stateRoot, 'agent');
  const sessionDir = path.join(stateRoot, 'sessions');
  const cleanup = async () => rm(stateRoot, { recursive: true, force: true });

  try {
    await chmod(stateRoot, 0o700);
    await Promise.all([
      mkdir(agentDir, { recursive: true, mode: 0o700 }),
      mkdir(sessionDir, { recursive: true, mode: 0o700 }),
    ]);
    const assetCopies = [
      ['AGENTS.md', 'AGENTS.md'],
      ['WATCHDOG.yml', 'WATCHDOG.yml'],
      ['WORKFLOW_CATALOG.md', 'OMP_ENHANCER_WORKFLOW_CATALOG.md'],
      ['models.yml', 'models.yml'],
    ];
    await Promise.all(assetCopies.map(async ([source, destination]) => {
      const target = path.join(agentDir, destination);
      await copyFile(path.join(assetsDir, source), target);
      await chmod(target, 0o600);
    }));
    const config = filterWorktreeConfig(await readFile(path.join(assetsDir, 'config.yml'), 'utf8'));
    await writeFile(path.join(agentDir, 'config.yml'), config, { mode: 0o600 });
    await seedFixtureSkills(
      path.resolve(options.fixtureSkillsDir ?? WORKTREE_FIXTURE_SKILLS_DIR),
      agentDir,
    );

    const activeDatabase = path.join(hostAgentDir, 'agent.db');
    if (options.dryRun !== true && await sourceExists(activeDatabase)) {
      const relevantOauthProviders = options.relevantOauthProviders instanceof Set
        ? options.relevantOauthProviders
        : new Set(options.relevantOauthProviders ?? parseModelRoleProviders(config));
      assertOauthSnapshotFresh(
        activeDatabase,
        relevantOauthProviders,
        options.minimumOauthValidityMs ?? OAUTH_REFRESH_MARGIN_MS,
      );
      await backupSqliteDatabase(activeDatabase, path.join(agentDir, 'agent.db'));
    }

    return {
      isolated: true,
      stateRoot,
      agentDir,
      sessionDir,
      env: buildIsolatedEnvironment({ baseEnv, stateRoot, agentDir, sessionDir }),
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export function createMonotonicDuration(now = () => performance.now()) {
  const startedAt = now();
  return () => now() - startedAt;
}

function requirePositiveSafeInteger(value, name) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive safe integer.`);
  }
  return value;
}

export function resolveTimeoutPolicy(timeoutSeconds, useOmpDeadline = true) {
  const normalizedTimeoutSeconds = requirePositiveSafeInteger(timeoutSeconds, 'timeoutSeconds');
  if (typeof useOmpDeadline !== 'boolean') {
    throw new TypeError('useOmpDeadline must be a boolean.');
  }
  return {
    ompDeadlineSeconds: useOmpDeadline ? normalizedTimeoutSeconds : null,
    runnerHardTimeoutMs: (normalizedTimeoutSeconds + 30) * 1000,
  };
}

/**
 * Incrementally captures only events consumed by workflow-events.mjs.
 *
 * The pending line, retained output, line count, and drop samples are all
 * bounded. A line that exceeds maxLineCharacters is discarded as a unit, so
 * the capture never creates malformed truncated JSON or grows an unbounded
 * string while waiting for its newline.
 */
export function createBoundedNdjsonCapture(options = {}) {
  const limits = normalizeNdjsonCaptureLimits(options);
  const capturedLines = [];
  const dropSamples = [];
  let pendingLine = '';
  let discardingOversizedLine = false;
  let oversizedLineCharacters = 0;
  let inputCharacters = 0;
  let inputLineCount = 0;
  let capturedCharacters = 0;
  let capturedLineCount = 0;
  let filteredLineCount = 0;
  let invalidLineCount = 0;
  let oversizedLineCount = 0;
  let capacityDroppedLineCount = 0;
  let droppedCharacters = 0;
  let unterminatedInputLineCount = 0;
  let finished = false;

  const recordDrop = (reason, lineCharacters, preview = '') => {
    droppedCharacters += lineCharacters;
    if (dropSamples.length < limits.maxDropSamples) {
      dropSamples.push({
        line: inputLineCount,
        reason,
        characters: lineCharacters,
        preview: String(preview).slice(0, 160),
      });
    }
  };

  const retainLine = (line) => {
    const outputCharacters = line.length + 1;
    if (capturedLineCount >= limits.maxCapturedLines
      || capturedCharacters + outputCharacters > limits.maxCapturedCharacters) {
      capacityDroppedLineCount += 1;
      recordDrop('capture-capacity', line.length, line);
      return;
    }
    capturedLines.push(line);
    capturedLineCount += 1;
    capturedCharacters += outputCharacters;
  };

  const finishLine = (hasTerminatingNewline) => {
    inputLineCount += 1;
    if (!hasTerminatingNewline) unterminatedInputLineCount += 1;
    if (discardingOversizedLine) {
      oversizedLineCount += 1;
      recordDrop('line-too-large', oversizedLineCharacters);
      pendingLine = '';
      discardingOversizedLine = false;
      oversizedLineCharacters = 0;
      return;
    }

    const line = pendingLine.endsWith('\r') ? pendingLine.slice(0, -1) : pendingLine;
    pendingLine = '';
    if (!line.trim()) return;

    let event;
    try {
      event = JSON.parse(line);
    } catch {
      invalidLineCount += 1;
      retainLine(line);
      return;
    }
    if (!isWorkflowSummaryEvent(event)) {
      filteredLineCount += 1;
      return;
    }
    if (typeof options.onEvent === 'function') options.onEvent(event);
    retainLine(line);
  };

  const appendLinePart = (part) => {
    if (discardingOversizedLine) {
      oversizedLineCharacters += part.length;
      return;
    }
    if (pendingLine.length + part.length <= limits.maxLineCharacters) {
      pendingLine += part;
      return;
    }
    discardingOversizedLine = true;
    oversizedLineCharacters = pendingLine.length + part.length;
    pendingLine = '';
  };

  return {
    write(chunk) {
      if (finished) throw new Error('Cannot write to a finished NDJSON capture.');
      const text = String(chunk ?? '');
      inputCharacters += text.length;
      let offset = 0;
      while (offset < text.length) {
        const newline = text.indexOf('\n', offset);
        if (newline === -1) {
          appendLinePart(text.slice(offset));
          break;
        }
        appendLinePart(text.slice(offset, newline));
        finishLine(true);
        offset = newline + 1;
      }
    },
    finish() {
      if (!finished) {
        finished = true;
        if (pendingLine || discardingOversizedLine) finishLine(false);
      }
      const stdout = capturedLines.length ? `${capturedLines.join('\n')}\n` : '';
      return {
        stdout,
        capture: {
          version: 1,
          ...limits,
          inputCharacters,
          inputLineCount,
          capturedCharacters,
          capturedLineCount,
          filteredLineCount,
          invalidLineCount,
          oversizedLineCount,
          capacityDroppedLineCount,
          droppedLineCount: oversizedLineCount + capacityDroppedLineCount,
          droppedCharacters,
          unterminatedInputLineCount,
          captureTruncated: oversizedLineCount > 0 || capacityDroppedLineCount > 0,
          dropSamples,
        },
      };
    },
  };
}

function normalizeNdjsonCaptureLimits(options) {
  return Object.fromEntries(Object.entries(DEFAULT_NDJSON_CAPTURE_LIMITS).map(([key, fallback]) => {
    const value = options[key] ?? fallback;
    return [key, requirePositiveSafeInteger(value, key)];
  }));
}

function isWorkflowSummaryEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return false;
  if (WORKFLOW_EVENT_TYPES.has(event.type)) return true;
  if (!event.type && (event.role === 'custom' || event.customType)) return true;
  return Boolean(event.route || event.details?.route);
}

export async function runInstalledMatrix(options = {}) {
  const matrixPath = path.resolve(options.matrixPath ?? DEFAULT_MATRIX);
  const matrix = JSON.parse(await readFile(matrixPath, 'utf8'));
  const selected = new Set(options.scenarioIds ?? []);
  const scenarios = matrix.scenarios.filter(({ id }) => !selected.size || selected.has(id));
  if (!scenarios.length) throw new Error('No E2E scenarios matched the requested selection.');
  const scenarioRuns = scenarios.map((scenario) => ({
    scenario,
    repetitions: requirePositiveSafeInteger(
      options.repeat ?? scenario.repeat ?? matrix.defaults?.repeat ?? 1,
      'repeat',
    ),
  }));

  const runId = options.runId ?? new Date().toISOString().replace(/[:.]/g, '-');
  const outputRoot = path.resolve(options.outputRoot ?? path.join(REPO_ROOT, '.omp', 'e2e-results', runId));
  const dryRun = options.dryRun === true;
  const worktreePlugins = options.worktreePlugins === true;
  const worktreePluginDirs = worktreePlugins ? resolvePluginDirs(pluginWorkspacePaths) : [];
  const plannedRuns = scenarioRuns.reduce((total, { repetitions }) => total + repetitions, 0);
  const runStatePath = path.join(outputRoot, RUN_STATE_FILE);
  const runState = {
    version: 1,
    runId,
    status: 'running',
    complete: false,
    mode: dryRun ? 'dry-run' : 'live',
    matrix: path.relative(REPO_ROOT, matrixPath),
    plannedRuns,
    completedRuns: 0,
    current: null,
    startedAt: new Date().toISOString(),
  };
  await reserveOutputRoot(outputRoot, runState);
  let stateWriteQueue = Promise.resolve();
  const updateRunState = (patch) => {
    const write = stateWriteQueue.then(async () => {
      Object.assign(runState, patch, { updatedAt: new Date().toISOString() });
      await writeJsonAtomic(runStatePath, runState);
    });
    stateWriteQueue = write.catch(() => undefined);
    return write;
  };
  const results = [];
  const sealForSignal = (signal) => updateRunState({
    status: 'failed',
    complete: false,
    receivedSignal: signal,
    completedRuns: results.length,
    current: runState.current,
    finishedAt: new Date().toISOString(),
  });
  activeRunSignalSealers.add(sealForSignal);
  let isolation = null;
  let cleanupIsolation = async () => undefined;

  try {
    throwIfInterrupted();
    if (worktreePlugins) {
      const pluginNames = await readPluginPackageNames(worktreePluginDirs);
      for (const { scenario } of scenarioRuns) {
        if (!scenario.fixture) {
          await assertNoProjectPluginConflicts(path.resolve(scenario.cwd), pluginNames);
        }
      }
      const minimumOauthValidityMs = scenarioRuns.reduce((total, { scenario, repetitions }) => {
        const timeoutSeconds = scenario.timeoutSeconds ?? matrix.defaults?.timeoutSeconds ?? 120;
        return total + repetitions * (timeoutSeconds + 30) * 1000;
      }, OAUTH_REFRESH_MARGIN_MS);
      isolation = await prepareWorktreeIsolation({
        ...(options.worktreeIsolationOptions ?? {}),
        dryRun,
        minimumOauthValidityMs,
      });
      cleanupIsolation = isolation.cleanup;
    }

    const runtimeEnv = isolation?.env ?? process.env;
    const beforeConfig = readAutolearnConfig(runtimeEnv);
    const beforeAdvisorConfig = readAdvisorConfig(runtimeEnv);
    for (const { scenario, repetitions } of scenarioRuns) {
      for (let repetition = 1; repetition <= repetitions; repetition += 1) {
        throwIfInterrupted();
        await updateRunState({ current: { scenarioId: scenario.id, repetition } });
        const result = await runScenario({
          matrix,
          scenario,
          repetition,
          outputRoot,
          dryRun,
          useOmpDeadlineOverride: options.useOmpDeadline,
          pluginDirsOverride: worktreePlugins ? pluginWorkspacePaths : undefined,
          modelOverride: options.model,
          thinkingOverride: options.thinking,
          env: runtimeEnv,
          isolated: worktreePlugins,
          isolatedSessionRoot: isolation?.sessionDir,
        });
        throwIfInterrupted();
        results.push(result);
        await updateRunState({
          completedRuns: results.length,
          current: null,
          lastResult: {
            scenarioId: result.scenarioId,
            repetition: result.repetition,
            pass: result.evaluation?.pass ?? null,
          },
        });
      }
    }
    throwIfInterrupted();
    if (!results.length) throw new Error('E2E matrix produced no scenario executions.');
    const afterConfig = readAutolearnConfig(runtimeEnv);
    const afterAdvisorConfig = readAdvisorConfig(runtimeEnv);
    const configStable = JSON.stringify(beforeConfig) === JSON.stringify(afterConfig);
    const advisorConfigStable = JSON.stringify(beforeAdvisorConfig) === JSON.stringify(afterAdvisorConfig);
    const environmentStable = configStable && advisorConfigStable;
    const runtimeProfiles = [...new Map(results.map(({ model, thinking }) => [
      `${model}\u0000${thinking}`,
      { model, thinking },
    ])).values()];
    const report = {
      version: 2,
      runId,
      status: 'complete',
      complete: true,
      plannedRuns,
      completedRuns: results.length,
      mode: dryRun ? 'dry-run' : 'live',
      executed: !dryRun,
      isolated: worktreePlugins,
      matrix: path.relative(REPO_ROOT, matrixPath),
      startedFrom: process.cwd(),
      runtimeProfiles,
      autolearn: { before: beforeConfig, after: afterConfig, stable: configStable },
      advisor: { before: beforeAdvisorConfig, after: afterAdvisorConfig, stable: advisorConfigStable },
      previewValid: dryRun ? environmentStable : null,
      outcomes: dryRun ? null : summarizeRunOutcomes(results),
      passed: dryRun
        ? null
        : environmentStable
          && results.length === plannedRuns
          && results.every(({ evaluation }) => evaluation.pass),
      results,
    };
    await writeJsonAtomic(path.join(outputRoot, 'report.json'), report);
    await updateRunState({
      status: 'complete',
      complete: true,
      completedRuns: results.length,
      current: null,
      report: 'report.json',
      finishedAt: new Date().toISOString(),
    });
    return { report, outputRoot };
  } catch (error) {
    const receivedSignal = error?.receivedSignal ?? interruptState.signal ?? undefined;
    await updateRunState({
      status: 'failed',
      complete: false,
      receivedSignal,
      completedRuns: results.length,
      current: runState.current,
      error: String(error?.message ?? error).slice(0, 1_000),
      finishedAt: new Date().toISOString(),
    }).catch(() => undefined);
    throw error;
  } finally {
    activeRunSignalSealers.delete(sealForSignal);
    await cleanupIsolation();
  }
}

async function runScenario({
  matrix,
  scenario,
  repetition,
  outputRoot,
  dryRun,
  useOmpDeadlineOverride,
  pluginDirsOverride,
  modelOverride,
  thinkingOverride,
  env,
  isolated,
  isolatedSessionRoot,
}) {
  const timeoutSeconds = scenario.timeoutSeconds ?? matrix.defaults?.timeoutSeconds ?? 120;
  const useOmpDeadline = useOmpDeadlineOverride
    ?? scenario.useOmpDeadline
    ?? matrix.defaults?.useOmpDeadline
    ?? true;
  const timeoutPolicy = resolveTimeoutPolicy(timeoutSeconds, useOmpDeadline);
  const prepared = await prepareScenario(scenario);
  try {
    const runName = `${scenario.id}-${String(repetition).padStart(2, '0')}`;
    const runDir = path.join(outputRoot, runName);
    const sessionDir = isolatedSessionRoot
      ? path.join(isolatedSessionRoot, runName)
      : path.join(runDir, 'session');
    await Promise.all([
      mkdir(runDir, { recursive: true }),
      mkdir(sessionDir, { recursive: true }),
    ]);
    const advisorEnabled = scenario.advisor ?? matrix.defaults?.advisor ?? false;
    const taskEager = resolveTaskEager(scenario.taskEager ?? matrix.defaults?.taskEager);
    const configOverlayPath = path.join(runDir, 'config-overlay.yml');
    await writeFile(configOverlayPath, [
      'advisor:',
      `  enabled: ${advisorEnabled ? 'true' : 'false'}`,
      ...(taskEager ? ['task:', `  eager: ${taskEager}`] : []),
      '',
    ].join('\n'));
    const expectations = { ...(matrix.defaults?.expectations ?? {}), ...(scenario.expectations ?? {}) };
    const executionMode = scenario.executionMode ?? matrix.defaults?.executionMode ?? 'print';
    const noExtensions = resolveNoExtensions(scenario.noExtensions ?? matrix.defaults?.noExtensions ?? false);
    const pluginDirs = resolvePluginDirs(pluginDirsOverride ?? scenario.pluginDirs ?? matrix.defaults?.pluginDirs ?? []);
    if (noExtensions && pluginDirs.length > 0) {
      throw new Error('noExtensions cannot be combined with pluginDirs because OMP disables explicitly supplied worktree extensions too.');
    }
    const pluginExtensionEntries = await resolvePluginExtensionEntries(pluginDirs);
    const model = modelOverride
      ?? scenario.model
      ?? matrix.defaults?.model
      ?? 'opencode-go/deepseek-v4-flash';
    const thinking = thinkingOverride ?? scenario.thinking ?? matrix.defaults?.thinking ?? 'minimal';
    const args = buildOmpArgs({
      matrix,
      scenario,
      prepared,
      sessionDir,
      ompDeadlineSeconds: timeoutPolicy.ompDeadlineSeconds,
      executionMode,
      configOverlayPath,
      advisorEnabled,
      noExtensions,
      pluginDirs,
      pluginExtensionEntries,
      modelOverride: model,
      thinkingOverride: thinking,
    });
    const runtimeConfig = buildRuntimeConfig({
      advisorEnabled,
      taskEager,
      noExtensions,
      pluginDirs,
      pluginExtensionEntries,
      isolated,
    });

    if (dryRun) {
      throwIfInterrupted();
      const result = {
        scenarioId: scenario.id,
        repetition,
        model,
        thinking,
        cwd: prepared.displayCwd ?? prepared.cwd,
        command: renderReportedCommand(args, prepared.prompt, isolated, false),
        runtimeConfig,
        timeoutPolicy,
        dryRun: true,
        evaluation: { pass: null, skipped: true, failures: [] },
      };
      await writeJsonAtomic(path.join(runDir, 'summary.json'), result);
      return result;
    }

    const beforeFiles = prepared.verifyRoot ? await snapshotTree(prepared.verifyRoot) : null;
    const execution = executionMode === 'rpc'
      ? await spawnRpcCaptured('omp', args, {
        cwd: prepared.cwd,
        prompt: prepared.prompt,
        timeoutMs: timeoutPolicy.runnerHardTimeoutMs,
        waitForAutolearn: scenario.waitForAutolearn === true,
        env,
      })
      : await spawnCaptured('omp', args, {
        cwd: prepared.cwd,
        timeoutMs: timeoutPolicy.runnerHardTimeoutMs,
        env,
      });
    throwIfInterrupted();
    await writeFile(path.join(runDir, 'events.ndjson'), execution.stdout);
    await writeFile(path.join(runDir, 'stderr.log'), execution.stderr);
    await writeFile(path.join(runDir, 'event-capture.json'), `${JSON.stringify(execution.capture, null, 2)}\n`);

    const parsed = parseNdjson(execution.stdout);
    const sessionCustomEvents = await readSessionCustomEvents(sessionDir);
    const summary = summarizeWorkflowEvents(mergeCustomEventFallbacks(parsed.events, sessionCustomEvents), {
      scenarioId: scenario.id,
      exitCode: execution.exitCode,
      signal: execution.signal,
      durationMs: execution.durationMs,
      timedOut: execution.timedOut,
      invalidJsonLines: parsed.invalidLines,
      eventCapture: execution.capture,
      projectRoot: prepared.cwd,
    });
    const fileEvaluation = beforeFiles && prepared.verifyRoot
      ? await verifyFixture(prepared.verifyRoot, beforeFiles, scenario.fixtureExpectations ?? {})
      : { pass: true, failures: [], changedFiles: [] };
    const mutationAttribution = attributeFixtureMutations(summary, fileEvaluation);
    const evaluation = evaluateWorkflowSummary(summary, expectations);
    evaluation.failures.push(...fileEvaluation.failures);
    evaluation.pass = evaluation.failures.length === 0;
    const outcome = classifyWorkflowRun(summary, evaluation);

    const result = {
      scenarioId: scenario.id,
      category: scenario.category,
      repetition,
      model,
      thinking,
      cwd: prepared.displayCwd ?? prepared.cwd,
      command: renderReportedCommand(args, prepared.prompt, isolated),
      runtimeConfig,
      timeoutPolicy,
      eventCapture: execution.capture,
      summary,
      fileEvaluation,
      mutationAttribution,
      evaluation,
      outcome,
    };
    await writeJsonAtomic(path.join(runDir, 'summary.json'), result);
    return result;
  } finally {
    await prepared.cleanup();
  }
}

function summarizeRunOutcomes(results) {
  const counts = {
    behavior: { pass: 0, fail: 0, not_evaluable: 0 },
    infrastructure: { clean: 0, degraded: 0, failed: 0 },
  };
  for (const { outcome } of results) {
    if (Object.hasOwn(counts.behavior, outcome?.behavior)) counts.behavior[outcome.behavior] += 1;
    if (Object.hasOwn(counts.infrastructure, outcome?.infrastructure)) {
      counts.infrastructure[outcome.infrastructure] += 1;
    }
  }
  return counts;
}

function buildOmpArgs({
  matrix,
  scenario,
  prepared,
  sessionDir,
  ompDeadlineSeconds,
  executionMode,
  configOverlayPath,
  advisorEnabled,
  noExtensions,
  pluginDirs,
  pluginExtensionEntries,
  modelOverride,
  thinkingOverride,
}) {
  const model = modelOverride
    ?? scenario.model
    ?? matrix.defaults?.model
    ?? 'opencode-go/deepseek-v4-flash';
  const thinking = thinkingOverride ?? scenario.thinking ?? matrix.defaults?.thinking ?? 'minimal';
  const tools = scenario.tools ?? matrix.defaults?.tools ?? ['read', 'grep', 'glob'];
  const args = [
    `--mode=${executionMode === 'rpc' ? 'rpc' : 'json'}`,
    `--model=${model}`,
    `--thinking=${thinking}`,
    `--approval-mode=${scenario.approvalMode ?? matrix.defaults?.approvalMode ?? 'yolo'}`,
    `--config=${configOverlayPath}`,
    `--session-dir=${sessionDir}`,
    '--no-title',
    ...(ompDeadlineSeconds == null ? [] : [`--max-time=${ompDeadlineSeconds}`]),
    `--tools=${tools.join(',')}`,
  ];
  if (advisorEnabled) args.push('--advisor');
  if (noExtensions) args.push('--no-extensions');
  for (const extensionEntry of pluginExtensionEntries) args.push('-e', extensionEntry);
  for (const pluginDir of pluginDirs) args.push(`--plugin-dir=${pluginDir}`);
  if (executionMode !== 'rpc') args.push('-p', prepared.prompt);
  return args;
}

function resolveNoExtensions(value) {
  if (typeof value !== 'boolean') throw new TypeError('noExtensions must be a boolean.');
  return value;
}

function resolveTaskEager(value) {
  if (value == null || value === '') return null;
  const normalized = String(value).trim().toLowerCase();
  if (!['default', 'preferred', 'always'].includes(normalized)) {
    throw new Error('taskEager must be one of: default, preferred, always.');
  }
  return normalized;
}

function resolvePluginDirs(value) {
  if (!Array.isArray(value)) throw new TypeError('pluginDirs must be an array.');
  return value.map((pluginDir, index) => {
    if (typeof pluginDir !== 'string' || !pluginDir.trim()) {
      throw new TypeError(`pluginDirs[${index}] must be a non-empty string.`);
    }
    return path.resolve(REPO_ROOT, pluginDir);
  });
}

async function resolvePluginExtensionEntries(pluginDirs) {
  const entries = [];
  for (const pluginDir of pluginDirs) {
    const manifestPath = path.join(pluginDir, 'package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const declared = manifest?.omp?.extensions ?? [];
    if (!Array.isArray(declared)) throw new TypeError(`${manifestPath}: omp.extensions must be an array.`);
    for (const [index, value] of declared.entries()) {
      if (typeof value !== 'string' || !value.trim()) {
        throw new TypeError(`${manifestPath}: omp.extensions[${index}] must be a non-empty string.`);
      }
      const resolved = path.resolve(pluginDir, value);
      const relative = path.relative(pluginDir, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        throw new Error(`${manifestPath}: extension entry escapes the plugin directory: ${value}`);
      }
      const info = await stat(resolved);
      if (!info.isFile()) throw new Error(`${manifestPath}: extension entry is not a file: ${value}`);
      entries.push(resolved);
    }
  }
  return [...new Set(entries)];
}

async function readPluginPackageNames(pluginDirs) {
  const names = new Set();
  for (const pluginDir of pluginDirs) {
    const manifestPath = path.join(pluginDir, 'package.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
      throw new Error(`${manifestPath}: package name must be a non-empty string.`);
    }
    names.add(manifest.name);
  }
  return names;
}

function renderReportedCommand(args, prompt, isolated, redactPrompt = true) {
  return ['omp', ...args.map((argument) => {
    if (redactPrompt && argument === prompt) return '<prompt>';
    if (isolated && argument.startsWith('--session-dir=')) return '--session-dir=<isolated>';
    return argument;
  })];
}

function buildRuntimeConfig({ advisorEnabled, taskEager, noExtensions, pluginDirs, pluginExtensionEntries, isolated }) {
  const runtimeConfig = { advisorEnabled };
  if (isolated) runtimeConfig.isolated = true;
  if (taskEager) runtimeConfig.taskEager = taskEager;
  if (noExtensions || pluginDirs.length) {
    runtimeConfig.noExtensions = noExtensions;
    runtimeConfig.pluginDirs = pluginDirs;
    runtimeConfig.pluginExtensionEntries = pluginExtensionEntries;
  }
  return runtimeConfig;
}

export async function prepareScenario(scenario) {
  if (!scenario.fixture) {
    const cwd = path.resolve(scenario.cwd);
    const info = await stat(cwd);
    if (!info.isDirectory()) throw new Error(`Scenario cwd is not a directory: ${cwd}`);
    return { cwd, displayCwd: cwd, prompt: scenario.prompt, cleanup: async () => undefined };
  }

  const cwd = await mkdtemp(path.join(os.tmpdir(), `omp-e2e-${scenario.id}-`));
  if (scenario.fixture === 'autolearn-five-files') {
    for (const [index, token] of ['amber-17', 'birch-29', 'cobalt-41', 'delta-53', 'ember-67'].entries()) {
      await writeFile(path.join(cwd, `${index + 1}.txt`), `${token}\n`);
    }
  } else if (scenario.fixture === 'semantic-edit-en') {
    await writeFile(
      path.join(cwd, 'paper.tex'),
      'Our analysis typically finds a significantly lower lower failure rate, but it may only reduce errors from 37.5\\% to 12.5\\% and cannot eliminate them \\cite{smith2025}.\n',
    );
  } else if (scenario.fixture === 'semantic-edit-en-introduction') {
    await mkdir(path.join(cwd, 'tex'), { recursive: true });
    await writeFile(
      path.join(cwd, 'tex', 'introduction.tex'),
      [
        '\\section{Introduction}',
        '\\label{sec:introduction}',
        '',
        'Our evaluation typically finds a significantly lower lower failure rate, but \\sys may only reduce errors from 37.5\\% to 12.5\\% and cannot eliminate them~\\cite{smith2025}.',
        '',
      ].join('\n'),
    );
  } else if (scenario.fixture === 'semantic-edit-zh') {
    await writeFile(
      path.join(cwd, 'paper.md'),
      '该方法通常可以显著降低错误率——但可能仅将错误率从 37.5% 降至 12.5%，并不能完全消除错误，相关结论见 [@smith2025]。\n',
    );
  } else if (scenario.fixture === 'substantive-writing-en-readonly') {
    await writeFile(
      path.join(cwd, 'section.tex'),
      [
        '\\section{Results}',
        '\\label{sec:results}',
        '',
        'Across five seeded runs, \\method{} typically reduced the median failure rate from 37.5\\% to 12.5\\%, but it did not eliminate failures and the confidence intervals overlapped on the smallest workload~\\cite{smith2025}. This improvement was larger on the two cached workloads, although those workloads also contained fewer long requests.',
        '',
        'The baseline used the same 8-hour budget, whereas \\method{} stopped early when validation loss failed to improve for three rounds. Because the saved compute was not reassigned, the comparison supports a lower observed failure rate under this stopping rule but does not establish that the method would retain the advantage under an equal-compute retraining protocol.',
        '',
      ].join('\n'),
    );
  } else if (scenario.fixture === 'skill-discovery-readonly') {
    await Promise.all([
      writeFile(
        path.join(cwd, 'abstract.tex'),
        'Our evaluation typically finds a significantly lower lower failure rate, but the system may only reduce errors from 37.5\\% to 12.5\\% and cannot eliminate them~\\cite{smith2025}.\n',
      ),
      writeFile(path.join(cwd, 'claims.md'), '- The release has five plugins.\n- Every package passed validation.\n- Rollback is documented.\n'),
      writeFile(path.join(cwd, 'evidence.md'), 'The catalog lists five plugins. Package validation has not run. No rollback document is present.\n'),
      writeFile(path.join(cwd, 'docker-compose.yml'), 'services:\n  api:\n    image: example/api:latest\n    ports: ["0.0.0.0:8080:8080"]\n    environment:\n      API_TOKEN: plaintext-secret\n'),
      writeFile(path.join(cwd, 'sales.csv'), 'month,revenue,cost\nJan,100,70\nFeb,140,80\n'),
      writeFile(path.join(cwd, 'README.md'), '# Skill discovery fixture\n\nA deterministic read-only test workspace.\n'),
    ]);
  } else if (scenario.fixture === 'workflow-two-code-files') {
    await Promise.all([
      writeFile(
        path.join(cwd, 'alpha.js'),
        [
          'export function acceptsForwardedHost(headers = {}) {',
          "  const raw = headers['x-forwarded-host'];",
          "  if (typeof raw !== 'string') return false;",
          '  const normalized = raw.trim().toLowerCase();',
          "  if (normalized === '') return true;",
          "  return normalized === 'api.example.com';",
          '}',
          '',
        ].join('\n'),
      ),
      writeFile(
        path.join(cwd, 'beta.js'),
        [
          'export function selectCacheMode(query = {}) {',
          "  const mode = String(query.mode ?? '').trim().toLowerCase();",
          "  if (mode === 'bypass') return 'bypass';",
          "  if (mode === 'refresh') return 'refresh';",
          "  return query.mode ? 'bypass' : 'default';",
          '}',
          '',
        ].join('\n'),
      ),
    ]);
  } else if (scenario.fixture === 'self-iteration-tdd') {
    await Promise.all([
      mkdir(path.join(cwd, 'src'), { recursive: true }),
      mkdir(path.join(cwd, 'test'), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        path.join(cwd, 'AGENTS.md'),
        [
          '# Isolated OMP Enhancer self-development fixture',
          '',
          'Modify only src/normalize.js, test/normalize.test.js, src/enabled.js, and test/enabled.test.js.',
          'This temporary project is the target of an OMP Enhancer self-development E2E harness.',
          'Native task children own each complete vertical test-and-production slice and return full delivery evidence.',
          'The parent event stream must receive host-observed child delivery text with each focused RED and GREEN result.',
          'After both deliveries, Main runs one broader verification whose bash command itself is exactly `npm test`; do not prepend cd or append redirection.',
          'Do not use the network, publish, release, or change package.json or this file.',
          '',
        ].join('\n'),
      ),
      writeFile(
        path.join(cwd, 'package.json'),
        `${JSON.stringify({
          name: 'omp-self-iteration-fixture',
          private: true,
          type: 'module',
          scripts: { test: 'node --test' },
        }, null, 2)}\n`,
      ),
      writeFile(
        path.join(cwd, 'src', 'normalize.js'),
        [
          "export function normalizePluginName(value = '') {",
          '  return String(value).trim();',
          '}',
          '',
        ].join('\n'),
      ),
      writeFile(
        path.join(cwd, 'test', 'normalize.test.js'),
        [
          "import test from 'node:test';",
          "import assert from 'node:assert/strict';",
          '',
          "import { normalizePluginName } from '../src/normalize.js';",
          '',
          "test('trims plugin names', () => {",
          "  assert.equal(normalizePluginName(' core '), 'core');",
          '});',
          '',
        ].join('\n'),
      ),
      writeFile(
        path.join(cwd, 'src', 'enabled.js'),
        [
          "export function isPluginEnabled(value = false) {",
          '  return Boolean(value);',
          '}',
          '',
        ].join('\n'),
      ),
      writeFile(
        path.join(cwd, 'test', 'enabled.test.js'),
        [
          "import test from 'node:test';",
          "import assert from 'node:assert/strict';",
          '',
          "import { isPluginEnabled } from '../src/enabled.js';",
          '',
          "test('accepts an enabled boolean', () => {",
          '  assert.equal(isPluginEnabled(true), true);',
          '});',
          '',
        ].join('\n'),
      ),
    ]);
  } else {
    throw new Error(`Unknown fixture: ${scenario.fixture}`);
  }

  return {
    cwd,
    displayCwd: `<temporary:${scenario.fixture}>`,
    prompt: scenario.prompt,
    verifyRoot: cwd,
    cleanup: async () => rm(cwd, { recursive: true, force: true }),
  };
}

export async function verifyFixture(root, beforeFiles, expectations) {
  const baselineRootIdentity = beforeFiles?.[SNAPSHOT_ROOT_IDENTITY] ?? null;
  let currentRootIdentity;
  try {
    currentRootIdentity = await fixtureRootIdentity(root);
  } catch (error) {
    return {
      pass: false,
      failures: [`fixture root is unavailable: ${error.message}`],
      changedFiles: [],
    };
  }
  if (currentRootIdentity.isSymbolicLink) {
    return {
      pass: false,
      failures: ['fixture root is a symbolic link'],
      changedFiles: [],
    };
  }
  if (baselineRootIdentity && !sameFixtureRootIdentity(baselineRootIdentity, currentRootIdentity)) {
    return {
      pass: false,
      failures: ['fixture root identity changed after the baseline snapshot'],
      changedFiles: [],
    };
  }

  let afterFiles;
  try {
    afterFiles = await snapshotTree(root);
  } catch (error) {
    return {
      pass: false,
      failures: [`fixture root could not be snapshotted safely: ${error.message}`],
      changedFiles: [],
    };
  }
  const changedFiles = [...new Set([...beforeFiles.keys(), ...afterFiles.keys()])]
    .filter((file) => beforeFiles.get(file) !== afterFiles.get(file))
    .sort();
  const failures = [];
  const rootRealPath = currentRootIdentity.realPath;
  for (const [file, value] of afterFiles) {
    if (String(value).startsWith('symlink:')) failures.push(`fixture contains symbolic link: ${file}`);
  }
  const allowed = new Set(expectations.allowedChangedFiles ?? []);
  for (const file of changedFiles) {
    if (!allowed.has(file)) failures.push(`unexpected fixture file change: ${file}`);
  }
  for (const file of expectations.requiredChangedFiles ?? []) {
    if (!changedFiles.includes(file)) failures.push(`expected fixture file was not changed: ${file}`);
  }
  for (const [file, expected] of Object.entries(expectations.exactContents ?? {})) {
    let actual = '';
    try {
      actual = await readContainedFixtureFile(root, rootRealPath, file);
    } catch (error) {
      failures.push(`exact fixture output is unreadable or outside the fixture root: ${file} (${error.message})`);
      continue;
    }
    if (actual !== expected) failures.push(`fixture output did not exactly match the expected content: ${file}`);
  }
  for (const [file, patterns] of Object.entries(expectations.requiredPatterns ?? {})) {
    let text = '';
    try {
      text = await readContainedFixtureFile(root, rootRealPath, file);
    } catch (error) {
      failures.push(`required fixture output is unreadable or outside the fixture root: ${file} (${error.message})`);
      continue;
    }
    for (const pattern of patterns) {
      if (!new RegExp(pattern, 'iu').test(text)) failures.push(`semantic sentinel was lost in ${file}: ${pattern}`);
    }
  }
  for (const [file, patterns] of Object.entries(expectations.forbiddenPatterns ?? {})) {
    let text = '';
    try {
      text = await readContainedFixtureFile(root, rootRealPath, file);
    } catch (error) {
      failures.push(`forbidden-pattern fixture output is unreadable or outside the fixture root: ${file} (${error.message})`);
      continue;
    }
    for (const pattern of patterns) {
      if (new RegExp(pattern, 'iu').test(text)) failures.push(`forbidden fixture pattern remained in ${file}: ${pattern}`);
    }
  }
  return { pass: failures.length === 0, failures, changedFiles };
}

export function attributeFixtureMutations(summary = {}, fileEvaluation = {}) {
  const reportedChanges = Array.isArray(fileEvaluation?.changedFiles) ? fileEvaluation.changedFiles : [];
  const changedFiles = [...new Set(reportedChanges
    .map(normalizeFixtureReportPath)
    .filter(Boolean))]
    .sort();
  const mutationCallsByTarget = new Map();
  const parentMutationCalls = Array.isArray(summary?.tddTrace?.mutationCalls)
    ? summary.tddTrace.mutationCalls
    : [];
  for (const call of parentMutationCalls) {
    const target = normalizeFixtureReportPath(call?.target);
    if (!target) continue;
    const calls = mutationCallsByTarget.get(target) ?? [];
    calls.push(call);
    mutationCallsByTarget.set(target, calls);
  }

  const files = changedFiles.map((file) => {
    const matchingCalls = mutationCallsByTarget.get(file) ?? [];
    const callIds = [...new Set(matchingCalls
      .map(({ id }) => typeof id === 'string' ? id.trim() : '')
      .filter(Boolean))]
      .sort();
    return {
      path: file,
      attribution: matchingCalls.length ? 'parent-observed' : 'unattributed-shared-workspace',
      parentMutationCallIds: callIds,
    };
  });
  const parentObservedFiles = files
    .filter(({ attribution }) => attribution === 'parent-observed')
    .map(({ path: file }) => file);
  const unattributedFiles = files
    .filter(({ attribution }) => attribution === 'unattributed-shared-workspace')
    .map(({ path: file }) => file);
  const classification = files.length === 0
    ? 'none'
    : parentObservedFiles.length === files.length
      ? 'parent-observed'
      : unattributedFiles.length === files.length
        ? 'unattributed-shared-workspace'
        : 'mixed';

  return { classification, parentObservedFiles, unattributedFiles, files };
}

function normalizeFixtureReportPath(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replaceAll('\\', '/').replace(/^\.\/+/u, '');
  return normalized || null;
}

export async function snapshotTree(root) {
  const initialRootIdentity = await fixtureRootIdentity(root);
  if (initialRootIdentity.isSymbolicLink) throw new Error('fixture root is a symbolic link');
  const values = new Map();
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const relative = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        values.set(relative, createHash('sha256').update(await readFile(full)).digest('hex'));
      } else if (entry.isSymbolicLink()) {
        values.set(relative, `symlink:${await readlink(full)}`);
      }
    }
  }
  await walk(root);
  const finalRootIdentity = await fixtureRootIdentity(root);
  if (!sameFixtureRootIdentity(initialRootIdentity, finalRootIdentity)) {
    throw new Error('fixture root identity changed during snapshot');
  }
  Object.defineProperty(values, SNAPSHOT_ROOT_IDENTITY, {
    configurable: false,
    enumerable: false,
    value: Object.freeze(initialRootIdentity),
    writable: false,
  });
  return values;
}

async function fixtureRootIdentity(root) {
  const info = await lstat(root);
  return {
    device: info.dev,
    inode: info.ino,
    isSymbolicLink: info.isSymbolicLink(),
    realPath: await realpath(root),
  };
}

function sameFixtureRootIdentity(left, right) {
  return left?.device === right?.device
    && left?.inode === right?.inode
    && left?.realPath === right?.realPath
    && left?.isSymbolicLink === right?.isSymbolicLink;
}

async function readContainedFixtureFile(root, rootRealPath, file) {
  const candidate = path.resolve(root, file);
  if (!isContainedPath(root, candidate)) throw new Error('configured path escapes the fixture root');
  const candidateRealPath = await realpath(candidate);
  if (!isContainedPath(rootRealPath, candidateRealPath)) throw new Error('real path escapes the fixture root');
  return readFile(candidateRealPath, 'utf8');
}

function isContainedPath(root, candidate) {
  const relative = path.relative(root, candidate);
  return Boolean(relative)
    && relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative);
}

export async function readSessionCustomEvents(root) {
  const relevantTypes = new Set([
    'advisor',
    'autolearn-nudge',
    'skill-prompt',
    'omp-continuation',
    'omp-enhancer-continuation',
    'session-stop-continuation',
  ]);
  const events = [];
  async function walk(current) {
    let entries = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      const parsed = parseNdjson(await readFile(full, 'utf8'));
      for (const value of parsed.events) {
        const candidate = value?.message?.role === 'custom'
          ? value.message
          : value?.type === 'custom' || value?.customType ? value : null;
        if (relevantTypes.has(candidate?.customType)) {
          events.push({ type: 'session_custom', entry: candidate });
        }
      }
    }
  }
  await walk(root);
  return events;
}

export function spawnCaptured(command, args, {
  cwd,
  timeoutMs,
  env = process.env,
  terminationGraceMs = CHILD_TERMINATION_GRACE_MS,
}) {
  return new Promise((resolvePromise) => {
    const elapsed = createMonotonicDuration();
    const activeChild = spawnTracked(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const { child } = activeChild;
    const stdoutCapture = createBoundedNdjsonCapture();
    let stderr = '';
    let timedOut = false;
    let spawnError = null;
    let settled = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdoutCapture.write(chunk); });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      timedOut = true;
      void terminateChildTree(activeChild, terminationGraceMs).catch(() => undefined);
    }, timeoutMs);
    child.on('error', (error) => {
      spawnError = error;
    });
    child.on('close', async (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (activeChild.terminationPromise) await activeChild.terminationPromise;
      } catch (error) {
        stderr += `${error.stack ?? error.message}\n`;
      }
      releaseTrackedChild(activeChild);
      resolvePromise({
        ...stdoutCapture.finish(),
        stderr: `${stderr}${spawnError ? `${spawnError.stack ?? spawnError.message}\n` : ''}${timedOut ? '\nRunner hard timeout reached.\n' : ''}`,
        exitCode: spawnError ? 1 : code,
        signal: spawnError ? null : signal,
        timedOut,
        durationMs: elapsed(),
      });
    });
  });
}

function spawnRpcCaptured(command, args, {
  cwd,
  prompt,
  timeoutMs,
  waitForAutolearn = false,
  env = process.env,
  terminationGraceMs = CHILD_TERMINATION_GRACE_MS,
}) {
  return new Promise((resolvePromise) => {
    const elapsed = createMonotonicDuration();
    const activeChild = spawnTracked(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    const { child } = activeChild;
    let stderr = '';
    let timedOut = false;
    let spawnError = null;
    let settled = false;
    let captureSeen = false;
    let agentEnds = 0;
    let inputClosed = false;

    const closeInput = () => {
      if (inputClosed || child.stdin.destroyed) return;
      inputClosed = true;
      child.stdin.end();
    };
    const inspectEvent = (event) => {
      if (event?.type === 'message_end'
        && event?.message?.role === 'custom'
        && event.message.customType === 'autolearn-nudge') {
        captureSeen = true;
      }
      if (event?.type === 'agent_end') {
        agentEnds += 1;
        const complete = waitForAutolearn
          ? captureSeen && agentEnds >= 2
          : agentEnds >= 1;
        if (complete) setTimeout(closeInput, 100).unref();
      }
    };
    const stdoutCapture = createBoundedNdjsonCapture({ onEvent: inspectEvent });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdoutCapture.write(chunk);
    });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdin.on('error', (error) => {
      if (error?.code !== 'EPIPE') stderr += `${error.stack ?? error.message}\n`;
    });
    child.stdin.write(`${JSON.stringify({ id: 'e2e-prompt', type: 'prompt', message: prompt })}\n`);

    const timer = setTimeout(() => {
      timedOut = true;
      closeInput();
      void terminateChildTree(activeChild, terminationGraceMs).catch(() => undefined);
    }, timeoutMs);
    child.on('error', (error) => {
      spawnError = error;
    });
    child.on('close', async (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (activeChild.terminationPromise) await activeChild.terminationPromise;
      } catch (error) {
        stderr += `${error.stack ?? error.message}\n`;
      }
      releaseTrackedChild(activeChild);
      resolvePromise({
        ...stdoutCapture.finish(),
        stderr: `${stderr}${spawnError ? `${spawnError.stack ?? spawnError.message}\n` : ''}${timedOut ? '\nRunner hard timeout reached.\n' : ''}`,
        exitCode: spawnError ? 1 : code,
        signal: spawnError ? null : signal,
        timedOut,
        durationMs: elapsed(),
      });
    });
  });
}

function readAutolearnConfig(env) {
  return readOmpConfig([
    'autolearn.enabled',
    'autolearn.autoContinue',
    'autolearn.minToolCalls',
  ], env);
}

function readAdvisorConfig(env) {
  return readOmpConfig([
    'advisor.enabled',
    'advisor.syncBacklog',
    'advisor.immuneTurns',
  ], env);
}

function readOmpConfig(keys, env = process.env) {
  return Object.fromEntries(keys.map((key) => {
    const result = spawnSync('omp', ['config', 'get', key], { encoding: 'utf8', env });
    return [key, result.status === 0 ? result.stdout.trim() : `ERROR:${result.stderr.trim()}`];
  }));
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  const options = { scenarioIds: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--dry-run') options.dryRun = true;
    else if (value === '--no-omp-deadline') options.useOmpDeadline = false;
    else if (value === '--worktree-plugins') options.worktreePlugins = true;
    else if (value === '--model') {
      const model = argv[++index];
      if (model == null || model.startsWith('--')) throw new Error('--model requires a value.');
      options.model = model;
    }
    else if (value === '--thinking') {
      const thinking = argv[++index];
      if (thinking == null || thinking.startsWith('--')) throw new Error('--thinking requires a value.');
      options.thinking = thinking;
    }
    else if (value === '--scenario') options.scenarioIds.push(argv[++index]);
    else if (value === '--repeat') {
      const repeatValue = argv[++index];
      if (repeatValue == null || repeatValue.startsWith('--')) {
        throw new Error('--repeat requires a value.');
      }
      options.repeat = requirePositiveSafeInteger(Number(repeatValue), 'repeat');
    }
    else if (value === '--matrix') options.matrixPath = argv[++index];
    else if (value === '--output') options.outputRoot = argv[++index];
    else if (value === '--run-id') options.runId = argv[++index];
    else if (value === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

async function main() {
  const options = parseCliArgs();
  if (options.help) {
    process.stdout.write('Usage: run-installed-deepseek-workflow.mjs [--scenario ID] [--repeat N] [--model PROVIDER/MODEL] [--thinking LEVEL] [--worktree-plugins] [--dry-run] [--no-omp-deadline] [--output DIR]\n');
    return;
  }
  const { report, outputRoot } = await runInstalledMatrix(options);
  process.stdout.write(`${JSON.stringify({ mode: report.mode, executed: report.executed, isolated: report.isolated, previewValid: report.previewValid, passed: report.passed, outputRoot, results: report.results.map(({ scenarioId, repetition, evaluation }) => ({ scenarioId, repetition, ...evaluation })) }, null, 2)}\n`);
  const succeeded = report.mode === 'dry-run' ? report.previewValid : report.passed;
  if (!succeeded) process.exitCode = 1;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  const removeSignalHandlers = installHarnessSignalHandlers();
  main().catch(async (error) => {
    if (interruptState.handling) await interruptState.handling;
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = exitCodeForSignal(error?.receivedSignal ?? interruptState.signal) ?? 1;
  }).finally(removeSignalHandlers);
}
