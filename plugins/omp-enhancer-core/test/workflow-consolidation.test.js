import test from 'node:test';
import assert from 'node:assert/strict';

import {
  workflowDefinitions,
  workflowCatalog,
  workflowIds,
} from '../src/workflows/catalog.js';
import {
  buildWorkflowSkillIndexMarkdown,
  buildWorkflowSkillReferenceMarkdown,
  workflowReferenceUri,
} from '../src/workflows/render-skill.js';

const REQUIRED_WORKFLOWS = [
  'code.dev',
  'network.design',
  'network.homelab',
  'network.review',
  'network.debug',
  'database.review',
  'database.change',
  'database.migration.repair',
  'ml.review',
  'ml.debug',
  'release.opensource',
  'marketing.campaign',
  'seo.audit',
];

const RETIRED_CODE_WORKFLOWS = [
  'research.technical',
  'code.plan',
  'code.debug',
  'code.test',
  'code.review',
  'code.build',
  'performance.optimize',
];

test('catalog exposes the consolidated workflows and deliberately omits healthcare', () => {
  for (const id of REQUIRED_WORKFLOWS) {
    assert.ok(workflowIds.includes(id), `missing workflow ${id}`);
  }
  assert.equal(workflowIds.includes('healthcare.review'), false);
  assert.equal(workflowIds.includes('communications.triage'), false);
  for (const id of RETIRED_CODE_WORKFLOWS) {
    assert.equal(workflowIds.includes(id), false, `retired workflow remains: ${id}`);
  }
});

test('compact workflow Skill teaches primary-plus-add-on composition with exact resource URIs', () => {
  const index = buildWorkflowSkillIndexMarkdown();

  assert.match(index, /1\. \*\*DISCOVER\*\*[\s\S]*read this index alone before project work and wait/i);
  assert.match(index, /mechanical field lookup without analysis uses no Skill or TODO/i);
  assert.match(index, /2\. \*\*PLAN \+ LOAD\*\*[\s\S]*requested operation, source, and output[\s\S]*emit the exact block[\s\S]*load only its resources[\s\S]*project facts wait until READY/i);
  assert.match(index, /3\. \*\*READY \+ EXECUTE\*\*[\s\S]*after resources[\s\S]*commit the loaded method to detailed native TODO when exposed[\s\S]*wait[\s\S]*execute it/i);
  assert.match(index, /Delegation is Main-owned[\s\S]*OMP native settings/i);
  assert.match(index, /## State handoff[\s\S]*SOFT, MAIN-OWNED TRACE[\s\S]*Only visible assistant text counts[\s\S]*thinking, tool arguments, and files do not/i);
  assert.match(index, /SELECTION:[\s\S]*Primary is exactly one central workflow ID[\s\S]*independently matching operation or output in Add-ons[\s\S]*never joined with `\+`/iu);
  assert.match(index, /exclude every `Not for` match[\s\S]*smallest Skill set positively owning the requested method, evidence, verdict, or format[\s\S]*never one for awareness[\s\S]*workflow reference is not a domain Skill/i);
  assert.match(index, /Format-only conversion loads its converter[\s\S]*not a target-format prose Skill unless content editing is requested/i);
  assert.match(index, /LOAD ORDER:[\s\S]*exact domain Skill or catalog `skill:\/\/\.\.\.` URI first[\s\S]*workflow `PLAN URI:` once and last[\s\S]*nested Skill URI[\s\S]*before the workflow references[\s\S]*do not repeat PLAN/i);
  assert.match(index, /NEXT VISIBLE ASSISTANT TEXT[\s\S]*WORKFLOW PLAN[\s\S]*Primary: <one-workflow-id-or-none>[\s\S]*Add-ons:[\s\S]*Skills:[\s\S]*Load order:[\s\S]*Actions:[\s\S]*1\./i);
  assert.match(index, /separate numbered Action for each distinct requested checkpoint or evidence phase[\s\S]*do not collapse them into one catch-all line/iu);
  assert.match(index, /OUTPUT BRIDGE:[\s\S]*first visible content item is this full `WORKFLOW PLAN`[\s\S]*thinking, narration without the block, or `\.\.\.` does not count[\s\S]*call every Load order URI and nothing else[\s\S]*no project tool, `todo`, `task`, or final/i);
  assert.match(index, /AFTER ALL DECLARED RESOURCES AND ANY CATALOG EXTENSION HAVE RETURNED[\s\S]*WORKFLOW READY \| primary=<id-or-none>[\s\S]*rebase the detailed TODO once before the first project action/i);
  assert.match(index, /WORKFLOW MATCH:[\s\S]*test every whole Primary condition[\s\S]*not words like plan[\s\S]*Choose one for the central requested operation or deliverable[\s\S]*every other independently matching requested operation or output in Add-ons[\s\S]*Do not add a workflow merely for an internal phase already covered by the Primary[\s\S]*Format-conversion plans match source\/output rows[\s\S]*not `code\.dev`/iu);
  assert.match(index, /LaTeX prose correction keeps `writing\.latex` \+ its language workflow[\s\S]*no converter\/template unless requested/iu);
  assert.match(index, /SELECTION TABLE ONLY:[\s\S]*choose here, emit PLAN, then read its literal PLAN URIs[\s\S]*`Load order` text, not an early call/iu);
  assert.doesNotMatch(index, /^- `[^`]+`[^\n]+\b(?:Add-ons|Skills):/gmu);
  assert.ok(Buffer.byteLength(index) < 13_000, 'workflow Skill index should stay compact');
  assert.doesNotMatch(index, /slices=<|assignment-input=|Composition example:|\[workflow=<ids>/i);
  assert.match(index, /PLAN URI: `skill:\/\/omp-enhancer-workflows\/references\/code\.dev\.md`/i);
  assert.doesNotMatch(index, /PLAN URI: `references\//u);
  assert.equal(workflowReferenceUri('code.dev'), 'skill://omp-enhancer-workflows/references/code.dev.md');
  assert.match(index, /does not route tasks, select Agents, create gates/i);
  assert.doesNotMatch(index, /block:\s*true|continue:\s*true|triggerTurn\s*\(/i);

  const codeReference = buildWorkflowSkillReferenceMarkdown('code.dev');
  assert.match(codeReference, /RESOURCE HANDOFF \(soft\):[\s\S]*Do not start project work/iu);
  assert.match(codeReference, /NEXT CHECKPOINT:[\s\S]*start visible assistant text with `WORKFLOW READY \| primary=<id-or-none> \| add-ons=<ids-or-none> \| skills-loaded=<bare-ids-or-none> \| skills-unavailable=<bare-ids-or-none>`[\s\S]*native `todo` is exposed[\s\S]*only TODO init and waits[\s\S]*project work starts in the next response/iu);
  assert.match(codeReference, /Primary when:/i);
  assert.doesNotMatch(codeReference, /Add-on candidates/iu);
  assert.doesNotMatch(codeReference, /Optional Skill topics|Optional Skill candidates/iu);
  assert.doesNotMatch(codeReference, /`code\.test` workflow reference/iu);
});

test('the consolidated code lifecycle uses plan plus native task and reviewer', () => {
  assert.deepEqual(workflowCatalog['code.dev'].roles, ['plan', 'task', 'reviewer']);
  assert.deepEqual(workflowCatalog['code.dev'].skills, ['code-development']);
  assert.deepEqual(workflowCatalog['design.visual'].roles, ['designer']);
});

test('omp.plugin owns the complete self-iteration lifecycle without adding another workflow ID', () => {
  const workflow = workflowCatalog['omp.plugin'];
  const steps = workflow.steps.join(' ');
  const delegation = workflow.delegation.join(' ');
  const quality = workflow.qualityChecks.join(' ');
  const risks = workflow.riskNotes.join(' ');

  assert.ok(workflow);
  assert.equal(workflowIds.some((id) => /self|iterat/iu.test(id)), false);
  assert.match(workflow.chooseWhen, /OMP plugin.+omp-enhancer.+self-development fixture.+workflow.+Skill.+prompt.+E2E/iu);
  assert.deepEqual(workflow.roles, ['plan', 'task', 'reviewer']);
  assert.deepEqual(workflow.skills, ['code-development']);
  assert.equal(workflow.composeWith.includes('code.dev'), false);
  assert.equal(workflowCatalog['code.dev'].composeWith.includes('omp.plugin'), false);
  assert.match(steps, /acceptance.+invariants.+dirty worktree.+installed state/iu);
  assert.match(steps, /detailed implementation and evidence plan.+parallel.+waves.+vertical slices.+non-overlapping.+write sets.+tests.+E2E/iu);
  assert.match(steps, /independently review.+parallel.+plan.+assignment.+before production changes/iu);
  assert.match(steps, /same.+tasks\[\].+batch.+independent.+vertical.+slice/iu);
  assert.match(steps, /task.+public behavior.+RED.+minimal.+implementation.+GREEN.+refactor/iu);
  assert.match(steps, /targeted.+package.+current revision/iu);
  assert.match(steps, /runtime.+isolated.+installed OMP E2E.+event.+provider.+runner/iu);
  assert.match(steps, /Main.+integrat.+current tree.+semantic diff.+test(?: and E2E)? evidence.+review/iu);
  assert.match(steps, /reviewer.+Main-reviewed.+bounded.+semantic diff.+evidence.+without.+project.+read.+command/iu);
  assert.match(steps, /supported.+finding.+task.+repair.+fresh evidence.+at most one.+fresh reviewer.+never.+automatic/iu);
  assert.match(steps, /release.+only when.+explicit/iu);
  assert.match(delegation, /plan.+complete.+parallel.+plan/iu);
  assert.match(delegation, /task.+vertical.+RED.+GREEN.+REFACTOR/iu);
  assert.match(delegation, /reviewer.+Main-reviewed.+semantic diff/iu);
  assert.match(delegation, /task.+supported.+finding.+repair/iu);
  assert.match(quality, /plan-review disposition.+task-owned.+RED-before-production.+GREEN.+Main self-review.+installed E2E.+review reconciliation/iu);
  assert.match(risks, /prompt.+installed-runtime.+drift.+isolated evidence.+stochastic.+one pass/iu);
});

test('new workflows use bounded exact roles', () => {
  const expected = {
    'code.dev': ['plan', 'task', 'reviewer'],
    'network.design': ['ecc-network-architect'],
    'network.homelab': ['ecc-network-architect'],
    'network.review': ['ecc-network-config-reviewer'],
    'network.debug': ['ecc-network-troubleshooter'],
    'database.review': [],
    'database.change': ['plan', 'task', 'reviewer'],
    'database.migration.repair': ['plan', 'task', 'reviewer'],
    'ml.review': [],
    'ml.debug': ['plan', 'task', 'reviewer'],
    'release.opensource': [
      'ecc-opensource-forker',
      'ecc-opensource-sanitizer',
      'ecc-opensource-packager',
      'reviewer',
    ],
    'marketing.campaign': [],
    'seo.audit': [],
    'omp.plugin': ['plan', 'task', 'reviewer'],
  };

  for (const [id, roles] of Object.entries(expected)) {
    const workflow = workflowCatalog[id];
    assert.ok(workflow, `missing workflow ${id}`);
    assert.deepEqual(workflow.roles, roles, id);
  }

  const allRoles = new Set(workflowDefinitions.flatMap(({ roles }) => roles));
  for (const forbidden of [
    'quick_task',
    'ecc-code-reviewer',
    'ecc-tdd-guide',
    'ecc-e2e-runner',
    'ecc-pr-test-analyzer',
    'ecc-performance-optimizer',
    'ecc-mle-reviewer',
    'ecc-pytorch-build-resolver',
    'ecc-healthcare-reviewer',
    'explore',
    'implementation-task',
    'config-librarian',
    'omp-target-auditor',
    'test-planner',
    'test-executor',
    'test-reviewer',
  ]) {
    assert.equal(allRoles.has(forbidden), false, forbidden);
  }

  assert.equal(allRoles.has('task'), true, 'native task must own ordinary code slices');
});

test('high-risk workflows define substantive composition, skills, and evidence contracts', () => {
  const contracts = {
    'code.dev': {
      compose: ['security.review', 'release.publish'],
      skills: ['code-development'],
      evidence: ['local entry-to-caller-to-test trace', 'parallel vertical slices', 'task-owned RED-before-production', 'Main self-review', 'semantic diff'],
    },
    'database.migration.repair': {
      compose: ['database.review', 'security.review'],
      skills: ['database-migrations', 'postgres-patterns', 'code-development'],
      evidence: ['backup', 'rollback', 'migration state'],
    },
    'ml.review': {
      compose: ['security.review', 'factcheck.document'],
      skills: ['mle-workflow', 'code-development'],
      evidence: ['reproducibility', 'leakage', 'serving'],
    },
    'release.opensource': {
      compose: ['security.review', 'release.publish'],
      skills: ['opensource-pipeline', 'code-development'],
      evidence: ['staging', 'sanitization', 'publish'],
    },
    'marketing.campaign': {
      compose: ['research.web', 'factcheck.document', 'writing.zh', 'writing.en', 'design.visual'],
      skills: ['marketing-campaign', 'market-research'],
      evidence: ['fact', 'claim', 'language'],
    },
    'seo.audit': {
      compose: ['research.web', 'factcheck.document', 'design.visual'],
      skills: ['seo'],
      evidence: ['crawl', 'index', 'render', 'evidence'],
    },
  };

  for (const [id, contract] of Object.entries(contracts)) {
    const workflow = workflowCatalog[id];
    assert.ok(workflow, `missing workflow ${id}`);
    for (const field of ['composeWith', 'skills', 'evidence']) {
      const value = field === 'evidence'
        ? `${workflow.qualityChecks ?? ''} ${workflow.delegation ?? ''}`
        : workflow[field];
      const haystack = JSON.stringify(value ?? '').toLowerCase();
      const expected = field === 'composeWith' ? contract.compose : contract[field];
      for (const needle of expected) {
        assert.ok(haystack.includes(needle.toLowerCase()), `${id}.${field}: ${needle}`);
      }
    }
  }
});
