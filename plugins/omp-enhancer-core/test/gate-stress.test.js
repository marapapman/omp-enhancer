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

const profiles = {
  writingEn: {
    prompts: [
      'Draft an English related work paragraph for a systems paper.',
      'Write a concise project report in English.',
      'Revise this manuscript abstract for clarity.',
      'Edit the proposal summary for a technical audience.',
      'Draft a full English research proposal with background, methods, risks, and timeline.',
    ],
    subagents: {
      writer: ['writing-markdown-helper'],
      checker: ['writing-checkers'],
    },
    skills: ['writing-markdown-helper', 'writing-checkers'],
    gateTool: 'writing_quality_check',
    missingGate: /writing QA/,
  },
  writingEnSimple: {
    prompts: [
      'Polish the paragraph and check the wording.',
      'Polish this sentence for clarity and keep it concise.',
      'Edit this wording so it sounds natural.',
      'Polish this sentence for clarity: The workflow blocks unexpectedly.',
    ],
    subagents: {},
    skills: ['writing-markdown-helper'],
  },
  writingZh: {
    prompts: [
      '请把这段中文论文摘要改得更平实。',
      '帮我润色博士论文引言，去掉翻译腔。',
      '请起草一份中文项目报告。',
      '请检查这段中文相关工作的逻辑表达。',
      '请写一份中文长篇项目总结报告，包含背景、方法、结果和风险。',
      '请写一份中文科研调研报告，分析最近论文里的方法路线。',
    ],
    subagents: {
      'zh-writer': ['plain-chinese-writing', 'zh-writing-polish'],
      'zh-checker': ['plain-chinese-writing', 'zh-writing-checkers'],
    },
    skills: ['plain-chinese-writing', 'zh-writing-polish', 'zh-writing-checkers'],
    gateTool: 'writing_quality_check',
    missingGate: /writing QA/,
  },
  writingZhSimple: {
    prompts: [
      '把这句话改成朴素直接的中文。',
      '把这段话改得少一点 AI 味。',
      '请把下面说明改成自然中文，不要改代码。',
      '把这句话改成朴素直接的中文：我们需要进一步推动能力沉淀。',
    ],
    subagents: {},
    skills: ['plain-chinese-writing', 'zh-writing-polish'],
  },
  bugAudit: {
    prompts: [
      'Write tests for src/router.js around fallback behavior.',
      'Add tests for classifier routing confidence thresholds.',
      'Create regression tests for the skill gate parser.',
      'Run unit tests for the marketplace release script.',
      'Review test flakiness around the browser smoke suite.',
      '帮我测试项目并检查 bug，写 bug audit report，不要修复代码。',
      '测试整个项目并检查 bug，输出已验证的问题清单。',
      'Run tests and audit for bugs; write a bug report without fixing code.',
      'Find bugs in the project and report verified findings only.',
      'Inspect the plugin for defects and summarize concrete file-line findings.',
      '帮我在代码里找 bug，只报告问题，不要修复。',
      '帮我为 subagent fork 逻辑生成测试并运行门禁，不要改实现。',
    ],
    subagents: {
      'ecc-tdd-guide': ['test-driven-development', 'search-first', 'ai-regression-testing'],
      'ecc-code-reviewer': ['verification-before-completion'],
      'ecc-silent-failure-hunter': ['diagnose'],
      'ecc-pr-test-analyzer': ['verification-before-completion'],
    },
    skills: ['diagnose', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion', 'search-first', 'ai-regression-testing'],
    gateTool: 'omp_test_gate',
    missingGate: /omp_test_gate/,
  },
  focusedBugAudit: {
    prompts: [
      'Do the bug investigation directly as a focused audit; report verified findings only.',
      '直接做 focused bug audit，只报告验证过的问题。',
      'Run a direct focused bug investigation for this plugin without fixing code.',
    ],
    subagents: {},
    skills: ['diagnose', 'test-driven-development', 'verification-before-completion', 'search-first'],
    gateTool: 'omp_test_gate',
    missingGate: /omp_test_gate/,
  },
  implementation: {
    prompts: [
      'Implement classifier fallback handling and add tests.',
      'Fix the plugin gate bug and add regression tests.',
      'Modify the marketplace release logic and test it.',
      'Refactor the router code with focused unit tests.',
      'Build the config workflow and cover error paths.',
      '请大规模重构这个插件的 subagent fork 逻辑，修改多个文件并补完整测试。',
      '只修改 plugins/omp-enhancer-core/src/router.js 里 routeNaturalLanguageTask 的一个判断，保持范围最小。',
      'Agentically update the codebase to improve gate handling and add regression tests.',
    ],
    subagents: {
      plan: ['brainstorming', 'subagent-driven-development'],
      'implementation-task': ['test-driven-development', 'verification-before-completion'],
      reviewer: ['verification-before-completion'],
    },
    skills: ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
    gateTool: 'omp_test_gate',
    missingGate: /omp_test_gate/,
  },
  security: {
    prompts: [
      'Review this API handler for auth bypass and injection risks.',
      'Audit the file download route for path traversal.',
      'Check this Express code for SSRF vulnerabilities.',
      'Review token handling for secret leakage.',
      'Analyze authentication and authorization risks in this middleware.',
    ],
    subagents: {
      'ecc-security-reviewer': ['security-review', 'security-scan'],
      reviewer: ['security-review'],
    },
    skills: ['security-review', 'security-scan'],
  },
  config: {
    prompts: [
      'List packaged omp-config assets and hooks.',
      'Inspect config assets shipped by the plugin.',
      'Check the omp-config skill asset inventory.',
      'Show marketplace config asset paths.',
      'Review bundled hooks and templates in omp-config.',
    ],
    subagents: {
      'config-librarian': [],
      reviewer: [],
    },
    skills: [],
  },
};

const nonGatedPrompts = [
  '为什么 SKILL_USAGE validation 一直失败？先诊断原因，不要改代码。',
  '只诊断这个 Warning 是什么导致的。',
  'Why does the validator keep failing? Diagnosis only.',
  'What is the capital of France?',
  'Who is the author of Hamlet?',
  'What is an API?',
  'What does bug mean in English?',
  'What is a unit test?',
  'What is a browser?',
  'What is a report?',
  'GitHub release 是什么？简单解释一下。',
  '今天下午三点提醒我给妈妈打电话。',
  '帮我调研一下 agentic coding workflow 的最佳实践，列出要点。',
  '帮我做科研选题调研，分析最近论文里的方法路线。',
  '帮我下载这些论文 PDF 并整理到 papers 目录，不要写代码。',
  '帮我整理今天的会议纪要和待办事项。',
];

const gateCases = [
  ...completeCases(),
  ...crossInstanceCases(),
  ...missingSubagentCases(),
  ...missingWorkflowGateCases(),
  ...failedWorkflowGateCases(),
  ...missingSkillCases(),
  ...recoveryCases(),
  ...nonGatedCases(),
  ...protectedReleaseCases(),
];

test('gate stress matrix covers at least 100 session_stop cases without repeated false blocks', async () => {
  assert.equal(gateCases.length >= 100, true, `expected at least 100 gate cases, got ${gateCases.length}`);

  await Promise.all(gateCases.map(async ({ name, run }) => {
    try {
      await run();
    } catch (error) {
      error.message = `${name}: ${error.message}`;
      throw error;
    }
  }));
});

function completeCases() {
  return profilePromptCases('complete', async (profile, prompt) => {
    const { pi, ctx } = await startRuntime(prompt);
    await forkSubagents(pi, ctx, profile);
    await runWorkflowGate(pi, ctx, profile);
    await assertReleasedStops(pi, ctx, [
      { output: finalEvidence(profile) },
      {},
      { content: [{ type: 'text', text: 'No new gate evidence; prior evidence remains valid.' }] },
    ]);
  });
}

function crossInstanceCases() {
  return profilePromptCases('cross-instance complete', async (profile, prompt) => {
    const entries = [];
    const { pi, ctx } = await startRuntime(prompt, entries);
    await forkSubagents(pi, ctx, profile);
    await runWorkflowGate(pi, ctx, profile);
    if (profile.skills.length) await validateSkillUsage(pi, ctx, profile.skills);
    await event(pi, 'session_stop')({ output: finalEvidence(profile) }, ctx);

    const restoredPi = new FakePi(entries);
    registerCoreEnhancer(restoredPi);
    await assertReleasedStops(restoredPi, extensionContext(entries), [{}, {}]);
  });
}

function missingSubagentCases() {
  return profilePromptCases('missing subagents', async (_profile, prompt) => {
    const { pi, ctx } = await startRuntime(prompt);
    const blocked = await event(pi, 'session_stop')({}, ctx);
    assert.equal(blocked?.continue, true);
    assert.match(blocked.additionalContext, /subagent gate/i);
  }, (profile) => Object.keys(profile.subagents).length > 0);
}

function missingWorkflowGateCases() {
  return profilePromptCases('missing workflow gate', async (profile, prompt) => {
    const { pi, ctx } = await startRuntime(prompt);
    await forkSubagents(pi, ctx, profile);
    const blocked = await event(pi, 'session_stop')({}, ctx);
    assert.equal(blocked?.continue, true);
    assert.match(blocked.additionalContext, profile.missingGate);
  }, (profile) => Boolean(profile.gateTool));
}

function failedWorkflowGateCases() {
  return profilePromptCases('failed workflow gate remains open after non-empty final output', async (profile, prompt) => {
    const { pi, ctx } = await startRuntime(prompt);
    await forkSubagents(pi, ctx, profile);
    await validateSkillUsage(pi, ctx, profile.skills);
    await event(pi, 'tool_result')(
      {
        name: profile.gateTool,
        isError: profile.gateTool === 'writing_quality_check',
        details: profile.gateTool === 'omp_test_gate'
          ? { passed: false, results: [{ gate: 'indirect-test', passed: false, severity: 'blocker' }] }
          : { error: 'QA tool failed.' },
      },
      ctx,
    );
    const blocked = await event(pi, 'session_stop')({ output: 'Done.' }, ctx);
    assert.equal(blocked?.continue, true);
    assert.match(blocked.additionalContext, profile.missingGate);
  }, (profile) => Boolean(profile.gateTool));
}

function missingSkillCases() {
  return profilePromptCases('missing skill usage', async (profile, prompt) => {
    const { pi, ctx } = await startRuntime(prompt);
    await forkSubagents(pi, ctx, profile, { includeResultSkills: false });
    await runWorkflowGate(pi, ctx, profile);
    const blocked = await event(pi, 'session_stop')({}, ctx);
    assert.equal(blocked?.continue, true);
    assert.match(blocked.additionalContext, /SKILL_USAGE/);
  }, (profile) => profile.skills.length > 0);
}

function recoveryCases() {
  return profilePromptCases('recovery', async (profile, prompt) => {
    const { pi, ctx } = await startRuntime(prompt);
    await forkSubagents(pi, ctx, profile, { includeSkills: false });
    const blocked = await event(pi, 'session_stop')({}, ctx);
    assert.equal(blocked?.continue, true);

    await forkSubagents(pi, ctx, profile);
    await runWorkflowGate(pi, ctx, profile);
    await assertReleasedStops(pi, ctx, [{ output: finalEvidence(profile) }, {}, {}]);
  }, (profile) => Object.values(profile.subagents).some((skills) => skills.length > 0));
}

function nonGatedCases() {
  return nonGatedPrompts.map((prompt, index) => ({
    name: `non-gated ${index + 1}`,
    async run() {
      const { pi, ctx, start } = await startRuntime(prompt);
      await resolveClassifierPreflightIfRequired(pi, ctx, prompt, start);
      await assertReleasedStops(pi, ctx, [{}, {}, { output: 'Done.' }]);
    },
  }));
}

function protectedReleaseCases() {
  return [
    'Publish the plugin update to GitHub marketplace.',
    'Push the current release commit and upgrade marketplace plugins.',
    'Upgrade omp-enhancer-core@omp-enhancer after pushing main.',
  ].map((prompt, index) => ({
    name: `protected release ${index + 1}`,
    async run() {
      const { pi, ctx } = await startRuntime(prompt);
      const blocked = await event(pi, 'session_stop')({ output: 'Done.' }, ctx);
      assert.equal(blocked?.continue, true);
      assert.match(blocked.additionalContext, /release \[protected\]|Protected release gate/);
    },
  }));
}

function profilePromptCases(prefix, runCase, profileFilter = () => true) {
  return Object.entries(profiles).filter(([, profile]) => profileFilter(profile)).flatMap(([profileName, profile]) =>
    profile.prompts.slice(0, 2).map((prompt, index) => ({
      name: `${prefix} ${profileName} ${index + 1}`,
      run: () => runCase(profile, prompt),
    })),
  );
}

async function startRuntime(prompt, entries = []) {
  const pi = new FakePi(entries);
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries);
  await event(pi, 'session_start')({}, ctx);
  const start = await event(pi, 'before_agent_start')({ prompt }, ctx);
  return { pi, ctx, entries, start };
}

async function resolveClassifierPreflightIfRequired(pi, ctx, prompt, start) {
  if (!/Classifier preflight: required/.test(String(start?.additionalContext ?? ''))) return;
  const intent = start?.route?.intent ?? 'unknown';
  await tool(pi, 'omp_core_resolve_classification').execute(
    'gate-stress-classifier-resolve',
    {
      prompt,
      output: JSON.stringify({
        intent,
        secondaryIntents: [],
        language: /[\u4e00-\u9fff]/.test(prompt) ? 'zh' : 'en',
        confidence: 0.95,
        riskFlags: [],
        domainHints: ['gate-stress'],
        reason: 'Stress test resolves classifier preflight before checking non-gated release.',
      }),
    },
    undefined,
    undefined,
    ctx,
  );
}

async function forkSubagents(pi, ctx, profile, { includeSkills = true, includeResultSkills = includeSkills } = {}) {
  for (const [index, [agent, skills]] of Object.entries(profile.subagents).entries()) {
    const toolCallId = `gate-stress-${agent}-${index}`;
    const prompt = includeSkills
      ? [`OMP_REQUIRED_SUBAGENT: ${agent}`, 'OMP_PARENT_TASK: gate stress routed task', 'Required skills for this subagent:', ...skills.map((skill) => `- ${skill}`)].join('\n')
      : `OMP_REQUIRED_SUBAGENT: ${agent}\nOMP_PARENT_TASK: gate stress routed task\nDo the assigned work.`;
    await event(pi, 'tool_call')(
      { toolName: 'task', toolCallId, input: { agent, prompt } },
      ctx,
    );
    const resultText = [
      includeResultSkills && skills.length ? skillUsageBlock(skills) : `${agent} completed the assigned checkpoint.`,
      agent === 'ecc-security-reviewer' ? [
        'SECURITY_REVIEW',
        'Scope: routed security target',
        'Findings: no unresolved high-severity vulnerability',
        'Evidence: inspected the requested authentication and authorization paths',
        'OpenBlockers: none',
        'Verdict: PASS',
      ].join('\n') : '',
    ].filter(Boolean).join('\n');
    await event(pi, 'tool_result')(
      {
        name: 'task',
        toolCallId,
        params: { agent, prompt },
        content: [{ type: 'text', text: resultText }],
      },
      ctx,
    );
  }
}

async function runWorkflowGate(pi, ctx, profile) {
  if (!profile.gateTool) return;
  const details = profile.gateTool === 'omp_test_gate'
    ? { passed: true }
    : profile.gateTool === 'fact_check_gate'
      ? { ok: true }
      : undefined;
  await event(pi, 'tool_result')({ name: profile.gateTool, details }, ctx);
  if (profile.gateTool === 'omp_test_gate') await recordPassingHostTest(pi, ctx);
}

async function validateSkillUsage(pi, ctx, skills) {
  await tool(pi, 'omp_core_validate_skill_usage').execute(
    'gate-stress-skill-usage',
    { output: skillUsageBlock(skills) },
    undefined,
    undefined,
    ctx,
  );
}

async function assertReleasedStops(pi, ctx, stopEvents) {
  for (const stopEvent of stopEvents) {
    const result = await event(pi, 'session_stop')(stopEvent, ctx);
    assert.equal(result, undefined);
  }
}

function finalEvidence(profile) {
  return [
    'Done.',
    '',
    'SUBAGENT_USAGE:',
    ...Object.entries(profile.subagents).map(([agent, skills]) => `- ${agent}: ${skills.join(', ') || 'none'}`),
    profile.skills.length ? ['', skillUsageBlock(profile.skills)].join('\n') : '',
  ].filter(Boolean).join('\n');
}

function skillUsageBlock(skills) {
  return [
    'SKILL_USAGE',
    'Required:',
    ...skills.map((skill) => `- ${skill}`),
    'Loaded:',
    ...skills.map((skill) => `- ${skill}`),
  ].join('\n');
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

const LIFECYCLE_IMPLEMENTATION_PROMPT =
  'Modify src/router.js to add deterministic fallback, add tests, and review the diff.';
const LIFECYCLE_SOFT_PROMPT =
  'Please draft a full English research proposal with background, methods, risks, and timeline.';
const LIFECYCLE_PROTECTED_PROMPT =
  'Fix the authentication bypass vulnerability, add tests, complete security review, and publish the plugin release.';

test('GateController checks and aggregates every open gate for both empty and non-empty final output', async (t) => {
  for (const stopEvent of [
    { name: 'empty final', event: {} },
    { name: 'non-empty final', event: { output: 'Done.' } },
  ]) {
    await t.test(stopEvent.name, async () => {
      const { pi, ctx } = await startLifecycleRoute(LIFECYCLE_IMPLEMENTATION_PROMPT);
      const result = await event(pi, 'session_stop')(stopEvent.event, ctx);
      const context = String(result?.additionalContext ?? '');

      assert.equal(result?.continue, true, 'an open gate must not be released merely because final text exists');
      assert.match(context, /subagent/i, 'the continuation must include the subagent gap');
      assert.match(context, /omp_test_gate|testing gate|test evidence/i,
        'the same continuation must include the workflow/test gap');
      assert.match(context, /SKILL_USAGE|skill gate|required skills/i,
        'the same continuation must include the skill-evidence gap');
    });
  }
});

test('one route shares a strict budget of two repairs, one terminal-only continuation, then stop', async () => {
  const { pi, ctx, route } = await startLifecycleRoute(LIFECYCLE_IMPLEMENTATION_PROMPT);
  const results = [];
  const snapshots = [];

  results.push(await event(pi, 'session_stop')({}, ctx));
  snapshots.push(structuredClone(latestCoreState(pi).gateController));

  await completeLifecycleSubagents(pi, ctx, route);
  await validateSkillUsage(pi, ctx, route.requiredSkills);

  results.push(await event(pi, 'session_stop')({}, ctx));
  snapshots.push(structuredClone(latestCoreState(pi).gateController));

  results.push(await event(pi, 'session_stop')({}, ctx));
  snapshots.push(structuredClone(latestCoreState(pi).gateController));

  results.push(await event(pi, 'session_stop')({}, ctx));
  snapshots.push(structuredClone(latestCoreState(pi).gateController));

  assert.deepEqual(results.map((result) => result?.continue === true), [true, true, true, false]);
  assert.deepEqual(snapshots.map((state) => state.budget.repairUsed), [1, 2, 2, 2]);
  assert.deepEqual(snapshots.map((state) => state.budget.terminalUsed), [0, 0, 1, 1]);
  assert.equal(['degraded', 'blocked'].includes(snapshots[2].phase), true);
  assert.equal(snapshots[3].phase, snapshots[2].phase, 'the fourth stop must remain in the explicit terminal state');
});

test('the terminal-only continuation explicitly prohibits every tool and command call', async () => {
  const { pi, ctx, route } = await startLifecycleRoute(LIFECYCLE_IMPLEMENTATION_PROMPT);

  await event(pi, 'session_stop')({}, ctx);
  await completeLifecycleSubagents(pi, ctx, route);
  await validateSkillUsage(pi, ctx, route.requiredSkills);
  await event(pi, 'session_stop')({}, ctx);
  const terminal = await event(pi, 'session_stop')({}, ctx);
  const state = latestCoreState(pi).gateController;

  assert.equal(terminal?.continue, true);
  assert.equal(['degraded', 'blocked'].includes(state.phase), true);
  assert.equal(state.budget.terminalUsed, 1);
  assert.match(String(terminal?.additionalContext ?? ''),
    /(?:do not|must not|never)\s+(?:call|run|use|invoke|execute)\s+(?:any\s+|more\s+)?(?:tools?|commands?)|no\s+(?:more\s+)?(?:tool|command)\s+calls?|(?:tools?|commands?)\s+(?:are\s+)?(?:prohibited|forbidden|disabled|not allowed)|禁止(?:调用|运行|使用|执行)?.{0,12}(?:工具|命令)/i);
  assert.match(String(terminal?.additionalContext ?? ''), /terminal|final|degraded|blocked|终态|最终/i);

  for (const toolName of ['read', 'bash', 'task']) {
    const blocked = await event(pi, 'tool_call')({ toolName, input: {} }, ctx);
    assert.equal(blocked?.block, true, `${toolName} must be disabled during terminal-only output`);
    assert.match(String(blocked?.reason ?? ''), /OMP_GATE_TERMINAL|Do not call/i);
  }
});

test('soft exhaustion degrades but release and security exhaustion blocks', async (t) => {
  await t.test('soft writing QA', async () => {
    const { pi, ctx, route } = await startLifecycleRoute(LIFECYCLE_SOFT_PROMPT);
    await completeLifecycleSubagents(pi, ctx, route);
    await validateSkillUsage(pi, ctx, route.requiredSkills);

    const terminal = await driveLifecycleToTerminal(pi, ctx);
    const state = latestCoreState(pi).gateController;

    assert.equal(state.phase, 'degraded');
    assert.match(String(terminal?.additionalContext ?? ''), /degraded|unverified|writing QA|未完成|降级/i);
    assert.doesNotMatch(String(terminal?.additionalContext ?? ''), /\bblocked\b/i);
  });

  await t.test('protected release and security gates', async () => {
    const { pi, ctx } = await startLifecycleRoute(LIFECYCLE_PROTECTED_PROMPT);
    const terminal = await driveLifecycleToTerminal(pi, ctx);
    const state = latestCoreState(pi).gateController;

    assert.equal(state.phase, 'blocked');
    assert.match(String(terminal?.additionalContext ?? ''), /blocked|security|release|protected|禁止发布|阻断/i);
  });
});

test('tool route probes cannot reset the current user-turn continuation budget', async () => {
  const { pi, ctx } = await startLifecycleRoute(LIFECYCLE_IMPLEMENTATION_PROMPT);
  await event(pi, 'session_stop')({}, ctx);
  const old = structuredClone(latestCoreState(pi).gateController);

  const rerouted = await probeLifecycleTask(
    pi,
    ctx,
    `${LIFECYCLE_IMPLEMENTATION_PROMPT} Keep the change narrowly scoped.`,
  );
  const afterToolActivation = structuredClone(latestCoreState(pi).gateController);

  assert.equal(old.budget.repairUsed, 1);
  assert.equal(rerouted.intent, 'implementation-with-tests');
  assert.equal(afterToolActivation.routeId, old.routeId);
  assert.deepEqual(afterToolActivation.budget, old.budget);
  assert.deepEqual(afterToolActivation.failures, old.failures);
});

test('a genuine before_agent_start user request resets route-local continuation state', async () => {
  const { pi, ctx } = await startLifecycleRoute(LIFECYCLE_IMPLEMENTATION_PROMPT);
  await event(pi, 'session_stop')({}, ctx);
  const old = structuredClone(latestCoreState(pi).gateController);

  const started = await event(pi, 'before_agent_start')({ prompt: LIFECYCLE_SOFT_PROMPT }, ctx);
  const reset = structuredClone(latestCoreState(pi).gateController);
  const firstNewStop = await event(pi, 'session_stop')({}, ctx);
  const afterNewStop = structuredClone(latestCoreState(pi).gateController);

  assert.equal(old.budget.repairUsed, 1);
  assert.equal(started.route.intent, 'writing.en');
  assert.notEqual(reset.routeId, old.routeId);
  assert.deepEqual(reset.budget, {
    repairUsed: 0,
    repairMax: 2,
    terminalUsed: 0,
    terminalMax: 1,
  });
  assert.deepEqual(reset.failures, {});
  assert.deepEqual(reset.openGates, {});
  assert.equal(reset.terminalReason, null);
  assert.equal(firstNewStop?.continue, true);
  assert.equal(afterNewStop.budget.repairUsed, 1);
});

test('classifier resolution updates the same route without replenishing GateController budget', async () => {
  const { pi, ctx } = await startLifecycleRoute(LIFECYCLE_IMPLEMENTATION_PROMPT);
  await event(pi, 'session_stop')({}, ctx);
  const before = latestCoreState(pi);

  const invalid = await tool(pi, 'omp_core_resolve_classification').execute(
    'gate-stress-invalid-classifier',
    { prompt: LIFECYCLE_IMPLEMENTATION_PROMPT, output: '{not-json' },
    undefined,
    undefined,
    ctx,
  );
  const after = latestCoreState(pi);

  assert.equal(invalid.details.ok, false);
  assert.equal(after.gateController.routeId, before.gateController.routeId);
  assert.deepEqual(after.gateController.budget, before.gateController.budget);
  assert.equal(after.classifierPreflight.required, false);
  assert.equal(after.classifierPreflight.mode, 'observe');
  assert.equal(after.classifierPreflight.attempted, true);
  assert.equal(after.classifierPreflight.failed, true);
});

test('all explicit failure envelopes remain failure evidence and never satisfy a gate', async (t) => {
  const failures = [
    ['status error', { status: 'error' }],
    ['status failed', { status: 'failed' }],
    ['status failure', { status: 'failure' }],
    ['status blocked', { status: 'blocked' }],
    ['ok false', { ok: false }],
    ['passed false', { passed: false }],
    ['isError true', { isError: true }],
    ['details status error', { details: { status: 'error' } }],
    ['details status failed', { details: { status: 'failed' } }],
    ['details status failure', { details: { status: 'failure' } }],
    ['details status blocked', { details: { status: 'blocked' } }],
    ['details ok false', { details: { ok: false } }],
    ['details passed false', { details: { passed: false } }],
    ['details isError true', { details: { isError: true } }],
  ];

  for (const [name, failure] of failures) {
    await t.test(name, async () => {
      const { pi, ctx } = await startLifecycleRoute(LIFECYCLE_IMPLEMENTATION_PROMPT);
      await event(pi, 'tool_result')({
        name: 'omp_test_gate',
        ...failure,
      }, ctx);

      const state = latestCoreState(pi);
      assert.equal(state.evidence.testingGate, false);
      assert.equal(state.evidence.toolFailures.some((item) => item.tool === 'omp_test_gate'), true);
    });
  }
});

test('failed tool results do not count as loop or gate evidence progress', async () => {
  const { pi, ctx } = await startLifecycleRoute(LIFECYCLE_IMPLEMENTATION_PROMPT);
  const repeated = [
    'I need to validate the same gate again.',
    'I need to validate the same gate again.',
    'I need to validate the same gate again.',
  ].join('\n');
  const aborted = await event(pi, 'assistant_delta')({ delta: repeated }, ctx);
  assert.equal(aborted?.abort, true);

  const before = latestCoreState(pi);
  await event(pi, 'tool_result')({
    name: 'omp_test_gate',
    status: 'failed',
  }, ctx);
  const after = latestCoreState(pi);

  assert.equal(before.loopGuard.recoveryPending, true);
  assert.equal(after.loopGuard.recoveryPending, true);
  assert.equal(after.gateController.evidenceRevision, before.gateController.evidenceRevision);
  assert.equal(after.evidence.testingGate, false);
});

test('final evidence is collected before the current stop decision and can close every gate', async () => {
  const { pi, ctx, route } = await startLifecycleRoute(LIFECYCLE_IMPLEMENTATION_PROMPT);
  await event(pi, 'tool_result')({
    name: 'omp_test_gate',
    details: {
      passed: true,
      command: 'node --test test/router.test.js',
      summary: 'router tests passed',
    },
  }, ctx);
  await recordPassingHostTest(pi, ctx, 'node --test test/router.test.js');

  const result = await event(pi, 'session_stop')({
    output: lifecycleFinalEvidence(route),
  }, ctx);
  const state = latestCoreState(pi);

  assert.notEqual(result?.continue, true);
  assert.equal(state.lastSkillUsage?.ok, true);
  assert.equal(state.lastSubagentUsage?.ok, true);
  assert.equal(state.evidence.testingGate, true);
  assert.equal(state.gateController.phase, 'satisfied');
  assert.deepEqual(state.gateController.openGates, {});
});

test('core adopts only current-route versioned Testing Enhancer evidence', async () => {
  const { pi, ctx, route } = await startLifecycleRoute(LIFECYCLE_IMPLEMENTATION_PROMPT);
  const active = latestCoreState(pi);
  const baseEvidence = {
    schemaVersion: 1,
    runId: 'testing-run-current',
    status: 'passed',
    pending: false,
    passed: true,
    failed: false,
    blockers: [],
    evidenceRevision: 1,
    updatedAt: active.routeStartedAt + 1,
  };

  pi.entries.push({
    type: 'custom',
    customType: 'omp-testing-enhancer.evidence',
    data: { ...baseEvidence, routeId: 'stale-route', evidenceDigest: 'a'.repeat(64) },
  });
  await event(pi, 'session_stop')({}, ctx);
  assert.equal(latestCoreState(pi).evidence.testingGate, false);

  await completeLifecycleSubagents(pi, ctx, route);
  await validateSkillUsage(pi, ctx, route.requiredSkills);
  await recordPassingHostTest(pi, ctx);
  pi.entries.push({
    type: 'custom',
    customType: 'omp-testing-enhancer.evidence',
    data: {
      ...baseEvidence,
      routeId: latestCoreState(pi).gateController.routeId,
      evidenceDigest: 'b'.repeat(64),
      evidenceRevision: 2,
    },
  });
  const released = await event(pi, 'session_stop')({ output: lifecycleFinalEvidence(route) }, ctx);
  const state = latestCoreState(pi);

  assert.notEqual(released?.continue, true);
  assert.equal(state.evidence.testingGate, true);
  assert.equal(state.evidence.testingEnhancerEvidence.runId, 'testing-run-current');
  assert.equal(state.gateController.phase, 'satisfied');
});

async function recordPassingHostTest(pi, ctx, command = 'npm test') {
  await event(pi, 'tool_result')({
    name: 'bash',
    params: { command },
    content: [{ type: 'text', text: '42 tests passed, 0 failed' }],
    isError: false,
  }, ctx);
}

async function startLifecycleRoute(prompt) {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext(pi.entries);
  await event(pi, 'session_start')({}, ctx);
  const started = await event(pi, 'before_agent_start')({ prompt }, ctx);
  assert.ok(started?.route, 'before_agent_start must establish the trusted lifecycle route');
  const route = started.route;
  return { pi, ctx, route };
}

async function probeLifecycleTask(pi, ctx, prompt) {
  const result = await tool(pi, 'omp_core_route_task').execute(
    `gate-stress-route-${pi.entries.length}`,
    { prompt, activate: true },
    undefined,
    undefined,
    ctx,
  );
  assert.equal(result.details.probe_only, true);
  assert.equal(result.details.state_changed, false);
  return result.details.route;
}

async function completeLifecycleSubagents(pi, ctx, route) {
  for (const required of route.requiredSubagents ?? []) {
    const agent = typeof required === 'string' ? required : required.agent;
    const skills = typeof required === 'string' ? [] : required.requiredSkills ?? [];
    await event(pi, 'tool_result')({
      name: 'task',
      params: {
        agent,
        prompt: [
          'OMP_PARENT_TASK: gate lifecycle stress test',
          'Required skills for this subagent:',
          ...(skills.length ? skills.map((skill) => `- ${skill}`) : ['- none']),
        ].join('\n'),
      },
      details: {
        status: 'completed',
        result: `SUBAGENT_RESULT\nAgent: ${agent}\nStatus: complete\nEvidence:\n- lifecycle stress fixture`,
      },
    }, ctx);
  }
}

async function driveLifecycleToTerminal(pi, ctx) {
  let terminal;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await event(pi, 'session_stop')({}, ctx);
    const phase = latestCoreState(pi).gateController.phase;
    if ((phase === 'degraded' || phase === 'blocked') && result?.continue === true) {
      terminal = result;
      break;
    }
  }
  assert.ok(terminal, 'route must reach one explicit terminal-only continuation within the bounded budget');
  return terminal;
}

function lifecycleFinalEvidence(route) {
  const requiredSubagents = (route.requiredSubagents ?? []).map((required) => (
    typeof required === 'string'
      ? { agent: required, requiredSkills: [] }
      : required
  ));
  return [
    'Done.',
    '',
    'SUBAGENT_USAGE:',
    ...requiredSubagents.map(({ agent, requiredSkills = [] }) =>
      `- ${agent}: ${requiredSkills.join(', ') || 'none'}`),
    '',
    skillUsageBlock(route.requiredSkills ?? []),
  ].join('\n');
}

function latestCoreState(pi) {
  const entry = [...pi.entries]
    .reverse()
    .find((candidate) => candidate.customType === 'omp-enhancer-core.state');
  assert.ok(entry?.data, 'expected a persisted omp-enhancer-core.state entry');
  return entry.data;
}
