import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createWorkflowProtocolCoachState,
  observeProtocolAssistantMessage,
  observeProtocolSuppliedWorkflowIndex,
  observeProtocolTodoInput,
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
    /general\.subagent|agentic\.simple|writing\.|skill:\/\/|fan-?out|\bgate\b|\brouter\b|\bblock\b|\bretry\b|\bcontroller\b/iu,
  );

  observeProtocolAssistantMessage(state, 'I will prepare the declaration.');
  assert.notEqual(state.pendingCue, null);
  assert.equal(state.pendingCue?.kind, 'PRE_PLAN');
  assert.equal(state.pendingCue.silentRetries, 1);
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
  assert.ok(cue.content.length < 1_100, `PRE_READY must stay below 1100 characters, got ${cue.content.length}`);
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
    assert.equal(state.declaration, null, 'malformed PLAN never guesses a declaration');
    assert.ok(state.diagnostics.length > 0, 'malformed PLAN records a diagnostic');
    assert.notEqual(state.pendingCue, null, 'cue is preserved for format error recovery');
    assert.equal(state.formatErrorRetryCount, 1, 'retry count incremented');
  }
});

test('format error retry count caps at 2 and exhausts the cue', () => {
  const state = indexedState();
  presentWorkflowProtocolCoachCue(state);
  // First malformed attempt
  observeProtocolAssistantMessage(state, `Preface\n${workflowPlan()}`);
  assert.notEqual(state.pendingCue, null, 'cue preserved after first format error');
  assert.equal(state.formatErrorRetryCount, 1);
  // Second malformed attempt
  observeProtocolAssistantMessage(state, `Preface\n${workflowPlan()}`);
  assert.notEqual(state.pendingCue, null, 'cue preserved after second format error');
  assert.equal(state.formatErrorRetryCount, 2);
  // Third malformed attempt exhausts
  observeProtocolAssistantMessage(state, `Preface\n${workflowPlan()}`);
  assert.equal(state.pendingCue, null, 'cue discarded after retry exhaustion');
  assert.ok(state.diagnostics.some((item) => item.code === 'FORMAT_ERROR_RETRY_EXHAUSTED'));
});

test('correction prefix is injected when formatErrorRetryCount > 0', () => {
  const state = indexedState();
  presentWorkflowProtocolCoachCue(state);
  observeProtocolAssistantMessage(state, `Preface\n${workflowPlan()}`);
  assert.equal(state.formatErrorRetryCount, 1);
  const cue = presentWorkflowProtocolCoachCue(state);
  assert.match(cue.content, /FORMAT_CORRECTION/u);
});

test('small-model format correction variant is used for weak models', () => {
  const state = indexedState();
  presentWorkflowProtocolCoachCue(state);
  observeProtocolAssistantMessage(state, `Preface\n${workflowPlan()}`);
  const cue = presentWorkflowProtocolCoachCue(state, { provider: 'openai', id: 'mimo-v2.5' });
  assert.match(cue.content, /FORMAT:/u);
});

test('writing.pending timeout escalation queues WRITING_PENDING_ESCALATION cue', () => {
  const state = indexedState();
  presentWorkflowProtocolCoachCue(state);
  observeProtocolAssistantMessage(state, workflowPlan({
    primary: 'writing.pending',
    skills: [],
    now: [],
    then: [],
  }));
  assert.equal(state.declaration.primary, 'writing.pending');
  // Simulate timeout by backdating pendingStartedAt
  state.declaration.pendingStartedAt = Date.now() - 200_000;
  observeProtocolToolResult(state, { name: 'read', target: INDEX_URI });
  assert.ok(state.diagnostics.some((item) => item.code === 'WRITING_PENDING_TIMEOUT'));
  assert.equal(state.pendingCue?.kind, 'WRITING_PENDING_ESCALATION');
  const cue = presentWorkflowProtocolCoachCue(state);
  assert.match(cue.content, /writing\.pending escalation/iu);
});

test('normal assistant message without PLAN marker retries before discarding cue', () => {
  const state = indexedState();
  presentWorkflowProtocolCoachCue(state);
  observeProtocolAssistantMessage(state, 'I will prepare the declaration.');
  assert.notEqual(state.pendingCue, null);
  assert.equal(state.pendingCue?.kind, 'PRE_PLAN');
  assert.equal(state.pendingCue.silentRetries, 1);
  assert.equal(state.formatErrorDetected, false);
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

  const workTaskClear = structuredClone(state);
  observeProtocolToolCall(workTaskClear, { name: 'task', taskRoles: ['task'] });
  assert.equal(workTaskClear.pendingCue, null, 'a work task call clears PRE_DISPATCH');

  const planTaskNoClear = structuredClone(state);
  observeProtocolToolCall(planTaskNoClear, { name: 'task', taskRoles: ['plan'] });
  assert.notEqual(planTaskNoClear.pendingCue, null, 'a plan-only task call must NOT clear PRE_DISPATCH');

  const mixedTaskClear = structuredClone(state);
  observeProtocolToolCall(mixedTaskClear, { name: 'task', taskRoles: ['plan', 'task'] });
  assert.equal(mixedTaskClear.pendingCue, null, 'a mixed task call including work must clear PRE_DISPATCH');

  observeProtocolAssistantMessage(state, 'Native todo(op=init) rebase only; end/wait; same response has no task.');
  assert.notEqual(state.pendingCue, null, 'non-marker response retries instead of dropping cue');
  assert.equal(state.pendingCue?.kind, 'PRE_DISPATCH');
  assert.equal(state.pendingCue.silentRetries, 1);
  observeProtocolToolResult(state, { name: 'todo' });
  assert.equal(state.pendingCue?.kind, 'PRE_DISPATCH', 'todo result does not queue a second cue');
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

const CODE_DEV_URI = 'skill://omp-enhancer-workflows/references/code-dev.md';

function codeDevPlan() {
  return [
    'WORKFLOW PLAN',
    'Primary: code.dev',
    'Add-ons: none',
    `Skills: ${CODE_DEV_URI}`,
    `Load order: NOW=[${CODE_DEV_URI}] THEN=[none]`,
    'Actions:',
    '1. LOAD: Read declared resources and wait.',
    '2. COMMIT: Emit WORKFLOW READY and TODO only, then wait.',
    '3. SPLIT + EXECUTE: Follow the committed checkpoints.',
    '4. VERIFY: Integrate requested evidence.',
  ].join('\n');
}

function codeDevReadyState() {
  const state = indexedState();
  presentWorkflowProtocolCoachCue(state);
  observeProtocolAssistantMessage(state, codeDevPlan());
  for (const uri of [...state.declaration.now, ...state.declaration.then]) {
    observeProtocolToolResult(state, { name: 'read', target: uri });
  }
  observeProtocolAssistantMessage(
    state,
    'WORKFLOW READY | primary=code.dev | add-ons=none | skills-loaded=omp-enhancer-workflows/references/code-dev.md | skills-unavailable=none',
  );
  return state;
}

function dispatchStateWithDelegateTodo() {
  const state = codeDevReadyState();
  observeProtocolTodoInput(state, { itemsText: 'Delegate Agent=task do the work\nVERIFY integrate' });
  observeProtocolToolResult(state, { name: 'todo' });
  return state;
}

test('PRE_VERIFY fires once when all dispatched work tasks settle on a subagent-driven primary', () => {
  const state = dispatchStateWithDelegateTodo();
  assert.equal(state.pendingCue?.kind, 'PRE_DISPATCH');
  assert.equal(state.declaration.tasksDispatched, 0);

  observeProtocolToolCall(state, { name: 'task', taskRoles: ['task'] });
  assert.equal(state.declaration.tasksDispatched, 1);
  assert.equal(state.pendingCue, null, 'work task call clears PRE_DISPATCH');

  observeProtocolToolResult(state, { name: 'task' });
  assert.equal(state.declaration.tasksSettled, 1);
  assert.equal(state.pendingCue?.kind, 'PRE_VERIFY');

  const cue = presentWorkflowProtocolCoachCue(state);
  assert.equal(cue.kind, 'PRE_VERIFY');
  assert.match(cue.content, /OMP PROTOCOL COACH \(soft, VERIFY\)/u);
  assert.match(cue.content, /Deliveries settled[\s\S]*Main integrates[\s\S]*audit checkpoint/u);
  assert.match(cue.content, /MAIN REVIEW[\s\S]*final response reports evidence/u);
  assert.match(cue.content, /No block\/router\/gate\/retry\/authority\/choice/u);
  assert.equal(state.declaration.verifyCueQueued, true);

  // A second settled task must NOT re-queue PRE_VERIFY (one-shot per generation).
  observeProtocolToolCall(state, { name: 'task', taskRoles: ['task'] });
  observeProtocolToolResult(state, { name: 'task' });
  const second = presentWorkflowProtocolCoachCue(state);
  assert.equal(second.kind, 'PRE_VERIFY');
  assert.equal(state.declaration.verifyCueQueued, true);
});

test('a plan-only task neither counts toward tasksDispatched nor triggers PRE_VERIFY', () => {
  const state = dispatchStateWithDelegateTodo();
  observeProtocolToolCall(state, { name: 'task', taskRoles: ['plan'] });
  assert.equal(state.declaration.tasksDispatched, 0, 'plan-only task does not increment tasksDispatched');
  assert.notEqual(state.pendingCue, null, 'plan-only task does not clear PRE_DISPATCH');
  assert.equal(state.pendingCue.kind, 'PRE_DISPATCH');

  observeProtocolToolResult(state, { name: 'task' });
  assert.equal(state.declaration.tasksDispatched, 0, 'plan-only task does not increment tasksDispatched');
  assert.equal(state.pendingCue?.kind, 'PRE_DISPATCH', 'no PRE_VERIFY without dispatched work tasks');
});

test('a FAILED settled work task still fires PRE_VERIFY', () => {
  const state = dispatchStateWithDelegateTodo();
  observeProtocolToolCall(state, { name: 'task', taskRoles: ['task'] });
  assert.equal(state.declaration.tasksDispatched, 1);

  observeProtocolToolResult(state, { name: 'task', failed: true });
  assert.equal(state.declaration.tasksSettled, 1, 'failed results count as settled');
  assert.equal(state.pendingCue?.kind, 'PRE_VERIFY', 'PRE_VERIFY fires even on failed settlement');
  assert.equal(state.declaration.verifyCueQueued, true);
});

test('NO_DELEGATION_ROWS diagnostic fires when a subagent-driven TODO has no Delegate or fallback rows', () => {
  const state = codeDevReadyState();
  observeProtocolTodoInput(state, { itemsText: 'VERIFY integrate the result\nREPORT write summary' });
  assert.equal(state.declaration.todoHasDelegateRows, false);
  assert.equal(state.declaration.todoHasFallbackRows, false);

  observeProtocolToolResult(state, { name: 'todo' });
  assert.ok(
    state.diagnostics.some((item) => item.code === 'NO_DELEGATION_ROWS'),
    'NO_DELEGATION_ROWS fired on subagent-driven primary with no Delegate/fallback rows',
  );
});

test('NO_DELEGATION_ROWS is absent when the TODO contains a Delegate row', () => {
  const state = codeDevReadyState();
  observeProtocolTodoInput(state, { itemsText: 'Delegate Agent=task implement the fix\nVERIFY integrate' });
  assert.equal(state.declaration.todoHasDelegateRows, true);

  observeProtocolToolResult(state, { name: 'todo' });
  assert.ok(
    !state.diagnostics.some((item) => item.code === 'NO_DELEGATION_ROWS'),
    'NO_DELEGATION_ROWS absent when a Delegate row exists',
  );
});

test('NO_DELEGATION_ROWS is absent when the TODO contains a fallback row', () => {
  const state = codeDevReadyState();
  observeProtocolTodoInput(state, { itemsText: 'fallback=parent-owned action because no Agent available\nVERIFY integrate' });
  assert.equal(state.declaration.todoHasFallbackRows, true);

  observeProtocolToolResult(state, { name: 'todo' });
  assert.ok(
    !state.diagnostics.some((item) => item.code === 'NO_DELEGATION_ROWS'),
    'NO_DELEGATION_ROWS absent when a fallback row exists',
  );
});

test('NO_DELEGATION_ROWS is absent on a direct-simple primary', () => {
  const state = indexedState();
  presentWorkflowProtocolCoachCue(state);
  observeProtocolAssistantMessage(state, [
    'WORKFLOW PLAN',
    'Primary: agentic.simple',
    'Add-ons: none',
    `Skills: ${CODE_DEV_URI}`,
    `Load order: NOW=[${CODE_DEV_URI}] THEN=[none]`,
    'Actions:',
    '1. LOAD: Read declared resources and wait.',
    '2. COMMIT: Emit WORKFLOW READY and TODO only, then wait.',
    '3. SPLIT + EXECUTE: Follow the committed checkpoints.',
    '4. VERIFY: Integrate requested evidence.',
  ].join('\n'));
  for (const uri of [...state.declaration.now, ...state.declaration.then]) {
    observeProtocolToolResult(state, { name: 'read', target: uri });
  }
  observeProtocolAssistantMessage(
    state,
    'WORKFLOW READY | primary=agentic.simple | add-ons=none | skills-loaded=omp-enhancer-workflows/references/code-dev.md | skills-unavailable=none',
  );
  observeProtocolTodoInput(state, { itemsText: 'VERIFY integrate the result\nREPORT write summary' });
  observeProtocolToolResult(state, { name: 'todo' });
  assert.ok(
    !state.diagnostics.some((item) => item.code === 'NO_DELEGATION_ROWS'),
    'NO_DELEGATION_ROWS absent on direct-simple primary',
  );
});

test('serialization round-trip preserves the five new declaration fields', () => {
  const state = dispatchStateWithDelegateTodo();
  observeProtocolToolCall(state, { name: 'task', taskRoles: ['task'] });
  observeProtocolToolResult(state, { name: 'task' });
  assert.equal(state.declaration.verifyCueQueued, true);
  assert.equal(state.declaration.tasksDispatched, 1);
  assert.equal(state.declaration.tasksSettled, 1);
  assert.equal(state.declaration.todoHasDelegateRows, true);
  assert.equal(state.declaration.todoHasFallbackRows, false);

  const snapshot = serializeWorkflowProtocolCoachState(state);
  const restored = sanitizeWorkflowProtocolCoachState(snapshot);
  assert.equal(restored.declaration.verifyCueQueued, true);
  assert.equal(restored.declaration.tasksDispatched, 1);
  assert.equal(restored.declaration.tasksSettled, 1);
  assert.equal(restored.declaration.todoHasDelegateRows, true);
  assert.equal(restored.declaration.todoHasFallbackRows, false);
  assert.deepEqual(serializeWorkflowProtocolCoachState(restored), snapshot);
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

// ── New behavior tests: gap-fix verification ──

test('empty-text assistant message preserves pending cue', () => {
  const state = indexedState();
  presentWorkflowProtocolCoachCue(state);
  assert.equal(state.pendingCue?.kind, 'PRE_PLAN');
  // Empty text (tool-only turn) should NOT clear the cue
  observeProtocolAssistantMessage(state, '');
  assert.equal(state.pendingCue?.kind, 'PRE_PLAN');
  assert.equal(state.pendingCue.silentRetries, 0);
});

test('silent retry twice then exhaust drops cue with diagnostic', () => {
  const state = indexedState();
  presentWorkflowProtocolCoachCue(state);
  assert.equal(state.pendingCue?.kind, 'PRE_PLAN');

  // First non-marker response: retry
  observeProtocolAssistantMessage(state, 'Thinking about the plan...');
  assert.equal(state.pendingCue?.kind, 'PRE_PLAN');
  assert.equal(state.pendingCue.silentRetries, 1);
  assert.ok(state.diagnostics.some((d) => d.code === 'PRE_PLAN_IGNORED'));

  // Second: retry again
  observeProtocolAssistantMessage(state, 'Still thinking...');
  assert.equal(state.pendingCue?.kind, 'PRE_PLAN');
  assert.equal(state.pendingCue.silentRetries, 2);

  // Third: exhausted
  observeProtocolAssistantMessage(state, 'One more thought...');
  assert.equal(state.pendingCue, null);
  assert.ok(state.diagnostics.some((d) => d.code === 'PRE_PLAN_IGNORED_EXHAUSTED'));
});

test('LOAD_STALL_ESCALATION fires after timeout with missing URI list', () => {
  const state = indexedState();
  presentWorkflowProtocolCoachCue(state);
  observeProtocolAssistantMessage(state, workflowPlan());
  assert.ok(state.declaration);
  // Backdate startedAt to exceed timeout
  state.declaration.startedAt = Date.now() - 200_000;
  // Settle some but not all URIs — leave DOMAIN_URI unsettled
  observeProtocolToolResult(state, { name: 'read', target: PRIMARY_URI });
  assert.equal(state.declaration.stallEscalationQueued, true);
  assert.ok(state.diagnostics.some((d) => d.code === 'DECLARATION_LOADS_STALLED'));
  const cue = presentWorkflowProtocolCoachCue(state);
  assert.equal(cue.kind, 'LOAD_STALL_ESCALATION');
  assert.match(cue.content, /Missing:/);
  assert.match(cue.content, new RegExp(DOMAIN_URI));
  // Fires only once
  state.pendingCue = { kind: 'LOAD_STALL_ESCALATION', generation: 0, key: 'x', timestamp: 0, silentRetries: 0 };
  observeProtocolToolResult(state, { name: 'read', target: PRIMARY_URI });
  assert.equal(state.declaration.stallEscalationQueued, true);
});

test('rejection hint is appended to cue and cleared on acceptance', () => {
  const state = readyCueState();
  observeProtocolAssistantMessage(state, readyLine({ primary: 'writing.zh' }));
  assert.equal(state.rejectionHint, 'READY_PRIMARY_MISMATCH');
  const cue = presentWorkflowProtocolCoachCue(state);
  assert.match(cue.content, /LAST REJECTION: READY_PRIMARY_MISMATCH/);
  // Good READY clears hint
  observeProtocolAssistantMessage(state, readyLine());
  assert.equal(state.rejectionHint, null);
});

test('zero-task PRE_VERIFY fires after cadence settled results', () => {
  const state = readyCueState();
  state.declaration.tasksDispatched = 0;
  state.declaration.todoObserved = true;
  state.declaration.readyObserved = true;
  state.declaration.todoHasFallbackRows = true;
  state.declaration.todoHasFallbackRows = true;
  // Send 8 settled non-task results
  for (let i = 0; i < 8; i++) {
    observeProtocolToolResult(state, { name: 'read', target: `skill://test-${i}` });
  }
  assert.equal(state.declaration.verifyCueQueued, true);
  assert.equal(state.pendingCue?.kind, 'PRE_VERIFY');
});

test('stability cue defers when pendingCue exists instead of dropping', () => {
  const state = readyCueState();
  state.declaration.todoObserved = true;
  state.declaration.tasksDispatched = 1;
  // Queue a different cue first
  state.pendingCue = { kind: 'PRE_DISPATCH', generation: 1, key: 'x', timestamp: 0, silentRetries: 0 };
  // Send 8 settled results — cadence reached but pendingCue blocks emission
  for (let i = 0; i < 8; i++) {
    observeProtocolToolResult(state, { name: 'read', target: `skill://test-${i}` });
  }
  assert.equal(state.declaration.stabilityCuesEmitted, 0, 'stability cue not emitted while pending');
  assert.equal(state.declaration.toolResultsSinceStabilityCue, 8, 'counter not reset');
  // Clear the pending cue
  state.pendingCue = null;
  // Next settled result triggers emission
  observeProtocolToolResult(state, { name: 'read', target: 'skill://test-next' });
  assert.equal(state.declaration.stabilityCuesEmitted, 1);
  assert.equal(state.pendingCue?.kind, 'EXECUTE_STABILITY');
});

test('writing.pending escalation fires only once', () => {
  const state = indexedState();
  presentWorkflowProtocolCoachCue(state);
  observeProtocolAssistantMessage(state, workflowPlan({ primary: 'writing.pending' }));
  state.declaration.pendingStartedAt = Date.now() - 200_000;
  // First settled result triggers escalation
  observeProtocolToolResult(state, { name: 'read', target: PRIMARY_URI });
  assert.equal(state.declaration.pendingEscalationQueued, true);
  assert.equal(state.pendingCue?.kind, 'WRITING_PENDING_ESCALATION');
  // Second settled result does NOT re-escalate
  state.pendingCue = null;
  observeProtocolToolResult(state, { name: 'read', target: ADD_ON_URI });
  assert.equal(state.pendingCue, null);
});

test('serialization round-trip preserves all new fields', () => {
  const state = indexedState();
  presentWorkflowProtocolCoachCue(state);
  state.rejectionHint = 'READY_PRIMARY_MISMATCH';
  state.toolResultsBeforeIndex = 3;
  state.bootstrapCueQueued = true;
  state.toolErrorCounters = { read: 2, bash: 0 };
  state.formatErrorDetected = true;
  state.formatErrorRetryCount = 1;
  const serialized = serializeWorkflowProtocolCoachState(state);
  const restored = sanitizeWorkflowProtocolCoachState(serialized);
  assert.equal(restored.rejectionHint, 'READY_PRIMARY_MISMATCH');
  assert.equal(restored.toolResultsBeforeIndex, 3);
  assert.equal(restored.bootstrapCueQueued, true);
  assert.deepEqual(restored.toolErrorCounters, { read: 2, bash: 0 });
  assert.equal(restored.formatErrorDetected, true);
  assert.equal(restored.formatErrorRetryCount, 1);
});

test('normalized URI matching accepts trailing slash and case variants', () => {
  const state = createWorkflowProtocolCoachState();
  // Read with trailing slash
  observeProtocolToolResult(state, { name: 'read', target: 'skill://omp-enhancer-workflows/', body: INDEX_BODY });
  assert.equal(state.indexObserved, true);
  assert.equal(state.pendingCue?.kind, 'PRE_PLAN');
});

test('INDEX_BOOTSTRAP fires after 4 non-index settled results when index not observed', () => {
  const state = createWorkflowProtocolCoachState();
  assert.equal(state.indexObserved, false);
  assert.equal(state.declaration, null);
  for (let i = 0; i < 4; i++) {
    observeProtocolToolResult(state, { name: 'read', target: `skill://other-${i}` });
  }
  assert.equal(state.bootstrapCueQueued, true);
  assert.ok(state.diagnostics.some((d) => d.code === 'INDEX_NOT_READ'));
  const cue = presentWorkflowProtocolCoachCue(state);
  assert.equal(cue.kind, 'INDEX_BOOTSTRAP');
  assert.match(cue.content, /skill:\/\/omp-enhancer-workflows/);
});
