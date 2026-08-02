import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { workflowCatalog } from '../plugins/omp-enhancer-core/src/workflows/catalog.js';

// The retired drawing-chain terms are assembled from fragments so this test
// source itself never embeds the vocabulary it asserts is absent.
const assemble = (...chars) => chars.join('');
const FORBIDDEN_DRAWING_TERMS = new RegExp(
  `${assemble('O', 'p', 'e', 'n', 'T', 'i', 'K', 'Z')}|${assemble('T', 'i', 'K', 'Z')}|${assemble('t', 'i', 'k', 'z')}|${assemble('v', 'i', 's', 'i', 'o', 'n', 'e', 'r')}`,
  'iu',
);

const SKILL_MD_PATH = new URL('../plugins/mermaid-helper/skills/mermaid-diagram/SKILL.md', import.meta.url);

// Read SKILL.md and verify the mermaid-only contract: one-pass Mermaid
// authoring rendered via mermaid_render with a simple Main check, and no trace
// of the retired drawing chain.
test('mermaid-diagram SKILL.md documents the one-pass Mermaid contract', () => {
  const skillMd = readFileSync(SKILL_MD_PATH, 'utf-8');

  assert.match(skillMd, /mermaid_render/u);
  assert.match(skillMd, /author(?:s)? the complete Mermaid source/iu);
  assert.match(skillMd, /in one pass/iu);
  assert.match(skillMd, /Main performs a simple check/iu);
  assert.doesNotMatch(skillMd, FORBIDDEN_DRAWING_TERMS);
});

test('visual workflow names designer and task as advisory role candidates', () => {
  const visual = workflowCatalog['visual'];

  assert.ok(visual, 'workflowCatalog must expose the visual workflow');
  assert.deepEqual(visual.roles, ['designer', 'task']);
  assert.ok(Array.isArray(visual.suggestedFlow) && visual.suggestedFlow.length > 0);
  assert.ok(
    visual.suggestedFlow.some((line) => /designer/i.test(line)),
    'suggestedFlow should mention the designer role',
  );
  assert.ok(
    visual.suggestedFlow.some((line) => /mermaid_render/i.test(line)),
    'suggestedFlow should mention rendering via mermaid_render',
  );
  assert.ok(
    visual.suggestedFlow.some((line) => /Main performs a simple check/i.test(line)),
    'suggestedFlow should mention the simple Main check of the rendered SVG',
  );
  assert.ok(
    Array.isArray(visual.scopeNotes) && visual.scopeNotes.length > 0,
    'visual scopeNotes must be non-empty',
  );
  assert.equal(Object.hasOwn(visual, 'delegation'), false, 'visual must not carry a delegation field');
  assert.equal(Object.hasOwn(visual, 'steps'), false, 'visual must not carry a steps field');
});

test('visual workflow advisory notes and mermaid-diagram skill both keep permission boundaries', () => {
  const skillMd = readFileSync(SKILL_MD_PATH, 'utf-8');
  const scope = workflowCatalog['visual'].scopeNotes.join(' ');
  const flow = workflowCatalog['visual'].suggestedFlow.join(' ');

  assert.match(skillMd, /does not render, modify, reconcile, or mediate/i);
  assert.match(scope, /mermaid-helper plugin pipeline/i);
  assert.doesNotMatch(scope, FORBIDDEN_DRAWING_TERMS);
  assert.doesNotMatch(flow, /must (?:fork|delegate)|fixed fanout|hard (?:gate|router)/i);
});
