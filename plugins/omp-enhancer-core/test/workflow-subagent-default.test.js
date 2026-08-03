import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKFLOW_CATALOG_VERSION,
  workflowCatalog,
  workflowDefinitions,
} from '../src/workflows/catalog.js';
import { defineWorkflowCatalog } from '../src/workflows/schema.js';

test('every workflow definition exposes a non-empty suggestedFlow and a non-empty roles list', () => {
  assert.equal(WORKFLOW_CATALOG_VERSION, 32);
  assert.equal(workflowDefinitions.length, 5);

  for (const definition of workflowDefinitions) {
    assert.ok(
      Array.isArray(definition.suggestedFlow)
        && definition.suggestedFlow.length > 0
        && definition.suggestedFlow.every((line) => typeof line === 'string' && line.length > 0),
      `${definition.id} must carry a non-empty suggestedFlow of strings`,
    );
    assert.ok(
      Array.isArray(definition.roles) && definition.roles.length > 0,
      `${definition.id} must carry a non-empty roles candidate list`,
    );
    assert.equal(workflowCatalog[definition.id].suggestedFlow.length, definition.suggestedFlow.length, definition.id);
    assert.deepEqual(workflowCatalog[definition.id].roles, definition.roles, definition.id);
  }
});

test('the code workflow names the analyzer agent as a role candidate', () => {
  assert.ok(workflowCatalog.code.roles.includes('analyzer'));
  assert.deepEqual(workflowCatalog.code.roles, ['analyzer', 'task', 'reviewer', 'scout', 'librarian']);
});

test('the schema rejects the removed delegation-era fields', () => {
  for (const extra of [
    { delegationDefault: 'subagent-driven' },
    { delegation: ['step-1: task owns the bounded assignment'] },
    { steps: [{ id: 'step-1', text: 'Do the step.' }] },
    { composeWith: ['code'] },
    { qualityChecks: ['bounded evidence'] },
    { riskNotes: ['bounded risk'] },
  ]) {
    assert.throws(
      () => defineWorkflowCatalog([[workflowFixture(extra)]]),
      /unknown field/iu,
      `schema must reject ${Object.keys(extra)[0]}`,
    );
  }
});

test('the schema accepts the simplified advisory fields only', () => {
  const [definition] = defineWorkflowCatalog([[
    {
      id: 'advisory.test',
      chooseWhen: 'A simplified fixture needs normalization.',
      skills: ['code-development'],
      catalogSkills: [],
      roles: ['task', 'reviewer'],
      suggestedFlow: ['Analyze.', 'Execute.', 'Review.'],
      scopeNotes: ['Advisory only.'],
    },
  ]]);
  assert.equal(definition.id, 'advisory.test');
  assert.deepEqual(definition.roles, ['task', 'reviewer']);
  assert.deepEqual(definition.suggestedFlow, ['Analyze.', 'Execute.', 'Review.']);
  assert.deepEqual(definition.scopeNotes, ['Advisory only.']);
  assert.equal(Object.hasOwn(definition, 'delegationDefault'), false);
});

function workflowFixture(overrides = {}) {
  return {
    id: 'arbitrary.workflow',
    chooseWhen: 'A test fixture needs schema normalization.',
    skills: ['code-development'],
    catalogSkills: [],
    roles: ['task'],
    suggestedFlow: ['Perform the bounded fixture flow.'],
    scopeNotes: [],
    ...overrides,
  };
}
