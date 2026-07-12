import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { routeNaturalLanguageTask } from '../src/router.js';

const fixtures = JSON.parse(await readFile(new URL('./fixtures/routing-adversarial.json', import.meta.url), 'utf8'));

const advisoryQualityChecks = {
  gate_review_read_only_zh: ['review-evidence'],
  gate_review_read_only_en: ['review-evidence'],
  optimization_suggestions_no_write_zh: ['review-evidence'],
  router_file_review_no_write_zh: ['review-evidence'],
  run_single_test_command_zh: ['test-evidence'],
  provide_test_command_no_execute_zh: [],
  fix_test_push_zh: ['test-evidence', 'review-evidence', 'post-action-verification'],
  fix_test_push_en: ['test-evidence', 'review-evidence', 'post-action-verification'],
  readme_update_push_zh: ['detect-source-language', 'review-evidence', 'post-action-verification'],
  factcheck_polish_zh: ['fact-evidence', 'detect-source-language', 'review-evidence'],
  factcheck_polish_en: ['fact-evidence', 'review-evidence'],
  security_fix_test_release_zh: ['security-evidence', 'test-evidence', 'review-evidence', 'post-action-verification'],
  security_fix_test_release_en: ['security-evidence', 'test-evidence', 'review-evidence', 'post-action-verification'],
  fix_without_test_execution_zh: ['review-evidence'],
  fix_test_without_push_zh: ['test-evidence', 'review-evidence'],
  single_function_review_en: ['review-evidence'],
};

const advisoryResourceOverrides = {
  gate_review_read_only_zh: {
    skills: ['diagnose'],
    tools: [],
    roles: [],
  },
  gate_review_read_only_en: {
    skills: ['diagnose'],
    tools: [],
    roles: [],
  },
  optimization_suggestions_no_write_zh: {
    skills: ['diagnose'],
    tools: [],
    roles: [],
  },
  router_file_review_no_write_zh: {
    skills: ['diagnose'],
    tools: [],
    roles: [],
  },
  readme_update_push_zh: {
    skills: [],
    tools: [],
    roles: [],
  },
  factcheck_polish_zh: {
    skills: ['fact-checking', 'claim-extraction', 'source-evaluation', 'citation-authenticity'],
    tools: ['fact_check_analyze', 'fact_check_evidence', 'fact_check_report'],
    roles: ['fact-planner', 'fact-researcher-a', 'fact-researcher-b', 'fact-cross-checker', 'fact-reviewer'],
  },
  single_function_review_en: {
    skills: ['diagnose'],
    tools: [],
    roles: [],
  },
};

function descriptorContract(descriptor, caseId) {
  assert.ok(
    descriptor && typeof descriptor === 'object',
    `${caseId}: routeNaturalLanguageTask() must return taskDescriptor; the legacy single-intent route is insufficient`,
  );
  return {
    version: descriptor.version,
    operation: descriptor.operation,
    domains: descriptor.domains,
    constraints: descriptor.constraints,
    capabilities: descriptor.capabilities,
    phases: descriptor.phases,
    risk: descriptor.risk,
    complexity: descriptor.complexity,
    language: descriptor.language,
  };
}

function routePlanContract(plan, caseId) {
  assert.ok(
    plan && typeof plan === 'object',
    `${caseId}: routeNaturalLanguageTask() must return routePlan with ordered phases and one compiled policy`,
  );
  assert.equal(plan.version, 2, `${caseId}: RoutePlan must use the advisory v2 contract`);
  assert.equal(plan.mode, 'advisory', `${caseId}: RoutePlan must be advisory`);
  assert.equal(plan.autoContinue, false, `${caseId}: RoutePlan must not auto-continue`);
  for (const field of ['steps', 'skills', 'tools', 'roles', 'qualityChecks', 'riskNotes']) {
    assert.ok(Array.isArray(plan[field]), `${caseId}: routePlan.${field} must be an array`);
  }
  for (const role of plan.roles) {
    assert.equal(typeof role.agent, 'string', `${caseId}: advisory role must name an agent`);
    assert.ok(Array.isArray(role.skills), `${caseId}: advisory role skills must be an array`);
  }
  assert.equal('gateRequirements' in plan, false, `${caseId}: advisory RoutePlan must not expose gate requirements`);
  assert.equal('hardBlock' in plan, false, `${caseId}: advisory RoutePlan must not hard-block execution`);
  return {
    version: plan.version,
    mode: plan.mode,
    autoContinue: plan.autoContinue,
    steps: plan.steps,
    skills: plan.skills,
    tools: plan.tools,
    roles: plan.roles.map(({ agent }) => agent),
    qualityChecks: plan.qualityChecks,
  };
}

function expectedAdvisoryRoutePlan(fixture) {
  const legacyPlan = fixture.expected.routePlan;
  const resources = advisoryResourceOverrides[fixture.id] ?? {
    skills: legacyPlan.requiredSkills,
    tools: legacyPlan.requiredTools,
    roles: legacyPlan.requiredSubagents,
  };
  const hadTestGate = resources.tools.includes('omp_test_gate');
  const nonGateTools = resources.tools.filter((tool) => !['omp_test_gate', 'fact_check_gate'].includes(tool));
  const tools = hadTestGate && nonGateTools.length === 0
    ? fixture.expected.taskDescriptor.operation === 'execute'
      ? ['omp_test_report']
      : ['omp_test_analyze', 'omp_test_report']
    : nonGateTools;
  return {
    version: 2,
    mode: 'advisory',
    autoContinue: false,
    steps: legacyPlan.phases,
    skills: resources.skills,
    tools,
    roles: resources.roles,
    qualityChecks: advisoryQualityChecks[fixture.id],
  };
}

function expectedTaskDescriptor(fixture) {
  if (!['readme_update_push_zh', 'factcheck_polish_zh'].includes(fixture.id)) {
    return fixture.expected.taskDescriptor;
  }
  return {
    ...fixture.expected.taskDescriptor,
    language: 'unknown',
  };
}

function expectedIntentProjection(fixture) {
  if (fixture.id === 'readme_update_push_zh') {
    return {
      intent: 'writing.pending',
      workflowRoute: 'writing.pending',
    };
  }
  return {
    intent: fixture.expected.legacy.intent,
    workflowRoute: fixture.expected.legacy.workflowRoute,
  };
}

function assertForbiddenCapabilities(descriptor, caseId) {
  const phaseKinds = new Set(descriptor.phases.map((phase) => phase.kind));
  if (descriptor.constraints.workspaceWrite === 'forbidden') {
    assert.ok(!descriptor.capabilities.includes('fs.write'), `${caseId}: read-only route grants fs.write`);
    assert.ok(
      !descriptor.phases.some((phase) => phase.kind === 'modify' && ['code', 'document', 'plugin', 'config', 'visual'].includes(phase.domain)),
      `${caseId}: workspace-read-only route contains a workspace modify phase`,
    );
  }
  if (descriptor.constraints.testExecution === 'forbidden') {
    assert.ok(!descriptor.capabilities.includes('tests.execute'), `${caseId}: no-test route grants tests.execute`);
    assert.ok(
      !descriptor.phases.some((phase) => phase.kind === 'verify' && phase.domain === 'tests'),
      `${caseId}: no-test route contains a test verify phase`,
    );
  }
  if (descriptor.constraints.externalWrite === 'forbidden') {
    assert.ok(!descriptor.capabilities.includes('external.write'), `${caseId}: no-publish route grants external.write`);
    assert.ok(!phaseKinds.has('release'), `${caseId}: no-publish route contains a release phase`);
  }
}

test('adversarial prompts compile to exact descriptors and advisory route plans', async (t) => {
  for (const fixture of fixtures) {
    await t.test(fixture.id, () => {
      const route = routeNaturalLanguageTask({ prompt: fixture.prompt, routerMode: 'enforce' });
      const descriptor = descriptorContract(route.taskDescriptor, fixture.id);
      const routePlan = routePlanContract(route.routePlan, fixture.id);

      assert.deepEqual(descriptor, expectedTaskDescriptor(fixture), `${fixture.id}: unexpected TaskDescriptor`);
      assert.deepEqual(routePlan, expectedAdvisoryRoutePlan(fixture), `${fixture.id}: unexpected advisory RoutePlan`);
      assert.deepEqual(
        {
          intent: route.intent,
          workflowRoute: route.workflowRoute,
        },
        expectedIntentProjection(fixture),
        `${fixture.id}: v2 route changed or lost the intent compatibility projection`,
      );
      assertForbiddenCapabilities(descriptor, fixture.id);
    });
  }
});

test('explicit negative constraints dominate distracting filenames and action words', () => {
  const cases = [
    '不要修改代码，只检查 router.js 并给出优化建议。',
    '检查并给出优化建议；router.js 不要修改。',
    'Do not modify router.js; review it and suggest optimizations.',
    'Review router.js and suggest optimizations, but do not modify it.',
  ];

  for (const prompt of cases) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    const descriptor = descriptorContract(route.taskDescriptor, prompt);
    assert.equal(descriptor.operation, 'inspect', prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'forbidden', prompt);
    assertForbiddenCapabilities(descriptor, prompt);
    assert.equal(route.workflowRoute, 'code.review', prompt);
    assert.equal(route.routePlan.roles.length, 0, `${prompt}: focused review must not suggest a broad audit fleet`);
  }
});

test('single-file, single-function, and single-command requests remain focused', () => {
  const prompts = [
    '分析 router.js 是否合理，不改代码。',
    'Review routeNaturalLanguageTask and report defects only.',
    '只运行 npm test 并报告结果，不改代码。',
  ];

  for (const prompt of prompts) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    assert.equal(route.taskDescriptor?.complexity, 'focused', prompt);
    assert.equal(route.routePlan?.roles?.length, 0, `${prompt}: focused request escalated to advisory roles`);
  }
});

test('implicit code-change imperatives route to focused implementation without classifier dependence', () => {
  for (const prompt of [
    'Take care of the TODO in src/router.js.',
    'Handle the issue in src/router.js.',
    'Make router.js work with empty input.',
    '把 router.js 处理一下。',
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    assert.equal(route.taskDescriptor.operation, 'modify', prompt);
    assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'required', prompt);
    assert.ok(route.taskDescriptor.capabilities.includes('fs.write'), prompt);
    assert.equal(route.taskDescriptor.provenance.needsClassifier, false, prompt);
    assert.equal(route.intent, 'implementation-with-tests', prompt);
    assert.equal(route.workflowRoute, 'code.dev', prompt);
    assert.ok(route.routePlan.steps.some(({ kind, domain }) => kind === 'modify' && domain === 'code'), prompt);
  }
});

test('ambiguous code-target requests ask for classification without granting write authority', () => {
  for (const prompt of [
    'Look into src/router.js.',
    '看一下 src/router.js。',
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'forbidden', prompt);
    assert.ok(!route.taskDescriptor.capabilities.includes('fs.write'), prompt);
    assert.equal(route.taskDescriptor.provenance.needsClassifier, true, prompt);
    assert.equal(route.shouldUseClassifier, true, prompt);
  }
});

test('explanation and review phrasing cannot inherit implicit modification authority', () => {
  for (const [prompt, operation] of [
    ['Explain how router.js handles empty input.', 'answer'],
    ['Review the TODO in src/router.js and report findings only.', 'inspect'],
    ['解释一䬋 router.js 如何处理空输入。', 'answer'],
    ['只审查 router.js 的 TODO，报告问题，不要修改。', 'inspect'],
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    assert.equal(route.taskDescriptor.operation, operation, prompt);
    assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'forbidden', prompt);
    assert.ok(!route.taskDescriptor.capabilities.includes('fs.write'), prompt);
    assert.equal(route.taskDescriptor.provenance.needsClassifier, false, prompt);
  }
});

test('answer-only side-effect advice has no action authority or protected-action workflow', () => {
  for (const prompt of [
    'How do I delete all cache files safely? Do not execute anything.',
    '请告诉我如何删除缓存里的所有文件，不要执行。',
    'Explain how to push a git branch without doing it.',
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    assert.equal(route.taskDescriptor.operation, 'answer', prompt);
    assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'forbidden', prompt);
    assert.equal(route.taskDescriptor.constraints.externalWrite, 'forbidden', prompt);
    assert.notEqual(route.taskDescriptor.constraints.networkAccess, 'required', prompt);
    assert.ok(!route.taskDescriptor.capabilities.includes('external.write'), prompt);
    assert.ok(!route.taskDescriptor.risk.flags.includes('irreversible-file-operation'), prompt);
    assert.equal(route.routePlan.mode, 'advisory', prompt);
    assert.equal(route.routePlan.autoContinue, false, prompt);
    assert.ok(!route.routePlan.qualityChecks.includes('post-action-verification'), prompt);
    assert.equal('gateRequirements' in route.routePlan, false, prompt);
  }
});

test('local development and migration commands route as operational execution, not bug audit', () => {
  for (const [prompt, domain, workspaceWrite] of [
    ['Run npm start for the local dev server.', 'code', 'unspecified'],
    ['npm run dev', 'code', 'unspecified'],
    ['Start the local dev server with npm run dev.', 'code', 'unspecified'],
    ['运行 npm run dev。', 'code', 'unspecified'],
    ['Run the local database migration script.', 'config', 'required'],
    ['运行本地数据库迁移脚本。', 'config', 'required'],
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    assert.equal(route.taskDescriptor.operation, 'execute', prompt);
    assert.deepEqual(route.taskDescriptor.domains, [domain], prompt);
    assert.equal(route.taskDescriptor.complexity, 'focused', prompt);
    assert.equal(route.taskDescriptor.constraints.workspaceWrite, workspaceWrite, prompt);
    assert.equal(route.taskDescriptor.constraints.networkAccess, 'unspecified', prompt);
    assert.equal(route.taskDescriptor.constraints.externalWrite, 'forbidden', prompt);
    assert.ok(route.taskDescriptor.capabilities.includes('shell.execute'), prompt);
    assert.ok(route.routePlan.steps.some(({ kind, domain: phaseDomain }) => kind === 'execute' && phaseDomain === domain), prompt);
    assert.equal(route.intent, 'unknown', prompt);
    assert.equal(route.workflowRoute, 'agentic.simple', prompt);
    assert.ok(!route.routePlan.qualityChecks.includes('test-evidence'), prompt);
    assert.ok(!route.routePlan.qualityChecks.includes('post-action-verification'), prompt);
    assert.equal('gateRequirements' in route.routePlan, false, prompt);
  }
});

test('operational execution respects explicit negative constraints in the compiled route', () => {
  for (const prompt of [
    'Run npm start for the local dev server, but do not modify files, do not access the network, and do not publish anything.',
    '运行本地数据库迁移脚本，但不要修改任何文件，不要联网，也不要发布。',
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
    assert.equal(route.taskDescriptor.operation, 'execute', prompt);
    assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'forbidden', prompt);
    assert.equal(route.taskDescriptor.constraints.networkAccess, 'forbidden', prompt);
    assert.equal(route.taskDescriptor.constraints.externalWrite, 'forbidden', prompt);
    assert.ok(!route.taskDescriptor.capabilities.includes('fs.write'), prompt);
    assert.ok(!route.taskDescriptor.capabilities.includes('network.read'), prompt);
    assert.ok(!route.taskDescriptor.capabilities.includes('external.write'), prompt);
  }
});

test('observe mode does not retain legacy bug-audit resources for local operational execution', () => {
  for (const prompt of [
    'Run npm start for the local dev server.',
    'Start the local dev server with npm run dev.',
    '运行 npm run dev。',
    'Run the local database migration script.',
    '运行本地数据库迁移脚本。',
  ]) {
    const route = routeNaturalLanguageTask({ prompt });
    assert.equal(route.routerMode, 'observe', prompt);
    assert.equal(route.taskDescriptor.operation, 'execute', prompt);
    assert.equal(route.intent, 'unknown', prompt);
    assert.equal(route.workflowRoute, 'agentic.simple', prompt);
    assert.equal(route.routePlan.mode, 'advisory', prompt);
    assert.equal(route.routePlan.autoContinue, false, prompt);
    assert.deepEqual(route.routePlan.skills, [], prompt);
    assert.deepEqual(route.routePlan.tools, [], prompt);
    assert.deepEqual(route.routePlan.roles, [], prompt);
  }
});
