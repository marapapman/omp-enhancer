import { access } from 'node:fs/promises';
import path from 'node:path';

export async function resolvePluginRoot(root = process.cwd()) {
  if (await hasPackagedDirectories(root)) return root;
  return path.join(root, 'plugins', 'omp-config');
}

async function hasPackagedDirectories(root) {
  if (await pathExists(path.join(root, 'assets', 'config.yml'))) return true;
  return (await pathExists(path.join(root, 'agents'))) || (await pathExists(path.join(root, 'skills')));
}

async function pathExists(candidate) {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}
