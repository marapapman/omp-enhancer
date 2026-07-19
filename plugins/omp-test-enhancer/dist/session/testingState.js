import { createHash } from 'node:crypto';
import { readBrowserEvidenceValue } from '../browserSchemas.js';
import { isRecord } from '../utils.js';
export const TESTING_STATE_ENTRY = 'omp-testing-enhancer.state';
export const TESTING_EVIDENCE_ENTRY = 'omp-testing-enhancer.evidence';
export const TESTING_STATE_SCHEMA_VERSION = 5;
export const TESTING_EVIDENCE_SCHEMA_VERSION = 3;
export function createInitialTestingReviewState() {
    return {
        schemaVersion: TESTING_STATE_SCHEMA_VERSION,
        reviewStatus: 'idle',
        lastTargets: [],
        lastReviewResults: [],
        evidenceRevision: 0
    };
}
export function restoreTestingReviewStateFromEntries(entries, options = {}) {
    let restored = createInitialTestingReviewState();
    for (const entry of entries) {
        if (entry.type !== 'custom')
            continue;
        if (entry.customType !== TESTING_STATE_ENTRY)
            continue;
        const state = readTestingReviewState(entry.data);
        if (!state)
            continue;
        if (options.requireCurrentTaskContext) {
            const hasObservedReview = state.reviewRunId !== undefined
                || state.lastReviewResults.length > 0
                || state.lastObservedTestCommand !== undefined
                || state.lastObservedBrowserEvidence !== undefined;
            if (!options.taskContextIdentity || state.taskContextIdentity !== options.taskContextIdentity || !hasObservedReview)
                continue;
        }
        restored = state;
    }
    return restored;
}
export function startTestingReview(state, targets, scope = {}) {
    return {
        ...state,
        reviewStatus: 'collecting',
        lastTargets: targets,
        lastReviewResults: [],
        evidenceRevision: state.evidenceRevision + 1,
        ...(scope.taskContextIdentity !== undefined ? { taskContextIdentity: scope.taskContextIdentity } : {}),
        ...(scope.runId !== undefined ? { reviewRunId: scope.runId } : {})
    };
}
export function completeTestingReview(state, reviewResults) {
    const hasCriticalFinding = reviewResults.some(result => !result.passed && result.severity === 'critical');
    return {
        ...state,
        reviewStatus: hasCriticalFinding ? 'findings' : 'ready',
        lastReviewResults: reviewResults,
        evidenceRevision: state.evidenceRevision + 1
    };
}
export function recordObservedTestCommand(state, evidence) {
    if (state.taskContextIdentity && evidence.taskContextIdentity !== state.taskContextIdentity)
        return state;
    return {
        ...state,
        lastObservedTestCommand: evidence,
        evidenceRevision: state.evidenceRevision + 1,
        ...(state.taskContextIdentity ? {} : { taskContextIdentity: evidence.taskContextIdentity })
    };
}
export function invalidateObservedTestCommand(state) {
    if (!state.lastObservedTestCommand)
        return state;
    const { lastObservedTestCommand: _discarded, ...rest } = state;
    const hasActiveReview = state.reviewRunId !== undefined
        || state.lastTargets.length > 0
        || state.lastReviewResults.length > 0;
    return {
        ...rest,
        reviewStatus: hasActiveReview ? 'collecting' : state.reviewStatus,
        evidenceRevision: state.evidenceRevision + 1
    };
}
export function recordObservedBrowserEvidence(state, observed) {
    if (state.taskContextIdentity && observed.taskContextIdentity !== state.taskContextIdentity)
        return state;
    return {
        ...state,
        lastObservedBrowserEvidence: observed,
        evidenceRevision: state.evidenceRevision + 1,
        ...(state.taskContextIdentity ? {} : { taskContextIdentity: observed.taskContextIdentity })
    };
}
export function invalidateObservedBrowserEvidence(state) {
    if (!state.lastObservedBrowserEvidence)
        return state;
    const { lastObservedBrowserEvidence: _discarded, ...rest } = state;
    const lastReviewResults = state.lastReviewResults.filter(result => result.gate !== 'browser-interaction' && result.gate !== 'browser-visual');
    const hasActiveReview = state.reviewRunId !== undefined
        || state.lastTargets.length > 0
        || lastReviewResults.length > 0;
    return {
        ...rest,
        lastReviewResults,
        reviewStatus: hasActiveReview ? 'collecting' : state.reviewStatus,
        evidenceRevision: state.evidenceRevision + 1
    };
}
export function scopeTestingReviewToTaskContext(state, taskContextIdentity) {
    if (state.taskContextIdentity === taskContextIdentity)
        return state;
    return { ...createInitialTestingReviewState(), taskContextIdentity };
}
export function hasTestingReviewData(state) {
    return state.reviewStatus !== 'idle'
        || state.lastTargets.length > 0
        || state.lastReviewResults.length > 0
        || state.reviewRunId !== undefined;
}
export function buildTestingReviewEvidence(state, updatedAt = Date.now()) {
    const runId = state.reviewRunId ?? 'testing-unscoped';
    const taskContextIdentity = state.taskContextIdentity ?? `testing:${runId}`;
    const reviewStatus = state.reviewStatus === 'idle' ? 'collecting' : state.reviewStatus;
    const criticalFindings = [...new Set(state.lastReviewResults
            .filter(result => !result.passed && result.severity === 'critical')
            .map(result => result.gate))].sort();
    const normalizedResults = state.lastReviewResults
        .map(result => ({ gate: result.gate, passed: result.passed, severity: result.severity }))
        .sort((left, right) => left.gate.localeCompare(right.gate));
    const evidenceDigest = digest({
        schemaVersion: TESTING_EVIDENCE_SCHEMA_VERSION,
        taskContextIdentity,
        runId,
        reviewStatus,
        criticalFindings,
        normalizedResults
    });
    return {
        schemaVersion: TESTING_EVIDENCE_SCHEMA_VERSION,
        taskContextIdentity,
        runId,
        reviewStatus,
        criticalFindings,
        advisory: true,
        evidenceDigest,
        evidenceRevision: state.evidenceRevision,
        updatedAt
    };
}
function readTestingReviewState(value) {
    if (!isRecord(value) || (value.schemaVersion !== TESTING_STATE_SCHEMA_VERSION && value.schemaVersion !== 4))
        return undefined;
    if (!isTestingReviewStatus(value.reviewStatus))
        return undefined;
    if (!Array.isArray(value.lastTargets) || !Array.isArray(value.lastReviewResults))
        return undefined;
    const state = {
        schemaVersion: TESTING_STATE_SCHEMA_VERSION,
        reviewStatus: value.reviewStatus,
        lastTargets: value.lastTargets.flatMap(readChangedTarget),
        lastReviewResults: value.lastReviewResults.flatMap(readReviewResult),
        evidenceRevision: Number.isInteger(value.evidenceRevision) && Number(value.evidenceRevision) >= 0
            ? Number(value.evidenceRevision)
            : 0
    };
    const taskContextIdentity = readTaskContextIdentity(value, value.schemaVersion === 4);
    if (taskContextIdentity)
        state.taskContextIdentity = taskContextIdentity;
    if (typeof value.reviewRunId === 'string')
        state.reviewRunId = value.reviewRunId;
    const observedTestCommand = readObservedTestCommandEvidence(value.lastObservedTestCommand);
    if (observedTestCommand && (!state.taskContextIdentity || observedTestCommand.taskContextIdentity === state.taskContextIdentity)) {
        state.lastObservedTestCommand = observedTestCommand;
    }
    const observedBrowserEvidence = readObservedBrowserEvidence(value.lastObservedBrowserEvidence);
    if (observedBrowserEvidence && (!state.taskContextIdentity || observedBrowserEvidence.taskContextIdentity === state.taskContextIdentity)) {
        state.lastObservedBrowserEvidence = observedBrowserEvidence;
    }
    if (state.lastTargets.length !== value.lastTargets.length)
        return undefined;
    if (state.lastReviewResults.length !== value.lastReviewResults.length)
        return undefined;
    return state;
}
function readObservedTestCommandEvidence(value) {
    if (!isRecord(value) || (value.schemaVersion !== 2 && value.schemaVersion !== 1))
        return undefined;
    const taskContextIdentity = readTaskContextIdentity(value, value.schemaVersion === 1);
    if (!taskContextIdentity)
        return undefined;
    if (typeof value.commandDigest !== 'string' || !/^[0-9a-f]{64}$/.test(value.commandDigest))
        return undefined;
    if (!Number.isInteger(value.exitCode))
        return undefined;
    if (!Number.isFinite(value.observedAt) || Number(value.observedAt) <= 0)
        return undefined;
    return {
        schemaVersion: 2,
        taskContextIdentity,
        commandDigest: value.commandDigest,
        exitCode: Number(value.exitCode),
        observedAt: Number(value.observedAt)
    };
}
function readObservedBrowserEvidence(value) {
    if (!isRecord(value) || (value.schemaVersion !== 2 && value.schemaVersion !== 1))
        return undefined;
    const taskContextIdentity = readTaskContextIdentity(value, value.schemaVersion === 1);
    if (!taskContextIdentity)
        return undefined;
    if (!Number.isFinite(value.observedAt) || Number(value.observedAt) <= 0)
        return undefined;
    const evidence = readBrowserEvidenceValue(value.evidence);
    if (!evidence)
        return undefined;
    return {
        schemaVersion: 2,
        taskContextIdentity,
        evidence,
        observedAt: Number(value.observedAt)
    };
}
function readTaskContextIdentity(value, allowLegacyRouteName = false) {
    if (typeof value.taskContextIdentity === 'string' && value.taskContextIdentity.trim()) {
        return value.taskContextIdentity;
    }
    // State schema v4 and observation schema v1 used the retired route name.
    if (allowLegacyRouteName && typeof value.routeIdentity === 'string' && value.routeIdentity.trim()) {
        return value.routeIdentity.replace(/^route:/, 'task:');
    }
    return undefined;
}
function digest(value) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function readChangedTarget(value) {
    if (!isRecord(value))
        return [];
    if (typeof value.id !== 'string')
        return [];
    if (typeof value.sourceFile !== 'string')
        return [];
    if (typeof value.symbolName !== 'string')
        return [];
    if (!isTargetKind(value.kind))
        return [];
    if (!isRiskLevel(value.risk))
        return [];
    const target = {
        id: value.id,
        sourceFile: value.sourceFile,
        symbolName: value.symbolName,
        kind: value.kind,
        risk: value.risk
    };
    if (Array.isArray(value.relatedTests))
        target.relatedTests = value.relatedTests.filter((item) => typeof item === 'string');
    if (Array.isArray(value.publicEntryHints))
        target.publicEntryHints = value.publicEntryHints.filter((item) => typeof item === 'string');
    return [target];
}
function readReviewResult(value) {
    if (!isRecord(value))
        return [];
    if (!isGateName(value.gate))
        return [];
    if (typeof value.passed !== 'boolean')
        return [];
    if (value.severity !== 'critical' && value.severity !== 'warning')
        return [];
    if (typeof value.summary !== 'string')
        return [];
    const result = {
        gate: value.gate,
        passed: value.passed,
        severity: value.severity,
        summary: value.summary,
        evidence: value.evidence
    };
    if (typeof value.repairHint === 'string')
        result.repairHint = value.repairHint;
    return [result];
}
function isTestingReviewStatus(value) {
    return value === 'idle' || value === 'collecting' || value === 'ready' || value === 'findings';
}
function isTargetKind(value) {
    return value === 'pure-function' ||
        value === 'validator' ||
        value === 'parser' ||
        value === 'formatter' ||
        value === 'api-client' ||
        value === 'api-provider' ||
        value === 'service' ||
        value === 'repository' ||
        value === 'react-component' ||
        value === 'cli' ||
        value === 'unknown';
}
function isRiskLevel(value) {
    return value === 'low' || value === 'medium' || value === 'high';
}
function isGateName(value) {
    return value === 'indirect-test' ||
        value === 'test-file-scope' ||
        value === 'test-command' ||
        value === 'browser-interaction' ||
        value === 'browser-visual';
}
