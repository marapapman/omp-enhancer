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

test('e2e implementation route adds advisory role and skill context', async () => {
  const { pi, ctx } = registeredCore();
  const prompt = 'Agentically update runtime routing across all affected core files, add complete regression tests, and run the tests.';

  await event(pi, 'session_start')({}, ctx);
  const routed = await event(pi, 'before_agent_start')({ prompt }, ctx);

  assert.equal(routed.route.intent, 'implementation-with-tests');
  assert.deepEqual(
    routed.route.routePlan.roles.map(({ agent }) => agent),
    ['plan', 'implementation-task', 'reviewer'],
  );
  assert.match(routed.additionalContext, /This guidance is advisory/);
  assert.match(routed.additionalContext, /### Optional roles/);

  const taskEvent = {
    toolName: 'task',
    callId: 'implementation-batch',
    input: {
      tasks: [
        { role: 'plan', assignment: 'Decompose the routing change.' },
        { role: 'implementation-task', assignment: 'Patch the runtime and tests.' },
        { role: 'reviewer', assignment: 'Review the resulting diff.' },
      ],
    },
  };

  assert.equal(await event(pi, 'tool_call')(taskEvent, ctx), undefined);
  for (const item of taskEvent.input.tasks) {
    assert.match(item.assignment, new RegExp('OMP_WORKFLOW_ROLE:\\s*' + escapeRegExp(item.role)));
    assert.match(item.assignment, /Parent task context: Agentically update runtime routing/);
    assert.match(item.assignment, /Suggested skills for this role:/);
    assert.match(item.assignment, /This is advisory workflow context/);
  }

  await event(pi, 'tool_result')(
    {
      name: 'task',
      callId: 'implementation-batch',
      input: taskEvent.input,
      result: {
        content: [{ type: 'text', text: 'All suggested checkpoints completed.' }],
        details: {
          results: taskEvent.input.tasks.map((item) => ({
            role: item.role,
            status: 'completed',
          })),
        },
      },
    },
    ctx,
  );

  const status = await tool(pi, 'omp_core_subagent_status').execute(
    'status-after-implementation-e2e',
    {},
    undefined,
    undefined,
    ctx,
  );
  assert.match(status.content[0].text, /Observed completed roles:\n- plan/);
  assert.match(status.content[0].text, /implementation-task/);
  assert.match(status.content[0].text, /reviewer/);

  assert.equal(
    await event(pi, 'session_stop')({ output: 'Implemented and verified.' }, ctx),
    undefined,
  );
});

test('e2e broad bug audit suggests roles without completion enforcement', async () => {
  const { pi, ctx } = registeredCore();
  const prompt = '帮我测试整个插件工作流并检查 bug，只报告问题，不要修复。';

  await event(pi, 'session_start')({}, ctx);
  const routed = await event(pi, 'before_agent_start')({ prompt }, ctx);

  assert.equal(routed.route.intent, 'bug-audit');
  assert.deepEqual(
    routed.route.routePlan.roles.map(({ agent }) => agent),
    [
      'ecc-tdd-guide',
      'ecc-code-reviewer',
      'ecc-silent-failure-hunter',
      'ecc-pr-test-analyzer',
    ],
  );

  const taskEvent = {
    toolName: 'task',
    input: {
      tasks: routed.route.routePlan.roles.map(({ agent }) => ({
        role: agent,
        assignment: 'Run ' + agent + ' for the audit.',
      })),
    },
  };

  assert.equal(await event(pi, 'tool_call')(taskEvent, ctx), undefined);
  for (const item of taskEvent.input.tasks) {
    assert.match(item.assignment, new RegExp('OMP_WORKFLOW_ROLE:\\s*' + escapeRegExp(item.role)));
    assert.match(item.assignment, /Parent task context: 帮我测试整个插件工作流并检查 bug/);
  }

  assert.equal(
    await event(pi, 'session_stop')({ output: 'Best-effort audit findings.' }, ctx),
    undefined,
  );
  const snapshot = pi.entries.findLast(
    (entry) => entry.customType === 'omp-enhancer-core.state',
  ).data;
  assert.equal(Object.hasOwn(snapshot, 'gateController'), false);
  assert.equal(Object.hasOwn(snapshot, 'evidence'), false);
});

test('e2e diagnosis and unknown prompts finish without plugin continuation', async () => {
  const prompts = [
    '解释为什么 task 工具需要角色上下文，不要改代码。',
    'What is a unit test?',
  ];

  for (const prompt of prompts) {
    const { pi, ctx } = registeredCore();
    await event(pi, 'session_start')({}, ctx);
    await event(pi, 'before_agent_start')({ prompt }, ctx);
    assert.equal(await event(pi, 'session_stop')({ output: 'Done.' }, ctx), undefined);
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
  if (!found) throw new Error('Missing tool ' + name);
  return found;
}

function event(pi, name) {
  const found = pi.eventHandlers.find((handler) => handler.event === name);
  if (!found) throw new Error('Missing event ' + name);
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^{}()|[\]\\]/g, '\\$&');
}

function fakeZod() {
  const withOptional = (schema) => ({
    ...schema,
    optional: () => ({ type: 'optional', schema }),
  });
  return {
    object: (shape) => withOptional({ type: 'object', shape }),
    string: () => withOptional({ type: 'string' }),
    boolean: () => withOptional({ type: 'boolean' }),
    array: (schema) => withOptional({ type: 'array', schema }),
  };
}
