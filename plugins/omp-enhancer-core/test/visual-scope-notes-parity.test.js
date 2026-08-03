import test from 'node:test';
import assert from 'node:assert/strict';

import { workflowCatalog } from '../src/workflows/catalog.js';

test('the single visual workflow carries the shared visual scope notes', () => {
  const visual = workflowCatalog.visual;
  assert.ok(visual, 'visual workflow must exist');
  assert.ok(visual.scopeNotes.length >= 2, 'visual workflow must carry scope notes');
  assert.match(visual.scopeNotes.join(' '), /All diagrams are authored as draw\.io XML and verified with the drawio MCP/iu);
  assert.match(visual.scopeNotes.join(' '), /The drawio MCP \(hosted app server or local @drawio\/mcp tool server\) is the single diagram pipeline/iu);
});

test('no separate visual workflow files remain with duplicated scope-note constants', () => {
  // The five legacy visual workflows are consolidated into one `visual` definition.
  for (const id of ['design.visual', 'slides.generate', 'slides.modify', 'diagram.tikz', 'diagram.mermaid']) {
    assert.equal(workflowCatalog[id], undefined, `${id} must be consolidated away`);
  }
});
