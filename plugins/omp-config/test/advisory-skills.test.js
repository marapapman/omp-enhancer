import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('global guidance gives Main an explicit staged workflow, Skill, TODO, and delegation protocol', () => {
  const relative = 'assets/CLAUDE.md';
  const content = readFileSync(join(pluginRoot, relative), 'utf8');

  assert.match(content, /user request and OMP's native system prompt[\s\S]*are authoritative/i, relative);
  assert.match(content, /skill:\/\/omp-enhancer-workflows/i, relative);
  assert.match(content, /Three-phase staged work contract/i, relative);
  assert.match(content, /analysis, judgment, workflow composition,[\s\S]*coordinated stages, or possible delegation/i, relative);
  assert.match(content, /mechanical field lookup without analysis[\s\S]*no Skill or TODO/i, relative);
  assert.match(content, /DISCOVER BATCH[\s\S]*WORKFLOW PLAN \+ LOAD BATCH[\s\S]*READY \+ EXECUTE/i, relative);
  assert.match(content, /first assistant[\s\S]*tool-call batch reads only `skill:\/\/omp-enhancer-workflows`/i, relative);
  assert.match(content, /Do not include[\s\S]*another Skill, workflow reference, project tool, `todo`, or `task`[\s\S]*wait for the index result/i, relative);
  assert.match(content, /complete `WORKFLOW PLAN` block[\s\S]*exact `Primary`, `Add-ons`, `Skills`, and `Load order`/i, relative);
  assert.match(content, /numbered application and verification Actions/i, relative);
  assert.match(content, /tool-call batch reads the owning domain Skills or catalogs first and the[\s\S]*workflow references last[\s\S]*no project tool, `todo`, or `task`[\s\S]*wait for[\s\S]*resource result/i, relative);
  assert.match(content, /WORKFLOW READY[\s\S]*rewrite a detailed TODO from the[\s\S]*actual workflow steps and Skill instructions/i, relative);
  assert.match(content, /map it to native `todo` when exposed and allowed/i, relative);
  assert.match(content, /resource read batched with a project action did not wait/i, relative);
  assert.match(content, /WORKFLOW PLAN` block or[\s\S]*`WORKFLOW READY \|` first written after project action is late/i, relative);
  assert.match(content, /Main decides direct work, Agent choice, and fork width/i, relative);
  assert.match(content, /No workflow or reminder selects a fork, reviewer count, or[\s\S]*Agent/i, relative);
  assert.match(content, /substantive code.+subagent-driven.+plugin `plan`.+native `task`.+native `reviewer`/isu, relative);
  assert.match(content, /Main.+local and external discovery.+parallel waves.+vertical slices.+non-overlapping write sets/isu, relative);
  assert.match(content, /same `tasks\[\]` batch.+runnable independent slices.+dependent.+later wave/isu, relative);
  assert.match(content, /Main.+integrat.+current tree.+diff.+evidence.+review.+before.+reviewer/isu, relative);
  assert.match(content, /reviewer.+Main-reviewed.+bounded.+diff.+evidence.+does not read.+project.+run commands/isu, relative);
  assert.match(content, /supported.+finding.+native `task`.+repair.+at most one.+fresh reviewer/isu, relative);
  assert.match(content, /\[workflow=<ids> step=<step-id> todo=<verbatim-task-content-or-none> skills=<skill-ids-or-none>\]/i, relative);
  assert.match(content, /child[\s\S]*does not own the parent TODO/i, relative);
  assert.match(content, /failed or[\s\S]*partial job is not complete/i, relative);
  assert.match(content, /native `skill-prompt`/i, relative);
  assert.match(content, /apply that Skill without reading it again/i, relative);
  assert.match(content, /body being\s+changed, not from the instruction language/i, relative);
  assert.match(content, /does not create a router, permission, lifecycle\s+gate, required Skill, required fork, repair turn, continuation, or plugin-owned\s+completion condition/i, relative);
  assert.doesNotMatch(content, /block:\s*true|continue:\s*true|triggerTurn\s*\(/i, relative);
  assert.doesNotMatch(content, /fork (?:at least|exactly|up to) \d+|reviewer count\s*=\s*\d+/i, relative);
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
  assert.match(content, /\[workflow=<ids> step=<step-id> todo=<verbatim-task-content-or-none> skills=<ids-or-none>\]/iu, relative);
  assert.match(content, /Missing Agents, Skills, network access, tests, reviews, or evidence.+never plugin gates/isu, relative);
  assert.match(content, /references\/omp-enhancer\.md/iu, relative);
  assert.match(content, /merge matching workflow, Skill, and reference phases into one TODO row.+do not execute.+twice/isu, relative);
  assert.match(content, /repository-owned invariant.+no version-sensitive dependency.+skip.+external/isu, relative);
  assert.match(content, /exported API.+valid public test seam/isu, relative);
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
