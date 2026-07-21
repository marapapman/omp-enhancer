import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  assertExactPluginInventory,
  assertPluginWorkspaceInventory,
  pluginWorkspaces,
} from './plugin-workspaces.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), 'utf8'))
}

test('one plugin workspace inventory matches npm and marketplace metadata', async () => {
  const rootPackage = await readJson('package.json')
  const packageLock = await readJson('package-lock.json')
  const catalog = await readJson('.omp-plugin/marketplace.json')
  const packageManifests = new Map(await Promise.all(pluginWorkspaces.map(async ({ workspace }) => [
    workspace,
    await readJson(`${workspace}/package.json`),
  ])))

  assert.doesNotThrow(() => assertPluginWorkspaceInventory({
    rootPackage,
    packageLock,
    catalog,
    packageManifests,
  }))
})

test('canonical inventory includes the independently installable TikZ helper last', () => {
  assert.deepEqual(
    pluginWorkspaces.map(({ name, workspace }) => ({ name, workspace })),
    [
      { name: 'omp-config', workspace: 'plugins/omp-config' },
      { name: 'writing-helper', workspace: 'plugins/writing-helper' },
      { name: 'omp-testing-enhancer', workspace: 'plugins/omp-test-enhancer' },
      { name: 'omp-fact-checker', workspace: 'plugins/omp-fact-checker' },
      { name: 'omp-enhancer-core', workspace: 'plugins/omp-enhancer-core' },
      { name: 'tikz-helper', workspace: 'plugins/tikz-helper' },
    ],
  )
})

test('root release script is the sole marketplace version writer', async () => {
  for (const definition of pluginWorkspaces) {
    const packageJson = await readJson(`${definition.workspace}/package.json`)
    assert.equal(
      Object.hasOwn(packageJson.scripts ?? {}, 'sync:marketplace'),
      false,
      `${definition.name} must use the root release script`,
    )
  }

  const obsoleteReleaseFiles = [
    'plugins/writing-helper/src/marketplace-release.js',
    'plugins/writing-helper/scripts/sync-marketplace-release.js',
    'plugins/omp-test-enhancer/src/marketplace/marketplaceRelease.ts',
    'plugins/omp-test-enhancer/scripts/sync-marketplace-release.ts',
    'plugins/omp-test-enhancer/dist/marketplace/marketplaceRelease.js',
  ]

  for (const relativePath of obsoleteReleaseFiles) {
    await assert.rejects(
      access(path.join(repoRoot, relativePath)),
      (error) => error?.code === 'ENOENT',
      `${relativePath} duplicates scripts/release.js`,
    )
  }
})

test('plugin packages publish runtime assets without test trees', async () => {
  for (const { name, workspace } of pluginWorkspaces) {
    const packageJson = await readJson(`${workspace}/package.json`)
    assert.ok(Array.isArray(packageJson.files), `${name} must declare an explicit files allowlist`)
    assert.equal(
      packageJson.files.some((entry) => /^(?:test|tests)(?:\/|$)/u.test(entry)),
      false,
      `${name} must not publish its test tree`,
    )
  }
})

test('marketplace inventory rejects duplicate, missing, and extra plugins', () => {
  const validPlugins = pluginWorkspaces.map(({ name }) => ({ name }))
  assert.doesNotThrow(() => assertExactPluginInventory(validPlugins))

  assert.throws(
    () => assertExactPluginInventory([...validPlugins, { name: validPlugins[0].name }]),
    /Duplicate marketplace plugins/,
  )
  assert.throws(
    () => assertExactPluginInventory(validPlugins.slice(1)),
    /Marketplace plugin inventory mismatch/,
  )
  assert.throws(
    () => assertExactPluginInventory([...validPlugins, { name: 'unexpected-plugin' }]),
    /Marketplace plugin inventory mismatch/,
  )
})

test('unified plugin inventory rejects drift across root, lock, catalog, and manifests', () => {
  const cases = [
    {
      pattern: /Root workspaces mismatch/,
      mutate: ({ rootPackage }) => rootPackage.workspaces.pop(),
    },
    {
      pattern: /Package-lock root workspaces mismatch/,
      mutate: ({ packageLock }) => packageLock.packages[''].workspaces.reverse(),
    },
    {
      pattern: /Package-lock plugin inventory mismatch/,
      mutate: ({ packageLock }) => {
        packageLock.packages['plugins/unexpected-plugin'] = { version: '1.0.0' }
      },
    },
    {
      pattern: /source mismatch/,
      mutate: ({ catalog }) => {
        catalog.plugins[0].source = './wrong-source'
      },
    },
    {
      pattern: /Plugin package name mismatch/,
      mutate: ({ packageManifests }) => {
        packageManifests.get(pluginWorkspaces[0].workspace).name = 'wrong-name'
      },
    },
    {
      pattern: /version mismatch/,
      mutate: ({ catalog }) => {
        catalog.plugins[0].version = '9.9.9'
      },
    },
    {
      pattern: /pinned to v1\.0\.0/,
      mutate: ({ catalog }) => {
        catalog.plugins[0].ref = 'v1.0.0'
      },
    },
  ]

  for (const fixtureCase of cases) {
    const inventory = createInventoryFixture()
    fixtureCase.mutate(inventory)
    assert.throws(() => assertPluginWorkspaceInventory(inventory), fixtureCase.pattern)
  }
})

function createInventoryFixture() {
  const versions = pluginWorkspaces.map((_, index) => `1.0.${index}`)
  const rootPackage = {
    workspaces: pluginWorkspaces.map(({ workspace }) => workspace),
  }
  const packageLock = {
    packages: {
      '': { workspaces: [...rootPackage.workspaces] },
      ...Object.fromEntries(pluginWorkspaces.map(({ workspace }, index) => [
        workspace,
        { version: versions[index] },
      ])),
    },
  }
  const catalog = {
    name: 'omp-enhancer',
    metadata: { pluginRoot: 'plugins' },
    plugins: pluginWorkspaces.map(({ name, source }, index) => ({
      name,
      source,
      version: versions[index],
    })),
  }
  const packageManifests = new Map(pluginWorkspaces.map(({ name, workspace }, index) => [
    workspace,
    { name, version: versions[index] },
  ]))

  return { rootPackage, packageLock, catalog, packageManifests }
}
