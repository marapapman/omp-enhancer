import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { registerTestingEnhancer } from '../../src/extension.js'
import { CORE_STATE_ENTRY } from '../../src/session/taskContextIdentity.js'
import { TESTING_EVIDENCE_ENTRY, TESTING_STATE_ENTRY } from '../../src/session/testingState.js'
import type { ExtensionAPI, ExtensionEventHandler, ExtensionToolContext, ToolDefinition } from '../../src/ompApi.js'

class FakePi implements ExtensionAPI {
  readonly labels: string[] = []
  readonly tools = new Map<string, ToolDefinition>()
  readonly eventHandlers: Array<{ event: string; handler: ExtensionEventHandler }> = []
  readonly entries: Array<{ type: string; customType: string; data: unknown }> = []
  readonly zod = { z: fakeZod() }

  setLabel(label: string): void { this.labels.push(label) }
  registerTool(tool: ToolDefinition): void { this.tools.set(tool.name, tool) }
  on(event: string, handler: ExtensionEventHandler): void { this.eventHandlers.push({ event, handler }) }
  appendEntry(customType: string, data: unknown): void { this.entries.push({ type: 'custom', customType, data }) }
}

describe('extension session state', () => {
  it('ignores caller browserEvidence and persists only output observed from omp_test_browser_check', async () => {
    const pi = new FakePi()
    pi.entries.push(coreTaskContextEntry(91))
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-observed-browser-')))
    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    const browserCheck = pi.tools.get('omp_test_browser_check')
    const gate = pi.tools.get('omp_test_review')
    if (!analyze || !browserCheck || !gate) throw new Error('Missing testing tools')
    await analyze.execute('analyze-browser', {
      changedFiles: [{ path: 'src/ui/LoginForm.tsx', content: 'export function LoginForm() { return <button>Sign in</button> }' }]
    }, undefined, undefined, ctx)

    const callerEvidence = {
      framework: 'playwright',
      status: 'passed',
      runId: 'caller-spoof',
      targetIds: ['src/ui/LoginForm.tsx#LoginForm'],
      scenarioCount: 1,
      stepCount: 1,
      captureCount: 1,
      visualAssertionCount: 1,
      findings: []
    }
    const spoofed = await gate.execute('gate-spoofed-browser', {
      ...frontendGateParams(),
      browserEvidence: callerEvidence
    }, undefined, undefined, ctx)
    expect(spoofed.details).toMatchObject({
      passed: false,
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'browser-interaction', summary: 'Browser evidence is required for frontend targets.' })
      ])
    })

    const observed = await browserCheck.execute('browser-observed', {
      baseUrl: 'http://127.0.0.1:3000',
      artifactDir: '../escape',
      targetIds: ['src/ui/LoginForm.tsx#LoginForm'],
      scenarios: [{ name: 'login', steps: [{ action: 'goto', url: '/', description: 'Open login' }] }]
    }, undefined, undefined, ctx)
    expect(observed.details).toMatchObject({
      status: 'failed',
      scenarioCount: 0,
      stepCount: 0,
      captureCount: 0,
      visualAssertionCount: 0
    })
    expect(pi.entries.filter(entry => entry.customType === TESTING_STATE_ENTRY).at(-1)?.data).toMatchObject({
      lastObservedBrowserEvidence: {
        taskContextIdentity: 'task:91',
        evidence: expect.objectContaining({ status: 'failed' })
      }
    })

    const reviewed = await gate.execute('gate-observed-browser', {
      ...frontendGateParams(),
      browserEvidence: callerEvidence
    }, undefined, undefined, ctx)
    expect(reviewed.details).toMatchObject({
      passed: false,
      results: expect.arrayContaining([
        expect.objectContaining({
          gate: 'browser-interaction',
          summary: 'Browser artifact directory escapes the trusted artifact root or crosses a symbolic link.'
        })
      ])
    })
  })

  it('invalidates observed browser evidence after workspace mutation and task context identity changes', async () => {
    const pi = new FakePi()
    pi.entries.push(coreTaskContextEntry(92))
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-browser-invalidation-')))
    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    const browserCheck = pi.tools.get('omp_test_browser_check')
    const gate = pi.tools.get('omp_test_review')
    if (!analyze || !browserCheck || !gate) throw new Error('Missing testing tools')
    await analyze.execute('analyze-browser', {
      changedFiles: [{ path: 'src/ui/LoginForm.tsx', content: 'export function LoginForm() { return <button>Sign in</button> }' }]
    }, undefined, undefined, ctx)
    const browserParams = {
      baseUrl: 'http://127.0.0.1:3000',
      artifactDir: '../escape',
      targetIds: ['src/ui/LoginForm.tsx#LoginForm'],
      scenarios: [{ name: 'login', steps: [{ action: 'goto', url: '/', description: 'Open login' }] }]
    }
    await browserCheck.execute('browser-before-mutation', browserParams, undefined, undefined, ctx)

    await event(pi, 'tool_result')({
      name: 'edit',
      input: { path: 'src/ui/LoginForm.tsx' },
      isError: false,
      content: [{ type: 'text', text: 'updated file' }]
    }, ctx)
    expect(pi.entries.filter(entry => entry.customType === TESTING_STATE_ENTRY).at(-1)?.data).not.toHaveProperty('lastObservedBrowserEvidence')
    expect((await gate.execute('gate-after-browser-mutation', frontendGateParams(), undefined, undefined, ctx)).details).toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'browser-interaction', summary: 'Browser evidence is required for frontend targets.' })
      ])
    })

    await browserCheck.execute('browser-before-task-context-change', browserParams, undefined, undefined, ctx)
    pi.entries.push(coreTaskContextEntry(93))
    expect((await gate.execute('review-after-browser-task-context-change', frontendGateParams(), undefined, undefined, ctx)).details).toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'browser-interaction', summary: 'Browser evidence is required for frontend targets.' })
      ])
    })
  })

  it('clears observed browser evidence on session_stop without continuing the session', async () => {
    const pi = new FakePi()
    pi.entries.push(coreTaskContextEntry(94))
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-browser-session-stop-')))
    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    const browserCheck = pi.tools.get('omp_test_browser_check')
    const gate = pi.tools.get('omp_test_review')
    if (!analyze || !browserCheck || !gate) throw new Error('Missing testing tools')
    await analyze.execute('analyze-browser', {
      changedFiles: [{ path: 'src/ui/LoginForm.tsx', content: 'export function LoginForm() { return <button>Sign in</button> }' }]
    }, undefined, undefined, ctx)
    await browserCheck.execute('browser-before-stop', {
      baseUrl: 'http://127.0.0.1:3000',
      artifactDir: '../escape',
      targetIds: ['src/ui/LoginForm.tsx#LoginForm'],
      scenarios: [{ name: 'login', steps: [{ action: 'goto', url: '/', description: 'Open login' }] }]
    }, undefined, undefined, ctx)

    await expect(event(pi, 'session_stop')({}, ctx)).resolves.toBeUndefined()
    expect(pi.entries.filter(entry => entry.customType === TESTING_STATE_ENTRY).at(-1)?.data).not.toHaveProperty('lastObservedBrowserEvidence')
    expect((await gate.execute('gate-after-session-stop', frontendGateParams(), undefined, undefined, ctx)).details).toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'browser-interaction', summary: 'Browser evidence is required for frontend targets.' })
      ])
    })
  })

  it('binds omp_test_review to a task-context-scoped host-observed shell test result', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-observed-test-')))
    pi.entries.push(coreTaskContextEntry(101))
    await event(pi, 'session_start')({}, ctx)
    await event(pi, 'tool_result')({
      name: 'functions.exec_command',
      input: { command: 'npm test' },
      exitCode: 0,
      isError: false,
      content: [{ type: 'text', text: '42 tests passed, 0 failed' }]
    }, ctx)

    const gate = pi.tools.get('omp_test_review')
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

    pi.entries.push(coreTaskContextEntry(102))
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
      pi.entries.push(coreTaskContextEntry(1000 + cases.indexOf(item)))
      await event(pi, 'session_start')({}, ctx)
      await event(pi, 'tool_result')({
        name: item.toolName,
        input: { command: item.command },
        exitCode: item.exitCode,
        isError: item.exitCode !== 0,
        content: [{ type: 'text', text: item.output }]
      }, ctx)

      const gate = pi.tools.get('omp_test_review')
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
      pi.entries.push(coreTaskContextEntry(2000 + index))
      await event(pi, 'session_start')({}, ctx)
      await event(pi, 'tool_result')({
        name: 'bash', input: { command }, exitCode: 0,
        content: [{ type: 'text', text: output }]
      }, ctx)
      const gate = pi.tools.get('omp_test_review')
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

  it('invalidates observed test evidence after a later definite workspace mutation', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-mutation-invalidation-')))
    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    const gate = pi.tools.get('omp_test_review')
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
    const gate = pi.tools.get('omp_test_review')
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

  it('invalidates stale observations for opaque and compound writes but preserves read-only commands', async () => {
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
      const gate = pi.tools.get('omp_test_review')
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
    const gate = readOnly.tools.get('omp_test_review')
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

  it('records collecting advisory evidence after analysis', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-session-')))

    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    if (!analyze) throw new Error('Missing analyze')
    await analyze.execute('call', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, ctx)

    expect(pi.eventHandlers.map(item => item.event)).toEqual(['session_start', 'tool_result', 'session_stop'])
    expect(pi.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY).at(-1)?.data).toMatchObject({
      reviewStatus: 'collecting',
      advisory: true
    })
  })

  it('reports critical findings and later ready advisory evidence', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-session-')))

    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    if (!analyze) throw new Error('Missing analyze')
    await analyze.execute('call', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, ctx)

    const gate = pi.tools.get('omp_test_review')
    if (!gate) throw new Error('Missing gate')
    const findings = await gate.execute('call', {
      targets: [{ id: 'src/user/UserService.ts#UserService', sourceFile: 'src/user/UserService.ts', symbolName: 'UserService', kind: 'service', risk: 'high' }],
      candidate: { id: 'candidate', targetId: 'src/user/UserService.ts#UserService', files: [{ path: 'src/user/UserService.test.ts', action: 'create', content: "import { helper } from '../internal/helper'\nexpect(helper()).toBe(true)" }] }
    }, undefined, undefined, ctx)

    expect(findings.details).toMatchObject({
      passed: false,
      status: 'findings',
      advisory: true
    })

    const ready = await gate.execute('call', {
      targets: [{ id: 'src/user/UserService.ts#UserService', sourceFile: 'src/user/UserService.ts', symbolName: 'UserService', kind: 'service', risk: 'high' }],
      candidate: { id: 'candidate', targetId: 'src/user/UserService.ts#UserService', files: [{ path: 'src/user/UserService.test.ts', action: 'create', content: 'expect(result).toBe(true)' }] }
    }, undefined, undefined, ctx)

    expect(ready.details).toMatchObject({
      passed: true,
      status: 'ready',
      advisory: true
    })
  })

  it('rebuilds reports from review state without persisting report markdown or duplicate evidence', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-report-state-')))

    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    const gate = pi.tools.get('omp_test_review')
    const report = pi.tools.get('omp_test_report')
    if (!analyze || !gate || !report) throw new Error('Missing testing tools')
    await analyze.execute('analyze', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, ctx)
    await gate.execute('gate', passingGateParams(), undefined, undefined, ctx)

    const stateCount = pi.entries.filter(entry => entry.customType === TESTING_STATE_ENTRY).length
    const evidenceCount = pi.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY).length
    const result = await report.execute('report', {}, undefined, undefined, ctx)
    await event(pi, 'tool_result')({ name: 'omp_test_report', details: result.details }, ctx)

    expect(result.content[0]?.text).toContain('# OMP Testing Enhancer report')
    expect(pi.entries.filter(entry => entry.customType === TESTING_STATE_ENTRY)).toHaveLength(stateCount)
    expect(pi.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY)).toHaveLength(evidenceCount)
  })

  it('reports distinct advisory findings without creating a repair budget', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-session-')))

    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    const gate = pi.tools.get('omp_test_review')
    if (!analyze || !gate) throw new Error('Missing testing tools')
    await analyze.execute('call', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, ctx)

    const internalImport = await gate.execute('call', {
      targets: [{ id: 'src/user/UserService.ts#UserService', sourceFile: 'src/user/UserService.ts', symbolName: 'UserService', kind: 'service', risk: 'high' }],
      candidate: { id: 'candidate', targetId: 'src/user/UserService.ts#UserService', files: [{ path: 'src/user/UserService.test.ts', action: 'create', content: "import { helper } from '../internal/helper'" }] }
    }, undefined, undefined, ctx)
    expect(internalImport.details).toMatchObject({ status: 'findings', advisory: true })

    const productionEdit = await gate.execute('call', {
      targets: [{ id: 'src/user/UserService.ts#UserService', sourceFile: 'src/user/UserService.ts', symbolName: 'UserService', kind: 'service', risk: 'high' }],
      candidate: { id: 'candidate', targetId: 'src/user/UserService.ts#UserService', files: [{ path: 'src/user/UserService.ts', action: 'modify', content: 'export class UserService {}' }] }
    }, undefined, undefined, ctx)
    expect(productionEdit.details).toMatchObject({ status: 'findings', advisory: true })
  })

  it('resets local diagnostic scope across repeated analyze calls without scheduling retries', async () => {
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
    const first = pi.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY).at(-1)?.data
    await analyze.execute('call-2', analyzeParams, undefined, undefined, ctx)
    const second = pi.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY).at(-1)?.data
    await analyze.execute('call-3', analyzeParams, undefined, undefined, ctx)
    const third = pi.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY).at(-1)?.data
    expect(pi.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY).at(-1)?.data).toMatchObject({
      reviewStatus: 'collecting',
      advisory: true,
      evidenceRevision: 1
    })
    expect(new Set([first, second, third].map(value => isRecordValue(value) ? value.taskContextIdentity : undefined)).size).toBe(3)
  })

  it('does not carry test or browser observations into a new analysis without a Core task context', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-local-analysis-scope-')))
    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    const browserCheck = pi.tools.get('omp_test_browser_check')
    const gate = pi.tools.get('omp_test_review')
    if (!analyze || !browserCheck || !gate) throw new Error('Missing testing tools')
    const analyzeParams = {
      changedFiles: [{ path: 'src/ui/LoginForm.tsx', content: 'export function LoginForm() { return <button>Sign in</button> }' }]
    }
    await analyze.execute('first-analysis', analyzeParams, undefined, undefined, ctx)
    await event(pi, 'tool_result')({
      name: 'bash',
      input: { command: 'npm test' },
      exitCode: 0,
      content: [{ type: 'text', text: '42 tests passed, 0 failed' }]
    }, ctx)
    await browserCheck.execute('first-browser', {
      baseUrl: 'http://127.0.0.1:3000',
      artifactDir: '../escape',
      targetIds: ['src/ui/LoginForm.tsx#LoginForm'],
      scenarios: [{ name: 'login', steps: [{ action: 'goto', url: '/', description: 'Open login' }] }]
    }, undefined, undefined, ctx)
    const before = pi.entries.filter(entry => entry.customType === TESTING_STATE_ENTRY).at(-1)?.data
    expect(before).toMatchObject({
      lastObservedTestCommand: expect.any(Object),
      lastObservedBrowserEvidence: expect.any(Object)
    })

    await analyze.execute('second-analysis', analyzeParams, undefined, undefined, ctx)
    const after = pi.entries.filter(entry => entry.customType === TESTING_STATE_ENTRY).at(-1)?.data
    expect(after).not.toHaveProperty('lastObservedTestCommand')
    expect(after).not.toHaveProperty('lastObservedBrowserEvidence')
    expect(after).toMatchObject({ evidenceRevision: 1, reviewStatus: 'collecting' })

    expect((await gate.execute('new-analysis-gate', {
      ...frontendGateParams(),
      testCommand: 'npm test'
    }, undefined, undefined, ctx)).details).toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ gate: 'browser-interaction', summary: 'Browser evidence is required for frontend targets.' }),
        expect.objectContaining({ gate: 'test-command', evidence: {} })
      ])
    })
  })

  it('resets local diagnostic scope even when the next analysis has no targets', async () => {
    const pi = new FakePi()
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-empty-analysis-scope-')))
    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    const browserCheck = pi.tools.get('omp_test_browser_check')
    if (!analyze || !browserCheck) throw new Error('Missing testing tools')

    await analyze.execute('first-analysis', {
      changedFiles: [{ path: 'src/ui/LoginForm.tsx', content: 'export function LoginForm() { return <button>Sign in</button> }' }]
    }, undefined, undefined, ctx)
    await event(pi, 'tool_result')({
      name: 'bash',
      input: { command: 'npm test' },
      exitCode: 0,
      content: [{ type: 'text', text: '42 tests passed, 0 failed' }]
    }, ctx)
    await browserCheck.execute('first-browser', {
      baseUrl: 'http://127.0.0.1:3000',
      artifactDir: '../escape',
      targetIds: ['src/ui/LoginForm.tsx#LoginForm'],
      scenarios: [{ name: 'login', steps: [{ action: 'goto', url: '/', description: 'Open login' }] }]
    }, undefined, undefined, ctx)
    const before = pi.entries.filter(entry => entry.customType === TESTING_STATE_ENTRY).at(-1)?.data
    expect(before).toMatchObject({
      lastObservedTestCommand: expect.any(Object),
      lastObservedBrowserEvidence: expect.any(Object)
    })

    const emptyAnalysis = await analyze.execute('empty-analysis', { changedFiles: [] }, undefined, undefined, ctx)
    const after = pi.entries.filter(entry => entry.customType === TESTING_STATE_ENTRY).at(-1)?.data
    expect(after).not.toHaveProperty('lastObservedTestCommand')
    expect(after).not.toHaveProperty('lastObservedBrowserEvidence')
    expect(after).toMatchObject({
      taskContextIdentity: `testing:${(emptyAnalysis.details as { runId: string }).runId}`,
      reviewStatus: 'idle',
      evidenceRevision: 0
    })
  })

  it('does not replay passed evidence when the core task context changes after a testing tool was observed', async () => {
    const pi = new FakePi()
    pi.entries.push(coreTaskContextEntry(3001))
    registerTestingEnhancer(pi)
    const ctx = toolContext(pi, await mkdtemp(join(tmpdir(), 'omp-testing-enhancer-session-')))

    await event(pi, 'session_start')({}, ctx)
    const analyze = pi.tools.get('omp_test_analyze')
    const gate = pi.tools.get('omp_test_review')
    if (!analyze || !gate) throw new Error('Missing testing tools')
    await analyze.execute('old-analyze', {
      changedFiles: [{ path: 'src/user/UserService.ts', content: 'export class UserService {}' }]
    }, undefined, undefined, ctx)
    await gate.execute('old-gate', passingGateParams(), undefined, undefined, ctx)

    const oldEvidence = pi.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY).at(-1)?.data
    expect(oldEvidence).toMatchObject({ taskContextIdentity: 'task:3001', reviewStatus: 'ready' })
    const evidenceCount = pi.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY).length

    pi.entries.push(coreTaskContextEntry(3002))
    expect(pi.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY)).toHaveLength(evidenceCount)

    await analyze.execute('new-analyze', {
      changedFiles: [{ path: 'src/order/OrderService.ts', content: 'export class OrderService {}' }]
    }, undefined, undefined, ctx)
    expect(pi.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY).at(-1)?.data).toMatchObject({
      taskContextIdentity: 'task:3002',
      reviewStatus: 'collecting',
      advisory: true
    })

    await gate.execute('new-gate', passingGateParams('src/order/OrderService.ts', 'OrderService'), undefined, undefined, ctx)
    expect(pi.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY).at(-1)?.data).toMatchObject({
      taskContextIdentity: 'task:3002',
      reviewStatus: 'ready'
    })
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

    expect(first.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY)).toHaveLength(1)
    expect(second.entries.filter(entry => entry.customType === TESTING_EVIDENCE_ENTRY)).toHaveLength(0)
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

function coreTaskContextEntry(taskStartedAt: number): { type: 'custom'; customType: string; data: unknown } {
  return {
    type: 'custom',
    customType: CORE_STATE_ENTRY,
    data: {
      schemaVersion: 2,
      taskStartedAt,
      lastTaskContext: { intent: 'agent-selected' }
    }
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

function frontendGateParams() {
  return {
    targets: [{
      id: 'src/ui/LoginForm.tsx#LoginForm',
      sourceFile: 'src/ui/LoginForm.tsx',
      symbolName: 'LoginForm',
      kind: 'react-component',
      risk: 'medium'
    }],
    candidate: {
      id: 'browser-candidate',
      targetId: 'src/ui/LoginForm.tsx#LoginForm',
      files: [{ path: 'src/ui/LoginForm.test.tsx', action: 'create', content: 'test()' }]
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

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
