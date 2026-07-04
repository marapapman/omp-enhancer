import test from 'node:test';
import assert from 'node:assert/strict';

import registerCoreEnhancer from '../index.js';

class FakePi {
  constructor(entries = []) {
    this.labels = [];
    this.tools = new Map();
    this.commands = new Map();
    this.eventHandlers = [];
    this.events = new FakeEventBus();
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

class FakeEventBus {
  constructor() {
    this.handlers = new Map();
  }

  on(channel, handler) {
    const handlers = this.handlers.get(channel) ?? [];
    handlers.push(handler);
    this.handlers.set(channel, handlers);
    return () => {
      this.handlers.set(channel, (this.handlers.get(channel) ?? []).filter((candidate) => candidate !== handler));
    };
  }

  async emit(channel, payload) {
    for (const handler of this.handlers.get(channel) ?? []) {
      await handler(payload);
    }
  }
}

test('registers core tools, classifier command, and hooks', () => {
  const pi = new FakePi();

  registerCoreEnhancer(pi);

  assert.deepEqual(pi.labels, ['OMP Enhancer Core']);
  assert.deepEqual([...pi.tools.keys()], [
    'omp_core_route_task',
    'omp_core_classifier_prompt',
    'omp_core_resolve_classification',
    'omp_core_validate_skill_usage',
    'omp_core_validate_subagent_usage',
    'omp_core_subagent_status',
    'omp_core_governance_prompt',
  ]);
  assert.equal([...pi.tools.values()].every((tool) => typeof tool.execute === 'function'), true);
  assert.deepEqual(pi.eventHandlers.map((handler) => handler.event), [
    'session_start',
    'before_agent_start',
    'tool_call',
    'tool_execution_update',
    'tool_result',
    'session_stop',
  ]);
  assert.deepEqual([...pi.commands.keys()], ['classifier']);
  assert.equal(typeof pi.commands.get('classifier').handler, 'function');
});

test('classifier slash command can update the configured classifier model role', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const notifications = [];
  const roles = {};

  const result = await command(pi, 'classifier').handler(
    'set openai/gpt-5-nano',
    {
      settings: {
        setModelRole: (role, model) => { roles[role] = model; },
        getModelRole: (role) => roles[role],
        flush: async () => {},
      },
      ui: { notify: (text, level) => notifications.push({ text, level }) },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.model, 'openai/gpt-5-nano');
  assert.equal(roles.classifier, 'openai/gpt-5-nano');
  assert.match(result.text, /modelRoles\.classifier/);
  assert.match(result.text, /\/classifier set openai\/gpt-5-nano/);
  assert.deepEqual(notifications.map(({ level }) => level), ['info']);
});

test('classifier tools expose model role configuration and resolve route state', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  const promptResult = await tool(pi, 'omp_core_classifier_prompt').execute(
    'call-classifier-prompt',
    { prompt: 'Draft an English related work paragraph and check the logic.' },
    undefined,
    undefined,
    ctx,
  );

  assert.match(promptResult.content[0].text, /modelRoles\.classifier/);
  assert.equal(promptResult.details.classifier.modelRole, 'classifier');
  assert.equal(promptResult.details.classifier.model, 'opencode-go/deepseek-v4-flash:medium');

  const routeResult = await tool(pi, 'omp_core_resolve_classification').execute(
    'call-classifier-resolve',
    {
      prompt: 'Draft an English related work paragraph and check the logic.',
      output: JSON.stringify({
        intent: 'writing.en',
        secondaryIntents: [],
        language: 'en',
        confidence: 0.92,
        riskFlags: ['needs-writing-qa', 'needs-review'],
        domainHints: ['paper'],
        reason: 'English writing request.',
      }),
    },
    undefined,
    undefined,
    ctx,
  );

  assert.equal(routeResult.details.route.intent, 'writing.en');
  assert.equal(routeResult.details.route.source, 'llm-classifier');
  assert.deepEqual(routeResult.details.route.requiredSubagents.map(({ agent }) => agent), ['writer', 'checker']);

  const governance = await tool(pi, 'omp_core_governance_prompt').execute(
    'call-classifier-governance',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.equal(governance.details.route.intent, 'writing.en');
  assert.match(governance.details.fragment, /writer/);
  assert.match(governance.details.fragment, /checker/);
  assert.match(governance.details.fragment, /modelRoles\.classifier/);
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

test('writing reports about tests do not require omp_test_gate', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  const agentEvent = { prompt: '请写测试报告，重点说明当前验证风险，不要生成测试代码。' };
  const startResult = await event(pi, 'before_agent_start')(agentEvent, ctx);
  const fragment = governanceText(startResult, agentEvent);

  assert.match(fragment, /Intent:\s*writing\.zh/);
  assert.match(fragment, /this is a writing workflow/i);
  assert.match(fragment, /Do not call omp_test_analyze, omp_test_context, omp_test_gate, or omp_test_report/);
  assert.doesNotMatch(fragment, /Toolchain:\n(?:- .+\n)*- omp_test_gate/);

  await forkSubagents(pi, ctx, ['zh-writer', 'zh-checker']);
  await readSkills(pi, ctx, ['plain-chinese-writing', 'zh-writing-polish', 'zh-writing-checkers']);
  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);

  const released = await event(pi, 'session_stop')({ output: '任务完成。' }, ctx);

  assert.equal(released, undefined);
});

test('failed writing QA tool results do not release the writing gate', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-failed-writing-qa-route',
    { prompt: '请润色这段中文论文摘要，检查逻辑和表达。' },
    undefined,
    undefined,
    ctx,
  );
  await forkSubagents(pi, ctx, ['zh-writer', 'zh-checker']);
  await readSkills(pi, ctx, ['plain-chinese-writing', 'zh-writing-polish', 'zh-writing-checkers']);
  await event(pi, 'tool_result')(
    {
      name: 'writing_quality_check',
      isError: true,
      details: { error: 'Unable to read document.' },
    },
    ctx,
  );

  const result = await event(pi, 'session_stop')({ output: '任务完成。' }, ctx);

  assert.equal(result?.continue, true);
  assert.match(result.additionalContext, /writing QA|writing_quality_check|writing_logic_check/);
  assert.match(result.additionalContext, /Recent failed tool results/);
  assert.match(result.additionalContext, /writing_quality_check: Unable to read document/);

  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);
  const released = await event(pi, 'session_stop')({ output: '任务完成。' }, ctx);

  assert.equal(released, undefined);
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
  assert.match(blocked.additionalContext, /omp_core_validate_skill_usage/);
  assert.match(blocked.additionalContext, /Recovery order: in this same continuation/);
  assert.match(blocked.additionalContext, /Do not only say the evidence was already provided/);

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

test('before_agent_start treats subagent gate continuations as internal prompts', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '请润色这段中文论文摘要，检查逻辑和表达。' },
    ctx,
  );

  await event(pi, 'before_agent_start')(
    {
      prompt: [
        'OMP Enhancer Core subagent gate is still open.',
        'Fork the required roles with the task tool before doing or finishing routed work.',
        'Required subagents: zh-writer, zh-checker.',
      ].join('\n'),
    },
    ctx,
  );

  const result = await tool(pi, 'omp_core_governance_prompt').execute(
    'call-current-governance',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.equal(result.details.route.intent, 'writing.zh');
  assert.match(result.details.fragment, /zh-writer/);
  assert.match(result.details.fragment, /zh-checker/);
});

test('before_agent_start gives spawned subagents a lightweight contract without opening root gates', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  const agentEvent = {
    prompt: [
      'OMP_REQUIRED_SUBAGENT: writer',
      'Required skills for this subagent:',
      '- writing-markdown-helper',
      '',
      'Assignment: revise the related work paragraph.',
    ].join('\n'),
  };

  const result = await event(pi, 'before_agent_start')(agentEvent, ctx);
  const fragment = governanceText(result, agentEvent);

  assert.match(fragment, /OMP Enhancer Core Subagent Contract/);
  assert.match(fragment, /Subagent:\s*writer/);
  assert.match(fragment, /writing-markdown-helper/);
  assert.doesNotMatch(fragment, /Mandatory Subagent Workflow/);

  const stopResult = await event(pi, 'session_stop')({}, ctx);

  assert.equal(stopResult, undefined);
});

test('before_agent_start preserves parent route when a spawned subagent starts', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '请润色这段中文论文摘要，检查逻辑和表达。' },
    ctx,
  );
  await event(pi, 'before_agent_start')(
    {
      prompt: [
        'OMP_REQUIRED_SUBAGENT: zh-writer',
        'Required skills for this subagent:',
        '- plain-chinese-writing',
        '- zh-writing-polish',
        '',
        'Assignment: rewrite the paragraph.',
      ].join('\n'),
    },
    ctx,
  );

  const result = await tool(pi, 'omp_core_governance_prompt').execute(
    'call-current-governance-after-subagent',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.equal(result.details.route.intent, 'writing.zh');
  assert.match(result.details.fragment, /zh-writer/);
  assert.match(result.details.fragment, /zh-checker/);
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

test('failed omp_test_gate results do not release implementation and testing gates', async () => {
  const cases = [
    {
      prompt: '为 src/router.js 写高信号单元测试，覆盖边界和错误路径。',
      agents: ['ecc-tdd-guide', 'ecc-pr-test-analyzer'],
      skills: ['test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
    },
    {
      prompt: '实现自然语言路由并补测试，测试写完后要过门禁。',
      agents: ['plan', 'task', 'reviewer'],
      skills: ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
    },
  ];

  for (const item of cases) {
    const pi = new FakePi();
    registerCoreEnhancer(pi);
    const ctx = extensionContext();

    await event(pi, 'session_start')({}, ctx);
    await event(pi, 'before_agent_start')({ prompt: item.prompt }, ctx);
    await forkSubagents(pi, ctx, item.agents);
    await tool(pi, 'omp_core_validate_skill_usage').execute(
      `call-failed-test-gate-skill-usage-${item.agents.length}`,
      { output: skillUsageBlock(item.skills) },
      undefined,
      undefined,
      ctx,
    );
    await event(pi, 'tool_result')(
      {
        name: 'omp_test_gate',
        details: {
          passed: false,
          results: [{
            gate: 'indirect-test',
            passed: false,
            severity: 'blocker',
            summary: 'Test imports private implementation details.',
            repairHint: 'Test through public behavior.',
          }],
        },
      },
      ctx,
    );

    const result = await event(pi, 'session_stop')({ output: 'Done.' }, ctx);

    assert.equal(result?.continue, true);
    assert.match(result.additionalContext, /omp_test_gate/);
    assert.match(result.additionalContext, /Recent failed tool results/);
    assert.match(result.additionalContext, /Test imports private implementation details/);
  }
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

test('failed task tool results do not count as forked subagents', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-failed-task-result',
    { prompt: '实现自然语言路由并补测试。' },
    undefined,
    undefined,
    ctx,
  );
  await event(pi, 'tool_result')(
    {
      name: 'task',
      isError: true,
      details: { error: 'Task subagent failed to start.' },
      params: {
        agent: 'plan',
        prompt: [
          'Required skills for this subagent:',
          '- brainstorming',
          '- subagent-driven-development',
        ].join('\n'),
      },
    },
    ctx,
  );

  const blocked = await event(pi, 'session_stop')({}, ctx);

  assert.equal(blocked?.continue, true);
  assert.match(blocked.additionalContext, /subagent gate/i);
  assert.match(blocked.additionalContext, /Recent failed tool results/);
  assert.match(blocked.additionalContext, /task: Task subagent failed to start/);
  assert.match(blocked.additionalContext, /Missing subagents: plan, task, reviewer|Missing subagents: task, reviewer/);
});

test('failed task results keep subagent gate blocked even after prior task tool_call evidence', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-task-tool-call-then-failure',
    { prompt: '实现自然语言路由并补测试。' },
    undefined,
    undefined,
    ctx,
  );
  await event(pi, 'tool_call')(
    {
      toolName: 'task',
      input: {
        tasks: [
          { role: 'plan', assignment: 'Required skills for this subagent:\n- brainstorming\n- subagent-driven-development' },
          { role: 'task', assignment: 'Required skills for this subagent:\n- test-driven-development\n- verification-before-completion' },
          { role: 'reviewer', assignment: 'Required skills for this subagent:\n- verification-before-completion' },
        ],
      },
    },
    ctx,
  );
  await event(pi, 'tool_result')(
    {
      name: 'task',
      isError: true,
      details: { error: 'Task worker crashed before returning.' },
    },
    ctx,
  );

  const blocked = await event(pi, 'session_stop')({}, ctx);

  assert.equal(blocked?.continue, true);
  assert.match(blocked.additionalContext, /subagent gate/i);
  assert.match(blocked.additionalContext, /Task worker crashed before returning/);

  await forkSubagents(pi, ctx, ['plan', 'task', 'reviewer']);
  const next = await event(pi, 'session_stop')({}, ctx);

  assert.equal(next?.continue, true);
  assert.match(next.additionalContext, /omp_test_gate/);
  assert.doesNotMatch(next.additionalContext, /Task worker crashed before returning/);
});

test('session_stop continues when forked subagents lack required skill assignments', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-subagent-skills',
    { prompt: '实现自然语言路由并补测试。' },
    undefined,
    undefined,
    ctx,
  );
  for (const agent of ['plan', 'task', 'reviewer']) {
    await event(pi, 'tool_result')({ name: 'task', params: { agent, prompt: 'Do the assigned work.' } }, ctx);
  }

  const blocked = await event(pi, 'session_stop')({}, ctx);

  assert.equal(blocked?.continue, true);
  assert.match(blocked.additionalContext, /Missing subagent skill assignments/);
  assert.match(blocked.additionalContext, /plan \[brainstorming, subagent-driven-development\]/);
  assert.match(blocked.additionalContext, /task \[test-driven-development, verification-before-completion\]/);
});

test('pending task tool_call evidence blocks completion until task result returns', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-english-writing-route',
    { prompt: 'Draft an English related work paragraph for a systems paper and check the logic.' },
    undefined,
    undefined,
    ctx,
  );
  await event(pi, 'tool_call')(
    {
      toolName: 'task',
      input: {
        agent: 'task',
        tasks: [
          {
            id: 'WriterGateFinal',
            role: 'writer',
            assignment: [
              'Required skills for this subagent:',
              '- writing-markdown-helper',
            ].join('\n'),
          },
          {
            id: 'CheckerGateFinal',
            role: 'checker',
            assignment: [
              'Required skills for this subagent:',
              '- writing-checkers',
            ].join('\n'),
          },
        ],
      },
    },
    ctx,
  );
  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);
  await tool(pi, 'omp_core_validate_skill_usage').execute(
    'call-valid-english-skill-usage',
    {
      output: [
        'SKILL_USAGE',
        'Required:',
        '- writing-markdown-helper',
        '- writing-checkers',
        'Loaded:',
        '- writing-markdown-helper',
        '- writing-checkers',
      ].join('\n'),
    },
    undefined,
    undefined,
    ctx,
  );

  const pending = await event(pi, 'session_stop')({}, ctx);

  assert.equal(pending?.continue, true);
  assert.match(pending.additionalContext, /Pending subagent task results/);
  assert.match(pending.additionalContext, /writer/);
  assert.match(pending.additionalContext, /checker/);

  await event(pi, 'tool_result')({ name: 'task' }, ctx);

  const result = await event(pi, 'session_stop')({}, ctx);

  assert.notEqual(result?.continue, true);
});

test('stale pending task calls are reported as potentially stuck', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-stale-task-route',
    { prompt: '实现自然语言路由并补测试。' },
    undefined,
    undefined,
    ctx,
  );
  await event(pi, 'tool_call')(
    {
      toolName: 'task',
      timestamp: Date.now() - (11 * 60 * 1000),
      input: {
        tasks: [
          { role: 'plan', assignment: 'Required skills for this subagent:\n- brainstorming\n- subagent-driven-development' },
        ],
      },
    },
    ctx,
  );

  const blocked = await event(pi, 'session_stop')({}, ctx);

  assert.equal(blocked?.continue, true);
  assert.match(blocked.additionalContext, /Potentially stuck subagent tasks/);
  assert.match(blocked.additionalContext, /plan/);
  assert.match(blocked.additionalContext, /retry those task calls with smaller assignments|report BLOCKERS/);
});

test('subagent status tool reports pending and completed roles', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-status-route',
    { prompt: 'Draft an English related work paragraph for a systems paper and check the logic.' },
    undefined,
    undefined,
    ctx,
  );
  await event(pi, 'tool_call')(
    {
      toolName: 'task',
      input: {
        tasks: [
          { role: 'writer', assignment: 'Required skills for this subagent:\n- writing-markdown-helper' },
        ],
      },
    },
    ctx,
  );

  let status = await tool(pi, 'omp_core_subagent_status').execute(
    'call-subagent-status-pending',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.match(status.content[0].text, /Route: writing\.en/);
  assert.match(status.content[0].text, /writer: pending/);
  assert.deepEqual(status.details.status.pending.map(({ agent }) => agent), ['writer']);

  await event(pi, 'tool_result')({ name: 'task' }, ctx);
  status = await tool(pi, 'omp_core_subagent_status').execute(
    'call-subagent-status-complete',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.match(status.content[0].text, /Completed:\n- writer/);
  assert.deepEqual(status.details.status.pending, []);
});

test('task tool_execution_update records live subagent progress and completion', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const notifications = [];
  const ctx = extensionContext(pi.entries);
  ctx.ui = { notify: async (text, level) => notifications.push({ text, level }) };

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-live-progress-route',
    { prompt: 'Draft an English related work paragraph for a systems paper and check the logic.' },
    undefined,
    undefined,
    ctx,
  );

  const assignment = [
    'OMP_REQUIRED_SUBAGENT: writer',
    'Required skills for this subagent:',
    '- writing-markdown-helper',
  ].join('\n');
  await event(pi, 'tool_execution_update')(
    {
      toolName: 'task',
      toolCallId: 'task-live-progress',
      partialResult: {
        details: {
          progress: [
            {
              id: 'WriterLive',
              index: 0,
              agent: 'task',
              status: 'running',
              description: 'draft related work',
              currentTool: 'read',
              requests: 1,
              durationMs: 2400,
              assignment,
            },
          ],
        },
      },
    },
    ctx,
  );

  let status = await tool(pi, 'omp_core_subagent_status').execute(
    'call-live-progress-status',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.match(status.content[0].text, /Progress:\n- writer: running; draft related work; tool read; 1 requests; 2s/);
  assert.deepEqual(status.details.status.pending.map(({ agent }) => agent), ['writer']);
  assert.deepEqual(status.details.status.pending[0].skills, ['writing-markdown-helper']);
  assert.equal(notifications[0].level, 'info');
  assert.match(notifications[0].text, /OMP subagent progress: writer running; tool read; draft related work\. Route: writing\.en\./);

  await event(pi, 'tool_execution_update')(
    {
      toolName: 'task',
      toolCallId: 'task-live-progress',
      partialResult: {
        details: {
          progress: [
            {
              id: 'WriterLive',
              index: 0,
              agent: 'task',
              status: 'completed',
              description: 'draft related work',
              requests: 2,
              durationMs: 5100,
              assignment,
            },
          ],
        },
      },
    },
    ctx,
  );

  status = await tool(pi, 'omp_core_subagent_status').execute(
    'call-live-progress-completed-status',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.deepEqual(status.details.status.completed, ['writer']);
  assert.deepEqual(status.details.status.pending, []);
  assert.match(status.content[0].text, /Progress:\n- writer: completed; draft related work; 2 requests; 5s/);
});

test('task EventBus progress and lifecycle update subagent status before final task result', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext(pi.entries);

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-eventbus-progress-route',
    { prompt: 'Draft an English related work paragraph for a systems paper and check the logic.' },
    undefined,
    undefined,
    ctx,
  );

  const assignment = [
    'OMP_REQUIRED_SUBAGENT: writer',
    'Required skills for this subagent:',
    '- writing-markdown-helper',
  ].join('\n');
  await pi.events.emit('task:subagent:progress', {
    index: 0,
    agent: 'task',
    assignment,
    parentToolCallId: 'task-eventbus-progress',
    progress: {
      id: 'WriterBus',
      index: 0,
      agent: 'task',
      status: 'running',
      currentTool: 'read',
      assignment,
    },
  });

  let status = await tool(pi, 'omp_core_subagent_status').execute(
    'call-eventbus-progress-status',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.deepEqual(status.details.status.pending.map(({ agent }) => agent), ['writer']);
  assert.equal(status.details.status.progress[0].agent, 'writer');
  assert.equal(status.details.status.progress[0].status, 'running');

  await pi.events.emit('task:subagent:lifecycle', {
    id: 'WriterBus',
    agent: 'writer',
    status: 'completed',
    parentToolCallId: 'task-eventbus-progress',
    description: 'draft finished',
    index: 0,
  });

  status = await tool(pi, 'omp_core_subagent_status').execute(
    'call-eventbus-completed-status',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.deepEqual(status.details.status.completed, ['writer']);
  assert.deepEqual(status.details.status.pending, []);
  assert.match(status.content[0].text, /writer: completed; draft finished/);
});

test('completing one of two pending task calls keeps the other subagent running', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const notifications = [];
  const ctx = extensionContext();
  ctx.ui = { notify: async (text, level) => notifications.push({ text, level }) };

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-two-independent-subagents-route',
    { prompt: 'Draft an English related work paragraph for a systems paper and check the logic.' },
    undefined,
    undefined,
    ctx,
  );
  await event(pi, 'tool_call')(
    {
      toolName: 'task',
      input: {
        tasks: [
          { role: 'writer', assignment: 'Required skills for this subagent:\n- writing-markdown-helper' },
        ],
      },
    },
    ctx,
  );
  await event(pi, 'tool_call')(
    {
      toolName: 'task',
      input: {
        tasks: [
          { role: 'checker', assignment: 'Required skills for this subagent:\n- writing-checkers' },
        ],
      },
    },
    ctx,
  );

  await event(pi, 'tool_result')({ name: 'task' }, ctx);

  const status = await tool(pi, 'omp_core_subagent_status').execute(
    'call-subagent-status-one-still-running',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.match(status.content[0].text, /Completed:\n- writer/);
  assert.match(status.content[0].text, /Pending:\n- checker: pending/);
  assert.deepEqual(status.details.status.completed, ['writer']);
  assert.deepEqual(status.details.status.pending.map(({ agent }) => agent), ['checker']);
  assert.match(notifications.at(-1).text, /OMP subagents completed: writer \[writing-markdown-helper\]/);

  await event(pi, 'tool_result')({ name: 'task' }, ctx);
  const completed = await tool(pi, 'omp_core_subagent_status').execute(
    'call-subagent-status-both-complete',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.deepEqual(completed.details.status.completed, ['writer', 'checker']);
  assert.deepEqual(completed.details.status.pending, []);
});

test('task tool_call announces running subagents in TUI notifications', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const notifications = [];
  const ctx = extensionContext();
  ctx.ui = { notify: async (text, level) => notifications.push({ text, level }) };

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-running-notification-route',
    { prompt: 'Draft an English related work paragraph for a systems paper and check the logic.' },
    undefined,
    undefined,
    ctx,
  );
  await event(pi, 'tool_call')(
    {
      toolName: 'task',
      input: {
        tasks: [
          { role: 'writer', assignment: 'Required skills for this subagent:\n- writing-markdown-helper' },
          { role: 'checker', assignment: 'Required skills for this subagent:\n- writing-checkers' },
        ],
      },
    },
    ctx,
  );

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].level, 'info');
  assert.match(notifications[0].text, /OMP subagents running: writer \[writing-markdown-helper\], checker \[writing-checkers\]\. Route: writing\.en\./);
});

test('task tool_result announces completed and failed subagents in TUI notifications', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const notifications = [];
  const ctx = extensionContext();
  ctx.ui = { notify: async (text, level) => notifications.push({ text, level }) };

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-completed-notification-route',
    { prompt: 'Draft an English related work paragraph for a systems paper and check the logic.' },
    undefined,
    undefined,
    ctx,
  );
  await event(pi, 'tool_call')(
    {
      toolName: 'task',
      input: {
        tasks: [
          { role: 'writer', assignment: 'Required skills for this subagent:\n- writing-markdown-helper' },
        ],
      },
    },
    ctx,
  );
  await event(pi, 'tool_result')({ name: 'task' }, ctx);

  assert.equal(notifications[1].level, 'info');
  assert.match(notifications[1].text, /OMP subagents completed: writer \[writing-markdown-helper\]\. Route: writing\.en\./);

  await tool(pi, 'omp_core_route_task').execute(
    'call-failed-notification-route',
    { prompt: 'Implement an API change and add tests.' },
    undefined,
    undefined,
    ctx,
  );
  await event(pi, 'tool_call')(
    {
      toolName: 'task',
      input: {
        tasks: [
          { role: 'plan', assignment: 'Required skills for this subagent:\n- brainstorming\n- subagent-driven-development' },
        ],
      },
    },
    ctx,
  );
  await event(pi, 'tool_result')({ name: 'task', isError: true, message: 'plan subagent timed out' }, ctx);

  assert.equal(notifications.at(-1).level, 'warn');
  assert.match(notifications.at(-1).text, /OMP subagents failed: plan \[brainstorming, subagent-driven-development\]\. Route: implementation-with-tests\. plan subagent timed out/);
});

test('session_stop accepts SKILL_USAGE from the final output event without a separate validator call', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-final-output-skill-route',
    { prompt: 'Draft an English related work paragraph and check the logic.' },
    undefined,
    undefined,
    ctx,
  );
  await forkSubagents(pi, ctx, ['writer', 'checker']);
  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);

  const result = await event(pi, 'session_stop')(
    {
      output: [
        'Done.',
        '',
        'SKILL_USAGE',
        'Required:',
        '- writing-markdown-helper',
        '- writing-checkers',
        'Loaded:',
        '- writing-markdown-helper',
        '- writing-checkers',
      ].join('\n'),
    },
    ctx,
  );

  assert.notEqual(result?.continue, true);
});

test('skill validation tool accepts common model-formatted evidence and releases the gate', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-model-formatted-skill-route',
    { prompt: 'Draft an English related work paragraph and check the logic.' },
    undefined,
    undefined,
    ctx,
  );
  await forkSubagents(pi, ctx, ['writer', 'checker']);
  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);
  const validation = await tool(pi, 'omp_core_validate_skill_usage').execute(
    'call-model-formatted-skill-usage',
    {
      output: [
        'Final evidence:',
        '',
        '### SKILL_USAGE:',
        '**Required Skills:** `skill://writing-markdown-helper`, `skill://writing-checkers`',
        '**Loaded Skills:** `skill://writing-markdown-helper`, `skill://writing-checkers`',
      ].join('\n'),
    },
    undefined,
    undefined,
    ctx,
  );

  assert.equal(validation.details.validation.ok, true);

  const result = await event(pi, 'session_stop')({}, ctx);

  assert.notEqual(result?.continue, true);
});

test('skill validation tool accepts a fenced final evidence block when no plain block exists', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-fenced-skill-route',
    { prompt: 'Draft an English related work paragraph and check the logic.' },
    undefined,
    undefined,
    ctx,
  );
  await forkSubagents(pi, ctx, ['writer', 'checker']);
  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);
  const validation = await tool(pi, 'omp_core_validate_skill_usage').execute(
    'call-fenced-skill-usage',
    {
      output: [
        '```text',
        'SKILL_USAGE:',
        'Required:',
        '- writing-markdown-helper',
        '- writing-checkers',
        'Loaded:',
        '- writing-markdown-helper',
        '- writing-checkers',
        '```',
      ].join('\n'),
    },
    undefined,
    undefined,
    ctx,
  );

  assert.equal(validation.details.validation.ok, true);

  const result = await event(pi, 'session_stop')({}, ctx);

  assert.notEqual(result?.continue, true);
});

test('session_stop accepts successful read skill evidence without a final SKILL_USAGE block', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-read-evidence-route',
    { prompt: '请润色这段中文论文摘要，检查逻辑和表达。' },
    undefined,
    undefined,
    ctx,
  );
  await forkSubagents(pi, ctx, ['zh-writer', 'zh-checker']);
  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);
  await readSkills(pi, ctx, ['plain-chinese-writing', 'zh-writing-polish', 'zh-writing-checkers']);

  const result = await event(pi, 'session_stop')({ output: '任务完成。' }, ctx);

  assert.equal(result, undefined);
});

test('skill validation tool combines SKILL_USAGE output with successful read skill evidence', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-combined-read-evidence-route',
    { prompt: '请润色这段中文论文摘要，检查逻辑和表达。' },
    undefined,
    undefined,
    ctx,
  );
  await forkSubagents(pi, ctx, ['zh-writer', 'zh-checker']);
  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);
  await readSkills(pi, ctx, ['zh-writing-polish', 'zh-writing-checkers']);

  const validation = await tool(pi, 'omp_core_validate_skill_usage').execute(
    'call-combined-read-evidence-skill-usage',
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

  assert.equal(validation.details.validation.ok, true);
  assert.deepEqual(validation.details.validation.loaded, [
    'plain-chinese-writing',
    'zh-writing-polish',
    'zh-writing-checkers',
  ]);

  const result = await event(pi, 'session_stop')({}, ctx);

  assert.equal(result, undefined);
});

test('failed read skill results do not release the skill gate', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-failed-read-route',
    { prompt: 'Draft an English related work paragraph and check the logic.' },
    undefined,
    undefined,
    ctx,
  );
  await forkSubagents(pi, ctx, ['writer', 'checker']);
  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);
  await event(pi, 'tool_result')(
    {
      toolName: 'read',
      params: { uri: 'skill://writing-markdown-helper' },
      isError: true,
      content: [{ type: 'text', text: 'missing skill' }],
    },
    ctx,
  );
  await event(pi, 'tool_result')(
    {
      toolName: 'read',
      details: {
        toolName: 'read',
        params: { uri: 'skill://writing-checkers' },
        isError: true,
      },
    },
    ctx,
  );

  const blocked = await event(pi, 'session_stop')({ output: 'Done.' }, ctx);

  assert.equal(blocked?.continue, true);
  assert.match(blocked.additionalContext, /SKILL_USAGE/);
  assert.match(blocked.additionalContext, /writing-markdown-helper|writing-checkers/);
  assert.match(blocked.additionalContext, /Recent failed tool results/);
  assert.match(blocked.additionalContext, /read: missing skill/);
});

test('read skill evidence persists through session entries across isolated plugin instances', async () => {
  const entries = [];
  const readerPi = new FakePi(entries);
  registerCoreEnhancer(readerPi);
  const readerCtx = extensionContext(entries);

  await event(readerPi, 'session_start')({}, readerCtx);
  await event(readerPi, 'before_agent_start')(
    { prompt: 'Draft an English related work paragraph and check the logic.' },
    readerCtx,
  );
  await forkSubagents(readerPi, readerCtx, ['writer', 'checker']);
  await event(readerPi, 'tool_result')({ name: 'writing_quality_check' }, readerCtx);
  await readSkills(readerPi, readerCtx, ['writing-markdown-helper', 'writing-checkers']);

  const stopPi = new FakePi(entries);
  registerCoreEnhancer(stopPi);
  const stopCtx = extensionContext(entries);
  const result = await event(stopPi, 'session_stop')({ output: 'Done.' }, stopCtx);

  assert.equal(result, undefined);
});

test('skill validator reconstructs read evidence from raw branch entries after stale validation state', async () => {
  const entries = [];
  const routePi = new FakePi(entries);
  registerCoreEnhancer(routePi);
  const routeCtx = extensionContext(entries);

  await event(routePi, 'session_start')({}, routeCtx);
  await event(routePi, 'before_agent_start')(
    { prompt: 'Draft an English related work paragraph and check the logic.' },
    routeCtx,
  );

  const routeState = entries.find((entry) => entry.customType === 'omp-enhancer-core.state')?.data;
  assert.ok(routeState);
  entries.push(
    {
      type: 'tool_result',
      name: 'read',
      params: { uri: 'skill://writing-markdown-helper' },
      timestamp: routeState.routeStartedAt + 1,
    },
    {
      type: 'tool_result',
      data: {
        toolName: 'read',
        input: { uri: 'skill://writing-checkers' },
        timestamp: routeState.routeStartedAt + 2,
      },
    },
    staleSkillValidationState(routeState),
  );

  const validatorPi = new FakePi(entries);
  registerCoreEnhancer(validatorPi);
  const validation = await tool(validatorPi, 'omp_core_validate_skill_usage').execute(
    'call-raw-read-evidence-skill-usage',
    { output: '' },
    undefined,
    undefined,
    extensionContext(entries),
  );

  assert.equal(validation.details.validation.ok, true);
  assert.deepEqual(validation.details.validation.loaded, ['writing-markdown-helper', 'writing-checkers']);
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
        'SUBAGENT_USAGE:',
        '- zh-writer: plain-chinese-writing, zh-writing-polish',
        '- zh-checker: plain-chinese-writing, zh-writing-checkers',
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

test('validator evidence persists through session entries across isolated plugin instances', async () => {
  const entries = [];
  const validatorPi = new FakePi(entries);
  registerCoreEnhancer(validatorPi);
  const validatorCtx = extensionContext(entries);

  await event(validatorPi, 'session_start')({}, validatorCtx);
  await event(validatorPi, 'before_agent_start')(
    { prompt: 'Draft an English related work paragraph and check the logic.' },
    validatorCtx,
  );
  await event(validatorPi, 'tool_result')({ name: 'writing_quality_check' }, validatorCtx);
  await tool(validatorPi, 'omp_core_validate_subagent_usage').execute(
    'call-cross-instance-subagent-usage',
    {
      output: [
        'SUBAGENT_USAGE:',
        '- writer: writing-markdown-helper',
        '- checker: writing-checkers',
      ].join('\n'),
    },
    undefined,
    undefined,
    validatorCtx,
  );
  await tool(validatorPi, 'omp_core_validate_skill_usage').execute(
    'call-cross-instance-skill-usage',
    {
      output: [
        'SKILL_USAGE',
        'Required:',
        '- writing-markdown-helper',
        '- writing-checkers',
        'Loaded:',
        '- writing-markdown-helper',
        '- writing-checkers',
      ].join('\n'),
    },
    undefined,
    undefined,
    validatorCtx,
  );

  const stopPi = new FakePi(entries);
  registerCoreEnhancer(stopPi);
  const stopCtx = extensionContext(entries);
  const result = await event(stopPi, 'session_stop')({}, stopCtx);

  assert.equal(result, undefined);
  assert.equal(entries.some((entry) => entry.customType === 'omp-enhancer-core.state'), true);
});

test('session_stop accepts final usage blocks when validator tool state is unavailable', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: 'Draft an English related work paragraph and check the logic.' },
    ctx,
  );
  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);

  const result = await event(pi, 'session_stop')(
    {
      output: [
        'Done.',
        '',
        'SUBAGENT_USAGE:',
        '- writer: writing-markdown-helper',
        '- checker: writing-checkers',
        '',
        'SKILL_USAGE',
        'Required:',
        '- writing-markdown-helper',
        '- writing-checkers',
        'Loaded:',
        '- writing-markdown-helper',
        '- writing-checkers',
      ].join('\n'),
    },
    ctx,
  );

  assert.equal(result, undefined);
});

test('session_stop rejects completion notes that only blame validator session state', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: 'Draft an English related work paragraph and check the logic.' },
    ctx,
  );
  await forkSubagents(pi, ctx, ['writer', 'checker']);
  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);

  const result = await event(pi, 'session_stop')(
    {
      output: [
        'All work complete. All verification evidence provided.',
        'The omp_core_validate_* tools have a known session-state bug that prevents formal validation.',
      ].join(' '),
    },
    ctx,
  );

  assert.equal(result?.continue, true);
  assert.match(result.additionalContext, /SKILL_USAGE/);
  assert.match(result.additionalContext, /No successful SKILL_USAGE validation/);
});

test('writing gate releases after complete evidence and does not reblock repeated session_stop calls', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries);

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: 'Draft an English related work paragraph and check the logic.' },
    ctx,
  );

  const missingSubagents = await event(pi, 'session_stop')({}, ctx);
  assert.equal(missingSubagents?.continue, true);
  assert.match(missingSubagents.additionalContext, /subagent gate/i);

  await forkSubagents(pi, ctx, ['writer', 'checker']);
  const missingQa = await event(pi, 'session_stop')({}, ctx);
  assert.equal(missingQa?.continue, true);
  assert.match(missingQa.additionalContext, /writing QA/);

  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);
  const finalOutput = usageEvidence({
    subagents: {
      writer: ['writing-markdown-helper'],
      checker: ['writing-checkers'],
    },
    skills: ['writing-markdown-helper', 'writing-checkers'],
  });

  await assertReleasedStops(pi, ctx, [
    { output: finalOutput },
    {},
    { content: [{ type: 'text', text: 'No new evidence; prior gate evidence remains valid.' }] },
  ]);

  const restoredPi = new FakePi(entries);
  registerCoreEnhancer(restoredPi);
  await assertReleasedStops(restoredPi, extensionContext(entries), [{}, {}]);
});

test('testing gate releases after test gate and skill evidence without requiring another stop loop', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '为 src/router.js 写高信号单元测试，覆盖边界和错误路径。' },
    ctx,
  );
  await forkSubagents(pi, ctx, ['ecc-tdd-guide', 'ecc-pr-test-analyzer']);

  const blocked = await event(pi, 'session_stop')({}, ctx);
  assert.equal(blocked?.continue, true);
  assert.match(blocked.additionalContext, /omp_test_gate/);

  await event(pi, 'tool_result')({ name: 'omp_test_gate' }, ctx);
  await tool(pi, 'omp_core_validate_skill_usage').execute(
    'call-complete-testing-skill-usage',
    {
      output: skillUsageBlock([
        'test-driven-development',
        'subagent-driven-development',
        'verification-before-completion',
      ]),
    },
    undefined,
    undefined,
    ctx,
  );

  await assertReleasedStops(pi, ctx, [{}, {}, { output: 'Final summary only.' }]);
});

test('failed skill validation can be corrected by final evidence without repeated blocking', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '请润色这段中文论文摘要，检查逻辑和表达。' },
    ctx,
  );
  await forkSubagents(pi, ctx, ['zh-writer', 'zh-checker']);
  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);
  await tool(pi, 'omp_core_validate_skill_usage').execute(
    'call-incomplete-zh-skill-usage',
    {
      output: skillUsageBlock(['plain-chinese-writing']),
    },
    undefined,
    undefined,
    ctx,
  );

  const correctedOutput = usageEvidence({
    subagents: {
      'zh-writer': ['plain-chinese-writing', 'zh-writing-polish'],
      'zh-checker': ['plain-chinese-writing', 'zh-writing-checkers'],
    },
    skills: ['plain-chinese-writing', 'zh-writing-polish', 'zh-writing-checkers'],
  });

  await assertReleasedStops(pi, ctx, [{ output: correctedOutput }, {}, {}]);
});

test('non-gated diagnosis release and unknown routes do not create repeated gate continuations', async () => {
  const workloads = [
    '为什么这个插件一直提示 SKILL_USAGE validation 失败？先诊断原因，不要改代码。',
    'Push the current release commit and upgrade marketplace plugins.',
    'What is the capital of France?',
  ];

  for (const prompt of workloads) {
    const pi = new FakePi();
    registerCoreEnhancer(pi);
    const ctx = extensionContext();

    await event(pi, 'session_start')({}, ctx);
    await event(pi, 'before_agent_start')({ prompt }, ctx);
    await assertReleasedStops(pi, ctx, [{}, {}, { output: 'Done.' }]);
  }
});

function tool(pi, name) {
  const found = pi.tools.get(name);
  if (!found) throw new Error(`Missing tool ${name}`);
  return found;
}

function command(pi, name) {
  const found = pi.commands.get(name);
  if (!found) throw new Error(`Missing command ${name}`);
  return found;
}

function event(pi, name) {
  const found = pi.eventHandlers.find((handler) => handler.event === name);
  if (!found) throw new Error(`Missing event ${name}`);
  return found.handler;
}

async function forkSubagents(pi, ctx, agents) {
  for (const agent of agents) {
    await event(pi, 'tool_result')(
      {
        name: 'task',
        params: {
          agent,
          prompt: [
            'Required skills for this subagent:',
            ...subagentSkills(agent).map((skill) => `- ${skill}`),
          ].join('\n'),
        },
      },
      ctx,
    );
  }
}

async function readSkills(pi, ctx, skills) {
  for (const skill of skills) {
    await event(pi, 'tool_result')(
      {
        name: 'read',
        params: { uri: `skill://${skill}` },
        content: [{ type: 'text', text: `Loaded ${skill}` }],
      },
      ctx,
    );
  }
}

function subagentSkills(agent) {
  return {
    plan: ['brainstorming', 'subagent-driven-development'],
    task: ['test-driven-development', 'verification-before-completion'],
    reviewer: ['verification-before-completion'],
    'ecc-security-reviewer': ['security-review', 'security-scan'],
    'ecc-tdd-guide': ['test-driven-development'],
    'ecc-pr-test-analyzer': ['verification-before-completion'],
    'zh-writer': ['plain-chinese-writing', 'zh-writing-polish'],
    'zh-checker': ['plain-chinese-writing', 'zh-writing-checkers'],
    writer: ['writing-markdown-helper'],
    checker: ['writing-checkers'],
    librarian: [],
  }[agent] ?? [];
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

async function assertReleasedStops(pi, ctx, stopEvents) {
  for (const stopEvent of stopEvents) {
    const result = await event(pi, 'session_stop')(stopEvent, ctx);
    assert.equal(result, undefined);
  }
}

function usageEvidence({ subagents = {}, skills = [] } = {}) {
  return [
    'Done.',
    '',
    'SUBAGENT_USAGE:',
    ...Object.entries(subagents).map(([agent, agentSkills]) => `- ${agent}: ${agentSkills.join(', ') || 'none'}`),
    '',
    skillUsageBlock(skills),
  ].join('\n');
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

function staleSkillValidationState(routeState) {
  return {
    type: 'custom',
    customType: 'omp-enhancer-core.state',
    data: {
      lastRoute: routeState.lastRoute,
      routeStartedAt: routeState.routeStartedAt,
      lastSkillUsage: { ok: false, message: 'Missing SKILL_USAGE for writing-checkers' },
      lastSubagentUsage: null,
      evidence: {
        writingQuality: false,
        writingLogic: false,
        testingGate: false,
        testingReport: false,
        taskToolCalls: 0,
        loadedSkills: [],
        toolFailures: [],
        forkedSubagents: [],
        pendingSubagents: [],
        subagentSkills: [],
        unexpectedSubagentSkills: [],
      },
    },
  };
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
