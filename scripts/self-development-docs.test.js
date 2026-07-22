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

test('current repository documentation matches the v22 runtime and evidence contracts', async () => {
  const [agents, architecture, development, workflows] = await Promise.all([
    read('AGENTS.md'),
    read('docs/ARCHITECTURE.md'),
    read('docs/DEVELOPMENT.md'),
    read('docs/WORKFLOW_DEVELOPMENT.md'),
  ]);

  assert.match(agents, /Workflow catalog \(v22\)/u);
  assert.match(agents, /Workflow catalog v22/u);
  assert.match(architecture, /Catalog version 22.+31.+29.+`subagent-driven`/isu);
  assert.match(development, /Catalog version 22.+31.+29.+`subagent-driven`/isu);
  assert.match(workflows, /当前 31 张卡片.+29 张.+`subagent-driven`/isu);
  assert.match(workflows, /parity.+29 张.+`subagent-driven`/isu);
  assert.doesNotMatch(
    [agents, architecture, development, workflows].join('\n'),
    /Catalog version 21|catalog \(v21\)|当前 30 张卡片|28 张非简单卡片/iu,
  );

  assert.match(
    agents,
    /`omp-enhancer-core` \| Task facts.+protocol coaching.+skill\/subagent validation.+`index\.js`/iu,
  );
  assert.doesNotMatch(agents, /`omp-enhancer-core` \|[^\n|]*Workflow routing/iu);
  assert.doesNotMatch(agents, /`plugins\/omp-enhancer-core\/src\/` \|[^\n|]*routing/iu);
  assert.match(
    agents,
    /`omp-test-enhancer`.+seven default-inactive advisory tools.+`dist\/extension\.js`.+`src\/extension\.ts`/isu,
  );
  assert.match(
    agents,
    /`plugins\/omp-test-enhancer\/src\/extension\.ts`.+source registration.+seven default-inactive advisory tools.+`dist\/extension\.js`/isu,
  );
  assert.doesNotMatch(agents, /advisory review gates|gate orchestration|6 tools/iu);

  for (const [path, content] of [
    ['AGENTS.md', agents],
    ['docs/ARCHITECTURE.md', architecture],
  ]) {
    assert.match(
      content,
      /designer.+(?:design|source) revision.+task.+rendering.+compilation.+export.+visioner.+fresh.+read-only.+Main.+setup authorization.+final acceptance.+does not mediate/isu,
      path,
    );
    assert.match(
      content,
      /backward-compatible `verdict`.+cannot upgrade.+proof.+`strictVerdict`.+`SUPPORTED`.+same-tuple `ENTAILS \+ PROVEN`.+`CONTRADICTED`.+same-tuple `NEGATES \+ DISPROVED`/isu,
      path,
    );
  }

  for (const [path, content] of [
    ['docs/DEVELOPMENT.md', development],
    ['docs/WORKFLOW_DEVELOPMENT.md', workflows],
  ]) {
    assert.match(
      content,
      /willingness.+`general\.subagent`.+non-mechanical.+subagent-driven/isu,
      path,
    );
    assert.doesNotMatch(content, /willingness.+non-mechanical `agentic\.simple`/isu, path);
  }

  const probe = workflows.match(/真实 OMP 兼容验证[\s\S]*?Probe 使用/iu)?.[0] ?? '';
  for (const entry of [
    'plugins/omp-enhancer-core/index.js',
    'plugins/omp-config/index.js',
    'plugins/writing-helper/index.js',
    'plugins/omp-test-enhancer/dist/extension.js',
    'plugins/omp-fact-checker/index.js',
    'plugins/tikz-helper/index.js',
  ]) {
    assert.match(probe, new RegExp(entry.replaceAll('.', '\\.'), 'u'), entry);
  }
});

test('current documentation defines the bounded phase-local protocol coach without making it a gate', async () => {
  const [agents, architecture, development, optimization, e2e] = await Promise.all([
    read('AGENTS.md'),
    read('docs/ARCHITECTURE.md'),
    read('docs/DEVELOPMENT.md'),
    read('docs/DEEPSEEK_PROMPT_OPTIMIZATION.md'),
    read('docs/WORKFLOW_E2E_TESTING.md'),
  ]);

  for (const [path, content] of [
    ['AGENTS.md', agents],
    ['docs/ARCHITECTURE.md', architecture],
    ['docs/DEVELOPMENT.md', development],
    ['docs/DEEPSEEK_PROMPT_OPTIMIZATION.md', optimization],
    ['docs/WORKFLOW_E2E_TESTING.md', e2e],
  ]) {
    assert.match(content, /PRE_PLAN[\s\S]*PRE_READY[\s\S]*PRE_DISPATCH/iu, path);
    assert.match(content, /OMP_ENHANCER_DISABLE_PROTOCOL_COACH/iu, path);
    assert.match(content, /(?:next natural|下一次自然).*?(?:request|请求)/isu, path);
    assert.match(content, /(?:no|不|不得|不会).+(?:block|gate|router|路由|门禁|completion|完成控制)/isu, path);
  }

  assert.match(development, /writing\.pending[\s\S]*(?:不|不得|不会|does not).+PRE_DISPATCH/iu);
  assert.match(e2e, /deterministic[\s\S]*context[\s\S]*(?:single|单次).+(?:sample|样本)/isu);
  assert.doesNotMatch(optimization, /No plugin observes or enforces either sentinel|No hook observes or enforces these markers/iu);
});
