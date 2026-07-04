import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { analyzeCoverageReport, analyzeMutationReport, analyzeTestTargets, buildTestContext, createTestingEnhancerTools, runTestGate } from '../../../src/tools/testingTools.js'
import type { ExtensionToolContext, ToolDefinition } from '../../../src/ompApi.js'
import type { ChangedTarget } from '../../../src/types.js'

async function tempRepo(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-tools-'))
  await mkdir(join(cwd, 'src', 'user'), { recursive: true })
  await writeFile(join(cwd, 'src', 'user', 'UserService.ts'), 'export class UserService {}')
  await writeFile(join(cwd, 'src', 'user', 'UserService.test.ts'), 'import { UserService } from ./UserService')
  await writeFile(join(cwd, 'src', 'user', 'index.ts'), 'export { UserService } from ./UserService')
  await writeFile(join(cwd, 'package.json'), JSON.stringify({ exports: { '.': './src/index.ts' } }))
  return cwd
}

function tool(tools: ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find(item => item.name === name)
  if (!found) throw new Error(`Missing tool ${name}`)
  return found
}

function context(cwd: string): ExtensionToolContext {
  return { cwd, ui: { notify: () => undefined }, hasUI: false }
}

describe('pure testing tools', () => {
  it('analyzes TS and TSX changes into test targets and next tool steps', () => {
    expect(analyzeTestTargets({
      changedFiles: [
        { path: 'src/auth/parseToken.ts', content: 'export function parseToken() { return true }' },
        { path: 'src/user/UserService.ts', content: 'export class UserService {}' },
        { path: 'src/user/UserService.test.ts', content: 'test()' }
      ]
    })).toMatchObject({
      runId: 'local-analysis',
      targets: [
        { sourceFile: 'src/auth/parseToken.ts', symbolName: 'parseToken', kind: 'parser', risk: 'low' },
        { sourceFile: 'src/user/UserService.ts', symbolName: 'UserService', kind: 'service', risk: 'high' }
      ],
      warnings: [],
      nextTools: ['omp_test_context', 'omp_test_browser_check', 'omp_test_coverage_analyze', 'omp_test_mutation_context', 'omp_test_gate', 'omp_test_report']
    })
  })

  it('returns focused context for a chosen target', () => {
    const output = buildTestContext({
      target: {
        id: 'src/user/UserService.ts#UserService',
        sourceFile: 'src/user/UserService.ts',
        symbolName: 'UserService',
        kind: 'service',
        risk: 'high',
        relatedTests: ['src/user/UserService.test.ts'],
        publicEntryHints: ['src/user/index.ts#UserService']
      }
    })

    expect(output).toMatchObject({
      targetId: 'src/user/UserService.ts#UserService',
      testingStyle: 'indirect',
      existingTests: ['src/user/UserService.test.ts'],
      publicEntryHints: ['src/user/index.ts#UserService']
    })
    expect(output.browserPlan).toBeUndefined()
  })

  it('classifies a TSX source as react-component while keeping the required next tools unchanged', () => {
    const output = analyzeTestTargets({
      changedFiles: [{ path: 'src/ui/LoginForm.tsx', content: 'export function LoginForm() { return null }' }]
    })

    expect(output).toMatchObject({
      runId: 'local-analysis',
      targets: [{ sourceFile: 'src/ui/LoginForm.tsx', symbolName: 'LoginForm', kind: 'react-component', risk: 'medium' }],
      nextTools: ['omp_test_context', 'omp_test_browser_check', 'omp_test_coverage_analyze', 'omp_test_mutation_context', 'omp_test_gate', 'omp_test_report']
    })
  })

  it('returns browser planning guidance for react-component targets', () => {
    const output = buildTestContext({
      target: {
        id: 'src/ui/LoginForm.tsx#LoginForm',
        sourceFile: 'src/ui/LoginForm.tsx',
        symbolName: 'LoginForm',
        kind: 'react-component',
        risk: 'medium',
        relatedTests: ['tests/e2e/LoginForm.spec.ts']
      }
    })

    expect(output.testingStyle).toBe('indirect')
    expect(output.preferredAssertions).toEqual(expect.arrayContaining(['visible UI output', 'role/name', 'user event result', 'browser error absence']))
    expect(output.browserPlan).toMatchObject({
      framework: 'playwright',
      setup: { viewport: { width: 1280, height: 720 }, trace: 'retain-on-failure', screenshot: 'only-on-failure', serviceWorkers: 'block' },
      locatorPriority: ['role', 'label', 'text', 'placeholder', 'testId', 'css']
    })
    expect(output.browserPlan?.scenarios[0]?.name).toBe('LoginForm user-visible behavior')
  })

  it('returns property testing guidance for pure functions', () => {
    const output = buildTestContext({
      target: {
        id: 'src/math/clamp.ts#clamp',
        sourceFile: 'src/math/clamp.ts',
        symbolName: 'clamp',
        kind: 'pure-function',
        risk: 'low'
      }
    })

    expect(output.propertyPlan).toMatchObject({
      frameworkSuggestion: 'fast-check',
      properties: expect.arrayContaining([
        expect.objectContaining({
          name: 'range bound',
          repairHint: 'Generate values around min, max, and outside the range; assert the result never leaves the allowed range.'
        })
      ])
    })
    expect(output.preferredAssertions).toEqual(expect.arrayContaining(['property invariant']))
  })

  it('returns api testing guidance for provider targets', () => {
    const output = buildTestContext({
      target: {
        id: 'src/routes/orders.ts#createOrder',
        sourceFile: 'src/routes/orders.ts',
        symbolName: 'createOrder',
        kind: 'api-provider',
        risk: 'high',
        publicEntryHints: ['openapi.yaml#paths', 'tests/contracts/orders.pact.ts']
      }
    })

    expect(output.apiPlan).toMatchObject({
      contractSources: ['openapi.yaml#paths', 'tests/contracts/orders.pact.ts'],
      cases: expect.arrayContaining([
        expect.objectContaining({ status: '2xx', assertion: 'successful response shape matches the public contract' }),
        expect.objectContaining({ status: '401/403', assertion: 'unauthorized or forbidden requests are rejected through the public endpoint' })
      ])
    })
    expect(output.preferredAssertions).toEqual(expect.arrayContaining(['HTTP status', 'response body', 'contract fields']))
  })

  it('extracts coverage gaps from Istanbul coverage JSON', () => {
    const output = analyzeCoverageReport({
      coverageReport: {
        'src/cart/discount.ts': {
          statementMap: { '0': { start: { line: 10 } } },
          s: { '0': 0 },
          fnMap: { '0': { name: 'calculateDiscount', decl: { start: { line: 12 } } } },
          f: { '0': 0 },
          branchMap: { '0': { type: 'if', locations: [{ start: { line: 14 } }, { start: { line: 15 } }] } },
          b: { '0': [1, 0] }
        }
      }
    })

    expect(output).toMatchObject({
      status: 'available',
      gaps: expect.arrayContaining([
        expect.objectContaining({ file: 'src/cart/discount.ts', line: 10, kind: 'statement' }),
        expect.objectContaining({ file: 'src/cart/discount.ts', line: 12, kind: 'function', symbolName: 'calculateDiscount' }),
        expect.objectContaining({ file: 'src/cart/discount.ts', line: 15, kind: 'branch' })
      ])
    })
  })

  it('extracts survived mutants from Stryker mutation JSON', () => {
    const output = analyzeMutationReport({
      mutationReport: {
        files: {
          'src/cart/discount.ts': {
            mutants: [{
              id: '1',
              mutatorName: 'ConditionalExpression',
              replacement: '>',
              status: 'Survived',
              location: { start: { line: 42 } }
            }]
          }
        }
      }
    })

    expect(output).toMatchObject({
      status: 'available',
      survivedMutants: [expect.objectContaining({
        file: 'src/cart/discount.ts',
        line: 42,
        mutatorName: 'ConditionalExpression',
        replacement: '>',
        repairHint: 'Add a test that fails when this mutant is applied, preferably through the public API.'
      })]
    })
  })

  it('runs coverage and mutation analyzers through registered tools', async () => {
    const cwd = await tempRepo()
    await writeFile(join(cwd, 'coverage-final.json'), JSON.stringify({
      'src/user/UserService.ts': {
        statementMap: { '0': { start: { line: 8 } } },
        s: { '0': 0 }
      }
    }))
    await writeFile(join(cwd, 'mutation.json'), JSON.stringify({
      files: {
        'src/user/UserService.ts': {
          mutants: [{
            id: '1',
            mutatorName: 'StringLiteral',
            replacement: '"admin"',
            status: 'Survived',
            location: { start: { line: 9 } }
          }]
        }
      }
    }))

    const tools = createTestingEnhancerTools(fakeZod())
    const coverage = await tool(tools, 'omp_test_coverage_analyze').execute('coverage', {
      reportPath: 'coverage-final.json'
    }, undefined, undefined, context(cwd))
    const mutation = await tool(tools, 'omp_test_mutation_context').execute('mutation', {
      reportPath: 'mutation.json'
    }, undefined, undefined, context(cwd))

    expect(coverage.content[0]?.text).toBe('Found 1 coverage gaps.')
    expect(coverage.details).toMatchObject({ status: 'available', gaps: [expect.objectContaining({ line: 8 })] })
    expect(mutation.content[0]?.text).toBe('Found 1 mutation survivors.')
    expect(mutation.details).toMatchObject({ status: 'available', survivedMutants: [expect.objectContaining({ line: 9 })] })
  })

  it('runs all gates against candidate test files', () => {
    const target: ChangedTarget = {
      id: 'src/user/UserService.ts#UserService',
      sourceFile: 'src/user/UserService.ts',
      symbolName: 'UserService',
      kind: 'service',
      risk: 'high'
    }

    expect(runTestGate({
      targets: [target],
      candidate: {
        id: 'candidate',
        targetId: target.id,
        files: [{ path: 'src/user/UserService.test.ts', action: 'create', content: "import { helper } from '../internal/helper'" }]
      }
    })).toMatchObject({
      passed: false,
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'test-file-scope', passed: true }),
        expect.objectContaining({ gate: 'indirect-test', passed: false }),
        expect.objectContaining({ gate: 'test-command', severity: 'warning' })
      ])
    })
  })

  it('blocks gate execution when candidate files are empty', () => {
    const target: ChangedTarget = {
      id: 'src/user/UserService.ts#UserService',
      sourceFile: 'src/user/UserService.ts',
      symbolName: 'UserService',
      kind: 'service',
      risk: 'high'
    }

    expect(runTestGate({
      targets: [target],
      candidate: {
        id: 'candidate',
        targetId: target.id,
        files: []
      }
    })).toMatchObject({
      passed: false,
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'test-file-scope', passed: false, summary: 'Candidate includes no test files.' })
      ])
    })
  })

  it('blocks gate execution when changed targets are missing', () => {
    expect(runTestGate({
      targets: [],
      candidate: {
        id: 'candidate',
        targetId: 'missing',
        files: [{ path: 'src/user/UserService.test.ts', action: 'create', content: 'expect(result).toBe(true)' }]
      }
    })).toMatchObject({
      passed: false,
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'indirect-test', passed: false, summary: 'No changed targets supplied for indirect-test gate.' })
      ])
    })
  })

  it('adds browser gate results from structured browser evidence', () => {
    const target: ChangedTarget = {
      id: 'src/ui/LoginForm.tsx#LoginForm',
      sourceFile: 'src/ui/LoginForm.tsx',
      symbolName: 'LoginForm',
      kind: 'react-component',
      risk: 'medium'
    }
    const candidate = {
      id: 'candidate',
      targetId: target.id,
      files: [{ path: 'src/ui/LoginForm.test.tsx', action: 'create', content: 'test()' }]
    }
    const browserEvidence = {
      framework: 'playwright',
      status: 'failed',
      baseUrl: 'http://localhost:5173',
      findings: [{
        gate: 'browser-visual',
        passed: false,
        severity: 'blocker',
        category: 'visual-diff',
        summary: 'Login form visual diff exceeded threshold.',
        evidence: { diffRatio: 0.02, threshold: 0.01 },
        repairHint: 'Review the diff image before updating the baseline.',
        artifacts: { diffImagePath: '.omp/testing-enhancer-artifacts/run-1/login.diff.png' }
      }]
    }

    expect(runTestGate({ targets: [target], candidate, browserEvidence })).toMatchObject({
      passed: false,
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'test-file-scope', passed: true }),
        expect.objectContaining({ gate: 'indirect-test', passed: true }),
        expect.objectContaining({ gate: 'browser-visual', passed: false, repairHint: 'Review the diff image before updating the baseline.' }),
        expect.objectContaining({ gate: 'test-command', severity: 'warning' })
      ])
    })
  })

  it('ignores malformed browser evidence findings', () => {
    const target: ChangedTarget = {
      id: 'src/ui/LoginForm.tsx#LoginForm',
      sourceFile: 'src/ui/LoginForm.tsx',
      symbolName: 'LoginForm',
      kind: 'react-component',
      risk: 'medium'
    }
    const output = runTestGate({
      targets: [target],
      candidate: {
        id: 'candidate',
        targetId: target.id,
        files: [{ path: 'src/ui/LoginForm.test.tsx', action: 'create', content: 'test()' }]
      },
      browserEvidence: {
        framework: 'playwright',
        status: 'failed',
        findings: [{}]
      }
    })

    expect(output.results.map(result => result.gate)).not.toContain(undefined)
    expect(output.results).not.toEqual(expect.arrayContaining([expect.objectContaining({ gate: 'browser-visual' })]))
  })

  it('runs browser check through an injected callback', async () => {
    const tools = createTestingEnhancerTools(fakeZod(), {
      runBrowserCheck: async () => ({
        framework: 'playwright',
        status: 'passed',
        runId: 'browser-test',
        baseUrl: 'http://localhost:5173',
        browser: 'chromium',
        findings: []
      })
    })
    const result = await tool(tools, 'omp_test_browser_check').execute('call', {
      baseUrl: 'http://localhost:5173',
      scenarios: []
    }, undefined, undefined, context(process.cwd()))

    expect(result.content[0]?.text).toBe('Browser check passed.')
    expect(result.details).toMatchObject({ status: 'passed', runId: 'browser-test' })
  })
})

describe('createTestingEnhancerTools execute layer', () => {
  it('returns text content and structured details', async () => {
    const cwd = await tempRepo()
    const result = await tool(createTestingEnhancerTools(fakeZod()), 'omp_test_analyze').execute(
      'call',
      { files: ['src/user/UserService.ts'] },
      undefined,
      undefined,
      context(cwd)
    )

    expect(result.content[0]?.type).toBe('text')
    expect(result.details).toMatchObject({
      runId: expect.stringMatching(/^test-/),
      targets: [expect.objectContaining({
        relatedTests: ['src/user/UserService.test.ts'],
        publicEntryHints: ['src/user/index.ts#UserService', 'package.json#exports']
      })]
    })
  })

  it('blocks internal imports through omp_test_gate execute', async () => {
    const target: ChangedTarget = {
      id: 'src/user/UserService.ts#UserService',
      sourceFile: 'src/user/UserService.ts',
      symbolName: 'UserService',
      kind: 'service',
      risk: 'high'
    }

    const result = await tool(createTestingEnhancerTools(fakeZod()), 'omp_test_gate').execute(
      'call',
      {
        targets: [target],
        candidate: {
          id: 'candidate',
          targetId: target.id,
          files: [{ path: 'src/user/UserService.test.ts', action: 'create', content: "import { helper } from '../internal/helper'" }]
        }
      },
      undefined,
      undefined,
      context(process.cwd())
    )

    expect(result.content[0]?.type).toBe('text')
    expect(result.details).toMatchObject({
      passed: false,
      results: expect.arrayContaining([expect.objectContaining({ gate: 'indirect-test', severity: 'blocker' })])
    })
  })

  it('runs test commands even when ctx.exec is unavailable', async () => {
    const target: ChangedTarget = {
      id: 'src/user/UserService.ts#UserService',
      sourceFile: 'src/user/UserService.ts',
      symbolName: 'UserService',
      kind: 'service',
      risk: 'high'
    }
    const command = `${process.execPath} -e "process.stdout.write('ok')"`

    const result = await tool(createTestingEnhancerTools(fakeZod()), 'omp_test_gate').execute(
      'call',
      {
        targets: [target],
        candidate: {
          id: 'candidate',
          targetId: target.id,
          files: [{ path: 'src/user/UserService.test.ts', action: 'create', content: 'expect(result).toBe(true)' }]
        },
        testCommand: command
      },
      undefined,
      undefined,
      context(process.cwd())
    )

    expect(result.details).toMatchObject({
      passed: true,
      results: expect.arrayContaining([
        expect.objectContaining({
          gate: 'test-command',
          passed: true,
          evidence: { command, exitCode: 0 }
        })
      ])
    })
  })
})

function fakeZod() {
  return {
    object: (shape: Record<string, unknown>) => ({ type: 'object', shape }),
    string: () => ({ type: 'string' }),
    boolean: () => ({ type: 'boolean' }),
    unknown: () => ({ type: 'unknown' }),
    array: (schema: unknown) => ({ type: 'array', schema }),
    enum: (values: readonly [string, ...string[]]) => ({ type: 'enum', values }),
    optional: (schema: unknown) => ({ type: 'optional', schema })
  }
}
