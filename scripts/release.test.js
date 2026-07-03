import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releaseScript = join(repoRoot, 'scripts', 'release.js');

const pluginFixtures = [
  { directory: 'omp-config', name: 'omp-config', version: '0.1.0' },
  { directory: 'writing-helper', name: 'writing-helper', version: '0.2.1', ref: 'v0.2.1' },
  { directory: 'omp-test-enhancer', name: 'omp-testing-enhancer', version: '0.1.3', ref: 'v0.1.3' },
  { directory: 'omp-enhancer-core', name: 'omp-enhancer-core', version: '0.1.0' },
];

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function createReleaseFixture() {
  const root = await mkdtemp(join(tmpdir(), 'omp-release-'));

  await mkdir(join(root, '.omp-plugin'), { recursive: true });
  await mkdir(join(root, 'plugins'), { recursive: true });

  await writeJson(join(root, 'package.json'), {
    name: 'omp-enhancer-monorepo',
    private: true,
    type: 'module',
    workspaces: pluginFixtures.map((plugin) => `plugins/${plugin.directory}`),
  });

  await writeJson(join(root, '.omp-plugin', 'marketplace.json'), {
    name: 'omp-enhancer',
    owner: { name: 'marapapman' },
    metadata: {
      description: 'OMP enhancement plugins for release automation tests.',
      version: '1.0.0',
      pluginRoot: 'plugins',
    },
    plugins: pluginFixtures.map((plugin) => ({
      name: plugin.name,
      version: plugin.version,
      category: plugin.name === 'writing-helper' ? 'writing' : 'development',
      homepage: `https://github.com/marapapman/omp-enhancer/tree/main/plugins/${plugin.directory}`,
      repository: 'https://github.com/marapapman/omp-enhancer',
      source: `./${plugin.directory}`,
      ...(plugin.ref ? { ref: plugin.ref } : {}),
    })),
  });

  for (const plugin of pluginFixtures) {
    const pluginDir = join(root, 'plugins', plugin.directory);
    await mkdir(pluginDir, { recursive: true });
    await writeJson(join(pluginDir, 'package.json'), {
      name: plugin.name,
      version: plugin.version,
      private: true,
      type: 'module',
    });
  }

  return root;
}

async function withReleaseFixture(fn) {
  const root = await createReleaseFixture();
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function readCatalog(root) {
  return readJson(join(root, '.omp-plugin', 'marketplace.json'));
}

async function readPluginPackage(root, directory) {
  return readJson(join(root, 'plugins', directory, 'package.json'));
}

async function snapshotReleaseFiles(root) {
  const files = [
    'package.json',
    '.omp-plugin/marketplace.json',
    ...pluginFixtures.map((plugin) => `plugins/${plugin.directory}/package.json`),
  ];

  const snapshot = {};
  for (const file of files) {
    snapshot[file] = await readFile(join(root, file), 'utf8');
  }
  return snapshot;
}

function runRelease(root, args) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [releaseScript, ...args], {
      cwd: root,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolveResult({ code, signal, stdout, stderr });
    });
  });
}

function formatResult(result) {
  return `exit=${result.code} signal=${result.signal ?? 'none'}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`;
}

function assertReleaseSucceeded(result) {
  assert.equal(result.code, 0, formatResult(result));
  assert.equal(result.signal, null, formatResult(result));
}

function assertReleaseFailed(result, messagePattern) {
  assert.notEqual(result.code, 0, formatResult(result));
  const output = `${result.stderr}\n${result.stdout}`;
  if (/Cannot find module .*scripts\/release\.js|MODULE_NOT_FOUND/.test(output)) {
    assert.fail(`scripts/release.js is missing or not runnable\n${formatResult(result)}`);
  }
  assert.match(output, messagePattern, formatResult(result));
}

test('--plugin writing-helper --version tracks main by removing ref and syncing package/catalog versions', async () => {
  await withReleaseFixture(async (root) => {
    const result = await runRelease(root, [
      '--plugin',
      'writing-helper',
      '--version',
      '0.3.0',
      '--apply',
    ]);

    assertReleaseSucceeded(result);

    const packageJson = await readPluginPackage(root, 'writing-helper');
    const catalog = await readCatalog(root);
    const writingHelper = catalog.plugins.find((plugin) => plugin.name === 'writing-helper');
    const testingEnhancer = catalog.plugins.find((plugin) => plugin.name === 'omp-testing-enhancer');

    assert.equal(packageJson.version, '0.3.0');
    assert.equal(writingHelper.version, '0.3.0');
    assert.equal(Object.hasOwn(writingHelper, 'ref'), false);
    assert.equal(testingEnhancer.version, '0.1.3');
    assert.equal(testingEnhancer.ref, 'v0.1.3');
    assert.equal(catalog.metadata.version, '1.0.0');
  });
});

test('--plugin all --bump patch bumps every plugin package, every catalog entry, and catalog metadata', async () => {
  await withReleaseFixture(async (root) => {
    const result = await runRelease(root, ['--plugin', 'all', '--bump', 'patch', '--apply']);

    assertReleaseSucceeded(result);

    const catalog = await readCatalog(root);
    const expectedVersions = new Map([
      ['omp-config', { directory: 'omp-config', version: '0.1.1' }],
      ['writing-helper', { directory: 'writing-helper', version: '0.2.2' }],
      ['omp-testing-enhancer', { directory: 'omp-test-enhancer', version: '0.1.4' }],
      ['omp-enhancer-core', { directory: 'omp-enhancer-core', version: '0.1.1' }],
    ]);

    assert.equal(catalog.metadata.version, '1.0.1');
    for (const [name, expected] of expectedVersions) {
      const packageJson = await readPluginPackage(root, expected.directory);
      const catalogPlugin = catalog.plugins.find((plugin) => plugin.name === name);

      assert.equal(packageJson.version, expected.version, `${name} package version`);
      assert.equal(catalogPlugin.version, expected.version, `${name} catalog version`);
      assert.equal(Object.hasOwn(catalogPlugin, 'ref'), false, `${name} tracks main by default`);
    }
  });
});

test('--pin-ref pins the selected plugin catalog entry to v<version>', async () => {
  await withReleaseFixture(async (root) => {
    const result = await runRelease(root, [
      '--plugin',
      'writing-helper',
      '--version',
      '0.3.0',
      '--pin-ref',
      '--apply',
    ]);

    assertReleaseSucceeded(result);

    const catalog = await readCatalog(root);
    const writingHelper = catalog.plugins.find((plugin) => plugin.name === 'writing-helper');
    const config = catalog.plugins.find((plugin) => plugin.name === 'omp-config');

    assert.equal(writingHelper.version, '0.3.0');
    assert.equal(writingHelper.ref, 'v0.3.0');
    assert.equal(config.version, '0.1.0');
    assert.equal(Object.hasOwn(config, 'ref'), false);
  });
});

test('--dry-run reports planned changes without writing release files', async () => {
  await withReleaseFixture(async (root) => {
    const before = await snapshotReleaseFiles(root);
    const result = await runRelease(root, ['--plugin', 'writing-helper', '--version', '0.3.0', '--dry-run']);

    assertReleaseSucceeded(result);
    assert.match(result.stdout, /dry[- ]run/i);
    assert.match(result.stdout, /writing-helper/);
    assert.match(result.stdout, /0\.2\.1/);
    assert.match(result.stdout, /0\.3\.0/);
    assert.match(result.stdout, /package\.json/);
    assert.match(result.stdout, /marketplace\.json/);
    assert.deepEqual(await snapshotReleaseFiles(root), before);
  });
});

test('unknown plugin fails and leaves release files unchanged', async () => {
  await withReleaseFixture(async (root) => {
    const before = await snapshotReleaseFiles(root);
    const result = await runRelease(root, ['--plugin', 'not-a-plugin', '--version', '1.0.0', '--apply']);

    assertReleaseFailed(result, /unknown plugin.*not-a-plugin|not-a-plugin.*unknown plugin/i);
    assert.deepEqual(await snapshotReleaseFiles(root), before);
  });
});

test('version downgrade fails unless --allow-downgrade is explicit', async () => {
  await withReleaseFixture(async (root) => {
    const before = await snapshotReleaseFiles(root);
    const rejected = await runRelease(root, [
      '--plugin',
      'writing-helper',
      '--version',
      '0.2.0',
      '--apply',
    ]);

    assertReleaseFailed(rejected, /downgrade.*writing-helper|writing-helper.*downgrade/i);
    assert.deepEqual(await snapshotReleaseFiles(root), before);

    const allowed = await runRelease(root, [
      '--plugin',
      'writing-helper',
      '--version',
      '0.2.0',
      '--allow-downgrade',
      '--apply',
    ]);

    assertReleaseSucceeded(allowed);

    const packageJson = await readPluginPackage(root, 'writing-helper');
    const catalog = await readCatalog(root);
    const writingHelper = catalog.plugins.find((plugin) => plugin.name === 'writing-helper');

    assert.equal(packageJson.version, '0.2.0');
    assert.equal(writingHelper.version, '0.2.0');
    assert.equal(Object.hasOwn(writingHelper, 'ref'), false);
  });
});
