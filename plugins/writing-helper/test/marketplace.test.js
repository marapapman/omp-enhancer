import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  releaseTagForVersion,
  syncMarketplaceCatalogRelease,
  syncMarketplaceRelease,
} from '../src/marketplace-release.js';

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function readText(path) {
  return readFile(path, 'utf8');
}

describe('marketplace install metadata', () => {
  it('publishes writing-helper through the root omp-enhancer marketplace', async () => {
    const root = process.cwd();
    const packageJson = await readJson(join(root, 'package.json'));
    const catalog = await readJson(join(root, '..', '..', '.omp-plugin', 'marketplace.json'));
    const previousCatalog = await readJson(join(root, 'docs', 'previous-marketplace.json'));
    const plugin = catalog.plugins.find((candidate) => candidate.name === packageJson.name);

    assert.equal(catalog.name, 'omp-enhancer');
    assert.equal(catalog.owner.name, 'marapapman');
    assert.ok(plugin, 'root marketplace catalog should contain the package plugin');
    assert.equal(plugin.version, packageJson.version);
    assert.equal(plugin.category, 'writing');
    assert.equal(plugin.homepage, 'https://github.com/marapapman/omp-enhancer/tree/main/plugins/writing-helper');
    assert.equal(plugin.repository, 'https://github.com/marapapman/omp-enhancer');
    assert.equal(plugin.source, './writing-helper');
    assert.equal(previousCatalog.name, 'omp-writing-helper');
  });

  it('ships all files needed by marketplace and package installs', async () => {
    const packageJson = await readJson(join(process.cwd(), 'package.json'));

    assert.deepEqual(packageJson.omp.extensions, ['./index.js']);
    assert.deepEqual(packageJson.files, [
      'index.js',
      'src',
      'agents',
      'skills',
      'scripts',
      'package.json',
      'README.md',
    ]);
  });

  it('declares Pi skill roots for bundled writing skills', async () => {
    const packageJson = await readJson(join(process.cwd(), 'package.json'));

    assert.ok(packageJson.keywords.includes('pi-package'));
    assert.deepEqual(packageJson.pi.skills, ['./skills']);
  });

  it('documents marketplace install and upgrade commands', async () => {
    const readme = await readText(join(process.cwd(), 'README.md'));

    assert.match(readme, /omp plugin marketplace add marapapman\/omp-enhancer/);
    assert.match(readme, /omp plugin install writing-helper@omp-enhancer/);
    assert.match(readme, /omp plugin marketplace update omp-enhancer/);
    assert.match(readme, /omp plugin upgrade writing-helper@omp-enhancer/);
    assert.match(readme, /omp plugin link --dry-run --json \/absolute\/path\/to\/omp-enhancer\/plugins\/writing-helper/);
  });

  it('derives release tags from package versions', () => {
    assert.equal(releaseTagForVersion('0.2.0'), 'v0.2.0');
    assert.equal(releaseTagForVersion('v0.2.0'), 'v0.2.0');
    assert.throws(() => releaseTagForVersion('   '), /package version is empty/);
    assert.throws(() => releaseTagForVersion(), /package version is empty/);
  });

  it('syncs catalog plugin version and source ref without mutating the input', () => {
    const catalog = {
      name: 'omp-writing-helper',
      owner: { name: 'marapapman' },
      plugins: [
        {
          name: 'other-plugin',
          version: '9.9.9',
          source: {
            source: 'github',
            repo: 'marapapman/other-plugin',
            ref: 'v9.9.9',
          },
        },
        {
          name: 'writing-helper',
          version: '0.1.0',
          source: {
            source: 'github',
            repo: 'marapapman/omp-writing-helper',
            ref: 'v0.1.0',
          },
        },
      ],
    };

    const synced = syncMarketplaceCatalogRelease(catalog, {
      name: 'writing-helper',
      version: '0.2.0',
    });

    assert.notEqual(synced, catalog);
    assert.notEqual(synced.plugins, catalog.plugins);
    assert.equal(catalog.plugins[1].version, '0.1.0');
    assert.equal(catalog.plugins[1].source.ref, 'v0.1.0');
    assert.equal(synced.plugins[0], catalog.plugins[0]);
    assert.equal(synced.plugins[1].version, '0.2.0');
    assert.equal(synced.plugins[1].source.ref, 'v0.2.0');
  });

  it('fails release sync when the package plugin is absent from the catalog', () => {
    const catalog = {
      name: 'omp-writing-helper',
      owner: { name: 'marapapman' },
      plugins: [],
    };

    assert.throws(
      () => syncMarketplaceCatalogRelease(catalog, { name: 'writing-helper', version: '0.2.0' }),
      /marketplace plugin writing-helper was not found/,
    );
  });

  it('syncs the root monorepo marketplace catalog from the plugin workspace', async () => {
    const root = await mkdtemp(join(tmpdir(), 'writing-helper-marketplace-'));
    const pluginDir = join(root, 'plugins', 'writing-helper');
    try {
      await mkdir(pluginDir, { recursive: true });
      await mkdir(join(root, '.omp-plugin'));
      await writeFile(
        join(pluginDir, 'package.json'),
        `${JSON.stringify({ name: 'writing-helper', version: '0.3.0' }, null, 2)}\n`,
      );
      await writeFile(
        join(root, '.omp-plugin', 'marketplace.json'),
        `${JSON.stringify({
          name: 'omp-enhancer',
          owner: { name: 'marapapman' },
          metadata: { pluginRoot: 'plugins' },
          plugins: [
            {
              name: 'other-plugin',
              version: '9.9.9',
              source: './other-plugin',
              ref: 'v9.9.9',
            },
            {
              name: 'writing-helper',
              version: '0.2.0',
              category: 'writing',
              source: './writing-helper',
              ref: 'v0.2.0',
            },
          ],
        }, null, 2)}\n`,
      );

      const result = await syncMarketplaceRelease(pluginDir);
      const synced = await readJson(join(root, '.omp-plugin', 'marketplace.json'));

      assert.deepEqual(result, {
        version: '0.3.0',
        ref: 'v0.3.0',
        catalogPath: join(root, '.omp-plugin', 'marketplace.json'),
      });
      assert.deepEqual(synced.plugins[0], {
        name: 'other-plugin',
        version: '9.9.9',
        source: './other-plugin',
        ref: 'v9.9.9',
      });
      assert.equal(synced.plugins[1].version, '0.3.0');
      assert.equal(synced.plugins[1].source, './writing-helper');
      assert.equal(synced.plugins[1].ref, 'v0.3.0');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
