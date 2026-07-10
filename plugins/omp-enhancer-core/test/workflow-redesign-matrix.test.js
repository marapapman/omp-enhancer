import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { routeNaturalLanguageTask } from '../src/router.js';
import {
  buildWorkflowRouteCard,
  workflowRouteCardSections,
  workflowRouteNames,
} from '../src/workflow-routes.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(testDir, '..', '..', '..');
const fixturePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'workload-matrix.json',
);
const workloadMatrix = JSON.parse(await readFile(fixturePath, 'utf8'));
const expectedSections = ['WORKFLOW_CARD', 'Task type', 'Do', 'Do not', 'Skills', 'Gate'];

test('workflow route catalog exposes the frozen route set', () => {
  assert.deepEqual(workflowRouteNames, [
    'agentic.simple',
    'writing.zh',
    'writing.en',
    'writing.latex',
    'writing.markdown',
    'doc.convert.word',
    'factcheck.document',
    'code.dev',
    'code.debug',
    'code.test',
    'code.review',
    'omp.plugin',
    'security.review',
    'design.visual',
  ]);
  assert.deepEqual(workflowRouteCardSections(), expectedSections);
});

test('workflow matrix fixtures are complete and unique', () => {
  assert.ok(workloadMatrix.length >= 60, 'matrix should stay broad enough to cover route boundaries');
  const ids = new Set();
  for (const item of workloadMatrix) {
    assert.equal(typeof item.id, 'string', 'id is required');
    assert.equal(ids.has(item.id), false, `duplicate fixture id ${item.id}`);
    ids.add(item.id);
    assert.equal(typeof item.prompt, 'string', item.id);
    assert.ok(item.prompt.trim().length > 0, item.id);
    assert.ok(workflowRouteNames.includes(item.expectedRoute), item.id);
    assert.ok(Array.isArray(item.notRoute), item.id);
    for (const notRoute of item.notRoute) assert.ok(workflowRouteNames.includes(notRoute), item.id);
    assert.equal(typeof item.expectedGateMode, 'string', item.id);
    assert.equal(typeof item.shouldUseClassifier, 'boolean', item.id);
    assert.equal(typeof item.shouldForkSubagents, 'boolean', item.id);
    assert.ok(Array.isArray(item.expectedSkills), item.id);
    assert.deepEqual(item.expectedRouteCardSections, expectedSections, item.id);
    assert.ok(Object.hasOwn(item, 'expectedHardBlockReason'), item.id);
    assert.ok(Object.hasOwn(item, 'expectedLoopAction'), item.id);
    assert.ok(Array.isArray(item.expectedDebugLog), item.id);
  }
});

test('workflow matrix required skills are packaged in the marketplace catalog', async () => {
  const registeredSkills = await registeredMarketplaceSkills(repoRoot);
  const expectedSkills = new Set(workloadMatrix.flatMap((item) => item.expectedSkills));
  for (const skill of expectedSkills) {
    assert.equal(registeredSkills.has(skill), true, `missing packaged skill ${skill}`);
  }
});

test('workflow matrix routes prompts to the frozen workflow route contract', () => {
  for (const item of workloadMatrix) {
    const route = routeNaturalLanguageTask({ prompt: item.prompt });

    assert.equal(route.workflowRoute, item.expectedRoute, `${item.id} workflowRoute`);
    assert.equal(route.workflowTaskType, item.expectedRoute, `${item.id} workflowTaskType`);
    for (const notRoute of item.notRoute) assert.notEqual(route.workflowRoute, notRoute, `${item.id} notRoute ${notRoute}`);
    assert.equal(route.gateMode, item.expectedGateMode, `${item.id} gateMode`);
    assert.equal(route.skillGateMode, 'hidden-coach', `${item.id} skillGateMode`);
    assert.equal(route.classifierMode, 'route-hint-only', `${item.id} classifierMode`);
    assert.equal(route.shouldUseClassifier, item.shouldUseClassifier, `${item.id} shouldUseClassifier`);
    assert.equal(route.shouldForkSubagents, item.shouldForkSubagents, `${item.id} shouldForkSubagents`);
    for (const skill of item.expectedSkills) {
      assert.ok(route.requiredSkills.includes(skill), `${item.id} expected required skill ${skill}`);
    }
  }
});

test('route cards use the fixed five-section short card shape', () => {
  for (const item of workloadMatrix) {
    const route = routeNaturalLanguageTask({ prompt: item.prompt });
    const card = route.routeCard ?? buildWorkflowRouteCard({ route: item.expectedRoute, requiredSkills: route.requiredSkills ?? [] });

    assert.equal(card.startsWith('WORKFLOW_CARD\n'), true, item.id);
    assert.match(card, new RegExp(`Task type: ${escapeRegExp(item.expectedRoute)}`), item.id);
    assert.match(card, /\nDo:\n- /, item.id);
    assert.match(card, /\nDo not:\n- /, item.id);
    assert.match(card, /\nSkills:\n- /, item.id);
    assert.match(card, /\nGate:\n- /, item.id);
    assert.deepEqual(route.routeCardSections, item.expectedRouteCardSections, item.id);
  }
});

test('hard blocks are limited to the frozen reason code list', () => {
  const hardBlockCases = workloadMatrix.filter((item) => item.expectedGateMode === 'hard-block');
  assert.ok(hardBlockCases.length >= 2);
  for (const item of hardBlockCases) {
    const route = routeNaturalLanguageTask({ prompt: item.prompt });
    assert.deepEqual(route.hardBlockReasons, [
      'external_credential_missing',
      'irreversible_file_operation',
      'release_or_deploy',
      'real_high_security_risk',
      'network_or_service_unavailable',
      'user_required_approval',
    ], item.id);
    assert.notEqual(route.skillGateMode, 'hard-block', item.id);
    assert.ok(item.expectedHardBlockReason, `${item.id} expected hard-block reason`);
  }
});


async function registeredMarketplaceSkills(root) {
  const catalog = JSON.parse(await readFile(path.join(root, '.omp-plugin', 'marketplace.json'), 'utf8'));
  const skills = new Set();
  for (const plugin of catalog.plugins ?? []) {
    const pluginRoot = path.join(root, 'plugins', plugin.source.replace(/^\.\//, ''));
    for (const skillPath of plugin.skills ?? []) {
      const skillDir = path.join(pluginRoot, skillPath.replace(/^\.\//, ''));
      const skillText = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
      const frontmatterName = skillText.match(/^---\n[\s\S]*?\nname:\s*([^\n]+)\n/m)?.[1]?.trim();
      skills.add(frontmatterName || path.basename(skillDir));
    }
  }
  return skills;
}
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
