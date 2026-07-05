import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildStatusReport, formatStatusReport } from '../src/diagnostics.js';
import { KeyPool } from '../src/key-pool.js';
import { KeyVault } from '../src/key-vault.js';
import { UsageLedger } from '../src/usage.js';

test('formats status with health and plugin-owned usage', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'opencode-pool-status-'));
  const rawKey = 'sk-extra-secret-value-1234567890';
  const vault = new KeyVault({ path: path.join(dir, 'vault.json') });
  await vault.addKey({ label: 'extra', key: rawKey });
  const pool = new KeyPool({ vault, path: path.join(dir, 'state.json') });
  const ledger = new UsageLedger({ path: path.join(dir, 'usage.jsonl') });
  await ledger.appendAttempt({ key: { label: 'extra', hash: 'hash1', source: 'vault' }, success: true, usage: { totalTokens: 12 } });

  const report = await buildStatusReport({ keyPool: pool, keyVault: vault, usageLedger: ledger });
  const text = formatStatusReport(report);

  assert.match(text, /OpenCode Go key pool status/);
  assert.match(text, /Plugin-observed usage/);
  assert.doesNotMatch(text, new RegExp(rawKey));
});
