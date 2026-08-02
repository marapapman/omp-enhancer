import test from 'node:test';
import assert from 'node:assert/strict';

import { suggestWorkflowCandidates } from '../src/workflow-suggester.js';

test('simple answer operation returns empty candidates (no workflow needed)', () => {
  const result = suggestWorkflowCandidates({
    operation: 'answer',
    complexity: 'simple',
  });
  assert.deepEqual(result.candidates, []);
  assert.ok(result.rationale.length > 0);
});

test('code modify operation suggests code', () => {
  const result = suggestWorkflowCandidates({
    domains: ['code'],
    operation: 'modify',
  });
  assert.deepEqual(result.candidates, ['code']);
  assert.match(result.rationale, /code/u);
});

test('writing task suggests writing without a language hint', () => {
  const result = suggestWorkflowCandidates({
    domains: ['writing'],
    operation: 'create',
    language: 'zh',
  });
  assert.deepEqual(result.candidates, ['writing']);
  assert.equal(Object.hasOwn(result, 'languageHint'), false);
});

test('facts domain with answer operation suggests research', () => {
  const result = suggestWorkflowCandidates({
    domains: ['facts'],
    operation: 'answer',
  });
  assert.deepEqual(result.candidates, ['research']);
});

test('facts domain with inspect operation suggests research', () => {
  const result = suggestWorkflowCandidates({
    domains: ['facts'],
    operation: 'inspect',
  });
  assert.deepEqual(result.candidates, ['research']);
});

test('facts and security together suggest operations (security wins)', () => {
  for (const operation of ['answer', 'inspect']) {
    const result = suggestWorkflowCandidates({
      domains: ['facts', 'security'],
      operation,
    });
    assert.deepEqual(result.candidates, ['operations'], operation);
  }
});

test('writing and security together suggest operations (security wins)', () => {
  for (const operation of ['modify', 'inspect', 'create']) {
    const result = suggestWorkflowCandidates({
      domains: ['writing', 'security'],
      operation,
    });
    assert.deepEqual(result.candidates, ['operations'], operation);
  }
});

test('security domain suggests operations', () => {
  const result = suggestWorkflowCandidates({
    domains: ['security'],
    operation: 'inspect',
  });
  assert.deepEqual(result.candidates, ['operations']);
});

test('visual domain suggests visual', () => {
  const result = suggestWorkflowCandidates({
    domains: ['visual'],
    operation: 'create',
  });
  assert.deepEqual(result.candidates, ['visual']);
});

test('network domain suggests operations', () => {
  for (const operation of ['diagnose', 'inspect', 'modify']) {
    const result = suggestWorkflowCandidates({
      domains: ['network'],
      operation,
    });
    assert.deepEqual(result.candidates, ['operations'], operation);
  }
});

test('database domain suggests code', () => {
  for (const operation of ['modify', 'inspect']) {
    const result = suggestWorkflowCandidates({
      domains: ['database'],
      operation,
    });
    assert.deepEqual(result.candidates, ['code'], operation);
  }
});

test('ml domain suggests code', () => {
  const result = suggestWorkflowCandidates({
    domains: ['ml'],
    operation: 'modify',
  });
  assert.deepEqual(result.candidates, ['code']);
});

test('release operation suggests operations', () => {
  const result = suggestWorkflowCandidates({
    operation: 'release',
  });
  assert.deepEqual(result.candidates, ['operations']);
});

test('empty taskDescriptor suggests operations as the default', () => {
  const result = suggestWorkflowCandidates({});
  assert.deepEqual(result.candidates, ['operations']);
  assert.equal(result.rationale, 'no specific domain match');
});

test('code and writing together suggest writing only (code is suppressed when writing is present)', () => {
  const result = suggestWorkflowCandidates({
    domains: ['writing', 'code'],
    operation: 'modify',
    language: 'en',
  });
  assert.deepEqual(result.candidates, ['writing']);
});

test('candidates are capped at 5 and contain no old workflow ids', () => {
  const result = suggestWorkflowCandidates({
    domains: ['code', 'database', 'ml', 'network', 'security', 'visual', 'facts'],
    operation: 'modify',
  });
  assert.ok(result.candidates.length <= 5);
  for (const id of result.candidates) {
    assert.ok(['code', 'writing', 'research', 'visual', 'operations'].includes(id), id);
  }
});

test('null/undefined taskDescriptor fields do not throw', () => {
  assert.doesNotThrow(() => suggestWorkflowCandidates(null));
  assert.doesNotThrow(() => suggestWorkflowCandidates(undefined));
  assert.doesNotThrow(() => suggestWorkflowCandidates({ domains: null, operation: undefined }));
});

test('non-simple code answer does not return empty candidates', () => {
  const result = suggestWorkflowCandidates({
    domains: ['code'],
    operation: 'answer',
    complexity: 'broad',
  });
  assert.deepEqual(result.candidates, ['code']);
});
