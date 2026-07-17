const COMPLEXITY_VALUES = new Set(['simple', 'focused', 'broad']);
const RISK_VALUES = new Set(['low', 'medium', 'high', 'critical']);
const RISK_RANK = Object.freeze({ low: 0, medium: 1, high: 2, critical: 3 });
const REVIEW_ELIGIBLE_OPERATIONS = new Set(['modify', 'create', 'release']);

export function resolveDynamicReviewBudget(taskDescriptor = {}, {
  nativeConcurrencyCapacity = null,
} = {}) {
  const operation = normalizeLabel(taskDescriptor.operation, 'unknown');
  const domains = uniqueLabels(taskDescriptor.domains);
  const complexity = COMPLEXITY_VALUES.has(taskDescriptor.complexity)
    ? taskDescriptor.complexity
    : 'focused';
  const riskLevel = RISK_VALUES.has(taskDescriptor.risk?.level)
    ? taskDescriptor.risk.level
    : 'low';
  const riskFlags = uniqueLabels(taskDescriptor.risk?.flags);
  const subagentsAllowed = taskDescriptor.constraints?.subagents !== 'forbidden';
  const independentReview = ['forbidden', 'required'].includes(taskDescriptor.constraints?.independentReview)
    ? taskDescriptor.constraints.independentReview
    : 'unspecified';
  const responseOnlyWriting = domains.includes('writing')
    && taskDescriptor.constraints?.workspaceWrite === 'forbidden';
  const reviewApplicable = independentReview === 'required'
    || !responseOnlyWriting && REVIEW_ELIGIBLE_OPERATIONS.has(operation);
  const reviewApplicability = independentReview === 'forbidden'
    ? 'user-forbidden'
    : !reviewApplicable
      ? 'primary-task-only'
      : !subagentsAllowed
        ? 'subagents-forbidden'
        : 'independent-review-advisory';
  const reviewDimensions = materialReviewDimensions({ operation, domains, riskFlags });

  let heuristicReviewerLaneSuggestion = 0;
  if (reviewApplicability === 'independent-review-advisory') {
    if (complexity === 'broad') {
      heuristicReviewerLaneSuggestion = RISK_RANK[riskLevel] >= RISK_RANK.high
        && reviewDimensions.length >= 3
        ? 3
        : Math.min(2, Math.max(1, reviewDimensions.length));
    } else if (complexity === 'focused') {
      heuristicReviewerLaneSuggestion = RISK_RANK[riskLevel] >= RISK_RANK.high
        ? Math.min(2, Math.max(1, reviewDimensions.length))
        : RISK_RANK[riskLevel] >= RISK_RANK.medium
          && riskFlags.some((flag) => flag !== 'workspace-write')
          && reviewDimensions.length >= 2 ? 1 : 0;
    } else if (RISK_RANK[riskLevel] >= RISK_RANK.high) {
      heuristicReviewerLaneSuggestion = 1;
    }
    if (independentReview === 'required') {
      heuristicReviewerLaneSuggestion = Math.max(1, heuristicReviewerLaneSuggestion);
    }
  }

  const nativeCapacity = normalizeNativeCapacity(nativeConcurrencyCapacity);
  const reviewerLaneSuggestion = heuristicReviewerLaneSuggestion;
  const nativeCapConstrainedSuggestion = !subagentsAllowed || independentReview === 'forbidden'
    ? 0
    : nativeCapacity == null
      ? null
      : Math.min(reviewerLaneSuggestion, nativeCapacity);

  return {
    version: 1,
    operation,
    domains,
    complexity,
    riskLevel,
    riskFlags,
    reviewDimensions,
    reviewApplicability,
    independentReview,
    heuristicReviewerLaneSuggestion,
    reviewerLaneSuggestion,
    nativeCapConstrainedSuggestion,
    nativeConcurrencyCapacity: nativeCapacity,
    subagentsAllowed,
  };
}

export function buildDynamicReviewBudgetPrompt({
  taskDescriptor = {},
  nativeConcurrencyCapacity = null,
} = {}) {
  const budget = resolveDynamicReviewBudget(taskDescriptor, { nativeConcurrencyCapacity });
  if (budget.reviewApplicability !== 'independent-review-advisory'
    || budget.nativeConcurrencyCapacity == null
    || budget.nativeCapConstrainedSuggestion <= 0) {
    return '';
  }

  const domains = budget.domains.join(',') || 'general';
  const riskFlags = budget.riskFlags.join(',') || 'none';
  const reviewDimensions = budget.reviewDimensions.join(',') || 'none-observed';
  return [
    'DEEPSEEK_DYNAMIC_REVIEW_BUDGET (supplemental, non-binding heuristic): OMP\'s system prompt, user scope, selected workflow, Available Agents, native delegation gates, concurrency, permissions, verification, delivery, and completion behavior remain authoritative.',
    `TASK_FACTS: operation=${budget.operation}; complexity=${budget.complexity}; risk=${budget.riskLevel}; domains=${domains}; risk-flags=${riskFlags}; independent-review=${budget.independentReview}. These initial facts are not permissions or proof that every possible risk remains material.`,
    `INITIAL_REVIEW_LANES: suggested=${budget.reviewerLaneSuggestion}; within-native-cap=${budget.nativeCapConstrainedSuggestion}; native-cap=${budget.nativeConcurrencyCapacity}; observed-dimensions=${reviewDimensions}. This 0-3 value is a starting heuristic, not a quota, ceiling, task schema, or dispatch instruction.`,
    'CHECKPOINT_ONLY: apply this heuristic only if the user-selected or OMP-native workflow reaches an existing independent-review checkpoint. It does not create, schedule, or move that checkpoint. Re-evaluate actual distinct unanswered risk questions then; zero is valid, and duplicate generic reviewers are not useful.',
    'TIER_REFERENCE: 0 for mechanical or low-risk work; 1 for one focused material risk; 2 for broad work with two distinct material questions; 3 only for exceptional broad high or critical work with at least three independent questions. File count or risk words inside source content do not raise the tier.',
    'AGENT_AND_NATIVE_HANDOFF: use only current Available Agent IDs and prefer a directly matching read-only reviewer. OMP alone decides whether and when to dispatch, fork, batch, wait, repair, verify, finish, or stop. This advisory creates no TODO, stage, permission, continuation, or completion gate and does not guarantee or require an actual task, fork, batch, or reviewer.',
  ].join('\n');
}

function materialReviewDimensions({ operation, domains, riskFlags }) {
  const dimensions = [];
  const domainSet = new Set(domains);
  const flagSet = new Set(riskFlags);
  if (domainSet.has('writing') || domainSet.has('document')) dimensions.push('content-quality');
  if ([...domainSet].some((domain) => ['code', 'config', 'plugin', 'database', 'ml', 'network'].includes(domain))) {
    dimensions.push('correctness');
  }
  if (domainSet.has('tests') || flagSet.has('test-execution')) dimensions.push('test-adequacy');
  if (domainSet.has('security') || flagSet.has('security-sensitive')) dimensions.push('security');
  if (domainSet.has('facts') || flagSet.has('factual-claims')) dimensions.push('factual-support');
  if (domainSet.has('visual')) dimensions.push('visual-quality');
  if (operation === 'release' || flagSet.has('external-write') || flagSet.has('irreversible-file-operation')) {
    dimensions.push('release-integrity');
  }
  return [...new Set(dimensions)];
}

function normalizeNativeCapacity(value) {
  const capacity = Number(value);
  return Number.isSafeInteger(capacity) && capacity > 0 ? capacity : null;
}

function normalizeLabel(value, fallback = '') {
  const label = String(value ?? '').trim().toLowerCase();
  return label || fallback;
}

function uniqueLabels(values = []) {
  return [...new Set((values ?? [])
    .map((value) => normalizeLabel(value))
    .filter(Boolean))];
}
