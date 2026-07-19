export function evaluateBrowserEvidenceGate(evidence, options = {}) {
    const severity = options.severity ?? 'critical';
    if (!evidence) {
        if (!options.required)
            return [];
        return [{
                gate: 'browser-interaction',
                passed: false,
                severity,
                summary: 'Browser evidence is required for frontend targets.',
                evidence: { targetIds: options.targetIds ?? [] },
                repairHint: 'Run omp_test_browser_check in the current task context before omp_test_review for frontend targets.'
            }];
    }
    const requiredTargetIds = [...new Set(options.targetIds ?? [])];
    const observedTargetIds = [...new Set(evidence.targetIds)];
    const missingTargetIds = requiredTargetIds.filter(targetId => !observedTargetIds.includes(targetId));
    const coverageResults = missingTargetIds.length > 0
        ? [{
                gate: 'browser-interaction',
                passed: false,
                severity,
                summary: 'Browser evidence does not cover all reviewed frontend targets.',
                evidence: { requiredTargetIds, observedTargetIds, missingTargetIds },
                repairHint: 'Run omp_test_browser_check with targetIds covering every reviewed frontend target.'
            }]
        : [];
    if (evidence.status === 'skipped') {
        const skippedSeverity = options.required ? severity : 'warning';
        return [...coverageResults, {
                gate: 'browser-interaction',
                passed: false,
                severity: skippedSeverity,
                summary: 'Browser check was skipped.',
                evidence,
                repairHint: 'Run browser evidence collection for frontend targets when browser behavior changed.'
            }];
    }
    const findingResults = evidence.findings.map(findingToGateResult);
    const scenarioCount = nonNegativeInteger(evidence.scenarioCount);
    const stepCount = nonNegativeInteger(evidence.stepCount);
    const captureCount = nonNegativeInteger(evidence.captureCount);
    const visualAssertionCount = nonNegativeInteger(evidence.visualAssertionCount);
    if ((scenarioCount === 0 || stepCount === 0)
        && !findingResults.some(result => result.gate === 'browser-interaction' && !result.passed)) {
        findingResults.unshift({
            gate: 'browser-interaction',
            passed: false,
            severity,
            summary: scenarioCount === 0
                ? 'Browser check did not execute any scenarios.'
                : 'Browser check did not execute any interaction steps.',
            evidence: { scenarioCount, stepCount, captureCount, visualAssertionCount, runId: evidence.runId },
            repairHint: 'Run at least one browser scenario with at least one interaction step in the current task context.'
        });
    }
    const lacksFailingStructuredFinding = evidence.status === 'failed'
        && !evidence.findings.some(finding => !finding.passed);
    if (lacksFailingStructuredFinding) {
        findingResults.unshift({
            gate: 'browser-interaction',
            passed: false,
            severity,
            summary: 'Browser check failed without a failing structured finding.',
            evidence,
            repairHint: 'Report the browser execution failure and collect a structured failing observation before accepting the review.'
        });
    }
    const observedResults = [...coverageResults, ...findingResults];
    if (observedResults.length > 0) {
        return observedResults;
    }
    if (evidence.status === 'passed') {
        const results = [
            { gate: 'browser-interaction', passed: true, severity: 'critical', summary: 'Browser interactions passed.', evidence }
        ];
        if (visualAssertionCount > 0) {
            results.push({ gate: 'browser-visual', passed: true, severity: 'warning', summary: 'Browser visual checks passed.', evidence });
        }
        return results;
    }
    return [{
            gate: 'browser-interaction',
            passed: false,
            severity: 'critical',
            summary: 'Browser check failed without structured findings.',
            evidence,
            repairHint: 'Report the browser-evidence gap; collect one additional observation only when it would materially improve the review.'
        }];
}
function nonNegativeInteger(value) {
    return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : 0;
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
