export function evaluateTestCommandGate(result, options = {}) {
    const severity = options.severity ?? (result ? 'critical' : 'warning');
    if (!result) {
        return [{
                gate: 'test-command',
                passed: severity === 'warning',
                severity,
                summary: 'No matching host-observed test command evidence.',
                evidence: {}
            }];
    }
    if (result.status === 'mismatched') {
        return [{
                gate: 'test-command',
                passed: false,
                severity,
                summary: 'Observed test command did not match the configured command.',
                evidence: {
                    expectedCommandDigest: result.expectedCommandDigest,
                    observedCommandDigest: result.observedCommandDigest
                },
                repairHint: 'Run the configured test command so the host-observed evidence matches the expected command.'
            }];
    }
    if (result.exitCode === 0) {
        return [{
                gate: 'test-command',
                passed: true,
                severity,
                summary: 'Matching host-observed test command passed.',
                evidence: { command: result.command, exitCode: result.exitCode }
            }];
    }
    return [{
            gate: 'test-command',
            passed: false,
            severity,
            summary: 'Host-observed test evidence did not satisfy the expected command and exit-status contract.',
            evidence: { command: result.command, exitCode: result.exitCode }
        }];
}
