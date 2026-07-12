import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyHostTurn } from '../src/host-turn-context.js';

const AUTOLEARN_PROMPT = [
  'Automated capture turn — not a user reply. The user has not yet responded to your previous turn. Do not treat this prompt as their answer, as approval to continue, or as acceptance of any pending action; only the user can do that.',
  '',
  'If your previous turn produced anything reusable, capture it now: a repeatable procedure becomes a managed skill (`manage_skill`); a durable fact, convention, or user preference is worth remembering (`learn`, when memory is enabled). Only capture what will genuinely help next time. If nothing is worth keeping, do nothing.',
  '',
  "Then stop. Do not run any other tools, do not resume prior work, do not answer your own pending questions, and do not produce a continuation reply. Yield and wait for the user's next prompt.",
].join('\n');

test('classifies explicit future host metadata as an autolearn capture turn', () => {
  assert.deepEqual(classifyHostTurn({
    prompt: AUTOLEARN_PROMPT,
    customType: 'autolearn-nudge',
    display: false,
    attribution: 'user',
  }), {
    kind: 'autolearn-capture',
    source: 'event',
  });
});

test('classifies the matching hidden user-attributed branch message', () => {
  for (const entry of [
    {
      type: 'custom_message',
      customType: 'autolearn-nudge',
      content: AUTOLEARN_PROMPT,
      display: false,
      attribution: 'user',
    },
    {
      type: 'message',
      message: {
        role: 'custom',
        customType: 'autolearn-nudge',
        content: AUTOLEARN_PROMPT,
        display: false,
        attribution: 'user',
      },
    },
  ]) {
    assert.deepEqual(classifyHostTurn(
      { prompt: AUTOLEARN_PROMPT },
      { sessionManager: { getBranch: () => [entry] } },
    ), {
      kind: 'autolearn-capture',
      source: 'branch',
    });
  }
});

test('prefers the most recent matching real user message over an older hidden capture', () => {
  assert.deepEqual(classifyHostTurn(
    { prompt: AUTOLEARN_PROMPT },
    {
      sessionManager: {
        getBranch: () => [
          {
            type: 'custom_message',
            customType: 'autolearn-nudge',
            content: AUTOLEARN_PROMPT,
            display: false,
            attribution: 'user',
          },
          {
            type: 'message',
            message: { role: 'user', content: AUTOLEARN_PROMPT },
          },
        ],
      },
    },
  ), { kind: 'user', source: 'default' });
});

test('uses the complete official protocol only when branch metadata is not yet visible', () => {
  assert.deepEqual(classifyHostTurn({ prompt: AUTOLEARN_PROMPT }), {
    kind: 'autolearn-capture',
    source: 'protocol',
  });
});

test('does not mistake ordinary autolearn discussion or untrusted branch messages for capture', () => {
  const prompt = 'autolearn.autoContinue 是从哪里来的？我想保留它。';
  assert.deepEqual(classifyHostTurn({ prompt }), { kind: 'user', source: 'default' });

  for (const entry of [
    { type: 'custom_message', customType: 'autolearn-nudge', content: prompt, display: true, attribution: 'user' },
    { type: 'custom_message', customType: 'autolearn-nudge', content: prompt, display: false, attribution: 'agent' },
    { type: 'custom_message', customType: 'advisor', content: prompt, display: false, attribution: 'user' },
  ]) {
    assert.deepEqual(classifyHostTurn(
      { prompt },
      { sessionManager: { getBranch: () => [entry] } },
    ), { kind: 'user', source: 'default' });
  }

  assert.deepEqual(classifyHostTurn(
    { prompt: AUTOLEARN_PROMPT },
    {
      sessionManager: {
        getBranch: () => [{
          type: 'message',
          message: { role: 'user', content: AUTOLEARN_PROMPT },
        }],
      },
    },
  ), { kind: 'user', source: 'default' });
});
