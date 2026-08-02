export const WORKFLOW_PHASE_LINE = 'ANALYZE -> EXECUTE -> REVIEW';

/**
 * Test-only export: no production consumer; imported by
 * test/prompt-stability.test.js.
 */
export const ORCHESTRATOR_IDENTITY = 'ORCHESTRATOR: Main is the orchestrator. Main chooses when to analyze directly vs. delegate to analyzer, when to execute directly vs. delegate to task, and when to review directly vs. delegate to reviewer. No plugin enforces delegation width, Agent selection, or phase sequencing.';

/**
 * Test-only export: no production consumer; imported by
 * test/prompt-stability.test.js.
 */
export const DIRECT_FALLBACK_REASONS = 'concrete user or native constraint, Agent availability or capacity, incomplete input, dependency or write-set overlap, safety risk, or parent-owned action';
