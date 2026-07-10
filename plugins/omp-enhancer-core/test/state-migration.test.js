import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import registerCoreEnhancer from '../index.js';

const LEGACY_STATE = JSON.parse(
  readFileSync(new URL('./fixtures/state-v0.1.74.json', import.meta.url), 'utf8'),
);

test('restores and reserializes the v0.1.74 golden state without losing safety state', async () => {
  const fixtureWithUnknownFields = structuredClone(LEGACY_STATE);
  fixtureWithUnknownFields.futureControllerState = { mode: 'future-only' };
  fixtureWithUnknownFields.evidence.futureEvidence = { ignored: true };
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

  assert.equal(status.details.status.route, 'bug-audit');
  assert.equal(status.details.status.tasks.length, 1);
  assert.equal(status.details.status.tasks[0].id, 'call-legacy-subagent');

  await tool(pi, 'omp_core_validate_skill_usage').execute(
    'legacy-reserialize',
    { output: '', requiredSkills: [] },
    undefined,
    undefined,
    ctx,
  );
  const migrated = latestCoreState(pi.entries);

  assert.equal(migrated.lastRoute.intent, LEGACY_STATE.lastRoute.intent);
  assert.equal(migrated.lastPrompt, LEGACY_STATE.lastPrompt);
  assert.equal(migrated.pendingSmartGate.gateKey, LEGACY_STATE.pendingSmartGate.gateKey);
  assert.equal(migrated.evidence.testingGate, true);
  assert.equal(migrated.evidence.testingReport, true);
  assert.deepEqual(migrated.evidence.loadedSkills, LEGACY_STATE.evidence.loadedSkills);
  assert.deepEqual(migrated.evidence.forkedSubagents, LEGACY_STATE.evidence.forkedSubagents);
  assert.equal(migrated.loopGuard?.enabled, true, 'v0.1.74 loop protection must survive state migration');
  assert.equal(migrated.loopGuard?.currentRunId, LEGACY_STATE.loopGuard.currentRunId);
  assert.equal(migrated.gateController?.schemaVersion, 2);
  assert.equal(migrated.gateController?.budget.repairMax, 2);
  assert.equal(migrated.gateController?.budget.terminalMax, 1);
  assert.equal(migrated.gateController?.openGates['bug-audit:subagent']?.protection, 'soft');
  assert.equal(JSON.stringify(migrated.gateController).includes('OMP Enhancer Core subagent gate'), false);
  assert.equal('futureControllerState' in migrated, false, 'unknown top-level state must not be persisted');
  assert.equal('futureEvidence' in migrated.evidence, false, 'unknown evidence fields must not be persisted');
});

test('fills safe defaults when legacy snapshots omit optional fields', async () => {
  const entries = [coreStateEntry({
    lastRoute: {
      intent: 'unknown',
      agent: null,
      requiredSkills: [],
      requiredTools: [],
      requiredSubagents: [],
      source: 'natural-language',
    },
    evidence: {},
  })];
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
  assert.equal(status.details.status.route, 'unknown');
  assert.deepEqual(status.details.status.pending, []);
  assert.deepEqual(status.details.status.tasks, []);

  await tool(pi, 'omp_core_validate_skill_usage').execute(
    'minimal-legacy-reserialize',
    { output: '', requiredSkills: [] },
    undefined,
    undefined,
    ctx,
  );
  const migrated = latestCoreState(pi.entries);

  assert.equal(migrated.lastPrompt, '');
  assert.equal(migrated.routeStartedAt, 0);
  assert.equal(migrated.pendingSmartGate, null);
  assert.equal(migrated.smartGate, null);
  assert.deepEqual(migrated.smartGateCompletionBypasses, []);
  assert.deepEqual(migrated.gateRecovery, { attempts: [] });
  assert.equal(migrated.gateController?.schemaVersion, 2);
  assert.deepEqual(migrated.gateController?.openGates, {});
  assert.equal(migrated.loopGuard?.enabled, true, 'missing loop state must default to enabled protection');
  assert.equal(migrated.evidence.testingGate, false);
  assert.equal(migrated.evidence.testingReport, false);
  assert.deepEqual(migrated.evidence.loadedSkills, []);
  assert.deepEqual(migrated.evidence.pendingSubagents, []);
  assert.deepEqual(migrated.evidence.taskProgress, []);
});

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
