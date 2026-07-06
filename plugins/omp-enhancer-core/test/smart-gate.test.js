import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSmartGatePrompt,
  resolveSmartGateDecision,
  smartGateDefaults,
  smartGateSchema,
} from '../src/smart-gate.js';

test('buildSmartGatePrompt uses OMP Tiny and embeds the blocking rule gate', () => {
  const result = buildSmartGatePrompt({
    prompt: '请润色论文摘要。',
    route: {
      intent: 'writing.zh',
      agent: 'writing-helper.zh-writer',
      requiredSkills: ['plain-chinese-writing'],
      requiredTools: ['writing_quality_check'],
      requiredSubagents: [{ agent: 'zh-checker', requiredSkills: ['zh-writing-checkers'] }],
    },
    ruleGate: {
      gateKey: 'writing.zh:writing-qa',
      kind: 'workflow',
      context: 'OMP Enhancer Core gate is still open for this writing task.',
    },
    evidence: 'Tool failures: writing_quality_check x3',
    finalOutput: 'ZhCheckerFinal PASS 15/15.',
  });

  assert.equal(result.modelRole, 'tiny');
  assert.equal(result.model, smartGateDefaults.model);
  assert.equal(result.schema, smartGateSchema);
  assert.equal(result.gateKey, 'writing.zh:writing-qa');
  assert.match(result.prompt, /modelRoles\.tiny/);
  assert.match(result.prompt, /OMP Enhancer Core Smart Gate/);
  assert.match(result.prompt, /writing\.zh:writing-qa/);
  assert.match(result.prompt, /ZhCheckerFinal PASS/);
  assert.match(result.prompt, /Use verdict "blocked" only for real external blockers/);
  assert.match(result.prompt, /Do not use verdict "blocked" merely because the assistant asked whether to proceed/);
});

test('resolveSmartGateDecision accepts fenced high-confidence pass output', () => {
  const result = resolveSmartGateDecision({
    gateKey: 'writing.zh:writing-qa',
    output: [
      '```json',
      JSON.stringify({
        gate: 'writing.zh:writing-qa',
        verdict: 'pass',
        confidence: 0.88,
        satisfied: true,
        missing: [],
        actions: [],
        reason: 'Equivalent writing QA evidence is complete.',
      }),
      '```',
    ].join('\n'),
  });

  assert.equal(result.ok, true);
  assert.equal(result.accepted, true);
  assert.equal(result.decision.verdict, 'pass');
});

test('resolveSmartGateDecision does not accept needs-work or low-confidence pass as release', () => {
  const needsWork = resolveSmartGateDecision({
    gateKey: 'implementation-with-tests:testing',
    output: JSON.stringify({
      gate: 'implementation-with-tests:testing',
      verdict: 'needs-work',
      confidence: 0.91,
      satisfied: false,
      missing: ['test evidence'],
      actions: ['run omp_test_gate'],
      reason: 'Reviewer approval is not testing evidence.',
    }),
  });
  const lowConfidencePass = resolveSmartGateDecision({
    gateKey: 'implementation-with-tests:testing',
    output: JSON.stringify({
      gate: 'implementation-with-tests:testing',
      verdict: 'pass',
      confidence: 0.61,
      satisfied: true,
      missing: [],
      actions: [],
      reason: 'Weak evidence.',
    }),
  });

  assert.equal(needsWork.ok, true);
  assert.equal(needsWork.accepted, false);
  assert.equal(lowConfidencePass.ok, true);
  assert.equal(lowConfidencePass.accepted, false);
});

test('resolveSmartGateDecision demotes confirmation-wait blocked verdicts to needs-work', () => {
  const result = resolveSmartGateDecision({
    gateKey: 'diagnosis:workflow',
    output: JSON.stringify({
      gate: 'diagnosis:workflow',
      verdict: 'blocked',
      confidence: 0.89,
      satisfied: false,
      missing: ['user confirmation'],
      actions: ['ask whether to change code: 要我直接改吗'],
      reason: 'The assistant is waiting for the user confirmation before summarizing the factual errors.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.accepted, false);
  assert.equal(result.decision.verdict, 'needs-work');
  assert.equal(result.decision.satisfied, false);
  assert.match(result.decision.reason, /not a real external blocker/);
  assert.match(result.decision.actions.join('\n'), /deliver the focused answer directly/);
});

test('resolveSmartGateDecision preserves real external blocked verdicts', () => {
  const result = resolveSmartGateDecision({
    gateKey: 'release:push',
    output: JSON.stringify({
      gate: 'release:push',
      verdict: 'blocked',
      confidence: 0.93,
      satisfied: false,
      missing: ['GitHub API token'],
      actions: ['ask the user to provide a user-provided credential'],
      reason: 'Push verification cannot continue because the required API key is unavailable.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.accepted, false);
  assert.equal(result.decision.verdict, 'blocked');
  assert.deepEqual(result.decision.missing, ['GitHub API token']);
});

test('resolveSmartGateDecision rejects mismatched gate and unsupported fields', () => {
  const result = resolveSmartGateDecision({
    gateKey: 'writing.zh:writing-qa',
    output: JSON.stringify({
      gate: 'writing.zh:skill',
      verdict: 'pass',
      confidence: 0.95,
      satisfied: true,
      missing: [],
      actions: [],
      reason: 'Wrong gate.',
      extra: true,
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.accepted, false);
  assert.match(result.validation.errors.join('\n'), /Invalid gate/);
  assert.match(result.validation.errors.join('\n'), /Unsupported smart gate field/);
});
