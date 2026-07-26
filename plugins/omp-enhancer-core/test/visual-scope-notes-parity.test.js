import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// ScopeNotes from VISUAL_AGENT_SCOPE_NOTES — same constant in both files
// We verify they produce identical scopeNotes entries across the 5 visual workflows

import { workflowCatalog } from '../src/workflows/catalog.js';

const VISUAL_IDS = ['design.visual', 'slides.generate', 'slides.modify', 'diagram.tikz'];

test('every visual workflow shares the same VISUAL_AGENT_SCOPE_NOTES prefix in scopeNotes', () => {
  const reference = workflowCatalog['design.visual'].scopeNotes.slice(0, 2);

  for (const id of VISUAL_IDS) {
    const notes = workflowCatalog[id].scopeNotes.slice(0, 2);
    assert.deepEqual(notes, reference, `${id} scopeNotes first 2 entries must match design.visual`);
  }
});

test('VISUAL_AGENT_SCOPE_NOTES sources are byte-identical in operations.js and writing.js', () => {
  const opsSource = readFileSync(
    new URL('../src/workflows/definitions/operations.js', import.meta.url),
    'utf-8',
  );
  const writingSource = readFileSync(
    new URL('../src/workflows/definitions/writing.js', import.meta.url),
    'utf-8',
  );

  // Extract the VISUAL_AGENT_SCOPE_NOTES array from each file
  const opsMatch = opsSource.match(/const VISUAL_AGENT_SCOPE_NOTES = \[(\s*[\s\S]*?)\n\];/m);
  const writingMatch = writingSource.match(/const VISUAL_AGENT_SCOPE_NOTES = \[(\s*[\s\S]*?)\n\];/m);

  assert.ok(opsMatch, 'VISUAL_AGENT_SCOPE_NOTES found in operations.js');
  assert.ok(writingMatch, 'VISUAL_AGENT_SCOPE_NOTES found in writing.js');
  assert.equal(opsMatch[1], writingMatch[1], 'VISUAL_AGENT_SCOPE_NOTES must be byte-identical in both files');
});