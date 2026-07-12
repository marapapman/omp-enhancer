import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import registerCoreEnhancer from '../index.js';

const LEGACY_STATE = JSON.parse(
  readFileSync(new URL('./fixtures/state-v0.1.74.json', import.meta.url), 'utf8'),
);

const ADVISORY_STATE_KEYS = [
  'classifierAttempted',
  'claimedSkills',
  'completedRoles',
  'inspectionCalls',
  'lastPrompt',
  'lastRoute',
  'lastRouteProbe',
  'lastSkillUsage',
  'lastSubagentUsage',
  'observedSkills',
  'routeStartedAt',
  'schemaVersion',
  'tasks',
  'taskSequence',
].sort();

const LEGACY_ENFORCEMENT_FIELDS = [
  'evidence',
  'gates',
  'gateController',
  'gateRecovery',
  'pendingSmartGate',
  'smartGate',
  'smartGateCompletionBypasses',
  'actionBoundary',
  'exclusiveToolState',
  'loopGuard',
  'classifierPreflight',
];

test('migrates v0.1.74 route, skill claims, and task diagnostics into advisory schema v3', async () => {
  const fixtureWithUnknownFields = structuredClone(LEGACY_STATE);
  fixtureWithUnknownFields.futureControllerState = { mode: 'future-only' };
  fixtureWithUnknownFields.evidence.futureEvidence = { ignored: true };
  fixtureWithUnknownFields.gates = { release: { open: true } };
  fixtureWithUnknownFields.gateController = { schemaVersion: 2, continuationCount: 3 };
  fixtureWithUnknownFields.actionBoundary = { denialCount: 2, terminal: true };
  fixtureWithUnknownFields.exclusiveToolState = { exhausted: true };
  const entries = [coreStateEntry(fixtureWithUnknownFields)];
  const pi = new FakePi(entries);
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries);

  const status = await tool(pi, 'omp_core_subagent_status').execute(
    'legacy-status',
    {},
    undefined,
    undefined,
    ctx,
  );
  const migrated = latestCoreState(pi.entries);

  assert.equal(status.details.status.route, 'bug-audit');
  assert.equal(status.details.status.mode, 'advisory');
  assert.equal(status.details.status.auto_continue, false);
  assert.deepEqual(status.details.status.suggested_skills, migrated.lastRoute.routePlan.skills);
  assert.deepEqual(status.details.status.suggested_tools, migrated.lastRoute.routePlan.tools);
  assert.deepEqual(
    status.details.status.suggested_roles.map(({ agent }) => agent),
    migrated.lastRoute.routePlan.roles.map(({ agent }) => agent),
  );
  assert.deepEqual(status.details.status.observed_skills, []);
  assert.deepEqual(status.details.status.claimed_skills, LEGACY_STATE.evidence.loadedSkills);
  assert.deepEqual(status.details.status.completed_roles, LEGACY_STATE.evidence.taskSubagents);
  assert.equal(status.details.status.tasks.length, 1);
  assert.equal(status.details.status.tasks[0].id, 'call-legacy-subagent');
  assert.equal(status.details.status.tasks[0].status, 'completed');

  assertAdvisorySnapshot(migrated);
  assert.equal(migrated.lastRoute.intent, LEGACY_STATE.lastRoute.intent);
  assert.equal(migrated.lastRoute.advisoryOnly, true);
  assert.equal(migrated.lastRoute.autoContinue, false);
  assert.equal(migrated.lastRoute.routePlan.version, 2);
  assert.equal(migrated.lastRoute.routePlan.mode, 'advisory');
  assert.equal(migrated.lastRoute.routePlan.autoContinue, false);
  assert.ok(migrated.lastRoute.routePlan.skills.length > 0);
  assert.equal(migrated.lastPrompt, LEGACY_STATE.lastPrompt);
  assert.deepEqual(migrated.observedSkills, []);
  assert.deepEqual(migrated.claimedSkills, LEGACY_STATE.evidence.loadedSkills);
  assert.deepEqual(migrated.completedRoles, LEGACY_STATE.evidence.taskSubagents);
  assert.equal(migrated.tasks.length, 1);
  assert.deepEqual(
    { id: migrated.tasks[0].id, status: migrated.tasks[0].status },
    { id: 'call-legacy-subagent', status: 'completed' },
  );
  assert.equal('futureControllerState' in migrated, false, 'unknown top-level state must not be persisted');
});

test('new snapshots default to an empty advisory workflow state', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries);

  const status = await tool(pi, 'omp_core_subagent_status').execute(
    'minimal-legacy-status',
    {},
    undefined,
    undefined,
    ctx,
  );
  assert.equal(status.details.status.mode, 'advisory');
  assert.equal(status.details.status.auto_continue, false);
  assert.equal(status.details.status.route, 'none');
  assert.equal(status.details.status.active_route, 'none');
  assert.deepEqual(status.details.status.suggested_skills, []);
  assert.deepEqual(status.details.status.suggested_tools, []);
  assert.deepEqual(status.details.status.suggested_roles, []);
  assert.deepEqual(status.details.status.observed_skills, []);
  assert.deepEqual(status.details.status.claimed_skills, []);
  assert.deepEqual(status.details.status.completed_roles, []);
  assert.deepEqual(status.details.status.tasks, []);

  const migrated = latestCoreState(pi.entries);

  assertAdvisorySnapshot(migrated);
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.lastRoute, null);
  assert.equal(migrated.lastPrompt, '');
  assert.equal(migrated.routeStartedAt, 0);
  assert.equal(migrated.lastRouteProbe, null);
  assert.equal(migrated.lastSkillUsage, null);
  assert.equal(migrated.lastSubagentUsage, null);
  assert.equal(migrated.classifierAttempted, false);
  assert.deepEqual(migrated.observedSkills, []);
  assert.deepEqual(migrated.claimedSkills, []);
  assert.deepEqual(migrated.tasks, []);
  assert.deepEqual(migrated.completedRoles, []);
  assert.equal(migrated.taskSequence, 0);
  assert.equal(migrated.inspectionCalls, 0);
});

function assertAdvisorySnapshot(snapshot) {
  assert.equal(snapshot.schemaVersion, 3);
  assert.deepEqual(Object.keys(snapshot).sort(), ADVISORY_STATE_KEYS);
  for (const field of LEGACY_ENFORCEMENT_FIELDS) {
    assert.equal(field in snapshot, false, `${field} must not be serialized in advisory schema v3`);
  }
}

function coreStateEntry(data) {
  return { type: 'custom', customType: 'omp-enhancer-core.state', data };
}

function latestCoreState(entries) {
  const entry = entries.findLast((candidate) => candidate.customType === 'omp-enhancer-core.state');
  assert.ok(entry, 'expected a persisted omp-enhancer-core.state entry');
  return entry.data;
}

function tool(pi, name) {
  const found = pi.tools.get(name);
  assert.ok(found, `missing registered tool ${name}`);
  return found;
}

class FakePi {
  constructor(entries = []) {
    this.entries = entries;
    this.tools = new Map();
    this.eventHandlers = [];
    const z = fakeZod();
    this.z = z;
    this.zod = { z };
  }

  setLabel() {}

  registerTool(toolDefinition) {
    this.tools.set(toolDefinition.name, toolDefinition);
  }

  on(eventName, handler) {
    this.eventHandlers.push({ event: eventName, handler });
  }

  appendEntry(customType, data) {
    this.entries.push({ type: 'custom', customType, data });
  }
}

function extensionContext(entries) {
  return {
    cwd: process.cwd(),
    sessionManager: { getBranch: () => entries },
    ui: { notify: () => undefined },
    hasUI: false,
  };
}

function fakeZod() {
  const withOptional = (schema) => ({ ...schema, optional: () => ({ type: 'optional', schema }) });
  return {
    object: (shape) => withOptional({ type: 'object', shape }),
    string: () => withOptional({ type: 'string' }),
    boolean: () => withOptional({ type: 'boolean' }),
    array: (schema) => withOptional({ type: 'array', schema }),
    enum: (values) => withOptional({ type: 'enum', values }),
    optional: (schema) => ({ type: 'optional', schema }),
  };
}
