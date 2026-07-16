import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { registerTestingEnhancer } from '../../src/extension.js'
import type { CommandDefinition, ExtensionAPI, ExtensionCommandContext, ExtensionEventHandler, ToolDefinition } from '../../src/ompApi.js'

class FakePi implements ExtensionAPI {
  readonly labels: string[] = []
  readonly commands = new Map<string, CommandDefinition>()
  readonly tools = new Map<string, ToolDefinition>()
  readonly eventHandlers: Array<{ event: string; handler: ExtensionEventHandler }> = []
  readonly userMessages: string[] = []
  readonly userMessageOptions: Array<{ deliverAs?: 'steer' | 'followUp' | 'nextTurn' } | undefined> = []
  idleWaits = 0
  readonly entries: Array<{ customType: string; data: unknown }> = []
  readonly notifications: Array<{ message: string; level?: 'info' | 'warn' | 'error' }> = []
  readonly zod = { z: fakeZod() }
  activeTools = ['read']
  readonly activeToolUpdates: string[][] = []

  setLabel(label: string): void { this.labels.push(label) }
  registerCommand(name: string, command: CommandDefinition): void { this.commands.set(name, command) }
  registerTool(tool: ToolDefinition): void { this.tools.set(tool.name, tool) }
  getAllTools(): string[] { return [...this.activeTools, ...this.tools.keys()] }
  getActiveTools(): string[] { return [...this.activeTools] }
  setActiveTools(names: string[]): void {
    this.activeTools = [...names]
    this.activeToolUpdates.push([...names])
  }
  on(event: string, handler: ExtensionEventHandler): void { this.eventHandlers.push({ event, handler }) }
  sendUserMessage(content: string, options?: { deliverAs?: 'steer' | 'followUp' | 'nextTurn' }): void {
    this.userMessages.push(content)
    this.userMessageOptions.push(options)
  }
  appendEntry(customType: string, data: unknown): void { this.entries.push({ customType, data }) }
}

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'omp-testing-enhancer-extension-'))
}

function command(pi: FakePi, name: string): CommandDefinition {
  const found = pi.commands.get(name)
  if (!found) throw new Error(`Missing command ${name}`)
  return found
}

async function runCommand(pi: FakePi, args: string, cwd = process.cwd()): Promise<void> {
  await command(pi, 'test').handler(args, {
    cwd,
    hasUI: true,
    ui: { notify: (message, level) => { pi.notifications.push(level ? { message, level } : { message }) } },
    waitForIdle: () => { pi.idleWaits += 1; return Promise.resolve() }
  })
}

describe('registerTestingEnhancer', () => {
  it('registers omp_test_browser_check as an optional tool', () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)

    expect(pi.labels).toEqual(['OMP Testing Enhancer'])
    expect([...pi.commands.keys()]).toEqual(['test'])
    expect([...pi.tools.keys()]).toEqual([
      'omp_test_analyze',
      'omp_test_context',
      'omp_test_browser_check',
      'omp_test_coverage_analyze',
      'omp_test_mutation_context',
      'omp_test_gate',
      'omp_test_report'
    ])
    expect([...pi.tools.values()].every(tool => typeof tool.execute === 'function')).toBe(true)
    expect([...pi.tools.values()].every(tool => tool.defaultInactive === true)).toBe(true)
    expect(pi.tools.get('omp_test_browser_check')?.approval).toBe('exec')
    expect(
      [...pi.tools.values()]
        .filter(tool => tool.name !== 'omp_test_browser_check')
        .every(tool => tool.approval === 'read')
    ).toBe(true)
    expect(pi.eventHandlers.map(handler => handler.event)).toEqual([
      'session_start',
      'tool_result'
    ])
  })

  it('prints /test help through UI and entries without dashed command variants', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)

    await runCommand(pi, 'help')

    expect(pi.notifications).toHaveLength(1)
    expect(pi.notifications[0]?.message).toContain('/test help')
    expect(pi.notifications[0]?.message).toContain('/test check')
    expect(pi.notifications[0]?.message).not.toContain('--')
    expect(pi.entries).toEqual([
      { customType: 'omp-testing-enhancer.message', data: { kind: 'help', markdown: pi.notifications[0]?.message } }
    ])
    expect(pi.userMessages).toHaveLength(0)
  })

  it('starts the default /test workflow after the prompt is idle', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)

    await runCommand(pi, '')

    expect(pi.idleWaits).toBe(1)
    expect(pi.userMessages).toHaveLength(1)
    expect(pi.userMessages[0]).toContain('当前会话中的代码改动')
    expect(pi.userMessages[0]).toContain('omp_test_analyze')
    expect(pi.userMessages[0]).toContain('browserPlan')
    expect(pi.userMessages[0]).toContain('omp_test_browser_check')
    expect(pi.userMessages[0]).toContain('omp_test_coverage_analyze')
    expect(pi.userMessages[0]).toContain('omp_test_mutation_context')
    expect(pi.notifications).toHaveLength(0)
    expect(pi.activeTools).toEqual(['read', ...pi.tools.keys()])
    expect(pi.activeToolUpdates).toHaveLength(1)
  })

  it('turns /test into an agent instruction with required and optional testing tools', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)

    await runCommand(pi, 'src/user/UserService.ts')

    expect(pi.userMessages).toHaveLength(1)
    expect(pi.userMessages[0]).toContain('src/user/UserService.ts')
    expect(pi.userMessages[0]).toContain('omp_test_analyze')
    expect(pi.userMessages[0]).toContain('omp_test_context')
    expect(pi.userMessages[0]).toContain('omp_test_gate')
    expect(pi.userMessages[0]).toContain('browserPlan')
    expect(pi.userMessages[0]).toContain('omp_test_browser_check')
    expect(pi.userMessages[0]).toContain('coverage')
    expect(pi.userMessages[0]).toContain('mutation')
    expect(pi.userMessages[0]).toContain('test-planner')
    expect(pi.userMessages[0]).toContain('test-executor')
    expect(pi.userMessages[0]).toContain('test-reviewer')
    expect(pi.userMessages[0].indexOf('test-planner')).toBeLessThan(pi.userMessages[0].indexOf('test-executor'))
    expect(pi.userMessages[0].indexOf('test-executor')).toBeLessThan(pi.userMessages[0].indexOf('test-reviewer'))
    expect(pi.userMessages[0]).toContain('独立只读审查')
    expect(pi.userMessages[0]).not.toContain('--')
  })

  it('sends check and report as focused instructions', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)

    await runCommand(pi, 'check')
    await runCommand(pi, 'report')

    expect(pi.userMessages[0]).toContain('omp_test_gate')
    expect(pi.userMessages[0]).toContain('test-reviewer')
    expect(pi.userMessages[0]).not.toContain('omp_test_analyze')
    expect(pi.userMessages[1]).toContain('omp_test_report')
    expect(pi.userMessages[1]).not.toContain('omp_test_analyze')
  })

  it('initializes config without sending an agent prompt or overwriting existing config', async () => {
    const cwd = await tempDir()
    await writeFile(join(cwd, 'bun.lock'), '')
    const pi = new FakePi()
    registerTestingEnhancer(pi)

    await runCommand(pi, 'init', cwd)
    const first = await readFile(join(cwd, '.omp', 'testing-enhancer.yml'), 'utf8')
    await mkdir(join(cwd, '.omp'), { recursive: true })
    await writeFile(join(cwd, '.omp', 'testing-enhancer.yml'), 'version: 2\ntest:\n  command: custom\ncoverage:\n  command: \nreview:\n  indirectTest: critical\n  productionEdits: critical\n  testCommand: critical\n')
    await runCommand(pi, 'init', cwd)

    expect(first).toContain('bunx vitest run')
    expect(await readFile(join(cwd, '.omp', 'testing-enhancer.yml'), 'utf8')).toContain('command: custom')
    expect(pi.userMessages).toHaveLength(0)
    expect(pi.activeToolUpdates).toHaveLength(0)
    expect(pi.notifications.map(item => item.message)).toEqual([
      'Created .omp/testing-enhancer.yml',
      'OMP Testing Enhancer config already exists: .omp/testing-enhancer.yml'
    ])
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
