import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

export async function resolvePluginRoot(root = process.cwd()) {
  if (await isOmpConfigPluginRoot(root)) return root;
  return path.join(root, 'plugins', 'omp-config');
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
