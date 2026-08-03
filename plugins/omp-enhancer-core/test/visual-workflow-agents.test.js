import test from 'node:test';
import assert from 'node:assert/strict';

import {
  workflowCatalog,
  workflowDefinitions,
} from '../src/workflows/catalog.js';
import { buildWorkflowSkillIndexMarkdown } from '../src/workflows/render-skill.js';

test('the visual workflow exposes designer, task, and visioner as role candidates', () => {
  const workflow = workflowCatalog.visual;
  const definition = workflowDefinitions.find((candidate) => candidate.id === 'visual');

  assert.equal(workflow.roles.includes('designer'), true, 'visual needs designer');
  assert.equal(workflow.roles.includes('task'), true, 'visual needs task');
  assert.equal(workflow.roles.includes('visioner'), true, 'visual needs visioner');
  assert.deepEqual(definition.roles, ['designer', 'task', 'visioner']);

  const flow = workflow.suggestedFlow.join(' ');
  assert.match(flow, /Design via designer for complex visuals, or directly for simple diagrams/iu);
  assert.match(flow, /designer authors the complete draw\.io XML in one pass; task runs the bundled geometry checker and the drawio MCP \(create_diagram, search_shapes for icons\) on that exact source/iu);
  assert.match(flow, /visioner reviews fresh current-revision rendered evidence read-only/iu);
  assert.match(flow, /Main retains setup authorization and final acceptance only; deliver with the \.drawio source file and verified evidence/iu);

  const scope = workflow.scopeNotes.join(' ');
  assert.match(scope, /All diagrams are authored as draw\.io XML and verified with the drawio MCP/iu);
  assert.match(scope, /The drawio MCP \(hosted app server or local @drawio\/mcp tool server\) is the single diagram pipeline/iu);
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
  assert.match(index, /D=\[`skill:\/\/drawio-diagram`, `skill:\/\/frontend-design`, `skill:\/\/canvas-design`\]/u);
  for (const id of ['design.visual', 'slides.generate', 'diagram.mermaid', 'diagram.svg']) {
    assert.ok(!index.includes('`' + id + '`'), `index must not reference ${id}`);
  }
});
