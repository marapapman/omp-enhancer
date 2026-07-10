import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { registerTestingEnhancer } from '../../src/extension.js'
import { CORE_GATE_OWNER_ENTRY, CORE_GATE_OWNER_SYMBOL, CORE_STATE_ENTRY } from '../../src/session/gateOwnership.js'
import { TESTING_EVIDENCE_ENTRY, TESTING_STATE_ENTRY } from '../../src/session/testingState.js'
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
  it('binds omp_test_gate to a route-scoped host-observed shell test result', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-observed-test-')))
    pi.entries.push(coreRouteEntry('route-observed'))
    await event(pi, 'session_start')({}, ctx)
    await event(pi, 'tool_result')({
      name: 'functions.exec_command',
      input: { command: 'npm test' },
      exitCode: 0,
      isError: false,
      content: [{ type: 'text', text: '42 tests passed, 0 failed' }]
    }, ctx)

    const gate = pi.tools.get('omp_test_gate')
    if (!gate) throw new Error('Missing gate')
    const passed = await gate.execute('gate-observed', {
      ...passingGateParams(),
      testCommand: 'npm test'
    }, undefined, undefined, ctx)
    expect(passed.details).toMatchObject({
      passed: true,
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'test-command', passed: true, evidence: { command: expect.stringMatching(/^host-observed:sha256:/), exitCode: 0 } })
      ])
    })

    pi.entries.push(coreRouteEntry('route-new'))
    await event(pi, 'session_start')({}, ctx)
    const stale = await gate.execute('gate-stale', {
      ...passingGateParams(),
      testCommand: 'npm test'
    }, undefined, undefined, ctx)
    expect(stale.details).toMatchObject({
      passed: true,
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'test-command', passed: true, severity: 'warning', evidence: {} })
      ])
    })
  })

  it('rejects spoofed executors, non-running probes, empty suites, and failed output as observed tests', async () => {
    const cases = [
      { name: 'evil executor', toolName: 'evil.exec_command', command: 'npm test', output: '42 tests passed, 0 failed', exitCode: 0 },
      { name: 'provider executor', toolName: 'provider.exec_command', command: 'npm test', output: '42 tests passed, 0 failed', exitCode: 0 },
      { name: 'echo tool', toolName: 'echo', command: 'npm test', output: '42 tests passed, 0 failed', exitCode: 0 },
      { name: 'help', toolName: 'bash', command: 'npm test -- --help', output: '42 tests passed, 0 failed', exitCode: 0 },
      { name: 'list tests', toolName: 'bash', command: 'npm test -- --listTests', output: 'src/user/UserService.test.ts', exitCode: 0 },
      { name: 'collect only', toolName: 'bash', command: 'pytest --collect-only', output: '5 tests collected', exitCode: 0 },
      { name: 'pass with no tests', toolName: 'bash', command: 'npm test -- --passWithNoTests', output: 'No tests found, exiting with code 0', exitCode: 0 },
      { name: 'zero tests', toolName: 'bash', command: 'npm test', output: '0 tests passed, 0 failed', exitCode: 0 },
      { name: 'rust zero tests', toolName: 'bash', command: 'cargo test', output: 'test result: ok. 0 passed; 0 failed; 0 ignored', exitCode: 0 },
      { name: 'go no test files', toolName: 'bash', command: 'go test ./...', output: 'ok example/pkg [no test files]', exitCode: 0 },
      { name: 'pytest zero items', toolName: 'bash', command: 'pytest', output: 'collected 0 items\nno tests ran', exitCode: 0 },
      { name: 'unittest all skipped', toolName: 'bash', command: 'python -m unittest', output: 'Ran 3 tests in 0.01s\n\nOK (skipped=3)', exitCode: 0 },
      { name: 'phpunit zero assertions', toolName: 'bash', command: 'phpunit', output: 'OK, but there were issues!\nTests: 3, Assertions: 0, Skipped: 3', exitCode: 0 },
      { name: 'weak pass with zero tests', toolName: 'bash', command: 'npm test', output: 'PASS src/empty.test.js\n0 tests passed, 0 failed', exitCode: 0 },
      { name: 'single pipe masking', toolName: 'bash', command: "npm test | printf '1 test passed\\n'", output: '1 test passed, 0 failed', exitCode: 0 },
      { name: 'background masking', toolName: 'bash', command: 'npm test &', output: '1 test passed, 0 failed', exitCode: 0 },
      { name: 'newline masking', toolName: 'bash', command: "npm test\nprintf '1 test passed'", output: '1 test passed, 0 failed', exitCode: 0 },
      { name: 'contest executable', toolName: 'bash', command: './contest', output: '1 test passed, 0 failed', exitCode: 0 },
      { name: 'attest executable', toolName: 'bash', command: './attest', output: '1 test passed, 0 failed', exitCode: 0 },
      { name: 'failed output', toolName: 'bash', command: 'npm test', output: '41 tests passed, 1 failed', exitCode: 0 },
      { name: 'nonzero exit', toolName: 'bash', command: 'npm test', output: '42 tests passed, 0 failed', exitCode: 1 }
    ]

    for (const item of cases) {
      const pi = new FakePi()
      registerTestingEnhancer(pi)
      const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), `omp-testing-enhancer-rejected-${item.name.replaceAll(' ', '-')}-`)))
      pi.entries.push(coreRouteEntry(`route-rejected-${item.name}`))
      await event(pi, 'session_start')({}, ctx)
      await event(pi, 'tool_result')({
        name: item.toolName,
        input: { command: item.command },
        exitCode: item.exitCode,
        isError: item.exitCode !== 0,
        content: [{ type: 'text', text: item.output }]
      }, ctx)

      const gate = pi.tools.get('omp_test_gate')
      if (!gate) throw new Error('Missing gate')
      const result = await gate.execute(`gate-${item.name}`, {
        ...passingGateParams(),
        testCommand: item.command
      }, undefined, undefined, ctx)
      expect(result.details, item.name).toMatchObject({
        results: expect.arrayContaining([
          expect.objectContaining({ gate: 'test-command', severity: 'warning', evidence: {} })
        ])
      })
    }
  })

  it('accepts standard nonzero summaries from supported test frameworks', async () => {
    const cases = [
      ['mvn test', '[INFO] Tests run: 5, Failures: 0, Errors: 0, Skipped: 0\n[INFO] BUILD SUCCESS'],
      ['dotnet test', 'Passed!  - Failed: 0, Passed: 12, Skipped: 0, Total: 12, Duration: 1 s'],
      ['dotnet test', 'Test summary: total: 12, failed: 0, succeeded: 12, skipped: 0'],
      ['python -m unittest', 'Ran 3 tests in 0.01s\n\nOK'],
      ['python -m unittest', 'Ran 3 tests in 0.01s\n\nOK (skipped=1)'],
      ['phpunit', 'OK, but there were issues!\nTests: 3, Assertions: 3, Skipped: 1'],
      ['./gradlew test', '> Task :compileJava UP-TO-DATE\n> Task :processTestResources NO-SOURCE\n> Task :test\nBUILD SUCCESSFUL in 5s'],
      ['ctest', '100% tests passed, 0 tests failed out of 5'],
      ['bundle exec rspec', '12 examples, 0 failures'],
      ['bun test', '12 pass\n0 fail'],
      ['phpunit', 'OK (12 tests, 34 assertions)'],
      ['swift test', 'Executed 12 tests, with 0 failures'],
      ['mix test', '12 tests, 0 failures'],
      ['npm run unit', '12 tests passed, 0 failed'],
      ['npm run integration', '12 tests passed, 0 failed'],
      ['npm run e2e', '12 tests passed, 0 failed'],
      ['npm run check:test', '12 tests passed, 0 failed'],
      ['./test.sh', '12 tests passed, 0 failed'],
      ["npm test -- -t 'a|b'", '12 tests passed, 0 failed'],
      ['go test ./...', '? example/cmd [no test files]\nok example/pkg 0.123s'],
      ['./gradlew test', '> Task :lib:test NO-SOURCE\n> Task :app:test\nBUILD SUCCESSFUL in 5s'],
      ['pnpm exec cypress run', 'Tests: 1\nPassing: 1\nFailing: 0'],
      ['cargo test', 'test result: ok. 0 passed; 0 failed\ntest result: ok. 5 passed; 0 failed'],
      ['npm test', 'TAP version 13\n# pass 0\n# pass 5\n# fail 0'],
      ['bunx vitest run', '5 tests passed, 0 failed'],
      ['npx jest', '5 tests passed, 0 failed'],
      ['make test', '5 tests passed, 0 failed'],
      ['deno test', '5 tests passed, 0 failed'],
      ['bazel test //...', '5 tests passed, 0 failed'],
      ['npx playwright test', '5 tests passed, 0 failed'],
      ['pnpm exec cypress run', '5 tests passed, 0 failed'],
      ['npm exec mocha', '5 tests passed, 0 failed'],
      ['flutter test', '5 tests passed, 0 failed'],
      ['zig build test', '5 tests passed, 0 failed'],
      ['tox', '5 tests passed, 0 failed'],
      ['python -m nox', '5 tests passed, 0 failed'],
      ['nose2', '5 tests passed, 0 failed'],
      ['behave', '5 tests passed, 0 failed'],
      ['robot tests/', '5 tests passed, 0 failed'],
      ['xcodebuild test -scheme App', '5 tests passed, 0 failed'],
      ['sbt test', '5 tests passed, 0 failed'],
      ['lein test', '5 tests passed, 0 failed'],
      ['make check', '5 tests passed, 0 failed']
    ]
    for (const [index, [command, output]] of cases.entries()) {
      const pi = new FakePi()
      registerTestingEnhancer(pi)
      const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), `omp-testing-enhancer-framework-${index}-`)))
      pi.entries.push(coreRouteEntry(`route-framework-${index}`))
      await event(pi, 'session_start')({}, ctx)
      await event(pi, 'tool_result')({
        name: 'bash', input: { command }, exitCode: 0,
        content: [{ type: 'text', text: output }]
      }, ctx)
      const gate = pi.tools.get('omp_test_gate')
      if (!gate) throw new Error('Missing gate')
      const result = await gate.execute(`gate-framework-${index}`, {
        ...passingGateParams(), testCommand: command
      }, undefined, undefined, ctx)
      expect(result.details, command).toMatchObject({
        results: expect.arrayContaining([
          expect.objectContaining({ gate: 'test-command', passed: true, evidence: expect.objectContaining({ exitCode: 0 }) })
        ])
      })
    }
  })

  it('invalidates standalone observed test evidence after a later definite workspace mutation', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-mutation-invalidation-')))
    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    const gate = pi.tools.get('omp_test_gate')
    if (!analyze || !gate) throw new Error('Missing testing tools')
    await analyze.execute('analyze-before-test', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, ctx)
    await event(pi, 'tool_result')({
      name: 'bash',
      input: { command: 'npm test' },
      exitCode: 0,
      content: [{ type: 'text', text: '42 tests passed, 0 failed' }]
    }, ctx)

    const beforeMutation = await gate.execute('gate-before-mutation', {
      ...passingGateParams(),
      testCommand: 'npm test'
    }, undefined, undefined, ctx)
    expect(beforeMutation.details).toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'test-command', passed: true, evidence: expect.objectContaining({ exitCode: 0 }) })
      ])
    })

    await event(pi, 'tool_result')({
      name: 'edit',
      input: { path: 'src/user/UserService.ts' },
      isError: false,
      content: [{ type: 'text', text: 'updated file' }]
    }, ctx)
    expect(await event(pi, 'session_stop')({}, ctx)).toMatchObject({
      continue: true,
      additionalContext: expect.stringContaining('omp_test_gate')
    })
    const afterMutation = await gate.execute('gate-after-mutation', {
      ...passingGateParams(),
      testCommand: 'npm test'
    }, undefined, undefined, ctx)
    expect(afterMutation.details).toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'test-command', severity: 'warning', evidence: {} })
      ])
    })

    await event(pi, 'tool_result')({
      name: 'bash',
      input: { command: 'npm test' },
      exitCode: 0,
      content: [{ type: 'text', text: '42 tests passed, 0 failed' }]
    }, ctx)
    await event(pi, 'tool_result')({
      name: 'edit',
      input: { path: 'src/user/UserService.ts' },
      isError: true,
      content: [{ type: 'text', text: 'write partially applied before failure' }]
    }, ctx)
    const afterFailedMutation = await gate.execute('gate-after-failed-mutation', {
      ...passingGateParams(),
      testCommand: 'npm test'
    }, undefined, undefined, ctx)
    expect(afterFailedMutation.details).toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'test-command', severity: 'warning', evidence: {} })
      ])
    })
  })

  it('clears a prior passing observation when a later explicit test attempt fails', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-failed-rerun-')))
    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    const gate = pi.tools.get('omp_test_gate')
    if (!analyze || !gate) throw new Error('Missing testing tools')
    await analyze.execute('analyze-failed-rerun', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, ctx)
    await event(pi, 'tool_result')({
      name: 'bash', input: { command: 'npm test' }, exitCode: 0,
      content: [{ type: 'text', text: '42 tests passed, 0 failed' }]
    }, ctx)
    expect((await gate.execute('gate-before-failed-rerun', {
      ...passingGateParams(), testCommand: 'npm test'
    }, undefined, undefined, ctx)).details).toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'test-command', passed: true, evidence: expect.objectContaining({ exitCode: 0 }) })
      ])
    })

    await event(pi, 'tool_result')({
      name: 'bash', input: { command: 'npm test' }, exitCode: 1, isError: true,
      content: [{ type: 'text', text: '41 tests passed, 1 failed' }]
    }, ctx)
    expect((await gate.execute('gate-after-failed-rerun', {
      ...passingGateParams(), testCommand: 'npm test'
    }, undefined, undefined, ctx)).details).toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'test-command', severity: 'warning', evidence: {} })
      ])
    })
  })

  it('invalidates stale standalone evidence for opaque and compound writes but preserves read-only commands', async () => {
    const mutations = [
      'printf x > src/generated.ts',
      'cat input.txt > src/generated.ts',
      'git diff > src/diff.txt',
      'npm run format',
      'node scripts/generate.js',
      "npm test && sed -i 's/a/b/' src/index.ts",
      'npm test | tee src/test.log'
    ]

    for (const [index, command] of mutations.entries()) {
      const pi = new FakePi()
      registerTestingEnhancer(pi)
      const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), `omp-testing-enhancer-write-${index}-`)))
      await event(pi, 'session_start')({}, ctx)
      const analyze = pi.tools.get('omp_test_analyze')
      const gate = pi.tools.get('omp_test_gate')
      if (!analyze || !gate) throw new Error('Missing testing tools')
      await analyze.execute(`analyze-write-${index}`, {
        changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
      }, undefined, undefined, ctx)
      await event(pi, 'tool_result')({
        name: 'bash', input: { command: 'npm test' }, exitCode: 0,
        content: [{ type: 'text', text: '42 tests passed, 0 failed' }]
      }, ctx)
      await event(pi, 'tool_result')({
        name: 'bash', input: { command }, exitCode: 0,
        content: [{ type: 'text', text: 'command completed' }]
      }, ctx)
      expect((await gate.execute(`gate-write-${index}`, {
        ...passingGateParams(), testCommand: 'npm test'
      }, undefined, undefined, ctx)).details, command).toMatchObject({
        results: expect.arrayContaining([
          expect.objectContaining({ gate: 'test-command', severity: 'warning', evidence: {} })
        ])
      })
    }

    const readOnly = new FakePi()
    registerTestingEnhancer(readOnly)
    const readOnlyCtx = toolContext(readOnly, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-read-only-')))
    await event(readOnly, 'session_start')({}, readOnlyCtx)
    const analyze = readOnly.tools.get('omp_test_analyze')
    const gate = readOnly.tools.get('omp_test_gate')
    if (!analyze || !gate) throw new Error('Missing testing tools')
    await analyze.execute('analyze-read-only', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, readOnlyCtx)
    await event(readOnly, 'tool_result')({
      name: 'bash', input: { command: 'npm test' }, exitCode: 0,
      content: [{ type: 'text', text: '42 tests passed, 0 failed' }]
    }, readOnlyCtx)
    await event(readOnly, 'tool_result')({
      name: 'bash', input: { command: 'git status' }, exitCode: 0,
      content: [{ type: 'text', text: 'working tree clean' }]
    }, readOnlyCtx)
    expect((await gate.execute('gate-read-only', {
      ...passingGateParams(), testCommand: 'npm test'
    }, undefined, undefined, readOnlyCtx)).details).toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'test-command', passed: true, evidence: expect.objectContaining({ exitCode: 0 }) })
      ])
    })
  })

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
    const repeatedStop = await event(pi, 'session_stop')({}, ctx)
    expect(repeatedStop).toMatchObject({
      continue: true,
      additionalContext: expect.stringContaining('OMP_TEST_GATE_TERMINAL')
    })
    expect(repeatedStop?.additionalContext).toContain('Do not call tools')

    expect(await event(pi, 'session_stop')({}, ctx)).toBeUndefined()

    await gate.execute('call', {
      targets: [{ id: 'src/user/UserService.ts#UserService', sourceFile: 'src/user/UserService.ts', symbolName: 'UserService', kind: 'service', risk: 'high' }],
      candidate: { id: 'candidate', targetId: 'src/user/UserService.ts#UserService', files: [{ path: 'src/user/UserService.test.ts', action: 'create', content: 'expect(result).toBe(true)' }] }
    }, undefined, undefined, ctx)

    expect(await event(pi, 'session_stop')({}, ctx)).toBeUndefined()
  })

  it('uses a shared repair budget across distinct standalone failures', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-session-')))

    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    const gate = pi.tools.get('omp_test_gate')
    if (!analyze || !gate) throw new Error('Missing testing tools')
    await analyze.execute('call', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, ctx)

    expect(await event(pi, 'session_stop')({}, ctx)).toMatchObject({ continue: true })
    await gate.execute('call', {
      targets: [{ id: 'src/user/UserService.ts#UserService', sourceFile: 'src/user/UserService.ts', symbolName: 'UserService', kind: 'service', risk: 'high' }],
      candidate: { id: 'candidate', targetId: 'src/user/UserService.ts#UserService', files: [{ path: 'src/user/UserService.test.ts', action: 'create', content: "import { helper } from '../internal/helper'" }] }
    }, undefined, undefined, ctx)
    expect(await event(pi, 'session_stop')({}, ctx)).toMatchObject({
      continue: true,
      additionalContext: expect.stringContaining('omp_test_gate failed')
    })

    await gate.execute('call', {
      targets: [{ id: 'src/user/UserService.ts#UserService', sourceFile: 'src/user/UserService.ts', symbolName: 'UserService', kind: 'service', risk: 'high' }],
      candidate: { id: 'candidate', targetId: 'src/user/UserService.ts#UserService', files: [{ path: 'src/user/UserService.ts', action: 'modify', content: 'export class UserService {}' }] }
    }, undefined, undefined, ctx)
    expect(await event(pi, 'session_stop')({}, ctx)).toMatchObject({
      continue: true,
      additionalContext: expect.stringContaining('OMP_TEST_GATE_TERMINAL')
    })
    expect(await event(pi, 'session_stop')({}, ctx)).toBeUndefined()
  })

  it('does not reset the standalone recovery budget when analyze creates a new run id', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-session-')))

    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    if (!analyze) throw new Error('Missing analyze')
    const analyzeParams = {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }

    await analyze.execute('call-1', analyzeParams, undefined, undefined, ctx)
    expect(await event(pi, 'session_stop')({}, ctx)).toMatchObject({
      continue: true,
      additionalContext: expect.stringContaining('omp_test_gate')
    })

    await analyze.execute('call-2', analyzeParams, undefined, undefined, ctx)
    expect(await event(pi, 'session_stop')({}, ctx)).toMatchObject({
      continue: true,
      additionalContext: expect.stringContaining('omp_test_gate')
    })

    await analyze.execute('call-3', analyzeParams, undefined, undefined, ctx)
    expect(await event(pi, 'session_stop')({}, ctx)).toMatchObject({
      continue: true,
      additionalContext: expect.stringContaining('OMP_TEST_GATE_TERMINAL')
    })
    expect(await event(pi, 'session_stop')({}, ctx)).toBeUndefined()
  })

  it('blocks every tool call after standalone recovery enters terminal-only state', async () => {
    const pi = new FakePi()
    pi.entries.push({
      type: 'custom',
      customType: TESTING_STATE_ENTRY,
      data: {
        schemaVersion: 2,
        pendingGate: true,
        routeId: 'testing:terminal',
        lastAnalyzeRunId: 'terminal-run',
        lastTargets: [],
        lastGateResults: [],
        evidenceRevision: 3,
        standaloneRecovery: {
          repairUsed: 2,
          repairMax: 2,
          terminalUsed: 1,
          terminalMax: 1,
          lastRepairFingerprint: 'repair',
          terminalFingerprint: 'terminal'
        }
      }
    })
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-session-')))

    await event(pi, 'session_start')({}, ctx)
    expect(await event(pi, 'tool_call')({ toolName: 'read', input: { path: 'src/index.ts' } }, ctx)).toMatchObject({
      block: true,
      reason: expect.stringContaining('OMP_TEST_GATE_TERMINAL')
    })
  })

  it('leaves terminal tool-call ownership to a live core owner', async () => {
    const pi = new FakePi()
    Object.defineProperty(pi, CORE_GATE_OWNER_SYMBOL, {
      value: { schemaVersion: 1, owner: 'omp-enhancer-core', controllerSchemaVersion: 2 }
    })
    pi.entries.push(coreRouteEntry('route:terminal:1'))
    pi.entries.push({
      type: 'custom',
      customType: TESTING_STATE_ENTRY,
      data: {
        schemaVersion: 2,
        pendingGate: true,
        routeId: 'route:terminal:1',
        lastAnalyzeRunId: 'terminal-run',
        lastTargets: [],
        lastGateResults: [],
        evidenceRevision: 3,
        standaloneRecovery: {
          repairUsed: 2,
          repairMax: 2,
          terminalUsed: 1,
          terminalMax: 1,
          lastRepairFingerprint: 'repair',
          terminalFingerprint: 'terminal'
        }
      }
    })
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-session-')))

    await event(pi, 'session_start')({}, ctx)
    expect(await event(pi, 'tool_call')({ toolName: 'read', input: { path: 'src/index.ts' } }, ctx)).toBeUndefined()
  })

  it('does not replay passed evidence when the core route changes after a testing tool was observed', async () => {
    const pi = new FakePi()
    Object.defineProperty(pi, CORE_GATE_OWNER_SYMBOL, {
      value: { schemaVersion: 1, owner: 'omp-enhancer-core', controllerSchemaVersion: 2 }
    })
    pi.entries.push(coreRouteEntry('route:old:1'))
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-session-')))

    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    const gate = pi.tools.get('omp_test_gate')
    if (!analyze || !gate) throw new Error('Missing testing tools')
    await analyze.execute('old-analyze', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, ctx)
    await gate.execute('old-gate', passingGateParams(), undefined, undefined, ctx)

    const oldEvidence = pi.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY).at(-1)?.data
    expect(oldEvidence).toMatchObject({ routeId: 'route:old:1', status: 'passed', passed: true })
    const evidenceCount = pi.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY).length

    pi.entries.push(coreRouteEntry('route:new:2'))
    expect(await event(pi, 'session_stop')({}, ctx)).toBeUndefined()
    expect(pi.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY)).toHaveLength(evidenceCount)
    expect(pi.entries.filter(entry => entry.customType === TESTING_STATE_ENTRY).at(-1)?.data).toMatchObject({
      routeId: 'route:new:2',
      pendingGate: false,
      lastTargets: [],
      lastGateResults: [],
      evidenceRevision: 0
    })

    await analyze.execute('new-analyze', {
      changedFiles: [{ path: 'src/order/OrderService.ts', content: 'export class OrderService {}' }]
    }, undefined, undefined, ctx)
    expect(pi.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY).at(-1)?.data).toMatchObject({
      routeId: 'route:new:2',
      status: 'pending',
      pending: true,
      passed: false
    })

    await gate.execute('new-gate', passingGateParams('src/order/OrderService.ts', 'OrderService'), undefined, undefined, ctx)
    expect(pi.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY).at(-1)?.data).toMatchObject({
      routeId: 'route:new:2',
      status: 'passed',
      passed: true
    })
  })

  it('delegates continuation ownership to a symbol-marked core while preserving evidence', async () => {
    const pi = new FakePi()
    Object.defineProperty(pi, CORE_GATE_OWNER_SYMBOL, {
      value: { schemaVersion: 1, owner: 'omp-enhancer-core', controllerSchemaVersion: 2 }
    })
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-session-')))

    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    if (!analyze) throw new Error('Missing analyze')
    await analyze.execute('call', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, ctx)

    expect(await event(pi, 'session_stop')({}, ctx)).toBeUndefined()
    expect(pi.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY).at(-1)?.data).toMatchObject({
      schemaVersion: 1,
      status: 'pending',
      pending: true
    })
  })

  it('does not surrender continuation ownership to a stale branch-only core marker', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-session-')))
    pi.entries.push({
      type: 'custom',
      customType: CORE_GATE_OWNER_ENTRY,
      data: { schemaVersion: 1, owner: 'omp-enhancer-core', controllerSchemaVersion: 2 }
    })

    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    if (!analyze) throw new Error('Missing analyze')
    await analyze.execute('call', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, ctx)

    expect(await event(pi, 'session_stop')({}, ctx)).toMatchObject({ continue: true })
  })

  it('isolates session state between independently registered plugin instances', async () => {
    const first = new FakePi()
    const second = new FakePi()
    registerTestingEnhancer(first)
    registerTestingEnhancer(second)
    const firstCtx = toolContext(first, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-session-')))
    const secondCtx = toolContext(second, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-session-')))

    await event(first, 'session_start')({}, firstCtx)
    await event(second, 'session_start')({}, secondCtx)
    const analyze = first.tools.get('omp_test_analyze')
    if (!analyze) throw new Error('Missing analyze')
    await analyze.execute('call', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, firstCtx)

    expect(await event(first, 'session_stop')({}, firstCtx)).toMatchObject({ continue: true })
    expect(await event(second, 'session_stop')({}, secondCtx)).toBeUndefined()
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

function coreRouteEntry(routeId: string): { type: 'custom'; customType: string; data: unknown } {
  return {
    type: 'custom',
    customType: CORE_STATE_ENTRY,
    data: { routeId, gateController: { routeId } }
  }
}

function passingGateParams(sourceFile = 'src/user/UserService.ts', symbolName = 'UserService') {
  const targetId = `${sourceFile}#${symbolName}`
  const testFile = sourceFile.replace(/\.ts$/, '.test.ts')
  return {
    targets: [{ id: targetId, sourceFile, symbolName, kind: 'service', risk: 'high' }],
    candidate: {
      id: 'candidate',
      targetId,
      files: [{ path: testFile, action: 'create', content: 'expect(result).toBe(true)' }]
    }
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
