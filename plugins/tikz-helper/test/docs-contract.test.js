import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const designDocPath = resolve(pluginRoot, '../../docs/TIKZ_PLUGIN.md');
const designDoc = readFileSync(designDocPath, 'utf8');
const readme = readFileSync(join(pluginRoot, 'README.md'), 'utf8');

// Frozen ELK-first phrases (local://tikz-elk-first-plan.md §2). Each phrase is
// asserted against the single named file it must live in, never a concatenation.

const P1 = 'The ELK graph IR is the sole source of node positions and edge geometry.';
const P4 = 'OpenTikZ is an icon and semantic reference source only.';
const P12 = 'Author the semantic graph as an ELK IR and call tikz_generate_diagram to compute the layout with ELK.';

function assertElkFirst(name, text) {
  test(`${name} embeds the frozen ELK-first phrases`, () => {
    assert.ok(text.includes(P1), `${name} must contain P1 verbatim`);
    assert.ok(text.includes(P4), `${name} must contain P4 verbatim`);
    assert.ok(text.includes(P12), `${name} must contain P12 verbatim`);
  });

  test(`${name} names tikz_generate_diagram as the ELK layout tool`, () => {
    assert.match(
      text,
      /tikz_generate_diagram[^\n]*computes?[^\n]*(layout|node positions|edge geometry)[^\n]*ELK/is,
      `${name} must name tikz_generate_diagram as the tool that computes layout via ELK from an ELK graph IR`,
    );
  });

  test(`${name} describes OpenTikZ as an icon and semantic reference source`, () => {
    assert.match(
      text,
      /OpenTikZ[^\n]*(icon|semantic) reference[^\n]*(source|only)/is,
      `${name} must describe OpenTikZ as an icon and semantic reference source, not the figure-geometry source`,
    );
  });

  test(`${name} does not give affirmative coordinate-authoring or template-as-geometry instructions`, () => {
    assert.doesNotMatch(
      text,
      /copy the (?:selected )?(?:OpenTikZ )?template[^.]*coordinates/is,
      `${name} must not instruct copying template coordinates`,
    );
    assert.doesNotMatch(
      text,
      /author[^\n]*\\node at[^\n]*coordinates/is,
      `${name} must not instruct authoring \\\\node at coordinates`,
    );
  });
}

assertElkFirst('docs/TIKZ_PLUGIN.md', designDoc);
assertElkFirst('README.md', readme);

test('docs/TIKZ_PLUGIN.md preserves the non-simple visual ownership paragraph', () => {
  assert.match(
    designDoc,
    /non-simple visual workflows.+`designer`.+complete design.+`visioner`.+fresh current-revision render/is,
  );
});

test('docs/TIKZ_PLUGIN.md preserves the designer/visioner-unavailable evidence-gap paragraph', () => {
  assert.match(
    designDoc,
    /designer (?:is )?unavailable.+unfulfilled checkpoint.+Agent-availability fallback.+visioner (?:is )?unavailable.+missing independent current-revision visual evidence/is,
  );
});