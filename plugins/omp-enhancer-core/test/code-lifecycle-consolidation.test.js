import test from 'node:test';
import assert from 'node:assert/strict';

import { workflowCatalog, workflowIds } from '../src/workflows/catalog.js';

const RETIRED_CODE_WORKFLOWS = [
  'code.dev',
  'code.plan',
  'code.debug',
  'code.test',
  'code.review',
  'code.build',
  'performance.optimize',
  'research.technical',
  'omp.plugin',
];

test('ordinary code work has one lifecycle workflow with one owning Skill', () => {
  const workflow = workflowCatalog.code;

  assert.ok(workflow);
  assert.deepEqual(
    workflowIds.filter((id) => id.startsWith('code') || id === 'performance.optimize'),
    ['code'],
  );
  for (const id of RETIRED_CODE_WORKFLOWS) assert.equal(workflowIds.includes(id), false, id);
  assert.deepEqual(workflow.skills, ['code-development']);
  assert.deepEqual(workflow.roles, ['analyzer', 'task', 'reviewer', 'scout', 'librarian']);
  assert.equal(Object.hasOwn(workflow, 'composeWith'), false);
});

test('the consolidated lifecycle is advisory from parallel vertical TDD through repair', () => {
  const workflow = workflowCatalog.code;
  const flow = workflow.suggestedFlow.join(' ');
  const scope = workflow.scopeNotes.join(' ');

  assert.match(workflow.chooseWhen, /code inspection, planning, diagnosis, implementation, refactoring, testing, build repair, performance, database, ML, OMP plugin development, or code review/iu);
  assert.match(flow, /Establish outcome, authority, acceptance criteria, and baseline evidence\./iu);
  assert.match(flow, /Gather local evidence via scout and external evidence via librarian when decision-relevant\./iu);
  assert.match(flow, /For complex multi-slice work, delegate analysis and planning to analyzer; for focused work, Main plans directly\./iu);
  assert.match(flow, /Implement via task slices with TDD \(RED → GREEN → REFACTOR\) or direct work for simple changes\./iu);
  assert.match(flow, /Review: Main reviews simple changes directly; delegate complex or risky changes to reviewer\./iu);
  assert.match(flow, /Verify against acceptance criteria and report\./iu);

  assert.match(scope, /Read-only or plan-only requests do not authorize production mutation/iu);
  assert.match(scope, /When no test seam exists, use the strongest available evidence without fabricating a RED/iu);
  assert.match(scope, /Main chooses delegation width based on complexity; no fixed fanout or fork mandate/iu);

  assert.equal(Object.hasOwn(workflow, 'delegation'), false);
  assert.equal(Object.hasOwn(workflow, 'steps'), false);
});

test('database and ML work route to the code workflow', () => {
  const workflow = workflowCatalog.code;
  assert.match(workflow.chooseWhen, /\bdatabase\b/iu);
  assert.match(workflow.chooseWhen, /\bML\b/iu);
  assert.deepEqual(workflow.roles, ['analyzer', 'task', 'reviewer', 'scout', 'librarian']);
});
