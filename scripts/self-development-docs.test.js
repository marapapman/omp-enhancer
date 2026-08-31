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
  assert.match(guide, /native `plan`.+起草.+native `reviewer`.+审计/isu);
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
  assert.match(guide, /self-iteration\.json/iu);
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

test('current repository documentation matches the v38 runtime and evidence contracts', async () => {
  const [agents, architecture, development, workflows] = await Promise.all([
    read('AGENTS.md'),
    read('docs/ARCHITECTURE.md'),
    read('docs/DEVELOPMENT.md'),
    read('docs/WORKFLOW_DEVELOPMENT.md'),
  ]);

  assert.match(agents, /Workflow catalog \(v38\)/u);
  assert.match(workflows, /catalog v38 只有 3 个 ID/isu);
  assert.doesNotMatch(
    [agents, architecture, development, workflows].join('\n'),
    /Catalog version 23|catalog \(v23\)|catalog v30|catalog \(v33\)|catalog v34/iu,
  );
  assert.match(
    agents,
    /`omp-fact-checker` \| Claim extraction.+verdict reports.+`index\.js`/iu,
  );

  for (const [path, content] of [
    ['AGENTS.md', agents],
    ['docs/ARCHITECTURE.md', architecture],
  ]) {
    assert.match(
      content,
      /designer.+draw(?:s)? the diagram once with.+`drawio-skill`.+drawio@365-skills.+visioner.+exported PNG read-only in one pass.+at most one fix round.+Main retains setup authorization.+final acceptance/is,
      path,
    );
    assert.match(
      content,
      /backward-compatible `verdict`.+cannot upgrade.+proof.+`strictVerdict`.+`SUPPORTED`.+same-tuple `ENTAILS \+ PROVEN`.+`CONTRADICTED`.+same-tuple `NEGATES \+ DISPROVED`/isu,
      path,
    );
  }


  const probe = workflows.match(/真实 OMP 兼容验证[\s\S]*?Probe 使用/iu)?.[0] ?? '';
  for (const entry of [
    'plugins/omp-config/index.js',
    'plugins/writing-helper/index.js',
    'plugins/omp-fact-checker/index.js',
  ]) {
    assert.match(probe, new RegExp(entry.replaceAll('.', '\\.'), 'u'), entry);
  }
});

test('omp-config README matches the current catalog and staged Beamer workflow', async () => {
  const readme = await read('plugins/omp-config/README.md');

  assert.match(readme, /generated from `scripts\/workflow-definitions\.js`.+catalog v38/isu);
  assert.match(readme, /text-only content.+visual authoring.+layout refinement/is);
  assert.match(readme, /user confirms.+page content.+basic layout/is);
  assert.doesNotMatch(readme, /omp-enhancer-core|skills\/ecc|5 domains|generate:ecc-skills|check:ecc-skills/iu);
});

test('current docs distinguish the single Beamer precheck from the unchanged draw.io pipeline', async () => {
  const documents = await Promise.all([
    ['AGENTS.md', 'AGENTS.md'],
    ['README.md', 'README.md'],
    ['docs/ARCHITECTURE.md', 'docs/ARCHITECTURE.md'],
    ['docs/DEVELOPMENT.md', 'docs/DEVELOPMENT.md'],
    ['docs/WORKFLOW_DEVELOPMENT.md', 'docs/WORKFLOW_DEVELOPMENT.md'],
  ].map(async ([label, relative]) => [label, await read(relative)]));

  for (const [label, content] of documents) {
    assert.match(
      content,
      /Beamer[\s\S]{0,500}single read-only visual precheck[\s\S]{0,500}(?:Main or task|task or Main)[\s\S]{0,500}(?:initial render|task's initial)[\s\S]{0,500}before the designer/iu,
      label,
    );
    assert.match(
      content,
      /draw\.?io(?: pipeline)? remains unchanged[\s\S]{0,500}designer[\s\S]{0,500}visioner[\s\S]{0,500}at most one fix round/iu,
      label,
    );
  }
});
test('current Beamer documentation keeps Markdown content separate from derived layout', async () => {
  const documents = await Promise.all([
    ['AGENTS.md', await read('AGENTS.md')],
    ['README.md', await read('README.md')],
    ['docs/ARCHITECTURE.md', await read('docs/ARCHITECTURE.md')],
    ['docs/DEVELOPMENT.md', await read('docs/DEVELOPMENT.md')],
    ['docs/WORKFLOW_DEVELOPMENT.md', await read('docs/WORKFLOW_DEVELOPMENT.md')],
    ['docs/WORKFLOW_E2E_TESTING.md', await read('docs/WORKFLOW_E2E_TESTING.md')],
    ['plugins/omp-config/README.md', await read('plugins/omp-config/README.md')],
  ]);

  for (const [path, content] of documents) {
    assert.match(content, /Markdown content plan.+canonical content source/isu, path);
    assert.match(content, /Beamer .tex files?.+derived layout artifacts/isu, path);
    assert.match(content, /content changes.+Markdown.+(?:reconfirm|重新与用户确认).+regenerate.+Beamer/isu, path);
  }
});



test('current documentation describes the simplified ANALYZE to EXECUTE to REVIEW advisory without making it a gate', async () => {
  const [agents, architecture, development, e2e] = await Promise.all([
    read('AGENTS.md'),
    read('docs/ARCHITECTURE.md'),
    read('docs/DEVELOPMENT.md'),
    read('docs/WORKFLOW_E2E_TESTING.md'),
  ]);

  for (const [path, content] of [
    ['AGENTS.md', agents],
    ['docs/ARCHITECTURE.md', architecture],
    ['docs/DEVELOPMENT.md', development],
    ['docs/WORKFLOW_E2E_TESTING.md', e2e],
  ]) {
    assert.match(content, /ANALYZE -> EXECUTE -> REVIEW/u, path);
    assert.match(content, /(?:no|不|不得|不会).+(?:block|gate|router|路由|门禁|completion|完成控制)/isu, path);
  }

  assert.match(agents, /OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER/u);
  assert.doesNotMatch(
    [agents, architecture, development, e2e].join('\n'),
    /OMP_ENHANCER_DISABLE_PROTOCOL_COACH|PRE_PLAN[\s\S]*PRE_READY[\s\S]*PRE_DISPATCH/iu,
  );
});
