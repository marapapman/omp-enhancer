import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runKeyCommand, parseKeyCommandArgs } from '../src/key-command.js';
import { KeyVault } from '../src/key-vault.js';

test('rejects API-key-looking slash command arguments', () => {
  const parsed = parseKeyCommandArgs('add sk-1234567890abcdefghijklmnopqrstuvwxyz');
  assert.equal(parsed.ok, false);
  assert.match(parsed.message, /Do not paste API keys/);
});

test('adds key through UI prompts without echoing raw key', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'opencode-pool-key-command-'));
  const vault = new KeyVault({ path: path.join(dir, 'vault.json') });
  const rawKey = 'sk-test-secret-value-1234567890';
  const ctx = {
    ui: {
      input: async title => (title.includes('label') ? 'backup' : rawKey),
    },
  };

  const result = await runKeyCommand({ args: '', ctx, keyVault: vault });
  assert.equal(result.ok, true);
  assert.match(result.text, /backup/);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(rawKey));

  const keys = await vault.listKeys();
  assert.equal(keys.length, 1);
  assert.equal(keys[0].label, 'backup');
});

test('supports remove and rename by label', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'opencode-pool-key-command-'));
  const vault = new KeyVault({ path: path.join(dir, 'vault.json') });
  await vault.addKey({ label: 'backup', key: 'sk-test-secret-value-1234567890' });

  const renamed = await runKeyCommand({ args: 'rename backup spare', ctx: {}, keyVault: vault });
  assert.equal(renamed.ok, true);
  assert.match(renamed.text, /spare/);

  const removed = await runKeyCommand({ args: 'remove spare', ctx: {}, keyVault: vault });
  assert.equal(removed.ok, true);
  assert.equal((await vault.listKeys()).length, 0);
});
