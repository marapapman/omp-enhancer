import type { GateResult } from '../types.js'

export interface TestCommandResult {
  command: string
  exitCode: number
  stdout: string
  stderr: string
}

export function evaluateTestCommandGate(result: TestCommandResult | undefined): GateResult[] {
  if (!result) {
    return [{
      gate: 'test-command',
      passed: true,
      severity: 'warning',
      summary: 'No test command configured.',
      evidence: {}
    }]
  }

  if (result.exitCode === 0) {
    return [{
      gate: 'test-command',
      passed: true,
      severity: 'blocker',
      summary: 'Configured test command passed.',
      evidence: { command: result.command, exitCode: result.exitCode }
    }]
  }

  return [{
    gate: 'test-command',
    passed: false,
    severity: 'blocker',
    summary: 'Configured test command failed.',
    evidence: { command: result.command, exitCode: result.exitCode }
  }]
}
