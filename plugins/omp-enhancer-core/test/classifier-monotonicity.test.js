import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveClassificationRoute } from '../src/classifier.js';

function legacyOutput(overrides = {}) {
  return JSON.stringify({
    intent: 'implementation-with-tests',
    secondaryIntents: [],
    language: 'en',
    confidence: 0.96,
    riskFlags: ['needs-tests', 'needs-review'],
    domainHints: ['implementation'],
    reason: 'Classifier advisory suggestion.',
    ...overrides,
  });
}

test('classifier cannot relax explicit user scope in the deterministic descriptor', () => {
  const result = resolveClassificationRoute({
    prompt: 'Review src/parser.js only; do not modify files, run tests, use the network, use subagents, or publish.',
    output: legacyOutput({
      intent: 'implementation-with-tests',
      riskFlags: ['needs-tests', 'needs-subagents', 'release-or-push'],
    }),
  });
  const descriptor = result.route.taskDescriptor;
  assert.equal(descriptor.constraints.workspaceWrite, 'forbidden');
  assert.equal(descriptor.constraints.testExecution, 'forbidden');
  assert.equal(descriptor.constraints.networkAccess, 'forbidden');
  assert.equal(descriptor.constraints.externalWrite, 'forbidden');
  assert.equal(descriptor.constraints.subagents, 'forbidden');
  assert.ok(!result.route.routePlan.tools.some((tool) => /^omp_test_/i.test(tool)));
  assert.deepEqual(result.route.routePlan.roles, []);
});

test('classifier cannot replace a deterministic non-writing workflow with writing', () => {
  for (const [prompt, expectedIntent] of [
    ['Audit this authentication module for vulnerabilities.', 'security-review'],
    ['Publish the current plugin release and verify the version.', 'release'],
    ['Fix src/parser.js and run the focused tests.', 'implementation-with-tests'],
  ]) {
    const result = resolveClassificationRoute({
      prompt,
      output: legacyOutput({
        intent: 'writing.en',
        riskFlags: ['needs-writing-qa'],
        domainHints: ['report wording'],
      }),
    });
    assert.equal(result.route.intent, expectedIntent, prompt);
  }
});

test('classifier cannot downgrade security or release risk suggestions', () => {
  const security = resolveClassificationRoute({
    prompt: 'Audit this authentication module for vulnerabilities.',
    output: legacyOutput({ intent: 'unknown', riskFlags: [] }),
  }).route;
  assert.equal(security.intent, 'security-review');
  assert.ok(security.routePlan.skills.includes('security-review'));
  assert.ok(security.routePlan.qualityChecks.includes('security-evidence'));

  const release = resolveClassificationRoute({
    prompt: 'Publish the current plugin release and verify the version.',
    output: legacyOutput({ intent: 'unknown', riskFlags: [] }),
  }).route;
  assert.equal(release.intent, 'release');
  assert.ok(release.routePlan.qualityChecks.includes('post-action-verification'));
  assert.ok(release.routePlan.riskNotes.length > 0);
});

test('secondary classifier hints merge advisory resources without old gate fields', () => {
  const result = resolveClassificationRoute({
    prompt: 'Fix the authentication bug, add tests, and review the result.',
    output: legacyOutput({
      intent: 'implementation-with-tests',
      secondaryIntents: ['security-review'],
      riskFlags: ['needs-security-review', 'needs-tests', 'needs-review', 'needs-subagents'],
      domainHints: ['auth', 'tests'],
    }),
  });
  const plan = result.route.routePlan;
  assert.equal(plan.version, 2);
  assert.equal(plan.mode, 'advisory');
  assert.equal(plan.autoContinue, false);
  assert.ok(plan.skills.includes('security-review'));
  assert.ok(plan.qualityChecks.includes('security-evidence'));
  assert.equal(Object.hasOwn(plan, 'gateRequirements'), false);
  assert.equal(Object.hasOwn(plan, 'requiredSkills'), false);
  assert.equal(Object.hasOwn(plan, 'hardBlock'), false);
});

test('classifier RoutePlan merging deduplicates optional roles by actor identity', () => {
  const result = resolveClassificationRoute({
    prompt: 'Fix the authentication bug across multiple files, add tests, and use subagents.',
    output: legacyOutput({
      intent: 'implementation-with-tests',
      secondaryIntents: ['security-review'],
      riskFlags: ['needs-security-review', 'needs-tests', 'needs-review', 'needs-subagents'],
    }),
  });
  const names = result.route.routePlan.roles.map(({ agent }) => agent);
  assert.equal(new Set(names).size, names.length);
  for (const role of result.route.routePlan.roles) assert.ok(Array.isArray(role.skills));
});

test('descriptor hints preserve deterministic phases and produce advisory checks', () => {
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
      confidence: 0.91,
      reason: 'Focused implementation and verification.',
    }),
  });
  assert.equal(result.ok, true);
  assert.ok(result.route.routePlan.steps.some(({ kind, domain }) => kind === 'modify' && domain === 'code'));
  assert.ok(result.route.routePlan.steps.some(({ kind }) => kind === 'review'));
  assert.ok(result.route.routePlan.qualityChecks.includes('review-evidence'));
  assert.equal(Object.hasOwn(result.route.routePlan, 'gateRequirements'), false);
});

test('invalid classifier output preserves deterministic advisory route', () => {
  const result = resolveClassificationRoute({
    prompt: 'Audit this authentication module for vulnerabilities.',
    output: '{"intent":"release","confidence":"invalid"}',
  });
  assert.equal(result.ok, false);
  assert.equal(result.route.intent, 'security-review');
  assert.equal(result.route.routePlan.mode, 'advisory');
  assert.equal(result.route.routePlan.autoContinue, false);
});
