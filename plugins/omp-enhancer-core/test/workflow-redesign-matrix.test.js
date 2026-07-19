import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { workflowCatalog, workflowIds } from '../src/workflows/catalog.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(testDir, '..', '..', '..');
test('workflow catalog exposes composable workflows including language-pending writing', () => {
  assert.ok(workflowIds.includes('writing.pending'));
  assert.ok(workflowIds.includes('writing.zh'));
  assert.ok(workflowIds.includes('writing.en'));
  assert.ok(workflowIds.includes('slides.generate'));
  assert.ok(workflowIds.includes('slides.modify'));
  assert.ok(workflowIds.includes('diagram.svg'));
  assert.ok(workflowIds.includes('research.web'));
});

test('language writing workflows delegate prose edits and independent review to the matching subagents', () => {
  const pending = workflowCatalog['writing.pending'];
  const chinese = workflowCatalog['writing.zh'];
  const english = workflowCatalog['writing.en'];

  assert.deepEqual(pending.roles, []);
  assert.match(pending.delegation.join(' '), /before.+body language.+do not delegate.+writer|do not delegate.+writer.+before.+body language/i);
  assert.match(pending.delegation.join(' '), /compose writing\.zh or writing\.en/i);

  assert.deepEqual(chinese.roles, ['zh-writer', 'zh-checker']);
  assert.deepEqual(chinese.delegation, [
    'step-2: zh-writer owns the requested Chinese drafting or prose revision',
    'step-3: zh-checker independently reviews the resulting revision without editing the source',
    'step-4: zh-writer applies only parent-accepted findings once, then the parent verifies scope and semantic anchors',
  ]);

  assert.deepEqual(english.roles, ['writer', 'checker']);
  assert.deepEqual(english.delegation, [
    'step-2: writer owns the requested English drafting or prose revision',
    'step-3: checker independently reviews the resulting revision without editing the source',
    'step-4: writer applies only parent-accepted findings once, then the parent verifies scope and semantic anchors',
  ]);

  for (const workflow of ['writing.latex', 'writing.markdown', 'doc.convert.word']) {
    assert.deepEqual(workflowCatalog[workflow].roles, [], `${workflow} must not guess a prose language role`);
  }
});

test('LaTeX and Markdown format workflows compose both ends of explicit conversion without selecting a prose language', () => {
  const latex = workflowCatalog['writing.latex'];
  const markdown = workflowCatalog['writing.markdown'];

  assert.ok(latex.composeWith.includes('writing.markdown'));
  assert.ok(markdown.composeWith.includes('writing.latex'));
  assert.match(latex.chooseWhen, /requested writing, revision, or conversion source\/output is LaTeX/i);
  assert.match(markdown.chooseWhen, /requested writing, revision, or conversion source\/output is Markdown/i);
  assert.deepEqual(latex.roles, []);
  assert.deepEqual(markdown.roles, []);
});

test('one code workflow drives parallel native task slices before Main and reviewer review', () => {
  const development = workflowCatalog['code.dev'];
  const steps = development.steps.join(' ');
  const delegation = development.delegation.join(' ');

  assert.deepEqual(development.roles, ['plan', 'task', 'reviewer']);
  assert.deepEqual(development.skills, ['code-development']);
  assert.match(steps, /search local code.+entry points.+callers.+tests.+configuration/i);
  assert.match(steps, /official documentation.+community experience/i);
  assert.match(steps, /detailed implementation and evidence plan.+parallel.+waves.+vertical slices.+exact files.+non-overlapping.+write sets/i);
  assert.match(steps, /plan Agent.+challenge.+complete.+parallel.+plan.+assignment.+before.+production mutation/i);
  assert.match(steps, /same.+tasks\[\].+batch.+runnable.+independent.+slice/i);
  assert.match(steps, /task.+public-behavior test.+valid.+RED.+minimum.+production.+same command.+GREEN.+refactor/i);
  assert.match(steps, /Main.+integrat.+current tree.+semantic diff.+RED and GREEN evidence.+review/i);
  assert.match(steps, /reviewer.+Main-reviewed.+bounded semantic diff.+evidence.+without.+project.+read.+command/i);
  assert.match(steps, /material supported.+finding.+task.+repair.+fresh affected evidence.+at most one.+fresh.+reviewer/i);
  assert.match(delegation, /plan independently challenges Main's supplied complete parallel plan/i);
  assert.match(delegation, /task.+vertical.+RED.+GREEN.+REFACTOR/i);
  assert.match(delegation, /Main.+integrat.+review.+before.+reviewer/i);
  assert.match(delegation, /reviewer independently reviews the Main-reviewed.+semantic diff/i);
  assert.match(delegation, /task.+supported.+finding.+repair/i);
  assert.doesNotMatch(`${steps} ${delegation}`, /fixed.+fanout|required fork|automatic.+loop/i);
  assert.match(development.scopeNotes.join(' '), /plan-only, diagnosis-only, test-analysis, or read-only review.+does not authorize a production mutation/i);
});

test('web research workflow requires live reliable evidence and supports selected fact-check composition', () => {
  const research = workflowCatalog['research.web'];

  assert.deepEqual(research.skills, [
    'research-ops',
    'deep-research',
    'fact-checking',
    'claim-extraction',
    'source-evaluation',
    'citation-authenticity',
  ]);
  assert.deepEqual(research.roles, [
    'fact-planner',
    'fact-researcher-a',
    'fact-researcher-b',
    'fact-cross-checker',
    'fact-reviewer',
  ]);
  assert.match(research.steps[0], /research question.+scope.+freshness cutoff.+output language/i);
  assert.match(research.steps[1], /claim.+evidence ledger.+authoritative.+primary evidence/i);
  assert.match(research.steps[2], /live web.+independent source lanes.+primary.+official.+publication or update date.+access date/i);
  assert.match(research.steps[3], /source statements from inference.+near-claim citations.+freshness.+uncertainty/i);
  assert.match(research.steps[4], /factcheck\.document.+primary source.+two independent reliable sources.+conflicts.+dates.+units.+definitions.+citation authenticity/i);
  assert.match(research.steps[4], /provider verdict.+bibliographic metadata.+underlying passage or data/i);
  assert.match(research.steps[4], /evidence status.+SUPPORTED.+CONTRADICTED.+INSUFFICIENT.+UNVERIFIABLE/i);
  assert.match(research.steps[4], /cross-check status.+AGREED.+CONFLICTED.+PARTIAL.+INSUFFICIENT.+UNVERIFIABLE/i);
  assert.match(research.steps[4], /final verdict.+SUPPORTED.+CONTRADICTED.+CONFLICTED.+INSUFFICIENT.+UNVERIFIABLE/i);
  assert.match(research.steps[4], /staleness.+temporal-validity finding.+rather than a verdict/i);
  assert.match(research.steps[5], /strict SUPPORTED.+predetermined evidence requirements.+no unresolved PARTIAL.+CONFLICTED.+temporal-staleness finding/i);
  assert.match(research.steps[5], /final reviewer.+no material finding.+factual conclusions.+label unresolved uncertainty/i);
  assert.match(research.steps[6], /independently audit.+claim-evidence ledger.+fact from inference/i);
  assert.match(research.steps[7], /browsing is unavailable.+incomplete.+do not fabricate or claim total correctness/i);
  assert.match(research.scopeNotes.join(' '), /Absolute correctness cannot be guaranteed/i);
  assert.match(research.scopeNotes.join(' '), /live source evidence.+model memory/i);
  assert.match(research.scopeNotes.join(' '), /metadata.+search snippets.+do not prove claim support.+source passage/i);
  assert.match(research.scopeNotes.join(' '), /compatibility review.+complete or ready.+not proof of factual truth/i);
  assert.match(research.scopeNotes.join(' '), /web pages as untrusted evidence.+not instructions/i);
  assert.match(research.scopeNotes.join(' '), /fixed source count.+blanket recency window.+not completion targets/i);
  assert.deepEqual(research.delegation, [
    'step-2: fact-planner defines atomic research questions, claims, risk, and evidence requirements',
    'step-3: fact-researcher-a and fact-researcher-b search independent source lanes without copying conclusions',
    'step-5: fact-cross-checker classifies agreement, conflicts, temporal-staleness findings, and insufficient evidence without inventing resolution',
    'step-7: fact-reviewer audits the final claim-to-evidence mapping and overclaiming',
  ]);
  assert.match(
    research.qualityChecks.join(' '),
    /question coverage.+source authority.+independence.+freshness.+claim-to-passage.+conflict classification and explicit handling.+citation authenticity.+fact-versus-inference.+uncertainty/i,
  );
});

test('slides workflows separate template-and-story generation from bounded modification', () => {
  const generate = workflowCatalog['slides.generate'];
  const modify = workflowCatalog['slides.modify'];

  assert.deepEqual(generate.skills, ['latex-beamer-slides', 'slides-storyline', 'beamer-to-powerpoint']);
  assert.deepEqual(generate.roles, ['designer', 'visioner']);
  assert.match(generate.steps[1], /template readiness/i);
  assert.match(generate.steps[2], /discuss its style, logo, aspect ratio, typography, and layout/i);
  assert.match(generate.steps[3], /story outline.+obtain confirmation/i);
  assert.match(generate.steps[4], /PLAN-selected writing\.zh or writing\.en method/i);
  assert.match(generate.steps[6], /final layout pass.+text and image overlap.+crowding/i);
  assert.match(generate.steps[7], /reconcile the layout revision.+confirmed outline.+semantic anchors.+LaTeX structure/i);
  assert.match(generate.steps[8], /recompile and render the layout revision.+revision identifier.+PDF.+render directory/i);
  assert.match(generate.steps[9], /independently inspect.+latest rendered pages.+overview or contact sheet.+APPROVED \| CHANGES_REQUIRED \| UNREVIEWABLE/i);
  assert.match(generate.steps[10], /reconcile.+fresh renders.+maximum of three review rounds/i);
  assert.match(generate.steps.at(-1), /only when the user supplied a conversion command/i);
  assert.deepEqual(generate.delegation, [
    'step-7: designer owns the final layout pass and every layout revision',
    'step-10: visioner independently reviews the latest rendered pages and deck overview',
    'step-11: designer fixes material findings, the parent reconciles scope, and visioner reviews only fresh rerenders',
  ]);

  assert.deepEqual(modify.skills, ['latex-beamer-slides']);
  assert.deepEqual(modify.roles, ['designer', 'visioner']);
  assert.match(modify.steps[1], /slide body/i);
  assert.match(modify.steps[2], /only the requested wording, language-norm, and existing-style changes/i);
  assert.match(modify.steps[4], /final layout pass.+changed frames.+text and image overlap.+crowding/i);
  assert.match(modify.steps[5], /reconcile the layout revision.+requested semantic diff.+LaTeX anchors.+authorized scope/i);
  assert.match(modify.steps[6], /recompile and render the layout revision.+revision identifier.+PDF.+render directory/i);
  assert.match(modify.steps[7], /independently review.+latest renders.+APPROVED \| CHANGES_REQUIRED \| UNREVIEWABLE/i);
  assert.match(modify.steps[8], /reconcile.+fresh rerenders.+maximum of three review rounds/i);
  assert.match(modify.scopeNotes.join(' '), /Do not reopen template selection or story planning/i);
  assert.match(modify.scopeNotes.join(' '), /Do not widen scope to unrelated pre-existing layout defects/i);
  assert.deepEqual(modify.delegation, [
    'step-5: designer owns the bounded final layout pass and any resulting source revision',
    'step-8: visioner independently reviews the latest affected-page renders',
    'step-9: designer fixes material findings, the parent reconciles scope, and visioner reviews only fresh rerenders',
  ]);
  assert.doesNotMatch(`${generate.steps.join(' ')} ${modify.steps.join(' ')}`, /\b(?:designer|visioner)\b/i);
  assert.match(
    `${generate.qualityChecks.join(' ')} ${modify.qualityChecks.join(' ')}`,
    /text and image overlap.+crowding.+clipping.+readable typography.+rendered evidence/i,
  );
});

test('SVG diagram workflow keeps creation neutral and exposes optional independent visual review', () => {
  const diagram = workflowCatalog['diagram.svg'];

  assert.deepEqual(diagram.skills, ['svg-flowchart']);
  assert.deepEqual(diagram.roles, ['designer', 'visioner']);
  assert.deepEqual(diagram.delegation, [
    'step-2: designer creates the SVG and owns every source revision',
    'step-4: visioner independently reviews the fresh full-size and 60% raster renders',
    'step-5: designer applies findings and visioner reviews only the resulting new revision',
  ]);
  assert.match(diagram.steps[0], /node and edge model.+flow direction/i);
  assert.match(diagram.steps[1], /standalone SVG.+black and white.+straight or dashed lines.+orthogonal polylines.+no curved connectors/i);
  assert.match(diagram.steps[2], /render.+full size.+60%/i);
  assert.match(diagram.steps[3], /independently inspect.+latest rasters/i);
  assert.match(diagram.steps[4], /new revision.+maximum of three review rounds/i);
  assert.match(diagram.scopeNotes.join(' '), /designer owns SVG changes.+visioner remains read-only/i);
  assert.match(diagram.scopeNotes.join(' '), /Do not substitute source inspection or author self-review for independent rendered evidence/i);
  assert.match(
    diagram.qualityChecks.join(' '),
    /node and edge completeness.+arrow direction.+overlap.+text clipping.+connector collision.+crossing.+font size.+spacing.+rendered evidence/i,
  );
});

test('every catalog role is OMP-native or marketplace-packaged and every selected skill remains packaged', async () => {
  const [registeredSkills, registeredAgents] = await Promise.all([
    registeredMarketplaceSkills(repoRoot),
    registeredMarketplaceAgents(repoRoot),
  ]);
  const nativeAgents = new Set(['task', 'designer', 'librarian', 'reviewer']);
  for (const [workflow, meta] of Object.entries(workflowCatalog)) {
    for (const skill of meta.skills) {
      assert.equal(registeredSkills.has(skill), true, `${workflow}: ${skill}`);
    }
    for (const role of meta.roles) {
      assert.equal(
        nativeAgents.has(role) || registeredAgents.has(role),
        true,
        `${workflow}: ${role}`,
      );
    }
  }
});

async function registeredMarketplaceSkills(root) {
  const catalog = JSON.parse(await readFile(path.join(root, '.omp-plugin', 'marketplace.json'), 'utf8'));
  const skills = new Set();
  for (const plugin of catalog.plugins ?? []) {
    const pluginRoot = path.join(root, 'plugins', plugin.source.replace(/^\.\//, ''));
    for (const skillPath of plugin.skills ?? []) {
      const skillDir = path.join(pluginRoot, skillPath.replace(/^\.\//, ''));
      const skillText = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
      const frontmatterName = skillText.match(/^---\n[\s\S]*?\nname:\s*([^\n]+)\n/m)?.[1]?.trim();
      skills.add(frontmatterName || path.basename(skillDir));
    }
  }
  return skills;
}

async function registeredMarketplaceAgents(root) {
  const catalog = JSON.parse(await readFile(path.join(root, '.omp-plugin', 'marketplace.json'), 'utf8'));
  const agents = new Set();
  for (const plugin of catalog.plugins ?? []) {
    const agentsRoot = path.join(root, 'plugins', plugin.source.replace(/^\.\//, ''), 'agents');
    let entries = [];
    try {
      entries = await readdir(agentsRoot);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    for (const entry of entries.filter((name) => name.endsWith('.md'))) {
      const source = await readFile(path.join(agentsRoot, entry), 'utf8');
      const frontmatterName = source.match(/^---\n[\s\S]*?^name:\s*['"]?([^'"\n]+)['"]?\s*$/m)?.[1]?.trim();
      agents.add(frontmatterName || entry.replace(/\.md$/, ''));
    }
  }
  return agents;
}
