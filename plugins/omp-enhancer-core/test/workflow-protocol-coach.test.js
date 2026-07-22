import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createWorkflowProtocolCoachState,
  observeProtocolAssistantMessage,
  observeProtocolSuppliedWorkflowIndex,
  observeProtocolToolCall,
  observeProtocolToolResult,
  presentWorkflowProtocolCoachCue,
  sanitizeWorkflowProtocolCoachState,
  serializeWorkflowProtocolCoachState,
} from '../src/workflow-protocol-coach.js';
import {
  DELEGATION_COMPILE_RULE,
  DELEGATED_TODO_TEMPLATE,
  NATIVE_TASK_PREFIX_TEMPLATE,
} from '../src/workflows/staged-contract.js';

const INDEX_URI = 'skill://omp-enhancer-workflows';
const DOMAIN_URI = 'skill://writing-review';
const ADD_ON_URI = 'skill://omp-enhancer-workflows/references/writing-latex.md';
const PRIMARY_URI = 'skill://omp-enhancer-workflows/references/writing-en.md';
const INDEX_BODY = '---\nname: omp-enhancer-workflows\ndescription: Workflow index.\n---\n';

test('a verified exact workflow index read presents PRE_PLAN until assistant progress', () => {
  const state = createWorkflowProtocolCoachState();

  observeProtocolToolResult(state, {
    name: 'read',
    target: INDEX_URI,
    body: INDEX_BODY,
  });
  assert.equal(state.pendingCue?.kind, 'PRE_PLAN');

  const first = presentWorkflowProtocolCoachCue(state);
  const retry = presentWorkflowProtocolCoachCue(state);
  assert.equal(first.kind, 'PRE_PLAN');
  assert.deepEqual(retry, first);
  assert.match(first.content, /byte 0[\s\S]*WORKFLOW PLAN/u);
  assert.match(first.content, /CONTINUE PROJECT[^\n]*Main[^\n]*index (?:read|supply)[^\n]*initiated/iu);
  assert.match(first.content, /DIRECT only[^\n]*verbatim[^\n]*no-judgment[^\n]*field\/heading lookup/iu);
  assert.match(first.content, /read-only[^\n]*small[^\n]*comparison[^\n]*cannot downgrade[^\n]*PROJECT/iu);
  assert.match(first.content, /Main autonomously[^\n]*loaded index[^\n]*one matched exact Primary/iu);
  assert.match(first.content, /only (?:when|if) no row matches[^\n]*Primary none/iu);
  assert.match(first.content, /^1\. LOAD:/mu);
  assert.match(first.content, /^2\. COMMIT:/mu);
  assert.match(first.content, /^3\. SPLIT \+ EXECUTE:/mu);
  assert.match(first.content, /^4\. VERIFY:/mu);
  assert.doesNotMatch(
    first.content,
    /general\.subagent|agentic\.simple|writing\.|skill:\/\/|\bAgent\b|fan-?out|\bdelegate\b|gate|router|block|retry|controller/iu,
  );

  observeProtocolAssistantMessage(state, 'I will prepare the declaration.');
  assert.equal(state.pendingCue, null);
});

test('an exactly validated native supplied index uses the same PRE_PLAN observation', () => {
  const state = createWorkflowProtocolCoachState();
  observeProtocolSuppliedWorkflowIndex(state);
  assert.equal(state.indexObserved, true);
  assert.equal(state.pendingCue?.kind, 'PRE_PLAN');
  assert.match(presentWorkflowProtocolCoachCue(state).content, /CONTINUE PROJECT/iu);
});

test('index evidence must be exact, complete, nonfailed, and nonpending', () => {
  const variants = [
    { target: `${INDEX_URI}/extra`, body: INDEX_BODY },
    { target: INDEX_URI, body: '---\nname: another-skill\n---\n' },
    { target: INDEX_URI, body: INDEX_BODY, failed: true },
    { target: INDEX_URI, body: INDEX_BODY, pending: true },
  ];

  for (const variant of variants) {
    const state = createWorkflowProtocolCoachState();
    observeProtocolToolResult(state, { name: 'read', ...variant });
    assert.equal(state.pendingCue, null, JSON.stringify(variant));
    assert.equal(state.indexObserved, false, JSON.stringify(variant));
  }
});

test('observation parsing is bounded to 64 KiB', () => {
  const state = createWorkflowProtocolCoachState();
  observeProtocolToolResult(state, {
    name: 'read',
    target: INDEX_URI,
    body: `${'x'.repeat(64 * 1024)}\n${INDEX_BODY}`,
  });
  assert.equal(state.indexObserved, false);
  assert.equal(state.pendingCue, null);
});

test('CRLF PLAN freezes declared reads and waits for all resources and final THEN', () => {
  const state = indexedState();
  presentWorkflowProtocolCoachCue(state);
  observeProtocolAssistantMessage(state, workflowPlan({ crlf: true }));

  assert.equal(state.declaration.primary, 'writing.en');
  assert.deepEqual(state.declaration.now, [DOMAIN_URI]);
  assert.deepEqual(state.declaration.then, [ADD_ON_URI, PRIMARY_URI]);
  assert.equal(state.pendingCue, null);
  assert.equal(state.diagnostics.length, 0, 'inline Action references are not public marker lines');

  observeProtocolToolResult(state, { name: 'read', target: PRIMARY_URI, failed: false });
  assert.equal(state.pendingCue, null, 'an early final reference is insufficient');
  observeProtocolToolResult(state, { name: 'read', target: DOMAIN_URI, failed: true });
  assert.equal(state.pendingCue, null, 'a failed declared read counts as unavailable but another declaration is outstanding');
  observeProtocolToolResult(state, { name: 'read', target: ADD_ON_URI, failed: false });

  assert.equal(state.pendingCue?.kind, 'PRE_READY');
  const cue = presentWorkflowProtocolCoachCue(state);
  assert.ok(cue.content.includes('\n'), 'PRE_READY is a compact multiline schema');
  assert.ok(cue.content.length < 950, `PRE_READY must stay below 950 characters, got ${cue.content.length}`);
  assert.match(cue.content, /byte 0[^\n]*WORKFLOW READY/iu);
  assert.match(
    cue.content,
    /same response[^\n]*native `?todo`?\([^\n)]*`?op=init`?[^\n)]*\)[^\n]*only[^\n]*end\/wait/iu,
  );
  assert.doesNotMatch(cue.content, /op=done|mark done/iu);
  assert.match(cue.content, /todo[\s\S]*op=init[\s\S]*only[\s\S]*wait/iu);
  assert.equal(
    cue.content.split(DELEGATION_COMPILE_RULE).length - 1,
    1,
    'PRE_READY restates the canonical conditional delegation compiler once',
  );
  assert.equal(
    cue.content.split(DELEGATED_TODO_TEMPLATE).length - 1,
    1,
    'PRE_READY restates the canonical exact Delegate TODO row once',
  );
  assert.ok(cue.content.includes('EACH MATCHED DELEGATE items[] STRING MUST USE THE FILLED FORM OF:'));
  assert.match(cue.content, /fill every placeholder/iu);
  assert.match(
    cue.content,
    /filled workflow[^\n]*excludes?[^\n]*sentinel `none`/iu,
  );
  assert.match(cue.content, /`Add-ons=none`[^\n]*`workflow=Primary` only/iu);
  assert.match(
    cue.content,
    /empty (?:loaded )?Skills[\s\S]*`skills=none`[\s\S]*(?:never|not) blank\/omitted/iu,
  );
  assert.match(
    cue.content,
    /checkpoint[\s\S]*complete[\s\S]*runnable[\s\S]*(?:one|single)[ -]line/iu,
  );
  assert.match(cue.content, /(?:no|ban) role\/step shorthand/iu);
  assert.match(cue.content, /summary labels?/iu);
  assert.match(cue.content, /literal `Delegate step-task:`/u);
  assert.match(
    cue.content,
    /TODO>=2[^\n]*(?:one|1) filled Delegate[^\n]*(?:one|1) separate parent-owned integration\/VERIFY/iu,
  );
  assert.match(cue.content, /loaded `subagent-driven`[^\n]*otherwise `fallback=/iu);
  assert.doesNotMatch(cue.content, /integration[^\n]*VERIFY[^\n]*report[^\n]*(?:each|separate|three|3)/iu);
  assert.match(cue.content, /OMP PROTOCOL COACH \(soft/iu);
  assert.match(cue.content, /No choice\/authority\/gate/u);
  assert.doesNotMatch(cue.content, /agentic\.simple|writing\.pending|writing\.en|writing-review|ZhWriter/u);
  assert.doesNotMatch(cue.content, /block(?:ing|ed)?|controller/iu);
});

test('a pending or unrelated read never completes a declaration', () => {
  const state = plannedState();
  observeProtocolToolResult(state, { name: 'read', target: DOMAIN_URI });
  observeProtocolToolResult(state, { name: 'read', target: ADD_ON_URI });
  observeProtocolToolResult(state, { name: 'read', target: PRIMARY_URI, pending: true });
  observeProtocolToolResult(state, { name: 'read', target: 'skill://unrelated' });
  assert.equal(state.pendingCue, null);

  observeProtocolToolResult(state, { name: 'read', target: PRIMARY_URI });
  assert.equal(state.pendingCue?.kind, 'PRE_READY');
});

test('visible RESOURCE EXTENSION reads join the mechanically observed load set', () => {
  const state = plannedState();
  observeProtocolToolResult(state, { name: 'read', target: DOMAIN_URI });
  observeProtocolAssistantMessage(
    state,
    `RESOURCE EXTENSION | source=${DOMAIN_URI} | reads=skill://writing-helper/methods/style,skill://writing-helper/methods/citations`,
  );
  observeProtocolToolResult(state, { name: 'read', target: ADD_ON_URI });
  observeProtocolToolResult(state, { name: 'read', target: PRIMARY_URI });
  assert.equal(state.pendingCue, null, 'the final THEN cannot bypass a declared extension batch');

  observeProtocolToolResult(state, { name: 'read', target: 'skill://writing-helper/methods/citations', failed: true });
  assert.equal(state.pendingCue, null);
  observeProtocolToolResult(state, { name: 'read', target: 'skill://writing-helper/methods/style' });
  assert.equal(state.pendingCue?.kind, 'PRE_READY');
});

test('a RESOURCE EXTENSION after final THEN or a queued PRE_READY is diagnostic-only', () => {
  const afterFinal = plannedState();
  observeProtocolToolResult(afterFinal, { name: 'read', target: DOMAIN_URI });
  observeProtocolToolResult(afterFinal, { name: 'read', target: PRIMARY_URI });
  observeProtocolAssistantMessage(
    afterFinal,
    `RESOURCE EXTENSION | source=${DOMAIN_URI} | reads=skill://writing-helper/methods/style`,
  );
  assert.deepEqual(afterFinal.declaration.extensions, []);
  assert.ok(afterFinal.diagnostics.some((item) => item.code === 'RESOURCE_EXTENSION_LATE'));
  observeProtocolToolResult(afterFinal, { name: 'read', target: ADD_ON_URI });
  assert.equal(afterFinal.pendingCue?.kind, 'PRE_READY');

  const queued = readyCueState();
  const before = structuredClone(queued.pendingCue);
  const first = presentWorkflowProtocolCoachCue(queued);
  observeProtocolAssistantMessage(
    queued,
    `RESOURCE EXTENSION | source=${DOMAIN_URI} | reads=skill://writing-helper/methods/citations`,
  );
  assert.deepEqual(queued.declaration.extensions, []);
  assert.deepEqual(queued.pendingCue, before);
  assert.deepEqual(presentWorkflowProtocolCoachCue(queued), first);
  assert.ok(queued.diagnostics.some((item) => item.code === 'RESOURCE_EXTENSION_LATE'));
});

test('canonical Primary none and THEN none becomes ready after declared NOW settles', () => {
  const state = indexedState();
  presentWorkflowProtocolCoachCue(state);
  observeProtocolAssistantMessage(state, workflowPlan({ primary: 'none', then: [] }));
  assert.equal(state.declaration.primary, 'none');
  assert.deepEqual(state.declaration.then, []);
  assert.equal(state.pendingCue, null);

  observeProtocolToolResult(state, { name: 'read', target: DOMAIN_URI });
  assert.equal(state.pendingCue?.kind, 'PRE_READY');
});

test('malformed or prefaced PLAN is diagnostic-only and never guesses a declaration', () => {
  for (const text of [
    `Preface\n${workflowPlan()}`,
    'WORKFLOW PLAN\nPrimary: writing.en\nLoad order: NOW=[writing-review] THEN=[none]\nActions:\n1. LOAD',
    `WORKFLOW PLAN\nPrimary: writing.en\nLoad order: NOW=[${DOMAIN_URI}] THEN=[none]\nActions:\n1. LOAD`,
  ]) {
    const state = indexedState();
    presentWorkflowProtocolCoachCue(state);
    observeProtocolAssistantMessage(state, text);
    assert.equal(state.declaration, null);
    assert.ok(state.diagnostics.length > 0);
    assert.equal(state.pendingCue, null);
  }
});

test('READY is rejected before every current-generation load has settled', () => {
  const state = plannedState();
  observeProtocolToolResult(state, { name: 'read', target: DOMAIN_URI });
  observeProtocolAssistantMessage(state, readyLine());
  assert.equal(state.declaration.readyObserved, false);
  assert.equal(state.pendingCue, null);
  assert.ok(state.diagnostics.some((item) => item.code === 'READY_BEFORE_LOADS_SETTLED'));
  observeProtocolToolResult(state, { name: 'todo' });
  assert.equal(state.pendingCue, null);
});

test('READY primary add-ons and all canonical fields must match the frozen PLAN', () => {
  const variants = [
    [readyLine({ primary: 'writing.zh' }), 'READY_PRIMARY_MISMATCH'],
    [readyLine({ addOns: 'writing.latex' }), 'READY_ADD_ONS_MISMATCH'],
    ['WORKFLOW READY | primary=writing.en | add-ons=none | skills-loaded=writing-review', 'READY_MALFORMED'],
  ];
  for (const [line, code] of variants) {
    const state = readyCueState();
    const pending = structuredClone(state.pendingCue);
    observeProtocolAssistantMessage(state, line);
    assert.equal(state.declaration.readyObserved, false, code);
    assert.deepEqual(state.pendingCue, pending, code);
    assert.ok(state.diagnostics.some((item) => item.code === code), code);
    observeProtocolToolResult(state, { name: 'todo' });
    assert.deepEqual(state.pendingCue, pending, code);
  }
});

test('READY must be at byte zero and only its successful TODO queues PRE_DISPATCH', () => {
  const state = readyCueState();
  presentWorkflowProtocolCoachCue(state);

  observeProtocolAssistantMessage(state, 'Preface\nWORKFLOW READY | primary=writing.en | add-ons=none | skills-loaded=writing-review | skills-unavailable=none');
  observeProtocolToolResult(state, { name: 'todo' });
  assert.equal(state.pendingCue?.kind, 'PRE_READY');
  assert.equal(state.declaration.readyObserved, false);
  assert.ok(state.diagnostics.some((item) => item.code === 'READY_NOT_BYTE_0'));

  observeProtocolAssistantMessage(state, 'WORKFLOW READY | primary=writing.en | add-ons=none | skills-loaded=writing-review | skills-unavailable=none');
  observeProtocolToolResult(state, { name: 'todo', pending: true });
  assert.equal(state.pendingCue, null);
  observeProtocolToolResult(state, { name: 'todo' });
  assert.equal(state.pendingCue?.kind, 'PRE_DISPATCH');

  const first = presentWorkflowProtocolCoachCue(state);
  const retry = presentWorkflowProtocolCoachCue(state);
  assert.deepEqual(retry, first);
  assert.ok(first.content.includes('\n'), 'PRE_DISPATCH is a compact multiline schema');
  assert.ok(first.content.length < 1_100, `PRE_DISPATCH must stay below 1100 characters, got ${first.content.length}`);
  assert.match(first.content, /SELF-CHECK IF AND ONLY IF all hold/iu);
  assert.match(
    first.content,
    /loaded `subagent-driven`[\s\S]*Main independently confirms[\s\S]*complete input[\s\S]*safe checkpoint[\s\S]*visible matching Agent[\s\S]*chose Delegate[\s\S]*no permitted fallback[\s\S]*committed TODO lacks[\s\S]*filled row/iu,
  );
  assert.equal(first.content.split(DELEGATED_TODO_TEMPLATE).length - 1, 1);
  assert.match(
    first.content,
    /Then native `?todo`?\([^\n)]*`?op=init`?[^\n)]*\)[^\n]*rebase only[^\n]*never[^\n]*`?op=done`?[^\n]*end\/wait[^\n]*same response[^\n]*no `?task`?/iu,
  );
  assert.match(
    first.content,
    /otherwise[\s\S]*direct-simple[\s\S]*parent-only[\s\S]*permitted fallback[\s\S]*ignore (?:the )?self-check[\s\S]*(?:generate )?no `task`/iu,
  );
  assert.match(first.content, /LATER NATURAL RESPONSE[\s\S]*only if[\s\S]*filled committed row still exists/iu);
  assert.match(
    first.content,
    /explicitly[\s\S]*row Agent[\s\S]*item `agent`[\s\S]*default match[\s\S]*nonempty top-level `context`/iu,
  );
  assert.equal(first.content.split(NATIVE_TASK_PREFIX_TEMPLATE).length - 1, 1, 'the complete assignment prefix appears exactly once');
  assert.match(first.content, /literal `skills=none`[\s\S]*unchanged[\s\S]*(?:never|not) empty/iu);
  assert.match(first.content, /complete terminal delivery[\s\S]*(?:status|reference)-only incomplete/iu);
  assert.match(first.content, /no accepted repair finding[\s\S]*resolve TODO[\s\S]*no `task`/iu);
  assert.match(first.content, /No block\/router\/gate\/retry\/authority\/choice/u);
  assert.doesNotMatch(first.content, /block:\s*true|continue:\s*true|agentic\.simple|writing\.pending/u);

  const taskClear = structuredClone(state);
  observeProtocolToolCall(taskClear, { name: 'task' });
  assert.equal(taskClear.pendingCue, null, 'a valid task call still clears PRE_DISPATCH');

  observeProtocolAssistantMessage(state, 'Native todo(op=init) rebase only; end/wait; same response has no task.');
  assert.equal(state.pendingCue, null);
  observeProtocolToolResult(state, { name: 'todo' });
  assert.equal(state.pendingCue, null, 'the successful rebase result cannot queue a second cue');
  assert.equal(state.declaration.dispatchCueQueued, true);
});

test('ordinary TODO is ignored and writing.pending permits exactly one language replacement', () => {
  const ordinary = plannedState();
  observeProtocolToolResult(ordinary, { name: 'todo' });
  assert.equal(ordinary.pendingCue, null);

  const state = indexedState();
  presentWorkflowProtocolCoachCue(state);
  observeProtocolAssistantMessage(state, workflowPlan({
    primary: 'writing.pending',
    now: ['skill://writing-language-detection'],
    then: ['skill://omp-enhancer-workflows/references/writing-pending.md'],
  }));
  for (const uri of [...state.declaration.now, ...state.declaration.then]) {
    observeProtocolToolResult(state, { name: 'read', target: uri });
  }
  presentWorkflowProtocolCoachCue(state);
  observeProtocolAssistantMessage(state, 'WORKFLOW READY | primary=writing.pending | add-ons=none | skills-loaded=writing-language-detection | skills-unavailable=none');
  observeProtocolToolResult(state, { name: 'todo' });
  assert.equal(state.pendingCue, null, 'pending language selection is not a dispatch checkpoint');
  assert.equal(state.declaration.dispatchCueQueued, false);

  observeProtocolAssistantMessage(state, workflowPlan());
  assert.equal(state.declaration.generation, 2);
  assert.equal(state.replacementUsed, true);
  for (const uri of [...state.declaration.now, ...state.declaration.then]) {
    observeProtocolToolResult(state, { name: 'read', target: uri });
  }
  assert.equal(state.pendingCue?.kind, 'PRE_READY');

  presentWorkflowProtocolCoachCue(state);
  observeProtocolAssistantMessage(state, workflowPlan({ primary: 'writing.zh' }));
  assert.equal(state.declaration.primary, 'writing.en');
  assert.equal(state.declaration.generation, 2);
  assert.ok(state.diagnostics.some((item) => item.code === 'PLAN_REPLACEMENT_REJECTED'));
});

test('a stale writing.pending READY cannot commit a replacement language generation', () => {
  const state = writingReplacementReadyState();
  const pending = structuredClone(state.pendingCue);
  observeProtocolAssistantMessage(state, readyLine({
    primary: 'writing.pending',
    skillsLoaded: 'writing-language-detection',
  }));
  assert.equal(state.declaration.primary, 'writing.en');
  assert.equal(state.declaration.readyObserved, false);
  assert.deepEqual(state.pendingCue, pending);
  assert.ok(state.diagnostics.some((item) => item.code === 'READY_PRIMARY_MISMATCH'));
});

test('state serialization and sanitization preserve a retryable cue without sharing references', () => {
  const state = plannedState();
  observeProtocolToolResult(state, { name: 'read', target: DOMAIN_URI });
  observeProtocolToolResult(state, { name: 'read', target: ADD_ON_URI });
  observeProtocolToolResult(state, { name: 'read', target: PRIMARY_URI });
  presentWorkflowProtocolCoachCue(state);

  const snapshot = serializeWorkflowProtocolCoachState(state);
  assert.equal(Object.hasOwn(snapshot, 'uncertain'), false);
  assert.equal(Object.hasOwn(snapshot.pendingCue, 'presentations'), false);
  const restored = sanitizeWorkflowProtocolCoachState(snapshot);
  assert.deepEqual(serializeWorkflowProtocolCoachState(restored), snapshot);
  assert.notEqual(restored, state);
  assert.notEqual(restored.declaration, state.declaration);
  assert.equal(presentWorkflowProtocolCoachCue(restored).kind, 'PRE_READY');

  const invalid = sanitizeWorkflowProtocolCoachState({ pendingCue: { kind: 'ROUTE_TASK' } });
  assert.equal(invalid.pendingCue, null);
  assert.equal(invalid.declaration, null);
});

function indexedState() {
  const state = createWorkflowProtocolCoachState();
  observeProtocolToolResult(state, { name: 'read', target: INDEX_URI, body: INDEX_BODY });
  return state;
}

function plannedState() {
  const state = indexedState();
  presentWorkflowProtocolCoachCue(state);
  observeProtocolAssistantMessage(state, workflowPlan());
  return state;
}

function readyCueState() {
  const state = plannedState();
  for (const uri of [...state.declaration.now, ...state.declaration.then]) {
    observeProtocolToolResult(state, { name: 'read', target: uri });
  }
  return state;
}

function writingReplacementReadyState() {
  const state = indexedState();
  presentWorkflowProtocolCoachCue(state);
  observeProtocolAssistantMessage(state, workflowPlan({
    primary: 'writing.pending',
    now: ['skill://writing-language-detection'],
    then: ['skill://omp-enhancer-workflows/references/writing-pending.md'],
  }));
  for (const uri of [...state.declaration.now, ...state.declaration.then]) {
    observeProtocolToolResult(state, { name: 'read', target: uri });
  }
  observeProtocolAssistantMessage(state, readyLine({
    primary: 'writing.pending',
    skillsLoaded: 'writing-language-detection',
  }));
  observeProtocolToolResult(state, { name: 'todo' });
  observeProtocolAssistantMessage(state, workflowPlan());
  for (const uri of [...state.declaration.now, ...state.declaration.then]) {
    observeProtocolToolResult(state, { name: 'read', target: uri });
  }
  return state;
}

function readyLine({
  primary = 'writing.en',
  addOns = 'none',
  skillsLoaded = 'writing-review',
  skillsUnavailable = 'none',
} = {}) {
  return `WORKFLOW READY | primary=${primary} | add-ons=${addOns} | skills-loaded=${skillsLoaded} | skills-unavailable=${skillsUnavailable}`;
}

function workflowPlan({
  primary = 'writing.en',
  now = [DOMAIN_URI],
  then = [ADD_ON_URI, PRIMARY_URI],
  crlf = false,
} = {}) {
  const newline = crlf ? '\r\n' : '\n';
  return [
    'WORKFLOW PLAN',
    `Primary: ${primary}`,
    'Add-ons: none',
    `Skills: ${now.join(', ') || 'none'}`,
    `Load order: NOW=[${now.join(', ') || 'none'}] THEN=[${then.join(', ') || 'none'}]`,
    'Actions:',
    '1. LOAD: Read declared RESOURCE EXTENSION batches and wait.',
    '2. COMMIT: Emit WORKFLOW READY and TODO only, then wait.',
    '3. SPLIT + EXECUTE: Follow the committed checkpoints.',
    '4. VERIFY: Integrate requested evidence.',
  ].join(newline);
}
