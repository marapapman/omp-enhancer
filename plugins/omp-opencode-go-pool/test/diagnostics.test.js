import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildStatusReport, formatStatusReport } from '../src/diagnostics.js';
import { KeyPool } from '../src/key-pool.js';
import { KeyVault } from '../src/key-vault.js';
import { UsageLedger } from '../src/usage.js';

test('formats status with health, live status, and plugin-owned usage', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'opencode-pool-status-'));
  const rawKey = 'sk-extra-secret-value-1234567890';
  const vault = new KeyVault({ path: path.join(dir, 'vault.json') });
  await vault.addKey({ label: 'extra', key: rawKey });
  const pool = new KeyPool({ vault, path: path.join(dir, 'state.json') });
  const ledger = new UsageLedger({ path: path.join(dir, 'usage.jsonl') });
  await ledger.appendAttempt({
    key: { label: 'extra', hash: 'hash1', source: 'vault' },
    success: true,
    usage: { totalTokens: 12, costTotal: 6 },
  });
  await ledger.appendAttempt({
    key: { label: 'extra', hash: 'hash1', source: 'vault' },
    success: false,
    usage: { totalTokens: 3 },
  });

  const report = await buildStatusReport({
    keyPool: pool,
    keyVault: vault,
    usageLedger: ledger,
    fetchLiveStatuses: async keys => ({
      checked: true,
      endpoint: 'https://opencode.ai/zen/go/v1/chat/completions',
      checkedAt: '2026-07-05T00:00:00.000Z',
      keys: keys.map(key => ({
        id: key.id,
        label: key.label,
        hash: key.hash,
        source: key.source,
        status: 'limited',
        httpStatus: 429,
        limitName: 'weekly',
        retryAfterSec: 90,
        workspace: 'wrk_test',
        reason: 'weekly Go limit reached',
      })),
    }),
  });
  const text = formatStatusReport(report);

  assert.match(text, /OpenCode Go key pool status/);
  assert.match(text, /Live OpenCode Go status/);
  assert.match(text, /extra \[vault\] limited · limit=weekly · retryAfter=1m30s · workspace=wrk_test · http=429/);
  assert.match(text, /Plugin-observed usage \(local ledger\)/);
  assert.match(text, /5 Hour limit · \$12\.00/);
  assert.match(text, /extra \[vault\]\s+\[████████████░░░░░░░░░░░░\] 50%/);
  assert.match(text, /\$6\.000000 \/ \$12\.00 known · 2 req · 1 ok · 1 failed · 15 tok · 1 unknown-cost req/);
  assert.doesNotMatch(text, /50\.0% used/);
  assert.doesNotMatch(text, new RegExp(rawKey));
});

test('formats empty usage with omp-style zero bars', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'opencode-pool-status-empty-'));
  const vault = new KeyVault({ path: path.join(dir, 'vault.json') });
  const pool = new KeyPool({ vault, path: path.join(dir, 'state.json') });
  const ledger = new UsageLedger({ path: path.join(dir, 'usage.jsonl') });

  const report = await buildStatusReport({
    keyPool: pool,
    keyVault: vault,
    usageLedger: ledger,
    fetchLiveStatuses: async () => ({
      checked: true,
      endpoint: 'test://opencode-go-live-status',
      keys: [],
    }),
  });
  const text = formatStatusReport(report);

  assert.match(text, /total\s+\[░░░░░░░░░░░░░░░░░░░░░░░░\] 0%/);
  assert.match(text, /keys\s+\[░░░░░░░░░░░░░░░░░░░░░░░░\] 0%\s+no plugin-observed requests/);
});
