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

  it('passes successful command results', () => {
    expect(evaluateTestCommandGate({ command: 'bunx vitest run', exitCode: 0, stdout: 'ok', stderr: '' })).toEqual([{
      gate: 'test-command',
      passed: true,
      severity: 'critical',
      summary: 'Matching host-observed test command passed.',
      evidence: { command: 'bunx vitest run', exitCode: 0 }
    }])
  })

  it('reports failed command results as critical findings', () => {
    expect(evaluateTestCommandGate({ command: 'bunx vitest run', exitCode: 1, stdout: '', stderr: 'fail' })).toEqual([{
      gate: 'test-command',
      passed: false,
      severity: 'critical',
      summary: 'Host-observed test evidence did not satisfy the expected command and exit-status contract.',
      evidence: { command: 'bunx vitest run', exitCode: 1 }
    }])
  })

  it('downgrades failed command results when configured as warning', () => {
    expect(evaluateTestCommandGate({ command: 'bunx vitest run', exitCode: 1, stdout: '', stderr: 'fail' }, { severity: 'warning' })).toEqual([{
      gate: 'test-command',
      passed: false,
      severity: 'warning',
      summary: 'Host-observed test evidence did not satisfy the expected command and exit-status contract.',
      evidence: { command: 'bunx vitest run', exitCode: 1 }
    }])
  })

  it('reports when command evidence is not evaluated after static findings', () => {
    expect(evaluateTestCommandGate(undefined, { severity: 'critical', notEvaluatedDueToStaticFindings: true })).toEqual([{
      gate: 'test-command',
      passed: true,
      severity: 'warning',
      summary: 'Host-observed test evidence was not evaluated because static critical findings remain.',
      evidence: {}
    }])
  })

  it('reports static findings before considering a failed command result', () => {
    expect(evaluateTestCommandGate({ command: 'npm test', exitCode: 1, stdout: '', stderr: 'fail' }, {
      severity: 'critical',
      notEvaluatedDueToStaticFindings: true
    })).toEqual([{
      gate: 'test-command',
      passed: true,
      severity: 'warning',
      summary: 'Host-observed test evidence was not evaluated because static critical findings remain.',
      evidence: {}
    }])
  })

  it('reports timeout-style negative exit codes as critical findings', () => {
    expect(evaluateTestCommandGate({ command: 'npm test', exitCode: -1, stdout: '', stderr: 'timed out' })).toEqual([{
      gate: 'test-command',
      passed: false,
      severity: 'critical',
      summary: 'Host-observed test evidence did not satisfy the expected command and exit-status contract.',
      evidence: { command: 'npm test', exitCode: -1 }
    }])
  })
})
