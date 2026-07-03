import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { resolvePluginRoot } from './plugin-root.js';

export async function listAssets(root = process.cwd()) {
  const pluginRoot = await resolvePluginRoot(root);
  const [agents, skills, preHooks, postHooks, templates] = await Promise.all([
    safeList(path.join(pluginRoot, 'agents')),
    safeListSkills(path.join(pluginRoot, 'skills')),
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

async function safeListSkills(dir) {
  const skills = [];
  try {
    await walk(dir, '');
  } catch {
    return [];
  }
  return skills.sort();

  async function walk(currentDir, prefix) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name === 'SKILL.md') && prefix) {
      skills.push(prefix);
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      await walk(path.join(currentDir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name);
    }
  }
}
