import assert from 'node:assert/strict';
import { mkdtemp, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { KeyVault, hashKey } from '../src/key-vault.js';

test('stores metadata separately from command-facing output', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'opencode-pool-vault-'));
  const vault = new KeyVault({ path: path.join(dir, 'vault.json') });
  const rawKey = 'sk-test-secret-value-1234567890';
  const result = await vault.addKey({ label: 'work', key: rawKey });

  assert.equal(result.key.hash, hashKey(rawKey));
  assert.doesNotMatch(JSON.stringify(result), new RegExp(rawKey));

  const listed = await vault.listKeys();
  assert.equal(listed.length, 1);
  assert.doesNotMatch(JSON.stringify(listed), new RegExp(rawKey));
});

test('writes vault with owner-only permissions where supported', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'opencode-pool-vault-'));
  const file = path.join(dir, 'vault.json');
  const vault = new KeyVault({ path: file });
  await vault.addKey({ label: 'work', key: 'sk-test-secret-value-1234567890' });

  if (process.platform !== 'win32') {
    assert.equal((await stat(file)).mode & 0o777, 0o600);
  }
});

test('deduplicates the same raw key by hash', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'opencode-pool-vault-'));
  const vault = new KeyVault({ path: path.join(dir, 'vault.json') });
  await vault.addKey({ label: 'first', key: 'sk-test-secret-value-1234567890' });
  const result = await vault.addKey({ label: 'second', key: 'sk-test-secret-value-1234567890' });

  assert.equal(result.action, 'updated');
  const listed = await vault.listKeys();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].label, 'second');
});

test('does not create duplicate labels when updating an existing key by hash', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'opencode-pool-vault-'));
  const vault = new KeyVault({ path: path.join(dir, 'vault.json') });
  await vault.addKey({ label: 'first', key: 'sk-first-secret-value-1234567890' });
  await vault.addKey({ label: 'second', key: 'sk-second-secret-value-1234567890' });

  await assert.rejects(
    () => vault.addKey({ label: 'second', key: 'sk-first-secret-value-1234567890' }),
    /label already exists/,
  );
});
