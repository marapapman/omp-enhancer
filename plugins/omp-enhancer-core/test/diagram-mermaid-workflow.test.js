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

test('the visual workflow is the single draw.io-capable domain with the advisory render chain', () => {
  const workflow = workflowCatalog.visual;

  assert.equal(WORKFLOW_CATALOG_VERSION, 32);
  assert.ok(workflowIds.includes('visual'));
  assert.ok(workflow);
  assert.deepEqual(workflow.skills, ['drawio-diagram', 'frontend-design', 'canvas-design']);
  assert.deepEqual(workflow.catalogSkills, []);
  assert.deepEqual(workflow.roles, ['designer', 'task', 'visioner']);
  assert.match(workflow.chooseWhen, /Diagrams \(draw\.io\), UI\/UX design, visual artifacts, slides with visual layout, or rendered figure review/iu);

  const flow = workflow.suggestedFlow.join(' ');
  const scope = workflow.scopeNotes.join(' ');

  assert.match(flow, /Clarify diagram type, format, and rendering requirements/iu);
  assert.match(flow, /Design via designer for complex visuals, or directly for simple diagrams/iu);
  assert.match(flow, /designer authors the complete draw\.io XML in one pass; task runs the bundled geometry checker and the drawio MCP \(create_diagram, search_shapes for icons\) on that exact source/iu);
  assert.match(flow, /visioner reviews fresh current-revision rendered evidence read-only/iu);
  assert.match(flow, /Main retains setup authorization and final acceptance only; deliver with the \.drawio source file and verified evidence/iu);

  assert.match(scope, /All diagrams are authored as draw\.io XML and verified with the drawio MCP/iu);
  assert.match(scope, /The drawio MCP \(hosted app server or local @drawio\/mcp tool server\) is the single diagram pipeline/iu);

  assert.equal(Object.hasOwn(workflow, 'delegation'), false);
  assert.equal(Object.hasOwn(workflow, 'steps'), false);
  assert.equal(Object.hasOwn(workflow, 'delegationDefault'), false);
  assert.equal(Object.hasOwn(workflow, 'qualityChecks'), false);
  assert.doesNotMatch(`${flow} ${scope}`, /retry until|repeat until|automatic repair|automatic retry|block:\s*true|continue:\s*true/iu);
});

test('legacy diagram workflow ids are consolidated away', () => {
  assert.equal(workflowIds.includes('diagram.mermaid'), false);
  assert.equal(workflowIds.includes('diagram.tikz'), false);
  assert.equal(workflowIds.includes('design.visual'), false);
  assert.equal(workflowIds.includes('slides.generate'), false);
  assert.equal(workflowIds.includes('slides.modify'), false);
});

test('workflow Skill routes academic figures to the visual domain with the drawio default', () => {
  const index = buildWorkflowSkillIndexMarkdown();
  const reference = buildWorkflowSkillReferenceMarkdown('visual');

  assert.match(
    index,
    /`visual`[^\n]*Diagrams \(draw\.io\)[^\n]*D=\[`skill:\/\/drawio-diagram`, `skill:\/\/frontend-design`, `skill:\/\/canvas-design`\]/u,
  );
  assert.match(reference, /^# `visual` workflow reference$/um);
  assert.match(reference, /Agent candidates: `designer`, `task`, `visioner`\./u);
  assert.match(reference, /All diagrams are authored as draw\.io XML and verified with the drawio MCP/iu);
  assert.doesNotMatch(reference, /automatic retry|retry until|repeat until|automatic repair/iu);
  assert.doesNotMatch(index, /standalone SVG.*Primary|Direct standalone SVG/iu);
});
