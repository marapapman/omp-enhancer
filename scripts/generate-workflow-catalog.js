import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildSharedWorkflowCatalogMarkdown } from '../plugins/omp-enhancer-core/src/workflow-routes.js';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const workflowCatalogTarget = path.join(
  repoRoot,
  'plugins',
  'omp-config',
  'assets',
  'WORKFLOW_CATALOG.md',
);

export async function checkWorkflowCatalog(target = workflowCatalogTarget) {
  const expected = buildSharedWorkflowCatalogMarkdown();
  const actual = await readFile(target, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  return {
    ok: actual === expected,
    target,
    expected,
    actual,
  };
}

export async function writeWorkflowCatalog(target = workflowCatalogTarget) {
  const content = buildSharedWorkflowCatalogMarkdown();
  await writeFile(target, content, 'utf8');
  return { ok: true, target, bytes: Buffer.byteLength(content) };
}

async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write('Usage: node scripts/generate-workflow-catalog.js --check|--write\n');
    return;
  }
  const check = argv.includes('--check');
  const write = argv.includes('--write');
  if (check === write || argv.some((arg) => !['--check', '--write'].includes(arg))) {
    throw new Error('Choose exactly one mode: --check or --write.');
  }

  if (write) {
    const result = await writeWorkflowCatalog();
    process.stdout.write(`Generated ${path.relative(repoRoot, result.target)} (${result.bytes} bytes).\n`);
    return;
  }

  const result = await checkWorkflowCatalog();
  if (!result.ok) {
    process.stderr.write(
      `Workflow catalog is stale: ${path.relative(repoRoot, result.target)}. Run npm run generate:workflows.\n`,
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Workflow catalog is current: ${path.relative(repoRoot, result.target)}.\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
