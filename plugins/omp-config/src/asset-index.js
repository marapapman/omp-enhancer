import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { resolvePluginRoot } from './plugin-root.js';

export async function listAssets(root = process.cwd()) {
  const pluginRoot = await resolvePluginRoot(root);
  const [agents, skills] = await Promise.all([
    safeList(path.join(pluginRoot, 'agents')),
    safeList(path.join(pluginRoot, 'skills')),
  ]);
  return { agents, skills };
}

async function safeList(dir) {
  try {
    return (await readdir(dir)).filter((name) => !name.startsWith('.')).sort();
  } catch {
    return [];
  }
}
