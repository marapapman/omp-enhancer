import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import registerCoreEnhancer from '../index.js';

class FakePi {
  constructor(entries = []) {
    this.entries = entries;
    this.tools = new Map();
    this.eventHandlers = [];
    this.events = {};
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

test('advisory runtime never blocks host tool calls for any routed constraint', async (t) => {
  const cases = [
    {
      name: 'read-only route may still attempt an edit',
      prompt: 'Review src/router.js and report defects only; do not modify files.',
      call: { toolName: 'edit', input: { path: 'src/router.js' } },
    },
    {
      name: 'no-test route may still attempt a test',
      prompt: 'Fix the parser but do not run tests.',
      call: { toolName: 'bash', input: { command: 'npm test' } },
    },
    {
      name: 'unapproved release route is not plugin-blocked',
      prompt: 'Inspect whether this package is ready to publish, but do not publish it.',
      call: { toolName: 'bash', input: { command: 'npm publish' } },
    },
    {
      name: 'irreversible command remains a host permission decision',
      prompt: 'Inspect the generated cache and explain what can be removed.',
      call: { toolName: 'bash', input: { command: 'rm -rf .cache' } },
    },
    {
      name: 'subagent constraints remain workflow advice',
      prompt: 'Fact check this document without subagents.',
      call: { toolName: 'task', input: { role: 'fact-reviewer', assignment: 'Review evidence.' } },
    },
  ];

  for (const item of cases) {
    await t.test(item.name, async () => {
      const { pi, ctx } = await routedRuntime(item.prompt);
      const result = await event(pi, 'tool_call')(item.call, ctx);
      assert.notEqual(result?.block, true);
    });
  }
});

test('session_stop never schedules a repair or terminal continuation', async (t) => {
  const prompts = [
    'Write a substantial Chinese research report with citations.',
    'Implement the feature across the repository and add complete tests.',
    'Release version 9.9.9 to npm and push the release commit.',
    'Perform a broad security review of the authentication implementation.',
  ];

  for (const prompt of prompts) {
    await t.test(prompt, async () => {
      const { pi, ctx } = await routedRuntime(prompt);
      const result = await event(pi, 'session_stop')({ output: 'Best-effort task result.' }, ctx);
      assert.equal(result, undefined);
    });
  }
});

test('legacy terminal, action-boundary, and exclusive state cannot revive runtime enforcement', async () => {
  const seeded = await routedRuntime('Review src/router.js without modifying files.');
  const snapshot = seeded.pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state');
  assert.ok(snapshot);
  snapshot.data.gateController = {
    schemaVersion: 2,
    routeId: snapshot.data.routeId,
    phase: 'blocked',
    evidenceRevision: 0,
    budget: { repairUsed: 2, repairMax: 2, terminalUsed: 1, terminalMax: 1 },
    openGates: { release: { gateKey: 'release', protection: 'protected' } },
    failures: {},
    terminalReason: 'protected_gate_exhausted',
  };
  snapshot.data.actionBoundary = {
    schemaVersion: 1,
    denialCount: 2,
    terminal: true,
    awaitingUserReason: 'irreversible-approval-required',
    reasonCounts: { 'workspace-write-forbidden': 2 },
  };
  snapshot.data.exclusiveToolState = {
    schemaVersion: 1,
    routeId: snapshot.data.routeId,
    status: 'blocked',
    reasonCode: 'exclusive-tool-budget-exhausted',
    finalCorrectionUsed: true,
  };
  snapshot.data.lastRoute.hardBlock = true;
  snapshot.data.lastRoute.shouldForkSubagents = true;
  snapshot.data.lastRoute.approvalState = { status: 'required' };

  const pi = new FakePi(seeded.pi.entries);
  registerCoreEnhancer(pi);
  const ctx = extensionContext(pi.entries);
  await event(pi, 'session_start')({}, ctx);

  const toolResult = await event(pi, 'tool_call')(
    { toolName: 'edit', input: { path: 'src/router.js' } },
    ctx,
  );
  assert.notEqual(toolResult?.block, true);
  assert.equal(await event(pi, 'session_stop')({ output: 'Done.' }, ctx), undefined);

  const restored = pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.equal(restored.gateController, undefined);
  assert.equal(restored.actionBoundary, undefined);
  assert.equal(restored.exclusiveToolState, undefined);
  assert.equal(Object.hasOwn(restored.lastRoute, 'hardBlock'), false);
  assert.equal(Object.hasOwn(restored.lastRoute, 'shouldForkSubagents'), false);
  assert.equal(Object.hasOwn(restored.lastRoute, 'approvalState'), false);
});

test('registered route and status tools never self-reject an exclusive route', async () => {
  const prompt = 'Call omp_core_subagent_status exactly once and return only its status.';
  const { pi, ctx } = await routedRuntime(prompt);
  assert.equal(pi.tools.has('omp_core_smart_gate_prompt'), false);
  assert.equal(pi.tools.has('omp_core_resolve_smart_gate'), false);
  const statusTool = pi.tools.get('omp_core_subagent_status');
  const routeTool = pi.tools.get('omp_core_route_task');

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const status = await statusTool.execute(`status-${attempt}`, {}, undefined, undefined, ctx);
    assert.equal(status.isError, false);
    assert.notEqual(status.details?.blocked, true);

    const route = await routeTool.execute(
      `route-${attempt}`,
      { prompt: 'Review the route for this exact status probe.' },
      undefined,
      undefined,
      ctx,
    );
    assert.equal(route.isError, false);
    assert.notEqual(route.details?.blocked, true);
  }
});

test('route probes refine path-only writing after observed source text is supplied', async () => {
  const { pi, ctx } = await routedRuntime('Please polish tex/abstract.tex.');
  const routeTool = pi.tools.get('omp_core_route_task');

  const pending = await routeTool.execute(
    'writing-pending',
    { prompt: 'Please polish tex/abstract.tex.' },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(pending.details.route.intent, 'writing.pending');
  assert.equal(pending.details.route.routePlan.mode, 'advisory');
  assert.equal(pending.details.route.routePlan.autoContinue, false);
  assert.match(pending.content[0].text, /read the target text/i);

  const english = await routeTool.execute(
    'writing-english',
    {
      prompt: 'Please polish tex/abstract.tex.',
      sourceText: 'This paper presents a reliable workflow router for coding agents.',
    },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(english.details.route.intent, 'writing.en');
  assert.ok(english.details.route.skills.includes('writing-markdown-helper'));

  const chinese = await routeTool.execute(
    'writing-chinese',
    {
      prompt: 'Please polish tex/abstract.tex.',
      sourceText: '本文提出了一种面向编码智能体的可靠工作流路由方法。',
    },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(chinese.details.route.intent, 'writing.zh');
  assert.ok(chinese.details.route.skills.includes('plain-chinese-writing'));

  const status = await pi.tools.get('omp_core_subagent_status').execute(
    'advisory-status',
    {},
    undefined,
    undefined,
    ctx,
  );
  assert.equal(status.details.status.mode, 'advisory');
  assert.equal(status.details.status.auto_continue, false);
  assert.equal(Object.hasOwn(status.details.status, 'gate_requirements'), false);
});

test('the runtime has no generated-output loop controller or completion continuation', async () => {
  const { pi, ctx } = await routedRuntime('Inspect the current implementation and report your findings.');
  const eventNames = pi.eventHandlers.map((entry) => entry.eventName);
  assert.equal(eventNames.includes('assistant_delta'), false);
  assert.equal(eventNames.includes('assistant_output'), false);
  assert.equal(eventNames.includes('response_delta'), false);
  assert.equal(await event(pi, 'session_stop')({ output: 'Best-effort result.' }, ctx), undefined);
  const snapshot = pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.equal(Object.hasOwn(snapshot, 'loopGuard'), false);
  assert.equal(Object.hasOwn(snapshot, 'gateController'), false);
});

test('before_agent_start reads workspace writing targets and routes by body language', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'omp-writing-language-'));
  try {
    writeFileSync(
      join(cwd, 'abstract.tex'),
      'This paper presents an advisory workflow router for coding agents.',
      'utf8',
    );
    const english = await routedRuntime('请润色 abstract.tex。', cwd);
    const englishRoute = english.pi.entries.findLast(
      (entry) => entry.customType === 'omp-enhancer-core.state',
    ).data.lastRoute;
    assert.equal(englishRoute.intent, 'writing.en');
    assert.equal(englishRoute.taskDescriptor.writingLanguageSource, 'provided-source');
    assert.ok(englishRoute.routePlan.skills.includes('writing-markdown-helper'));
    assert.deepEqual(englishRoute.writingSourceObservation.paths, ['abstract.tex']);
    assert.deepEqual(englishRoute.writingSourceObservation.languages, ['en']);

    writeFileSync(
      join(cwd, 'abstract.tex'),
      '本文提出了一种面向编码智能体的建议式工作流路由方法。',
      'utf8',
    );
    const chinese = await routedRuntime('请润色 abstract.tex 的英文摘要。', cwd);
    const chineseRoute = chinese.pi.entries.findLast(
      (entry) => entry.customType === 'omp-enhancer-core.state',
    ).data.lastRoute;
    assert.equal(chineseRoute.intent, 'writing.zh');
    assert.equal(chineseRoute.taskDescriptor.writingLanguageSource, 'provided-source');
    assert.ok(chineseRoute.routePlan.skills.includes('plain-chinese-writing'));
    assert.deepEqual(chineseRoute.writingSourceObservation.paths, ['abstract.tex']);
    assert.deepEqual(chineseRoute.writingSourceObservation.languages, ['zh']);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('workspace language inspection rejects a symlink escape and leaves writing pending', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omp-writing-root-'));
  const outside = mkdtempSync(join(tmpdir(), 'omp-writing-outside-'));
  try {
    writeFileSync(
      join(outside, 'secret.tex'),
      '本文位于工作区之外，不应作为写作路由输入。',
      'utf8',
    );
    symlinkSync(join(outside, 'secret.tex'), join(root, 'abstract.tex'));
    const routed = await routedRuntime('Please polish abstract.tex.', root);
    const route = routed.pi.entries.findLast(
      (entry) => entry.customType === 'omp-enhancer-core.state',
    ).data.lastRoute;
    assert.equal(route.intent, 'writing.pending');
    assert.equal(route.taskDescriptor.language, 'unknown');
    assert.equal(route.writingSourceObservation, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('public usage reviews report advisory coverage instead of failure-shaped validation', async () => {
  const { pi, ctx } = await routedRuntime(
    'Agentically implement the parser change, add regression tests, and review the diff.',
  );
  const skill = await pi.tools.get('omp_core_validate_skill_usage').execute(
    'skill-coverage',
    { output: '' },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(skill.isError, false);
  assert.equal(skill.details.validation.advisory, true);
  assert.equal(skill.details.validation.complete, false);
  assert.equal(Object.hasOwn(skill.details.validation, 'ok'), false);
  assert.equal(Object.hasOwn(skill.details.validation, 'required'), false);
  assert.doesNotMatch(skill.content[0].text, /missing|required|blocked/i);

  const roles = await pi.tools.get('omp_core_validate_subagent_usage').execute(
    'role-coverage',
    { output: '' },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(roles.isError, false);
  assert.equal(roles.details.validation.advisory, true);
  assert.equal(roles.details.validation.complete, false);
  assert.equal(Object.hasOwn(roles.details.validation, 'ok'), false);
  assert.equal(Object.hasOwn(roles.details.validation, 'missing'), false);
  assert.doesNotMatch(roles.content[0].text, /missing|required|blocked/i);
});

async function routedRuntime(prompt, cwd = process.cwd()) {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext(pi.entries, cwd);
  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')({ prompt }, ctx);
  return { pi, ctx };
}

function event(pi, eventName) {
  const registered = pi.eventHandlers.find((entry) => entry.eventName === eventName);
  if (!registered) throw new Error(`Missing event handler: ${eventName}`);
  return registered.handler;
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
