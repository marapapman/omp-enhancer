import test from 'node:test';
import assert from 'node:assert/strict';

import {
  workflowCatalog,
  workflowDefinitions,
} from '../src/workflows/catalog.js';
import { buildWorkflowSkillIndexMarkdown } from '../src/workflows/render-skill.js';

test('the visual workflow exposes designer and task as role candidates', () => {
  const workflow = workflowCatalog.visual;
  const definition = workflowDefinitions.find((candidate) => candidate.id === 'visual');

  assert.equal(workflow.roles.includes('designer'), true, 'visual needs designer');
  assert.equal(workflow.roles.includes('task'), true, 'visual needs task');
  assert.deepEqual(definition.roles, ['designer', 'task']);

  const flow = workflow.suggestedFlow.join(' ');
  assert.match(flow, /Design via designer for complex visuals, or directly for simple diagrams/iu);
  assert.match(flow, /designer authors the complete Mermaid source in one pass and renders it via mermaid_render/iu);
  assert.match(flow, /Main performs a simple check of the rendered SVG before delivery/iu);
  assert.match(flow, /Deliver with source files and rendered evidence/iu);

  const scope = workflow.scopeNotes.join(' ');
  assert.match(scope, /All diagrams are authored as Mermaid source and rendered with mermaid_render/iu);
  assert.match(scope, /Mermaid rendering uses the mermaid-helper plugin pipeline/iu);
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

  assert.match(index, /`visual` — Diagrams \(Mermaid\), UI\/UX design, visual artifacts, slides with visual layout, or rendered figure review\./u);
  assert.match(index, /D=\[`skill:\/\/mermaid-diagram`, `skill:\/\/svg-flowchart`, `skill:\/\/frontend-design`, `skill:\/\/canvas-design`\]/u);
  for (const id of ['design.visual', 'slides.generate', 'diagram.mermaid', 'diagram.svg']) {
    assert.ok(!index.includes('`' + id + '`'), `index must not reference ${id}`);
  }
});
