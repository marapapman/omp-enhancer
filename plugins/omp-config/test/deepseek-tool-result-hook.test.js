import test from 'node:test';
import assert from 'node:assert/strict';

import { formatToolResultEvent } from '../hooks/lib/deepseek-tool-result-format.js';

test('DeepSeek tool result hook returns OMP content arrays', async () => {
  const result = formatToolResultEvent({
    name: 'todo_update',
    content: [{ type: 'text', text: '' }],
  });

  assert.deepEqual(result, {
    content: [{ type: 'text', text: '[todo_update completed with no output]' }],
  });
});

test('DeepSeek tool result hook preserves formatted text in a content block', async () => {
  const result = formatToolResultEvent({
    toolName: 'bash',
    content: [{ type: 'text', text: '\u001b[31mhello\u001b[0m\n' }],
  });

  assert.deepEqual(result, {
    content: [{ type: 'text', text: 'hello' }],
  });
});

test('DeepSeek tool result hook returns error content arrays', async () => {
  const result = formatToolResultEvent({
    toolName: 'read',
    isError: true,
    content: [{ type: 'text', text: 'missing file' }],
  });

  assert.deepEqual(result, {
    content: [{ type: 'text', text: '[read error] missing file' }],
    details: { toolName: 'read', isError: true },
    isError: true,
  });
});
