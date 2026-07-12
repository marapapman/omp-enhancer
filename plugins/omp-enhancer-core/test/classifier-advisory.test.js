import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveClassificationRoute } from '../src/classifier.js';

function legacyClassification({ intent, language }) {
  return JSON.stringify({
    intent,
    secondaryIntents: [],
    language,
    confidence: 0.99,
    riskFlags: ['needs-writing-qa'],
    domainHints: ['writing artifact'],
    reason: 'Writing route suggestion from the classifier.',
  });
}

test('classifier language cannot resolve a body-less writing.pending route', () => {
  const result = resolveClassificationRoute({
    prompt: '请润色 tex/abstract.tex。',
    output: legacyClassification({ intent: 'writing.en', language: 'en' }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.fallbackRoute.intent, 'writing.pending');
  assert.equal(result.route.intent, 'writing.pending');
  assert.equal(result.route.taskDescriptor.language, 'unknown');
  assert.equal(result.route.taskDescriptor.writingSourcePending, true);
  assert.equal(result.route.routePlan.version, 2);
  assert.equal(result.route.routePlan.mode, 'advisory');
  assert.equal(result.route.routePlan.autoContinue, false);
  assert.ok(result.route.routePlan.qualityChecks.includes('detect-source-language'));
  assert.ok(!result.route.routePlan.skills.includes('writing-markdown-helper'));
  assert.equal(Object.hasOwn(result.route.routePlan, 'gateRequirements'), false);
});

test('classifier cannot override language detected from inline source text', () => {
  const result = resolveClassificationRoute({
    prompt: '请润色这段摘要：This paper presents an advisory workflow router.',
    output: legacyClassification({ intent: 'writing.zh', language: 'zh' }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.fallbackRoute.intent, 'writing.en');
  assert.equal(result.route.intent, 'writing.en');
  assert.equal(result.route.taskDescriptor.language, 'en');
  assert.equal(result.route.taskDescriptor.writingLanguageSource, 'inline-source');
  assert.ok(result.route.routePlan.skills.includes('writing-markdown-helper'));
  assert.ok(!result.route.routePlan.skills.includes('plain-chinese-writing'));
});

test('classifier RoutePlan merge keeps only advisory v2 resource fields', () => {
  const result = resolveClassificationRoute({
    prompt: 'Fix src/parser.js and run the focused parser tests.',
    output: JSON.stringify({
      operationHint: 'modify',
      domains: ['code', 'tests'],
      phaseHints: [
        { kind: 'modify', domain: 'code' },
        { kind: 'verify', domain: 'tests' },
        { kind: 'review', domain: 'code' },
      ],
      riskFlags: ['needs-tests', 'needs-review'],
      language: 'en',
      confidence: 0.9,
      reason: 'Implementation with focused verification.',
    }),
  });
  assert.equal(result.ok, true);
  const plan = result.route.routePlan;
  assert.deepEqual(Object.keys(plan).sort(), [
    'autoContinue',
    'legacyIntent',
    'mode',
    'qualityChecks',
    'riskNotes',
    'roles',
    'skills',
    'steps',
    'tools',
    'version',
    'workflowRoute',
  ]);
  assert.equal(plan.version, 2);
  assert.equal(plan.mode, 'advisory');
  assert.equal(plan.autoContinue, false);
  assert.deepEqual(result.route.requiredSkills, plan.skills);
  assert.deepEqual(result.route.requiredTools, plan.tools);
  assert.deepEqual(result.route.deprecatedAliases, ['requiredSkills', 'requiredTools', 'requiredSubagents']);
});
