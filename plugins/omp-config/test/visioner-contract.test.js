import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const visionerUrl = new URL('../agents/visioner.md', import.meta.url);

test('visioner reviews slide decks, UI artifacts, and static exports read-only without diagram review', async () => {
  const visioner = await readFile(visionerUrl, 'utf8');

  assert.match(visioner, /^name: visioner$/m);
  assert.doesNotMatch(visioner, /tikz/i);
  assert.doesNotMatch(visioner, /diagram|mermaid/i);
  assert.match(visioner, /slide decks/i);
  assert.match(visioner, /UI.+web.+responsive screenshots.+interaction states/is);
  assert.match(visioner, /static canvas.+export artifacts/is);
  assert.match(visioner, /revision identifier/i);
  assert.match(visioner, /same current revision/i);
  assert.match(visioner, /UNREVIEWABLE/);
  assert.match(visioner, /APPROVED \| CHANGES_REQUIRED \| UNREVIEWABLE/);
  assert.match(visioner, /read-only/i);
  assert.match(visioner, /review a changed revision once/i);
  assert.doesNotMatch(visioner, /^\s*- (?:edit|write)$/m);
  assert.doesNotMatch(visioner, /block:\s*true|continue:\s*true|retry until|repeat until|automatic repair/i);
});
