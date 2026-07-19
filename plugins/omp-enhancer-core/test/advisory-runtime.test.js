import test from 'node:test';
import assert from 'node:assert/strict';

import registerCoreEnhancer from '../index.js';

test('Core never blocks host tool calls', async (t) => {
  const cases = [
    {
      name: 'read-only task may still attempt an edit',
      prompt: 'Review src/parser.js and report defects only; do not modify files.',
      call: { toolName: 'edit', input: { path: 'src/parser.js' } },
    },
    {
      name: 'no-test task may still attempt a test',
      prompt: 'Fix the parser but do not run tests.',
      call: { toolName: 'bash', input: { command: 'npm test' } },
    },
    {
      name: 'release remains a host permission decision',
      prompt: 'Inspect whether this package is ready to publish, but do not publish it.',
      call: { toolName: 'bash', input: { command: 'npm publish' } },
    },
    {
      name: 'Agent preference remains a task fact',
      prompt: 'Fact check this document without subagents.',
      call: { toolName: 'task', input: { agent: 'fact-reviewer', task: 'Review evidence.' } },
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const { pi, ctx } = await coreRuntime(item.prompt);
      const result = await event(pi, 'tool_call')(item.call, ctx);
      assert.notEqual(result?.block, true);
    });
  }
});

test('session_stop never schedules a repair or continuation', async (t) => {
  for (const prompt of [
    'Write a substantial Chinese research report with citations.',
    'Implement the feature across the repository and add complete tests.',
    'Release version 9.9.9 to npm and push the release commit.',
    'Perform a broad security review of the authentication implementation.',
  ]) {
    await t.test(prompt, async () => {
      const { pi, ctx } = await coreRuntime(prompt);
      assert.equal(await event(pi, 'session_stop')({ output: 'Best-effort task result.' }, ctx), undefined);
    });
  }
});

test('tool results are observed without changing native events', async () => {
  const { pi, ctx } = await coreRuntime('Review the parser implementation.');
  const calls = [
    {
      name: 'read',
      input: { path: 'skill://writing-plans' },
      result: { content: [{ type: 'text', text: '---\nname: writing-plans\ndescription: Planning\n---\n' }] },
    },
    {
      name: 'read',
      input: { path: 'src/parser.js' },
      result: { content: [{ type: 'text', text: 'export const parser = true;' }] },
    },
  ];

  for (const call of calls) {
    const original = structuredClone(call);
    assert.equal(await event(pi, 'tool_result')(call, ctx), undefined);
    assert.deepEqual(call, original);
  }

  const snapshot = latestState(pi.entries);
  assert.deepEqual(snapshot.observedSkills, ['writing-plans']);
});

test('only a successful identity-verified SKILL.md read records observed evidence', async () => {
  const { pi, ctx } = await coreRuntime('Review this English paragraph.');
  const toolResult = event(pi, 'tool_result');

  await toolResult({
    name: 'read',
    input: { path: 'skill://writing-review' },
    result: { isError: true, content: [{ type: 'text', text: '---\nname: writing-review\n---\n' }] },
  }, ctx);
  await toolResult({
    name: 'read',
    input: { path: '/tmp/writing-review/SKILL.md' },
    result: { content: [{ type: 'text', text: '---\nname: writing-checkers\n---\n' }] },
  }, ctx);
  await toolResult({
    name: 'read',
    input: { path: 'skill://writing-review' },
    result: { content: [{ type: 'text', text: '---\nname: writing-review\ndescription: Review prose\n---\n' }] },
  }, ctx);
  await toolResult({
    name: 'read',
    input: { path: 'skill://ecc-skill-catalog/security-review/SKILL.md' },
    result: { content: [{ type: 'text', text: '---\nname: security-review\ndescription: Review security\n---\n' }] },
  }, ctx);

  const status = await pi.tools.get('omp_core_observation_status').execute(
    'status-after-reads',
    {},
    undefined,
    undefined,
    ctx,
  );
  assert.deepEqual(status.details.status.observed_skills.sort(), ['security-review', 'writing-review']);
});

test('session self-report remains a claim rather than successful read evidence', async () => {
  const { pi, ctx } = await coreRuntime('Review this English paragraph.');
  await event(pi, 'session_stop')({
    output: 'SKILL_USAGE\nLoaded:\n- writing-review',
  }, ctx);

  const status = await pi.tools.get('omp_core_observation_status').execute(
    'status-after-claim',
    {},
    undefined,
    undefined,
    ctx,
  );
  assert.deepEqual(status.details.status.observed_skills, []);
  assert.deepEqual(status.details.status.claimed_skills, ['writing-review']);

  const review = await pi.tools.get('omp_core_validate_skill_usage').execute(
    'review-after-claim',
    { output: '', skills: ['writing-review'] },
    undefined,
    undefined,
    ctx,
  );
  assert.deepEqual(review.details.validation.observed, []);
  assert.deepEqual(review.details.validation.unobservedClaims, ['writing-review']);
  assert.deepEqual(review.details.validation.gaps, ['writing-review']);
});

test('autolearn and Advisor turns do not change active user task evidence', async () => {
  const { pi, ctx } = await coreRuntime('Review src/parser.js and report defects only.');
  const before = latestState(pi.entries);
  const capturePrompt = [
    'Automated capture turn — not a user reply. The user has not yet responded to your previous turn.',
    'If your previous turn produced anything reusable, capture it now.',
    'Then stop. Do not run any other tools and do not resume prior work.',
  ].join('\n\n');
  pi.entries.push({
    type: 'custom_message',
    customType: 'autolearn-nudge',
    content: capturePrompt,
    display: false,
    attribution: 'user',
  });
  const entryCount = pi.entries.length;

  assert.equal(await event(pi, 'before_agent_start')({ prompt: capturePrompt }, ctx), undefined);
  assert.equal(await event(pi, 'tool_result')({
    name: 'read',
    input: { path: 'skill://writing-review' },
    result: { content: [{ type: 'text', text: '---\nname: writing-review\n---\n' }] },
  }, ctx), undefined);
  assert.equal(await event(pi, 'session_stop')({ output: 'SKILL_USAGE\nLoaded:\n- writing-review' }, ctx), undefined);
  assert.equal(pi.entries.length, entryCount);
  assert.deepEqual(latestState(pi.entries), before);
});

test('an implementation follow-up refreshes task facts while selection stays agent-owned', async () => {
  const { pi, ctx } = await coreRuntime('为 src/parser.js 制定修复计划，暂时不要修改文件。');
  const before = latestState(pi.entries);
  assert.equal(before.lastTaskContext.intent, 'agent-selected');
  assert.equal(before.lastTaskContext.taskDescriptor.constraints.workspaceWrite, 'forbidden');

  assert.equal(await event(pi, 'before_agent_start')({ prompt: '开始实现' }, ctx), undefined);
  const after = latestState(pi.entries);
  assert.equal(after.lastTaskContext.intent, 'agent-selected');
  assert.equal(after.lastTaskContext.taskDescriptor.operation, 'modify');
  assert.equal(after.lastTaskContext.taskDescriptor.constraints.workspaceWrite, 'required');
  assert.ok(after.lastTaskContext.taskDescriptor.phases.some((phase) => phase.kind === 'modify'));
});

test('Core has no generated-output loop controller or hard-gate state', async () => {
  const { pi, ctx } = await coreRuntime('Inspect the current implementation and report findings.');
  const eventNames = pi.eventHandlers.map((entry) => entry.eventName);
  assert.equal(eventNames.includes('assistant_delta'), false);
  assert.equal(eventNames.includes('assistant_output'), false);
  assert.equal(eventNames.includes('response_delta'), false);
  assert.equal(await event(pi, 'session_stop')({ output: 'Best-effort result.' }, ctx), undefined);

  const snapshot = latestState(pi.entries);
  for (const field of [
    'lastRoute',
    'lastRouteProbe',
    'classifierAttempted',
    'gateController',
    'loopGuard',
    'actionBoundary',
    'exclusiveToolState',
  ]) assert.equal(Object.hasOwn(snapshot, field), false, field);
});

test('before_agent_start records path facts without reading target content', async () => {
  const { pi } = await coreRuntime('请润色 abstract.tex。');
  const context = latestState(pi.entries).lastTaskContext;
  assert.equal(context.intent, 'agent-selected');
  assert.deepEqual(context.taskDescriptor.writingSourceTargets, ['abstract.tex']);
  assert.equal(context.taskDescriptor.language, 'unknown');
  assert.equal(context.taskDescriptor.writingLanguageSource, 'pending-source');
});

test('public usage reviews honor explicit Main selections without becoming gates', async () => {
  const { pi, ctx } = await coreRuntime('Implement the parser change and review the diff.');
  const skill = await pi.tools.get('omp_core_validate_skill_usage').execute(
    'skill-coverage',
    { output: '', skills: ['writing-review'] },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(skill.details.validation.advisory, true);
  assert.equal(skill.details.validation.complete, false);
  assert.deepEqual(skill.details.validation.suggested, ['writing-review']);
  assert.doesNotMatch(skill.content[0].text, /blocked/i);

  const agents = await pi.tools.get('omp_core_validate_subagent_usage').execute(
    'agent-coverage',
    { output: '', agents: ['reviewer'] },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(agents.details.validation.advisory, true);
  assert.equal(agents.details.validation.complete, false);
  assert.deepEqual(agents.details.validation.suggested, ['reviewer']);
  assert.deepEqual(agents.details.validation.gaps.roles, ['reviewer']);
  assert.doesNotMatch(agents.content[0].text, /blocked/i);
});

async function coreRuntime(prompt, cwd = process.cwd()) {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext(pi.entries, cwd);
  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')({ prompt }, ctx);
  return { pi, ctx };
}

function latestState(entries) {
  return entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
}

function event(pi, eventName) {
  const registered = pi.eventHandlers.find((entry) => entry.eventName === eventName);
  if (!registered) throw new Error(`Missing event handler: ${eventName}`);
  return registered.handler;
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

  registerCommand() {}

  on(eventName, handler) {
    this.eventHandlers.push({ eventName, handler });
  }

  appendEntry(customType, data) {
    this.entries.push({ type: 'custom', customType, data });
  }
}

function extensionContext(entries, cwd = process.cwd()) {
  return {
    cwd,
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
