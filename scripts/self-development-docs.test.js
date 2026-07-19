import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const repoRoot = new URL('../', import.meta.url);

async function read(relative) {
  return readFile(new URL(relative, repoRoot), 'utf8');
}

test('self-development guide defines the agent-owned reviewed TDD lifecycle', async () => {
  const guide = await read('docs/OMP_ENHANCER_SELF_DEVELOPMENT.md');

  assert.match(guide, /^# OMP Enhancer Self-Development/imu);
  assert.match(guide, /agent-selected.+no hard router.+no hard gate/isu);
  assert.match(guide, /`omp\.plugin`.+Primary.+`code-development`/isu);
  assert.match(guide, /local code.+official.+community/isu);
  assert.match(guide, /DISCOVER.+WORKFLOW PLAN.+LOAD.+WORKFLOW READY.+TODO/isu);
  assert.match(guide, /PLAN REVIEW.+RED.+GREEN.+REFACTOR.+E2E.+review.+reconcile/isu);
  assert.match(guide, /`plan`.+complete plan.+native `reviewer`.+existing.+diff/isu);
  assert.match(
    guide,
    /PLAN REVIEW[\s\S]*native `task`[\s\S]*(?:one `tasks\[\]` batch|parallel batch)[\s\S]*`MAIN REVIEW`[\s\S]*native `reviewer`[\s\S]*native `task`[\s\S]*repair/iu,
  );
  assert.match(guide, /smallest useful.+distinct unanswered review questions/isu);
  assert.match(guide, /commit.+push.+publish.+upgrade.+explicit/isu);
  assert.match(guide, /cannot guarantee.+stochastic|stochastic.+cannot guarantee/isu);
  assert.doesNotMatch(guide, /must (?:return|use) `?(?:block:\s*true|continue:\s*true)|requires? (?:a )?fixed (?:reviewer|fork) count|schedule an automatic review-repair loop/iu);
});

test('shared generators are single-run mechanical integration slices', async () => {
  const paths = [
    'plugins/omp-config/skills/code-development/SKILL.md',
    'plugins/omp-config/skills/code-development/references/omp-enhancer.md',
    'docs/ARCHITECTURE.md',
    'docs/DEVELOPMENT.md',
    'docs/OMP_ENHANCER_SELF_DEVELOPMENT.md',
  ];
  const contents = await Promise.all(paths.map(read));

  for (const [index, content] of contents.entries()) {
    const message = paths[index];
    assert.match(content, /\bexactly once\b|恰好(?:执行|运行)(?: generator )?一次/iu, message);
    assert.match(content, /(?:downstream|下游).+exclusive.+integration.+source dependenc/isu, message);
    assert.match(content, /mechanical (?:generation )?slice|机械生成(?: slice|任务|切片)/iu, message);
    assert.match(content, /generator.+(?:check|检查).+parity.+no-unexpected-diff/isu, message);
    assert.match(content, /(?:must not|does not|不得|不能|不)\s*(?:fabricate|invent|伪造).+(?:TDD\s*)?RED/isu, message);
    assert.match(content, /Main.+generated diff.+check-only.+(?:does not|must not|不得|不会|不再).*?(?:rerun|再次运行|重跑).+generator/isu, message);
  }
});

test('workflow E2E guide defines event evidence, failure classes, and reproducible evaluation', async () => {
  const guide = await read('docs/WORKFLOW_E2E_TESTING.md');

  assert.match(guide, /^# Workflow and Skill E2E Testing/imu);
  assert.match(guide, /deterministic contract.+static OMP probe.+isolated model E2E/isu);
  assert.match(guide, /deepseek-self-iteration\.json/iu);
  assert.match(guide, /npm run e2e:main:self-iteration/iu);
  assert.match(guide, /test mutation.+RED.+production mutation.+GREEN/isu);
  assert.match(guide, /same command.+non-zero.+exit.+same command.+zero/isu);
  assert.match(guide, /provider 5xx.+OMP deadline.+runner hard timeout.+project command/isu);
  assert.match(guide, /behavior.+infrastructure/isu);
  assert.match(guide, /pilot.+freeze.+repeat.+negative control/isu);
  assert.match(guide, /inconclusive/iu);
  assert.doesNotMatch(guide, /one successful run proves|ignore provider|E2E is a runtime gate/iu);
});

test('current documentation links the self-development and E2E methods without expanding root README', async () => {
  const [index, architecture, development, workflows, readme] = await Promise.all([
    read('docs/README.md'),
    read('docs/ARCHITECTURE.md'),
    read('docs/DEVELOPMENT.md'),
    read('docs/WORKFLOW_DEVELOPMENT.md'),
    read('README.md'),
  ]);

  for (const content of [index, architecture, development, workflows]) {
    assert.match(content, /OMP_ENHANCER_SELF_DEVELOPMENT\.md/iu);
    assert.match(content, /WORKFLOW_E2E_TESTING\.md/iu);
  }
  assert.ok(readme.split('\n').length <= 110, 'root README remains concise');
  assert.ok(Buffer.byteLength(readme) <= 6500, 'root README keeps development detail under docs');
});
