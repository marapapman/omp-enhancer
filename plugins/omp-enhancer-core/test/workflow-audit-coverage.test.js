import test from 'node:test';
import assert from 'node:assert/strict';

import { workflowDefinitions } from '../src/workflows/catalog.js';

const AUDITOR_ROLES = new Set([
  'reviewer',
  'visioner',
  'fact-reviewer',
  'fact-cross-checker',
  'ecc-network-config-reviewer',
  'ecc-security-reviewer',
  'ecc-opensource-sanitizer',
  'zh-checker',
  'checker',
]);

test('every workflow definition has a non-empty suggestedFlow and an auditor role candidate', () => {
  assert.equal(workflowDefinitions.length, 5);
  assert.ok(workflowDefinitions.length > 0, 'expected the five consolidated workflows');

  for (const definition of workflowDefinitions) {
    assert.ok(
      Array.isArray(definition.suggestedFlow) && definition.suggestedFlow.length > 0,
      `${definition.id}: expected a non-empty suggestedFlow`,
    );
    const auditorRoles = definition.roles.filter((role) => AUDITOR_ROLES.has(role));
    assert.ok(
      auditorRoles.length > 0,
      `${definition.id}: expected at least one auditor role candidate (got ${definition.roles.join(', ')})`,
    );
    assert.ok(
      definition.suggestedFlow.some((line) => /review|check|audit|verify/i.test(line)),
      `${definition.id}: suggestedFlow must describe a review/audit phase`,
    );
  }
});

test('each consolidated workflow names its audit owner in suggestedFlow or roles', () => {
  const expected = {
    code: ['reviewer'],
    writing: ['checker', 'zh-checker'],
    research: ['fact-reviewer', 'fact-cross-checker'],
    visual: ['visioner'],
    operations: ['reviewer', 'ecc-security-reviewer'],
  };

  for (const [id, auditors] of Object.entries(expected)) {
    const definition = workflowDefinitions.find((candidate) => candidate.id === id);
    assert.ok(definition, `missing workflow ${id}`);
    for (const auditor of auditors) {
      assert.ok(definition.roles.includes(auditor), `${id} must keep ${auditor} among role candidates`);
    }
  }
});
