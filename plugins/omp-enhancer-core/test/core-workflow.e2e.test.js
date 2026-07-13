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

test('primary startup exposes the full catalog and skill inventory without autoloading a route bundle', async () => {
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
  const routed = await event(pi, 'before_agent_start')({
    prompt: 'Diagnose the parser, implement the fix, add tests, and review the result.',
    systemPrompt: ['base prompt'],
  }, ctx);

  assert.equal(nativeBuilds, 0);
  assert.equal(routed.route.intent, 'agent-selected');
  assert.equal(routed.route.routePlan.mode, 'agent-selected');
  assert.deepEqual(routed.route.routePlan.skills, []);
  assert.equal(routed.message.customType, 'omp-enhancer-core.workflow-guidance');
  assert.equal(routed.message.display, false);
  assert.ok(Array.isArray(routed.systemPrompt));
  assert.equal(routed.systemPrompt[0], 'base prompt');
  const injected = routed.systemPrompt.at(-1);
  assert.match(injected, /OMP Main-Agent Workflow Orchestration/);
  assert.match(injected, /OMP_WORKFLOW_CATALOG_VERSION: 3/);
  assert.match(injected, /### writing\.en/);
  assert.match(injected, /### code\.debug/);
  assert.match(injected, /### release\.publish/);
  assert.match(injected, /skill:\/\/writing-review — Review academic prose\./);
  assert.match(injected, /skill:\/\/systematic-debugging — Trace concrete failures\./);
  assert.doesNotMatch(injected, /hidden-skill/);
  assert.match(injected, /native `todo` tool with `op: "init"`/i);
  assert.match(injected, /fork multiple subagents early/i);
  assert.equal(Object.hasOwn(routed, 'additionalContext'), false);
  assert.notEqual(routed.block, true);

  const snapshot = entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state').data;
  assert.deepEqual(snapshot.providedSkills, []);
});

test('body language is exposed as a task fact while workflow and skills remain main-agent choices', async () => {
  const root = mkdtempSync(join(tmpdir(), 'omp-workflow-language-'));
  mkdirSync(join(root, 'tex'), { recursive: true });
  writeFileSync(join(root, 'tex', 'introduction.tex'), '\\section{Introduction}\nThis paper presents the system and its evaluation.');
  try {
    const { pi, entries } = registeredCore();
    const routed = await event(pi, 'before_agent_start')({
      prompt: '请润色 tex/introduction.tex。',
    }, extensionContext(entries, root));

    assert.equal(routed.route.taskDescriptor.language, 'en');
    const injected = routed.systemPrompt.at(-1);
    assert.match(injected, /Observed target-text language: en/i);
    assert.match(injected, /writing\.zh or writing\.en from the language of the text being changed/i);
    assert.match(injected, /compose writing\.latex/i);
    assert.doesNotMatch(injected, /WORKFLOW FIRST TOOL CALL|Routed workflow skills already loaded/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('real batch task assignments preserve native schema and pass through parent workflow decisions', async () => {
  const { pi, ctx } = registeredCore();
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
          task: '[workflow=code.review step=step-1 todo=Inspect router skills=systematic-debugging]\n# Target\nsrc/router.js\n# Acceptance\nFile-backed findings.',
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

  const originalContext = taskEvent.input.context;
  assert.equal(await event(pi, 'tool_call')(taskEvent, ctx), undefined);
  assert.equal(taskEvent.input.context, originalContext);
  assert.deepEqual(taskEvent.input.tasks.map(({ name, agent }) => ({ name, agent })), [
    { name: 'RouteScout', agent: 'scout' },
    { name: 'TestReviewer', agent: 'reviewer' },
  ]);
  for (const item of taskEvent.input.tasks) {
    const prefix = [...item.task].slice(0, 120).join('');
    assert.match(prefix, /^\[workflow=/);
    assert.match(prefix, / step=/);
    assert.match(prefix, / todo=/);
    assert.match(prefix, / skills=/);
    assert.match(item.task, /OMP_PARENT_ASSIGNMENT_CONTEXT:/);
    assert.match(item.task, /Parent task context: Audit routing and testing/);
    assert.match(item.task, /parent owns integration and final verification/i);
  }
  assert.match(taskEvent.input.tasks[0].task, /OMP_WORKFLOW: code\.review/);
  assert.match(taskEvent.input.tasks[0].task, /skill:\/\/systematic-debugging/);
  assert.match(taskEvent.input.tasks[1].task, /OMP_WORKFLOW: code\.review,code\.test/);
  assert.match(taskEvent.input.tasks[1].task, /OMP_WORKFLOW_STEP: step-coverage-review/);
  assert.match(taskEvent.input.tasks[1].task, /OMP_TODO_ITEM: Inspect the complete regression test matrix and return exact evidence/);
  assert.match(taskEvent.input.tasks[1].task, /skill:\/\/verification-before-completion/);

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

test('flat task assignments and spawned subagents receive one checkpoint without a full reroute', async () => {
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
  assert.equal(await event(pi, 'tool_call')(taskEvent, ctx), undefined);
  assert.equal(taskEvent.input.name, 'ParserReviewer');
  assert.equal(taskEvent.input.agent, 'reviewer');
  assert.match(taskEvent.input.task, /^\[workflow=code\.review step=step-2 todo=Review parser diff skills=verification-before-completion\]/);
  assert.match(taskEvent.input.task, /- skill:\/\/verification-before-completion/);

  const subagent = await event(pi, 'before_agent_start')({ prompt: taskEvent.input.task }, ctx);
  const fragment = subagent.systemPrompt.at(-1);
  assert.equal(subagent.route.intent, 'subagent');
  assert.match(fragment, /OMP Subagent Workflow Checkpoint/);
  assert.match(fragment, /Parent-selected workflow: code\.review/);
  assert.match(fragment, /Parent-selected step: step-2/);
  assert.match(fragment, /Parent TODO item: Review parser diff/);
  assert.match(fragment, /skill:\/\/verification-before-completion/);
  assert.doesNotMatch(fragment, /Complete workflow catalog|OMP_WORKFLOW_CATALOG_VERSION/);
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
  ]);
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

function extensionContext(entries = [], cwd = process.cwd()) {
  return {
    cwd,
    sessionManager: { getBranch: () => entries },
    ui: { notify: () => undefined },
    hasUI: false,
  };
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
