import test from 'node:test';
import assert from 'node:assert/strict';

import registerCoreEnhancer from '../index.js';

class FakePi {
  constructor() {
    this.labels = [];
    this.tools = new Map();
    this.commands = new Map();
    this.eventHandlers = [];
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
}

test('registers core tools and hooks without slash commands', () => {
  const pi = new FakePi();

  registerCoreEnhancer(pi);

  assert.deepEqual(pi.labels, ['OMP Enhancer Core']);
  assert.deepEqual([...pi.tools.keys()], [
    'omp_core_route_task',
    'omp_core_validate_skill_usage',
    'omp_core_validate_subagent_usage',
    'omp_core_governance_prompt',
  ]);
  assert.equal([...pi.tools.values()].every((tool) => typeof tool.execute === 'function'), true);
  assert.deepEqual(pi.eventHandlers.map((handler) => handler.event), [
    'session_start',
    'before_agent_start',
    'tool_result',
    'session_stop',
  ]);
  assert.deepEqual([...pi.commands.keys()], []);
});

test('before_agent_start injects governance context and routes natural-language prompts', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  const agentEvent = { prompt: '请写一份项目报告' };

  const result = await event(pi, 'before_agent_start')(agentEvent, ctx);
  const fragment = governanceText(result, agentEvent);

  assert.match(fragment, /Mandatory Skill Workflow/);
  assert.match(fragment, /Mandatory Subagent Workflow/);
  assert.match(fragment, /plain-chinese-writing/);
  assert.match(fragment, /zh-writer/);

  const stopResult = await event(pi, 'session_stop')({}, ctx);

  assert.equal(stopResult?.continue, true);
  assert.match(stopResult.additionalContext, /subagent|zh-writer|zh-checker/);
});

test('session_stop continues when a routed writing task has not run writing QA', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-1',
    { prompt: '请润色这段中文论文摘要，检查逻辑和表达。' },
    undefined,
    undefined,
    ctx,
  );
  await forkSubagents(pi, ctx, ['zh-writer', 'zh-checker']);

  const result = await event(pi, 'session_stop')({}, ctx);

  assert.equal(result?.continue, true);
  assert.match(result.additionalContext, /writing QA|writing_quality_check|writing_logic_check/);
  assert.match(result.additionalContext, /plain-chinese-writing|SKILL_USAGE/);
});

test('session_stop requires successful SKILL_USAGE validation even after writing QA', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-writing-route',
    { prompt: '请润色这段中文论文摘要，检查逻辑和表达。' },
    undefined,
    undefined,
    ctx,
  );
  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);
  await forkSubagents(pi, ctx, ['zh-writer', 'zh-checker']);

  await tool(pi, 'omp_core_validate_skill_usage').execute(
    'call-invalid-skill-usage',
    {
      output: [
        'SKILL_USAGE',
        'Required:',
        '- plain-chinese-writing',
        '- zh-writing-polish',
        '- zh-writing-checkers',
        'Loaded:',
        '- plain-chinese-writing',
      ].join('\n'),
    },
    undefined,
    undefined,
    ctx,
  );

  const blocked = await event(pi, 'session_stop')({}, ctx);

  assert.equal(blocked?.continue, true);
  assert.match(blocked.additionalContext, /SKILL_USAGE/);

  await tool(pi, 'omp_core_validate_skill_usage').execute(
    'call-valid-skill-usage',
    {
      output: [
        'SKILL_USAGE',
        'Required:',
        '- plain-chinese-writing',
        '- zh-writing-polish',
        '- zh-writing-checkers',
        'Loaded:',
        '- plain-chinese-writing',
        '- zh-writing-polish',
        '- zh-writing-checkers',
      ].join('\n'),
    },
    undefined,
    undefined,
    ctx,
  );

  const released = await event(pi, 'session_stop')({}, ctx);

  assert.notEqual(released?.continue, true);
});

test('session_stop ignores prior route SKILL_USAGE and tool evidence after routing a new Chinese writing task', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-testing-route',
    { prompt: '为 src/router.js 写高信号单元测试，覆盖边界和错误路径。' },
    undefined,
    undefined,
    ctx,
  );
  await forkSubagents(pi, ctx, ['ecc-tdd-guide', 'ecc-pr-test-analyzer']);
  await event(pi, 'tool_result')({ name: 'omp_test_gate' }, ctx);
  await tool(pi, 'omp_core_validate_skill_usage').execute(
    'call-testing-skill-usage',
    {
      output: [
        'SKILL_USAGE',
        'Required:',
        '- test-driven-development',
        '- subagent-driven-development',
        '- verification-before-completion',
        'Loaded:',
        '- test-driven-development',
        '- subagent-driven-development',
        '- verification-before-completion',
      ].join('\n'),
    },
    undefined,
    undefined,
    ctx,
  );

  const agentEvent = { prompt: '请写一份中文文档' };
  await event(pi, 'before_agent_start')(agentEvent, ctx);
  await forkSubagents(pi, ctx, ['zh-writer', 'zh-checker']);
  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);

  const result = await event(pi, 'session_stop')({}, ctx);

  assert.equal(result?.continue, true);
  assert.match(result.additionalContext, /SKILL_USAGE/);
  assert.match(result.additionalContext, /plain-chinese-writing|zh-writing-polish|zh-writing-checkers/);
});

test('before_agent_start preserves route when core continuation prompts start a follow-up turn', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    {
      prompt: '把下面这句话改成朴素、直接、少形容词的中文：鉴于当前系统存在较为显著的功能复杂性，我们需要进一步推动配置层面的优化与能力沉淀。',
    },
    ctx,
  );
  await forkSubagents(pi, ctx, ['zh-writer', 'zh-checker']);
  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);

  await event(pi, 'before_agent_start')(
    {
      prompt: [
        'OMP Enhancer Core skill gate is still open.',
        'Validate SKILL_USAGE before finishing. Required skills: plain-chinese-writing, zh-writing-polish, zh-writing-checkers.',
        'No successful SKILL_USAGE validation has been recorded.',
      ].join('\n'),
    },
    ctx,
  );

  const result = await event(pi, 'session_stop')({}, ctx);

  assert.equal(result?.continue, true);
  assert.match(result.additionalContext, /plain-chinese-writing/);
  assert.match(result.additionalContext, /zh-writing-polish/);
  assert.match(result.additionalContext, /zh-writing-checkers/);
  assert.doesNotMatch(result.additionalContext, /writing-plans/);
});

test('session_stop continues when an implementation-with-tests task has not run omp_test_gate', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-2',
    { prompt: '实现自然语言路由并补测试，测试写完后要过门禁。' },
    undefined,
    undefined,
    ctx,
  );
  await forkSubagents(pi, ctx, ['plan', 'task', 'reviewer']);

  const result = await event(pi, 'session_stop')({}, ctx);

  assert.equal(result?.continue, true);
  assert.match(result.additionalContext, /omp_test_gate/);
  assert.match(result.additionalContext, /test-driven-development|SKILL_USAGE/);
});

test('session_stop continues when a routed task has not forked required subagents', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-subagents',
    { prompt: '实现自然语言路由并补测试。' },
    undefined,
    undefined,
    ctx,
  );

  const blocked = await event(pi, 'session_stop')({}, ctx);

  assert.equal(blocked?.continue, true);
  assert.match(blocked.additionalContext, /subagent gate/i);
  assert.match(blocked.additionalContext, /plan, task, reviewer/);

  await forkSubagents(pi, ctx, ['plan', 'task', 'reviewer']);

  const next = await event(pi, 'session_stop')({}, ctx);

  assert.equal(next?.continue, true);
  assert.match(next.additionalContext, /omp_test_gate/);
});

test('validate subagent usage accepts explicit final SUBAGENT_USAGE evidence', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-subagent-usage',
    { prompt: '请润色这段中文论文摘要，检查逻辑和表达。' },
    undefined,
    undefined,
    ctx,
  );
  await tool(pi, 'omp_core_validate_subagent_usage').execute(
    'call-valid-subagent-usage',
    {
      output: [
        'SUBAGENT_USAGE',
        'Required:',
        '- zh-writer',
        '- zh-checker',
        'Forked:',
        '- zh-writer',
        '- zh-checker',
      ].join('\n'),
    },
    undefined,
    undefined,
    ctx,
  );

  const result = await event(pi, 'session_stop')({}, ctx);

  assert.equal(result?.continue, true);
  assert.match(result.additionalContext, /writing QA/);
});

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

async function forkSubagents(pi, ctx, agents) {
  for (const agent of agents) {
    await event(pi, 'tool_result')({ name: 'task', params: { agent } }, ctx);
  }
}

function governanceText(result, eventPayload) {
  const content = result?.content
    ?.filter((item) => item?.type === 'text')
    .map((item) => item.text)
    .join('\n');
  return [
    result?.additionalContext,
    result?.systemPrompt,
    result?.prompt,
    result?.context,
    content,
    eventPayload.additionalContext,
    eventPayload.systemPrompt,
    eventPayload.prompt,
    eventPayload.context,
  ]
    .filter(Boolean)
    .join('\n');
}

function extensionContext() {
  return {
    cwd: process.cwd(),
    sessionManager: { getBranch: () => [] },
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
