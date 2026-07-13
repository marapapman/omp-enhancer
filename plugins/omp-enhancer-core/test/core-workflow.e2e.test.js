import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  assert.equal(routed.message.customType, 'omp-enhancer-core.workflow-guidance');
  assert.equal(routed.message.display, false);
  assert.equal(routed.message.attribution, 'agent');
  assert.match(routed.message.content, /PREFERRED NEXT TOOL:/);
  assert.match(routed.message.content, /WORKFLOW FIRST TOOL CALL:/);
  assert.match(routed.message.content, /never block tools or completion/i);

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

test('native host skill prompts provide every routed Chinese writing skill without a model read', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  const activeSkills = [
    {
      name: 'plain-chinese-writing',
      filePath: '/hidden/plain-chinese-writing/SKILL.md',
      disableModelInvocation: true,
    },
    {
      name: 'plain-chinese-writing',
      filePath: '/virtual/skills/plain-chinese-writing/SKILL.md',
      baseDir: '/virtual/skills/plain-chinese-writing',
    },
    {
      name: 'zh-writing-polish',
      filePath: '/virtual/skills/zh-writing-polish/SKILL.md',
      baseDir: '/virtual/skills/zh-writing-polish',
    },
  ];
  const built = [];
  pi.pi = {
    SKILL_PROMPT_MESSAGE_TYPE: 'skill-prompt',
    getActiveSkills: () => activeSkills,
    buildSkillPromptMessage: async (skill, args, invocation) => {
      built.push({ name: skill.name, args, invocation });
      return {
        message: `AUTOLOADED SKILL: ${skill.name}`,
        details: {
          name: skill.name,
          path: skill.filePath,
          lineCount: 10,
        },
      };
    },
  };
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries);
  const prompt = '克制润色以下中文段落，不修改文件：本文可能显著提升系统可靠性。';

  await event(pi, 'session_start')({}, ctx);
  const routed = await event(pi, 'before_agent_start')({ prompt }, ctx);

  assert.equal(routed.route.intent, 'writing.zh');
  assert.deepEqual(built, [
    { name: 'plain-chinese-writing', args: '', invocation: 'autoload' },
    { name: 'zh-writing-polish', args: '', invocation: 'autoload' },
  ]);
  assert.equal(routed.message.customType, 'skill-prompt');
  assert.equal(routed.message.display, false);
  assert.equal(routed.message.attribution, 'agent');
  assert.equal(routed.message.details.provisionProvider, 'omp-enhancer-core');
  assert.equal(routed.message.details.provisionSchemaVersion, 1);
  assert.deepEqual(routed.message.details.routedSkills, [
    'plain-chinese-writing',
    'zh-writing-polish',
  ]);
  assert.deepEqual(routed.message.details.providedSkillRecords, [
    {
      requestedSkill: 'plain-chinese-writing',
      name: 'plain-chinese-writing',
      path: '/virtual/skills/plain-chinese-writing/SKILL.md',
    },
    {
      requestedSkill: 'zh-writing-polish',
      name: 'zh-writing-polish',
      path: '/virtual/skills/zh-writing-polish/SKILL.md',
    },
  ]);
  assert.match(routed.message.content, /AUTOLOADED SKILL: plain-chinese-writing/);
  assert.match(routed.message.content, /AUTOLOADED SKILL: zh-writing-polish/);
  assert.match(routed.message.content, /OMP WORKFLOW AND SKILL DISCOVERY FIRST/);
  assert.match(routed.message.content, /Matching routed skills found in the active inventory:.*skill:\/\/plain-chinese-writing.*skill:\/\/zh-writing-polish/i);
  assert.doesNotMatch(routed.message.content, /\/hidden\/plain-chinese-writing/);
  assert.match(routed.message.content, /Memory, general model ability, and a managed skill created after the task are not substitutes/i);
  assert.doesNotMatch(routed.message.content, /ROUTED SKILLS ALREADY PROVIDED/);
  assert.doesNotMatch(routed.message.content, /WORKFLOW FIRST TOOL CALL/);
  assert.match(routed.additionalContext, /Routed workflow skills already loaded/);
  assert.match(routed.additionalContext, /plugin does not block a different call/i);

  const snapshot = entries.findLast(
    (entry) => entry.customType === 'omp-enhancer-core.state',
  ).data;
  assert.deepEqual(snapshot.observedSkills, []);
  assert.deepEqual(snapshot.providedSkills.sort(), [
    'plain-chinese-writing',
    'zh-writing-polish',
  ]);

  const status = await tool(pi, 'omp_core_subagent_status').execute(
    'native-skill-status',
    {},
    undefined,
    undefined,
    ctx,
  );
  assert.deepEqual(status.details.status.observed_skills, []);
  assert.deepEqual(status.details.status.provided_skills.sort(), [
    'plain-chinese-writing',
    'zh-writing-polish',
  ]);
  assert.deepEqual(status.details.status.loaded_skills.sort(), [
    'plain-chinese-writing',
    'zh-writing-polish',
  ]);
});

test('native Chinese skill provisioning is all-or-nothing and falls back without blocking', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  pi.pi = {
    SKILL_PROMPT_MESSAGE_TYPE: 'skill-prompt',
    getActiveSkills: () => [
      { name: 'plain-chinese-writing', filePath: '/skills/plain-chinese-writing/SKILL.md' },
      { name: 'zh-writing-polish', filePath: '/skills/zh-writing-polish/SKILL.md' },
    ],
    buildSkillPromptMessage: async (skill) => (
      skill.name === 'zh-writing-polish'
        ? { message: 'partial body without details' }
        : {
          message: 'base skill body',
          details: { name: skill.name, path: skill.filePath, lineCount: 5 },
        }
    ),
  };
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries);

  await event(pi, 'session_start')({}, ctx);
  const routed = await event(pi, 'before_agent_start')({
    prompt: '克制润色以下中文段落，不修改文件：本方法具有较好效果。',
  }, ctx);

  assert.equal(routed.message.customType, 'omp-enhancer-core.workflow-guidance');
  assert.equal(routed.message.attribution, 'agent');
  assert.match(routed.message.content, /WORKFLOW FIRST TOOL CALL/);
  assert.notEqual(routed.block, true);
  const snapshot = entries.findLast(
    (entry) => entry.customType === 'omp-enhancer-core.state',
  ).data;
  assert.deepEqual(snapshot.observedSkills, []);
  assert.deepEqual(snapshot.providedSkills, []);
  assert.equal(await event(pi, 'session_stop')({ output: 'Fallback completed.' }, ctx), undefined);
});

test('native provisioning prefers an exact project skill and never substitutes a packaged alias', async () => {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'omp-native-project-skill-'));
  const projectSkillFile = join(workspaceRoot, 'skills', 'superpowers-writing-plans', 'SKILL.md');
  mkdirSync(join(workspaceRoot, 'skills', 'superpowers-writing-plans'), { recursive: true });
  writeFileSync(projectSkillFile, [
    '---',
    'name: superpowers-writing-plans',
    'description: Project planning workflow',
    '---',
    '# Project plan',
  ].join('\n'));

  try {
    const projectSkill = { name: 'superpowers-writing-plans', filePath: projectSkillFile };
    const packagedSkill = { name: 'writing-plans', filePath: '/packaged/writing-plans/SKILL.md' };
    const entries = [];
    const pi = new FakePi(entries);
    const built = [];
    pi.pi = {
      SKILL_PROMPT_MESSAGE_TYPE: 'skill-prompt',
      getActiveSkills: () => [packagedSkill, projectSkill],
      buildSkillPromptMessage: async (skill, args, invocation) => {
        built.push({ skill, args, invocation });
        return {
          message: `PROJECT SKILL: ${skill.name}`,
          details: { name: skill.name, path: skill.filePath, lineCount: 5 },
        };
      },
    };
    registerCoreEnhancer(pi);
    const ctx = extensionContext(entries, workspaceRoot);
    await event(pi, 'session_start')({}, ctx);
    const routed = await event(pi, 'before_agent_start')({
      prompt: '为修复路由问题制定具体计划，不修改文件，不运行测试。',
    }, ctx);

    assert.equal(routed.route.intent, 'planning');
    assert.equal(routed.message.customType, 'skill-prompt');
    assert.equal(built.length, 1);
    assert.equal(built[0].skill.filePath, projectSkillFile);
    assert.equal(built[0].args, '');
    assert.equal(built[0].invocation, 'autoload');
    assert.deepEqual(routed.message.details.routedSkills, ['writing-plans']);
    assert.deepEqual(routed.message.details.providedSkillRecords, [{
      requestedSkill: 'writing-plans',
      name: 'superpowers-writing-plans',
      path: projectSkillFile,
    }]);
    assert.deepEqual(entries.findLast(
      (entry) => entry.customType === 'omp-enhancer-core.state',
    ).data.providedSkills, ['superpowers-writing-plans']);

    const fallbackEntries = [];
    const fallbackPi = new FakePi(fallbackEntries);
    let packagedBuilds = 0;
    fallbackPi.pi = {
      SKILL_PROMPT_MESSAGE_TYPE: 'skill-prompt',
      getActiveSkills: () => [packagedSkill],
      buildSkillPromptMessage: async () => {
        packagedBuilds += 1;
        return { message: 'wrong fallback', details: { name: 'writing-plans' } };
      },
    };
    registerCoreEnhancer(fallbackPi);
    const fallbackCtx = extensionContext(fallbackEntries, workspaceRoot);
    await event(fallbackPi, 'session_start')({}, fallbackCtx);
    const fallback = await event(fallbackPi, 'before_agent_start')({
      prompt: '为修复路由问题制定具体计划，不修改文件，不运行测试。',
    }, fallbackCtx);

    assert.equal(packagedBuilds, 0);
    assert.equal(fallback.message.customType, 'omp-enhancer-core.workflow-guidance');
    assert.match(fallback.message.content, /skills\/superpowers-writing-plans\/SKILL\.md/);
    assert.deepEqual(fallbackEntries.findLast(
      (entry) => entry.customType === 'omp-enhancer-core.state',
    ).data.providedSkills, []);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('missing native skill APIs use the advisory workflow fallback', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  let inventoryReads = 0;
  pi.pi = {
    getActiveSkills: () => {
      inventoryReads += 1;
      return [{ name: 'writing-review', filePath: '/skills/writing-review/SKILL.md' }];
    },
    buildSkillPromptMessage: async () => ({
      message: 'unused',
      details: { name: 'writing-review' },
    }),
  };
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries);
  await event(pi, 'session_start')({}, ctx);
  const routed = await event(pi, 'before_agent_start')({
    prompt: 'Review this English paragraph for clarity: This result is very significant.',
  }, ctx);

  assert.equal(inventoryReads, 1);
  assert.equal(routed.message.customType, 'omp-enhancer-core.workflow-guidance');
  assert.equal(routed.message.attribution, 'agent');
  assert.match(routed.additionalContext, /Current active skill inventory: skill:\/\/writing-review/i);
  assert.notEqual(routed.block, true);
  assert.equal(await event(pi, 'session_stop')({ output: 'Done.' }, ctx), undefined);
});

test('skills disabled for model invocation are neither advertised nor autoloaded', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  let builds = 0;
  pi.pi = {
    SKILL_PROMPT_MESSAGE_TYPE: 'skill-prompt',
    getActiveSkills: () => [{
      name: 'writing-review',
      filePath: '/hidden/writing-review/SKILL.md',
      disableModelInvocation: true,
    }],
    buildSkillPromptMessage: async () => {
      builds += 1;
      return { message: 'must not load', details: { name: 'writing-review' } };
    },
  };
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries);
  await event(pi, 'session_start')({}, ctx);
  const routed = await event(pi, 'before_agent_start')({
    prompt: 'Review this English paragraph for clarity: This result is significant.',
  }, ctx);

  assert.equal(routed.route.intent, 'writing.en');
  assert.equal(builds, 0);
  assert.equal(routed.message.customType, 'omp-enhancer-core.workflow-guidance');
  assert.doesNotMatch(routed.additionalContext, /Current active skill inventory:.*writing-review/i);
  assert.deepEqual(entries.findLast(
    (entry) => entry.customType === 'omp-enhancer-core.state',
  ).data.providedSkills, []);
});

test('a pending Introduction polish selects and provides the English LaTeX skill after the source read', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  const activeSkills = [
    { name: 'writing-markdown-helper', filePath: '/skills/writing-markdown-helper/SKILL.md' },
    { name: 'writing-review', filePath: '/hidden/writing-review/SKILL.md', disableModelInvocation: true },
    { name: 'writing-review', filePath: '/skills/writing-review/SKILL.md' },
    { name: 'writing-checkers', filePath: '/skills/writing-checkers/SKILL.md' },
  ];
  const built = [];
  pi.pi = {
    SKILL_PROMPT_MESSAGE_TYPE: 'skill-prompt',
    getActiveSkills: () => activeSkills,
    buildSkillPromptMessage: async (skill, args, invocation) => {
      built.push({ name: skill.name, path: skill.filePath, args, invocation });
      return {
        message: `AUTOLOADED SKILL: ${skill.name}`,
        details: { name: skill.name, path: skill.filePath, lineCount: 8 },
      };
    },
  };
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries);
  const prompt = '阻塞已解除。开始逐节润色。先从 Introduction 开始。';

  await event(pi, 'session_start')({}, ctx);
  const initial = await event(pi, 'before_agent_start')({ prompt }, ctx);
  assert.equal(initial.route.intent, 'writing.pending');
  assert.deepEqual(built, []);
  assert.match(initial.additionalContext, /Workflow and skill discovery first/);

  const unrelated = await event(pi, 'tool_result')({
    name: 'read',
    callId: 'read-agents',
    input: { path: 'AGENTS.md' },
    result: { content: [{ type: 'text', text: 'Repository instructions written in English.' }] },
  }, ctx);
  assert.doesNotMatch(unrelated.content.at(-1).text, /AUTOLOADED SKILL/);
  assert.equal(entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data.lastRoute.intent, 'writing.pending');

  const partial = await event(pi, 'tool_result')({
    name: 'read',
    callId: 'read-introduction-partial',
    input: { path: 'tex/introduction.tex' },
    result: {
      details: { truncated: true },
      content: [{ type: 'text', text: '\\section{Introduction}\nPartial English prose.' }],
    },
  }, ctx);
  assert.doesNotMatch(partial.content.at(-1).text, /AUTOLOADED SKILL/);
  assert.equal(entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data.lastRoute.intent, 'writing.pending');

  const refined = await event(pi, 'tool_result')({
    name: 'read',
    callId: 'read-introduction',
    input: { path: 'tex/introduction.tex' },
    result: {
      content: [{
        type: 'text',
        text: '\\section{Introduction}\nThis paper introduces the problem and summarizes the contributions.',
      }],
    },
  }, ctx);

  assert.deepEqual(built, [
    { name: 'writing-review', path: '/skills/writing-review/SKILL.md', args: '', invocation: 'autoload' },
  ]);
  assert.match(refined.content.at(-1).text, /body language is en; workflow is writing\.latex/i);
  assert.match(refined.content.at(-1).text, /AUTOLOADED SKILL: writing-review/);
  assert.match(refined.content.at(-1).text, /before revising or reviewing the target/i);
  assert.doesNotMatch(refined.content.at(-1).text, /writing-markdown-helper[\s\S]*AUTOLOADED SKILL: writing-markdown-helper/i);
  assert.notEqual(refined.block, true);

  const snapshot = entries.findLast(
    (entry) => entry.customType === 'omp-enhancer-core.state',
  ).data;
  assert.equal(snapshot.lastRoute.intent, 'writing.en');
  assert.equal(snapshot.lastRoute.workflowRoute, 'writing.latex');
  assert.deepEqual(snapshot.lastRoute.routePlan.skills, ['writing-review']);
  assert.deepEqual(snapshot.providedSkills, ['writing-review']);
  assert.equal(await event(pi, 'session_stop')({ output: 'Introduction polished.' }, ctx), undefined);
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

function extensionContext(entries = [], cwd = process.cwd()) {
  return {
    cwd,
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
