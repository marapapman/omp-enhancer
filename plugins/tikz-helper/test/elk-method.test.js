import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const refsRoot = join(pluginRoot, 'skills', 'tikz-diagram', 'references');

function readRef(name) {
  return readFileSync(join(refsRoot, name), 'utf8');
}

const flowchart = readRef('flowchart-semantics.md');
const opentikz = readRef('opentikz-contract.md');
const render = readRef('render-review.md');
const imagegen = readRef('imagegen-assets.md');
const skill = readFileSync(join(pluginRoot, 'skills', 'tikz-diagram', 'SKILL.md'), 'utf8');
const FORBIDDEN = /block:\s*true|continue:\s*true|retry until|repeat until|must delegate|mandatory fork|hard gate|hard router|completion authority/i;

// Frozen coordinate-free phrases (local://tikz-elk-first-plan.md §2). Each is asserted
// against the single named file it must live in, never a concatenation.

test('flowchart-semantics embeds the ELK-first coordinate-free phrases', () => {
  assert.match(flowchart, /The ELK graph IR is the sole source of node positions and edge geometry\./);
  assert.match(flowchart, /The author never authors, infers, or hand-edits TikZ coordinates\./);
  assert.match(flowchart, /Input nodes must omit x and y and input edges must omit sections and bendPoints; the layout engine computes them\./);
  assert.match(flowchart, /Size each node to fit its exact label plus padding before calling the layout engine\./);
  assert.match(flowchart, /Fix overlap, clipping, or crossings by changing ELK layout options or node sizes and regenerating, never by editing coordinates\./);
  assert.match(flowchart, /Place elk\.algorithm and every authored layout option in the graph-level layoutOptions; the separate tool layoutOptions parameter is not the reliable algorithm channel\./);
  assert.match(flowchart, /Never recommend the fixed or random algorithms for a coordinate-free figure\./);
});

test('opentikz-contract embeds the ELK-first coordinate-free phrases', () => {
  assert.match(opentikz, /The ELK graph IR is the sole source of node positions and edge geometry\./);
  assert.match(opentikz, /The author never authors, infers, or hand-edits TikZ coordinates\./);
  assert.match(opentikz, /Input nodes must omit x and y and input edges must omit sections and bendPoints; the layout engine computes them\./);
  assert.match(opentikz, /OpenTikZ is an icon and semantic reference source only\./);
  assert.match(opentikz, /Template and example figure geometry is discarded, never copied or used to infer coordinates\./);
  assert.match(opentikz, /When catalog search is unavailable or returns no match, describe the figure entirely in an ELK graph IR with plain ELK shapes; coordinates are still never hand-authored\./);
});

test('render-review embeds the regeneration-not-coordinates phrase', () => {
  assert.match(render, /Fix overlap, clipping, or crossings by changing ELK layout options or node sizes and regenerating, never by editing coordinates\./);
});

test('imagegen-assets makes the ELK IR authoritative for geometry', () => {
  assert.match(imagegen, /The ELK graph IR is the sole source of node positions and edge geometry\./);
  assert.match(imagegen, /The author never authors, infers, or hand-edits TikZ coordinates\./);
});

test('opentikz-contract preserves surviving vendor and copy-safety patterns', () => {
  assert.match(opentikz, /vendor.+read-only/is);
  assert.match(opentikz, /copy.+before.+edit/is);
  assert.match(opentikz, /never edit.+vendor/is);
  assert.match(opentikz, /returned `sourcePath`.+never infer.+filename/is);
  assert.match(opentikz, /template.+node IDs.+semantic (?:mapping|spec)/is);
  assert.match(opentikz, /prefer.+vector.+icon/is);
});

test('imagegen-assets preserves surviving authority and ownership patterns', () => {
  assert.match(imagegen, /Main authorizes.+optional external effect.+initial setup.+`task` invokes `generate_image`/is);
  assert.match(imagegen, /`task`.+`tikz_prepare_asset`.+manifest.+`designer`.+next complete source revision.+`task`.+renders/is);
  assert.match(imagegen, /raster.+never.+(?:call|claim|describe).+vector/is);
});

test('no reference uses forbidden enforcement phrasing', () => {
  for (const [name, text] of [
    ['flowchart-semantics.md', flowchart],
    ['opentikz-contract.md', opentikz],
    ['render-review.md', render],
    ['imagegen-assets.md', imagegen],
  ]) {
    assert.doesNotMatch(text, FORBIDDEN, `${name} must not use forbidden enforcement phrasing`);
  }
});

// P3 regression boundary: pin the two "honesty" sentences and the affirmative-guidance
// negative guard. The sentences already exist verbatim in the source; these assertions
// close the reviewer's gap that the exact-phrase and forbidden-affirmative-guidance
// contracts were not previously asserted (local://tikz-elk-first-plan.md §3).

test('flowchart-semantics pins the node-sizing estimate caveat (SIZING-CAVEAT-FLOWCHART)', () => {
  assert.match(
    flowchart,
    /Declared dimensions are estimates — the backend ignores ELK-computed label coordinates and does not emit declared dimensions as TikZ minimum sizes, so size generously and require render review\./,
    'flowchart-semantics.md must pin the SIZING-CAVEAT-FLOWCHART sentence verbatim',
  );
});

test('imagegen-assets pins the geometry-authority sentence (IMAGEGEN-AUTHORITY)', () => {
  assert.ok(
    imagegen.includes('Artwork or content-only post-processing may change node contents (an icon or label text) but never the generated `at (...)` coordinates, edge sections, bend points, or positions.'),
    'imagegen-assets.md must pin the IMAGEGEN-AUTHORITY sentence verbatim',
  );
});

// Affirmative-guidance negative guard: the five rewritten tikz-helper surfaces must not
// contain affirmative hand-layout / coordinate-authoring instructions. Prohibitions
// ("never by editing coordinates", "never hand-edit TikZ coordinates", and the literal
// "`at (...)`" inside a prohibition) MUST NOT trip the guard — the alternation anchors on
// affirmative phrasing only.
const AFFIRMATIVE_HAND_LAYOUT = /aligned rows or columns|lay out the main reading path|place the node|position the nodes?\b|manually (?:plac|position|siz|lay)|hand-place|set the (?:x|y) coordinate|author[^.]*\\node at/i;

test('rewritten tikz-helper surfaces contain no affirmative hand-layout guidance', () => {
  for (const [name, text] of [
    ['flowchart-semantics.md', flowchart],
    ['opentikz-contract.md', opentikz],
    ['render-review.md', render],
    ['imagegen-assets.md', imagegen],
    ['SKILL.md', skill],
  ]) {
    assert.doesNotMatch(text, AFFIRMATIVE_HAND_LAYOUT, `${name} must not contain affirmative hand-layout/coordinate-authoring guidance`);
  }
});