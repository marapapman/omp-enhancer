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

test('inspection budgets add per-result model guidance without blocking tools', async () => {
  const prompt = '为 agent-fleet 制定只读计划，不修改文件，不运行测试，最多 3 次读取或搜索。';
  const { pi, ctx } = await routedRuntime(prompt);
  const toolResult = event(pi, 'tool_result');

  const first = await toolResult({
    name: 'read',
    input: { path: 'skill://writing-plans' },
    result: { content: [{ type: 'text', text: '---\nname: writing-plans\ndescription: Planning\n---\n' }] },
  }, ctx);
  assert.match(first.content.at(-1).text, /1\/3 read\/search calls used; 2 remaining/i);
  assert.doesNotMatch(first.content.at(-1).text, /No routed primary skill read is observed/i);

  const second = await toolResult({
    name: 'grep',
    input: { pattern: 'agent-fleet' },
    result: { content: [{ type: 'text', text: 'extensions/agent-fleet/index.ts' }] },
  }, ctx);
  assert.match(second.content.at(-1).text, /2\/3 read\/search calls used; 1 remaining/i);
  assert.match(second.content.at(-1).text, /NEXT BATCH LIMIT: issue at most 1 individual read\/search tool call/i);
  assert.match(second.content.at(-1).text, /choose only the 1 highest-value target, then finalize/i);
  assert.match(second.content.at(-1).text, /do not queue more read\/search calls than the remaining count/i);

  const third = await toolResult({
    name: 'read',
    input: { path: 'extensions/agent-fleet/index.ts' },
    result: { content: [{ type: 'text', text: 'export const route = true;' }] },
  }, ctx);
  assert.match(third.content.at(-1).text, /3\/3 read\/search calls used; 0 remaining/i);
  assert.match(third.content.at(-1).text, /inspection budget is exhausted[\s\S]*synthesize/i);
  assert.match(third.content.at(-1).text, /no tool call or completion is blocked/i);
  assert.notEqual(third.block, true);

  const fourth = await toolResult({
    name: 'read',
    input: { path: 'extensions/agent-fleet/extra.ts' },
    result: { content: [{ type: 'text', text: 'extra' }] },
  }, ctx);
  assert.match(fourth.content.at(-1).text, /4\/3 read\/search calls used; 0 remaining/i);
  assert.notEqual(fourth.block, true);
});

test('session self-report is a claim and cannot impersonate a successful skill read', async () => {
  const { pi, ctx } = await routedRuntime('Review this English paragraph for writing quality.');
  assert.equal(await event(pi, 'session_stop')({
    output: [
      'SKILL_USAGE',
      'Loaded:',
      '- writing-review',
    ].join('\n'),
  }, ctx), undefined);

  const status = await pi.tools.get('omp_core_subagent_status').execute(
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
    { output: 'Loaded writing-review.' },
    undefined,
    undefined,
    ctx,
  );
  assert.deepEqual(review.details.validation.observed, []);
  assert.deepEqual(review.details.validation.claimed, ['writing-review']);
  assert.deepEqual(review.details.validation.unobservedClaims, ['writing-review']);
});

test('only a successful, identity-verified SKILL.md read records observed evidence', async () => {
  const { pi, ctx } = await routedRuntime('Review this English paragraph for writing quality.');

  await event(pi, 'tool_result')({
    name: 'read',
    input: { path: 'skill://writing-review' },
    result: {
      isError: true,
      content: [{ type: 'text', text: '---\nname: writing-review\n---\n' }],
    },
  }, ctx);
  await event(pi, 'tool_result')({
    name: 'read',
    input: { path: '/tmp/writing-checkers/SKILL.md' },
    result: { content: [{ type: 'text', text: '# Writing checkers' }] },
  }, ctx);
  await event(pi, 'tool_result')({
    name: 'read',
    input: { path: '/tmp/writing-review/SKILL.md' },
    result: {
      content: [{ type: 'text', text: '---\nname: writing-checkers\n---\n' }],
    },
  }, ctx);
  await event(pi, 'tool_result')({
    name: 'read',
    input: { path: '/workspace/.omp/skills/writing-checkers/SKILL.md' },
    result: {
      content: [{ type: 'text', text: '---\nname: writing-checkers\ndescription: Project writing checks\n---\n' }],
    },
  }, ctx);
  await event(pi, 'tool_result')({
    name: 'read',
    input: { path: 'skill://writing-review' },
    result: {
      content: [{ type: 'text', text: '---\nname: writing-review\ndescription: Packaged writing review\n---\n' }],
    },
  }, ctx);
  await event(pi, 'tool_result')({
    name: 'read',
    input: { path: 'skill://ecc/security-review' },
    result: {
      content: [{ type: 'text', text: '---\nname: security-review\ndescription: Packaged security review\n---\n' }],
    },
  }, ctx);

  const status = await pi.tools.get('omp_core_subagent_status').execute(
    'status-after-reads',
    {},
    undefined,
    undefined,
    ctx,
  );
  assert.deepEqual(
    status.details.status.observed_skills.sort(),
    ['security-review', 'writing-checkers', 'writing-review'],
  );
});

test('autolearn capture yields without changing route or business evidence', async () => {
  const { pi, ctx } = await routedRuntime('Review src/router.js and report defects only.');
  const before = pi.entries.findLast(
    (entry) => entry.customType === 'omp-enhancer-core.state',
  ).data;
  const capturePrompt = [
    'Automated capture turn — not a user reply. The user has not yet responded to your previous turn. Do not treat this prompt as their answer, as approval to continue, or as acceptance of any pending action; only the user can do that.',
    '',
    'If your previous turn produced anything reusable, capture it now: a repeatable procedure becomes a managed skill (`manage_skill`); a durable fact, convention, or user preference is worth remembering (`learn`, when memory is enabled). Only capture what will genuinely help next time. If nothing is worth keeping, do nothing.',
    '',
    "Then stop. Do not run any other tools, do not resume prior work, do not answer your own pending questions, and do not produce a continuation reply. Yield and wait for the user's next prompt.",
  ].join('\n');
  pi.entries.push({
    type: 'custom_message',
    customType: 'autolearn-nudge',
    content: capturePrompt,
    display: false,
    attribution: 'user',
  });
  const entryCount = pi.entries.length;

  assert.equal(await event(pi, 'before_agent_start')({ prompt: capturePrompt }, ctx), undefined);
  await event(pi, 'tool_result')({
    name: 'read',
    input: { path: 'skill://writing-review' },
    result: { content: [{ type: 'text', text: '# Writing review' }] },
  }, ctx);
  assert.equal(await event(pi, 'session_stop')({
    output: 'SKILL_USAGE\nLoaded:\n- writing-review',
  }, ctx), undefined);
  assert.equal(pi.entries.length, entryCount);

  const afterCapture = pi.entries.findLast(
    (entry) => entry.customType === 'omp-enhancer-core.state',
  ).data;
  assert.equal(afterCapture.lastPrompt, before.lastPrompt);
  assert.deepEqual(afterCapture.lastRoute, before.lastRoute);
  assert.deepEqual(afterCapture.observedSkills, before.observedSkills);
  assert.deepEqual(afterCapture.claimedSkills, before.claimedSkills);

  const next = await event(pi, 'before_agent_start')({
    prompt: 'Explain what autolearn.autoContinue does.',
  }, ctx);
  assert.notEqual(next, undefined);
  const afterUser = pi.entries.findLast(
    (entry) => entry.customType === 'omp-enhancer-core.state',
  ).data;
  assert.equal(afterUser.lastPrompt, 'Explain what autolearn.autoContinue does.');
});

test('an implementation follow-up recompiles a planning route while a plain continuation inherits it', async () => {
  const { pi, ctx } = await routedRuntime('为 src/router.js 制定修复计划，暂时不要修改文件。');
  const before = pi.entries.findLast(
    (entry) => entry.customType === 'omp-enhancer-core.state',
  ).data;
  assert.equal(before.lastRoute.intent, 'planning');
  assert.equal(before.lastRoute.taskDescriptor.constraints.workspaceWrite, 'forbidden');

  const continued = await event(pi, 'before_agent_start')({ prompt: '继续' }, ctx);
  assert.equal(continued.route.intent, 'planning');
  assert.equal(continued.route.taskDescriptor.constraints.workspaceWrite, 'forbidden');

  const started = await event(pi, 'before_agent_start')({ prompt: '开始实现' }, ctx);
  assert.equal(started.route.intent, 'implementation-with-tests');
  assert.equal(started.route.workflowRoute, 'code.dev');
  assert.equal(started.route.taskDescriptor.operation, 'modify');
  assert.equal(started.route.taskDescriptor.constraints.workspaceWrite, 'required');
  assert.ok(started.route.taskDescriptor.phases.some((phase) => phase.kind === 'modify'));
  assert.notEqual(started.block, true);

  const after = pi.entries.findLast(
    (entry) => entry.customType === 'omp-enhancer-core.state',
  ).data;
  assert.equal(after.lastRoute.intent, 'implementation-with-tests');
  assert.match(after.lastPrompt, /src\/router\.js/);
  assert.match(after.lastPrompt, /开始实现/);
  assert.equal(await event(pi, 'session_stop')({ output: 'Implementation started.' }, ctx), undefined);
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

test('multi-route writing diagnostics remain advisory and never schedule continuation', async () => {
  const prompt = 'Final installed writing-route E2E. Call omp_core_route_task exactly twice. A prompt: "请润色这段摘要：This paper presents a reliable advisory router for coding agents." B prompt: "Please polish this paragraph: 本文提出一种可靠的智能体工作流路由方法。" Return exactly A=<intent>/<routePlan.mode>, B=<intent>/<routePlan.mode>. Do not write files.';
  const { pi, ctx } = await routedRuntime(prompt);
  const routeTool = pi.tools.get('omp_core_route_task');
  const initial = pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.equal(initial.lastRoute.intent, 'diagnosis');
  assert.equal(initial.lastRoute.routePlan.mode, 'advisory');
  assert.equal(initial.lastRoute.routePlan.autoContinue, false);

  const english = await routeTool.execute(
    'route-english',
    { prompt: '请润色这段摘要：This paper presents a reliable advisory router for coding agents.' },
    undefined,
    undefined,
    ctx,
  );
  const chinese = await routeTool.execute(
    'route-chinese',
    { prompt: 'Please polish this paragraph: 本文提出一种可靠的智能体工作流路由方法。' },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(english.details.route.intent, 'writing.en');
  assert.equal(english.details.route.routePlan.mode, 'advisory');
  assert.equal(chinese.details.route.intent, 'writing.zh');
  assert.equal(chinese.details.route.routePlan.mode, 'advisory');

  const toolCall = await event(pi, 'tool_call')(
    { toolName: 'omp_core_route_task', input: { prompt: 'Polish this English paragraph.' } },
    ctx,
  );
  assert.notEqual(toolCall?.block, true);
  assert.equal(await event(pi, 'session_stop')({ output: 'A=writing.en/advisory, B=writing.zh/advisory' }, ctx), undefined);

  const final = pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.equal(final.lastRoute.intent, 'diagnosis');
  assert.equal(Object.hasOwn(final, 'gateController'), false);
  assert.equal(Object.hasOwn(final, 'loopGuard'), false);
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

test('before_agent_start reads a read-only Unicode writing source without granting write scope', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'omp-writing-readonly-'));
  try {
    const target = '第5章-合并正文.md';
    writeFileSync(
      join(cwd, target),
      '本章系统检查中文逻辑、行文与论证结构。',
      'utf8',
    );

    const routed = await routedRuntime(
      '只读检查第5章-合并正文.md的中文逻辑和行文，不要修改文件。',
      cwd,
    );
    const route = routed.pi.entries.findLast(
      (entry) => entry.customType === 'omp-enhancer-core.state',
    ).data.lastRoute;
    assert.equal(route.intent, 'writing.zh');
    assert.equal(route.taskDescriptor.constraints.workspaceWrite, 'forbidden');
    assert.deepEqual(route.taskDescriptor.workspaceWriteTargets, []);
    assert.deepEqual(route.taskDescriptor.writingSourceTargets, [target]);
    assert.deepEqual(route.writingSourceObservation.paths, [target]);
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
