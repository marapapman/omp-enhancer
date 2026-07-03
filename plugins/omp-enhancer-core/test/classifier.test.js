import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClassifierPrompt,
  classifierDefaults,
  classifierSchema,
  parseClassifierOutput,
  resolveClassificationRoute,
} from '../src/classifier.js';

test('buildClassifierPrompt exposes the configurable classifier model role and strict schema', () => {
  const result = buildClassifierPrompt({
    prompt: '帮我看看这个插件 workflow 为什么不对。',
  });

  assert.equal(result.modelRole, 'classifier');
  assert.equal(result.model, classifierDefaults.model);
  assert.equal(result.temperature, 0);
  assert.equal(result.maxOutputTokens, 500);
  assert.equal(result.minResolvedConfidence, classifierDefaults.minResolvedConfidence);
  assert.equal(result.minUnknownOverrideConfidence, classifierDefaults.minUnknownOverrideConfidence);
  assert.equal(result.schema, classifierSchema);
  assert.equal(result.fallbackRoute.intent, 'diagnosis');
  assert.match(result.prompt, /modelRoles\.classifier/);
  assert.match(result.prompt, /opencode-go\/deepseek-v4-flash:medium/);
  assert.match(result.prompt, /Return only JSON/);
  assert.match(result.prompt, /Do not invent skill names/);
  assert.match(result.prompt, /low-confidence non-unknown classifications may fall back/);
  assert.match(result.prompt, /high-confidence unknown/);
});

test('buildClassifierPrompt accepts explicit classifier model overrides', () => {
  const result = buildClassifierPrompt({
    prompt: 'Draft a paragraph.',
    modelRole: 'customClassifier',
    model: 'openai/gpt-5-nano',
  });

  assert.equal(result.modelRole, 'customClassifier');
  assert.equal(result.model, 'openai/gpt-5-nano');
  assert.match(result.prompt, /modelRoles\.customClassifier/);
});

test('parseClassifierOutput accepts fenced JSON output', () => {
  const parsed = parseClassifierOutput([
    '```json',
    '{"intent":"writing.en","secondaryIntents":[],"language":"en","confidence":0.9,"riskFlags":["needs-writing-qa"],"domainHints":["paper"],"reason":"English writing request"}',
    '```',
  ].join('\n'));

  assert.equal(parsed.intent, 'writing.en');
  assert.equal(parsed.confidence, 0.9);
});

test('resolveClassificationRoute maps valid classifier JSON through the route whitelist', () => {
  const result = resolveClassificationRoute({
    prompt: 'Draft an English related work paragraph and check the logic.',
    output: JSON.stringify({
      intent: 'writing.en',
      secondaryIntents: [],
      language: 'en',
      confidence: 0.91,
      riskFlags: ['needs-writing-qa', 'needs-review'],
      domainHints: ['paper'],
      reason: 'The user asks for English prose drafting and review.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.route.intent, 'writing.en');
  assert.equal(result.route.source, 'llm-classifier');
  assert.equal(result.route.classifier.status, 'resolved');
  assert.deepEqual(result.route.requiredSkills, ['writing-markdown-helper', 'writing-checkers']);
  assert.deepEqual(result.route.requiredSubagents.map(({ agent }) => agent), ['writer', 'checker']);
});

test('resolveClassificationRoute lets high-confidence unknown suppress an over-eager fallback route', () => {
  const result = resolveClassificationRoute({
    prompt: 'Explain what coverage means in plain English.',
    output: JSON.stringify({
      intent: 'unknown',
      secondaryIntents: [],
      language: 'en',
      confidence: 0.92,
      riskFlags: ['ambiguous'],
      domainHints: ['terminology'],
      reason: 'The user asks for a general explanation, not a testing workflow.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.fallbackRoute.intent, 'testing');
  assert.equal(result.route.intent, 'unknown');
  assert.equal(result.route.classifier.classification.intent, 'unknown');
});

test('resolveClassificationRoute falls back from low-confidence wrong intents to avoid missing required workflow', () => {
  const result = resolveClassificationRoute({
    prompt: '修复这个插件 bug，并补充高信号单元测试。',
    output: JSON.stringify({
      intent: 'release',
      secondaryIntents: [],
      language: 'zh',
      confidence: 0.21,
      riskFlags: ['release-or-push'],
      domainHints: ['plugin'],
      reason: 'Uncertain guess based on plugin wording.',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.fallbackRoute.intent, 'implementation-with-tests');
  assert.equal(result.route.intent, 'implementation-with-tests');
  assert.equal(result.route.classifier.classification.intent, 'release');
});

test('resolveClassificationRoute falls back when classifier invents unsupported fields', () => {
  const result = resolveClassificationRoute({
    prompt: 'Draft an English related work paragraph and check the logic.',
    output: JSON.stringify({
      intent: 'writing.en',
      secondaryIntents: [],
      language: 'en',
      confidence: 0.91,
      riskFlags: ['needs-writing-qa'],
      domainHints: ['paper'],
      reason: 'The user asks for English prose.',
      skills: ['invented-skill'],
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.route.intent, 'writing.en');
  assert.equal(result.route.source, 'natural-language');
  assert.equal(result.route.classifier.status, 'fallback');
  assert.match(result.validation.errors.join('\n'), /Unsupported classifier field: skills/);
});

test('resolveClassificationRoute rejects out-of-range classifier confidence', () => {
  const result = resolveClassificationRoute({
    prompt: 'Draft an English related work paragraph and check the logic.',
    output: JSON.stringify({
      intent: 'writing.en',
      secondaryIntents: [],
      language: 'en',
      confidence: 1.5,
      riskFlags: ['needs-writing-qa'],
      domainHints: [],
      reason: 'English writing request.',
    }),
  });

  assert.equal(result.ok, false);
  assert.match(result.validation.errors.join('\n'), /Invalid confidence/);
});
