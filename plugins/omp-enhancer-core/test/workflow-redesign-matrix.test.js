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
  assert.equal(workflowIds.includes('diagram.svg'), false);
  assert.ok(workflowIds.includes('research.web'));
});

test('language writing workflows delegate prose edits and independent review to the matching subagents', () => {
  const pending = workflowCatalog['writing.pending'];
  const chinese = workflowCatalog['writing.zh'];
  const english = workflowCatalog['writing.en'];

  assert.deepEqual(pending.roles, []);
  assert.match(pending.delegation.join(' '), /narrow language-only read after initial READY[\s\S]*delegates no prose work before replacement READY/i);
  assert.match(pending.delegation.join(' '), /after replacement READY[\s\S]*selected writing\.zh or writing\.en[\s\S]*language-matched subagents/i);

  assert.deepEqual(chinese.roles, ['zh-writer', 'zh-checker']);
  assert.deepEqual(chinese.delegation, [
    'step-2: zh-writer is the first project actor and reads the exact target before owning the requested Chinese drafting or prose revision',
    'step-3: zh-checker independently reviews source and revision after the writer delivery without editing the source',
    'step-4: zh-writer returns one corrected proposal for parent-accepted findings',
  ]);

  assert.deepEqual(english.roles, ['writer', 'checker']);
  assert.deepEqual(english.delegation, [
    'step-2: writer is the first project actor and reads the exact target before owning the requested English drafting or prose revision',
    'step-3: checker independently reviews source and revision after the writer delivery without editing the source',
    'step-4: writer returns one corrected proposal for parent-accepted findings',
  ]);
  for (const workflow of [chinese, english]) {
    assert.match(workflow.scopeNotes.join(' '), /Main owns any authorized file change[\s\S]*parent-owned integration and verification/iu);
  }

  for (const workflow of ['writing.latex', 'writing.markdown', 'doc.convert.word']) {
    assert.deepEqual(workflowCatalog[workflow].roles, ['task', 'reviewer'], `${workflow} uses a language-neutral format task with independent review`);
  }

  const latexContract = workflowCatalog['writing.latex'].delegation.join(' ');
  assert.match(latexContract, /task owns only.+format-only.+writer selected.+owns every prose revision checkpoint/i);
  assert.match(latexContract, /task may return only.+compile evidence.+language checker owns every semantic-check checkpoint/i);
});

test('long-form writing pilot branch activates only for a qualifying multi-section new-draft brief', () => {
  for (const id of ['writing.zh', 'writing.en']) {
    const workflow = workflowCatalog[id];
    const contract = [
      ...workflow.steps.map(({ text }) => text),
      ...workflow.scopeNotes,
    ].join(' ');

    // Positive predicate: NEW long-form draft, >=2 independently specifiable sections, shared brief freezable
    assert.match(contract, /long-form.*pilot.*new.*draft/iu, `${id} must describe the long-form pilot predicate`);
    assert.match(contract, /two or more.*section|>= ?2.*section|\b2\+.*section/iu, `${id} must require two or more sections`);
    assert.match(contract, /disjoint.*(?:proposal|scope)|independent.*specifiable/iu, `${id} must require disjoint proposal scope`);
    assert.match(contract, /shared.*brief.*freez|evidence.*terminology.*voice.*freez/iu, `${id} must require a freezable shared brief`);

    // Negative precedence: any of these triggers the ordinary branch
    assert.match(contract, /revis|edit|polish|review|correct|proofread|translate/iu, `${id} must list negative precedence triggers`);
    assert.match(contract, /whole.document rewrite|single section|incomplete brief|cross.section.*dependenc/iu, `${id} must list negative precedence controls`);

    // Pilot branch structure: per-section step-2 rows, integration checkpoint, one step-3 checker, conditional step-4
    assert.match(contract, /one.*step-2.*per.*section|per.section.*step-2|one.*proposal.*row.*per.*independent.*section/iu, `${id} must describe per-section step-2 rows`);
    assert.match(contract, /integration.*checkpoint|parent.owned.*integration/iu, `${id} must describe the integration checkpoint`);
    assert.match(contract, /exactly one.*step-3.*checker|one.*checker.*integrated/iu, `${id} must describe one step-3 checker on the integrated draft`);

    // Writers remain proposal-only; Main owns integration
    assert.match(contract, /proposal.only|proposal-only/iu, `${id} must keep writers proposal-only`);
    assert.match(contract, /Main owns.*integration|Main.*authorized.*write/iu, `${id} must keep Main as integration owner`);

    // No native reviewer, no generic MAIN REVIEW
    assert.doesNotMatch(contract, /main review.*override|native reviewer.*override/iu, `${id} must not add native reviewer or generic MAIN REVIEW`);
    // No model/provider/Agent/count/width/fork prescription
    assert.doesNotMatch(contract, /fork count|reviewer count|parallel.benefit|required fork|fanout/iu, `${id} must not prescribe width/count/fork`);
  }
});

test('long-form writing pilot negative controls keep the ordinary three frozen rows', () => {
  for (const id of ['writing.zh', 'writing.en']) {
    const workflow = workflowCatalog[id];
    const contract = [
      ...workflow.steps.map(({ text }) => text),
      ...workflow.scopeNotes,
    ].join(' ');

    // The ordinary branch (default) must still be described with three frozen rows
    assert.match(contract, /three exact Delegate rows.*step-2.*step-3.*conditional step-4|three.*frozen.*step-2.*step-3.*step-4/iu, `${id} must keep the ordinary three frozen rows`);

    // The carve-out sentence must mention the pilot exception
    assert.match(contract, /assignment size.*leaves the actor sequence unchanged.*EXCEPT.*pilot|size.*structure.*unchanged.*EXCEPT.*pilot/iu, `${id} must carve out the pilot exception`);

    // Negative precedence must explicitly route to ordinary branch
    assert.match(contract, /revis|edit|polish|proofread|translate.*ordinary|negative.*ordinary|any.*->.*ordinary/iu, `${id} must route negatives to ordinary branch`);
  }
});

test('LaTeX and Markdown format workflows compose both ends of explicit conversion without selecting a prose language', () => {
  const latex = workflowCatalog['writing.latex'];
  const markdown = workflowCatalog['writing.markdown'];

  assert.ok(latex.composeWith.includes('writing.markdown'));
  assert.ok(markdown.composeWith.includes('writing.latex'));
  assert.match(latex.chooseWhen, /LaTeX source\/output[\s\S]*LaTeX prose[\s\S]*preserved commands[\s\S]*Add-on[\s\S]*Primary only/iu);
  assert.match(markdown.chooseWhen, /Markdown source\/output[\s\S]*Add-on[\s\S]*Primary only/iu);
  assert.deepEqual(latex.roles, ['task', 'reviewer']);
  assert.deepEqual(markdown.roles, ['task', 'reviewer']);
});

test('one code workflow drives parallel native task slices before Main and reviewer review', () => {
  const development = workflowCatalog['code.dev'];
  const steps = development.steps.join(' ');
  const delegation = development.delegation.join(' ');

  assert.deepEqual(development.roles, ['plan', 'task', 'reviewer', 'scout', 'librarian']);
  assert.deepEqual(development.skills, ['code-development']);
  assert.match(steps, /search local code.+entry points.+callers.+tests.+configuration/i);
  assert.match(steps, /official documentation.+community experience/i);
  assert.match(steps, /detailed implementation and evidence plan.+parallel.+waves.+vertical slices.+exact files.+non-overlapping.+write sets/i);
  assert.match(steps, /reviewer.+audit.+plan.+parallel.+plan.+write sets.+dependencies/i);
  assert.match(steps, /same.+tasks\[\].+batch.+runnable.+independent.+slice/i);
  assert.match(steps, /task.+public-behavior test.+valid.+RED.+minimum.+production.+same command.+GREEN.+refactor/i);
  assert.match(steps, /Main.+integrat.+focused verification.+at most one fresh reviewer/i);
  assert.match(steps, /reviewer.+bounded semantic diff.+supplied evidence.+without.+project.+read.+command/i);
  assert.match(steps, /material supported.+finding.+task.+repair.+fresh affected evidence.+at most one.+fresh.+reviewer/i);
  assert.match(delegation, /reviewer independently audits plan's supplied complete parallel plan/i);
  assert.match(delegation, /task.+vertical.+RED.+GREEN.+REFACTOR/i);
  assert.match(delegation, /Main.+integrat.+dispatch.+at most one fresh affected reviewer/i);
  assert.match(delegation, /reviewer independently reviews the bounded semantic diff/i);
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
  assert.match(research.steps[2], /live web.+one bounded.+source lane.+focused.+second.+broad.+high-risk.+explicit.+cross-check.+primary.+official.+publication or update date.+access date/i);
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
    'step-3: fact-researcher-a owns the first bounded source lane; fact-researcher-b owns an independent second lane only for a broad task, a high-risk claim, or explicit cross-checking, without copying conclusions',
    'step-5: fact-cross-checker classifies agreement, conflicts, temporal-staleness findings, and insufficient evidence without inventing resolution',
    'step-7: fact-reviewer audits the final claim-to-evidence mapping and overclaiming',
  ]);
  assert.match(research.scopeNotes.join(' '), /focused.+one research lane.+second lane.+broad.+high-risk.+explicit cross-checking.+fork width.+Main/iu);

  const factcheck = workflowCatalog['factcheck.document'];
  assert.match(factcheck.steps[1], /one bounded evidence lane.+focused.+independent second lane.+broad.+high-risk.+explicit cross-checking/iu);
  assert.match(factcheck.delegation.join(' '), /fact-researcher-a.+first bounded evidence lane.+fact-researcher-b.+independent second lane.+only.+broad.+high-risk.+explicit cross-checking/iu);
  assert.match(
    research.qualityChecks.join(' '),
    /question coverage.+source authority.+independence.+freshness.+claim-to-passage.+conflict classification and explicit handling.+citation authenticity.+fact-versus-inference.+uncertainty/i,
  );
});

test('slides workflows separate template-and-story generation from bounded modification', () => {
  const generate = workflowCatalog['slides.generate'];
  const modify = workflowCatalog['slides.modify'];

  assert.deepEqual(generate.skills, ['latex-beamer-slides', 'slides-storyline', 'beamer-to-powerpoint']);
  assert.deepEqual(generate.roles, ['designer', 'task', 'visioner']);
  assert.match(generate.steps[1], /template readiness/i);
  assert.match(generate.steps[2], /discuss its style, logo, aspect ratio, typography, and layout/i);
  assert.match(generate.steps[3], /commit.+numbered.+working outline.+ask only.+missing choice.+materially changes/i);
  assert.match(generate.steps[4], /PLAN-selected writing\.zh or writing\.en method/i);
  assert.match(generate.steps[6], /final layout pass.+text and image overlap.+crowding/i);
  assert.match(generate.steps[7], /reconcile the layout revision.+committed outline.+semantic anchors.+LaTeX structure/i);
  assert.match(generate.steps[8], /recompile and render the layout revision.+revision identifier.+PDF.+render directory/i);
  assert.match(generate.steps[9], /independently inspect.+latest rendered pages.+overview or contact sheet.+APPROVED \| CHANGES_REQUIRED \| UNREVIEWABLE/i);
  assert.match(generate.steps[10], /visual review finding.+bounded new layout revision.+recompile.+fresh rerenders.+reviewed at most once/i);
  assert.match(generate.steps.at(-1), /only when the user supplied a conversion command/i);
  assert.deepEqual(generate.delegation, [
    'step-6: task owns compilation and rendering of every deck revision',
    'step-7: designer owns the final layout pass and every layout revision',
    'step-8: designer reconciles the layout revision against committed scope',
    'step-9: task recompiles and rerenders after every layout revision',
    'step-10: visioner independently reviews the latest rendered pages and deck overview',
    'step-11: designer fixes visioner findings, task rerenders, and visioner reviews only fresh rerenders',
  ]);

  assert.deepEqual(modify.skills, ['latex-beamer-slides']);
  assert.deepEqual(modify.roles, ['designer', 'task', 'visioner']);
  assert.match(modify.steps[1], /slide body/i);
  assert.match(modify.steps[2], /only the requested wording, language-norm, and existing-style changes/i);
  assert.match(modify.steps[4], /final layout pass.+changed frames.+text and image overlap.+crowding/i);
  assert.match(modify.steps[5], /reconcile the layout revision.+requested semantic diff.+LaTeX anchors.+authorized scope/i);
  assert.match(modify.steps[6], /recompile and render the layout revision.+revision identifier.+PDF.+render directory/i);
  assert.match(modify.steps[7], /independently review.+latest renders.+APPROVED \| CHANGES_REQUIRED \| UNREVIEWABLE/i);
  assert.match(modify.steps[8], /visual review finding.+bounded fix.+recompile.+fresh rerenders.+reviewed at most once/i);
  assert.match(modify.scopeNotes.join(' '), /Do not reopen template selection or story planning/i);
  assert.match(modify.scopeNotes.join(' '), /Do not widen scope to unrelated pre-existing layout defects/i);
  assert.deepEqual(modify.delegation, [
    'step-4: task owns compilation and rendering of every deck revision',
    'step-5: designer owns the bounded final layout pass and any resulting source revision',
    'step-6: designer reconciles the layout revision against committed scope',
    'step-7: task recompiles and rerenders after every layout revision',
    'step-8: visioner independently reviews the latest affected-page renders',
    'step-9: designer fixes visioner findings, task rerenders, and visioner reviews only fresh rerenders',
  ]);
  assert.doesNotMatch(`${generate.steps.join(' ')} ${modify.steps.join(' ')}`, /\b(?:designer|visioner)\b/i);
  assert.match(
    `${generate.qualityChecks.join(' ')} ${modify.qualityChecks.join(' ')}`,
    /text and image overlap.+crowding.+clipping.+readable typography.+rendered evidence/i,
  );
});

test('design.visual workflow delegates the bounded visual chain with a revision loop', () => {
  const visual = workflowCatalog['design.visual'];

  assert.deepEqual(visual.skills, ['frontend-design', 'canvas-design']);
  assert.deepEqual(visual.roles, ['designer', 'task', 'visioner']);

  assert.match(visual.steps[0], /requested scope.+existing visual context.+implementation boundary/i);
  assert.match(visual.steps[1], /bounded visual direction/i);
  assert.match(visual.steps[2], /design or source revision.+non-visual stages/i);
  assert.match(visual.steps[3], /render.+identified current revision.+reconcile.+scope/i);
  assert.match(visual.steps[4], /independently.+read-only.+review.+hierarchy.+spacing.+typography.+responsiveness.+accessibility/i);
  assert.match(visual.steps[5], /visual review finding.+bounded new.+revision.+rerender.+reviewed at most once.+do not review an unchanged artifact/i);

  assert.deepEqual(visual.delegation, [
    'step-2: designer owns the bounded visual direction',
    'step-3: designer owns the design or source revision while preserving the requested scope',
    'step-4: task renders one identified current revision; designer reconciles scope',
    'step-5: visioner independently and read-only reviews that current render or layout',
    'step-6: designer applies visioner findings, task rerenders, and visioner reviews only fresh rerenders',
  ]);
});

test('all visual workflow steps keep role names out of step text', () => {
  for (const id of ['design.visual', 'slides.generate', 'slides.modify', 'diagram.tikz']) {
    const workflow = workflowCatalog[id];
    const stepText = workflow.steps.join(' ');
    assert.doesNotMatch(stepText, /\b(?:designer|visioner)\b/i, `${id} steps must not mention designer or visioner roles`);
  }
});

test('diagram.tikz exposes the bounded subagent-driven delegation chain', () => {
  const tikz = workflowCatalog['diagram.tikz'];

  assert.deepEqual(tikz.delegation, [
    'step-2: designer owns the semantic blueprint and per-icon plan while preserving scope',
    'step-3: task prepares and validates icon assets and writes the asset manifest',
    'step-4: visioner independently and read-only reviews fresh asset previews and flags unsupported icons',
    'step-5: designer authors the ELK graph IR under approved manifest constraints with layout options and node sizing',
    'step-5b: task calls tikz_generate_diagram with the designer ELK graph IR, writes the project-local TikZ source, and verifies the semantic-graph round-trip',
    'step-6: task invokes the fixed tikz_render renderer for the approved current revision',
    'step-7: visioner independently and read-only reviews the fresh current-revision renders',
    'step-8: designer applies supported findings, task rerenders, and visioner reviews only fresh rerenders',
  ]);
});
test('every catalog role is OMP-native or marketplace-packaged and every selected skill remains packaged', async () => {
  const [registeredSkills, registeredAgents] = await Promise.all([
    registeredMarketplaceSkills(repoRoot),
    registeredMarketplaceAgents(repoRoot),
  ]);
  const nativeAgents = new Set(['task', 'designer', 'librarian', 'reviewer', 'scout']);
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
