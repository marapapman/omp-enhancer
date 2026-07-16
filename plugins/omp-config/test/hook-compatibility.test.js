import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import registerDeepSeekCot from '../hook-templates/pre/opencode-deepseek-cot.ts';
import registerDeepSeekToolRepair from '../hook-templates/pre/opencode-deepseek-tool-repair.ts';
import registerDeepSeekToolResultPipeline from '../hook-templates/post/opencode-deepseek-tool-result-pipeline.ts';
import { isOpenCodeDeepSeekV4Model } from '../hook-templates/lib/model-gate.js';

const pluginRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const flashModel = { provider: 'opencode-go', id: 'deepseek-v4-flash' };

function registeredHandler(factory, expectedEvent) {
  let handler;
  factory({
    on(event, candidate) {
      if (event === expectedEvent) handler = candidate;
    },
  });
  assert.equal(typeof handler, 'function');
  return handler;
}

async function listTypeScriptFiles(dir) {
  try {
    return (await readdir(dir)).filter((name) => name.endsWith('.ts')).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

test('automatic hook directories contain advisory-only hooks', async () => {
  const autoPre = await listTypeScriptFiles(path.join(pluginRoot, 'hooks', 'pre'));
  const autoPost = await listTypeScriptFiles(path.join(pluginRoot, 'hooks', 'post'));

  assert.deepEqual(autoPre, [
    'guard-destructive.ts',
    'opencode-deepseek-edit-anchor.ts',
  ]);
  assert.deepEqual(autoPost, []);
});

test('DeepSeek templates require an exact provider and model id match', () => {
  assert.equal(isOpenCodeDeepSeekV4Model(flashModel), true);
  assert.equal(isOpenCodeDeepSeekV4Model({ provider: 'opencode-go', id: 'deepseek-v4-pro' }), true);
  assert.equal(isOpenCodeDeepSeekV4Model({ provider: 'ollama-cloud', id: 'deepseek-v4-flash' }), false);
  assert.equal(isOpenCodeDeepSeekV4Model({ provider: 'opencode-go', id: 'deepseek-chat' }), false);
  assert.equal(isOpenCodeDeepSeekV4Model(undefined), false);
});

test('COT template is a strict no-op for other models', async () => {
  const handler = registeredHandler(registerDeepSeekCot, 'context');
  const messages = [{ role: 'assistant', tool_calls: [{ name: 'read' }] }];

  const skipped = await handler(
    { messages },
    { model: { provider: 'ollama-cloud', id: 'deepseek-v4-flash' } },
  );
  assert.equal(skipped, undefined);
  assert.equal(Object.hasOwn(messages[0], 'reasoning_content'), false);

  const patched = await handler({ messages }, { model: flashModel });
  assert.equal(patched.messages, messages);
  assert.equal(messages[0].reasoning_content, ' ');
});

test('tool repair template is a strict no-op for other models', async () => {
  const handler = registeredHandler(registerDeepSeekToolRepair, 'context');
  const toolCall = { name: 'read', arguments: { path: ['README.md'] } };
  const messages = [{ role: 'assistant', tool_calls: [toolCall] }];

  assert.equal(await handler(
    { messages },
    { model: { provider: 'opencode-go', id: 'kimi-k2.7-code' } },
  ), undefined);
  assert.deepEqual(toolCall.arguments, { path: ['README.md'] });

  const patched = await handler({ messages }, { model: flashModel });
  assert.equal(patched.messages, messages);
  assert.deepEqual(toolCall.arguments, { path: 'README.md' });
});

test('tool-result pipeline preserves non-text blocks and outcome metadata', async () => {
  const handler = registeredHandler(registerDeepSeekToolResultPipeline, 'tool_result');
  const image = { type: 'image', data: 'image-data', mimeType: 'image/png' };
  const resource = { type: 'resource', uri: 'memo://one', text: 'resource text' };
  const unknown = { type: 'future-block', payload: { stable: true } };
  const details = { runId: 'run-1', nested: { stable: true } };
  const event = {
    toolName: 'bash',
    content: [
      { type: 'text', text: '\u001b[31mhello\u001b[0m\n' },
      image,
      resource,
      unknown,
    ],
    details,
    isError: false,
  };

  assert.equal(await handler(event, {
    model: { provider: 'ollama-cloud', id: 'deepseek-v4-flash' },
  }), undefined);

  const result = await handler(event, { model: flashModel });
  assert.equal(result.content[0].text, 'hello');
  assert.equal(result.content[1], image);
  assert.equal(result.content[2], resource);
  assert.equal(result.content[3], unknown);
  assert.equal(result.details, details);
  assert.equal(result.isError, false);
});

test('tool-result pipeline leaves image-only results untouched', async () => {
  const handler = registeredHandler(registerDeepSeekToolResultPipeline, 'tool_result');
  const image = { type: 'image', data: 'image-data' };
  const details = { width: 100 };

  const result = await handler({
    toolName: 'view_image',
    content: [image],
    details,
    isError: false,
  }, { model: flashModel });

  assert.equal(result, undefined);
});

test('tool-result pipeline preserves error state while formatting text', async () => {
  const handler = registeredHandler(registerDeepSeekToolResultPipeline, 'tool_result');
  const image = { type: 'image', data: 'diagnostic-image' };
  const details = { path: 'missing.txt' };

  const result = await handler({
    toolName: 'read',
    content: [{ type: 'text', text: 'missing file' }, image],
    details,
    isError: true,
  }, { model: flashModel });

  assert.equal(result.content[0].text, '[read error] missing file');
  assert.equal(result.content[1], image);
  assert.equal(result.details, details);
  assert.equal(result.isError, true);
});

test('tool-result pipeline composes redaction and truncation once', async () => {
  const handler = registeredHandler(registerDeepSeekToolResultPipeline, 'tool_result');
  const secret = `sk-${'a'.repeat(24)}`;
  const resource = { type: 'resource', uri: 'memo://after-truncation' };
  const unknown = { type: 'future-block', payload: 'after-truncation' };
  const result = await handler({
    toolName: 'bash',
    content: [
      { type: 'text', text: `${secret}\n${'x'.repeat(50010)}` },
      resource,
      unknown,
    ],
    details: undefined,
    isError: false,
  }, { model: flashModel });

  assert.equal(result.content[0].text.includes(secret), false);
  assert.equal(result.content[0].text.includes('[REDACTED]'), true);
  assert.equal(result.content[0].text.includes('[... truncated to 50000 chars]'), true);
  assert.equal(result.content[1], resource);
  assert.equal(result.content[2], unknown);
});
