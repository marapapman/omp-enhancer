import { createHash } from 'node:crypto'
import { access, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
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

  it('blocks frontend targets when browser evidence is missing', () => {
    const target: ChangedTarget = {
      id: 'src/ui/LoginForm.tsx#LoginForm',
      sourceFile: 'src/ui/LoginForm.tsx',
      symbolName: 'LoginForm',
      kind: 'react-component',
      risk: 'medium'
    }

    expect(runTestGate({
      targets: [target],
      candidate: {
        id: 'candidate',
        targetId: target.id,
        files: [{ path: 'src/ui/LoginForm.test.tsx', action: 'create', content: 'test()' }]
      }
    })).toMatchObject({
      passed: false,
      results: expect.arrayContaining([
        expect.objectContaining({
          gate: 'browser-interaction',
          passed: false,
          severity: 'blocker',
          summary: 'Browser evidence is required for frontend targets.'
        })
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
    expect(output.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ gate: 'browser-interaction', summary: 'Browser evidence is required for frontend targets.' })
    ]))
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

  it('derives property guidance from local related code and tests', async () => {
    const cwd = await tempRepo()
    await mkdir(join(cwd, 'src', 'format'), { recursive: true })
    await writeFile(join(cwd, 'src', 'format', 'normalizeName.ts'), 'export function normalizeName(value: string) { return value.trim().toLowerCase() }')
    await writeFile(join(cwd, 'src', 'format', 'normalizeName.test.ts'), [
      "import fc from 'fast-check'",
      "import { normalizeName } from './normalizeName'",
      "test('property behavior', () => {",
      '  fc.assert(fc.property(fc.string(), value => {',
      '    expect(normalizeName(normalizeName(value))).toEqual(normalizeName(value))',
      '    expect(() => normalizeName(undefined as never)).toThrow()',
      '  }))',
      '})',
      ''
    ].join('\n'))

    const result = await tool(createTestingEnhancerTools(fakeZod()), 'omp_test_context').execute(
      'call',
      {
        target: {
          id: 'src/format/normalizeName.ts#normalizeName',
          sourceFile: 'src/format/normalizeName.ts',
          symbolName: 'normalizeName',
          kind: 'formatter',
          risk: 'low',
          relatedTests: ['src/format/normalizeName.test.ts']
        }
      },
      undefined,
      undefined,
      context(cwd)
    )

    expect(result.content[0]?.text).toBe('Testing style: direct.')
    expect(result.details).toMatchObject({
      propertyPlan: {
        retrieval: {
          strategy: 'local-similar-code-and-tests',
          sources: expect.arrayContaining([
            { path: 'src/format/normalizeName.ts', reason: 'target source for invariant signals' },
            { path: 'src/format/normalizeName.test.ts', reason: 'existing related test' }
          ]),
          webSearchQueries: expect.arrayContaining([expect.stringContaining('normalizeName')])
        },
        properties: expect.arrayContaining([
          expect.objectContaining({ name: 'retrieved generator model', sources: ['src/format/normalizeName.test.ts'] }),
          expect.objectContaining({ name: 'retrieved idempotence', sources: ['src/format/normalizeName.test.ts'] }),
          expect.objectContaining({ name: 'retrieved invalid input rejection', sources: ['src/format/normalizeName.test.ts'] })
        ])
      }
    })
  })

  it('uses local property experience files when they match the target', async () => {
    const cwd = await tempRepo()
    await mkdir(join(cwd, '.omp', 'testing-enhancer'), { recursive: true })
    await writeFile(join(cwd, 'src', 'user', 'slugify.ts'), 'export function slugify(value: string) { return value.toLowerCase().replace(/\\s+/g, "-") }')
    await writeFile(join(cwd, '.omp', 'testing-enhancer', 'property-examples.json'), JSON.stringify({
      properties: [{
        kind: 'pure-function',
        match: ['slugify'],
        name: 'slug alphabet',
        assertion: 'Generated strings produce slugs containing only lowercase letters, digits, and dashes.',
        repairHint: 'Generate unicode, whitespace, repeated separator, and punctuation cases; assert the public slug contract.'
      }]
    }))

    const result = await tool(createTestingEnhancerTools(fakeZod()), 'omp_test_context').execute(
      'call',
      {
        target: {
          id: 'src/user/slugify.ts#slugify',
          sourceFile: 'src/user/slugify.ts',
          symbolName: 'slugify',
          kind: 'pure-function',
          risk: 'low'
        }
      },
      undefined,
      undefined,
      context(cwd)
    )

    expect(result.details).toMatchObject({
      propertyPlan: {
        retrieval: {
          sources: expect.arrayContaining([
            { path: '.omp/testing-enhancer/property-examples.json', reason: 'local property experience base' }
          ])
        },
        properties: expect.arrayContaining([
          expect.objectContaining({
            name: 'slug alphabet',
            sources: ['.omp/testing-enhancer/property-examples.json']
          })
        ])
      }
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

  it('applies gate severity settings from .omp/testing-enhancer.yml', async () => {
    const cwd = await tempRepo()
    await mkdir(join(cwd, '.omp'), { recursive: true })
    await writeFile(join(cwd, '.omp', 'testing-enhancer.yml'), [
      'version: 1',
      'test:',
      '  command:',
      'coverage:',
      '  command:',
      'browser:',
      '  headless: true',
      '  trace: retain-on-failure',
      '  screenshot: only-on-failure',
      '  serviceWorkers: block',
      'gates:',
      '  indirectTest: warn',
      '  productionEdits: warn',
      '  testCommand: warn',
      '  browserEvidence: warn',
      ''
    ].join('\n'))

    const target: ChangedTarget = {
      id: 'src/ui/LoginForm.tsx#LoginForm',
      sourceFile: 'src/ui/LoginForm.tsx',
      symbolName: 'LoginForm',
      kind: 'react-component',
      risk: 'medium'
    }

    const result = await tool(createTestingEnhancerTools(fakeZod()), 'omp_test_gate').execute(
      'call',
      {
        targets: [target],
        candidate: {
          id: 'candidate',
          targetId: target.id,
          files: [{ path: 'src/ui/LoginForm.tsx', action: 'modify', content: 'wrapper.find("button")' }]
        }
      },
      undefined,
      undefined,
      context(cwd)
    )

    expect(result.details).toMatchObject({
      passed: true,
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'test-file-scope', passed: false, severity: 'warning' }),
        expect.objectContaining({ gate: 'indirect-test', passed: false, severity: 'warning' }),
        expect.objectContaining({ gate: 'browser-interaction', passed: true, severity: 'warning' }),
        expect.objectContaining({ gate: 'test-command', passed: true, severity: 'warning' })
      ])
    })
  })

  it('checks candidate test content from the workspace when ctx.exec is available', async () => {
    const cwd = await tempRepo()
    await writeFile(join(cwd, 'src', 'user', 'UserService.test.ts'), "import { helper } from '../internal/helper'\nexpect(helper()).toBe(true)")
    const target: ChangedTarget = {
      id: 'src/user/UserService.ts#UserService',
      sourceFile: 'src/user/UserService.ts',
      symbolName: 'UserService',
      kind: 'service',
      risk: 'high'
    }
    const ctx: ExtensionToolContext = {
      ...context(cwd),
      exec: async () => ({ exitCode: 0, stdout: '', stderr: '' })
    }

    const result = await tool(createTestingEnhancerTools(fakeZod()), 'omp_test_gate').execute(
      'call',
      {
        targets: [target],
        candidate: {
          id: 'candidate',
          targetId: target.id,
          files: [{ path: 'src/user/UserService.test.ts', action: 'modify', content: 'expect(result).toBe(true)' }]
        }
      },
      undefined,
      undefined,
      ctx
    )

    expect(result.details).toMatchObject({
      passed: false,
      results: expect.arrayContaining([
        expect.objectContaining({
          gate: 'indirect-test',
          passed: false,
          evidence: { file: 'src/user/UserService.test.ts', importPath: '../internal/helper' }
        })
      ])
    })
  })

  it('includes untracked source files when analyzing git changes', async () => {
    const cwd = await tempRepo()
    await writeFile(join(cwd, 'src', 'user', 'NewService.ts'), 'export class NewService {}')
    const ctx: ExtensionToolContext = {
      ...context(cwd),
      exec: async (_program, args) => ({
        exitCode: 0,
        stdout: args[0] === 'ls-files' ? 'src/user/NewService.ts\n' : '',
        stderr: ''
      })
    }

    const result = await tool(createTestingEnhancerTools(fakeZod()), 'omp_test_analyze').execute(
      'call',
      {},
      undefined,
      undefined,
      ctx
    )

    expect(result.details).toMatchObject({
      targets: [expect.objectContaining({ sourceFile: 'src/user/NewService.ts', symbolName: 'NewService' })]
    })
  })

  it('consumes host-observed test evidence without executing the command inside the gate', async () => {
    const target: ChangedTarget = {
      id: 'src/user/UserService.ts#UserService',
      sourceFile: 'src/user/UserService.ts',
      symbolName: 'UserService',
      kind: 'service',
      risk: 'high'
    }
    const command = `${process.execPath} -e "process.stdout.write('ok')"`

    const tools = createTestingEnhancerTools(fakeZod(), {
      getObservedTestCommandEvidence: () => ({
        schemaVersion: 1,
        routeId: 'route-1',
        commandDigest: createHash('sha256').update(command).digest('hex'),
        exitCode: 0,
        observedAt: Date.now()
      })
    })
    const result = await tool(tools, 'omp_test_gate').execute(
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
          evidence: { command: expect.stringMatching(/^host-observed:sha256:/), exitCode: 0 }
        })
      ])
    })
  })

  it('never executes a model-supplied or configured command inside omp_test_gate', async () => {
    const cwd = await tempRepo()
    const marker = join(cwd, 'pwned.txt')
    const malicious = `${process.execPath} -e "require('fs').writeFileSync('${marker}', 'bad')"`
    await mkdir(join(cwd, '.omp'), { recursive: true })
    await writeFile(join(cwd, '.omp', 'testing-enhancer.yml'), [
      'version: 1',
      'test:',
      `  command: ${malicious}`,
      'coverage:',
      '  command:',
      'gates:',
      '  indirectTest: block',
      '  productionEdits: block',
      '  testCommand: block',
      ''
    ].join('\n'))
    const target: ChangedTarget = {
      id: 'src/user/UserService.ts#UserService', sourceFile: 'src/user/UserService.ts',
      symbolName: 'UserService', kind: 'service', risk: 'high'
    }
    const gate = tool(createTestingEnhancerTools(fakeZod()), 'omp_test_gate')
    for (const params of [
      {
        targets: [target], candidate: { id: 'candidate', targetId: target.id, files: [{ path: 'src/user/UserService.test.ts', action: 'create', content: 'expect(result).toBe(true)' }] },
        testCommand: malicious
      },
      {
        targets: [target], candidate: { id: 'candidate', targetId: target.id, files: [{ path: 'src/user/UserService.test.ts', action: 'create', content: 'expect(result).toBe(true)' }] }
      }
    ]) {
      const result = await gate.execute('call', params, undefined, undefined, context(cwd))
      expect(result.details).toMatchObject({
        passed: false,
        results: expect.arrayContaining([expect.objectContaining({ gate: 'test-command', passed: false })])
      })
      await expect(access(marker)).rejects.toThrow()
    }
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
