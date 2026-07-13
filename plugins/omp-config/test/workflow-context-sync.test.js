import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import registerOmpConfig, { syncWorkflowContext } from '../index.js';
import {
  ADVISOR_BLOCK_END,
  ADVISOR_BLOCK_START,
  AGENTS_BLOCK_END,
  AGENTS_BLOCK_START,
  CATALOG_BLOCK_END,
  CATALOG_BLOCK_START,
  mergeWatchdogManagedBlock,
} from '../src/workflow-context-sync.js';

function packageRoot() {
  return path.dirname(path.dirname(fileURLToPath(import.meta.url)));
}

function registrationHarness() {
  const tools = [];
  const pi = {
    zod: {
      z: {
        string: () => ({ optional: () => ({ type: 'optional-string' }) }),
        boolean: () => ({ optional: () => ({ type: 'optional-boolean' }) }),
        optional: (schema) => ({ type: 'optional', schema }),
        object: (shape) => ({ type: 'object', shape }),
      },
    },
    registerTool(tool) {
      tools.push(tool);
    },
  };
  registerOmpConfig(pi);
  return tools;
}

test('shared main and Advisor assets import one complete advisory workflow catalog', async () => {
  const assets = path.join(packageRoot(), 'assets');
  const [catalog, agents, watchdog] = await Promise.all([
    readFile(path.join(assets, 'WORKFLOW_CATALOG.md'), 'utf8'),
    readFile(path.join(assets, 'AGENTS.md'), 'utf8'),
    readFile(path.join(assets, 'WATCHDOG.yml'), 'utf8'),
  ]);
  const workflowIds = [
    'agentic.simple',
    'writing.pending',
    'writing.zh',
    'writing.en',
    'writing.latex',
    'writing.markdown',
    'doc.convert.word',
    'factcheck.document',
    'code.plan',
    'code.dev',
    'code.debug',
    'code.test',
    'code.review',
    'omp.plugin',
    'security.review',
    'design.visual',
    'release.publish',
  ];

  assert.equal((catalog.match(/^### `/gm) ?? []).length, workflowIds.length);
  for (const workflowId of workflowIds) {
    assert.ok(catalog.includes(`### \`${workflowId}\``), `${workflowId} should have a workflow card`);
  }
  for (const heading of ['Select when:', 'Steps:', 'Skill candidates:', 'Quality checks:', 'Delegation:']) {
    assert.equal((catalog.match(new RegExp(`^- ${heading}`, 'gm')) ?? []).length, workflowIds.length);
  }
  assert.match(catalog, /Initialize the native `todo` before substantive project work/);
  assert.match(catalog, /preferably in one `task\.tasks\[\]` batch/);
  assert.match(catalog, /body of the text being modified, never from the prompt language/);
  assert.match(catalog, /guidance, not a router, permission system, completion gate, or continuation controller/);
  assert.match(catalog, /OMP_WORKFLOW_CATALOG_VERSION: 3/);
  assert.match(catalog, new RegExp(CATALOG_BLOCK_START));
  assert.match(catalog, new RegExp(CATALOG_BLOCK_END));
  assert.match(agents, /^@\.\/OMP_ENHANCER_WORKFLOW_CATALOG\.md$/m);
  assert.match(watchdog, /^  @\.\/OMP_ENHANCER_WORKFLOW_CATALOG\.md$/m);
  assert.match(watchdog, /selected workflow, TODO coverage, skill use, and delegation/);
  assert.match(watchdog, /suggestions, not execution or completion gates/);
  assert.doesNotMatch(`${catalog}\n${agents}\n${watchdog}`, /block:\s*true|continue:\s*true|triggerTurn/);
});

test('workflow context sync defaults to dry-run and writes nothing', async () => {
  const target = path.join(await mkdtemp(path.join(tmpdir(), 'omp-config-sync-preview-')), 'agent');

  const result = await syncWorkflowContext({ root: packageRoot(), target });

  assert.equal(result.mode, 'dry-run');
  assert.equal(result.changed, 3);
  assert.deepEqual(result.files.map(({ action }) => action), ['create', 'create', 'create']);
  await assert.rejects(access(path.join(target, 'AGENTS.md')), { code: 'ENOENT' });
});

test('workflow context sync applies managed files while preserving unrelated main and Advisor content', async () => {
  const target = await mkdtemp(path.join(tmpdir(), 'omp-config-sync-apply-'));
  await writeFile(path.join(target, 'AGENTS.md'), '# Personal instructions\n\nKeep this exact sentence.\n');
  await writeFile(
    path.join(target, 'WATCHDOG.yml'),
    'instructions: |\n  Existing advisor instruction.\n\nadvisors:\n  - name: Existing reviewer\n    tools: []\n',
  );

  const applied = await syncWorkflowContext({ root: packageRoot(), target, apply: true });
  const [catalog, agents, watchdog] = await Promise.all([
    readFile(path.join(target, 'OMP_ENHANCER_WORKFLOW_CATALOG.md'), 'utf8'),
    readFile(path.join(target, 'AGENTS.md'), 'utf8'),
    readFile(path.join(target, 'WATCHDOG.yml'), 'utf8'),
  ]);

  assert.equal(applied.mode, 'apply');
  assert.equal(applied.changed, 3);
  assert.match(catalog, /# OMP Enhancer Workflow Catalog/);
  assert.match(agents, /# Personal instructions/);
  assert.match(agents, /Keep this exact sentence\./);
  assert.equal(agents.split(AGENTS_BLOCK_START).length - 1, 1);
  assert.equal(agents.split(AGENTS_BLOCK_END).length - 1, 1);
  assert.match(watchdog, /Existing advisor instruction\./);
  assert.match(watchdog, /name: Existing reviewer/);
  assert.equal(watchdog.split(ADVISOR_BLOCK_START).length - 1, 1);
  assert.equal(watchdog.split(ADVISOR_BLOCK_END).length - 1, 1);
  assert.match(watchdog, /^  @\.\/OMP_ENHANCER_WORKFLOW_CATALOG\.md$/m);

  const repeated = await syncWorkflowContext({ root: packageRoot(), target, apply: true });
  assert.equal(repeated.changed, 0);
});

test('workflow context sync updates only stale managed blocks', async () => {
  const target = await mkdtemp(path.join(tmpdir(), 'omp-config-sync-update-'));
  await writeFile(
    path.join(target, 'AGENTS.md'),
    `before\n\n${AGENTS_BLOCK_START}\nstale\n${AGENTS_BLOCK_END}\n\nafter\n`,
  );
  await writeFile(
    path.join(target, 'WATCHDOG.yml'),
    `instructions: |\n  before advisor\n\n  ${ADVISOR_BLOCK_START}\n  stale\n  ${ADVISOR_BLOCK_END}\n\n  after advisor\n`,
  );

  await syncWorkflowContext({ root: packageRoot(), target, apply: true });
  const [agents, watchdog] = await Promise.all([
    readFile(path.join(target, 'AGENTS.md'), 'utf8'),
    readFile(path.join(target, 'WATCHDOG.yml'), 'utf8'),
  ]);

  assert.match(agents, /^before$/m);
  assert.match(agents, /^after$/m);
  assert.doesNotMatch(agents, /^stale$/m);
  assert.match(watchdog, /^  before advisor$/m);
  assert.match(watchdog, /^  after advisor$/m);
  assert.doesNotMatch(watchdog, /^  stale$/m);
});

test('watchdog merge preserves a roster when shared instructions are initially absent', () => {
  const managed = `${ADVISOR_BLOCK_START}\n@./OMP_ENHANCER_WORKFLOW_CATALOG.md\n${ADVISOR_BLOCK_END}`;
  const merged = mergeWatchdogManagedBlock('advisors:\n  - name: Existing\n', managed);

  assert.match(merged, /^instructions: \|$/m);
  assert.match(merged, /^  @\.\/OMP_ENHANCER_WORKFLOW_CATALOG\.md$/m);
  assert.match(merged, /^advisors:$/m);
  assert.match(merged, /^  - name: Existing$/m);
});

test('workflow context sync refuses partial markers and symlinked managed files', async () => {
  const partialTarget = await mkdtemp(path.join(tmpdir(), 'omp-config-sync-partial-'));
  await writeFile(path.join(partialTarget, 'AGENTS.md'), `${AGENTS_BLOCK_START}\nincomplete\n`);
  await assert.rejects(
    syncWorkflowContext({ root: packageRoot(), target: partialTarget, apply: true }),
    /Managed block markers are incomplete or duplicated/,
  );

  const symlinkTarget = await mkdtemp(path.join(tmpdir(), 'omp-config-sync-symlink-'));
  const outside = path.join(await mkdtemp(path.join(tmpdir(), 'omp-config-sync-outside-')), 'outside.md');
  await writeFile(outside, 'outside\n');
  await symlink(outside, path.join(symlinkTarget, 'AGENTS.md'));
  await assert.rejects(
    syncWorkflowContext({ root: packageRoot(), target: symlinkTarget }),
    /Refusing to replace a symlinked config file/,
  );
  assert.equal(await readFile(outside, 'utf8'), 'outside\n');

  const collisionTarget = await mkdtemp(path.join(tmpdir(), 'omp-config-sync-collision-'));
  const collisionPath = path.join(collisionTarget, 'OMP_ENHANCER_WORKFLOW_CATALOG.md');
  await writeFile(collisionPath, '# User-owned workflow catalog\n');
  await assert.rejects(
    syncWorkflowContext({ root: packageRoot(), target: collisionTarget, apply: true }),
    /Refusing to replace existing workflow catalog without one complete OMP Enhancer managed marker pair/,
  );
  assert.equal(await readFile(collisionPath, 'utf8'), '# User-owned workflow catalog\n');
});

test('registered workflow context sync tool previews by default and reports explicit apply', async () => {
  const tool = registrationHarness().find(({ name }) => name === 'omp_config_sync_workflow_context');
  const target = path.join(await mkdtemp(path.join(tmpdir(), 'omp-config-sync-tool-')), 'agent');

  const preview = await tool.execute('sync-1', { target }, undefined, undefined, { cwd: packageRoot() });
  assert.equal(preview.isError, false);
  assert.equal(preview.details.mode, 'dry-run');
  assert.match(preview.content[0].text, /No files were written/);

  const applied = await tool.execute('sync-2', { target, apply: true }, undefined, undefined, { cwd: packageRoot() });
  assert.equal(applied.isError, false);
  assert.equal(applied.details.mode, 'apply');
  await mkdir(target, { recursive: true });
  assert.match(await readFile(path.join(target, 'AGENTS.md'), 'utf8'), /@\.\/OMP_ENHANCER_WORKFLOW_CATALOG\.md/);
});
