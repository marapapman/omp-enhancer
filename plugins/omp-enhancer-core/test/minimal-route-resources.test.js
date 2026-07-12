import test from 'node:test';
import assert from 'node:assert/strict';

import { routeNaturalLanguageTask } from '../src/router.js';

function assertAdvisory(route, label = '') {
  assert.equal(route.routePlan.mode, 'advisory', label);
  assert.equal(route.routePlan.autoContinue, false, label);
  assert.equal(route.advisoryOnly, true, label);
  assert.equal(route.autoContinue, false, label);
}

test('offline local fact checks keep one main skill for one to three named facts', () => {
  const factLists = [
    'Claude Mythos Preview',
    'Claude Mythos Preview 和 CyberGym 83.1%',
    'Claude Mythos Preview、CyberGym 83.1% 和钓鱼盈利约50倍',
  ];

  for (const facts of factLists) {
    const prompt = `核查 sections/5.7.md 中 ${facts} 是否有本地引文支持。只使用工作区现有正文和引用，不联网；证据不足时直接报告 LOCAL_UNVERIFIED，不修改文件。`;
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });

    assert.equal(route.intent, 'fact-check', prompt);
    assert.equal(route.taskDescriptor.constraints.networkAccess, 'forbidden', prompt);
    assert.deepEqual(route.routePlan.skills, ['fact-checking'], prompt);
    assert.deepEqual(route.routePlan.tools, [], prompt);
    assert.deepEqual(route.routePlan.roles, [], prompt);
    assertAdvisory(route, prompt);
  }
});

test('pure implementation and test planning starts with one minimal planning skill', () => {
  for (const prompt of [
    '为修复 agent-fleet 路由问题制定实现和测试计划，不修改文件，不运行测试。',
    '为 agent-fleet 的路由逻辑设计测试策略，不运行测试也不修改文件。',
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });

    assert.equal(route.intent, 'planning', prompt);
    assert.deepEqual(route.routePlan.skills, ['writing-plans'], prompt);
    for (const implementationSkill of [
      'brainstorming',
      'test-driven-development',
      'subagent-driven-development',
      'verification-before-completion',
      'ai-regression-testing',
    ]) {
      assert.equal(route.routePlan.skills.includes(implementationSkill), false, `${prompt}: ${implementationSkill}`);
    }
    assertAdvisory(route, prompt);
  }
});

test('focused diagnosis and read-only bug inspection recommend diagnose', () => {
  for (const prompt of [
    '为什么插件加载失败？先诊断原因，不要改代码。',
    '只读检查 src/router.js 是否存在 bug，不修改文件、不运行测试。',
  ]) {
    const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });

    assert.ok(['diagnosis', 'bug-audit'].includes(route.intent), prompt);
    assert.deepEqual(route.routePlan.skills, ['diagnose'], prompt);
    assertAdvisory(route, prompt);
  }
});

test('an explicit read-only diagnosis of one named routing test stays diagnosis', () => {
  const prompt = '诊断 extensions/agent-fleet/strict-agent-model-routing.test.mjs 所覆盖的路由约束可能在哪里失配。遵循 AGENTS.md，先读取 exact debugging skill，只读检查并给出文件与行级证据，不修改文件、不运行测试，最多 8 次读取或搜索。';
  for (const routerMode of ['observe', 'enforce']) {
    const route = routeNaturalLanguageTask({ prompt, routerMode });

    assert.equal(route.intent, 'diagnosis', routerMode);
    assert.equal(route.workflowRoute, 'code.debug', routerMode);
    assert.equal(route.taskDescriptor.operation, 'diagnose', routerMode);
    assert.deepEqual(route.routePlan.skills, ['diagnose'], routerMode);
    assert.deepEqual(route.routePlan.roles, [], routerMode);
    assertAdvisory(route, `${routerMode}: ${prompt}`);
  }
});

test('pure writing document modification does not inherit coding completion skills', () => {
  const route = routeNaturalLanguageTask({
    prompt: '请润色 docs/guide.md。',
    sourceText: 'This guide explains the advisory routing workflow and its limitations.',
    routerMode: 'enforce',
  });

  assert.equal(route.intent, 'writing.en');
  assert.deepEqual(route.routePlan.skills, ['writing-markdown-helper']);
  assert.equal(route.routePlan.skills.includes('verification-before-completion'), false);
  assertAdvisory(route);
});
