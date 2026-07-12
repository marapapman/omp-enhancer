import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateWorkflowSummary,
  mergeCustomEventFallbacks,
  parseNdjson,
  summarizeWorkflowEvents,
} from './e2e/workflow-events.mjs';

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
