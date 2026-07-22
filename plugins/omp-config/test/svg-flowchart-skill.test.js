import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkSvgFlowchart } from '../skills/svg-flowchart/scripts/check-svg-flowchart.mjs';

const skillUrl = new URL('../skills/svg-flowchart/SKILL.md', import.meta.url);
const visionerUrl = new URL('../agents/visioner.md', import.meta.url);

test('SVG flowchart skill defines strict geometry, spacing, and bounded rendered review', async () => {
  const skill = await readFile(skillUrl, 'utf8');

  assert.match(skill, /standalone SVG/i);
  assert.match(skill, /black.+white.+fill="none"/i);
  assert.match(skill, /rectangles?.+diamonds?.+circles?.+ellipses?/i);
  assert.match(skill, /`<line>`.+`<polyline>`/i);
  assert.match(skill, /horizontal or vertical/i);
  assert.match(skill, /no Bézier.+arc.+spline.+curved connector/i);
  assert.match(skill, /32 px outer margin.+24 px between nodes.+16 px.+unrelated.+12 px internal text padding/i);
  assert.match(skill, /16 px minimum/i);
  assert.match(skill, /`designer` owns.+complete.+SVG source revision/is);
  assert.match(skill, /`task` runs the bundled checker.+renders the current SVG revision.+binds.+revision identifier.+full declared size.+60%/is);
  assert.match(skill, /`visioner` independently inspect.+fresh.+full-size.+60%/is);
  assert.match(skill, /Agent availability and capacity remain Main decisions/i);
  assert.match(skill, /supported finding.+`designer` applies.+`task` reruns the checker and rerenders.+`visioner` reviews only fresh rerendered evidence.+at most once/is);
  assert.match(skill, /Main only authorizes external effects during initial setup and accepts final delivery.+does not check, render, modify, reconcile, or mediate the visual loop/is);
  assert.match(skill, /Do not review an unchanged artifact again/i);
  assert.match(skill, /Do not claim visual approval from source inspection or the static checker alone/i);
  assert.match(skill, /No review verdict grants permission to publish or complete/i);
  assert.doesNotMatch(skill, /Main may assign.+(?:rerun|renderer)|Main (?:runs|reruns|renders|modifies) the (?:checker|SVG|geometry)/is);
  assert.doesNotMatch(skill, /maximum of three|finish with zero|have `designer` address every|retry until|repeat until|block:\s*true|continue:\s*true/i);
});

test('SVG skill supplies the explicit pure black and white diagram constraint', async () => {
  const skill = await readFile(skillUrl, 'utf8');

  assert.match(skill, /Use only black.+white.+fill="none"/is);
});

test('visioner is a read-only rendered-diagram reviewer backed by the vision role', async () => {
  const visioner = await readFile(visionerUrl, 'utf8');

  assert.match(visioner, /^name: visioner$/m);
  assert.match(visioner, /^\s*- pi\/vision$/m);
  assert.match(visioner, /read-only/i);
  assert.match(visioner, /^\s*- inspect_image$/m);
  assert.match(visioner, /latest full-size and 60% raster renders/i);
  assert.match(visioner, /APPROVED \| CHANGES_REQUIRED \| UNREVIEWABLE/);
  assert.match(visioner, /element IDs?.+visible region.+impact.+requested correction/is);
  assert.match(visioner, /Do not approve a revision by inspecting an older render/i);
  assert.doesNotMatch(visioner, /^\s*- (?:edit|write)$/m);
  assert.doesNotMatch(visioner, /block:\s*true|continue:\s*true|retry until|repeat until/i);
});

test('SVG checker accepts a monochrome orthogonal flowchart', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'svg-flowchart-valid-'));
  const svgPath = path.join(root, 'valid.svg');
  await writeFile(svgPath, `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
  <title>Approval workflow</title>
  <desc>A request moves from draft to review.</desc>
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
      <polygon id="arrowhead" points="0,0 10,5 0,10" fill="#000" />
    </marker>
  </defs>
  <g id="draft">
    <rect x="32" y="32" width="180" height="72" fill="#fff" stroke="#000" stroke-width="2" />
    <text id="draft-label" x="122" y="74" fill="#000" font-size="16" text-anchor="middle">Draft</text>
  </g>
  <g id="review">
    <rect x="396" y="224" width="180" height="72" fill="#fff" stroke="#000" stroke-width="2" />
    <text id="review-label" x="486" y="266" fill="#000" font-size="16" text-anchor="middle">Review</text>
  </g>
  <polyline id="draft-to-review" points="212,68 304,68 304,260 396,260" fill="none" stroke="#000" stroke-width="2" marker-end="url(#arrow)" />
</svg>
`);

  assert.deepEqual(checkSvgFlowchart(await readFile(svgPath, 'utf8')), []);
});

test('SVG checker rejects curves, non-orthogonal polylines, color, and small text', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'svg-flowchart-invalid-'));
  const svgPath = path.join(root, 'invalid.svg');
  await writeFile(svgPath, `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
  <path id="curve" d="M 0 0 C 20 30 40 30 60 0" stroke="#000" fill="none" />
  <polyline id="diagonal" points="0,0 20,20 20,40" stroke="#000" fill="none" stroke-linecap="round" />
  <text id="small-red-label" x="10" y="20" fill="#f00" font-size="10">Tiny</text>
  <rect id="styled-color" x="80" y="40" width="80" height="40" style="stroke:#0f0;fill:none" />
</svg>
`);

  const findings = checkSvgFlowchart(await readFile(svgPath, 'utf8')).join('\n');
  assert.match(findings, /<path> elements are not allowed/i);
  assert.match(findings, /polyline.+not orthogonal/i);
  assert.match(findings, /rounded connector caps are not allowed/i);
  assert.match(findings, /unsupported color #f00/i);
  assert.match(findings, /unsupported color #0f0/i);
  assert.match(findings, /font-size 10px is below 16px/i);
});

test('SVG checker rejects comments posing as documents, malformed XML, active content, and remote URLs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'svg-flowchart-unsafe-'));
  const cases = [
    {
      name: 'comment-only.svg',
      source: '<!-- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>X</title><desc>X</desc></svg> -->',
      expected: /XML comments are not allowed|root SVG/i,
    },
    {
      name: 'malformed.svg',
      source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>X</title><desc>X</desc><g></svg>',
      expected: /mismatched closing tag|unclosed element/i,
    },
    {
      name: 'event.svg',
      source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" onload="alert(1)"><title>X</title><desc>X</desc></svg>',
      expected: /event-handler attribute onload is not allowed/i,
    },
    {
      name: 'remote-url.svg',
      source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>X</title><desc>X</desc><rect id="node" x="10" y="10" width="80" height="40" fill="#fff" stroke="#000" filter="url(https://example.com/f.svg#x)" /></svg>',
      expected: /external URL reference is not allowed/i,
    },
  ];

  for (const item of cases) {
    const svgPath = path.join(root, item.name);
    await writeFile(svgPath, item.source);
    assert.match(checkSvgFlowchart(await readFile(svgPath, 'utf8')).join('\n'), item.expected, item.name);
  }
});

test('SVG checker enforces stable unique IDs, explicit readable text, and real polyline geometry', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'svg-flowchart-contract-'));
  const svgPath = path.join(root, 'contract.svg');
  await writeFile(svgPath, `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="zero=0 zero=0 width=320 height=180">
  <title>Invalid contract</title>
  <desc>Exercises identity, text, and geometry validation.</desc>
  <rect x="10" y="10" width="100" height="50" fill="#fff" stroke="#000" />
  <text id="duplicate" x="60" y="40" fill="#000" font-size="16"><tspan font-size="4">Tiny override</tspan></text>
  <line id="duplicate" x1="110" y1="35" x2="160" y2="35" stroke="#000" />
  <polyline id="short-polyline" points="x=160,y=35 x=220,y=35" fill="none" stroke="#000" />
</svg>
`);

  const findings = checkSvgFlowchart(await readFile(svgPath, 'utf8')).join('\n');
  assert.match(findings, /viewBox must contain exactly four SVG numbers/i);
  assert.match(findings, /rect.+must have a stable id/i);
  assert.match(findings, /duplicate id duplicate/i);
  assert.match(findings, /tspan.+font-size 4px is below 16px/i);
  assert.match(findings, /polyline.+at least three coordinate pairs/i);
  assert.match(findings, /points contains invalid SVG number syntax/i);
});
