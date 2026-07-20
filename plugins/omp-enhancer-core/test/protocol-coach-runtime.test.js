import test from 'node:test';
import assert from 'node:assert/strict';

import registerCoreEnhancer from '../index.js';

const INDEX_URI = 'skill://omp-enhancer-workflows';
const INDEX_BODY = '---\nname: omp-enhancer-workflows\ndescription: Workflow index.\n---\n';

test('exact DeepSeek Main receives an immutable retry-safe hidden context cue', async () => {
  const { pi, entries, ctx } = runtime({ model: deepseek() });
  await handler(pi, 'before_agent_start')({ prompt: 'Review and revise article.md.' }, ctx);
  assert.equal(await handler(pi, 'context')({ messages: [] }, ctx), undefined, 'generic Skill inventory is not supplied-index evidence');
  await handler(pi, 'tool_result')(indexResult(), ctx);

  const event = { messages: [{ role: 'user', content: 'Review and revise article.md.', timestamp: 1 }] };
  const original = structuredClone(event);
  const entriesBeforeContext = entries.length;
  const first = await handler(pi, 'context')(event, ctx);
  const retry = await handler(pi, 'context')(event, ctx);

  assert.deepEqual(event, original);
  assert.equal(first.messages.length, 2);
  assert.deepEqual(retry.messages, first.messages);
  assert.notEqual(first.messages, event.messages);
  assert.deepEqual(first.messages[0], event.messages[0]);
  assert.deepEqual(first.messages[1], {
    role: 'custom',
    customType: 'omp-enhancer-protocol-coach',
    content: first.messages[1].content,
    display: false,
    details: {
      advisory: true,
      phase: 'PRE_PLAN',
      source: 'omp-enhancer-core',
    },
    attribution: 'user',
    timestamp: first.messages[1].timestamp,
  });
  assert.match(first.messages[1].content, /selects no workflow, Skill, Agent, or fork/u);
  assert.equal(typeof first.messages[1].timestamp, 'number');
  assert.equal(entries.length, entriesBeforeContext, 'read-only cue injection does not append persistence entries');

  await handler(pi, 'message_end')({
    message: { role: 'assistant', content: 'Provider response completed.', timestamp: 2 },
  }, ctx);
  assert.equal(await handler(pi, 'context')(event, ctx), undefined);
  assert.ok(entries.some((entry) => entry.customType === 'omp-enhancer-core.state'));
});

test('an exact native supplied workflow skill queues PRE_PLAN without a read result', async () => {
  const { pi, ctx } = runtime({ model: deepseek() });
  const supplied = {
    role: 'custom',
    customType: 'skill-prompt',
    content: INDEX_BODY,
    display: false,
    details: { name: 'omp-enhancer-workflows' },
    attribution: 'user',
    timestamp: 1,
  };
  await handler(pi, 'before_agent_start')({
    prompt: 'Review and revise article.md.',
    messages: [supplied],
  }, ctx);
  const cue = await handler(pi, 'context')({ messages: [supplied] }, ctx);
  assert.equal(cue.messages.at(-1).details.phase, 'PRE_PLAN');
});

test('coach survives session serialization and restoration before provider retry', async () => {
  const first = runtime({ model: deepseek() });
  await handler(first.pi, 'before_agent_start')({ prompt: 'Research and revise notes.md.' }, first.ctx);
  await handler(first.pi, 'tool_result')(indexResult(), first.ctx);
  const contextEvent = { messages: [{ role: 'user', content: 'Research and revise notes.md.', timestamp: 1 }] };
  await handler(first.pi, 'context')(contextEvent, first.ctx);

  const secondPi = new FakePi(first.entries);
  registerCoreEnhancer(secondPi);
  const secondCtx = extensionContext(first.entries, { model: deepseek() });
  await handler(secondPi, 'session_start')({}, secondCtx);
  await handler(secondPi, 'before_agent_start')({ prompt: '继续' }, secondCtx);
  const restored = await handler(secondPi, 'context')(contextEvent, secondCtx);
  assert.equal(restored.messages.at(-1).details.phase, 'PRE_PLAN');
});

test('runtime wiring advances only through observed PLAN loads READY and TODO', async () => {
  const { pi, ctx } = runtime({ model: deepseek() });
  await handler(pi, 'before_agent_start')({ prompt: 'Review and revise article.md.' }, ctx);
  await handler(pi, 'tool_result')(indexResult(), ctx);
  assert.equal((await handler(pi, 'context')({ messages: [] }, ctx)).messages.at(-1).details.phase, 'PRE_PLAN');

  await handler(pi, 'message_end')({
    message: { role: 'assistant', content: validPlan(), timestamp: 2 },
  }, ctx);
  await handler(pi, 'tool_result')(readResult('skill://writing-review'), ctx);
  assert.equal(await handler(pi, 'context')({ messages: [] }, ctx), undefined);
  await handler(pi, 'tool_result')(readResult('skill://omp-enhancer-workflows/references/writing-en.md'), ctx);
  assert.equal((await handler(pi, 'context')({ messages: [] }, ctx)).messages.at(-1).details.phase, 'PRE_READY');

  await handler(pi, 'message_end')({
    message: {
      role: 'assistant',
      content: 'WORKFLOW READY | primary=writing.en | add-ons=none | skills-loaded=writing-review | skills-unavailable=none',
      timestamp: 3,
    },
  }, ctx);
  await handler(pi, 'tool_result')({
    toolName: 'todo',
    result: { content: [{ type: 'text', text: 'TODO initialized.' }] },
  }, ctx);
  const dispatch = await handler(pi, 'context')({ messages: [] }, ctx);
  assert.equal(dispatch.messages.at(-1).details.phase, 'PRE_DISPATCH');
  assert.match(dispatch.messages.at(-1).content, /committed `tasks\[\]` batch form[\s\S]*nonempty top-level `context`/u);
  assert.match(
    dispatch.messages.at(-1).content,
    /\[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>\]/u,
  );
  assert.match(dispatch.messages.at(-1).content, /artifact-reference-only[\s\S]*resolved\/completed/u);
});

test('message observation inspects visible assistant text only', async () => {
  const { pi, entries, ctx } = runtime({ model: deepseek() });
  await handler(pi, 'before_agent_start')({ prompt: 'Review and revise article.md.' }, ctx);
  await handler(pi, 'tool_result')(indexResult(), ctx);
  await handler(pi, 'message_end')({
    message: {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: validPlan() },
        { type: 'toolCall', name: 'read', arguments: { hidden: `WORKFLOW READY | primary=writing.en` } },
      ],
      timestamp: 2,
    },
  }, ctx);

  const snapshot = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.equal(snapshot.protocolCoach.declaration, null);
  assert.equal(snapshot.protocolCoach.pendingCue, null);
});

test('coach is exact-model and current top-level user-turn gated', async () => {
  for (const model of [
    { provider: 'openai-codex', id: 'gpt-5.6-luna' },
    { provider: 'opencode-go', id: 'deepseek-v4-flash-pro' },
    { provider: 'xiaomi', id: 'mimo-v2.5' },
  ]) {
    assert.equal(await cueFor({ model }), undefined, `${model.provider}/${model.id}`);
  }
  assert.equal((await cueFor({ model: mimo() })).messages.at(-1).details.phase, 'PRE_PLAN');

  const subagentEntries = [{ type: 'session_init', task: 'bounded child task' }];
  assert.equal(await cueFor({ model: deepseek(), entries: subagentEntries }), undefined);

  const advisorEntry = {
    type: 'custom_message',
    customType: 'advisor',
    content: 'Review the plan.',
    display: false,
    attribution: 'user',
  };
  assert.equal(await cueFor({ model: deepseek(), entries: [advisorEntry], prompt: 'Review the plan.' }), undefined);

  const slash = runtime({ model: deepseek() });
  await handler(slash.pi, 'before_agent_start')({ prompt: 'First task.' }, slash.ctx);
  await handler(slash.pi, 'tool_result')(indexResult(), slash.ctx);
  await handler(slash.pi, 'before_agent_start')({ prompt: '/help' }, slash.ctx);
  assert.equal(await handler(slash.pi, 'context')({ messages: [] }, slash.ctx), undefined);

  const autolearn = runtime({ model: deepseek() });
  await handler(autolearn.pi, 'before_agent_start')({ prompt: 'First task.' }, autolearn.ctx);
  await handler(autolearn.pi, 'tool_result')(indexResult(), autolearn.ctx);
  await handler(autolearn.pi, 'before_agent_start')({
    prompt: 'Capture reusable context.',
    customType: 'autolearn-nudge',
    display: false,
    attribution: 'user',
  }, autolearn.ctx);
  assert.equal(await handler(autolearn.pi, 'context')({ messages: [] }, autolearn.ctx), undefined);
});

test('model and coach disable switches suppress coaching independently per exact model', async () => {
  const cases = [
    ['OMP_ENHANCER_DISABLE_PROTOCOL_COACH', deepseek()],
    ['OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT', deepseek()],
    ['OMP_ENHANCER_DISABLE_MIMO_COMPAT', mimo()],
  ];
  for (const [name, model] of cases) {
    const previous = process.env[name];
    process.env[name] = '1';
    try {
      assert.equal(await cueFor({ model }), undefined, name);
    } finally {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    }
  }
});

test('hooks remain advisory and never mutate task calls, tool results, or lifecycle control', async () => {
  const { pi, ctx } = runtime({ model: deepseek() });
  assert.equal(typeof pi.sendMessage, 'undefined');
  await handler(pi, 'before_agent_start')({ prompt: 'Implement a tested parser fix.' }, ctx);

  const taskCall = {
    toolName: 'task',
    callId: 'task-1',
    input: { context: 'bounded context', tasks: [{ agent: 'task', task: 'bounded assignment' }] },
  };
  const taskResult = {
    toolName: 'task',
    callId: 'task-1',
    result: { content: [{ type: 'text', text: 'complete delivery' }] },
  };
  const originalCall = structuredClone(taskCall);
  const originalResult = structuredClone(taskResult);
  assert.equal(await handler(pi, 'tool_call')(taskCall, ctx), undefined);
  assert.equal(await handler(pi, 'tool_result')(taskResult, ctx), undefined);
  assert.deepEqual(taskCall, originalCall);
  assert.deepEqual(taskResult, originalResult);
  assert.equal(await handler(pi, 'session_stop')({ output: 'done' }, ctx), undefined);
});

async function cueFor({ model, entries = [], prompt = 'Review and revise article.md.' }) {
  const runtimeValue = runtime({ model, entries });
  await handler(runtimeValue.pi, 'before_agent_start')({ prompt }, runtimeValue.ctx);
  await handler(runtimeValue.pi, 'tool_result')(indexResult(), runtimeValue.ctx);
  return handler(runtimeValue.pi, 'context')({ messages: [] }, runtimeValue.ctx);
}

function runtime({ model, entries = [] }) {
  const pi = new FakePi(entries);
  pi.getActiveTools = () => ['read', 'todo', 'task'];
  pi.pi = {
    getActiveSkills: () => [{ name: 'omp-enhancer-workflows', description: 'Workflow index.' }],
  };
  registerCoreEnhancer(pi);
  return { pi, entries, ctx: extensionContext(entries, { model }) };
}

function indexResult() {
  return {
    toolName: 'read',
    input: { path: INDEX_URI },
    result: { content: [{ type: 'text', text: INDEX_BODY }] },
  };
}

function readResult(path) {
  return {
    toolName: 'read',
    input: { path },
    result: { content: [{ type: 'text', text: 'Loaded declared resource.' }] },
  };
}

function validPlan() {
  return [
    'WORKFLOW PLAN',
    'Primary: writing.en',
    'Add-ons: none',
    'Skills: skill://writing-review',
    'Load order: NOW=[skill://writing-review] THEN=[skill://omp-enhancer-workflows/references/writing-en.md]',
    'Actions:',
    '1. LOAD: Load resources.',
    '2. COMMIT: Commit TODO.',
    '3. SPLIT + EXECUTE: Execute.',
    '4. VERIFY: Verify.',
  ].join('\n');
}

function deepseek() {
  return { provider: 'opencode-go', id: 'deepseek-v4-flash' };
}

function mimo() {
  return { provider: 'opencode-go', id: 'mimo-v2.5' };
}

class FakePi {
  constructor(entries = []) {
    this.entries = entries;
    this.eventHandlers = [];
    this.tools = new Map();
    const z = fakeZod();
    this.z = z;
    this.zod = { z };
  }

  setLabel() {}

  registerCommand() {}

  registerTool(tool) {
    this.tools.set(tool.name, tool);
  }

  on(eventName, callback) {
    this.eventHandlers.push({ event: eventName, callback });
  }

  appendEntry(customType, data) {
    this.entries.push({ type: 'custom', customType, data });
  }
}

function handler(pi, eventName) {
  const found = pi.eventHandlers.find((item) => item.event === eventName);
  if (!found) throw new Error(`Missing event ${eventName}`);
  return found.callback;
}

function extensionContext(entries, extra = {}) {
  return {
    cwd: process.cwd(),
    sessionManager: {
      getBranch: () => entries,
      getEntries: () => entries,
    },
    ui: { notify: () => undefined },
    hasUI: false,
    ...extra,
  };
}

function fakeZod() {
  const schema = {
    optional: () => schema,
  };
  return {
    string: () => schema,
    boolean: () => schema,
    array: () => schema,
    object: () => schema,
  };
}
