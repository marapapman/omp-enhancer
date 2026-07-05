export function evaluateTestCommandGate(result, options = {}) {
    if (options.skippedDueToStaticBlocker) {
        return [{
                gate: 'test-command',
                passed: true,
                severity: 'warning',
                summary: 'Test command skipped because static blocker gates failed.',
                evidence: {}
            }];
    }
    const severity = options.severity ?? (result ? 'blocker' : 'warning');
    if (!result) {
        return [{
                gate: 'test-command',
                passed: severity === 'warning',
                severity,
                summary: 'No test command configured.',
                evidence: {}
            }];
    }
    if (result.exitCode === 0) {
        return [{
                gate: 'test-command',
                passed: true,
                severity,
                summary: 'Configured test command passed.',
                evidence: { command: result.command, exitCode: result.exitCode }
            }];
    }
    return [{
            gate: 'test-command',
            passed: false,
            severity,
            summary: 'Configured test command failed.',
            evidence: { command: result.command, exitCode: result.exitCode }
        }];
}
