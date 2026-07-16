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
      { name: 'writing-review', description: 'Review academic prose.', filePath: '/skills/writing-review/SKILL.md' },
      { name: 'systematic-debugging', description: 'Trace concrete failures.', filePath: '/skills/systematic-debugging/SKILL.md' },
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
  assert.equal(snapshot.lastRoute.intent, 'agent-selected');
  assert.equal(snapshot.lastRoute.routePlan.mode, 'agent-selected');
  assert.deepEqual(snapshot.lastRoute.routePlan.skills, []);
  assert.deepEqual(snapshot.providedSkills, []);
});

test('DeepSeek Flash receives one hidden supplemental Skill and delegation reminder without replacing the native prompt', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  pi.getActiveTools = () => ['read', 'task'];
  pi.pi = {
    getActiveSkills: () => [
      { name: 'writing-review', description: 'Review academic prose.', filePath: '/skills/writing-review/SKILL.md' },
    ],
  };
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries, process.cwd(), {
    model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
  });
  const startEvent = {
    prompt: 'Review abstract.tex conservatively.',
    systemPrompt: [
      nativeDelegationPrompt({ batch: true, cap: 4 }),
      'native Skill inventory',
    ],
  };
  const originalEvent = structuredClone(startEvent);

  const result = await event(pi, 'before_agent_start')(startEvent, ctx);

  assert.deepEqual(startEvent, originalEvent);
  assert.equal(Object.hasOwn(result, 'systemPrompt'), false);
  assert.equal(result.message.customType, 'omp-enhancer-skill-discovery');
  assert.equal(result.message.display, false);
  assert.equal(result.message.attribution, 'user');
  assert.match(result.message.content, /inspect the available OMP Skill list/i);
  assert.match(result.message.content, /load the smallest set of genuinely applicable Skills/i);
  assert.match(result.message.content, /never call bare `skill:\/\/`/i);
  assert.match(result.message.content, /if none match, proceed without a Skill/i);
  assert.match(result.message.content, /DEEPSEEK_DELEGATION_HINT/u);
  assert.match(result.message.content, /OMP's native system prompt, user instruction, Delegation gates.*remain authoritative/is);
  assert.match(result.message.content, /This hint adds no policy of its own/i);
  assert.match(result.message.content, /USER_SCOPE.*user requests solo or main-agent-only work, no agents, or no delegation/is);
  assert.match(result.message.content, /NATIVE_GATE_ACTION.*execute OMP's native Delegation gate now, before any project-file inspection/is);
  assert.match(result.message.content, /DIRECT.*Do not relabel multiple substantive slices as one target merely because each slice is small or the parent will synthesize them/is);
  assert.match(result.message.content, /DELEGATE.*two or more self-contained SUBSTANTIVE slices.*each slice needs its own analysis or evidence/is);
  assert.match(result.message.content, /INDEPENDENCE_TEST.*each can produce its assigned result without the other slice's output/is);
  assert.match(result.message.content, /later parent comparison or summary does not make their evidence collection dependent.*does not cancel OMP's immediate-dispatch exception/is);
  assert.match(result.message.content, /DELEGATION_PREFERENCE.*both direct execution and delegation remain valid in native preferred mode.*existing SHOULD-level preference/is);
  assert.match(result.message.content, /two or more genuinely substantive, runnable, mutually independent slices requiring non-mechanical analysis or evidentiary judgment/i);
  assert.match(result.message.content, /tie-breaker, not a new gate or MUST.*never changes the exposed task schema.*native width, concurrency cap or overflow.*verification, or completion/is);
  assert.match(result.message.content, /ALREADY_SCOPED_ACTION.*user instruction itself names two or more runnable substantive slices.*native immediate-dispatch exception applies/is);
  assert.match(result.message.content, /next project action is native `task`, before any project `read`, `grep`, or `glob` of those slices/i);
  assert.match(result.message.content, /Evidence collection inside a runnable slice is slice work, not an invented parent scoping phase/i);
  assert.match(result.message.content, /Use native `task` to map unknown code instead of reading target after target/i);
  assert.match(result.message.content, /TASK_SHAPE.*follow the `task` wire shape exposed in this turn exactly/is);
  assert.match(result.message.content, /Give each genuinely independent slice its own assignment up to OMP's current concurrency cap/i);
  assert.match(result.message.content, /Batch only when the exposed shape has `tasks\[\]`; otherwise use the exposed flat form/i);
  assert.match(result.message.content, /Defer all width and grouping decisions to OMP's native independence and concurrency rules/i);
  assert.match(result.message.content, /select only current Available Agent IDs/i);
  assert.match(result.message.content, /PENDING_ACTION.*Do not duplicate a child's assigned work inline merely because it is slow/is);
  assert.match(result.message.content, /perform every verification the user and OMP require/i);
  assert.match(result.message.content, /inline prerequisite is needed only when its output is genuinely required to make assignments runnable/i);
  assert.match(result.message.content, /shared manifest or catalog that an assignment can read as evidence is slice work/i);
  assert.match(result.message.content, /does not replace a system prompt.*impose a batch size independently of OMP's native width, schema, or cap.*limit verification.*decide completion/is);
  assert.match(result.message.content, /CURRENT_NATIVE_BATCH_ACTION.*canonical OMP Delegation section confirms batch `tasks\[\]` and native concurrency cap 4/is);
  assert.match(result.message.content, /from 2 through 4 independent runnable SUBSTANTIVE slices.*EXACTLY ONE `task` call whose single `tasks\[\]` contains one assignment per slice/is);
  assert.match(result.message.content, /verify `tasks\[\]\.length` equals the number of selected slices.*every selected slice appears exactly once/is);
  assert.match(result.message.content, /if the array is incomplete, finish it before sending instead of repairing it with a later `task` call/i);
  assert.match(result.message.content, /Never split that initial fan-out across multiple one-item batch calls/i);
  assert.match(result.message.content, /For exactly two such slices this means one call with exactly two assignments/i);
  assert.match(result.message.content, /current native width, shape, and cap, not a plugin-defined fan-out; above 4, defer to OMP's native overflow decision/i);
  assert.doesNotMatch(result.message.content, /exactly two bounded assignments|at most four total parent project inspections|current trusted context/i);
  assert.ok(
    result.message.content.indexOf('Before acting, inspect the available OMP Skill list')
      < result.message.content.indexOf('DEEPSEEK_DELEGATION_HINT'),
    'Skill discovery should precede the delegation hint, matching the native Skills-to-Delegation order',
  );
  assert.deepEqual(result.message.details.features, ['skill-discovery', 'delegation-decision']);

  const continued = await event(pi, 'before_agent_start')({
    prompt: '继续',
    systemPrompt: ['native OMP prompt', 'native Skill inventory'],
  }, ctx);
  assert.equal(continued, undefined, 'the reminder should appear at most once per active main task');
});

test('DeepSeek compatibility reminder exposes only capabilities active in the native runtime', async () => {
  const nativeEvent = {
    prompt: 'Audit two independent modules and report evidence.',
    systemPrompt: ['native OMP prompt'],
  };

  const skillEntries = [];
  const skillOnlyPi = new FakePi(skillEntries);
  skillOnlyPi.getActiveTools = () => ['read'];
  skillOnlyPi.pi = {
    getActiveSkills: () => [{ name: 'writing-review', description: 'Review prose.' }],
  };
  registerCoreEnhancer(skillOnlyPi);
  const skillOnly = await event(skillOnlyPi, 'before_agent_start')(
    structuredClone(nativeEvent),
    extensionContext(skillEntries, process.cwd(), {
      model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
    }),
  );
  assert.match(skillOnly.message.content, /inspect the available OMP Skill list/i);
  assert.doesNotMatch(skillOnly.message.content, /DEEPSEEK_DELEGATION_HINT/u);
  assert.deepEqual(skillOnly.message.details.features, ['skill-discovery']);

  const taskEntries = [];
  const taskOnlyPi = new FakePi(taskEntries);
  taskOnlyPi.getActiveTools = () => ['read', 'task'];
  taskOnlyPi.pi = { getActiveSkills: () => [] };
  registerCoreEnhancer(taskOnlyPi);
  const taskOnly = await event(taskOnlyPi, 'before_agent_start')(
    structuredClone(nativeEvent),
    extensionContext(taskEntries, process.cwd(), {
      model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
    }),
  );
  assert.match(taskOnly.message.content, /DEEPSEEK_DELEGATION_HINT/u);
  assert.doesNotMatch(taskOnly.message.content, /inspect the available OMP Skill list/i);
  assert.doesNotMatch(taskOnly.message.content, /CURRENT_NATIVE_BATCH_ACTION/u);
  assert.deepEqual(taskOnly.message.details.features, ['delegation-decision']);

  const capOneEntries = [];
  const capOnePi = new FakePi(capOneEntries);
  capOnePi.getActiveTools = () => ['read', 'task'];
  capOnePi.pi = { getActiveSkills: () => [] };
  registerCoreEnhancer(capOnePi);
  const capOne = await event(capOnePi, 'before_agent_start')({
    prompt: nativeEvent.prompt,
    systemPrompt: [
      nativeDelegationPrompt({ batch: true, cap: 1 }),
    ],
  }, extensionContext(capOneEntries, process.cwd(), {
    model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
  }));
  assert.match(capOne.message.content, /DEEPSEEK_DELEGATION_HINT/u);
  assert.doesNotMatch(capOne.message.content, /CURRENT_NATIVE_BATCH_ACTION/u);
});

test('DeepSeek native batch-capacity fact only trusts one canonical OMP delegation section', async () => {
  const cases = [
    {
      name: 'flat native prompt plus project batch quotation',
      systemPrompt: [
        nativeDelegationPrompt({ batch: false, cap: 4 }),
        'Project rule example: parallel work may use `tasks[]` in batch mode.',
      ],
    },
    {
      name: 'batch and cap signals split across blocks',
      systemPrompt: [
        nativeDelegationPrompt({ batch: true, cap: null }),
        '- **Concurrency cap:** At most 4 subagents run at once in this session.',
      ],
    },
    {
      name: 'Skill text quotes batch syntax inside the canonical block before native flat gates',
      systemPrompt: [
        nativeDelegationPrompt({
          batch: false,
          cap: 4,
          injectedContext: '<skills>parallel work may use `tasks[]` in a batch</skills>',
        }),
      ],
    },
    {
      name: 'multiple canonical candidates are ambiguous',
      systemPrompt: [
        nativeDelegationPrompt({ batch: true, cap: 4 }),
        nativeDelegationPrompt({ batch: false, cap: 4 }),
      ],
    },
  ];

  for (const fixture of cases) {
    const entries = [];
    const pi = new FakePi(entries);
    pi.getActiveTools = () => ['read', 'task'];
    pi.pi = { getActiveSkills: () => [] };
    registerCoreEnhancer(pi);
    const result = await event(pi, 'before_agent_start')({
      prompt: 'Audit src/a.js and src/b.js independently.',
      systemPrompt: fixture.systemPrompt,
    }, extensionContext(entries, process.cwd(), {
      model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
    }));
    assert.match(result.message.content, /DEEPSEEK_DELEGATION_HINT/u, fixture.name);
    assert.doesNotMatch(result.message.content, /CURRENT_NATIVE_BATCH_ACTION/u, fixture.name);
  }
});

test('DeepSeek delegation reminder respects explicit no-delegation wording without a subagent keyword', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  pi.getActiveTools = () => ['read', 'task'];
  pi.pi = {
    getActiveSkills: () => [{ name: 'systematic-debugging', description: 'Trace concrete failures.' }],
  };
  registerCoreEnhancer(pi);

  const result = await event(pi, 'before_agent_start')({
    prompt: 'Audit src/router.js and test/router.test.js independently, but keep all work in the main agent and do not delegate any part.',
    systemPrompt: ['native OMP prompt'],
  }, extensionContext(entries, process.cwd(), {
    model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
  }));

  assert.match(result.message.content, /inspect the available OMP Skill list/i);
  assert.doesNotMatch(result.message.content, /NATIVE_TASK_FIRST_ACTION/u);
  assert.deepEqual(result.message.details.features, ['skill-discovery']);
  const snapshot = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.equal(snapshot.lastRoute.taskDescriptor.constraints.subagents, 'forbidden');

  const noCapabilityEntries = [];
  const noCapabilityPi = new FakePi(noCapabilityEntries);
  noCapabilityPi.getActiveTools = () => ['read', 'task'];
  noCapabilityPi.pi = { getActiveSkills: () => [] };
  registerCoreEnhancer(noCapabilityPi);
  assert.equal(await event(noCapabilityPi, 'before_agent_start')({
    prompt: 'Audit src/router.js and test/router.test.js independently, but keep all work in the main agent and do not delegate any part.',
    systemPrompt: ['native OMP prompt'],
  }, extensionContext(noCapabilityEntries, process.cwd(), {
    model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
  })), undefined);
});

test('DeepSeek delegation reminder yields to broad natural solo-agent wording', async () => {
  for (const prompt of [
    'Inspect both files, but handle everything yourself.',
    'Work alone on this repository audit.',
    'Inspect both files. Do not use agents.',
    '检查这两个文件，请你自己完成。',
    '检查这两个文件，不要交给其他代理。',
  ]) {
    const entries = [];
    const pi = new FakePi(entries);
    pi.getActiveTools = () => ['read', 'task'];
    pi.pi = { getActiveSkills: () => [] };
    registerCoreEnhancer(pi);

    const result = await event(pi, 'before_agent_start')({
      prompt,
      systemPrompt: ['native OMP prompt'],
    }, extensionContext(entries, process.cwd(), {
      model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
    }));

    assert.equal(result, undefined, prompt);
    const snapshot = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
    assert.equal(snapshot.lastRoute.taskDescriptor.constraints.subagents, 'forbidden', prompt);
  }
});

test('Skill discovery reminder remains once-per-task after a persisted session resume', async () => {
  const entries = [];
  const firstPi = new FakePi(entries);
  firstPi.pi = {
    getActiveSkills: () => [{ name: 'writing-review', description: 'Review academic prose.' }],
  };
  registerCoreEnhancer(firstPi);
  const firstCtx = extensionContext(entries, process.cwd(), {
    model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
  });
  const initial = await event(firstPi, 'before_agent_start')({
    prompt: 'Review abstract.tex conservatively.',
    systemPrompt: ['native OMP prompt'],
  }, firstCtx);
  assert.equal(initial.message.customType, 'omp-enhancer-skill-discovery');

  const resumedPi = new FakePi(entries);
  resumedPi.pi = firstPi.pi;
  registerCoreEnhancer(resumedPi);
  const resumedCtx = extensionContext(entries, process.cwd(), {
    model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
  });
  await event(resumedPi, 'session_start')({}, resumedCtx);
  assert.equal(await event(resumedPi, 'before_agent_start')({
    prompt: '继续',
    systemPrompt: ['native OMP prompt'],
  }, resumedCtx), undefined);

  const nextTask = await event(resumedPi, 'before_agent_start')({
    prompt: 'Audit docker-compose.yml for production risks.',
    systemPrompt: ['native OMP prompt'],
  }, resumedCtx);
  assert.equal(nextTask.message.customType, 'omp-enhancer-skill-discovery');
});

test('Skill discovery reminder remains exact-model, visible-inventory, and primary-agent gated', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  pi.getActiveTools = () => ['read', 'task'];
  pi.pi = {
    getActiveSkills: () => [
      { name: 'writing-review', description: 'Review academic prose.' },
    ],
  };
  registerCoreEnhancer(pi);
  const nativeEvent = {
    prompt: 'Review abstract.tex conservatively.',
    systemPrompt: ['native OMP prompt'],
  };

  const otherModelEvent = structuredClone(nativeEvent);
  assert.equal(await event(pi, 'before_agent_start')(otherModelEvent, extensionContext(entries, process.cwd(), {
    model: { provider: 'opencode-go', id: 'deepseek-v3.2' },
  })), undefined);
  assert.deepEqual(otherModelEvent, nativeEvent);
  assert.equal(await event(pi, 'before_agent_start')(structuredClone(nativeEvent), extensionContext(entries, process.cwd(), {
    model: { provider: 'opencode-go', id: 'deepseek-v4-flash-pro' },
  })), undefined);
  assert.equal(await event(pi, 'before_agent_start')(structuredClone(nativeEvent), extensionContext(entries, process.cwd(), {
    model: { provider: 'another-provider', id: 'deepseek-v4-flash' },
  })), undefined);

  const previousDisableCompat = process.env.OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT;
  process.env.OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT = '1';
  try {
    const disabledEntries = [];
    const disabledPi = new FakePi(disabledEntries);
    disabledPi.getActiveTools = () => ['read', 'task'];
    disabledPi.pi = pi.pi;
    registerCoreEnhancer(disabledPi);
    assert.equal(await event(disabledPi, 'before_agent_start')(
      structuredClone(nativeEvent),
      extensionContext(disabledEntries, process.cwd(), {
        model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
      }),
    ), undefined);
  } finally {
    if (previousDisableCompat === undefined) delete process.env.OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT;
    else process.env.OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT = previousDisableCompat;
  }

  const subagentEvent = {
    prompt: 'Complete the assignment below, thoroughly:\n\nReview abstract.tex conservatively.',
    systemPrompt: ['native subagent prompt'],
  };
  const originalSubagentEvent = structuredClone(subagentEvent);
  assert.equal(await event(pi, 'before_agent_start')(subagentEvent, extensionContext([{
    type: 'session_init',
    task: subagentEvent.prompt,
    tools: ['read'],
    spawns: '',
  }], process.cwd(), {
    model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
  })), undefined);
  assert.deepEqual(subagentEvent, originalSubagentEvent);

  const hiddenOnlyEntries = [];
  const hiddenOnlyPi = new FakePi(hiddenOnlyEntries);
  hiddenOnlyPi.pi = {
    getActiveSkills: () => [
      { name: 'hidden-skill', description: 'Not model-visible.', hide: true },
    ],
  };
  registerCoreEnhancer(hiddenOnlyPi);
  assert.equal(await event(hiddenOnlyPi, 'before_agent_start')(structuredClone(nativeEvent), extensionContext(
    hiddenOnlyEntries,
    process.cwd(),
    { model: { provider: 'opencode-go', id: 'deepseek-v4-flash' } },
  )), undefined);
});

test('automatic startup never reads a writing target while the explicit route probe may inspect it', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omp-workflow-language-'));
  mkdirSync(join(root, 'tex'), { recursive: true });
  writeFileSync(join(root, 'tex', 'introduction.tex'), '\\section{Introduction}\nThis paper presents the system and its evaluation.');
  try {
    const { pi, entries } = registeredCore();
    const result = await event(pi, 'before_agent_start')({
      prompt: '请润色 tex/introduction.tex。',
    }, extensionContext(entries, root));

    assert.equal(result, undefined);
    const automatic = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data.lastRoute;
    assert.equal(automatic.taskDescriptor.language, 'unknown');
    assert.equal(automatic.taskDescriptor.writingLanguageSource, 'pending-source');
    assert.equal(automatic.writingSourceObservation, undefined);

    const explicit = await pi.tools.get('omp_core_route_task').execute(
      'explicit-writing-probe',
      { prompt: '请润色 tex/introduction.tex。' },
      undefined,
      undefined,
      extensionContext(entries, root),
    );
    assert.equal(explicit.details.route.taskDescriptor.language, 'en');
    assert.deepEqual(explicit.details.route.writingSourceObservation.paths, ['tex/introduction.tex']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('real batch task assignments are observed without changing native task input', async () => {
  const { pi, ctx, entries } = registeredCore();
  const prompt = 'Audit routing and testing in parallel, then integrate the findings.';
  await event(pi, 'before_agent_start')({ prompt }, ctx);

  const taskEvent = {
    toolName: 'task',
    callId: 'audit-batch',
    input: {
      context: '# Goal\nAudit routing and testing.\n# Constraints\nRead only.\n# Contract\nReturn evidence.',
      tasks: [
        {
          name: 'RouteScout',
          agent: 'scout',
          task: 'WR:code.review ST:step-1 TODO:Inspect-router SK:systematic-debugging\n# Target\nsrc/router.js\n# Acceptance\nFile-backed findings.',
        },
        {
          name: 'TestReviewer',
          agent: 'reviewer',
          task: [
            'OMP_WORKFLOW: code.review,code.test',
            'OMP_WORKFLOW_STEP: step-coverage-review',
            'OMP_TODO_ITEM: Inspect the complete regression test matrix and return exact evidence',
            'OMP_SELECTED_SKILLS:',
            '- verification-before-completion',
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
  assert.deepEqual(afterDispatch.tasks[0].roles, ['scout', 'reviewer']);

  await event(pi, 'tool_result')({
    name: 'task',
    callId: 'audit-batch',
    result: {
      details: {
        results: [
          { name: 'RouteScout', agent: 'scout', status: 'completed' },
          { name: 'TestReviewer', agent: 'reviewer', status: 'completed' },
        ],
      },
    },
  }, ctx);
  assert.equal(await event(pi, 'session_stop')({ output: 'Integrated.' }, ctx), undefined);
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
      task: '[workflow=code.review step=step-2 todo=Review parser diff skills=verification-before-completion]\n# Target\nsrc/parser.js',
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

test('classifier output remains a diagnostic probe and cannot replace the active agent-selected context', async () => {
  const { pi, ctx, entries } = registeredCore();
  await event(pi, 'before_agent_start')({ prompt: 'Polish the English Introduction in paper.tex.' }, ctx);
  const before = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data.lastRoute;

  const result = await pi.tools.get('omp_core_resolve_classification').execute(
    'classifier-probe',
    {
      prompt: 'ignored while an active task exists',
      output: '{"intent":"writing.en","secondaryIntents":[],"language":"en","confidence":0.9,"riskFlags":[],"domainHints":["paper"],"reason":"English prose"}',
    },
    undefined,
    undefined,
    ctx,
  );

  const after = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.equal(result.details.activated, false);
  assert.equal(result.details.probe_only, true);
  assert.equal(after.lastRoute.intent, 'agent-selected');
  assert.equal(after.lastRoute.routePlan.version, 3);
  assert.deepEqual(after.lastRoute.routePlan.skills, []);
  assert.deepEqual(after.lastRoute, before);
  assert.equal(after.lastRouteProbe.changedActiveRoute, false);
});

test('advisor and autolearn host turns never reset the active user workflow state', async () => {
  const { pi, ctx, entries } = registeredCore();
  pi.getActiveTools = () => ['read', 'task'];
  await event(pi, 'before_agent_start')({ prompt: 'Review src/router.js and report findings.' }, ctx);
  const before = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;

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
  const after = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.equal(after.lastPrompt, before.lastPrompt);
  assert.equal(after.routeStartedAt, before.routeStartedAt);
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
