import {
  DELEGATION_COMPILE_RULE,
  DELEGATED_TODO_TEMPLATE,
  DIRECT_FALLBACK_REASONS,
  NATIVE_TASK_PREFIX_TEMPLATE,
  TODO_REBASE_REASONS_COMPACT,
} from './workflows/staged-contract.js';
import { workflowCatalog } from './workflows/catalog.js';
import {
  buildToolCallReprimeSection,
  buildToolErrorEscalationSection,
  shouldPrimeToolCalls,
} from './model-toolcall-priming.js';

const COACH_STATE_VERSION = 2;
const MAX_OBSERVED_TEXT_BYTES = 64 * 1024;
const MAX_DIAGNOSTICS = 16;
const INDEX_URI = 'skill://omp-enhancer-workflows';
const CUE_KINDS = new Set(['PRE_PLAN', 'PRE_READY', 'PRE_DISPATCH', 'PRE_VERIFY', 'EXECUTE_STABILITY', 'TOOL_ERROR_RECOVERY', 'TOOL_ERROR_ESCALATION', 'WRITING_PENDING_ESCALATION', 'LOAD_STALL_ESCALATION', 'INDEX_BOOTSTRAP']);
export const STABILITY_CUE_TOOL_RESULT_CADENCE = 8;
export const STABILITY_CUE_MAX_PER_TASK = 20;
const PENDING_TIMEOUT_MS = 180_000;
const URI_PATTERN = /^skill:\/\/[A-Za-z0-9._~!$&'()*+:=@%/-]+$/u;

const CUE_CONTENT = Object.freeze({
  PRE_PLAN: [
    'OMP PROTOCOL COACH (soft, DECLARE)',
    "CONTINUE PROJECT: Main's exact index read/supply initiated this path.",
    'DIRECT only = verbatim no-judgment field/heading lookup.',
    'Read-only, small, or comparison cannot downgrade this started PROJECT.',
    'Main autonomously selects from the loaded index one matched exact Primary; only when no row matches use Primary none.',
    'Next visible response byte 0 WORKFLOW PLAN:',
    '1. LOAD: declare exact resource URIs, load in order, wait.',
    '2. COMMIT: READY + detailed TODO only; end/wait.',
    '3. SPLIT + EXECUTE: apply loaded checkpoints to current Agents and dependency order; Delegate or record one permitted fallback.',
    '4. VERIFY: parent integration and acceptance evidence.',
    'Advisory only; selection and authority remain Main/native.',
  ].join('\n'),
  PRE_READY: [
    'OMP PROTOCOL COACH (soft)',
    'byte 0 WORKFLOW READY; copy. Same response: native todo(op=init) only; end/wait.',
    DELEGATION_COMPILE_RULE,
    'EACH MATCHED DELEGATE items[] STRING MUST USE THE FILLED FORM OF:',
    DELEGATED_TODO_TEMPLATE,
    'Filled workflow excludes sentinel `none`; `Add-ons=none`=>`workflow=Primary` only.',
    'Fill every placeholder; checkpoint=complete runnable one-line. Ban role/step shorthand/summary label/literal `Delegate step-task:`. Empty Skills=>`skills=none`, not blank/omitted.',
    'TODO>=2: 1 filled Delegate + 1 separate parent-owned integration/VERIFY.',
    'No choice/authority/gate',
  ].join('\n'),
  PRE_DISPATCH: [
    'OMP PROTOCOL COACH (soft, SPLIT)',
    'SELF-CHECK IF AND ONLY IF all hold: loaded `subagent-driven`; Main independently confirms complete input + safe checkpoint + visible matching Agent; Main chose Delegate; no permitted fallback; committed TODO lacks this filled row:',
    DELEGATED_TODO_TEMPLATE,
    'Then native todo(op=init) rebase only, never op=done; end/wait; same response no task.',
    'Otherwise direct-simple, parent-only, or permitted fallback: ignore self-check and generate no `task`.',
    'LATER NATURAL RESPONSE: only if filled committed row still exists: explicitly copy row Agent to item `agent` despite default match; nonempty top-level `context`; task byte 0:',
    NATIVE_TASK_PREFIX_TEMPLATE,
    'Copy literal `skills=none` unchanged, never empty. Complete terminal delivery; status/reference-only incomplete. No accepted repair finding=>resolve TODO, no `task`.',
    'No block/router/gate/retry/authority/choice.',
  ].join('\n'),
  PRE_VERIFY: [
    'OMP PROTOCOL COACH (soft, VERIFY)',
    'Deliveries settled. Main integrates the current tree, runs the focused verification named by the loaded card, and dispatches the card audit checkpoint (reviewer or domain auditor) with the bounded diff and evidence covering the complete change, including Main-authored edits, or records fallback=<one matched permitted limitation> per skipped checkpoint.',
    'Then MAIN REVIEW of the integrated result; a substantive code change ends without the named audit only behind a recorded Agent-unavailability fallback; final response reports evidence, dispositions, and limitations.',
    'No block/router/gate/retry/authority/choice.',
  ].join('\n'),
  WRITING_PENDING_ESCALATION: [
    'OMP PROTOCOL COACH (soft, writing.pending escalation):',
    'The writing.pending state has not transitioned to writing.zh or writing.en after the language read.',
    'If the target body language is now known, emit a replacement WORKFLOW PLAN with Primary=writing.zh or writing.en.',
    'If still unknown, ask the user directly. Do not remain in pending indefinitely.',
    'Advisory only; no block/router/gate/retry/authority/choice.',
  ].join('\n'),
  INDEX_BOOTSTRAP: [
    'OMP PROTOCOL COACH (soft, DISCOVER)',
    'The workflow index has not been read this task: PROJECT work starts by calling read with path=skill://omp-enhancer-workflows (only that read; end the response and wait).',
    'If this task is a DIRECT verbatim no-judgment lookup, ignore this cue.',
    'Advisory only; no block/router/gate/retry/authority/choice.',
  ].join('\n'),
});

const SILENT_RETRY_PREFIX = 'MISSING_STEP (soft): your previous response did not include the pending workflow marker below. It is still required — emit it at byte 0 of your next response, then continue.';
const SMALL_MODEL_SILENT_RETRY_PREFIX = 'MISSING STEP: your last reply skipped the marker below. Put it at byte 0 of your next reply.';

const SMALL_MODEL_CUE_VARIANTS = Object.freeze({
  PRE_PLAN: '1. Read skill://omp-enhancer-workflows. 2. Pick one Primary workflow. 3. Next reply byte 0: WORKFLOW PLAN with Primary, Add-ons, Skills, Load order NOW=[...] THEN=[...], Actions 1-4. 4. Same reply: read only the NOW URIs, then wait. If a loaded skill reveals more exact skill:// URIs, start a reply with RESOURCE EXTENSION | source=... | reads=... and read them once. Advisory only; authority remains Main/native.',
  PRE_READY: '1. After all resources load, write WORKFLOW READY at byte 0. 2. Fill primary, add-ons, skills-loaded, skills-unavailable. 3. Init TODO and wait. No choice/authority/gate.',
  PRE_DISPATCH: '1. Copy each TODO Delegate row into a native task item: agent = the row Agent. 2. Task byte 0 [workflow=... step=... todo=<the row checkpoint, verbatim> skills=...]. 3. Run independent tasks in one batch. No block/router/gate/retry/authority/choice.',
  PRE_VERIFY: '1. Check acceptance criteria against current tree. 2. Run focused tests. 3. Report paths, commands, evidence, and limitations. No block/router/gate/retry/authority/choice.',
  WRITING_PENDING_ESCALATION: '1. Read the target file (language only). 2. Chinese => new WORKFLOW PLAN with Primary=writing.zh; English => Primary=writing.en. 3. If unclear, ask the user. Advisory only.',
  INDEX_BOOTSTRAP: 'READ NOW: call read with path=skill://omp-enhancer-workflows. Only that read. Then wait. (Skip only for a DIRECT verbatim lookup.)',
});

const FORMAT_CORRECTION_PREFIX = [
  'FORMAT_CORRECTION (soft): your last PLAN/READY was not at byte 0 or had a field error.',
  'FIX: start your next response with the marker at the very first character (no preamble, no greeting).',
  'Use the exact template fields: Primary, Add-ons, Skills, Load order: NOW=[...] THEN=[...], Actions: 1-4.',
  'Advisory only; this corrects format, not content.',
].join('\n');

const SMALL_MODEL_FORMAT_CORRECTION = 'FORMAT: Start next response at byte 0 with WORKFLOW PLAN or WORKFLOW READY. No preamble. Use exact fields: Primary, Add-ons, Skills, NOW/THEN, Actions 1-4.';

function normalizeUriTarget(value) {
  return String(value ?? '').trim().replace(/\/+$/u, '').toLowerCase();
}

export function createWorkflowProtocolCoachState() {
  return {
    schemaVersion: COACH_STATE_VERSION,
    indexObserved: false,
    indexCueQueued: false,
    generation: 0,
    replacementUsed: false,
    planMode: false,
    declaration: null,
    pendingCue: null,
    diagnostics: [],
    toolErrorCounters: {},
    model: null,
    formatErrorDetected: false,
    formatErrorRetryCount: 0,
    rejectionHint: null,
    toolResultsBeforeIndex: 0,
    bootstrapCueQueued: false,
  };
}

export function observeProtocolAssistantMessage(state, rawText = '') {
  if (!isCoachState(state)) return false;
  const before = JSON.stringify(state);
  const text = boundedText(rawText);
  if (!text) return false;
  const pendingAtStart = state.pendingCue;

  let preservePending = false;
  if (text) {
    observePlan(state, text);
    const extensionObservation = observeResourceExtension(state, text);
    const readyObservation = observeReady(state, text);
    preservePending = extensionObservation === 'late' || readyObservation === 'invalid';
  }

  const preserveOnFormatError = state.formatErrorDetected;
  state.formatErrorDetected = false;
  const isPhaseCue = pendingAtStart && ['PRE_PLAN', 'PRE_READY', 'PRE_DISPATCH', 'PRE_VERIFY'].includes(pendingAtStart.kind);
  if (pendingAtStart && state.pendingCue === pendingAtStart && !preservePending && !preserveOnFormatError) {
    if (isPhaseCue && (pendingAtStart.silentRetries ?? 0) < 2) {
      pendingAtStart.silentRetries = (pendingAtStart.silentRetries ?? 0) + 1;
      addDiagnostic(state, `${pendingAtStart.kind}_IGNORED`);
    } else {
      if (isPhaseCue) {
        addDiagnostic(state, `${pendingAtStart.kind}_IGNORED_EXHAUSTED`);
      }
      state.pendingCue = null;
    }
  } else if (preserveOnFormatError && state.pendingCue === pendingAtStart) {
    state.formatErrorRetryCount += 1;
    if (state.formatErrorRetryCount > 2) {
      addDiagnostic(state, 'FORMAT_ERROR_RETRY_EXHAUSTED');
      state.pendingCue = null;
      state.formatErrorRetryCount = 0;
    }
  }
  return JSON.stringify(state) !== before;
}

function maybeQueueVerifyCue(state) {
  const declaration = state.declaration;
  if (!declaration) return;
  if (!declaration.readyObserved || !declaration.todoObserved) return;
  if (declaration.verifyCueQueued) return;
  if (state.planMode) return;
  if (declaration.tasksDispatched <= 0) return;
  if (declaration.tasksSettled < declaration.tasksDispatched) return;
  declaration.verifyCueQueued = true;
  queueCue(state, 'PRE_VERIFY', state.generation);
}

export function observeProtocolToolResult(state, {
  name = '',
  target = '',
  body = '',
  failed = false,
  pending = false,
  model = null,
} = {}) {
  if (!isCoachState(state)) return;
  const toolName = String(name).trim().toLowerCase();
  const exactTarget = String(target).trim();
  const isSettled = !pending;

  if (
    toolName === 'read'
    && normalizeUriTarget(exactTarget) === INDEX_URI
    && !failed
    && isSettled
    && hasExactIndexIdentity(body)
  ) {
    markWorkflowIndexObserved(state);
  }

  const declaration = state.declaration;
  if (toolName === 'read' && declaration && isSettled) {
    const matched = requiredUris(declaration).find((uri) => normalizeUriTarget(uri) === normalizeUriTarget(exactTarget));
    if (matched) {
      declaration.returned = unique([...declaration.returned, matched]);
      maybeQueueReadyCue(state);
    }
  }

  if (toolName === 'task' && declaration && isSettled) {
    declaration.tasksSettled += 1;
    maybeQueueVerifyCue(state);
  }

  if (
    declaration
    && isSettled
    && !state.planMode
    && declaration.todoObserved
    && declaration.tasksDispatched > 0
    && !declaration.verifyCueQueued
    && declaration.stabilityCuesEmitted < STABILITY_CUE_MAX_PER_TASK
  ) {
    declaration.toolResultsSinceStabilityCue += 1;
    if (declaration.toolResultsSinceStabilityCue >= STABILITY_CUE_TOOL_RESULT_CADENCE) {
      if (!state.pendingCue) {
        declaration.toolResultsSinceStabilityCue = 0;
        declaration.stabilityCuesEmitted += 1;
        queueCue(state, 'EXECUTE_STABILITY', declaration.generation);
      }
      // When pendingCue exists: counter NOT reset, next settled result retries
    }
  }

  // ── Error recovery tracking for small models ──
  if (isSettled) {
    if (failed) {
      state.toolErrorCounters[name] = (state.toolErrorCounters[name] || 0) + 1;
    } else if (toolName) {
      state.toolErrorCounters[name] = 0;
    }

    if (failed && shouldPrimeToolCalls(model) && toolName) {
      const counter = state.toolErrorCounters[name];
      if (counter === 1 && !state.pendingCue) {
        queueCue(state, 'TOOL_ERROR_RECOVERY', state.generation);
      } else if (counter === 3 && !state.pendingCue) {
        queueCue(state, 'TOOL_ERROR_ESCALATION', state.generation);
      }
    }
  }

  // ── writing.pending timeout escalation ──
  if (
    declaration
    && declaration.primary === 'writing.pending'
    && declaration.pendingStartedAt
    && isSettled
    && !declaration.verifyCueQueued
    && !declaration.pendingEscalationQueued
  ) {
    const elapsed = Date.now() - declaration.pendingStartedAt;
    if (elapsed > PENDING_TIMEOUT_MS) {
      addDiagnostic(state, 'WRITING_PENDING_TIMEOUT');
      queueCue(state, 'WRITING_PENDING_ESCALATION', declaration.generation);
      declaration.pendingEscalationQueued = true;
    }
  }

  // ── Bootstrap: index never read ──
  if (isSettled && !state.indexObserved && !state.declaration && !state.bootstrapCueQueued) {
    state.toolResultsBeforeIndex += 1;
    if (state.toolResultsBeforeIndex >= 4) {
      state.bootstrapCueQueued = true;
      addDiagnostic(state, 'INDEX_NOT_READ');
      queueCue(state, 'INDEX_BOOTSTRAP', state.generation);
    }
  }

  // ── Declaration-stall escalation ──
  if (isSettled && declaration && !declaration.readyObserved && !declarationLoadsSettled(declaration) && !declaration.stallEscalationQueued && Date.now() - (declaration.startedAt ?? 0) > PENDING_TIMEOUT_MS) {
    declaration.stallEscalationQueued = true;
    addDiagnostic(state, 'DECLARATION_LOADS_STALLED');
    queueCue(state, 'LOAD_STALL_ESCALATION', declaration.generation);
  }

  // ── Zero-task PRE_VERIFY ──
  if (isSettled && declaration && declaration.readyObserved && declaration.todoObserved && declaration.tasksDispatched === 0 && !declaration.verifyCueQueued && !state.planMode) {
    declaration.zeroTaskToolResults = (declaration.zeroTaskToolResults ?? 0) + 1;
    if (declaration.zeroTaskToolResults >= STABILITY_CUE_TOOL_RESULT_CADENCE) {
      declaration.verifyCueQueued = true;
      queueCue(state, 'PRE_VERIFY', declaration.generation);
    }
  }

  if (toolName !== 'todo' || !declaration || !isSettled || failed || !declaration.readyObserved) {
    return;
  }
  declaration.todoObserved = true;
  const primaryId = declaration.primary;
  const primaryDef = primaryId ? workflowCatalog[primaryId] : null;
  const delegationDefault = primaryDef?.delegationDefault ?? 'subagent-driven';
  if (delegationDefault === 'subagent-driven' && !declaration.todoHasDelegateRows && !declaration.todoHasFallbackRows) {
    addDiagnostic(state, 'NO_DELEGATION_ROWS');
  }
  if (declaration.primary === 'writing.pending' || declaration.dispatchCueQueued || state.planMode) return;
  declaration.dispatchCueQueued = true;
  queueCue(state, 'PRE_DISPATCH', declaration.generation);
}

export function observeProtocolSuppliedWorkflowIndex(state) {
  if (!isCoachState(state)) return;
  markWorkflowIndexObserved(state);
}

export function observeProtocolToolCall(state, { name = '', taskRoles = [] } = {}) {
  if (!isCoachState(state)) return;
  if (String(name).trim().toLowerCase() === 'task') {
    // Only clear PRE_DISPATCH for work tasks, not plan review tasks.
    // A plan-only task (agent=plan) consumes the plan-review checkpoint
    // but not the dispatch cue — Main still needs the reminder when
    // dispatching actual work tasks after plan disposition.
    const isPlanOnly = taskRoles.length > 0 && taskRoles.every((r) => r === 'plan');
    if (!isPlanOnly) {
      clearCue(state, 'PRE_DISPATCH');
      if (state.declaration) {
        state.declaration.tasksDispatched += 1;
      }
    }
  }
}

export function observeProtocolTodoInput(state, { itemsText = '' } = {}) {
  if (!isCoachState(state)) return;
  const declaration = state.declaration;
  if (!declaration) return;
  declaration.todoHasDelegateRows = /Delegate Agent=/u.test(itemsText);
  declaration.todoHasFallbackRows = /fallback=/u.test(itemsText);
}

export function presentWorkflowProtocolCoachCue(state, model = null) {
  if (!isCoachState(state) || !state.pendingCue) return null;
  if (state.pendingCue.kind === 'EXECUTE_STABILITY') {
    const declaration = state.declaration;
    if (!declaration) return null;
    const pendingTimestamp = state.pendingCue.timestamp;
    if (shouldPrimeToolCalls(model)) {
      const workflow = [declaration.primary, ...declaration.addOns].filter(Boolean).join(',') || 'none';
      const content = [
        'OMP PROTOCOL COACH (soft, EXECUTE)',
        `EXECUTE: workflow=${workflow}. 1. Keep TODO Delegate rows stable; copy row Agent to item agent. 2. Task byte 0 [workflow=... step=... todo=... skills=...]; verbatim checkpoint. 3. Rebase a row only when a permitted reason applies; never skip brief/input/checkpoint prep. No block/router/gate/retry/authority/choice.`,
      ].join('\n');
      state.pendingCue = null;
      return { kind: 'EXECUTE_STABILITY', content, timestamp: pendingTimestamp };
    }
    const workflow = [declaration.primary, ...declaration.addOns].filter(Boolean).join(',') || 'none';
    const delegation = declaration.todoHasDelegateRows
      ? 'delegated'
      : declaration.todoHasFallbackRows
        ? 'fallback recorded'
        : 'not recorded';
    const content = [
      'OMP PROTOCOL COACH (soft, EXECUTE)',
      `LONG-CONTEXT RE-PRIME for the active task: workflow=${workflow}; delegation=${delegation}; tasks settled ${declaration.tasksSettled}/${declaration.tasksDispatched}.`,
      'PHASE: you are in EXECUTE of DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY; project tools started only after the READY + TODO response ended and its results returned; do not re-emit PLAN/READY or re-load declared resources.',
      `TODO: keep committed Delegate rows stable; copy row Agent to item \`agent\`; task byte 0 \`[workflow=... step=... todo=... skills=...]\`; verbatim checkpoint; nonempty top-level \`context\`; rebasing a row needs one of ${TODO_REBASE_REASONS_COMPACT}; never self-induce a fallback by skipping brief, input, or checkpoint preparation.`,
      `DELEGATION: direct work exists only on DIRECT, \`agentic.simple\`, or behind one recorded fallback limited to ${DIRECT_FALLBACK_REASONS}; size, latency, read-only output, overhead, or no explicit delegation request are not fallbacks.`,
      'AUDIT: the card audit checkpoint (reviewer or domain auditor) reviews the complete change, including Main-authored edits, before the final response; it falls back only on recorded Agent unavailability.',
      'After all tasks settle: integrate the current tree, run the card\'s focused verification, write MAIN REVIEW, then final response.',
      'No block/router/gate/retry/authority/choice.',
    ].join('\n');
    state.pendingCue = null;
    return { kind: 'EXECUTE_STABILITY', content, timestamp: pendingTimestamp };
  }
  if (state.pendingCue.kind === 'LOAD_STALL_ESCALATION') {
    const declaration = state.declaration;
    const pendingTimestamp = state.pendingCue.timestamp;
    if (!declaration) { state.pendingCue = null; return null; }
    const missing = requiredUris(declaration).filter((uri) => !declaration.returned.includes(uri));
    const content = shouldPrimeToolCalls(model)
      ? `STALLED LOADS: missing ${missing.join(', ') || 'none'}. Read each now, or mark unavailable and write WORKFLOW READY at byte 0.`
      : [
          'OMP PROTOCOL COACH (soft, load-stall escalation):',
          `Declared workflow resources have not returned for over ${Math.round(PENDING_TIMEOUT_MS / 1000)}s. Missing: ${missing.join(', ') || 'none'}.`,
          'Either read each missing exact URI now, or treat it as unavailable, list it under skills-unavailable, and emit WORKFLOW READY at byte 0.',
          'Advisory only; no block/router/gate/retry/authority/choice.',
        ].join('\n');
    state.pendingCue = null;
    return { kind: 'LOAD_STALL_ESCALATION', content, timestamp: pendingTimestamp };
  }
  // Error recovery cues — event-driven, clear after presenting
  if (state.pendingCue.kind === 'TOOL_ERROR_RECOVERY' || state.pendingCue.kind === 'TOOL_ERROR_ESCALATION') {
    const kind = state.pendingCue.kind;
    const pendingTimestamp = state.pendingCue.timestamp;
    const content = kind === 'TOOL_ERROR_RECOVERY'
      ? buildToolCallReprimeSection()
      : buildToolErrorEscalationSection();
    state.pendingCue = null;
    return { kind, content, timestamp: pendingTimestamp };
  }
  // Phase cues with small-model variant support for capable models
  const rawContent = CUE_CONTENT[state.pendingCue.kind];
  if (!rawContent) return null;
  let content = shouldPrimeToolCalls(model)
    ? (SMALL_MODEL_CUE_VARIANTS[state.pendingCue.kind] ?? rawContent)
    : rawContent;
  if (state.formatErrorRetryCount > 0) {
    content = (shouldPrimeToolCalls(model) ? SMALL_MODEL_FORMAT_CORRECTION : FORMAT_CORRECTION_PREFIX) + '\n' + content;
  }
  if (state.pendingCue.silentRetries > 0) {
    const prefix = shouldPrimeToolCalls(model) ? SMALL_MODEL_SILENT_RETRY_PREFIX : SILENT_RETRY_PREFIX;
    content = prefix + '\n' + content;
  }
  if (state.rejectionHint) {
    const hintSuffix = shouldPrimeToolCalls(model)
      ? `PROBLEM: ${state.rejectionHint}. Fix it. Marker at byte 0.`
      : `LAST REJECTION: ${state.rejectionHint}. Correct that field and re-emit the marker at byte 0.`;
    content = content + '\n' + hintSuffix;
  }
  return {
    kind: state.pendingCue.kind,
    content,
    timestamp: state.pendingCue.timestamp,
  };
}

export function serializeWorkflowProtocolCoachState(state) {
  const safe = sanitizeWorkflowProtocolCoachState(state);
  return {
    schemaVersion: COACH_STATE_VERSION,
    indexObserved: safe.indexObserved,
    indexCueQueued: safe.indexCueQueued,
    generation: safe.generation,
    replacementUsed: safe.replacementUsed,
    planMode: safe.planMode === true,
    declaration: safe.declaration ? serializeDeclaration(safe.declaration) : null,
    pendingCue: safe.pendingCue ? { ...safe.pendingCue } : null,
    diagnostics: safe.diagnostics.map((item) => ({ ...item })),
    toolErrorCounters: { ...safe.toolErrorCounters },
    formatErrorDetected: safe.formatErrorDetected,
    formatErrorRetryCount: safe.formatErrorRetryCount,
    toolResultsBeforeIndex: safe.toolResultsBeforeIndex,
    bootstrapCueQueued: safe.bootstrapCueQueued,
    rejectionHint: safe.rejectionHint,
  };
}

export function sanitizeWorkflowProtocolCoachState(value = {}) {
  const state = createWorkflowProtocolCoachState();
  if (!isRecord(value) || value.schemaVersion !== COACH_STATE_VERSION) return state;
  state.indexObserved = value.indexObserved === true;
  state.indexCueQueued = value.indexCueQueued === true;
  state.generation = nonnegativeInteger(value.generation);
  state.replacementUsed = value.replacementUsed === true;
  state.planMode = value.planMode === true;
  state.formatErrorDetected = typeof value.formatErrorDetected === 'boolean' ? value.formatErrorDetected : false;
  state.formatErrorRetryCount = Number.isInteger(value.formatErrorRetryCount) ? Math.max(0, value.formatErrorRetryCount) : 0;
  state.toolErrorCounters = {};
  if (isRecord(value.toolErrorCounters)) {
    for (const [key, count] of Object.entries(value.toolErrorCounters)) {
      if (Number.isInteger(count) && count >= 0) state.toolErrorCounters[key] = count;
    }
  }
  state.toolResultsBeforeIndex = nonnegativeInteger(value.toolResultsBeforeIndex);
  state.bootstrapCueQueued = value.bootstrapCueQueued === true;
  state.rejectionHint = typeof value.rejectionHint === 'string' && value.rejectionHint !== '' ? value.rejectionHint : null;
  state.declaration = sanitizeDeclaration(value.declaration);
  if (state.declaration) state.generation = Math.max(state.generation, state.declaration.generation);
  state.pendingCue = sanitizePendingCue(value.pendingCue);
  state.diagnostics = Array.isArray(value.diagnostics)
    ? value.diagnostics.map(sanitizeDiagnostic).filter(Boolean).slice(-MAX_DIAGNOSTICS)
    : [];
  return state;
}

export function observeProtocolPlanMode(state, planMode = false) {
  if (!isCoachState(state)) return;
  state.planMode = planMode === true;
}

function markWorkflowIndexObserved(state) {
  state.indexObserved = true;
  if (!state.indexCueQueued && !state.declaration) {
    state.indexCueQueued = true;
    queueCue(state, 'PRE_PLAN', 0);
  }
}

function observePlan(state, text) {
  const offset = markerLineOffset(text, 'WORKFLOW PLAN');
  if (offset < 0) return;
  if (offset !== 0) {
    addDiagnostic(state, 'PLAN_NOT_BYTE_0');
    state.rejectionHint = 'PLAN_NOT_BYTE_0';
    state.formatErrorDetected = true;
    return;
  }
  const parsed = parsePlan(text);
  if (!parsed) {
    addDiagnostic(state, 'PLAN_MALFORMED');
    state.rejectionHint = 'PLAN_MALFORMED';
    state.formatErrorDetected = true;
    return;
  }
  if (!state.indexObserved) {
    addDiagnostic(state, 'PLAN_BEFORE_INDEX');
    state.rejectionHint = 'PLAN_BEFORE_INDEX';
    return;
  }

  if (!state.declaration) {
    state.formatErrorRetryCount = 0;
    acceptDeclaration(state, parsed);
    clearCue(state, 'PRE_PLAN');
    return;
  }

  const replacementAllowed = (
    !state.replacementUsed
    && state.declaration.primary === 'writing.pending'
    && state.declaration.readyObserved
    && state.declaration.todoObserved
    && ['writing.en', 'writing.zh'].includes(parsed.primary)
  );
  if (!replacementAllowed) {
    addDiagnostic(state, 'PLAN_REPLACEMENT_REJECTED');
    state.rejectionHint = 'PLAN_REPLACEMENT_REJECTED';
    return;
  }
  state.replacementUsed = true;
  acceptDeclaration(state, parsed);
}

function observeResourceExtension(state, text) {
  const offset = markerLineOffset(text, 'RESOURCE EXTENSION');
  if (offset < 0) return 'none';
  if (offset !== 0) {
    addDiagnostic(state, 'RESOURCE_EXTENSION_NOT_BYTE_0');
    return 'invalid';
  }
  const declaration = state.declaration;
  const finalThen = declaration?.then.at(-1);
  if (
    declaration
    && (
      declaration.readyCueQueued
      || (finalThen && declaration.returned.includes(finalThen))
    )
  ) {
    addDiagnostic(state, 'RESOURCE_EXTENSION_LATE');
    return 'late';
  }
  const match = text.match(/^RESOURCE EXTENSION[ \t]*\|[ \t]*source=([^|\r\n]+?)[ \t]*\|[ \t]*reads=(?:\[([^\]\r\n]+)\]|([^\r\n]+))[ \t]*(?:\r?\n|$)/u);
  const source = match?.[1]?.trim() ?? '';
  const reads = parseUriList(match?.[2] ?? match?.[3] ?? '');
  if (
    !declaration
    || !URI_PATTERN.test(source)
    || !reads
    || reads.length === 0
    || !(
      declaration.returned.includes(source)
      || (declaration.skills.includes(source) && !declaration.now.includes(source))
    )
  ) {
    addDiagnostic(state, 'RESOURCE_EXTENSION_MALFORMED');
    return 'invalid';
  }
  declaration.extensions = unique([...declaration.extensions, ...reads]);
  maybeQueueReadyCue(state);
  return 'accepted';
}

function observeReady(state, text) {
  const offset = markerLineOffset(text, 'WORKFLOW READY');
  if (offset < 0) return 'none';
  if (offset !== 0) {
    addDiagnostic(state, 'READY_NOT_BYTE_0');
    state.rejectionHint = 'READY_NOT_BYTE_0';
    state.formatErrorDetected = true;
    return 'invalid';
  }
  const ready = parseReady(text);
  if (!ready) {
    addDiagnostic(state, 'READY_MALFORMED');
    state.rejectionHint = 'READY_MALFORMED';
    state.formatErrorDetected = true;
    return 'invalid';
  }
  if (!state.declaration) {
    addDiagnostic(state, 'READY_BEFORE_PLAN');
    state.rejectionHint = 'READY_BEFORE_PLAN';
    return 'invalid';
  }
  if (!declarationLoadsSettled(state.declaration)) {
    addDiagnostic(state, 'READY_BEFORE_LOADS_SETTLED');
    state.rejectionHint = 'READY_BEFORE_LOADS_SETTLED';
    return 'invalid';
  }
  if (ready.primary !== state.declaration.primary) {
    addDiagnostic(state, 'READY_PRIMARY_MISMATCH');
    state.rejectionHint = 'READY_PRIMARY_MISMATCH';
    return 'invalid';
  }
  if (!sameStrings(ready.addOns, state.declaration.addOns)) {
    addDiagnostic(state, 'READY_ADD_ONS_MISMATCH');
    state.rejectionHint = 'READY_ADD_ONS_MISMATCH';
    return 'invalid';
  }
  state.declaration.readyObserved = true;
  state.formatErrorRetryCount = 0;
  state.rejectionHint = null;
  clearCue(state, 'PRE_READY');
  return 'accepted';
}

function parseReady(text) {
  const match = text.match(/^WORKFLOW READY[ \t]*\|[ \t]*primary=([^|\r\n]+?)[ \t]*\|[ \t]*add-ons=([^|\r\n]+?)[ \t]*\|[ \t]*skills-loaded=([^|\r\n]+?)[ \t]*\|[ \t]*skills-unavailable=([^|\r\n]+?)[ \t]*(?:\r?\n|$)/u);
  if (!match) return null;
  const primary = match[1].trim();
  const addOns = parseIdList(match[2]);
  const skillsLoaded = parseBareSkillList(match[3]);
  const skillsUnavailable = parseBareSkillList(match[4]);
  if (
    !/^(?:none|[A-Za-z0-9][A-Za-z0-9_.-]*)$/u.test(primary)
    || !addOns
    || !skillsLoaded
    || !skillsUnavailable
    || skillsLoaded.some((skill) => skillsUnavailable.includes(skill))
  ) {
    return null;
  }
  return { primary, addOns, skillsLoaded, skillsUnavailable };
}

function acceptDeclaration(state, parsed) {
  state.generation += 1;
  state.rejectionHint = null;
  state.declaration = {
    generation: state.generation,
    primary: parsed.primary,
    addOns: parsed.addOns,
    skills: parsed.skills,
    now: parsed.now,
    then: parsed.then,
    extensions: [],
    returned: [],
    readyObserved: false,
    todoObserved: false,
    readyCueQueued: false,
    dispatchCueQueued: false,
    tasksDispatched: 0,
    tasksSettled: 0,
    verifyCueQueued: false,
    todoHasDelegateRows: false,
    todoHasFallbackRows: false,
    toolResultsSinceStabilityCue: 0,
    stabilityCuesEmitted: 0,
    startedAt: Date.now(),
    stallEscalationQueued: false,
    pendingEscalationQueued: false,
    zeroTaskToolResults: 0,
  };
  maybeQueueReadyCue(state);
  if (parsed.primary === 'writing.pending') {
    state.declaration.pendingStartedAt = Date.now();
  }
}

function parsePlan(text) {
  if (!/^WORKFLOW PLAN[ \t]*(?:\r?\n|$)/u.test(text)) return null;
  const primaryMatch = text.match(/^Primary:[ \t]*([^\r\n]+?)[ \t]*$/mu);
  const addOnsMatch = text.match(/^Add-ons:[ \t]*([^\r\n]+?)[ \t]*$/mu);
  const skillsMatch = text.match(/^Skills:[ \t]*([^\r\n]+?)[ \t]*$/mu);
  const loadMatch = text.match(/^Load order:[ \t]*NOW=\[([^\]\r\n]*)\][ \t]*THEN=\[([^\]\r\n]*)\][ \t]*$/mu);
  const actionsHeading = text.match(/^Actions:[ \t]*$/mu);
  const actionsText = actionsHeading
    ? text.slice((actionsHeading.index ?? 0) + actionsHeading[0].length)
    : '';
  const actions = [...actionsText.matchAll(/^(\d+)\.[ \t]+([^\r\n]*\S)[ \t]*$/gmu)];
  if (!primaryMatch || !addOnsMatch || !skillsMatch || !loadMatch || !actionsHeading) return null;
  const primary = primaryMatch[1].trim();
  const addOns = parseIdList(addOnsMatch[1]);
  const skills = parseUriList(skillsMatch[1], { allowNone: true });
  const now = parseUriList(loadMatch[1], { allowNone: true });
  const then = parseUriList(loadMatch[2], { allowNone: true });
  const firstFourActions = actions.slice(0, 4).map((match) => Number.parseInt(match[1], 10));
  if (
    !/^(?:none|[A-Za-z0-9][A-Za-z0-9_.-]*)$/u.test(primary)
    || !addOns
    || !skills
    || !now
    || !then
    || firstFourActions.length < 4
    || firstFourActions.some((value, index) => value !== index + 1)
    || actions.slice(0, 4).some((match) => /<[^>]+>|^\.{3}$/u.test(match[2].trim()))
  ) {
    return null;
  }
  const combined = [...now, ...then];
  if (new Set(combined).size !== combined.length) return null;
  return { primary, addOns, skills, now, then };
}

function parseIdList(value) {
  const text = String(value).trim();
  if (text.toLowerCase() === 'none') return [];
  if (!text) return null;
  const values = text.split(',').map((item) => item.trim());
  if (values.some((item) => !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(item))) return null;
  if (new Set(values).size !== values.length) return null;
  return values;
}

function parseBareSkillList(value) {
  const text = String(value).trim();
  if (text.toLowerCase() === 'none') return [];
  if (!text) return null;
  const values = text.split(',').map((item) => item.trim());
  if (values.some((item) => !/^[A-Za-z0-9][A-Za-z0-9_./-]*$/u.test(item))) return null;
  if (new Set(values).size !== values.length) return null;
  return values;
}

function parseUriList(value, { allowNone = false } = {}) {
  const text = String(value).trim();
  if (allowNone && text.toLowerCase() === 'none') return [];
  if (!text || text.toLowerCase() === 'none') return null;
  const values = text.split(',').map((item) => item.trim());
  if (values.some((item) => !URI_PATTERN.test(item))) return null;
  if (new Set(values).size !== values.length) return null;
  return values;
}

function maybeQueueReadyCue(state) {
  const declaration = state.declaration;
  if (!declaration || declaration.readyObserved || declaration.readyCueQueued) return;
  if (!declarationLoadsSettled(declaration)) return;
  declaration.readyCueQueued = true;
  queueCue(state, 'PRE_READY', declaration.generation);
}

function declarationLoadsSettled(declaration) {
  const finalThen = declaration.then.at(-1);
  return (!finalThen || declaration.returned.includes(finalThen))
    && requiredUris(declaration).every((uri) => declaration.returned.includes(uri));
}

function requiredUris(declaration) {
  return unique([...declaration.now, ...declaration.extensions, ...declaration.then]);
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function queueCue(state, kind, generation) {
  if (!CUE_KINDS.has(kind)) return;
  const key = `${kind}:${generation}`;
  if (state.pendingCue?.key === key) return;
  state.pendingCue = {
    kind,
    generation,
    key,
    timestamp: Date.now(),
    silentRetries: 0,
  };
}

function clearCue(state, kind) {
  if (state.pendingCue?.kind === kind) state.pendingCue = null;
}

function addDiagnostic(state, code) {
  const generation = state.declaration?.generation ?? state.generation;
  const previous = state.diagnostics.at(-1);
  if (previous?.code === code && previous?.generation === generation) return;
  state.diagnostics.push({ code, generation });
  state.diagnostics = state.diagnostics.slice(-MAX_DIAGNOSTICS);
}

function hasExactIndexIdentity(body) {
  const text = boundedText(body).replace(/^\uFEFF/u, '');
  return /^name[ \t]*:[ \t]*["']?omp-enhancer-workflows["']?[ \t]*(?:#.*)?$/imu.test(text);
}

function markerLineOffset(text, marker) {
  if (text.startsWith(marker)) return 0;
  const offset = text.indexOf(`\n${marker}`);
  return offset < 0 ? -1 : offset + 1;
}

function boundedText(value) {
  const text = String(value ?? '');
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= MAX_OBSERVED_TEXT_BYTES) return text;
  let bounded = bytes.subarray(0, MAX_OBSERVED_TEXT_BYTES).toString('utf8');
  if (bounded.endsWith('\uFFFD')) bounded = bounded.slice(0, -1);
  return bounded;
}

function serializeDeclaration(value) {
  return {
    generation: value.generation,
    primary: value.primary,
    addOns: [...value.addOns],
    skills: [...value.skills],
    now: [...value.now],
    then: [...value.then],
    extensions: [...value.extensions],
    returned: [...value.returned],
    readyObserved: value.readyObserved,
    todoObserved: value.todoObserved,
    readyCueQueued: value.readyCueQueued,
    dispatchCueQueued: value.dispatchCueQueued,
    tasksDispatched: nonnegativeInteger(value.tasksDispatched),
    tasksSettled: nonnegativeInteger(value.tasksSettled),
    verifyCueQueued: value.verifyCueQueued === true,
    todoHasDelegateRows: value.todoHasDelegateRows === true,
    todoHasFallbackRows: value.todoHasFallbackRows === true,
    toolResultsSinceStabilityCue: nonnegativeInteger(value.toolResultsSinceStabilityCue),
    stabilityCuesEmitted: nonnegativeInteger(value.stabilityCuesEmitted),
    startedAt: value.startedAt,
    stallEscalationQueued: value.stallEscalationQueued === true,
    pendingEscalationQueued: value.pendingEscalationQueued === true,
    zeroTaskToolResults: nonnegativeInteger(value.zeroTaskToolResults),
    pendingStartedAt: value.pendingStartedAt,
  };
}

function sanitizeDeclaration(value) {
  if (!isRecord(value)) return null;
  const generation = nonnegativeInteger(value.generation);
  const primary = typeof value.primary === 'string' && /^(?:none|[A-Za-z0-9][A-Za-z0-9_.-]*)$/u.test(value.primary)
    ? value.primary
    : '';
  const addOns = sanitizeIdArray(value.addOns);
  const skills = sanitizeUriArray(value.skills);
  const now = sanitizeUriArray(value.now);
  const then = sanitizeUriArray(value.then);
  const extensions = sanitizeUriArray(value.extensions);
  const returned = sanitizeUriArray(value.returned);
  if (!generation || !primary || !addOns || !skills || !now || !then || !extensions || !returned) return null;
  return {
    generation,
    primary,
    addOns,
    skills,
    now,
    then,
    extensions,
    returned: returned.filter((uri) => unique([...now, ...extensions, ...then]).includes(uri)),
    readyObserved: value.readyObserved === true,
    todoObserved: value.todoObserved === true,
    readyCueQueued: value.readyCueQueued === true,
    dispatchCueQueued: value.dispatchCueQueued === true,
    tasksDispatched: nonnegativeInteger(value.tasksDispatched),
    tasksSettled: nonnegativeInteger(value.tasksSettled),
    verifyCueQueued: value.verifyCueQueued === true,
    todoHasDelegateRows: value.todoHasDelegateRows === true,
    todoHasFallbackRows: value.todoHasFallbackRows === true,
    toolResultsSinceStabilityCue: nonnegativeInteger(value.toolResultsSinceStabilityCue),
    stabilityCuesEmitted: nonnegativeInteger(value.stabilityCuesEmitted),
    startedAt: Number.isFinite(value.startedAt) ? value.startedAt : undefined,
    stallEscalationQueued: value.stallEscalationQueued === true,
    pendingEscalationQueued: value.pendingEscalationQueued === true,
    zeroTaskToolResults: nonnegativeInteger(value.zeroTaskToolResults),
    pendingStartedAt: Number.isFinite(value.pendingStartedAt) ? value.pendingStartedAt : undefined,
  };
}

function sanitizePendingCue(value) {
  if (!isRecord(value) || !CUE_KINDS.has(value.kind)) return null;
  const generation = nonnegativeInteger(value.generation);
  const key = `${value.kind}:${generation}`;
  if (value.key !== key) return null;
  return {
    kind: value.kind,
    generation,
    key,
    timestamp: Number.isFinite(value.timestamp) && value.timestamp >= 0 ? value.timestamp : 0,
    silentRetries: nonnegativeInteger(value.silentRetries),
  };
}

function sanitizeDiagnostic(value) {
  if (!isRecord(value) || typeof value.code !== 'string' || !/^[A-Z0-9_]+$/u.test(value.code)) return null;
  return { code: value.code, generation: nonnegativeInteger(value.generation) };
}

function sanitizeUriArray(value) {
  if (!Array.isArray(value) || value.length > 64) return null;
  const uris = value.filter((item) => typeof item === 'string' && URI_PATTERN.test(item));
  if (uris.length !== value.length || new Set(uris).size !== uris.length) return null;
  return uris;
}

function sanitizeIdArray(value) {
  if (!Array.isArray(value) || value.length > 64) return null;
  const ids = value.filter((item) => typeof item === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(item));
  if (ids.length !== value.length || new Set(ids).size !== ids.length) return null;
  return ids;
}

function nonnegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function isCoachState(value) {
  return isRecord(value) && value.schemaVersion === COACH_STATE_VERSION;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unique(values = []) {
  return [...new Set(values)];
}
