import test from 'node:test';
import assert from 'node:assert/strict';

import { workflowCatalog } from '../src/workflows/catalog.js';
import { suggestWorkflowCandidates } from '../src/workflow-suggester.js';

test('the code workflow is the single home for database work', () => {
  const workflow = workflowCatalog.code;

  assert.ok(workflow);
  assert.match(workflow.chooseWhen, /\bdatabase\b/iu);
  assert.match(workflow.chooseWhen, /\bML\b/iu);
  assert.deepEqual(workflow.roles, ['analyzer', 'task', 'reviewer', 'scout', 'librarian']);
  assert.deepEqual(workflow.skills, ['code-development']);
});

test('database tasks suggest the code workflow regardless of mutation intent', () => {
  for (const operation of ['modify', 'inspect', 'review', 'repair']) {
    const result = suggestWorkflowCandidates({
      domains: ['database'],
      operation,
      constraints: { workspaceWrite: 'required' },
    });
    assert.deepEqual(result.candidates, ['code'], operation);
  }
});

test('ml tasks suggest the code workflow', () => {
  const result = suggestWorkflowCandidates({
    domains: ['ml'],
    operation: 'debug',
  });
  assert.deepEqual(result.candidates, ['code']);
});
