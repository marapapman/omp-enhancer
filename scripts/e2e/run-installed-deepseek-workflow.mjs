#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateWorkflowSummary,
  mergeCustomEventFallbacks,
  parseNdjson,
  summarizeWorkflowEvents,
} from './workflow-events.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const DEFAULT_MATRIX = path.join(SCRIPT_DIR, 'fixtures', 'deepseek-installed-matrix.json');
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
    const value = Number(options[key] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new TypeError(`${key} must be a positive safe integer.`);
    }
    return [key, value];
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

  const runId = options.runId ?? new Date().toISOString().replace(/[:.]/g, '-');
  const outputRoot = path.resolve(options.outputRoot ?? path.join(REPO_ROOT, '.omp', 'e2e-results', runId));
  await mkdir(outputRoot, { recursive: true });

  const beforeConfig = readAutolearnConfig();
  const beforeAdvisorConfig = readAdvisorConfig();
  const results = [];
  for (const scenario of scenarios) {
    const repetitions = options.repeat ?? scenario.repeat ?? matrix.defaults?.repeat ?? 1;
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      results.push(await runScenario({
        matrix,
        scenario,
        repetition,
        outputRoot,
        dryRun: options.dryRun === true,
      }));
    }
  }
  const afterConfig = readAutolearnConfig();
  const afterAdvisorConfig = readAdvisorConfig();
  const configStable = JSON.stringify(beforeConfig) === JSON.stringify(afterConfig);
  const advisorConfigStable = JSON.stringify(beforeAdvisorConfig) === JSON.stringify(afterAdvisorConfig);
  const dryRun = options.dryRun === true;
  const environmentStable = configStable && advisorConfigStable;
  const report = {
    version: 2,
    runId,
    mode: dryRun ? 'dry-run' : 'live',
    executed: !dryRun,
    matrix: path.relative(REPO_ROOT, matrixPath),
    startedFrom: process.cwd(),
    autolearn: { before: beforeConfig, after: afterConfig, stable: configStable },
    advisor: { before: beforeAdvisorConfig, after: afterAdvisorConfig, stable: advisorConfigStable },
    previewValid: dryRun ? environmentStable : null,
    passed: dryRun
      ? null
      : environmentStable && results.every(({ evaluation }) => evaluation.pass),
    results,
  };
  await writeFile(path.join(outputRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return { report, outputRoot };
}

async function runScenario({ matrix, scenario, repetition, outputRoot, dryRun }) {
  const prepared = await prepareScenario(scenario);
  try {
  const runName = `${scenario.id}-${String(repetition).padStart(2, '0')}`;
  const runDir = path.join(outputRoot, runName);
  const sessionDir = path.join(runDir, 'session');
  await mkdir(sessionDir, { recursive: true });
  const advisorEnabled = scenario.advisor ?? matrix.defaults?.advisor ?? false;
  const configOverlayPath = path.join(runDir, 'config-overlay.yml');
  await writeFile(configOverlayPath, `advisor:\n  enabled: ${advisorEnabled ? 'true' : 'false'}\n`);
  const expectations = { ...(matrix.defaults?.expectations ?? {}), ...(scenario.expectations ?? {}) };
  const timeoutSeconds = scenario.timeoutSeconds ?? matrix.defaults?.timeoutSeconds ?? 120;
  const executionMode = scenario.executionMode ?? matrix.defaults?.executionMode ?? 'print';
  const noExtensions = resolveNoExtensions(scenario.noExtensions ?? matrix.defaults?.noExtensions ?? false);
  const pluginDirs = resolvePluginDirs(scenario.pluginDirs ?? matrix.defaults?.pluginDirs ?? []);
  const args = buildOmpArgs({
    matrix,
    scenario,
    prepared,
    sessionDir,
    timeoutSeconds,
    executionMode,
    configOverlayPath,
    advisorEnabled,
    noExtensions,
    pluginDirs,
  });
  const runtimeConfig = buildRuntimeConfig({ advisorEnabled, noExtensions, pluginDirs });

  if (dryRun) {
    const result = {
      scenarioId: scenario.id,
      repetition,
      cwd: prepared.cwd,
      command: ['omp', ...args],
      runtimeConfig,
      dryRun: true,
      evaluation: { pass: null, skipped: true, failures: [] },
    };
    await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(result, null, 2)}\n`);
    return result;
  }

  const beforeFiles = prepared.verifyRoot ? await snapshotTree(prepared.verifyRoot) : null;
  const execution = executionMode === 'rpc'
    ? await spawnRpcCaptured('omp', args, {
      cwd: prepared.cwd,
      prompt: prepared.prompt,
      timeoutMs: (timeoutSeconds + 30) * 1000,
      waitForAutolearn: scenario.waitForAutolearn === true,
    })
    : await spawnCaptured('omp', args, {
      cwd: prepared.cwd,
      timeoutMs: (timeoutSeconds + 30) * 1000,
    });
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
  });
  const fileEvaluation = beforeFiles && prepared.verifyRoot
    ? await verifyFixture(prepared.verifyRoot, beforeFiles, scenario.fixtureExpectations ?? {})
    : { pass: true, failures: [], changedFiles: [] };
  const evaluation = evaluateWorkflowSummary(summary, expectations);
  evaluation.failures.push(...fileEvaluation.failures);
  evaluation.pass = evaluation.failures.length === 0;

  const result = {
    scenarioId: scenario.id,
    category: scenario.category,
    repetition,
    cwd: prepared.displayCwd ?? prepared.cwd,
    command: ['omp', ...args.map((arg) => arg === prepared.prompt ? '<prompt>' : arg)],
    runtimeConfig,
    eventCapture: execution.capture,
    summary,
    fileEvaluation,
    evaluation,
  };
  await writeFile(path.join(runDir, 'summary.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
  } finally {
    await prepared.cleanup();
  }
}

function buildOmpArgs({
  matrix,
  scenario,
  prepared,
  sessionDir,
  timeoutSeconds,
  executionMode,
  configOverlayPath,
  advisorEnabled,
  noExtensions,
  pluginDirs,
}) {
  const model = scenario.model ?? matrix.defaults?.model ?? 'opencode-go/deepseek-v4-flash';
  const thinking = scenario.thinking ?? matrix.defaults?.thinking ?? 'minimal';
  const tools = scenario.tools ?? matrix.defaults?.tools ?? ['read', 'grep', 'glob'];
  const args = [
    `--mode=${executionMode === 'rpc' ? 'rpc' : 'json'}`,
    `--model=${model}`,
    `--thinking=${thinking}`,
    `--approval-mode=${scenario.approvalMode ?? matrix.defaults?.approvalMode ?? 'yolo'}`,
    `--config=${configOverlayPath}`,
    `--session-dir=${sessionDir}`,
    '--no-title',
    `--max-time=${timeoutSeconds}`,
    `--tools=${tools.join(',')}`,
  ];
  if (advisorEnabled) args.push('--advisor');
  if (noExtensions) args.push('--no-extensions');
  for (const pluginDir of pluginDirs) args.push(`--plugin-dir=${pluginDir}`);
  if (executionMode !== 'rpc') args.push('-p', prepared.prompt);
  return args;
}

function resolveNoExtensions(value) {
  if (typeof value !== 'boolean') throw new TypeError('noExtensions must be a boolean.');
  return value;
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

function buildRuntimeConfig({ advisorEnabled, noExtensions, pluginDirs }) {
  const runtimeConfig = { advisorEnabled };
  if (noExtensions || pluginDirs.length) {
    runtimeConfig.noExtensions = noExtensions;
    runtimeConfig.pluginDirs = pluginDirs;
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
  } else {
    throw new Error(`Unknown fixture: ${scenario.fixture}`);
  }

  return {
    cwd,
    displayCwd: `<temporary:${scenario.fixture}>`,
    prompt: scenario.prompt,
    verifyRoot: scenario.fixture.startsWith('semantic-edit-') ? cwd : null,
    cleanup: async () => rm(cwd, { recursive: true, force: true }),
  };
}

export async function verifyFixture(root, beforeFiles, expectations) {
  const afterFiles = await snapshotTree(root);
  const changedFiles = [...new Set([...beforeFiles.keys(), ...afterFiles.keys()])]
    .filter((file) => beforeFiles.get(file) !== afterFiles.get(file))
    .sort();
  const failures = [];
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
      actual = await readFile(path.join(root, file), 'utf8');
    } catch {
      failures.push(`exact fixture output is unreadable: ${file}`);
      continue;
    }
    if (actual !== expected) failures.push(`fixture output did not exactly match the expected content: ${file}`);
  }
  for (const [file, patterns] of Object.entries(expectations.requiredPatterns ?? {})) {
    let text = '';
    try {
      text = await readFile(path.join(root, file), 'utf8');
    } catch {
      failures.push(`required fixture output is unreadable: ${file}`);
      continue;
    }
    for (const pattern of patterns) {
      if (!new RegExp(pattern, 'iu').test(text)) failures.push(`semantic sentinel was lost in ${file}: ${pattern}`);
    }
  }
  for (const [file, patterns] of Object.entries(expectations.forbiddenPatterns ?? {})) {
    let text = '';
    try {
      text = await readFile(path.join(root, file), 'utf8');
    } catch {
      failures.push(`forbidden-pattern fixture output is unreadable: ${file}`);
      continue;
    }
    for (const pattern of patterns) {
      if (new RegExp(pattern, 'iu').test(text)) failures.push(`forbidden fixture pattern remained in ${file}: ${pattern}`);
    }
  }
  return { pass: failures.length === 0, failures, changedFiles };
}

export async function snapshotTree(root) {
  const values = new Map();
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const relative = path.relative(root, full).split(path.sep).join('/');
        values.set(relative, createHash('sha256').update(await readFile(full)).digest('hex'));
      }
    }
  }
  await walk(root);
  return values;
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

function spawnCaptured(command, args, { cwd, timeoutMs }) {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdoutCapture = createBoundedNdjsonCapture();
    let stderr = '';
    let timedOut = false;
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdoutCapture.write(chunk); });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolvePromise({ ...stdoutCapture.finish(), stderr: `${stderr}${error.stack ?? error.message}\n`, exitCode: 1, signal: null, timedOut, durationMs: Date.now() - startedAt });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({
        ...stdoutCapture.finish(),
        stderr: `${stderr}${timedOut ? '\nRunner hard timeout reached.\n' : ''}`,
        exitCode: code,
        signal,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

function spawnRpcCaptured(command, args, {
  cwd,
  prompt,
  timeoutMs,
  waitForAutolearn = false,
}) {
  return new Promise((resolvePromise) => {
    const startedAt = Date.now();
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    let timedOut = false;
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
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000).unref();
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolvePromise({ ...stdoutCapture.finish(), stderr: `${stderr}${error.stack ?? error.message}\n`, exitCode: 1, signal: null, timedOut, durationMs: Date.now() - startedAt });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({
        ...stdoutCapture.finish(),
        stderr: `${stderr}${timedOut ? '\nRunner hard timeout reached.\n' : ''}`,
        exitCode: code,
        signal,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

function readAutolearnConfig() {
  return readOmpConfig([
    'autolearn.enabled',
    'autolearn.autoContinue',
    'autolearn.minToolCalls',
  ]);
}

function readAdvisorConfig() {
  return readOmpConfig([
    'advisor.enabled',
    'advisor.syncBacklog',
    'advisor.immuneTurns',
  ]);
}

function readOmpConfig(keys) {
  return Object.fromEntries(keys.map((key) => {
    const result = spawnSync('omp', ['config', 'get', key], { encoding: 'utf8' });
    return [key, result.status === 0 ? result.stdout.trim() : `ERROR:${result.stderr.trim()}`];
  }));
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const options = { scenarioIds: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--dry-run') options.dryRun = true;
    else if (value === '--scenario') options.scenarioIds.push(argv[++index]);
    else if (value === '--repeat') options.repeat = Number(argv[++index]);
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
    process.stdout.write('Usage: run-installed-deepseek-workflow.mjs [--scenario ID] [--repeat N] [--dry-run] [--output DIR]\n');
    return;
  }
  const { report, outputRoot } = await runInstalledMatrix(options);
  process.stdout.write(`${JSON.stringify({ mode: report.mode, executed: report.executed, previewValid: report.previewValid, passed: report.passed, outputRoot, results: report.results.map(({ scenarioId, repetition, evaluation }) => ({ scenarioId, repetition, ...evaluation })) }, null, 2)}\n`);
  const succeeded = report.mode === 'dry-run' ? report.previewValid : report.passed;
  if (!succeeded) process.exitCode = 1;
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
