import { describe, expect, it } from 'vitest'
import { evaluateTestCommandGate } from '../../../src/gates/testCommandGate.js'

describe('evaluateTestCommandGate', () => {
  it('warns when no test command is configured', () => {
    expect(evaluateTestCommandGate(undefined)).toEqual([{
      gate: 'test-command',
      passed: true,
      severity: 'warning',
      summary: 'No matching host-observed test command evidence.',
      evidence: {}
    }])
  })

  it('reports critical missing test command evidence when configured as critical', () => {
    expect(evaluateTestCommandGate(undefined, { severity: 'critical' })).toEqual([{
      gate: 'test-command',
      passed: false,
      severity: 'critical',
      summary: 'No matching host-observed test command evidence.',
      evidence: {}
    }])
  })

  it('reports a distinct finding when the observed command digest does not match the expected command', () => {
    expect(evaluateTestCommandGate({
      status: 'mismatched',
      expectedCommandDigest: 'a'.repeat(64),
      observedCommandDigest: 'b'.repeat(64)
    })).toEqual([{
      gate: 'test-command',
      passed: false,
      severity: 'critical',
      summary: 'Observed test command did not match the configured command.',
      evidence: {
        expectedCommandDigest: 'a'.repeat(64),
        observedCommandDigest: 'b'.repeat(64)
      },
      repairHint: 'Run the configured test command so the host-observed evidence matches the expected command.'
    }])
  })

  it('passes successful command results', () => {
    expect(evaluateTestCommandGate({ status: 'observed', command: 'bunx vitest run', exitCode: 0, stdout: 'ok', stderr: '' })).toEqual([{
      gate: 'test-command',
      passed: true,
      severity: 'critical',
      summary: 'Matching host-observed test command passed.',
      evidence: { command: 'bunx vitest run', exitCode: 0 }
    }])
  })

  it('reports failed command results as critical findings', () => {
    expect(evaluateTestCommandGate({ status: 'observed', command: 'bunx vitest run', exitCode: 1, stdout: '', stderr: 'fail' })).toEqual([{
      gate: 'test-command',
      passed: false,
      severity: 'critical',
      summary: 'Host-observed test evidence did not satisfy the expected command and exit-status contract.',
      evidence: { command: 'bunx vitest run', exitCode: 1 }
    }])
  })

  it('downgrades failed command results when configured as warning', () => {
    expect(evaluateTestCommandGate({ status: 'observed', command: 'bunx vitest run', exitCode: 1, stdout: '', stderr: 'fail' }, { severity: 'warning' })).toEqual([{
      gate: 'test-command',
      passed: false,
      severity: 'warning',
      summary: 'Host-observed test evidence did not satisfy the expected command and exit-status contract.',
      evidence: { command: 'bunx vitest run', exitCode: 1 }
    }])
  })

  it('reports timeout-style negative exit codes as critical findings', () => {
    expect(evaluateTestCommandGate({ status: 'observed', command: 'npm test', exitCode: -1, stdout: '', stderr: 'timed out' })).toEqual([{
      gate: 'test-command',
      passed: false,
      severity: 'critical',
      summary: 'Host-observed test evidence did not satisfy the expected command and exit-status contract.',
      evidence: { command: 'npm test', exitCode: -1 }
    }])
  })
})
