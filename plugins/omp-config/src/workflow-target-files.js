import { lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export async function resolveWorkflowContextTarget(target) {
  return resolveExistingDirectory(normalizeTargetDir(target));
}

export async function readWorkflowContextTargetFiles(targetDir) {
  const agentsPath = path.join(targetDir, 'AGENTS.md');
  const catalogPath = path.join(targetDir, 'OMP_ENHANCER_WORKFLOW_CATALOG.md');
  const watchdogPath = await resolveWatchdogPath(targetDir);
  const [existingAgents, existingCatalog, existingWatchdog] = await Promise.all([
    readSafeOptionalFile(agentsPath),
    readSafeOptionalFile(catalogPath),
    readSafeOptionalFile(watchdogPath),
  ]);

  return {
    agentsPath,
    catalogPath,
    watchdogPath,
    existingAgents,
    existingCatalog,
    existingWatchdog,
  };
}

export async function applyWorkflowContextChanges(targetDir, files) {
  await mkdir(targetDir, { recursive: true });
  for (const file of files) {
    if (!file.changed) continue;
    await assertNotSymlink(file.path);
    await atomicWrite(file.path, file.content);
  }
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
