const COMPLEXITY_VALUES = new Set(['simple', 'focused', 'broad']);
const RISK_VALUES = new Set(['low', 'medium', 'high', 'critical']);
const REVIEW_ELIGIBLE_OPERATIONS = new Set(['modify', 'create', 'release']);

export function buildTaskShapePrompt(taskDescriptor = {}, {
  workflowSkillVisible = false,
} = {}) {
  const targets = uniqueLabels(taskDescriptor.inspectionTargets);
  const shape = taskDescriptor.inspectionShape ?? {};
  const independentTargetAnalysisRequested = shape.independentTargetAnalysisRequested === true;
  const perTargetEvidence = shape.perTargetEvidence === true;
  const crossTargetComparison = shape.crossTargetComparison === true;
  if (targets.length < 2
    || !independentTargetAnalysisRequested && !perTargetEvidence && !crossTargetComparison) {
    return '';
  }

  const operation = normalizeLabel(taskDescriptor.operation, 'unknown');
  const complexity = COMPLEXITY_VALUES.has(taskDescriptor.complexity)
    ? taskDescriptor.complexity
    : 'focused';
  const domains = uniqueLabels(taskDescriptor.domains).join(',') || 'general';
  return [
    'COMPAT_TASK_SHAPE_FACTS (observed from the user instruction; non-binding):',
    `FACTS: operation=${operation}; complexity=${complexity}; domains=${domains}; exact-inspection-targets=${targets.length}; independent-target-analysis=${requestedOrNo(independentTargetAnalysisRequested)}; per-target-evidence=${requestedOrNo(perTargetEvidence)}; cross-target-comparison=${requestedOrNo(crossTargetComparison)}.`,
    `USE: these named targets and acceptance evidence seed candidate slices before project inspection.${workflowSkillVisible ? ' Complete DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY before project action.' : ' Complete the explicit plan before project action.'} After READY, inspect enough local context to make dependencies, exclusive write sets, test seams, and assignment input complete before dispatch. Target count is scope evidence, never a dispatch or fork-width decision.`,
  ].join('\n');
}

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

  const nativeCapacity = normalizeNativeCapacity(nativeConcurrencyCapacity);

  return {
    version: 2,
    operation,
    domains,
    complexity,
    riskLevel,
    riskFlags,
    reviewDimensions,
    reviewApplicability,
    independentReview,
    nativeConcurrencyCapacity: nativeCapacity,
    subagentsAllowed,
  };
}

export function buildDynamicReviewBudgetPrompt({
  taskDescriptor = {},
  nativeConcurrencyCapacity = null,
} = {}) {
  const budget = resolveDynamicReviewBudget(taskDescriptor, { nativeConcurrencyCapacity });
  const materialContext = budget.independentReview === 'required'
    || budget.complexity === 'broad'
    || ['high', 'critical'].includes(budget.riskLevel);
  if (budget.reviewApplicability !== 'independent-review-advisory' || !materialContext) {
    return '';
  }

  const domains = budget.domains.join(',') || 'general';
  const reviewDimensions = budget.reviewDimensions.join(',') || 'none-observed';
  return [
    'COMPAT_REVIEW_CONTEXT (soft, no quota):',
    `FACTS: operation=${budget.operation};complexity=${budget.complexity};risk=${budget.riskLevel};domains=${domains};review=${reviewDimensions}.`,
    'DECIDE: Main may use an existing checkpoint; selects no count/Agent/fork/batch/dispatch/permission/completion condition.',
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

function requestedOrNo(value) {
  return value ? 'requested' : 'no';
}
