import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bundledPluginRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export async function resolvePluginRoot(root = bundledPluginRoot) {
  if (await isOmpConfigPluginRoot(root)) return root;

  const workspacePluginRoot = path.join(root, 'plugins', 'omp-config');
  if (await isOmpConfigPluginRoot(workspacePluginRoot)) return workspacePluginRoot;

  return bundledPluginRoot;
}

async function isOmpConfigPluginRoot(root) {
  if (!(await pathExists(path.join(root, 'assets', 'config.yml')))) return false;
  return (await readPackageName(root)) === 'omp-config';
}

async function readPackageName(root) {
  try {
    const text = await readFile(path.join(root, 'package.json'), 'utf8');
    return JSON.parse(text).name;
  } catch {
    return undefined;
  }
}

async function pathExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}
