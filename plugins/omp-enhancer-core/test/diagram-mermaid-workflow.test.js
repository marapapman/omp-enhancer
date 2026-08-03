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

  assert.equal(WORKFLOW_CATALOG_VERSION, 33);
  assert.ok(workflowIds.includes('visual'));
  assert.ok(workflow);
  assert.deepEqual(workflow.skills, ['drawio-skill', 'frontend-design', 'canvas-design']);
  assert.deepEqual(workflow.catalogSkills, []);
  assert.deepEqual(workflow.roles, ['designer', 'visioner']);
  assert.match(workflow.chooseWhen, /Diagrams \(draw\.io\), UI\/UX design, visual artifacts, slides with visual layout, or rendered figure review/iu);

  const flow = workflow.suggestedFlow.join(' ');
  const scope = workflow.scopeNotes.join(' ');

  assert.match(flow, /Clarify diagram type, format, and rendering requirements/iu);
  assert.match(flow, /visioner reviews that exported PNG read-only in one pass, flagging edges pressed onto each other or crossing through boxes/iu);
  assert.match(flow, /designer applies at most one fix round for supported findings and re-exports/iu);
  assert.match(flow, /Main retains setup authorization and final acceptance only; remaining findings are reported as limitations/iu);
  assert.match(flow, /designer draws the diagram once with drawio-skill from drawio@365-skills and exports a draft PNG/iu);

  assert.match(scope, /drawio-skill from the 365-skills marketplace \(drawio@365-skills\) is the single diagram pipeline/iu);
  assert.match(scope, /QA is one visioner pass plus at most one fix round; no repeated iteration rounds/iu);

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
    /`visual`[^\n]*Diagrams \(draw\.io\)[^\n]*D=\[`skill:\/\/drawio-skill`, `skill:\/\/frontend-design`, `skill:\/\/canvas-design`\]/u,
  );
  assert.match(reference, /^# `visual` workflow reference$/um);
  assert.match(reference, /Agent candidates: `designer`, `visioner`\./u);
  assert.doesNotMatch(reference, /- Suggested flow:|- Scope notes:/u);
  assert.doesNotMatch(reference, /automatic retry|retry until|repeat until|automatic repair/iu);
  assert.doesNotMatch(index, /standalone SVG.*Primary|Direct standalone SVG/iu);
});
