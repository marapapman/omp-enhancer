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

  on(eventName, handler) {
    this.eventHandlers.push({ event: eventName, handler });
  }

  appendEntry(customType, data) {
    this.entries.push({ type: 'custom', customType, data });
  }
}

test('primary startup records task facts without changing the native prompt or adding a message', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  let nativeBuilds = 0;
  pi.pi = {
    SKILL_PROMPT_MESSAGE_TYPE: 'skill-prompt',
    getActiveSkills: () => [
      { name: 'omp-enhancer-workflows', description: 'Select composable workflows.', filePath: '/skills/omp-enhancer-workflows/SKILL.md' },
      { name: 'writing-review', description: 'Review academic prose.', filePath: '/skills/writing-review/SKILL.md' },
      { name: 'code-development', description: 'Plan, test, and review code changes.', filePath: '/skills/code-development/SKILL.md' },
      { name: 'hidden-skill', description: 'Must remain hidden.', disableModelInvocation: true },
    ],
    buildSkillPromptMessage: async () => {
      nativeBuilds += 1;
      return { message: 'must not autoload', details: { name: 'wrong' } };
    },
  };
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries);

  await event(pi, 'session_start')({}, ctx);
  const startEvent = {
    prompt: 'Diagnose the parser, implement the fix, add tests, and review the result.',
    systemPrompt: ['base prompt'],
  };
  const originalEvent = structuredClone(startEvent);
  const routed = await event(pi, 'before_agent_start')(startEvent, ctx);

  assert.equal(nativeBuilds, 0);
  assert.equal(routed, undefined);
  assert.deepEqual(startEvent, originalEvent);

  const snapshot = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.deepEqual(Object.keys(snapshot.lastTaskContext).sort(), [
    'intent',
    'taskDescriptor',
  ]);
  assert.equal(snapshot.lastTaskContext.intent, 'agent-selected');
});

test('DeepSeek Flash receives a compact three-phase soft reminder without replacing the native prompt', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  pi.getActiveTools = () => ['read', 'task', 'todo'];
  pi.pi = {
    getActiveSkills: () => [
      { name: 'omp-enhancer-workflows', description: 'Select composable workflows.' },
      { name: 'writing-review', description: 'Review academic prose.' },
    ],
  };
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries, process.cwd(), {
    model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
  });
  const startEvent = {
    prompt: 'Fix the parser across multiple files, add regression tests, and verify behavior.',
    systemPrompt: [nativeDelegationPrompt({ batch: true, cap: 4 }), 'native Skill inventory'],
  };
  const originalEvent = structuredClone(startEvent);

  const result = await event(pi, 'before_agent_start')(startEvent, ctx);

  assert.deepEqual(startEvent, originalEvent);
  assert.equal(Object.hasOwn(result, 'systemPrompt'), false);
  assert.equal(result.message.customType, 'omp-enhancer-skill-discovery');
  assert.equal(result.message.display, false);
  assert.equal(result.message.attribution, 'user');
  assert.equal(result.message.details.model, 'deepseek-v4-flash');
  assert.match(result.message.content, /^DEEPSEEK_SOFT_PROTOCOL/u);
  assert.match(result.message.content, /ENTRY \(soft\)[\s\S]*DIRECT is only a verbatim already-present field or heading[\s\S]*no judgment[\s\S]*Everything else is PROJECT/iu);
  assert.match(result.message.content, /review, correction, comparison, verification, design, transformation, or planning regardless of target size or a named path/iu);
  assert.match(result.message.content, /PROJECT DO NOW . DISCOVER:[\s\S]*named target waits[\s\S]*exactly one call[\s\S]*`read skill:\/\/omp-enhancer-workflows`[\s\S]*wait for the index/iu);
  assert.match(result.message.content, /Do not add a project, Skill, reference, `todo`, or `task` call/iu);
  assert.match(result.message.content, /PUBLIC CHECKPOINTS:[\s\S]*only visible assistant text counts[\s\S]*thinking, tool arguments, files, and `\.\.\.` do not[\s\S]*`PLAN URI:` is copy data until PLAN is visible/iu);
  assert.match(result.message.content, /AFTER INDEX . choose values, then copy this fully filled block from thinking into visible assistant text before constructing any call[\s\S]*WORKFLOW PLAN\nPrimary:[\s\S]*Add-ons:[\s\S]*Skills:[\s\S]*Load order:[\s\S]*Actions:\n1\.[\s\S]*thinking, narration without the block, or `\.\.\.` does not count/iu);
  assert.match(result.message.content, /separate numbered Action for each distinct requested checkpoint or evidence phase[\s\S]*do not collapse them into one catch-all line/iu);
  assert.match(result.message.content, /first visible content item.+WORKFLOW PLAN.+resource calls may follow/iu);
  assert.match(result.message.content, /AFTER ALL DECLARED RESOURCES AND ANY CATALOG EXTENSION[\s\S]*WORKFLOW READY \| primary=<id-or-none>[\s\S]*rebase the detailed numbered TODO/iu);
  assert.match(result.message.content, /native `todo` is exposed.+only call.+TODO init.+end and wait.+project work starts in the next response/iu);
  assert.match(result.message.content, /preserve every loaded card checkpoint and evidence boundary[\s\S]*plan-review or reviewer decision.+explicit TODO row/iu);
  assert.match(result.message.content, /ORDER: index -> wait -> visible PLAN plus resource-only calls -> wait -> visible READY plus rebased TODO -> project work/iu);
  assert.match(result.message.content, /guidance only:[\s\S]*Main selects resources[\s\S]*native OMP owns tools, permissions, delegation, and completion/iu);
  assert.match(result.message.content, /COMPAT_REVIEW_CONTEXT \(soft, no quota\)/u);
  assert.match(result.message.content, /DELEGATION AFTER READY \(soft, no quota\)/u);
  assert.match(result.message.content, /selects no Agent, fork, reviewer count, dispatch, or completion condition/i);
  assert.doesNotMatch(result.message.content, /suggested=|within-native-cap|native-cap=|NATIVE_BATCH_SHAPE|action=delegate|block:\s*true|continue:\s*true/u);
  assert.ok(result.message.content.length < 3600, `compatibility context length=${result.message.content.length}`);
  assert.deepEqual(result.message.details.features, [
    'skill-discovery',
    'workflow-selection',
    'delegation-decision',
    'dynamic-review-budget',
  ]);

  assert.equal(await event(pi, 'before_agent_start')({
    prompt: '继续',
    systemPrompt: ['native OMP prompt'],
  }, ctx), undefined, 'the reminder is one-shot for the active task');
});

test('MiMo v2.5 receives the same exact-model three-phase reminder once', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  pi.getActiveTools = () => ['read', 'task', 'todo'];
  pi.pi = {
    getActiveSkills: () => [{ name: 'omp-enhancer-workflows', description: 'Select workflows.' }],
  };
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries, process.cwd(), {
    model: { provider: 'opencode-go', id: 'mimo-v2.5' },
  });

  const result = await event(pi, 'before_agent_start')({
    prompt: 'Audit two modules and compare their evidence.',
    systemPrompt: ['native OMP prompt'],
  }, ctx);

  assert.match(result.message.content, /^MIMO_SOFT_PROTOCOL/u);
  assert.equal(result.message.details.model, 'mimo-v2.5');
  assert.match(result.message.content, /PROJECT DO NOW . DISCOVER[\s\S]*`read skill:\/\/omp-enhancer-workflows`/iu);
  assert.match(result.message.content, /PUBLIC CHECKPOINTS:[\s\S]*only visible assistant text counts[\s\S]*AFTER INDEX . choose values[\s\S]*copy this fully filled block/iu);
  assert.match(result.message.content, /WORKFLOW PLAN\nPrimary:[\s\S]*WORKFLOW READY \| primary=<id-or-none>/iu);
  assert.doesNotMatch(result.message.content, /suggested=|reviewer count=\d|fork width=\d|required fork|block:\s*true/iu);
  assert.equal(await event(pi, 'before_agent_start')({
    prompt: '继续',
    systemPrompt: ['native OMP prompt'],
  }, ctx), undefined);
});

test('staged reminder exposes only capabilities active in the native runtime', async () => {
  const nativeEvent = { prompt: 'Audit two independent modules.', systemPrompt: ['native OMP prompt'] };

  const skillEntries = [];
  const skillPi = new FakePi(skillEntries);
  skillPi.getActiveTools = () => ['read'];
  skillPi.pi = { getActiveSkills: () => [{ name: 'writing-review', description: 'Review prose.' }] };
  registerCoreEnhancer(skillPi);
  const skillOnly = await event(skillPi, 'before_agent_start')(
    structuredClone(nativeEvent),
    extensionContext(skillEntries, process.cwd(), {
      model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
    }),
  );
  assert.match(skillOnly.message.content, /PHASE 1 . DECLARE:[\s\S]*visible OMP Skill inventory/iu);
  assert.match(skillOnly.message.content, /PHASE 2 . LOAD BATCH:[\s\S]*exact `skill:\/\/<name>` URIs/iu);
  assert.match(skillOnly.message.content, /PHASE 3 . READY \+ EXECUTE:[\s\S]*WORKFLOW READY/iu);
  assert.doesNotMatch(skillOnly.message.content, /DELEGATION AFTER READY|COMPAT_REVIEW_CONTEXT/u);
  assert.deepEqual(skillOnly.message.details.features, ['skill-discovery']);

  const taskEntries = [];
  const taskPi = new FakePi(taskEntries);
  taskPi.getActiveTools = () => ['read', 'task'];
  taskPi.pi = { getActiveSkills: () => [] };
  registerCoreEnhancer(taskPi);
  const taskOnly = await event(taskPi, 'before_agent_start')(
    structuredClone(nativeEvent),
    extensionContext(taskEntries, process.cwd(), {
      model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
    }),
  );
  assert.match(taskOnly.message.content, /PHASE 1 . PLAN:[\s\S]*PHASE 2 . COMMIT:[\s\S]*PHASE 3 . EXECUTE/iu);
  assert.match(taskOnly.message.content, /no fork or width is selected by this reminder/i);
  assert.match(taskOnly.message.content, /DELEGATION AFTER READY \(soft, no quota\)/u);
  assert.deepEqual(taskOnly.message.details.features, ['delegation-decision']);
});

test('review and multi-target facts remain compact and never choose dispatch or width', async () => {
  const reviewEntries = [];
  const reviewPi = new FakePi(reviewEntries);
  reviewPi.getActiveTools = () => ['read', 'task'];
  reviewPi.pi = { getActiveSkills: () => [] };
  registerCoreEnhancer(reviewPi);
  const review = await event(reviewPi, 'before_agent_start')({
    prompt: 'Fix the parser across multiple files, add tests, and require an independent review.',
    systemPrompt: ['native OMP prompt'],
  }, extensionContext(reviewEntries, process.cwd(), {
    model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
  }));
  assert.match(review.message.content, /COMPAT_REVIEW_CONTEXT \(soft, no quota\)/u);
  assert.match(review.message.content, /possible-review-dimensions=correctness,test-adequacy/i);
  assert.doesNotMatch(review.message.content, /suggested=|within-native-cap|native-cap=|reviewerLaneSuggestion/u);

  const shapeEntries = [];
  const shapePi = new FakePi(shapeEntries);
  shapePi.getActiveTools = () => ['read', 'task'];
  shapePi.pi = {
    getActiveSkills: () => [{ name: 'omp-enhancer-workflows', description: 'Select workflows.' }],
  };
  registerCoreEnhancer(shapePi);
  const shape = await event(shapePi, 'before_agent_start')({
    prompt: 'Independently audit src/a.js and src/b.js. Give evidence for each and compare them. Do not modify files.',
    systemPrompt: ['native OMP prompt'],
  }, extensionContext(shapeEntries, process.cwd(), {
    model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
  }));
  assert.match(shape.message.content, /COMPAT_TASK_SHAPE_FACTS/u);
  assert.match(shape.message.content, /exact-inspection-targets=2/u);
  assert.match(shape.message.content, /never a dispatch or fork-width decision/i);
  assert.doesNotMatch(shape.message.content, /action=delegate|required fork|must delegate/iu);
});

test('explicit no-delegation wording keeps Skill guidance but removes delegation advice', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  pi.getActiveTools = () => ['read', 'task'];
  pi.pi = { getActiveSkills: () => [{ name: 'code-development', description: 'Plan, test, and review code changes.' }] };
  registerCoreEnhancer(pi);
  const result = await event(pi, 'before_agent_start')({
    prompt: 'Audit src/router.js, but keep all work in the main agent and do not delegate any part.',
    systemPrompt: ['native OMP prompt'],
  }, extensionContext(entries, process.cwd(), {
    model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
  }));

  assert.match(result.message.content, /PHASE 1 . DECLARE:[\s\S]*visible OMP Skill inventory/iu);
  assert.doesNotMatch(result.message.content, /DELEGATION AFTER READY|COMPAT_REVIEW_CONTEXT/u);
  assert.deepEqual(result.message.details.features, ['skill-discovery']);
  const snapshot = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.equal(snapshot.lastTaskContext.taskDescriptor.constraints.subagents, 'forbidden');
});

test('DeepSeek and MiMo reminders are exact-model, primary-agent, and visible-capability gated', async () => {
  const nativeEvent = { prompt: 'Review abstract.tex conservatively.', systemPrompt: ['native OMP prompt'] };
  for (const model of [
    { provider: 'opencode-go', id: 'deepseek-v3.2' },
    { provider: 'opencode-go', id: 'deepseek-v4-flash-pro' },
    { provider: 'another-provider', id: 'deepseek-v4-flash' },
    { provider: 'opencode-go', id: 'mimo-v2.5-pro' },
    { provider: 'xiaomi', id: 'mimo-v2.5' },
  ]) {
    const entries = [];
    const pi = new FakePi(entries);
    pi.getActiveTools = () => ['read'];
    pi.pi = { getActiveSkills: () => [{ name: 'writing-review', description: 'Review prose.' }] };
    registerCoreEnhancer(pi);
    assert.equal(await event(pi, 'before_agent_start')(
      structuredClone(nativeEvent),
      extensionContext(entries, process.cwd(), { model }),
    ), undefined, `${model.provider}/${model.id}`);
  }

  const previousDisableCompat = process.env.OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT;
  process.env.OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT = '1';
  try {
    const entries = [];
    const pi = new FakePi(entries);
    pi.getActiveTools = () => ['read'];
    pi.pi = { getActiveSkills: () => [{ name: 'writing-review', description: 'Review prose.' }] };
    registerCoreEnhancer(pi);
    assert.equal(await event(pi, 'before_agent_start')(
      structuredClone(nativeEvent),
      extensionContext(entries, process.cwd(), {
        model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
      }),
    ), undefined);
    const mimo = await event(pi, 'before_agent_start')(
      structuredClone(nativeEvent),
      extensionContext(entries, process.cwd(), {
        model: { provider: 'opencode-go', id: 'mimo-v2.5' },
      }),
    );
    assert.match(mimo.message.content, /^MIMO_SOFT_PROTOCOL/u);
  } finally {
    if (previousDisableCompat === undefined) delete process.env.OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT;
    else process.env.OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT = previousDisableCompat;
  }

  const previousDisableMimo = process.env.OMP_ENHANCER_DISABLE_MIMO_COMPAT;
  process.env.OMP_ENHANCER_DISABLE_MIMO_COMPAT = '1';
  try {
    const entries = [];
    const pi = new FakePi(entries);
    pi.getActiveTools = () => ['read'];
    pi.pi = { getActiveSkills: () => [{ name: 'writing-review', description: 'Review prose.' }] };
    registerCoreEnhancer(pi);
    assert.equal(await event(pi, 'before_agent_start')(
      structuredClone(nativeEvent),
      extensionContext(entries, process.cwd(), {
        model: { provider: 'opencode-go', id: 'mimo-v2.5' },
      }),
    ), undefined);
    const deepseek = await event(pi, 'before_agent_start')(
      structuredClone(nativeEvent),
      extensionContext(entries, process.cwd(), {
        model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
      }),
    );
    assert.match(deepseek.message.content, /^DEEPSEEK_SOFT_PROTOCOL/u);
  } finally {
    if (previousDisableMimo === undefined) delete process.env.OMP_ENHANCER_DISABLE_MIMO_COMPAT;
    else process.env.OMP_ENHANCER_DISABLE_MIMO_COMPAT = previousDisableMimo;
  }

  const subagentEntries = [{
    type: 'session_init',
    task: 'Complete the assignment below, thoroughly:\n\nReview abstract.tex conservatively.',
    tools: ['read'],
    spawns: '',
  }];
  const subagentPi = new FakePi(subagentEntries);
  subagentPi.getActiveTools = () => ['read'];
  subagentPi.pi = { getActiveSkills: () => [{ name: 'writing-review', description: 'Review prose.' }] };
  registerCoreEnhancer(subagentPi);
  const subagentEvent = {
    prompt: 'Complete the assignment below, thoroughly:\n\nReview abstract.tex conservatively.',
    systemPrompt: ['native subagent prompt'],
  };
  assert.equal(await event(subagentPi, 'before_agent_start')(
    structuredClone(subagentEvent),
    extensionContext(subagentEntries, process.cwd(), {
      model: { provider: 'opencode-go', id: 'mimo-v2.5' },
    }),
  ), undefined);

  const hiddenEntries = [];
  const hiddenPi = new FakePi(hiddenEntries);
  hiddenPi.pi = { getActiveSkills: () => [{ name: 'hidden-skill', hide: true }] };
  registerCoreEnhancer(hiddenPi);
  assert.equal(await event(hiddenPi, 'before_agent_start')(
    structuredClone(nativeEvent),
    extensionContext(hiddenEntries, process.cwd(), {
      model: { provider: 'opencode-go', id: 'mimo-v2.5' },
    }),
  ), undefined);
});

test('automatic startup never reads a writing target', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omp-workflow-language-'));
  mkdirSync(join(root, 'tex'), { recursive: true });
  writeFileSync(join(root, 'tex', 'introduction.tex'), '\\section{Introduction}\nThis paper presents the system and its evaluation.');
  try {
    const { pi, entries } = registeredCore();
    const result = await event(pi, 'before_agent_start')({
      prompt: '请润色 tex/introduction.tex。',
    }, extensionContext(entries, root));

    assert.equal(result, undefined);
    const automatic = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data.lastTaskContext;
    assert.equal(automatic.taskDescriptor.language, 'unknown');
    assert.equal(automatic.taskDescriptor.writingLanguageSource, 'pending-source');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('real batch task assignments are observed without changing native task input', async () => {
  const { pi, ctx, entries } = registeredCore();
  const prompt = 'Plan, implement, and review a routing regression in parallel, then integrate the evidence.';
  await event(pi, 'before_agent_start')({ prompt }, ctx);

  const taskEvent = {
    toolName: 'task',
    callId: 'audit-batch',
    input: {
      context: '# Goal\nPlan, implement, and review a routing regression.\n# Constraints\nFollow each bounded assignment.\n# Contract\nReturn evidence.',
      tasks: [
        {
          name: 'RoutePlanner',
          agent: 'plan',
          task: 'WR:code.dev ST:step-plan-review TODO:Inspect-router SK:code-development\n# Target\nsrc/router.js\n# Acceptance\nFile-backed findings.',
        },
        {
          name: 'RouteImplementer',
          agent: 'task',
          task: '[workflow=code.dev step=step-tdd todo=Implement-router skills=code-development]\n# Target\nsrc/router.js and test/router.test.js\n# Acceptance\nValid RED, minimal production change, same-command GREEN, and refactor evidence.',
        },
        {
          name: 'TestReviewer',
          agent: 'reviewer',
          task: [
            'OMP_WORKFLOW: code.dev',
            'OMP_WORKFLOW_STEP: step-review',
            'OMP_TODO_ITEM: Inspect the complete regression test matrix and return exact evidence',
            'OMP_SELECTED_SKILLS:',
            '- code-development',
            '# Target',
            'test/',
          ].join('\n'),
        },
      ],
    },
  };

  const originalEvent = structuredClone(taskEvent);
  assert.equal(await event(pi, 'tool_call')(taskEvent, ctx), undefined);
  assert.deepEqual(taskEvent, originalEvent);

  const afterDispatch = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.equal(afterDispatch.tasks.length, 1);
  assert.equal(afterDispatch.tasks[0].id, 'audit-batch');
  assert.deepEqual(afterDispatch.tasks[0].roles, ['plan', 'task', 'reviewer']);

  await event(pi, 'tool_result')({
    name: 'task',
    callId: 'audit-batch',
    result: {
      details: {
        results: [
          { name: 'RoutePlanner', agent: 'plan', status: 'completed' },
          { name: 'RouteImplementer', agent: 'task', status: 'completed' },
          { name: 'TestReviewer', agent: 'reviewer', status: 'completed' },
        ],
      },
    },
  }, ctx);
  assert.equal(await event(pi, 'session_stop')({ output: 'Integrated.' }, ctx), undefined);
});

test('task results without call IDs receive distinct fallback IDs', async () => {
  const { pi, ctx, entries } = registeredCore();
  await event(pi, 'before_agent_start')({ prompt: 'Observe two independently completed task results.' }, ctx);
  const toolResult = event(pi, 'tool_result');

  await toolResult({
    name: 'task',
    result: {
      details: {
        summary: 'First orphan result.',
        results: [{ agent: 'scout', status: 'completed' }],
      },
    },
  }, ctx);
  await toolResult({
    name: 'task',
    result: {
      details: {
        summary: 'Second orphan result.',
        results: [{ agent: 'reviewer', status: 'completed' }],
      },
    },
  }, ctx);

  const snapshot = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.deepEqual(snapshot.tasks.map(({ id }) => id), ['task-result-1', 'task-result-2']);
  assert.deepEqual(snapshot.tasks.map(({ summary }) => summary), ['First orphan result.', 'Second orphan result.']);
  assert.equal(snapshot.taskSequence, 2);
});

test('flat task assignments and spawned subagents keep native task and prompt events unchanged', async () => {
  const { pi, ctx } = registeredCore();
  await event(pi, 'before_agent_start')({ prompt: 'Implement and review a focused parser fix.' }, ctx);
  const taskEvent = {
    name: 'task',
    callId: 'flat-task',
    input: {
      name: 'ParserReviewer',
      agent: 'reviewer',
      task: '[workflow=code.dev step=step-review todo=Review parser diff skills=code-development]\n# Target\nsrc/parser.js',
    },
  };
  const originalTask = structuredClone(taskEvent);
  assert.equal(await event(pi, 'tool_call')(taskEvent, ctx), undefined);
  assert.deepEqual(taskEvent, originalTask);

  const subagentEvent = {
    prompt: taskEvent.input.task,
    systemPrompt: ['native subagent prompt'],
  };
  const originalSubagentEvent = structuredClone(subagentEvent);
  const deepSeekSubagentCtx = {
    ...ctx,
    model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
  };
  assert.equal(await event(pi, 'before_agent_start')(subagentEvent, deepSeekSubagentCtx), undefined);
  assert.deepEqual(subagentEvent, originalSubagentEvent);
});

test('advisor and autolearn host turns never reset the active user workflow state', async () => {
  const { pi, ctx, entries } = registeredCore();
  pi.getActiveTools = () => ['read', 'task'];
  await event(pi, 'before_agent_start')({ prompt: 'Review src/router.js and report findings.' }, ctx);
  const before = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  const entryCount = entries.length;

  const advisorPrompt = 'Check the workflow and TODO selection.';
  const advisorCtx = extensionContext([
    ...entries,
    {
      type: 'custom_message',
      customType: 'advisor',
      content: advisorPrompt,
      display: false,
      attribution: 'user',
    },
  ], process.cwd(), {
    model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
  });
  assert.equal(await event(pi, 'before_agent_start')({ prompt: advisorPrompt }, advisorCtx), undefined);
  assert.equal(await event(pi, 'tool_call')({
    toolName: 'task',
    callId: 'advisor-task',
    input: { agent: 'reviewer', task: 'Review the active workflow.' },
  }, advisorCtx), undefined);
  assert.equal(await event(pi, 'tool_result')({
    name: 'read',
    input: { path: 'skill://writing-review' },
    result: { content: [{ type: 'text', text: '---\nname: writing-review\ndescription: Review prose.\n---\n' }] },
  }, advisorCtx), undefined);
  assert.equal(await event(pi, 'session_stop')({
    output: 'SKILL_USAGE\nLoaded:\n- writing-review',
  }, advisorCtx), undefined);

  const after = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.equal(entries.length, entryCount);
  assert.deepEqual(after, before);
});

function registeredCore() {
  const entries = [];
  const pi = new FakePi(entries);
  registerCoreEnhancer(pi);
  return { pi, entries, ctx: extensionContext(entries) };
}

function event(pi, name) {
  const found = pi.eventHandlers.find((handler) => handler.event === name);
  if (!found) throw new Error('Missing event ' + name);
  return found.handler;
}

function extensionContext(entries = [], cwd = process.cwd(), extra = {}) {
  return {
    cwd,
    sessionManager: {
      getBranch: () => entries,
      getEntries: () => entries,
    },
    ui: { notify: () => undefined },
    hasUI: false,
    ...extra,
  };
}

function nativeDelegationPrompt({ batch, cap, injectedContext = '' }) {
  const width = batch
    ? '- **Width = real independence.** Fan out exactly as wide as the work genuinely decomposes, batched into one `tasks[]` array.'
    : '- **Width = real independence.** Fan out exactly as wide as the work genuinely decomposes, as parallel calls in one message.';
  const capLine = cap == null
    ? ''
    : `\n- **Concurrency cap:** At most ${cap} subagent${cap === 1 ? '' : 's'} run at once in this session.`;
  return `<system-conventions>\nNative OMP conventions.\n</system-conventions>\n${injectedContext}\n## Delegation gates:\n${width}${capLine}\nEXECUTION WORKFLOW\n==============`;
}

function fakeZod() {
  const schema = () => ({ optional: schema });
  return {
    string: schema,
    boolean: schema,
    array: () => schema(),
    object: () => schema(),
  };
}
