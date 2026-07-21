import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { pluginWorkspaces } from './plugin-workspaces.js';
import { applyRelease, planRelease } from './release.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releaseScript = join(repoRoot, 'scripts', 'release.js');
const marketplaceCheckScript = join(repoRoot, 'scripts', 'check-marketplace.js');

const fixtureVersions = new Map([
  ['omp-config', '0.1.0'],
  ['writing-helper', '0.2.1'],
  ['omp-testing-enhancer', '0.1.3'],
  ['omp-fact-checker', '0.1.0'],
  ['omp-enhancer-core', '0.1.0'],
  ['tikz-helper', '0.1.0'],
]);

const pluginFixtures = pluginWorkspaces.map(({ directory, name }) => ({
  directory,
  name,
  version: fixtureVersions.get(name),
}));

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

  await writeJson(join(root, 'package-lock.json'), {
    name: 'omp-enhancer-monorepo',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'omp-enhancer-monorepo',
        workspaces: pluginFixtures.map((plugin) => `plugins/${plugin.directory}`),
      },
      ...Object.fromEntries(pluginFixtures.map((plugin) => [
        `plugins/${plugin.directory}`,
        { version: plugin.version },
      ])),
    },
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

async function readPackageLock(root) {
  return readJson(join(root, 'package-lock.json'));
}

async function snapshotReleaseFiles(root) {
  const files = [
    'package.json',
    'package-lock.json',
    '.omp-plugin/marketplace.json',
    ...pluginFixtures.map((plugin) => `plugins/${plugin.directory}/package.json`),
  ];

  const snapshot = {};
  for (const file of files) {
    snapshot[file] = await readFile(join(root, file), 'utf8');
  }
  return snapshot;
}

async function findReleaseArtifacts(root) {
  const directories = [
    root,
    join(root, '.omp-plugin'),
    ...pluginFixtures.map((plugin) => join(root, 'plugins', plugin.directory)),
  ];
  const artifacts = [];
  for (const directory of directories) {
    for (const name of await readdir(directory)) {
      if (name.includes('.release-')) artifacts.push(join(directory, name));
    }
  }
  return artifacts.sort();
}

function releaseOptions(overrides = {}) {
  return {
    plugin: 'writing-helper',
    version: '0.3.0',
    bump: null,
    catalogBump: null,
    apply: true,
    allowDowngrade: false,
    ...overrides,
  };
}

test('--catalog-bump updates marketplace metadata during a scoped plugin release', async () => {
  await withReleaseFixture(async (root) => {
    const result = await runRelease(root, [
      '--plugin',
      'tikz-helper',
      '--bump',
      'patch',
      '--catalog-bump',
      'patch',
      '--apply',
    ]);

    assertReleaseSucceeded(result);

    const catalog = await readCatalog(root);
    const tikzHelper = catalog.plugins.find((plugin) => plugin.name === 'tikz-helper');
    const core = catalog.plugins.find((plugin) => plugin.name === 'omp-enhancer-core');
    assert.equal(catalog.metadata.version, '1.0.1');
    assert.equal(tikzHelper.version, '0.1.1');
    assert.equal(core.version, '0.1.0');
  });
});

function runNodeScript(root, scriptPath, args = []) {
  return new Promise((resolveResult, reject) => {
    const childEnv = { ...process.env, NO_COLOR: '1' };
    for (const key of Object.keys(childEnv)) {
      if (key === 'NODE_CHANNEL_FD' || key.startsWith('NODE_TEST_')) delete childEnv[key];
    }
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: root,
      env: childEnv,
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

function runRelease(root, args) {
  return runNodeScript(root, releaseScript, args);
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

test('--plugin writing-helper --version tracks main and syncs package, lock, and catalog versions', async () => {
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
    const packageLock = await readPackageLock(root);
    const catalog = await readCatalog(root);
    const writingHelper = catalog.plugins.find((plugin) => plugin.name === 'writing-helper');
    const testingEnhancer = catalog.plugins.find((plugin) => plugin.name === 'omp-testing-enhancer');

    assert.equal(packageJson.version, '0.3.0');
    assert.equal(packageLock.packages['plugins/writing-helper'].version, '0.3.0');
    assert.equal(packageLock.packages['plugins/omp-config'].version, '0.1.0');
    assert.equal(writingHelper.version, '0.3.0');
    assert.equal(Object.hasOwn(writingHelper, 'ref'), false);
    assert.equal(testingEnhancer.version, '0.1.3');
    assert.equal(Object.hasOwn(testingEnhancer, 'ref'), false);
    assert.equal(catalog.metadata.version, '1.0.0');

    const marketplaceCheck = await runNodeScript(root, marketplaceCheckScript);
    assertReleaseSucceeded(marketplaceCheck);
    assert.deepEqual(await findReleaseArtifacts(root), []);
  });
});

test('--plugin all --bump patch bumps every plugin package, every catalog entry, and catalog metadata', async () => {
  await withReleaseFixture(async (root) => {
    const result = await runRelease(root, ['--plugin', 'all', '--bump', 'patch', '--apply']);

    assertReleaseSucceeded(result);

    const catalog = await readCatalog(root);
    const packageLock = await readPackageLock(root);
    const expectedVersions = new Map([
      ['omp-config', { directory: 'omp-config', version: '0.1.1' }],
      ['writing-helper', { directory: 'writing-helper', version: '0.2.2' }],
      ['omp-testing-enhancer', { directory: 'omp-test-enhancer', version: '0.1.4' }],
      ['omp-fact-checker', { directory: 'omp-fact-checker', version: '0.1.1' }],
      ['omp-enhancer-core', { directory: 'omp-enhancer-core', version: '0.1.1' }],
      ['tikz-helper', { directory: 'tikz-helper', version: '0.1.1' }],
    ]);

    assert.equal(catalog.metadata.version, '1.0.1');
    for (const [name, expected] of expectedVersions) {
      const packageJson = await readPluginPackage(root, expected.directory);
      const catalogPlugin = catalog.plugins.find((plugin) => plugin.name === name);

      assert.equal(packageJson.version, expected.version, `${name} package version`);
      assert.equal(
        packageLock.packages[`plugins/${expected.directory}`].version,
        expected.version,
        `${name} package-lock workspace version`,
      );
      assert.equal(catalogPlugin.version, expected.version, `${name} catalog version`);
      assert.equal(Object.hasOwn(catalogPlugin, 'ref'), false, `${name} tracks main by default`);
    }
  });
});

test('--pin-ref is rejected and leaves release files unchanged', async () => {
  await withReleaseFixture(async (root) => {
    const before = await snapshotReleaseFiles(root);
    const result = await runRelease(root, [
      '--plugin',
      'writing-helper',
      '--version',
      '0.3.0',
      '--pin-ref',
      '--apply',
    ]);

    assertReleaseFailed(result, /unknown argument --pin-ref/i);
    assert.deepEqual(await snapshotReleaseFiles(root), before);
  });
});

test('--apply removes a legacy ref from the selected catalog entry', async () => {
  await withReleaseFixture(async (root) => {
    const catalogPath = join(root, '.omp-plugin', 'marketplace.json');
    const catalog = await readJson(catalogPath);
    catalog.plugins.find((plugin) => plugin.name === 'writing-helper').ref = 'v0.2.1';
    await writeJson(catalogPath, catalog);

    const result = await runRelease(root, [
      '--plugin',
      'writing-helper',
      '--version',
      '0.3.0',
      '--apply',
    ]);

    assertReleaseSucceeded(result);
    assert.match(result.stdout, /writing-helper\.ref: v0\.2\.1 -> track-main/);

    const releasedCatalog = await readCatalog(root);
    const writingHelper = releasedCatalog.plugins.find((plugin) => plugin.name === 'writing-helper');
    assert.equal(Object.hasOwn(writingHelper, 'ref'), false);
    assertReleaseSucceeded(await runNodeScript(root, marketplaceCheckScript));
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
    assert.match(result.stdout, /package-lock\.json/);
    assert.match(result.stdout, /marketplace\.json/);
    assert.deepEqual(await snapshotReleaseFiles(root), before);
  });
});

test('--dry-run reports the catalog version as the marketplace change source', async () => {
  await withReleaseFixture(async (root) => {
    const catalogPath = join(root, '.omp-plugin', 'marketplace.json');
    const catalog = await readJson(catalogPath);
    catalog.plugins.find((plugin) => plugin.name === 'writing-helper').version = '0.2.0';
    await writeJson(catalogPath, catalog);
    const before = await snapshotReleaseFiles(root);

    const result = await runRelease(root, [
      '--plugin',
      'writing-helper',
      '--version',
      '0.3.0',
      '--dry-run',
    ]);

    assertReleaseSucceeded(result);
    assert.match(result.stdout, /writing-helper\.version: 0\.2\.0 -> 0\.3\.0/);
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
    const packageLock = await readPackageLock(root);
    const catalog = await readCatalog(root);
    const writingHelper = catalog.plugins.find((plugin) => plugin.name === 'writing-helper');

    assert.equal(packageJson.version, '0.2.0');
    assert.equal(packageLock.packages['plugins/writing-helper'].version, '0.2.0');
    assert.equal(writingHelper.version, '0.2.0');
    assert.equal(Object.hasOwn(writingHelper, 'ref'), false);
  });
});

test('downgrade guard uses the highest package, catalog, or lock version', async (t) => {
  const cases = [
    {
      name: 'higher catalog version',
      pattern: /highest current version 0\.4\.0.*catalog 0\.4\.0/s,
      mutate: async (root) => {
        const catalogPath = join(root, '.omp-plugin', 'marketplace.json');
        const catalog = await readJson(catalogPath);
        catalog.plugins.find((plugin) => plugin.name === 'writing-helper').version = '0.4.0';
        await writeJson(catalogPath, catalog);
      },
    },
    {
      name: 'higher lock version',
      pattern: /highest current version 0\.5\.0.*lock 0\.5\.0/s,
      mutate: async (root) => {
        const lockPath = join(root, 'package-lock.json');
        const packageLock = await readJson(lockPath);
        packageLock.packages['plugins/writing-helper'].version = '0.5.0';
        await writeJson(lockPath, packageLock);
      },
    },
  ];

  for (const fixtureCase of cases) {
    await t.test(fixtureCase.name, async () => {
      await withReleaseFixture(async (root) => {
        await fixtureCase.mutate(root);
        const before = await snapshotReleaseFiles(root);
        const result = await runRelease(root, [
          '--plugin',
          'writing-helper',
          '--version',
          '0.3.0',
          '--apply',
        ]);

        assertReleaseFailed(result, fixtureCase.pattern);
        assert.deepEqual(await snapshotReleaseFiles(root), before);
        assert.deepEqual(await findReleaseArtifacts(root), []);
      });
    });
  }
});

test('--apply repairs a stale selected workspace lock version without changing unselected entries', async () => {
  await withReleaseFixture(async (root) => {
    const lockPath = join(root, 'package-lock.json');
    const staleLock = await readJson(lockPath);
    staleLock.packages['plugins/omp-enhancer-core'].version = '0.0.9';
    await writeJson(lockPath, staleLock);

    const result = await runRelease(root, [
      '--plugin',
      'omp-enhancer-core',
      '--version',
      '0.1.1',
      '--apply',
    ]);

    assertReleaseSucceeded(result);

    const packageJson = await readPluginPackage(root, 'omp-enhancer-core');
    const packageLock = await readPackageLock(root);
    const catalog = await readCatalog(root);
    const core = catalog.plugins.find((plugin) => plugin.name === 'omp-enhancer-core');

    assert.equal(packageJson.version, '0.1.1');
    assert.equal(packageLock.packages['plugins/omp-enhancer-core'].version, '0.1.1');
    assert.equal(packageLock.packages['plugins/writing-helper'].version, '0.2.1');
    assert.equal(core.version, '0.1.1');
  });
});

test('release preflight rejects inconsistent plugin inventory before writing', async (t) => {
  const cases = [
    {
      name: 'root workspace inventory',
      pattern: /Root workspaces mismatch/,
      mutate: async (root) => {
        const packagePath = join(root, 'package.json');
        const packageJson = await readJson(packagePath);
        packageJson.workspaces.pop();
        await writeJson(packagePath, packageJson);
      },
    },
    {
      name: 'package-lock workspace inventory',
      pattern: /Package-lock plugin inventory mismatch/,
      mutate: async (root) => {
        const lockPath = join(root, 'package-lock.json');
        const packageLock = await readJson(lockPath);
        delete packageLock.packages['plugins/omp-config'];
        await writeJson(lockPath, packageLock);
      },
    },
    {
      name: 'marketplace inventory',
      pattern: /Marketplace plugin inventory mismatch/,
      mutate: async (root) => {
        const catalogPath = join(root, '.omp-plugin', 'marketplace.json');
        const catalog = await readJson(catalogPath);
        catalog.plugins.push({ name: 'unexpected-plugin', version: '1.0.0', source: './unexpected-plugin' });
        await writeJson(catalogPath, catalog);
      },
    },
    {
      name: 'plugin package manifest identity',
      pattern: /Plugin package name mismatch/,
      mutate: async (root) => {
        const packagePath = join(root, 'plugins', 'omp-config', 'package.json');
        const packageJson = await readJson(packagePath);
        packageJson.name = 'wrong-name';
        await writeJson(packagePath, packageJson);
      },
    },
  ];

  for (const fixtureCase of cases) {
    await t.test(fixtureCase.name, async () => {
      await withReleaseFixture(async (root) => {
        await fixtureCase.mutate(root);
        const before = await snapshotReleaseFiles(root);
        const result = await runRelease(root, [
          '--plugin',
          'writing-helper',
          '--version',
          '0.3.0',
          '--apply',
        ]);

        assertReleaseFailed(result, fixtureCase.pattern);
        assert.deepEqual(await snapshotReleaseFiles(root), before);
      });
    });
  }
});

test('release transaction rolls back every target and removes artifacts on failure', async (t) => {
  const cases = [
    { name: 'prepare failure', phase: 'prepared', index: 0 },
    { name: 'commit failure before a later target changes', phase: 'before-commit', index: 1 },
    { name: 'commit failure after multiple targets changed', phase: 'committed', index: 1 },
  ];

  for (const fixtureCase of cases) {
    await t.test(fixtureCase.name, async () => {
      await withReleaseFixture(async (root) => {
        const before = await snapshotReleaseFiles(root);
        const plan = await planRelease(root, releaseOptions());

        await assert.rejects(
          () => applyRelease(plan, {
            onStep: ({ phase, index }) => {
              if (phase === fixtureCase.phase && index === fixtureCase.index) {
                throw new Error(`injected ${fixtureCase.name}`);
              }
            },
          }),
          new RegExp(`injected ${fixtureCase.name}`),
        );

        assert.deepEqual(await snapshotReleaseFiles(root), before);
        assert.deepEqual(await findReleaseArtifacts(root), []);
        assertReleaseSucceeded(await runNodeScript(root, marketplaceCheckScript));
      });
    });
  }
});

test('rollback falls back to original bytes when backup rename fails', async () => {
  await withReleaseFixture(async (root) => {
    const before = await snapshotReleaseFiles(root);
    const plan = await planRelease(root, releaseOptions());

    await assert.rejects(
      () => applyRelease(plan, {
        onStep: ({ phase, index }) => {
          if (phase === 'committed' && index === 0) throw new Error('trigger rollback');
          if (phase === 'before-backup-restore' && index === 0) {
            throw new Error('injected backup rename failure');
          }
        },
      }),
      /trigger rollback/,
    );

    assert.deepEqual(await snapshotReleaseFiles(root), before);
    assert.deepEqual(await findReleaseArtifacts(root), []);
    assertReleaseSucceeded(await runNodeScript(root, marketplaceCheckScript));
  });
});

test('cleanup failure reports committed state and preserves the unavailable backup', async () => {
  await withReleaseFixture(async (root) => {
    const plan = await planRelease(root, releaseOptions());

    await assert.rejects(
      () => applyRelease(plan, {
        onStep: ({ phase, index }) => {
          if (phase === 'before-cleanup' && index === 1) {
            throw new Error('injected cleanup failure');
          }
        },
      }),
      /committed but cleanup was incomplete.*preserved backups/s,
    );

    const packageJson = await readPluginPackage(root, 'writing-helper');
    const packageLock = await readPackageLock(root);
    const catalog = await readCatalog(root);
    const writingHelper = catalog.plugins.find((plugin) => plugin.name === 'writing-helper');
    assert.equal(packageJson.version, '0.3.0');
    assert.equal(packageLock.packages['plugins/writing-helper'].version, '0.3.0');
    assert.equal(writingHelper.version, '0.3.0');

    const artifacts = await findReleaseArtifacts(root);
    assert.equal(artifacts.length, 1);
    assert.match(artifacts[0], /\.bak$/);
    assertReleaseSucceeded(await runNodeScript(root, marketplaceCheckScript));
  });
});
