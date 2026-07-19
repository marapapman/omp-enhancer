import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const pluginRoot = path.resolve(import.meta.dirname, '..');

const RETIRED_CODE_SKILLS = [
  'brainstorming',
  'diagnose',
  'dispatching-parallel-agents',
  'executing-plans',
  'omp-enhancer-development',
  'plan-execute-review-commit',
  'receiving-code-review',
  'requesting-code-review',
  'subagent-driven-development',
  'systematic-debugging',
  'tdd',
  'test-driven-development',
  'using-superpowers',
  'verification-before-completion',
  'writing-plans',
];

test('one code-development Skill owns the subagent-driven code lifecycle', async () => {
  const skill = await readFile(path.join(pluginRoot, 'skills', 'code-development', 'SKILL.md'), 'utf8');

  assert.match(skill, /^---\nname: code-development\ndescription: .+\n---/u);
  assert.match(skill, /Search local code.+callers.+tests.+`rg`/isu);
  assert.match(skill, /official documentation.+community issues/isu);
  assert.match(skill, /Main.+detailed.+parallel.+waves.+vertical slices.+non-overlapping.+write sets/isu);
  assert.match(skill, /`plan` Agent.+`PLAN REVIEW`.+parallel.+assignment.+before changing production code/isu);
  assert.match(skill, /same native `task`.+tasks\[\].+batch.+runnable.+independent.+slice/isu);
  assert.match(skill, /native `task`.+test mutation.+expected assertion failure as RED.+minimum.+production.+same command.+GREEN.+refactor/isu);
  assert.match(skill, /Main.+integrat.+current tree.+semantic diff.+evidence.+self-review.+before.+native `reviewer`/isu);
  assert.match(skill, /native `reviewer`.+Main-reviewed.+bounded semantic diff.+does not.+read.+project.+run.+command/isu);
  assert.match(skill, /supported.+finding.+native `task`.+repair.+refresh.+affected evidence.+one fresh affected review/isu);
  assert.match(skill, /never an automatic review-repair loop/iu);
  assert.match(skill, /references\/omp-enhancer\.md/iu);
});

test('retired overlapping code-method Skills are no longer top-level choices', async () => {
  for (const name of RETIRED_CODE_SKILLS) {
    await assert.rejects(
      access(path.join(pluginRoot, 'skills', name, 'SKILL.md')),
      (error) => error?.code === 'ENOENT',
      name,
    );
  }
});

test('ordinary code delegation exposes plugin plan plus native task and reviewer without wrappers', async () => {
  const plan = await readFile(path.join(pluginRoot, 'agents', 'plan.md'), 'utf8');
  assert.match(plan, /local code.+search|search.+local code/isu);
  assert.match(plan, /official.+community/isu);
  assert.match(plan, /parallel.+waves.+vertical slices.+non-overlapping.+write sets/isu);
  assert.match(plan, /assignment.+native `task`.+test.+RED.+GREEN.+refactor/isu);

  for (const relative of [
    'agents/explore.md',
    'agents/task.md',
    'agents/implementation-task.md',
    '../omp-test-enhancer/agents/test-planner.md',
    '../omp-test-enhancer/agents/test-executor.md',
    '../omp-test-enhancer/agents/test-reviewer.md',
    'agents/config-librarian.md',
    'agents/omp-target-auditor.md',
  ]) {
    await assert.rejects(access(path.join(pluginRoot, relative)), (error) => error?.code === 'ENOENT', relative);
  }
});
