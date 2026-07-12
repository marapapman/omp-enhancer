import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  evaluateWorkflowSummary,
  mergeCustomEventFallbacks,
  parseNdjson,
  summarizeWorkflowEvents,
} from './e2e/workflow-events.mjs';
import { prepareScenario, runInstalledMatrix } from './e2e/run-installed-deepseek-workflow.mjs';

test('installed workflow summary distinguishes observed skill reads from claims', () => {
  const events = [
    { type: 'agent_start' },
    {
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'read-1', name: 'read', arguments: { path: 'skill://writing-review/SKILL.md' } }],
      },
    },
    {
      type: 'tool_execution_end',
      toolCallId: 'read-1',
      toolName: 'read',
      result: { isError: false, content: [{ type: 'text', text: '---\nname: writing-review\n---' }] },
    },
    {
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Used skill://writing-review. Loaded skills: writing-checkers. I also used `invented-helper` skill.' }],
      },
    },
    { type: 'agent_end' },
  ];

  const primaryEvents = events.filter(({ type }) => type !== 'session_custom');
  const fallbackEvents = events.filter(({ type }) => type === 'session_custom');
  const summary = summarizeWorkflowEvents(
    mergeCustomEventFallbacks(primaryEvents, fallbackEvents),
    { exitCode: 0 },
  );
  assert.deepEqual(summary.observedSkills, ['writing-review']);
  assert.deepEqual(summary.claimedSkills, ['invented-helper', 'writing-checkers', 'writing-review']);
  assert.deepEqual(summary.unobservedClaims, ['invented-helper', 'writing-checkers']);
  assert.equal(summary.primaryFinalCount, 1);

  const evaluation = evaluateWorkflowSummary(summary, {
    requiredSkills: ['writing-review'],
    noUnobservedSkillClaims: true,
  });
  assert.equal(evaluation.pass, false);
  assert.match(evaluation.failures.join('\n'), /writing-checkers/);
});

test('skill equivalence never treats zh-writing-review as writing-review', () => {
  const summary = summarizeWorkflowEvents([
    {
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'read-zh-review', name: 'read', arguments: { path: 'skill://zh-writing-review/SKILL.md' } }],
      },
    },
    {
      type: 'tool_execution_end',
      toolCallId: 'read-zh-review',
      toolName: 'read',
      result: { isError: false, content: [{ type: 'text', text: '---\nname: zh-writing-review\n---' }] },
    },
  ]);

  const required = evaluateWorkflowSummary(summary, {
    requireFinal: false,
    requiredSkills: ['writing-review'],
  });
  assert.equal(required.pass, false);
  assert.match(required.failures.join('\n'), /required skill was not observed: writing-review/);

  const forbidden = evaluateWorkflowSummary(summary, {
    requireFinal: false,
    forbiddenSkills: ['writing-review'],
  });
  assert.equal(forbidden.pass, true);
});

test('skill equivalence accepts only an explicit superpowers namespace alias', () => {
  const namespaced = {
    observedSkills: ['superpowers-writing-plans'],
    primaryFinalCount: 0,
  };
  assert.equal(evaluateWorkflowSummary(namespaced, {
    requireFinal: false,
    requiredSkills: ['writing-plans'],
  }).pass, true);

  const unnamespaced = {
    observedSkills: ['writing-plans'],
    primaryFinalCount: 0,
  };
  assert.equal(evaluateWorkflowSummary(unnamespaced, {
    requireFinal: false,
    requiredSkills: ['superpowers-writing-plans'],
  }).pass, true);

  const unknownNamespace = {
    observedSkills: ['project-writing-plans'],
    primaryFinalCount: 0,
  };
  assert.equal(evaluateWorkflowSummary(unknownNamespace, {
    requireFinal: false,
    requiredSkills: ['writing-plans'],
  }).pass, false);
});

test('semantic-edit-en fixture and sentinels require legal escaped LaTeX percentages', async () => {
  const prepared = await prepareScenario({
    id: 'semantic-edit-en-regression',
    fixture: 'semantic-edit-en',
    prompt: 'Polish paper.tex.',
  });
  try {
    const text = await readFile(path.join(prepared.cwd, 'paper.tex'), 'utf8');
    assert.match(text, /37\.5\\%/u);
    assert.match(text, /12\.5\\%/u);

    const matrix = JSON.parse(await readFile(
      new URL('./e2e/fixtures/deepseek-installed-matrix.json', import.meta.url),
      'utf8',
    ));
    const scenario = matrix.scenarios.find(({ id }) => id === 'semantic-edit-en');
    const percentagePatterns = scenario.fixtureExpectations.requiredPatterns['paper.tex']
      .filter((pattern) => pattern.includes('37') || pattern.includes('12'));
    assert.equal(percentagePatterns.length, 2);
    for (const pattern of percentagePatterns) {
      const sentinel = new RegExp(pattern, 'u');
      assert.match(text, sentinel);
      assert.doesNotMatch(text.replaceAll('\\%', '%'), sentinel);
    }
  } finally {
    await prepared.cleanup();
  }
});

test('mandatory matrix isolates plugin compliance from the explicit advisor stress matrix', async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), 'omp-e2e-matrix-mode-'));
  try {
    const matrix = JSON.parse(await readFile(
      new URL('./e2e/fixtures/deepseek-installed-matrix.json', import.meta.url),
      'utf8',
    ));
    const { report } = await runInstalledMatrix({
      dryRun: true,
      scenarioIds: ['english-review-zh-prompt'],
      outputRoot,
    });
    const command = report.results[0].command;
    assert.ok(command.includes('--mode=rpc'));
    assert.equal(command.includes('--advisor'), false);
    assert.deepEqual(report.results[0].runtimeConfig, { advisorEnabled: false });
    const configArg = command.find((value) => value.startsWith('--config='));
    assert.ok(configArg);
    assert.equal(await readFile(configArg.slice('--config='.length), 'utf8'), 'advisor:\n  enabled: false\n');

    const stress = JSON.parse(await readFile(
      new URL('./e2e/fixtures/deepseek-advisor-stress.json', import.meta.url),
      'utf8',
    ));
    assert.equal(stress.defaults.advisor, true);
    assert.equal(stress.defaults.executionMode, 'rpc');
    assert.equal(stress.defaults.expectations.maxPrimaryFinals, 1);
    assert.equal(stress.defaults.expectations.minAdvisorMessages, 1);
    assert.equal(matrix.defaults.expectations.maxAdvisorMessages, 0);
    assert.ok(stress.scenarios.some(({ id }) => id === 'advisor-english-review'));
    assert.ok(stress.scenarios.some(({ id }) => id === 'advisor-semantic-edit-en'));
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});

test('installed workflow summary separates advisor, autolearn, and plugin continuation', () => {
  const events = [
    { type: 'message_end', message: { role: 'custom', customType: 'advisor', content: 'Check wording.', display: true } },
    { type: 'agent_start' },
    { type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Primary result.' }] } },
    { type: 'agent_end' },
    {
      type: 'session_custom',
      entry: {
        role: 'custom',
        customType: 'autolearn-nudge',
        content: 'Automated capture turn.',
        display: false,
        attribution: 'user',
      },
    },
    {
      type: 'message_end',
      message: {
        role: 'custom',
        customType: 'autolearn-nudge',
        content: 'Automated capture turn.',
        display: false,
        attribution: 'user',
      },
    },
    { type: 'agent_start' },
    { type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Hidden capture output.' }] } },
    { type: 'agent_end' },
  ];

  const primaryEvents = events.filter(({ type }) => type !== 'session_custom');
  const fallbackEvents = events.filter(({ type }) => type === 'session_custom');
  const summary = summarizeWorkflowEvents(
    mergeCustomEventFallbacks(primaryEvents, fallbackEvents),
    { exitCode: 0 },
  );
  assert.equal(summary.advisorMessageCount, 1);
  assert.equal(summary.autolearnCaptureCount, 1);
  assert.equal(summary.pluginContinuationCount, 0);
  assert.equal(summary.primaryFinalCount, 1);
  assert.equal(summary.autolearnFinalCount, 1);
  assert.equal(summary.autolearnToolCallCount, 0);
  assert.equal(evaluateWorkflowSummary(summary, {
    autolearnCaptureCount: 1,
    pluginContinuationCount: 0,
    maxPrimaryFinals: 1,
  }).pass, true);
});

test('installed workflow evaluation checks advisor isolation in both directions', () => {
  const base = {
    primaryFinalCount: 1,
    observedSkills: [],
    claimedSkills: [],
    unobservedClaims: [],
    webCallCount: 0,
    toolCallCount: 0,
    sourceSearchCallCount: 0,
    duplicateFailedCalls: [],
    pluginContinuationCount: 0,
    autolearnCaptureCount: 0,
    autolearnFinalCount: 0,
    autolearnToolCallCount: 0,
    abortedAssistantCount: 0,
    routeEvents: [],
  };
  assert.equal(evaluateWorkflowSummary(
    { ...base, advisorMessageCount: 1 },
    { maxAdvisorMessages: 0 },
  ).pass, false);
  assert.equal(evaluateWorkflowSummary(
    { ...base, advisorMessageCount: 0 },
    { minAdvisorMessages: 1 },
  ).pass, false);
});

test('installed workflow summary preserves repeated real custom events while removing session mirrors', () => {
  const capture = (timestamp) => ({
    type: 'message_end',
    message: {
      role: 'custom',
      customType: 'autolearn-nudge',
      content: 'Automated capture turn.',
      display: false,
      attribution: 'user',
      timestamp,
    },
  });
  const primary = [capture(1), capture(2)];
  const sessionMirror = [{
    type: 'session_custom',
    entry: {
      role: 'custom',
      customType: 'autolearn-nudge',
      content: 'Automated capture turn.',
      display: false,
      attribution: 'user',
    },
  }];

  const summary = summarizeWorkflowEvents(mergeCustomEventFallbacks(primary, sessionMirror));
  assert.equal(summary.autolearnCaptureCount, 2);
  assert.equal(evaluateWorkflowSummary(summary, { autolearnCaptureCount: 1 }).pass, false);
});

test('installed workflow evaluation rejects aborted or signalled runs', () => {
  const summary = summarizeWorkflowEvents([
    { type: 'agent_start' },
    {
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Partial result.' }],
        stopReason: 'aborted',
        errorMessage: 'Request was aborted',
      },
    },
    { type: 'agent_end' },
  ], { exitCode: null, signal: 'SIGTERM', timedOut: true });

  const evaluation = evaluateWorkflowSummary(summary, { maxAbortedAssistants: 0 });
  assert.equal(evaluation.pass, false);
  assert.match(evaluation.failures.join('\n'), /aborted assistant messages/);
  assert.match(evaluation.failures.join('\n'), /signal SIGTERM/);
  assert.match(evaluation.failures.join('\n'), /hard timeout/);
});

test('autolearn custom messages emitted after agent_start still classify the active turn', () => {
  const summary = summarizeWorkflowEvents([
    { type: 'agent_start' },
    {
      type: 'message_end',
      message: {
        role: 'custom',
        customType: 'autolearn-nudge',
        content: 'Automated capture turn.',
        display: false,
        attribution: 'user',
      },
    },
    {
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Nothing worth capturing.' }],
        stopReason: 'stop',
      },
    },
    { type: 'agent_end' },
  ]);
  assert.equal(summary.primaryFinalCount, 0);
  assert.equal(summary.autolearnFinalCount, 1);
});

test('installed workflow summary detects unchanged failed tool retries and route results', () => {
  const events = [];
  for (const id of ['bad-1', 'bad-2']) {
    events.push({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'toolCall', id, name: 'read', arguments: { path: 'missing.md' } }],
      },
    });
    events.push({
      type: 'tool_execution_end',
      toolCallId: id,
      toolName: 'read',
      result: { isError: true, content: [{ type: 'text', text: 'not found' }] },
    });
  }
  events.push({
    type: 'message_end',
    message: {
      role: 'assistant',
      content: [{ type: 'toolCall', id: 'route-1', name: 'omp_core_route_task', arguments: { prompt: 'Review it.' } }],
    },
  });
  events.push({
    type: 'tool_execution_end',
    toolCallId: 'route-1',
    toolName: 'omp_core_route_task',
    result: {
      isError: false,
      details: { route: { intent: 'writing.en', workflowRoute: 'writing.en', advisoryOnly: true, autoContinue: false } },
      content: [{ type: 'text', text: 'route' }],
    },
  });
  events.push({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Bounded result.' }] } });

  const summary = summarizeWorkflowEvents(events, { exitCode: 0 });
  assert.equal(summary.duplicateFailedCalls.length, 1);
  assert.equal(summary.duplicateFailedCalls[0].count, 2);
  assert.equal(summary.routes.at(-1).intent, 'writing.en');
  const evaluation = evaluateWorkflowSummary(summary, {
    expectedRoute: 'writing.en',
    maxDuplicateFailedCalls: 0,
  });
  assert.equal(evaluation.pass, false);
  assert.match(evaluation.failures.join('\n'), /repeated/);
});

test('parseNdjson retains valid events and reports malformed lines', () => {
  const parsed = parseNdjson('{"type":"agent_start"}\nnot-json\n{"type":"agent_end"}\n');
  assert.deepEqual(parsed.events.map(({ type }) => type), ['agent_start', 'agent_end']);
  assert.deepEqual(parsed.invalidLines, [{ line: 2, preview: 'not-json' }]);
});
