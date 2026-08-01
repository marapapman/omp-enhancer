import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkWorkflowArtifacts,
  writeWorkflowArtifacts,
} from './generate-workflow-catalog.js';
import {
  WORKFLOW_CATALOG_VERSION,
  workflowDefinitions,
  workflowIds,
} from '../plugins/omp-enhancer-core/src/workflows/catalog.js';

test('workflow artifact generator writes the optional workflow skill and one reference per workflow', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'omp-workflow-artifacts-'));
  const catalogTarget = path.join(root, 'assets', 'WORKFLOW_CATALOG.md');
  const skillRoot = path.join(root, 'skills', 'omp-enhancer-workflows');
  const staleReference = path.join(skillRoot, 'references', 'removed-domain.md');

  await mkdir(path.dirname(staleReference), { recursive: true });
  await writeFile(staleReference, '# obsolete\n', 'utf8');

  const missing = await checkWorkflowArtifacts({ catalogTarget, skillRoot });
  assert.equal(missing.ok, false);
  assert.equal(missing.results.some((result) => result.target === staleReference && result.unexpected), true);
  const written = await writeWorkflowArtifacts({ catalogTarget, skillRoot });
  assert.equal(written.results.length, workflowDefinitions.length + 2);
  assert.deepEqual(written.removed, [staleReference]);
  await assert.rejects(access(staleReference), (error) => error?.code === 'ENOENT');

  const checked = await checkWorkflowArtifacts({ catalogTarget, skillRoot });
  assert.equal(checked.ok, true);
  await writeWorkflowArtifacts({ catalogTarget, skillRoot });
  assert.equal((await checkWorkflowArtifacts({ catalogTarget, skillRoot })).ok, true);

  const skill = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');
  const sharedCatalog = await readFile(catalogTarget, 'utf8');

  assert.match(skill, /^---\nname: omp-enhancer-workflows\n/m);
  assert.match(skill, /Advisory reference only\. Main selects workflows, Skills, Agents, and delegation width freely/i);
  assert.match(skill, /Phases: ANALYZE -> EXECUTE -> REVIEW/iu);
  assert.match(skill, /^## Domain index$/mu);
  assert.match(skill, /^## Usage$/mu);

  // The index renders exactly the five consolidated domain rows, each with the
  // chooseWhen text and a literal reference URI.
  const domainRows = [...skill.matchAll(/^- `([^`]+)` — ([^\n]+)$/gmu)].map((match) => match[1]);
  assert.deepEqual(domainRows, workflowIds);
  for (const definition of workflowDefinitions) {
    const row = skill
      .split('\n')
      .find((line) => line.startsWith(`- \`${definition.id}\` —`));
    assert.ok(row, `${definition.id} domain row is missing`);
    assert.ok(row.includes(definition.chooseWhen), `${definition.id} domain row must carry chooseWhen`);
    assert.match(
      row,
      new RegExp(`Reference: \`skill://omp-enhancer-workflows/references/${definition.id}\\.md\``),
      `${definition.id} domain row must expose its reference URI`,
    );
  }

  assert.doesNotMatch(skill, /DECLARE HANDOFF|WORKFLOW PLAN|WORKFLOW READY|SENTINEL|byte 0|NOW=|THEN=|RESOURCE EXTENSION|Delegate Agent=|EXECUTION DEFAULT|AFTER TODO RESULT|READY NEXT/i);
  assert.doesNotMatch(skill, /agentic\.simple|writing\.pending|writing\.en|writing\.zh|code\.dev|general\.subagent|diagram\.tikz|diagram\.mermaid|omp\.plugin/i);

  assert.match(sharedCatalog, new RegExp(`# OMP Enhancer Workflow Catalog v${WORKFLOW_CATALOG_VERSION}`));
  assert.match(sharedCatalog, /Advisory reference\. Main orchestrates freely through ANALYZE -> EXECUTE -> REVIEW/iu);
  assert.match(sharedCatalog, new RegExp(CATALOG_BLOCK_START()));
  assert.match(sharedCatalog, new RegExp(CATALOG_BLOCK_END()));
  assert.equal((sharedCatalog.match(/^## `[^`]+`$/gmu) ?? []).length, workflowDefinitions.length);
  for (const definition of workflowDefinitions) {
    const section = sharedCatalogSection(sharedCatalog, definition.id);
    assert.ok(section.includes(`- When: ${definition.chooseWhen}`), `${definition.id} catalog card must carry chooseWhen`);
    assert.ok(section.includes('- Skills:'), `${definition.id} catalog card must carry Skills`);
    assert.ok(section.includes(`- Agents: ${definition.roles.map((role) => `\`${role}\``).join(', ')}`), `${definition.id} catalog card must carry Agents`);
    assert.ok(section.includes('- Flow:'), `${definition.id} catalog card must carry Flow`);
    assert.doesNotMatch(section, /EXECUTION DEFAULT|READY NEXT|Delegate Agent|WORKFLOW PLAN|workflowExecutionDefault/i);
  }

  for (const definition of workflowDefinitions) {
    const reference = await readFile(
      path.join(skillRoot, 'references', `${definition.id}.md`),
      'utf8',
    );
    assert.ok(reference.startsWith(`# \`${definition.id}\` workflow reference`), `${definition.id} reference heading`);
    assert.match(reference, /^Optional advisory reference\. Main orchestrates freely\.$/m, definition.id);
    assert.ok(reference.includes(`- When: ${definition.chooseWhen}`), `${definition.id} reference must carry chooseWhen`);
    assert.ok(reference.includes('- Skills:'), `${definition.id} reference must carry Skills`);
    assert.ok(reference.includes('- Agent candidates:'), `${definition.id} reference must carry Agent candidates`);
    assert.ok(reference.includes('- Suggested flow:'), `${definition.id} reference must carry Suggested flow`);
    assert.ok(reference.includes('- Scope notes:'), `${definition.id} reference must carry Scope notes`);
    for (const line of definition.suggestedFlow) {
      assert.ok(reference.includes(line), `${definition.id} reference is missing suggested flow line: ${line}`);
    }
    for (const role of definition.roles) {
      assert.ok(reference.includes(`\`${role}\``), `${definition.id} reference is missing role ${role}`);
    }
    assert.doesNotMatch(reference, /SENTINEL|byte 0|READY NEXT|TASK COPY|AFTER TODO RESULT|EXECUTION DEFAULT|Delegate Agent=|WORKFLOW READY|\[workflow=/iu, definition.id);
  }

  assert.ok(Buffer.byteLength(skill) < 17_000, 'workflow Skill index should stay below 17k');
  assert.doesNotMatch(`${skill}\n${sharedCatalog}`, /block:\s*true|continue:\s*true|hard (?:gate|router)|automatic retry/iu);
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

function sharedCatalogSection(catalog, id) {
  const start = catalog.indexOf(`## \`${id}\``);
  const next = catalog.indexOf('\n## `', start + 1);
  assert.ok(start >= 0, `missing shared catalog section ${id}`);
  return catalog.slice(start, next < 0 ? catalog.length : next);
}

function CATALOG_BLOCK_START() {
  return '<!-- OMP-ENHANCER-WORKFLOW-CATALOG:START -->';
}

function CATALOG_BLOCK_END() {
  return '<!-- OMP-ENHANCER-WORKFLOW-CATALOG:END -->';
}
