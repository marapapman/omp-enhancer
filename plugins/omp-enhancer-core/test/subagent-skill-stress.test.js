import test from 'node:test';
import assert from 'node:assert/strict';

import registerCoreEnhancer from '../index.js';
import { buildGovernancePromptFragment, buildSubagentPromptFragment } from '../src/governance.js';
import { routeNaturalLanguageTask } from '../src/router.js';
import { validateSubagentUsage } from '../src/subagent-usage.js';

const expectedByIntent = {
  'writing.zh': {
    requiredSkills: ['plain-chinese-writing', 'zh-writing-polish', 'zh-writing-checkers'],
    subagents: {
      'zh-writer': ['plain-chinese-writing', 'zh-writing-polish'],
      'zh-checker': ['plain-chinese-writing', 'zh-writing-checkers'],
    },
  },
  'writing.en': {
    requiredSkills: ['writing-markdown-helper', 'writing-checkers'],
    subagents: {
      writer: ['writing-markdown-helper'],
      checker: ['writing-checkers'],
    },
  },
  testing: {
    requiredSkills: ['test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
    subagents: {
      'ecc-tdd-guide': ['test-driven-development'],
      'ecc-pr-test-analyzer': ['verification-before-completion'],
    },
  },
  'implementation-with-tests': {
    requiredSkills: ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
    subagents: {
      plan: ['brainstorming', 'subagent-driven-development'],
      task: ['test-driven-development', 'verification-before-completion'],
      reviewer: ['verification-before-completion'],
    },
  },
  'security-review': {
    requiredSkills: ['ecc/security-review', 'ecc/security-scan'],
    subagents: {
      'ecc-security-reviewer': ['ecc/security-review', 'ecc/security-scan'],
      reviewer: ['ecc/security-review'],
    },
  },
  'config-assets': {
    requiredSkills: [],
    subagents: {
      librarian: [],
      reviewer: [],
    },
  },
  diagnosis: {
    requiredSkills: [],
    subagents: {},
  },
  release: {
    requiredSkills: [],
    subagents: {},
  },
  unknown: {
    requiredSkills: [],
    subagents: {},
  },
};

const workloadSuites = {
  'writing.zh': [
    '请把这段中文论文摘要改得更平实。',
    '帮我润色博士论文引言，去掉翻译腔。',
    '请起草一份中文项目报告。',
    '把这句话改成朴素直接的中文。',
    '请检查这段中文相关工作的逻辑表达。',
    '帮我写一段中文审稿回复。',
    '请润色下面的中文段落。',
    '把这段话改得少一点 AI 味。',
    '请起草中文文档的开头。',
    '帮我改写中文摘要，让它更自然。',
    '请写一份中文实验报告。',
    '润色中文申请材料里的研究计划段落。',
    '把下面文字改成博士论文风格但更平直。',
    '请检查中文论文段落是否有翻译腔。',
    '帮我起草中文相关工作小节。',
    '请写一份测试覆盖率报告，说明当前风险。',
    '帮我把这段中文 release note 写得更直接。',
    '请把下面说明改成自然中文，不要改代码。',
  ],
  'writing.en': [
    'Draft an English related work paragraph for a systems paper.',
    'Write a concise project report in English.',
    'Revise this manuscript abstract for clarity.',
    'Polish the paragraph and check the wording.',
    'Edit the proposal summary for a technical audience.',
    'Improve this release notes paragraph without publishing anything.',
    'Draft a changelog entry for the plugin fix.',
    'Write an email summarizing the test results.',
    'Revise the paper introduction and improve style.',
    'Polish the report conclusion for readability.',
    'Draft an English letter explaining the release.',
    'Edit this abstract for logic and flow.',
    'Improve the manuscript paragraph without changing claims.',
    'Write a short proposal summary.',
    'Draft release notes for the plugin changelog without publishing anything.',
    'Revise the report section about browser evidence.',
    'Improve this email about marketplace upgrade status.',
    'Edit the manuscript paragraph that mentions API stability.',
  ],
  testing: [
    'Write tests for src/router.js around fallback behavior.',
    'Add tests for classifier routing confidence thresholds.',
    'Create regression tests for the skill gate parser.',
    'Run unit tests for the marketplace release script.',
    'Execute the browser smoke tests and report failures.',
    'Review test flakiness around the browser smoke suite.',
    'Check coverage gaps in the router tests.',
    'Analyze flaky e2e failures in Playwright.',
    'Run the testing workflow and summarize the gate result.',
    '为 src/router.js 写高信号单元测试。',
    '补测试覆盖 skill usage 的错误路径。',
    '检查浏览器回归测试为什么失败。',
    '运行测试门禁并报告结果。',
    '分析覆盖率缺口，不要改实现。',
    '审查测试是否覆盖 marketplace upgrade。',
    'Review the mutation test report and list weak assertions.',
    'Execute unit tests for the core plugin and summarize failures.',
    'Check whether the new tests cover subagent evidence parsing.',
  ],
  'implementation-with-tests': [
    'Implement classifier fallback handling and add tests.',
    'Fix the plugin gate bug and add regression tests.',
    'Modify the marketplace release logic and test it.',
    'Refactor the router code with focused unit tests.',
    'Build the config workflow and cover error paths.',
    'Update the hook workflow and add regression tests.',
    'Implement API route detection for plugin tasks.',
    'Fix code that mishandles final evidence.',
    'Modify the config doctor logic and add tests.',
    '实现自然语言路由并补测试。',
    '修复插件门禁状态恢复 bug。',
    '修改 marketplace 发布逻辑并补测试。',
    '重构配置资产扫描逻辑。',
    '开发新的 hook 修复流程。',
    '优化代码路径并补充回归测试。',
    'Fix subagent skill assignment handling and add coverage.',
    'Implement exact skill validation for task prompts.',
    'Update governance prompt generation and test all roles.',
  ],
  'security-review': [
    'Review this API handler for auth bypass and injection risks.',
    'Audit the file download route for path traversal.',
    'Check this Express code for SSRF vulnerabilities.',
    'Review token handling for secret leakage.',
    'Analyze authentication and authorization risks in this middleware.',
    'Audit the plugin hook for command injection.',
    'Review OAuth callback handling for security issues.',
    'Check whether user input can trigger XSS.',
    'Assess dependency vulnerability impact in this package.',
    '审查这段代码是否有权限绕过。',
    '检查文件读取接口的路径穿越风险。',
    '分析这个 hook 是否会泄露密钥。',
    '审查认证逻辑里的安全问题。',
    '检查用户输入是否可能造成注入。',
    '评估插件发布流程里的 secret 风险。',
    'Review the config loader for unsafe path expansion.',
    'Audit marketplace install hooks for command execution risk.',
    'Analyze whether session state restoration leaks secrets.',
  ],
  'config-assets': [
    'List packaged omp-config assets and hooks.',
    'Inspect config assets shipped by the plugin.',
    'Check the omp-config skill asset inventory.',
    'Show marketplace config asset paths.',
    'Review bundled hooks and templates in omp-config.',
    'List all packaged agents and skills from config assets.',
    'Inspect the plugin config templates.',
    'Check whether config assets include model overrides.',
    'Show packaged hooks without applying them.',
    '检查 omp-config 打包的配置资产。',
    '列出插件里的 config assets 和 hooks。',
    '检查配置模板和技能清单。',
    '查看 marketplace 注册的配置资产。',
    '列出打包后的 agents 和 skills。',
    '检查 omp-config 的模型覆盖模板。',
    'Inspect packaged assets for modelRoles and hooks.',
    'List marketplace skill paths for omp-config.',
    'Review config asset inventory before upgrade.',
  ],
  diagnosis: [
    '为什么 SKILL_USAGE validation 一直失败？先诊断原因，不要改代码。',
    '只诊断这个 Warning 是什么导致的。',
    '排查 gate 为什么反复打开，不要修改代码。',
    '定位 session state 丢失的根因，先不要修复。',
    '解释这个 failed validation 的 root cause。',
    'Why does the validator keep failing? Diagnosis only.',
    'Find the root cause of the missing content array warning.',
    'Investigate why session_stop repeats without changing files.',
    'Diagnose the marketplace upgrade failure first.',
    'What caused this test gate failure? Do not fix yet.',
    '只分析为什么 subagent usage 没有通过。',
    '定位工具返回 invalid result 的原因。',
  ],
  release: [
    'Push the current release commit and upgrade marketplace plugins.',
    'Publish the plugin update to GitHub marketplace.',
    'Upgrade omp-enhancer-core@omp-enhancer after pushing main.',
    'Run marketplace update and plugin upgrade for the release.',
    'Push to GitHub and refresh the omp-enhancer marketplace.',
    'Ship the plugin release after packaging checks.',
    'Create a release for the current plugin version.',
    'Upgrade the installed plugin from marketplace.',
    'Publish current changes and verify plugin upgrade.',
    '推送当前提交到 GitHub 并升级 marketplace 插件。',
    '发布插件版本并刷新 marketplace。',
    '升级 omp-config@omp-enhancer 到最新版本。',
  ],
  unknown: [
    'What is the capital of France?',
    'Who is the author of Hamlet?',
    'What is an API?',
    'What does bug mean in English?',
    'What is a unit test?',
    'What is a browser?',
    'What is a report?',
    'Define authentication in one sentence.',
    'The report is due tomorrow.',
    'The browser history was deleted yesterday.',
    'GitHub release 是什么？简单解释一下。',
    '今天下午三点提醒我给妈妈打电话。',
  ],
};

const workloadCases = Object.entries(workloadSuites).flatMap(([intent, prompts]) =>
  prompts.map((prompt, index) => ({ name: `${intent} ${index + 1}`, intent, prompt })),
);

const allProfileSkills = [
  'plain-chinese-writing',
  'zh-writing-polish',
  'zh-writing-checkers',
  'writing-markdown-helper',
  'writing-checkers',
  'writing-plans',
  'brainstorming',
  'test-driven-development',
  'subagent-driven-development',
  'verification-before-completion',
  'ecc/security-review',
  'ecc/security-scan',
];

test('subagent skill routing stress matrix covers at least 100 workloads with exact role skills', () => {
  assert.equal(workloadCases.length >= 100, true, `expected at least 100 workloads, got ${workloadCases.length}`);

  const failures = [];
  for (const { name, prompt, intent } of workloadCases) {
    try {
      const route = routeNaturalLanguageTask({ prompt });
      const expected = expectedByIntent[intent];

      assert.equal(route.intent, intent, name);
      assert.deepEqual(route.requiredSkills, expected.requiredSkills, `${name} root skills`);
      assert.deepEqual(subagentSkillMap(route), expected.subagents, `${name} subagent skills`);
      assertGovernanceContracts(route, name);
      assertSubagentLaunchContracts(route, name);
      assertSubagentUsageValidation(route, name);
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
    }
  }

  assert.deepEqual(failures, []);
});

test('runtime subagent gate blocks task prompts with unexpected skill assignments', async () => {
  const representatives = Object.entries(workloadSuites)
    .filter(([intent]) => Object.keys(expectedByIntent[intent].subagents).length)
    .map(([intent, prompts]) => ({ intent, prompt: prompts[0] }));

  for (const { intent, prompt } of representatives) {
    const { pi, ctx } = await startRuntime(prompt);
    const route = routeNaturalLanguageTask({ prompt });
    const first = route.requiredSubagents[0];
    const unexpected = unexpectedSkillFor(first.requiredSkills);

    for (const subagent of route.requiredSubagents) {
      await event(pi, 'tool_result')({
        name: 'task',
        params: {
          agent: subagent.agent,
          prompt: assignmentPrompt(
            subagent.agent,
            subagent.agent === first.agent
              ? [...subagent.requiredSkills, unexpected]
              : subagent.requiredSkills,
          ),
        },
      }, ctx);
    }

    const blocked = await event(pi, 'session_stop')({}, ctx);
    assert.equal(blocked?.continue, true, intent);
    assert.match(blocked.additionalContext, /Unexpected subagent skill assignments/, intent);
    assert.match(blocked.additionalContext, new RegExp(escapeRegExp(unexpected)), intent);
  }
});

function assertGovernanceContracts(route, name) {
  const fragment = buildGovernancePromptFragment({ route });

  for (const { agent, requiredSkills } of route.requiredSubagents) {
    assert.match(fragment, new RegExp(`OMP_REQUIRED_SUBAGENT: ${escapeRegExp(agent)}`), `${name} ${agent} prefork marker`);
    assert.match(fragment, new RegExp(`- ${escapeRegExp(agent)}: ${escapeRegExp(requiredSkills.join(', ') || 'none')}`), `${name} ${agent} evidence line`);
    for (const skill of requiredSkills) {
      assert.match(fragment, new RegExp(`- ${escapeRegExp(skill)}`), `${name} ${agent} required skill ${skill}`);
    }
  }

  if (!route.requiredSubagents.length) {
    assert.doesNotMatch(fragment, /OMP_REQUIRED_SUBAGENT:/, `${name} should not force subagents`);
  }
}

function assertSubagentLaunchContracts(route, name) {
  for (const { agent, requiredSkills } of route.requiredSubagents) {
    const fragment = buildSubagentPromptFragment({ prompt: assignmentPrompt(agent, requiredSkills) });

    assert.match(fragment, new RegExp(`Subagent:\\s*${escapeRegExp(agent)}`), `${name} ${agent}`);
    for (const skill of requiredSkills) {
      assert.match(fragment, new RegExp(`- ${escapeRegExp(skill)}`), `${name} ${agent} includes ${skill}`);
    }

    const forbidden = allProfileSkills.filter((skill) => !requiredSkills.includes(skill));
    for (const skill of forbidden) {
      assert.doesNotMatch(fragment, new RegExp(`^- ${escapeRegExp(skill)}$`, 'm'), `${name} ${agent} must not include ${skill}`);
    }
  }
}

function assertSubagentUsageValidation(route, name) {
  const accepted = validateSubagentUsage({
    requiredSubagents: route.requiredSubagents,
    output: usageBlock(route.requiredSubagents),
  });
  assert.equal(accepted.ok, true, `${name} accepts exact subagent skills`);

  const firstWithSkills = route.requiredSubagents.find(({ requiredSkills }) => requiredSkills.length);
  if (firstWithSkills) {
    const missing = validateSubagentUsage({
      requiredSubagents: route.requiredSubagents,
      output: usageBlock(route.requiredSubagents.map((item) => (
        item.agent === firstWithSkills.agent
          ? { ...item, requiredSkills: item.requiredSkills.slice(0, -1) }
          : item
      ))),
    });
    assert.equal(missing.ok, false, `${name} rejects missing skill`);
    assert.deepEqual(missing.missingSkills[0], {
      agent: firstWithSkills.agent,
      skills: [firstWithSkills.requiredSkills.at(-1)],
    }, `${name} missing skill detail`);
  }

  const first = route.requiredSubagents[0];
  if (first) {
    const unexpected = unexpectedSkillFor(first.requiredSkills);
    const wrong = validateSubagentUsage({
      requiredSubagents: route.requiredSubagents,
      output: usageBlock(route.requiredSubagents.map((item) => (
        item.agent === first.agent
          ? { ...item, requiredSkills: [...item.requiredSkills, unexpected] }
          : item
      ))),
    });
    assert.equal(wrong.ok, false, `${name} rejects unexpected skill`);
    assert.deepEqual(wrong.unexpectedSkills[0], {
      agent: first.agent,
      skills: [unexpected],
    }, `${name} unexpected skill detail`);
  }
}

function subagentSkillMap(route) {
  return Object.fromEntries(route.requiredSubagents.map(({ agent, requiredSkills }) => [agent, requiredSkills]));
}

function assignmentPrompt(agent, skills) {
  return [
    `OMP_REQUIRED_SUBAGENT: ${agent}`,
    'Required skills for this subagent:',
    ...(skills.length ? skills.map((skill) => `- ${skill}`) : ['- none']),
    '',
    'Assignment: complete the specialist task and report evidence.',
  ].join('\n');
}

function usageBlock(subagents) {
  return [
    'SUBAGENT_USAGE',
    'Required:',
    ...subagents.map(({ agent, requiredSkills }) => `- ${agent}: ${requiredSkills.join(', ') || 'none'}`),
    'Forked:',
    ...subagents.map(({ agent, requiredSkills }) => `- ${agent}: ${requiredSkills.join(', ') || 'none'}`),
  ].join('\n');
}

function unexpectedSkillFor(requiredSkills = []) {
  return allProfileSkills.find((skill) => !requiredSkills.includes(skill)) ?? 'unexpected-skill';
}

async function startRuntime(prompt) {
  const entries = [];
  const pi = new FakePi(entries);
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries);
  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')({ prompt }, ctx);
  return { pi, ctx };
}

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

  on(name, handler) {
    this.eventHandlers.push({ name, event: name, handler });
  }

  appendEntry(customType, data) {
    this.entries.push({ type: 'custom', customType, data });
  }
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
