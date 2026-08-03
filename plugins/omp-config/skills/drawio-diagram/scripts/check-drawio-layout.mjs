#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const MIN_FONT_SIZE = 14;
const MIN_BOX_GUTTER = 24;
const MIN_EDGE_GAP = 12;
const MIN_ARROW_SIZE = 8;

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#10;/g, '\n')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function parseAttributes(openTag) {
  const attributes = new Map();
  for (const match of openTag.matchAll(/([A-Za-z0-9_-]+)="([^"]*)"/g)) {
    attributes.set(match[1], decodeEntities(match[2]));
  }
  return attributes;
}

function parseStyle(style) {
  const result = new Map();
  for (const part of String(style ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      if (part.trim()) result.set(part.trim(), '');
    } else {
      result.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    }
  }
  return result;
}

function parseCells(source) {
  const cells = [];
  let index = 0;
  while (index < source.length) {
    const open = source.indexOf('<mxCell', index);
    if (open === -1) break;
    const tagEnd = source.indexOf('>', open);
    if (tagEnd === -1) break;
    const openTag = source.slice(open, tagEnd + 1);
    if (openTag.endsWith('/>')) {
      cells.push({ attributes: parseAttributes(openTag), inner: '' });
      index = tagEnd + 1;
      continue;
    }
    const close = source.indexOf('</mxCell>', tagEnd);
    if (close === -1) break;
    cells.push({ attributes: parseAttributes(openTag), inner: source.slice(tagEnd + 1, close) });
    index = close + '</mxCell>'.length;
  }
  return cells;
}

function parseGeometry(inner) {
  const geometry = {};
  for (const match of inner.matchAll(/<mxGeometry\b([^>]*?)\/?>/g)) {
    const attributes = parseAttributes(match[1]);
    geometry.x = attributes.has('x') ? Number(attributes.get('x')) : 0;
    geometry.y = attributes.has('y') ? Number(attributes.get('y')) : 0;
    geometry.width = attributes.has('width') ? Number(attributes.get('width')) : 0;
    geometry.height = attributes.has('height') ? Number(attributes.get('height')) : 0;
    geometry.relative = attributes.get('relative') === '1';
  }
  const points = [];
  for (const match of inner.matchAll(/<mxPoint\b([^>]*?)\/?>/g)) {
    const attributes = parseAttributes(match[1]);
    points.push({
      x: Number(attributes.get('x') ?? 0),
      y: Number(attributes.get('y') ?? 0),
      as: attributes.get('as') ?? 'point',
    });
  }
  const waypoints = [];
  for (const match of inner.matchAll(/<Array\b([^>]*?)as="points"[^>]*>([\s\S]*?)<\/Array>/g)) {
    for (const pointMatch of match[2].matchAll(/<mxPoint\b([^>]*?)\/?>/g)) {
      const attributes = parseAttributes(pointMatch[1]);
      waypoints.push({ x: Number(attributes.get('x') ?? 0), y: Number(attributes.get('y') ?? 0) });
    }
  }
  return { geometry, points, waypoints };
}

function stripTags(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n');
}

function estimateTextSize(value, fontSize) {
  const lines = stripTags(value);
  let width = 0;
  for (const line of lines) {
    let lineWidth = 0;
    for (const char of line) {
      lineWidth += /[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/u.test(char) ? fontSize : fontSize * 0.62;
    }
    width = Math.max(width, lineWidth);
  }
  return { width: width + 16, height: Math.max(1, lines.length) * fontSize * 1.4 + 12 };
}

function rectsOverlap(a, b) {
  const overlapWidth = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapHeight = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return { width: overlapWidth, height: overlapHeight };
}

function rectGap(a, b) {
  const overlap = rectsOverlap(a, b);
  if (overlap.width > 0 && overlap.height > 0) return 0;
  const gapX = overlap.width > 0 ? 0 : Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
  const gapY = overlap.height > 0 ? 0 : Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
  return Math.max(gapX, gapY);
}

function segmentIntersectsRect(segment, rect) {
  const [p, q] = segment;
  if (p.y === q.y) {
    const y = p.y;
    if (y <= rect.y || y >= rect.y + rect.h) return false;
    const left = Math.min(p.x, q.x);
    const right = Math.max(p.x, q.x);
    return left < rect.x + rect.w && right > rect.x;
  }
  if (p.x === q.x) {
    const x = p.x;
    if (x <= rect.x || x >= rect.x + rect.w) return false;
    const top = Math.min(p.y, q.y);
    const bottom = Math.max(p.y, q.y);
    return top < rect.y + rect.h && bottom > rect.y;
  }
  return false;
}

function segmentOnRectBorder(segment, rect) {
  const [p, q] = segment;
  const overlapLength = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
  if (p.y === q.y && (p.y === rect.y || p.y === rect.y + rect.h)) {
    const inside = p.x >= rect.x && p.x <= rect.x + rect.w || q.x >= rect.x && q.x <= rect.x + rect.w;
    if (!inside) return 0;
    return overlapLength(Math.min(p.x, q.x), Math.max(p.x, q.x), rect.x, rect.x + rect.w);
  }
  if (p.x === q.x && (p.x === rect.x || p.x === rect.x + rect.w)) {
    const inside = p.y >= rect.y && p.y <= rect.y + rect.h || q.y >= rect.y && q.y <= rect.y + rect.h;
    if (!inside) return 0;
    return overlapLength(Math.min(p.y, q.y), Math.max(p.y, q.y), rect.y, rect.y + rect.h);
  }
  return 0;
}

function segmentsOverlapCollinear(a, b) {
  if (a[0].y === a[1].y && b[0].y === b[1].y && a[0].y === b[0].y) {
    const length = Math.max(0, Math.min(Math.max(a[0].x, a[1].x), Math.max(b[0].x, b[1].x))
      - Math.max(Math.min(a[0].x, a[1].x), Math.min(b[0].x, b[1].x)));
    return length > 0.5 ? length : 0;
  }
  if (a[0].x === a[1].x && b[0].x === b[1].x && a[0].x === b[0].x) {
    const length = Math.max(0, Math.min(Math.max(a[0].y, a[1].y), Math.max(b[0].y, b[1].y))
      - Math.max(Math.min(a[0].y, a[1].y), Math.min(b[0].y, b[1].y)));
    return length > 0.5 ? length : 0;
  }
  return 0;
}

function attachmentPoint(box, xRatio, yRatio) {
  return { x: box.x + xRatio * box.w, y: box.y + yRatio * box.h };
}

function isPerpendicularAttachment(xRatio, yRatio) {
  const sideX = xRatio === 0 || xRatio === 1;
  const sideY = yRatio === 0 || yRatio === 1;
  const midX = xRatio === 0.5;
  const midY = yRatio === 0.5;
  return (sideX && midY) || (sideY && midX);
}

export function checkDrawioLayout(source, { minFontSize = MIN_FONT_SIZE } = {}) {
  const findings = [];

  if (/<script\b/iu.test(source)) findings.push('ERROR: <script> elements are not allowed in diagram XML.');
  if (/javascript\s*:/iu.test(source)) findings.push('ERROR: active javascript: content is not allowed.');
  for (const match of source.matchAll(/\b(?:image|style)="([^"]*https?:\/\/[^"]*)"/giu)) {
    findings.push(`ERROR: external URL reference is not allowed: ${match[1].slice(0, 80)}`);
  }

  const cells = parseCells(source);
  if (cells.length < 3) {
    findings.push('ERROR: diagram must contain the two sentinel cells plus at least one content cell.');
    return findings;
  }

  const byId = new Map();
  for (const cell of cells) {
    const { attributes, inner } = cell;
    byId.set(attributes.get('id'), { attributes, inner });
  }

  const boxes = [];
  const edges = [];
  for (const [id, { attributes, inner }] of byId) {
    if (id === '0' || id === '1') continue;
    const isEdge = attributes.get('edge') === '1';
    const parent = attributes.get('parent') ?? '1';
    const parsed = parseGeometry(inner);
    if (isEdge) {
      edges.push({
        id,
        source: attributes.get('source'),
        target: attributes.get('target'),
        style: parseStyle(attributes.get('style')),
        geometry: parsed.geometry,
        points: parsed.points,
        waypoints: parsed.waypoints,
        parent,
      });
    } else if (parsed.geometry.width > 0) {
      boxes.push({
        id,
        value: attributes.get('value') ?? '',
        style: parseStyle(attributes.get('style')),
        geometry: parsed.geometry,
        parent,
        container: attributes.get('container') === '1',
      });
    }
  }

  // Resolve absolute box positions (one level of container nesting is supported).
  const absolute = new Map();
  for (const box of boxes) {
    const geometry = box.geometry;
    let x = geometry.x;
    let y = geometry.y;
    const parentBox = boxes.find((candidate) => candidate.id === box.parent);
    if (parentBox && geometry.relative) {
      x += parentBox.geometry.x;
      y += parentBox.geometry.y;
    }
    absolute.set(box.id, { x, y, w: geometry.width, h: geometry.height });
  }

  // Box overlap and gutter. Containers legally contain their children, so
  // parent-child pairs are skipped (the container margin check covers them).
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = absolute.get(boxes[i].id);
      const b = absolute.get(boxes[j].id);
      if (!a || !b) continue;
      if (boxes[i].parent === boxes[j].id || boxes[j].parent === boxes[i].id) continue;
      const overlap = rectsOverlap(a, b);
      if (overlap.width > 0 && overlap.height > 0) {
        findings.push(`ERROR: box overlap between "${boxes[i].id}" and "${boxes[j].id}" (${overlap.width.toFixed(1)}x${overlap.height.toFixed(1)} px).`);
      } else {
        const gap = rectGap(a, b);
        if (gap < MIN_BOX_GUTTER) {
          findings.push(`WARNING: boxes "${boxes[i].id}" and "${boxes[j].id}" are only ${gap.toFixed(1)} px apart (keep >= ${MIN_BOX_GUTTER} px).`);
        }
      }
    }
  }

  // Containers: children must stay inside with margin.
  for (const box of boxes) {
    if (!box.container) continue;
    const containerRect = absolute.get(box.id);
    for (const child of boxes) {
      if (child.parent !== box.id) continue;
      const childRect = absolute.get(child.id);
      if (!containerRect || !childRect) continue;
      const margin = Math.min(
        childRect.x - containerRect.x,
        containerRect.x + containerRect.w - (childRect.x + childRect.w),
        childRect.y - containerRect.y,
        containerRect.y + containerRect.h - (childRect.y + childRect.h),
      );
      if (margin < 0) {
        findings.push(`ERROR: child "${child.id}" sticks out of container "${box.id}".`);
      } else if (margin < 12) {
        findings.push(`WARNING: child "${child.id}" is only ${margin.toFixed(1)} px inside container "${box.id}" (keep >= 12 px).`);
      }
    }
  }

  // Font size and text fit.
  for (const box of boxes) {
    if (!box.value) continue;
    const fontSize = Number(box.style.get('fontSize') ?? 12);
    if (fontSize < minFontSize) {
      findings.push(`ERROR: box "${box.id}" uses fontSize=${fontSize} (minimum ${minFontSize} for PPT/print).`);
    }
    const aspectFixed = box.style.has('aspect') || box.style.get('shape') === 'image';
    if (!aspectFixed) {
      const rect = absolute.get(box.id);
      const estimated = estimateTextSize(box.value, Math.max(fontSize, minFontSize));
      if (rect && (estimated.width > rect.w || estimated.height > rect.h)) {
        findings.push(
          `ERROR: text in box "${box.id}" likely overflows (estimated ${estimated.width.toFixed(0)}x${estimated.height.toFixed(0)}, box ${rect.w.toFixed(0)}x${rect.h.toFixed(0)}). Shorten the label or enlarge the box.`,
        );
      }
    }
  }

  // Edges.
  const edgeSegments = [];
  for (const edge of edges) {
    const sourceBox = boxes.find((box) => box.id === edge.source);
    const targetBox = boxes.find((box) => box.id === edge.target);
    const sourceRect = sourceBox ? absolute.get(sourceBox.id) : null;
    const targetRect = targetBox ? absolute.get(targetBox.id) : null;
    if (!sourceBox || !targetBox || !sourceRect || !targetRect) {
      findings.push(`ERROR: edge "${edge.id}" references a missing source or target box.`);
      continue;
    }

    if (edge.style.get('edgeStyle') !== 'orthogonalEdgeStyle') {
      findings.push(`ERROR: edge "${edge.id}" must use edgeStyle=orthogonalEdgeStyle so every segment is horizontal or vertical.`);
    }

    const exitX = Number(edge.style.get('exitX') ?? 0.5);
    const exitY = Number(edge.style.get('exitY') ?? 0.5);
    const entryX = Number(edge.style.get('entryX') ?? 0.5);
    const entryY = Number(edge.style.get('entryY') ?? 0.5);
    if (!isPerpendicularAttachment(exitX, exitY)) {
      findings.push(`ERROR: edge "${edge.id}" exits at a non-perpendicular point (exitX=${exitX}, exitY=${exitY}); use a fixed side midpoint such as exitX=1;exitY=0.5.`);
    }
    if (!isPerpendicularAttachment(entryX, entryY)) {
      findings.push(`ERROR: edge "${edge.id}" enters at a non-perpendicular point (entryX=${entryX}, entryY=${entryY}); use a fixed side midpoint such as entryX=0;entryY=0.5.`);
    }

    const endArrow = edge.style.get('endArrow');
    const endFill = edge.style.get('endFill');
    const endSize = Number(edge.style.get('endSize') ?? 10);
    if (endArrow !== 'classic' || endFill !== '1') {
      findings.push(`WARNING: edge "${edge.id}" should use endArrow=classic;endFill=1 (solid arrowhead perpendicular to the line).`);
    } else if (endSize < MIN_ARROW_SIZE) {
      findings.push(`WARNING: edge "${edge.id}" arrowhead endSize=${endSize} is smaller than ${MIN_ARROW_SIZE}.`);
    }
    const startArrow = edge.style.get('startArrow');
    if (startArrow && startArrow !== 'none') {
      const startFill = edge.style.get('startFill');
      const startSize = Number(edge.style.get('startSize') ?? 10);
      if (startArrow !== 'classic' || startFill !== '1') {
        findings.push(`WARNING: edge "${edge.id}" should use startArrow=classic;startFill=1 for its start arrowhead.`);
      } else if (startSize < MIN_ARROW_SIZE) {
        findings.push(`WARNING: edge "${edge.id}" arrowhead startSize=${startSize} is smaller than ${MIN_ARROW_SIZE}.`);
      }
    }

    const attachmentValid = isPerpendicularAttachment(exitX, exitY) && isPerpendicularAttachment(entryX, entryY);
    if (!attachmentValid) continue;

    const exitPoint = attachmentPoint(sourceRect, exitX, exitY);
    const entryPoint = attachmentPoint(targetRect, entryX, entryY);
    const hasWaypoints = edge.waypoints.length > 0;

    // With explicit waypoints the routing is deterministic: verify the first
    // segment leaves in the exit-side normal direction.
    if (hasWaypoints) {
      const firstSegment = [exitPoint, edge.waypoints[0]];
      if (exitX === 1 && firstSegment[1].x <= firstSegment[0].x) {
        findings.push(`ERROR: edge "${edge.id}" first segment must leave the right side toward +x.`);
      }
      if (exitX === 0 && firstSegment[1].x >= firstSegment[0].x) {
        findings.push(`ERROR: edge "${edge.id}" first segment must leave the left side toward -x.`);
      }
      if (exitY === 0 && firstSegment[1].y >= firstSegment[0].y) {
        findings.push(`ERROR: edge "${edge.id}" first segment must leave the top side toward -y.`);
      }
      if (exitY === 1 && firstSegment[1].y <= firstSegment[0].y) {
        findings.push(`ERROR: edge "${edge.id}" first segment must leave the bottom side toward +y.`);
      }
    }

    // With explicit waypoints the last segment must approach the entry side
    // along its normal (perpendicular entry, not tangential).
    if (hasWaypoints) {
      const lastSegment = [edge.waypoints.at(-1), entryPoint];
      if (entryX === 0 && lastSegment[1].x <= lastSegment[0].x) {
        findings.push(`ERROR: edge "${edge.id}" last segment must enter the left side toward +x.`);
      }
      if (entryX === 1 && lastSegment[1].x >= lastSegment[0].x) {
        findings.push(`ERROR: edge "${edge.id}" last segment must enter the right side toward -x.`);
      }
      if (entryY === 0 && lastSegment[1].y >= lastSegment[0].y) {
        findings.push(`ERROR: edge "${edge.id}" last segment must approach the top side from above (toward -y).`);
      }
      if (entryY === 1 && lastSegment[1].y >= lastSegment[0].y) {
        findings.push(`ERROR: edge "${edge.id}" last segment must approach the bottom side from below (toward +y).`);
      }
    }

    // Segment sets to check. Waypoint edges are exact. Edges without waypoints
    // use the two monotone orthogonal candidates (horizontal-first and
    // vertical-first): a crossing shared by BOTH candidates means any simple
    // monotone route is blocked (ERROR); a single blocked candidate means the
    // client router may detour (WARNING) — pin it with waypoints if it matters.
    const segmentSets = hasWaypoints
      ? [[exitPoint, ...edge.waypoints, entryPoint]]
      : [
          [exitPoint, { x: entryPoint.x, y: exitPoint.y }, entryPoint],
          [exitPoint, { x: exitPoint.x, y: entryPoint.y }, entryPoint],
        ];
    // Edges legally cross their own source/target boxes and the containers
    // that own them (a child edge exits its container boundary). Everything
    // else must stay clear.
    const legalBoxIds = new Set([edge.source, edge.target]);
    for (const ancestor of [sourceBox.parent, targetBox.parent]) {
      if (ancestor && ancestor !== '1') legalBoxIds.add(ancestor);
    }
    const crossesByPath = segmentSets.map((points) => {
      const crossed = new Set();
      for (let i = 0; i < points.length - 1; i += 1) {
        const segment = [points[i], points[i + 1]];
        if (segment[0].x === segment[1].x && segment[0].y === segment[1].y) continue;
        for (const box of boxes) {
          if (legalBoxIds.has(box.id)) continue;
          const rect = absolute.get(box.id);
          if (!rect) continue;
          if (segmentIntersectsRect(segment, rect)) crossed.add(box.id);
          const borderLength = segmentOnRectBorder(segment, rect);
          if (borderLength > 2) {
            const level = hasWaypoints ? 'ERROR' : 'WARNING';
            findings.push(`${level}: edge "${edge.id}" ${hasWaypoints ? 'runs' : 'candidate runs'} along the border of box "${box.id}" (${borderLength.toFixed(1)} px).`);
          }
        }
      }
      return crossed;
    });
    const crossedIds = [...new Set(crossesByPath.flatMap((crossed) => [...crossed]))];
    if (crossedIds.length > 0) {
      if (hasWaypoints || crossesByPath.every((crossed) => crossed.size > 0)) {
        findings.push(`ERROR: edge "${edge.id}" path crosses box(es): ${crossedIds.join(', ')}. Move the box or add explicit waypoints.`);
      } else {
        findings.push(`WARNING: edge "${edge.id}" one candidate path is blocked (boxes: ${crossedIds.join(', ')}); routing may detour — add explicit waypoints to make it deterministic.`);
      }
    }

    if (hasWaypoints) {
      const points = [exitPoint, ...edge.waypoints, entryPoint];
      const segments = points.slice(0, -1).map((point, i) => [point, points[i + 1]]);
      // Every segment must be axis-aligned; a diagonal waypoint segment would
      // otherwise be silently ignored by the rect-intersection checks.
      for (const segment of segments) {
        if (segment[0].x !== segment[1].x && segment[0].y !== segment[1].y) {
          findings.push(`ERROR: edge "${edge.id}" has a non-orthogonal (diagonal) segment between (${segment[0].x},${segment[0].y}) and (${segment[1].x},${segment[1].y}).`);
        }
      }
      segments.forEach((segment, index) => edgeSegments.push({
        segment,
        sourceId: edge.source,
        targetId: edge.target,
        first: index === 0,
        approach: index >= segments.length - 2,
      }));
    }
  }

  // Edge-edge collinear overlap (deterministic waypoint segments only).
  // Exemptions (draw.io offsets the jets at shared points):
  // 1. Approach segments (last two) converging on the same target entry point.
  // 2. Short first segments (< JETTY_MAX px) leaving the same source exit
  //    point — the jetty zone. Long parallel segments sharing a source exit
  //    are NOT exempt: they are a real corridor conflict.
  const JETTY_MAX = 20;
  for (let i = 0; i < edgeSegments.length; i += 1) {
    for (let j = i + 1; j < edgeSegments.length; j += 1) {
      const left = edgeSegments[i];
      const right = edgeSegments[j];
      const overlapLength = segmentsOverlapCollinear(left.segment, right.segment);
      if (overlapLength <= 0) continue;
      if (left.approach && right.approach && left.targetId === right.targetId) continue;
      if (left.first && right.first && left.sourceId === right.sourceId && overlapLength <= JETTY_MAX) continue;
      findings.push(`ERROR: two edge segments overlap for ${overlapLength.toFixed(1)} px (keep parallel edges >= ${MIN_EDGE_GAP} px apart).`);
    }
  }

  return findings;
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((argument) => !argument.startsWith('--'));
  const minFlag = args.find((argument) => argument.startsWith('--min-font-size='));
  if (!filePath) {
    console.error('Usage: node check-drawio-layout.mjs <diagram.drawio> [--min-font-size 14]');
    process.exitCode = 2;
    return;
  }
  const minFontSize = minFlag ? Number(minFlag.split('=')[1]) : MIN_FONT_SIZE;
  try {
    const source = await readFile(filePath, 'utf8');
    const findings = checkDrawioLayout(source, { minFontSize });
    if (findings.length) {
      for (const finding of findings) console.error(`- ${finding}`);
      process.exitCode = 1;
    } else {
      console.log(`draw.io layout check passed: ${filePath}`);
    }
  } catch (error) {
    console.error(`Unable to read diagram: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
  }
}

main();
