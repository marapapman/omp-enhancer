import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSharedWorkflowCatalogMarkdown } from '../plugins/omp-enhancer-core/src/workflow-routes.js';
import {
  checkWorkflowCatalog,
  writeWorkflowCatalog,
} from './generate-workflow-catalog.js';

test('workflow catalog generator reports a missing target and writes an idempotent exact render', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'omp-workflow-catalog-'));
  const target = path.join(root, 'WORKFLOW_CATALOG.md');

  const missing = await checkWorkflowCatalog(target);
  assert.equal(missing.ok, false);
  assert.equal(missing.actual, null);

  const firstWrite = await writeWorkflowCatalog(target);
  const expected = buildSharedWorkflowCatalogMarkdown();
  assert.equal(firstWrite.bytes, Buffer.byteLength(expected));
  assert.equal(await readFile(target, 'utf8'), expected);
  assert.equal((await checkWorkflowCatalog(target)).ok, true);

  await writeWorkflowCatalog(target);
  assert.equal(await readFile(target, 'utf8'), expected);
});

test('workflow catalog generator rejects missing, duplicate, and unknown CLI modes', async () => {
  const script = fileURLToPath(new URL('./generate-workflow-catalog.js', import.meta.url));
  for (const args of [[], ['--check', '--write'], ['--unknown']]) {
    const result = await runNode(script, args);
    assert.equal(result.code, 1, `expected ${args.join(' ') || 'no args'} to fail`);
    assert.match(result.stderr, /Choose exactly one mode/);
  }
});

function runNode(script, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
