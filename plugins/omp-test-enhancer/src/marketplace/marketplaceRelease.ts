import { access, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

export interface PackageMetadata {
  name: string
  version: string
}

export interface MarketplaceSourceObject {
  source: string
  repo: string
  ref: string
}

export interface MarketplacePlugin {
  name: string
  version: string
  source: string | MarketplaceSourceObject
  ref?: string
  [key: string]: unknown
}

export interface MarketplaceCatalog {
  name: string
  owner: { name: string; [key: string]: unknown }
  plugins: MarketplacePlugin[]
  [key: string]: unknown
}

export function releaseTagForVersion(version: string): string {
  const normalized = String(version ?? '').trim()
  if (!normalized) throw new Error('package version is empty')
  return normalized.startsWith('v') ? normalized : `v${normalized}`
}

async function findMarketplaceCatalogPath(cwd: string): Promise<string> {
  let current = resolve(cwd)
  while (true) {
    const catalogPath = join(current, '.omp-plugin', 'marketplace.json')
    try {
      await access(catalogPath)
      return catalogPath
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    const parent = dirname(current)
    if (parent === current) {
      throw new Error(`marketplace catalog .omp-plugin/marketplace.json was not found from ${cwd}`)
    }
    current = parent
  }
}

export function syncMarketplaceCatalogRelease(
  catalog: MarketplaceCatalog,
  packageJson: PackageMetadata
): MarketplaceCatalog {
  const ref = releaseTagForVersion(packageJson.version)
  let found = false
  const plugins = catalog.plugins.map(plugin => {
    if (plugin.name !== packageJson.name) return plugin
    found = true
    const syncedPlugin = {
      ...plugin,
      version: packageJson.version
    }
    if (plugin.source && typeof plugin.source === 'object' && !Array.isArray(plugin.source)) {
      return {
        ...syncedPlugin,
        source: {
          ...plugin.source,
          ref
        }
      }
    }
    return {
      ...syncedPlugin,
      ref
    }
  })

  if (!found) throw new Error(`marketplace plugin ${packageJson.name} was not found`)
  return { ...catalog, plugins }
}

export async function syncMarketplaceRelease(cwd = process.cwd()): Promise<{ version: string; ref: string; catalogPath: string }> {
  const packagePath = join(cwd, 'package.json')
  const catalogPath = await findMarketplaceCatalogPath(cwd)
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as PackageMetadata
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8')) as MarketplaceCatalog
  const synced = syncMarketplaceCatalogRelease(catalog, packageJson)
  await writeFile(catalogPath, `${JSON.stringify(synced, null, 2)}\n`)
  return { version: packageJson.version, ref: releaseTagForVersion(packageJson.version), catalogPath }
}
