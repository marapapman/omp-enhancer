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
