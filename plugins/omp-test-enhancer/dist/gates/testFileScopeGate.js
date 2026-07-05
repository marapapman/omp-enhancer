export function evaluateTestFileScopeGate(input) {
    const blockers = [];
    const severity = input.severity ?? 'blocker';
    if (input.candidate.files.length === 0) {
        return [{
                gate: 'test-file-scope',
                passed: false,
                severity,
                summary: 'Candidate includes no test files.',
                evidence: { candidateId: input.candidate.id },
                repairHint: 'Provide the test files changed by this workflow before running the gate.'
            }];
    }
    for (const file of input.candidate.files) {
        if (file.missingFromWorkspace) {
            blockers.push({
                gate: 'test-file-scope',
                passed: false,
                severity,
                summary: 'Candidate file is missing from the workspace.',
                evidence: { file: file.path },
                repairHint: 'Write the candidate test file to disk before running the gate.'
            });
            continue;
        }
        if (isTestFilePath(file.path))
            continue;
        blockers.push({
            gate: 'test-file-scope',
            passed: false,
            severity,
            summary: 'Candidate modifies non-test files.',
            evidence: { file: file.path },
            repairHint: 'Only change test files in this workflow. If production code must change, stop and ask for a separate implementation task.'
        });
    }
    if (blockers.length > 0)
        return blockers;
    return [{
            gate: 'test-file-scope',
            passed: true,
            severity,
            summary: 'Candidate changes are limited to test files.',
            evidence: {}
        }];
}
function isTestFilePath(path) {
    return /\.(test|spec|cy)\.[cm]?[tj]sx?$/.test(path) || /(^|\/)__tests__\//.test(path) || /(^|\/)tests\//.test(path);
}
