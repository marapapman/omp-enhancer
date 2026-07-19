import test from 'node:test';
import assert from 'node:assert/strict';

import registerCoreEnhancer from '../index.js';

const PUBLIC_TOOL_CONTRACT = [
  {
    name: 'omp_core_validate_skill_usage',
    approval: 'read',
    defaultInactive: true,
    parameters: { output: 'string', skills: 'string[]?' },
    detailKeys: ['validation'],
  },
  {
    name: 'omp_core_validate_subagent_usage',
    approval: 'read',
    defaultInactive: true,
    parameters: { output: 'string', agents: 'string[]?' },
    detailKeys: ['validation'],
  },
  {
    name: 'omp_core_observation_status',
    approval: 'read',
    defaultInactive: true,
    parameters: {},
    detailKeys: ['status'],
  },
  {
    name: 'omp_core_install_skills',
    approval: 'write',
    defaultInactive: true,
    parameters: { dryRun: 'boolean?' },
    detailKeys: ['errors', 'installed', 'legacyFindings', 'recommendedIgnoredSkills', 'skipped', 'warnings'],
  },
];

const SAFE_TOOL_INPUTS = {
  omp_core_validate_skill_usage: { output: '', skills: [] },
  omp_core_validate_subagent_usage: { agents: [], output: '' },
  omp_core_observation_status: {},
  omp_core_install_skills: { dryRun: true },
};

test('freezes the reduced public Core tool surface', () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const actual = [...pi.tools.values()].map((tool) => ({
    name: tool.name,
    approval: tool.approval,
    defaultInactive: tool.defaultInactive,
    parameters: describeObjectSchema(tool.parameters),
    detailKeys: PUBLIC_TOOL_CONTRACT.find((entry) => entry.name === tool.name)?.detailKeys,
  }));
  assert.deepEqual(actual, PUBLIC_TOOL_CONTRACT);
  for (const removed of [
    'omp_core_route_task',
    'omp_core_classifier_prompt',
    'omp_core_resolve_classification',
    'omp_core_governance_prompt',
    'omp_core_subagent_status',
  ]) assert.equal(pi.tools.has(removed), false, removed);
});

test('all public Core tools preserve the structured result envelope', async (t) => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext(pi.entries);

  for (const contract of PUBLIC_TOOL_CONTRACT) {
    await t.test(contract.name, async () => {
      const result = await pi.tools.get(contract.name).execute(
        'contract-' + contract.name,
        SAFE_TOOL_INPUTS[contract.name],
        undefined,
        undefined,
        ctx,
      );
      assert.deepEqual(Object.keys(result).sort(), ['content', 'details', 'isError']);
      assert.equal(result.isError, false);
      assert.ok(result.content.every((item) => item?.type === 'text' && typeof item.text === 'string'));
      assert.deepEqual(Object.keys(result.details).sort(), contract.detailKeys);
    });
  }
});

test('enhancer tools stay inactive until the user explicitly enables a group', async () => {
  const pi = new FakePi();
  pi.allTools = [
    'read',
    ...PUBLIC_TOOL_CONTRACT.map(({ name }) => name),
    'omp_config_doctor',
    'writing_logic_check',
    'fact_check_analyze',
    'omp_test_analyze',
  ];
  pi.activeTools = ['read'];
  registerCoreEnhancer(pi);

  const command = pi.commands.get('enhancer-tools');
  const ctx = { ui: { notify: () => undefined } };
  await command.handler('enable core', ctx);
  assert.equal(pi.activeTools.includes('omp_core_observation_status'), true);
  assert.equal(pi.activeTools.includes('omp_config_doctor'), false);

  await command.handler('disable core', ctx);
  assert.deepEqual(pi.activeTools, ['read']);

  await command.handler('enable all', ctx);
  for (const name of pi.allTools.filter((name) => name !== 'read')) {
    assert.equal(pi.activeTools.includes(name), true, name);
  }
});

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
    this.commands = new Map();
    this.allTools = [];
    this.activeTools = [];
    const z = fakeZod();
    this.z = z;
    this.zod = { z };
  }

  setLabel() {}

  registerTool(tool) {
    this.tools.set(tool.name, tool);
  }

  registerCommand(name, command) {
    this.commands.set(name, command);
  }

  getAllTools() {
    return this.allTools.length ? [...this.allTools] : [...this.tools.keys()];
  }

  getActiveTools() {
    return [...this.activeTools];
  }

  async setActiveTools(names) {
    this.activeTools = [...names];
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
