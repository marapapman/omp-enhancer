export function evaluateBrowserEvidenceGate(evidence) {
    if (!evidence)
        return [];
    if (evidence.findings.length > 0) {
        return evidence.findings.map(findingToGateResult);
    }
    if (evidence.status === 'passed') {
        return [
            { gate: 'browser-interaction', passed: true, severity: 'blocker', summary: 'Browser interactions passed.', evidence },
            { gate: 'browser-visual', passed: true, severity: 'warning', summary: 'Browser visual checks passed.', evidence }
        ];
    }
    if (evidence.status === 'skipped') {
        return [{
                gate: 'browser-interaction',
                passed: true,
                severity: 'warning',
                summary: 'Browser check was skipped.',
                evidence,
                repairHint: 'Run browser evidence collection for frontend targets when browser behavior changed.'
            }];
    }
    return [{
            gate: 'browser-interaction',
            passed: false,
            severity: 'blocker',
            summary: 'Browser check failed without structured findings.',
            evidence,
            repairHint: 'Re-run browser evidence collection and include action, console, network, or visual findings.'
        }];
}
function findingToGateResult(finding) {
    return {
        gate: finding.gate,
        passed: finding.passed,
        severity: finding.severity,
        summary: finding.summary,
        evidence: {
            category: finding.category,
            details: finding.evidence,
            artifacts: finding.artifacts
        },
        ...(finding.repairHint ? { repairHint: finding.repairHint } : {})
    };
}
