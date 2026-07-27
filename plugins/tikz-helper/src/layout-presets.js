import { TikzRuntimeError } from './runtime-error.js';
import { SERVER_DEFAULT_LAYOUT_OPTIONS } from './elk-layout.js';

export const PRESET_NAMES = Object.freeze(['paper-column', 'paper-full', 'slide-16-9', 'slide-4-3']);
export const DENSITY_NAMES = Object.freeze(['compact', 'balanced', 'airy']);
export const DENSITY_FACTORS = Object.freeze({ compact: 0.8, balanced: 1, airy: 1.35 });
export const DENSITY_RELAYOUT_FACTOR = Object.freeze({ expand: 1.25, compact: 0.8 });
export const FILL_RATIO_EXPAND_ABOVE = 0.70;
export const FILL_RATIO_COMPACT_BELOW = 0.12;
export const MIN_COMPACT_NODE_COUNT = 4;
export const EFFECTIVE_FONT_WARNING_PT = 6;

export const LAYOUT_PRESETS = Object.freeze({
  'paper-column': Object.freeze({ direction: 'DOWN',  spacingScale: 0.85, nodeSizeMinimum: '(60, 30)',  padding: 16, fontPt: 9,  targetWidthPt: 240, aspectRatio: null,   embedding: '\\includegraphics[width=\\columnwidth]{<file>}' }),
  'paper-full':   Object.freeze({ direction: 'RIGHT', spacingScale: 1.0,  nodeSizeMinimum: '(80, 40)',  padding: 20, fontPt: 10, targetWidthPt: 504, aspectRatio: null,   embedding: '\\includegraphics[width=\\textwidth]{<file>}' }),
  'slide-16-9':   Object.freeze({ direction: 'RIGHT', spacingScale: 1.3,  nodeSizeMinimum: '(120, 56)', padding: 28, fontPt: 14, targetWidthPt: null, aspectRatio: 1.7778, embedding: '\\includegraphics[width=0.8\\linewidth]{<file>}' }),
  'slide-4-3':    Object.freeze({ direction: 'RIGHT', spacingScale: 1.3,  nodeSizeMinimum: '(110, 52)', padding: 26, fontPt: 14, targetWidthPt: null, aspectRatio: 1.3333, embedding: '\\includegraphics[width=0.8\\linewidth]{<file>}' }),
});

// The ten ELK spacing keys that density and preset spacingScale act upon.
const SPACING_KEYS = Object.freeze([
  'elk.spacing.nodeNode',
  'elk.layered.spacing.nodeNodeBetweenLayers',
  'elk.spacing.edgeNode',
  'elk.layered.spacing.edgeNodeBetweenLayers',
  'elk.spacing.edgeEdge',
  'elk.spacing.portPort',
  'elk.spacing.labelNode',
  'elk.spacing.edgeLabel',
  'elk.spacing.componentComponent',
  'elk.spacing.labelLabel',
]);
/**
 * Returns a NEW object with the ten ELK spacing keys multiplied by `factor`
 * when they are present and numeric. Non-spacing keys are copied verbatim.
 * The input object is never mutated. Each scaled value is clamped to a
 * minimum of 3pt so density compaction cannot drive spacing below the
 * threshold where orthogonal edge routing and node borders visually overlap.
 */
export function scaleSpacingKeys(layoutOptions, factor) {
  const out = { ...layoutOptions };
  for (const key of SPACING_KEYS) {
    const value = out[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = Math.max(value * factor, 3);
    }
  }
  return out;
}

/**
 * Builds the ELK layout-options object for a named preset + density.
 *
 * Merge order: copy of SERVER_DEFAULT_LAYOUT_OPTIONS -> spacing scaled by
 * (preset.spacingScale * DENSITY_FACTORS[density]) -> preset padding /
 * nodeSize.minimum / direction / edgeRouting / font.size / aspectRatio.
 *
 * Returns a plain (mutable) object so callers (generate-tikz) can merge
 * further tool-level and graph-IR options on top.
 */
export function resolvePresetLayoutOptions(preset, density = 'balanced') {
  const presetDef = LAYOUT_PRESETS[preset];
  if (!presetDef) {
    throw new TikzRuntimeError(
      'INVALID_PRESET',
      `Unknown preset "${preset}". Expected one of: paper-column, paper-full, slide-16-9, slide-4-3.`,
    );
  }
  const densityFactor = DENSITY_FACTORS[density];
  if (densityFactor === undefined) {
    throw new TikzRuntimeError(
      'INVALID_PRESET',
      `Unknown density "${density}". Expected one of: compact, balanced, airy.`,
    );
  }

  const scaled = scaleSpacingKeys(SERVER_DEFAULT_LAYOUT_OPTIONS, presetDef.spacingScale * densityFactor);

  const padding = presetDef.padding;
  const out = {
    ...scaled,
    'elk.padding': `[top=${padding},left=${padding},bottom=${padding},right=${padding}]`,
    'elk.nodeSize.minimum': presetDef.nodeSizeMinimum,
    'elk.direction': presetDef.direction,
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.font.size': presetDef.fontPt,
  };
  if (presetDef.aspectRatio !== null) {
    out['elk.aspectRatio'] = presetDef.aspectRatio;
  }
  return out;
}

/**
 * Resolves the target physical width in pt. A positive finite override wins;
 * otherwise the preset's intrinsic targetWidthPt is used; otherwise null.
 */
export function resolveTargetWidth(preset, targetWidthPt) {
  if (typeof targetWidthPt === 'number' && Number.isFinite(targetWidthPt) && targetWidthPt > 0) {
    return targetWidthPt;
  }
  const presetDef = LAYOUT_PRESETS[preset];
  if (presetDef && typeof presetDef.targetWidthPt === 'number') {
    return presetDef.targetWidthPt;
  }
  return null;
}

/**
 * Computes the fill ratio (occupied area / root area) of a positioned ELK
 * root. Returns a number in [0, 1]; 0 when the root area is not finite and
 * positive. Groups are included as their laid-out box.
 */
export function computeFillRatio(positionedRoot) {
  const rootArea = (positionedRoot && typeof positionedRoot.width === 'number' && typeof positionedRoot.height === 'number')
    ? positionedRoot.width * positionedRoot.height
    : 0;
  if (!(Number.isFinite(rootArea) && rootArea > 0)) {
    return 0;
  }
  const children = (positionedRoot && Array.isArray(positionedRoot.children)) ? positionedRoot.children : [];
  let occupied = 0;
  for (const child of children) {
    const w = typeof child.width === 'number' ? child.width : 0;
    const h = typeof child.height === 'number' ? child.height : 0;
    if (Number.isFinite(w) && Number.isFinite(h)) {
      occupied += w * h;
    }
  }
  const ratio = occupied / rootArea;
  if (!Number.isFinite(ratio)) return 0;
  if (ratio < 0) return 0;
  if (ratio > 1) return 1;
  return ratio;
}

/**
 * Decides whether a density relayout should run.
 * - 'expand' when fillRatio > FILL_RATIO_EXPAND_ABOVE (figure too dense).
 * - 'compact' when fillRatio < FILL_RATIO_COMPACT_BELOW AND nodeCount >=
 *   MIN_COMPACT_NODE_COUNT (figure too sparse for a meaningful graph).
 * - null otherwise.
 */
export function densityAdjustment(fillRatio, nodeCount) {
  if (fillRatio > FILL_RATIO_EXPAND_ABOVE) {
    return 'expand';
  }
  if (fillRatio < FILL_RATIO_COMPACT_BELOW && nodeCount >= MIN_COMPACT_NODE_COUNT) {
    return 'compact';
  }
  return null;
}

/**
 * Builds a frozen sizing report describing the uniform output scale and the
 * effective (post-scale) font size. Emits an advisory warning when the
 * effective font drops below EFFECTIVE_FONT_WARNING_PT.
 */
export function sizingReport({ preset, targetWidthPt, rootWidth, rootHeight, scale, fontPt }) {
  const warnings = [];
  const effectiveFontPt = (fontPt && scale) ? Number((fontPt * scale).toFixed(2)) : null;
  if (effectiveFontPt !== null && effectiveFontPt < EFFECTIVE_FONT_WARNING_PT) {
    warnings.push(
      `Figure is very dense for preset "${preset}": effective font ≈ ${effectiveFontPt}pt at target width. Reduce node count or labels, choose paper-full, or omit target width.`,
    );
  }
  return Object.freeze({
    preset,
    targetWidthPt,
    intrinsicWidthPt: rootWidth,
    intrinsicHeightPt: rootHeight,
    scale,
    baseFontSizePt: fontPt,
    effectiveFontPt,
    warnings,
  });
}