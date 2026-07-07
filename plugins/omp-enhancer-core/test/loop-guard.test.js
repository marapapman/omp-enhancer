import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLoopRecoveryContext,
  createLoopGuardState,
  inspectGeneratedText,
  recordGeneratedText,
  recordLoopGuardProgress,
  stripExemptBlocks,
  takeLoopRecoveryContext,
} from '../src/loop-guard.js';

test('detects repeated Chinese sentences', () => {
  const text = [
    '我需要先验证技能使用情况。',
    '我需要先验证技能使用情况。',
    '我需要先验证技能使用情况。',
  ].join('\n');

  const result = inspectGeneratedText(text);

  assert.equal(result.repeated, true);
  assert.equal(result.kind, 'sentence');
  assert.match(result.repeatedText, /我需要先验证技能使用情况/);
});

test('detects repeated English self-loop sentences', () => {
  const text = [
    'The system is asking me to validate SKILL_USAGE again.',
    'The system is asking me to validate SKILL_USAGE again.',
    'The system is asking me to validate SKILL_USAGE again.',
  ].join('\n');

  const result = inspectGeneratedText(text);

  assert.equal(result.repeated, true);
  assert.equal(result.kind, 'sentence');
  assert.match(result.repeatedText, /the system is asking me/);
});

test('detects repeated long phrase lines before a third full sentence is needed', () => {
  const line = 'I am still waiting for the validator to accept the same evidence before I can finish this task';
  const result = inspectGeneratedText(`${line}\n${line}`);

  assert.equal(result.repeated, true);
  assert.equal(result.kind, 'phrase');
});

test('detects repeated long planning blocks', () => {
  const text = [
    "Actually, let me now focus on finding NEW bugs. I've been looking at the code for a while. Let me now look at specific",
    'edge cases that are more likely to have bugs.',
    '',
    'Let me look at:',
    '1. The context-memory extractor.ts for the prompt building - specifically the message formatting',
    '2. The agent-fleet compliance-gate.ts for the coverage detection - specifically the regex patterns',
    '3. The web-test runner.ts for the normalizeInput function - specifically the validation',
    '',
    'Let me also look at the context-memory session-mem.ts more carefully.',
    '',
    'Actually, let me now look at some specific areas that could have bugs. Let me check:',
    '',
    '1. The context-memory extractor.ts for the prompt building - specifically the message formatting',
    '2. The agent-fleet compliance-gate.ts for the coverage detection - specifically the regex patterns',
    '3. The web-test runner.ts for the normalizeInput function - specifically the validation',
    '',
    'Let me also look at the context-memory session-mem.ts more carefully.',
  ].join('\n');

  const result = inspectGeneratedText(text);

  assert.equal(result.repeated, true);
  assert.equal(result.kind, 'block');
  assert.match(result.reason, /Repeated \d-line block 2 times/);
  assert.match(result.repeatedText, /context-memory extractor/);
});

test('records repeated planning blocks across stream chunks', () => {
  const state = createLoopGuardState();
  const text = [
    'Plan:',
    '1. Inspect the request router state transition and capture the exact event payload shape.',
    '2. Validate the plugin hook registration path and record which callback handled the stream.',
    '3. Add focused regression tests that replay the real payload before changing release metadata.',
    '',
    'Next, I will compare the runtime traces.',
    '',
    'Plan:',
    '1. Inspect the request router state transition and capture the exact event payload shape.',
    '2. Validate the plugin hook registration path and record which callback handled the stream.',
    '3. Add focused regression tests that replay the real payload before changing release metadata.',
  ].join('\n');

  let last = { repeated: false };
  for (let index = 0; index < text.length; index += 80) {
    last = recordGeneratedText(state, text.slice(index, index + 80));
    if (last.repeated) break;
  }

  assert.equal(last.repeated, true);
  assert.equal(last.kind, 'block');
  assert.equal(state.streamTriggered, true);
});

test('detects repeated planning blocks beyond the stream buffer window', () => {
  const state = createLoopGuardState();
  const repeatedBlock = [
    '1. Inspect the request router state transition and capture the exact event payload shape.',
    '2. Validate the plugin hook registration path and record which callback handled the stream.',
    '3. Add focused regression tests that replay the real payload before changing release metadata.',
  ].join('\n');
  const filler = Array.from({ length: 20 }, (_, index) => {
    return `Filler ${index}: collect a distinct trace note so the repeated block no longer fits in the active stream buffer.`;
  }).join('\n');
  const text = `${repeatedBlock}\n${filler}\n${repeatedBlock}\n`;

  let last = { repeated: false };
  for (let index = 0; index < text.length; index += 90) {
    last = recordGeneratedText(state, text.slice(index, index + 90), { maxBufferChars: 240 });
    if (last.repeated) break;
  }

  assert.equal(last.repeated, true);
  assert.equal(last.kind, 'block');
});

test('can flush an incomplete final line for long final-output block detection', () => {
  const state = createLoopGuardState();
  const repeatedBlock = [
    '1. Inspect the request router state transition and capture the exact event payload shape.',
    '2. Validate the plugin hook registration path and record which callback handled the stream.',
    '3. Add focused regression tests that replay the real payload before changing release metadata.',
  ].join('\n');
  const filler = Array.from({ length: 20 }, (_, index) => {
    return `Filler ${index}: collect a distinct trace note so the repeated block no longer fits in the active stream buffer.`;
  }).join('\n');
  const text = `${repeatedBlock}\n${filler}\n${repeatedBlock}`;

  const result = recordGeneratedText(state, text, { maxBufferChars: 240, flushIncompleteLine: true });

  assert.equal(result.repeated, true);
  assert.equal(result.kind, 'block');
});

test('does not flag a single long planning block', () => {
  const text = [
    'Plan:',
    '1. Inspect the request router state transition and capture the exact event payload shape.',
    '2. Validate the plugin hook registration path and record which callback handled the stream.',
    '3. Add focused regression tests that replay the real payload before changing release metadata.',
  ].join('\n');

  const result = inspectGeneratedText(text);

  assert.equal(result.repeated, false);
});

test('detects repeated ngrams in a single stream buffer', () => {
  const phrase = 'the system is asking me to validate skill usage again ';
  const result = inspectGeneratedText(phrase.repeat(4));

  assert.equal(result.repeated, true);
  assert.equal(result.kind, 'ngram');
});

test('ignores repetition inside code fences, usage blocks, and markdown tables', () => {
  const text = [
    '```js',
    'console.log("retry");',
    'console.log("retry");',
    'console.log("retry");',
    '```',
    '',
    'SKILL_USAGE',
    'Required:',
    '- plain-chinese-writing',
    '- plain-chinese-writing',
    '- plain-chinese-writing',
    'Loaded:',
    '- plain-chinese-writing',
    '- plain-chinese-writing',
    '- plain-chinese-writing',
    '',
    '| Tool | Status |',
    '| --- | --- |',
    '| read | ok |',
    '| read | ok |',
    '| read | ok |',
  ].join('\n');

  assert.equal(inspectGeneratedText(text).repeated, false);
  assert.equal(stripExemptBlocks(text).includes('console.log'), false);
  assert.equal(stripExemptBlocks(text).includes('plain-chinese-writing'), false);
});

test('records loop guard state and returns one recovery context', () => {
  const state = createLoopGuardState();
  const repeated = [
    'The system is asking me to validate SKILL_USAGE again.',
    'The system is asking me to validate SKILL_USAGE again.',
    'The system is asking me to validate SKILL_USAGE again.',
  ].join('\n');

  const detection = recordGeneratedText(state, repeated);

  assert.equal(detection.repeated, true);
  assert.equal(state.recoveryPending, true);
  assert.equal(state.repeatedGenerationCount, 1);

  const context = takeLoopRecoveryContext(state);

  assert.match(context, /^LOOP_BREAKER\nReason: Repeated sentence 3 times\./);
  assert.match(context, /Do next: summarize current state and choose a different next action/);
  assert.match(context, /Limit: 5 lines/);
  assert.equal(state.recoveryAttempts, 1);
  assert.equal(state.recoveryPending, false);
  assert.equal(takeLoopRecoveryContext(state), null);
});

test('clears pending recovery when a tool call makes progress after a repeated stream', () => {
  const state = createLoopGuardState();
  const repeated = [
    'The system is asking me to validate SKILL_USAGE again.',
    'The system is asking me to validate SKILL_USAGE again.',
    'The system is asking me to validate SKILL_USAGE again.',
  ].join('\n');

  recordGeneratedText(state, repeated);
  recordLoopGuardProgress(state, 'tool_call:read');

  assert.equal(state.recoveryPending, false);
  assert.equal(state.streamTriggered, false);
  assert.equal(takeLoopRecoveryContext(state), null);
});

test('formats recovery context with the stopped repeated text', () => {
  const state = createLoopGuardState();
  state.lastAbortReason = 'Repeated sentence 3 times.';
  state.lastRepeatedText = 'I am repeating the same validation request.';

  const context = buildLoopRecoveryContext(state);

  assert.match(context, /Repeated sentence 3 times/);
  assert.match(context, /I am repeating the same validation request/i);
  assert.match(context, /Stop: do not call the same tool again or repeat the same sentence/);
});
