import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSharedWorkflowCatalogMarkdown } from '../plugins/omp-enhancer-core/src/workflow-routes.js';
import {
  checkWorkflowArtifacts,
  checkWorkflowCatalog,
  writeWorkflowArtifacts,
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

test('workflow artifact generator writes the optional workflow skill and domain references', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'omp-workflow-artifacts-'));
  const catalogTarget = path.join(root, 'assets', 'WORKFLOW_CATALOG.md');
  const skillRoot = path.join(root, 'skills', 'omp-enhancer-workflows');

  assert.equal((await checkWorkflowArtifacts({ catalogTarget, skillRoot })).ok, false);
  const written = await writeWorkflowArtifacts({ catalogTarget, skillRoot });
  assert.equal(written.results.length, 11);

  const checked = await checkWorkflowArtifacts({ catalogTarget, skillRoot });
  assert.equal(checked.ok, true);
  const skill = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: omp-enhancer-workflows\n/m);
  assert.match(skill, /OMP native settings, tools, permissions, TODO behavior, and dynamic Agents always remain authoritative/i);
  assert.doesNotMatch(skill, /FIRST tool call|Invoke only roles/i);
  const codeReference = await readFile(path.join(skillRoot, 'references', 'code.md'), 'utf8');
  assert.match(codeReference, /`code\.dev`/);
  assert.match(codeReference, /Optional Agent candidates/);
});

test('workflow catalog generator rejects missing, duplicate, and unknown CLI modes', async () => {
  const script = fileURLToPath(new URL('./generate-workflow-catalog.js', import.meta.url));
  for (const args of [[], ['--check', '--write'], ['--unknown']]) {
    const result = await runNode(script, args);
    assert.equal(result.code, 1, `expected ${args.join(' ') || 'no args'} to fail`);
  }
});

function runNode(script, args) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, [script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
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
