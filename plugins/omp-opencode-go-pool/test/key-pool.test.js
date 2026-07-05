import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { KeyPool } from '../src/key-pool.js';
import { KeyVault, hashKey } from '../src/key-vault.js';

test('selects primary plus extra keys and never exposes raw keys in states', async () => {
  const { pool } = await createPool();
  const rawPrimary = 'sk-primary-secret-value-1234567890';
  const states = await pool.listKeyStates(rawPrimary);

  assert.equal(states.length, 2);
  assert.doesNotMatch(JSON.stringify(states), new RegExp(rawPrimary));
  assert(states.some(state => state.source === 'primary'));
  assert(states.some(state => state.source === 'vault'));
});

test('skips a key after rate limit failure', async () => {
  const { pool } = await createPool();
  const primary = 'sk-primary-secret-value-1234567890';
  const selected = await pool.selectKey({ primaryApiKey: primary });
  const error = new Error('rate limit');
  error.status = 429;
  await pool.recordFailure(selected, error);

  const states = await pool.listKeyStates(primary);
  const failed = states.find(state => state.hash === selected.hash);
  assert.equal(failed.status, 'cooldown');

  const next = await pool.selectKey({ primaryApiKey: primary, excludedHashes: new Set() });
  assert.notEqual(next.hash, selected.hash);
});

test('reports exhausted when every key is excluded or cooling down', async () => {
  const { pool } = await createPool();
  const primary = 'sk-primary-secret-value-1234567890';
  const all = await pool.getCandidateKeys(primary);
  await assert.rejects(
    () => pool.selectKey({ primaryApiKey: primary, excludedHashes: new Set(all.map(key => key.hash)) }),
    /OpenCode Go key pool exhausted/,
  );
});

test('ignores corrupt best-effort health state instead of blocking routing', async () => {
  const { pool, dir } = await createPool();
  await writeFile(path.join(dir, 'state.json'), '{broken');

  const selected = await pool.selectKey({ primaryApiKey: 'sk-primary-secret-value-1234567890' });
  assert(selected.hash);
});

async function createPool() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'opencode-pool-key-pool-'));
  const vault = new KeyVault({ path: path.join(dir, 'vault.json') });
  await vault.addKey({ label: 'extra', key: 'sk-extra-secret-value-1234567890' });
  const pool = new KeyPool({
    vault,
    path: path.join(dir, 'state.json'),
    random: () => 0,
    now: () => 100000,
  });
  assert.equal(hashKey('sk-extra-secret-value-1234567890').length, 16);
  return { pool, vault, dir };
}
