import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  readPluginDependencies,
  pluginNeedsInstall,
  verifyDependencies,
  installPluginDeps,
} from '../src/install-deps.js';

const FAKE_DEP = 'definitely-absent-pkg-xyz';

/**
 * Create a minimal marketplace catalog at <ompRoot>/plugins/cache/marketplaces/<name>/marketplace.json
 */
async function writeMarketplace(ompRoot, marketplaceName, plugins) {
  const dir = path.join(ompRoot, 'plugins', 'cache', 'marketplaces', marketplaceName);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'marketplace.json'),
    JSON.stringify({ name: marketplaceName, plugins }, null, 2),
  );
}

/**
 * Create a plugin cache dir at <ompRoot>/plugins/cache/plugins/<marketplace>___<name>___<version>/
 * Optionally write a package.json with the given dependencies.
 */
async function createPluginCache(ompRoot, marketplace, pluginName, version, dependencies = {}) {
  const pluginDir = path.join(
    ompRoot,
    'plugins',
    'cache',
    'plugins',
    `${marketplace}___${pluginName}___${version}`,
  );
  await mkdir(pluginDir, { recursive: true });
  await writeFile(
    path.join(pluginDir, 'package.json'),
    JSON.stringify({ name: pluginName, version, dependencies }, null, 2),
  );
  return pluginDir;
}

/** Make a single dependency resolvable by creating its node_modules entry. */
async function createInstalledDep(pluginDir, depName, version = '1.0.0') {
  const depDir = path.join(pluginDir, 'node_modules', depName);
  await mkdir(depDir, { recursive: true });
  await writeFile(
    path.join(depDir, 'package.json'),
    JSON.stringify({ name: depName, version, main: 'index.js' }, null, 2),
  );
  await writeFile(path.join(depDir, 'index.js'), `module.exports = {};\n`);
}

/** A fake install runner that records calls and simulates installing a dep by creating its node_modules entry. */
function recordingInstallRunner({ depsToInstall = [], throwOn = null } = {}) {
  const calls = [];
  const run = async (pluginDir, deps) => {
    calls.push({ pluginDir, deps: { ...deps } });
    if (throwOn) throw new Error(throwOn);
    for (const dep of depsToInstall.length ? depsToInstall : Object.keys(deps)) {
      await createInstalledDep(pluginDir, dep);
    }
  };
  run.calls = calls;
  return run;
}

let tmpRoot;

test.before(async () => {
  tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'omp-deps-test-'));
});

test.after(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

test('readPluginDependencies returns the dependencies object from package.json', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'omp-read-deps-'));
  await writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: { '@mermaid-js/mermaid-cli': '^11.16.0', lodash: '^4.0.0' } }, null, 2),
  );
  try {
    assert.deepEqual(readPluginDependencies(dir), { '@mermaid-js/mermaid-cli': '^11.16.0', lodash: '^4.0.0' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readPluginDependencies returns {} when package.json is absent', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'omp-read-deps-none-'));
  try {
    assert.deepEqual(readPluginDependencies(dir), {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('readPluginDependencies returns {} when package.json has no dependencies', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'omp-read-deps-empty-'));
  await writeFile(path.join(dir, 'package.json'), JSON.stringify({ name: 'x' }, null, 2));
  try {
    assert.deepEqual(readPluginDependencies(dir), {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('pluginNeedsInstall is true when a dep is unresolvable from the plugin dir', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'omp-needs-install-true-'));
  await writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: { [FAKE_DEP]: '^1.0.0' } }, null, 2),
  );
  try {
    assert.equal(pluginNeedsInstall(dir, { [FAKE_DEP]: '^1.0.0' }), true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('pluginNeedsInstall is false when the dep resolves from the plugin dir', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'omp-needs-install-false-'));
  await writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: { '@mermaid-js/mermaid-cli': '^11.16.0' } }, null, 2),
  );
  await createInstalledDep(dir, '@mermaid-js/mermaid-cli', '11.16.0');
  try {
    assert.equal(pluginNeedsInstall(dir, { '@mermaid-js/mermaid-cli': '^11.16.0' }), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('pluginNeedsInstall is false for empty deps', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'omp-needs-install-empty-'));
  try {
    assert.equal(pluginNeedsInstall(dir, {}), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('verifyDependencies reports ok:false with the missing dep before install', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'omp-verify-before-'));
  await writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: { [FAKE_DEP]: '^1.0.0' } }, null, 2),
  );
  try {
    const result = verifyDependencies(dir, { [FAKE_DEP]: '^1.0.0' });
    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, [FAKE_DEP]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('verifyDependencies reports ok:true after the node_modules entry is created', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'omp-verify-after-'));
  await writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'x', dependencies: { '@mermaid-js/mermaid-cli': '^11.16.0' } }, null, 2),
  );
  await createInstalledDep(dir, '@mermaid-js/mermaid-cli', '11.16.0');
  try {
    const result = verifyDependencies(dir, { '@mermaid-js/mermaid-cli': '^11.16.0' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.missing, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('installPluginDeps installs a plugin whose deps are absent, then verifies ok', async () => {
  const ompRoot = await mkdtemp(path.join(os.tmpdir(), 'omp-install-1-'));
  try {
    await writeMarketplace(ompRoot, 'ecc', [
      { name: 'mermaid-helper', version: '1.0.0', skills: ['./skills/mermaid'] },
    ]);
    const pluginDir = await createPluginCache(ompRoot, 'ecc', 'mermaid-helper', '1.0.0', { [FAKE_DEP]: '^1.0.0' });
    const runner = recordingInstallRunner();

    const result = await installPluginDeps({ ompRoot, installRunner: runner });

    assert.equal(runner.calls.length, 1);
    assert.equal(runner.calls[0].pluginDir, pluginDir);
    assert.equal(result.installed.length, 1);
    assert.equal(result.upToDate.length, 0);
    assert.equal(result.errors.length, 0);
    assert.equal(result.installed[0].plugin, 'mermaid-helper');
    assert.deepEqual(result.installed[0].dependencies, [FAKE_DEP]);
    assert.equal(verifyDependencies(pluginDir, { [FAKE_DEP]: '^1.0.0' }).ok, true);
  } finally {
    await rm(ompRoot, { recursive: true, force: true });
  }
});

test('installPluginDeps reports upToDate when deps already resolve and does not call the runner', async () => {
  const ompRoot = await mkdtemp(path.join(os.tmpdir(), 'omp-install-2-'));
  try {
    await writeMarketplace(ompRoot, 'ecc', [
      { name: 'mermaid-helper', version: '1.0.0', skills: ['./skills/mermaid'] },
    ]);
    const pluginDir = await createPluginCache(ompRoot, 'ecc', 'mermaid-helper', '1.0.0', { '@mermaid-js/mermaid-cli': '^11.16.0' });
    await createInstalledDep(pluginDir, '@mermaid-js/mermaid-cli', '11.16.0');
    const runner = recordingInstallRunner();

    const result = await installPluginDeps({ ompRoot, installRunner: runner });

    assert.equal(runner.calls.length, 0);
    assert.equal(result.upToDate.length, 1);
    assert.equal(result.installed.length, 0);
    assert.equal(result.errors.length, 0);
    assert.equal(result.upToDate[0].plugin, 'mermaid-helper');
  } finally {
    await rm(ompRoot, { recursive: true, force: true });
  }
});

test('installPluginDeps skips a plugin with no dependencies and does not call the runner', async () => {
  const ompRoot = await mkdtemp(path.join(os.tmpdir(), 'omp-install-3-'));
  try {
    await writeMarketplace(ompRoot, 'ecc', [
      { name: 'bare-plugin', version: '1.0.0', skills: [] },
    ]);
    await createPluginCache(ompRoot, 'ecc', 'bare-plugin', '1.0.0');
    const runner = recordingInstallRunner();

    const result = await installPluginDeps({ ompRoot, installRunner: runner });

    assert.equal(runner.calls.length, 0);
    assert.equal(result.installed.length, 0);
    assert.equal(result.upToDate.length, 0);
    assert.equal(result.errors.length, 0);
    assert.equal(result.warnings.length, 0);
  } finally {
    await rm(ompRoot, { recursive: true, force: true });
  }
});

test('installPluginDeps warns (not errors) when a marketplace plugin has no cache dir', async () => {
  const ompRoot = await mkdtemp(path.join(os.tmpdir(), 'omp-install-4-'));
  try {
    await writeMarketplace(ompRoot, 'ecc', [
      { name: 'ghost-plugin', version: '1.0.0', skills: ['./skills/ghost'] },
    ]);
    const runner = recordingInstallRunner();

    const result = await installPluginDeps({ ompRoot, installRunner: runner });

    assert.equal(runner.calls.length, 0);
    assert.equal(result.installed.length, 0);
    assert.equal(result.errors.length, 0);
    assert.ok(result.warnings.length >= 1, 'should warn about missing cache dir');
    assert.ok(result.warnings.some((w) => /ghost-plugin/.test(w)), 'warning should mention the plugin name');
  } finally {
    await rm(ompRoot, { recursive: true, force: true });
  }
});

test('installPluginDeps dryRun does not call the runner and reports the plugin as would-install', async () => {
  const ompRoot = await mkdtemp(path.join(os.tmpdir(), 'omp-install-5-'));
  try {
    await writeMarketplace(ompRoot, 'ecc', [
      { name: 'mermaid-helper', version: '1.0.0', skills: ['./skills/mermaid'] },
    ]);
    const pluginDir = await createPluginCache(ompRoot, 'ecc', 'mermaid-helper', '1.0.0', { [FAKE_DEP]: '^1.0.0' });
    const runner = recordingInstallRunner();

    const result = await installPluginDeps({ ompRoot, dryRun: true, installRunner: runner });

    assert.equal(runner.calls.length, 0);
    assert.equal(result.installed.length, 1);
    assert.equal(result.installed[0].dryRun, true);
    assert.equal(result.installed[0].plugin, 'mermaid-helper');
    // nothing was actually created
    const { existsSync } = await import('node:fs');
    assert.equal(existsSync(path.join(pluginDir, 'node_modules')), false);
  } finally {
    await rm(ompRoot, { recursive: true, force: true });
  }
});

test('installPluginDeps plugin filter processes only the named plugin', async () => {
  const ompRoot = await mkdtemp(path.join(os.tmpdir(), 'omp-install-6-'));
  try {
    await writeMarketplace(ompRoot, 'ecc', [
      { name: 'mermaid-helper', version: '1.0.0', skills: ['./skills/mermaid'] },
      { name: 'other-helper', version: '1.0.0', skills: ['./skills/other'] },
    ]);
    await createPluginCache(ompRoot, 'ecc', 'mermaid-helper', '1.0.0', { [FAKE_DEP]: '^1.0.0' });
    await createPluginCache(ompRoot, 'ecc', 'other-helper', '1.0.0', { [FAKE_DEP]: '^1.0.0' });
    const runner = recordingInstallRunner();

    const result = await installPluginDeps({ ompRoot, plugin: 'other-helper', installRunner: runner });

    assert.equal(runner.calls.length, 1);
    assert.equal(runner.calls[0].pluginDir, path.join(
      ompRoot, 'plugins', 'cache', 'plugins', 'ecc___other-helper___1.0.0'));
    assert.equal(result.installed.length, 1);
    assert.equal(result.installed[0].plugin, 'other-helper');
  } finally {
    await rm(ompRoot, { recursive: true, force: true });
  }
});

test('installPluginDeps records an error (and does not throw) when the runner throws', async () => {
  const ompRoot = await mkdtemp(path.join(os.tmpdir(), 'omp-install-7-'));
  try {
    await writeMarketplace(ompRoot, 'ecc', [
      { name: 'mermaid-helper', version: '1.0.0', skills: ['./skills/mermaid'] },
    ]);
    await createPluginCache(ompRoot, 'ecc', 'mermaid-helper', '1.0.0', { [FAKE_DEP]: '^1.0.0' });
    const runner = recordingInstallRunner({ throwOn: 'simulated npm install failure' });

    const result = await installPluginDeps({ ompRoot, installRunner: runner });

    assert.equal(result.errors.length, 1);
    assert.equal(result.installed.length, 0);
    assert.equal(result.errors[0].plugin, 'mermaid-helper');
    assert.match(result.errors[0].error, /simulated npm install failure/);
  } finally {
    await rm(ompRoot, { recursive: true, force: true });
  }
});