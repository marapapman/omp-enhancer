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
