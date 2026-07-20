import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface PackageJson {
  name: string
  version: string
  main: string
  exports: Record<string, string>
  files: string[]
  omp: { extensions: string[] }
}

interface MarketplaceCatalog {
  name: string
  owner: { name: string }
  metadata?: { pluginRoot: string }
  plugins: Array<{
    name: string
    version: string
    source: string | { source: string; repo: string; ref: string }
  }>
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

describe('marketplace catalog', () => {
  it('publishes the plugin through the root omp-enhancer marketplace', async () => {
    const root = process.cwd()
    const packageJson = await readJson<PackageJson>(join(root, 'package.json'))
    const catalog = await readJson<MarketplaceCatalog>(join(root, '..', '..', '.omp-plugin', 'marketplace.json'))
    const plugin = catalog.plugins.find(entry => entry.name === packageJson.name)

    expect(catalog.name).toBe('omp-enhancer')
    expect(catalog.owner.name).toBe('marapapman')
    expect(catalog.metadata?.pluginRoot).toBe('plugins')
    expect(plugin?.name).toBe(packageJson.name)
    expect(plugin?.version).toBe(packageJson.version)
    expect(plugin?.source).toBe('./omp-test-enhancer')
  })

  it('publishes one canonical built extension entry', async () => {
    const packageJson = await readJson<PackageJson>(join(process.cwd(), 'package.json'))
    const extensionEntries = [packageJson.main, packageJson.exports['.'], ...packageJson.omp.extensions]

    expect(new Set(extensionEntries)).toEqual(new Set(['./dist/extension.js']))
    expect(packageJson.omp.extensions).toEqual(['./dist/extension.js'])
    expect(packageJson.files).toEqual(expect.arrayContaining(['dist', 'src', 'package.json', 'README.md']))
    expect(packageJson.files).not.toContain('tools')
    expect(packageJson.files).not.toContain('agents')
    expect(packageJson.files).not.toContain('commands')
  })

  it('keeps phase-specific testing Agents out of the package surface', async () => {
    const packageJson = await readJson<PackageJson>(join(process.cwd(), 'package.json'))
    expect(packageJson.files).not.toContain('agents')
  })

  it('documents installation, optional tools, and the command-free workflow', async () => {
    const root = process.cwd()
    const readme = await readFile(join(root, 'README.md'), 'utf8')
    const extensionSource = await readFile(join(root, 'src', 'extension.ts'), 'utf8')

    expect(readme).toContain('omp plugin marketplace add marapapman/omp-enhancer')
    expect(readme).toContain('omp plugin install omp-testing-enhancer@omp-enhancer')
    expect(readme).toContain('omp plugin marketplace update omp-enhancer')
    expect(readme).toContain('omp plugin upgrade omp-testing-enhancer@omp-enhancer')
    expect(readme).toContain('browserPlan')
    expect(readme).toContain('浏览器证据')
    expect(readme).toContain('omp_test_browser_check')
    expect(readme).toContain('propertyPlan')
    expect(readme).toContain('apiPlan')
    expect(readme).toContain('omp_test_coverage_analyze')
    expect(readme).toContain('omp_test_mutation_context')
    expect(readme).toContain('omp_test_review')
    expect(readme).toContain('omp_test_report')
    expect(readme).toContain('defaultInactive')
    expect(readme).toContain('插件不注册命令')
    expect(extensionSource).not.toContain('registerCommand')
  })
})
