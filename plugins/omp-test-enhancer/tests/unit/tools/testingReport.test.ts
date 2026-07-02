import { describe, expect, it } from 'vitest'
import { buildTestReport, createTestingEnhancerTools } from '../../../src/tools/testingTools.js'
import type { ExtensionToolContext } from '../../../src/ompApi.js'
import type { GateResult } from '../../../src/types.js'

const baseContext: ExtensionToolContext = {
  cwd: process.cwd(),
  ui: { notify: () => undefined },
  hasUI: false
}

const passed: GateResult = {
  gate: 'indirect-test',
  passed: true,
  severity: 'blocker',
  summary: 'Tests do not rely on blocked implementation details.',
  evidence: {}
}

const warning: GateResult = {
  gate: 'test-command',
  passed: true,
  severity: 'warning',
  summary: 'No test command configured.',
  evidence: {}
}

const failed: GateResult = {
  gate: 'indirect-test',
  passed: false,
  severity: 'blocker',
  summary: 'Test imports private or internal implementation details.',
  evidence: {},
  repairHint: 'Test through public behavior.'
}

const browserGate: GateResult = {
  gate: 'browser-interaction',
  passed: false,
  severity: 'blocker',
  summary: 'Click could not reach the submit button.',
  evidence: {
    framework: 'playwright',
    status: 'failed',
    findings: []
  },
  repairHint: 'Check the overlay that blocks the submit button.'
}

describe('buildTestReport', () => {
  it('renders stable passed, warning, and failed markdown', () => {
    expect(buildTestReport({ gateResults: [passed, warning] }).markdown).toBe([
      '# OMP Testing Enhancer report',
      '',
      'Result: passed',
      '',
      '* indirect-test: passed',
      '* test-command: warning, No test command configured.'
    ].join('\n'))

    expect(buildTestReport({ gateResults: [failed] }).markdown).toBe([
      '# OMP Testing Enhancer report',
      '',
      'Result: failed',
      '',
      '* indirect-test: failed, Test imports private or internal implementation details.',
      '  * Repair: Test through public behavior.'
    ].join('\n'))
  })

  it('renders browser gate names from parsed gate results', () => {
    expect(buildTestReport({ gateResults: [browserGate] }).markdown).toBe([
      '# OMP Testing Enhancer report',
      '',
      'Result: failed',
      '',
      '* browser-interaction: failed, Click could not reach the submit button.',
      '  * Repair: Check the overlay that blocks the submit button.'
    ].join('\n'))
  })

  it('renders browser evidence details and artifact paths', () => {
    expect(buildTestReport({
      gateResults: [{
        gate: 'browser-visual',
        passed: false,
        severity: 'blocker',
        summary: 'Login form visual diff exceeded threshold.',
        evidence: {
          category: 'visual-diff',
          details: { diffRatio: 0.02, threshold: 0.01 },
          artifacts: { diffImagePath: '.omp/testing-enhancer-artifacts/run-1/login.diff.png' }
        },
        repairHint: 'Review the diff image before updating the baseline.'
      }]
    }).markdown).toBe([
      '# OMP Testing Enhancer report',
      '',
      'Result: failed',
      '',
      '* browser-visual: failed, Login form visual diff exceeded threshold.',
      '  * Repair: Review the diff image before updating the baseline.',
      '  * Evidence: visual-diff',
      '  * Diff ratio: 0.02',
      '  * Threshold: 0.01',
      '  * Artifact diffImagePath: .omp/testing-enhancer-artifacts/run-1/login.diff.png'
    ].join('\n'))
  })

  it('reports missing history through the execute layer', async () => {
    const report = createTestingEnhancerTools(fakeZod()).find(tool => tool.name === 'omp_test_report')
    if (!report) throw new Error('Missing report tool')

    const result = await report.execute('call', {}, undefined, undefined, baseContext)

    expect(result.content[0]?.text).toBe('No test gate result found.')
    expect(result.details).toEqual({ found: false })
  })
})

function fakeZod(): ExtensionToolContext extends never ? never : { object(shape: Record<string, unknown>): unknown; string(): unknown; boolean(): unknown; unknown(): unknown; array(schema: unknown): unknown; enum(values: readonly [string, ...string[]]): unknown; optional(schema: unknown): unknown } {
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
