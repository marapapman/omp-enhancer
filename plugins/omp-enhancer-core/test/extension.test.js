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
    this.messages = [];
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

  sendMessage(message, options) {
    this.messages.push({ message, options });
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

test('registers core tools and hooks without a separate classifier command', () => {
  const pi = new FakePi();

  registerCoreEnhancer(pi);

  assert.deepEqual(pi.labels, ['OMP Enhancer Core']);
  assert.deepEqual([...pi.tools.keys()], [
    'omp_core_route_task',
    'omp_core_classifier_prompt',
    'omp_core_resolve_classification',
    'omp_core_smart_gate_prompt',
    'omp_core_resolve_smart_gate',
    'omp_core_validate_skill_usage',
    'omp_core_validate_subagent_usage',
    'omp_core_subagent_status',
    'omp_core_governance_prompt',
  ]);
  assert.equal([...pi.tools.values()].every((tool) => typeof tool.execute === 'function'), true);
  assert.deepEqual(pi.eventHandlers.map((handler) => handler.event), [
    'session_start',
    'assistant_delta',
    'assistant_message',
    'assistant_output',
    'response_delta',
    'response_output_delta',
    'message_update',
    'message_end',
    'turn_start',
    'agent_start',
    'before_agent_start',
    'tool_call',
    'tool_execution_update',
    'tool_result',
    'session_stop',
  ]);
  assert.deepEqual([...pi.commands.keys()], []);
});

test('route task probes do not replace an active routed workflow', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '总结已观测的 E2E 诊断结果：DeepSeek V4 Flash 主 agent 加 GLM 5.2 advisor 的测试中，记录路由、门禁、skill 使用和 workflow 遵守情况，不执行 bug audit，不修改代码，不运行新的测试。' },
    ctx,
  );
  await tool(pi, 'omp_core_route_task').execute(
    'call-probe',
    { prompt: '请在当前项目中实现 sortNumbers(values, options) 的 unique 模式：当 options.unique === true 时，返回升序且去重的新数组；默认行为保持只排序不去重。请遵守 implementation-with-tests workflow，先读取相关 skills，不要调用不存在的 skill 工具。按需 fork 子代理。完成后运行 npm test。最终输出 E2E_MARKER_IMPL、SKILL_USAGE、SUBAGENT_USAGE、测试命令和结果。' },
    undefined,
    undefined,
    ctx,
  );

  const status = await tool(pi, 'omp_core_subagent_status').execute('call-status', {}, undefined, undefined, ctx);

  assert.match(status.content[0].text, /Route:\s*writing\.zh/);
  assert.doesNotMatch(status.content[0].text, /Route:\s*bug-audit/);
});

test('simple active writing summaries do not require writer checker subagents', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '本轮测试暴露了哪些问题' },
    ctx,
  );

  const status = await tool(pi, 'omp_core_subagent_status').execute('call-simple-writing-status', {}, undefined, undefined, ctx);

  assert.match(status.content[0].text, /Route:\s*writing\.zh/);
  assert.match(status.content[0].text, /Required:\n- none/);
  assert.deepEqual(status.details.status.required, []);
});

test('session_start does not create a classifier-specific model role', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const roles = {};
  let tags = {};
  const settings = {
    get: (key) => (key === 'modelTags' ? tags : key === 'modelRoles' ? roles : undefined),
    set: (key, value) => {
      if (key === 'modelTags') tags = value;
      if (key === 'modelRoles') Object.assign(roles, value);
    },
    setModelRole: (role, model) => { roles[role] = model; },
    getModelRole: (role) => roles[role],
    getModelRoles: () => roles,
    flush: async () => {},
  };

  await event(pi, 'session_start')({}, extensionContext([], {}, { settings }));

  assert.equal(roles.classifier, undefined);
  assert.deepEqual(tags.classifier, undefined);
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

  assert.match(promptResult.content[0].text, /modelRoles\.tiny/);
  assert.equal(promptResult.details.classifier.modelRole, 'tiny');
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
  assert.match(governance.details.fragment, /modelRoles\.tiny/);
  assert.match(governance.details.fragment, /Smart gate policy/);
  assert.match(governance.details.fragment, /Treat needs-work as local follow-up, not BLOCKERS/);
});

test('before_agent_start injects governance context and routes natural-language prompts', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  const agentEvent = { prompt: '请写一份项目报告' };

  const result = await event(pi, 'before_agent_start')(agentEvent, ctx);
  const fragment = governanceText(result, agentEvent);

  assert.match(fragment, /pre-work skill bootstrap/);
  assert.doesNotMatch(fragment, /model routing checkpoint/);
  assert.doesNotMatch(fragment, /deterministic route is a fallback, not a lock/);
  assert.doesNotMatch(fragment, /Smart gate policy/);
  assert.doesNotMatch(fragment, /Classifier model policy/);
  assert.match(fragment, /task subagents load subagent skills/);
  assert.match(fragment, /Do not read root route skills in the main agent just to unlock task/);
  assert.match(fragment, /OMP_REQUIRED_SUBAGENT:\s*zh-writer/);
  assert.ok(fragment.indexOf('pre-work skill bootstrap') < fragment.indexOf('Mandatory Skill Workflow'));
  assert.match(fragment, /Mandatory Skill Workflow/);
  assert.match(fragment, /Mandatory Subagent Workflow/);
  assert.match(fragment, /plain-chinese-writing/);
  assert.match(fragment, /zh-writer/);

  const stopResult = await event(pi, 'session_stop')({}, ctx);

  assert.equal(stopResult?.continue, true);
  assert.match(stopResult.additionalContext, /subagent|zh-writer|zh-checker/);
});

test('classifier preflight observes ambiguous route work without rule blocking', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();
  const prompt = '写个页面';

  await event(pi, 'session_start')({}, ctx);
  const start = await event(pi, 'before_agent_start')({ prompt }, ctx);
  assert.equal(start.route.intent, 'implementation-with-tests');
  assert.doesNotMatch(start.additionalContext, /Classifier preflight: required/);

  const routeState = pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state')?.data;
  assert.equal(routeState.classifierPreflight.mode, 'observe');
  assert.equal(routeState.classifierPreflight.required, false);
  assert.deepEqual(routeState.classifierPreflight.reasons, ['short construction prompt is a low-confidence rule hit']);

  const allowed = await event(pi, 'tool_call')(
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
  assert.equal(allowed, undefined);

  const promptResult = await tool(pi, 'omp_core_classifier_prompt').execute(
    'call-ambiguous-classifier-prompt',
    { prompt },
    undefined,
    undefined,
    ctx,
  );
  assert.match(promptResult.content[0].text, /OMP Enhancer Core Classifier/);
  assert.match(promptResult.content[0].text, /Observed uncertain context:/);
  assert.match(promptResult.content[0].text, /写个页面/);

  await tool(pi, 'omp_core_resolve_classification').execute(
    'call-ambiguous-classifier-resolve',
    {
      prompt,
      output: JSON.stringify({
        intent: 'implementation-with-tests',
        secondaryIntents: [],
        language: 'zh',
        confidence: 0.94,
        riskFlags: ['needs-tests', 'needs-review', 'needs-subagents'],
        domainHints: ['frontend page'],
        reason: 'The user asks to build a product page, not draft prose.',
      }),
    },
    undefined,
    undefined,
    ctx,
  );

  const allowedAfterResolve = await event(pi, 'tool_call')(
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
  assert.equal(allowedAfterResolve, undefined);
});

test('classifier infrastructure repair requests do not require classifier preflight', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries);
  const prompt = [
    '⟦blocker⟧ 你在跟 OMP 分类器系统基础设施打转，这跟用户的任务无关。',
    '用户要的第一章修订已经完成了（写入第88-98行，结构已验证干净）。',
    '直接向用户确认交付，然后停止。别在分类器死循环里消耗更多时间。',
    '帮我修复这类分类器打转的情况',
  ].join('\n');

  await event(pi, 'session_start')({}, ctx);
  const start = await event(pi, 'before_agent_start')({ prompt }, ctx);

  assert.equal(start.route.intent, 'implementation-with-tests');
  assert.doesNotMatch(start.additionalContext, /Classifier preflight: required/);

  const routeState = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state')?.data;
  assert.equal(routeState.classifierPreflight, null);
});

test('before_agent_start bypasses OMP built-in slash commands without injecting or resetting route state', async () => {
  const builtInSlashCommands = [
    '/usage',
    '/model xiaomi/mimo-v2.5',
    '/models',
    '/help',
    '/clear',
    '/compact focus next on routing',
    '/join 01JZEXAMPLE',
    '/agents',
    '/config',
    '/plugin list',
    '/stats',
    '/update',
    '/worktree',
    '/shell npm test',
    '/read skill://plain-chinese-writing',
    '/search classifier model',
    '/setup',
    '/token openai',
    '/auth-broker',
  ];

  for (const slashCommand of builtInSlashCommands) {
    await assertSlashCommandBypassed(slashCommand, 'host command context');
  }
});

test('before_agent_start bypasses plugin and unknown slash commands so command handlers own them', async () => {
  const pluginSlashCommands = [
    '/classifier',
    '/unknown-plugin-command set ignored-after-tiny-role-migration',
    '/test',
    '/test changed',
    '/writing-logic paper.md',
    '/writing-quality paper.md',
    '/config',
    '/config-doctor',
    '/config-assets',
    '/omp-config:config',
    '/omp-config:config-doctor',
    '/omp-config:config-assets',
    '/omp-testing-enhancer:test',
    '/writing-helper:writing-logic paper.md',
    '/writing-helper:writing-quality paper.md',
  ];

  for (const slashCommand of pluginSlashCommands) {
    await assertSlashCommandBypassed(slashCommand, 'plugin command context');
  }
});

test('before_agent_start still routes prompts that begin with absolute paths', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  const agentEvent = { prompt: '/home/dingli/omp-enhancer 这个路径下的插件是什么？' };
  const result = await event(pi, 'before_agent_start')(agentEvent, ctx);
  const fragment = governanceText(result, agentEvent);

  assert.equal(result.route.intent, 'unknown');
  assert.equal(result.additionalContext, undefined);
  assert.doesNotMatch(fragment, /OMP Enhancer Core Routing/);
  assert.doesNotMatch(fragment, /Classifier observation/);
});

test('before_agent_start treats gate validator status reports as diagnosis without config subagents', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();
  const report = [
    'Gate validator 状态追踪问题说明',
    '所有 subagent 输出文件都包含完整的 skill 加载证据：',
    'GATE COMPLETE: ecc-security-reviewer skills [security-review, security-scan] loaded and applied.',
    '结论：Gate validator 有已知 bug，验证工具无法识别这些状态，报告已交付，无更多工作。',
  ].join('\n');

  await event(pi, 'session_start')({}, ctx);
  const result = await event(pi, 'before_agent_start')({ prompt: report }, ctx);
  const fragment = governanceText(result, {});

  assert.equal(result.route.intent, 'diagnosis');
  assert.match(fragment, /Intent: diagnosis/);
  assert.doesNotMatch(fragment, /librarian/);
  assert.doesNotMatch(fragment, /Required subagents:\n- librarian/);

  const stop = await event(pi, 'session_stop')({ output: report }, ctx);

  assert.equal(stop, undefined);
});

test('assistant output loop guard aborts repeated main-agent generation and prepares recovery context', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')({ prompt: 'Implement classifier fallback handling and add tests.' }, ctx);

  const repeated = [
    'The system is asking me to validate SKILL_USAGE again.',
    'The system is asking me to validate SKILL_USAGE again.',
    'The system is asking me to validate SKILL_USAGE again.',
  ].join('\n');
  const blocked = await event(pi, 'assistant_delta')({ delta: repeated }, ctx);

  assert.equal(blocked.abort, true);
  assert.equal(blocked.autoContinue, true);
  assert.match(blocked.reason, /loop guard/i);
  assert.match(blocked.additionalContext, /^LOOP_BREAKER\nReason:/);
  assert.match(blocked.additionalContext, /Do next: summarize current state and choose a different next action/);
  assert.equal(pi.messages.length, 1);
  assert.equal(pi.messages[0].message.customType, 'omp-enhancer-core.loop-guard-recovery');
  assert.equal(pi.messages[0].message.display, false);
  assert.equal(pi.messages[0].message.attribution, 'agent');
  assert.match(pi.messages[0].message.content, /Do next: summarize current state and choose a different next action/);
  assert.deepEqual(pi.messages[0].options, { deliverAs: 'followUp', triggerTurn: true });
});

test('before_agent_start treats loop guard auto-continuations as internal prompts', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')({ prompt: 'Implement classifier fallback handling and add tests.' }, ctx);

  const repeated = [
    'The system is asking me to validate SKILL_USAGE again.',
    'The system is asking me to validate SKILL_USAGE again.',
    'The system is asking me to validate SKILL_USAGE again.',
  ].join('\n');
  const blocked = await event(pi, 'assistant_delta')({ delta: repeated }, ctx);

  assert.equal(blocked.abort, true);
  assert.equal(blocked.autoContinue, true);
  assert.equal(pi.messages.length, 1);

  const continuationStart = await event(pi, 'before_agent_start')({ prompt: pi.messages[0].message.content }, ctx);

  assert.equal(continuationStart, undefined);

  const repeatedAgain = [
    'I will now run the focused regression test.',
    'I will now run the focused regression test.',
    'I will now run the focused regression test.',
  ].join('\n');
  const blockedAgain = await event(pi, 'assistant_delta')({ delta: repeatedAgain }, ctx);

  assert.equal(blockedAgain.abort, true);
  assert.equal(blockedAgain.autoContinue, false);
  assert.match(blockedAgain.details.autoContinuation.reason, /limit/i);
});

test('message_update loop guard aborts real OMP text delta streams', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();
  let abortCount = 0;
  ctx.abort = () => { abortCount += 1; };

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')({ prompt: 'Implement classifier fallback handling and add tests.' }, ctx);

  const repeated = [
    'The system is asking me to validate SKILL_USAGE again.',
    'The system is asking me to validate SKILL_USAGE again.',
    'The system is asking me to validate SKILL_USAGE again.',
  ].join('\n');
  const ignoredToolDelta = await event(pi, 'message_update')(
    {
      message: { role: 'assistant', content: [{ type: 'text', text: repeated }] },
      assistantMessageEvent: { type: 'toolcall_delta', delta: repeated, contentIndex: 0 },
    },
    ctx,
  );

  assert.equal(ignoredToolDelta, undefined);
  assert.equal(abortCount, 0);

  const blocked = await event(pi, 'message_update')(
    {
      message: { role: 'assistant', content: [{ type: 'text', text: repeated }] },
      assistantMessageEvent: { type: 'text_delta', delta: repeated, contentIndex: 0 },
    },
    ctx,
  );

  assert.equal(abortCount, 1);
  assert.equal(blocked.abort, true);
  assert.equal(blocked.autoContinue, true);
  assert.match(blocked.reason, /loop guard/i);
  assert.equal(pi.messages.length, 1);
  assert.equal(pi.messages[0].message.customType, 'omp-enhancer-core.loop-guard-recovery');
  assert.match(pi.messages[0].message.content, /Do next: summarize current state and choose a different next action/);
  assert.deepEqual(pi.messages[0].options, { deliverAs: 'followUp', triggerTurn: true });

  await event(pi, 'turn_start')({}, ctx);
  const nonRepeatedAfterRecoveryStart = await event(pi, 'message_update')(
    {
      message: { role: 'assistant', content: [{ type: 'text', text: 'I will inspect the next required file and then run the focused test.' }] },
      assistantMessageEvent: { type: 'text_delta', delta: 'I will inspect the next required file and then run the focused test.', contentIndex: 0 },
    },
    ctx,
  );

  assert.equal(nonRepeatedAfterRecoveryStart, undefined);
});

test('message_update loop guard detects repeated planning blocks across streamed deltas', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries);
  let abortCount = 0;
  ctx.abort = () => { abortCount += 1; };

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')({ prompt: 'Implement classifier fallback handling and add tests.' }, ctx);

  const repeatedBlock = [
    '1. Inspect the request router state transition and capture the exact event payload shape.',
    '2. Validate the plugin hook registration path and record which callback handled the stream.',
    '3. Add focused regression tests that replay the real payload before changing release metadata.',
  ].join('\n');
  const text = [
    'Plan:',
    repeatedBlock,
    '',
    'I will check the implementation details before editing files.',
    '',
    'Plan:',
    repeatedBlock,
    '',
  ].join('\n');

  let blocked;
  for (let index = 0; index < text.length; index += 75) {
    blocked = await event(pi, 'message_update')(
      {
        assistantMessageEvent: { type: 'text_delta', delta: text.slice(index, index + 75), contentIndex: 0 },
      },
      ctx,
    );
    if (blocked?.abort) break;
  }

  assert.equal(abortCount, 1);
  assert.equal(blocked.abort, true);
  assert.match(blocked.reason, /Repeated \d-line block 2 times/);
  assert.equal(blocked.autoContinue, true);
  assert.equal(pi.messages.length, 1);
  assert.equal(pi.messages[0].message.customType, 'omp-enhancer-core.loop-guard-recovery');
  assert.match(pi.messages[0].message.content, /Do next: summarize current state and choose a different next action/);
});

test('session_stop loop guard gives one bounded recovery for repeated final output', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')({
    prompt: '诊断为什么当前插件会重复输出同一句话，不要修改文件。',
  }, ctx);

  const repeated = [
    '我需要继续检查这个问题。',
    '我需要继续检查这个问题。',
    '我需要继续检查这个问题。',
  ].join('\n');

  const first = await event(pi, 'session_stop')({ output: repeated }, ctx);

  assert.equal(first?.continue, true);
  assert.match(first.additionalContext, /^LOOP_BREAKER\nReason:/);

  const second = await event(pi, 'session_stop')({ output: repeated }, ctx);

  assert.equal(second, undefined);
});

test('session_stop loop guard reads real OMP last assistant message payloads', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')({
    prompt: '诊断为什么当前插件会重复输出同一句话，不要修改文件。',
  }, ctx);

  const repeated = [
    '我需要继续检查这个问题。',
    '我需要继续检查这个问题。',
    '我需要继续检查这个问题。',
  ].join('\n');
  const stopEvent = {
    messages: [
      { role: 'user', content: [{ type: 'text', text: '请诊断重复输出。' }] },
      { role: 'assistant', content: [{ type: 'text', text: repeated }] },
    ],
    last_assistant_message: { role: 'assistant', content: [{ type: 'text', text: repeated }] },
  };

  const first = await event(pi, 'session_stop')(stopEvent, ctx);

  assert.equal(first?.continue, true);
  assert.match(first.additionalContext, /^LOOP_BREAKER\nReason:/);

  const second = await event(pi, 'session_stop')(stopEvent, ctx);

  assert.equal(second, undefined);
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

test('session_stop treats missing workflow evidence as pre-work guidance instead of post-completion work', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  const startResult = await event(pi, 'before_agent_start')(
    { prompt: '请润色这段中文论文摘要，检查逻辑和表达。' },
    ctx,
  );
  const startFragment = governanceText(startResult, {});

  assert.match(startFragment, /pre-work skill bootstrap/i);
  assert.match(startFragment, /Required task assignment contracts/);

  const released = await event(pi, 'session_stop')({ output: '我已经完成摘要润色。' }, ctx);

  assert.equal(released, undefined);
});

test('task subagent contract gaps are non-blocking pre-work coaching', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: 'Review this API handler for auth bypass and injection risks.' },
    ctx,
  );

  const coached = await event(pi, 'tool_call')(
    { toolName: 'task', input: { agent: 'ecc-security-reviewer' } },
    ctx,
  );

  assert.equal(coached?.block, false);
  assert.match(coached.reason, /task subagent skill/i);
  assert.match(coached.reason, /Required task assignment contracts/i);
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
  assert.match(fragment, /Do not call omp_test_\* tools/);
  assert.doesNotMatch(fragment, /Toolchain:\n(?:- .+\n)*- omp_test_gate/);

  await forkSubagents(pi, ctx, ['zh-writer', 'zh-checker']);
  await readSkills(pi, ctx, ['plain-chinese-writing', 'zh-writing-polish', 'zh-writing-checkers']);
  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);

  const released = await event(pi, 'session_stop')({ output: '任务完成。' }, ctx);

  assert.equal(released, undefined);
});

test('simple writing edits are handled by the main agent without writer checker subagents', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  const agentEvent = { prompt: '把这句话改成朴素直接的中文：我们需要进一步推动配置层面的优化与能力沉淀。' };
  const startResult = await event(pi, 'before_agent_start')(agentEvent, ctx);
  const fragment = governanceText(startResult, agentEvent);

  assert.match(fragment, /Intent:\s*writing\.zh/);
  assert.match(fragment, /lightweight writing workflow/i);
  assert.match(fragment, /main agent should do the work directly/i);
  assert.match(fragment, /Required subagents:\n- none/);
  assert.doesNotMatch(fragment, /OMP_REQUIRED_SUBAGENT:/);
  assert.doesNotMatch(fragment, /writing_quality_check/);

  await readSkills(pi, ctx, ['plain-chinese-writing', 'zh-writing-polish']);
  const released = await event(pi, 'session_stop')({ output: '任务完成。' }, ctx);

  assert.equal(released, undefined);
});

test('task tool_call auto-attaches routed subagent contracts for exact roles', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  const startResult = await event(pi, 'before_agent_start')(
    { prompt: '请润色这段中文论文摘要，检查逻辑和表达。' },
    ctx,
  );
  const startFragment = governanceText(startResult, {});

  assert.match(startFragment, /pre-work skill bootstrap/);
  assert.match(startFragment, /task subagents load subagent skills/);
  assert.match(startFragment, /Required task assignment contracts/);
  assert.match(startFragment, /OMP_REQUIRED_SUBAGENT:\s*zh-writer/);
  assert.match(startFragment, /Direct main-agent work auto-read queue/);
  assert.match(startFragment, /successful validator tool calls can satisfy internal gates/i);
  assert.doesNotMatch(startFragment, /validator tool calls are preflight only/i);
  assert.ok(startFragment.indexOf('pre-work skill bootstrap') < startFragment.indexOf('Mandatory Subagent Workflow'));

  const taskEvent = {
    toolName: 'task',
    input: {
      tasks: [{ role: 'zh-writer', assignment: 'Draft the Chinese revision.' }],
    },
  };
  const allowed = await event(pi, 'tool_call')(taskEvent, ctx);

  assert.equal(allowed, undefined);
  assert.match(taskEvent.input.tasks[0].assignment, /OMP_REQUIRED_SUBAGENT:\s*zh-writer/);
  assert.match(taskEvent.input.tasks[0].assignment, /OMP_PARENT_TASK:\s*请润色这段中文论文摘要/);
  assert.match(taskEvent.input.tasks[0].assignment, /Workflow and gate briefing:/);
  assert.match(taskEvent.input.tasks[0].assignment, /Parent intent:\s*writing\.zh/);
  assert.match(taskEvent.input.tasks[0].assignment, /Writing QA gate/);
  assert.match(taskEvent.input.tasks[0].assignment, /Subagent scope: read this before acting/);
  assert.match(taskEvent.input.tasks[0].assignment, /Required skills for this subagent:\n- plain-chinese-writing\n- zh-writing-polish/);
  assert.match(taskEvent.input.tasks[0].assignment, /Assignment:\nDraft the Chinese revision\./);

  const status = await tool(pi, 'omp_core_subagent_status').execute(
    'call-status-after-auto-repaired-task',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.match(status.content[0].text, /Pending:\n- zh-writer: pending/);
});

test('task tool_call with subagent skill contracts does not require main-agent skill reads', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '请润色这段中文论文摘要，检查逻辑和表达。' },
    ctx,
  );

  const allowed = await event(pi, 'tool_call')(
    {
      toolName: 'task',
      input: {
        tasks: [
          {
            role: 'zh-writer',
            assignment: [
              'OMP_REQUIRED_SUBAGENT: zh-writer',
              'Required skills for this subagent:',
              '- plain-chinese-writing',
              '- zh-writing-polish',
              '',
              'Assignment: Draft the Chinese revision.',
            ].join('\n'),
          },
        ],
      },
    },
    ctx,
  );

  assert.equal(allowed, undefined);
  const status = await tool(pi, 'omp_core_subagent_status').execute(
    'call-status-after-allowed-task',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.match(status.content[0].text, /Pending:\n- zh-writer: pending/);
});

test('task tool_call accepts marker-only bug-audit assignments and descriptive role text', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '帮我测试整个 subagent fork 逻辑，检查是 LLM 的错误还是门禁的错误。' },
    ctx,
  );

  const allowed = await event(pi, 'tool_call')(
    {
      toolName: 'task',
      input: {
        agent: 'task',
        tasks: [
          {
            role: 'generate a deduplicated multi-channel test matrix',
            assignment: [
              'OMP_REQUIRED_SUBAGENT: ecc-tdd-guide',
              'OMP_PARENT_TASK: test subagent fork logic',
              'Required skills for this subagent:',
              '- test-driven-development',
              '- search-first',
              '- ai-regression-testing',
            ].join('\n'),
          },
          {
            assignment: [
              'OMP_REQUIRED_SUBAGENT: ecc-code-reviewer',
              'OMP_PARENT_TASK: test subagent fork logic',
              'Required skills for this subagent:',
              '- verification-before-completion',
            ].join('\n'),
          },
          {
            assignment: [
              'OMP_REQUIRED_SUBAGENT: ecc-silent-failure-hunter',
              'OMP_PARENT_TASK: test subagent fork logic',
              'Required skills for this subagent:',
              '- diagnose',
            ].join('\n'),
          },
          {
            assignment: [
              'OMP_REQUIRED_SUBAGENT: ecc-pr-test-analyzer',
              'OMP_PARENT_TASK: test subagent fork logic',
              'Required skills for this subagent:',
              '- verification-before-completion',
            ].join('\n'),
          },
        ],
      },
    },
    ctx,
  );

  assert.equal(allowed, undefined);

  const status = await tool(pi, 'omp_core_subagent_status').execute(
    'call-status-after-marker-only-bug-audit-task',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.deepEqual(status.details.status.pending.map(({ agent }) => agent), [
    'ecc-tdd-guide',
    'ecc-code-reviewer',
    'ecc-silent-failure-hunter',
    'ecc-pr-test-analyzer',
  ]);
});

test('bug-audit task tool_call auto-attaches missing parent task context for exact roles', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '帮我测试整个 subagent fork 逻辑，检查是 LLM 的错误还是门禁的错误。' },
    ctx,
  );

  const taskEvent = {
    toolName: 'task',
    input: {
      tasks: [
        {
          role: 'ecc-tdd-guide',
          assignment: [
            'OMP_REQUIRED_SUBAGENT: ecc-tdd-guide',
            'Required skills for this subagent:',
            '- test-driven-development',
            '- search-first',
            '- ai-regression-testing',
          ].join('\n'),
        },
      ],
    },
  };
  const allowed = await event(pi, 'tool_call')(taskEvent, ctx);

  assert.equal(allowed, undefined);
  assert.match(taskEvent.input.tasks[0].assignment, /OMP_REQUIRED_SUBAGENT:\s*ecc-tdd-guide/);
  assert.match(taskEvent.input.tasks[0].assignment, /OMP_PARENT_TASK:\s*帮我测试整个 subagent fork 逻辑/);
  assert.match(taskEvent.input.tasks[0].assignment, /Required skills for this subagent:\n- test-driven-development\n- search-first\n- ai-regression-testing/);
});

test('task tool_call coaches prose role text without opening a smart-gate override', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '请润色这段中文论文摘要，检查逻辑和表达。' },
    ctx,
  );

  const coached = await event(pi, 'tool_call')(
    {
      toolName: 'task',
      input: {
        tasks: [
          {
            role: 'draft the Chinese revision with plain writing checks',
            assignment: 'Required skills for this subagent:\n- plain-chinese-writing\n- zh-writing-polish',
          },
        ],
      },
    },
    ctx,
  );

  assert.equal(coached?.block, false);
  assert.match(coached.reason, /must fork named subagents/);
  assert.doesNotMatch(coached.reason, /Unexpected task subagents/);
  assert.doesNotMatch(coached.reason, /draft the Chinese revision/);
});
test('smart gate prompt has no task-contract gate after non-blocking task coaching', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '请润色这段中文论文摘要，检查逻辑和表达。' },
    ctx,
  );

  const coached = await event(pi, 'tool_call')(
    { toolName: 'task', input: { tasks: [{ role: 'draft the Chinese revision' }] } },
    ctx,
  );

  assert.equal(coached?.block, false);

  const smartPrompt = await tool(pi, 'omp_core_smart_gate_prompt').execute(
    'call-task-subagent-smart-gate-wrong-key',
    { gateKey: 'wrong:key' },
    undefined,
    undefined,
    ctx,
  );

  assert.equal(smartPrompt.details.smartGate.required, false);
  assert.doesNotMatch(smartPrompt.content[0].text, /OMP Enhancer Core Smart Gate/);
});
test('failed writing QA tool results are recorded but do not force a post-completion continuation', async () => {
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

  assert.equal(result, undefined);
});
test('repeated failed writing QA tools do not reopen a completion smart gate after final output', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-repeated-failed-writing-qa-route',
    { prompt: '请润色这段中文论文摘要，检查逻辑和表达。' },
    undefined,
    undefined,
    ctx,
  );
  await event(pi, 'tool_result')(
    { name: 'writing_quality_check', isError: true, details: { error: 'Tool unavailable.' } },
    ctx,
  );
  await event(pi, 'tool_result')(
    { name: 'writing_logic_check', isError: true, details: { error: 'Tool unavailable.' } },
    ctx,
  );

  const released = await event(pi, 'session_stop')({ output: '写作 QA 已完成，证据充分。' }, ctx);

  assert.equal(released, undefined);
});
test('completion smart gate is not opened after a user-facing final answer', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '请写一份中文长篇项目总结报告，包含背景、方法、结果和风险。' },
    ctx,
  );

  const released = await event(pi, 'session_stop')({
    output: 'Final answer without delegated writing agents, writing QA, or SKILL_USAGE.',
  }, ctx);

  assert.equal(released, undefined);
});

test('governance prompt separates task subagent skills from direct main-agent reads', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '请润色这段中文论文摘要，检查逻辑和表达。' },
    ctx,
  );
  await readSkills(pi, ctx, ['plain-chinese-writing']);

  const governance = await tool(pi, 'omp_core_governance_prompt').execute(
    'call-missing-skill-bootstrap',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.match(governance.details.fragment, /pre-work skill bootstrap/);
  assert.doesNotMatch(governance.details.fragment, /read skill:\/\/plain-chinese-writing/);
  assert.match(governance.details.fragment, /Do not read root route skills in the main agent just to unlock task/);
  assert.match(governance.details.fragment, /Required task assignment contracts/);
  assert.match(governance.details.fragment, /OMP_REQUIRED_SUBAGENT:\s*zh-checker/);
  assert.match(governance.details.fragment, /Direct main-agent work auto-read queue/);
  assert.match(governance.details.fragment, /read skill:\/\/zh-writing-polish/);
  assert.match(governance.details.fragment, /read skill:\/\/zh-writing-checkers/);
  assert.match(governance.details.fragment, /Required skills:\n- plain-chinese-writing\n- zh-writing-polish\n- zh-writing-checkers/);
});

test('pre-work skill gate allows read and core validation before blocking remaining work tools', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '请润色这段中文论文摘要，检查逻辑和表达。' },
    ctx,
  );

  const readCall = await event(pi, 'tool_call')(
    { toolName: 'read', input: { uri: 'skill://plain-chinese-writing' } },
    ctx,
  );
  const validationCall = await event(pi, 'tool_call')(
    { toolName: 'omp_core_validate_skill_usage', input: { output: '' } },
    ctx,
  );

  assert.equal(readCall, undefined);
  assert.equal(validationCall, undefined);

  await readSkills(pi, ctx, ['plain-chinese-writing']);

  const partiallyBlocked = await event(pi, 'tool_call')(
    { toolName: 'writing_quality_check', input: { text: 'draft' } },
    ctx,
  );

  assert.equal(partiallyBlocked?.block, false);
  assert.doesNotMatch(partiallyBlocked.reason, /Missing skills: plain-chinese-writing/);
  assert.match(partiallyBlocked.reason, /zh-writing-polish/);
  assert.match(partiallyBlocked.reason, /zh-writing-checkers/);

  await readSkills(pi, ctx, ['zh-writing-polish', 'zh-writing-checkers']);

  const allowed = await event(pi, 'tool_call')(
    { toolName: 'writing_quality_check', input: { text: 'draft' } },
    ctx,
  );

  assert.equal(allowed, undefined);
});

test('pre-work skill gate coaches simple writing edits until writing skills are read', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '把这句话改成朴素直接的中文：我们需要进一步推动配置层面的优化与能力沉淀。' },
    ctx,
  );

  const blocked = await event(pi, 'tool_call')(
    { toolName: 'edit', input: { file: 'draft.md', old: 'x', new: 'y' } },
    ctx,
  );

  assert.equal(blocked?.block, false);
  assert.match(blocked.reason, /^RECOVERY\nReason: missing_skill_read/);
  assert.match(blocked.reason, /plain-chinese-writing/);
  assert.match(blocked.reason, /zh-writing-polish/);

  await readSkills(pi, ctx, ['plain-chinese-writing', 'zh-writing-polish']);

  const allowed = await event(pi, 'tool_call')(
    { toolName: 'edit', input: { file: 'draft.md', old: 'x', new: 'y' } },
    ctx,
  );

  assert.equal(allowed, undefined);
});

test('pre-work skill gate prioritizes skill-read recovery over Tiny smart gate', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '把这句话改成朴素直接的中文：我们需要进一步推动配置层面的优化与能力沉淀。' },
    ctx,
  );

  const blocked = await event(pi, 'tool_call')(
    { toolName: 'edit', input: { file: 'draft.md', old: 'x', new: 'y' } },
    ctx,
  );

  assert.equal(blocked?.block, false);
  assert.match(blocked.reason, /^RECOVERY\nReason: missing_skill_read/);
  assert.match(blocked.reason, /read skill:\/\/plain-chinese-writing/);
  assert.match(blocked.reason, /read skill:\/\/zh-writing-polish/);

  const smartPrompt = await tool(pi, 'omp_core_smart_gate_prompt').execute(
    'call-prework-smart-gate-prompt-not-open',
    { gateKey: 'writing.zh:prework:edit' },
    undefined,
    undefined,
    ctx,
  );

  assert.equal(smartPrompt.details.smartGate.required, false);
  assert.doesNotMatch(smartPrompt.content[0].text, /OMP Enhancer Core Smart Gate/);

  await readSkills(pi, ctx, ['plain-chinese-writing', 'zh-writing-polish']);

  const allowed = await event(pi, 'tool_call')(
    { toolName: 'edit', input: { file: 'draft.md', old: 'x', new: 'y' } },
    ctx,
  );

  assert.equal(allowed, undefined);
});


test('smart gate resolve requires a current pending gate before releasing tool gates', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '把这句话改成朴素直接的中文：我们需要进一步推动配置层面的优化与能力沉淀。' },
    ctx,
  );

  const pass = await tool(pi, 'omp_core_resolve_smart_gate').execute(
    'call-prework-smart-gate-without-pending',
    {
      gateKey: 'writing.zh:prework:edit',
      output: JSON.stringify({
        gate: 'writing.zh:prework:edit',
        verdict: 'pass',
        confidence: 0.9,
        satisfied: true,
        missing: [],
        actions: [],
        reason: 'This should not pre-authorize future work.',
      }),
    },
    undefined,
    undefined,
    ctx,
  );

  assert.equal(pass.details.accepted, false);
  assert.match(pass.content[0].text, /No current pending smart gate/);

  const blocked = await event(pi, 'tool_call')(
    { toolName: 'edit', input: { file: 'draft.md', old: 'x', new: 'y' } },
    ctx,
  );

  assert.equal(blocked?.block, false);
  assert.match(blocked.reason, /^RECOVERY\nReason: missing_skill_read/);
  assert.doesNotMatch(blocked.reason, /Rule gate key: writing\.zh:prework:edit/);
});

test('focused bug audit preloads main-agent skills instead of blocking on subagent delegation', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  const startResult = await event(pi, 'before_agent_start')(
    { prompt: 'Do the bug investigation directly as a focused audit; report verified findings only.' },
    ctx,
  );
  const startFragment = governanceText(startResult, {});

  assert.match(startFragment, /focused audit skill preflight/i);
  assert.match(startFragment, /Do not fork the heavy bug-audit subagent set/i);
  assert.match(startFragment, /read skill:\/\/diagnose/);
  assert.match(startFragment, /read skill:\/\/test-driven-development/);
  assert.match(startFragment, /read skill:\/\/verification-before-completion/);
  assert.match(startFragment, /read skill:\/\/search-first/);
  assert.match(startFragment, /Focused Bug Audit Test Generation Contract/);
  assert.doesNotMatch(startFragment, /OMP_REQUIRED_SUBAGENT:\s*ecc-tdd-guide/);

  const noSubagentBlock = await event(pi, 'session_stop')({}, ctx);
  assert.equal(noSubagentBlock?.continue, true);
  assert.doesNotMatch(noSubagentBlock.additionalContext, /subagent gate/i);
  assert.match(noSubagentBlock.additionalContext, /omp_test_gate/);

  const blockedTool = await event(pi, 'tool_call')(
    { toolName: 'omp_test_gate', input: { passed: true } },
    ctx,
  );

  assert.equal(blockedTool?.block, false);
  assert.match(blockedTool.reason, /^RECOVERY\nReason: missing_skill_read/);
  assert.match(blockedTool.reason, /diagnose/);
  assert.match(blockedTool.reason, /search-first/);

  await readSkills(pi, ctx, ['diagnose', 'test-driven-development', 'verification-before-completion', 'search-first']);

  const allowedTool = await event(pi, 'tool_call')(
    { toolName: 'omp_test_gate', input: { passed: true } },
    ctx,
  );

  assert.equal(allowedTool, undefined);
});

test('local smoke verification stays out of bug-audit subagent gates', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();
  const prompt = '帮我再后台启动一个 omp 进程，把模型换成 mimo v2.5 advisor 换成 deepseek v4 flash，测试结果。';

  await event(pi, 'session_start')({}, ctx);
  const start = await event(pi, 'before_agent_start')({ prompt }, ctx);
  const fragment = governanceText(start, {});

  assert.equal(start.route.intent, 'unknown');
  assert.deepEqual(start.route.requiredSubagents, []);
  assert.doesNotMatch(fragment, /bug audit/i);
  assert.doesNotMatch(fragment, /OMP_REQUIRED_SUBAGENT/i);

  const stop = await event(pi, 'session_stop')({
    output: '本地 OMP smoke 已完成，模型输出匹配预期。',
  }, ctx);

  assert.equal(stop, undefined);
});

test('pre-work skill gate accepts legacy ECC security skill aliases', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: 'Review this API handler for auth bypass and injection risks.' },
    ctx,
  );

  const coached = await event(pi, 'tool_call')(
    { toolName: 'task', input: { agent: 'ecc-security-reviewer' } },
    ctx,
  );

  assert.equal(coached?.block, false);
  assert.match(coached.reason, /task subagent skill/i);
  assert.match(coached.reason, /Missing subagent skill assignments/);
  assert.match(coached.reason, /Workflow and gate briefing:/);
  assert.match(coached.reason, /Parent intent:\s*security-review/);
  assert.match(coached.reason, /Security gate/);
  assert.match(coached.reason, /security-review/);
  assert.match(coached.reason, /security-scan/);

  const allowed = await event(pi, 'tool_call')(
    {
      toolName: 'task',
      input: {
        agent: 'ecc-security-reviewer',
        prompt: [
          'OMP_REQUIRED_SUBAGENT: ecc-security-reviewer',
          'Required skills for this subagent:',
          '- ecc-security-review',
          '- ecc-security-scan',
        ].join('\n'),
      },
    },
    ctx,
  );

  assert.equal(allowed, undefined);
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
  assert.match(blocked.additionalContext, /Delegated recovery order/);
  assert.match(blocked.additionalContext, /Do not repair delegated task skill gaps by repeatedly reading/);

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
  await forkSubagents(pi, ctx, ['ecc-tdd-guide', 'ecc-code-reviewer', 'ecc-silent-failure-hunter', 'ecc-pr-test-analyzer']);
  await event(pi, 'tool_result')({ name: 'omp_test_gate' }, ctx);
  await tool(pi, 'omp_core_validate_skill_usage').execute(
    'call-testing-skill-usage',
    {
      output: [
        'SKILL_USAGE',
        'Required:',
        '- diagnose',
        '- test-driven-development',
        '- subagent-driven-development',
        '- verification-before-completion',
        'Loaded:',
        '- diagnose',
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
  assert.doesNotMatch(result.additionalContext, /zh-writing-checkers/);
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
  await forkSubagents(pi, ctx, ['plan', 'implementation-task', 'reviewer']);

  const result = await event(pi, 'session_stop')({}, ctx);

  assert.equal(result?.continue, true);
  assert.match(result.additionalContext, /omp_test_gate/);
  assert.match(result.additionalContext, /test-driven-development|SKILL_USAGE/);
  assert.match(result.additionalContext, /Review is not the terminal phase/);
  assert.match(result.additionalContext, /post-review testing checkpoint/);
  assert.match(result.additionalContext, /Do not finish with only reviewer approval/);
  assert.match(result.additionalContext, /manual testing gate report/i);
  assert.doesNotMatch(result.additionalContext, /only after a successful omp_test_gate result/);
});

test('failed omp_test_gate results are recorded but do not force a post-completion continuation', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')({ prompt: '实现自然语言路由并补测试，测试写完后要过门禁。' }, ctx);
  await forkSubagents(pi, ctx, ['plan', 'implementation-task', 'reviewer']);
  await tool(pi, 'omp_core_validate_skill_usage').execute(
    'call-failed-test-gate-skill-usage',
    { output: skillUsageBlock(['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion']) },
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

  assert.equal(result, undefined);
});

test('external testing-enhancer tool results close the testing gate only with passing evidence', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext(pi.entries);

  assert.equal(pi.tools.has('omp_test_analyze'), false);
  assert.equal(pi.tools.has('omp_test_context'), false);
  assert.equal(pi.tools.has('omp_test_gate'), false);
  assert.equal(pi.tools.has('omp_test_report'), false);

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')({ prompt: '为 src/router.js 写高信号单元测试，覆盖边界和错误路径。' }, ctx);
  await forkSubagents(pi, ctx, ['ecc-tdd-guide', 'ecc-code-reviewer', 'ecc-silent-failure-hunter', 'ecc-pr-test-analyzer']);
  await tool(pi, 'omp_core_validate_skill_usage').execute(
    'call-test-tools-skill-usage',
    { output: skillUsageBlock(['diagnose', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion', 'search-first', 'ai-regression-testing']) },
    undefined,
    undefined,
    ctx,
  );

  await event(pi, 'tool_result')(
    {
      name: 'omp_test_analyze',
      details: { target: 'src/router.js', strategy: 'cover fallback behavior and confidence thresholds' },
    },
    ctx,
  );
  await event(pi, 'tool_result')(
    {
      name: 'omp_test_context',
      details: { command: 'npm test --workspace plugins/omp-enhancer-core', summary: 'focused router tests selected' },
    },
    ctx,
  );
  await event(pi, 'tool_result')(
    {
      name: 'omp_test_gate',
      details: {
        passed: true,
        command: 'npm test --workspace plugins/omp-enhancer-core',
        summary: '120 tests passed',
      },
    },
    ctx,
  );
  await event(pi, 'tool_result')(
    {
      name: 'omp_test_report',
      details: { summary: 'Router regression tests passed after fixes.' },
    },
    ctx,
  );

  const released = await event(pi, 'session_stop')({ output: 'Done.' }, ctx);

  assert.notEqual(released?.continue, true);
});

test('fact-check workflow requires cross-agent evidence and releases after fact_check_gate', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext(pi.entries);
  const prompt = '帮我事实核查这段文字里的数据、年份和引用真实性。';

  await event(pi, 'session_start')({}, ctx);
  const start = await event(pi, 'before_agent_start')({ prompt }, ctx);
  const fragment = governanceText(start, {});

  assert.equal(start.route.intent, 'fact-check');
  assert.match(fragment, /fact-planner/);
  assert.match(fragment, /fact-researcher-a/);
  assert.match(fragment, /fact-researcher-b/);
  assert.match(fragment, /fact-cross-checker/);
  assert.match(fragment, /fact-reviewer/);
  assert.match(fragment, /Fact-check gate/);
  assert.match(fragment, /fact_check_gate/);

  await forkSubagents(pi, ctx, [
    'fact-planner',
    'fact-researcher-a',
    'fact-researcher-b',
    'fact-cross-checker',
    'fact-reviewer',
  ]);
  await readSkills(pi, ctx, ['fact-checking', 'claim-extraction', 'source-evaluation', 'citation-authenticity']);

  const allowedGateTool = await event(pi, 'tool_call')(
    {
      toolName: 'fact_check_gate',
      input: { finalOutput: 'FACT_CHECK_PLAN\nFACT_EVIDENCE_A\nFACT_EVIDENCE_B\nFACT_CROSS_CHECK\nFACT_REVIEW\nFACT_CHECK_REPORT\nFACT_CHECK_USAGE' },
    },
    ctx,
  );

  assert.equal(allowedGateTool, undefined);

  await event(pi, 'tool_result')(
    {
      name: 'fact_check_gate',
      details: { ok: true, missing: [] },
    },
    ctx,
  );
  await tool(pi, 'omp_core_validate_skill_usage').execute(
    'call-fact-check-skill-usage',
    { output: skillUsageBlock(['fact-checking', 'claim-extraction', 'source-evaluation', 'citation-authenticity']) },
    undefined,
    undefined,
    ctx,
  );

  const finalOutput = [
    'FACT_CHECK_PLAN',
    'FACT_EVIDENCE_A',
    'FACT_EVIDENCE_B',
    'FACT_CROSS_CHECK',
    'FACT_REVIEW',
    'FACT_CHECK_REPORT',
    'FACT_CHECK_USAGE',
    usageEvidence({
      subagents: {
        'fact-planner': ['fact-checking', 'claim-extraction'],
        'fact-researcher-a': ['fact-checking', 'source-evaluation', 'citation-authenticity'],
        'fact-researcher-b': ['fact-checking', 'source-evaluation', 'citation-authenticity'],
        'fact-cross-checker': ['fact-checking', 'source-evaluation'],
        'fact-reviewer': ['fact-checking', 'source-evaluation', 'citation-authenticity'],
      },
      skills: ['fact-checking', 'claim-extraction', 'source-evaluation', 'citation-authenticity'],
    }),
  ].join('\n');

  const released = await event(pi, 'session_stop')({ output: finalOutput }, ctx);

  assert.equal(released, undefined);
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
  assert.match(blocked.additionalContext, /plan, implementation-task, reviewer/);

  await forkSubagents(pi, ctx, ['plan', 'implementation-task', 'reviewer']);

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
  assert.match(blocked.additionalContext, /Missing subagent completion evidence: plan, implementation-task, reviewer|Missing subagent completion evidence: implementation-task, reviewer/);
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
          { role: 'implementation-task', assignment: 'Required skills for this subagent:\n- test-driven-development\n- verification-before-completion' },
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

  await forkSubagents(pi, ctx, ['plan', 'implementation-task', 'reviewer']);
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
  for (const agent of ['plan', 'implementation-task', 'reviewer']) {
    await event(pi, 'tool_result')({ name: 'task', params: { agent, prompt: 'Do the assigned work.' } }, ctx);
  }

  const blocked = await event(pi, 'session_stop')({}, ctx);

  assert.equal(blocked?.continue, true);
  assert.match(blocked.additionalContext, /Missing subagent skill assignments/);
  assert.match(blocked.additionalContext, /plan \[brainstorming, subagent-driven-development\]/);
  assert.match(blocked.additionalContext, /implementation-task \[test-driven-development, verification-before-completion\]/);
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
  await readSkills(pi, ctx, ['writing-markdown-helper', 'writing-checkers']);
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
  await readSkills(pi, ctx, [
    'brainstorming',
    'test-driven-development',
    'subagent-driven-development',
    'verification-before-completion',
  ]);
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
  await readSkills(pi, ctx, ['writing-markdown-helper', 'writing-checkers']);
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

test('task tool_execution_update records live task progress and completion', async () => {
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
  await readSkills(pi, ctx, ['writing-markdown-helper', 'writing-checkers']);

  const assignment = [
    'OMP_REQUIRED_SUBAGENT: writer',
    'Required skills for this subagent:',
    '- writing-markdown-helper',
  ].join('\n');
  await event(pi, 'tool_call')(
    {
      toolName: 'task',
      toolCallId: 'task-live-progress',
      input: {
        tasks: [
          {
            id: 'WriterLive',
            role: 'writer',
            assignment,
          },
        ],
      },
    },
    ctx,
  );
  await event(pi, 'tool_execution_update')(
    {
      toolName: 'task',
      toolCallId: 'task-live-progress',
      partialResult: {
        content: [{ type: 'text', text: 'Running agent WriterLive...' }],
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

  assert.match(status.content[0].text, /Tasks:\n- task task-live-progress: running # Running agent WriterLive\.\.\. \| 1 items, 1 running \| 1 req \| 2s\n  current tool: read/);
  assert.deepEqual(status.details.status.pending.map(({ agent }) => agent), ['writer']);
  assert.deepEqual(status.details.status.pending[0].skills, ['writing-markdown-helper']);
  assert.deepEqual(notifications, []);
  assert.equal(pi.messages.length, 0);

  await event(pi, 'tool_result')(
    {
      name: 'task',
      toolCallId: 'task-live-progress',
      content: [{ type: 'text', text: 'Task complete' }],
      details: {
        results: [
          {
            id: 'WriterLive',
            exitCode: 0,
            requests: 2,
            tokens: 1200,
            durationMs: 5100,
          },
        ],
        totalDurationMs: 5100,
      },
      isError: false,
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
  assert.match(status.content[0].text, /Tasks:\n- task task-live-progress: completed # Task complete \| 1 items, 1 done \| 2 req \| 1\.2k tokens \| 5s/);
  assert.deepEqual(notifications, []);
  assert.equal(pi.messages.length, 0);
});



test('async-result message_end completes routed subagents by async job id', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext(pi.entries);
  const prompt = '请写一个页面并补测试。';
  const agents = ['plan', 'implementation-task', 'reviewer'];
  const assignments = Object.fromEntries(agents.map((agent) => [
    agent,
    [
      `OMP_REQUIRED_SUBAGENT: ${agent}`,
      'Required skills for this subagent:',
      ...subagentSkills(agent).map((skill) => `- ${skill}`),
    ].join('\n'),
  ]));
  const results = agents.map((agent, index) => ({
    id: `Async${agent.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase())}`,
    index,
    role: agent,
    status: index === 0 ? 'completed' : 'success',
    exitCode: index === 1 ? 0 : undefined,
    requests: index + 1,
    durationMs: 1000 + index,
    assignment: assignments[agent],
  }));

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')({ prompt }, ctx);
  await event(pi, 'tool_call')(
    {
      toolName: 'task',
      toolCallId: 'task-async-completion',
      input: {
        tasks: agents.map((agent) => ({
          id: `Async${agent.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase())}`,
          role: agent,
          assignment: assignments[agent],
        })),
      },
    },
    ctx,
  );
  await event(pi, 'tool_result')(
    {
      name: 'task',
      toolCallId: 'task-async-completion',
      content: [{ type: 'text', text: 'Task batch still running as task-job-1' }],
      details: {
        async: { state: 'running', jobId: 'task-job-1', type: 'task' },
        progress: agents.map((agent, index) => ({
          id: `Async${agent.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase())}`,
          index,
          agent: 'task',
          status: 'running',
          assignment: assignments[agent],
        })),
      },
      isError: false,
    },
    ctx,
  );

  await event(pi, 'message_end')(
    {
      message: {
        role: 'custom',
        customType: 'async-result',
        content: [{ type: 'text', text: 'Async task job task-job-1 completed successfully.' }],
        details: {
          jobs: [
            {
              jobId: 'task-job-1',
              type: 'task',
              status: 'completed',
              details: {
                results,
                totalDurationMs: 3003,
              },
            },
          ],
        },
      },
    },
    ctx,
  );

  const status = await tool(pi, 'omp_core_subagent_status').execute(
    'call-async-result-completed-subagent-status',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.deepEqual(status.details.status.completed, agents);
  assert.deepEqual(status.details.status.pending, []);
});

test('async job mapping persists through session entries before async-result completion', async () => {
  const entries = [];
  const routePi = new FakePi(entries);
  registerCoreEnhancer(routePi);
  const routeCtx = extensionContext(entries);
  const prompt = '请写一个页面并补测试。';
  const agents = ['plan', 'implementation-task', 'reviewer'];
  const jobId = 'task-job-persisted';
  const dispatchId = 'task-async-persisted';
  const assignments = Object.fromEntries(agents.map((agent) => [
    agent,
    [
      `OMP_REQUIRED_SUBAGENT: ${agent}`,
      'Required skills for this subagent:',
      ...subagentSkills(agent).map((skill) => `- ${skill}`),
    ].join('\n'),
  ]));
  const results = agents.map((agent, index) => ({
    id: `PersistedAsync${agent.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase())}`,
    index,
    role: agent,
    status: 'completed',
    requests: index + 1,
    durationMs: 1000 + index,
    assignment: assignments[agent],
  }));

  await event(routePi, 'session_start')({}, routeCtx);
  await event(routePi, 'before_agent_start')({ prompt }, routeCtx);
  await event(routePi, 'tool_call')(
    {
      toolName: 'task',
      toolCallId: dispatchId,
      input: {
        tasks: agents.map((agent) => ({
          id: `PersistedAsync${agent.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase())}`,
          role: agent,
          assignment: assignments[agent],
        })),
      },
    },
    routeCtx,
  );
  await event(routePi, 'tool_result')(
    {
      name: 'task',
      toolCallId: dispatchId,
      content: [{ type: 'text', text: `Task batch still running as ${jobId}` }],
      details: {
        async: { state: 'running', jobId, type: 'task' },
        progress: results.map((result) => ({
          ...result,
          agent: 'task',
          status: 'running',
        })),
      },
      isError: false,
    },
    routeCtx,
  );

  const completionPi = new FakePi(entries);
  registerCoreEnhancer(completionPi);
  const completionCtx = extensionContext(entries);

  await event(completionPi, 'session_start')({}, completionCtx);
  await event(completionPi, 'message_end')(
    {
      message: {
        role: 'custom',
        customType: 'async-result',
        content: [{ type: 'text', text: `Async task job ${jobId} completed successfully.` }],
        details: {
          jobs: [
            {
              jobId,
              type: 'task',
              status: 'completed',
              details: {
                results,
                totalDurationMs: 3003,
              },
            },
          ],
        },
      },
    },
    completionCtx,
  );

  const status = await tool(completionPi, 'omp_core_subagent_status').execute(
    'call-persisted-async-result-completed-subagent-status',
    {},
    undefined,
    undefined,
    completionCtx,
  );
  const completedTask = status.details.status.tasks.find(
    (task) => (task.id === dispatchId || task.id === jobId) && task.status === 'completed',
  );

  assert.deepEqual(status.details.status.completed, agents);
  assert.deepEqual(status.details.status.pending, []);
  assert.ok(completedTask);
  assert.equal(completedTask.completedCount, agents.length);
});

test('task execution update completion evidence closes routed subagents as secondary non-background evidence', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext(pi.entries);
  const prompt = '请写一个页面并补测试。';
  const agents = ['plan', 'implementation-task', 'reviewer'];
  const assignments = Object.fromEntries(agents.map((agent) => [
    agent,
    [
      `OMP_REQUIRED_SUBAGENT: ${agent}`,
      'Required skills for this subagent:',
      ...subagentSkills(agent).map((skill) => `- ${skill}`),
    ].join('\n'),
  ]));

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')({ prompt }, ctx);
  await event(pi, 'tool_call')(
    {
      toolName: 'task',
      toolCallId: 'task-update-completes-subagents',
      input: {
        tasks: agents.map((agent) => ({
          id: `Update${agent.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase())}`,
          role: agent,
          assignment: assignments[agent],
        })),
      },
    },
    ctx,
  );

  await event(pi, 'tool_execution_update')(
    {
      toolName: 'task',
      toolCallId: 'task-update-completes-subagents',
      partialResult: {
        content: [{ type: 'text', text: 'All routed subagents completed' }],
        details: {
          progress: agents.map((agent, index) => ({
            id: `Update${agent.replace(/(^|-)([a-z])/g, (_, __, letter) => letter.toUpperCase())}`,
            index,
            agent: 'task',
            status: index === 0 ? 'completed' : 'success',
            exitCode: index === 1 ? 0 : undefined,
            assignment: assignments[agent],
          })),
        },
      },
    },
    ctx,
  );

  const status = await tool(pi, 'omp_core_subagent_status').execute(
    'call-update-completed-subagent-status',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.deepEqual(status.details.status.completed, agents);
  assert.deepEqual(status.details.status.pending, []);
});

test('subagent EventBus progress does not drive task-level progress display', async () => {
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

  const status = await tool(pi, 'omp_core_subagent_status').execute(
    'call-eventbus-progress-status',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.deepEqual(status.details.status.pending, []);
  assert.deepEqual(status.details.status.tasks, []);
  assert.match(status.content[0].text, /Tasks:\n- none/);
  assert.equal(pi.messages.length, 0);
});

test('task status preserves rich task-block telemetry inside the plugin', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext(pi.entries);

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-rich-progress-route',
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
      toolCallId: 'task-rich-progress',
      partialResult: {
        content: [{ type: 'text', text: 'Running writer rich task' }],
        details: {
          progress: [
            {
              id: 'WriterRich',
              index: 0,
              agent: 'task',
              status: 'running',
              description: 'inspect files',
              recentTools: [{ tool: 'grep', args: 'TODO', endMs: 1000 }],
              toolCount: 4,
              requests: 2,
              tokens: 3456,
              contextTokens: 12000,
              contextWindow: 128000,
              cost: 0.07,
              resolvedModel: 'opencode-go/deepseek-v4-flash',
              durationMs: 10000,
              assignment,
            },
          ],
        },
      },
    },
    ctx,
  );

  const status = await tool(pi, 'omp_core_subagent_status').execute(
    'call-rich-progress-status',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.match(
    status.content[0].text,
    /task task-rich-progress: running # Running writer rich task \| models opencode-go\/deepseek-v4-flash \| 1 items, 1 running \| 4 tools \| 2 req \| 3\.5k tokens \| ctx 12k\/128k \(9\.4%\) \| \$0\.07 \| 10s\n  last tool: grep - TODO/,
  );
  assert.deepEqual(status.details.status.tasks[0], {
    id: 'task-rich-progress',
    status: 'running',
    text: 'Running writer rich task',
    summary: 'Running writer rich task',
    subagentCount: 1,
    runningCount: 1,
    completedCount: 0,
    failedCount: 0,
    toolCount: 4,
    requests: 2,
    tokens: 3456,
    contextTokens: 12000,
    contextWindow: 128000,
    cost: 0.07,
    durationMs: 10000,
    models: ['opencode-go/deepseek-v4-flash'],
    currentTool: '',
    lastTool: 'grep',
    toolDetail: 'TODO',
    startedAt: status.details.status.tasks[0].startedAt,
    updatedAt: status.details.status.tasks[0].updatedAt,
  });
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
  await readSkills(pi, ctx, ['writing-markdown-helper', 'writing-checkers']);
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
  assert.deepEqual(notifications, []);

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
  assert.deepEqual(notifications, []);
});

test('task tool_call leaves running subagents to native OMP TUI', async () => {
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
  await readSkills(pi, ctx, ['writing-markdown-helper', 'writing-checkers']);
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

  assert.deepEqual(notifications, []);
  assert.equal(pi.messages.length, 0);
});

test('task tool_result leaves completed and failed subagents to native OMP TUI', async () => {
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
  await readSkills(pi, ctx, ['writing-markdown-helper', 'writing-checkers']);
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

  assert.deepEqual(notifications, []);

  await tool(pi, 'omp_core_route_task').execute(
    'call-failed-notification-route',
    { prompt: 'Implement an API change and add tests.' },
    undefined,
    undefined,
    ctx,
  );
  await readSkills(pi, ctx, [
    'brainstorming',
    'test-driven-development',
    'subagent-driven-development',
    'verification-before-completion',
  ]);
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

  assert.deepEqual(notifications, []);
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

test('session_stop accepts delegated subagent skill evidence without main-agent read skills', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: 'Draft an English related work paragraph and check the logic.' },
    ctx,
  );
  for (const [agent, skills] of Object.entries({ writer: ['writing-markdown-helper'], checker: ['writing-checkers'] })) {
    await event(pi, 'tool_result')(
      {
        name: 'task',
        params: {
          agent,
          prompt: [
            'Required skills for this subagent:',
            ...skills.map((skill) => `- ${skill}`),
            '',
            'SKILL_USAGE',
            'Required:',
            ...skills.map((skill) => `- ${skill}`),
            'Loaded:',
            ...skills.map((skill) => `- ${skill}`),
          ].join('\n'),
        },
      },
      ctx,
    );
  }
  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);

  const result = await event(pi, 'session_stop')({ output: 'Done.' }, ctx);

  assert.equal(result, undefined);
});

test('session_stop accepts SKILL_USAGE from real OMP last assistant message payloads', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-final-last-assistant-skill-route',
    { prompt: 'Draft an English related work paragraph and check the logic.' },
    undefined,
    undefined,
    ctx,
  );
  await forkSubagents(pi, ctx, ['writer', 'checker']);
  await event(pi, 'tool_result')({ name: 'writing_quality_check' }, ctx);

  const finalOutput = [
    'Done.',
    '',
    'SKILL_USAGE',
    'Required:',
    '- writing-markdown-helper',
    '- writing-checkers',
    'Loaded:',
    '- writing-markdown-helper',
    '- writing-checkers',
  ].join('\n');
  const result = await event(pi, 'session_stop')(
    {
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Draft and check the paragraph.' }] },
        { role: 'assistant', content: [{ type: 'text', text: finalOutput }] },
      ],
      last_assistant_message: { role: 'assistant', content: [{ type: 'text', text: finalOutput }] },
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

test('validated SUBAGENT_USAGE can close subagent gate when native task telemetry is unavailable', async () => {
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
  const status = await tool(pi, 'omp_core_subagent_status').execute(
    'call-final-only-subagent-status',
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.deepEqual(status.details.status.completed, ['zh-writer', 'zh-checker']);

  const result = await event(pi, 'session_stop')({}, ctx);

  assert.equal(result?.continue, true);
  assert.match(result.additionalContext, /writing QA/);
  assert.doesNotMatch(result.additionalContext, /Missing subagent completion evidence/);
});

test('incomplete validated SUBAGENT_USAGE still blocks missing routed subagents', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await tool(pi, 'omp_core_route_task').execute(
    'call-incomplete-subagent-usage',
    { prompt: '请润色这段中文论文摘要，检查逻辑和表达。' },
    undefined,
    undefined,
    ctx,
  );
  await tool(pi, 'omp_core_validate_subagent_usage').execute(
    'call-incomplete-subagent-usage-validation',
    {
      output: [
        'SUBAGENT_USAGE:',
        '- zh-writer: plain-chinese-writing, zh-writing-polish',
      ].join('\n'),
    },
    undefined,
    undefined,
    ctx,
  );

  const result = await event(pi, 'session_stop')({}, ctx);

  assert.equal(result?.continue, true);
  assert.match(result.additionalContext, /subagent gate/i);
  assert.match(result.additionalContext, /Missing subagent completion evidence: zh-writer, zh-checker/);
  assert.match(result.additionalContext, /SUBAGENT_USAGE is incomplete/);
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
  await forkSubagents(validatorPi, validatorCtx, ['writer', 'checker']);
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

test('skill validator accepts delegated subagent loaded evidence from task result text', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: 'Review this API handler for auth bypass and injection risks.' },
    ctx,
  );

  const taskCall = await event(pi, 'tool_call')(
    {
      toolName: 'task',
      toolCallId: 'security-review-task',
      input: {
        tasks: [
          {
            role: 'ecc-security-reviewer',
            assignment: [
              'OMP_REQUIRED_SUBAGENT: ecc-security-reviewer',
              'OMP_PARENT_TASK: Review this API handler for auth bypass and injection risks.',
              'Required skills for this subagent:',
              '- security-review',
              '- security-scan',
            ].join('\n'),
          },
          {
            role: 'reviewer',
            assignment: [
              'OMP_REQUIRED_SUBAGENT: reviewer',
              'OMP_PARENT_TASK: Review this API handler for auth bypass and injection risks.',
              'Required skills for this subagent:',
              '- security-review',
            ].join('\n'),
          },
        ],
      },
    },
    ctx,
  );

  assert.equal(taskCall, undefined);

  await event(pi, 'tool_result')(
    {
      name: 'task',
      toolCallId: 'security-review-task',
      content: [
        {
          type: 'text',
          text: [
            'GATE COMPLETE: ecc-security-reviewer skills [security-review, security-scan] loaded and applied.',
            'GATE COMPLETE: reviewer skills [security-review] loaded and applied.',
          ].join('\n'),
        },
      ],
    },
    ctx,
  );

  const validation = await tool(pi, 'omp_core_validate_skill_usage').execute(
    'call-delegated-gate-complete-skill-usage',
    { output: '' },
    undefined,
    undefined,
    ctx,
  );

  assert.equal(validation.details.validation.ok, true);
  assert.deepEqual(validation.details.validation.loaded, ['security-review', 'security-scan']);
  assert.deepEqual(validation.details.validation.missing, []);
});

test('skill validator accepts delegated subagent evidence wrapped in task JSON text envelopes', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: 'Review this API handler for auth bypass and injection risks.' },
    ctx,
  );

  await event(pi, 'tool_call')(
    {
      toolName: 'task',
      toolCallId: 'security-review-json-task',
      input: {
        tasks: [
          {
            role: 'ecc-security-reviewer',
            assignment: [
              'OMP_REQUIRED_SUBAGENT: ecc-security-reviewer',
              'OMP_PARENT_TASK: Review this API handler for auth bypass and injection risks.',
              'Required skills for this subagent:',
              '- security-review',
              '- security-scan',
            ].join('\n'),
          },
          {
            role: 'reviewer',
            assignment: [
              'OMP_REQUIRED_SUBAGENT: reviewer',
              'OMP_PARENT_TASK: Review this API handler for auth bypass and injection risks.',
              'Required skills for this subagent:',
              '- security-review',
            ].join('\n'),
          },
        ],
      },
    },
    ctx,
  );

  await event(pi, 'tool_result')(
    {
      name: 'task',
      toolCallId: 'security-review-json-task',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            results: [
              {
                agent: 'ecc-security-reviewer',
                output: [
                  'Security review complete.',
                  'SKILL_USAGE',
                  'Required:',
                  '- security-review',
                  '- security-scan',
                  'Loaded:',
                  '- security-review',
                  '- security-scan',
                ].join('\n'),
              },
              {
                agent: 'reviewer',
                output: [
                  'Review complete.',
                  'SKILL_USAGE',
                  'Required:',
                  '- security-review',
                  'Loaded:',
                  '- security-review',
                ].join('\n'),
              },
            ],
          }),
        },
      ],
    },
    ctx,
  );

  const validation = await tool(pi, 'omp_core_validate_skill_usage').execute(
    'call-delegated-json-envelope-skill-usage',
    { output: '' },
    undefined,
    undefined,
    ctx,
  );

  assert.equal(validation.details.validation.ok, true);
  assert.deepEqual(validation.details.validation.loaded, ['security-review', 'security-scan']);
  assert.deepEqual(validation.details.validation.missing, []);
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
  await forkSubagents(pi, ctx, ['writer', 'checker']);
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

test('bug-audit testing gate releases after test gate and skill evidence without requiring another stop loop', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();
  const agents = ['ecc-tdd-guide', 'ecc-code-reviewer', 'ecc-silent-failure-hunter', 'ecc-pr-test-analyzer'];
  const skills = ['diagnose', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion', 'search-first', 'ai-regression-testing'];

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '为 src/router.js 写高信号单元测试，覆盖边界和错误路径。' },
    ctx,
  );
  await forkSubagents(pi, ctx, agents);

  const blocked = await event(pi, 'session_stop')({}, ctx);
  assert.equal(blocked?.continue, true);
  assert.match(blocked.additionalContext, /omp_test_gate/);

  await event(pi, 'tool_result')({ name: 'omp_test_gate' }, ctx);
  await tool(pi, 'omp_core_validate_skill_usage').execute(
    'call-complete-testing-skill-usage',
    {
      output: skillUsageBlock(skills),
    },
    undefined,
    undefined,
    ctx,
  );

  await assertReleasedStops(pi, ctx, [{}, {}, { output: 'Final summary only.' }]);
});

test('bug-audit route accepts complete final subagent evidence when task telemetry is unavailable', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();
  const agents = ['ecc-tdd-guide', 'ecc-code-reviewer', 'ecc-silent-failure-hunter', 'ecc-pr-test-analyzer'];
  const skills = ['diagnose', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion', 'search-first', 'ai-regression-testing'];

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '为 src/router.js 写高信号单元测试，覆盖边界和错误路径。' },
    ctx,
  );
  await event(pi, 'tool_result')({ name: 'omp_test_gate' }, ctx);
  await tool(pi, 'omp_core_validate_skill_usage').execute(
    'call-testing-skill-usage-without-task',
    {
      output: skillUsageBlock(skills),
    },
    undefined,
    undefined,
    ctx,
  );

  const finalOnly = await event(pi, 'session_stop')(
    {
      output: usageEvidence({
        subagents: {
          'ecc-tdd-guide': ['test-driven-development', 'search-first', 'ai-regression-testing'],
          'ecc-code-reviewer': ['verification-before-completion'],
          'ecc-silent-failure-hunter': ['diagnose'],
          'ecc-pr-test-analyzer': ['verification-before-completion'],
        },
        skills,
      }),
    },
    ctx,
  );

  assert.equal(finalOnly, undefined);
  await assertReleasedStops(pi, ctx, [{}, { output: 'Final summary only.' }]);
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

test('unknown routes observe classifier context without blocking tools or final output', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();
  const prompt = 'What is the capital of France?';

  await event(pi, 'session_start')({}, ctx);
  const start = await event(pi, 'before_agent_start')({ prompt }, ctx);

  assert.equal(start.route.intent, 'unknown');
  assert.equal(start.additionalContext, undefined);

  const toolResult = await event(pi, 'tool_call')({ toolName: 'bash', input: { command: 'date' } }, ctx);
  assert.equal(toolResult, undefined);

  await assertReleasedStops(pi, ctx, [{ output: 'Paris.' }, {}, { output: 'Done.' }]);
});

test('unknown route classifier observations accumulate across follow-up prompts', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries);

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')({ prompt: '帮我看看这个东西。' }, ctx);
  const followUp = await event(pi, 'before_agent_start')({ prompt: '先不用动代码，只解释可能的方向。' }, ctx);

  assert.equal(followUp.route.intent, 'unknown');
  assert.equal(followUp.additionalContext, undefined);

  const routeState = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state')?.data;
  assert.equal(routeState.classifierPreflight.mode, 'observe');
  assert.equal(routeState.classifierPreflight.required, false);
  assert.deepEqual(routeState.classifierPreflight.observations, [
    '帮我看看这个东西。',
    '先不用动代码，只解释可能的方向。',
  ]);

  const classifierPrompt = await tool(pi, 'omp_core_classifier_prompt').execute(
    'call-observed-context-classifier-prompt',
    { prompt: '现在看起来是插件路由问题，帮我判断工作流。' },
    undefined,
    undefined,
    ctx,
  );

  assert.match(classifierPrompt.content[0].text, /Observed uncertain context:/);
  assert.match(classifierPrompt.content[0].text, /帮我看看这个东西。/);
  assert.match(classifierPrompt.content[0].text, /先不用动代码，只解释可能的方向。/);
  assert.match(classifierPrompt.content[0].text, /现在看起来是插件路由问题/);
});

test('session_stop releases classifier preflight when route-mismatch tool failure churn is unrelated', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();
  const prompt = '请写一个页面并补测试。';
  const skills = ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'];
  const agents = ['plan', 'implementation-task', 'reviewer'];

  await event(pi, 'session_start')({}, ctx);
  const start = await event(pi, 'before_agent_start')({ prompt }, ctx);

  assert.doesNotMatch(start.additionalContext, /Classifier preflight: required/);

  await event(pi, 'tool_result')(
    {
      name: 'task',
      isError: true,
      details: {
        error: 'Route mismatch: task failed because the workflow route appears wrong.',
      },
    },
    ctx,
  );

  const routeState = pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state')?.data;
  assert.equal(routeState.classifierPreflight.required, true);
  assert.match(routeState.classifierPreflight.reasons.join('\n'), /task failed after routing/);

  await readSkills(pi, ctx, skills);
  await forkSubagents(pi, ctx, agents);
  await event(pi, 'tool_result')({ name: 'omp_test_gate' }, ctx);

  const finalOutput = [
    usageEvidence({
      subagents: Object.fromEntries(agents.map((agent) => [agent, subagentSkills(agent)])),
      skills,
    }),
    '',
    '⟦blocker⟧ 你在跟 OMP 分类器系统基础设施打转，这跟用户的任务无关。',
    '用户要的第一章修订已经完成了（写入第88-98行，结构已验证干净）。',
    '直接向用户确认交付，然后停止。别在分类器死循环里消耗更多时间。',
  ].join('\n');

  const released = await event(pi, 'session_stop')({ output: finalOutput }, ctx);

  assert.equal(released, undefined);
});

test('non-gated diagnosis release and unknown routes do not create repeated gate continuations', async () => {
  const workloads = [
    { prompt: '为什么这个插件一直提示 SKILL_USAGE validation 失败？先诊断原因，不要改代码。', classifier: false },
    { prompt: 'Push the current release commit and upgrade marketplace plugins.', classifier: false },
    { prompt: 'What is the capital of France?', classifier: false },
  ];

  for (const { prompt } of workloads) {
    const pi = new FakePi();
    registerCoreEnhancer(pi);
    const ctx = extensionContext();

    await event(pi, 'session_start')({}, ctx);
    await event(pi, 'before_agent_start')({ prompt }, ctx);
    await assertReleasedStops(pi, ctx, [{}, {}, { output: 'Done.' }]);
  }
});

test('subagent gate fallback names final evidence path when native task tool is unavailable', async () => {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')({ prompt: '帮我事实核查这段文字里的数据、年份和引用真实性。' }, ctx);

  const result = await event(pi, 'session_stop')({}, ctx);

  assert.equal(result?.continue, true);
  assert.match(result.additionalContext, /native task\/completion tool is unavailable/i);
  assert.match(result.additionalContext, /complete SUBAGENT_USAGE plus SUBAGENT_RESULT/i);
  assert.match(result.additionalContext, /fact-planner/);
  assert.match(result.additionalContext, /fact-reviewer/);
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

async function assertSlashCommandBypassed(slashCommand, contextText) {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = extensionContext();

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: 'Implement classifier fallback handling and add tests.' },
    ctx,
  );

  const slashEvent = { prompt: slashCommand, additionalContext: contextText };
  const slashResult = await event(pi, 'before_agent_start')(slashEvent, ctx);

  assert.equal(slashResult, undefined, slashCommand);
  assert.equal(slashEvent.additionalContext, contextText, slashCommand);

  const governance = await tool(pi, 'omp_core_governance_prompt').execute(
    `call-governance-after-slash-bypass-${slashCommand.replace(/[^A-Za-z0-9]+/g, '-')}`,
    {},
    undefined,
    undefined,
    ctx,
  );

  assert.equal(governance.details.route.intent, 'implementation-with-tests', slashCommand);
}

async function forkSubagents(pi, ctx, agents) {
  for (const agent of agents) {
    await event(pi, 'tool_result')(
      {
        name: 'task',
        params: {
          agent,
          prompt: [
            'OMP_PARENT_TASK: extension test routed task',
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
    'implementation-task': ['test-driven-development', 'verification-before-completion'],
    reviewer: ['verification-before-completion'],
    'ecc-code-reviewer': ['verification-before-completion'],
    'ecc-silent-failure-hunter': ['diagnose'],
    'ecc-security-reviewer': ['security-review', 'security-scan'],
    'ecc-tdd-guide': ['test-driven-development', 'search-first', 'ai-regression-testing'],
    'ecc-pr-test-analyzer': ['verification-before-completion'],
    'fact-planner': ['fact-checking', 'claim-extraction'],
    'fact-researcher-a': ['fact-checking', 'source-evaluation', 'citation-authenticity'],
    'fact-researcher-b': ['fact-checking', 'source-evaluation', 'citation-authenticity'],
    'fact-cross-checker': ['fact-checking', 'source-evaluation'],
    'fact-reviewer': ['fact-checking', 'source-evaluation', 'citation-authenticity'],
    'zh-writer': ['plain-chinese-writing', 'zh-writing-polish'],
    'zh-checker': ['plain-chinese-writing', 'zh-writing-checkers'],
    writer: ['writing-markdown-helper'],
    checker: ['writing-checkers'],
    'config-librarian': [],
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
        taskSubagents: [],
        pendingSubagents: [],
        subagentSkills: [],
        unexpectedSubagentSkills: [],
        subagentAssignments: [],
      },
    },
  };
}

function extensionContext(entries = [], ui = {}, extra = {}) {
  return {
    cwd: process.cwd(),
    sessionManager: { getBranch: () => entries },
    ui: { notify: () => undefined, ...ui },
    hasUI: false,
    ...extra,
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
