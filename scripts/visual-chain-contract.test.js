import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { workflowCatalog } from '../plugins/omp-enhancer-core/src/workflows/catalog.js';

const SKILL_MD_PATH = new URL('../plugins/tikz-helper/skills/tikz-diagram/SKILL.md', import.meta.url);

// Read SKILL.md and verify the two-stage chain order: asset chain before figure chain.
test('tikz-diagram SKILL.md chain order is asset chain before figure chain, then loop', () => {
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

test('visual workflow names designer, task, and visioner as advisory role candidates', () => {
  const visual = workflowCatalog['visual'];

  assert.ok(visual, 'workflowCatalog must expose the visual workflow');
  assert.deepEqual(visual.roles, ['designer', 'task', 'visioner']);
  assert.ok(Array.isArray(visual.suggestedFlow) && visual.suggestedFlow.length > 0);
  assert.ok(
    visual.suggestedFlow.some((line) => /designer/i.test(line)),
    'suggestedFlow should mention the designer role',
  );
  assert.ok(
    visual.suggestedFlow.some((line) => /task/i.test(line)),
    'suggestedFlow should mention the task role',
  );
  assert.ok(
    visual.suggestedFlow.some((line) => /visioner/i.test(line)),
    'suggestedFlow should mention the visioner role',
  );
  assert.ok(
    Array.isArray(visual.scopeNotes) && visual.scopeNotes.length > 0,
    'visual scopeNotes must be non-empty',
  );
  assert.equal(Object.hasOwn(visual, 'delegation'), false, 'visual must not carry a delegation field');
  assert.equal(Object.hasOwn(visual, 'steps'), false, 'visual must not carry a steps field');
});

test('visual workflow advisory notes and tikz-diagram skill both keep permission boundaries', () => {
  const skillMd = readFileSync(SKILL_MD_PATH, 'utf-8');
  const scope = workflowCatalog['visual'].scopeNotes.join(' ');
  const flow = workflowCatalog['visual'].suggestedFlow.join(' ');

  assert.match(skillMd, /does not render, modify, reconcile, or mediate/i);
  assert.match(scope, /tikz-helper plugin pipeline/i);
  assert.match(scope, /Mermaid for academic diagrams unless explicit TikZ\/LaTeX request/i);
  assert.doesNotMatch(flow, /must (?:fork|delegate)|fixed fanout|hard (?:gate|router)/i);
});
