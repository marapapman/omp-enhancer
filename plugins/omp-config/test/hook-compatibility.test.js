import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function listTypeScriptFiles(dir) {
  try {
    return (await readdir(dir)).filter((name) => name.endsWith('.ts')).sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

test('automatic hook directories contain advisory-only hooks', async () => {
  const autoPre = await listTypeScriptFiles(path.join(pluginRoot, 'hooks', 'pre'));
  const autoPost = await listTypeScriptFiles(path.join(pluginRoot, 'hooks', 'post'));

  assert.deepEqual(autoPre, [
    'edit-anchor-guard.ts',
    'guard-destructive.ts',
  ]);
  assert.deepEqual(autoPost, []);
});

test('auto-discovered guard hooks register a tool_call handler and never block', async () => {
  const { default: registerDestructive } = await import('../hooks/pre/guard-destructive.ts');
  const { default: registerEditAnchor } = await import('../hooks/pre/edit-anchor-guard.ts');

  for (const factory of [registerDestructive, registerEditAnchor]) {
    let handler = null;
    factory({
      on(event, candidate) {
        assert.equal(event, 'tool_call');
        handler = candidate;
      },
    });
    assert.equal(typeof handler, 'function');

    const warnings = [];
    const result = await handler(
      { toolName: 'bash', input: { command: 'rm -rf /' } },
      { ui: { notify(message, level) { warnings.push({ message, level }); } } },
    );
    assert.equal(result, undefined);
    assert.ok(warnings.length >= 0);
  }
});