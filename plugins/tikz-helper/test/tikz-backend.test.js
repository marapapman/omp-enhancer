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
  it('rejects nodes missing position coordinates after layout', () => {
    const graph = {
      id: 'no-pos',
      children: [
        { id: 'A', width: 80, height: 40 },  // missing x, y
      ],
    };
    assert.throws(
      () => elkToTikz(graph),
      (error) => error.code === 'INVALID_GRAPH_IR',
      'must reject nodes without x/y after layout',
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

describe('tikz-backend: scale and baseFontSize options', () => {
  const SCALE_LAYOUT = {
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

  it('default output is unchanged when scale and baseFontSize are absent', () => {
    const tikz = elkToTikz(SCALE_LAYOUT);
    assert.match(tikz, /\\begin\{tikzpicture\}\[node distance=0pt, anchor=north west, every node\/\.style=\{inner sep=2pt, outer sep=0pt\}\]/);
    assert.doesNotMatch(tikz, /scale=/);
    assert.doesNotMatch(tikz, /font=\\fontsize/);
  });

  it('scale=1 emits no scale= in output', () => {
    const tikz = elkToTikz(SCALE_LAYOUT, { scale: 1 });
    assert.doesNotMatch(tikz, /scale=/);
    assert.doesNotMatch(tikz, /transform shape/);
  });

  it('scale=0.5, baseFontSize=20 emits scale, transform shape, and every-node font directive', () => {
    const tikz = elkToTikz(SCALE_LAYOUT, { scale: 0.5, baseFontSize: 20 });
    assert.match(tikz, /scale=0\.5, transform shape/);
    assert.match(tikz, /every node\/\.style=\{inner sep=2pt, outer sep=0pt, font=\\fontsize\{20\}\{24\}\\selectfont\}/);
  });

  it('scale=0.5 with baseFontSize=null emits scale= but no every-node font directive', () => {
    const tikz = elkToTikz(SCALE_LAYOUT, { scale: 0.5, baseFontSize: null });
    assert.match(tikz, /scale=0\.5, transform shape/);
    assert.doesNotMatch(tikz, /font=\\fontsize/);
  });

  it('non-finite scale (NaN) is ignored and treated as default', () => {
    const tikz = elkToTikz(SCALE_LAYOUT, { scale: NaN, baseFontSize: 20 });
    assert.doesNotMatch(tikz, /scale=/);
    assert.doesNotMatch(tikz, /transform shape/);
    // baseFontSize is still finite and positive, so font directive still emits
    assert.match(tikz, /font=\\fontsize\{20\}\{24\}\\selectfont/);
  });

  it('non-finite scale (Infinity) is ignored and treated as default', () => {
    const tikz = elkToTikz(SCALE_LAYOUT, { scale: Infinity });
    assert.doesNotMatch(tikz, /scale=/);
    assert.doesNotMatch(tikz, /transform shape/);
  });

  it('non-finite baseFontSize (NaN) is ignored', () => {
    const tikz = elkToTikz(SCALE_LAYOUT, { baseFontSize: NaN });
    assert.doesNotMatch(tikz, /font=\\fontsize/);
  });

  it('non-finite baseFontSize (Infinity) is ignored', () => {
    const tikz = elkToTikz(SCALE_LAYOUT, { baseFontSize: Infinity });
    assert.doesNotMatch(tikz, /font=\\fontsize/);
  });

  it('non-positive baseFontSize (0) is ignored', () => {
    const tikz = elkToTikz(SCALE_LAYOUT, { baseFontSize: 0 });
    assert.doesNotMatch(tikz, /font=\\fontsize/);
  });

  it('per-node fontSize keeps precedence over every-node baseFontSize', () => {
    const layout = {
      id: 'root',
      children: [
        { id: 'n1', x: 10, y: 10, width: 60, height: 30, properties: { fontSize: 12 }, labels: [{ text: 'A' }] },
      ],
    };
    const tikz = elkToTikz(layout, { scale: 0.5, baseFontSize: 20 });
    // every-node style carries the base font
    assert.match(tikz, /every node\/\.style=\{inner sep=2pt, outer sep=0pt, font=\\fontsize\{20\}\{24\}\\selectfont\}/);
    // per-node font directive is also present (keeps precedence in TikZ)
    assert.match(tikz, /font=\\fontsize\{12\}\{14\}\\selectfont/);
  });

  it('coordinates and Y-flip are untouched when scale is applied', () => {
    const tikz = elkToTikz(SCALE_LAYOUT, { scale: 0.5 });
    // client at (20,40), Y flipped = (20pt, -40pt) — coordinates not scaled by backend
    assert.match(tikz, /\(client\)\s+at\s+\(20pt,\s*-40pt\)/);
    assert.match(tikz, /\(server\)\s+at\s+\(20pt,\s*-120pt\)/);
    // edge geometry untouched
    assert.match(tikz, /\\draw\[->\]\s+\(client\)\s+--\s+\(50pt,\s*-70pt\)\s+--\s+\(50pt,\s*-120pt\)\s+--\s+\(server\)/);
  });
});

describe('tikz-backend: edge label font helper', () => {
  const LABEL_LAYOUT = {
    id: 'root',
    children: [
      { id: 'a', x: 0, y: 0, width: 20, height: 20 },
      { id: 'b', x: 100, y: 0, width: 20, height: 20 },
    ],
    edges: [{
      id: 'e1', sources: ['a'], targets: ['b'],
      properties: { label: 'HTTP' },
    }],
  };

  it('edge labels use font=\\small when baseFontSize is absent', () => {
    const tikz = elkToTikz(LABEL_LAYOUT);
    assert.match(tikz, /font=\\small\] \{HTTP\}/);
  });

  it('edge labels use font=\\small when baseFontSize is null', () => {
    const tikz = elkToTikz(LABEL_LAYOUT, { baseFontSize: null });
    assert.match(tikz, /font=\\small\] \{HTTP\}/);
  });

  it('edge labels use fontsize directive 1pt smaller than baseFontSize', () => {
    const tikz = elkToTikz(LABEL_LAYOUT, { baseFontSize: 10 });
    // 10 - 1 = 9, 9*1.2 = 10.8 -> round = 11
    assert.match(tikz, /font=\\fontsize\{9\}\{11\}\\selectfont\] \{HTTP\}/);
  });

  it('edge labels floor at 5pt when baseFontSize is small', () => {
    const tikz = elkToTikz(LABEL_LAYOUT, { baseFontSize: 4 });
    // max(4-1, 5) = 5, 5*1.2 = 6
    assert.match(tikz, /font=\\fontsize\{5\}\{6\}\\selectfont\] \{HTTP\}/);
  });

  it('edge labels use \\small when baseFontSize is non-finite', () => {
    const tikz = elkToTikz(LABEL_LAYOUT, { baseFontSize: NaN });
    assert.match(tikz, /font=\\small\] \{HTTP\}/);
    const tikz2 = elkToTikz(LABEL_LAYOUT, { baseFontSize: Infinity });
    assert.match(tikz2, /font=\\small\] \{HTTP\}/);
  });

  it('edge labels use \\small when baseFontSize is non-positive', () => {
    const tikz = elkToTikz(LABEL_LAYOUT, { baseFontSize: 0 });
    assert.match(tikz, /font=\\small\] \{HTTP\}/);
  });

  it('edge labels use fontsize directive in edges with bend points', () => {
    const layout = {
      id: 'root',
      children: [
        { id: 'a', x: 0, y: 0, width: 20, height: 20 },
        { id: 'b', x: 100, y: 0, width: 20, height: 20 },
      ],
      edges: [{
        id: 'e1', sources: ['a'], targets: ['b'],
        sections: [{ startPoint: { x: 20, y: 10 }, bendPoints: [{ x: 50, y: 30 }], endPoint: { x: 100, y: 10 } }],
        properties: { label: 'X' },
      }],
    };
    const tikz = elkToTikz(layout, { baseFontSize: 12 });
    // 12 - 1 = 11, 11*1.2 = 13.2 -> round = 13
    assert.match(tikz, /font=\\fontsize\{11\}\{13\}\\selectfont\] \{X\}/);
  });
});

describe('tikz-backend: minimum sizes from ELK dimensions', () => {
  it('emits minimum width and height from node dimensions', () => {
    const layout = {
      id: 'root',
      children: [
        { id: 'n1', x: 0, y: 0, width: 100, height: 50, labels: [{ text: 'A' }] },
      ],
    };
    const tikz = elkToTikz(layout);
    assert.match(tikz, /minimum width=100pt/);
    assert.match(tikz, /minimum height=50pt/);
  });

  it('does not emit minimum width when width is 0', () => {
    const layout = {
      id: 'root',
      children: [
        { id: 'n1', x: 0, y: 0, width: 0, height: 50, labels: [{ text: 'A' }] },
      ],
    };
    const tikz = elkToTikz(layout);
    assert.doesNotMatch(tikz, /minimum width/);
    assert.match(tikz, /minimum height=50pt/);
  });

  it('does not emit minimum height when height is 0', () => {
    const layout = {
      id: 'root',
      children: [
        { id: 'n1', x: 0, y: 0, width: 100, height: 0, labels: [{ text: 'A' }] },
      ],
    };
    const tikz = elkToTikz(layout);
    assert.match(tikz, /minimum width=100pt/);
    assert.doesNotMatch(tikz, /minimum height/);
  });

  it('emits minimum sizes alongside shape and fill', () => {
    const layout = {
      id: 'root',
      children: [
        { id: 'n1', x: 0, y: 0, width: 80, height: 40, properties: { shape: 'diamond', fill: '#ff0000' }, labels: [{ text: 'D' }] },
      ],
    };
    const tikz = elkToTikz(layout);
    assert.match(tikz, /diamond.*minimum width=80pt.*minimum height=40pt/);
  });

  it('emits inner sep=2pt in every-node style', () => {
    const layout = {
      id: 'root',
      children: [
        { id: 'n1', x: 0, y: 0, width: 100, height: 50, labels: [{ text: 'A' }] },
      ],
    };
    const tikz = elkToTikz(layout);
    assert.match(tikz, /every node\/\.style=\{inner sep=2pt, outer sep=0pt\}/);
  });
});
