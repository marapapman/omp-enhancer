import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTaskShapePrompt,
  buildDynamicReviewBudgetPrompt,
  resolveDynamicReviewBudget,
} from '../src/review-budget.js';
import { describeNaturalLanguageTask } from '../src/task-descriptor.js';

test('review context exposes task facts without calculating a reviewer or fork quota', () => {
  const cases = [
    {
      descriptor: {
        operation: 'answer', domains: ['general'], complexity: 'simple',
        risk: { level: 'low', flags: [] }, constraints: {},
      },
      applicability: 'primary-task-only',
    },
    {
      descriptor: {
        operation: 'execute', domains: ['tests'], complexity: 'focused',
        risk: { level: 'medium', flags: ['test-execution'] }, constraints: {},
      },
      applicability: 'primary-task-only',
    },
    {
      descriptor: {
        operation: 'modify', domains: ['code', 'tests'], complexity: 'broad',
        risk: { level: 'medium', flags: ['workspace-write', 'test-execution'] }, constraints: {},
      },
      applicability: 'independent-review-advisory',
    },
    {
      descriptor: {
        operation: 'release', domains: ['code', 'tests', 'security', 'plugin'], complexity: 'broad',
        risk: { level: 'critical', flags: ['external-write', 'security-sensitive'] }, constraints: {},
      },
      applicability: 'independent-review-advisory',
    },
    {
      descriptor: {
        operation: 'inspect', domains: ['code', 'security'], complexity: 'broad',
        risk: { level: 'high', flags: ['security-sensitive'] }, constraints: {},
      },
      applicability: 'primary-task-only',
    },
  ];

  for (const { descriptor, applicability } of cases) {
    const context = resolveDynamicReviewBudget(descriptor, { nativeConcurrencyCapacity: 4 });
    assert.equal(context.reviewApplicability, applicability);
    assert.equal(Object.hasOwn(context, 'reviewerLaneSuggestion'), false);
    assert.equal(Object.hasOwn(context, 'heuristicReviewerLaneSuggestion'), false);
    assert.equal(Object.hasOwn(context, 'nativeCapConstrainedSuggestion'), false);
  }
});

test('review context honors native and user boundaries without choosing width', () => {
  const descriptor = {
    operation: 'release',
    domains: ['code', 'tests', 'security', 'plugin'],
    complexity: 'broad',
    risk: { level: 'critical', flags: ['external-write', 'security-sensitive'] },
  };

  const noSubagents = resolveDynamicReviewBudget({
    ...descriptor,
    constraints: { subagents: 'forbidden' },
  }, { nativeConcurrencyCapacity: 4 });
  assert.equal(noSubagents.reviewApplicability, 'subagents-forbidden');
  assert.equal(noSubagents.nativeConcurrencyCapacity, 4);

  const noReviewer = resolveDynamicReviewBudget({
    ...descriptor,
    constraints: { independentReview: 'forbidden' },
  }, { nativeConcurrencyCapacity: 4 });
  assert.equal(noReviewer.reviewApplicability, 'user-forbidden');

  const required = resolveDynamicReviewBudget({
    operation: 'modify',
    domains: ['code'],
    complexity: 'focused',
    risk: { level: 'low', flags: ['workspace-write'] },
    constraints: { independentReview: 'required' },
  }, { nativeConcurrencyCapacity: 2 });
  assert.equal(required.reviewApplicability, 'independent-review-advisory');
  assert.equal(required.independentReview, 'required');
  assert.equal(required.nativeConcurrencyCapacity, 2);
});

test('response-only writing omits review context while an explicit review request remains advisory', () => {
  for (const prompt of [
    'Draft a concise email replying to Bob.',
    '请写一封简短的邮件回复用户。',
    'Write a full research report with citations.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.ok(descriptor.domains.includes('writing'), prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'forbidden', prompt);
    assert.equal(buildDynamicReviewBudgetPrompt({ taskDescriptor: descriptor }), '', prompt);
  }

  const required = describeNaturalLanguageTask({
    prompt: 'Draft a concise email replying to Bob. Independent review is required.',
  });
  const context = buildDynamicReviewBudgetPrompt({ taskDescriptor: required });
  assert.match(context, /COMPAT_REVIEW_CONTEXT/);
  assert.match(context, /no count\/Agent\/fork/i);
});

test('a focused one-dimensional edit does not receive extra review context', () => {
  for (const prompt of [
    'Fix one typo in src/a.js.',
    'Fix one typo in README.md.',
    'Fix one typo in docs/a.md.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'modify', prompt);
    assert.equal(descriptor.complexity, 'focused', prompt);
    assert.equal(buildDynamicReviewBudgetPrompt({ taskDescriptor: descriptor }), '', prompt);
  }
});

test('review prompt is compact and contains no reviewer or fork quota', () => {
  const prompt = buildDynamicReviewBudgetPrompt({
    taskDescriptor: {
      operation: 'modify',
      domains: ['code', 'tests'],
      complexity: 'broad',
      risk: { level: 'medium', flags: ['workspace-write', 'test-execution'] },
      constraints: {},
    },
    nativeConcurrencyCapacity: 4,
  });

  assert.match(prompt, /COMPAT_REVIEW_CONTEXT \(soft, no quota\)/);
  assert.match(prompt, /FACTS: operation=modify;complexity=broad;risk=medium;domains=code,tests;review=correctness,test-adequacy/i);
  assert.match(prompt, /existing checkpoint/i);
  assert.match(prompt, /selects no count\/Agent\/fork\/batch\/dispatch\/permission\/completion condition/i);
  assert.doesNotMatch(prompt, /suggested=|within-native-cap|native-cap=|reviewerLaneSuggestion/i);
  assert.ok(prompt.length < 900, `prompt length=${prompt.length}`);
});

test('multi-target task-shape prompt exposes observed facts without choosing delegation', () => {
  const descriptor = describeNaturalLanguageTask({
    prompt: 'Independently audit src/a.js and src/b.js for correctness and security risks. For each file provide concrete evidence and one countercheck, then compare them. Do not modify files, run tests, or use the network.',
  });
  const prompt = buildTaskShapePrompt(descriptor);

  assert.match(prompt, /COMPAT_TASK_SHAPE_FACTS/);
  assert.match(prompt, /operation=inspect; complexity=broad/);
  assert.match(prompt, /exact-inspection-targets=2/);
  assert.match(prompt, /independent-target-analysis=requested; per-target-evidence=requested; cross-target-comparison=requested/);
  assert.match(prompt, /seed candidate slices before project inspection/i);
  assert.match(prompt, /inspect enough local context.+dependencies.+exclusive write sets.+test seams.+assignment input complete before dispatch/i);
  assert.match(prompt, /Complete the explicit plan before project action/i);
  assert.match(prompt, /Target count is scope evidence, never a dispatch or fork-width decision/i);
  assert.doesNotMatch(prompt, /action=|default action|must delegate|required fork/i);
  assert.ok(prompt.length < 900, `prompt length=${prompt.length}`);

  const workflowPrompt = buildTaskShapePrompt(descriptor, { workflowSkillVisible: true });
  assert.match(
    workflowPrompt,
    /Complete DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY before project action/i,
  );
  assert.doesNotMatch(workflowPrompt, /three staged workflow phases/i);
  assert.doesNotMatch(workflowPrompt, /hard router|hard gate|block: true|continue: true|required fork|must delegate/i);
});

test('task-shape prompt stays absent for one target, lookup wording, and source-text paths', () => {
  for (const prompt of [
    'Review src/a.js and report findings only.',
    'Look up the version in package.json and the license in LICENSE.',
    'Polish this sentence: "Independently audit src/a.js and src/b.js, then compare them."',
  ]) {
    assert.equal(buildTaskShapePrompt(describeNaturalLanguageTask({ prompt })), '', prompt);
  }
});

test('review prompt is omitted only when review advice is inapplicable', () => {
  for (const descriptor of [
    {
      operation: 'answer', domains: ['general'], complexity: 'simple',
      risk: { level: 'low', flags: [] }, constraints: {},
    },
    {
      operation: 'execute', domains: ['tests'], complexity: 'focused',
      risk: { level: 'medium', flags: ['test-execution'] }, constraints: {},
    },
    {
      operation: 'modify', domains: ['code'], complexity: 'broad',
      risk: { level: 'medium', flags: ['workspace-write'] },
      constraints: { independentReview: 'forbidden' },
    },
  ]) {
    assert.equal(buildDynamicReviewBudgetPrompt({ taskDescriptor: descriptor }), '');
  }

  const capacityUnknown = buildDynamicReviewBudgetPrompt({
    taskDescriptor: {
      operation: 'modify', domains: ['code', 'tests'], complexity: 'broad',
      risk: { level: 'medium', flags: ['workspace-write'] }, constraints: {},
    },
  });
  assert.match(capacityUnknown, /no count\/Agent\/fork/i);
  assert.doesNotMatch(capacityUnknown, /native-cap=/i);
});
