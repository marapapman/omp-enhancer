import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { registerTestingEnhancer } from '../../src/extension.js'
import type { CommandDefinition, ExtensionAPI, ExtensionCommandContext, ExtensionEventHandler, ExtensionToolContext, ToolDefinition } from '../../src/ompApi.js'

class FakePi implements ExtensionAPI {
  readonly labels: string[] = []
  readonly commands = new Map<string, CommandDefinition>()
  readonly tools = new Map<string, ToolDefinition>()
  readonly eventHandlers: Array<{ event: string; handler: ExtensionEventHandler }> = []
  readonly userMessages: string[] = []
  readonly entries: Array<{ type: string; customType: string; data: unknown }> = []
  readonly zod = { z: fakeZod() }

  setLabel(label: string): void { this.labels.push(label) }
  registerCommand(name: string, command: CommandDefinition): void { this.commands.set(name, command) }
  registerTool(tool: ToolDefinition): void { this.tools.set(tool.name, tool) }
  on(event: string, handler: ExtensionEventHandler): void { this.eventHandlers.push({ event, handler }) }
  sendUserMessage(content: string): void { this.userMessages.push(content) }
  appendEntry(customType: string, data: unknown): void { this.entries.push({ type: 'custom', customType, data }) }
}

describe('extension session state', () => {
  it('continues session after analyze until gate runs', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-session-')))

    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    if (!analyze) throw new Error('Missing analyze')
    await analyze.execute('call', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, ctx)

    expect(await event(pi, 'session_stop')({}, ctx)).toMatchObject({
      continue: true,
      additionalContext: expect.stringContaining('omp_test_gate')
    })

    const gate = pi.tools.get('omp_test_gate')
    if (!gate) throw new Error('Missing gate')
    await gate.execute('call', {
      targets: [{ id: 'src/user/UserService.ts#UserService', sourceFile: 'src/user/UserService.ts', symbolName: 'UserService', kind: 'service', risk: 'high' }],
      candidate: { id: 'candidate', targetId: 'src/user/UserService.ts#UserService', files: [{ path: 'src/user/UserService.test.ts', action: 'create', content: 'expect(result).toBe(true)' }] }
    }, undefined, undefined, ctx)

    expect(await event(pi, 'session_stop')({}, ctx)).toBeUndefined()
  })

  it('keeps the session gate open after a failed omp_test_gate result until a passing rerun', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-session-')))

    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    if (!analyze) throw new Error('Missing analyze')
    await analyze.execute('call', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, ctx)

    const gate = pi.tools.get('omp_test_gate')
    if (!gate) throw new Error('Missing gate')
    await gate.execute('call', {
      targets: [{ id: 'src/user/UserService.ts#UserService', sourceFile: 'src/user/UserService.ts', symbolName: 'UserService', kind: 'service', risk: 'high' }],
      candidate: { id: 'candidate', targetId: 'src/user/UserService.ts#UserService', files: [{ path: 'src/user/UserService.test.ts', action: 'create', content: "import { helper } from '../internal/helper'\nexpect(helper()).toBe(true)" }] }
    }, undefined, undefined, ctx)

    expect(await event(pi, 'session_stop')({}, ctx)).toMatchObject({
      continue: true,
      additionalContext: expect.stringContaining('omp_test_gate failed')
    })
    const failedStop = await event(pi, 'session_stop')({}, ctx)
    expect(failedStop).toMatchObject({
      continue: true,
      additionalContext: expect.stringContaining('Test imports private or internal implementation details.')
    })
    expect(failedStop?.additionalContext).toContain('Repair:')

    await gate.execute('call', {
      targets: [{ id: 'src/user/UserService.ts#UserService', sourceFile: 'src/user/UserService.ts', symbolName: 'UserService', kind: 'service', risk: 'high' }],
      candidate: { id: 'candidate', targetId: 'src/user/UserService.ts#UserService', files: [{ path: 'src/user/UserService.test.ts', action: 'create', content: 'expect(result).toBe(true)' }] }
    }, undefined, undefined, ctx)

    expect(await event(pi, 'session_stop')({}, ctx)).toBeUndefined()
  })
})

function event(pi: FakePi, name: string): ExtensionEventHandler {
  const found = pi.eventHandlers.find(item => item.event === name)
  if (!found) throw new Error(`Missing event ${name}`)
  return found.handler
}

function toolContext(pi: FakePi, cwd: string): ExtensionToolContext {
  return {
    cwd,
    ui: { notify: () => undefined },
    hasUI: false,
    sessionManager: { getBranch: () => pi.entries }
  }
}

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
