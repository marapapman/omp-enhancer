import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { resolvePluginRoot } from './plugin-root.js';

export async function listAssets(root = process.cwd()) {
  const pluginRoot = await resolvePluginRoot(root);
  const [agents, skills, preHooks, postHooks, templates] = await Promise.all([
    safeList(path.join(pluginRoot, 'agents')),
    safeList(path.join(pluginRoot, 'skills')),
    safeList(path.join(pluginRoot, 'hooks', 'pre')),
    safeList(path.join(pluginRoot, 'hooks', 'post')),
    safeList(path.join(pluginRoot, 'assets')),
  ]);
  return {
    agents,
    skills,
    hooks: {
      pre: preHooks,
      post: postHooks,
    },
    templates,
  };
}

async function safeList(dir) {
  try {
    return (await readdir(dir)).filter((name) => !name.startsWith('.')).sort();
  } catch {
    return [];
  }
}
