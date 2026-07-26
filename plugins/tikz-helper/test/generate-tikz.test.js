import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { generateTikz } from '../src/generate-tikz.js';
import { LAYOUT_PRESETS } from '../src/layout-presets.js';

const graph = {
  id: 'g',
  children: [
    { id: 'a', width: 60, height: 30, properties: { label: 'A' } },
    { id: 'b', width: 60, height: 30, properties: { label: 'B' } },
  ],
  edges: [{ id: 'e1', sources: ['a'], targets: ['b'] }],
  layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT' },
};

describe('generate-tikz: IR export for visual-editor editing (round-trip)', () => {
  it('returns a file-ready ELK JSON IR', async () => {
    const r = await generateTikz({ graph });
    assert.equal(typeof r.ir, 'string');
    const parsed = JSON.parse(r.ir);
    assert.equal(parsed.id, graph.id);
    assert.ok(Array.isArray(parsed.children));
    assert.ok(
      parsed.children.every(
        (n) => typeof n.x === 'number' && typeof n.y === 'number' && typeof n.width === 'number' && typeof n.height === 'number',
      ),
    );
  });

  it('IR is the positioned graph (round-trippable ELK JSON)', async () => {
    const r = await generateTikz({ graph });
    assert.deepEqual(JSON.parse(r.ir), r.graph);
  });

  it('edited IR fed back regenerates TikZ (round-trip)', async () => {
    const r = await generateTikz({ graph });
    const edited = JSON.parse(r.ir);
    const r2 = await generateTikz({ graph: edited });
    assert.equal(r2.ok, true);
    assert.ok(typeof r2.tikz === 'string' && r2.tikz.includes('tikzpicture'));
    assert.ok(typeof r2.ir === 'string');
  });

  it('preserves layout metadata', async () => {
    const r = await generateTikz({ graph });
    assert.equal(typeof r.metadata.algorithm, 'string');
    assert.ok(r.metadata.nodeCount >= 2);
  });
  it('re-import recomputes node positions via ELK (visual position edits do not persist)', async () => {
    const r = await generateTikz({ graph });
    const edited = JSON.parse(r.ir);
    const nodeA = edited.children.find((n) => n.id === 'a');
    nodeA.x = 9999;
    nodeA.y = 9999;
    const r2 = await generateTikz({ graph: edited });
    const regenA = r2.graph.children.find((n) => n.id === 'a');
    assert.ok(Number.isFinite(regenA.x) && regenA.x !== 9999, 'ELK must recompute x on re-import');
    assert.ok(Number.isFinite(regenA.y) && regenA.y !== 9999, 'ELK must recompute y on re-import');
  });
});


// Fixtures for preset / density / sizing orchestration tests.
function makeNode(id, width = 120, height = 50, label = null) {
  const node = { id, width, height };
  if (label !== null) node.properties = { label };
  return node;
}
function makeEdge(id, source, target) {
  return { id, sources: [source], targets: [target] };
}

// 6-node layered pipeline (two layers) — exercises preset sizing.
function sixNodePipelineGraph() {
  return {
    id: 'pipeline',
    children: [
      makeNode('n1', 120, 50, 'Source'),
      makeNode('n2', 120, 50, 'Fetch'),
      makeNode('n3', 120, 50, 'Parse'),
      makeNode('n4', 120, 50, 'Transform'),
      makeNode('n5', 120, 50, 'Load'),
      makeNode('n6', 120, 50, 'Sink'),
    ],
    edges: [
      makeEdge('e1', 'n1', 'n4'),
      makeEdge('e2', 'n2', 'n4'),
      makeEdge('e3', 'n3', 'n4'),
      makeEdge('e4', 'n4', 'n5'),
      makeEdge('e5', 'n5', 'n6'),
    ],
    layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT' },
  };
}

describe('generate-tikz: preset, density, and sizing orchestration', () => {
  it('preset paper-column produces correct sizing metadata', async () => {
    const r = await generateTikz({ graph: sixNodePipelineGraph(), preset: 'paper-column' });
    const sizing = r.metadata.sizing;
    assert.equal(sizing.targetWidthPt, 240);
    assert.equal(typeof sizing.intrinsicWidthPt, 'number');
    assert.ok(sizing.intrinsicWidthPt > 0, 'intrinsic width must be positive');

    // Scale is either snapped to 1 or ≈ 240 / intrinsicWidthPt within 0.001.
    const expected = 240 / sizing.intrinsicWidthPt;
    assert.ok(
      sizing.scale === 1 || Math.abs(sizing.scale - expected) < 0.001,
      `scale ${sizing.scale} not close to ${expected} nor snapped to 1`,
    );

    // tikz contains transform shape (unless snapped to 1) and the every-node font directive.
    assert.ok(
      sizing.scale === 1 || r.tikz.includes('transform shape'),
      'transform shape must appear when scale is not snapped to 1',
    );
    assert.ok(
      r.tikz.includes('font=\\fontsize{9}{11}\\selectfont'),
      'every-node style must carry the paper-column font directive',
    );
    // Embedding hint for paper-column references \columnwidth (from LAYOUT_PRESETS).
    assert.ok(
      LAYOUT_PRESETS['paper-column'].embedding.includes('\\columnwidth'),
      'embedding hint must reference \\columnwidth',
    );
  });

  it('determinism: same input twice yields byte-identical tikz', async () => {
    const graph = sixNodePipelineGraph();
    const r1 = await generateTikz({ graph, preset: 'paper-column' });
    const r2 = await generateTikz({ graph, preset: 'paper-column' });
    assert.equal(r1.tikz, r2.tikz);
  });

  it('dense fixture triggers an expand relayout', async () => {
    // 12 nodes forced to 1000x1000 via a matching nodeSize.minimum override;
    // the default (80,40) floor would keep the fill ratio near 0.31 and never
    // trip the expand threshold, so we raise the minimum to the node size.
    const ids = Array.from({ length: 12 }, (_, i) => `d${i + 1}`);
    const graph = {
      id: 'dense-chain',
      children: ids.map((id) => makeNode(id, 1000, 1000)),
      edges: ids.slice(1).map((id, i) => makeEdge(`e${i}`, ids[i], id)),
      layoutOptions: { 'elk.nodeSize.minimum': '(1000, 1000)' },
    };
    const r = await generateTikz({ graph });
    const density = r.metadata.density;
    assert.ok(density.relayouts >= 1, 'expected at least one relayout for a dense graph');
    assert.equal(density.adjustments[0], 'expand', 'first adjustment must be expand');
  });

  it('sparse fixture triggers a compact relayout', async () => {
    // 4 nodes (>= MIN_COMPACT_NODE_COUNT) kept at the default (80,40) floor but
    // spread over a huge root via large spacing, so the fill ratio drops below
    // FILL_RATIO_COMPACT_BELOW (0.15) and the compact guard fires.
    const ids = ['s1', 's2', 's3', 's4'];
    const graph = {
      id: 'sparse-chain',
      children: ids.map((id) => makeNode(id, 80, 40)),
      edges: [
        makeEdge('e1', 's1', 's2'),
        makeEdge('e2', 's2', 's3'),
        makeEdge('e3', 's3', 's4'),
      ],
      layoutOptions: {
        'elk.direction': 'DOWN',
        'elk.spacing.nodeNode': 500,
        'elk.layered.spacing.nodeNodeBetweenLayers': 500,
      },
    };
    const r = await generateTikz({ graph });
    const density = r.metadata.density;
    assert.ok(
      density.adjustments.includes('compact'),
      `adjustments ${JSON.stringify(density.adjustments)} must include compact`,
    );
  });

  it('unknown preset rejects with INVALID_PRESET', async () => {
    await assert.rejects(
      () => generateTikz({ graph: sixNodePipelineGraph(), preset: 'poster' }),
      (error) => error.code === 'INVALID_PRESET',
    );
  });
});

describe('generate-tikz: node icon assets', () => {
  it('properties.icon.kind=includegraphics emits \\includegraphics in the TikZ output', async () => {
    const iconGraph = {
      id: 'icon-root',
      children: [
        {
          id: 'icon-node',
          width: 60,
          height: 60,
          properties: {
            icon: {
              kind: 'includegraphics',
              relativePath: 'figures/tikz/assets/abc.png',
              width: '1.2cm',
            },
          },
        },
      ],
      edges: [],
      layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT' },
    };
    const r = await generateTikz({ graph: iconGraph });
    assert.equal(r.ok, true);
    assert.match(
      r.tikz,
      /\\includegraphics\[width=1\.2cm,keepaspectratio\]\{figures\/tikz\/assets\/abc\.png\}/,
      'TikZ output must contain the \\includegraphics icon command',
    );
    // The node is emitted with the icon as its content rather than the id label.
    assert.doesNotMatch(r.tikz, /\(icon-node\)\s+at\s+\([^)]+\)\s+\{icon-node\}/,
      'icon node must not fall back to the id-as-label body');
  });

  it('properties.icon with a forbidden geometry field throws TikzRuntimeError', async () => {
    const badGraph = {
      id: 'icon-bad-root',
      children: [
        {
          id: 'bad-icon-node',
          width: 60,
          height: 60,
          properties: {
            icon: {
              kind: 'includegraphics',
              relativePath: 'figures/tikz/assets/abc.png',
              width: '1.2cm',
              x: 10,
            },
          },
        },
      ],
      edges: [],
      layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT' },
    };
    await assert.rejects(
      () => generateTikz({ graph: badGraph }),
      (error) => error.code === 'INVALID_ICON_SPEC' && /x/.test(error.message),
      'geometry field in properties.icon must raise INVALID_ICON_SPEC',
    );
  });

  it('metadata.assets collects icon assets from the positioned IR', async () => {
    const iconGraph = {
      id: 'icon-assets-root',
      children: [
        {
          id: 'icon-a',
          width: 60,
          height: 60,
          properties: {
            icon: { kind: 'includegraphics', relativePath: 'figures/tikz/assets/a.png', width: '1cm' },
          },
        },
        {
          id: 'icon-b',
          width: 60,
          height: 60,
          properties: {
            icon: { kind: 'includegraphics', relativePath: 'figures/tikz/assets/a.png', width: '1cm' },
          },
        },
      ],
      edges: [],
      layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT' },
    };
    const r = await generateTikz({ graph: iconGraph });
    assert.ok(Array.isArray(r.metadata.assets), 'metadata.assets must be an array');
    assert.equal(r.metadata.assets.length, 1, 'two nodes sharing one relativePath collapse to a single asset entry');
    assert.equal(r.metadata.assets[0].relativePath, 'figures/tikz/assets/a.png');
    assert.equal(r.metadata.assets[0].kind, 'includegraphics');
    assert.deepEqual(r.metadata.assets[0].nodeIds.sort(), ['icon-a', 'icon-b']);
  });

  it('properties.icon.kind=tex emits \\input{...} in the TikZ output', async () => {
    const texGraph = {
      id: 'tex-icon-root',
      children: [
        {
          id: 'tex-node',
          width: 60,
          height: 60,
          properties: {
            icon: {
              kind: 'tex',
              relativePath: 'figures/tikz/assets/some-icon.tex',
            },
          },
        },
      ],
      edges: [],
      layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT' },
    };
    const r = await generateTikz({ graph: texGraph });
    assert.equal(r.ok, true);
    assert.match(
      r.tikz,
      /\\input\{figures\/tikz\/assets\/some-icon\.tex\}/,
      'TikZ output must contain the \\input icon command for kind=tex',
    );
    assert.doesNotMatch(r.tikz, /\(tex-node\)\s+at\s+\([^)]+\)\s+\{tex-node\}/,
      'tex icon node must not fall back to the id-as-label body');
  });

  it('properties.icon.kind=unknown (unrecognized) throws TikzRuntimeError', async () => {
    const unknownGraph = {
      id: 'unknown-icon-root',
      children: [
        {
          id: 'unknown-node',
          width: 60,
          height: 60,
          properties: {
            icon: {
              kind: 'unknown',
              relativePath: 'figures/tikz/assets/x.png',
            },
          },
        },
      ],
      edges: [],
      layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': 'RIGHT' },
    };
    await assert.rejects(
      () => generateTikz({ graph: unknownGraph }),
      (error) => error.code === 'INVALID_ICON_SPEC' && /unknown/.test(error.message),
      'an unrecognized properties.icon.kind must raise INVALID_ICON_SPEC',
    );
  });
});