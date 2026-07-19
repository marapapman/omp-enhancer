import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
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
    expect(packageJson.files).toEqual(expect.arrayContaining(['src', 'package.json', 'README.md', 'tools']))
    expect(packageJson.files).not.toContain('agents')
    expect(packageJson.files).not.toContain('commands')
  })

  it('keeps phase-specific testing Agents out of the package surface', async () => {
    const packageJson = await readJson<PackageJson>(join(process.cwd(), 'package.json'))
    expect(packageJson.files).not.toContain('agents')
  })

  it('exposes marketplace tools through the custom tool wrapper', async () => {
    const tools = createMarketplaceTools({ zod: fakeZod() })

    expect(tools.map(tool => tool.name)).toEqual(expect.arrayContaining([
      'omp_test_analyze',
      'omp_test_context',
      'omp_test_browser_check',
      'omp_test_coverage_analyze',
      'omp_test_mutation_context',
      'omp_test_review',
      'omp_test_report'
    ]))

    const review = tools.find(tool => tool.name === 'omp_test_review')
    const report = tools.find(tool => tool.name === 'omp_test_report')
    if (!review) throw new Error('Missing marketplace review tool')
    if (!report) throw new Error('Missing marketplace report tool')

    await review.execute('call', {
      targets: [{ id: 'src/user/UserService.ts#UserService', sourceFile: 'src/user/UserService.ts', symbolName: 'UserService', kind: 'service', risk: 'high' }],
      candidate: {
        id: 'candidate',
        targetId: 'src/user/UserService.ts#UserService',
        files: [{ path: 'src/user/UserService.test.ts', action: 'create', content: 'expect(result).toBe(true)' }]
      }
    }, undefined, baseContext, undefined)

    const result = await report.execute('call', {}, undefined, baseContext, undefined)

    expect(result.content[0]?.text).not.toBe('No test review result found.')
    expect(result.content[0]?.text).toContain('# OMP Testing Enhancer report')
    expect(result.details).toMatchObject({
      markdown: expect.stringContaining('# OMP Testing Enhancer report')
    })
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
