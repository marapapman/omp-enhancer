#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { LEGACY_GATE_SKILL_NAMES } from '../plugins/omp-enhancer-core/src/install-skills.js';

export function mergeIgnoredSkills(current = [], legacyNames = LEGACY_GATE_SKILL_NAMES) {
  return [...new Set([
    ...(Array.isArray(current) ? current : []),
    ...legacyNames,
  ].map((value) => String(value).trim()).filter(Boolean))];
}

export async function migrateLegacyGateSkills({ apply = false, ompCommand = 'omp' } = {}) {
  const beforeEnabled = configValue(ompCommand, 'autolearn.enabled');
  const beforeAutoContinue = configValue(ompCommand, 'autolearn.autoContinue');
  const currentValue = configValue(ompCommand, 'skills.ignoredSkills');
  const current = Array.isArray(currentValue) ? currentValue : [];
  const merged = mergeIgnoredSkills(current);
  const added = merged.filter((name) => !current.includes(name));
  const result = {
    apply,
    current,
    merged,
    added,
    autolearn: {
      before: { enabled: beforeEnabled, autoContinue: beforeAutoContinue },
    },
  };

  if (!apply || !added.length) {
    result.changed = false;
    result.autolearn.after = result.autolearn.before;
    return result;
  }

  const configRoot = runOmp(ompCommand, ['config', 'path']).trim();
  const configPath = await resolveConfigPath(configRoot);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${configPath}.before-legacy-gate-skill-migration-${timestamp}.bak`;
  await copyFile(configPath, backupPath);

  try {
    runOmp(ompCommand, ['config', 'set', 'skills.ignoredSkills', JSON.stringify(merged), '--json']);
    const afterIgnored = configValue(ompCommand, 'skills.ignoredSkills');
    const afterEnabled = configValue(ompCommand, 'autolearn.enabled');
    const afterAutoContinue = configValue(ompCommand, 'autolearn.autoContinue');
    if (JSON.stringify(afterIgnored) !== JSON.stringify(merged)) {
      throw new Error('OMP did not persist the exact ignored-skill list.');
    }
    if (afterEnabled !== beforeEnabled || afterAutoContinue !== beforeAutoContinue) {
      throw new Error('Autolearn settings changed during ignored-skill migration.');
    }
    result.changed = true;
    result.backupPath = backupPath;
    result.autolearn.after = { enabled: afterEnabled, autoContinue: afterAutoContinue };
    return result;
  } catch (error) {
    await copyFile(backupPath, configPath);
    throw error;
  }
}

function configValue(ompCommand, key) {
  const output = runOmp(ompCommand, ['config', 'get', key, '--json']);
  const parsed = JSON.parse(output);
  return parsed.value;
}

function runOmp(ompCommand, args) {
  const result = spawnSync(ompCommand, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`OMP command failed: ${ompCommand} ${args.join(' ')}\n${result.stderr.trim()}`);
  }
  return result.stdout;
}

async function resolveConfigPath(value) {
  const candidate = path.resolve(value);
  const info = await stat(candidate);
  return info.isDirectory() ? path.join(candidate, 'config.yml') : candidate;
}

async function main(argv = process.argv.slice(2)) {
  const unknown = argv.filter((arg) => arg !== '--apply');
  if (unknown.length) throw new Error(`Unknown argument(s): ${unknown.join(', ')}`);
  const result = await migrateLegacyGateSkills({ apply: argv.includes('--apply') });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
