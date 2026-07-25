#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { installPluginDeps } from '../plugins/omp-enhancer-core/src/install-deps.js';

/**
 * Parse simple `--flag` / `--flag value` arguments from argv.
 */
function parseArgs(argv) {
  const args = { dryRun: false, plugin: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--plugin') {
      args.plugin = argv[++i];
      if (!args.plugin) throw new Error('--plugin requires a value');
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function formatDetail(label, items) {
  if (!items.length) return '';
  const lines = [`  ${label} (${items.length}):`];
  for (const item of items) {
    if (item.dryRun) {
      lines.push(`    - ${item.plugin} v${item.version}: would install [${(item.dependencies ?? []).join(', ')}] (dry-run)`);
    } else {
      lines.push(`    - ${item.plugin} v${item.version}: [${(item.dependencies ?? []).join(', ')}]`);
    }
    if (item.error) lines.push(`        error: ${item.error}`);
    if (item.missing?.length) lines.push(`        still missing: [${item.missing.join(', ')}]`);
  }
  return lines.join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const result = await installPluginDeps({ dryRun: args.dryRun, plugin: args.plugin });

  const summary = [
    `Installed: ${result.installed.length}`,
    `Up to date: ${result.upToDate.length}`,
    `Errors: ${result.errors.length}`,
    `Warnings: ${result.warnings.length}`,
  ].join(', ');
  process.stdout.write(`Install plugin dependencies: ${summary}\n`);

  const detail = [
    formatDetail('Installed', result.installed),
    formatDetail('Up to date', result.upToDate),
    formatDetail('Errors', result.errors),
    result.warnings.length ? `  Warnings (${result.warnings.length}):\n` + result.warnings.map((w) => `    - ${w}`).join('\n') : '',
  ].filter(Boolean).join('\n');
  if (detail) process.stdout.write(`${detail}\n`);

  if (result.errors.length > 0) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}