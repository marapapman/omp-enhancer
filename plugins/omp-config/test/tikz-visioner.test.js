import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const visionerUrl = new URL('../agents/visioner.md', import.meta.url);

test('visioner reviews current-revision TikZ artifacts and raster icon disclosures read-only', async () => {
  const visioner = await readFile(visionerUrl, 'utf8');

  assert.match(visioner, /^name: visioner$/m);
  assert.match(visioner, /TikZ/i);
  assert.match(visioner, /semantic figure spec/i);
  assert.match(visioner, /asset manifest/i);
  assert.match(visioner, /revision identifier/i);
  assert.match(visioner, /PDF.+SVG.+PNG|PDF\/SVG\/PNG/is);
  assert.match(visioner, /latest full-size and 60% raster renders/i);
  assert.match(visioner, /same current revision/i);
  assert.match(visioner, /icon legibility/i);
  assert.match(visioner, /raster disclosure/i);
  assert.match(visioner, /missing.+asset|asset.+missing/i);
  assert.match(visioner, /APPROVED \| CHANGES_REQUIRED \| UNREVIEWABLE/);
  assert.match(visioner, /read-only/i);
  assert.match(visioner, /review a changed revision once|changed revision once/i);
  assert.doesNotMatch(visioner, /^\s*- (?:edit|write)$/m);
  assert.doesNotMatch(visioner, /block:\s*true|continue:\s*true|retry until|repeat until|automatic repair/i);
});
