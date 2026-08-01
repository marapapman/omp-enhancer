import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import registerCoreEnhancer from '../index.js';

const ARBITRARY_MODEL = { provider: 'foo', id: 'bar' };
const NO_PROVIDER_MODEL = { id: 'bar' };

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

  const snapshot = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.deepEqual(Object.keys(snapshot.lastTaskContext).sort(), [
    'intent',
    'projectSnapshot',
    'taskDescriptor',
  ]);
  assert.equal(snapshot.lastTaskContext.intent, 'agent-selected');
  } finally {
    if (previousReminder === undefined) delete process.env.OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER;
    else process.env.OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER = previousReminder;
  }
});

test('an arbitrary top-level model receives the compact seven-stage soft reminder without replacing the native prompt', async () => {
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
    model: ARBITRARY_MODEL,
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
  assert.equal(Object.hasOwn(result.message.details, 'model'), false);
  assert.match(result.message.content, /^OMP_WORKFLOW_ENTRY/u);
  assert.match(result.message.content, /^OMP_WORKFLOW_ENTRY[^\n]*\nFIRST RESPONSE:[^\n]*\n- DIRECT ONLY[^\n]*\n- OTHERWISE \(PROJECT\): INDEX STATUS=NOT SUPPLIED/iu);
  assert.match(result.message.content, /DIRECT ONLY[\s\S]*verbatim, no-judgment field\/heading lookup[\s\S]*Review, correction, comparison, verification, design, transformation, planning[\s\S]*are PROJECT/iu);
  assert.match(result.message.content, /PROJECT at any size/iu);
  assert.match(result.message.content, /call only `read` with `path=skill:\/\/omp-enhancer-workflows`[\s\S]*end the response and wait[\s\S]*Do not read a project path/iu);
  assert.match(result.message.content, /Available Skills metadata and this reminder are not the body/iu);
  assert.match(result.message.content, /AFTER THE INDEX RETURNS:[\s\S]*DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY/iu);
  assert.match(result.message.content, /byte-0 `WORKFLOW PLAN`[\s\S]*structured NOW\/THEN[\s\S]*at least four detailed Actions/iu);
  assert.match(result.message.content, /resource-only load batches[\s\S]*byte-0 `WORKFLOW READY` \+ rebased detailed TODO only[\s\S]*project tools/iu);
  assert.match(result.message.content, /Main is the orchestrator[\s\S]*loaded non-simple card[\s\S]*evidence gathering, planning, implementation, and audit[\s\S]*parent VERIFY/iu);
  assert.doesNotMatch(result.message.content, /character 1/iu);
  assert.doesNotMatch(result.message.content, /TASK COPY:|Delegate Writer:|generic Draft\/Check|checkpoint=<verbatim-task-content>/iu);
  assert.match(result.message.content, /Main selects[\s\S]*OMP owns tools, permissions, delegation, and completion/iu);
  assert.match(result.message.content, /^REVIEW_CONTEXT \(soft, no quota\)/mu);
  assert.match(result.message.content, /soft one-shot for top-level Main[\s\S]*selects no workflow, Skill, Agent, or fork width/iu);
  assert.match(result.message.content, /no runtime gate, router, retry, permission, or completion control/iu);
  assert.doesNotMatch(result.message.content, /All resources loaded|WRONG:|CORRECT:|after optional hidden thinking|Thinking "/iu);
  assert.doesNotMatch(result.message.content, /suggested=|within-native-cap|native-cap=|NATIVE_BATCH_SHAPE|action=delegate|block:\s*true|continue:\s*true|hard router|automatic retry/u);
  assert.doesNotMatch(result.message.content, /DEEPSEEK|MIMO|deepseek-v4-flash|mimo-v2\.5|opencode-go/iu);
  assert.ok(result.message.content.length < 2500, `compatibility context length=${result.message.content.length}`);
  assert.deepEqual(result.message.details.features, [
    'skill-discovery',
    'workflow-selection',
    'delegation-decision',
    'workflow-candidates',
    'dynamic-review-budget',
  ]);

  assert.equal(await event(pi, 'before_agent_start')({
    prompt: '继续',
    systemPrompt: ['native OMP prompt'],
  }, ctx), undefined, 'the reminder is one-shot for the active task');
});

test('a model with no provider field also receives the workflow-entry reminder', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  pi.getActiveTools = () => ['read', 'task', 'todo'];
  pi.pi = {
    getActiveSkills: () => [{ name: 'omp-enhancer-workflows', description: 'Select workflows.' }],
  };
  registerCoreEnhancer(pi);
  const result = await event(pi, 'before_agent_start')({
    prompt: 'Audit two modules and compare their evidence.',
    systemPrompt: ['native OMP prompt'],
  }, extensionContext(entries, process.cwd(), { model: NO_PROVIDER_MODEL }));
  assert.match(result.message.content, /^OMP_WORKFLOW_ENTRY/u);
  assert.equal(Object.hasOwn(result.message.details, 'model'), false);
});

test('workflow entry observes an already supplied native workflow index and never asks for a duplicate read', async () => {
  const entries = [{
    type: 'custom',
    customType: 'skill-prompt',
    content: '---\nname: omp-enhancer-workflows\n---\n# OMP Enhancer workflows',
    details: {
      name: 'omp-enhancer-workflows',
      path: '/skills/omp-enhancer-workflows/SKILL.md',
    },
    attribution: 'user',
  }];
  const pi = new FakePi(entries);
  pi.getActiveTools = () => ['read', 'task', 'todo'];
  pi.pi = {
    getActiveSkills: () => [{ name: 'omp-enhancer-workflows', description: 'Select workflows.' }],
  };
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries, process.cwd(), {
    model: ARBITRARY_MODEL,
  });

  const result = await event(pi, 'before_agent_start')({
    prompt: 'Review the report and propose a revision.',
    systemPrompt: ['native OMP prompt'],
  }, ctx);

  assert.match(result.message.content, /INDEX STATUS=SUPPLIED BY EXACT NATIVE `skill-prompt`/iu);
  assert.match(result.message.content, /do not reread it[\s\S]*next response starts at byte 0 with a filled `WORKFLOW PLAN`/iu);
  assert.doesNotMatch(result.message.content, /call only `read` with `path=skill:\/\/omp-enhancer-workflows`/iu);
});

test('workflow entry treats unsafe, empty, stale, or legacy prompt evidence as not supplied', async () => {
  const cases = [
    {
      label: 'throwing branch getter',
      entries: [],
      mutateContext: (ctx) => {
        ctx.sessionManager.getBranch = () => {
          throw new Error('branch unavailable');
        };
      },
    },
    {
      label: 'empty body metadata',
      entries: [{
        type: 'custom',
        customType: 'skill-prompt',
        content: '   ',
        details: { name: 'omp-enhancer-workflows' },
        attribution: 'user',
      }],
    },
    {
      label: 'stale prior-turn body',
      entries: [
        {
          type: 'custom',
          customType: 'skill-prompt',
          content: '---\nname: omp-enhancer-workflows\n---\nold body',
          details: { name: 'omp-enhancer-workflows' },
          attribution: 'user',
        },
        { type: 'message', message: { role: 'assistant', content: [{ type: 'text', text: 'old answer' }] } },
        { type: 'message', message: { role: 'user', content: [{ type: 'text', text: 'new request' }] } },
      ],
    },
    {
      label: 'legacy Core autoload',
      entries: [{
        type: 'custom',
        customType: 'skill-prompt',
        content: '---\nname: omp-enhancer-workflows\n---\nlegacy body',
        details: {
          name: 'omp-enhancer-workflows',
          provisionProvider: 'omp-enhancer-core',
          provisionSchemaVersion: 1,
        },
      }],
    },
    {
      label: 'stale prior-turn body in event messages',
      entries: [],
      messages: [
        {
          type: 'custom',
          customType: 'skill-prompt',
          content: '---\nname: omp-enhancer-workflows\n---\nold event body',
          details: { name: 'omp-enhancer-workflows' },
          attribution: 'user',
        },
        { role: 'assistant', content: [{ type: 'text', text: 'old answer' }] },
        { role: 'user', content: [{ type: 'text', text: 'new request' }] },
      ],
    },
  ];

  for (const { label, entries, messages, mutateContext } of cases) {
    const pi = new FakePi(entries);
    pi.getActiveTools = () => ['read', 'task', 'todo'];
    pi.pi = {
      getActiveSkills: () => [{ name: 'omp-enhancer-workflows', description: 'Select workflows.' }],
    };
    registerCoreEnhancer(pi);
    const ctx = extensionContext(entries, process.cwd(), {
      model: ARBITRARY_MODEL,
    });
    mutateContext?.(ctx);

    const result = await event(pi, 'before_agent_start')({
      prompt: 'Review the report.',
      systemPrompt: ['native OMP prompt'],
      ...(messages ? { messages } : {}),
    }, ctx);

    assert.match(result.message.content, /INDEX STATUS=NOT SUPPLIED/iu, label);
  }
});

test('workflow entry records fallback guidance when native delegation is unavailable or forbidden', async () => {
  for (const { label, tools, prompt } of [
    { label: 'task unavailable', tools: ['read', 'todo'], prompt: 'Review the report.' },
    { label: 'delegation forbidden', tools: ['read', 'task', 'todo'], prompt: 'Review the report, but keep all work in the main agent and do not delegate.' },
  ]) {
    const entries = [];
    const pi = new FakePi(entries);
    pi.getActiveTools = () => tools;
    pi.pi = {
      getActiveSkills: () => [{ name: 'omp-enhancer-workflows', description: 'Select workflows.' }],
    };
    registerCoreEnhancer(pi);
    const result = await event(pi, 'before_agent_start')({
      prompt,
      systemPrompt: ['native OMP prompt'],
    }, extensionContext(entries, process.cwd(), {
      model: ARBITRARY_MODEL,
    }));

    assert.match(result.message.content, /record the concrete permitted fallback[\s\S]*parent VERIFY/iu, label);
    assert.doesNotMatch(result.message.content, /assign at least one safe complete checkpoint/iu, label);
  }
});

test('the staged reminder fires once for any top-level model', async () => {
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

  assert.match(result.message.content, /^OMP_WORKFLOW_ENTRY/u);
  assert.equal(Object.hasOwn(result.message.details, 'model'), false);
  assert.match(result.message.content, /INDEX STATUS=NOT SUPPLIED[\s\S]*path=skill:\/\/omp-enhancer-workflows/iu);
  assert.match(result.message.content, /DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY/iu);
  assert.match(result.message.content, /byte-0 `WORKFLOW PLAN`[\s\S]*byte-0 `WORKFLOW READY`/iu);
  assert.match(result.message.content, /Main is the orchestrator[\s\S]*evidence gathering, planning, implementation, and audit/iu);
  assert.doesNotMatch(result.message.content, /All resources loaded|WRONG:|CORRECT:|after optional hidden thinking|Thinking "/iu);
  assert.doesNotMatch(result.message.content, /suggested=|reviewer count=\d|fork width=\d|required fork|block:\s*true/iu);
  assert.doesNotMatch(result.message.content, /DEEPSEEK|MIMO|deepseek|mimo|opencode-go/iu);
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
      model: ARBITRARY_MODEL,
    }),
  );
  assert.match(skillOnly.message.content, /^OMP_SOFT_PROTOCOL[^\n]*\n(?:INDEX STATUS=[^\n]*\n)?ENTRY \(soft\):[\s\S]*DIRECT is a verbatim, no-judgment field\/heading lookup[\s\S]*no Skill\/TODO/iu);
  assert.match(skillOnly.message.content, /PROJECT ONLY . DECLARE:[\s\S]*PROJECT ONLY . LOAD:[\s\S]*PROJECT ONLY . COMMIT:/iu);
  assert.match(skillOnly.message.content, /DECLARE:[\s\S]*visible WORKFLOW PLAN block[\s\S]*Load order: NOW=\[<non-supplied Skill URIs-or-none>\] THEN=\[none\]/iu);
  assert.match(skillOnly.message.content, /LOAD:[\s\S]*read only NOW exact Skill URIs[\s\S]*wait/iu);
  assertSkillUriIdentity(skillOnly.message.content);
  assert.match(skillOnly.message.content, /COMMIT:[\s\S]*first visible bytes are `WORKFLOW READY \| workflows=unavailable[\s\S]*TODO init only/iu);
  assert.doesNotMatch(skillOnly.message.content, /DELEGATION AFTER READY|REVIEW_CONTEXT/u);
  assert.deepEqual(skillOnly.message.details.features, ['skill-discovery']);

  const taskEntries = [];
  const taskPi = new FakePi(taskEntries);
  taskPi.getActiveTools = () => ['read', 'task'];
  taskPi.pi = { getActiveSkills: () => [] };
  registerCoreEnhancer(taskPi);
  const taskOnly = await event(taskPi, 'before_agent_start')(
    structuredClone(nativeEvent),
    extensionContext(taskEntries, process.cwd(), {
      model: ARBITRARY_MODEL,
    }),
  );
  assert.match(taskOnly.message.content, /^OMP_SOFT_PROTOCOL[^\n]*\n(?:INDEX STATUS=[^\n]*\n)?ENTRY \(soft\):[\s\S]*DIRECT is a verbatim, no-judgment field\/heading lookup[\s\S]*no Skill\/TODO/iu);
  assert.match(taskOnly.message.content, /PROJECT ONLY . PHASE 1 . PLAN:[\s\S]*PROJECT ONLY . PHASE 2 . COMMIT:[\s\S]*PROJECT ONLY . PHASE 3 . EXECUTE/iu);
  assert.match(taskOnly.message.content, /PHASE 1 . PLAN:[\s\S]*PHASE 2 . COMMIT:[\s\S]*PHASE 3 . EXECUTE/iu);
  assert.match(taskOnly.message.content, /no fork or width is selected by this reminder/i);
  assert.match(taskOnly.message.content, /DELEGATION AFTER READY \(soft\):[\s\S]*Main is the orchestrator[\s\S]*non-simple work is delegated to currently visible Agents when native state permits/iu);
  assert.deepEqual(taskOnly.message.details.features, ['workflow-candidates', 'delegation-decision']);
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
    model: ARBITRARY_MODEL,
  }));
  assert.match(review.message.content, /^REVIEW_CONTEXT \(soft, no quota\)/mu);
  assert.match(review.message.content, /review=correctness,test-adequacy/i);
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
    model: ARBITRARY_MODEL,
  }));
  assert.match(shape.message.content, /^TASK_SHAPE_FACTS/mu);
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
    model: ARBITRARY_MODEL,
  }));

  assert.match(result.message.content, /PROJECT ONLY . DECLARE:[\s\S]*visible WORKFLOW PLAN block[\s\S]*Load order: NOW=\[<non-supplied Skill URIs-or-none>\] THEN=\[none\]/iu);
  assert.doesNotMatch(result.message.content, /DELEGATION AFTER READY|REVIEW_CONTEXT/u);
  assert.deepEqual(result.message.details.features, ['skill-discovery']);
  const snapshot = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.equal(snapshot.lastTaskContext.taskDescriptor.constraints.subagents, 'forbidden');
});

test('the reminder is top-level, primary-agent, and visible-capability gated but model-agnostic', async () => {
  const nativeEvent = { prompt: 'Review abstract.tex conservatively.', systemPrompt: ['native OMP prompt'] };
  // Every top-level model receives the reminder (no exact-model gating).
  for (const model of [
    { provider: 'opencode-go', id: 'deepseek-v3.2' },
    { provider: 'opencode-go', id: 'deepseek-v4-flash-pro' },
    { provider: 'another-provider', id: 'deepseek-v4-flash' },
    { provider: 'opencode-go', id: 'mimo-v2.5-pro' },
    { provider: 'xiaomi', id: 'mimo-v2.5' },
    { provider: 'foo', id: 'bar' },
    { id: 'bar' },
  ]) {
    const entries = [];
    const pi = new FakePi(entries);
    pi.getActiveTools = () => ['read'];
    pi.pi = { getActiveSkills: () => [{ name: 'writing-review', description: 'Review prose.' }] };
    registerCoreEnhancer(pi);
    const result = await event(pi, 'before_agent_start')(
      structuredClone(nativeEvent),
      extensionContext(entries, process.cwd(), { model }),
    );
    assert.notEqual(result, undefined, `${model.provider ?? '<none>'}/${model.id} should receive a reminder`);
    assert.match(result.message.content, /^OMP_SOFT_PROTOCOL/u, `${model.provider ?? '<none>'}/${model.id}`);
    assert.equal(Object.hasOwn(result.message.details, 'model'), false);
  }

  // The deleted per-model env switches are inert.
  for (const name of ['OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT', 'OMP_ENHANCER_DISABLE_MIMO_COMPAT']) {
    const previous = process.env[name];
    process.env[name] = '1';
    try {
      const entries = [];
      const pi = new FakePi(entries);
      pi.getActiveTools = () => ['read'];
      pi.pi = { getActiveSkills: () => [{ name: 'writing-review', description: 'Review prose.' }] };
      registerCoreEnhancer(pi);
      const result = await event(pi, 'before_agent_start')(
        structuredClone(nativeEvent),
        extensionContext(entries, process.cwd(), {
          model: { provider: 'opencode-go', id: name === 'OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT' ? 'deepseek-v4-flash' : 'mimo-v2.5' },
        }),
      );
      assert.notEqual(result, undefined, `${name} is inert`);
      assert.match(result.message.content, /^OMP_SOFT_PROTOCOL/u);
    } finally {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    }
  }

  // OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER suppresses only the reminder.
  const previousReminder = process.env.OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER;
  process.env.OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER = '1';
  try {
    const entries = [];
    const pi = new FakePi(entries);
    pi.getActiveTools = () => ['read'];
    pi.pi = { getActiveSkills: () => [{ name: 'writing-review', description: 'Review prose.' }] };
    registerCoreEnhancer(pi);
    assert.equal(await event(pi, 'before_agent_start')(
      structuredClone(nativeEvent),
      extensionContext(entries, process.cwd(), { model: ARBITRARY_MODEL }),
    ), undefined, 'OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER suppresses the reminder');
  } finally {
    if (previousReminder === undefined) delete process.env.OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER;
    else process.env.OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER = previousReminder;
  }

  // Subagent sessions never receive the reminder.
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
      model: ARBITRARY_MODEL,
    }),
  ), undefined);

  // No visible skills -> no reminder.
  const hiddenEntries = [];
  const hiddenPi = new FakePi(hiddenEntries);
  hiddenPi.pi = { getActiveSkills: () => [{ name: 'hidden-skill', hide: true }] };
  registerCoreEnhancer(hiddenPi);
  assert.equal(await event(hiddenPi, 'before_agent_start')(
    structuredClone(nativeEvent),
    extensionContext(hiddenEntries, process.cwd(), {
      model: ARBITRARY_MODEL,
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

  const after = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.equal(entries.length, entryCount);
  assert.deepEqual(after, before);
});

test('state schema bump drops stale model-era reminder state on restore', async () => {
  const { pi, entries, ctx } = registeredCore();
  pi.getActiveTools = () => ['read', 'task', 'todo'];
  pi.pi = { getActiveSkills: () => [{ name: 'omp-enhancer-workflows', description: 'Select workflows.' }] };
  await event(pi, 'before_agent_start')({ prompt: 'First project task.' }, ctx);
  const staleSnapshot = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.equal(staleSnapshot.schemaVersion, 9);
  // Simulate a pre-v8 persisted state using the old field name.
  const preV8 = {
    ...structuredClone(staleSnapshot),
    schemaVersion: 7,
    compatibilityReminderTaskStartedAt: staleSnapshot.taskStartedAt,
  };
  delete preV8.workflowReminderTaskStartedAt;
  const restoredEntries = [{ type: 'custom', customType: 'omp-enhancer-core.state', data: preV8 }];
  const restoredPi = new FakePi(restoredEntries);
  restoredPi.getActiveTools = () => ['read', 'task', 'todo'];
  restoredPi.pi = { getActiveSkills: () => [{ name: 'omp-enhancer-workflows', description: 'Select workflows.' }] };
  registerCoreEnhancer(restoredPi);
  const restoredCtx = extensionContext(restoredEntries, process.cwd(), { model: ARBITRARY_MODEL });
  await event(restoredPi, 'session_start')({}, restoredCtx);
  const after = restoredEntries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.equal(after.schemaVersion, 9);
  assert.equal(after.workflowReminderTaskStartedAt, 0);
  // A fresh reminder fires for the new task (stale one-shot state was dropped).
  const reminder = await event(restoredPi, 'before_agent_start')({ prompt: 'A new project task.' }, restoredCtx);
  assert.notEqual(reminder, undefined);
});


test('plan-to-execute transition injects OMP_WORKFLOW_ENTRY without visible workflow skill', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  pi.getActiveTools = () => ['read', 'task', 'todo'];
  // No workflow skill visible — only a non-workflow skill
  pi.pi = {
    getActiveSkills: () => [{ name: 'writing-review', description: 'Review prose.' }],
  };
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries, process.cwd(), { model: ARBITRARY_MODEL });

  // First turn: plan mode with both required markers
  const planTurn = await event(pi, 'before_agent_start')({
    prompt: 'Implement the user auth module.',
    systemPrompt: ['base prompt'],
    messages: [
      { role: 'custom', content: 'Plan mode is active. xd://propose' },
    ],
  }, ctx);
  assert.ok(planTurn, 'plan mode turn must produce a reminder');
  assert.match(planTurn.message.content, /OMP_PLAN_MODE/u, 'plan mode reminder must contain OMP_PLAN_MODE');
  assert.doesNotMatch(planTurn.message.content, /^OMP_WORKFLOW_ENTRY/u, 'plan mode must not contain OMP_WORKFLOW_ENTRY');

  // Second turn: execution after plan mode (same entries carry state)
  // planToExecuteTransition = lastTaskPlanMode(true from first call) && planMode(false for this turn)
  const executeTurn = await event(pi, 'before_agent_start')({
    prompt: 'proceed',
    systemPrompt: ['base prompt'],
  }, ctx);
  assert.ok(executeTurn, 'execute turn must produce a reminder');
  assert.match(executeTurn.message.content, /^OMP_WORKFLOW_ENTRY/u, 'execute turn must inject OMP_WORKFLOW_ENTRY without visible workflow skill');
  assert.match(executeTurn.message.content, /DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY/u, 'entry must embed the staged protocol');
  assert.match(executeTurn.message.content, /INDEX STATUS=NOT SUPPLIED/u, 'entry must instruct index read since skill is not visible');
});

test('hasVisibleSkills but no workflow skill injects INDEX STATUS=NOT SUPPLIED read directive', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  pi.getActiveTools = () => ['read', 'task', 'todo'];
  pi.pi = { getActiveSkills: () => [{ name: 'tikz-diagram', description: 'Draw TikZ diagrams.' }] };
  registerCoreEnhancer(pi);
  const result = await event(pi, 'before_agent_start')({
    prompt: '画一个系统架构图',
    systemPrompt: ['native OMP prompt'],
  }, extensionContext(entries, process.cwd(), { model: ARBITRARY_MODEL }));
  assert.ok(result, 'tikz scenario must produce a reminder');
  assert.match(result.message.content, /^OMP_SOFT_PROTOCOL/u, 'weak branch must use OMP_SOFT_PROTOCOL prefix');
  assert.match(result.message.content, /INDEX STATUS=NOT SUPPLIED/iu, 'must instruct reading workflow index');
  assert.match(result.message.content, /skill:\/\/omp-enhancer-workflows/iu, 'must name the workflow index URI');
  assert.match(result.message.content, /PROJECT ONLY.*DECLARE.*byte 0.*WORKFLOW PLAN/iu, 'must retain the weak-branch PLAN directive');
  assert.equal(Object.hasOwn(result.message.details, 'model'), false, 'no per-model metadata');
  assert.ok(result.message.details.features?.includes('skill-discovery'), 'features must include skill-discovery');
});

test('hasVisibleSkills but no workflow skill with supplied index uses INDEX STATUS=SUPPLIED', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  pi.getActiveTools = () => ['read', 'task', 'todo'];
  pi.pi = { getActiveSkills: () => [{ name: 'tikz-diagram', description: 'Draw TikZ diagrams.' }] };
  registerCoreEnhancer(pi);
  const result = await event(pi, 'before_agent_start')({
    prompt: '画一个系统架构图',
    systemPrompt: ['native OMP prompt'],
    messages: [{ role: 'user', customType: 'skill-prompt', content: 'body', details: { name: 'omp-enhancer-workflows' } }],
  }, extensionContext(entries, process.cwd(), { model: ARBITRARY_MODEL }));
  assert.ok(result, 'supplied index scenario must produce a reminder');
  assert.match(result.message.content, /^OMP_SOFT_PROTOCOL/u, 'weak branch must use OMP_SOFT_PROTOCOL prefix');
  assert.match(result.message.content, /INDEX STATUS=SUPPLIED/iu, 'must acknowledge supplied index');
  assert.match(result.message.content, /INDEX STATUS=SUPPLIED BY EXACT NATIVE/iu, 'supplied status must reference native skill-prompt');
  assert.ok(result.message.details.features?.includes('skill-discovery'), 'features must include skill-discovery');
});

test('no visible skills + non-substantive operation injects INDEX STATUS=NOT SUPPLIED in TASK_STAGED_REMINDER', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  pi.getActiveTools = () => ['read', 'task', 'todo'];
  // No pi.getActiveSkills → visibleSkills is empty
  registerCoreEnhancer(pi);
  const result = await event(pi, 'before_agent_start')({
    prompt: 'Review the codebase structure.',
    systemPrompt: ['native OMP prompt'],
  }, extensionContext(entries, process.cwd(), { model: ARBITRARY_MODEL }));
  assert.ok(result, 'non-substantive scenario must produce a reminder');
  assert.match(result.message.content, /^OMP_SOFT_PROTOCOL/u, 'must use OMP_SOFT_PROTOCOL prefix');
  assert.match(result.message.content, /INDEX STATUS=NOT SUPPLIED/iu, 'must instruct reading workflow index');
  assert.match(result.message.content, /skill:\/\/omp-enhancer-workflows/iu, 'must name the workflow index URI');
  assert.match(result.message.content, /PROJECT ONLY.*PHASE 1.*PLAN/iu, 'must retain TASK_STAGED_REMINDER PLAN directive');
  assert.match(result.message.content, /PROJECT ONLY.*PHASE 2.*COMMIT/iu, 'must retain TASK_STAGED_REMINDER COMMIT directive');
  assert.match(result.message.content, /PROJECT ONLY.*PHASE 3.*EXECUTE/iu, 'must retain TASK_STAGED_REMINDER EXECUTE directive');
});

function registeredCore() {
  const entries = [];
  const pi = new FakePi(entries);
  registerCoreEnhancer(pi);
  return { pi, entries, ctx: extensionContext(entries) };
}

function assertSkillUriIdentity(content) {
  assert.match(content, /SKILL URI:[\s\S]*visible `x` -> `skill:\/\/x`[\s\S]*nested only from a loaded source revealing the exact URI/iu);
  assert.match(content, /Use `read\.path`[\s\S]*Bare `x` is a project path, not Skill absence[\s\S]*only exact-URI failure = unavailable/iu);
  assert.match(content, /`\.agents\/skills` is not the inventory/iu);
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
  const schema = () => ({ optional: schema, describe: () => schema() });
  return {
    string: schema,
    boolean: schema,
    array: () => schema(),
    object: () => schema(),
  };
}