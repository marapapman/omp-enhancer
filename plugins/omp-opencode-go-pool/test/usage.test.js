import assert from 'node:assert/strict';
import { appendFile, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { UsageLedger, aggregateUsage, sanitizeAttempt } from '../src/usage.js';

test('sanitizes usage attempts without raw key fields', () => {
  const entry = sanitizeAttempt({
    key: { label: 'work', hash: 'abc123', source: 'vault', key: 'sk-raw-secret-value' },
    success: true,
    usage: { input: 1, output: 2, cost: { total: 0.1 } },
  });

  assert.doesNotMatch(JSON.stringify(entry), /sk-raw-secret-value/);
  assert.equal(entry.usage.totalTokens, 3);
  assert.equal(entry.cost.total, 0.1);
});

test('aggregates 5h, weekly, and monthly usage windows', () => {
  const now = Date.UTC(2026, 0, 10);
  const result = aggregateUsage([
    sanitizeAttempt({ timestamp: now - 1000, key: { label: 'a', hash: 'h1', source: 'vault' }, success: true, usage: { totalTokens: 10 } }),
    sanitizeAttempt({ timestamp: now - 8 * 24 * 60 * 60 * 1000, key: { label: 'b', hash: 'h2', source: 'primary' }, success: false, usage: { totalTokens: 7, costTotal: 0.2 } }),
  ], { now });

  assert.equal(result.windows['5h'].total.requests, 1);
  assert.equal(result.windows.weekly.total.requests, 1);
  assert.equal(result.windows.monthly.total.requests, 2);
  assert.equal(result.windows.monthly.total.knownCost, 0.2);
});

test('skips corrupt JSONL lines', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'opencode-pool-usage-'));
  const ledger = new UsageLedger({ path: path.join(dir, 'usage.jsonl') });
  await ledger.appendAttempt({ key: { label: 'a', hash: 'h1', source: 'vault' }, success: true, usage: { totalTokens: 3 } });
  await appendFile(path.join(dir, 'usage.jsonl'), '{broken\n');

  const aggregate = await ledger.aggregate(Date.now());
  assert.equal(aggregate.corruptLines, 1);
  assert.equal(aggregate.allTime.total.requests, 1);
});
