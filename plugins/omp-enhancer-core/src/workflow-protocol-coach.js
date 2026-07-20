const COACH_STATE_VERSION = 1;
const MAX_OBSERVED_TEXT_BYTES = 64 * 1024;
const MAX_DIAGNOSTICS = 16;
const INDEX_URI = 'skill://omp-enhancer-workflows';
const CUE_KINDS = new Set(['PRE_PLAN', 'PRE_READY', 'PRE_DISPATCH']);
const URI_PATTERN = /^skill:\/\/[A-Za-z0-9._~!$&'()*+:=@%/-]+$/u;

const CUE_CONTENT = Object.freeze({
  PRE_PLAN: 'OMP PROTOCOL COACH (soft, phase=DECLARE): Start the next visible assistant response at byte 0 with a filled WORKFLOW PLAN. Treat index D/C entries as optional candidates, choose the smallest matching exact URI set, and declare structured NOW/THEN loads. This cue selects no workflow, Skill, Agent, or fork and grants no authority.',
  PRE_READY: 'OMP PROTOCOL COACH (soft, phase=COMMIT): Start the next visible assistant response at byte 0 with WORKFLOW READY, mechanically copy the committed declaration and actual load outcomes, initialize or rebase TODO only, then end and wait. Add no preface and generate no missing values; this cue grants no authority.',
  PRE_DISPATCH: 'OMP PROTOCOL COACH (soft, phase=SPLIT): When Main uses the committed `tasks[]` batch form, supply one nonempty top-level `context`; each item uses only exposed fields. For each committed Delegate row, mechanically copy its Agent into `agent`, then put this unique prefix at byte 0 of the `task` string in this exact key order: [workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]. Request a complete terminal child delivery with directly usable artifact/evidence; status-only or artifact-reference-only is incomplete. If a conditional repair checkpoint has no accepted finding and needs no dispatch, mark it resolved/completed, not drop/abandon. This cue selects no Agent, fork, dispatch, retry, or completion and grants no authority.',
});

export function createWorkflowProtocolCoachState() {
  return {
    schemaVersion: COACH_STATE_VERSION,
    indexObserved: false,
    indexCueQueued: false,
    generation: 0,
    replacementUsed: false,
    declaration: null,
    pendingCue: null,
    diagnostics: [],
  };
}

export function observeProtocolAssistantMessage(state, rawText = '') {
  if (!isCoachState(state)) return false;
  const before = JSON.stringify(state);
  const text = boundedText(rawText);
  const pendingAtStart = state.pendingCue;

  let preservePending = false;
  if (text) {
    observePlan(state, text);
    const extensionObservation = observeResourceExtension(state, text);
    const readyObservation = observeReady(state, text);
    preservePending = extensionObservation === 'late' || readyObservation === 'invalid';
  }

  if (pendingAtStart && state.pendingCue === pendingAtStart && !preservePending) {
    state.pendingCue = null;
  }
  return JSON.stringify(state) !== before;
}

export function observeProtocolToolResult(state, {
  name = '',
  target = '',
  body = '',
  failed = false,
  pending = false,
} = {}) {
  if (!isCoachState(state)) return;
  const toolName = String(name).trim().toLowerCase();
  const exactTarget = String(target).trim();
  const isSettled = !pending;

  if (
    toolName === 'read'
    && exactTarget === INDEX_URI
    && !failed
    && isSettled
    && hasExactIndexIdentity(body)
  ) {
    markWorkflowIndexObserved(state);
  }

  const declaration = state.declaration;
  if (toolName === 'read' && declaration && isSettled && requiredUris(declaration).includes(exactTarget)) {
    declaration.returned = unique([...declaration.returned, exactTarget]);
    maybeQueueReadyCue(state);
  }

  if (toolName !== 'todo' || !declaration || !isSettled || failed || !declaration.readyObserved) {
    return;
  }
  declaration.todoObserved = true;
  if (declaration.primary === 'writing.pending' || declaration.dispatchCueQueued) return;
  declaration.dispatchCueQueued = true;
  queueCue(state, 'PRE_DISPATCH', declaration.generation);
}

export function observeProtocolSuppliedWorkflowIndex(state) {
  if (!isCoachState(state)) return;
  markWorkflowIndexObserved(state);
}

export function observeProtocolToolCall(state, { name = '' } = {}) {
  if (!isCoachState(state)) return;
  if (String(name).trim().toLowerCase() === 'task') {
    clearCue(state, 'PRE_DISPATCH');
  }
}

export function presentWorkflowProtocolCoachCue(state) {
  if (!isCoachState(state) || !state.pendingCue) return null;
  const content = CUE_CONTENT[state.pendingCue.kind];
  if (!content) return null;
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
    declaration: safe.declaration ? serializeDeclaration(safe.declaration) : null,
    pendingCue: safe.pendingCue ? { ...safe.pendingCue } : null,
    diagnostics: safe.diagnostics.map((item) => ({ ...item })),
  };
}

export function sanitizeWorkflowProtocolCoachState(value = {}) {
  const state = createWorkflowProtocolCoachState();
  if (!isRecord(value) || value.schemaVersion !== COACH_STATE_VERSION) return state;
  state.indexObserved = value.indexObserved === true;
  state.indexCueQueued = value.indexCueQueued === true;
  state.generation = nonnegativeInteger(value.generation);
  state.replacementUsed = value.replacementUsed === true;
  state.declaration = sanitizeDeclaration(value.declaration);
  if (state.declaration) state.generation = Math.max(state.generation, state.declaration.generation);
  state.pendingCue = sanitizePendingCue(value.pendingCue);
  state.diagnostics = Array.isArray(value.diagnostics)
    ? value.diagnostics.map(sanitizeDiagnostic).filter(Boolean).slice(-MAX_DIAGNOSTICS)
    : [];
  return state;
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
    return;
  }
  const parsed = parsePlan(text);
  if (!parsed) {
    addDiagnostic(state, 'PLAN_MALFORMED');
    return;
  }
  if (!state.indexObserved) {
    addDiagnostic(state, 'PLAN_BEFORE_INDEX');
    return;
  }

  if (!state.declaration) {
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
    return 'invalid';
  }
  const ready = parseReady(text);
  if (!ready) {
    addDiagnostic(state, 'READY_MALFORMED');
    return 'invalid';
  }
  if (!state.declaration) {
    addDiagnostic(state, 'READY_BEFORE_PLAN');
    return 'invalid';
  }
  if (!declarationLoadsSettled(state.declaration)) {
    addDiagnostic(state, 'READY_BEFORE_LOADS_SETTLED');
    return 'invalid';
  }
  if (ready.primary !== state.declaration.primary) {
    addDiagnostic(state, 'READY_PRIMARY_MISMATCH');
    return 'invalid';
  }
  if (!sameStrings(ready.addOns, state.declaration.addOns)) {
    addDiagnostic(state, 'READY_ADD_ONS_MISMATCH');
    return 'invalid';
  }
  state.declaration.readyObserved = true;
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
  };
  maybeQueueReadyCue(state);
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
