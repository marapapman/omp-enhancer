import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { TikzRuntimeError } from '../src/runtime-error.js';
import { SERVER_DEFAULT_LAYOUT_OPTIONS } from '../src/elk-layout.js';
import {
  PRESET_NAMES,
  DENSITY_NAMES,
  DENSITY_FACTORS,
  DENSITY_RELAYOUT_FACTOR,
  FILL_RATIO_EXPAND_ABOVE,
  FILL_RATIO_COMPACT_BELOW,
  MIN_COMPACT_NODE_COUNT,
  EFFECTIVE_FONT_WARNING_PT,
  LAYOUT_PRESETS,
  resolvePresetLayoutOptions,
  scaleSpacingKeys,
  resolveTargetWidth,
  computeFillRatio,
  densityAdjustment,
  sizingReport,
} from '../src/layout-presets.js';

describe('layout-presets: frozen constants', () => {
  it('PRESET_NAMES, DENSITY_NAMES, DENSITY_FACTORS, DENSITY_RELAYOUT_FACTOR are frozen', () => {
    assert.ok(Object.isFrozen(PRESET_NAMES));
    assert.ok(Object.isFrozen(DENSITY_NAMES));
    assert.ok(Object.isFrozen(DENSITY_FACTORS));
    assert.ok(Object.isFrozen(DENSITY_RELAYOUT_FACTOR));
  });

  it('LAYOUT_PRESETS is frozen and each preset is frozen', () => {
    assert.ok(Object.isFrozen(LAYOUT_PRESETS));
    for (const name of PRESET_NAMES) {
      assert.ok(Object.isFrozen(LAYOUT_PRESETS[name]), `preset ${name} should be frozen`);
    }
  });

  it('exposes the four expected preset names and three density names', () => {
    assert.deepEqual([...PRESET_NAMES], ['paper-column', 'paper-full', 'slide-16-9', 'slide-4-3']);
    assert.deepEqual([...DENSITY_NAMES], ['compact', 'balanced', 'airy']);
  });

  it('DENSITY_FACTORS has the expected values', () => {
    assert.equal(DENSITY_FACTORS.compact, 0.8);
    assert.equal(DENSITY_FACTORS.balanced, 1);
    assert.equal(DENSITY_FACTORS.airy, 1.35);
  });

  it('DENSITY_RELAYOUT_FACTOR has the expected values', () => {
    assert.equal(DENSITY_RELAYOUT_FACTOR.expand, 1.25);
    assert.equal(DENSITY_RELAYOUT_FACTOR.compact, 0.8);
  });

  it('threshold constants have expected values', () => {
    assert.equal(FILL_RATIO_EXPAND_ABOVE, 0.70);
    assert.equal(FILL_RATIO_COMPACT_BELOW, 0.12);
    assert.equal(MIN_COMPACT_NODE_COUNT, 4);
    assert.equal(EFFECTIVE_FONT_WARNING_PT, 6);
  });

  it('slide presets carry aspectRatio and null targetWidthPt', () => {
    assert.equal(LAYOUT_PRESETS['slide-16-9'].aspectRatio, 1.7778);
    assert.equal(LAYOUT_PRESETS['slide-16-9'].targetWidthPt, null);
    assert.equal(LAYOUT_PRESETS['slide-4-3'].aspectRatio, 1.3333);
    assert.equal(LAYOUT_PRESETS['slide-4-3'].targetWidthPt, null);
  });

  it('paper presets carry null aspectRatio and a numeric targetWidthPt', () => {
    assert.equal(LAYOUT_PRESETS['paper-column'].aspectRatio, null);
    assert.equal(LAYOUT_PRESETS['paper-column'].targetWidthPt, 240);
    assert.equal(LAYOUT_PRESETS['paper-full'].aspectRatio, null);
    assert.equal(LAYOUT_PRESETS['paper-full'].targetWidthPt, 504);
  });
});

describe('layout-presets: resolvePresetLayoutOptions', () => {
  it('paper-column balanced scales nodeNode to 42*0.85=35.7 and sets preset fields', () => {
    const opts = resolvePresetLayoutOptions('paper-column', 'balanced');
    assert.ok(Math.abs(opts['elk.spacing.nodeNode'] - 35.7) < 1e-6);
    assert.equal(opts['elk.padding'], '[top=16,left=16,bottom=16,right=16]');
    assert.equal(opts['elk.direction'], 'DOWN');
    assert.equal(opts['elk.edgeRouting'], 'ORTHOGONAL');
    assert.equal(opts['elk.font.size'], 9);
    assert.equal(opts['elk.nodeSize.minimum'], '(60, 30)');
    // aspectRatio null for paper presets -> key absent
    assert.equal(opts['elk.aspectRatio'], undefined);
  });

  it('paper-column airy scales nodeNode to 42*0.85*1.35=48.195', () => {
    const opts = resolvePresetLayoutOptions('paper-column', 'airy');
    assert.equal(opts['elk.spacing.nodeNode'], 48.195);
  });

  it('scales all ten spacing keys by spacingScale * density factor', () => {
    const opts = resolvePresetLayoutOptions('paper-full', 'balanced');
    // paper-full spacingScale 1.0, balanced factor 1 -> 1:1 with server defaults
    assert.equal(opts['elk.spacing.nodeNode'], 42);
    assert.equal(opts['elk.layered.spacing.nodeNodeBetweenLayers'], 42);
    assert.equal(opts['elk.spacing.edgeNode'], 20);
    assert.equal(opts['elk.layered.spacing.edgeNodeBetweenLayers'], 20);
    assert.equal(opts['elk.spacing.edgeEdge'], 12);
    assert.equal(opts['elk.spacing.portPort'], 12);
    assert.equal(opts['elk.spacing.labelNode'], 8);
    assert.equal(opts['elk.spacing.edgeLabel'], 10);
    assert.equal(opts['elk.spacing.componentComponent'], 34);
    assert.equal(opts['elk.spacing.labelLabel'], 5);
  });

  it('slide-16-9 sets aspectRatio and larger spacing via scale 1.3', () => {
    const opts = resolvePresetLayoutOptions('slide-16-9', 'balanced');
    assert.equal(opts['elk.aspectRatio'], 1.7778);
    assert.equal(opts['elk.direction'], 'RIGHT');
    assert.equal(opts['elk.font.size'], 14);
    assert.equal(opts['elk.nodeSize.minimum'], '(120, 56)');
    assert.equal(opts['elk.padding'], '[top=28,left=28,bottom=28,right=28]');
    // 42 * 1.3 * 1 = 54.6
    assert.equal(opts['elk.spacing.nodeNode'], 54.6);
  });
  it('compact density reduces spacing (paper-column compact: 42*0.85*0.8=28.56)', () => {
    const opts = resolvePresetLayoutOptions('paper-column', 'compact');
    assert.ok(Math.abs(opts['elk.spacing.nodeNode'] - 28.56) < 1e-6);
  });
  it('defaults density to balanced when omitted', () => {
    const opts = resolvePresetLayoutOptions('paper-column');
    assert.ok(Math.abs(opts['elk.spacing.nodeNode'] - 35.7) < 1e-6);
  });

  it('preserves non-spacing server defaults (nodeSize.constraints, compaction, randomSeed, font, nodeLabels, feedbackEdges)', () => {
    const opts = resolvePresetLayoutOptions('paper-full', 'balanced');
    assert.equal(opts['elk.nodeSize.constraints'], SERVER_DEFAULT_LAYOUT_OPTIONS['elk.nodeSize.constraints']);
    assert.equal(opts['elk.layered.unnecessaryBendpoints'], true);
    assert.equal(opts['elk.layered.compaction.postCompaction.strategy'], 'EDGE_LENGTH');
    assert.equal(opts['elk.layered.compaction.connectedComponents'], true);
    assert.equal(opts['elk.randomSeed'], 1);
    assert.equal(opts['elk.nodeLabels.placement'], 'INSIDE H_CENTER V_CENTER');
    assert.equal(opts['elk.layered.feedbackEdges'], true);
  });

  it('returns a plain (non-frozen) object so callers may merge further', () => {
    const opts = resolvePresetLayoutOptions('paper-column', 'balanced');
    assert.ok(!Object.isFrozen(opts));
    opts['elk.spacing.nodeNode'] = 999;
    assert.equal(opts['elk.spacing.nodeNode'], 999);
  });

  it('throws INVALID_PRESET for unknown preset "poster"', () => {
    assert.throws(
      () => resolvePresetLayoutOptions('poster', 'balanced'),
      (err) => {
        assert.ok(err instanceof TikzRuntimeError);
        assert.equal(err.code, 'INVALID_PRESET');
        assert.match(err.message, /Unknown preset "poster"/);
        assert.match(err.message, /paper-column, paper-full, slide-16-9, slide-4-3/);
        return true;
      },
    );
  });

  it('throws INVALID_PRESET for unknown density "huge"', () => {
    assert.throws(
      () => resolvePresetLayoutOptions('paper-column', 'huge'),
      (err) => {
        assert.ok(err instanceof TikzRuntimeError);
        assert.equal(err.code, 'INVALID_PRESET');
        assert.match(err.message, /Unknown density "huge"/);
        assert.match(err.message, /compact, balanced, airy/);
        return true;
      },
    );
  });
});

describe('layout-presets: scaleSpacingKeys', () => {
  it('multiplies all ten spacing keys and leaves others untouched', () => {
    const input = {
      'elk.spacing.nodeNode': 50,
      'elk.layered.spacing.nodeNodeBetweenLayers': 50,
      'elk.spacing.edgeNode': 25,
      'elk.layered.spacing.edgeNodeBetweenLayers': 25,
      'elk.spacing.edgeEdge': 15,
      'elk.spacing.portPort': 15,
      'elk.spacing.labelNode': 10,
      'elk.spacing.edgeLabel': 12,
      'elk.spacing.componentComponent': 40,
      'elk.spacing.labelLabel': 5,
      'elk.padding': '[top=20,left=20,bottom=20,right=20]',
      'elk.direction': 'DOWN',
    };
    const out = scaleSpacingKeys(input, 2);
    assert.equal(out['elk.spacing.nodeNode'], 100);
    assert.equal(out['elk.layered.spacing.nodeNodeBetweenLayers'], 100);
    assert.equal(out['elk.spacing.edgeNode'], 50);
    assert.equal(out['elk.layered.spacing.edgeNodeBetweenLayers'], 50);
    assert.equal(out['elk.spacing.edgeEdge'], 30);
    assert.equal(out['elk.spacing.portPort'], 30);
    assert.equal(out['elk.spacing.labelNode'], 20);
    assert.equal(out['elk.spacing.edgeLabel'], 24);
    assert.equal(out['elk.spacing.componentComponent'], 80);
    assert.equal(out['elk.spacing.labelLabel'], 10);
    // non-spacing keys preserved verbatim
    assert.equal(out['elk.padding'], '[top=20,left=20,bottom=20,right=20]');
    assert.equal(out['elk.direction'], 'DOWN');
  });

  it('does not mutate the input object', () => {
    const input = { 'elk.spacing.nodeNode': 50, 'elk.padding': 'X' };
    const snapshot = { ...input };
    scaleSpacingKeys(input, 3);
    assert.deepEqual(input, snapshot);
  });

  it('ignores absent spacing keys (returns only present keys)', () => {
    const input = { 'elk.spacing.nodeNode': 50, 'elk.direction': 'DOWN' };
    const out = scaleSpacingKeys(input, 2);
    assert.equal(out['elk.spacing.nodeNode'], 100);
    assert.equal(out['elk.direction'], 'DOWN');
    assert.equal(out['elk.spacing.edgeNode'], undefined);
  });

  it('ignores non-numeric spacing values (keeps them verbatim)', () => {
    const input = { 'elk.spacing.nodeNode': 'wide', 'elk.spacing.edgeNode': 25 };
    const out = scaleSpacingKeys(input, 2);
    assert.equal(out['elk.spacing.nodeNode'], 'wide');
    assert.equal(out['elk.spacing.edgeNode'], 50);
  });

  it('returns a new object (not the input reference)', () => {
    const input = { 'elk.spacing.nodeNode': 50 };
    const out = scaleSpacingKeys(input, 1);
    assert.notEqual(out, input);
  });

  it('clamps scaled spacing to a minimum of 3 (floor guard)', () => {
    const out = scaleSpacingKeys({ 'elk.spacing.nodeNode': 2, 'elk.spacing.edgeNode': 1 }, 0.5);
    assert.equal(out['elk.spacing.nodeNode'], 3);
    assert.equal(out['elk.spacing.edgeNode'], 3);
  });
});

describe('layout-presets: resolveTargetWidth', () => {
  it('positive finite override wins over preset default', () => {
    assert.equal(resolveTargetWidth('paper-column', 300), 300);
  });

  it('falls back to preset targetWidthPt when override absent', () => {
    assert.equal(resolveTargetWidth('paper-column', null), 240);
    assert.equal(resolveTargetWidth('paper-column', undefined), 240);
    assert.equal(resolveTargetWidth('paper-full', null), 504);
  });

  it('returns null for slide presets (no intrinsic target width)', () => {
    assert.equal(resolveTargetWidth('slide-16-9', null), null);
    assert.equal(resolveTargetWidth('slide-4-3', null), null);
  });

  it('returns null for unknown preset with no override', () => {
    assert.equal(resolveTargetWidth('poster', null), null);
    assert.equal(resolveTargetWidth('poster', undefined), null);
  });

  it('override still wins for slide presets', () => {
    assert.equal(resolveTargetWidth('slide-16-9', 400), 400);
  });

  it('non-positive or non-finite override falls back to preset default', () => {
    assert.equal(resolveTargetWidth('paper-column', 0), 240);
    assert.equal(resolveTargetWidth('paper-column', -10), 240);
    assert.equal(resolveTargetWidth('paper-column', NaN), 240);
    assert.equal(resolveTargetWidth('paper-column', Infinity), 240);
  });
});

describe('layout-presets: computeFillRatio', () => {
  it('sums child areas over root area', () => {
    const root = { width: 10, height: 10, children: [
      { width: 4, height: 5 },   // 20
      { width: 2, height: 10 },  // 20 -> total 40 of 100
    ] };
    assert.equal(computeFillRatio(root), 0.4);
  });

  it('returns 0 when root area is not finite-positive', () => {
    assert.equal(computeFillRatio({ width: 0, height: 10, children: [{ width: 5, height: 5 }] }), 0);
    assert.equal(computeFillRatio({ width: 10, height: 0, children: [{ width: 5, height: 5 }] }), 0);
    assert.equal(computeFillRatio({ width: -1, height: 10, children: [{ width: 5, height: 5 }] }), 0);
    assert.equal(computeFillRatio({ width: NaN, height: 10, children: [{ width: 5, height: 5 }] }), 0);
    assert.equal(computeFillRatio({ width: Infinity, height: 10, children: [{ width: 5, height: 5 }] }), 0);
  });

  it('returns 0 when root has no children', () => {
    assert.equal(computeFillRatio({ width: 10, height: 10, children: [] }), 0);
    assert.equal(computeFillRatio({ width: 10, height: 10 }), 0);
  });

  it('treats children without finite dimensions as zero area', () => {
    const root = { width: 10, height: 10, children: [
      { width: 4, height: 5 },          // 20
      { width: 'x', height: 5 },        // 0 (non-numeric)
      { height: 5 },                    // 0 (missing width)
    ] };
    assert.equal(computeFillRatio(root), 0.2);
  });

  it('clamps ratio to [0,1] when children exceed root area', () => {
    const root = { width: 10, height: 10, children: [
      { width: 20, height: 20 },  // 400 of 100
    ] };
    assert.equal(computeFillRatio(root), 1);
  });
});

describe('layout-presets: densityAdjustment', () => {
  it('returns expand when fillRatio > 0.70', () => {
    assert.equal(densityAdjustment(0.71, 4), 'expand');
    assert.equal(densityAdjustment(0.9, 10), 'expand');
  });

  it('returns null at exactly the expand threshold (not strictly greater)', () => {
    assert.equal(densityAdjustment(0.70, 4), null);
    assert.equal(densityAdjustment(0.60, 4), null);
  });

  it('returns compact when fillRatio < 0.12 and nodeCount >= 4', () => {
    assert.equal(densityAdjustment(0.11, 4), 'compact');
    assert.equal(densityAdjustment(0.10, 8), 'compact');
  });

  it('returns null when fillRatio < 0.12 but nodeCount < 4', () => {
    assert.equal(densityAdjustment(0.11, 3), null);
    assert.equal(densityAdjustment(0.10, 1), null);
  });

  it('returns null at exactly the compact threshold (not strictly less)', () => {
    assert.equal(densityAdjustment(0.12, 4), null);
    assert.equal(densityAdjustment(0.15, 4), null);
  });

  it('returns null for mid-range fillRatio', () => {
    assert.equal(densityAdjustment(0.30, 4), null);
    assert.equal(densityAdjustment(0.50, 6), null);
    assert.equal(densityAdjustment(0.65, 6), null);
  });
});

describe('layout-presets: sizingReport', () => {
  it('computes effectiveFontPt = fontPt * scale and freezes the result', () => {
    const report = sizingReport({
      preset: 'paper-column',
      targetWidthPt: 240,
      rootWidth: 300,
      rootHeight: 200,
      scale: 0.8,
      fontPt: 9,
    });
    assert.equal(report.preset, 'paper-column');
    assert.equal(report.targetWidthPt, 240);
    assert.equal(report.intrinsicWidthPt, 300);
    assert.equal(report.intrinsicHeightPt, 200);
    assert.equal(report.scale, 0.8);
    assert.equal(report.baseFontSizePt, 9);
    assert.equal(report.effectiveFontPt, Number((9 * 0.8).toFixed(2))); // 7.2
    assert.deepEqual(report.warnings, []);
    assert.ok(Object.isFrozen(report));
  });

  it('warns when effectiveFontPt drops below 6pt', () => {
    const report = sizingReport({
      preset: 'paper-column',
      targetWidthPt: 240,
      rootWidth: 600,
      rootHeight: 400,
      scale: 0.5,
      fontPt: 9,
    });
    // effectiveFontPt = 9 * 0.5 = 4.5 < 6
    assert.equal(report.effectiveFontPt, 4.5);
    assert.ok(report.warnings.length >= 1, 'should emit at least one warning');
    assert.match(report.warnings[0], /very dense for preset "paper-column"/);
    assert.match(report.warnings[0], /effective font/);
    assert.match(report.warnings[0], /4\.5pt/);
  });

  it('does not warn when effective font is at or above 6pt', () => {
    const report = sizingReport({
      preset: 'paper-full',
      targetWidthPt: 504,
      rootWidth: 500,
      rootHeight: 300,
      scale: 1,
      fontPt: 10,
    });
    // effectiveFontPt = 10 * 1 = 10 >= 6
    assert.equal(report.effectiveFontPt, 10);
    assert.deepEqual(report.warnings, []);
  });

  it('returns null effectiveFontPt when fontPt is null', () => {
    const report = sizingReport({
      preset: null,
      targetWidthPt: null,
      rootWidth: 300,
      rootHeight: 200,
      scale: 1,
      fontPt: null,
    });
    assert.equal(report.baseFontSizePt, null);
    assert.equal(report.effectiveFontPt, null);
    assert.deepEqual(report.warnings, []);
    assert.ok(Object.isFrozen(report));
  });

  it('returns null effectiveFontPt when scale is null/0/falsy', () => {
    const r0 = sizingReport({ preset: 'paper-column', targetWidthPt: 240, rootWidth: 300, rootHeight: 200, scale: 0, fontPt: 9 });
    assert.equal(r0.effectiveFontPt, null);
    const rNull = sizingReport({ preset: 'paper-column', targetWidthPt: 240, rootWidth: 300, rootHeight: 200, scale: null, fontPt: 9 });
    assert.equal(rNull.effectiveFontPt, null);
  });
});