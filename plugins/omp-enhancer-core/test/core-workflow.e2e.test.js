import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import registerCoreEnhancer from '../index.js';

const ARBITRARY_MODEL = { provider: 'foo', id: 'bar' };
const NO_PROVIDER_MODEL = { id: 'bar' };

const FORBIDDEN_REMINDER_MARKERS = [
  'WORKFLOW PLAN',
  'WORKFLOW READY',
  'NOW=',
  'THEN=',
  'RESOURCE EXTENSION',
  'Delegate Agent=',
  'byte 0',
  'SENTINEL',
  'DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY',
  'DECLARE HANDOFF',
];

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

  registerCommand() {}

  on(eventName, handler) {
    this.eventHandlers.push({ eventName, handler });
  }

  appendEntry(customType, data) {
    this.entries.push({ type: 'custom', customType, data });
  }
}

function fakeZod() {
  const chainable = (base) => ({
    ...base,
    optional: () => chainable({ type: 'optional', schema: base }),
    describe: () => chainable(base),
  });
  return {
    object: (shape) => chainable({ type: 'object', shape }),
    string: () => chainable({ type: 'string' }),
    boolean: () => chainable({ type: 'boolean' }),
    array: (schema) => chainable({ type: 'array', schema }),
  };
}

function extensionContext(entries, cwd = process.cwd(), extra = {}) {
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

function event(pi, eventName) {
  const registered = pi.eventHandlers.find((entry) => entry.eventName === eventName);
  if (!registered) throw new Error(`Missing event handler: ${eventName}`);
  return registered.handler;
}

function registeredCore() {
  const entries = [];
  const pi = new FakePi(entries);
  registerCoreEnhancer(pi);
  return { pi, entries, ctx: extensionContext(entries) };
}

function latestState(entries) {
  return entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
}

async function reminderFor(prompt, { tools = ['read', 'task', 'todo'], skills = ['omp-enhancer-workflows'], model = ARBITRARY_MODEL, messages, entries } = {}) {
  const stateEntries = entries ?? [];
  const pi = new FakePi(stateEntries);
  if (tools) pi.getActiveTools = () => tools;
  pi.pi = { getActiveSkills: () => skills.map((name) => ({ name, description: 'Select workflows.' })) };
  registerCoreEnhancer(pi);
  const ctx = extensionContext(stateEntries, process.cwd(), { model });
  await event(pi, 'session_start')({}, ctx);
  const result = await event(pi, 'before_agent_start')(
    { prompt, systemPrompt: ['native OMP prompt'], ...(messages ? { messages } : {}) },
    ctx,
  );
  return { result, pi, ctx, stateEntries };
}

test('primary startup records task facts without changing the native prompt or adding a message', async () => {
  const { pi, ctx, entries } = registeredCore();
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
  const previousReminder = process.env.OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER;
  process.env.OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER = '1';
  try {
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

    const snapshot = latestState(entries);
    assert.deepEqual(Object.keys(snapshot.lastTaskContext).sort(), [
      'intent',
      'projectSnapshot',
      'taskDescriptor',
    ]);
    assert.equal(snapshot.lastTaskContext.intent, 'agent-selected');
    assert.equal(snapshot.schemaVersion, 10);
  } finally {
    if (previousReminder === undefined) delete process.env.OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER;
    else process.env.OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER = previousReminder;
  }
});

test('an arbitrary top-level model receives the compact orchestration advisory without replacing the native prompt', async () => {
  const { result, pi, ctx } = await reminderFor('Fix the parser across multiple files, add tests, and review the result.');
  assert.ok(result, 'a code project task must produce a reminder');
  assert.equal(result.message.customType, 'omp-enhancer-skill-discovery');
  assert.equal(result.message.display, false);
  assert.equal(result.message.attribution, 'user');
  assert.equal(Object.hasOwn(result.message.details, 'model'), false);
  assert.equal(result.message.details.compatibility, 'skill-discovery');

  assert.match(result.message.content, /^OMP_ORCHESTRATION \(soft advisory; selects no workflow, Agent, or gate\):/u);
  assert.match(result.message.content, /Main is the orchestrator\. Phases: ANALYZE -> EXECUTE -> REVIEW\./u);
  assert.match(result.message.content, /ANALYZE: Main analyzes directly for focused work; delegates to analyzer for complex multi-slice work\./u);
  assert.match(result.message.content, /EXECUTE: Main executes directly for simple changes; delegates to task\/domain agents for substantial work\./u);
  assert.match(result.message.content, /REVIEW: Main reviews simple changes directly; delegates to reviewer for complex or risky changes\./u);
  assert.match(result.message.content, /For non-trivial PROJECT work, read `skill:\/\/omp-enhancer-workflows` for the domain reference catalog\./u);
  assert.match(result.message.content, /A verbatim field\/heading lookup needs no workflow or TODO\./u);
  assert.match(result.message.content, /OMP owns tools, permissions, delegation, and completion\./u);
  assert.match(result.message.content, /WORKFLOW_CANDIDATES/u);
  assert.match(result.message.content, /CANDIDATES: code/u);
  assert.match(result.message.content, /Task descriptor resolved language=en; select matching writing skills directly\./u);

  for (const marker of FORBIDDEN_REMINDER_MARKERS) {
    assert.doesNotMatch(result.message.content, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu'), `reminder must not contain ${marker}`);
  }

  assert.deepEqual(result.message.details.features, [
    'orchestration-advisory',
    'workflow-candidates',
    'language-hint',
  ]);
  assert.ok(result.message.content.length < 2500, `reminder length=${result.message.content.length}`);

  assert.equal(
    await event(pi, 'before_agent_start')({ prompt: '继续', systemPrompt: ['native OMP prompt'] }, ctx),
    undefined,
    'the reminder is one-shot for the active task',
  );
});

test('a model with no provider field also receives the orchestration reminder', async () => {
  const { result } = await reminderFor('Audit two modules and compare their evidence.', { model: NO_PROVIDER_MODEL });
  assert.ok(result);
  assert.match(result.message.content, /^OMP_ORCHESTRATION/u);
  assert.equal(Object.hasOwn(result.message.details, 'model'), false);
});

test('the reminder acknowledges an already supplied native workflow index without asking for a duplicate read', async () => {
  const entries = [{
    type: 'custom',
    customType: 'skill-prompt',
    content: '---\nname: omp-enhancer-workflows\n---\n# OMP Enhancer workflows',
    details: { name: 'omp-enhancer-workflows' },
    attribution: 'user',
  }];
  const { result } = await reminderFor('Review the report and propose a revision.', { entries });

  assert.match(result.message.content, /The workflow index was supplied natively\. Do not reread it\./u);
  assert.doesNotMatch(result.message.content, /For non-trivial PROJECT work, read `skill:\/\/omp-enhancer-workflows`/u);
});

test('the reminder fires once for any top-level model without model-specific behavior', async () => {
  for (const model of [
    { provider: 'opencode-go', id: 'deepseek-v3.2' },
    { provider: 'opencode-go', id: 'deepseek-v4-flash-pro' },
    { provider: 'another-provider', id: 'deepseek-v4-flash' },
    { provider: 'opencode-go', id: 'mimo-v2.5-pro' },
    { provider: 'foo', id: 'bar' },
    { id: 'bar' },
  ]) {
    const { result } = await reminderFor('Audit two modules and compare their evidence.', { model });
    assert.ok(result, `${model.provider ?? '<none>'}/${model.id} should receive a reminder`);
    assert.match(result.message.content, /^OMP_ORCHESTRATION/u, `${model.provider ?? '<none>'}/${model.id}`);
    assert.equal(Object.hasOwn(result.message.details, 'model'), false);
  }
});

test('OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER suppresses only the reminder', async () => {
  const previous = process.env.OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER;
  process.env.OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER = '1';
  try {
    const { result } = await reminderFor('Review the report and propose a revision.');
    assert.equal(result, undefined, 'OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER suppresses the reminder');
  } finally {
    if (previous === undefined) delete process.env.OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER;
    else process.env.OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER = previous;
  }
});

test('subagent sessions never receive the reminder', async () => {
  const entries = [{
    type: 'session_init',
    task: 'Complete the assignment below, thoroughly:\n\nReview abstract.tex conservatively.',
    tools: ['read'],
    spawns: '',
  }];
  const { result } = await reminderFor('Complete the assignment below, thoroughly:\n\nReview abstract.tex conservatively.', { entries });
  assert.equal(result, undefined);
});

test('no visible skills and no native task produce no reminder', async () => {
  const { result } = await reminderFor('Look up the version in package.json.', {
    tools: null,
    skills: [{ name: 'hidden-skill', hide: true }],
  });
  assert.equal(result, undefined);
});

test('plan mode prepends the plan-mode advisory and marks the feature', async () => {
  const { result } = await reminderFor('Implement the user auth module.', {
    messages: [{ role: 'custom', content: 'Plan mode is active. xd://propose' }],
  });
  assert.ok(result, 'plan mode turn must produce a reminder');
  assert.match(result.message.content, /^OMP_PLAN_MODE \(soft advisory\):/u);
  assert.match(result.message.content, /Plan mode is active\. The working tree is read-only\./u);
  assert.match(result.message.content, /Use ANALYZE -> EXECUTE -> REVIEW: analyze the task, write the plan, review it before proposing\./u);
  assert.match(result.message.content, /OMP_ORCHESTRATION/u);
  assert.equal(result.message.details.features[0], 'plan-mode');
  assert.ok(result.message.details.features.includes('orchestration-advisory'));
});

test('multi-target inspection adds task-shape facts without choosing dispatch width', async () => {
  const { result } = await reminderFor(
    'Independently audit src/a.js and src/b.js. Give evidence for each and compare them. Do not modify files.',
  );
  assert.ok(result);
  assert.match(result.message.content, /^TASK_SHAPE_FACTS/mu);
  assert.match(result.message.content, /exact-inspection-targets=2/u);
  assert.match(result.message.content, /never a dispatch or fork-width decision/i);
  assert.doesNotMatch(result.message.content, /action=delegate|required fork|must delegate/iu);
  assert.ok(result.message.details.features.includes('task-shape-facts'));
});

test('explicit no-delegation wording keeps the advisory but drops workflow candidates', async () => {
  const { result, stateEntries } = await reminderFor(
    'Audit src/router.js, but keep all work in the main agent and do not delegate any part.',
  );
  assert.ok(result);
  assert.match(result.message.content, /^OMP_ORCHESTRATION/u);
  assert.doesNotMatch(result.message.content, /WORKFLOW_CANDIDATES|TASK_SHAPE_FACTS/u);
  assert.deepEqual(result.message.details.features, ['orchestration-advisory', 'language-hint']);
  const snapshot = latestState(stateEntries);
  assert.equal(snapshot.lastTaskContext.taskDescriptor.constraints.subagents, 'forbidden');
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
          agent: 'analyzer',
          task: '# Target\nsrc/router.js\n# Acceptance\nFile-backed findings.',
        },
        {
          name: 'RouteImplementer',
          agent: 'task',
          task: '# Target\nsrc/router.js and test/router.test.js\n# Acceptance\nValid RED, minimal production change, same-command GREEN, and refactor evidence.',
        },
        {
          name: 'TestReviewer',
          agent: 'reviewer',
          task: '# Target\ntest/\n# Acceptance\nInspect the complete regression test matrix and return exact evidence.',
        },
      ],
    },
  };

  const originalEvent = structuredClone(taskEvent);
  assert.equal(await event(pi, 'tool_call')(taskEvent, ctx), undefined);
  assert.deepEqual(taskEvent, originalEvent);

  const afterDispatch = latestState(entries);
  assert.equal(afterDispatch.tasks.length, 1);
  assert.equal(afterDispatch.tasks[0].id, 'audit-batch');
  assert.deepEqual(afterDispatch.tasks[0].roles, ['analyzer', 'task', 'reviewer']);

  await event(pi, 'tool_result')({
    name: 'task',
    callId: 'audit-batch',
    result: {
      details: {
        results: [
          { name: 'RoutePlanner', agent: 'analyzer', status: 'completed' },
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

  const snapshot = latestState(entries);
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
      task: '# Target\nsrc/parser.js\n# Acceptance\nReview the parser diff with evidence.',
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
  const arbitrarySubagentCtx = {
    ...ctx,
    model: ARBITRARY_MODEL,
  };
  assert.equal(await event(pi, 'before_agent_start')(subagentEvent, arbitrarySubagentCtx), undefined);
  assert.deepEqual(subagentEvent, originalSubagentEvent);
});

test('advisor and autolearn host turns never reset the active user workflow state', async () => {
  const { pi, ctx, entries } = registeredCore();
  pi.getActiveTools = () => ['read', 'task'];
  await event(pi, 'before_agent_start')({ prompt: 'Review src/router.js and report findings.' }, ctx);
  const before = latestState(entries);
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
    model: ARBITRARY_MODEL,
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

  const after = latestState(entries);
  assert.equal(entries.length, entryCount);
  assert.deepEqual(after, before);
});

test('state schema bump drops stale reminder-era state on restore', async () => {
  const { pi, entries, ctx } = registeredCore();
  pi.getActiveTools = () => ['read', 'task', 'todo'];
  pi.pi = { getActiveSkills: () => [{ name: 'omp-enhancer-workflows', description: 'Select workflows.' }] };
  await event(pi, 'before_agent_start')({ prompt: 'First project task.' }, ctx);
  const staleSnapshot = latestState(entries);
  assert.equal(staleSnapshot.schemaVersion, 10);
  // Simulate a pre-v10 persisted state (the schema version just bumped).
  const preV10 = {
    ...structuredClone(staleSnapshot),
    schemaVersion: 9,
  };
  const restoredEntries = [{ type: 'custom', customType: 'omp-enhancer-core.state', data: preV10 }];
  const restoredPi = new FakePi(restoredEntries);
  restoredPi.getActiveTools = () => ['read', 'task', 'todo'];
  restoredPi.pi = { getActiveSkills: () => [{ name: 'omp-enhancer-workflows', description: 'Select workflows.' }] };
  registerCoreEnhancer(restoredPi);
  const restoredCtx = extensionContext(restoredEntries, process.cwd(), { model: ARBITRARY_MODEL });
  await event(restoredPi, 'session_start')({}, restoredCtx);
  const after = latestState(restoredEntries);
  assert.equal(after.schemaVersion, 10);
  assert.equal(after.workflowReminderTaskStartedAt, 0);
  // A fresh reminder fires for the new task (stale one-shot state was dropped).
  const reminder = await event(restoredPi, 'before_agent_start')({ prompt: 'A new project task.' }, restoredCtx);
  assert.notEqual(reminder, undefined);
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
    const automatic = latestState(entries).lastTaskContext;
    assert.equal(automatic.taskDescriptor.language, 'unknown');
    assert.equal(automatic.taskDescriptor.writingLanguageSource, 'pending-source');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
