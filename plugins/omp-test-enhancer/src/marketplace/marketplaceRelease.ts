import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface PackageMetadata {
  name: string
  version: string
}

export interface MarketplaceSource {
  source: string
  repo: string
  ref: string
}

export interface MarketplacePlugin {
  name: string
  version: string
  source: MarketplaceSource
  [key: string]: unknown
}

export interface MarketplaceCatalog {
  name: string
  owner: { name: string; [key: string]: unknown }
  plugins: MarketplacePlugin[]
  [key: string]: unknown
}

export function releaseTagForVersion(version: string): string {
  const normalized = version.trim()
  if (!normalized) throw new Error('package version is empty')
  return normalized.startsWith('v') ? normalized : `v${normalized}`
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
    return {
      ...plugin,
      version: packageJson.version,
      source: {
        ...plugin.source,
        ref
      }
    }
  })

  if (!found) throw new Error(`marketplace plugin ${packageJson.name} was not found`)
  return { ...catalog, plugins }
}

export async function syncMarketplaceRelease(cwd = process.cwd()): Promise<{ version: string; ref: string }> {
  const packagePath = join(cwd, 'package.json')
  const catalogPath = join(cwd, '.omp-plugin', 'marketplace.json')
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as PackageMetadata
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8')) as MarketplaceCatalog
  const synced = syncMarketplaceCatalogRelease(catalog, packageJson)
  await writeFile(catalogPath, `${JSON.stringify(synced, null, 2)}\n`)
  return { version: packageJson.version, ref: releaseTagForVersion(packageJson.version) }
}
