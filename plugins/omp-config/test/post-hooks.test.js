import test from 'node:test';
import assert from 'node:assert/strict';

import {
  redactToolResultContent,
} from '../hook-templates/lib/redact-secrets.ts';
import {
  MAX_LENGTH,
  truncateToolResultContent,
} from '../hook-templates/lib/truncate-output.ts';

test('redact-secrets template helper rewrites visible text blocks only', async () => {
  const image = { type: 'image', data: 'safe-image' };
  const unchanged = { type: 'text', text: 'ordinary output' };
  const result = redactToolResultContent([
    unchanged,
    { type: 'text', text: 'token sk-abcdefghijklmnopqrstuvwxyz123456 and ghp_abcdefghijklmnopqrstuvwxyz1234567890' },
    image,
  ]);

  assert.equal(result[0], unchanged);
  assert.equal(result[2], image);
  assert.equal(result[1].text.includes('sk-'), false);
  assert.equal(result[1].text.includes('ghp_'), false);
  assert.equal((result[1].text.match(/\[REDACTED\]/g) ?? []).length, 2);
  assert.equal(redactToolResultContent([unchanged, image]), null);
});

test('truncate-output template helper caps aggregate text once', async () => {
  const image = { type: 'image', data: 'safe-image' };
  const result = truncateToolResultContent([
    { type: 'text', text: 'a'.repeat(MAX_LENGTH - 5) },
    image,
    { type: 'text', text: 'b'.repeat(10) },
    { type: 'text', text: 'discarded tail' },
  ]);

  assert.equal(result[1], image);
  const text = result.filter((block) => block.type === 'text').map((block) => block.text).join('');
  assert.equal(text.startsWith(`${'a'.repeat(MAX_LENGTH - 5)}${'b'.repeat(5)}`), true);
  assert.equal((text.match(/\[\.\.\. truncated to 50000 chars\]/g) ?? []).length, 1);
  assert.equal(text.includes('discarded tail'), false);
  assert.equal(truncateToolResultContent([{ type: 'text', text: 'short' }, image]), null);
});
