import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRoutePlan, compileTaskRoutePolicy } from '../src/route-policy.js';
import { describeNaturalLanguageTask, normalizeTaskDescriptor } from '../src/task-descriptor.js';

const CONNECTOR_PROMPTS = [
  'Send an email to alice@example.com.',
  'Post a Slack message to channel #ops.',
  'Create a Jira issue in project CORE.',
  'Upload report.pdf to Google Drive folder reports.',
  'Schedule an event on team@example.com calendar.',
  'Update Notion page roadmap.',
];

test('Chinese Slack target-before-action wording remains a connector action under a no-release constraint', () => {
  const prompt = '在 Slack 频道 #omp-e2e 发送消息 hello；不要发布。';
  const descriptor = describeNaturalLanguageTask({ prompt });
  assert.equal(descriptor.operation, 'execute');
  assert.deepEqual(descriptor.domains, ['general']);
  assert.equal(descriptor.constraints.externalWrite, 'required');
  assert.equal(descriptor.externalActionContract?.state, 'complete');
  assert.equal(descriptor.externalActionContract?.provider, 'slack');
  assert.deepEqual(descriptor.externalActionContract?.target, { kind: 'channel', value: 'omp-e2e' });
  assert.equal(descriptor.phases.some(({ kind }) => kind === 'release'), false);
});

test('complete reversible connector actions compile as advisory external execution rather than releases', () => {
  for (const prompt of CONNECTOR_PROMPTS) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'execute', prompt);
    assert.deepEqual(descriptor.domains, ['general'], prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'forbidden', prompt);
    assert.equal(descriptor.constraints.networkAccess, 'required', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'required', prompt);
    assert.equal(descriptor.externalActionContract?.state, 'complete', prompt);
    assert.deepEqual(descriptor.phases, [{ kind: 'execute', domain: 'general' }], prompt);
    assert.ok(!descriptor.phases.some(({ kind }) => kind === 'release'), prompt);
    assert.ok(descriptor.capabilities.includes('external.write'), prompt);

    const plan = buildRoutePlan(descriptor);
    assert.equal(plan.mode, 'advisory', prompt);
    assert.equal(plan.autoContinue, false, prompt);
    assert.ok(!plan.steps.some(({ kind }) => kind === 'release'), prompt);
    assert.ok(!plan.qualityChecks.includes('post-action-verification'), prompt);
    assert.match(plan.riskNotes.join(' '), /Confirm the external target/, prompt);
    const policy = compileTaskRoutePolicy(descriptor);
    assert.equal(policy.intent, 'unknown', prompt);
    assert.equal(policy.advisoryOnly, true, prompt);
    assert.equal(policy.autoContinue, false, prompt);
    assert.equal('hardBlock' in policy, false, prompt);
  }
});

test('incomplete and conflicting connector actions preserve authorization shape for one clarification boundary', () => {
  for (const { prompt, state } of [
    { prompt: 'Send an email.', state: 'incomplete' },
    { prompt: 'Post a Slack message.', state: 'incomplete' },
    { prompt: 'Send email to alice@example.com and bob@example.com.', state: 'conflicting' },
    { prompt: 'Send email to alice@example.com and post Slack message to #ops.', state: 'conflicting' },
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'execute', prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'forbidden', prompt);
    assert.equal(descriptor.constraints.networkAccess, 'required', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'required', prompt);
    assert.equal(descriptor.externalActionContract?.state, state, prompt);
    assert.deepEqual(descriptor.phases, [{ kind: 'execute', domain: 'general' }], prompt);
    const plan = buildRoutePlan(descriptor);
    assert.deepEqual(plan.steps, [{ kind: 'execute', domain: 'general' }], prompt);
    assert.ok(!plan.qualityChecks.includes('post-action-verification'), prompt);
    assert.match(plan.riskNotes.join(' '), /Confirm the external target/, prompt);
  }
});

test('post-action verification guidance is derived from a release step, not generic external-write capability', () => {
  const connector = normalizeTaskDescriptor({
    operation: 'execute',
    domains: ['general'],
    constraints: { workspaceWrite: 'forbidden', networkAccess: 'required', externalWrite: 'required' },
    capabilities: ['network.read', 'external.write', 'credentials'],
    phases: [{ kind: 'execute', domain: 'general' }],
    externalActionContract: describeNaturalLanguageTask({ prompt: CONNECTOR_PROMPTS[0] }).externalActionContract,
  });
  assert.ok(!buildRoutePlan(connector).qualityChecks.includes('post-action-verification'));

  const release = describeNaturalLanguageTask({ prompt: 'Publish package pkg@1.2.3 to npm.' });
  assert.ok(release.phases.some(({ kind }) => kind === 'release'));
  const releasePlan = buildRoutePlan(release);
  assert.ok(releasePlan.steps.some(({ kind }) => kind === 'release'));
  assert.ok(releasePlan.qualityChecks.includes('post-action-verification'));
});

test('irreversible connector deletion carries critical advisory risk guidance', () => {
  const descriptor = describeNaturalLanguageTask({ prompt: 'Delete Notion page roadmap.' });
  assert.equal(descriptor.externalActionContract?.action, 'delete');
  assert.equal(descriptor.risk.level, 'critical');
  assert.ok(descriptor.risk.flags.includes('irreversible-file-operation'));
  assert.deepEqual(descriptor.phases, [{ kind: 'execute', domain: 'general' }]);
  const plan = buildRoutePlan(descriptor);
  assert.equal(plan.mode, 'advisory');
  assert.ok(!plan.steps.some(({ kind }) => kind === 'release'));
  assert.ok(!plan.qualityChecks.includes('post-action-verification'));
  assert.match(plan.riskNotes.join(' '), /irreversible file operation/i);
});

test('multi-action contracts split safely while retaining one aggregate clarification state', () => {
  const descriptor = describeNaturalLanguageTask({
    prompt: 'Send email to alice@example.com and post Slack message to #ops.',
  });
  assert.equal(descriptor.externalActionContract.state, 'conflicting');
  assert.match(descriptor.externalActionContract.reasons.join(' '), /unsupported-multi-action/);
  assert.equal(descriptor.externalActionContracts.length, 2);
  assert.deepEqual(descriptor.externalActionContracts.map(({ state, provider }) => ({ state, provider })), [
    { state: 'complete', provider: 'email' },
    { state: 'complete', provider: 'slack' },
  ]);
  assert.equal(
    normalizeTaskDescriptor(JSON.parse(JSON.stringify(descriptor))).externalActionContracts.length,
    2,
  );
  const plan = buildRoutePlan(descriptor);
  assert.ok(!plan.steps.some(({ kind }) => kind === 'release'));
  assert.ok(!plan.qualityChecks.includes('post-action-verification'));
});

test('local modification and verification phases survive a following connector action', () => {
  for (const { prompt, operation, localPhase } of [
    {
      prompt: 'Update README.md, then send email to alice@example.com.',
      operation: 'modify',
      localPhase: { kind: 'modify', domain: 'writing' },
    },
    {
      prompt: 'Fix src/router.js, then send email to alice@example.com.',
      operation: 'modify',
      localPhase: { kind: 'modify', domain: 'code' },
    },
    {
      prompt: 'Run npm run build, then post a Slack message to #ops.',
      operation: 'execute',
      localPhase: { kind: 'execute', domain: 'code' },
    },
    {
      prompt: 'Run unit tests, then send email to alice@example.com.',
      operation: 'execute',
      localPhase: { kind: 'verify', domain: 'tests' },
    },
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, operation, prompt);
    assert.ok(descriptor.phases.some((phase) => phase.kind === localPhase.kind && phase.domain === localPhase.domain), prompt);
    assert.ok(descriptor.phases.some((phase) => phase.kind === 'execute' && phase.domain === 'general'), prompt);
    assert.equal(descriptor.constraints.networkAccess, 'required', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'required', prompt);
    assert.ok(!descriptor.phases.some(({ kind }) => kind === 'release'), prompt);
    const plan = buildRoutePlan(descriptor);
    assert.ok(!plan.steps.some(({ kind }) => kind === 'release'), prompt);
    assert.ok(!plan.qualityChecks.includes('post-action-verification'), prompt);
  }
});

test('connector implementation meta-work and local event code remain local-only routes', () => {
  for (const prompt of [
    'Implement send email support in mailer.js.',
    'Fix sending email to alice@example.com in src/mailer.js.',
    'Add Google Drive upload support to drive.ts.',
    'Implement update Notion page logic in notion.ts.',
    'Fix upload to Google Drive folder F1 in drive.ts.',
    'Implement create Jira issue support in jira.ts.',
    'Create an event handler in src/app.js.',
    'Add an event listener in app.js.',
    'Implement a domain event fixture in tests/events.ts.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.externalActionContract, null, prompt);
    assert.deepEqual(descriptor.externalActionContracts, [], prompt);
    assert.equal(descriptor.constraints.networkAccess, 'unspecified', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'forbidden', prompt);
    assert.ok(!descriptor.capabilities.includes('external.write'), prompt);
  }
});

test('create and build imperatives with explicit code targets select local creation without connector actions', () => {
  for (const prompt of [
    'Create a function in src/parser.js.',
    'Create src/new-module.js.',
    'Build a parser in src/parser.js.',
    'Create an event handler in src/app.js.',
    'Schedule an event loop task in src/runtime.js.',
    '在 src/parser.js 中创建一个解析函数。',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.ok(['create', 'modify'].includes(descriptor.operation), prompt);
    assert.ok(descriptor.domains.includes('code'), prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'required', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'forbidden', prompt);
    assert.equal(descriptor.externalActionContract, null, prompt);
    assert.ok(descriptor.capabilities.includes('fs.write'), prompt);
    const plan = buildRoutePlan(descriptor);
    assert.ok(plan.skills.includes('verification-before-completion'), prompt);
    assert.ok(plan.qualityChecks.includes('review-evidence'), prompt);
  }
});

test('destructive connector matrix compiles as critical advisory external execution without becoming local modification', () => {
  for (const prompt of [
    'Delete Gmail email message 42.',
    'Delete Google Calendar event evt-1.',
    'Delete Google Drive file file-1.',
    'Delete Jira issue CORE-1.',
    'Delete Notion page roadmap.',
  ]) {
    const descriptor = describeNaturalLanguageTask({ prompt });
    assert.equal(descriptor.operation, 'execute', prompt);
    assert.deepEqual(descriptor.domains, ['general'], prompt);
    assert.equal(descriptor.constraints.workspaceWrite, 'forbidden', prompt);
    assert.equal(descriptor.constraints.networkAccess, 'required', prompt);
    assert.equal(descriptor.constraints.externalWrite, 'required', prompt);
    assert.equal(descriptor.externalActionContract?.action, 'delete', prompt);
    assert.deepEqual(descriptor.phases, [{ kind: 'execute', domain: 'general' }], prompt);
    assert.equal(descriptor.risk.level, 'critical', prompt);
    assert.ok(descriptor.risk.flags.includes('irreversible-file-operation'), prompt);
    assert.ok(descriptor.provenance.reasons.includes('irreversible external operation requested'), prompt);
  }

  const advice = describeNaturalLanguageTask({ prompt: 'Explain how to delete Notion page roadmap.' });
  assert.equal(advice.operation, 'answer');
  assert.equal(advice.constraints.externalWrite, 'forbidden');
  assert.equal(advice.risk.level, 'low');
});
