import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDynamicReviewBudgetPrompt,
  resolveDynamicReviewBudget,
} from '../src/review-budget.js';
import { describeNaturalLanguageTask } from '../src/task-descriptor.js';

test('dynamic review budget scales only change-review work with observed difficulty and risk', () => {
  const cases = [
    {
      descriptor: {
        operation: 'answer', domains: ['general'], complexity: 'simple',
        risk: { level: 'low', flags: [] }, constraints: {},
      },
      suggestion: 0,
      applicability: 'primary-task-only',
    },
    {
      descriptor: {
        operation: 'execute', domains: ['tests'], complexity: 'focused',
        risk: { level: 'medium', flags: ['test-execution'] }, constraints: {},
      },
      suggestion: 0,
      applicability: 'primary-task-only',
    },
    {
      descriptor: {
        operation: 'modify', domains: ['code', 'tests'], complexity: 'focused',
        risk: { level: 'medium', flags: ['workspace-write', 'test-execution'] }, constraints: {},
      },
      suggestion: 1,
      applicability: 'independent-review-advisory',
    },
    {
      descriptor: {
        operation: 'modify', domains: ['code', 'tests'], complexity: 'broad',
        risk: { level: 'medium', flags: ['workspace-write', 'test-execution'] }, constraints: {},
      },
      suggestion: 2,
      applicability: 'independent-review-advisory',
    },
    {
      descriptor: {
        operation: 'release', domains: ['code', 'tests', 'security', 'plugin'], complexity: 'broad',
        risk: {
          level: 'critical',
          flags: ['external-write', 'security-sensitive', 'test-execution', 'workspace-write'],
        },
        constraints: {},
      },
      suggestion: 3,
      applicability: 'independent-review-advisory',
    },
    {
      descriptor: {
        operation: 'inspect', domains: ['code', 'tests', 'security'], complexity: 'broad',
        risk: { level: 'high', flags: ['security-sensitive'] }, constraints: {},
      },
      suggestion: 0,
      applicability: 'primary-task-only',
    },
  ];

  for (const { descriptor, suggestion, applicability } of cases) {
    const budget = resolveDynamicReviewBudget(descriptor);
    assert.equal(budget.reviewerLaneSuggestion, suggestion);
    assert.equal(budget.reviewApplicability, applicability);
  }
});

test('dynamic review budget honors subagent, reviewer, and native-capacity boundaries', () => {
  const highRiskRelease = {
    operation: 'release',
    domains: ['code', 'tests', 'security', 'plugin'],
    complexity: 'broad',
    risk: { level: 'critical', flags: ['external-write', 'security-sensitive'] },
  };

  const noSubagents = resolveDynamicReviewBudget({
    ...highRiskRelease,
    constraints: { subagents: 'forbidden' },
  }, { nativeConcurrencyCapacity: 4 });
  assert.equal(noSubagents.reviewerLaneSuggestion, 0);
  assert.equal(noSubagents.nativeCapConstrainedSuggestion, 0);

  const noReviewer = resolveDynamicReviewBudget({
    ...highRiskRelease,
    constraints: { subagents: 'unspecified', independentReview: 'forbidden' },
  }, { nativeConcurrencyCapacity: 4 });
  assert.equal(noReviewer.reviewerLaneSuggestion, 0);
  assert.equal(noReviewer.reviewApplicability, 'user-forbidden');

  const explicitlyRequired = resolveDynamicReviewBudget({
    operation: 'modify',
    domains: ['code'],
    complexity: 'focused',
    risk: { level: 'low', flags: ['workspace-write'] },
    constraints: { independentReview: 'required' },
  }, { nativeConcurrencyCapacity: 4 });
  assert.equal(explicitlyRequired.reviewerLaneSuggestion, 1);

  const capped = resolveDynamicReviewBudget({
    ...highRiskRelease,
    constraints: { subagents: 'unspecified' },
  }, { nativeConcurrencyCapacity: 2 });
  assert.equal(capped.heuristicReviewerLaneSuggestion, 3);
  assert.equal(capped.reviewerLaneSuggestion, 3);
  assert.equal(capped.nativeCapConstrainedSuggestion, 2);
});

test('a normalized focused mechanical write keeps the reviewer suggestion at zero', () => {
  for (const prompt of [
    'Fix one typo in src/a.js.',
    'Fix one typo in README.md.',
    'Fix one typo in docs/a.md.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'modify', prompt);
    assert.equal(descriptor.complexity, 'focused', prompt);
    assert.deepEqual(descriptor.risk, { level: 'medium', flags: ['workspace-write'] }, prompt);

    const budget = resolveDynamicReviewBudget(descriptor, { nativeConcurrencyCapacity: 4 });
    assert.equal(budget.reviewerLaneSuggestion, 0, prompt);
    assert.equal(buildDynamicReviewBudgetPrompt({
      taskDescriptor: descriptor,
      nativeConcurrencyCapacity: 4,
    }), '', prompt);
  }
});

test('response-only writing omits ordinary review advice while an explicit reviewer requirement wins', () => {
  for (const prompt of [
    'Draft a concise email replying to Bob.',
    '请写一封简短的邮件回复用户。',
    'Write a full research report with citations.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.ok(descriptor.domains.includes('writing'), prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'forbidden', prompt);
    const budget = resolveDynamicReviewBudget(descriptor, { nativeConcurrencyCapacity: 4 });
    assert.equal(budget.reviewApplicability, 'primary-task-only', prompt);
    assert.equal(budget.reviewerLaneSuggestion, 0, prompt);
    assert.equal(buildDynamicReviewBudgetPrompt({
      taskDescriptor: descriptor,
      nativeConcurrencyCapacity: 4,
    }), '', prompt);
  }

  const required = describeNaturalLanguageTask({
    prompt: 'Draft a concise email replying to Bob. Independent review is required.',
  });
  const requiredBudget = resolveDynamicReviewBudget(required, { nativeConcurrencyCapacity: 4 });
  assert.equal(required.constraints.independentReview, 'required');
  assert.equal(requiredBudget.reviewApplicability, 'independent-review-advisory');
  assert.equal(requiredBudget.reviewerLaneSuggestion, 1);
});

test('dynamic review prompt is compact, conditional, and explicit about advisory-only behavior', () => {
  const prompt = buildDynamicReviewBudgetPrompt({
    taskDescriptor: {
      operation: 'modify',
      domains: ['code', 'tests'],
      complexity: 'broad',
      risk: { level: 'medium', flags: ['workspace-write', 'test-execution'] },
      constraints: { subagents: 'unspecified' },
    },
    nativeConcurrencyCapacity: 4,
  });

  assert.match(prompt, /DEEPSEEK_DYNAMIC_REVIEW_BUDGET/);
  assert.match(prompt, /TASK_FACTS: operation=modify; complexity=broad; risk=medium; domains=code,tests/i);
  assert.match(prompt, /INITIAL_REVIEW_LANES: suggested=2; within-native-cap=2; native-cap=4/i);
  assert.match(prompt, /existing independent-review checkpoint/i);
  assert.match(prompt, /does not create, schedule, or move that checkpoint/i);
  assert.match(prompt, /zero is valid/i);
  assert.match(prompt, /only current Available Agent IDs/i);
  assert.match(prompt, /does not guarantee or require an actual task, fork, batch, or reviewer/i);
  assert.doesNotMatch(prompt, /Review changes from the user's perspective/i);
  assert.doesNotMatch(prompt, /SPECIALIST_PLANNING_FIT|generic planner/i);
  assert.ok(prompt.length < 2400, `prompt length=${prompt.length}`);
});

test('dynamic review prompt is omitted when review advice is inapplicable or native capacity is unconfirmed', () => {
  const cases = [
    {
      descriptor: {
        operation: 'answer', domains: ['general'], complexity: 'simple',
        risk: { level: 'low', flags: [] }, constraints: {},
      },
      capacity: 4,
    },
    {
      descriptor: {
        operation: 'execute', domains: ['tests'], complexity: 'focused',
        risk: { level: 'medium', flags: ['test-execution'] }, constraints: {},
      },
      capacity: 4,
    },
    {
      descriptor: {
        operation: 'modify', domains: ['code', 'tests'], complexity: 'broad',
        risk: { level: 'medium', flags: ['workspace-write'] }, constraints: {},
      },
      capacity: null,
    },
    {
      descriptor: {
        operation: 'modify', domains: ['code', 'tests'], complexity: 'broad',
        risk: { level: 'medium', flags: ['workspace-write'] },
        constraints: { independentReview: 'forbidden' },
      },
      capacity: 4,
    },
  ];

  for (const { descriptor, capacity } of cases) {
    assert.equal(buildDynamicReviewBudgetPrompt({
      taskDescriptor: descriptor,
      nativeConcurrencyCapacity: capacity,
    }), '');
  }
});
