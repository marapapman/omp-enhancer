import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  WORKFLOW_CATALOG_VERSION,
  workflowRouteCatalog,
  workflowRouteNames,
} from '../plugins/omp-enhancer-core/src/workflow-routes.js';

test('shared main and advisor catalog stays aligned with the Core runtime catalog', async () => {
  const catalog = await readFile(new URL('../plugins/omp-config/assets/WORKFLOW_CATALOG.md', import.meta.url), 'utf8');
  const agents = await readFile(new URL('../plugins/omp-config/assets/AGENTS.md', import.meta.url), 'utf8');
  const watchdog = await readFile(new URL('../plugins/omp-config/assets/WATCHDOG.yml', import.meta.url), 'utf8');
  const version = Number(catalog.match(/OMP_WORKFLOW_CATALOG_VERSION:\s*(\d+)/)?.[1]);
  const ids = [...catalog.matchAll(/^### `([^`]+)`$/gm)].map((match) => match[1]);

  assert.equal(version, WORKFLOW_CATALOG_VERSION);
  assert.deepEqual(ids, workflowRouteNames);
  for (const id of workflowRouteNames) {
    const section = workflowSection(catalog, id);
    const staticSteps = parseNumberedField(section, 'Steps');
    const staticSkills = parseBacktickField(section, 'Skill candidates');
    const staticQuality = parseTextField(section, 'Quality checks');
    const runtime = workflowRouteCatalog[id];

    assert.deepEqual(staticSteps, runtime.steps.map(normalizeProse), `${id} steps drifted from the runtime catalog`);
    assert.deepEqual(staticSkills, runtime.skills, `${id} skill candidates drifted from the runtime catalog`);
    assert.equal(staticQuality, normalizeProse(runtime.qualityChecks.join(', ')), `${id} quality checks drifted from the runtime catalog`);
  }
  assert.ok(workflowRouteCatalog['writing.en'].skills.includes('writing-review'));
  assert.ok(workflowRouteCatalog['writing.en'].skills.includes('writing-checkers'));
  assert.match(agents, /@\.\/OMP_ENHANCER_WORKFLOW_CATALOG\.md/);
  assert.match(watchdog, /@\.\/OMP_ENHANCER_WORKFLOW_CATALOG\.md/);
  assert.match(catalog, /initialize the native `todo` before substantive project work/i);
  assert.match(catalog, /fork multiple subagents/i);
  assert.match(catalog, /body of the text being modified/i);
  assert.doesNotMatch(catalog, /block:\s*true|continue:\s*true|hard gate/i);
});

function workflowSection(catalog, id) {
  const start = catalog.indexOf(`### \`${id}\``);
  const next = catalog.indexOf('\n### `', start + 1);
  assert.ok(start >= 0, `missing workflow section ${id}`);
  return catalog.slice(start, next < 0 ? catalog.length : next);
}

function parseNumberedField(section, label) {
  const value = fieldValue(section, label);
  return value
    .replace(/^\(1\)\s*/, '')
    .split(/;\s*\(\d+\)\s*/)
    .map(normalizeProse);
}

function parseBacktickField(section, label) {
  const value = fieldValue(section, label);
  return [...value.matchAll(/`([a-z0-9][a-z0-9._/-]*)`/gi)].map((match) => match[1]);
}

function parseTextField(section, label) {
  return normalizeProse(fieldValue(section, label));
}

function fieldValue(section, label) {
  const match = section.match(new RegExp(`^- ${label}: (.+)$`, 'm'));
  assert.ok(match, `missing ${label} in workflow section`);
  return match[1];
}

function normalizeProse(value) {
  return String(value)
    .replace(/`/g, '')
    .replace(/[.]$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
