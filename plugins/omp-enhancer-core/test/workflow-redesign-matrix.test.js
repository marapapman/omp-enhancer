import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { routeNaturalLanguageTask } from '../src/router.js';
import { workflowRouteCardSections, workflowRouteNames } from '../src/workflow-routes.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(testDir, '..', '..', '..');
const workloadMatrix = JSON.parse(await readFile(path.join(testDir, 'fixtures', 'workload-matrix.json'), 'utf8'));
const expectedSections = [
  'WORKFLOW_GUIDE',
  'Task type',
  'Suggested steps',
  'Skills',
  'Optional roles',
  'Quality checks',
  'Scope and risk notes',
];

test('workflow catalog exposes advisory routes including language-pending writing', () => {
  assert.ok(workflowRouteNames.includes('writing.pending'));
  assert.ok(workflowRouteNames.includes('writing.zh'));
  assert.ok(workflowRouteNames.includes('writing.en'));
  assert.deepEqual(workflowRouteCardSections(), expectedSections);
});

test('broad workload matrix always produces an advisory workflow plan', () => {
  assert.ok(workloadMatrix.length >= 60);
  for (const item of workloadMatrix) {
    const route = routeNaturalLanguageTask({ prompt: item.prompt, routerMode: 'enforce' });
    assert.ok(workflowRouteNames.includes(route.workflowRoute), item.id);
    assert.equal(route.advisoryOnly, true, item.id);
    assert.equal(route.autoContinue, false, item.id);
    assert.equal(route.routePlan.version, 2, item.id);
    assert.equal(route.routePlan.mode, 'advisory', item.id);
    assert.equal(route.routePlan.autoContinue, false, item.id);
    assert.ok(Array.isArray(route.routePlan.steps), item.id);
    assert.ok(Array.isArray(route.routePlan.skills), item.id);
    assert.ok(Array.isArray(route.routePlan.tools), item.id);
    assert.ok(Array.isArray(route.routePlan.roles), item.id);
    assert.ok(Array.isArray(route.routePlan.qualityChecks), item.id);
    assert.ok(Array.isArray(route.routePlan.riskNotes), item.id);
    assert.equal(Object.hasOwn(route.routePlan, 'gateRequirements'), false, item.id);
    assert.equal(Object.hasOwn(route, 'gateMode'), false, item.id);
    assert.equal(Object.hasOwn(route, 'hardBlockReasons'), false, item.id);
  }
});

test('body-less writing may defer language but never guesses from instruction language', () => {
  for (const item of workloadMatrix.filter(({ expectedRoute }) => ['writing.zh', 'writing.en'].includes(expectedRoute))) {
    const route = routeNaturalLanguageTask({ prompt: item.prompt, routerMode: 'enforce' });
    if (route.intent !== 'writing.pending') continue;
    assert.equal(route.taskDescriptor.language, 'unknown', item.id);
    assert.ok(!route.routePlan.skills.includes('plain-chinese-writing'), item.id);
    assert.ok(!route.routePlan.skills.includes('zh-writing-polish'), item.id);
    assert.ok(!route.routePlan.skills.includes('writing-markdown-helper'), item.id);
  }
});

test('route cards expose guidance sections and no gate section', () => {
  for (const item of workloadMatrix) {
    const route = routeNaturalLanguageTask({ prompt: item.prompt, routerMode: 'enforce' });
    assert.match(route.routeCard, /^WORKFLOW_GUIDE\n/, item.id);
    assert.match(route.routeCard, /\nSuggested steps:\n- /, item.id);
    assert.match(route.routeCard, /\nSkills:\n- /, item.id);
    assert.match(route.routeCard, /\nOptional roles:\n- /, item.id);
    assert.match(route.routeCard, /\nScope and risk notes:\n- /, item.id);
    assert.doesNotMatch(route.routeCard, /\nGate:\n|\nDo not:\n/i, item.id);
    assert.deepEqual(route.routeCardSections, expectedSections, item.id);
  }
});

test('every selected skill remains packaged by the marketplace', async () => {
  const registeredSkills = await registeredMarketplaceSkills(repoRoot);
  for (const item of workloadMatrix) {
    const route = routeNaturalLanguageTask({ prompt: item.prompt, routerMode: 'enforce' });
    for (const skill of route.routePlan.skills) {
      assert.equal(registeredSkills.has(skill), true, `${item.id}: ${skill}`);
    }
    for (const role of route.routePlan.roles) {
      for (const skill of role.skills ?? []) {
        assert.equal(registeredSkills.has(skill), true, `${item.id}: ${role.agent}/${skill}`);
      }
    }
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
