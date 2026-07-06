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
  'Push the current release commit and upgrade marketplace plugins.',
  'Publish the plugin update to GitHub marketplace.',
  'Upgrade omp-enhancer-core@omp-enhancer after pushing main.',
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
  return profilePromptCases('failed workflow gate', async (profile, prompt) => {
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
    await forkSubagents(pi, ctx, profile);
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
      const { pi, ctx } = await startRuntime(prompt);
      await assertReleasedStops(pi, ctx, [{}, {}, { output: 'Done.' }]);
    },
  }));
}

function profilePromptCases(prefix, runCase, profileFilter = () => true) {
  return Object.entries(profiles).filter(([, profile]) => profileFilter(profile)).flatMap(([profileName, profile]) =>
    profile.prompts.map((prompt, index) => ({
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
  await event(pi, 'before_agent_start')({ prompt }, ctx);
  return { pi, ctx, entries };
}

async function forkSubagents(pi, ctx, profile, { includeSkills = true } = {}) {
  for (const [agent, skills] of Object.entries(profile.subagents)) {
    await event(pi, 'tool_result')(
      {
        name: 'task',
        params: {
          agent,
          prompt: includeSkills
            ? ['OMP_PARENT_TASK: gate stress routed task', 'Required skills for this subagent:', ...skills.map((skill) => `- ${skill}`)].join('\n')
            : 'Do the assigned work.',
        },
      },
      ctx,
    );
  }
}

async function runWorkflowGate(pi, ctx, profile) {
  if (profile.gateTool) await event(pi, 'tool_result')({ name: profile.gateTool }, ctx);
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
