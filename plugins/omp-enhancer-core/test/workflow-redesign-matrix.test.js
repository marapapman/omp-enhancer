import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { routeNaturalLanguageTask } from '../src/router.js';
import { workflowRouteCardSections, workflowRouteCatalog, workflowRouteNames } from '../src/workflow-routes.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(testDir, '..', '..', '..');
const workloadMatrix = JSON.parse(await readFile(path.join(testDir, 'fixtures', 'workload-matrix.json'), 'utf8'));
const expectedSections = [
  'WORKFLOW_GUIDE',
  'Task type',
  'Suggested steps',
  'Skills',
  'Optional roles',
  'Quality checks',
  'Scope and risk notes',
];

test('workflow catalog exposes advisory routes including language-pending writing', () => {
  assert.ok(workflowRouteNames.includes('writing.pending'));
  assert.ok(workflowRouteNames.includes('writing.zh'));
  assert.ok(workflowRouteNames.includes('writing.en'));
  assert.ok(workflowRouteNames.includes('slides.generate'));
  assert.ok(workflowRouteNames.includes('slides.modify'));
  assert.ok(workflowRouteNames.includes('diagram.svg'));
  assert.ok(workflowRouteNames.includes('research.web'));
  assert.deepEqual(workflowRouteCardSections(), expectedSections);
});

test('language writing workflows delegate prose edits and independent review to the matching subagents', () => {
  const pending = workflowRouteCatalog['writing.pending'];
  const chinese = workflowRouteCatalog['writing.zh'];
  const english = workflowRouteCatalog['writing.en'];

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
    assert.deepEqual(workflowRouteCatalog[workflow].roles, [], `${workflow} must not guess a prose language role`);
  }
});

test('test workflow delegates planning, execution, and independent review to packaged testing agents', () => {
  const testing = workflowRouteCatalog['code.test'];

  assert.deepEqual(testing.roles, ['test-planner', 'test-executor', 'test-reviewer']);
  assert.deepEqual(testing.delegation, [
    'step-2: test-planner produces the target-to-behavior and evidence plan without editing files or running tests',
    'step-3: test-executor owns bounded test and fixture changes when authoring is in scope',
    'step-4: test-executor runs only host-authorized commands and records fresh execution evidence',
    'step-5: test-reviewer independently audits the plan, test diff, public-behavior coverage, and current evidence without editing files or rerunning tests',
  ]);
  assert.match(testing.steps.join(' '), /plan.+public behavior.+risk/i);
  assert.match(testing.steps.join(' '), /independently review.+current.+evidence/i);
  assert.match(testing.scopeNotes.join(' '), /advisory.+not.+completion/i);
});

test('web research workflow requires live reliable evidence and fact-check composition', () => {
  const research = workflowRouteCatalog['research.web'];

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
  assert.match(research.steps[6], /fact-reviewer.+claim-evidence ledger.+fact from inference/i);
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
  const generate = workflowRouteCatalog['slides.generate'];
  const modify = workflowRouteCatalog['slides.modify'];

  assert.deepEqual(generate.skills, ['latex-beamer-slides', 'slides-storyline', 'beamer-to-powerpoint']);
  assert.deepEqual(generate.roles, ['designer', 'visioner']);
  assert.match(generate.steps[1], /template readiness/i);
  assert.match(generate.steps[2], /discuss its style, logo, aspect ratio, typography, and layout/i);
  assert.match(generate.steps[3], /story outline.+obtain confirmation/i);
  assert.match(generate.steps[6], /designer.+final layout pass.+text and image overlap.+crowding/i);
  assert.match(generate.steps[7], /reconcile the designer revision.+confirmed outline.+semantic anchors.+LaTeX structure/i);
  assert.match(generate.steps[8], /recompile and render the designer revision.+revision identifier.+PDF.+render directory/i);
  assert.match(generate.steps[9], /visioner.+latest rendered pages.+overview or contact sheet.+APPROVED \| CHANGES_REQUIRED \| UNREVIEWABLE/i);
  assert.match(generate.steps[10], /reconcile.+fresh renders.+maximum of three vision review rounds/i);
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
  assert.match(modify.steps[4], /designer.+final layout pass.+changed frames.+text and image overlap.+crowding/i);
  assert.match(modify.steps[5], /reconcile the designer revision.+requested semantic diff.+LaTeX anchors.+authorized scope/i);
  assert.match(modify.steps[6], /recompile and render the designer revision.+revision identifier.+PDF.+render directory/i);
  assert.match(modify.steps[7], /visioner.+latest renders.+APPROVED \| CHANGES_REQUIRED \| UNREVIEWABLE/i);
  assert.match(modify.steps[8], /reconcile.+fresh rerenders.+maximum of three vision review rounds/i);
  assert.match(modify.scopeNotes.join(' '), /Do not reopen template selection or story planning/i);
  assert.match(modify.scopeNotes.join(' '), /Do not widen scope to unrelated pre-existing layout defects/i);
  assert.deepEqual(modify.delegation, [
    'step-5: designer owns the bounded final layout pass and any resulting source revision',
    'step-8: visioner independently reviews the latest affected-page renders',
    'step-9: designer fixes material findings, the parent reconciles scope, and visioner reviews only fresh rerenders',
  ]);
  assert.match(
    `${generate.qualityChecks.join(' ')} ${modify.qualityChecks.join(' ')}`,
    /text and image overlap.+crowding.+clipping.+readable typography.+rendered evidence/i,
  );
});

test('SVG diagram workflow uses designer creation and independent visioner iteration', () => {
  const diagram = workflowRouteCatalog['diagram.svg'];

  assert.deepEqual(diagram.skills, ['svg-flowchart']);
  assert.deepEqual(diagram.roles, ['designer', 'visioner']);
  assert.deepEqual(diagram.delegation, [
    'step-2: designer creates the SVG and owns every source revision',
    'step-4: visioner independently reviews the fresh full-size and 60% raster renders',
    'step-5: designer applies findings and visioner reviews only the resulting new revision',
  ]);
  assert.match(diagram.steps[0], /node and edge model.+flow direction/i);
  assert.match(diagram.steps[1], /designer.+black and white.+straight.+dashed.+orthogonal polyline.+no curved connectors/i);
  assert.match(diagram.steps[2], /render.+full size.+60%/i);
  assert.match(diagram.steps[3], /visioner.+independent/i);
  assert.match(diagram.steps[4], /new revision.+maximum of three vision review rounds/i);
  assert.match(diagram.scopeNotes.join(' '), /designer owns SVG changes.+visioner remains read-only/i);
  assert.match(diagram.scopeNotes.join(' '), /Do not substitute source inspection or designer self-review for rendered visioner evidence/i);
  assert.match(
    diagram.qualityChecks.join(' '),
    /node and edge completeness.+arrow direction.+overlap.+text clipping.+connector collision.+crossing.+font size.+spacing.+rendered evidence/i,
  );
});

test('broad workload matrix always produces an advisory workflow plan', () => {
  assert.ok(workloadMatrix.length >= 60);
  for (const item of workloadMatrix) {
    const route = routeNaturalLanguageTask({ prompt: item.prompt, routerMode: 'enforce' });
    assert.ok(workflowRouteNames.includes(route.workflowRoute), item.id);
    assert.equal(route.advisoryOnly, true, item.id);
    assert.equal(route.autoContinue, false, item.id);
    assert.equal(route.routePlan.version, 2, item.id);
    assert.equal(route.routePlan.mode, 'advisory', item.id);
    assert.equal(route.routePlan.autoContinue, false, item.id);
    assert.ok(Array.isArray(route.routePlan.steps), item.id);
    assert.ok(Array.isArray(route.routePlan.skills), item.id);
    assert.ok(Array.isArray(route.routePlan.tools), item.id);
    assert.ok(Array.isArray(route.routePlan.roles), item.id);
    assert.ok(Array.isArray(route.routePlan.qualityChecks), item.id);
    assert.ok(Array.isArray(route.routePlan.riskNotes), item.id);
    assert.equal(Object.hasOwn(route.routePlan, 'gateRequirements'), false, item.id);
    assert.equal(Object.hasOwn(route, 'gateMode'), false, item.id);
    assert.equal(Object.hasOwn(route, 'hardBlockReasons'), false, item.id);
  }
});

test('body-less writing may defer language but never guesses from instruction language', () => {
  for (const item of workloadMatrix.filter(({ expectedRoute }) => ['writing.zh', 'writing.en'].includes(expectedRoute))) {
    const route = routeNaturalLanguageTask({ prompt: item.prompt, routerMode: 'enforce' });
    if (route.intent !== 'writing.pending') continue;
    assert.equal(route.taskDescriptor.language, 'unknown', item.id);
    assert.ok(!route.routePlan.skills.includes('plain-chinese-writing'), item.id);
    assert.ok(!route.routePlan.skills.includes('zh-writing-polish'), item.id);
    assert.ok(!route.routePlan.skills.includes('writing-markdown-helper'), item.id);
  }
});

test('route cards expose guidance sections and no gate section', () => {
  for (const item of workloadMatrix) {
    const route = routeNaturalLanguageTask({ prompt: item.prompt, routerMode: 'enforce' });
    assert.match(route.routeCard, /^WORKFLOW_GUIDE\n/, item.id);
    assert.match(route.routeCard, /\nSuggested steps:\n- /, item.id);
    assert.match(route.routeCard, /\nSkills:\n- /, item.id);
    assert.match(route.routeCard, /\nOptional roles:\n- /, item.id);
    assert.match(route.routeCard, /\nScope and risk notes:\n- /, item.id);
    assert.doesNotMatch(route.routeCard, /\nGate:\n|\nDo not:\n/i, item.id);
    assert.deepEqual(route.routeCardSections, expectedSections, item.id);
  }
});

test('every catalog role and every catalog or selected skill remains packaged by the marketplace', async () => {
  const [registeredSkills, registeredAgents] = await Promise.all([
    registeredMarketplaceSkills(repoRoot),
    registeredMarketplaceAgents(repoRoot),
  ]);
  for (const [workflow, meta] of Object.entries(workflowRouteCatalog)) {
    for (const skill of meta.skills) {
      assert.equal(registeredSkills.has(skill), true, `${workflow}: ${skill}`);
    }
    for (const role of meta.roles) {
      assert.equal(registeredAgents.has(role), true, `${workflow}: ${role}`);
    }
  }
  for (const item of workloadMatrix) {
    const route = routeNaturalLanguageTask({ prompt: item.prompt, routerMode: 'enforce' });
    for (const skill of route.routePlan.skills) {
      assert.equal(registeredSkills.has(skill), true, `${item.id}: ${skill}`);
    }
    for (const role of route.routePlan.roles) {
      for (const skill of role.skills ?? []) {
        assert.equal(registeredSkills.has(skill), true, `${item.id}: ${role.agent}/${skill}`);
      }
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
