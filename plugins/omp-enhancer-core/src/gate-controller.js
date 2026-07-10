import { createHash } from 'node:crypto';

export const GATE_CONTROLLER_SCHEMA_VERSION = 2;

const DEFAULT_REPAIR_MAX = 2;
const DEFAULT_TERMINAL_MAX = 1;
const SAFE_CODE = /^[a-z0-9][a-z0-9._:@/-]*$/i;
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const VALID_PHASES = new Set(['pending', 'collecting', 'satisfied', 'degraded', 'blocked']);
const OPAQUE_CODE = /^opaque:[a-f0-9]{64}$/;
const OPAQUE_DIGEST = /^digest:[a-f0-9]{64}$/;
const REGISTERED_CODES = new Set([
  'unknown', 'route:unknown', 'gate:unknown', 'reason:unknown', 'evidence:unspecified',
  'writing', 'release', 'tests', 'classifier', 'completion', 'smart',
  'prework:skills', 'bug-audit:subagent', 'release:verification',
  'action-boundary',
  'legacy:smart-gate', 'legacy:loop', 'legacy:classifier',
  'state:migration', 'state:open-gates',
  'missing_evidence', 'missing_skill_metadata', 'legacy_pending_smart_gate',
  'legacy_loop_recovery_pending', 'legacy_classifier_pending',
  'unsupported_gate_state_schema', 'invalid_open_gate_input',
  'protected_action_denials_exhausted', 'constraint_violation',
  'unknown_terminal_reason', 'advisory_gate_open',
  'repeated_repair_without_new_evidence', 'protected_gate_exhausted',
  'soft_gate_exhausted',
  'writing_qa', 'skill_usage', 'release_verification', 'test_command',
  'classification', 'testing_gate', 'smart_gate', 'review_gate', 'test_gate',
  'legacy_gate_resolution', 'non_repeated_progress',
  'deterministic_route_resolution', 'compatible_gate_state',
  'valid_open_gate_set', 'new_evidence', 'old_evidence',
  'collect_gate_evidence', 'classify_once', 'collect_test_evidence',
  'resolve_smart_gate', 'run_tests', 'write_manual_test_report',
  'collect_evidence', 'load_skill', 'publish_plugin', 'repair',
  'not_run', 'blocked',
]);

/**
 * Creates an empty controller for one route. The maxima are deliberately capped;
 * callers cannot use custom state to restore unbounded continuations.
 */
export function createGateControllerState({
  routeId = '',
  evidenceRevision = 0,
  repairMax = DEFAULT_REPAIR_MAX,
  terminalMax = DEFAULT_TERMINAL_MAX,
} = {}) {
  return {
    schemaVersion: GATE_CONTROLLER_SCHEMA_VERSION,
    routeId: safeCode(routeId, ''),
    phase: 'pending',
    evidenceRevision: nonNegativeInteger(evidenceRevision, 0),
    budget: {
      repairUsed: 0,
      repairMax: boundedMaximum(repairMax, DEFAULT_REPAIR_MAX),
      terminalUsed: 0,
      terminalMax: boundedMaximum(terminalMax, DEFAULT_TERMINAL_MAX),
    },
    openGates: {},
    failures: {},
    terminalReason: null,
  };
}

/**
 * Reads either a GateController v2 value or a legacy core snapshot. Unknown
 * future schemas fail closed instead of being treated as satisfied.
 */
export function readGateControllerState(value, options = {}) {
  return migrateGateControllerState(value, options);
}

export function migrateGateControllerState(value, { routeId = '' } = {}) {
  const wrapper = isRecord(value) ? value : {};
  const nested = isRecord(wrapper.gateController) ? wrapper.gateController : null;
  const source = nested && hasOwn(nested, 'schemaVersion') ? nested : value;
  if (isRecord(source) && source.schemaVersion === GATE_CONTROLLER_SCHEMA_VERSION) {
    const normalized = normalizeV2State(source, { routeId });
    return nested ? mergeLegacySafetyState(normalized, wrapper) : normalized;
  }

  if (isRecord(source) && hasOwn(source, 'schemaVersion')) {
    return unsupportedSchemaState(source, { routeId });
  }

  return migrateLegacyState(isRecord(source) ? source : {}, { routeId });
}

/** Returns the persistence-safe subset of controller state. */
export function serializeGateControllerState(state) {
  return migrateGateControllerState(state);
}

/**
 * Starts a new route/user turn. All route-local budgets, evidence, open gates,
 * failure fingerprints, and terminal state are discarded.
 */
export function resetGateControllerForRoute(_state, {
  routeId = '',
  evidenceRevision = 0,
} = {}) {
  return createGateControllerState({ routeId, evidenceRevision });
}

/**
 * Applies successful evidence without mutating the input. Evidence closes the
 * named gates, increments the revision, and makes prior failure fingerprints
 * stale, but it never replenishes the route-wide continuation budget.
 */
export function applyGateEvidence(state, {
  routeId = '',
  satisfiedGateKeys = [],
  evidenceRevision,
} = {}) {
  let next = migrateGateControllerState(state);
  const requestedRouteId = safeCode(routeId, next.routeId);
  if (requestedRouteId && next.routeId && requestedRouteId !== next.routeId) {
    next = createGateControllerState({ routeId: requestedRouteId });
  } else if (requestedRouteId) {
    next.routeId = requestedRouteId;
  }

  const satisfied = new Set(
    asArray(satisfiedGateKeys)
      .map((gateKey) => safeCode(gateKey, ''))
      .filter(Boolean),
  );
  const closed = Object.keys(next.openGates).filter((gateKey) => satisfied.has(gateKey));
  const requestedRevision = nonNegativeInteger(evidenceRevision, next.evidenceRevision);
  if (closed.length === 0) {
    next.evidenceRevision = Math.max(next.evidenceRevision, requestedRevision);
    return next;
  }

  for (const gateKey of closed) delete next.openGates[gateKey];
  next.failures = Object.fromEntries(
    Object.entries(next.failures).filter(([, failure]) => !satisfied.has(failure.gateKey)),
  );
  next.evidenceRevision = Math.max(
    next.evidenceRevision + 1,
    requestedRevision,
  );
  next.terminalReason = null;
  next.phase = Object.keys(next.openGates).length === 0 ? 'satisfied' : 'collecting';
  return next;
}

/**
 * Computes the next bounded controller transition from the complete current
 * set of open gates. This function is deterministic and does not mutate input.
 */
export function evaluateGateController(state, {
  routeId = '',
  openGates,
  evidenceRevision,
  repairActions = [],
  evidenceDigest = '',
} = {}) {
  let next = migrateGateControllerState(state);
  const requestedRouteId = safeCode(routeId, next.routeId || 'route:unknown');

  if (next.routeId && requestedRouteId !== next.routeId) {
    next = createGateControllerState({ routeId: requestedRouteId });
  } else {
    next.routeId = requestedRouteId;
  }

  const requestedRevision = nonNegativeInteger(evidenceRevision, next.evidenceRevision);
  if (requestedRevision > next.evidenceRevision) {
    next.evidenceRevision = requestedRevision;
  }

  const invariantGates = Object.values(next.openGates)
    .filter((gate) => gate.gateKey === 'state:migration');
  const reportedOpenGates = openGates === undefined
    ? normalizeOpenGateSet(next.openGates)
    : normalizeOpenGateSet(openGates);
  next.openGates = invariantGates.length === 0
    ? reportedOpenGates
    : normalizeOpenGateSet([...Object.values(reportedOpenGates), ...invariantGates]);

  const summary = summarizeOpenGates(next.openGates);
  if (summary.openGateKeys.length === 0) {
    next.phase = 'satisfied';
    next.terminalReason = null;
    return transitionResult(next, {
      kind: 'release',
      continue: false,
      terminalOnly: false,
      ...summary,
    });
  }

  const actionableGates = summary.gates.filter((gate) => gate.protection !== 'coach');
  if (actionableGates.length === 0) {
    next.phase = 'degraded';
    next.terminalReason = 'advisory_gate_open';
    return transitionResult(next, {
      kind: 'coach',
      continue: false,
      terminalOnly: false,
      terminalReason: next.terminalReason,
      ...summary,
    });
  }

  const actions = normalizeRepairActions(repairActions, {
    evidenceDigest,
  });
  const skippedRepeatedActions = [];
  let selected = null;

  for (const action of actions) {
    const fingerprints = actionableGates.map((gate) => buildGateFailureFingerprint({
      routeId: next.routeId,
      gateKey: gate.gateKey,
      reasonCode: gate.reasonCode,
      missingEvidenceCodes: gate.missingEvidenceCodes,
      actionKind: action.actionKind,
      normalizedResultCode: action.normalizedResultCode,
      evidenceDigest: gate.evidenceDigest === 'evidence:unspecified'
        ? action.evidenceDigest
        : gate.evidenceDigest,
    }));
    if (fingerprints.some((fingerprint) => Boolean(next.failures[fingerprint]))) {
      skippedRepeatedActions.push(action.actionKind);
      continue;
    }
    selected = { action, fingerprints };
    break;
  }

  if (next.budget.repairUsed < next.budget.repairMax && selected) {
    next.budget.repairUsed += 1;
    next.phase = 'collecting';
    next.terminalReason = null;
    selected.fingerprints.forEach((fingerprint, index) => {
      const gate = actionableGates[index];
      next.failures[fingerprint] = {
        fingerprint,
        gateKey: gate.gateKey,
        reasonCode: gate.reasonCode,
        missingEvidenceCodes: [...gate.missingEvidenceCodes],
        actionKind: selected.action.actionKind,
        normalizedResultCode: selected.action.normalizedResultCode,
        evidenceDigest: selected.action.evidenceDigest,
        evidenceRevision: next.evidenceRevision,
      };
    });
    next.failures = copyFailures(next.failures);

    return transitionResult(next, {
      kind: 'repair',
      continue: true,
      terminalOnly: false,
      action: { ...selected.action },
      fingerprints: [...selected.fingerprints],
      skippedRepeatedActions,
      ...summary,
    });
  }

  const hasProtectedGate = actionableGates.some((gate) => gate.protection === 'protected');
  const repeatedWithoutEvidence = !selected && skippedRepeatedActions.length > 0;
  next.phase = hasProtectedGate ? 'blocked' : 'degraded';
  next.terminalReason = repeatedWithoutEvidence
    ? 'repeated_repair_without_new_evidence'
    : hasProtectedGate
      ? 'protected_gate_exhausted'
      : 'soft_gate_exhausted';

  if (next.budget.terminalUsed < next.budget.terminalMax) {
    next.budget.terminalUsed += 1;
    return transitionResult(next, {
      kind: 'terminal',
      continue: true,
      terminalOnly: true,
      terminalReason: next.terminalReason,
      skippedRepeatedActions,
      ...summary,
    });
  }

  return transitionResult(next, {
    kind: 'stop',
    continue: false,
    terminalOnly: false,
    terminalReason: next.terminalReason,
    skippedRepeatedActions,
    ...summary,
  });
}

/**
 * Hashes only normalized, stable codes. Extra keys (prompt, tool arguments,
 * credentials, natural-language errors) are ignored by construction.
 */
export function buildGateFailureFingerprint({
  routeId = '',
  gateKey = '',
  reasonCode = '',
  missingEvidenceCodes = [],
  actionKind = '',
  normalizedResultCode = '',
  evidenceDigest = '',
} = {}) {
  const stable = [
    safeCode(routeId, 'route:unknown'),
    safeCode(gateKey, 'gate:unknown'),
    safeCode(reasonCode, 'reason:unknown'),
    stableCodes(missingEvidenceCodes, 'evidence:unspecified').join(','),
    safeCode(actionKind, 'repair'),
    safeCode(normalizedResultCode, 'missing_evidence'),
    safeEvidenceDigest(evidenceDigest, 'evidence:unspecified'),
  ].join('\u0000');
  return createHash('sha256').update(stable).digest('hex');
}

/** Normalizes and merges the complete open-gate set into stable safe fields. */
export function normalizeOpenGateSet(value) {
  let candidates = [];
  if (Array.isArray(value)) {
    candidates = value.map((gate, index) => [String(index), gate]);
  } else if (looksLikeGate(value)) {
    candidates = [['0', value]];
  } else if (isRecord(value)) {
    candidates = Object.entries(value);
  } else if (value != null) {
    candidates = [['0', null]];
  }

  const normalized = candidates
    .map(([keyHint, gate], index) => normalizeGate(gate, { keyHint, index }))
    .filter(Boolean)
    .sort((left, right) => left.gateKey.localeCompare(right.gateKey));

  if (candidates.length > 0 && normalized.length === 0) {
    normalized.push({
      gateKey: 'state:open-gates',
      reasonCode: 'invalid_open_gate_input',
      missingEvidenceCodes: ['valid_open_gate_set'],
      protection: 'protected',
      evidenceDigest: 'evidence:unspecified',
    });
  }

  const result = {};
  for (const gate of normalized) {
    const previous = hasOwn(result, gate.gateKey) ? result[gate.gateKey] : null;
    if (!previous) {
      result[gate.gateKey] = gate;
      continue;
    }
    result[gate.gateKey] = {
      gateKey: gate.gateKey,
      reasonCode: [previous.reasonCode, gate.reasonCode].sort()[0],
      missingEvidenceCodes: stableCodes([
        ...previous.missingEvidenceCodes,
        ...gate.missingEvidenceCodes,
      ], 'evidence:unspecified'),
      protection: strongerProtection(previous.protection, gate.protection),
      evidenceDigest: mergeEvidenceDigests(previous.evidenceDigest, gate.evidenceDigest),
    };
  }
  return result;
}

function normalizeV2State(value, { routeId = '' } = {}) {
  const budget = isRecord(value.budget) ? value.budget : {};
  const repairMax = boundedMaximum(budget.repairMax, DEFAULT_REPAIR_MAX);
  const terminalMax = boundedMaximum(budget.terminalMax, DEFAULT_TERMINAL_MAX);
  const resolvedRouteId = safeCode(routeId, safeCode(value.routeId, ''));
  const openGates = normalizeOpenGateSet(value.openGates);
  const state = {
    schemaVersion: GATE_CONTROLLER_SCHEMA_VERSION,
    routeId: resolvedRouteId,
    phase: normalizeV2Phase({
      phase: value.phase,
      openGates,
      repairUsed: nonNegativeInteger(budget.repairUsed, 0),
      repairMax,
    }),
    evidenceRevision: nonNegativeInteger(value.evidenceRevision, 0),
    budget: {
      repairUsed: clamp(nonNegativeInteger(budget.repairUsed, 0), 0, repairMax),
      repairMax,
      terminalUsed: clamp(nonNegativeInteger(budget.terminalUsed, 0), 0, terminalMax),
      terminalMax,
    },
    openGates,
    failures: normalizeFailures(value.failures),
    terminalReason: value.terminalReason == null
      ? null
      : safeCode(value.terminalReason, 'unknown_terminal_reason'),
  };
  return state;
}

function unsupportedSchemaState(value, { routeId = '' } = {}) {
  const state = createGateControllerState({
    routeId: safeCode(routeId, safeCode(value.routeId, 'route:unknown')),
  });
  state.phase = 'blocked';
  state.budget.repairUsed = state.budget.repairMax;
  state.openGates = normalizeOpenGateSet([{
    gateKey: 'state:migration',
    reasonCode: 'unsupported_gate_state_schema',
    missingEvidenceCodes: ['compatible_gate_state'],
    protection: 'protected',
  }]);
  state.terminalReason = 'unsupported_gate_state_schema';
  return state;
}

function migrateLegacyState(value, { routeId = '' } = {}) {
  const state = createGateControllerState({
    routeId: safeCode(routeId, legacyRouteId(value)),
    evidenceRevision: value.evidenceRevision,
  });
  state.budget.repairUsed = clamp(legacyRepairUsed(value), 0, state.budget.repairMax);

  const gates = [];
  if (isRecord(value.pendingSmartGate)) {
    const legacyGateKey = safeCode(value.pendingSmartGate.gateKey, 'legacy:smart-gate');
    gates.push({
      gateKey: legacyGateKey,
      reasonCode: 'legacy_pending_smart_gate',
      missingEvidenceCodes: ['legacy_gate_resolution'],
      protection: legacyPendingGateProtection(value.pendingSmartGate.gateKey),
    });
  }
  if (legacyLoopIsOpen(value.loopGuard)) {
    gates.push({
      gateKey: 'legacy:loop',
      reasonCode: 'legacy_loop_recovery_pending',
      missingEvidenceCodes: ['non_repeated_progress'],
      protection: 'protected',
    });
  }
  if (isRecord(value.classifierPreflight) && value.classifierPreflight.required === true) {
    gates.push({
      gateKey: 'legacy:classifier',
      reasonCode: 'legacy_classifier_pending',
      missingEvidenceCodes: ['deterministic_route_resolution'],
      protection: 'soft',
    });
  }

  state.openGates = normalizeOpenGateSet(gates);
  if (Object.keys(state.openGates).length > 0) {
    const protectedGateOpen = Object.values(state.openGates)
      .some((gate) => gate.protection === 'protected');
    if (state.budget.repairUsed >= state.budget.repairMax) {
      state.phase = protectedGateOpen ? 'blocked' : 'degraded';
      state.terminalReason = protectedGateOpen
        ? 'protected_gate_exhausted'
        : 'soft_gate_exhausted';
    } else {
      state.phase = 'collecting';
    }
  }
  return state;
}

function legacyPendingGateProtection(gateKey = '') {
  const normalized = String(gateKey ?? '').toLowerCase();
  if (/(?:release|security|irreversible|external[-_:]?write|fact[-_:]?check)/.test(normalized)) {
    return 'protected';
  }
  if (/(?:prework|task[-_:]?subagent[-_:]?contract|metadata)/.test(normalized)) {
    return 'coach';
  }
  if (/(?:subagent|skill|writing[-_:]?qa|testing|test[-_:]?gate)/.test(normalized)) {
    return 'soft';
  }
  return 'protected';
}

function mergeLegacySafetyState(state, wrapper) {
  const legacy = migrateLegacyState(wrapper, { routeId: state.routeId });
  if (Object.keys(legacy.openGates).length === 0) return state;

  const merged = {
    ...state,
    budget: {
      ...state.budget,
      repairUsed: Math.max(state.budget.repairUsed, legacy.budget.repairUsed),
    },
    openGates: normalizeOpenGateSet([
      ...Object.values(state.openGates),
      ...Object.values(legacy.openGates),
    ]),
  };
  const protectedGateOpen = Object.values(merged.openGates)
    .some((gate) => gate.protection === 'protected');
  if (merged.budget.repairUsed >= merged.budget.repairMax) {
    merged.phase = protectedGateOpen ? 'blocked' : 'degraded';
    merged.terminalReason = protectedGateOpen
      ? 'protected_gate_exhausted'
      : 'soft_gate_exhausted';
  } else if (merged.phase === 'pending' || merged.phase === 'satisfied') {
    merged.phase = 'collecting';
  }
  return merged;
}

function normalizeV2Phase({ phase, openGates, repairUsed, repairMax }) {
  const validPhase = VALID_PHASES.has(phase) ? phase : 'pending';
  const gates = Object.values(openGates);
  if (gates.length === 0) return validPhase;

  const protectedGateOpen = gates.some((gate) => gate.protection === 'protected');
  if (validPhase === 'blocked') return 'blocked';
  if (validPhase === 'degraded') return protectedGateOpen ? 'blocked' : 'degraded';
  if (repairUsed >= repairMax) return protectedGateOpen ? 'blocked' : 'degraded';
  return 'collecting';
}

function normalizeGate(value, { keyHint = '', index = 0 } = {}) {
  if (!isRecord(value)) return null;
  const hintedKey = /^\d+$/.test(keyHint) ? '' : keyHint;
  const gateKey = safeCode(
    value.gateKey ?? value.key ?? hintedKey,
    opaqueCode(`gate:${index + 1}`),
  );
  return {
    gateKey,
    reasonCode: safeCode(value.reasonCode, 'missing_evidence'),
    missingEvidenceCodes: stableCodes(
      value.missingEvidenceCodes ?? value.missing ?? [],
      'evidence:unspecified',
    ),
    protection: normalizeProtection(value),
    evidenceDigest: safeEvidenceDigest(value.evidenceDigest, 'evidence:unspecified'),
  };
}

function normalizeProtection(value) {
  const signals = [value.protection, value.enforcement];
  if (value.protected === true || signals.includes('protected')) return 'protected';
  if (signals.includes('soft')) return 'soft';
  if (signals.includes('coach')) return 'coach';
  return 'protected';
}

function normalizeRepairActions(value, { evidenceDigest = '' } = {}) {
  const actions = asArray(value);
  const candidates = actions.length > 0 ? actions : [{ actionKind: 'collect_evidence' }];
  const result = [];
  const seen = new Set();
  for (const action of candidates) {
    if (!isRecord(action)) continue;
    const normalized = {
      actionKind: safeCode(action.actionKind ?? action.kind, 'repair'),
      normalizedResultCode: safeCode(
        action.normalizedResultCode ?? action.resultCode,
        'missing_evidence',
      ),
      evidenceDigest: safeEvidenceDigest(
        action.evidenceDigest ?? evidenceDigest,
        'evidence:unspecified',
      ),
    };
    const key = [
      normalized.actionKind,
      normalized.normalizedResultCode,
      normalized.evidenceDigest,
    ].join('\u0000');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result.length > 0 ? result : [{
    actionKind: 'repair',
    normalizedResultCode: 'missing_evidence',
    evidenceDigest: 'evidence:unspecified',
  }];
}

function summarizeOpenGates(openGates) {
  const gates = Object.values(openGates);
  return {
    gates: gates.map((gate) => ({ ...gate, missingEvidenceCodes: [...gate.missingEvidenceCodes] })),
    openGateKeys: gates.map((gate) => gate.gateKey),
    missingEvidenceCodes: stableCodes(
      gates.flatMap((gate) => gate.missingEvidenceCodes),
      '',
    ),
  };
}

function transitionResult(state, decision) {
  return {
    state,
    decision: {
      phase: state.phase,
      budget: { ...state.budget },
      ...decision,
    },
  };
}

function normalizeFailures(value) {
  if (!isRecord(value)) return {};
  const result = {};
  for (const [key, failure] of Object.entries(value)) {
    if (!isRecord(failure)) continue;
    const fingerprint = /^[a-f0-9]{64}$/.test(failure.fingerprint ?? key)
      ? (failure.fingerprint ?? key)
      : '';
    if (!fingerprint) continue;
    result[fingerprint] = {
      fingerprint,
      gateKey: safeCode(failure.gateKey, 'gate:unknown'),
      reasonCode: safeCode(failure.reasonCode, 'reason:unknown'),
      missingEvidenceCodes: stableCodes(failure.missingEvidenceCodes, 'evidence:unspecified'),
      actionKind: safeCode(failure.actionKind, 'repair'),
      normalizedResultCode: safeCode(failure.normalizedResultCode, 'missing_evidence'),
      evidenceDigest: safeEvidenceDigest(failure.evidenceDigest, 'evidence:unspecified'),
      evidenceRevision: nonNegativeInteger(failure.evidenceRevision, 0),
    };
  }
  return copyFailures(result);
}

function copyFailures(value) {
  return Object.fromEntries(Object.entries(value));
}

function legacyRouteId(value) {
  const intent = safeCode(value.lastRoute?.intent, 'unknown');
  const startedAt = nonNegativeInteger(value.routeStartedAt, 0);
  return `legacy:${intent}:${startedAt || 'unknown'}`;
}

function legacyRepairUsed(value) {
  const candidates = [value.gateRetryCount, value.gateRetryCounts, value.gateRetries];
  let used = 0;
  for (const candidate of candidates) {
    if (Number.isFinite(candidate)) {
      used += nonNegativeInteger(candidate, 0);
      continue;
    }
    if (isRecord(candidate)) {
      used += Object.values(candidate)
        .filter(Number.isFinite)
        .reduce((sum, count) => sum + nonNegativeInteger(count, 0), 0);
    }
  }
  return used;
}

function legacyLoopIsOpen(value) {
  if (!isRecord(value)) return false;
  return value.recoveryPending === true
    || value.streamTriggered === true
    || nonNegativeInteger(value.repeatedGenerationCount, 0) > 0;
}

function stableCodes(value, fallback) {
  const codes = [...new Set(
    asArray(value)
      .map((item) => safeCode(item, ''))
      .filter(Boolean),
  )].sort();
  return codes.length > 0 ? codes : fallback ? [fallback] : [];
}

function safeCode(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  if (
    !candidate
    || candidate.length > 160
    || !SAFE_CODE.test(candidate)
    || RESERVED_KEYS.has(candidate)
  ) {
    return fallback;
  }
  if (REGISTERED_CODES.has(candidate) || OPAQUE_CODE.test(candidate)) return candidate;
  return opaqueCode(candidate);
}

function safeEvidenceDigest(value, fallback = 'evidence:unspecified') {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  if (OPAQUE_DIGEST.test(candidate)) return candidate;
  if (
    candidate === 'evidence:unspecified'
    || /^(?:ev|revision)-\d+$/.test(candidate)
    || /^sha256-[a-f0-9]{8,64}$/i.test(candidate)
    || /^[a-f0-9]{32,64}$/i.test(candidate)
  ) {
    return candidate === 'evidence:unspecified'
      ? candidate
      : `digest:${createHash('sha256').update(candidate).digest('hex')}`;
  }
  return fallback;
}

function mergeEvidenceDigests(left, right) {
  const normalizedLeft = safeEvidenceDigest(left);
  const normalizedRight = safeEvidenceDigest(right);
  if (normalizedLeft === normalizedRight) return normalizedLeft;
  if (normalizedLeft === 'evidence:unspecified') return normalizedRight;
  if (normalizedRight === 'evidence:unspecified') return normalizedLeft;
  return `digest:${createHash('sha256')
    .update([normalizedLeft, normalizedRight].sort().join('\u0000'))
    .digest('hex')}`;
}

function opaqueCode(value) {
  return `opaque:${createHash('sha256').update(value).digest('hex')}`;
}

function boundedMaximum(value, fallback) {
  return clamp(nonNegativeInteger(value, fallback), 0, fallback);
}

function nonNegativeInteger(value, fallback) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function asArray(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function strongerProtection(left, right) {
  const rank = { coach: 0, soft: 1, protected: 2 };
  return rank[left] >= rank[right] ? left : right;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function looksLikeGate(value) {
  return isRecord(value) && (
    'gateKey' in value
    || 'reasonCode' in value
    || 'missingEvidenceCodes' in value
    || 'protection' in value
    || 'enforcement' in value
  );
}
