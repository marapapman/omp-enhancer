import test from 'node:test';
import assert from 'node:assert/strict';

import { buildStagedWorkflowReminder } from '../index.js';
import {
  WORKFLOW_CATALOG_VERSION,
  workflowCatalog,
  workflowDefinitions,
  workflowIds,
} from '../src/workflows/catalog.js';
import { buildWorkflowSkillIndexMarkdown } from '../src/workflows/render-skill.js';

const REMOVED_FIELDS = [
  'steps',
  'delegation',
  'delegationDefault',
  'composeWith',
  'qualityChecks',
  'riskNotes',
];

const FORBIDDEN_REMINDER_MARKERS = [
  'WORKFLOW PLAN',
  'WORKFLOW READY',
  'NOW=',
  'THEN=',
  'RESOURCE EXTENSION',
  'Delegate Agent=',
  'byte 0',
  'SENTINEL',
  'DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY',
  'DECLARE HANDOFF',
  'TASK COPY',
];

test('buildStagedWorkflowReminder emits the compact orchestration advisory for a code project task', () => {
  const reminder = buildStagedWorkflowReminder({
    hasWorkflowSkill: true,
    workflowIndexSupplied: false,
    hasNativeTask: true,
    subagentsAllowed: true,
    taskDescriptor: { operation: 'modify', domains: ['code'] },
  });

  assert.ok(reminder, 'a code project task must produce a reminder');
  assert.match(reminder.content, /ANALYZE -> EXECUTE -> REVIEW/u);
  assert.match(reminder.content, /OMP_ORCHESTRATION/u);
  assert.match(reminder.content, /skill:\/\/omp-enhancer-workflows/u);
  assert.ok(reminder.features.includes('orchestration-advisory'));
  assert.ok(reminder.features.includes('workflow-candidates'));
  assert.match(reminder.content, /CANDIDATES: code/u);

  for (const marker of FORBIDDEN_REMINDER_MARKERS) {
    assert.doesNotMatch(reminder.content, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu'), `reminder must not contain ${marker}`);
  }
});

test('buildStagedWorkflowReminder returns null when no workflow skill and no native task are available', () => {
  assert.equal(buildStagedWorkflowReminder({ hasWorkflowSkill: false, hasNativeTask: false }), null);
  assert.equal(buildStagedWorkflowReminder(), null);
});

test('buildStagedWorkflowReminder acknowledges a natively supplied index without a duplicate read', () => {
  const reminder = buildStagedWorkflowReminder({
    hasWorkflowSkill: true,
    workflowIndexSupplied: true,
    hasNativeTask: false,
    subagentsAllowed: true,
    taskDescriptor: {},
  });
  assert.ok(reminder);
  assert.match(reminder.content, /The workflow index was supplied natively\. Do not reread it\./u);
  assert.doesNotMatch(reminder.content, /read `skill:\/\/omp-enhancer-workflows`/u);
  assert.deepEqual(reminder.features, ['orchestration-advisory']);
});

test('buildStagedWorkflowReminder accepts no model parameter and never mentions a model', () => {
  const reminder = buildStagedWorkflowReminder({
    hasWorkflowSkill: true,
    workflowIndexSupplied: false,
    hasNativeTask: true,
    subagentsAllowed: true,
    taskDescriptor: { operation: 'modify', domains: ['code'] },
    model: { provider: 'opencode-go', id: 'deepseek-v4-flash' },
  });
  assert.ok(reminder);
  assert.doesNotMatch(reminder.content, /deepseek|mimo|opencode-go|model=/iu);
});

test('the workflow catalog has exactly the five consolidated definitions with the simplified schema', () => {
  assert.equal(WORKFLOW_CATALOG_VERSION, 31);
  assert.deepEqual(workflowIds, ['code', 'writing', 'research', 'visual', 'operations']);
  assert.equal(workflowDefinitions.length, 5);

  for (const definition of workflowDefinitions) {
    assert.ok(typeof definition.chooseWhen === 'string' && definition.chooseWhen.length > 0, `${definition.id}.chooseWhen`);
    assert.ok(Array.isArray(definition.skills) && definition.skills.length > 0, `${definition.id}.skills`);
    assert.ok(Array.isArray(definition.roles) && definition.roles.length > 0, `${definition.id}.roles`);
    assert.ok(
      Array.isArray(definition.suggestedFlow)
        && definition.suggestedFlow.length > 0
        && definition.suggestedFlow.every((text) => typeof text === 'string' && text.length > 0),
      `${definition.id}.suggestedFlow`,
    );
    assert.ok(Array.isArray(definition.scopeNotes), `${definition.id}.scopeNotes`);
    for (const field of REMOVED_FIELDS) {
      assert.equal(Object.hasOwn(definition, field), false, `${definition.id} must not have ${field}`);
    }
    const card = workflowCatalog[definition.id];
    assert.deepEqual(Object.keys(card).sort(), [
      'catalogSkills',
      'chooseWhen',
      'roles',
      'scopeNotes',
      'skills',
      'suggestedFlow',
    ].sort(), `${definition.id} catalog card must expose only simplified fields`);
  }
});

test('the generated SKILL.md index lists all five domains with skills and no legacy protocol markers', () => {
  const index = buildWorkflowSkillIndexMarkdown();

  for (const id of ['code', 'writing', 'research', 'visual', 'operations']) {
    const row = index.split('\n').find((line) => line.includes(`\`${id}\``));
    assert.ok(row, `index must contain a row for ${id}`);
    assert.match(row, /— .+/u, `${id} row must carry chooseWhen text`);
    assert.match(row, new RegExp(`Reference: \`skill://omp-enhancer-workflows/references/${id}\.md\``, 'u'), `${id} row must carry its reference URI`);
  }

  assert.match(index, /ANALYZE -> EXECUTE -> REVIEW/u);
  assert.match(index, /## Domain index/u);
  assert.match(index, /## Usage/u);

  for (const marker of ['DECLARE HANDOFF', 'WORKFLOW PLAN', 'SENTINEL', 'byte 0', 'NOW=', 'THEN=', 'RESOURCE EXTENSION', 'Delegate Agent=', 'DISCOVER -> DECLARE']) {
    assert.doesNotMatch(index, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu'), `index must not contain ${marker}`);
  }
});

test('the protocol coach and model-toolcall-priming modules are deleted', async () => {
  await assert.rejects(
    () => import('../src/workflow-protocol-coach.js'),
    /Cannot find|Failed to load|does not provide|ERR_MODULE_NOT_FOUND/iu,
    'workflow-protocol-coach.js must no longer exist',
  );
  await assert.rejects(
    () => import('../src/model-toolcall-priming.js'),
    /Cannot find|Failed to load|does not provide|ERR_MODULE_NOT_FOUND/iu,
    'model-toolcall-priming.js must no longer exist',
  );
});

test('the code workflow names the packaged analyzer agent among its role candidates', () => {
  assert.deepEqual(workflowCatalog.code.roles, ['analyzer', 'task', 'reviewer', 'scout', 'librarian']);
  assert.deepEqual(workflowCatalog.code.skills, ['code-development']);
  assert.ok(
    workflowCatalog.code.suggestedFlow.some((line) => /delegate analysis and planning to analyzer/iu.test(line)),
    'code suggestedFlow must advise delegating complex analysis to analyzer',
  );
});
