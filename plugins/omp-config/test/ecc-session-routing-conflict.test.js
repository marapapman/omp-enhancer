import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readSkill(name) {
  return readFileSync(join(pluginRoot, 'skills', 'ecc', name, 'SKILL.md'), 'utf8');
}

function compact(content) {
  return content.replace(/\s+/gu, ' ');
}

function descriptionOf(content) {
  return content.match(/^description:\s*(.+)$/mu)?.[1] ?? '';
}

test('agent-sort remains an evidence method without session auto-load, a secondary router, or fixed fanout', () => {
  const skill = compact(readSkill('agent-sort'));

  assert.doesNotMatch(descriptionOf(readSkill('agent-sort')), /parallel review passes/iu);
  assert.match(skill, /DAILY.+frequent task-local selection.+never automatically loaded.+session/iu);
  assert.match(skill, /review dimensions.+not.+fixed.+assignment.+fanout/iu);
  assert.match(skill, /current Available Agents.+native capacity.+dependencies/iu);
  assert.match(skill, /does not create.+secondary Skill router/iu);
  assert.match(skill, /skill:\/\/ecc-skill-catalog\/configure-ecc\/SKILL\.md/iu);
  assert.match(skill, /skill:\/\/ecc-skill-catalog\/skill-stocktake\/SKILL\.md/iu);
  assert.match(skill, /skill:\/\/ecc-skill-catalog\/strategic-compact\/SKILL\.md/iu);
  assert.match(skill, /new `WORKFLOW PLAN`.+never automatically load/iu);
  assert.match(skill, /persistent.+exact named target and operation.+explicit user authorization.+native permission/iu);
  assert.doesNotMatch(skill, /load every session|always-loaded|skill-library router|\.claude\/skills\/skill-library\/SKILL\.md/iu);
});

test('product-capability keeps durable output and cross-Skill composition under Main authority', () => {
  const skill = compact(readSkill('product-capability'));

  assert.match(skill, /response-local.+default/iu);
  assert.match(skill, /persistent.+exact named path and operation.+explicit user authorization.+native permission/iu);
  assert.match(skill, /exact Skill URI.+candidate.+new `WORKFLOW PLAN`.+does not automatically load/iu);
  for (const name of [
    'project-flow-ops',
    'workspace-surface-audit',
    'api-connector-builder',
    'dashboard-builder',
    'tdd-workflow',
    'verification-loop',
  ]) {
    assert.match(skill, new RegExp(`skill://ecc-skill-catalog/${name}/SKILL\\.md`, 'u'));
  }
  assert.match(skill, /capability readiness.+domain finding.+not.+host completion.+release permission/iu);
  assert.doesNotMatch(skill, /## When to Use|hand off to:\s*- `(?:project-flow-ops|tdd-workflow)`/iu);
});

test('data throughput separates live effects and target accounting from OMP completion', () => {
  const skill = compact(readSkill('data-throughput-accelerator'));

  assert.match(
    skill,
    /live source or target read.+catch-up.+benchmark.+write.+exact named target and operation.+explicit user authorization.+native permission/iu,
  );
  assert.match(skill, /schedule.+persistent CLI, workflow, or runbook.+separate.+authorization/iu);
  assert.match(skill, /recurring rerun.+external target system.+never.+current OMP session/iu);
  assert.match(skill, /domain accounting (?:check|status).+not.+host completion gate/iu);
  assert.doesNotMatch(skill, /Correctness gate:|call a pipeline complete/iu);
});

test('Django verification commands distinguish inspection from authorized mutation', () => {
  const skill = compact(readSkill('django-verification'));

  assert.match(skill, /selected and loaded.+does not activate itself.+secondary router/iu);
  assert.match(skill, /command blocks.+reference examples.+exact named target and operation.+explicit user authorization.+native permission/iu);
  assert.match(skill, /auto-fix.+makemigrations.+migrate.+persistent report.+separate mutation/iu);
  assert.match(skill, /CI example.+external target system.+does not schedule or continue.+current OMP session/iu);
  assert.match(skill, /READY.+NOT READY.+domain verdict.+not.+host completion.+release.+deploy permission/iu);
  assert.doesNotMatch(skill, /## When to Activate|npm audit fix|Keep the gate strict/iu);
});

test('Spring Boot verification keeps repair, release, and periodic execution host-authorized', () => {
  const skill = compact(readSkill('springboot-verification'));

  assert.match(skill, /selected and loaded.+does not activate itself.+secondary router/iu);
  assert.match(skill, /command blocks.+reference examples.+exact named target and operation.+explicit user authorization.+native permission/iu);
  assert.match(skill, /spotless.+repair.+separate mutation.+explicit user authorization.+native permission/iu);
  assert.match(skill, /periodic rerun.+external target system.+exact schedule and target.+never.+current OMP session/iu);
  assert.match(skill, /READY.+NOT READY.+domain verdict.+not.+host completion.+release.+deploy permission/iu);
  assert.doesNotMatch(skill, /## When to Activate|optional gate|Keep the gate strict/iu);
});
