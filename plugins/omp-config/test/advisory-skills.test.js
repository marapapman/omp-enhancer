import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = join(pluginRoot, '..', '..');

test('global guidance gives Main an explicit staged workflow, Skill, TODO, and delegation protocol', () => {
  const relative = 'assets/CLAUDE.md';
  const content = readFileSync(join(pluginRoot, relative), 'utf8');

  assert.match(content, /OMP's native system prompt, settings, active tools, dynamic Available Agents, approval flow, and completion behavior are authoritative/i, relative);
  assert.match(content, /skill:\/\/omp-enhancer-workflows/i, relative);
  assert.match(content, /DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY/i, relative);
  assert.match(content, /analysis, judgment, workflow composition,[\s\S]*coordinated stages, or possible delegation/i, relative);
  assert.match(content, /verbatim field or heading lookup without analysis[\s\S]*use no workflow Skill or TODO/i, relative);
  assert.match(content, /first PROJECT tool batch reads only `skill:\/\/omp-enhancer-workflows`[\s\S]*ends, and waits/i, relative);
  assert.match(content, /next response puts the filled PLAN in visible assistant text before any resource call[\s\S]*byte 0 is `W`[\s\S]*Skills: <exact domain Skill\/catalog URIs-or-none>[\s\S]*Load order: NOW=\[[^\n]+\] THEN=\[[^\n]+\][\s\S]*1\. LOAD:[\s\S]*2\. COMMIT:[\s\S]*3\. SPLIT \+ EXECUTE:[\s\S]*4\. VERIFY:/i, relative);
  assert.match(content, /`Skills` lists exact domain Skill\/catalog URIs only[\s\S]*workflow references appear only in `THEN`/i, relative);
  assert.match(content, /Index `D` entries are top-level exact URIs[\s\S]*`C` entries are enumerated nested ECC exact URIs[\s\S]*selected D\/C entries copy directly into `Skills` and `NOW`[\s\S]*`skill:\/\/ecc-skill-catalog` is only for unlisted niche discovery/i, relative);
  assert.match(content, /RESOURCE EXTENSION \| source=<loaded-exact-skill-uri> \| reads=<revealed-exact-skill-uris>[\s\S]*at most three extension batches[\s\S]*two catalog hops plus one linked-method batch/i, relative);
  assert.match(content, /next response is the filled READY plus native TODO init[\s\S]*byte 0 is `W`[\s\S]*Apply the loaded-card soft compiler:[\s\S]*one exact Delegate row for that checkpoint[\s\S]*Parent VERIFY rows remain separate/i, relative);
  assert.match(content, /Every non-simple loaded card is soft `subagent-driven`[\s\S]*currently visible matching Agent[\s\S]*assignment input is complete/i, relative);
  assert.match(content, /substantive code mutation[\s\S]*plugin `plan` review[\s\S]*native `task` slice[\s\S]*writes `MAIN REVIEW` before native `reviewer`/i, relative);
  assert.match(content, /\[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>\]/i, relative);
  assert.match(content, /child[\s\S]*does not own the parent TODO/i, relative);
  assert.match(content, /native `skill-prompt`/i, relative);
  assert.match(content, /native `skill-prompt` body is already loaded[\s\S]*keep its exact URI in PLAN `Skills`[\s\S]*omit it from `NOW`[\s\S]*never reread/i, relative);
  assert.match(content, /Copy a visible Skill name `x` to literal `skill:\/\/x`[\s\S]*Bare `x` is a project path[\s\S]*not the complete runtime inventory/i, relative);
  assert.match(content, /Project tools start only after the READY \+ TODO response ends[\s\S]*explicit source-language description is sufficient[\s\S]*select only the visible `writing\.pending` option/i, relative);
  assert.match(content, /No instruction above creates a required fork, fixed fanout, hard router, runtime gate, retry, continuation, repair loop, permission, or completion controller/i, relative);
  assert.doesNotMatch(content, /block:\s*true|continue:\s*true|triggerTurn\s*\(/i, relative);
  assert.doesNotMatch(content, /fork (?:at least|exactly|up to) \d+|reviewer count\s*=\s*\d+/i, relative);
});

test('root and managed Main guidance default every loaded non-simple workflow to bounded subagent work', () => {
  const files = [
    ['AGENTS.md', join(repositoryRoot, 'AGENTS.md')],
    ['assets/AGENTS.md', join(pluginRoot, 'assets', 'AGENTS.md')],
    ['assets/CLAUDE.md', join(pluginRoot, 'assets', 'CLAUDE.md')],
  ];

  for (const [relative, file] of files) {
    const content = readFileSync(file, 'utf8');

    assert.match(content, /(?:mechanical field lookup|verbatim field or heading lookup) without analysis[\s\S]*(?:skip workflow, Skill, and TODO preparation|use no workflow Skill or TODO)/iu, relative);
    assert.match(content, /`agentic\.simple`[\s\S]*(?:zero native `task` calls|uses zero `task` calls)/iu, relative);
    assert.match(content, /`writing\.pending`[\s\S]*(?:one-time composition transition|one narrow language-only target read)[\s\S]*writing\.(?:en|zh)[\s\S]*writing\.(?:en|zh)/iu, relative);
    assert.match(content, /(?:Every loaded non-simple workflow is subagent-driven by default|Every non-simple loaded card is soft `subagent-driven`)[\s\S]*current(?:ly visible)? matching Agent[\s\S]*assignment input is complete/iu, relative);
    assert.match(content, /(?:Prefer a current matching Agent named by|Prefer a domain Agent named by)[\s\S]*(?:owning domain Skill|owning Skill)[\s\S]*(?:generic `task` Agent|generic `task`)[\s\S]*fallback/iu, relative);
    assert.match(content, /(?:Send runnable independent checkpoints in the same `tasks\[\]` batch[\s\S]*dependency-bound checkpoints[\s\S]*later wave|Batch runnable independent checkpoints and keep dependent checkpoints in later waves)/iu, relative);
    assert.match(content, /Main retains[\s\S]*(?:parent TODO|integration)[\s\S]*permissions?[\s\S]*external(?:-| )effects?(?: decisions)?[\s\S]*(?:final response|final delivery)/iu, relative);
    assert.match(content, /direct fallback.+user or native constraint.+Agent availability or capacity.+input.+dependency or write-set.+safety.+parent-(?:owned action|only checkpoint)/isu, relative);
    assert.match(content, /TODO.+(?:concrete fallback reason|fallback=<concrete-permitted-limitation>)/isu, relative);
    assert.match(
      content,
      /Only (?:a )?new dependency[\s\S]*scope[\s\S]*permission[\s\S]*tool[\s\S]*Agent[\s\S]*schema[\s\S]*capacity[\s\S]*Skill-load failure[\s\S]*contradictory[\s\S]*project evidence[\s\S]*may rebase/iu,
      relative,
    );
    assert.match(content, /substantive code mutation[\s\S]*plugin `plan` review[\s\S]*native `task` slice[\s\S]*`MAIN REVIEW`[\s\S]*native `reviewer`[\s\S]*does not apply to another domain/iu, relative);
    assert.doesNotMatch(content, /Mechanical and read-only work need not use task/i, relative);
  }
});

test('writing-skill authoring destinations are not treated as the OMP runtime inventory', () => {
  const relative = 'skills/writing-skills/SKILL.md';
  const content = readFileSync(join(pluginRoot, relative), 'utf8');

  assert.match(content, /personal.+directories.+authoring or installation destinations/iu, relative);
  assert.match(content, /not.+exhaustive OMP runtime Skill inventory/iu, relative);
});

test('visible authoring compatibility skills are self-contained and defer to the live tool schema', () => {
  const writingRelative = 'skills/writing-skills/SKILL.md';
  const writing = readFileSync(join(pluginRoot, writingRelative), 'utf8');
  const danglingResources = [
    'anthropic-best-practices.md',
    'graphviz-conventions.dot',
    'render-graphs.js',
    'persuasion-principles.md',
    'testing-skills-with-subagents.md',
  ];

  for (const resource of danglingResources) {
    assert.doesNotMatch(writing, new RegExp(resource.replace('.', '\\.'), 'iu'), `${writingRelative}: ${resource}`);
  }
  assert.doesNotMatch(writing, /No exceptions/iu, writingRelative);
  assert.doesNotMatch(writing, /TodoWrite/iu, writingRelative);
  assert.doesNotMatch(writing, /Commit skill to git and push to your fork/iu, writingRelative);
  assert.match(writing, /commit.+push.+explicit user authorization/isu, writingRelative);
  assert.ok(Buffer.byteLength(writing) < 7_500, `${writingRelative} should stay compact`);

  const deepseekRelative = 'skills/deepseek-tool-calling/SKILL.md';
  const deepseek = readFileSync(join(pluginRoot, deepseekRelative), 'utf8');

  assert.match(deepseek, /description: Use when.+DeepSeek.+tool/iu, deepseekRelative);
  assert.doesNotMatch(deepseek, /^alwaysApply:/imu, deepseekRelative);
  assert.match(deepseek, /当前会话实际暴露.+工具.+JSON Schema.+唯一参数契约/isu, deepseekRelative);
  assert.match(deepseek, /示例.+冲突.+实际暴露.+schema.+优先/isu, deepseekRelative);
  assert.match(deepseek, /Delegate Agent=<current-exposed-agent> workflow=<selected-ids> step=<step-id> skills=<loaded-ids-or-none> checkpoint=<complete-one-line-task>/iu, deepseekRelative);
  assert.match(deepseek, /TODO 行的 Agent.+native task item.+agent/isu, deepseekRelative);
  assert.match(deepseek, /\[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>\]/iu, deepseekRelative);
  assert.match(deepseek, /每个 task 正文逐字复制全部直接用户约束且不添加约束示例，再携带允许效果与验收证据[\s\S]*outer context.+name.+label.+不能替代/isu, deepseekRelative);
  assert.doesNotMatch(deepseek, /"agent"\s*:\s*"scout"/iu, deepseekRelative);
});

test('workflow skills do not instruct the agent to self-block or repeat unchanged work', () => {
  const files = [
    'skills/code-development/SKILL.md',
    'skills/ecc/ai-regression-testing/SKILL.md',
    'skills/ecc/security-scan/SKILL.md',
    'skills/ecc/gateguard/SKILL.md',
    'skills/ecc/safety-guard/SKILL.md',
    'skills/ecc/verification-loop/SKILL.md',
  ];
  const prohibited = /NO (?:PRODUCTION CODE|FIXES)|MANDATORY\.|re-?run until|retry until|repeat until|STOP and fix|block the first|DENY\s+—|must be installed|stop and ask|offer MUST be its own message/i;

  for (const relative of files) {
    const content = readFileSync(join(pluginRoot, relative), 'utf8');
    assert.doesNotMatch(content, prohibited, relative);
  }
});

test('compatibility guard skills explicitly remain advisory', () => {
  for (const relative of [
    'skills/ecc/gateguard/SKILL.md',
    'skills/ecc/safety-guard/SKILL.md',
    'skills/ecc/verification-loop/SKILL.md',
  ]) {
    const content = readFileSync(join(pluginRoot, relative), 'utf8');
    assert.match(content, /advisory/i, relative);
    assert.match(content, /does not|doesn't/i, relative);
  }
});

test('code-development is the single subagent-driven method for planned parallel vertical code work', () => {
  const relative = 'skills/code-development/SKILL.md';
  const content = readFileSync(join(pluginRoot, relative), 'utf8');

  assert.match(content, /^---\nname: code-development\ndescription: .+\n---\n/iu, relative);
  assert.match(content, /single general software-development method/iu, relative);
  assert.match(content, /Search local code.+entry points.+callers.+consumers.+tests.+configuration/isu, relative);
  assert.match(content, /official documentation first.+community issues, discussions, or postmortems/isu, relative);
  assert.match(content, /Main.+detailed.+parallel waves.+vertical slices.+non-overlapping write sets/isu, relative);
  assert.match(content, /PLAN REVIEW.+parallel.+assignment.+before changing production code/isu, relative);
  assert.match(content, /same.+tasks\[\].+batch.+runnable.+independent.+native `task`/isu, relative);
  assert.match(content, /native `task`.+public-behavior test.+expected assertion failure as RED.+minimum.+production.+same command.+GREEN.+refactor/isu, relative);
  assert.match(content, /Main.+integrat.+current tree.+semantic diff.+evidence.+self-review.+before.+native `reviewer`/isu, relative);
  assert.match(content, /native `reviewer`.+Main-reviewed.+bounded semantic diff.+does not.+project.+command/isu, relative);
  assert.match(content, /supported.+finding.+native `task`.+repair.+one fresh affected review.+unchanged-input review loops/isu, relative);
  assert.match(content, /Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>/iu, relative);
  assert.match(content, /native task item `agent`.+row Agent[\s\S]*copies workflow, step, skills, and checkpoint/iu, relative);
  assert.match(content, /\[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>\]/iu, relative);
  assert.match(content, /task body.+direct user constraints.+allowed effects.+acceptance evidence[\s\S]*outer context, name, or label.+not.+substitute/iu, relative);
  assert.match(content, /Missing Agents, Skills, network access, tests, reviews, or evidence.+never plugin gates/isu, relative);
  assert.match(content, /references\/omp-enhancer\.md/iu, relative);
  assert.match(content, /merge matching workflow, Skill, and reference phases into one TODO row.+do not execute.+twice/isu, relative);
  assert.match(content, /repository-owned invariant.+no version-sensitive dependency.+skip.+external/isu, relative);
  assert.match(content, /exported API.+valid public test seam/isu, relative);
  assert.match(
    content,
    /Mechanical lookup needs no task.+substantive read-only work needs no mutation TDD.+selected non-simple workflow.+safe complete delegated checkpoint/isu,
    relative,
  );
  assert.match(
    content,
    /RESOURCE EXTENSION \| source=skill:\/\/code-development \| reads=skill:\/\/code-development\/references\/omp-enhancer\.md/iu,
    relative,
  );
  assert.match(content, /this loaded Skill.+exact URI.+before.+workflow references/isu, relative);
  assert.doesNotMatch(content, /block:\s*true|continue:\s*true|required fork|fixed fanout|exactly \d+ reviewers|retry until/iu, relative);
  assert.ok(Buffer.byteLength(content) < 7_500, `${relative} should stay compact`);
});

test('the conditional OMP reference adds generated-asset and installed-runtime evidence without another top-level method', () => {
  const relative = 'skills/code-development/references/omp-enhancer.md';
  const content = readFileSync(join(pluginRoot, relative), 'utf8');

  assert.match(content, /Edit workflow definitions or renderers.+generate:workflows.+never hand-edit generated workflow cards/isu, relative);
  assert.match(content, /failing contract test.+vertical RED\/GREEN/isu, relative);
  assert.match(content, /isolated installed OMP scenario.+event evidence rather than model self-report/isu, relative);
  assert.match(content, /Use `plan`.+native `task`.+native `reviewer`/isu, relative);
  assert.match(content, /Main.+review.+current tree.+diff.+evidence.+before.+reviewer/isu, relative);
  assert.match(content, /generator-integrity-only.+does not change.+installed behavior.+does not require.+live E2E/isu, relative);
  assert.match(content, /Commit, push, publish, marketplace refresh, and local upgrade require explicit user authorization/iu, relative);
  assert.doesNotMatch(content, /^---$/mu, relative);
});

test('deep research scales source breadth and freshness to the evidence need', () => {
  const relative = 'skills/ecc/deep-research/SKILL.md';
  const content = readFileSync(join(pluginRoot, relative), 'utf8');

  assert.match(content, /source count is not a quality target/i, relative);
  assert.match(content, /freshness cutoff.+claim/i, relative);
  assert.doesNotMatch(content, /Aim for 15-30 unique sources/i, relative);
  assert.doesNotMatch(content, /Prefer sources from the last 12 months/i, relative);
  assert.match(content, /currently exposed.+web search.+page-reading/isu, relative);
  assert.doesNotMatch(content, /At least one of:|Configure in `~\/\.claude\.json`|~\/\.codex\/config\.toml/iu, relative);
  assert.match(content, /Save.+only when the user requests.+safe path/isu, relative);
});

test('bundled reviewers report limitations without self-stopping or mandatory dispatch', () => {
  const agentsDir = join(pluginRoot, 'agents');
  const files = readdirSync(agentsDir)
    .filter((name) => name.endsWith('reviewer.md'))
    .sort();
  const prohibited = /MUST\s+BE\s+USED|Use\s+PROACTIVELY|stop\s+(?:and|the\s+review)|\band\s+stop\b|halt\s+review|review\s+should\s+wait|confirm\s+green\s+before\s+proceeding|Verdict:\s*BLOCK|\*\*Block\*\*|\|\s*block\s*\|/i;
  const unchangedLoop = /(?:re-?run|retry|repeat)[^\n]{0,40}\buntil\b|\buntil\b[^\n]{0,40}(?:re-?run|retry|repeat)/i;

  assert.ok(files.length > 0);
  for (const file of files) {
    const content = readFileSync(join(agentsDir, file), 'utf8');
    assert.doesNotMatch(content, prohibited, file);
    assert.doesNotMatch(content, unchangedLoop, file);
  }
});

test('bundled agent guidance stays advisory, bounded, and host-authorized', () => {
  const agentsDir = join(pluginRoot, 'agents');
  const files = readdirSync(agentsDir)
    .filter((name) => name.endsWith('.md'))
    .sort();
  const prohibited = /MUST\s+BE\s+USED|Use\s+PROACTIVELY|FULL\s+access\s+to\s+all\s+tools|blocks\s+completion\s+until|physically\s+cannot\s+skip|action:\s*block|Resume\s+only\s+after\s+verification\s+passes|Iterate\s+until\s+build\s+passes|MUST\s+keep\s+going\s+until|Gate\s+every\s+output|iterates?\s+until\s+quality\s+threshold|feedback\s+items\s+are\s+not\s+suggestions/i;

  assert.ok(files.length > 0);
  for (const file of files) {
    const content = readFileSync(join(agentsDir, file), 'utf8');
    assert.doesNotMatch(content, prohibited, file);
  }
});

test('build diagnosis is a bounded skill and language knowledge stays in skills', () => {
  const relative = 'skills/ecc/build-toolchain-diagnostics/SKILL.md';
  const content = readFileSync(join(pluginRoot, relative), 'utf8');

  assert.match(content, /exact build command/i, relative);
  assert.match(content, /earliest causal/i, relative);
  assert.match(content, /bounded change/i, relative);
  assert.doesNotMatch(content, /retry until|repeat until|until (?:the )?build passes|install automatically/i, relative);

  for (const skill of [
    'fsharp-patterns',
    'harmonyos-patterns',
    'swift-patterns',
    'typescript-patterns',
  ]) {
    assert.doesNotThrow(
      () => readFileSync(join(pluginRoot, 'skills', 'ecc', skill, 'SKILL.md'), 'utf8'),
      skill,
    );
  }
});

test('benchmark preserves measurement methods without inventing capabilities or side effects', () => {
  const relative = 'skills/ecc/benchmark/SKILL.md';
  const content = readFileSync(join(pluginRoot, relative), 'utf8');

  assert.match(content, /only.+currently exposed.+capabilit/isu, relative);
  assert.match(content, /browser.+MCP.+command.+optional.+live capabilit/isu, relative);
  assert.match(content, /read-only.+`seo\.audit`.+benchmark.+does not authorize.+\.ecc\/benchmarks.+write/isu, relative);
  assert.match(content, /install.+command execution.+filesystem write.+network request.+explicit user authorization.+host/isu, relative);
  assert.match(content, /baseline.+metrics.+statistics.+comparison.+limitations/isu, relative);
  assert.match(content, /sample count.+concurrency.+measurement budget.+target.+load risk/isu, relative);
  assert.doesNotMatch(content, /Hit each endpoint 100 times|\/benchmark\s+(?:baseline|compare)|Git-tracked so the team shares baselines/iu, relative);
});

test('branch finishing keeps local and remote git effects separately authorized', () => {
  const relative = 'skills/finishing-a-development-branch/SKILL.md';
  const content = readFileSync(join(pluginRoot, relative), 'utf8');

  assert.match(content, /OMP.+native.+authorit/isu, relative);
  assert.match(content, /dirty worktree.+preserv/isu, relative);
  assert.match(content, /commit.+local merge.+pull.+push.+pull request.+separate.+explicit user authorization/isu, relative);
  assert.match(content, /local merge.+does not authorize.+fetch.+pull.+push.+remote/isu, relative);
  assert.match(content, /validate.+before.+after/isu, relative);
  assert.match(content, /branch options.+context.+user/isu, relative);
  assert.doesNotMatch(content, /^git pull\s*$/imu, relative);
  assert.doesNotMatch(content, /present exactly (?:these )?[34] options/iu, relative);
});
