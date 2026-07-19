import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  collectResultText,
  hasUnsafeShellControlSyntax,
  hostToolResultText,
  isDefiniteWorkspaceMutationHostEvent,
  isExplicitPositiveTestOutput,
  isExplicitStandaloneTestCommand,
  isNonExecutingTestProbe,
  observedTestCommandFromHostEvent,
  trustedHostCommand
} from '../../../src/host/observedTestEvidence.js'

describe('observed test evidence', () => {
  it('extracts commands only from trusted host executors', () => {
    const cases: Array<{ event: Record<string, unknown>; expected?: string }> = [
      { event: { name: 'bash', command: ' npm test ' }, expected: 'npm test' },
      { event: { toolName: 'functions.exec_command', input: { cmd: 'pytest' } }, expected: 'pytest' },
      { event: { name: 'shell', params: { command: 'go test ./...' } }, expected: 'go test ./...' },
      { event: { name: 'run', details: { input: { command: 'cargo test' } } }, expected: 'cargo test' },
      { event: { name: 'echo', command: 'npm test' } },
      { event: { toolName: 'provider.exec_command', input: { command: 'npm test' } } }
    ]

    for (const { event, expected } of cases) {
      expect(trustedHostCommand(event)).toBe(expected)
    }
  })

  it('recognizes standalone test commands without accepting lookalikes', () => {
    const cases = [
      ['npm test', true],
      ['npm run check:test', true],
      ['npx jest --runInBand', true],
      ['python -m pytest', true],
      ['go test ./...', true],
      ['./gradlew test', true],
      ['echo npm test', false],
      ['./contest', false],
      ['./attest', false],
      ['npm run lint', false]
    ] as const

    for (const [command, expected] of cases) {
      expect(isExplicitStandaloneTestCommand(command), command).toBe(expected)
    }
  })

  it('keeps shell control syntax out while allowing quoted test filters', () => {
    const cases = [
      ['npm test', false],
      ["npm test -- -t 'a|b'", false],
      ['npm test | tee test.log', true],
      ['npm test && echo done', true],
      ['npm test\nprintf done', true],
      ['npm test "$(touch marker)"', true],
      ['npm test \\', true],
      ["npm test 'unterminated", true]
    ] as const

    for (const [command, expected] of cases) {
      expect(hasUnsafeShellControlSyntax(command), command).toBe(expected)
    }
  })

  it('distinguishes executed suites from probes, empty suites, and failures', () => {
    const cases = [
      ['npm test', '12 tests passed, 0 failed', true],
      ['go test ./...', '? example/cmd [no test files]\nok example/pkg 0.12s', true],
      ['./gradlew test', '> Task :app:test\nBUILD SUCCESSFUL in 2s', true],
      ['npm test', '0 tests passed, 0 failed', false],
      ['go test ./...', 'ok example/pkg [no test files]', false],
      ['python -m unittest', 'Ran 3 tests in 0.01s\n\nOK (skipped=3)', false],
      ['npm test', '11 tests passed, 1 failed', false],
      ['npm test', '', false]
    ] as const

    for (const [command, output, expected] of cases) {
      expect(isExplicitPositiveTestOutput(output, command), `${command}: ${output}`).toBe(expected)
    }

    for (const command of ['npm test -- --help', 'pytest --collect-only', 'npm test -- --passWithNoTests']) {
      expect(isNonExecutingTestProbe(command), command).toBe(true)
    }
  })

  it('builds task-context-scoped evidence from nested host results', () => {
    const startedAt = Date.now()
    const evidence = observedTestCommandFromHostEvent({
      name: 'functions.exec_command',
      input: { command: 'npm test' },
      isError: false,
      result: { content: [{ type: 'text', text: '12 tests passed, 0 failed' }] }
    }, 'task:42')

    expect(evidence).toEqual({
      schemaVersion: 2,
      taskContextIdentity: 'task:42',
      commandDigest: createHash('sha256').update('npm test').digest('hex'),
      exitCode: 0,
      observedAt: expect.any(Number)
    })
    expect(evidence?.observedAt).toBeGreaterThanOrEqual(startedAt)

    expect(observedTestCommandFromHostEvent({
      name: 'bash',
      command: 'npm test',
      details: { result: { exitCode: 1, stdout: '12 tests passed, 0 failed' } }
    }, 'task:42')).toBeUndefined()
  })

  it('classifies definite mutations independently from read-only and test commands', () => {
    const cases: Array<{ event: Record<string, unknown>; expected: boolean }> = [
      { event: { name: 'functions.apply_patch' }, expected: true },
      { event: { name: 'bash', input: { command: 'npm test' } }, expected: false },
      { event: { name: 'bash', input: { command: 'npm test -u' } }, expected: true },
      { event: { name: 'bash', input: { command: 'git status' } }, expected: false },
      { event: { name: 'bash', input: { command: 'npm run typecheck' } }, expected: false },
      { event: { name: 'bash', input: { command: 'node scripts/generate.js' } }, expected: true },
      { event: { name: 'untrusted', input: { command: 'node scripts/generate.js' } }, expected: false }
    ]

    for (const { event, expected } of cases) {
      expect(isDefiniteWorkspaceMutationHostEvent(event), JSON.stringify(event)).toBe(expected)
    }
  })

  it('collects nested text safely when result objects contain cycles', () => {
    const cyclic: Record<string, unknown> = { text: 'nested pass' }
    cyclic.content = cyclic

    expect(collectResultText(cyclic)).toEqual(['nested pass'])
    expect(hostToolResultText({
      stdout: 'runner output',
      details: { result: { content: [{ type: 'text', text: '12 tests passed, 0 failed' }] } }
    })).toContain('12 tests passed, 0 failed')
  })
})
