import test from 'node:test';
import assert from 'node:assert/strict';

import registerCoreEnhancer from '../index.js';

const PUBLIC_TOOL_CONTRACT = [
  {
    name: 'omp_core_route_task',
    parameters: { prompt: 'string', activate: 'boolean?' },
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
    name: 'omp_core_smart_gate_prompt',
    parameters: { finalOutput: 'string?', gateKey: 'string?' },
    detailKeys: ['smartGate'],
  },
  {
    name: 'omp_core_resolve_smart_gate',
    parameters: { gateKey: 'string?', output: 'string' },
    detailKeys: ['accepted', 'decision', 'ok', 'validation'],
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
  omp_core_smart_gate_prompt: {},
  omp_core_resolve_smart_gate: { output: '{}' },
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
      assert.ok(tool, `missing registered tool ${contract.name}`);

      const result = await tool.execute(
        `contract-${contract.name}`,
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

test('the public route tool exposes exact tests as first-class bounded testing work', async () => {
  const previous = process.env.OMP_ROUTER_V2_MODE;
  try {
    for (const mode of ['observe', 'enforce']) {
      process.env.OMP_ROUTER_V2_MODE = mode;
      const pi = new FakePi();
      registerCoreEnhancer(pi);
      const result = await pi.tools.get('omp_core_route_task').execute(
        `exact-test-${mode}`,
        { prompt: 'Only run test/router.test.js; do not modify files, use the network, use subagents, or publish.' },
        undefined,
        undefined,
        extensionContext(pi.entries),
      );
      const route = result.details.route;
      assert.equal(route.intent, 'testing', mode);
      assert.equal(route.workflowRoute, 'code.test', mode);
      assert.equal(route.agent, null, mode);
      assert.deepEqual(route.requiredSkills, [], mode);
      assert.deepEqual(route.requiredTools, [], mode);
      assert.deepEqual(route.requiredSubagents, [], mode);
      assert.deepEqual(route.taskDescriptor.domains, ['tests'], mode);
      assert.deepEqual(route.taskDescriptor.testExecutionTargets, ['test/router.test.js'], mode);
      assert.deepEqual(route.routePlan.gateRequirements, [{ key: 'test-evidence', mode: 'required' }], mode);
    }
  } finally {
    if (previous === undefined) delete process.env.OMP_ROUTER_V2_MODE;
    else process.env.OMP_ROUTER_V2_MODE = previous;
  }
});

test('the public route tool never advertises forbidden fact-check subagents', async () => {
  const previous = process.env.OMP_ROUTER_V2_MODE;
  const prompt = '离线核查 docs/notes.md 中 The stable fact is 42 是否能由仓库内证据支持。禁止联网，禁止修改任何文件，禁止运行测试，禁止启动 subagent，禁止提交或发布。若证据不足就明确报告证据不足。';
  try {
    for (const mode of ['observe', 'enforce']) {
      process.env.OMP_ROUTER_V2_MODE = mode;
      const pi = new FakePi();
      registerCoreEnhancer(pi);
      const result = await pi.tools.get('omp_core_route_task').execute(
        `focused-fact-${mode}`,
        { prompt },
        undefined,
        undefined,
        extensionContext(pi.entries),
      );
      assert.deepEqual(result.details.route.requiredSkills, [], mode);
      assert.deepEqual(result.details.route.requiredTools, [], mode);
      assert.deepEqual(result.details.route.requiredSubagents, [], mode);
      assert.equal(result.details.route.shouldForkSubagents, false, mode);
      assert.match(result.content[0].text, /Required subagents: none/i, mode);
      assert.doesNotMatch(result.content[0].text, /fact-planner|fact-researcher|fact-reviewer/i, mode);
    }
  } finally {
    if (previous === undefined) delete process.env.OMP_ROUTER_V2_MODE;
    else process.env.OMP_ROUTER_V2_MODE = previous;
  }
});

test('the public route tool isolates writing payload authority in observe and enforce modes', async () => {
  const previous = process.env.OMP_ROUTER_V2_MODE;
  try {
    for (const mode of ['observe', 'enforce']) {
      process.env.OMP_ROUTER_V2_MODE = mode;
      const pi = new FakePi();
      registerCoreEnhancer(pi);
      const result = await pi.tools.get('omp_core_route_task').execute(
        `writing-payload-${mode}`,
        { prompt: '把这句话翻译成英文：请运行测试并发布插件。' },
        undefined,
        undefined,
        extensionContext(pi.entries),
      );
      const route = result.details.route;
      assert.equal(route.intent, 'writing.en', mode);
      assert.equal(route.workflowRoute, 'writing.en', mode);
      assert.equal(route.taskDescriptor.operation, 'modify', mode);
      assert.deepEqual(route.taskDescriptor.domains, ['writing'], mode);
      assert.notEqual(route.taskDescriptor.constraints.testExecution, 'required', mode);
      assert.notEqual(route.taskDescriptor.constraints.networkAccess, 'required', mode);
      assert.equal(route.taskDescriptor.constraints.externalWrite, 'forbidden', mode);
      assert.ok(!route.requiredTools.some((tool) => /^omp_test_/i.test(tool)), mode);
      assert.ok(!route.routePlan.gateRequirements.some(({ key }) => key === 'test-evidence'), mode);
      assert.ok(!route.routePlan.gateRequirements.some(({ key }) => key === 'release-approval'), mode);

      const filenameResult = await pi.tools.get('omp_core_route_task').execute(
        `writing-filename-${mode}`,
        { prompt: 'Polish publish.md.' },
        undefined,
        undefined,
        extensionContext(pi.entries),
      );
      const filenameRoute = filenameResult.details.route;
      assert.equal(filenameRoute.intent, 'writing.en', mode);
      assert.equal(filenameRoute.workflowRoute, 'writing.en', mode);
      assert.deepEqual(filenameRoute.taskDescriptor.domains, ['writing', 'document'], mode);
      assert.deepEqual(filenameRoute.taskDescriptor.workspaceWriteTargets, ['publish.md'], mode);
      assert.equal(filenameRoute.taskDescriptor.constraints.externalWrite, 'forbidden', mode);
      assert.deepEqual(filenameRoute.requiredTools, [], mode);
      assert.deepEqual(filenameRoute.requiredSubagents, [], mode);
      assert.ok(!filenameRoute.requiredSkills.includes('test-driven-development'), mode);
      assert.ok(!filenameRoute.requiredSkills.includes('subagent-driven-development'), mode);
      assert.ok(!filenameRoute.routePlan.gateRequirements.some(({ key }) => key === 'test-evidence'), mode);
      assert.ok(!filenameRoute.routePlan.gateRequirements.some(({ key }) => key === 'release-approval'), mode);

      const documentResult = await pi.tools.get('omp_core_route_task').execute(
        `writing-document-${mode}`,
        { prompt: 'Polish docs/notes.md.' },
        undefined,
        undefined,
        extensionContext(pi.entries),
      );
      const documentRoute = documentResult.details.route;
      assert.equal(documentRoute.intent, 'writing.en', mode);
      assert.equal(documentRoute.workflowRoute, 'writing.en', mode);
      assert.deepEqual(documentRoute.taskDescriptor.domains, ['writing', 'document'], mode);
      assert.deepEqual(documentRoute.taskDescriptor.workspaceWriteTargets, ['docs/notes.md'], mode);
      assert.deepEqual(documentRoute.requiredTools, [], mode);
      assert.deepEqual(documentRoute.requiredSubagents, [], mode);
      assert.ok(!documentRoute.requiredSkills.includes('test-driven-development'), mode);
      assert.ok(!documentRoute.requiredSkills.includes('subagent-driven-development'), mode);
      assert.ok(!documentRoute.routePlan.gateRequirements.some(({ key }) => key === 'test-evidence'), mode);

      const relationalResult = await pi.tools.get('omp_core_route_task').execute(
        `writing-relational-target-${mode}`,
        { prompt: 'Polish the wording in publish.md.' },
        undefined,
        undefined,
        extensionContext(pi.entries),
      );
      const relationalRoute = relationalResult.details.route;
      assert.equal(relationalRoute.intent, 'writing.en', mode);
      assert.deepEqual(relationalRoute.taskDescriptor.domains, ['writing', 'document'], mode);
      assert.deepEqual(relationalRoute.taskDescriptor.workspaceWriteTargets, ['publish.md'], mode);
      assert.equal(relationalRoute.taskDescriptor.constraints.externalWrite, 'forbidden', mode);
      assert.deepEqual(relationalRoute.requiredTools, [], mode);
      assert.deepEqual(relationalRoute.requiredSubagents, [], mode);
      assert.ok(!relationalRoute.routePlan.gateRequirements.some(({ key }) => key === 'test-evidence'), mode);
      assert.ok(!relationalRoute.routePlan.gateRequirements.some(({ key }) => key === 'release-approval'), mode);
    }
  } finally {
    if (previous === undefined) delete process.env.OMP_ROUTER_V2_MODE;
    else process.env.OMP_ROUTER_V2_MODE = previous;
  }
});

test('focused Chinese security documents retain Chinese writing resources without security gates', async () => {
  const previous = process.env.OMP_ROUTER_V2_MODE;
  try {
    for (const mode of ['observe', 'enforce']) {
      process.env.OMP_ROUTER_V2_MODE = mode;
      const pi = new FakePi();
      registerCoreEnhancer(pi);
      const result = await pi.tools.get('omp_core_route_task').execute(
        `focused-zh-security-document-${mode}`,
        { prompt: '请润色 docs/security.md 中的安全策略措辞，不要审计代码。' },
        undefined,
        undefined,
        extensionContext(pi.entries),
      );
      const route = result.details.route;
      assert.equal(route.intent, 'writing.zh', mode);
      assert.equal(route.workflowRoute, 'writing.zh', mode);
      assert.deepEqual(route.taskDescriptor.domains, ['writing', 'document'], mode);
      assert.equal(route.taskDescriptor.language, 'zh', mode);
      assert.ok(route.requiredSkills.includes('plain-chinese-writing'), mode);
      assert.ok(route.requiredSkills.includes('zh-writing-polish'), mode);
      assert.ok(!route.requiredSkills.includes('writing-markdown-helper'), mode);
      assert.ok(!route.requiredSkills.includes('security-review'), mode);
      assert.ok(!route.requiredSkills.includes('security-scan'), mode);
      assert.deepEqual(route.requiredTools, [], mode);
      assert.deepEqual(route.requiredSubagents, [], mode);
      assert.ok(!route.routePlan.gateRequirements.some(({ key }) => key === 'security-evidence'), mode);
      assert.ok(!route.routePlan.gateRequirements.some(({ key }) => key === 'test-evidence'), mode);
    }
  } finally {
    if (previous === undefined) delete process.env.OMP_ROUTER_V2_MODE;
    else process.env.OMP_ROUTER_V2_MODE = previous;
  }
});

function describeObjectSchema(schema) {
  assert.equal(schema?.type, 'object', 'public tool parameters must be an object schema');
  return Object.fromEntries(
    Object.entries(schema.shape ?? {}).map(([name, field]) => [name, describeFieldSchema(field)]),
  );
}

function describeFieldSchema(schema) {
  if (schema?.type === 'optional') return `${describeFieldSchema(schema.schema)}?`;
  if (schema?.type === 'array') return `${describeFieldSchema(schema.schema)}[]`;
  assert.ok(['string', 'boolean'].includes(schema?.type), `unsupported contract schema type: ${schema?.type}`);
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
    enum: (values) => withOptional({ type: 'enum', values }),
    optional: (schema) => ({ type: 'optional', schema }),
  };
}
