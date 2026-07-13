import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  evaluateWorkflowSummary,
  mergeCustomEventFallbacks,
  parseNdjson,
  summarizeWorkflowEvents,
} from './e2e/workflow-events.mjs';
import {
  prepareScenario,
  readSessionCustomEvents,
  runInstalledMatrix,
  snapshotTree,
  verifyFixture,
} from './e2e/run-installed-deepseek-workflow.mjs';

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
  assert.deepEqual(summary.providedSkills, []);
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

test('native skill prompts count as host-provided skill evidence without a model read', () => {
  const summary = summarizeWorkflowEvents([
    {
      type: 'message_end',
      message: {
        role: 'custom',
        customType: 'skill-prompt',
        content: 'Native routed skill content.',
        display: false,
        attribution: 'agent',
        details: {
          provisionProvider: 'omp-enhancer-core',
          provisionSchemaVersion: 1,
          name: 'plain-chinese-writing',
          path: '/skills/plain-chinese-writing/SKILL.md',
          lineCount: 20,
          routedSkills: ['plain-chinese-writing', 'zh-writing-polish'],
          providedSkillRecords: [
            {
              requestedSkill: 'plain-chinese-writing',
              name: 'plain-chinese-writing',
              path: '/skills/plain-chinese-writing/SKILL.md',
            },
            {
              requestedSkill: 'zh-writing-polish',
              name: 'zh-writing-polish',
              path: '/skills/zh-writing-polish/SKILL.md',
            },
          ],
        },
      },
    },
    { type: 'agent_start' },
    {
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Applied the provided writing guidance.' }],
      },
    },
    { type: 'agent_end' },
  ]);

  assert.deepEqual(summary.observedSkills, []);
  assert.deepEqual(summary.providedSkills, [
    'plain-chinese-writing',
    'zh-writing-polish',
  ]);
  assert.equal(evaluateWorkflowSummary(summary, {
    requiredSkills: ['plain-chinese-writing', 'zh-writing-polish'],
  }).pass, true);
  assert.equal(evaluateWorkflowSummary(summary, {
    forbiddenSkills: ['zh-writing-polish'],
  }).pass, false);
  assert.equal(summary.provisionMode, 'native');
  assert.deepEqual(summary.duplicateSkillReads, []);
});

test('native autoload precedes project tools and successful project calls follow the exact sequence', () => {
  const summary = summarizeWorkflowEvents([
    { type: 'agent_start' },
    {
      type: 'message_end',
      message: {
        role: 'custom',
        customType: 'skill-prompt',
        content: 'Native English review guidance.',
        display: false,
        attribution: 'agent',
        details: {
          provisionProvider: 'omp-enhancer-core',
          provisionSchemaVersion: 1,
          routedSkills: ['writing-review'],
          name: 'writing-review',
          path: '/skills/writing-review/SKILL.md',
          lineCount: 20,
          providedSkillRecords: [
            {
              requestedSkill: 'writing-review',
              name: 'writing-review',
              path: '/skills/writing-review/SKILL.md',
            },
          ],
        },
      },
    },
    {
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'project-read-before', name: 'read', arguments: { path: 'tex/introduction.tex' } }],
      },
    },
    {
      type: 'tool_execution_end',
      toolCallId: 'project-read-before',
      toolName: 'read',
      result: { isError: false, content: [{ type: 'text', text: 'Introduction source.' }] },
    },
    {
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'project-edit', name: 'edit', arguments: { input: '[tex/introduction.tex#AAAA]\nSWAP 1.=1:\n+fixed' } }],
      },
    },
    {
      type: 'tool_execution_end',
      toolCallId: 'project-edit',
      toolName: 'edit',
      result: { isError: false, content: [{ type: 'text', text: 'edited' }] },
    },
    {
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'project-read-after', name: 'read', arguments: { path: 'tex/introduction.tex' } }],
      },
    },
    {
      type: 'tool_execution_end',
      toolCallId: 'project-read-after',
      toolName: 'read',
      result: { isError: false, content: [{ type: 'text', text: 'Fixed introduction source.' }] },
    },
    {
      type: 'message_end',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Updated the Introduction.' }] },
    },
    { type: 'agent_end' },
  ], { exitCode: 0 });

  assert.deepEqual(summary.observedSkills, []);
  assert.deepEqual(summary.skillReadAttempts, []);
  assert.deepEqual(summary.toolCalls.map(({ name }) => name), ['read', 'edit', 'read']);
  assert.equal(summary.providedSkillEvidence[0].source, 'autoload');
  assert.equal(summary.providedSkillEvidence[0].eventSource, 'live');
  assert.ok(summary.providedSkillEvidence[0].eventIndex < summary.firstProjectToolCallEventIndex);
  assert.equal(evaluateWorkflowSummary(summary, {
    requiredSkills: ['writing-review'],
    requiredProvidedSkills: [{
      name: 'writing-review',
      source: 'autoload',
      eventSource: 'live',
      beforeFirstProjectTool: true,
    }],
    expectedProvisionMode: 'native',
    maxSkillReadAttempts: 0,
    maxDuplicateSkillReadAttempts: 0,
    expectedToolSequence: ['read', 'edit', 'read'],
    requireSuccessfulToolCalls: true,
  }).pass, true);
});

test('successful and failed reads of an autoloaded skill are both detected as duplicate attempts', () => {
  for (const isError of [false, true]) {
    const summary = summarizeWorkflowEvents([
      {
        type: 'message_end',
        message: {
          role: 'custom',
          customType: 'skill-prompt',
          content: 'Native English review guidance.',
          display: false,
          attribution: 'agent',
          details: {
            provisionProvider: 'omp-enhancer-core',
            provisionSchemaVersion: 1,
            name: 'writing-review',
            path: '/skills/writing-review/SKILL.md',
            lineCount: 20,
            routedSkills: ['writing-review'],
            providedSkillRecords: [{
              requestedSkill: 'writing-review',
              name: 'writing-review',
              path: '/skills/writing-review/SKILL.md',
            }],
          },
        },
      },
      {
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'toolCall', id: `skill-read-${isError}`, name: 'read', arguments: { path: 'skill://writing-review' } }],
        },
      },
      {
        type: 'tool_execution_end',
        toolCallId: `skill-read-${isError}`,
        toolName: 'read',
        result: {
          isError,
          content: [{ type: 'text', text: isError ? 'skill unavailable' : '---\nname: writing-review\n---' }],
        },
      },
    ]);

    assert.equal(summary.skillReadAttempts.length, 1);
    assert.equal(summary.skillReadAttempts[0].isError, isError);
    assert.equal(summary.duplicateSkillReadAttempts.length, 1);
    assert.deepEqual(summary.observedSkills, isError ? [] : ['writing-review']);
    const evaluation = evaluateWorkflowSummary(summary, {
      requireFinal: false,
      maxSkillReadAttempts: 0,
      maxDuplicateSkillReadAttempts: 0,
    });
    assert.equal(evaluation.pass, false);
    assert.match(evaluation.failures.join('\n'), /skill read attempts 1 exceeded 0/);
    assert.match(evaluation.failures.join('\n'), /duplicate skill read attempts 1 exceeded 0/);
  }
});

test('an unmarked routed skill prompt cannot impersonate Core native provision', () => {
  const summary = summarizeWorkflowEvents([
    {
      type: 'message_end',
      message: {
        role: 'custom',
        customType: 'skill-prompt',
        content: 'Only the base Chinese skill was actually provided.',
        display: false,
        attribution: 'agent',
        details: {
          name: 'plain-chinese-writing',
          path: '/skills/plain-chinese-writing/SKILL.md',
          lineCount: 20,
          routedSkills: ['plain-chinese-writing', 'zh-writing-polish'],
        },
      },
    },
    { type: 'agent_start' },
    {
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Completed with the available context.' }],
      },
    },
    { type: 'agent_end' },
  ]);

  assert.deepEqual(summary.providedSkills, []);
  assert.equal(summary.providedSkillEvidence[0].source, 'untrusted');
  const evaluation = evaluateWorkflowSummary(summary, {
    requiredSkills: ['plain-chinese-writing', 'zh-writing-polish'],
  });
  assert.equal(evaluation.pass, false);
  assert.match(evaluation.failures.join('\n'), /zh-writing-polish/);
});

test('skill prompt fallback evidence survives detail-less primary events and keeps identities distinct', () => {
  const content = 'Shared skill context.';
  const primary = [{
    type: 'message_end',
    message: {
      role: 'custom',
      customType: 'skill-prompt',
      content,
      display: false,
      attribution: 'agent',
    },
  }];
  const sessionFallbacks = [
    {
      type: 'session_custom',
      entry: {
        role: 'custom',
        customType: 'skill-prompt',
        content,
        display: false,
        attribution: 'agent',
        details: {
          provisionProvider: 'omp-enhancer-core',
          provisionSchemaVersion: 1,
          name: 'writing-review',
          path: '/skills/writing-review/SKILL.md',
          lineCount: 10,
          routedSkills: ['writing-review'],
          providedSkillRecords: [{
            requestedSkill: 'writing-review',
            name: 'writing-review',
            path: '/skills/writing-review/SKILL.md',
          }],
        },
      },
    },
    {
      type: 'session_custom',
      entry: {
        role: 'custom',
        customType: 'skill-prompt',
        content,
        display: false,
        attribution: 'agent',
        details: {
          provisionProvider: 'omp-enhancer-core',
          provisionSchemaVersion: 1,
          name: 'fact-checking',
          path: '/skills/fact-checking/SKILL.md',
          lineCount: 10,
          routedSkills: ['fact-checking'],
          providedSkillRecords: [{
            requestedSkill: 'fact-checking',
            name: 'fact-checking',
            path: '/skills/fact-checking/SKILL.md',
          }],
        },
      },
    },
  ];

  const summary = summarizeWorkflowEvents(mergeCustomEventFallbacks(primary, sessionFallbacks));
  assert.deepEqual(summary.providedSkills, ['fact-checking', 'writing-review']);
  assert.equal(summary.customMessages.length, 3);
});

test('session fallback cannot overwrite earlier live native provision timing', () => {
  const details = {
    provisionProvider: 'omp-enhancer-core',
    provisionSchemaVersion: 1,
    name: 'writing-review',
    path: '/skills/writing-review/SKILL.md',
    lineCount: 10,
    routedSkills: ['writing-review'],
    providedSkillRecords: [{
      requestedSkill: 'writing-review',
      name: 'writing-review',
      path: '/skills/writing-review/SKILL.md',
    }],
  };
  const summary = summarizeWorkflowEvents([
    {
      type: 'message_end',
      message: {
        role: 'custom',
        customType: 'skill-prompt',
        content: 'Live skill body.',
        display: false,
        attribution: 'agent',
        details,
      },
    },
    {
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'read-target', name: 'read', arguments: { path: 'paper.tex' } }],
      },
    },
    {
      type: 'session_custom',
      entry: {
        role: 'custom',
        customType: 'skill-prompt',
        content: 'Persisted skill body with a different digest.',
        display: false,
        attribution: 'agent',
        details,
      },
    },
  ]);

  assert.equal(summary.providedSkillEvidence.length, 1);
  assert.equal(summary.providedSkillEvidence[0].eventSource, 'live');
  assert.ok(summary.providedSkillEvidence[0].eventIndex < summary.firstProjectToolCallEventIndex);
});

test('session fallback loading retains persisted native skill prompts', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'omp-e2e-skill-session-'));
  try {
    await writeFile(path.join(root, 'session.jsonl'), [
      JSON.stringify({
        type: 'custom',
        customType: 'skill-prompt',
        content: 'Native skill context.',
        display: false,
        attribution: 'agent',
        details: {
          provisionProvider: 'omp-enhancer-core',
          provisionSchemaVersion: 1,
          name: 'writing-review',
          path: '/skills/writing-review/SKILL.md',
          lineCount: 10,
          routedSkills: ['writing-review'],
          providedSkillRecords: [{
            requestedSkill: 'writing-review',
            name: 'writing-review',
            path: '/skills/writing-review/SKILL.md',
          }],
        },
      }),
      JSON.stringify({ type: 'custom', customType: 'unrelated', content: 'ignore' }),
    ].join('\n'));

    const events = await readSessionCustomEvents(root);
    assert.equal(events.length, 1);
    assert.equal(events[0].entry.customType, 'skill-prompt');
    assert.equal(summarizeWorkflowEvents(events).providedSkills[0], 'writing-review');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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
  assert.match(required.failures.join('\n'), /required skill was not observed or provided: writing-review/);

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
    assert.match(text, /lower lower/u);
    assert.match(text, /37\.5\\%/u);
    assert.match(text, /12\.5\\%/u);

    const matrix = JSON.parse(await readFile(
      new URL('./e2e/fixtures/deepseek-installed-matrix.json', import.meta.url),
      'utf8',
    ));
    const scenario = matrix.scenarios.find(({ id }) => id === 'semantic-edit-en');
    assert.deepEqual(scenario.fixtureExpectations.forbiddenPatterns['paper.tex'], ['lower\\s+lower']);
    assert.ok(scenario.fixtureExpectations.requiredPatterns['paper.tex'].includes('\\blower\\b'));
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

test('English Introduction fixture requires the unique conservative edit exactly', async () => {
  const matrix = JSON.parse(await readFile(
    new URL('./e2e/fixtures/deepseek-installed-matrix.json', import.meta.url),
    'utf8',
  ));
  const scenario = matrix.scenarios.find(({ id }) => id === 'semantic-edit-en-introduction-skill-first');
  assert.ok(scenario);
  assert.deepEqual(scenario.expectations.requiredSkills, ['writing-review']);
  assert.deepEqual(scenario.tools, ['todo', 'read', 'edit']);
  assert.equal(scenario.expectations.maxSkillReadAttempts, 1);
  assert.equal(scenario.expectations.requireNativeTodoInit, true);
  assert.equal(scenario.expectations.requireNativeTodoCompletion, true);
  assert.equal(scenario.expectations.requireNativeTodoInitBeforeSubstantiveTool, true);

  const prepared = await prepareScenario(scenario);
  try {
    const target = path.join(prepared.cwd, 'tex', 'introduction.tex');
    const original = await readFile(target, 'utf8');
    assert.match(original, /lower lower/u);
    const beforeFiles = await snapshotTree(prepared.cwd);
    const expected = scenario.fixtureExpectations.exactContents['tex/introduction.tex'];

    await writeFile(target, expected);
    const exact = await verifyFixture(
      prepared.cwd,
      beforeFiles,
      scenario.fixtureExpectations,
    );
    assert.equal(exact.pass, true);
    assert.deepEqual(exact.changedFiles, ['tex/introduction.tex']);

    await writeFile(target, expected.replace('Our evaluation', 'The evaluation'));
    const overEdited = await verifyFixture(
      prepared.cwd,
      beforeFiles,
      scenario.fixtureExpectations,
    );
    assert.equal(overEdited.pass, false);
    assert.match(overEdited.failures.join('\n'), /did not exactly match/);
  } finally {
    await prepared.cleanup();
  }
});

test('semantic-edit-zh fixture contains a concrete removable style defect', async () => {
  const matrix = JSON.parse(await readFile(
    new URL('./e2e/fixtures/deepseek-installed-matrix.json', import.meta.url),
    'utf8',
  ));
  const scenario = matrix.scenarios.find(({ id }) => id === 'semantic-edit-zh');
  const prepared = await prepareScenario(scenario);
  try {
    const text = await readFile(path.join(prepared.cwd, 'paper.md'), 'utf8');
    assert.match(text, /——/u);
    assert.deepEqual(scenario.fixtureExpectations.forbiddenPatterns['paper.md'], ['——']);
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
    assert.equal(Object.hasOwn(stress.defaults.expectations, 'minAdvisorMessages'), false);
    assert.equal(stress.defaults.expectations.maxAdvisorMessages, 1);
    assert.equal(stress.defaults.expectations.maxPostFinalAdvisorMessages, 0);
    assert.equal(stress.defaults.expectations.maxAbortedAssistants, 0);
    assert.equal(stress.defaults.expectations.pluginContinuationCount, 0);
    assert.equal(matrix.defaults.expectations.maxAdvisorMessages, 0);
    assert.ok(stress.scenarios.some(({ id }) => id === 'advisor-english-review'));
    assert.ok(stress.scenarios.some(({ id }) => id === 'advisor-semantic-edit-en'));
    for (const id of ['code-implementation-plan', 'code-diagnosis-focused', 'code-test-strategy']) {
      assert.equal(matrix.scenarios.find((scenario) => scenario.id === id)?.timeoutSeconds, 180);
    }
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

test('installed workflow summary rejects advisor messages after the primary final', () => {
  const events = [
    { type: 'agent_start' },
    { type: 'message_end', message: { role: 'custom', customType: 'advisor', content: 'One useful note.', display: true } },
    { type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Primary result.' }] } },
    { type: 'message_end', message: { role: 'custom', customType: 'advisor', content: 'Late duplicate note.', display: true } },
    { type: 'agent_end' },
  ];
  const summary = summarizeWorkflowEvents(events, { exitCode: 0 });

  assert.equal(summary.advisorMessageCount, 2);
  assert.equal(summary.postFinalAdvisorMessageCount, 1);
  const evaluation = evaluateWorkflowSummary(summary, { maxPostFinalAdvisorMessages: 0 });
  assert.equal(evaluation.pass, false);
  assert.match(evaluation.failures.join('\n'), /post-final advisor messages 1 exceeded 0/);
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

test('installed workflow summary tracks native todo initialization and completion', () => {
  const events = [
    { type: 'agent_start' },
    {
      type: 'tool_execution_start',
      toolCallId: 'todo-init',
      toolName: 'todo',
      args: {
        op: 'init',
        list: [{ phase: 'Implementation', items: ['Inspect workflow', 'Run tests'] }],
      },
    },
    {
      type: 'tool_execution_end',
      toolCallId: 'todo-init',
      toolName: 'todo',
      result: {
        isError: false,
        details: {
          op: 'init',
          phases: [{
            name: 'Implementation',
            tasks: [
              { content: 'Inspect workflow', status: 'in_progress' },
              { content: 'Run tests', status: 'pending' },
            ],
          }],
        },
      },
    },
    {
      type: 'tool_execution_start',
      toolCallId: 'project-read',
      toolName: 'read',
      args: { path: 'src/router.js' },
    },
    {
      type: 'tool_execution_end',
      toolCallId: 'project-read',
      toolName: 'read',
      result: { isError: false, content: [{ type: 'text', text: 'source' }] },
    },
    {
      type: 'tool_execution_start',
      toolCallId: 'todo-done',
      toolName: 'todo',
      args: { op: 'done', phase: 'Implementation' },
    },
    {
      type: 'tool_execution_end',
      toolCallId: 'todo-done',
      toolName: 'todo',
      result: {
        isError: false,
        details: {
          op: 'done',
          phases: [{
            name: 'Implementation',
            tasks: [
              { content: 'Inspect workflow', status: 'completed' },
              { content: 'Run tests', status: 'completed' },
            ],
          }],
          completedTasks: [
            { phase: 'Implementation', content: 'Inspect workflow' },
            { phase: 'Implementation', content: 'Run tests' },
          ],
        },
      },
    },
    { type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] } },
    { type: 'agent_end' },
  ];

  const summary = summarizeWorkflowEvents(events, { exitCode: 0 });
  assert.deepEqual(summary.nativeTodo, {
    callCount: 2,
    successfulCallCount: 2,
    initCallCount: 1,
    doneCallCount: 1,
    initializedTaskCount: 2,
    completionTransitionCount: 2,
    currentTaskCount: 2,
    completedTaskCount: 2,
    pendingTaskCount: 0,
    abandonedTaskCount: 0,
    allCompleted: true,
    firstInitEventIndex: 1,
    initializedBeforeFirstSubstantiveTool: true,
  });
  assert.equal(evaluateWorkflowSummary(summary, {
    requireNativeTodoInit: true,
    minNativeTodoItems: 2,
    minNativeTodoCompletionTransitions: 2,
    requireNativeTodoCompletion: true,
    requireNativeTodoInitBeforeSubstantiveTool: true,
  }).pass, true);
});

test('installed workflow summary checks task batch assignment metadata within the first 120 characters', () => {
  const metadataPrefix = 'OMP_WORKFLOW:code.dev;OMP_WORKFLOW_STEP:inspect;OMP_TODO_ITEM:audit;OMP_SKILLS:diagnose';
  const summary = summarizeWorkflowEvents([
    {
      type: 'tool_execution_start',
      toolCallId: 'task-batch',
      toolName: 'task',
      args: {
        context: 'Inspect independently and return evidence.',
        tasks: [
          { name: 'route-audit', agent: 'scout', task: `${metadataPrefix}\nInspect routing.` },
          { name: 'prompt-audit', agent: 'scout', task: `${metadataPrefix}\nInspect prompts.` },
        ],
      },
    },
    {
      type: 'tool_execution_end',
      toolCallId: 'task-batch',
      toolName: 'task',
      result: { isError: false, content: [{ type: 'text', text: 'Spawned 2 agents.' }] },
    },
    { type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Delegated.' }] } },
  ], { exitCode: 0 });

  assert.equal(summary.nativeTask.callCount, 1);
  assert.equal(summary.nativeTask.batchCallCount, 1);
  assert.equal(summary.nativeTask.multiForkBatchCallCount, 1);
  assert.equal(summary.nativeTask.forkCount, 2);
  assert.equal(summary.nativeTask.successfulForkCount, 2);
  assert.equal(summary.nativeTask.metadataCompleteCount, 2);
  assert.deepEqual(summary.nativeTask.assignments[0].metadata, {
    workflow: 'code.dev',
    step: 'inspect',
    todo: 'audit',
    skills: 'diagnose',
  });
  assert.equal(evaluateWorkflowSummary(summary, {
    minNativeTaskCalls: 1,
    minNativeTaskForks: 2,
    minNativeTaskBatchCalls: 1,
    requireNativeTaskBatch: true,
    requireNativeTaskMetadataPrefix: true,
  }).pass, true);

  const lateMetadata = summarizeWorkflowEvents([
    {
      type: 'tool_execution_start',
      toolCallId: 'task-late-metadata',
      toolName: 'task',
      args: {
        agent: 'scout',
        task: `${'x'.repeat(121)}${metadataPrefix}`,
      },
    },
  ]);
  assert.equal(lateMetadata.nativeTask.assignments[0].prefixCharacterCount, 120);
  assert.deepEqual(lateMetadata.nativeTask.assignments[0].missingMetadata, [
    'workflow',
    'step',
    'todo',
    'skills',
  ]);
  const evaluation = evaluateWorkflowSummary(lateMetadata, {
    requireFinal: false,
    requiredNativeTaskMetadata: ['workflow', 'step', 'todo', 'skills'],
  });
  assert.equal(evaluation.pass, false);
  assert.match(evaluation.failures.join('\n'), /first 120 characters/);

  const placeholderMetadata = summarizeWorkflowEvents([{
    type: 'tool_execution_start',
    toolCallId: 'task-placeholder-metadata',
    toolName: 'task',
    args: {
      agent: 'scout',
      task: '[workflow=unspecified step=unknown todo=pending skills=none]\nInspect routing.',
    },
  }]);
  assert.deepEqual(placeholderMetadata.nativeTask.assignments[0].missingMetadata, [
    'workflow',
    'step',
    'todo',
    'skills',
  ]);
});

test('parseNdjson retains valid events and reports malformed lines', () => {
  const parsed = parseNdjson('{"type":"agent_start"}\nnot-json\n{"type":"agent_end"}\n');
  assert.deepEqual(parsed.events.map(({ type }) => type), ['agent_start', 'agent_end']);
  assert.deepEqual(parsed.invalidLines, [{ line: 2, preview: 'not-json' }]);
});
