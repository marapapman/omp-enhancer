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
  assert.deepEqual(visual.roles, ['task']);
  for (const removed of ['writer', 'zh-writer', 'checker', 'zh-checker']) {
    assert.equal(visual.roles.includes(removed), false, `visual roles must not include the removed agent ${removed}`);
  }
  assert.ok(Array.isArray(visual.suggestedFlow) && visual.suggestedFlow.length > 0);
  // draw-once + independent read-only review + bounded fix semantics, checked
  // structurally rather than pinned to exact card wording.
  assert.ok(visual.suggestedFlow.some((line) => /draws the diagram once/iu.test(line) && /drawio-skill/iu.test(line)));
  assert.ok(visual.suggestedFlow.some((line) => /read-only review/iu.test(line) && /(Main when it has image input|task that did not author)/iu.test(line)));
  assert.ok(visual.suggestedFlow.some((line) => /at most one (?:local )?(?:structure\/layout )?fix round/iu.test(line) && /same reviewer/iu.test(line) && /fresh exports/iu.test(line)));
  assert.ok(visual.suggestedFlow.some((line) => /Main retains setup authorization and final acceptance only/iu.test(line)));
  assert.ok(Array.isArray(visual.scopeNotes) && visual.scopeNotes.length >= 2);
  const scope = visual.scopeNotes.join(' ');
  assert.match(scope, /house schematic style/iu);
  assert.match(scope, /#ffffff/iu);
  assert.match(scope, /#000000/iu);
  assert.match(scope, /#d5171a[^.]{0,120}(?:error|failure|risk)|(?:error|failure|risk)[^.]{0,120}#d5171a/iu);
  assert.match(scope, /#037870[^.]{0,120}(?:success|verified|correct)|(?:success|verified|correct)[^.]{0,120}#037870/iu);
  assert.match(scope, /#1668b5/iu);
  assert.match(scope, /#e08a1e/iu);
  assert.match(scope, /never as a box or section fill/iu);
  assert.match(scope, /boxes default to no fill/iu);
  assert.match(scope, /endSize of 5–7/iu);
  assert.match(scope, /never below 18 units/iu);
  assert.doesNotMatch(scope, /at most one accent|single accent color/iu);
  assert.match(scope, /single diagram pipeline/iu);
  assert.match(scope, /one read-only review pass plus at most one fix round/iu);
  assert.match(scope, /fresh-evidence confirmation/iu);
  assert.match(scope, /align=left, imagePosition=left and imageWidth\/imageHeight must all be set/iu);
  assert.match(scope, /edges connect the actual endpoints/iu);
  // Aesthetic recipe: generation-first icons, color rhythm, and structural hierarchy
  // must not regress to the opt-in, ban-only rules that produced bare wireframes.
  assert.match(scope, /generation-first/iu);
  assert.doesNotMatch(scope, /raster assets (?:are|stay) opt-in/iu);
  assert.match(scope, /5–12%/u);
  assert.match(scope, /lead decorative hue/iu);
  assert.match(scope, /65–85%/u);
  assert.match(scope, /[（(]C2[)）]/u);
  assert.match(scope, /[（(]S1[)）]/u);
  assert.ok(visual.suggestedFlow.some((line) => /image-capable task/iu.test(line) && /text-only/iu.test(line)));
  // v3 refinements after the probe review must not silently regress either.
  assert.match(scope, /chartjunk/iu);
  assert.match(scope, /ink bounding box/iu);
  assert.match(scope, /0\.4–0\.8× the card width/iu);
  assert.match(scope, /intentional bundling/iu);
  assert.match(scope, /never merge them[\s\S]{0,220}does not forbid/iu);
  assert.equal(Object.hasOwn(visual, 'delegation'), false, 'visual must not carry a delegation field');
  assert.equal(Object.hasOwn(visual, 'steps'), false, 'visual must not carry a steps field');
});

test('visual card routes every label, caption, and UI string through Main and the polisher', () => {
  const visual = workflowCatalog['visual'];
  const contract = [visual.chooseWhen, ...visual.suggestedFlow, ...visual.scopeNotes].join(' ');

  assert.match(contract, /house schematic style/iu);
  assert.match(contract, /code-drawn schematics \(draw\.io[\s\S]{0,120}imagegen-generated schematics/iu);
  assert.match(contract, /arrowhead size against the visible shaft/iu);
  assert.match(contract, /no gray or pale fills/iu);

  // The removed text agents are gone: Main drafts every surface and the
  // stateless polisher tool rewrites it before it enters the diagram.
  assert.match(contract, /\bpolisher\b/iu, 'the visual card must name the polisher tool');
  assert.match(contract, /\blabels?\b/iu, 'the visual card must name label text');
  assert.match(contract, /\bcaptions?\b/iu, 'the visual card must name caption text');
  assert.match(contract, /(?:UI|interface)\s+(?:strings?|copy|text|labels?)/iu, 'the visual card must name UI text');
  assert.match(
    contract,
    /(?:Main[^.]{0,400}(?:draft|author|writ)|(?:draft|author|written|writes)[^.]{0,160}\bMain\b)/iu,
    'Main must draft the diagram copy',
  );
  assert.match(
    contract,
    /(?:label|caption|UI|text|copy|string|note)[^.]{0,400}\bpolisher\b|\bpolisher\b[^.]{0,300}(?:label|caption|UI|text|copy|string|note)/iu,
    'each drafted string must pass through the polisher',
  );
  assert.match(
    contract,
    /(?:before|prior to|then|after)[^.]{0,300}(?:map|insert|place|put|writ|draw)/iu,
    'the polished text must be settled before it is mapped into the diagram',
  );
  assert.match(
    contract,
    /verbatim|returned (?:text|copy|string|wording)|polished (?:text|copy|string|wording|label|caption|output)/iu,
    'the polished text is used as returned',
  );
  assert.match(
    contract,
    /\btask\b[^.]{0,260}(?:never|must not|does not|do not)[^.]{0,200}(?:reword|rewrite|polish|edit|shorten|author)/iu,
    'task must never reword copy',
  );
  assert.match(
    contract,
    /findings?[^.]{0,260}\bpolisher\b|\bpolisher\b[^.]{0,260}findings?/iu,
    'text findings must return to the polisher',
  );
  assert.doesNotMatch(
    contract,
    /\b(?:writer|zh-writer|zh-checker)\b|\b(?:the|a|an)\s+checker\b/iu,
    'the visual card must not route text to a removed agent',
  );
});

test('retired drawing pipelines stay out of the visual card', () => {
  const visual = workflowCatalog['visual'];
  const contract = [visual.chooseWhen, ...visual.suggestedFlow, ...visual.scopeNotes].join(' ');
  const allowedHelper = /scripts\/check-drawio-layout\.py/giu;
  const contractWithoutApprovedHelper = contract.replace(allowedHelper, '');

  assert.match(contract, allowedHelper, 'the repo-owned geometry assertion script remains discoverable');
  assert.doesNotMatch(contractWithoutApprovedHelper, RETIRED_PIPELINE_TERMS);
  assert.doesNotMatch(contract, FORBIDDEN_DRAWING_TERMS);
  assert.doesNotMatch(contract, /visioner/iu);
  assert.doesNotMatch(contract, /must (?:fork|delegate)|fixed fanout|hard (?:gate|router)/i);
});
