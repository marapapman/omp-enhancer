import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createBalancedStream } from '../src/balanced-stream.js';
import { SimpleAssistantMessageEventStream } from '../src/event-stream.js';
import { KeyPool } from '../src/key-pool.js';
import { KeyVault } from '../src/key-vault.js';
import { UsageLedger } from '../src/usage.js';

test('routes a successful request through a selected extra key and records usage', async () => {
  const env = await createEnv();
  const calls = [];
  const stream = createBalancedStream({
    keyPool: env.pool,
    usageLedger: env.ledger,
    streamSimple: (model, _context, options) => {
      calls.push({ model, key: options.apiKey });
      return doneStream(model, { input: 2, output: 3, totalTokens: 5 });
    },
    now: (() => {
      let time = 1000;
      return () => (time += 10);
    })(),
  });

  const out = stream(baseModel(), { messages: [] }, { apiKey: undefined });
  const events = await collect(out);

  assert.equal(events.at(-1).type, 'done');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, env.extraKey);
  assert.equal(calls[0].model.api, 'openai-completions');
  assert.deepEqual(calls[0].model.compat, { supportsToolChoice: false });

  const usage = await env.ledger.aggregate(Date.now());
  assert.equal(usage.allTime.total.requests, 1);
  assert.equal(usage.allTime.total.tokens, 5);
});

test('retries a pre-output 429 on another key', async () => {
  const env = await createEnv();
  const primary = 'sk-primary-secret-value-1234567890';
  const seenKeys = [];
  const stream = createBalancedStream({
    keyPool: env.pool,
    usageLedger: env.ledger,
    streamSimple: (_model, _context, options) => {
      seenKeys.push(options.apiKey);
      if (seenKeys.length === 1) return errorStream(429, 'rate limit');
      return doneStream(baseModel(), { totalTokens: 11 });
    },
    now: (() => {
      let time = 1000;
      return () => (time += 10);
    })(),
  });

  const events = await collect(stream(baseModel(), { messages: [] }, { apiKey: primary }));

  assert.equal(events.at(-1).type, 'done');
  assert.equal(seenKeys.length, 2);
  assert.notEqual(seenKeys[0], seenKeys[1]);
  const usage = await env.ledger.aggregate(Date.now());
  assert.equal(usage.allTime.total.requests, 2);
  assert.equal(usage.allTime.total.failures, 1);
});

test('does not retry after replay-unsafe output has been emitted', async () => {
  const env = await createEnv();
  const stream = createBalancedStream({
    keyPool: env.pool,
    usageLedger: env.ledger,
    streamSimple: () => {
      const inner = new SimpleAssistantMessageEventStream();
      queueMicrotask(() => {
        inner.push({ type: 'start' });
        inner.push({ type: 'text_delta', delta: 'hello' });
        inner.push({ type: 'error', error: errorMessage(429, 'rate limit') });
      });
      return inner;
    },
  });

  const events = await collect(stream(baseModel(), { messages: [] }, { apiKey: 'sk-primary-secret-value-1234567890' }));
  assert.equal(events.map(event => event.type).join(','), 'start,text_delta,error');
});

test('fails the outer stream if runtime streamSimple cannot be resolved', async () => {
  const env = await createEnv();
  const stream = createBalancedStream({
    keyPool: env.pool,
    usageLedger: env.ledger,
    resolveStreamSimple: async () => {
      throw new Error('runtime module missing');
    },
  });

  await assert.rejects(
    () => collect(stream(baseModel(), { messages: [] }, { apiKey: undefined })),
    /runtime module missing/,
  );

  const usage = await env.ledger.aggregate(Date.now());
  assert.equal(usage.allTime.total.requests, 1);
  assert.equal(usage.allTime.total.failures, 1);
});

async function createEnv() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'opencode-pool-stream-'));
  const extraKey = 'sk-extra-secret-value-1234567890';
  const vault = new KeyVault({ path: path.join(dir, 'vault.json') });
  await vault.addKey({ label: 'extra', key: extraKey });
  const pool = new KeyPool({ vault, path: path.join(dir, 'state.json'), random: () => 0 });
  const ledger = new UsageLedger({ path: path.join(dir, 'usage.jsonl') });
  return { dir, vault, pool, ledger, extraKey };
}

function baseModel() {
  return {
    id: 'mimo-v2.5',
    name: 'MiMo V2.5',
    api: 'opencode-go-balanced',
    provider: 'opencode-go',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    compatConfig: { supportsToolChoice: false },
  };
}

function doneStream(model, usage) {
  const inner = new SimpleAssistantMessageEventStream();
  queueMicrotask(() => {
    inner.push({ type: 'start' });
    inner.push({
      type: 'done',
      message: {
        role: 'assistant',
        api: model.api,
        provider: model.provider,
        model: model.id,
        content: [],
        usage,
        stopReason: 'stop',
        timestamp: Date.now(),
      },
    });
  });
  return inner;
}

function errorStream(status, message) {
  const inner = new SimpleAssistantMessageEventStream();
  queueMicrotask(() => {
    inner.push({ type: 'start' });
    inner.push({ type: 'error', error: errorMessage(status, message) });
  });
  return inner;
}

function errorMessage(status, message) {
  return {
    role: 'assistant',
    api: 'openai-completions',
    provider: 'opencode-go',
    model: 'mimo-v2.5',
    content: [],
    usage: { totalTokens: 0 },
    stopReason: 'error',
    errorStatus: status,
    errorMessage: message,
    timestamp: Date.now(),
  };
}

async function collect(stream) {
  const events = [];
  for await (const event of stream) events.push(event);
  return events;
}
