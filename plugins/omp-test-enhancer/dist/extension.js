import { isDefiniteWorkspaceMutationHostEvent, isTrustedExplicitTestAttempt, observedTestCommandFromHostEvent } from './host/observedTestEvidence.js';
import { TESTING_EVIDENCE_ENTRY, TESTING_STATE_ENTRY, buildTestingReviewEvidence, completeTestingReview, createInitialTestingReviewState, hasTestingReviewData, invalidateObservedBrowserEvidence, invalidateObservedTestCommand, recordObservedBrowserEvidence, recordObservedTestCommand, restoreTestingReviewStateFromEntries, scopeTestingReviewToTaskContext, startTestingReview } from './session/testingState.js';
import { readCoreTaskContextIdentityFromEntries } from './session/taskContextIdentity.js';
import { createTestingEnhancerTools } from './tools/testingTools.js';
import { isRecord } from './utils.js';
export function registerTestingEnhancer(pi) {
    let currentState = createInitialTestingReviewState();
    const branchEntries = (ctx) => ctx.sessionManager?.getBranch?.() ?? [];
    const prepareStateForContext = (ctx) => {
        const taskContextIdentity = readCoreTaskContextIdentityFromEntries(branchEntries(ctx));
        if (!taskContextIdentity || currentState.taskContextIdentity === taskContextIdentity)
            return;
        currentState = scopeTestingReviewToTaskContext(currentState, taskContextIdentity);
    };
    const persistTestingReview = async (ctx) => {
        prepareStateForContext(ctx);
        await pi.appendEntry(TESTING_STATE_ENTRY, currentState);
        if (!hasTestingReviewData(currentState))
            return;
        await pi.appendEntry(TESTING_EVIDENCE_ENTRY, buildTestingReviewEvidence(currentState));
    };
    const restoreTestingReview = (_event, ctx) => {
        const entries = branchEntries(ctx);
        const taskContextIdentity = readCoreTaskContextIdentityFromEntries(entries);
        currentState = restoreTestingReviewStateFromEntries(entries, {
            ...(taskContextIdentity !== undefined ? { taskContextIdentity } : {}),
            requireCurrentTaskContext: taskContextIdentity !== undefined
        });
    };
    const recordTestingToolResult = async (event, ctx) => {
        if (!isRecord(event))
            return;
        prepareStateForContext(ctx);
        const entries = branchEntries(ctx);
        const taskContextIdentity = readCoreTaskContextIdentityFromEntries(entries) ?? currentState.taskContextIdentity;
        const observed = taskContextIdentity ? observedTestCommandFromHostEvent(event, taskContextIdentity) : undefined;
        let stateChanged = false;
        const isWorkspaceMutation = isDefiniteWorkspaceMutationHostEvent(event);
        if (currentState.lastObservedTestCommand
            && (isWorkspaceMutation || isTrustedExplicitTestAttempt(event) && !observed)) {
            currentState = invalidateObservedTestCommand(currentState);
            stateChanged = true;
        }
        if (currentState.lastObservedBrowserEvidence && isWorkspaceMutation) {
            currentState = invalidateObservedBrowserEvidence(currentState);
            stateChanged = true;
        }
        if (observed) {
            currentState = recordObservedTestCommand(currentState, observed);
            stateChanged = true;
        }
        if (stateChanged)
            await persistTestingReview(ctx);
    };
    const recordAnalyzeOutput = async (output, ctx) => {
        prepareStateForContext(ctx);
        const coreTaskContextIdentity = readCoreTaskContextIdentityFromEntries(branchEntries(ctx));
        const taskContextIdentity = coreTaskContextIdentity ?? `testing:${output.runId}`;
        const scopedState = coreTaskContextIdentity
            ? currentState
            : scopeTestingReviewToTaskContext(currentState, taskContextIdentity);
        currentState = output.targets.length > 0
            ? startTestingReview(scopedState, output.targets, { taskContextIdentity, runId: output.runId })
            : scopedState;
        await persistTestingReview(ctx);
    };
    const recordBrowserCheckOutput = async (output, ctx) => {
        prepareStateForContext(ctx);
        const taskContextIdentity = readCoreTaskContextIdentityFromEntries(branchEntries(ctx))
            ?? currentState.taskContextIdentity
            ?? `testing:${output.runId ?? 'browser-unscoped'}`;
        currentState = recordObservedBrowserEvidence(scopeTestingReviewToTaskContext(currentState, taskContextIdentity), {
            schemaVersion: 2,
            taskContextIdentity,
            evidence: output,
            observedAt: Date.now()
        });
        await persistTestingReview(ctx);
    };
    const recordReviewOutput = async (output, ctx) => {
        prepareStateForContext(ctx);
        const taskContextIdentity = readCoreTaskContextIdentityFromEntries(branchEntries(ctx))
            ?? currentState.taskContextIdentity
            ?? 'testing:testing-unscoped';
        currentState = completeTestingReview(scopeTestingReviewToTaskContext(currentState, taskContextIdentity), output.results);
        await persistTestingReview(ctx);
    };
    const clearObservedBrowserEvidence = async (_event, ctx) => {
        prepareStateForContext(ctx);
        if (!currentState.lastObservedBrowserEvidence)
            return;
        currentState = invalidateObservedBrowserEvidence(currentState);
        await persistTestingReview(ctx);
    };
    pi.setLabel('OMP Testing Enhancer');
    for (const tool of createTestingEnhancerTools(pi.zod.z, {
        onAnalyze: recordAnalyzeOutput,
        onBrowserCheck: recordBrowserCheckOutput,
        onReview: recordReviewOutput,
        getRecentReviewResults: () => currentState.lastReviewResults,
        getObservedTestCommandEvidence: () => currentState.lastObservedTestCommand,
        getObservedBrowserEvidence: ctx => {
            prepareStateForContext(ctx);
            return currentState.lastObservedBrowserEvidence?.evidence;
        }
    })) {
        pi.registerTool(tool);
    }
    pi.on('session_start', restoreTestingReview);
    pi.on('tool_result', recordTestingToolResult);
    pi.on('session_stop', clearObservedBrowserEvidence);
}
export default registerTestingEnhancer;
