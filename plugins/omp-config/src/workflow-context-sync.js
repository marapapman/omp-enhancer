import { lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolvePluginRoot } from './plugin-root.js';

export const AGENTS_BLOCK_START = '<!-- OMP-ENHANCER-WORKFLOW-CONTEXT:START -->';
export const AGENTS_BLOCK_END = '<!-- OMP-ENHANCER-WORKFLOW-CONTEXT:END -->';
export const ADVISOR_BLOCK_START = '<!-- OMP-ENHANCER-ADVISOR-WORKFLOW-CONTEXT:START -->';
export const ADVISOR_BLOCK_END = '<!-- OMP-ENHANCER-ADVISOR-WORKFLOW-CONTEXT:END -->';
export const CATALOG_BLOCK_START = '<!-- OMP-ENHANCER-WORKFLOW-CATALOG:START -->';
export const CATALOG_BLOCK_END = '<!-- OMP-ENHANCER-WORKFLOW-CATALOG:END -->';

export async function syncWorkflowContext(input = {}) {
  const pluginRoot = await resolvePluginRoot(input.root);
  const requestedTarget = normalizeTargetDir(input.target);
  const targetDir = await resolveExistingDirectory(requestedTarget);
  const apply = input.apply === true;
  const assetsDir = path.join(pluginRoot, 'assets');
  const [catalog, agentsAsset, watchdogAsset] = await Promise.all([
    readFile(path.join(assetsDir, 'WORKFLOW_CATALOG.md'), 'utf8'),
    readFile(path.join(assetsDir, 'AGENTS.md'), 'utf8'),
    readFile(path.join(assetsDir, 'WATCHDOG.yml'), 'utf8'),
  ]);

  const agentsManagedBlock = extractManagedBlock(agentsAsset, AGENTS_BLOCK_START, AGENTS_BLOCK_END);
  const advisorManagedBlock = extractManagedBlock(watchdogAsset, ADVISOR_BLOCK_START, ADVISOR_BLOCK_END);
  const agentsPath = path.join(targetDir, 'AGENTS.md');
  const catalogPath = path.join(targetDir, 'OMP_ENHANCER_WORKFLOW_CATALOG.md');
  const watchdogPath = await resolveWatchdogPath(targetDir);
  const [existingAgents, existingCatalog, existingWatchdog] = await Promise.all([
    readSafeOptionalFile(agentsPath),
    readSafeOptionalFile(catalogPath),
    readSafeOptionalFile(watchdogPath),
  ]);

  const desiredAgents = mergeMarkdownManagedBlock(existingAgents, agentsManagedBlock);
  const desiredCatalog = mergeManagedCatalog(existingCatalog, catalog);
  const desiredWatchdog = existingWatchdog === null
    ? ensureTrailingNewline(watchdogAsset)
    : mergeWatchdogManagedBlock(existingWatchdog, advisorManagedBlock);
  const files = [
    buildChange(catalogPath, existingCatalog, desiredCatalog, 'managed-file'),
    buildChange(agentsPath, existingAgents, desiredAgents, 'managed-block'),
    buildChange(watchdogPath, existingWatchdog, desiredWatchdog, 'managed-block'),
  ];

  if (apply) {
    await mkdir(targetDir, { recursive: true });
    for (const file of files) {
      if (!file.changed) continue;
      await assertNotSymlink(file.path);
      await atomicWrite(file.path, file.content);
    }
  }

  return {
    ok: true,
    mode: apply ? 'apply' : 'dry-run',
    targetDir,
    changed: files.filter((file) => file.changed).length,
    files: files.map(({ content: _content, ...file }) => file),
  };
}

export function mergeManagedCatalog(existing, packagedCatalog) {
  assertCompleteMarkers(packagedCatalog, CATALOG_BLOCK_START, CATALOG_BLOCK_END, 'packaged workflow catalog');
  if (existing === null) return ensureTrailingNewline(packagedCatalog);
  assertCompleteMarkers(existing, CATALOG_BLOCK_START, CATALOG_BLOCK_END, 'existing workflow catalog');
  return ensureTrailingNewline(packagedCatalog);
}

export function mergeMarkdownManagedBlock(existing, managedBlock) {
  const managed = ensureTrailingNewline(managedBlock).trimEnd();
  if (existing === null || existing.trim() === '') return `${managed}\n`;
  const replaced = replaceExistingManagedBlock(existing, managed, AGENTS_BLOCK_START, AGENTS_BLOCK_END);
  if (replaced !== null) return ensureTrailingNewline(replaced);
  return `${existing.trimEnd()}\n\n${managed}\n`;
}

export function mergeWatchdogManagedBlock(existing, managedBlock) {
  const markerPattern = /^([ \t]*)<!-- OMP-ENHANCER-ADVISOR-WORKFLOW-CONTEXT:START -->/m;
  const existingMarker = existing.match(markerPattern);
  if (existingMarker) {
    const indented = indentBlock(managedBlock, existingMarker[1]);
    const replaced = replaceExistingManagedBlock(
      existing,
      indented,
      ADVISOR_BLOCK_START,
      ADVISOR_BLOCK_END,
      { lineBoundaries: true },
    );
    return ensureTrailingNewline(replaced);
  }
  if (existing.includes(ADVISOR_BLOCK_END)) {
    throw new Error('WATCHDOG.yml contains an incomplete OMP Enhancer advisor managed block.');
  }

  const lines = existing.split('\n');
  const headerIndex = lines.findIndex((line) => /^instructions:\s*\|[+-]?\s*(?:#.*)?$/.test(line));
  const unsupportedHeader = lines.some((line) => /^instructions\s*:/.test(line));
  if (headerIndex < 0 && unsupportedHeader) {
    throw new Error('WATCHDOG.yml has an unsupported instructions value; use a literal block scalar before syncing.');
  }
  if (headerIndex < 0) {
    const prefix = `instructions: |\n${indentBlock(managedBlock, '  ')}\n`;
    return existing.trim() ? `${prefix}\n${existing.trimStart()}` : prefix;
  }

  let scalarEnd = lines.length;
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') continue;
    if (!/^\s/.test(line)) {
      scalarEnd = index;
      break;
    }
  }
  const contentIndent = lines
    .slice(headerIndex + 1, scalarEnd)
    .find((line) => line.trim() !== '')
    ?.match(/^[ \t]*/)?.[0] ?? '  ';
  const before = lines.slice(0, scalarEnd);
  if (before.at(-1)?.trim() !== '') before.push('');
  before.push(...indentBlock(managedBlock, contentIndent).split('\n'));
  if (scalarEnd < lines.length && before.at(-1)?.trim() !== '') before.push('');
  return ensureTrailingNewline([...before, ...lines.slice(scalarEnd)].join('\n'));
}

function extractManagedBlock(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || text.indexOf(startMarker, start + startMarker.length) >= 0) {
    throw new Error(`Packaged asset has an invalid managed block: ${startMarker}`);
  }
  const lineStart = text.lastIndexOf('\n', start) + 1;
  const markerEnd = end + endMarker.length;
  const lineEnd = text.indexOf('\n', markerEnd);
  return dedentBlock(text.slice(lineStart, lineEnd < 0 ? markerEnd : lineEnd));
}

function assertCompleteMarkers(text, startMarker, endMarker, label) {
  const starts = String(text).split(startMarker).length - 1;
  const ends = String(text).split(endMarker).length - 1;
  const start = String(text).indexOf(startMarker);
  const end = String(text).indexOf(endMarker);
  if (starts !== 1 || ends !== 1 || end <= start) {
    throw new Error(`Refusing to replace ${label} without one complete OMP Enhancer managed marker pair.`);
  }
}

function replaceExistingManagedBlock(existing, managed, startMarker, endMarker, options = {}) {
  const startMatches = [...existing.matchAll(new RegExp(escapeRegExp(startMarker), 'g'))];
  const endMatches = [...existing.matchAll(new RegExp(escapeRegExp(endMarker), 'g'))];
  if (startMatches.length === 0 && endMatches.length === 0) return null;
  if (startMatches.length !== 1 || endMatches.length !== 1) {
    throw new Error(`Managed block markers are incomplete or duplicated: ${startMarker}`);
  }
  let start = startMatches[0].index;
  let end = endMatches[0].index + endMarker.length;
  if (end <= start) throw new Error(`Managed block markers are out of order: ${startMarker}`);
  if (options.lineBoundaries) {
    start = existing.lastIndexOf('\n', start) + 1;
    const nextLine = existing.indexOf('\n', end);
    end = nextLine < 0 ? end : nextLine;
  }
  return `${existing.slice(0, start)}${managed}${existing.slice(end)}`;
}

function dedentBlock(text) {
  const lines = text.split('\n');
  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0);
  const indent = Math.min(...indents);
  return lines.map((line) => line.slice(Math.min(indent, line.length))).join('\n').trimEnd();
}

function indentBlock(text, indent) {
  return text
    .trimEnd()
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n');
}

function buildChange(filePath, existing, content, managed) {
  const changed = existing !== content;
  return {
    path: filePath,
    action: !changed ? 'unchanged' : existing === null ? 'create' : 'update',
    managed,
    changed,
    content,
  };
}

function normalizeTargetDir(target) {
  const fallback = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.omp', 'agent');
  const value = typeof target === 'string' && target.trim() !== '' ? target.trim() : fallback;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.resolve(os.homedir(), value.slice(2));
  return path.resolve(value);
}

async function resolveExistingDirectory(target) {
  try {
    const stats = await lstat(target);
    if (!stats.isDirectory() && !stats.isSymbolicLink()) {
      throw new Error(`Workflow context target is not a directory: ${target}`);
    }
    return await realpath(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return target;
    throw error;
  }
}

async function resolveWatchdogPath(targetDir) {
  const yml = path.join(targetDir, 'WATCHDOG.yml');
  const yaml = path.join(targetDir, 'WATCHDOG.yaml');
  if (await fileExists(yml)) return yml;
  if (await fileExists(yaml)) return yaml;
  return yml;
}

async function readSafeOptionalFile(filePath) {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) throw new Error(`Refusing to replace a symlinked config file: ${filePath}`);
    if (!stats.isFile()) throw new Error(`Config target is not a regular file: ${filePath}`);
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function assertNotSymlink(filePath) {
  try {
    const stats = await lstat(filePath);
    if (stats.isSymbolicLink()) throw new Error(`Refusing to replace a symlinked config file: ${filePath}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function atomicWrite(filePath, content) {
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
  await rename(temporary, filePath);
}

async function fileExists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function ensureTrailingNewline(text) {
  return text.endsWith('\n') ? text : `${text}\n`;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
