import { describe, expect, it } from 'vitest'
import { evaluateTestCommandGate } from '../../../src/gates/testCommandGate.js'

describe('evaluateTestCommandGate', () => {
  it('warns when no test command is configured', () => {
    expect(evaluateTestCommandGate(undefined)).toEqual([{
      gate: 'test-command',
      passed: true,
      severity: 'warning',
      summary: 'No test command configured.',
      evidence: {}
    }])
  })

  it('blocks missing test command when configured as blocker', () => {
    expect(evaluateTestCommandGate(undefined, { severity: 'blocker' })).toEqual([{
      gate: 'test-command',
      passed: false,
      severity: 'blocker',
      summary: 'No test command configured.',
      evidence: {}
    }])
  })

  it('passes successful command results', () => {
    expect(evaluateTestCommandGate({ command: 'bunx vitest run', exitCode: 0, stdout: 'ok', stderr: '' })).toEqual([{
      gate: 'test-command',
      passed: true,
      severity: 'blocker',
      summary: 'Configured test command passed.',
      evidence: { command: 'bunx vitest run', exitCode: 0 }
    }])
  })

  it('blocks failed command results', () => {
    expect(evaluateTestCommandGate({ command: 'bunx vitest run', exitCode: 1, stdout: '', stderr: 'fail' })).toEqual([{
      gate: 'test-command',
      passed: false,
      severity: 'blocker',
      summary: 'Configured test command failed.',
      evidence: { command: 'bunx vitest run', exitCode: 1 }
    }])
  })

  it('downgrades failed command results when configured as warning', () => {
    expect(evaluateTestCommandGate({ command: 'bunx vitest run', exitCode: 1, stdout: '', stderr: 'fail' }, { severity: 'warning' })).toEqual([{
      gate: 'test-command',
      passed: false,
      severity: 'warning',
      summary: 'Configured test command failed.',
      evidence: { command: 'bunx vitest run', exitCode: 1 }
    }])
  })

  it('warns when the command is skipped behind static blockers', () => {
    expect(evaluateTestCommandGate(undefined, { severity: 'blocker', skippedDueToStaticBlocker: true })).toEqual([{
      gate: 'test-command',
      passed: true,
      severity: 'warning',
      summary: 'Test command skipped because static blocker gates failed.',
      evidence: {}
    }])
  })

  it('reports skipped static blockers before considering a failed command result', () => {
    expect(evaluateTestCommandGate({ command: 'npm test', exitCode: 1, stdout: '', stderr: 'fail' }, {
      severity: 'blocker',
      skippedDueToStaticBlocker: true
    })).toEqual([{
      gate: 'test-command',
      passed: true,
      severity: 'warning',
      summary: 'Test command skipped because static blocker gates failed.',
      evidence: {}
    }])
  })

  it('blocks timeout-style negative exit codes', () => {
    expect(evaluateTestCommandGate({ command: 'npm test', exitCode: -1, stdout: '', stderr: 'timed out' })).toEqual([{
      gate: 'test-command',
      passed: false,
      severity: 'blocker',
      summary: 'Configured test command failed.',
      evidence: { command: 'npm test', exitCode: -1 }
    }])
  })
})
