import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readSkill(name) {
  return readFileSync(join(pluginRoot, 'skills', 'ecc', name, 'SKILL.md'), 'utf8');
}

test('planning skills supplement the current OMP code lifecycle without routing or side effects', () => {
  for (const name of ['blueprint', 'agentic-engineering']) {
    const content = readSkill(name);

    assert.match(
      content,
      /self-contained.+plan.+dependenc.+parallel.+eval.+cost.+risk/isu,
      `${name}: planning method`,
    );
    assert.match(
      content,
      /Main.+plugin `plan`.+native `task`.+TDD.+`MAIN REVIEW`.+native `reviewer`/isu,
      `${name}: current code lifecycle`,
    );
    assert.match(
      content,
      /currently exposed.+Available Agents.+native capacity/isu,
      `${name}: dynamic agent choice`,
    );
    assert.match(
      content,
      /does not choose.+model.+Agent count.+fanout.+completion/isu,
      `${name}: advisory planning boundary`,
    );
    assert.match(
      content,
      /write.+plan.+memory.+explicit user authorization/isu,
      `${name}: plan persistence permission`,
    );
    assert.match(
      content,
      /command.+git.+gh.+commit.+push.+PR.+explicit user authorization/isu,
      `${name}: external-effect permission`,
    );
    assert.doesNotMatch(content, /\b(?:Haiku|Sonnet|Opus)\b/iu, `${name}: fixed model tier`);
    assert.doesNotMatch(content, /\/blueprint\b|claude\s+-p/iu, `${name}: foreign command`);
    assert.doesNotMatch(content, /adversarial review gate|strongest-model|auto(?:matically)?-?switch/iu, `${name}: foreign controller`);
  }

  assert.ok(Buffer.byteLength(readSkill('blueprint')) < 4_500, 'blueprint should stay compact');
  assert.ok(Buffer.byteLength(readSkill('agentic-engineering')) < 3_500, 'agentic-engineering should stay compact');
});

test('autonomous-loops is only a compact legacy reference for an external target system', () => {
  const content = readSkill('autonomous-loops');

  assert.match(content, /legacy compatibility name/iu);
  assert.match(content, /external target system/iu);
  assert.match(content, /not.+current OMP session.+loop/isu);
  assert.match(
    content,
    /new `WORKFLOW PLAN`.+may select.+`skill:\/\/ecc-skill-catalog\/continuous-agent-loop\/SKILL\.md`/isu,
  );
  assert.match(content, /must not automatically.+read.+load.+route/isu);
  assert.match(content, /explicit user authorization.+write.+command.+persistent.+external effect/isu);
  assert.doesNotMatch(content, /claude\s+-p|\/claw\b|\/verify\b|\/quality-gate\b|\/harness-audit\b/iu);
  assert.doesNotMatch(content, /waves? of 3-5|auto(?:matic(?:ally)?)?-?fix|completion[- ]signal/iu);
  assert.ok(Buffer.byteLength(content) < 2_000, 'legacy compatibility skill should be very small');
});

test('continuous-agent-loop designs bounded external loops without controlling this session', () => {
  const content = readSkill('continuous-agent-loop');

  assert.match(content, /only when the user explicitly requests.+design or run.+external autonomous loop/isu);
  assert.match(content, /examples?.+target data.+not.+instructions for the current OMP session/isu);
  assert.match(content, /bounded.+iteration.+eval.+progress.+churn.+cost.+recovery/isu);
  assert.match(
    content,
    /file write.+command.+persist.+commit.+push.+PR.+merge.+CI repair.+separate explicit user authorization/isu,
  );
  assert.match(content, /currently exposed.+Available Agents.+native capacity/isu);
  assert.match(content, /does not choose.+model tier.+Agent count.+fanout/isu);
  assert.match(
    content,
    /current OMP code task.+Main.+plugin `plan`.+native `task`.+TDD.+`MAIN REVIEW`.+native `reviewer`/isu,
  );
  assert.doesNotMatch(content, /\/\w[\w-]*\b|claude\s+-p/iu, 'must not assume commands outside the live schema');
  assert.doesNotMatch(content, /waves? of 3-5|auto(?:matic(?:ally)?)?-?retry|completion controller|completion[- ]signal/iu);
  assert.doesNotMatch(content, /quality gate|hard gate|hard router/iu);
  assert.ok(Buffer.byteLength(content) < 4_000, 'continuous-agent-loop should stay compact');
});
