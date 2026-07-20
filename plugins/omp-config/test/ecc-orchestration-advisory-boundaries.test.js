import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readSkill(name) {
  return readFileSync(join(pluginRoot, 'skills', 'ecc', name, 'SKILL.md'), 'utf8');
}

function frontmatterOf(skill) {
  return skill.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? '';
}

test('agent architecture audit is advisory to the committed workflow and has portable frontmatter', () => {
  const skill = readSkill('agent-architecture-audit');

  assert.doesNotMatch(frontmatterOf(skill), /^tools:/mu);
  assert.match(skill, /Main owns cross-Skill composition[\s\S]*initial `WORKFLOW PLAN`[\s\S]*before\s+`WORKFLOW READY`/iu);
  assert.match(skill, /loaded Skill does not reselect, reroute,[\s\S]*hand off to another Skill/iu);
  assert.match(skill, /does not replace the parent TODO or[\s\S]*Main's Agent choice/iu);
  assert.match(skill, /severity-ranked findings and suggested repairs are advisory/isu);
  assert.match(
    skill,
    /does not add or require.+OMP.+code gate.+hard gate.+router.+completion\s+controller/isu,
  );
  assert.match(
    skill,
    /native OMP owns[\s\S]*Agent\s+availability[\s\S]*permissions[\s\S]*completion[\s\S]*Main owns[\s\S]*Agent\s+selection[\s\S]*concurrency[\s\S]*parent TODO[\s\S]*integration/iu,
  );
  assert.match(skill, /host\s+configuration[\s\S]*background\s+task[\s\S]*deploy[\s\S]*separate\s+explicit\s+user\s+authorization[\s\S]*native\s+permission/iu);
  assert.doesNotMatch(skill, /\*\*MANDATORY for:\*\*|Code-gate tool requirements/iu);

  for (const domainAnchor of [
    /12-Layer Stack/iu,
    /Wrapper Regression/iu,
    /Memory Contamination/iu,
    /Rendering\/Transport Corruption/iu,
    /Severity Model/iu,
    /ecc\.agent-architecture-audit\.report\.v1/u,
  ]) {
    assert.match(skill, domainAnchor);
  }
});

test('parallel optimizer advises Main without becoming a second orchestrator', () => {
  const skill = readSkill('parallel-execution-optimizer');

  assert.match(skill, /reads the\s+currently committed.+workflow.+parent TODO.+returns advisory lane findings/isu);
  assert.match(
    skill,
    /does not replace the parent TODO[\s\S]*dispatch Agents[\s\S]*set fixed fanout[\s\S]*create\s+a parallel orchestration layer/iu,
  );
  assert.match(
    skill,
    /native OMP owns[\s\S]*Agent\s+availability[\s\S]*capacity[\s\S]*permissions[\s\S]*completion[\s\S]*Main owns[\s\S]*Agent\s+selection[\s\S]*concurrency[\s\S]*dependency waves[\s\S]*integration/iu,
  );
  assert.match(
    skill,
    /host configuration[\s\S]*worktree[\s\S]*background process[\s\S]*deploy[\s\S]*separate\s+explicit\s+user\s+authorization[\s\S]*native\s+permission/iu,
  );
  assert.match(skill, /current Available Agents/iu);
  assert.doesNotMatch(skill, /Start long-running tests, builds, backfills, and deploys in separate sessions/iu);

  for (const domainAnchor of [
    /dependency graph/iu,
    /Lane Matrix/iu,
    /write surfaces do not collide/iu,
    /Verification/iu,
    /Failure Modes/iu,
  ]) {
    assert.match(skill, domainAnchor);
  }
});
