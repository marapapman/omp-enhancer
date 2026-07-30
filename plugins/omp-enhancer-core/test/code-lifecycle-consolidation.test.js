import test from 'node:test';
import assert from 'node:assert/strict';

import { workflowCatalog, workflowIds } from '../src/workflows/catalog.js';

const RETIRED_CODE_WORKFLOWS = [
  'code.plan',
  'code.debug',
  'code.test',
  'code.review',
  'code.build',
  'performance.optimize',
  'research.technical',
];

test('ordinary code work has one lifecycle workflow with one owning Skill', () => {
  const workflow = workflowCatalog['code.dev'];

  assert.ok(workflow);
  assert.deepEqual(
    workflowIds.filter((id) => id.startsWith('code.') || id === 'performance.optimize'),
    ['code.dev'],
  );
  for (const id of RETIRED_CODE_WORKFLOWS) assert.equal(workflowIds.includes(id), false, id);
  assert.deepEqual(workflow.skills, ['code-development']);
  assert.deepEqual(workflow.roles, ['plan', 'task', 'reviewer', 'scout', 'librarian']);
  assert.equal(workflow.composeWith.includes('omp.plugin'), false);

  const omp = workflowCatalog['omp.plugin'];
  assert.deepEqual(omp.skills, ['code-development']);
  assert.deepEqual(omp.roles, ['plan', 'task', 'reviewer', 'scout', 'librarian']);
  assert.equal(omp.composeWith.includes('code.dev'), false);
});

test('the consolidated lifecycle is subagent-driven from parallel vertical TDD through repair', () => {
  const workflow = workflowCatalog['code.dev'];
  const steps = workflow.steps.join(' ');
  const delegation = workflow.delegation.join(' ');
  const scope = workflow.scopeNotes.join(' ');

  assert.match(workflow.chooseWhen, /plan|diagnos|debug|implement|test|build|performance|review/iu);
  assert.match(steps, /local.+search.+caller.+test/iu);
  assert.match(steps, /network.+official.+community/iu);
  assert.match(steps, /detailed.+plan.+parallel.+waves.+vertical slices.+exact files.+non-overlapping.+write/iu);
  assert.match(steps, /reviewer.+audit.+plan.+parallel.+write sets.+dependencies/iu);
  assert.match(steps, /same.+tasks\[\].+batch.+runnable.+independent.+slice/iu);
  assert.match(steps, /task.+test.+mutation.+valid.+RED.+minimum.+production.+same.+command.+GREEN.+refactor/iu);
  assert.match(steps, /reviewer.+independently reviews.+bounded.+semantic diff.+evidence.+without.+project.+read.+command/iu);
  assert.match(steps, /supported.+finding.+task.+repair.+fresh.+evidence.+Main.+integrat.+fresh.+reviewer/iu);
  assert.match(delegation, /reviewer.+audit.+plan.+write sets.+dependencies/iu);
  assert.match(delegation, /task.+same.+tasks\[\].+batch.+vertical.+RED.+GREEN.+REFACTOR/iu);
  assert.match(delegation, /reviewer.+bounded.+semantic diff.+evidence.+does not read.+project.+run.+command/iu);
  assert.match(delegation, /task.+supported.+finding.+repair/iu);
  assert.doesNotMatch(delegation, /reviewer.+plan.+before production/iu);
  assert.doesNotMatch(`${steps} ${delegation}`, /fixed.+fanout|required fork|automatic.+loop/iu);
  assert.match(scope, /read-only.+does not authorize.+mutation/iu);
  assert.match(scope, /no meaningful test seam.+strongest available.+evidence/iu);

  assertLifecycleOrder(workflow);
});

test('omp.plugin separates behavioral TDD from one-shot shared generation', () => {
  const workflow = workflowCatalog['omp.plugin'];
  const taskTdd = workflow.steps.find((step) => /Behavior\/source tasks own one complete vertical slice/iu.test(step));
  const verify = workflow.steps.find((step) => /After all task deliveries/iu.test(step));
  const delegation = workflow.delegation.join(' ');

  assert.ok(taskTdd);
  assert.ok(verify);
  assert.match(taskTdd, /behavior.+source.+task.+real.+RED.+same.+command.+GREEN/iu);
  assert.match(taskTdd, /shared-generation.+task.+generator.+exactly once/iu);
  assert.match(taskTdd, /generation.+check.+parity.+evidence.+without.+fabricat.+RED/iu);
  assert.match(verify, /check-only.+parity.+no-diff.+inspection/iu);
  assert.match(verify, /must not rerun.+shared generator/iu);
  assert.match(delegation, /behavior.+source.+task.+RED.+GREEN/iu);
  assert.match(delegation, /shared-generation.+task.+exactly once.+without.+fabricat.+RED/iu);
});

test('domain code changes reuse task-owned parallel vertical TDD and Main-before-reviewer review', () => {
  for (const id of ['database.change', 'database.migration.repair', 'ml.debug']) {
    const workflow = workflowCatalog[id];
    const steps = workflow.steps.join(' ');
    const delegation = workflow.delegation.join(' ');

    assert.deepEqual(workflow.roles, ['plan', 'task', 'reviewer', 'scout', 'librarian'], id);
    assert.ok(workflow.skills.includes('code-development'), id);
    assert.match(steps, /Main writes.+parallel.+wave.+vertical.+slice.+non-overlapping.+write/iu, `${id}: parallel Main plan`);
    assert.match(steps, /plan Agent.+review.+parallel.+before.+production/iu, `${id}: plan review`);
    assert.match(steps, /task.+test.+RED.+production.+same.+command.+GREEN.+refactor/iu, `${id}: task-owned TDD`);
    assert.match(steps, /reviewer.+independently reviews.+bounded.+diff.+evidence/iu, `${id}: reviewer input`);
    assert.match(steps, /supported.+finding.+task.+repair/iu, `${id}: task repair`);
    assert.match(delegation, /reviewer.+audit.+plan.+supplied.+plan/iu, `${id}: plan delegation`);
    assert.match(delegation, /task.+vertical.+RED.+GREEN/iu, `${id}: task delegation`);
    assert.match(delegation, /reviewer.+independently.+bounded.+diff/iu, `${id}: diff review`);
    assertLifecycleOrder(workflow, id);
  }
});

test('code.dev lifecycle covers establish-to-report endpoint ordering', () => {
  const workflow = workflowCatalog['code.dev'];
  assert.ok(workflow, 'missing code.dev workflow');

  // Reuse existing full lifecycle ordering seam
  assertLifecycleOrder(workflow);

  // Step-1 establishes acceptance criteria and must precede all lifecycle phases
  const est = workflow.steps.findIndex(s => /acceptance criteria/u.test(s));
  const plan = workflow.steps.findIndex(s => /Main writes.+detailed.+plan.+parallel.+waves/u.test(s));
  assert.notEqual(est, -1, 'missing acceptance criteria step');
  assert.ok(est < plan, 'establish (step-1) must precede plan step');

  // Last step must be the lifecycle report
  const reportIdx = workflow.steps.findIndex(s => /^Report/i.test(s));
  assert.notEqual(reportIdx, -1, 'missing lifecycle report step');
  assert.equal(reportIdx, workflow.steps.length - 1, 'step-report must be the final lifecycle step');
});

function assertLifecycleOrder(workflow, label = workflow.id) {
  const stepIndex = (pattern, phase) => {
    const index = workflow.steps.findIndex((text) => pattern.test(text));
    assert.notEqual(index, -1, `${label}: missing ${phase}`);
    return index;
  };

  const plan = stepIndex(/Main.+plan.+parallel.+wave.+vertical.+slice/iu, 'parallel plan');
  const planReview = stepIndex(/reviewer.+audit.+plan/iu, 'plan audit');
  const taskTdd = stepIndex(/task.+RED.+GREEN.+refactor/iu, 'task TDD');
  const reviewer = stepIndex(/reviewer.+independently reviews.+bounded.+diff.+evidence/iu, 'reviewer review');
  const repair = stepIndex(/supported.+finding.+task.+repair/iu, 'task repair');

  assert.ok(plan < planReview, `${label}: plan must precede plan audit`);
  assert.ok(planReview < taskTdd, `${label}: plan audit must precede task TDD`);
  assert.ok(taskTdd < reviewer, `${label}: task TDD must precede reviewer`);
  assert.ok(reviewer < repair, `${label}: reviewer findings must precede repair`);
}
