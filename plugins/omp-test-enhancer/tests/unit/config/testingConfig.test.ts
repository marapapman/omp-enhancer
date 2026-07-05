import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  defaultTestingEnhancerConfig,
  parseTestingEnhancerConfig,
  readTestingEnhancerConfig,
  renderTestingEnhancerConfig,
  writeTestingEnhancerConfig
} from '../../../src/config/testingConfig.js'

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'omp-testing-enhancer-config-'))
}

describe('testingConfig', () => {
  it('renders and parses the default bun config', () => {
    const config = defaultTestingEnhancerConfig('bun')
    const rendered = renderTestingEnhancerConfig(config)

    expect(rendered).toContain('version: 1')
    expect(rendered).toContain('command: bunx vitest run')
    expect(rendered).toContain('browser:')
    expect(rendered).toContain('  headless: true')
    expect(rendered).toContain('  trace: retain-on-failure')
    expect(rendered).toContain('  screenshot: only-on-failure')
    expect(rendered).toContain('  serviceWorkers: block')
    expect(rendered).toContain('  browserEvidence: block')
    expect(parseTestingEnhancerConfig(rendered)).toEqual({
      ...config,
      browser: {
        headless: true,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        serviceWorkers: 'block'
      }
    })
  })

  it('round-trips browser config values', () => {
    const rendered = [
      'version: 1',
      'test:',
      '  command: bunx vitest run',
      'coverage:',
      '  command:',
      'browser:',
      '  baseUrl: http://localhost:5173',
      '  timeoutMs: 15000',
      '  headless: false',
      '  trace: off',
      '  screenshot: off',
      '  serviceWorkers: allow',
      'gates:',
      '  indirectTest: block',
      '  productionEdits: block',
      '  testCommand: block',
      '  browserEvidence: warn',
      ''
    ].join('\n')

    expect(parseTestingEnhancerConfig(rendered)).toMatchObject({
      test: { command: 'bunx vitest run' },
      browser: {
        baseUrl: 'http://localhost:5173',
        timeoutMs: 15000,
        headless: false,
        trace: 'off',
        screenshot: 'off',
        serviceWorkers: 'allow'
      },
      gates: expect.objectContaining({ browserEvidence: 'warn' })
    })
  })

  it('ignores malformed values and keeps safe defaults', () => {
    const parsed = parseTestingEnhancerConfig([
      'version: 999',
      'test:',
      '  command:',
      'coverage:',
      '  command:',
      'browser:',
      '  baseUrl:',
      '  timeoutMs: -5',
      '  headless: maybe',
      '  trace: always',
      '  screenshot: yes',
      '  serviceWorkers: proxy',
      'gates:',
      '  indirectTest: ignore',
      '  productionEdits: warn',
      '  testCommand: ignore',
      '  browserEvidence: warn',
      'unknown:',
      '  key: value',
      ''
    ].join('\n'))

    expect(parsed).toEqual({
      version: 1,
      test: {},
      coverage: {},
      browser: {
        headless: true,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        serviceWorkers: 'block'
      },
      gates: {
        indirectTest: 'block',
        productionEdits: 'warn',
        testCommand: 'block',
        browserEvidence: 'warn'
      }
    })
  })

  it('writes config once and never overwrites existing content', async () => {
    const cwd = await tempDir()
    const path = await writeTestingEnhancerConfig(cwd, defaultTestingEnhancerConfig('unknown'))
    await writeFile(join(cwd, '.omp', 'testing-enhancer.yml'), 'version: 1\ntest:\n  command: custom\ncoverage:\n  command: \ngates:\n  indirectTest: warn\n  productionEdits: warn\n  testCommand: warn\n')

    const secondPath = await writeTestingEnhancerConfig(cwd, defaultTestingEnhancerConfig('bun'))

    expect(path).toBe('.omp/testing-enhancer.yml')
    expect(secondPath).toBe('.omp/testing-enhancer.yml')
    expect(await readFile(join(cwd, '.omp', 'testing-enhancer.yml'), 'utf8')).toContain('command: custom')
    expect(await readTestingEnhancerConfig(cwd)).toMatchObject({ test: { command: 'custom' } })
  })
})
