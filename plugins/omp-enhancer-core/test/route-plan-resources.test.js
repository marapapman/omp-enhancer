import test from 'node:test';
import assert from 'node:assert/strict';

import { routeByIntent, routeNaturalLanguageTask } from '../src/router.js';

function enforcedRoute(prompt) {
  return routeNaturalLanguageTask({
    prompt,
    routerMode: 'enforce',
    gateRecoveryMode: 'enforce',
  });
}

function subagents(route) {
  return (route.routePlan?.requiredSubagents ?? []).map((entry) => (
    typeof entry === 'string' ? { agent: entry, requiredSkills: [] } : entry
  ));
}

test('enforce keeps the full audit fleet for broad code and test audits', () => {
  const route = enforcedRoute('帮我全面测试整个项目并检查 bug，输出已验证的问题清单。');
  const planned = subagents(route);

  assert.equal(route.taskDescriptor.complexity, 'broad');
  assert.deepEqual(planned.map(({ agent }) => agent), [
    'ecc-tdd-guide',
    'ecc-code-reviewer',
    'ecc-silent-failure-hunter',
    'ecc-pr-test-analyzer',
  ]);
  assert.ok(planned.every(({ requiredSkills }) => requiredSkills.length > 0));
  assert.deepEqual(route.routePlan.requiredSkills, [
    'diagnose',
    'test-driven-development',
    'subagent-driven-development',
    'verification-before-completion',
    'search-first',
    'ai-regression-testing',
  ]);
  assert.deepEqual(route.routePlan.requiredTools, [
    'omp_test_analyze',
    'omp_test_context',
    'omp_test_browser_check',
    'omp_test_coverage_analyze',
    'omp_test_mutation_context',
    'omp_test_gate',
    'omp_test_report',
  ]);
  assert.ok(route.routePlan.gateRequirements.some(({ key, mode }) => key === 'test-evidence' && mode === 'required'));
});

test('enforce treats explicit multi-file refactors as broad and preserves implementation contracts', () => {
  const route = enforcedRoute('请大规模重构这个插件的 subagent fork 逻辑，修改多个文件并补完整测试。');
  const planned = subagents(route);

  assert.equal(route.taskDescriptor.complexity, 'broad');
  assert.deepEqual(planned.map(({ agent }) => agent), ['plan', 'implementation-task', 'reviewer']);
  assert.ok(planned.every(({ requiredSkills }) => requiredSkills.length > 0));
});

test('enforce security remediation assigns explicit skills to every planned subagent', () => {
  const route = enforcedRoute('修复认证漏洞，补测试并发布。');
  const planned = subagents(route);

  assert.deepEqual(planned.map(({ agent }) => agent), ['ecc-security-reviewer', 'implementation-task', 'reviewer']);
  assert.deepEqual(planned.find(({ agent }) => agent === 'ecc-security-reviewer')?.requiredSkills, [
    'security-review',
    'security-scan',
  ]);
  assert.ok(planned.find(({ agent }) => agent === 'implementation-task')?.requiredSkills.includes('test-driven-development'));
  assert.ok(planned.find(({ agent }) => agent === 'reviewer')?.requiredSkills.includes('security-review'));
});

test('enforce pure security review keeps the security reviewer actor contract', () => {
  const route = enforcedRoute('Audit this authentication module for vulnerabilities.');
  const planned = subagents(route);

  assert.equal(route.intent, 'security-review');
  assert.deepEqual(planned.map(({ agent }) => agent), ['ecc-security-reviewer', 'reviewer']);
  assert.ok(planned.find(({ agent }) => agent === 'ecc-security-reviewer')?.requiredSkills.includes('security-scan'));
  assert.ok(route.routePlan.gateRequirements.some(({ key, mode }) => key === 'security-evidence' && mode === 'required'));
});

test('compound fact and writing routes retain skill-bearing writer and fact-check contracts', () => {
  const route = enforcedRoute('请事实核查并润色这份中文研究报告。');
  const planned = subagents(route);

  assert.deepEqual(planned.map(({ agent }) => agent), [
    'fact-planner',
    'fact-researcher-a',
    'fact-researcher-b',
    'fact-cross-checker',
    'fact-reviewer',
    'zh-writer',
    'zh-checker',
  ]);
  assert.ok(planned.every(({ requiredSkills }) => requiredSkills.length > 0));
});

test('explicit no-subagent authorization dominates broad fact-check routing', () => {
  const route = enforcedRoute('事实核查这份文档，但不要使用子代理，只由主代理完成。');

  assert.equal(route.taskDescriptor.constraints.subagents, 'forbidden');
  assert.ok(!route.taskDescriptor.capabilities.includes('subagents'));
  assert.deepEqual(route.routePlan.requiredSubagents, []);
});

test('no-subagent ceilings preserve direct config and visual resources', () => {
  const config = enforcedRoute('Inspect OMP config assets, templates, and hooks, but do not use subagents.');
  assert.equal(config.intent, 'config-assets');
  assert.deepEqual(config.requiredTools, ['omp_config_doctor', 'omp_config_assets', 'omp_config_plan']);
  assert.deepEqual(config.routePlan.requiredTools, config.requiredTools);
  assert.deepEqual(config.requiredSubagents, []);
  assert.equal(config.shouldForkSubagents, false);

  const visual = enforcedRoute('Create a polished poster design with a modern visual system and exportable layout; do not use subagents.');
  assert.equal(visual.intent, 'design.visual');
  assert.ok(visual.requiredSkills.length > 0);
  assert.deepEqual(visual.routePlan.requiredSkills, visual.requiredSkills);
  assert.deepEqual(visual.requiredSubagents, []);
  assert.equal(visual.shouldForkSubagents, false);
});

test('strict direct ceilings preserve specialized document skills', () => {
  for (const [prompt, workflowRoute, skill] of [
    ['根据这些要点生成一个 Word docx 报告，带标题和目录；不要运行测试，不要使用 subagent。', 'doc.convert.word', 'docx'],
    ['把 paper.md 转成 LaTeX，保留公式、引用和图表占位；不要运行测试，不要使用 subagent。', 'writing.latex', 'format-markdown2latex'],
    ['把这些要点整理成 Markdown 文档，保留标题层级和代码块；不要运行测试，不要使用 subagent。', 'writing.markdown', 'writing-markdown-helper'],
  ]) {
    const route = enforcedRoute(prompt);
    assert.equal(route.workflowRoute, workflowRoute, prompt);
    assert.ok(route.requiredSkills.includes(skill), prompt);
    assert.ok(route.routePlan.requiredSkills.includes(skill), prompt);
    assert.deepEqual(route.requiredSubagents, [], prompt);
    assert.equal(route.shouldForkSubagents, false, prompt);
  }
});

test('enforce uses descriptor policy for ordinary modify-and-test requests', () => {
  for (const prompt of [
    '修复 parser 中的小 bug 并运行测试。',
    'Fix the parser bug and run tests.',
  ]) {
    const route = enforcedRoute(prompt);
    assert.equal(route.taskDescriptor.operation, 'modify', prompt);
    assert.equal(route.intent, 'implementation-with-tests', prompt);
    assert.equal(route.workflowRoute, 'code.dev', prompt);
    assert.deepEqual(route.requiredSkills, route.routePlan.requiredSkills, prompt);
    assert.deepEqual(route.requiredTools, route.routePlan.requiredTools, prompt);
    assert.deepEqual(route.requiredSubagents, route.routePlan.requiredSubagents, prompt);
    assert.equal(route.shouldForkSubagents, route.routePlan.requiredSubagents.length > 0, prompt);
    assert.ok(route.routePlan.gateRequirements.some(({ key, mode }) => key === 'test-evidence' && mode === 'required'), prompt);
  }
});

test('full-suite exclusions keep modification routing and expose the effective direct plan', () => {
  for (const prompt of [
    'Fix src/router.js, but do not run the full test suite.',
    '只改一行代码，但不要跑全量测试。',
  ]) {
    const route = enforcedRoute(prompt);
    assert.equal(route.intent, 'implementation-with-tests', prompt);
    assert.equal(route.workflowRoute, 'code.dev', prompt);
    assert.deepEqual(route.taskDescriptor.testExclusions, ['full-suite'], prompt);
    assert.deepEqual(route.requiredSkills, route.routePlan.requiredSkills, prompt);
    assert.deepEqual(route.requiredTools, route.routePlan.requiredTools, prompt);
    assert.deepEqual(route.requiredSubagents, route.routePlan.requiredSubagents, prompt);
  }
});

test('bilingual whole-codebase bug audits retain their explicit test ceiling in RoutePlan', () => {
  for (const prompt of [
    '检查项目代码所有 bug。',
    'Audit the whole codebase for bugs.',
  ]) {
    const route = enforcedRoute(prompt);
    assert.equal(route.taskDescriptor.operation, 'inspect', prompt);
    assert.deepEqual(route.taskDescriptor.domains, ['code'], prompt);
    assert.equal(route.taskDescriptor.constraints.testExecution, 'required', prompt);
    assert.ok(route.routePlan.phases.some(({ kind, domain }) => kind === 'verify' && domain === 'tests'), prompt);
    assert.ok(route.routePlan.requiredTools.includes('omp_test_gate'), prompt);
    assert.ok(route.routePlan.gateRequirements.some(({ key, mode }) => key === 'test-evidence' && mode === 'required'), prompt);
  }

  for (const prompt of [
    '检查项目代码所有 bug，但不要运行测试。',
    'Audit the whole codebase for bugs, but do not run tests.',
  ]) {
    const route = enforcedRoute(prompt);
    assert.equal(route.taskDescriptor.constraints.testExecution, 'forbidden', prompt);
    assert.ok(!route.routePlan.phases.some(({ kind, domain }) => kind === 'verify' && domain === 'tests'), prompt);
    assert.ok(!route.routePlan.requiredTools.some((tool) => tool.startsWith('omp_test_')), prompt);
    assert.ok(!route.routePlan.requiredSkills.includes('test-driven-development'), prompt);
    assert.ok(!route.routePlan.gateRequirements.some(({ key }) => key === 'test-evidence'), prompt);
  }
});

test('RoutePlan cannot restore test or subagent authority removed by the descriptor', () => {
  const route = routeByIntent('bug-audit', {
    source: 'untrusted-descriptor-test',
    taskDescriptor: {
      operation: 'inspect',
      domains: ['code'],
      complexity: 'broad',
      constraints: {
        workspaceWrite: 'forbidden',
        testExecution: 'forbidden',
        networkAccess: 'forbidden',
        externalWrite: 'forbidden',
        subagents: 'forbidden',
      },
      capabilities: ['tests.execute', 'subagents', 'external.write'],
      phases: [
        { kind: 'inspect', domain: 'code' },
        { kind: 'verify', domain: 'tests' },
        { kind: 'release', domain: 'plugin' },
        { kind: 'review', domain: 'code' },
      ],
    },
  });

  assert.deepEqual(route.taskDescriptor.capabilities, []);
  assert.deepEqual(route.routePlan.phases, [
    { kind: 'inspect', domain: 'code' },
    { kind: 'review', domain: 'code' },
  ]);
  assert.deepEqual(route.routePlan.requiredTools, []);
  assert.deepEqual(route.routePlan.requiredSubagents, []);
  assert.ok(!route.routePlan.requiredSkills.includes('test-driven-development'));
  assert.ok(!route.routePlan.requiredSkills.includes('subagent-driven-development'));
  assert.ok(!route.routePlan.gateRequirements.some(({ key }) => key === 'test-evidence' || key === 'release-approval'));
});

test('broad writing quality routes require both writing QA tools', () => {
  for (const prompt of [
    '检查并润色这篇中文论文的逻辑和表达。',
    'Review and polish the logic and wording of this paper.',
  ]) {
    const route = enforcedRoute(prompt);
    assert.equal(route.taskDescriptor.complexity, 'broad', prompt);
    assert.ok(route.routePlan.gateRequirements.some(({ key, mode }) => key === 'writing-quality' && mode === 'required'), prompt);
    assert.ok(route.routePlan.requiredTools.includes('writing_logic_check'), prompt);
    assert.ok(route.routePlan.requiredTools.includes('writing_quality_check'), prompt);
  }
});
