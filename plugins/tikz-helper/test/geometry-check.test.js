import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  detectGeometryIssues,
  collectLeafNodes,
  collectEdges,
  overlapArea,
} from '../src/geometry-check.js';

// ---------------------------------------------------------------------------
// Helpers to build positioned ELK-like graph fixtures.
// ELK positioned graph shape:
//   root: { id, width, height, children: [...], edges: [...] }
//   node: { id, x, y, width, height, labels?:[{text}], properties?:{label}, children?:[] }
//   edge: { id, sources: [id], targets: [id], sections: [{startPoint, bendPoints, endPoint}] }
//   point: { x, y }
// Groups are nodes with `children`; leaf nodes have no `children` (or empty).
// Child coordinates are relative to the parent group.
// ---------------------------------------------------------------------------

function leaf(id, x, y, w, h, label) {
  const n = { id, x, y, width: w, height: h };
  if (label !== undefined) n.labels = [{ text: label }];
  return n;
}

function edge(id, source, target, sections) {
  return { id, sources: [source], targets: [target], sections: sections ?? [] };
}

function seg(x1, y1, x2, y2, bends) {
  const s = { startPoint: { x: x1, y: y1 }, endPoint: { x: x2, y: y2 } };
  if (bends) s.bendPoints = bends;
  return s;
}

describe('geometry-check: return shape and freezing', () => {
  it('returns a frozen { issues, summary } object', () => {
    const root = { id: 'r', width: 200, height: 200, children: [], edges: [] };
    const result = detectGeometryIssues(root);
    assert.ok(Object.isFrozen(result), 'result must be frozen');
    assert.ok(Array.isArray(result.issues));
    assert.ok(Object.isFrozen(result.issues), 'issues array must be frozen');
    assert.ok(result.summary && typeof result.summary === 'object');
    assert.ok(Object.isFrozen(result.summary), 'summary must be frozen');
  });

  it('handles an empty graph (no children, no edges)', () => {
    const root = { id: 'r', width: 100, height: 100, children: [], edges: [] };
    const result = detectGeometryIssues(root);
    assert.deepEqual(result.issues, []);
    assert.equal(result.summary.totalEdgeCrossings, 0);
    assert.equal(result.summary.totalBends, 0);
    assert.equal(result.summary.avgBendsPerEdge, 0);
  });
});

describe('geometry-check: collectLeafNodes', () => {
  it('flattens leaf nodes and excludes groups', () => {
    const root = {
      id: 'r',
      width: 400, height: 400,
      children: [
        leaf('a', 0, 0, 50, 30, 'A'),
        {
          id: 'group1', x: 100, y: 100, width: 200, height: 200,
          children: [
            leaf('b', 10, 10, 40, 30, 'B'),
            leaf('c', 100, 10, 40, 30, 'C'),
          ],
        },
      ],
      edges: [],
    };
    const leaves = collectLeafNodes(root);
    assert.equal(leaves.length, 3, 'three leaf nodes (group excluded)');
    const ids = leaves.map((n) => n.id).sort();
    assert.deepEqual(ids, ['a', 'b', 'c']);
  });

  it('records parentId for nested leaves', () => {
    const root = {
      id: 'r', width: 400, height: 400,
      children: [
        {
          id: 'grp', x: 0, y: 0, width: 200, height: 200,
          children: [leaf('inner', 10, 10, 40, 30)],
        },
      ],
      edges: [],
    };
    const leaves = collectLeafNodes(root);
    assert.equal(leaves.length, 1);
    assert.equal(leaves[0].id, 'inner');
    assert.equal(leaves[0].parentId, 'grp');
  });
});

describe('geometry-check: collectEdges', () => {
  it('collects root-level and nested group edges', () => {
    const root = {
      id: 'r', width: 400, height: 400,
      children: [
        leaf('a', 0, 0, 50, 30),
        {
          id: 'grp', x: 100, y: 100, width: 200, height: 200,
          children: [leaf('b', 10, 10, 40, 30)],
          edges: [edge('e2', 'b', 'b', [seg(20, 20, 60, 60)])],
        },
      ],
      edges: [edge('e1', 'a', 'b', [seg(50, 15, 110, 125)])],
    };
    const edges = collectEdges(root);
    assert.equal(edges.length, 2);
    const ids = edges.map((e) => e.id).sort();
    assert.deepEqual(ids, ['e1', 'e2']);
    assert.equal(edges[0].sourceId, 'a');
    assert.equal(edges[0].targetId, 'b');
  });

  it('applies group coordinate offset to edge section points', () => {
    // Group at (100,100) containing an edge whose section points are
    // parent-relative. After offset, points must be root-absolute.
    const root = {
      id: 'root', width: 500, height: 500,
      children: [{
        id: 'group', x: 100, y: 100, width: 300, height: 300,
        children: [{ id: 'leaf', x: 10, y: 10, width: 50, height: 30 }],
        edges: [{
          id: 'e1',
          sources: ['leaf'], targets: ['other'],
          sections: [{
            id: 's1',
            startPoint: { x: 60, y: 25 },
            endPoint: { x: 200, y: 150 },
            bendPoints: [{ x: 100, y: 80 }],
          }],
        }],
      }],
    };
    const edges = collectEdges(root);
    assert.equal(edges.length, 1);
    const sec = edges[0].sections[0];
    assert.equal(sec.startPoint.x, 160, 'startPoint.x offset by group.x=100');
    assert.equal(sec.startPoint.y, 125, 'startPoint.y offset by group.y=100');
    assert.equal(sec.endPoint.x, 300, 'endPoint.x offset by group.x=100');
    assert.equal(sec.endPoint.y, 250, 'endPoint.y offset by group.y=100');
    assert.equal(sec.bendPoints[0].x, 200, 'bendPoint.x offset');
    assert.equal(sec.bendPoints[0].y, 180, 'bendPoint.y offset');
  });

  it('leaves root-level edge coordinates unaffected (offset 0)', () => {
    const root = {
      id: 'r', width: 400, height: 400,
      children: [leaf('a', 0, 0, 50, 30), leaf('b', 200, 0, 50, 30)],
      edges: [edge('e1', 'a', 'b', [seg(50, 15, 200, 15)])],
    };
    const edges = collectEdges(root);
    assert.equal(edges.length, 1);
    const sec = edges[0].sections[0];
    assert.equal(sec.startPoint.x, 50, 'root edge startPoint unchanged');
    assert.equal(sec.startPoint.y, 15);
    assert.equal(sec.endPoint.x, 200, 'root edge endPoint unchanged');
    assert.equal(sec.endPoint.y, 15);
  });

  it('accumulates nested group offsets (depth 2) into edge coordinates', () => {
    // outer at (10,10), inner at (20,20), edge points (5,5)->(30,30)
    // → global (35,35) -> (60,60).
    const root = {
      id: 'r', width: 400, height: 400,
      children: [{
        id: 'outer', x: 10, y: 10, width: 300, height: 300,
        children: [{
          id: 'inner', x: 20, y: 20, width: 200, height: 200,
          children: [leaf('deep', 5, 5, 30, 30)],
          edges: [edge('e1', 'deep', 'deep', [seg(5, 5, 30, 30)])],
        }],
      }],
    };
    const edges = collectEdges(root);
    assert.equal(edges.length, 1);
    const sec = edges[0].sections[0];
    assert.equal(sec.startPoint.x, 35, '10+20+5 = 35');
    assert.equal(sec.startPoint.y, 35, '10+20+5 = 35');
    assert.equal(sec.endPoint.x, 60, '10+20+30 = 60');
    assert.equal(sec.endPoint.y, 60, '10+20+30 = 60');
  });

  it('does not mutate original edge section objects', () => {
    const originalSection = {
      id: 's1',
      startPoint: { x: 60, y: 25 },
      endPoint: { x: 200, y: 150 },
      bendPoints: [{ x: 100, y: 80 }],
    };
    const root = {
      id: 'root', width: 500, height: 500,
      children: [{
        id: 'group', x: 100, y: 100, width: 300, height: 300,
        children: [],
        edges: [{ id: 'e1', sources: ['a'], targets: ['b'], sections: [originalSection] }],
      }],
    };
    collectEdges(root);
    assert.equal(originalSection.startPoint.x, 60, 'original startPoint untouched');
    assert.equal(originalSection.startPoint.y, 25);
    assert.equal(originalSection.endPoint.x, 200);
    assert.equal(originalSection.endPoint.y, 150);
    assert.equal(originalSection.bendPoints[0].x, 100, 'original bendPoint untouched');
    assert.equal(originalSection.bendPoints[0].y, 80);
  });
});

describe('geometry-check: node-node overlap detection', () => {
  it('detects overlapping nodes with overlap area and severity', () => {
    // Two nodes overlapping: a=[0,0,100,50], b=[80,0,100,50]
    // overlap region: x [80,100]=20, y [0,50]=50 → area 1000
    const root = {
      id: 'r', width: 300, height: 100,
      children: [
        leaf('a', 0, 0, 100, 50, 'A'),
        leaf('b', 80, 0, 100, 50, 'B'),
      ],
      edges: [],
    };
    const result = detectGeometryIssues(root);
    const overlaps = result.issues.filter((i) => i.type === 'node-node-overlap');
    assert.equal(overlaps.length, 1);
    assert.equal(overlaps[0].nodeA, 'a');
    assert.equal(overlaps[0].nodeB, 'b');
    assert.equal(overlaps[0].overlapAreaPt2, 1000);
    assert.equal(overlaps[0].severity, 'error', 'area > 50 → error');
  });

  it('reports warning severity for small overlaps (<=50)', () => {
    // Overlap area = 10pt² → warning
    const root = {
      id: 'r', width: 300, height: 100,
      children: [
        leaf('a', 0, 0, 100, 50),
        leaf('b', 95, 0, 100, 50), // overlap x [95,100]=5, y [0,50]=50 → 250... too big
      ],
      edges: [],
    };
    // Use a smaller overlap: overlap x=1, y=10 → area 10
    const root2 = {
      id: 'r2', width: 300, height: 100,
      children: [
        leaf('a', 0, 0, 100, 10),
        leaf('b', 99, 0, 100, 10), // overlap x [99,100]=1, y [0,10]=10 → 10
      ],
      edges: [],
    };
    const result = detectGeometryIssues(root2);
    const overlaps = result.issues.filter((i) => i.type === 'node-node-overlap');
    assert.equal(overlaps.length, 1);
    assert.equal(overlaps[0].overlapAreaPt2, 10);
    assert.equal(overlaps[0].severity, 'warning');
  });

  it('does not report non-overlapping nodes', () => {
    const root = {
      id: 'r', width: 300, height: 100,
      children: [
        leaf('a', 0, 0, 50, 50),
        leaf('b', 100, 0, 50, 50),
      ],
      edges: [],
    };
    const result = detectGeometryIssues(root);
    const overlaps = result.issues.filter((i) => i.type === 'node-node-overlap');
    assert.equal(overlaps.length, 0);
  });

  it('ignores sub-pixel overlaps below noise threshold (<=0.5)', () => {
    // overlap area = 0.4 → below 0.5 threshold → no report
    const root = {
      id: 'r', width: 300, height: 100,
      children: [
        leaf('a', 0, 0, 100, 0.4),
        leaf('b', 99.6, 0, 100, 0.4), // overlap x [99.6,100]=0.4, y [0,0.4]=0.4 → 0.16
      ],
      edges: [],
    };
    const result = detectGeometryIssues(root);
    const overlaps = result.issues.filter((i) => i.type === 'node-node-overlap');
    assert.equal(overlaps.length, 0);
  });
});

describe('geometry-check: overlapArea helper', () => {
  it('computes intersection area of two boxes', () => {
    const a = { x: 0, y: 0, width: 100, height: 50 };
    const b = { x: 80, y: 0, width: 100, height: 50 };
    assert.equal(overlapArea(a, b), 1000);
  });

  it('returns 0 for non-overlapping boxes', () => {
    const a = { x: 0, y: 0, width: 50, height: 50 };
    const b = { x: 100, y: 0, width: 50, height: 50 };
    assert.equal(overlapArea(a, b), 0);
  });
});

describe('geometry-check: edge-node collision detection', () => {
  it('detects an edge passing through an unrelated node', () => {
    // Edge from (0,25) to (200,25) passes through node c at (80,0,40,50)
    const root = {
      id: 'r', width: 300, height: 100,
      children: [
        leaf('src', 0, 10, 40, 30),
        leaf('c', 80, 0, 40, 50),
        leaf('dst', 200, 10, 40, 30),
      ],
      edges: [edge('e1', 'src', 'dst', [seg(20, 25, 240, 25)])],
    };
    const result = detectGeometryIssues(root);
    const collisions = result.issues.filter((i) => i.type === 'edge-node-collision');
    assert.ok(collisions.length >= 1, 'must detect edge passing through node c');
    const hit = collisions.find((c) => c.nodeId === 'c');
    assert.ok(hit, 'collision with node c reported');
    assert.equal(hit.edgeId, 'e1');
    assert.equal(hit.severity, 'warning');
  });

  it('does not report collision with source or target node', () => {
    // Edge from src to dst; segment starts inside src, ends inside dst
    const root = {
      id: 'r', width: 300, height: 100,
      children: [
        leaf('src', 0, 0, 60, 40),
        leaf('dst', 200, 0, 60, 40),
      ],
      edges: [edge('e1', 'src', 'dst', [seg(30, 20, 230, 20)])],
    };
    const result = detectGeometryIssues(root);
    const collisions = result.issues.filter((i) => i.type === 'edge-node-collision');
    assert.equal(collisions.length, 0, 'no collision with source/target');
  });

  it('does not report when edge does not cross any node', () => {
    const root = {
      id: 'r', width: 400, height: 200,
      children: [
        leaf('a', 0, 0, 40, 40),
        leaf('b', 300, 0, 40, 40),
        leaf('c', 0, 100, 40, 40), // far from edge path
      ],
      edges: [edge('e1', 'a', 'b', [seg(20, 20, 320, 20)])],
    };
    const result = detectGeometryIssues(root);
    const collisions = result.issues.filter((i) => i.type === 'edge-node-collision' && i.nodeId === 'c');
    assert.equal(collisions.length, 0);
  });
});

describe('geometry-check: node out-of-bounds detection', () => {
  it('detects a node extending beyond root bounds', () => {
    const root = {
      id: 'r', width: 200, height: 100,
      children: [
        leaf('ok', 10, 10, 50, 50),
        leaf('oob', 180, 10, 50, 50), // x+width=230 > 200+1
      ],
      edges: [],
    };
    const result = detectGeometryIssues(root);
    const oob = result.issues.filter((i) => i.type === 'node-out-of-bounds');
    assert.ok(oob.length >= 1);
    assert.equal(oob[0].nodeId, 'oob');
    assert.equal(oob[0].severity, 'warning');
  });

  it('detects a node with negative coordinates', () => {
    const root = {
      id: 'r', width: 200, height: 100,
      children: [leaf('neg', -10, 10, 50, 50)],
      edges: [],
    };
    const result = detectGeometryIssues(root);
    const oob = result.issues.filter((i) => i.type === 'node-out-of-bounds');
    assert.ok(oob.length >= 1);
    assert.equal(oob[0].nodeId, 'neg');
  });

  it('does not report in-bounds nodes', () => {
    const root = {
      id: 'r', width: 200, height: 100,
      children: [leaf('ok', 10, 10, 50, 50)],
      edges: [],
    };
    const result = detectGeometryIssues(root);
    const oob = result.issues.filter((i) => i.type === 'node-out-of-bounds');
    assert.equal(oob.length, 0);
  });
});

describe('geometry-check: group containment', () => {
  it('detects a child extending beyond parent group bounds', () => {
    const root = {
      id: 'r', width: 500, height: 500,
      children: [
        {
          id: 'grp', x: 100, y: 100, width: 100, height: 100,
          children: [
            leaf('child-ok', 10, 10, 40, 40),
            leaf('child-bad', 60, 10, 50, 40), // x+w=110 > grp.width-2=98
          ],
        },
      ],
      edges: [],
    };
    const result = detectGeometryIssues(root);
    const violations = result.issues.filter((i) => i.type === 'child-out-of-group');
    assert.ok(violations.length >= 1, 'must detect child outside group');
    const bad = violations.find((v) => v.childId === 'child-bad');
    assert.ok(bad, 'child-bad violation reported');
    assert.equal(bad.groupId, 'grp');
    assert.equal(bad.severity, 'warning');
  });

  it('does not report children fully inside group', () => {
    const root = {
      id: 'r', width: 500, height: 500,
      children: [
        {
          id: 'grp', x: 100, y: 100, width: 200, height: 200,
          children: [leaf('child', 20, 20, 50, 50)],
        },
      ],
      edges: [],
    };
    const result = detectGeometryIssues(root);
    const violations = result.issues.filter((i) => i.type === 'child-out-of-group');
    assert.equal(violations.length, 0);
  });
});

describe('geometry-check: edge-edge crossings', () => {
  it('detects two crossing edges', () => {
    // e1: (0,0)->(100,100), e2: (0,100)->(100,0) → cross at (50,50)
    const root = {
      id: 'r', width: 200, height: 200,
      children: [
        leaf('n1', 0, 0, 10, 10),
        leaf('n2', 100, 100, 10, 10),
        leaf('n3', 0, 100, 10, 10),
        leaf('n4', 100, 0, 10, 10),
      ],
      edges: [
        edge('e1', 'n1', 'n2', [seg(5, 5, 105, 105)]),
        edge('e2', 'n3', 'n4', [seg(5, 105, 105, 5)]),
      ],
    };
    const result = detectGeometryIssues(root);
    assert.ok(result.summary.totalEdgeCrossings >= 1, 'summary counts the crossing');
    const crossings = result.issues.filter((i) => i.type === 'edge-crossings');
    assert.ok(crossings.length >= 1, 'edge-crossings issue reported');
    assert.ok(crossings[0].count >= 1);
  });

  it('does not report crossings for parallel edges', () => {
    const root = {
      id: 'r', width: 200, height: 200,
      children: [
        leaf('n1', 0, 0, 10, 10),
        leaf('n2', 100, 0, 10, 10),
        leaf('n3', 0, 50, 10, 10),
        leaf('n4', 100, 50, 10, 10),
      ],
      edges: [
        edge('e1', 'n1', 'n2', [seg(5, 5, 105, 5)]),
        edge('e2', 'n3', 'n4', [seg(5, 55, 105, 55)]),
      ],
    };
    const result = detectGeometryIssues(root);
    assert.equal(result.summary.totalEdgeCrossings, 0);
    const crossings = result.issues.filter((i) => i.type === 'edge-crossings');
    assert.equal(crossings.length, 0);
  });
});

describe('geometry-check: summary metrics', () => {
  it('computes aspectRatio, areaUtilization, and bends for a simple graph', () => {
    const root = {
      id: 'r', width: 200, height: 100,
      children: [
        leaf('a', 10, 10, 40, 30, 'A'),
        leaf('b', 150, 10, 40, 30, 'B'),
      ],
      edges: [
        edge('e1', 'a', 'b', [seg(50, 25, 100, 25, [{ x: 100, y: 60 }])]),
      ],
    };
    const result = detectGeometryIssues(root);
    const s = result.summary;
    assert.equal(typeof s.aspectRatio, 'number');
    assert.ok(s.aspectRatio >= 1, 'aspectRatio clamped to >= 1');
    assert.equal(s.aspectRatio, 2, '200/100 = 2');
    assert.equal(typeof s.areaUtilization, 'number');
    assert.ok(s.areaUtilization > 0 && s.areaUtilization <= 1);
    assert.equal(s.totalBends, 1, 'one bend point');
    assert.equal(s.avgBendsPerEdge, 1, 'one bend / one edge');
    assert.equal(s.totalEdgeCrossings, 0);
    assert.equal(typeof s.edgeLengthUniformity, 'number');
  });

  it('clamps aspectRatio to >= 1 for tall graphs', () => {
    const root = {
      id: 'r', width: 100, height: 200,
      children: [leaf('a', 10, 10, 40, 40)],
      edges: [],
    };
    const result = detectGeometryIssues(root);
    assert.ok(result.summary.aspectRatio >= 1, 'tall graph ratio clamped');
  });

  it('handles zero edges gracefully in avgBendsPerEdge', () => {
    const root = {
      id: 'r', width: 100, height: 100,
      children: [leaf('a', 10, 10, 20, 20)],
      edges: [],
    };
    const result = detectGeometryIssues(root);
    assert.equal(result.summary.avgBendsPerEdge, 0);
    assert.equal(result.summary.edgeLengthUniformity, 1, 'no edges → perfect uniformity');
  });
});

// ---------------------------------------------------------------------------
// Bug-fix regression tests (coordinate offsets, shared-endpoint crossings,
// segment-rect bounds).
// ---------------------------------------------------------------------------

describe('geometry-check: collectLeafNodes applies group coordinate offset', () => {
  it('accumulates parent group position into leaf coordinates', () => {
    // Group at (100,100) containing a leaf at (50,50) → global (150,150).
    const root = {
      id: 'r', width: 400, height: 400,
      children: [
        {
          id: 'grp', x: 100, y: 100, width: 200, height: 200,
          children: [leaf('inner', 50, 50, 40, 40, 'Inner')],
        },
      ],
      edges: [],
    };
    const leaves = collectLeafNodes(root);
    assert.equal(leaves.length, 1);
    assert.equal(leaves[0].id, 'inner');
    assert.equal(leaves[0].x, 150, 'x offset applied');
    assert.equal(leaves[0].y, 150, 'y offset applied');
    assert.equal(leaves[0].parentId, 'grp');
  });

  it('accumulates nested group offsets through multiple levels', () => {
    // outer at (10,10), inner at (20,20), leaf at (5,5) → global (35,35).
    const root = {
      id: 'r', width: 400, height: 400,
      children: [
        {
          id: 'outer', x: 10, y: 10, width: 200, height: 200,
          children: [
            {
              id: 'inner', x: 20, y: 20, width: 100, height: 100,
              children: [leaf('deep', 5, 5, 30, 30)],
            },
          ],
        },
      ],
      edges: [],
    };
    const leaves = collectLeafNodes(root);
    assert.equal(leaves[0].id, 'deep');
    assert.equal(leaves[0].x, 35, '10+20+5 = 35');
    assert.equal(leaves[0].y, 35, '10+20+5 = 35');
  });

  it('detects overlap between a grouped leaf and a root-level leaf', () => {
    // Group at (100,100) with inner leaf at (50,50,40,40) → global (150,150).
    // Root leaf at (150,150,40,40) → exact overlap, area 1600.
    const root = {
      id: 'r', width: 400, height: 400,
      children: [
        {
          id: 'grp', x: 100, y: 100, width: 200, height: 200,
          children: [leaf('inner', 50, 50, 40, 40)],
        },
        leaf('outer', 150, 150, 40, 40),
      ],
      edges: [],
    };
    const result = detectGeometryIssues(root);
    const overlaps = result.issues.filter((i) => i.type === 'node-node-overlap');
    assert.equal(overlaps.length, 1, 'cross-group overlap detected');
    const ids = [overlaps[0].nodeA, overlaps[0].nodeB].sort();
    assert.deepEqual(ids, ['inner', 'outer']);
    assert.equal(overlaps[0].overlapAreaPt2, 1600);
    assert.equal(overlaps[0].severity, 'error');
  });

  it('does not falsely report overlap when grouped leaf is globally separate', () => {
    // Group at (100,100) with inner at (0,0,40,40) → global (100,100).
    // Root leaf at (300,300,40,40) → no overlap.
    const root = {
      id: 'r', width: 500, height: 500,
      children: [
        {
          id: 'grp', x: 100, y: 100, width: 200, height: 200,
          children: [leaf('inner', 0, 0, 40, 40)],
        },
        leaf('outer', 300, 300, 40, 40),
      ],
      edges: [],
    };
    const result = detectGeometryIssues(root);
    const overlaps = result.issues.filter((i) => i.type === 'node-node-overlap');
    assert.equal(overlaps.length, 0, 'no false overlap across groups');
  });
});

describe('geometry-check: edge-edge crossings skip shared endpoints', () => {
  it('does not count two edges sharing a source port as crossing', () => {
    // Both edges start at the same port coordinate (10,10) — common in ELK
    // layered layouts where multiple edges leave the same source node.
    const root = {
      id: 'r', width: 200, height: 200,
      children: [
        leaf('src', 0, 0, 20, 20),
        leaf('dst1', 100, 0, 20, 20),
        leaf('dst2', 0, 100, 20, 20),
      ],
      edges: [
        edge('e1', 'src', 'dst1', [seg(10, 10, 110, 10)]),
        edge('e2', 'src', 'dst2', [seg(10, 10, 10, 110)]),
      ],
    };
    const result = detectGeometryIssues(root);
    assert.equal(result.summary.totalEdgeCrossings, 0, 'shared source port is not a crossing');
    const crossings = result.issues.filter((i) => i.type === 'edge-crossings');
    assert.equal(crossings.length, 0);
  });

  it('does not count two edges sharing a target port as crossing', () => {
    // Both edges converge on the same target port (190,10).
    const root = {
      id: 'r', width: 200, height: 200,
      children: [
        leaf('s1', 0, 0, 20, 20),
        leaf('s2', 0, 100, 20, 20),
        leaf('dst', 180, 0, 20, 20),
      ],
      edges: [
        edge('e1', 's1', 'dst', [seg(10, 10, 190, 10)]),
        edge('e2', 's2', 'dst', [seg(10, 110, 190, 10)]),
      ],
    };
    const result = detectGeometryIssues(root);
    assert.equal(result.summary.totalEdgeCrossings, 0, 'shared target port is not a crossing');
  });

  it('still counts a genuine crossing when endpoints differ', () => {
    // Two edges that actually cross mid-segment, no shared endpoints.
    const root = {
      id: 'r', width: 200, height: 200,
      children: [
        leaf('n1', 0, 0, 10, 10),
        leaf('n2', 190, 190, 10, 10),
        leaf('n3', 0, 190, 10, 10),
        leaf('n4', 190, 0, 10, 10),
      ],
      edges: [
        edge('e1', 'n1', 'n2', [seg(5, 5, 195, 195)]),
        edge('e2', 'n3', 'n4', [seg(5, 195, 195, 5)]),
      ],
    };
    const result = detectGeometryIssues(root);
    assert.ok(result.summary.totalEdgeCrossings >= 1, 'real crossing still detected');
    const crossings = result.issues.filter((i) => i.type === 'edge-crossings');
    assert.ok(crossings.length >= 1);
  });
});

describe('geometry-check: segment-rect intersection bounds', () => {
  it('does not report collision when segment endpoint does not reach the rect', () => {
    // A short segment whose infinite line would touch a far rect's edge, but
    // the segment itself never reaches the rect. No collision expected.
    // Segment (0,0)->(10,10); its line y=x meets the top edge of a far rect
    // at (200,200) — a corner — but the segment stops at (10,10).
    const root = {
      id: 'r', width: 400, height: 400,
      children: [
        leaf('src', 0, 0, 10, 10),
        leaf('far', 200, 200, 40, 40),
      ],
      edges: [edge('e1', 'src', 'src', [seg(0, 0, 10, 10)])],
    };
    const result = detectGeometryIssues(root);
    const collisions = result.issues.filter(
      (i) => i.type === 'edge-node-collision' && i.nodeId === 'far',
    );
    assert.equal(collisions.length, 0, 'no false positive from infinite-line touch');
  });

  it('reports collision for a collinear segment overlapping a rect edge', () => {
    // Segment runs along the top edge of node c (y=0) from x=5 to x=205,
    // overlapping c's top edge [80,120]. Collinear overlap must be detected.
    const root = {
      id: 'r', width: 300, height: 100,
      children: [
        leaf('src', 0, 0, 10, 10),
        leaf('c', 80, 0, 40, 50),
        leaf('dst', 200, 0, 10, 10),
      ],
      edges: [edge('e1', 'src', 'dst', [seg(5, 0, 205, 0)])],
    };
    const result = detectGeometryIssues(root);
    const collisions = result.issues.filter(
      (i) => i.type === 'edge-node-collision' && i.nodeId === 'c',
    );
    assert.ok(collisions.length >= 1, 'collinear overlap with rect edge is a collision');
    assert.equal(collisions[0].edgeId, 'e1');
  });

  it('does not report collision for a collinear segment that does not overlap the rect', () => {
    // Segment along y=0 from x=0 to x=70; node c top edge spans x=80..120.
    // Collinear but the segment ends before reaching the rect → no overlap.
    const root = {
      id: 'r', width: 300, height: 100,
      children: [
        leaf('src', 0, 0, 10, 10),
        leaf('c', 80, 0, 40, 50),
        leaf('dst', 200, 0, 10, 10),
      ],
      edges: [edge('e1', 'src', 'src', [seg(0, 0, 70, 0)])],
    };
    const result = detectGeometryIssues(root);
    const collisions = result.issues.filter(
      (i) => i.type === 'edge-node-collision' && i.nodeId === 'c',
    );
    assert.equal(collisions.length, 0, 'collinear-but-disjoint is not a collision');
  });

  it('reports collision when a segment endpoint touches the rect boundary', () => {
    // Segment from (0,25) ending exactly on the left edge of c at (80,25).
    // thi.ng labels endpoint-touching intersections INTERSECT_OUTSIDE; the
    // bounds check must still accept it as a valid collision.
    const root = {
      id: 'r', width: 300, height: 100,
      children: [
        leaf('src', 0, 0, 10, 10),
        leaf('c', 80, 0, 40, 50),
      ],
      edges: [edge('e1', 'src', 'src', [seg(0, 25, 80, 25)])],
    };
    const result = detectGeometryIssues(root);
    const collisions = result.issues.filter(
      (i) => i.type === 'edge-node-collision' && i.nodeId === 'c',
    );
    assert.ok(collisions.length >= 1, 'endpoint touching rect boundary is a collision');
  });
});