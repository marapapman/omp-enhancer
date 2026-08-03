import test from 'node:test';
import assert from 'node:assert/strict';

import {
  workflowCatalog,
  workflowDefinitions,
} from '../src/workflows/catalog.js';
import { buildWorkflowSkillIndexMarkdown } from '../src/workflows/render-skill.js';

test('the visual workflow exposes designer and visioner as role candidates', () => {
  const workflow = workflowCatalog.visual;
  const definition = workflowDefinitions.find((candidate) => candidate.id === 'visual');

  assert.equal(workflow.roles.includes('designer'), true, 'visual needs designer');
  assert.equal(workflow.roles.includes('visioner'), true, 'visual needs visioner');
  assert.deepEqual(definition.roles, ['designer', 'visioner']);

  const flow = workflow.suggestedFlow.join(' ');
  assert.match(flow, /designer draws the diagram once with drawio-skill from drawio@365-skills and exports a draft PNG/iu);
  assert.match(flow, /visioner reviews that exported PNG read-only in one pass, flagging edges pressed onto each other or crossing through boxes/iu);
  assert.match(flow, /designer applies at most one fix round for supported findings and re-exports/iu);
  assert.match(flow, /Main retains setup authorization and final acceptance only; remaining findings are reported as limitations/iu);

  const scope = workflow.scopeNotes.join(' ');
  assert.match(scope, /drawio-skill from the 365-skills marketplace \(drawio@365-skills\) is the single diagram pipeline/iu);
  assert.match(scope, /QA is one visioner pass plus at most one fix round; no repeated iteration rounds/iu);
});

test('the visual workflow keeps visual limitations advisory without gates or fixed dispatch', () => {
  const workflow = workflowCatalog.visual;
  const contract = [
    ...workflow.suggestedFlow,
    ...workflow.scopeNotes,
  ].join(' ');
  assert.doesNotMatch(contract, /gate|router|fixed dispatch|completion condition|automatic loop/iu);
  assert.equal(Object.hasOwn(workflow, 'delegation'), false);
  assert.equal(Object.hasOwn(workflow, 'steps'), false);
});

test('compact index composes visual work only as the single visual domain', () => {
  const index = buildWorkflowSkillIndexMarkdown();

  assert.match(index, /`visual` — Diagrams \(draw\.io\), UI\/UX design, visual artifacts, slides with visual layout, or rendered figure review\./u);
  assert.match(index, /D=\[`skill:\/\/drawio-skill`, `skill:\/\/frontend-design`, `skill:\/\/canvas-design`\]/u);
  for (const id of ['design.visual', 'slides.generate', 'diagram.mermaid', 'diagram.svg']) {
    assert.ok(!index.includes('`' + id + '`'), `index must not reference ${id}`);
  }
});
