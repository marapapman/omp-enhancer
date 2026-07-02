import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { findPathRisks } from './path-policy.js';
import { resolvePluginRoot } from './plugin-root.js';

export async function runConfigDoctor(root = process.cwd()) {
  const pluginRoot = await resolvePluginRoot(root);
  const configPath = path.join(pluginRoot, 'assets', 'config.yml');
  const text = await readFile(configPath, 'utf8');
  const findings = findPathRisks(text, 'assets/config.yml');
  return {
    ok: findings.length === 0,
    summary: findings.length === 0 ? 'No config risks found.' : `${findings.length} config risk(s) found.`,
    findings,
  };
}
