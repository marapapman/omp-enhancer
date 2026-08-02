import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKFLOW_CATALOG_VERSION,
  workflowDefinitions,
  workflowCatalog,
  workflowIds,
} from '../src/workflows/catalog.js';
import {
  buildWorkflowSkillIndexMarkdown,
  buildWorkflowSkillReferenceMarkdown,
  workflowReferenceUri,
} from '../src/workflows/render-skill.js';
import { buildSharedWorkflowCatalogMarkdown } from '../src/workflows/render-shared-markdown.js';
import { exactNestedEccSkillUri } from '../src/workflows/skill-discovery.js';

const REQUIRED_WORKFLOWS = ['code', 'writing', 'research', 'visual', 'operations'];

const REMOVED_FIELDS = [
  'steps',
  'delegation',
  'delegationDefault',
  'composeWith',
  'qualityChecks',
  'riskNotes',
];

test('catalog exposes exactly the five consolidated workflows and deliberately omits retired ids', () => {
  assert.equal(WORKFLOW_CATALOG_VERSION, 31);
  assert.deepEqual(workflowIds, REQUIRED_WORKFLOWS);
  assert.equal(workflowDefinitions.length, 5);
  for (const id of REQUIRED_WORKFLOWS) {
    assert.ok(workflowIds.includes(id), `missing workflow ${id}`);
    assert.ok(workflowCatalog[id], `missing catalog card ${id}`);
  }
  for (const retired of [
    'code.dev',
    'code.plan',
    'writing.en',
    'writing.zh',
    'writing.pending',
    'writing.latex',
    'diagram.mermaid',
    'diagram.tikz',
    'diagram.svg',
    'design.visual',
    'slides.generate',
    'slides.modify',
    'research.web',
    'factcheck.document',
    'network.design',
    'database.review',
    'database.change',
    'ml.debug',
    'marketing.campaign',
    'seo.audit',
    'security.review',
    'release.publish',
    'release.opensource',
    'omp.plugin',
    'general.subagent',
    'agentic.simple',
    'healthcare.review',
    'communications.triage',
  ]) {
    assert.equal(workflowIds.includes(retired), false, `retired workflow remains: ${retired}`);
  }
});

test('every definition carries the simplified schema with advisory fields only', () => {
  for (const definition of workflowDefinitions) {
    assert.ok(typeof definition.chooseWhen === 'string' && definition.chooseWhen.length > 0, `${definition.id}.chooseWhen`);
    assert.ok(Array.isArray(definition.skills) && definition.skills.length > 0, `${definition.id}.skills`);
    assert.ok(Array.isArray(definition.roles) && definition.roles.length > 0, `${definition.id}.roles`);
    assert.ok(Array.isArray(definition.suggestedFlow) && definition.suggestedFlow.length > 0, `${definition.id}.suggestedFlow`);
    assert.ok(
      definition.suggestedFlow.every((line) => typeof line === 'string' && line.length > 0),
      `${definition.id}.suggestedFlow entries must be non-empty strings`,
    );
    assert.ok(Array.isArray(definition.scopeNotes), `${definition.id}.scopeNotes`);
    for (const field of REMOVED_FIELDS) {
      assert.equal(Object.hasOwn(definition, field), false, `${definition.id} must not have ${field}`);
    }
  }
});

test('compact workflow Skill teaches the three-phase advisory and lists five domain rows', () => {
  const index = buildWorkflowSkillIndexMarkdown();

  assert.match(index, /Phases: ANALYZE -> EXECUTE -> REVIEW/u);
  assert.match(index, /## Domain index/u);
  assert.match(index, /## Usage/u);
  assert.match(index, /Advisory reference only\. Main selects workflows, Skills, Agents, and delegation width freely\./u);

  for (const id of REQUIRED_WORKFLOWS) {
    const row = index.split('\n').find((line) => line.includes(`\`${id}\``));
    assert.ok(row, `missing index row for ${id}`);
    assert.match(row, /— /u);
    assert.match(row, /Reference: `skill:\/\/omp-enhancer-workflows\/references\/[a-z]+\.md`/u);
  }

  for (const marker of ['DECLARE HANDOFF', 'WORKFLOW PLAN', 'WORKFLOW READY', 'SENTINEL', 'byte 0', 'NOW=', 'THEN=', 'RESOURCE EXTENSION', 'Delegate Agent=', 'DISCOVER -> DECLARE', 'PROSE:', 'STATE HANDOFF']) {
    assert.doesNotMatch(index, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu'), `index must not contain ${marker}`);
  }

  assert.ok(Buffer.byteLength(index) < 8000, `workflow Skill index should stay compact (${Buffer.byteLength(index)} bytes)`);
  assert.doesNotMatch(index, /block:\s*true|continue:\s*true|triggerTurn\s*\(|hard router|automatic retry/i);
  assert.doesNotMatch(index, /slices=<|assignment-input=|Composition example:|\[workflow=<ids>/i);

  assert.equal(workflowReferenceUri('code'), 'skill://omp-enhancer-workflows/references/code.md');
  assert.match(index, /Reference: `skill:\/\/omp-enhancer-workflows\/references\/code\.md`/u);
});

test('reference cards render the simplified advisory contract for every workflow', () => {
  for (const id of REQUIRED_WORKFLOWS) {
    const reference = buildWorkflowSkillReferenceMarkdown(id);
    assert.match(reference, new RegExp(`^# \`${id}\` workflow reference$`, 'um'), id);
    assert.match(reference, /- When: /u, id);
    assert.match(reference, /- Skills: /u, id);
    assert.match(reference, /- Agent candidates: /u, id);
    assert.match(reference, /- Suggested flow:\n  1\. /u, id);
    assert.doesNotMatch(reference, /SENTINEL|byte 0|WORKFLOW PLAN|WORKFLOW READY|Delegate Agent=/u, id);
  }
});

test('workflow Skill discovery distinguishes direct URIs from exact nested ECC URIs', () => {
  assert.deepEqual(workflowCatalog.code.catalogSkills, []);
  assert.deepEqual(workflowCatalog.writing.catalogSkills, []);
  assert.deepEqual(workflowCatalog.visual.catalogSkills, []);
  assert.deepEqual(workflowCatalog.research.catalogSkills, ['research-ops', 'deep-research']);
  assert.deepEqual(workflowCatalog.operations.catalogSkills, [
    'security-review',
    'security-scan',
    'network-config-validation',
    'marketing-campaign',
    'seo',
  ]);

  const index = buildWorkflowSkillIndexMarkdown();
  const sharedCatalog = buildSharedWorkflowCatalogMarkdown();
  for (const definition of workflowDefinitions) {
    const indexRow = index.split('\n').find((line) => line.includes(`\`${definition.id}\``)) ?? '';
    const cardHeading = `## \`${definition.id}\``;
    const cardStart = sharedCatalog.indexOf(cardHeading);
    const nextCard = sharedCatalog.indexOf('\n## `', cardStart + cardHeading.length);
    const catalogEnd = sharedCatalog.indexOf('\n<!-- OMP-ENHANCER-WORKFLOW-CATALOG:END -->', cardStart);
    const cardEnd = nextCard >= 0 ? nextCard : catalogEnd;
    const card = cardStart >= 0 && cardEnd >= 0 ? sharedCatalog.slice(cardStart, cardEnd) : '';
    for (const skill of definition.catalogSkills) {
      const uri = exactNestedEccSkillUri(skill);
      assert.ok(definition.skills.includes(skill), `${definition.id} catalogSkills must also be direct skills`);
      assert.ok(indexRow.includes(`\`${uri}\``), `${definition.id} index is missing ${uri}`);
      // The shared catalog lists catalog skills as plain names (they are also direct skills).
      assert.ok(card.includes(`\`${skill}\``), `${definition.id} shared card is missing ${skill}`);
    }
  }
});

test('the shared catalog markdown lists all five workflow cards between managed markers', () => {
  const sharedCatalog = buildSharedWorkflowCatalogMarkdown();

  assert.match(sharedCatalog, /<!-- OMP-ENHANCER-WORKFLOW-CATALOG:START -->/u);
  assert.match(sharedCatalog, /<!-- OMP-ENHANCER-WORKFLOW-CATALOG:END -->/u);
  assert.match(sharedCatalog, /# OMP Enhancer Workflow Catalog v31/u);
  assert.match(sharedCatalog, /Advisory reference\. Main orchestrates freely through ANALYZE -> EXECUTE -> REVIEW\./u);

  for (const id of REQUIRED_WORKFLOWS) {
    assert.match(sharedCatalog, new RegExp(`## \`${id}\``, 'u'), `missing shared card ${id}`);
    assert.match(sharedCatalog, new RegExp(`## \`${id}\`[^]*?- When: `, 'u'), `${id} card must carry chooseWhen`);
    assert.match(sharedCatalog, new RegExp(`## \`${id}\`[^]*?- Flow:\n  1\. `, 'u'), `${id} card must carry suggested flow`);
  }
  assert.doesNotMatch(sharedCatalog, /SENTINEL|byte 0|WORKFLOW PLAN|WORKFLOW READY|NOW=|THEN=/u);
});

test('the consolidated code lifecycle uses analyzer plus native task and reviewer', () => {
  assert.deepEqual(workflowCatalog.code.roles, ['analyzer', 'task', 'reviewer', 'scout', 'librarian']);
  assert.deepEqual(workflowCatalog.code.skills, ['code-development']);
  assert.match(workflowCatalog.code.chooseWhen, /code inspection, planning, diagnosis, implementation, refactoring, testing, build repair, performance, database, ML/u);
  const flow = workflowCatalog.code.suggestedFlow.join(' ');
  const scope = workflowCatalog.code.scopeNotes.join(' ');
  assert.match(flow, /delegate analysis and planning to analyzer/u);
  assert.match(flow, /TDD \(RED → GREEN → REFACTOR\)/u);
  assert.match(flow, /Main reviews simple changes directly; delegate complex or risky changes to reviewer/u);
  assert.match(scope, /Read-only or plan-only requests do not authorize production mutation/u);
  assert.match(scope, /no fixed fanout or fork mandate/u);
});

test('domain workflows expose their role candidates and skills', () => {
  assert.deepEqual(workflowCatalog.visual.roles, ['designer', 'task']);
  assert.deepEqual(workflowCatalog.visual.skills, ['mermaid-diagram', 'svg-flowchart', 'frontend-design', 'canvas-design']);

  assert.deepEqual(workflowCatalog.writing.roles, ['writer', 'zh-writer', 'checker', 'zh-checker', 'task']);
  assert.ok(workflowCatalog.writing.skills.includes('writing-review'));
  assert.ok(workflowCatalog.writing.skills.includes('plain-chinese-writing'));

  assert.deepEqual(workflowCatalog.research.roles, [
    'fact-researcher-a',
    'fact-researcher-b',
    'fact-reviewer',
    'fact-cross-checker',
    'fact-planner',
    'scout',
  ]);
  assert.ok(workflowCatalog.research.skills.includes('fact-checking'));

  assert.ok(workflowCatalog.operations.roles.includes('task'));
  assert.ok(workflowCatalog.operations.roles.includes('ecc-security-reviewer'));
  assert.ok(workflowCatalog.operations.skills.includes('conventional-commits'));
});
