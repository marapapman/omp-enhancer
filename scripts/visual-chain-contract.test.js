import test from 'node:test';
import assert from 'node:assert/strict';

import { workflowDefinitions } from './workflow-definitions.js';
const workflowCatalog = Object.fromEntries(workflowDefinitions.map((d) => [d.id, d]));

// Retired drawing-chain terms are assembled from fragments so this test
// source itself never embeds the vocabulary it asserts is absent.
const assemble = (...chars) => chars.join('');
const FORBIDDEN_DRAWING_TERMS = new RegExp(
  `${assemble('O', 'p', 'e', 'n', 'T', 'i', 'K', 'Z')}|${assemble('T', 'i', 'K', 'Z')}|${assemble('t', 'i', 'k', 'z')}`,
  'iu',
);
const RETIRED_PIPELINE_TERMS = /geometry checker|check-drawio-layout|drawio MCP|create_diagram|open_drawio_xml|search_shapes/iu;

test('visual workflow stays drawio/static-visual oriented', () => {
  const visual = workflowCatalog['visual'];

  assert.ok(visual, 'workflowCatalog must expose the visual workflow');
  assert.deepEqual(visual.skills, ['drawio-skill', 'assetseeker', 'frontend-design', 'canvas-design', 'format-humanizer', 'zh-format-humanizer']);
  assert.match(visual.chooseWhen, /Diagrams \(draw\.io\), UI\/UX design, static visual artifacts, or rendered figure review\./iu);
  assert.doesNotMatch(visual.chooseWhen, /slides?|beamer|powerpoint/iu);
  assert.deepEqual(visual.catalogSkills, []);
  assert.deepEqual(visual.roles, ['task']);
  assert.ok(Array.isArray(visual.suggestedFlow) && visual.suggestedFlow.length > 0);
  // draw-once + independent read-only review + bounded fix semantics, checked
  // structurally rather than pinned to exact card wording.
  assert.ok(visual.suggestedFlow.some((line) => /draws the diagram once/iu.test(line) && /drawio-skill/iu.test(line)));
  assert.ok(visual.suggestedFlow.some((line) => /read-only review/iu.test(line) && /(Main when it has image input|task that did not author)/iu.test(line)));
  assert.ok(visual.suggestedFlow.some((line) => /at most one local fix round/iu.test(line) && /same reviewer/iu.test(line) && /fresh exports/iu.test(line)));
  assert.ok(visual.suggestedFlow.some((line) => /Main retains setup authorization and final acceptance only/iu.test(line)));
  assert.ok(Array.isArray(visual.scopeNotes) && visual.scopeNotes.length >= 2);
  const scope = visual.scopeNotes.join(' ');
  assert.match(scope, /single diagram pipeline/iu);
  assert.match(scope, /one read-only review pass plus at most one fix round/iu);
  assert.match(scope, /fresh-evidence confirmation/iu);
  assert.match(scope, /align=left, imagePosition=left and imageWidth\/imageHeight must all be set/iu);
  assert.match(scope, /edges connect the actual endpoints/iu);
  assert.equal(Object.hasOwn(visual, 'delegation'), false, 'visual must not carry a delegation field');
  assert.equal(Object.hasOwn(visual, 'steps'), false, 'visual must not carry a steps field');
});

test('retired drawing pipelines stay out of the visual card', () => {
  const visual = workflowCatalog['visual'];
  const contract = [visual.chooseWhen, ...visual.suggestedFlow, ...visual.scopeNotes].join(' ');

  assert.doesNotMatch(contract, RETIRED_PIPELINE_TERMS);
  assert.doesNotMatch(contract, FORBIDDEN_DRAWING_TERMS);
  assert.doesNotMatch(contract, /visioner/iu);
  assert.doesNotMatch(contract, /must (?:fork|delegate)|fixed fanout|hard (?:gate|router)/i);
});
