import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { workflowCatalog } from '../plugins/omp-enhancer-core/src/workflows/catalog.js';

const SKILL_MD_PATH = new URL('../plugins/tikz-helper/skills/tikz-diagram/SKILL.md', import.meta.url);

// Read SKILL.md and verify the two-stage chain order: asset chain before figure chain.
test('diagram.tikz SKILL.md chain order is asset chain before figure chain, then loop', () => {
  const skillMd = readFileSync(SKILL_MD_PATH, 'utf-8');

  // Asset-chain markers in order
  const designerBlueprintIdx = skillMd.indexOf('Designer blueprint checkpoint');
  const taskAssetIdx = skillMd.indexOf('Task asset checkpoint');
  const visionerAssetReviewIdx = skillMd.indexOf('Visioner asset-review checkpoint');

  // Figure-chain markers in order
  const designerLayoutIdx = skillMd.indexOf('Designer ELK IR checkpoint');
  const taskRenderIdx = skillMd.indexOf('Task render checkpoint');
  const visionerFigureReviewIdx = skillMd.indexOf('Visioner figure-review checkpoint');

  // Loop marker
  const loopIdx = skillMd.indexOf('Designer-visioner loop');

  assert.ok(designerBlueprintIdx >= 0, 'SKILL.md must contain "Designer blueprint checkpoint"');
  assert.ok(taskAssetIdx >= 0, 'SKILL.md must contain "Task asset checkpoint"');
  assert.ok(visionerAssetReviewIdx >= 0, 'SKILL.md must contain "Visioner asset-review checkpoint"');
  assert.ok(designerLayoutIdx >= 0, 'SKILL.md must contain "Designer ELK IR checkpoint"');
  assert.ok(taskRenderIdx >= 0, 'SKILL.md must contain "Task render checkpoint"');
  assert.ok(visionerFigureReviewIdx >= 0, 'SKILL.md must contain "Visioner figure-review checkpoint"');
  assert.ok(loopIdx >= 0, 'SKILL.md must contain "Designer-visioner loop"');

  // Asset chain order
  assert.ok(
    designerBlueprintIdx < taskAssetIdx && taskAssetIdx < visionerAssetReviewIdx,
    'Asset chain must appear in order: Designer blueprint < Task asset < Visioner asset-review',
  );

  // Figure chain order
  assert.ok(
    designerLayoutIdx < taskRenderIdx && taskRenderIdx < visionerFigureReviewIdx,
    'Figure chain must appear in order: Designer layout < Task render < Visioner figure-review',
  );

  // Asset chain runs before figure chain, then loop
  assert.ok(
    visionerAssetReviewIdx < designerLayoutIdx,
    'Asset chain must end before figure chain begins (Visioner asset-review < Designer layout)',
  );
  assert.ok(
    visionerFigureReviewIdx < loopIdx,
    'Loop must appear after figure-chain review (Visioner figure-review < Designer-visioner loop)',
  );
});

test('diagram.tikz delegation order is asset chain before figure chain, then loop', () => {
  const tikz = workflowCatalog['diagram.tikz'];
  const delegation = tikz.delegation;

  // Asset-chain steps: designer=step-2 (blueprint), task=step-3 (assets), visioner=step-4 (asset review)
  const designerBlueprintSteps = delegation.filter(d => /step-2: designer/.test(d));
  const taskAssetSteps = delegation.filter(d => /step-3: task/.test(d));
  const visionerAssetReviewSteps = delegation.filter(d => /step-4: visioner/.test(d));

  // Figure-chain steps: designer=step-5 (ELK layout), task=step-6 (render), visioner=step-7 (figure review)
  const designerLayoutSteps = delegation.filter(d => /step-5: designer/.test(d));
  const taskRenderSteps = delegation.filter(d => /step-6: task/.test(d));
  const visionerFigureReviewSteps = delegation.filter(d => /step-7: visioner/.test(d));

  // Loop step: step-8
  const loopStep = delegation.filter(d => /step-8: designer applies/.test(d));

  assert.ok(designerBlueprintSteps.length === 1, 'designer should own step-2 (asset blueprint)');
  assert.ok(taskAssetSteps.length === 1, 'task should own step-3 (asset preparation)');
  assert.ok(visionerAssetReviewSteps.length === 1, 'visioner should own step-4 (asset review)');
  assert.ok(designerLayoutSteps.length === 1, 'designer should own step-5 (ELK layout)');
  assert.ok(taskRenderSteps.length === 1, 'task should own step-6 (render)');
  assert.ok(visionerFigureReviewSteps.length === 1, 'visioner should own step-7 (figure review)');
  assert.ok(loopStep.length === 1, 'step-8 should be the designer-visioner loop');

  // Verify order in delegation array: step-2 < step-3 < step-4 < step-5 < step-6 < step-7 < step-8
  const d2 = delegation.findIndex(d => d.startsWith('step-2:'));
  const d3 = delegation.findIndex(d => d.startsWith('step-3:'));
  const d4 = delegation.findIndex(d => d.startsWith('step-4:'));
  const d5 = delegation.findIndex(d => d.startsWith('step-5:'));
  const d6 = delegation.findIndex(d => d.startsWith('step-6:'));
  const d7 = delegation.findIndex(d => d.startsWith('step-7:'));
  const d8 = delegation.findIndex(d => d.startsWith('step-8:'));

  assert.ok(
    d2 >= 0 && d3 >= 0 && d4 >= 0 && d5 >= 0 && d6 >= 0 && d7 >= 0 && d8 >= 0,
    'All step-2 through step-8 delegation entries must exist',
  );
  assert.ok(
    d2 < d3 && d3 < d4 && d4 < d5 && d5 < d6 && d6 < d7 && d7 < d8,
    'Delegation steps must be in order: step-2 < step-3 < step-4 < step-5 < step-6 < step-7 < step-8',
  );
});

test('SKILL.md and core scopeNotes both contain permission boundary semantics', () => {
  const skillMd = readFileSync(SKILL_MD_PATH, 'utf-8');
  const scope = workflowCatalog['diagram.tikz'].scopeNotes.join(' ');

  assert.match(skillMd, /does not render, modify, reconcile, or mediate/i);
  assert.match(scope, /No gate, router, fork, or loop decides completion/i);
});