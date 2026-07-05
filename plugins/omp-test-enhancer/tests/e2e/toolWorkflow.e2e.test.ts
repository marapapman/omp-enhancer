import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import registerTestingEnhancer from '../../src/extension.js'
import type { AgentToolResult, CommandDefinition, ExtensionAPI, ExtensionEventHandler, ExtensionToolContext, ToolDefinition } from '../../src/ompApi.js'
import type { AnalyzeOutput, ContextOutput, GateOutput, ReportOutput } from '../../src/tools/testingTools.js'
import type { ChangedTarget } from '../../src/types.js'

class FakePi implements ExtensionAPI {
  readonly labels: string[] = []
  readonly commands = new Map<string, CommandDefinition>()
  readonly tools = new Map<string, ToolDefinition>()
  readonly eventHandlers: Array<{ event: string; handler: ExtensionEventHandler }> = []
  readonly userMessages: string[] = []
  readonly entries: Array<{ customType: string; data: unknown }> = []
  readonly zod = { z: fakeZod() }

  setLabel(label: string): void { this.labels.push(label) }
  registerCommand(name: string, command: CommandDefinition): void { this.commands.set(name, command) }
  registerTool(tool: ToolDefinition): void { this.tools.set(tool.name, tool) }
  on(event: string, handler: ExtensionEventHandler): void { this.eventHandlers.push({ event, handler }) }
  sendUserMessage(content: string): void { this.userMessages.push(content) }
  appendEntry(customType: string, data: unknown): void { this.entries.push({ customType, data }) }
}

async function tempRepo(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-e2e-'))
  await mkdir(join(cwd, 'src', 'math'), { recursive: true })
  await mkdir(join(cwd, 'src', 'ui'), { recursive: true })
  await mkdir(join(cwd, 'tests', 'src', 'math'), { recursive: true })
  await writeFile(join(cwd, 'src', 'math', 'clamp.ts'), 'export function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)) }')
  await writeFile(join(cwd, 'src', 'ui', 'LoginForm.tsx'), 'export function LoginForm() { return <button>Sign in</button> }')
  return cwd
}

function createRegisteredPlugin(): FakePi {
  const pi = new FakePi()
  registerTestingEnhancer(pi)
  return pi
}

function tool(pi: FakePi, name: string): ToolDefinition {
  const found = pi.tools.get(name)
  if (!found) throw new Error(`Missing tool ${name}`)
  return found
}

function context(cwd: string, exec?: ExtensionToolContext['exec']): ExtensionToolContext {
  return { cwd, hasUI: false, ui: { notify: () => undefined }, ...(exec ? { exec } : {}) }
}

async function executeTool<TDetails>(pi: FakePi, name: string, params: unknown, ctx: ExtensionToolContext): Promise<AgentToolResult & { details: TDetails }> {
  const result = await tool(pi, name).execute(name, params, undefined, undefined, ctx)
  if (result.details === undefined) throw new Error(`${name} returned no details`)
  return result as AgentToolResult & { details: TDetails }
}

describe('omp-test-enhancer e2e workflow', () => {
  it('runs analyze, context, gate, and report for a pure function property-test workflow', async () => {
    const cwd = await tempRepo()
    const pi = createRegisteredPlugin()
    const ctx = context(cwd)

    const analyze = await executeTool<AnalyzeOutput>(pi, 'omp_test_analyze', { files: ['src/math/clamp.ts'] }, ctx)
    const target = analyze.details.targets[0]
    if (!target) throw new Error('Expected analyze target')

    const contextResult = await executeTool<ContextOutput>(pi, 'omp_test_context', { target }, ctx)
    expect(contextResult.details).toMatchObject({
      testingStyle: 'direct',
      propertyPlan: {
        frameworkSuggestion: 'fast-check',
        properties: expect.arrayContaining([
          expect.objectContaining({ name: 'range bound' })
        ])
      }
    })

    const gate = await executeTool<GateOutput>(pi, 'omp_test_gate', {
      targets: [target],
      candidate: {
        id: 'candidate',
        targetId: target.id,
        files: [{
          path: 'tests/src/math/clamp.test.ts',
          action: 'create',
          content: [
            "import { clamp } from '../../../src/math/clamp'",
            'test("clamps public result", () => {',
            '  expect(clamp(10, 0, 5)).toBe(5)',
            '  expect(clamp(-1, 0, 5)).toBe(0)',
            '})'
          ].join('\n')
        }]
      },
      testCommand: `${process.execPath} -e "process.exit(0)"`
    }, ctx)

    expect(gate.details).toMatchObject({
      passed: true,
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'test-file-scope', passed: true }),
        expect.objectContaining({ gate: 'indirect-test', passed: true }),
        expect.objectContaining({ gate: 'test-command', passed: true })
      ])
    })

    const report = await executeTool<ReportOutput>(pi, 'omp_test_report', {}, ctx)
    expect(report.details.markdown).toContain('Result: passed')
  })

  it('requires browser evidence for frontend targets and passes after structured browser evidence is supplied', async () => {
    const cwd = await tempRepo()
    const pi = createRegisteredPlugin()
    const ctx = context(cwd)

    const analyze = await executeTool<AnalyzeOutput>(pi, 'omp_test_analyze', { files: ['src/ui/LoginForm.tsx'] }, ctx)
    const target = analyze.details.targets[0]
    if (!target) throw new Error('Expected frontend target')

    const contextResult = await executeTool<ContextOutput>(pi, 'omp_test_context', { target }, ctx)
    expect(contextResult.details).toMatchObject({
      testingStyle: 'indirect',
      browserPlan: expect.objectContaining({ framework: 'playwright' })
    })

    const candidate = {
      id: 'candidate',
      targetId: target.id,
      files: [{
        path: 'src/ui/LoginForm.test.tsx',
        action: 'create',
        content: 'test("visible sign in button", () => expect(screen.getByRole("button", { name: /sign in/i })).toBeVisible())'
      }]
    }

    const missingEvidenceGate = await executeTool<GateOutput>(pi, 'omp_test_gate', { targets: [target], candidate }, ctx)
    expect(missingEvidenceGate.details).toMatchObject({
      passed: false,
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'browser-interaction', passed: false, summary: 'Browser evidence is required for frontend targets.' })
      ])
    })

    const browserEvidence = {
      framework: 'playwright',
      status: 'passed',
      runId: 'browser-ok',
      findings: []
    }
    const passingGate = await executeTool<GateOutput>(pi, 'omp_test_gate', { targets: [target], candidate, browserEvidence }, ctx)
    expect(passingGate.details).toMatchObject({
      passed: true,
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'browser-interaction', passed: true }),
        expect.objectContaining({ gate: 'browser-visual', passed: true }),
        expect.objectContaining({ gate: 'test-command', severity: 'warning' })
      ])
    })

    const report = await executeTool<ReportOutput>(pi, 'omp_test_report', {}, ctx)
    expect(report.details.markdown).toContain('browser-interaction: passed')
  })

  it('runs a warning-only configured workflow without hiding the failed gate evidence', async () => {
    const cwd = await tempRepo()
    await mkdir(join(cwd, '.omp'), { recursive: true })
    await writeFile(join(cwd, '.omp', 'testing-enhancer.yml'), [
      'version: 1',
      'test:',
      `  command: ${process.execPath} -e "process.exit(3)"`,
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

    const pi = createRegisteredPlugin()
    const target: ChangedTarget = {
      id: 'src/ui/LoginForm.tsx#LoginForm',
      sourceFile: 'src/ui/LoginForm.tsx',
      symbolName: 'LoginForm',
      kind: 'react-component',
      risk: 'medium'
    }

    const gate = await executeTool<GateOutput>(pi, 'omp_test_gate', {
      targets: [target],
      candidate: {
        id: 'candidate',
        targetId: target.id,
        files: [{
          path: 'src/ui/LoginForm.tsx',
          action: 'modify',
          content: 'wrapper.find("button").instance().setState({ ready: true })'
        }]
      }
    }, context(cwd))

    expect(gate.details).toMatchObject({
      passed: true,
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'test-file-scope', passed: false, severity: 'warning' }),
        expect.objectContaining({ gate: 'indirect-test', passed: false, severity: 'warning' }),
        expect.objectContaining({ gate: 'browser-interaction', passed: true, severity: 'warning' }),
        expect.objectContaining({ gate: 'test-command', passed: false, severity: 'warning' })
      ])
    })

    const report = await executeTool<ReportOutput>(pi, 'omp_test_report', {}, context(cwd))
    expect(report.details.markdown).toContain('test-file-scope: warning')
    expect(report.details.markdown).toContain('test-command: warning')
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
