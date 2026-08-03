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

const SKILL_MD_PATH = new URL('../plugins/omp-config/skills/drawio-diagram/SKILL.md', import.meta.url);

// Read SKILL.md and verify the draw.io-only contract: one-pass draw.io XML
// authoring verified with the drawio MCP and the bundled geometry checker, no
// hand-edited SVG or Mermaid, and no trace of the retired drawing chain.
test('drawio-diagram SKILL.md documents the one-pass draw.io XML contract', () => {
  const skillMd = readFileSync(SKILL_MD_PATH, 'utf-8');

  assert.match(skillMd, /drawio MCP/iu);
  assert.match(skillMd, /check-drawio-layout|bundled (?:static )?checker/iu);
  assert.match(skillMd, /author(?:s)? the complete draw\.io XML in one pass/iu);
  assert.match(skillMd, /never hand-edit SVG or Mermaid/iu);
  assert.doesNotMatch(skillMd, FORBIDDEN_DRAWING_TERMS);
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
    visual.suggestedFlow.some((line) => /drawio MCP/i.test(line)),
    'suggestedFlow should mention verification via the drawio MCP',
  );
  assert.ok(
    visual.suggestedFlow.some((line) => /Main retains setup authorization and final acceptance only/i.test(line)),
    'suggestedFlow should mention the Main setup-authorization and final-acceptance boundary',
  );
  assert.ok(
    Array.isArray(visual.scopeNotes) && visual.scopeNotes.length > 0,
    'visual scopeNotes must be non-empty',
  );
  assert.equal(Object.hasOwn(visual, 'delegation'), false, 'visual must not carry a delegation field');
  assert.equal(Object.hasOwn(visual, 'steps'), false, 'visual must not carry a steps field');
});

test('visual workflow advisory notes and drawio-diagram skill both keep permission boundaries', () => {
  const skillMd = readFileSync(SKILL_MD_PATH, 'utf-8');
  const scope = workflowCatalog['visual'].scopeNotes.join(' ');
  const flow = workflowCatalog['visual'].suggestedFlow.join(' ');

  assert.match(skillMd, /acceptance echo, not a visual layout verdict/i);
  assert.match(skillMd, /advisory evidence for Main; Main accepts final delivery/i);
  assert.match(scope, /drawio MCP/i);
  assert.match(scope, /Mermaid and SVG diagram pipelines are retired/i);
  assert.doesNotMatch(scope, FORBIDDEN_DRAWING_TERMS);
  assert.doesNotMatch(flow, /must (?:fork|delegate)|fixed fanout|hard (?:gate|router)/i);
});
