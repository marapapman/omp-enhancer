import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  GATE_CONTROLLER_SCHEMA_VERSION,
  applyGateEvidence,
  buildGateFailureFingerprint,
  createGateControllerState,
  evaluateGateController,
  migrateGateControllerState,
  resetGateControllerForRoute,
  serializeGateControllerState,
} from '../src/gate-controller.js';

const LEGACY_V_0_1_74_STATE = JSON.parse(
  readFileSync(new URL('./fixtures/state-v0.1.74.json', import.meta.url), 'utf8'),
);

test('creates the bounded GateController v2 state', () => {
  const state = createGateControllerState({ routeId: 'route:one' });
  assert.match(state.routeId, /^opaque:[a-f0-9]{64}$/);
  assert.deepEqual(state, {
    schemaVersion: GATE_CONTROLLER_SCHEMA_VERSION,
    routeId: state.routeId,
    phase: 'pending',
    evidenceRevision: 0,
    budget: {
      repairUsed: 0,
      repairMax: 2,
      terminalUsed: 0,
      terminalMax: 1,
    },
    openGates: {},
    failures: {},
    terminalReason: null,
  });
});

test('reports every open gate and missing evidence in one repair decision', () => {
  const initial = createGateControllerState({ routeId: 'route:aggregate' });
  const result = evaluateGateController(initial, {
    routeId: 'route:aggregate',
    openGates: [
      softGate('writing', ['writing_qa', 'skill_usage']),
      protectedGate('release', ['release_verification', 'skill_usage']),
      softGate('tests', ['test_command']),
    ],
    repairActions: [{ actionKind: 'collect_gate_evidence' }],
  });

  assert.equal(result.decision.kind, 'repair');
  assert.equal(result.decision.continue, true);
  assert.equal(result.decision.terminalOnly, false);
  assert.deepEqual(result.decision.openGateKeys, ['release', 'tests', 'writing']);
  assert.deepEqual(result.decision.missingEvidenceCodes, [
    'release_verification',
    'skill_usage',
    'test_command',
    'writing_qa',
  ]);
  assert.equal(result.state.budget.repairUsed, 1, 'all gates share one route repair');
  assert.deepEqual(Object.keys(result.state.openGates), ['release', 'tests', 'writing']);
  assert.equal(initial.budget.repairUsed, 0, 'the transition must not mutate its input');
});

test('accepts one gate object without treating its fields as a gate map', () => {
  const result = evaluateGateController(createGateControllerState({ routeId: 'route:single' }), {
    routeId: 'route:single',
    openGates: softGate('tests', ['test_command']),
  });

  assert.equal(result.decision.kind, 'repair');
  assert.deepEqual(result.decision.openGateKeys, ['tests']);
});

test('prototype-named gate keys cannot crash or corrupt the gate set', () => {
  const result = evaluateGateController(createGateControllerState({ routeId: 'route:prototype' }), {
    routeId: 'route:prototype',
    openGates: [
      softGate('toString', ['test_command']),
      softGate('hasOwnProperty', ['review_gate']),
      softGate('valueOf', ['writing_qa']),
    ],
  });

  assert.equal(result.decision.kind, 'repair');
  assert.equal(result.decision.openGateKeys.length, 3);
  assert.equal(new Set(result.decision.openGateKeys).size, 3);
  assert.equal(result.decision.openGateKeys.every((gateKey) => /^opaque:[a-f0-9]{64}$/.test(gateKey)), true);
});

test('uses one repair budget across gate kinds and emits one terminal-only continuation', () => {
  let state = createGateControllerState({ routeId: 'route:budget' });

  let result = evaluateGateController(state, {
    routeId: 'route:budget',
    openGates: [softGate('classifier', ['classification'])],
    repairActions: [{ actionKind: 'classify_once' }],
  });
  assert.equal(result.decision.kind, 'repair');
  state = result.state;

  result = evaluateGateController(state, {
    routeId: 'route:budget',
    openGates: [softGate('completion', ['testing_gate'])],
    repairActions: [{ actionKind: 'collect_test_evidence' }],
  });
  assert.equal(result.decision.kind, 'repair');
  assert.equal(result.state.budget.repairUsed, 2);
  state = result.state;

  result = evaluateGateController(state, {
    routeId: 'route:budget',
    openGates: [softGate('smart', ['smart_gate'])],
    repairActions: [{ actionKind: 'resolve_smart_gate' }],
  });
  assert.equal(result.decision.kind, 'terminal');
  assert.equal(result.decision.continue, true);
  assert.equal(result.decision.terminalOnly, true);
  assert.equal(result.state.phase, 'degraded');
  assert.equal(result.state.budget.terminalUsed, 1);
  state = result.state;

  result = evaluateGateController(state, {
    routeId: 'route:budget',
    openGates: [softGate('smart', ['smart_gate'])],
    repairActions: [{ actionKind: 'resolve_smart_gate' }],
  });
  assert.equal(result.decision.kind, 'stop');
  assert.equal(result.decision.continue, false);
  assert.equal(result.state.budget.terminalUsed, 1);
});

test('never repeats the same repair fingerprint without new evidence', () => {
  let state = createGateControllerState({ routeId: 'route:fingerprint' });
  const input = {
    routeId: 'route:fingerprint',
    openGates: [softGate('tests', ['test_command'])],
    repairActions: [
      { actionKind: 'run_tests', normalizedResultCode: 'not_run', evidenceDigest: 'ev-0' },
      { actionKind: 'write_manual_test_report', normalizedResultCode: 'not_run', evidenceDigest: 'ev-0' },
    ],
  };

  let result = evaluateGateController(state, input);
  assert.equal(result.decision.action.actionKind, 'run_tests');
  state = result.state;

  result = evaluateGateController(state, input);
  assert.equal(result.decision.kind, 'repair');
  assert.equal(result.decision.action.actionKind, 'write_manual_test_report');
  assert.deepEqual(result.decision.skippedRepeatedActions, ['run_tests']);
  assert.equal(result.state.budget.repairUsed, 2);
  state = result.state;

  result = evaluateGateController(state, input);
  assert.equal(result.decision.kind, 'terminal');
  assert.equal(result.decision.terminalReason, 'repeated_repair_without_new_evidence');
  assert.equal(result.state.budget.repairUsed, 2);
});

test('new evidence closes gates, increments revision, and permits a fresh fingerprint', () => {
  let state = createGateControllerState({ routeId: 'route:evidence' });
  let result = evaluateGateController(state, {
    routeId: 'route:evidence',
    openGates: [softGate('tests', ['test_command']), softGate('writing', ['writing_qa'])],
    repairActions: [{ actionKind: 'collect_evidence', evidenceDigest: 'ev-0' }],
  });
  state = result.state;

  state = applyGateEvidence(state, {
    routeId: 'route:evidence',
    satisfiedGateKeys: ['tests'],
    evidenceDigest: 'ev-1',
  });
  assert.equal(state.evidenceRevision, 1);
  assert.deepEqual(Object.keys(state.openGates), ['writing']);
  assert.equal(Object.values(state.failures).some((failure) => failure.gateKey === 'tests'), false);

  const unrelatedRevision = evaluateGateController(state, {
    routeId: 'route:evidence',
    evidenceRevision: 2,
    openGates: [softGate('writing', ['writing_qa'])],
    repairActions: [{ actionKind: 'collect_evidence', evidenceDigest: 'ev-0' }],
  });
  assert.equal(unrelatedRevision.decision.kind, 'terminal',
    'unrelated evidence must not make the same writing action repeatable');

  result = evaluateGateController(state, {
    routeId: 'route:evidence',
    evidenceRevision: 2,
    openGates: [{
      ...softGate('writing', ['writing_qa']),
      evidenceDigest: 'ev-2',
    }],
    repairActions: [{ actionKind: 'collect_evidence', evidenceDigest: 'ev-0' }],
  });
  assert.equal(result.decision.kind, 'repair');
  assert.equal(result.state.evidenceRevision, 2);
  assert.equal(result.state.budget.repairUsed, 2, 'new evidence does not replenish the global budget');

  result = evaluateGateController(result.state, {
    routeId: 'route:evidence',
    evidenceRevision: 3,
    openGates: [],
  });
  assert.equal(result.decision.kind, 'release');
  assert.equal(result.state.phase, 'satisfied');
  assert.deepEqual(result.state.openGates, {});
});

test('successful evidence observed before the first stop advances the route revision', () => {
  const initial = createGateControllerState({ routeId: 'route:early-evidence' });
  const advanced = applyGateEvidence(initial, {
    routeId: 'route:early-evidence',
    evidenceRevision: 1,
  });

  assert.equal(advanced.evidenceRevision, 1);
  assert.deepEqual(advanced.openGates, {});
  assert.equal(initial.evidenceRevision, 0);
});

test('soft exhaustion degrades while protected exhaustion blocks', () => {
  const exhaustedSoft = stateWithExhaustedRepairBudget('route:soft');
  const softResult = evaluateGateController(exhaustedSoft, {
    routeId: 'route:soft',
    openGates: [softGate('writing', ['writing_qa'])],
  });
  assert.equal(softResult.state.phase, 'degraded');
  assert.equal(softResult.decision.terminalReason, 'soft_gate_exhausted');

  const exhaustedProtected = stateWithExhaustedRepairBudget('route:protected');
  const protectedResult = evaluateGateController(exhaustedProtected, {
    routeId: 'route:protected',
    openGates: [protectedGate('release', ['release_verification'])],
  });
  assert.equal(protectedResult.state.phase, 'blocked');
  assert.equal(protectedResult.decision.terminalReason, 'protected_gate_exhausted');
});

test('conflicting protection signals resolve monotonically to protected', () => {
  const result = evaluateGateController(stateWithExhaustedRepairBudget('route:monotonic'), {
    routeId: 'route:monotonic',
    openGates: [{
      gateKey: 'release',
      reasonCode: 'missing_evidence',
      missingEvidenceCodes: ['release_verification'],
      protection: 'coach',
      enforcement: 'soft',
      protected: true,
    }],
  });

  assert.equal(result.state.openGates.release.protection, 'protected');
  assert.equal(result.state.phase, 'blocked');
});

test('coach-only metadata never consumes the completion continuation budget', () => {
  const result = evaluateGateController(createGateControllerState({ routeId: 'route:coach' }), {
    routeId: 'route:coach',
    openGates: [{
      gateKey: 'prework:skills',
      reasonCode: 'missing_skill_metadata',
      missingEvidenceCodes: ['skill_usage'],
      protection: 'coach',
    }],
    repairActions: [{ actionKind: 'load_skill' }],
  });

  assert.equal(result.decision.kind, 'coach');
  assert.equal(result.decision.continue, false);
  assert.equal(result.state.budget.repairUsed, 0);
  assert.equal(result.state.budget.terminalUsed, 0);
  assert.equal(result.state.phase, 'degraded');
});

test('a new route resets budgets, failures, terminal state, and stale evidence', () => {
  const dirty = {
    ...stateWithExhaustedRepairBudget('route:old'),
    evidenceRevision: 9,
    phase: 'blocked',
    terminalReason: 'protected_gate_exhausted',
    openGates: { old: protectedGate('old', ['old_evidence']) },
    failures: { abc: { fingerprint: 'abc', gateKey: 'old' } },
  };

  const reset = resetGateControllerForRoute(dirty, { routeId: 'route:new' });
  assert.deepEqual(reset, createGateControllerState({ routeId: 'route:new' }));

  const evaluated = evaluateGateController(dirty, {
    routeId: 'route:new',
    openGates: [softGate('new', ['new_evidence'])],
  });
  assert.equal(
    evaluated.state.routeId,
    createGateControllerState({ routeId: 'route:new' }).routeId,
  );
  assert.equal(evaluated.state.evidenceRevision, 0);
  assert.equal(evaluated.state.budget.repairUsed, 1);
  assert.equal(Object.values(evaluated.state.failures).some((failure) => failure.gateKey === 'old'), false);
});

test('migrates a real v0.1.74 pending gate to conservative bounded state', () => {
  const migrated = migrateGateControllerState(LEGACY_V_0_1_74_STATE);

  assert.equal(migrated.schemaVersion, 2);
  assert.match(migrated.routeId, /^opaque:[a-f0-9]{64}$/);
  assert.equal(migrated.phase, 'collecting');
  assert.equal(migrated.openGates['bug-audit:subagent'].protection, 'soft');
  assert.deepEqual(migrated.openGates['bug-audit:subagent'].missingEvidenceCodes, [
    'legacy_gate_resolution',
  ]);
  assert.equal(JSON.stringify(migrated).includes('OMP Enhancer Core subagent gate'), false,
    'legacy natural-language context must not enter controller state');
});

test('legacy completion gates preserve protection by risk instead of becoming uniformly hard', () => {
  const soft = migrateGateControllerState({
    pendingSmartGate: { gateKey: 'writing.zh:writing-qa' },
  });
  const protectedRelease = migrateGateControllerState({
    pendingSmartGate: { gateKey: 'release:verification' },
  });

  assert.equal(Object.values(soft.openGates)[0].protection, 'soft');
  assert.equal(protectedRelease.openGates['release:verification'].protection, 'protected');
});

test('clips legacy retry counters and loop recovery to safe global defaults', () => {
  const migrated = migrateGateControllerState({
    lastRoute: { intent: 'release' },
    routeStartedAt: 123,
    gateRetryCount: { subagent: 7, workflow: 8, skill: 9 },
    loopGuard: {
      recoveryPending: true,
      streamTriggered: true,
      lastAbortReason: 'raw model output that must not be retained',
    },
  });

  assert.equal(migrated.budget.repairUsed, 2);
  assert.equal(migrated.budget.repairMax, 2);
  assert.equal(migrated.budget.terminalMax, 1);
  assert.equal(migrated.phase, 'blocked');
  assert.equal(migrated.openGates['legacy:loop'].protection, 'protected');
  assert.equal(JSON.stringify(migrated).includes('raw model output'), false);
});

test('an empty transitional gateController wrapper cannot hide legacy safety gates', () => {
  const migrated = migrateGateControllerState({
    gateController: {},
    lastRoute: { intent: 'release' },
    routeStartedAt: 456,
    pendingSmartGate: {
      gateKey: 'release:verification',
      context: 'raw prompt must be discarded',
    },
  });

  assert.equal(migrated.phase, 'collecting');
  assert.equal(migrated.openGates['release:verification'].protection, 'protected');
});

test('a valid nested controller conservatively merges transitional legacy gates', () => {
  const migrated = migrateGateControllerState({
    gateController: createGateControllerState({ routeId: 'route:nested' }),
    pendingSmartGate: { gateKey: 'release:verification' },
  });

  assert.equal(
    migrated.routeId,
    createGateControllerState({ routeId: 'route:nested' }).routeId,
  );
  assert.equal(migrated.phase, 'collecting');
  assert.equal(migrated.openGates['release:verification'].protection, 'protected');
});

test('an unsupported schema migration gate cannot be overwritten by an empty gate list', () => {
  const unsupported = migrateGateControllerState({
    schemaVersion: 99,
    routeId: 'route:future',
  });
  const result = evaluateGateController(unsupported, {
    routeId: 'route:future',
    openGates: [],
  });

  assert.equal(result.state.phase, 'blocked');
  assert.equal(result.state.openGates['state:migration'].protection, 'protected');
  assert.notEqual(result.decision.kind, 'release');
});

test('failure fingerprints are stable and contain no prompt or sensitive parameters', () => {
  const secret = 'sk-live-super-secret';
  const left = buildGateFailureFingerprint({
    routeId: 'route:privacy',
    gateKey: 'release',
    reasonCode: 'missing_evidence',
    missingEvidenceCodes: ['test_gate', 'review_gate'],
    actionKind: 'publish_plugin',
    normalizedResultCode: 'blocked',
    evidenceDigest: 'sha256-deadbeef',
    prompt: `publish with ${secret}`,
    toolParameters: { apiKey: secret },
  });
  const right = buildGateFailureFingerprint({
    routeId: 'route:privacy',
    gateKey: 'release',
    reasonCode: 'missing_evidence',
    missingEvidenceCodes: ['review_gate', 'test_gate'],
    actionKind: 'publish_plugin',
    normalizedResultCode: 'blocked',
    evidenceDigest: 'sha256-deadbeef',
  });

  assert.equal(left, right);
  assert.match(left, /^[a-f0-9]{64}$/);
  assert.equal(left.includes(secret), false);

  const result = evaluateGateController(createGateControllerState({ routeId: 'route:privacy' }), {
    routeId: 'route:privacy',
    openGates: [{
      ...protectedGate('release', ['release_verification']),
      prompt: `publish with ${secret}`,
    }],
    repairActions: [{
      actionKind: 'publish_plugin',
      normalizedResultCode: 'blocked',
      evidenceDigest: 'sha256-deadbeef',
      apiKey: secret,
      toolParameters: { token: secret },
    }],
  });
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('credential-shaped values are rejected from every persisted code field', () => {
  const secrets = [
    'sk-live-super-secret',
    'AIzaSyDUMMYSECRET1234567890abcdefghi',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.signature',
    'secret-token-0123456789abcdef',
    '0123456789abcdef0123456789abcdef',
  ];

  for (const secret of secrets) {
    const result = evaluateGateController(createGateControllerState({ routeId: secret }), {
      routeId: secret,
      openGates: [{
        gateKey: secret,
        reasonCode: secret,
        missingEvidenceCodes: [secret],
        evidenceDigest: secret,
        protection: 'protected',
      }],
      repairActions: [{
        actionKind: secret,
        normalizedResultCode: secret,
        evidenceDigest: secret,
      }],
    });

    assert.equal(JSON.stringify(result).includes(secret), false, `leaked ${secret}`);
  }
});

test('serialization ignores unknown fields and malformed legacy input fails safely', () => {
  const serialized = serializeGateControllerState({
    ...createGateControllerState({ routeId: 'route:serialize' }),
    prompt: 'private prompt',
    apiKey: 'secret',
    futureField: { anything: true },
  });
  assert.equal('prompt' in serialized, false);
  assert.equal('apiKey' in serialized, false);
  assert.equal('futureField' in serialized, false);

  const malformed = migrateGateControllerState({
    schemaVersion: 99,
    routeId: 'route:future',
    openGates: { release: { protection: 'soft' } },
  });
  assert.equal(malformed.phase, 'blocked');
  assert.equal(malformed.openGates['state:migration'].protection, 'protected');

  for (const schemaVersion of ['2', '99', null]) {
    const invalidSchemaType = migrateGateControllerState({
      schemaVersion,
      routeId: 'route:invalid-schema-type',
    });
    assert.equal(invalidSchemaType.phase, 'blocked');
    assert.equal(invalidSchemaType.openGates['state:migration'].protection, 'protected');
  }

  const contradictory = migrateGateControllerState({
    ...createGateControllerState({ routeId: 'route:contradictory' }),
    phase: 'satisfied',
    openGates: {
      release: protectedGate('release', ['release_verification']),
    },
  });
  assert.equal(contradictory.phase, 'collecting');
});

function softGate(gateKey, missingEvidenceCodes) {
  return {
    gateKey,
    reasonCode: 'missing_evidence',
    missingEvidenceCodes,
    protection: 'soft',
  };
}

function protectedGate(gateKey, missingEvidenceCodes) {
  return {
    gateKey,
    reasonCode: 'missing_evidence',
    missingEvidenceCodes,
    protection: 'protected',
  };
}

function stateWithExhaustedRepairBudget(routeId) {
  return {
    ...createGateControllerState({ routeId }),
    phase: 'collecting',
    budget: {
      repairUsed: 2,
      repairMax: 2,
      terminalUsed: 0,
      terminalMax: 1,
    },
  };
}
