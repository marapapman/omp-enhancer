import test from 'node:test';
import assert from 'node:assert/strict';

import registerCoreEnhancer from '../index.js';

const PUBLIC_TOOL_CONTRACT = [
  {
    name: 'omp_core_route_task',
    parameters: { prompt: 'string', sourceText: 'string?' },
    detailKeys: ['activated', 'probe_only', 'route', 'state_changed'],
  },
  {
    name: 'omp_core_classifier_prompt',
    parameters: { prompt: 'string' },
    detailKeys: ['classifier'],
  },
  {
    name: 'omp_core_resolve_classification',
    parameters: { prompt: 'string', output: 'string' },
    detailKeys: ['activated', 'classification', 'fallbackRoute', 'ok', 'probe_only', 'route', 'validation'],
  },
  {
    name: 'omp_core_validate_skill_usage',
    parameters: { output: 'string', requiredSkills: 'string[]?' },
    detailKeys: ['validation'],
  },
  {
    name: 'omp_core_validate_subagent_usage',
    parameters: { output: 'string', requiredSubagents: 'string[]?' },
    detailKeys: ['validation'],
  },
  {
    name: 'omp_core_subagent_status',
    parameters: {},
    detailKeys: ['status'],
  },
  {
    name: 'omp_core_governance_prompt',
    parameters: { prompt: 'string?' },
    detailKeys: ['fragment', 'route'],
  },
  {
    name: 'omp_core_install_skills',
    parameters: { dryRun: 'boolean?' },
    detailKeys: ['errors', 'installed', 'skipped', 'warnings'],
  },
];

const SAFE_TOOL_INPUTS = {
  omp_core_route_task: { prompt: 'Explain XSS.' },
  omp_core_classifier_prompt: { prompt: 'Explain XSS.' },
  omp_core_resolve_classification: { prompt: 'Explain XSS.', output: '{}' },
  omp_core_validate_skill_usage: { output: '', requiredSkills: [] },
  omp_core_validate_subagent_usage: { output: '', requiredSubagents: [] },
  omp_core_subagent_status: {},
  omp_core_governance_prompt: { prompt: 'Explain XSS.' },
  omp_core_install_skills: { dryRun: true },
};

test('freezes public omp_core tool names and parameter schemas', () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const actual = [...pi.tools.values()].map((tool) => ({
    name: tool.name,
    parameters: describeObjectSchema(tool.parameters),
    detailKeys: PUBLIC_TOOL_CONTRACT.find((entry) => entry.name === tool.name)?.detailKeys,
  }));
  assert.deepEqual(actual, PUBLIC_TOOL_CONTRACT);
});

test('all public omp_core tools preserve the structured result envelope', async (t) => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext(pi.entries);

  for (const contract of PUBLIC_TOOL_CONTRACT) {
    await t.test(contract.name, async () => {
      const tool = pi.tools.get(contract.name);
      assert.ok(tool, 'missing registered tool ' + contract.name);
      const result = await tool.execute(
        'contract-' + contract.name,
        SAFE_TOOL_INPUTS[contract.name],
        undefined,
        undefined,
        ctx,
      );
      assert.deepEqual(Object.keys(result).sort(), ['content', 'details', 'isError']);
      assert.equal(result.isError, false);
      assert.ok(Array.isArray(result.content) && result.content.length > 0);
      assert.equal(result.content.every((item) => item?.type === 'text' && typeof item.text === 'string'), true);
      assert.deepEqual(Object.keys(result.details).sort(), contract.detailKeys);
    });
  }
});

test('the public route tool exposes exact tests as advisory bounded work', async () => {
  const { pi, ctx } = registeredCore();
  const result = await pi.tools.get('omp_core_route_task').execute(
    'exact-test',
    { prompt: 'Only run test/router.test.js; do not modify files, use the network, use subagents, or publish.' },
    undefined,
    undefined,
    ctx,
  );
  const route = result.details.route;
  assert.equal(route.intent, 'testing');
  assert.equal(route.workflowRoute, 'code.test');
  assert.equal(route.agent, null);
  assert.deepEqual(route.routePlan.skills, []);
  assert.deepEqual(route.routePlan.tools, []);
  assert.deepEqual(route.routePlan.roles, []);
  assert.deepEqual(route.taskDescriptor.domains, ['tests']);
  assert.deepEqual(route.taskDescriptor.testExecutionTargets, ['test/router.test.js']);
  assert.equal(route.routePlan.mode, 'advisory');
  assert.equal(route.routePlan.autoContinue, false);
  assert.ok(route.routePlan.qualityChecks.includes('test-evidence'));
  assert.equal(Object.hasOwn(route.routePlan, 'gateRequirements'), false);
});

test('the public route tool renders descriptor scope, complexity, and steps', async () => {
  const { pi, ctx } = registeredCore();
  const result = await pi.tools.get('omp_core_route_task').execute(
    'descriptor-text-contract',
    { prompt: 'Polish README.md to say do not push. Separately, push the release.' },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(result.details.route.taskDescriptor.constraints.externalWrite, 'required');
  assert.equal(result.details.route.taskDescriptor.complexity, 'focused');
  assert.ok(result.details.route.taskDescriptor.phases.some(({ kind }) => kind === 'release'));
  assert.match(result.content[0].text, /constraints\.externalWrite:\s*required/i);
  assert.match(result.content[0].text, /complexity:\s*focused/i);
  assert.match(result.content[0].text, /phases:.*release:plugin/i);
});

test('a no-subagent preference removes role suggestions', async () => {
  const { pi, ctx } = registeredCore();
  const prompt = '离线核查 docs/notes.md 中 The stable fact is 42 是否能由仓库内证据支持。禁止联网，禁止修改任何文件，禁止运行测试，禁止启动 subagent，禁止提交或发布。若证据不足就明确报告证据不足。';
  const result = await pi.tools.get('omp_core_route_task').execute(
    'focused-fact',
    { prompt },
    undefined,
    undefined,
    ctx,
  );
  assert.deepEqual(result.details.route.routePlan.roles, []);
  assert.match(result.content[0].text, /Workflow roles: none/i);
  assert.doesNotMatch(result.content[0].text, /fact-planner|fact-researcher|fact-reviewer/i);
});

test('writing payload actions stay data and path-only language remains pending', async () => {
  const { pi, ctx } = registeredCore();
  const translated = await pi.tools.get('omp_core_route_task').execute(
    'writing-payload',
    { prompt: '把这句话翻译成英文：请运行测试并发布插件。' },
    undefined,
    undefined,
    ctx,
  );
  const translatedRoute = translated.details.route;
  assert.equal(translatedRoute.intent, 'writing.en');
  assert.equal(translatedRoute.taskDescriptor.operation, 'modify');
  assert.deepEqual(translatedRoute.taskDescriptor.domains, ['writing']);
  assert.notEqual(translatedRoute.taskDescriptor.constraints.testExecution, 'required');
  assert.notEqual(translatedRoute.taskDescriptor.constraints.networkAccess, 'required');
  assert.equal(translatedRoute.taskDescriptor.constraints.externalWrite, 'forbidden');
  assert.equal(Object.hasOwn(translatedRoute.routePlan, 'gateRequirements'), false);

  const pending = await pi.tools.get('omp_core_route_task').execute(
    'writing-filename',
    { prompt: 'Polish publish.md.' },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(pending.details.route.intent, 'writing.pending');
  assert.equal(pending.details.route.taskDescriptor.language, 'unknown');
  assert.deepEqual(pending.details.route.taskDescriptor.workspaceWriteTargets, ['publish.md']);
  assert.ok(pending.details.route.routePlan.qualityChecks.includes('detect-source-language'));
});

test('source text, not instruction language, chooses Chinese or English skills', async () => {
  const { pi, ctx } = registeredCore();
  const chinese = await pi.tools.get('omp_core_route_task').execute(
    'writing-source-zh',
    {
      prompt: 'Please polish publish.md.',
      sourceText: '本文说明了插件的发布流程，并给出了清晰的使用建议。',
    },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(chinese.details.route.intent, 'writing.zh');
  assert.ok(chinese.details.route.routePlan.skills.includes('plain-chinese-writing'));
  assert.ok(!chinese.details.route.routePlan.skills.includes('writing-markdown-helper'));

  const english = await pi.tools.get('omp_core_route_task').execute(
    'writing-source-en',
    {
      prompt: '请润色 publish.md。',
      sourceText: 'This document explains how to install and update the plugin safely.',
    },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(english.details.route.intent, 'writing.en');
  assert.ok(english.details.route.routePlan.skills.includes('writing-markdown-helper'));
  assert.ok(!english.details.route.routePlan.skills.includes('plain-chinese-writing'));
});

test('focused security prose follows body language without starting a security audit', async () => {
  const { pi, ctx } = registeredCore();
  const result = await pi.tools.get('omp_core_route_task').execute(
    'focused-security-prose',
    {
      prompt: 'Please polish the wording in docs/security.md without auditing code.',
      sourceText: '本策略说明用户数据的保存期限，以及访问权限的申请和撤销流程。',
    },
    undefined,
    undefined,
    ctx,
  );
  const route = result.details.route;
  assert.equal(route.intent, 'writing.zh');
  assert.deepEqual(route.taskDescriptor.domains, ['writing', 'document']);
  assert.equal(route.taskDescriptor.language, 'zh');
  assert.ok(route.routePlan.skills.includes('plain-chinese-writing'));
  assert.ok(route.routePlan.skills.includes('zh-writing-polish'));
  assert.ok(!route.routePlan.skills.includes('security-review'));
  assert.ok(!route.routePlan.skills.includes('security-scan'));
});

function registeredCore() {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  return { pi, ctx: extensionContext(pi.entries) };
}

function describeObjectSchema(schema) {
  assert.equal(schema?.type, 'object', 'public tool parameters must be an object schema');
  return Object.fromEntries(
    Object.entries(schema.shape ?? {}).map(([name, field]) => [name, describeFieldSchema(field)]),
  );
}

function describeFieldSchema(schema) {
  if (schema?.type === 'optional') return describeFieldSchema(schema.schema) + '?';
  if (schema?.type === 'array') return describeFieldSchema(schema.schema) + '[]';
  assert.ok(['string', 'boolean'].includes(schema?.type), 'unsupported contract schema type: ' + schema?.type);
  return schema.type;
}

class FakePi {
  constructor(entries = []) {
    this.entries = entries;
    this.tools = new Map();
    this.eventHandlers = [];
    const z = fakeZod();
    this.z = z;
    this.zod = { z };
  }

  setLabel() {}

  registerTool(tool) {
    this.tools.set(tool.name, tool);
  }

  on(event, handler) {
    this.eventHandlers.push({ event, handler });
  }

  appendEntry(customType, data) {
    this.entries.push({ type: 'custom', customType, data });
  }
}

function extensionContext(entries) {
  return {
    cwd: process.cwd(),
    sessionManager: { getBranch: () => entries },
    ui: { notify: () => undefined },
    hasUI: false,
  };
}

function fakeZod() {
  const withOptional = (schema) => ({ ...schema, optional: () => ({ type: 'optional', schema }) });
  return {
    object: (shape) => withOptional({ type: 'object', shape }),
    string: () => withOptional({ type: 'string' }),
    boolean: () => withOptional({ type: 'boolean' }),
    array: (schema) => withOptional({ type: 'array', schema }),
  };
}
