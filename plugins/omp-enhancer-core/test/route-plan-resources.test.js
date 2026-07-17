import test from 'node:test';
import assert from 'node:assert/strict';

import { routeNaturalLanguageTask } from '../src/router.js';
import { filterRoutePlanByTaskConstraints } from '../src/route-policy.js';

test('broad code work recommends skill-bearing roles without making them completion conditions', () => {
  const route = routeNaturalLanguageTask({
    prompt: '请大规模重构这个插件的 subagent 路由逻辑，修改多个文件并补完整测试。',
    routerMode: 'enforce',
  });
  assert.equal(route.routePlan.mode, 'advisory');
  assert.deepEqual(route.routePlan.roles.map(({ agent }) => agent), ['plan', 'implementation-task', 'reviewer']);
  assert.ok(route.routePlan.roles.every(({ skills }) => skills.length > 0));
  assert.equal(Object.hasOwn(route.routePlan, 'gateRequirements'), false);
  assert.equal(route.routePlan.autoContinue, false);
});

test('bounded target audits use namespaced auditors while supplied diffs retain OMP reviewer', () => {
  const targetAudit = routeNaturalLanguageTask({
    prompt: 'Audit this parser subsystem across callers, consumers, schemas, tests, and fallback paths for concrete bugs; report only and do not edit.',
    routerMode: 'enforce',
  });
  assert.deepEqual(targetAudit.routePlan.roles.map(({ agent }) => agent), ['omp-target-auditor']);

  const patchReview = routeNaturalLanguageTask({
    prompt: 'Review the current PR diff across modified files, callers, consumers, tests, and fallback paths for concrete bugs; report only and do not edit.',
    routerMode: 'enforce',
  });
  assert.deepEqual(patchReview.routePlan.roles.map(({ agent }) => agent), ['reviewer']);
});

test('security review recommends security skills and target-appropriate independent roles', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Audit this authentication module for concrete vulnerabilities.',
    routerMode: 'enforce',
  });
  assert.equal(route.intent, 'security-review');
  assert.ok(route.routePlan.skills.includes('security-review'));
  assert.ok(route.routePlan.skills.includes('security-scan'));
  assert.ok(route.routePlan.qualityChecks.includes('security-evidence'));
  assert.deepEqual(route.routePlan.roles.map(({ agent }) => agent), ['ecc-security-reviewer', 'omp-target-auditor']);

  const diffRoute = routeNaturalLanguageTask({
    prompt: 'Review the current diff for concrete authentication vulnerabilities.',
    routerMode: 'enforce',
  });
  assert.deepEqual(diffRoute.routePlan.roles.map(({ agent }) => agent), ['ecc-security-reviewer', 'reviewer']);
});

test('user scope preferences shape suggestions without becoming runtime ceilings', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Inspect OMP config assets and templates, but do not use subagents or run tests.',
    routerMode: 'enforce',
  });
  assert.equal(route.intent, 'config-assets');
  assert.deepEqual(route.routePlan.roles, []);
  assert.ok(!route.routePlan.tools.some((tool) => /^omp_test_/i.test(tool)));
  assert.ok(route.routePlan.tools.includes('omp_config_doctor'));
  assert.equal(route.advisoryOnly, true);
});

test('broad polish suggestions stay minimal after body language is known', () => {
  const pending = routeNaturalLanguageTask({
    prompt: 'Review and polish the logic and wording of docs/paper.md.',
    routerMode: 'enforce',
  });
  assert.equal(pending.intent, 'writing.pending');
  assert.ok(pending.routePlan.qualityChecks.includes('detect-source-language'));
  assert.ok(!pending.routePlan.skills.includes('writing-markdown-helper'));

  const refined = routeNaturalLanguageTask({
    prompt: 'Review and polish the logic and wording of docs/paper.md.',
    sourceText: 'This paper presents the system design, evaluation, and limitations in detail.',
    routerMode: 'enforce',
  });
  assert.equal(refined.intent, 'writing.en');
  assert.ok(refined.routePlan.skills.includes('writing-markdown-helper'));
  assert.ok(!refined.routePlan.skills.includes('writing-checkers'));
  assert.ok(!refined.routePlan.tools.includes('writing_logic_check'));
  assert.ok(!refined.routePlan.tools.includes('writing_quality_check'));
});

test('release and irreversible work produces risk notes rather than protected gates', () => {
  const release = routeNaturalLanguageTask({
    prompt: 'Publish the plugin release and verify the published version.',
    routerMode: 'enforce',
  });
  assert.ok(release.routePlan.riskNotes.some((note) => /external target|external action/i.test(note)));
  assert.ok(release.routePlan.qualityChecks.includes('post-action-verification'));
  assert.equal(Object.hasOwn(release.routePlan, 'gateRequirements'), false);

  const destructive = routeNaturalLanguageTask({
    prompt: 'Delete the generated cache directory recursively.',
    routerMode: 'enforce',
  });
  assert.ok(destructive.routePlan.riskNotes.some((note) => /irreversible/i.test(note)));
  assert.equal(Object.hasOwn(destructive.routePlan, 'hardBlock'), false);
});

test('top-level required fields are explicitly deprecated compatibility aliases', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Fix src/parser.js and run the focused parser tests.',
    routerMode: 'enforce',
  });
  assert.deepEqual(route.requiredSkills, route.routePlan.skills);
  assert.deepEqual(route.requiredTools, route.routePlan.tools);
  assert.deepEqual(route.requiredSubagents.map(({ agent }) => agent), route.routePlan.roles.map(({ agent }) => agent));
  assert.deepEqual(route.deprecatedAliases, ['requiredSkills', 'requiredTools', 'requiredSubagents']);
});

test('shared route-plan filtering recognizes catalog reviewer role suffixes', () => {
  const plan = filterRoutePlanByTaskConstraints({
    skills: ['subagent-driven-development', 'security-review'],
    roles: [
      { agent: 'plan' },
      { agent: 'implementation-task' },
      { agent: 'ecc-network-config-reviewer' },
      { agent: 'fact-researcher-a' },
    ],
  }, {
    constraints: { independentReview: 'forbidden' },
  });

  assert.deepEqual(plan.roles.map(({ agent }) => agent), [
    'plan',
    'implementation-task',
    'fact-researcher-a',
  ]);
  assert.deepEqual(plan.skills, ['subagent-driven-development', 'security-review']);
});
