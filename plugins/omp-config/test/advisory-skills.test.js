import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = join(pluginRoot, '..', '..');

test('global guidance gives Main a compact orchestration advisory without a marker protocol', () => {
  const relative = 'assets/CLAUDE.md';
  const content = readFileSync(join(pluginRoot, relative), 'utf8');

  assert.match(content, /OMP's native system prompt, settings, active tools, dynamic Available Agents, approval flow, and completion behavior are authoritative/i, relative);
  assert.match(content, /skill:\/\/omp-enhancer-workflows/i, relative);
  assert.match(content, /ANALYZE -> EXECUTE -> REVIEW/i, relative);
  assert.match(content, /Main is the orchestrator/i, relative);
  assert.match(content, /A verbatim field or heading lookup needs no workflow or TODO/i, relative);
  assert.match(content, /No plugin creates a gate, router, retry, permission, or completion controller/i, relative);
  assert.match(content, /never routes, blocks, grants permission, starts a task, or decides completion/i, relative);
  assert.doesNotMatch(content, /DISCOVER -> DECLARE -> LOAD|WORKFLOW PLAN|WORKFLOW READY|RESOURCE EXTENSION|Delegate Agent=|\[workflow=<copy-workflow>|byte 0|writing\.pending/i, relative);
  assert.doesNotMatch(content, /block:\s*true|continue:\s*true|triggerTurn\s*\(/i, relative);
  assert.doesNotMatch(content, /fork (?:at least|exactly|up to) \d+|reviewer count\s*=\s*\d+/i, relative);
});

test('root and managed Main guidance keep orchestration advisory and default-free', () => {
  const files = [
    ['AGENTS.md', join(repositoryRoot, 'AGENTS.md')],
    ['assets/AGENTS.md', join(pluginRoot, 'assets', 'AGENTS.md')],
    ['assets/CLAUDE.md', join(pluginRoot, 'assets', 'CLAUDE.md')],
  ];

  for (const [relative, file] of files) {
    const content = readFileSync(file, 'utf8');

    assert.match(content, /ANALYZE -> EXECUTE -> REVIEW/iu, relative);
    assert.match(content, /Main is the orchestrator/iu, relative);
    assert.match(content, /delegates to (?:the )?`?analyzer`? (?:agent )?for complex multi-slice work/iu, relative);
    assert.match(content, /delegates to `?reviewer`? for complex or risky changes/iu, relative);
    assert.match(content, /A verbatim field or heading lookup needs no workflow or TODO/iu, relative);
    assert.match(content, /No plugin creates a gate, router, retry, permission, or completion controller/iu, relative);
    assert.doesNotMatch(content, /`agentic\.simple`|`writing\.pending`|subagent-driven by default|Delegate Agent=|DISCOVER -> DECLARE -> LOAD|byte 0 must|WORKFLOW PLAN|WORKFLOW READY/iu, relative);
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
  assert.match(content, /Delegate the local evidence pass to scout.+entry points.+callers.+consumers.+tests.+configuration/isu, relative);
  assert.match(content, /one bounded external pass to librarian.+official documentation.+community issues/isu, relative);
  assert.match(content, /delegate to the `analyzer` agent the full detailed implementation-and-evidence plan/isu, relative);
  assert.match(content, /including its own challenge findings/isu, relative);
  assert.match(content, /same.+tasks\[\].+batch.+runnable.+independent.+native `task`/isu, relative);
  assert.match(content, /native `task`.+public-behavior test.+expected assertion failure as RED.+minimum.+production.+same command.+GREEN.+refactor/isu, relative);
  assert.match(content, /Main.+integrat.+current tree.+bounded diff.+evidence.+native `reviewer`/isu, relative);
  assert.match(content, /native `reviewer`.+bounded semantic diff.+does not.+project.+command/isu, relative);
  assert.match(content, /supported.+finding.+native `task`.+repair.+one fresh affected review.+unchanged-input review loops/isu, relative);
  assert.match(content, /Missing Agents, Skills, network access, tests, reviews, or evidence.+never plugin gates/isu, relative);
  assert.match(content, /merge matching workflow, Skill, and reference phases into one TODO row.+do not execute.+twice/isu, relative);
  assert.match(content, /repository-owned invariant.+no version-sensitive dependency.+skip.+external/isu, relative);
  assert.match(content, /public test seam and exact command/isu, relative);
  assert.match(
    content,
    /Mechanical lookup needs no task.+substantive read-only work needs no mutation TDD.+selected workflow's safe complete delegated checkpoint/isu,
    relative,
  );
  assert.doesNotMatch(content, /block:\s*true|continue:\s*true|required fork|fixed fanout|exactly \d+ reviewers|retry until/iu, relative);
  assert.ok(Buffer.byteLength(content) < 8_500, `${relative} should stay compact`);
});

test('the conditional OMP reference adds generated-asset and installed-runtime evidence without another top-level method', () => {
  const relative = 'skills/code-development/references/omp-enhancer.md';
  const content = readFileSync(join(pluginRoot, relative), 'utf8');

  assert.match(content, /Edit workflow definitions or renderers.+generate:workflows.+never hand-edit generated workflow cards/isu, relative);
  assert.match(content, /failing contract test.+vertical RED\/GREEN/isu, relative);
  assert.match(content, /isolated installed OMP scenario.+event evidence rather than model self-report/isu, relative);
  assert.match(content, /delegate to the `analyzer` agent a detailed parallel implementation plan/isu, relative);
  assert.match(content, /Main reviews the current tree, diff, and evidence before reviewer dispatch/isu, relative);
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
