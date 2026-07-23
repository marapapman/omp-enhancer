import { TikzRuntimeError } from './runtime-error.js';

const SHAPE_MAP = Object.freeze({
  rectangle: 'rectangle',
  rect: 'rectangle',
  rounded: 'rectangle, rounded corners=2pt',
  diamond: 'diamond',
  ellipse: 'ellipse',
  circle: 'circle',
  terminal: 'rectangle, rounded corners=3pt',
  stadium: 'rectangle, rounded corners=0.5em',
  parallelogram: 'trapezium, trapezium angle=75',
  cylinder: 'cylinder, shape border rotate=90, aspect=0.25',
});

const LINE_STYLES = Object.freeze({
  solid: 'solid',
  dashed: 'dashed',
  dotted: 'dotted',
  thick: 'thick',
  'very thick': 'very thick',
  thin: 'thin',
});

const ARROW_MAP = Object.freeze({
  '->': '->',
  '<-': '<-',
  '<->': '<->',
  '-': '-',
});

function tikzId(raw) {
  const cleaned = String(raw).replace(/[^a-zA-Z0-9_:-]/g, '_');
  return cleaned === '' ? 'node' : cleaned;
}

function tikzColor(value) {
  if (!value) return null;
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(value) ? `{rgb,255:red,${parseInt(value.slice(1, 3), 16)};green,${parseInt(value.slice(3, 5), 16)};blue,${parseInt(value.slice(5, 7), 16)}}` : value;
}

function pt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n}pt` : '0pt';
}

function compileNodeStyle(node, options) {
  const props = node.properties ?? {};
  const parts = ['draw'];

  const shapeName = props.shape ?? options.defaultShape ?? 'rectangle';
  const tikzShape = SHAPE_MAP[shapeName];
  if (tikzShape) {
    parts.push(tikzShape);
  } else {
    parts.push(SHAPE_MAP.rectangle);
  }

  if (props.fill) {
    const color = tikzColor(props.fill);
    if (color) parts.push(`fill=${color}`);
  }
  if (props.draw) {
    const color = tikzColor(props.draw);
    if (color) parts.push(color);
  }
  if (props.textColor) {
    const color = tikzColor(props.textColor);
    if (color) parts.push(`text=${color}`);
  }
  if (props.dashed) parts.push('dashed');
  if (props.dotted) parts.push('dotted');
  if (props.lineWidth && LINE_STYLES[props.lineWidth]) {
    parts.push(LINE_STYLES[props.lineWidth]);
  }
  if (props.innerSep !== undefined) {
    parts.push(`inner sep=${pt(props.innerSep)}`);
  }
  if (props.fontSize) {
    parts.push(`font=\\fontsize{${props.fontSize}}{${Math.round(props.fontSize * 1.2)}}\\selectfont`);
  }

  return parts.join(', ');
}

function escapeLatex(text) {
  return String(text)
    .replace(/\\/g, '\\textbackslash ')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/_/g, '\\_')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/~/g, '\\textasciitilde ')
    .replace(/\^/g, '\\textasciicircum ');
}

function nodeLabel(node) {
  const labels = node.labels ?? [];
  const props = node.properties ?? {};
  if (props.label) return escapeLatex(props.label);
  if (labels.length > 0 && labels[0].text) return escapeLatex(labels[0].text);
  return tikzId(node.id);
}

function generateNodesRecursive(root, level, output, options, offsetX = 0, offsetY = 0, fitCommands = null) {
  const children = root.children ?? [];

  for (const node of children) {
    const padding = '  '.repeat(level + 1);
    const id = tikzId(node.id);
    const x = (node.x ?? 0) + offsetX;
    const y = (node.y ?? 0) + offsetY;
    const finalY = options.yAxisFlip ? -y : y;
    const style = compileNodeStyle(node, options);
    const label = nodeLabel(node);

    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const childIds = hasChildren ? node.children.map((c) => {
      const cid = tikzId(c.id);
      return (Array.isArray(c.children) && c.children.length > 0) ? `${cid}-bg` : cid;
    }) : [];

    if (hasChildren) {
      // Recurse into children first (defines their node IDs for fit reference)
      generateNodesRecursive(node, level + 2, output, options, x, y, fitCommands);

      // Group label
      output.push(`${padding}\\node[${style}, inner sep=2pt] (${id}) at (${pt(x)}, ${pt(finalY)}) {${label}};`);

      // Collect fit background command — will be emitted in parent-before-child order
      if (fitCommands) {
        fitCommands.push(`${padding}  \\node[draw, dashed, fill=gray!10, fit={(${id}) ${childIds.map(id => `(${id})`).join(' ')}}] (${id}-bg) {};`);
      }
    } else {
      output.push(`${padding}\\node[${style}] (${id}) at (${pt(x)}, ${pt(finalY)}) {${label}};`);
    }
  }
}

function compileEdgeStyle(edge, options) {
  const props = edge.properties ?? {};
  const parts = [];

  const arrow = ARROW_MAP[props.arrow] ?? options.defaultArrow ?? '->';
  parts.push(arrow);

  if (props.line && LINE_STYLES[props.line]) {
    parts.push(LINE_STYLES[props.line]);
  }
  if (props.color) {
    const color = tikzColor(props.color);
    if (color) parts.push(color);
  }
  if (props.dashed) parts.push('dashed');
  if (props.dotted) parts.push('dotted');
  if (props.lineWidth && LINE_STYLES[props.lineWidth]) {
    parts.push(LINE_STYLES[props.lineWidth]);
  }

  return parts.join(', ');
}

function edgeLabel(edge) {
  const labels = edge.labels ?? [];
  const props = edge.properties ?? {};
  if (props.label) return escapeLatex(props.label);
  if (labels.length > 0 && labels[0].text) return escapeLatex(labels[0].text);
  return null;
}

function edgeLabelPosition(edge) {
  const props = edge.properties ?? {};
  return props.labelPosition ?? 'above';
}

function generateEdges(root, output, options, offsetX = 0, offsetY = 0) {
  const edges = root.edges ?? [];

  for (const edge of edges) {
    const padding = '  ';
    const source = edge.sources[0];
    const target = edge.targets[0];
    const sourceId = tikzId(source);
    const targetId = tikzId(target);
    const style = compileEdgeStyle(edge, options);
    const label = edgeLabel(edge);
    const sections = edge.sections ?? [];

    if (sections.length > 0) {
      const points = [];
      for (const section of sections) {
        if (section.startPoint) {
          const sx = section.startPoint.x + offsetX;
          const sy = options.yAxisFlip ? -(section.startPoint.y + offsetY) : section.startPoint.y + offsetY;
          const isSourceAnchor = section.incomingShape === source;
          if (!isSourceAnchor) {
            points.push(`${pt(sx)}, ${pt(sy)}`);
          }
        }
        for (const bp of section.bendPoints ?? []) {
          const bx = bp.x + offsetX;
          const by = options.yAxisFlip ? -(bp.y + offsetY) : bp.y + offsetY;
          points.push(`${pt(bx)}, ${pt(by)}`);
        }
        if (section.endPoint) {
          const ex = section.endPoint.x + offsetX;
          const ey = options.yAxisFlip ? -(section.endPoint.y + offsetY) : section.endPoint.y + offsetY;
          const isTargetAnchor = section.outgoingShape === target;
          if (!isTargetAnchor) {
            points.push(`${pt(ex)}, ${pt(ey)}`);
          }
        }
      }

      if (points.length === 0) {
        output.push(`${padding}\\draw[${style}] (${sourceId}) -- (${targetId})${label ? ` node[${edgeLabelPosition(edge)}, font=\\small] {${label}}` : ''};`);
      } else {
        const coords = points.map((p) => `(${p})`).join(' -- ');
        output.push(`${padding}\\draw[${style}] (${sourceId}) -- ${coords} -- (${targetId})${label ? ` node[${edgeLabelPosition(edge)}, font=\\small] {${label}}` : ''};`);
      }
    } else {
      output.push(`${padding}\\draw[${style}] (${sourceId}) -- (${targetId})${label ? ` node[${edgeLabelPosition(edge)}, font=\\small] {${label}}` : ''};`);
    }
  }

  // Recurse into group nodes for their internal edges
  const children = root.children ?? [];
  for (const node of children) {
    if (Array.isArray(node.children) && node.children.length > 0) {
      // Accumulate group's position offset for its relative edge coordinates
      const childOffsetX = offsetX + (node.x ?? 0);
      const childOffsetY = offsetY + (node.y ?? 0);
      generateEdges(node, output, options, childOffsetX, childOffsetY);
    }
  }
}

function hasGroups(root) {
  const children = root.children ?? [];
  for (const node of children) {
    if (Array.isArray(node.children) && node.children.length > 0) return true;
  }
  return false;
}

function detectIdCollisions(root) {
  const seen = new Set();
  const RESERVED_SUFFIX = '-bg';
  function walk(node) {
    for (const child of node.children ?? []) {
      const sanitized = tikzId(child.id);
      if (typeof child.id === 'string' && sanitized !== child.id && seen.has(sanitized)) {
        throw new TikzRuntimeError('TIKZ_GENERATION_ERROR', `Node ID collision after sanitization: "${child.id}" and another node both map to "${sanitized}". Use simpler IDs.`);
      }
      if (seen.has(sanitized + RESERVED_SUFFIX)) {
        throw new TikzRuntimeError('TIKZ_GENERATION_ERROR', `Node ID "${child.id}" conflicts with generated fit node name "${sanitized}${RESERVED_SUFFIX}" (from another node). Shorten or rename.`);
      }
      if (sanitized.endsWith(RESERVED_SUFFIX) && seen.has(sanitized.slice(0, -RESERVED_SUFFIX.length))) {
        throw new TikzRuntimeError('TIKZ_GENERATION_ERROR', `Node ID "${child.id}" ends with "${RESERVED_SUFFIX}" which conflicts with generated fit node naming.`);
      }
      seen.add(sanitized);
      // Only reserve -bg for nodes that generate a fit background (have children)
      const isGroup = Array.isArray(child.children) && child.children.length > 0;
      if (isGroup) seen.add(sanitized + RESERVED_SUFFIX);
      if (Array.isArray(child.children)) walk(child);
    }
  }
  walk(root);
}

export function elkToTikz(layoutResult, options = {}) {
  if (!layoutResult || typeof layoutResult !== 'object') {
    throw new TikzRuntimeError('TIKZ_GENERATION_ERROR', 'Layout result must be a non-null object.');
  }
  if (!Array.isArray(layoutResult.children)) {
    throw new TikzRuntimeError('TIKZ_GENERATION_ERROR', 'Layout result must contain a children array.');
  }

  detectIdCollisions(layoutResult);

  const opts = {
    yAxisFlip: options.yAxisFlip ?? true,
    standalone: options.standalone ?? true,
    defaultShape: options.defaultShape ?? 'rectangle',
    defaultArrow: options.defaultArrow ?? '->',
    preamble: options.preamble ?? null,
    tikzLibraries: options.tikzLibraries ?? [],
  };
  const lines = [];
  const fitCommands = [];
  const needFit = hasGroups(layoutResult);

  if (opts.standalone) {
    lines.push('\\documentclass[tikz]{standalone}');
    lines.push('\\usepackage{tikz}');
    const coreLibs = ['arrows.meta', 'positioning', 'shapes'];
    if (needFit) coreLibs.push('fit', 'backgrounds');
    for (const lib of [...new Set([...coreLibs, ...opts.tikzLibraries])]) {
      lines.push(`\\usetikzlibrary{${lib}}`);
    }
    if (opts.preamble) {
      lines.push(opts.preamble);
    }
    lines.push('\\begin{document}');
  }

  lines.push('\\begin{tikzpicture}[node distance=0pt, anchor=north west, every node/.style={inner sep=0pt, outer sep=0pt}]');
  generateNodesRecursive(layoutResult, 0, lines, opts, 0, 0, fitCommands);
  generateEdges(layoutResult, lines, opts);

  // Emit fit backgrounds in collection order (children first, parents last)
  // so -bg nodes are defined before parent fit nodes reference them.
  // The parent's gray!10 fill may cover the child's dashed border at overlap.
  if (fitCommands.length > 0) {
    lines.push('\\begin{scope}[on background layer]');
    for (let i = 0; i < fitCommands.length; i += 1) {
      lines.push(fitCommands[i]);
    }
    lines.push('\\end{scope}');
  }

  lines.push('\\end{tikzpicture}');


  if (opts.standalone) {
    lines.push('\\end{document}');
  }

  return lines.join('\n') + '\n';
}
