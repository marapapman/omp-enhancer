import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { elkToTikz } from '../src/tikz-backend.js';

const SIMPLE_LAYOUT = {
  id: 'root',
  children: [
    { id: 'client', x: 20, y: 40, width: 60, height: 30, labels: [{ text: 'Client' }] },
    { id: 'server', x: 20, y: 120, width: 60, height: 30, labels: [{ text: 'Server' }] },
  ],
  edges: [
    {
      id: 'e1',
      sources: ['client'],
      targets: ['server'],
      sections: [{ startPoint: { x: 50, y: 70 }, endPoint: { x: 50, y: 120 } }],
    },
  ],
};

describe('tikz-backend: validation', () => {
  it('rejects null input', () => {
    assert.throws(
      () => elkToTikz(null),
      (error) => error.code === 'TIKZ_GENERATION_ERROR',
    );
  });

  it('rejects input without children', () => {
    assert.throws(
      () => elkToTikz({}),
      (error) => error.code === 'TIKZ_GENERATION_ERROR' && error.message.includes('children'),
    );
  });
});

describe('tikz-backend: basic node and edge output', () => {
  it('generates a tikzpicture environment', () => {
    const tikz = elkToTikz(SIMPLE_LAYOUT);
    assert.match(tikz, /\\begin\{tikzpicture\}/);
    assert.match(tikz, /\\end\{tikzpicture\}/);
  });

  it('includes node at absolute positions with Y flipped', () => {
    // anchor=north west aligns ELK top-left coordinates with TikZ placement
    const tikz = elkToTikz(SIMPLE_LAYOUT);
    // client at (20,40), Y flipped = (20pt, -40pt)
    assert.match(tikz, /\(client\)\s+at\s+\(20pt,\s*-40pt\)/);
    // server at (20,120), Y flipped = (20pt, -120pt)
    assert.match(tikz, /\(server\)\s+at\s+\(20pt,\s*-120pt\)/);
  });

  it('draws edges with bend points', () => {
    const tikz = elkToTikz(SIMPLE_LAYOUT);
    assert.match(tikz, /\\draw\[->\]\s+\(client\)\s+--\s+\(50pt,\s*-70pt\)\s+--\s+\(50pt,\s*-120pt\)\s+--\s+\(server\)/);
  });

  it('draws simple edges without sections as straight lines', () => {
    const layout = {
      id: 'root',
      children: [
        { id: 'a', x: 0, y: 0, width: 20, height: 20 },
        { id: 'b', x: 100, y: 0, width: 20, height: 20 },
      ],
      edges: [{ id: 'e1', sources: ['a'], targets: ['b'] }],
    };
    const tikz = elkToTikz(layout);
    assert.match(tikz, /\(a\)\s+--\s+\(b\)/);
  });
});

describe('tikz-backend: node shapes and styles', () => {
  it('maps shape property to TikZ style', () => {
    const layout = {
      id: 'root',
      children: [
        { id: 'n1', x: 10, y: 10, width: 40, height: 20, properties: { shape: 'diamond', fill: '#ff0000' } },
        { id: 'n2', x: 10, y: 50, width: 40, height: 20, properties: { shape: 'ellipse', dashed: true } },
        { id: 'n3', x: 10, y: 90, width: 40, height: 20, properties: { shape: 'terminal', draw: 'blue' } },
      ],
    };
    const tikz = elkToTikz(layout);
    // Diamond with fill
    assert.match(tikz, /diamond/);
    assert.match(tikz, /fill=\{rgb,255:red,255;green,0;blue,0\}/);
    // Ellipse with dashed
    assert.match(tikz, /ellipse/);
    assert.match(tikz, /dashed/);
    // Terminal (rounded rect)
    assert.match(tikz, /rounded corners=3pt/);
  });

  it('defaults to rectangle shape', () => {
    const layout = {
      id: 'root',
      children: [
        { id: 'n1', x: 0, y: 0, width: 40, height: 20 },
      ],
    };
    const tikz = elkToTikz(layout);
    assert.match(tikz, /draw/);
    // rectangle is implicit in TikZ, so just check draw exists
  });
});

describe('tikz-backend: standalone mode', () => {
  it('produces full standalone document by default', () => {
    const tikz = elkToTikz(SIMPLE_LAYOUT);
    assert.match(tikz, /\\documentclass\[tikz\]\{standalone\}/);
    assert.match(tikz, /\\begin\{document\}/);
    assert.match(tikz, /\\end\{document\}/);
    assert.match(tikz, /\\usepackage\{tikz\}/);
  });

  it('omits preamble when standalone is false', () => {
    const tikz = elkToTikz(SIMPLE_LAYOUT, { standalone: false });
    assert.doesNotMatch(tikz, /\\documentclass/);
    assert.doesNotMatch(tikz, /\\begin\{document\}/);
    assert.match(tikz, /\\begin\{tikzpicture\}/);
    assert.match(tikz, /\\end\{tikzpicture\}/);
  });
});

describe('tikz-backend: Y axis flip', () => {
  it('respects yAxisFlip option', () => {
    const layout = {
      id: 'root',
      children: [
        { id: 'n1', x: 10, y: 50, width: 30, height: 20 },
      ],
    };

    const flipped = elkToTikz(layout, { yAxisFlip: true });
    assert.match(flipped, /\(10pt,\s*-50pt\)/);

    const noFlip = elkToTikz(layout, { yAxisFlip: false });
    assert.match(noFlip, /\(10pt,\s*50pt\)/);
  });
});

describe('tikz-backend: edge labels and styles', () => {
  it('includes edge label text', () => {
    const layout = {
      id: 'root',
      children: [
        { id: 'a', x: 0, y: 0, width: 20, height: 20 },
        { id: 'b', x: 100, y: 0, width: 20, height: 20 },
      ],
      edges: [{
        id: 'e1', sources: ['a'], targets: ['b'],
        properties: { label: 'HTTP', arrow: '<->', color: 'red' },
      }],
    };
    const tikz = elkToTikz(layout);
    assert.match(tikz, /\{HTTP\}/);
    assert.match(tikz, /<->/);
  });
});

describe('tikz-backend: groups with nested children', () => {
  it('generates fit node for groups', () => {
    const layout = {
      id: 'root',
      children: [{
        id: 'group1', x: 0, y: 0, width: 200, height: 100,
        labels: [{ text: 'AWS' }],
        children: [
          { id: 'svc1', x: 10, y: 10, width: 50, height: 30, labels: [{ text: 'Service A' }] },
          { id: 'svc2', x: 100, y: 10, width: 50, height: 30, labels: [{ text: 'Service B' }] },
        ],
      }],
    };
    const tikz = elkToTikz(layout);
    // Should use fit library
    assert.match(tikz, /\\usetikzlibrary.*fit/);
    assert.match(tikz, /fit=\{\s*\(group1\)\s*\(svc1\)\s*\(svc2\)\s*\}/);  // includes group label + children
    // Should use backgrounds
    assert.match(tikz, /background layer/);
  });
});

describe('tikz-backend: custom TikZ libraries', () => {
  it('includes extra libraries from options', () => {
    const tikz = elkToTikz(SIMPLE_LAYOUT, { tikzLibraries: ['arrows', 'decorations.pathmorphing'] });
    assert.match(tikz, /\\usetikzlibrary\{arrows\.meta\}/);
    assert.match(tikz, /\\usetikzlibrary\{arrows\}/);
    assert.match(tikz, /\\usetikzlibrary\{decorations\.pathmorphing\}/);
  });
});

describe('tikz-backend: defaultArrow option', () => {
  it('uses defaultArrow when edge has no arrow property', () => {
    const layout = {
      id: 'root',
      children: [
        { id: 'a', x: 0, y: 0, width: 20, height: 20 },
        { id: 'b', x: 100, y: 0, width: 20, height: 20 },
      ],
      edges: [{ id: 'e1', sources: ['a'], targets: ['b'] }],
    };
    const tikz = elkToTikz(layout, { defaultArrow: '<-' });
    assert.match(tikz, /\[<-\]/);
  });
});
