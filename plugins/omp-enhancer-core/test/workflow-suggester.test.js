import test from 'node:test';
import assert from 'node:assert/strict';

import { suggestWorkflowCandidates } from '../src/workflow-suggester.js';

test('simple answer operation suggests agentic.simple', () => {
  const result = suggestWorkflowCandidates({
    operation: 'answer',
    complexity: 'simple',
  });
  assert.ok(result.candidates.includes('agentic.simple'));
  assert.equal(result.languageHint, null);
});

test('Chinese writing task suggests writing.zh with language hint', () => {
  const result = suggestWorkflowCandidates({
    domains: ['writing'],
    operation: 'create',
    language: 'zh',
  });
  assert.ok(result.candidates.includes('writing.zh'));
  assert.ok(result.languageHint, 'should have a language hint');
  assert.match(result.languageHint, /language=zh/);
  assert.match(result.languageHint, /skip writing\.pending/);
});

test('English writing task suggests writing.en with language hint', () => {
  const result = suggestWorkflowCandidates({
    domains: ['writing'],
    operation: 'create',
    language: 'en',
  });
  assert.ok(result.candidates.includes('writing.en'));
  assert.ok(result.languageHint);
  assert.match(result.languageHint, /language=en/);
  assert.match(result.languageHint, /skip writing\.pending/);
});

test('unknown language with writingSourcePending suggests writing.pending', () => {
  const result = suggestWorkflowCandidates({
    domains: ['writing'],
    operation: 'create',
    language: 'unknown',
    writingSourcePending: true,
  });
  assert.ok(result.candidates.includes('writing.pending'));
  assert.equal(result.languageHint, null);
});

test('code modify operation suggests code.dev', () => {
  const result = suggestWorkflowCandidates({
    domains: ['code'],
    operation: 'modify',
  });
  assert.ok(result.candidates.includes('code.dev'));
});

test('empty taskDescriptor suggests general.subagent', () => {
  const result = suggestWorkflowCandidates({});
  assert.deepEqual(result.candidates, ['general.subagent']);
  assert.equal(result.languageHint, null);
  assert.equal(result.rationale, 'no specific domain match');
});

test('security domain suggests security.review', () => {
  const result = suggestWorkflowCandidates({
    domains: ['security'],
    operation: 'inspect',
  });
  assert.ok(result.candidates.includes('security.review'));
});

test('visual domain suggests design.visual', () => {
  const result = suggestWorkflowCandidates({
    domains: ['visual'],
    operation: 'create',
  });
  assert.ok(result.candidates.includes('design.visual'));
});

test('writing domain includes writing.latex as add-on candidate', () => {
  const result = suggestWorkflowCandidates({
    domains: ['writing'],
    operation: 'create',
    language: 'en',
  });
  assert.ok(result.candidates.includes('writing.latex'));
});

test('candidates are capped at 5', () => {
  const result = suggestWorkflowCandidates({
    domains: ['writing', 'code'],
    operation: 'modify',
    language: 'en',
  });
  assert.ok(result.candidates.length <= 5);
});

test('null/undefined taskDescriptor fields do not throw', () => {
  assert.doesNotThrow(() => suggestWorkflowCandidates(null));
  assert.doesNotThrow(() => suggestWorkflowCandidates(undefined));
  assert.doesNotThrow(() => suggestWorkflowCandidates({ domains: null, operation: undefined }));
});

test('network diagnose operation suggests network.debug', () => {
  const result = suggestWorkflowCandidates({
    domains: ['network'],
    operation: 'diagnose',
  });
  assert.ok(result.candidates.includes('network.debug'));
});

test('network inspect operation suggests network.review', () => {
  const result = suggestWorkflowCandidates({
    domains: ['network'],
    operation: 'inspect',
  });
  assert.ok(result.candidates.includes('network.review'));
});

test('database with workspaceWrite suggests database.change', () => {
  const result = suggestWorkflowCandidates({
    domains: ['database'],
    operation: 'modify',
    constraints: { workspaceWrite: 'required' },
  });
  assert.ok(result.candidates.includes('database.change'));
});

test('database without workspaceWrite suggests database.review', () => {
  const result = suggestWorkflowCandidates({
    domains: ['database'],
    operation: 'inspect',
  });
  assert.ok(result.candidates.includes('database.review'));
});

test('facts domain with answer operation suggests factcheck.document', () => {
  const result = suggestWorkflowCandidates({
    domains: ['facts'],
    operation: 'answer',
  });
  assert.ok(result.candidates.includes('factcheck.document'));
});

test('release operation suggests release.publish', () => {
  const result = suggestWorkflowCandidates({
    operation: 'release',
  });
  assert.ok(result.candidates.includes('release.publish'));
});

test('ml debug operation suggests ml.debug', () => {
  const result = suggestWorkflowCandidates({
    domains: ['ml'],
    operation: 'modify',
  });
  assert.ok(result.candidates.includes('ml.debug'));
});

test('writing task with convert kind suggests doc.convert.word', () => {
  const result = suggestWorkflowCandidates({
    domains: ['writing'],
    operation: 'create',
    writingTaskKind: 'convert',
    language: 'en',
  });
  assert.ok(result.candidates.includes('doc.convert.word'));
});

test('non-simple code answer does not suggest agentic.simple', () => {
  const result = suggestWorkflowCandidates({
    domains: ['code'],
    operation: 'answer',
    complexity: 'broad',
  });
  assert.ok(!result.candidates.includes('agentic.simple'));
});
