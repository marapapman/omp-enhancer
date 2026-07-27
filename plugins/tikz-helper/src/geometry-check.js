// Geometry overlap/collision detection for positioned ELK graphs.
//
// Runs deterministic AABB and segment-intersection checks on the positioned ELK
// layout graph and reports structured findings. These augment (do not replace)
// visioner visual review. Findings are advisory — the designer fixes issues
// via ELK layout options or node sizes and regenerates, never by editing
// coordinates.
//
// Uses:
//   @thi.ng/geom-isec — testRectRect (node-node AABB), intersectLineLine +
//     pointInRect (edge-node segment/rect intersection)
//   isect — Bentley-Ottmann sweep for edge-edge crossings

import { testRectRect, pointInRect, intersectLineLine, IntersectionType } from '@thi.ng/geom-isec';
import isect from 'isect';

const NOISE_THRESHOLD = 0.5; // pt² — ignore sub-pixel overlaps below this
const ERROR_THRESHOLD = 50; // pt² — overlap larger than this is an error
const BOUNDS_TOLERANCE = 1; // pt — tolerance for out-of-bounds check
const GROUP_PADDING = 2; // pt — minimum padding inside group containers

/**
 * Detect geometric issues in a positioned ELK root graph.
 *
 * @param {object} root - Positioned ELK graph with width/height, children, edges.
 * @returns {{ issues: object[], summary: object }} Frozen result. An empty
 *   issues array means no problems detected.
 */
export function detectGeometryIssues(root) {
  const issues = [];
  const leaves = collectLeafNodes(root);
  const edges = collectEdges(root);

  // Check 1: Node-node AABB overlap
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const a = leaves[i];
      const b = leaves[j];
      if (testRectRect([a.x, a.y], [a.width, a.height], [b.x, b.y], [b.width, b.height])) {
        const area = overlapArea(a, b);
        if (area > NOISE_THRESHOLD) {
          issues.push({
            type: 'node-node-overlap',
            severity: area > ERROR_THRESHOLD ? 'error' : 'warning',
            nodeA: a.id,
            nodeB: b.id,
            overlapAreaPt2: Math.round(area * 10) / 10,
          });
        }
      }
    }
  }

  // Check 2: Edge passes through unrelated node box
  for (const edge of edges) {
    for (const node of leaves) {
      if (node.id === edge.sourceId || node.id === edge.targetId) continue;
      if (edgeIntersectsNode(edge, node)) {
        issues.push({
          type: 'edge-node-collision',
          severity: 'warning',
          edgeId: edge.id,
          nodeId: node.id,
        });
      }
    }
  }

  // Check 3: Group containment — child outside parent bounds
  checkGroupContainment(root, issues);

  // Check 4: Node outside root bounding box (clipping risk)
  for (const node of leaves) {
    if (
      node.x < 0 ||
      node.y < 0 ||
      node.x + node.width > root.width + BOUNDS_TOLERANCE ||
      node.y + node.height > root.height + BOUNDS_TOLERANCE
    ) {
      issues.push({ type: 'node-out-of-bounds', severity: 'warning', nodeId: node.id });
    }
  }

  // Check 5: Edge-edge crossings (Bentley-Ottmann via isect)
  const crossingCount = countEdgeCrossings(edges);
  if (crossingCount > 0) {
    issues.push({
      type: 'edge-crossings',
      severity: crossingCount > 5 ? 'warning' : 'info',
      count: crossingCount,
    });
  }

  const summary = computeSummary(leaves, edges, crossingCount, root);
  return Object.freeze({ issues: Object.freeze(issues), summary: Object.freeze(summary) });
}

/**
 * Walk root.children recursively, flatten leaf nodes (no children) to
 * {id, x, y, width, height, label, parentId}. Groups (nodes with children)
 * are excluded from the leaf list. Child coordinates are accumulated with
 * their enclosing group's position offset so returned coordinates are
 * absolute (root-relative), matching the coordinate space of root-level
 * leaves. This is required for correct AABB comparison across groups.
 * @param {object} root
 * @returns {object[]}
 */
export function collectLeafNodes(root) {
  const leaves = [];
  const walk = (node, parentId, offsetX = 0, offsetY = 0) => {
    if (!node || typeof node !== 'object') return;
    const children = node.children ?? [];
    const hasChildren = Array.isArray(children) && children.length > 0;
    if (!hasChildren) {
      leaves.push({
        id: node.id,
        x: (node.x ?? 0) + offsetX,
        y: (node.y ?? 0) + offsetY,
        width: node.width ?? 0,
        height: node.height ?? 0,
        label: nodeLabel(node),
        parentId: parentId ?? null,
      });
    } else {
      for (const child of children) {
        walk(child, node.id, offsetX + (node.x ?? 0), offsetY + (node.y ?? 0));
      }
    }
  };
  for (const child of root.children ?? []) walk(child, null);
  return leaves;
}

/**
 * Walk root.edges and each group's .edges, flatten to
 * {id, sections, sourceId, targetId}. Section coordinates (startPoint,
 * bendPoints, endPoint) are offset by the accumulated position of their
 * enclosing group(s) so returned coordinates are absolute (root-relative),
 * matching the coordinate space used by collectLeafNodes. This is required
 * for correct edge-node collision and edge-edge crossing detection across
 * groups.
 * @param {object} root
 * @returns {object[]}
 */
export function collectEdges(root) {
  const edges = [];
  const offsetSection = (section, ox, oy) => {
    if (!section) return section;
    const out = { ...section };
    if (section.startPoint) {
      out.startPoint = { x: section.startPoint.x + ox, y: section.startPoint.y + oy };
    }
    if (section.endPoint) {
      out.endPoint = { x: section.endPoint.x + ox, y: section.endPoint.y + oy };
    }
    if (Array.isArray(section.bendPoints)) {
      out.bendPoints = section.bendPoints.map((bp) => ({ x: bp.x + ox, y: bp.y + oy }));
    }
    return out;
  };
  const walk = (node, offsetX = 0, offsetY = 0) => {
    if (!node || typeof node !== 'object') return;
    for (const edge of node.edges ?? []) {
      edges.push({
        id: edge.id,
        sections: (edge.sections ?? []).map((s) => offsetSection(s, offsetX, offsetY)),
        sourceId: edge.sources?.[0],
        targetId: edge.targets?.[0],
      });
    }
    for (const child of node.children ?? []) {
      walk(child, offsetX + (child.x ?? 0), offsetY + (child.y ?? 0));
    }
  };
  walk(root);
  return edges;
}

/**
 * Compute the intersection area of two confirmed-overlapping boxes.
 * This is NOT collision detection — it assumes the boxes overlap.
 * @param {{x:number,y:number,width:number,height:number}} a
 * @param {{x:number,y:number,width:number,height:number}} b
 * @returns {number}
 */
export function overlapArea(a, b) {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  );
}

/**
 * Determine whether an edge's polyline intersects a node's bounding box.
 * For each section, build segments from startPoint → bendPoints → endPoint and
 * test each segment against the node rect. A segment intersects if it crosses
 * any of the four rect edges OR an endpoint lies inside the rect. Segments
 * where BOTH endpoints are inside the node box are skipped (connection stubs
 * anchored to the node).
 * @param {object} edge - { sections: [{startPoint, bendPoints, endPoint}] }
 * @param {object} node - { x, y, width, height }
 * @returns {boolean}
 */
export function edgeIntersectsNode(edge, node) {
  const rect = [node.x, node.y, node.width, node.height];
  for (const section of edge.sections ?? []) {
    const pts = sectionPoints(section);
    for (let k = 0; k < pts.length - 1; k++) {
      const p1 = pts[k];
      const p2 = pts[k + 1];
      const p1Inside = pointInRect(p1, [rect[0], rect[1]], [rect[2], rect[3]]);
      const p2Inside = pointInRect(p2, [rect[0], rect[1]], [rect[2], rect[3]]);
      // Skip stub segments fully inside the node (source/target anchors).
      if (p1Inside && p2Inside) continue;
      // An endpoint inside the rect means the segment enters the box.
      if (p1Inside || p2Inside) return true;
      // Test the segment against the four rect boundary edges.
      if (segmentCrossesRect(p1, p2, rect)) return true;
    }
  }
  return false;
}

/**
 * Check that every child of each group node is fully inside the group's box
 * with at least GROUP_PADDING padding. Child coordinates are relative to the
 * group (PARENT coordinate mode).
 * @param {object} root
 * @param {object[]} issues
 */
function checkGroupContainment(root, issues) {
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    const children = node.children ?? [];
    if (Array.isArray(children) && children.length > 0) {
      for (const child of children) {
        if (typeof child.x !== 'number' || typeof child.y !== 'number') continue;
        const cx = child.x;
        const cy = child.y;
        const cw = child.width ?? 0;
        const ch = child.height ?? 0;
        const fullyInside =
          cx >= GROUP_PADDING &&
          cy >= GROUP_PADDING &&
          cx + cw <= (node.width ?? 0) - GROUP_PADDING &&
          cy + ch <= (node.height ?? 0) - GROUP_PADDING;
        if (!fullyInside) {
          issues.push({
            type: 'child-out-of-group',
            severity: 'warning',
            groupId: node.id,
            childId: child.id,
          });
        }
      }
      for (const child of children) walk(child);
    }
  };
  for (const child of root.children ?? []) walk(child);
}

/**
 * Count edge-edge crossings using the isect Bentley-Ottmann sweep.
 * Segments from different edges are tested; segments sharing an edge id and
 * adjacent segments of the same polyline are skipped.
 * @param {object[]} edges - flattened edges from collectEdges
 * @returns {number}
 */
export function countEdgeCrossings(edges) {
  // Build a flat segment list tagged with edge id, skipping zero-length segs.
  const segments = [];
  for (const edge of edges) {
    for (const section of edge.sections ?? []) {
      const pts = sectionPoints(section);
      for (let k = 0; k < pts.length - 1; k++) {
        const p1 = pts[k];
        const p2 = pts[k + 1];
        if (p1[0] === p2[0] && p1[1] === p2[1]) continue;
        segments.push({
          from: { x: p1[0], y: p1[1] },
          to: { x: p2[0], y: p2[1] },
          edgeId: edge.id,
        });
      }
    }
  }
  if (segments.length < 2) return 0;

  const detector = isect.bush(segments);
  let intersections;
  try {
    intersections = detector.run();
  } catch {
    return 0;
  }
  if (!Array.isArray(intersections)) return 0;

  // isect reports segment objects (with from/to/edgeId) in `segments`.
  // Count crossings between segments of DIFFERENT edges, skipping intersections
  // where the segments merely share an endpoint coordinate (e.g. multiple edges
  // leaving the same source port — normal in ELK layered layouts, not a crossing).
  let count = 0;
  for (const hit of intersections) {
    const segs = hit.segments ?? [];
    const edgeIds = new Set();
    for (const s of segs) {
      if (s && typeof s === 'object' && 'edgeId' in s) edgeIds.add(s.edgeId);
    }
    if (edgeIds.size < 2) continue;
    // Skip the hit entirely if every cross-edge pair shares an endpoint.
    let hasRealCrossing = false;
    for (let i = 0; i < segs.length && !hasRealCrossing; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        const a = segs[i];
        const b = segs[j];
        if (!a || !b || a.edgeId === b.edgeId) continue;
        if (!segmentsShareEndpoint(a, b)) hasRealCrossing = true;
      }
    }
    if (hasRealCrossing) count++;
  }
  return count;
}

/**
 * Test whether two isect segment objects share an endpoint coordinate.
 * ELK layered layouts route multiple edges through a shared source/target port,
 * so their first/last segments start or end at the same point. Such geometric
 * meetings are NOT crossings. Endpoints are original ELK coordinates (not
 * computed), so exact floating-point equality is safe.
 * @param {{from:{x,y},to:{x,y}}} a
 * @param {{from:{x,y},to:{x,y}}} b
 * @returns {boolean}
 */
function segmentsShareEndpoint(a, b) {
  const af = a.from, at = a.to, bf = b.from, bt = b.to;
  return (
    (af.x === bf.x && af.y === bf.y) ||
    (af.x === bt.x && af.y === bt.y) ||
    (at.x === bf.x && at.y === bf.y) ||
    (at.x === bt.x && at.y === bt.y)
  );
  return count;
}

/**
 * Compute summary aesthetic/quality metrics.
 * @param {object[]} leaves
 * @param {object[]} edges
 * @param {number} crossingCount
 * @param {object} root
 * @returns {{totalEdgeCrossings,totalBends,avgBendsPerEdge,aspectRatio,areaUtilization,edgeLengthUniformity}}
 */
export function computeSummary(leaves, edges, crossingCount, root) {
  let totalBends = 0;
  const lengths = [];
  for (const edge of edges) {
    for (const section of edge.sections ?? []) {
      const pts = sectionPoints(section);
      totalBends += (section.bendPoints ?? []).length;
      for (let k = 0; k < pts.length - 1; k++) {
        const dx = pts[k + 1][0] - pts[k][0];
        const dy = pts[k + 1][1] - pts[k][1];
        lengths.push(Math.hypot(dx, dy));
      }
    }
  }
  const edgeCount = edges.length;
  const avgBendsPerEdge = edgeCount > 0 ? totalBends / edgeCount : 0;

  const rootW = typeof root.width === 'number' ? root.width : 0;
  const rootH = typeof root.height === 'number' ? root.height : 0;
  const aspectRatio = rootH > 0 ? Math.max(rootW / rootH, 1) : 1;

  const nodeArea = leaves.reduce((sum, n) => sum + (n.width ?? 0) * (n.height ?? 0), 0);
  const rootArea = rootW * rootH;
  const areaUtilization = rootArea > 0 ? Math.min(nodeArea / rootArea, 1) : 0;

  const edgeLengthUniformity = lengthUniformity(lengths);

  return {
    totalEdgeCrossings: crossingCount,
    totalBends,
    avgBendsPerEdge,
    aspectRatio,
    areaUtilization,
    edgeLengthUniformity,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function nodeLabel(node) {
  const labels = node.labels ?? [];
  if (labels.length > 0 && labels[0].text) return labels[0].text;
  if (node.properties?.label) return node.properties.label;
  return null;
}

/**
 * Flatten a section's geometry into an ordered list of [x,y] points:
 * startPoint → bendPoints → endPoint.
 */
function sectionPoints(section) {
  const pts = [];
  if (section.startPoint) pts.push([section.startPoint.x, section.startPoint.y]);
  for (const bp of section.bendPoints ?? []) pts.push([bp.x, bp.y]);
  if (section.endPoint) pts.push([section.endPoint.x, section.endPoint.y]);
  return pts;
}

/**
 * Test whether segment p1→p2 crosses the axis-aligned rect [x, y, w, h].
 *
 * Uses @thi.ng/geom-isec intersectLineLine against each of the four rect
 * boundary edges, then validates the result:
 *  - INTERSECT (type 4) and INTERSECT_OUTSIDE (type 5): thi.ng returns the
 *    intersection point in `isec`. INTERSECT_OUTSIDE is emitted when the point
 *    lies at a segment endpoint (alpha/beta exactly 0 or 1) — still a valid
 *    crossing. Both are accepted only after confirming the point is within the
 *    segment's bounding box AND the rect's bounding box, which rejects the
 *    infinite-line false positive (a far-away rect edge whose infinite line
 *    the segment's line touches without the segment itself reaching it).
 *  - COINCIDENT (type 2) / COINCIDENT_NO_INTERSECT (type 3) / PARALLEL (type 1):
 *    the segment runs collinearly with a rect edge. intersectLineLine does not
 *    report an intersection point for these, so test whether either segment
 *    endpoint lies inside the rect — if so, the segment overlaps the rect edge
 *    and crosses the rect.
 */
function segmentCrossesRect(p1, p2, rect) {
  const [rx, ry, rw, rh] = rect;
  const x0 = rx;
  const y0 = ry;
  const x1 = rx + rw;
  const y1 = ry + rh;
  const rectPos = [rx, ry];
  const rectSize = [rw, rh];
  // Segment bounding box (inclusive).
  const sxMin = Math.min(p1[0], p2[0]);
  const sxMax = Math.max(p1[0], p2[0]);
  const syMin = Math.min(p1[1], p2[1]);
  const syMax = Math.max(p1[1], p2[1]);
  // Rect bounding box (inclusive).
  const rxMin = Math.min(x0, x1);
  const rxMax = Math.max(x0, x1);
  const ryMin = Math.min(y0, y1);
  const ryMax = Math.max(y0, y1);
  const pointInBoth = (px, py) =>
    px >= sxMin - 1e-9 && px <= sxMax + 1e-9 &&
    py >= syMin - 1e-9 && py <= syMax + 1e-9 &&
    px >= rxMin - 1e-9 && px <= rxMax + 1e-9 &&
    py >= ryMin - 1e-9 && py <= ryMax + 1e-9;
  // Four rect edges as segments: top, right, bottom, left.
  const edges = [
    [[x0, y0], [x1, y0]], // top
    [[x1, y0], [x1, y1]], // right
    [[x1, y1], [x0, y1]], // bottom
    [[x0, y1], [x0, y0]], // left
  ];
  for (const [e1, e2] of edges) {
    const res = intersectLineLine(p1, p2, e1, e2);
    if (res.type === IntersectionType.INTERSECT || res.type === IntersectionType.INTERSECT_OUTSIDE) {
      const isec = Array.isArray(res.isec) ? res.isec[0] : null;
      if (isec && pointInBoth(isec[0], isec[1])) return true;
    } else if (
      res.type === IntersectionType.COINCIDENT ||
      res.type === IntersectionType.COINCIDENT_NO_INTERSECT ||
      res.type === IntersectionType.PARALLEL
    ) {
      // Collinear/parallel: the segment may run along this rect edge.
      // A collision exists iff an endpoint lies inside the rect.
      if (pointInRect(p1, rectPos, rectSize) || pointInRect(p2, rectPos, rectSize)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Edge length uniformity: 1 - normalized standard deviation of edge lengths.
 * Returns 1 for a single edge or no edges (perfect uniformity by definition).
 * Range [0, 1]; higher is better.
 */
function lengthUniformity(lengths) {
  if (lengths.length === 0) return 1;
  if (lengths.length === 1) return 1;
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (mean === 0) return 1;
  const variance = lengths.reduce((s, l) => s + (l - mean) ** 2, 0) / lengths.length;
  const stddev = Math.sqrt(variance);
  return Math.max(0, 1 - stddev / mean);
}