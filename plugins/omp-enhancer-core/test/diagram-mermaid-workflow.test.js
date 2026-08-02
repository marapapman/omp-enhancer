import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKFLOW_CATALOG_VERSION,
  workflowCatalog,
  workflowIds,
} from '../src/workflows/catalog.js';
import {
  buildWorkflowSkillIndexMarkdown,
  buildWorkflowSkillReferenceMarkdown,
} from '../src/workflows/render-skill.js';

test('the visual workflow is the single Mermaid-capable domain with the advisory render chain', () => {
  const workflow = workflowCatalog.visual;

  assert.equal(WORKFLOW_CATALOG_VERSION, 31);
  assert.ok(workflowIds.includes('visual'));
  assert.ok(workflow);
  assert.deepEqual(workflow.skills, ['mermaid-diagram', 'svg-flowchart', 'frontend-design', 'canvas-design']);
  assert.deepEqual(workflow.catalogSkills, []);
  assert.deepEqual(workflow.roles, ['designer', 'task']);
  assert.match(workflow.chooseWhen, /Diagrams \(Mermaid\), UI\/UX design, visual artifacts, slides with visual layout, or rendered figure review/iu);

  const flow = workflow.suggestedFlow.join(' ');
  const scope = workflow.scopeNotes.join(' ');

  assert.match(flow, /Clarify diagram type, format, and rendering requirements/iu);
  assert.match(flow, /Design via designer for complex visuals, or directly for simple diagrams/iu);
  assert.match(flow, /designer authors the complete Mermaid source in one pass and renders it via mermaid_render/iu);
  assert.match(flow, /Main performs a simple check of the rendered SVG before delivery/iu);
  assert.match(flow, /Deliver with source files and rendered evidence/iu);

  assert.match(scope, /All diagrams are authored as Mermaid source and rendered with mermaid_render/iu);
  assert.match(scope, /Mermaid rendering uses the mermaid-helper plugin pipeline/iu);

  assert.equal(Object.hasOwn(workflow, 'delegation'), false);
  assert.equal(Object.hasOwn(workflow, 'steps'), false);
  assert.equal(Object.hasOwn(workflow, 'delegationDefault'), false);
  assert.equal(Object.hasOwn(workflow, 'qualityChecks'), false);
  assert.doesNotMatch(`${flow} ${scope}`, /retry until|repeat until|automatic repair|automatic retry|block:\s*true|continue:\s*true/iu);
});

test('legacy Mermaid workflow ids are consolidated away', () => {
  assert.equal(workflowIds.includes('diagram.mermaid'), false);
  assert.equal(workflowIds.includes('diagram.tikz'), false);
  assert.equal(workflowIds.includes('design.visual'), false);
  assert.equal(workflowIds.includes('slides.generate'), false);
  assert.equal(workflowIds.includes('slides.modify'), false);
});

test('workflow Skill routes academic figures to the visual domain with the mermaid default', () => {
  const index = buildWorkflowSkillIndexMarkdown();
  const reference = buildWorkflowSkillReferenceMarkdown('visual');

  assert.match(
    index,
    /`visual`[^\n]*Diagrams \(Mermaid\)[^\n]*D=\[`skill:\/\/mermaid-diagram`, `skill:\/\/svg-flowchart`, `skill:\/\/frontend-design`, `skill:\/\/canvas-design`\]/u,
  );
  assert.match(reference, /^# `visual` workflow reference$/um);
  assert.match(reference, /Agent candidates: `designer`, `task`\./u);
  assert.match(reference, /All diagrams are authored as Mermaid source and rendered with mermaid_render/iu);
  assert.doesNotMatch(reference, /automatic retry|retry until|repeat until|automatic repair/iu);
  assert.doesNotMatch(index, /standalone SVG.*Primary|Direct standalone SVG/iu);
});
