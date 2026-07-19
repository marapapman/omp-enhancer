import type { GateResult } from '../types.js'

export interface TestCommandResult {
  command: string
  exitCode: number
  stdout: string
  stderr: string
}

export interface EvaluateTestCommandGateOptions {
  severity?: GateResult['severity']
}

export function evaluateTestCommandGate(result: TestCommandResult | undefined, options: EvaluateTestCommandGateOptions = {}): GateResult[] {
  const severity = options.severity ?? (result ? 'critical' : 'warning')

  if (!result) {
    return [{
      gate: 'test-command',
      passed: severity === 'warning',
      severity,
      summary: 'No matching host-observed test command evidence.',
      evidence: {}
    }]
  }

  if (result.exitCode === 0) {
    return [{
      gate: 'test-command',
      passed: true,
      severity,
      summary: 'Matching host-observed test command passed.',
      evidence: { command: result.command, exitCode: result.exitCode }
    }]
  }

  return [{
    gate: 'test-command',
    passed: false,
    severity,
    summary: 'Host-observed test evidence did not satisfy the expected command and exit-status contract.',
    evidence: { command: result.command, exitCode: result.exitCode }
  }]
}
