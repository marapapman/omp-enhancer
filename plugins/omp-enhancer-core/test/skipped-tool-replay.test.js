import test from 'node:test';
import assert from 'node:assert/strict';

import registerCoreEnhancer, { buildStagedWorkflowReminder } from '../index.js';

const ADVISORY_SKIP_TEXT = 'Skipped due to pending system advisory. Do not count this skipped result as completed work or verification. After the advisory is handled on the next step, retry the skipped tool if it is still needed.';
const USER_SKIP_TEXT = 'Skipped due to queued user message. Do not count this skipped result as completed work or verification. After the queued message is handled on the next step, retry the skipped tool if it is still needed.';

class FakePi {
  constructor(entries = []) {
    this.tools = new Map();
    this.eventHandlers = [];
    this.entries = entries;
    this.sentMessages = [];
    const z = fakeZod();
    this.z = z;
    this.zod = { z };
  }

  setLabel() {}

  registerTool(tool) {
    this.tools.set(tool.name, tool);
  }

  registerCommand() {}

  on(eventName, handler) {
    this.eventHandlers.push({ eventName, handler });
  }

  appendEntry(customType, data) {
    this.entries.push({ type: 'custom', customType, data });
  }

  sendMessage(message, options) {
    this.sentMessages.push({ message, options });
  }
}

function fakeZod() {
  const chainable = (base) => ({
    ...base,
    optional: () => chainable({ type: 'optional', schema: base }),
    describe: () => chainable(base),
  });
  return {
    object: (shape) => chainable({ type: 'object', shape }),
    string: () => chainable({ type: 'string' }),
    boolean: () => chainable({ type: 'boolean' }),
    array: (schema) => chainable({ type: 'array', schema }),
  };
}

function extensionContext(entries, cwd = process.cwd(), extra = {}) {
  return {
    cwd,
    sessionManager: {
      getBranch: () => entries,
      getEntries: () => entries,
    },
    ui: { notify: () => undefined },
    hasUI: false,
    ...extra,
  };
}

function event(pi, eventName) {
  const registered = pi.eventHandlers.find((entry) => entry.eventName === eventName);
  if (!registered) throw new Error(`Missing event handler: ${eventName}`);
  return registered.handler;
}

function registeredCore(entries = []) {
  const pi = new FakePi(entries);
  registerCoreEnhancer(pi);
  return { pi, entries, ctx: extensionContext(entries) };
}

function latestState(entries) {
  return entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
}

function skippedExecutionEnd(toolName, text = ADVISORY_SKIP_TEXT) {
  return {
    type: 'tool_execution_end',
    toolCallId: `call-${toolName}`,
    toolName,
    result: { content: [{ type: 'text', text }], details: {} },
    isError: true,
  };
}

test('a tool call skipped by a pending system advisory queues one follow-up replay reminder', async () => {
  const { pi, entries, ctx } = registeredCore();
  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'tool_execution_end')(skippedExecutionEnd('todo'), ctx);

  assert.equal(pi.sentMessages.length, 1);
  const { message, options } = pi.sentMessages[0];
  assert.equal(message.customType, 'omp-enhancer-skipped-tool-replay');
  assert.equal(message.display, false);
  assert.equal(options.deliverAs, 'followUp');
  assert.equal(options.triggerTurn, undefined, 'the reminder must not start its own turn');
  assert.match(message.content, /<system-reminder>/u);
  assert.match(message.content, /`todo`/u);
  assert.match(message.content, /system advisory was pending/u);
  assert.match(message.content, /todo update must not be silently dropped/u);
  assert.ok(Number.isFinite(latestState(entries).skippedToolReplaySentAt));
});

test('ordinary tool errors never produce a replay reminder', async () => {
  const { pi, entries, ctx } = registeredCore();
  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'tool_execution_end')({
    type: 'tool_execution_end',
    toolCallId: 'call-bash',
    toolName: 'bash',
    result: { content: [{ type: 'text', text: 'fatal: not a git repository' }], details: { exitCode: 128 } },
    isError: true,
  }, ctx);

  assert.equal(pi.sentMessages.length, 0);
  assert.equal(latestState(entries).skippedToolReplaySentAt, 0);
});

test('skips caused by queued user messages are not treated as system advisories', async () => {
  const { pi, entries, ctx } = registeredCore();
  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'tool_execution_end')(skippedExecutionEnd('todo', USER_SKIP_TEXT), ctx);

  assert.equal(pi.sentMessages.length, 0);
});

test('sibling skips of one interrupt episode are deduped into a single reminder', async () => {
  const { pi, entries, ctx } = registeredCore();
  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'tool_execution_end')(skippedExecutionEnd('todo'), ctx);
  await event(pi, 'tool_execution_end')(skippedExecutionEnd('edit'), ctx);
  await event(pi, 'tool_execution_end')(skippedExecutionEnd('bash'), ctx);

  assert.equal(pi.sentMessages.length, 1, 'one episode must produce exactly one reminder');
  assert.match(pi.sentMessages[0].message.content, /`todo`/u);
});

test('a fresh skip episode after the replay window queues another reminder', async () => {
  const { pi, entries, ctx } = registeredCore();
  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'tool_execution_end')(skippedExecutionEnd('todo'), ctx);
  assert.equal(pi.sentMessages.length, 1);

  // Simulate a later episode: restore a snapshot whose reminder timestamp is old.
  const stale = latestState(entries);
  entries.push({
    type: 'custom',
    customType: 'omp-enhancer-core.state',
    data: { ...stale, skippedToolReplaySentAt: Date.now() - 60_000 },
  });
  await event(pi, 'tool_execution_end')(skippedExecutionEnd('todo'), ctx);

  assert.equal(pi.sentMessages.length, 2);
});

test('the orchestration advisory teaches the skipped-tool replay protocol', () => {
  const reminder = buildStagedWorkflowReminder({
    hasWorkflowSkill: true,
    hasNativeTask: true,
    subagentsAllowed: true,
    taskDescriptor: {},
  });
  assert.ok(reminder);
  assert.match(reminder.content, /If a tool call is skipped with "Skipped due to pending system advisory", retry it after the advisory is delivered/u);
  assert.match(reminder.content, /keep todo and plan updates in sync/u);
});
