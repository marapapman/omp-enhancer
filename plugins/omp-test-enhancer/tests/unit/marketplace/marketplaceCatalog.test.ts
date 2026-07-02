import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { releaseTagForVersion, syncMarketplaceCatalogRelease } from '../../../src/marketplace/marketplaceRelease.js'
import type { ExtensionToolContext } from '../../../src/ompApi.js'
import createMarketplaceTools from '../../../tools/testing-tools.js'

interface PackageJson {
  name: string
  version: string
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

const baseContext: ExtensionToolContext = {
  cwd: process.cwd(),
  ui: { notify: () => undefined },
  hasUI: false
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

function fakeZod(): {
  object(shape: Record<string, unknown>): unknown
  string(): unknown
  boolean(): unknown
  unknown(): unknown
  array(schema: unknown): unknown
  enum(values: readonly [string, ...string[]]): unknown
  optional(schema: unknown): unknown
} {
  return {
    object: shape => ({ type: 'object', shape }),
    string: () => ({ type: 'string' }),
    boolean: () => ({ type: 'boolean' }),
    unknown: () => ({ type: 'unknown' }),
    array: schema => ({ type: 'array', schema }),
    enum: values => ({ type: 'enum', values }),
    optional: schema => ({ type: 'optional', schema })
  }
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

  it('ships marketplace conventional directories alongside the source extension entry', async () => {
    const packageJson = await readJson<PackageJson>(join(process.cwd(), 'package.json'))

    expect(packageJson.omp.extensions).toEqual(['./src/extension.ts'])
    expect(packageJson.files).toEqual(expect.arrayContaining(['src', '.omp-plugin', 'package.json', 'README.md', 'tools', 'commands']))
  })

  it('exposes marketplace tools through the custom tool wrapper', async () => {
    const tools = createMarketplaceTools({ zod: fakeZod() })

    expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining([
      'omp_test_analyze',
      'omp_test_context',
      'omp_test_browser_check',
      'omp_test_coverage_analyze',
      'omp_test_mutation_context',
      'omp_test_gate',
      'omp_test_report'
    ]))

    const gate = tools.find(tool => tool.name === 'omp_test_gate')
    const report = tools.find(tool => tool.name === 'omp_test_report')
    if (!gate) throw new Error('Missing marketplace gate tool')
    if (!report) throw new Error('Missing marketplace report tool')

    await gate.execute('call', {
      targets: [{ id: 'src/user/UserService.ts#UserService', sourceFile: 'src/user/UserService.ts', symbolName: 'UserService', kind: 'service', risk: 'high' }],
      candidate: {
        id: 'candidate',
        targetId: 'src/user/UserService.ts#UserService',
        files: [{ path: 'src/user/UserService.test.ts', action: 'create', content: 'expect(result).toBe(true)' }]
      }
    }, undefined, baseContext, undefined)

    const result = await report.execute('call', {}, undefined, baseContext, undefined)

    expect(result.content[0]?.text).not.toBe('No test gate result found.')
    expect(result.content[0]?.text).toContain('# OMP Testing Enhancer report')
    expect(result.details).toMatchObject({
      markdown: expect.stringContaining('# OMP Testing Enhancer report')
    })
  })

  it('derives release tags from package versions', () => {
    expect(releaseTagForVersion('0.2.0')).toBe('v0.2.0')
  })

  it('syncs catalog plugin version and source ref without mutating the input', () => {
    const catalog: MarketplaceCatalog = {
      name: 'omp-test-enhancer',
      owner: { name: 'marapapman' },
      plugins: [
        {
          name: 'omp-testing-enhancer',
          version: '0.1.1',
          source: {
            source: 'github',
            repo: 'marapapman/omp-test-enhancer',
            ref: 'v0.1.1'
          }
        }
      ]
    }

    const synced = syncMarketplaceCatalogRelease(catalog, {
      name: 'omp-testing-enhancer',
      version: '0.2.0'
    })

    expect(synced.plugins[0]).toEqual({
      name: 'omp-testing-enhancer',
      version: '0.2.0',
      source: {
        source: 'github',
        repo: 'marapapman/omp-test-enhancer',
        ref: 'v0.2.0'
      }
    })
    expect(catalog.plugins[0]?.version).toBe('0.1.1')
    expect(catalog.plugins[0]?.source.ref).toBe('v0.1.1')
  })

  it('documents marketplace install flow, marketplace tools, and local-only /test commands', async () => {
    const root = process.cwd()
    const readme = await readFile(join(root, 'README.md'), 'utf8')
    const command = await readFile(join(root, 'commands', 'test.md'), 'utf8')
    const packageJson = await readJson<PackageJson>(join(root, 'package.json'))
    const installSection = readme.slice(readme.indexOf('## 安装'), readme.indexOf('## 升级'))
    const marketplaceWorkflowSection = readme.slice(readme.indexOf('## Marketplace 常用流程'), readme.indexOf('## 本地开发安装'))
    const localWorkflowSection = readme.slice(readme.indexOf('## 本地开发安装'), readme.indexOf('## 门禁规则'))

    expect(readme).toContain('omp plugin marketplace add marapapman/omp-test-enhancer')
    expect(readme).toContain('omp plugin install omp-testing-enhancer@omp-test-enhancer')
    expect(installSection).toContain(`github:marapapman/omp-test-enhancer#v${packageJson.version}`)
    expect(readme).toContain('omp plugin marketplace update omp-test-enhancer')
    expect(readme).toContain('omp plugin upgrade omp-testing-enhancer@omp-test-enhancer')
    expect(readme).toContain('/omp-testing-enhancer:test')
    expect(readme).toContain('browserPlan')
    expect(readme).toContain('浏览器证据')
    expect(readme).toContain('omp_test_browser_check')
    expect(readme).toContain('propertyPlan')
    expect(readme).toContain('apiPlan')
    expect(readme).toContain('omp_test_coverage_analyze')
    expect(readme).toContain('omp_test_mutation_context')
    expect(readme).toContain('## Marketplace 常用流程')
    expect(installSection).not.toContain('/test init')
    expect(installSection).not.toContain('/test check')
    expect(installSection).not.toContain('/test report')

    expect(marketplaceWorkflowSection).toContain('omp_test_analyze')
    expect(marketplaceWorkflowSection).toContain('omp_test_context')
    expect(marketplaceWorkflowSection).toContain('omp_test_gate')
    expect(marketplaceWorkflowSection).toContain('omp_test_report')
    expect(marketplaceWorkflowSection).toContain('浏览器证据')
    expect(marketplaceWorkflowSection).toContain('omp_test_browser_check')
    expect(marketplaceWorkflowSection).toContain('omp_test_coverage_analyze')
    expect(marketplaceWorkflowSection).toContain('omp_test_mutation_context')
    expect(marketplaceWorkflowSection).not.toContain('/test init')
    expect(marketplaceWorkflowSection).not.toContain('/test check')
    expect(marketplaceWorkflowSection).not.toContain('/test report')

    expect(localWorkflowSection).toContain('omp plugin link .')
    expect(localWorkflowSection).toContain('/test init')
    expect(localWorkflowSection).toContain('/test check')
    expect(localWorkflowSection).toContain('/test report')

    expect(command).toContain('omp_test_analyze')
    expect(command).toContain('omp_test_context')
    expect(command).toContain('browserPlan')
    expect(command).toContain('browser-observable behavior')
    expect(command).toContain('omp_test_browser_check')
    expect(command).toContain('propertyPlan')
    expect(command).toContain('apiPlan')
    expect(command).toContain('omp_test_coverage_analyze')
    expect(command).toContain('omp_test_mutation_context')
    expect(command).toContain('omp_test_gate')
    expect(command).toContain('omp_test_report')
  })
})
