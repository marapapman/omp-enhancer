const definitions = [
  { name: 'omp-config', directory: 'omp-config' },
  { name: 'writing-helper', directory: 'writing-helper' },
  { name: 'omp-testing-enhancer', directory: 'omp-test-enhancer' },
  { name: 'omp-fact-checker', directory: 'omp-fact-checker' },
  { name: 'omp-enhancer-core', directory: 'omp-enhancer-core' },
]

export const pluginWorkspaces = Object.freeze(definitions.map(({ name, directory }) => Object.freeze({
  name,
  directory,
  source: `./${directory}`,
  workspace: `plugins/${directory}`,
})))

export const pluginWorkspacePaths = Object.freeze(pluginWorkspaces.map(({ workspace }) => workspace))

export function assertExactPluginInventory(plugins) {
  if (!Array.isArray(plugins)) throw new Error('Marketplace plugins must be an array')

  const actualNames = plugins.map((plugin) => plugin?.name)
  const duplicateNames = actualNames.filter((name, index) => actualNames.indexOf(name) !== index)
  if (duplicateNames.length > 0) {
    throw new Error(`Duplicate marketplace plugins: ${[...new Set(duplicateNames)].join(', ')}`)
  }

  const expectedNames = pluginWorkspaces.map(({ name }) => name)
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`Marketplace plugin inventory mismatch: expected ${expectedNames.join(', ')}, got ${actualNames.join(', ')}`)
  }
}

export function assertPluginWorkspaceInventory({
  rootPackage,
  packageLock,
  catalog,
  packageManifests,
  checkVersions = true,
  requireTrackMain = true,
} = {}) {
  if (!rootPackage || typeof rootPackage !== 'object') throw new Error('Root package metadata is missing')
  if (!packageLock || typeof packageLock !== 'object') throw new Error('Package lock metadata is missing')
  if (!catalog || typeof catalog !== 'object') throw new Error('Marketplace catalog metadata is missing')
  if (!(packageManifests instanceof Map)) throw new Error('Plugin package manifests must be provided as a Map')

  if (catalog.name !== 'omp-enhancer') {
    throw new Error(`Expected marketplace name omp-enhancer, got ${catalog.name}`)
  }
  if (catalog.metadata?.pluginRoot !== 'plugins') {
    throw new Error('Expected metadata.pluginRoot to equal plugins')
  }
  assertExactPluginInventory(catalog.plugins)

  assertOrderedPaths('Root workspaces', rootPackage.workspaces, pluginWorkspacePaths)
  assertOrderedPaths('Package-lock root workspaces', packageLock.packages?.['']?.workspaces, pluginWorkspacePaths)

  const lockWorkspacePaths = Object.keys(packageLock.packages ?? {})
    .filter((entry) => /^plugins\/[^/]+$/u.test(entry))
    .sort()
  const expectedLockWorkspacePaths = [...pluginWorkspacePaths].sort()
  if (JSON.stringify(lockWorkspacePaths) !== JSON.stringify(expectedLockWorkspacePaths)) {
    throw new Error(`Package-lock plugin inventory mismatch: expected ${expectedLockWorkspacePaths.join(', ')}, got ${lockWorkspacePaths.join(', ')}`)
  }

  const manifestPaths = [...packageManifests.keys()].sort()
  if (JSON.stringify(manifestPaths) !== JSON.stringify(expectedLockWorkspacePaths)) {
    throw new Error(`Plugin package manifest inventory mismatch: expected ${expectedLockWorkspacePaths.join(', ')}, got ${manifestPaths.join(', ')}`)
  }

  for (let index = 0; index < pluginWorkspaces.length; index += 1) {
    const definition = pluginWorkspaces[index]
    const plugin = catalog.plugins[index]
    const packageJson = packageManifests.get(definition.workspace)
    const lockWorkspace = packageLock.packages?.[definition.workspace]

    if (!packageJson || typeof packageJson !== 'object') {
      throw new Error(`Plugin package manifest ${definition.workspace}/package.json is missing`)
    }
    if (packageJson.name !== definition.name) {
      throw new Error(`Plugin package name mismatch for ${definition.workspace}: expected ${definition.name}, got ${packageJson.name}`)
    }
    if (!lockWorkspace || typeof lockWorkspace !== 'object' || Array.isArray(lockWorkspace)) {
      throw new Error(`Package-lock workspace entry ${definition.workspace} was not found`)
    }
    if (plugin.source !== definition.source) {
      throw new Error(`Plugin ${definition.name} source mismatch: expected ${definition.source}, got ${plugin.source}`)
    }
    if (requireTrackMain && Object.hasOwn(plugin, 'ref')) {
      throw new Error(`Plugin ${definition.name} is pinned to ${plugin.ref}; remove ref so marketplace upgrade tracks main`)
    }
    if (checkVersions && plugin.version !== packageJson.version) {
      throw new Error(`Plugin ${definition.name} version mismatch: package ${packageJson.version}, catalog ${plugin.version}`)
    }
    if (checkVersions && lockWorkspace.version !== packageJson.version) {
      throw new Error(`Plugin ${definition.name} lock version mismatch: package ${packageJson.version}, lock ${lockWorkspace.version}`)
    }
  }
}

function assertOrderedPaths(label, actual, expected) {
  if (!Array.isArray(actual) || JSON.stringify(actual) !== JSON.stringify(expected)) {
    const actualPaths = Array.isArray(actual) ? actual.join(', ') : 'none'
    throw new Error(`${label} mismatch: expected ${expected.join(', ')}, got ${actualPaths}`)
  }
}
