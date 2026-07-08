import test from 'node:test';
import assert from 'node:assert/strict';

import registerCoreEnhancer from '../index.js';

class FakePi {
  constructor(entries = []) {
    this.labels = [];
    this.tools = new Map();
    this.commands = new Map();
    this.eventHandlers = [];
    this.entries = entries;
    const z = fakeZod();
    this.z = z;
    this.zod = { z };
  }

  setLabel(label) {
    this.labels.push(label);
  }

  registerTool(tool) {
    this.tools.set(tool.name, tool);
  }

  registerCommand(name, command) {
    this.commands.set(name, command);
  }

  on(event, handler) {
    this.eventHandlers.push({ event, handler });
  }

  appendEntry(customType, data) {
    this.entries.push({ type: 'custom', customType, data });
  }
}

test('e2e implementation route auto-attaches task contracts and releases after testing evidence', async () => {
  const { pi, ctx } = registeredCore();
  const prompt = 'Fix the plugin gate bug and add regression tests.';

  await event(pi, 'session_start')({}, ctx);
  const routed = await event(pi, 'before_agent_start')({ prompt }, ctx);

  assert.equal(routed.route.intent, 'implementation-with-tests');
  assert.deepEqual(routed.route.requiredSubagents.map(({ agent }) => agent), ['plan', 'implementation-task', 'reviewer']);
  assert.match(routed.additionalContext, /Required task assignment contracts/);

  const taskEvent = {
    toolName: 'task',
    callId: 'implementation-batch',
    input: {
      tasks: [
        { role: 'plan', assignment: 'Decompose the gate fix.' },
        { role: 'implementation-task', assignment: 'Patch the runtime and tests.' },
        { role: 'reviewer', assignment: 'Review the resulting diff.' },
      ],
    },
  };

  const taskGate = await event(pi, 'tool_call')(taskEvent, ctx);
  assert.equal(taskGate, undefined);
  for (const item of taskEvent.input.tasks) {
    assert.match(item.assignment, new RegExp(`OMP_REQUIRED_SUBAGENT:\\s*${escapeRegExp(item.role)}`));
    assert.match(item.assignment, /OMP_PARENT_TASK:\s*Fix the plugin gate bug/);
    assert.match(item.assignment, /Required skills for this subagent:/);
  }

  await event(pi, 'tool_result')(
    {
      name: 'task',
      callId: 'implementation-batch',
      input: taskEvent.input,
      result: {
        content: [{ type: 'text', text: subagentResultText(['plan', 'implementation-task', 'reviewer']) }],
        details: {
          results: taskEvent.input.tasks.map((item) => ({ role: item.role, status: 'completed', requests: 1, tokens: 120 })),
        },
      },
    },
    ctx,
  );
  await event(pi, 'tool_result')({ name: 'omp_test_gate', details: { passed: true } }, ctx);

  const status = await tool(pi, 'omp_core_subagent_status').execute(
    'status-after-implementation-e2e',
    {},
    undefined,
    undefined,
    ctx,
  );
  assert.match(status.content[0].text, /Completed:\n- plan/);
  assert.match(status.content[0].text, /implementation-task/);
  assert.match(status.content[0].text, /reviewer/);

  const stopped = await event(pi, 'session_stop')(
    {
      output: usageEvidence({
        subagents: {
          plan: ['brainstorming', 'subagent-driven-development'],
          'implementation-task': ['test-driven-development', 'verification-before-completion'],
          reviewer: ['verification-before-completion'],
        },
        skills: ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
      }),
    },
    ctx,
  );
  assert.equal(stopped, undefined);
});

test('e2e broad bug audit task call gets parent context repair without post-completion testing gate', async () => {
  const { pi, ctx } = registeredCore();
  const prompt = '帮我测试整个插件工作流并检查 bug，只报告问题，不要修复。';

  await event(pi, 'session_start')({}, ctx);
  const routed = await event(pi, 'before_agent_start')({ prompt }, ctx);

  assert.equal(routed.route.intent, 'bug-audit');
  assert.deepEqual(routed.route.requiredSubagents.map(({ agent }) => agent), [
    'ecc-tdd-guide',
    'ecc-code-reviewer',
    'ecc-silent-failure-hunter',
    'ecc-pr-test-analyzer',
  ]);

  const taskEvent = {
    toolName: 'task',
    input: {
      tasks: routed.route.requiredSubagents.map(({ agent }) => ({
        role: agent,
        assignment: `Run ${agent} for the audit.`,
      })),
    },
  };

  const taskGate = await event(pi, 'tool_call')(taskEvent, ctx);
  assert.equal(taskGate, undefined);
  for (const item of taskEvent.input.tasks) {
    assert.match(item.assignment, new RegExp(`OMP_REQUIRED_SUBAGENT:\\s*${escapeRegExp(item.role)}`));
    assert.match(item.assignment, /OMP_PARENT_TASK:\s*帮我测试整个插件工作流并检查 bug/);
  }

  await event(pi, 'tool_result')(
    {
      name: 'task',
      input: taskEvent.input,
      result: {
        content: [{ type: 'text', text: subagentResultText(taskEvent.input.tasks.map(({ role }) => role)) }],
        details: { results: taskEvent.input.tasks.map(({ role }) => ({ role, status: 'completed' })) },
      },
    },
    ctx,
  );

  const releasedWithoutPostGate = await event(pi, 'session_stop')(
    {
      output: usageEvidence({
        subagents: {
          'ecc-tdd-guide': ['test-driven-development', 'search-first', 'ai-regression-testing'],
          'ecc-code-reviewer': ['verification-before-completion'],
          'ecc-silent-failure-hunter': ['diagnose'],
          'ecc-pr-test-analyzer': ['verification-before-completion'],
        },
        skills: ['diagnose', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion', 'search-first', 'ai-regression-testing'],
      }),
    },
    ctx,
  );

  assert.equal(releasedWithoutPostGate, undefined);

  await event(pi, 'tool_result')({ name: 'omp_test_gate', details: { passed: true } }, ctx);
  const released = await event(pi, 'session_stop')(
    {
      output: usageEvidence({
        subagents: {
          'ecc-tdd-guide': ['test-driven-development', 'search-first', 'ai-regression-testing'],
          'ecc-code-reviewer': ['verification-before-completion'],
          'ecc-silent-failure-hunter': ['diagnose'],
          'ecc-pr-test-analyzer': ['verification-before-completion'],
        },
        skills: ['diagnose', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion', 'search-first', 'ai-regression-testing'],
      }),
    },
    ctx,
  );
  assert.equal(released, undefined);
});

test('e2e diagnosis and unknown prompts do not leave workflow gates open', async () => {
  const prompts = [
    '解释为什么 task tool_call 需要 OMP_REQUIRED_SUBAGENT，不要改代码。',
    'What is a unit test?',
  ];

  for (const prompt of prompts) {
    const { pi, ctx } = registeredCore();
    await event(pi, 'session_start')({}, ctx);
    await event(pi, 'before_agent_start')({ prompt }, ctx);

    const stopped = await event(pi, 'session_stop')({ output: 'Done.' }, ctx);
    assert.equal(stopped, undefined, prompt);
  }
});

function registeredCore() {
  const entries = [];
  const pi = new FakePi(entries);
  registerCoreEnhancer(pi);
  return { pi, ctx: extensionContext(entries) };
}

function tool(pi, name) {
  const found = pi.tools.get(name);
  if (!found) throw new Error(`Missing tool ${name}`);
  return found;
}

function event(pi, name) {
  const found = pi.eventHandlers.find((handler) => handler.event === name);
  if (!found) throw new Error(`Missing event ${name}`);
  return found.handler;
}

function extensionContext(entries = []) {
  return {
    cwd: process.cwd(),
    sessionManager: { getBranch: () => entries },
    ui: { notify: () => undefined },
    hasUI: false,
  };
}

function subagentResultText(agents) {
  return agents.map((agent) => [
    'SUBAGENT_RESULT',
    `Agent: ${agent}`,
    'Status: complete',
    'Evidence:',
    '- e2e task completed',
  ].join('\n')).join('\n\n');
}

function usageEvidence({ subagents = {}, skills = [] } = {}) {
  return [
    'Done.',
    '',
    'SUBAGENT_USAGE:',
    ...Object.entries(subagents).map(([agent, agentSkills]) => `- ${agent}: ${agentSkills.join(', ') || 'none'}`),
    '',
    'SKILL_USAGE',
    'Required:',
    ...skills.map((skill) => `- ${skill}`),
    'Loaded:',
    ...skills.map((skill) => `- ${skill}`),
  ].join('\n');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
