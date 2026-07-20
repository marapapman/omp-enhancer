import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import {
  defaultTestingEnhancerConfig,
  parseTestingEnhancerConfig,
  readTestingEnhancerConfig
} from '../../../src/config/testingConfig.js'

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'omp-testing-enhancer-config-'))
}

describe('testingConfig', () => {
  it('defaults only runtime-consumed project settings', () => {
    expect(defaultTestingEnhancerConfig()).toEqual({
      version: 2,
      test: {},
      review: {
        indirectTest: 'critical',
        productionEdits: 'critical',
        testCommand: 'critical',
        browserEvidence: 'critical'
      }
    })
  })

  it('parses test and review settings while ignoring legacy and unknown sections', () => {
    const text = [
      'version: 2',
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
      'review:',
      '  indirectTest: critical',
      '  productionEdits: critical',
      '  testCommand: critical',
      '  browserEvidence: warning',
      'unknown:',
      '  key: value',
      ''
    ].join('\n')

    expect(parseTestingEnhancerConfig(text)).toEqual({
      version: 2,
      test: { command: 'bunx vitest run' },
      review: {
        indirectTest: 'critical',
        productionEdits: 'critical',
        testCommand: 'critical',
        browserEvidence: 'warning'
      }
    })
  })

  it('ignores malformed values and keeps advisory defaults', () => {
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
      'review:',
      '  indirectTest: ignore',
      '  productionEdits: warning',
      '  testCommand: ignore',
      '  browserEvidence: warning',
      'unknown:',
      '  key: value',
      ''
    ].join('\n'))

    expect(parsed).toEqual({
      version: 2,
      test: {},
      review: {
        indirectTest: 'critical',
        productionEdits: 'warning',
        testCommand: 'critical',
        browserEvidence: 'warning'
      }
    })
  })

  it('reads a manually created config and leaves missing config optional', async () => {
    const cwd = await tempDir()
    await mkdir(join(cwd, '.omp'), { recursive: true })
    await writeFile(join(cwd, '.omp', 'testing-enhancer.yml'), 'version: 2\ntest:\n  command: custom\ncoverage:\n  command: ignored\nbrowser:\n  baseUrl: http://localhost:5173\nreview:\n  indirectTest: warning\n  productionEdits: warning\n  testCommand: warning\n')

    expect(await readTestingEnhancerConfig(cwd)).toEqual({
      version: 2,
      test: { command: 'custom' },
      review: {
        indirectTest: 'warning',
        productionEdits: 'warning',
        testCommand: 'warning',
        browserEvidence: 'critical'
      }
    })
    expect(await readTestingEnhancerConfig(await tempDir())).toBeUndefined()
  })
})
