import test from 'node:test';
import assert from 'node:assert/strict';

import registerRedactSecrets, {
  execute as executeLegacyRedaction,
} from '../hooks/post/redact-secrets.ts';
import registerTruncateOutput, {
  execute as executeLegacyTruncation,
  MAX_LENGTH,
} from '../hooks/post/truncate-output.ts';

function registeredToolResultHandler(factory) {
  let handler = null;
  factory({
    on(event, candidate) {
      assert.equal(event, 'tool_result');
      handler = candidate;
    },
  });
  assert.equal(typeof handler, 'function');
  return handler;
}

test('redact-secrets is a loadable extension factory and rewrites visible text blocks', async () => {
  const handler = registeredToolResultHandler(registerRedactSecrets);
  const image = { type: 'image', data: 'safe-image' };
  const unchanged = { type: 'text', text: 'ordinary output' };
  const result = await handler({
    content: [
      unchanged,
      { type: 'text', text: 'token sk-abcdefghijklmnopqrstuvwxyz123456 and ghp_abcdefghijklmnopqrstuvwxyz1234567890' },
      image,
    ],
  });

  assert.equal(result.content[0], unchanged);
  assert.equal(result.content[2], image);
  assert.equal(result.content[1].text.includes('sk-'), false);
  assert.equal(result.content[1].text.includes('ghp_'), false);
  assert.equal((result.content[1].text.match(/\[REDACTED\]/g) ?? []).length, 2);
  assert.equal(await handler({ content: [unchanged, image] }), undefined);

  const legacy = { result: 'api_key="abcdefghijklmnop1234"' };
  executeLegacyRedaction(legacy);
  assert.equal(legacy.result, '[REDACTED]');
});

test('truncate-output is a loadable extension factory and caps aggregate text once', async () => {
  const handler = registeredToolResultHandler(registerTruncateOutput);
  const image = { type: 'image', data: 'safe-image' };
  const result = await handler({
    content: [
      { type: 'text', text: 'a'.repeat(MAX_LENGTH - 5) },
      image,
      { type: 'text', text: 'b'.repeat(10) },
      { type: 'text', text: 'discarded tail' },
    ],
  });

  assert.equal(result.content[1], image);
  const text = result.content.filter((block) => block.type === 'text').map((block) => block.text).join('');
  assert.equal(text.startsWith(`${'a'.repeat(MAX_LENGTH - 5)}${'b'.repeat(5)}`), true);
  assert.equal((text.match(/\[\.\.\. truncated to 50000 chars\]/g) ?? []).length, 1);
  assert.equal(text.includes('discarded tail'), false);
  assert.equal(await handler({ content: [{ type: 'text', text: 'short' }, image] }), undefined);

  const legacy = { result: 'x'.repeat(MAX_LENGTH + 1) };
  executeLegacyTruncation(legacy);
  assert.equal(legacy.result.startsWith('x'.repeat(MAX_LENGTH)), true);
  assert.match(legacy.result, /\[\.\.\. truncated to 50000 chars\]$/);
});
