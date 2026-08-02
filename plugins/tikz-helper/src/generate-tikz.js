import { detectGeometryIssues } from './geometry-check.js';
import { computeLayout, countNodes, SERVER_DEFAULT_LAYOUT_OPTIONS } from './elk-layout.js';
import { elkToTikz } from './tikz-backend.js';
import {
  LAYOUT_PRESETS, resolvePresetLayoutOptions, resolveTargetWidth, computeFillRatio,
  densityAdjustment, DENSITY_FACTORS, DENSITY_RELAYOUT_FACTOR, scaleSpacingKeys, sizingReport,
} from './layout-presets.js';
import { TikzRuntimeError } from './runtime-error.js';

export async function generateTikz(input = {}, options = {}) {
  const graph = input.graph;
  const tikzOptions = input.tikzOptions ?? {};
  const preset = input.preset ?? null;
  const density = input.density ?? 'balanced';

  // Density applies to a COPY of the server-default spacing in both paths
  // (matching resolvePresetLayoutOptions precedence): SERVER_DEFAULTS <- density
  // <- tool layoutOptions <- graph IR. Explicit input.layoutOptions always win.
  const densityFactor = DENSITY_FACTORS[density];
  if (densityFactor === undefined) {
    throw new TikzRuntimeError(
      'INVALID_PRESET',
      `Unknown density "${density}". Expected one of: compact, balanced, airy.`,
    );
  }
  const presetOptions = preset
    ? resolvePresetLayoutOptions(preset, density)
    : scaleSpacingKeys(SERVER_DEFAULT_LAYOUT_OPTIONS, densityFactor);
  const merged = { ...presetOptions, ...(input.layoutOptions ?? {}) };

  let layoutResult = await computeLayout(graph, { layoutOptions: merged, importElk: options.importElk });

  // Density guard: bounded, deterministic relayouts that only change spacing.
  const densityReport = { fillRatio: computeFillRatio(layoutResult.graph), adjustments: [], relayouts: 0 };
  let budget = 2;
  let adjustment = densityAdjustment(densityReport.fillRatio, countNodes(layoutResult.graph));
  while (adjustment && budget > 0) {
    Object.assign(merged, scaleSpacingKeys(merged, DENSITY_RELAYOUT_FACTOR[adjustment]));
    densityReport.adjustments.push(adjustment);
    densityReport.relayouts += 1;
    budget -= 1;
    layoutResult = await computeLayout(graph, { layoutOptions: merged, importElk: options.importElk });
    densityReport.fillRatio = computeFillRatio(layoutResult.graph);
    adjustment = densityAdjustment(densityReport.fillRatio, countNodes(layoutResult.graph));
  }
  const geo = await detectGeometryIssues(layoutResult.graph);

  // Sizing: uniform scale so paper presets land at the target physical width.
  const presetDef = preset ? LAYOUT_PRESETS[preset] : null;
  const targetWidthPt = resolveTargetWidth(preset, input.targetWidthPt);
  const rootWidth = typeof layoutResult.graph.width === 'number' ? layoutResult.graph.width : 0;
  const rootHeight = typeof layoutResult.graph.height === 'number' ? layoutResult.graph.height : 0;
  let scale = 1;
  if (targetWidthPt && rootWidth > 0) {
    scale = Number((targetWidthPt / rootWidth).toFixed(4));
    if (Math.abs(scale - 1) <= 0.02) scale = 1; // snap: avoid pointless transform
  }
  const fontPt = presetDef ? presetDef.fontPt : (layoutResult.metadata.fontSize ?? null);
  const sizing = sizingReport({ preset, targetWidthPt, rootWidth, rootHeight, scale, fontPt });

  const tikzSource = elkToTikz(layoutResult.graph, {
    standalone: tikzOptions.standalone,
    yAxisFlip: tikzOptions.yAxisFlip,
    defaultShape: tikzOptions.defaultShape,
    defaultArrow: tikzOptions.defaultArrow,
    tikzLibraries: tikzLibrariesSafe(tikzOptions.tikzLibraries),
    preamble: tikzOptions.preamble,
    scale,
    baseFontSize: fontPt,
  });

  return {
    ok: true,
    tikz: tikzSource,
    ir: JSON.stringify(layoutResult.graph, null, 2),
    graph: layoutResult.graph,
    metadata: {
      ...layoutResult.metadata,
      density: densityReport,
      sizing,
      assets: collectIconAssets(layoutResult.graph),
      geometryIssues: geo.issues,
      geometrySummary: geo.summary,
      geometryCode: geo.code ?? null,
    },
  };
}

function tikzLibrariesSafe(value) { return Array.isArray(value) ? value : []; }

function collectIconAssets(root) {
  const assets = [];
  const seen = new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    const icon = node.properties?.icon;
    if (icon && typeof icon === 'object' && !Array.isArray(icon)) {
      const rel = typeof icon.relativePath === 'string' ? icon.relativePath : null;
      const key = `${icon.kind ?? ''}:${rel ?? ''}`;
      if (rel && !seen.has(key)) {
        seen.add(key);
        assets.push({
          relativePath: rel,
          nodeIds: [String(node.id ?? '')].filter(Boolean),
          kind: icon.kind ?? null,
          width: icon.width ?? null,
          height: icon.height ?? null,
        });
      } else if (rel && seen.has(key)) {
        const existing = assets.find((a) => `${a.kind}:${a.relativePath}` === key);
        if (existing && node.id !== undefined) existing.nodeIds.push(String(node.id));
      }
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return assets;
}

export { computeLayout, elkToTikz };