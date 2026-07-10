import { loopGuardPromptSection } from './loop-guard.js';
import { skillReadNameCandidates } from './skill-usage.js';
import { useEnforcedRoutePlan } from './runtime-policy.js';
import { requiresDocumentPreservation } from './document-preservation.js';

export function buildGovernancePromptFragment({
  route,
  parentTask = '',
  includeModelWorkflowHints = true,
} = {}) {
  const resolved = projectRouteForGovernance(route) ?? {
    intent: 'unknown',
    agent: null,
    requiredSkills: [],
    requiredTools: [],
    requiredSubagents: [],
  };

  if (resolved.intent === 'unknown') {
    return [
      '## OMP Enhancer Core Routing',
      '',
      'Intent: unknown',
      'Use natural language context. Do not force a plugin workflow unless the user asks for coding, writing, testing, security, or config work.',
      '',
      loopGuardPromptSection(),
      '',
      '### Advisor Guidance Policy',
      '',
      ...advisorGuidanceLines(resolved),
    ].join('\n');
  }

  return [
    '## OMP Enhancer Core Routing',
    '',
    `Intent: ${resolved.intent}`,
    `Agent route: ${resolved.agent ?? 'none'}`,
    '',
    'Use this natural language route. Do not require a command prefix.',
    routeBoundaryFor(resolved),
    ...documentPreservationGuidanceLines(resolved, parentTask),
    '',
    ...workflowGateBriefingLines(resolved),
    '',
    ...workflowNextLines(resolved, parentTask),
    '',
    loopGuardPromptSection(),
    '',
    '### Advisor Guidance Policy',
    '',
    ...advisorGuidanceLines(resolved),
    '',
    '',
    '### Mandatory Skill Workflow',
    '',
    ...skillWorkflowLines(resolved),
    '',
    'Required skills:',
    formatList(resolved.requiredSkills),
    '',
    'Toolchain:',
    formatList(resolved.requiredTools),
    '',
    ...subagentWorkflowLines(resolved, { parentTask, includeModelWorkflowHints }),
    '',
    ...reviewToTestingHandoffLines(resolved),
    '',
    ...bugAuditTestGenerationLines(resolved),
    '',
    workflowFor(resolved),
    '### Internal Prompt Visibility',
    '',
    'Do not expose internal classifier or smart-gate prompts in user-facing output.',
    'Summarize route and gate status for the user with the task type, missing evidence, and next action only.',
    'Do not quote JSON Schema. Do not quote Tiny model policy. Do not quote deterministic rule-gate context, captured evidence summary, or required classifier and smart-gate sequences.',
    '',
    '',
    '### SUBAGENT_USAGE contract',
    '',
    'Final routed outputs that list required subagents must include:',
    'Put this block in the final assistant answer text. A successful omp_core_validate_subagent_usage tool call can satisfy the internal subagent gate, but the closing answer should still include the SUBAGENT_USAGE block for user-visible evidence.',
    '',
    'SUBAGENT_USAGE',
    'Required:',
    '- agent-name: every skill required by that subagent, or none',
    'Forked:',
    '- agent-name: every skill included in that subagent task prompt, or none',
    '',
    '### SKILL_USAGE contract',
    '',
    'Final routed outputs must include:',
    '',
    'SKILL_USAGE',
    'Required:',
    '- every required skill from this fragment',
    'Loaded:',
    '- every required skill actually loaded before acting',
    '',
    'Use this exact plain-text block shape, replacing only the skill names:',
    '',
    'SKILL_USAGE',
    'Required:',
    '- skill-name',
    'Loaded:',
    '- skill-name',
  ].join('\n');
}

function projectRouteForGovernance(route) {
  if (!route) return route;
  const constraints = route.taskDescriptor?.constraints ?? {};
  const canonical = useEnforcedRoutePlan(route)
    || constraints.testExecution === 'forbidden'
    || constraints.subagents === 'forbidden';
  if (!canonical) return route;
  const plan = route.routePlan ?? {};
  const projected = {
    ...route,
    requiredSkills: Array.isArray(plan.requiredSkills)
      ? plan.requiredSkills
      : (route.requiredSkills ?? []).filter((skill) => constraints.testExecution !== 'forbidden'
        || !['test-driven-development', 'ai-regression-testing'].includes(skill)),
    requiredTools: Array.isArray(plan.requiredTools)
      ? plan.requiredTools
      : (route.requiredTools ?? []).filter((tool) => constraints.testExecution !== 'forbidden'
        || !/^omp_test_/i.test(tool)),
    requiredSubagents: Array.isArray(plan.requiredSubagents)
      ? plan.requiredSubagents
      : constraints.subagents === 'forbidden' ? [] : route.requiredSubagents ?? [],
  };
  if (isFocusedLocalFactInspection(projected)) {
    return {
      ...projected,
      intent: 'fact-check',
      workflowRoute: 'factcheck.local',
      agent: null,
      auditMode: 'focused',
    };
  }
  if (isExactTestExecution(projected)) {
    return {
      ...projected,
      intent: 'testing',
      workflowRoute: 'testing',
      agent: null,
      auditMode: 'focused',
      requiredTools: [],
    };
  }
  if (isReadOnlySecurityReview(projected)) {
    return {
      ...projected,
      intent: 'security-review',
      workflowRoute: 'security.review',
      agent: null,
      auditMode: 'focused',
    };
  }
  if (isReadOnlyCodeReview(projected)) {
    return {
      ...projected,
      intent: 'code.review',
      workflowRoute: 'code.review',
      agent: null,
      auditMode: 'focused',
    };
  }
  if (isCodeModificationWithoutTests(projected)) {
    const securitySensitive = projected.taskDescriptor?.domains?.includes('security');
    const releaseRequired = routeRequiresGate(projected, 'release-approval')
      || projected.taskDescriptor?.constraints?.externalWrite === 'required';
    return {
      ...projected,
      intent: releaseRequired ? 'release' : securitySensitive ? 'security-review' : 'code.dev',
      workflowRoute: releaseRequired ? 'release' : securitySensitive ? 'security-review' : 'code.dev',
      agent: null,
    };
  }
  return projected;
}

function advisorGuidanceLines(route) {
  const mayDoStatefulWork = [
    'implementation-with-tests',
    'bug-audit',
    'diagnosis',
    'security-review',
    'config-assets',
    'release',
  ].includes(route?.intent);

  return [
    'Use the active OMP advisor configuration without binding the prompt to a specific advisor model.',
    'When an advisor result or advisor message exists in the transcript, give that advice serious weight before choosing the next action.',
    ...(mayDoStatefulWork ? [
      'If the runtime exposes an advisor tool, consult it after read-only orientation and before the first edit, write, or state-changing command on non-trivial routed work. If no advisor tool is exposed, continue without inventing one.',
    ] : []),
    'If empirical evidence contradicts advisor guidance, follow the primary-source evidence, explain the conflict briefly, and do not silently ignore the advisor.',
    'If advisor guidance conflicts with the user request, repository facts, or tool results, reconcile the conflict with evidence before committing to a plan or final answer.',
  ];
}

function documentPreservationGuidanceLines(route, parentTask = '') {
  const descriptor = route?.taskDescriptor;
  if (descriptor?.operation !== 'modify'
    || !descriptor?.domains?.includes('document')
    || !requiresDocumentPreservation(parentTask)) return [];
  const targets = Array.isArray(descriptor.workspaceWriteTargets) ? descriptor.workspaceWriteTargets : [];
  if (targets.length !== 1) return [
    'Document preservation constraint: this request names multiple document targets, but host preservation evidence is bound to one complete document at a time.',
    'Do not edit, write, patch, run a mutating shell command, or delegate a writing subagent. Ask the user to split the work into one exact document per task.',
  ];
  return [
    'Document preservation constraint: this is a style edit, not authority to change factual propositions.',
    'Preserve the full claim, including its subject, predicate, exact values, polarity, quantifiers, range, and modality. Keeping only the same number does not preserve the fact.',
    `Before any direct or subagent mutation, use the direct read tool to read the complete authorized document ${targets[0]} so the host can bind the baseline; prefer the full selector "raw". Do not use a line-range selector, suffix-matched path, or alternate copy.`,
    'If that full read is truncated by the host, stop method attempts and ask the user to split the document/task into one smaller exact file or explicitly narrow the preservation scope; chunked reads cannot establish this whole-document baseline.',
    'After the final direct edit and after all subagent work, the parent agent must directly read the complete authorized document once so host evidence can compare it with the original baseline.',
    'The host check is a conservative lexical and structural invariant, not a proof of arbitrary semantic equivalence; keep factual rewrites minimal so the invariant remains mechanically verifiable.',
    'Use the smallest equivalent rephrase; if a factual sentence is already clear, leave it unchanged. Compare the original and final claim before reporting completion.',
  ];
}

function skillWorkflowLines(route) {
  const hasSubagents = (route.requiredSubagents ?? []).length > 0;
  if (isFocusedLocalFactInspection(route)) {
    return [
      'This is a focused offline repository-evidence check handled directly by the main agent; no network, subagent, edit, test, or heavyweight cross-source fact workflow is authorized.',
      'Read the claim and search independent repository files for corroborating or contradicting evidence. The claim text itself is not independent evidence.',
      'Report supported, contradicted, or insufficient evidence explicitly. If the repository contains only the claim itself, conclude that local evidence is insufficient and stop.',
    ];
  }
  if (isExactTestExecution(route)) {
    const targets = route.taskDescriptor?.testExecutionTargets ?? [];
    return [
      `This is one exact test execution for the complete target list ${targets.join(', ')}; no broader verification scope is authorized.`,
      'Inspect package or runner configuration with the read tool. Do not use shell pipelines, redirections, aliases, or exploratory commands for that inspection.',
      'Run one direct host test command that names every authorized test file once and in the requested order, then report the observed result. Do not omit or substitute targets, use an aggregate suite, or add runner preloads and extra flags.',
    ];
  }
  if (isReadOnlySecurityReview(route)) {
    return [
      'This is a focused read-only security review handled by the main agent; no subagent, test, edit, network, or release workflow is authorized.',
      'Before reviewing, read skill://security-review and skill://security-scan. Then inspect the target and, when needed to substantiate impact, direct local callers with read-only tools.',
      'Report only code-supported facts. Missing validation, authentication, logging, or sanitization is not itself an exploitable vulnerability unless a concrete local caller or security-sensitive sink proves that responsibility and impact.',
      'Do not assign vulnerability names or severity from a function name, pass-through behavior, or hypothetical downstream use. If no concrete caller or sink supports impact, use Findings: none confirmed in the inspected scope.',
      'For this report-only route, Verdict: COMPLETE means the evidence collection is complete; it does not approve a remediation or claim the code is safe.',
      'Finish with this exact multiline evidence block:',
      'SECURITY_REVIEW',
      'Scope: <reviewed file and any callers actually inspected>',
      'Findings: <supported findings, or none confirmed in the inspected scope>',
      'Evidence: <concrete boundary, caller, or sink evidence; a function name or missing validation alone is insufficient>',
      'OpenBlockers: none',
      'Verdict: COMPLETE',
    ];
  }
  if (isReadOnlyCodeReview(route)) {
    return [
      'This is a read-only code review. Inspect the requested scope and report concrete evidence directly.',
      'Test execution is forbidden for this route. Do not run test commands, generate test files, or enter a testing workflow.',
      'Do not turn findings into production-code edits or test-evidence repair attempts.',
    ];
  }
  if (isCodeModificationWithoutTests(route)) {
    const releaseRequired = routeRequiresGate(route, 'release-approval')
      || route.taskDescriptor?.constraints?.externalWrite === 'required';
    return [
      hasSubagents
        ? 'This is a routed code modification with an explicit no-test boundary; keep every listed review and subagent contract that does not require test execution.'
        : 'This is a focused direct code modification with an explicit no-test boundary.',
      hasSubagents
        ? 'Delegate only to the listed required subagents with their assigned skills, apply the authorized edit, and use static review evidence.'
        : 'Load the listed direct-work skills, inspect the requested target, apply the smallest authorized edit, and perform a static review.',
      'Test execution is forbidden for this route. Do not enter a testing workflow or try test commands as verification.',
      ...(releaseRequired ? ['After static review, perform only the explicitly authorized release action and independently verify its exact target and immutable version or revision.'] : []),
    ];
  }
  if (isFocusedBugAuditRoute(route)) {
    return [
      'This is a focused direct bug-audit route. The main agent does the bounded audit directly instead of forking the heavy audit subagent set.',
      'Before using edit, write, bash, route-specific QA, or omp_test_* gates, preload the focused audit skills with read calls and wait for the results.',
      'Use the skills to build a compact local test matrix, inspect the concrete failure path, run the relevant checks, and finish with omp_test_gate plus SKILL_USAGE evidence.',
      'Do not fork bug-audit subagents unless the user expands the task into a broad audit or asks for parallel delegation.',
    ];
  }

  if (hasSubagents) {
    return [
      'This route delegates required skill loading to the task subagents. Do not read root route skills in the main agent just to unlock task.',
      'Before forking, put each subagent-specific skill list into that subagent task assignment. The subagent must read those skill URIs before acting and report which skills it loaded.',
      'If the main agent later does direct work itself with edit, write, bash, route-specific QA, or test gates, load only the skills needed for that direct main-agent action.',
      'When validating loaded skills, prefer subagent task evidence and SUBAGENT_USAGE for delegated skills. Use SKILL_USAGE to summarize the skills loaded by the acting agent or subagents; do not repair delegated skill gaps by repeatedly reading them in the main agent.',
    ];
  }

  return [
    'There is no tool named `skill` in this runtime. Load skills only by calling the `read` tool with a `skill://<skill-name>` path.',
    `Required skill URIs: ${(route.requiredSkills ?? []).map((skill) => `skill://${skill}`).join(', ') || 'none'}.`,
    'Do not print XML or <tool_call> text. Make the actual tool call instead.',
    'Before doing the routed work, call the `read` tool once for each required skill using the exact URI `skill://<skill-name>`. Wait for those reads to finish before acting. If a required skill is unavailable, state that explicitly and do not pretend it was loaded.',
    'The runtime enforces this as a pre-work skill gate: direct work tools such as edit, write, bash, route-specific QA, and test gates may be blocked until every required skill has successful read evidence.',
    'When validating loaded skills, prefer this order in the same assistant continuation: read every missing `skill://<skill-name>` first, wait for those read results, then call `omp_core_validate_skill_usage` with the full SKILL_USAGE output. This avoids stale branch snapshots hiding just-loaded skills.',
  ];
}

export function buildSubagentPromptFragment({ prompt = '' } = {}) {
  const { agent, requiredSkills } = parseSubagentLaunchContract(prompt);
  const resolvedAgent = agent || 'subagent';
  const workflowBriefing = parseWorkflowGateBriefing(prompt);

  return [
    '## OMP Enhancer Core Subagent Contract',
    '',
    `Subagent: ${resolvedAgent}`,
    '',
    'This is a spawned subagent assignment, not a root routed workflow. Do not start another OMP Enhancer Core role-gate cycle and do not fork extra subagents unless the assignment explicitly asks for nested delegation.',
    '',
    ...(workflowBriefing.length ? [
      'Parent workflow and gates:',
      ...workflowBriefing,
      'Read this briefing before acting. Your output completes only your assigned checkpoint; the main agent owns parent workflow completion gates unless the assignment explicitly says otherwise.',
      '',
    ] : []),
    'Required skills for this subagent:',
    formatList(requiredSkills),
    '',
    'Before acting, read the required skills using these URIs. If a required skill is unavailable, stop and report it in BLOCKERS.',
    formatSubagentSkillReadSteps(requiredSkills),
    'Use canonical names in Required. In Loaded, list the exact skill names successfully read; aliases equivalent to the Required entries are accepted.',
    '',
    'Final subagent output must end with:',
    '',
    'SKILL_USAGE',
    'Required:',
    formatList(requiredSkills),
    'Loaded:',
    formatList(requiredSkills),
    '',
    'SUBAGENT_RESULT',
    `Agent: ${resolvedAgent}`,
    'Status: complete|blocked',
    'Evidence:',
    '- concise files, tools, checks, or decisions used',
    'BLOCKERS:',
    '- none, or the exact blocker',
  ].join('\n');
}

export function buildMissingGateContext({ route, state } = {}) {
  return buildMissingGateContexts({ route, state })[0]?.context ?? null;
}

export function buildMissingGateContexts({ route, state } = {}) {
  if (!route || route.intent === 'unknown') return [];

  const contexts = [];

  if (needsFactCheck(route) && !state?.evidence?.factCheckGate) {
    contexts.push(isFocusedLocalFactInspection(route)
      ? { key: 'fact-check', context: [
        'OMP Enhancer Core local fact-evidence gate is still open.',
        'Use one successful built-in grep over the repository root with a concrete claim-related pattern before concluding. Reading or repeating only the claim text is not independent evidence.',
        'Then report supported, contradicted, or insufficient repository evidence explicitly. Do not use the network, subagents, tests, edits, or the heavyweight fact_check_* workflow.',
      ].join('\n') }
      : { key: 'fact-check', context: [
        'OMP Enhancer Core gate is still open for this fact-checking task.',
        'Run the fact-checking workflow before finishing: fact_check_analyze, independent fact_check_evidence lanes when sources are available, fact_check_report, then fact_check_gate.',
        'The final answer must distinguish supported, contradicted, insufficient, and stale claims. Include FACT_CHECK_PLAN, FACT_EVIDENCE_A, FACT_EVIDENCE_B when required, FACT_CROSS_CHECK, FACT_REVIEW, FACT_CHECK_REPORT, FACT_CHECK_USAGE, SKILL_USAGE, and SUBAGENT_USAGE when subagents are routed.',
        formatRecentToolFailures(state, ['fact_check_gate']),
      ].filter(Boolean).join('\n') });
  }

  if (needsWritingQuality(route) && !state?.evidence?.writingQuality) {
    contexts.push({ key: 'writing-qa', context: [
      'OMP Enhancer Core gate is still open for this writing task.',
      'Run writing QA before finishing. Use writing_quality_check or writing_logic_check, and make sure SKILL_USAGE lists the required writing skills such as plain-chinese-writing when required.',
      formatRecentToolFailures(state, ['writing_quality_check', 'writing_logic_check']),
    ].filter(Boolean).join('\n') });
  }

  if (needsTesting(route) && !state?.evidence?.testingGate) {
    if (isExactTestExecution(route)) {
      contexts.push({ key: 'testing', context: [
        'OMP Enhancer Core exact-test evidence is still open.',
        `Use read to inspect runner configuration, then execute one direct host command naming only ${(route.taskDescriptor?.testExecutionTargets ?? []).join(', ')} and report the observed result.`,
        'Do not run aggregate aliases, additional test targets, pipelines, redirections, runner preloads, or generated test cases.',
        formatRecentToolFailures(state, ['omp_test_gate']),
      ].filter(Boolean).join('\n') });
    } else if (route.intent === 'implementation-with-tests') {
      contexts.push({ key: 'testing', context: [
        'OMP Enhancer Core gate is still open for this implementation testing task.',
        'Review is not the terminal phase. After plan, implementation-task, and reviewer have returned, switch to the post-review testing checkpoint before finishing.',
        'Post-review testing checkpoint: resolve reviewer blockers or report BLOCKERS, load any root skills needed for direct testing tools, run the relevant local test commands, then run omp_test_analyze, omp_test_context, omp_test_gate, and omp_test_report.',
        'If omp_test_* tools are unavailable in this runtime, do not loop on missing tool calls; run the local test commands and close with a manual testing gate report covering indirect-test, test-file-scope, browser-interaction, browser-visual, and test-command evidence.',
        'Do not finish with only reviewer approval. When omp_test_* tools are available, first produce a successful host-observed test command result, then close the testing checkpoint with a successful omp_test_gate result and SKILL_USAGE evidence; omp_test_gate never executes a command from its arguments or project config. Otherwise the manual testing gate report closes the fallback path.',
        formatRecentToolFailures(state, ['omp_test_gate']),
      ].filter(Boolean).join('\n') });
    } else {
      contexts.push({ key: 'testing', context: [
        'OMP Enhancer Core gate is still open for this bug-audit or implementation testing task.',
        'Run the testing-enhancer workflow and finish with omp_test_gate. Use omp_test_analyze and omp_test_context first; for bug-audit, build and execute a deduplicated test matrix instead of relying on static analysis alone. Call omp_test_browser_check only when browserPlan exists, omp_test_coverage_analyze only when a coverage report exists, and omp_test_mutation_context only when a mutation report exists. Keep SKILL_USAGE evidence in the final response.',
        'If omp_test_* tools are unavailable in this runtime, do not loop on missing tool calls; run the local test commands and close with a manual testing gate report covering generated/executed/skipped cases and the testing gate evidence.',
        formatRecentToolFailures(state, ['omp_test_gate']),
      ].filter(Boolean).join('\n') });
    }
  }

  return contexts;
}

function workflowGateBriefingLines(route) {
  return [
    '### Workflow and Gate Briefing',
    '',
    `Routed intent: ${route.intent}`,
    `Routed workflow: ${workflowFor(route)}`,
    `Routed boundary: ${stripRouteBoundaryLabel(routeBoundaryFor(route))}`,
    '',
    'Completion gates before final answer:',
    ...completionGateChecklist(route).map((gate) => `- ${gate}`),
    '',
    workflowBriefingScopeLine(route),
  ];
}

export function formatWorkflowGateBriefingForAssignment(route) {
  if (!route || route.intent === 'unknown') return '';
  return [
    'Workflow and gate briefing:',
    `Parent intent: ${route.intent}`,
    `Parent workflow: ${workflowFor(route)}`,
    `Parent boundary: ${stripRouteBoundaryLabel(routeBoundaryFor(route))}`,
    'Parent completion gates before final answer:',
    ...completionGateChecklist(route).map((gate) => `- ${gate}`),
    'Subagent scope: read this before acting, complete only this assigned checkpoint, and return evidence or BLOCKERS. Do not claim the parent workflow is complete.',
  ].join('\n');
}

function completionGateChecklist(route) {
  const gates = [];
  const requiredSubagents = route.requiredSubagents ?? [];

  if (isReadOnlyCodeReview(route)) {
    gates.push('Read-only review boundary: report file and symbol evidence without running tests or repairing test evidence.');
  }

  if (requiredSubagents.length) {
    gates.push(`Native subagent gate: fork ${requiredSubagents.map(({ agent }) => agent).join(', ')} with their role skill contracts and finish with SUBAGENT_USAGE.`);
  }

  if (route.intent === 'implementation-with-tests' && needsTesting(route)) {
    gates.push('Review-to-testing gate: reviewer approval is followed by the post-review testing checkpoint; reviewer approval alone is not enough.');
  }

  if (routeRequiresGate(route, 'review-evidence')) {
    gates.push([
      'Review evidence gate: complete the routed reviewer checkpoint, or for a focused main-agent change include this exact multiline block after the static review:',
      'REVIEW_EVIDENCE',
      'Scope: <reviewed target and change>',
      'Findings: <concrete static review findings>',
      'OpenBlockers: none',
      'Verdict: PASS',
    ].join('\n'));
  }

  if (needsTesting(route)) {
    gates.push(isExactTestExecution(route)
      ? `Exact test evidence gate: use read for runner configuration, execute one direct host command naming only ${(route.taskDescriptor?.testExecutionTargets ?? []).join(', ')}, and report that observed result; do not run additional targets or aggregate aliases.`
      : 'Testing gate: run relevant local test/build/lint commands through an explicit host tool call, then omp_test_analyze, omp_test_context, omp_test_gate, and omp_test_report before final claims. omp_test_gate only validates route-scoped host evidence and never executes its testCommand/config command. If omp_test_* tools are unavailable, provide an equivalent manual testing gate report with concrete local command evidence.');
  }

  if (needsWritingQuality(route)) {
    gates.push('Writing QA gate: run writing_logic_check or writing_quality_check before final writing claims.');
  }

  if (route.intent === 'bug-audit' && needsTesting(route)) {
    gates.push(isFocusedBugAuditRoute(route)
      ? 'Focused audit gate: generate and run a compact bounded test matrix before the focused BUG-AUDIT-REPORT.'
      : 'Bug-audit gate: generate, deduplicate, execute, and report high-signal test cases before BUG-AUDIT-REPORT claims.');
  }

  if (route.intent === 'fact-check') {
    gates.push(isFocusedLocalFactInspection(route)
      ? 'Local fact-evidence gate: run one built-in grep over the repository root with a concrete claim-related pattern, then report supported, contradicted, or insufficient evidence without external research.'
      : 'Fact-check gate: plan claims, collect independent evidence lanes when sources are available, cross-check agreement and conflicts, review overclaiming, then run fact_check_gate before final factual claims.');
  }

  if (route.intent === 'security-review' || routeRequiresGate(route, 'security-evidence')) {
    gates.push(isReadOnlySecurityReview(route)
      ? [
        'Security evidence gate: after loading the two required security skills and inspecting the requested source scope, include this exact multiline block:',
        'SECURITY_REVIEW',
        'Scope: <reviewed file and any callers actually inspected>',
        'Findings: <supported findings, or none confirmed in the inspected scope>',
        'Evidence: <concrete boundary, caller, or sink evidence; a function name or missing validation alone is insufficient>',
        'OpenBlockers: none',
        'Verdict: COMPLETE',
      ].join('\n')
      : 'Security gate: complete security risk analysis first; remediation or final risk claims must be checked by the reviewer role when changes are in scope.');
  }

  if (route.intent === 'config-assets') {
    gates.push('Config gate: use the config doctor/assets/plan tools as relevant, then have config-librarian and reviewer evidence before config or marketplace claims.');
  }

  if (route.intent === 'diagnosis') {
    gates.push('Diagnosis gate: inspect the concrete failure path and explain root cause before proposing or making fixes.');
  }

  if (route.intent === 'release' || routeRequiresGate(route, 'release-approval')) {
    gates.push('Release gate: verify repository state and the requested packaging, push, marketplace, or upgrade checks before release claims.');
  }

  if (!gates.length) {
    gates.push('No additional plugin-specific tool gate beyond the route boundary and final evidence requirements.');
  }

  gates.push('Final evidence gate: final assistant answer text includes SKILL_USAGE, and includes SUBAGENT_USAGE when routed subagents are required; successful validator tool calls can satisfy internal gates, while final blocks remain required user-visible evidence.');
  return gates;
}

function workflowBriefingScopeLine(route) {
  return (route.requiredSubagents ?? []).length
    ? 'Every task subagent must read this briefing before acting, complete only its assigned checkpoint, and return evidence instead of claiming the parent workflow is complete.'
    : 'No task subagent is required for this route; the main agent owns the workflow gates directly.';
}

function stripRouteBoundaryLabel(value = '') {
  return String(value).replace(/^Route boundary:\s*/i, '').trim();
}

function reviewToTestingHandoffLines(route) {
  if (route.intent !== 'implementation-with-tests' || !needsTesting(route)) return [];
  return [
    '### Review-to-Testing Handoff',
    '',
    'Implementation routes have two separate quality checkpoints: semantic review first, deterministic testing second.',
    '',
    'Required order:',
    '- plan produces or confirms the implementation plan.',
    '- implementation-task applies the code and test changes.',
    '- reviewer checks the resulting diff for semantic regressions and blockers.',
    '- main agent resolves reviewer blockers or reports BLOCKERS.',
    '- main agent then switches to testing: run the relevant local test command(s), omp_test_analyze, omp_test_context, omp_test_gate, and omp_test_report.',
    '',
    'Reviewer approval does not close the testing gate. Do not produce a final answer until the post-review testing checkpoint has run and omp_test_gate has passed.',
  ];
}

function formatRecentToolFailures(state, toolNames = []) {
  const failures = state?.evidence?.toolFailures;
  if (!Array.isArray(failures)) return null;
  const allowed = new Set(toolNames);
  const relevant = failures.filter((failure) => allowed.has(failure.tool));
  if (!relevant.length) return null;
  return [
    'Recent failed tool results:',
    ...relevant.map((failure) => {
      const details = [failure.summary, failure.message, failure.repairHint ? `Repair: ${failure.repairHint}` : null]
        .filter(Boolean)
        .join(' ');
      const attempts = Number.isInteger(failure.attempts) && failure.attempts > 1 ? ` (${failure.attempts} attempts)` : '';
      return `- ${failure.tool}${attempts}: ${details || 'tool returned a failed result'}`;
    }),
  ].join('\n');
}

function workflowNextLines(route, parentTask = '') {
  const firstSkill = route.requiredSkills?.[0];
  const delegatesWork = Boolean(route.requiredSubagents?.length);
  const nextAction = firstSkill && delegatesWork
    ? `Next action: load skill://${firstSkill} into the first routed subagent task assignment before acting.`
    : firstSkill
      ? `Next action: read skill://${firstSkill} before acting, then follow the route card.`
      : 'Next action: follow the route card using the selected tools.';
  const constrainedProbe = isConstrainedRouteStatusSkillPrompt(parentTask);
  return [
    'WORKFLOW_NEXT',
    nextAction,
    ...(constrainedProbe ? [
      'User constraint: route/status/skill checks only.',
      'Do not call eval, bash, task, edit, write, project QA tools, or test commands while this constraint is active.',
      'If compact JSON is requested, return one raw single JSON object with no Markdown fence, without Markdown fences, without a preface, and without trailing explanation.',
      'Do not repeat SKILL_USAGE, SUBAGENT_USAGE, or evidence blocks inside compact JSON route/status/skill check responses; encode only the compact fields the user requested.',
    ] : []),
    'Soft guidance: keep this to one immediate action and adjust only when tool evidence conflicts.',
    '',
    'WORKFLOW_CONTEXT',
  ];
}

function isConstrainedRouteStatusSkillPrompt(prompt = '') {
  const text = String(prompt).toLowerCase();
  const limitsTools = /(?:route\/status\/skill|route.*status.*skill|omp_core_route_task.*omp_core_subagent_status|omp_core_subagent_status.*omp_core_route_task)/.test(text);
  const avoidsStatefulWork = /(?:do not modify|do not run tests|do not fork|不修改|不运行测试|不跑测试|不\s*fork)/.test(text);
  return limitsTools && avoidsStatefulWork;
}

function workflowFor(route) {
  const intent = route.intent;
  if (isFocusedLocalFactInspection(route)) return 'Focused local fact workflow: read the claim -> search repository evidence -> separate the claim from independent support -> report supported, contradicted, or insufficient evidence without external research.';
  if (isExactTestExecution(route)) return `Exact test target workflow: inspect runner configuration with read -> run one direct command naming only ${(route.taskDescriptor?.testExecutionTargets ?? []).join(', ')} -> report the host-observed result without generating additional tests.`;
  if (isReadOnlySecurityReview(route)) return 'Focused read-only security workflow: load security-review and security-scan -> inspect the requested file and direct local callers -> separate code facts from unsupported threat assumptions -> emit SECURITY_REVIEW evidence without edits or tests.';
  if (isReadOnlyCodeReview(route)) return 'Read-only code review workflow: inspect the requested file and directly related code -> collect concrete file and symbol evidence -> report findings without test execution or test-evidence repair.';
  if (isCodeModificationWithoutTests(route)) {
    const actors = (route.requiredSubagents ?? []).map(({ agent }) => agent).filter(Boolean);
    const releaseRequired = routeRequiresGate(route, 'release-approval')
      || route.taskDescriptor?.constraints?.externalWrite === 'required';
    const actorStep = actors.length ? ` -> delegate the routed checkpoints (${actors.join(', ')})` : '';
    const releaseStep = releaseRequired ? ' -> perform the explicitly authorized release -> independently verify the exact released target and immutable version or revision' : '';
    return `No-test code modification workflow: inspect the authorized scope${actorStep} -> apply the authorized change -> use static review evidence${releaseStep} -> report the untested change explicitly.`;
  }
  if ((intent === 'writing.zh' || intent === 'writing.en') && !(route.requiredSubagents ?? []).length) {
    return 'Writing workflow: lightweight edit handled directly by the main agent after required skills are loaded.';
  }
  if (intent === 'writing.zh') return 'Writing workflow: for simple writing, the main agent edits directly; for complex writing, zh-writer -> zh-checker -> writing_quality_check.';
  if (intent === 'writing.en') return 'Writing workflow: for simple writing, the main agent edits directly; for complex writing, writer -> checker -> writing_quality_check.';
  if (intent === 'bug-audit' && isFocusedBugAuditRoute(route)) return 'Focused bug audit workflow: preload focused audit skills -> inspect the bounded failure path directly -> generate and run the smallest high-signal local test matrix -> omp_test_analyze -> omp_test_context -> conditional browser, coverage, and mutation checks from testing-enhancer -> omp_test_gate -> omp_test_report -> focused BUG-AUDIT-REPORT.';
  if (intent === 'bug-audit') return 'Bug audit workflow: ecc-tdd-guide generates a deduplicated multi-channel executable test matrix -> ecc-code-reviewer static audit -> ecc-silent-failure-hunter failure-path audit -> ecc-pr-test-analyzer checks generated tests, duplicate removal, execution results, and coverage gaps -> omp_test_analyze -> omp_test_context -> conditional browser, coverage, and mutation checks from testing-enhancer -> omp_test_gate -> omp_test_report -> BUG-AUDIT-REPORT or final bug report.';
  if (intent === 'fact-check') return 'Fact-check workflow: fact-planner -> fact-researcher-a and fact-researcher-b independent evidence lanes -> fact-cross-checker -> fact-reviewer -> fact_check_analyze -> fact_check_evidence as needed -> fact_check_report -> fact_check_gate -> FACT_CHECK_REPORT.';
  if (intent === 'testing') return 'Legacy testing intent: use the merged bug-audit workflow and testing-enhancer toolchain.';
  if (intent === 'implementation-with-tests') return 'Coding workflow: plan -> implementation-task -> reviewer -> post-review testing checkpoint -> local test commands -> omp_test_analyze -> omp_test_context -> conditional browser, coverage, and mutation checks from testing-enhancer -> omp_test_gate -> omp_test_report.';
  if (intent === 'security-review') return 'Security workflow: ecc-security-reviewer -> reviewer -> fix or report only after risk evidence is checked.';
  if (intent === 'config-assets') return 'Config workflow: use omp_config_doctor, omp_config_assets, or omp_config_plan as needed.';
  if (intent === 'diagnosis') return 'Diagnosis workflow: inspect the reported failure and explain root cause first; do not modify files unless the user asks for a fix.';
  if (intent === 'release') return 'Release workflow: verify repository status, run the relevant packaging or marketplace checks, then execute the requested push, publish, upgrade, or release step.';
  return 'Workflow: use the selected agent and tools.';
}

function routeBoundaryFor(route) {
  const intent = route.intent;
  if (isExactTestExecution(route)) {
    const descriptor = route.taskDescriptor ?? {};
    const targets = descriptor.testExecutionTargets ?? [];
    const constraints = descriptor.constraints ?? {};
    const extras = [
      constraints.workspaceWrite === 'forbidden' ? 'workspace writes' : null,
      constraints.networkAccess === 'forbidden' ? 'network access' : null,
      constraints.subagents === 'forbidden' ? 'subagents' : null,
      constraints.externalWrite !== 'required' ? 'external writes' : null,
    ].filter(Boolean);
    return `Route boundary: execute only the complete exact test target list ${targets.join(', ')}. Use read for configuration inspection and one direct command naming every target once and in order; aggregate tests, omitted or substituted targets, pipelines, redirections, and runner preloads are outside scope.${extras.length ? ` ${extras.join(', ')} remain forbidden.` : ''}`;
  }
  if (isReadOnlySecurityReview(route)) {
    return 'Route boundary: this is a read-only, local security review. Use read-only tools, inspect the requested source scope and direct callers, and report only supported findings; do not edit, run tests, use the network, delegate, or release.';
  }
  if (isReadOnlyCodeReview(route)) {
    return 'Route boundary: this is a read-only code review. Test execution is forbidden; do not run test commands, create test files, enter a testing workflow, or edit production code. Report only evidence from permitted read operations.';
  }
  if (isCodeModificationWithoutTests(route)) {
    const descriptor = route.taskDescriptor ?? {};
    const constraints = descriptor.constraints ?? {};
    const targets = route.taskDescriptor?.workspaceWriteTargets ?? [];
    const forbidden = [
      'test execution',
      constraints.networkAccess === 'forbidden' ? 'network access' : null,
      constraints.subagents === 'forbidden' ? 'subagents' : null,
      constraints.externalWrite !== 'required' ? 'external writes' : null,
    ].filter(Boolean);
    const scope = targets.length ? targets.join(', ') : 'the explicitly authorized workspace scope';
    const releaseBoundary = constraints.externalWrite === 'required'
      ? ' External writes are limited to the explicitly authorized release target and require independent post-release verification.'
      : '';
    return `Route boundary: this is a ${descriptor.complexity === 'broad' ? 'routed' : 'focused'} code modification. Edit only ${scope}; ${forbidden.join(', ')} ${forbidden.length === 1 ? 'is' : 'are'} forbidden.${releaseBoundary} Use static review and state that the change was not test-executed.`;
  }
  if ((intent === 'writing.zh' || intent === 'writing.en') && !(route.requiredSubagents ?? []).length) {
    return 'Route boundary: this is a lightweight writing workflow. The main agent must load the required writing skill(s), edit directly, and must not fork writer/checker subagents.';
  }
  if (intent === 'writing.zh' || intent === 'writing.en') {
    return 'Route boundary: this is a writing workflow. Do not call omp_test_* tools unless a separate routed code/testing task is created later.';
  }
  if (intent === 'bug-audit') {
    return 'Route boundary: this is a bug audit workflow. Test-case files, disposable harnesses, and command invocations are allowed when needed for audit verification, but production-code fixes require a separate user request. Do not turn audit findings into production code edits without a fix request. The omp_test_* tools are owned by omp-testing-enhancer; core only routes to them and listens for their results.';
  }
  if (intent === 'fact-check' && !isFocusedLocalFactInspection(route)) {
    return 'Route boundary: this is a factual verification workflow. Read, search, cite, and report evidence; do not rewrite the source document or change project files unless the user explicitly asks for edits.';
  }
  if (isFocusedLocalFactInspection(route)) {
    return 'Route boundary: use only local read/search tools to evaluate repository evidence. Do not treat the claim itself as corroboration, and do not edit, test, browse, delegate, or release.';
  }
  if (intent === 'testing' || intent === 'implementation-with-tests') {
    return 'Route boundary: this is a code/testing workflow. Use the omp-testing-enhancer tools only after routed test or implementation work has actually been performed.';
  }
  return 'Route boundary: use only the tools listed for this route unless the user explicitly changes the task.';
}

function bugAuditTestGenerationLines(route) {
  if (route.intent !== 'bug-audit' || !needsTesting(route)) return [];

  if (isFocusedBugAuditRoute(route)) {
    return [
      '### Focused Bug Audit Test Generation Contract',
      '',
      'Static analysis alone is not sufficient. Generate and run a compact, high-signal test matrix for the bounded failure path before final claims.',
      '',
      'Required focused channels:',
      '- Local code summary: summarize the target block, public contracts, invariants, branches, state transitions, and existing tests before generating cases.',
      '- Local evidence: mine existing tests, failures, logs, fixtures, issue text in the checkout, and similar modules for missing behaviors.',
      '- Model-derived adversarial cases: generate negative, malformed, boundary, regression, and error-propagation cases from the summarized behavior.',
      '',
      'Scope control:',
      '- Do not launch the full bug-audit subagent workflow unless the user broadens the task.',
      '- Deduplicate by behavior signature and run the smallest set that can confirm or falsify the suspected bug.',
      '- Report generated, executed, skipped, and duplicate-removed case counts in the focused BUG-AUDIT-REPORT.',
    ];
  }

  return [
    '### Bug Audit Test Generation Contract',
    '',
    'Static analysis alone is not sufficient for bug-audit. Before final claims, generate and run as many high-signal, non-duplicate test cases as the target and budget allow.',
    '',
    'Required generation channels:',
    '- Local code summary: summarize the target block, public contracts, invariants, branches, state transitions, and existing tests before generating cases.',
    '- Local evidence: mine existing tests, coverage, failures, logs, fixtures, issue text in the checkout, and similar modules for missing behaviors.',
    '- External or knowledge evidence: when search or web_search is available, look up comparable implementations, framework docs, public test examples, and common failure patterns; when unavailable, state the skipped channel and use packaged skills plus model knowledge without pretending web evidence was checked.',
    '- Model-derived adversarial cases: generate negative, malformed, property-style, concurrency, and regression cases from the summarized behavior.',
    '',
    'Required coverage dimensions:',
    '- Boundary values, empty/null/undefined inputs, malformed types, unicode/special characters, invalid config, missing dependencies, and error propagation.',
    '- Different loads and operating conditions: large inputs, repeated calls, concurrency/races, timeout/retry behavior, feature flags, environment/config modes, browser/device modes when UI is in scope, and degraded dependency behavior.',
    '',
    'Deduplication contract:',
    '- Deduplicate by behavior signature: target path, invariant, input class, operating condition, and expected outcome.',
    '- Merge overlapping cases before writing or running tests; keep the strongest assertion and remove no-op or assertion-light duplicates.',
    '- Report generated, executed, skipped, and duplicate-removed case counts in BUG-AUDIT-REPORT or the final bug report.',
  ];
}

function subagentWorkflowLines(route, { parentTask = '', includeModelWorkflowHints = true } = {}) {
  const requiredSubagents = route.requiredSubagents ?? [];
  const common = [
    '### Mandatory Subagent Workflow',
    '',
    ...(includeModelWorkflowHints ? [
      'Runtime model policy: use the active OMP configuration for main/default, advisor, Tiny, task subagents, and all other model roles without binding the prompt to a specific model name unless this route names explicit subagent model roles or the user explicitly overrides a role.',
      '',
      'Classifier model policy: ambiguous routing uses OMP Tiny (`modelRoles.tiny`) instead of a separate classifier role. A valid, high-confidence classifier route that resolves through the OMP route whitelist supersedes the deterministic rule route before assigning skills, tools, or subagents.',
      '',
      'Smart gate policy: workflow gates are rule-first but Tiny-reviewed when a rule gate remains open. If a deterministic gate blocks a tool call or final answer despite concrete evidence, call `omp_core_smart_gate_prompt`, use OMP Tiny (`modelRoles.tiny`) for strict JSON, then call `omp_core_resolve_smart_gate`; only a validated pass may release the blocked gate. Treat needs-work as local follow-up, not BLOCKERS; report BLOCKERS only for real external blockers such as missing credentials, inaccessible files/services, permission limits, or required user-provided input.',
      '',
    ] : []),
  ];

  if (!requiredSubagents.length) {
    return [
      ...common,
      'No routed subagents are required for this route. The main agent should do the work directly after loading required skills.',
      'Do not fork writer, checker, zh-writer, or zh-checker for lightweight writing edits unless the user explicitly expands the task into a larger writing job.',
      '',
      'Required subagents:',
      '- none',
      '',
      '### Pre-fork Subagent Contract',
      '',
      'No routed subagents are required.',
      '',
      'SUBAGENT_USAGE is not required for this route.',
    ];
  }

  return [
    ...common,
    'Use a subagent-driven workflow for routed work. Before doing non-trivial implementation, testing, writing, security, or config work yourself, fork the listed roles with the OMP task tool so OMP can render native subagent TUI status lines. Call task once per distinct agent role; if several items share one agent, use the batch task shape.',
    'If this environment does not expose the native task/completion tool, do not loop on unavailable tooling. Complete the assigned checkpoints directly, then close the gate with a complete SUBAGENT_USAGE block and each required SUBAGENT_RESULT evidence block.',
    '',
    'When calling task, set each task item `role` or `agent` to the exact required subagent name, such as `writer`, `checker`, `zh-writer`, or `zh-checker`. Do not use generic `task` as the only role for required subagents.',
    '',
    'Do not read `agent://<agent-name>` to inspect or launch a required agent. `agent://` names completed subagent outputs, not callable agent types. Use the task tool to launch required agent types, then read `agent://<task-id>` only after that subagent has returned output.',
    '',
    'Give every task item a short `description` or first assignment line that names the subagent duty; this is the text OMP can show after the subagent name in its native status display. Keep it specific and under 100 characters.',
    '',
    'When forking each subagent, include that subagent-specific skill list and any listed model role hints in the task prompt. Tell the subagent to read the listed skill URI for each required skill before acting and to report which skills it loaded.',
    '',
    'Required subagents:',
    formatSubagents(requiredSubagents),
    '',
    '### Pre-fork Subagent Contract',
    '',
    'Before calling task, prepare each subagent assignment with the matching contract below. Copy the required role, required skills, and final output block into the task assignment before forking so the subagent does not need to infer the gate format.',
    '',
    formatPreforkSubagentContracts(requiredSubagents, { parentTask, route }),
    '',
    'After the task call returns, the main agent must include this exact subagent evidence block in the routed final output:',
    '',
    formatSubagentUsageBlock(requiredSubagents),
  ];
}

function isFocusedBugAuditRoute(route) {
  return route?.intent === 'bug-audit' && route.auditMode === 'focused';
}

function isReadOnlyCodeReview(route) {
  const descriptor = route?.taskDescriptor;
  return descriptor?.operation === 'inspect'
    && Array.isArray(descriptor.domains)
    && descriptor.domains.includes('code')
    && !descriptor.domains.includes('security')
    && descriptor.constraints?.workspaceWrite === 'forbidden'
    && descriptor.constraints?.testExecution === 'forbidden';
}

function isReadOnlySecurityReview(route) {
  const descriptor = route?.taskDescriptor;
  return descriptor?.operation === 'inspect'
    && Array.isArray(descriptor.domains)
    && descriptor.domains.includes('security')
    && descriptor.constraints?.workspaceWrite === 'forbidden'
    && descriptor.constraints?.testExecution === 'forbidden'
    && descriptor.constraints?.subagents === 'forbidden';
}

function isFocusedLocalFactInspection(route) {
  const descriptor = route?.taskDescriptor;
  return descriptor?.operation === 'inspect'
    && descriptor.domains?.includes('facts')
    && descriptor.complexity === 'focused'
    && descriptor.constraints?.workspaceWrite === 'forbidden'
    && descriptor.constraints?.networkAccess === 'forbidden'
    && descriptor.constraints?.externalWrite === 'forbidden'
    && descriptor.constraints?.subagents === 'forbidden';
}

function isExactTestExecution(route) {
  const descriptor = route?.taskDescriptor;
  return descriptor?.operation === 'execute'
    && descriptor.constraints?.testExecution === 'required'
    && Array.isArray(descriptor.testExecutionTargets)
    && descriptor.testExecutionTargets.length > 0
    && (descriptor.phases ?? []).every(({ kind }) => kind === 'verify');
}

function isCodeModificationWithoutTests(route) {
  const descriptor = route?.taskDescriptor;
  return ['modify', 'create'].includes(descriptor?.operation)
    && Array.isArray(descriptor.domains)
    && descriptor.domains.includes('code')
    && descriptor.constraints?.workspaceWrite === 'required'
    && descriptor.constraints?.testExecution === 'forbidden';
}

function routeRequiresGate(route, key) {
  return (route?.routePlan?.gateRequirements ?? [])
    .some((gate) => gate?.key === key && gate?.mode === 'required');
}

function formatList(values = []) {
  if (!values.length) return '- none';
  return values.map((value) => `- ${value}`).join('\n');
}

function formatSubagents(values = []) {
  if (!values.length) return '- none';
  return values.map((value) => {
    if (typeof value === 'string') return `- ${value}`;
    const skills = value.requiredSkills?.length ? value.requiredSkills.join(', ') : 'none';
    const modelRoles = value.modelRoles?.length ? `; model roles: ${value.modelRoles.join(', ')}` : '';
    return `- ${value.agent}: ${value.duty}; skills: ${skills}${modelRoles}`;
  }).join('\n');
}

function formatPreforkSubagentContracts(values = [], { parentTask = '', route = null } = {}) {
  const subagents = normalizeSubagentValues(values);
  if (!subagents.length) return 'No routed subagents are required.';
  const parentTaskLine = formatParentTaskLine(parentTask);
  const workflowBriefing = formatWorkflowGateBriefingForAssignment(route);

  return subagents.map(({ agent, requiredSkills, modelRoles }) => [
    `Subagent: ${agent}`,
    'Task item fields:',
    `- role: ${agent}`,
    `- agent: ${agent}`,
    '- description: short duty text for OMP native subagent status',
    ...(modelRoles.length ? [`- model role hint: ${modelRoles.join(' -> ')}`] : []),
    'Assignment must start with:',
    `OMP_REQUIRED_SUBAGENT: ${agent}`,
    parentTaskLine,
    ...(modelRoles.length ? [
      `OMP_MODEL_ROLE_HINT: ${modelRoles.join(' -> ')}`,
      'Use the first available listed OMP model role for this subagent; do not silently downgrade to the generic task role unless those roles are unavailable.',
    ] : []),
    ...(workflowBriefing ? [workflowBriefing] : []),
    'Required skills for this subagent:',
    formatList(requiredSkills),
    'Before acting:',
    formatSubagentSkillReadSteps(requiredSkills),
    '- In SKILL_USAGE Required, keep the canonical names above. In Loaded, list the exact skill names successfully read; accepted aliases are valid evidence.',
    '- Do not fork another OMP Enhancer Core role gate unless explicitly asked.',
    'Final subagent output must end with:',
    'SKILL_USAGE',
    'Required:',
    formatList(requiredSkills),
    'Loaded:',
    formatList(requiredSkills),
    'SUBAGENT_RESULT',
    `Agent: ${agent}`,
    'Status: complete|blocked',
  ].join('\n')).join('\n\n');
}

function formatParentTaskLine(parentTask = '') {
  const cleaned = String(parentTask).replace(/\s+/g, ' ').trim();
  return `OMP_PARENT_TASK: ${cleaned ? cleaned.slice(0, 300) : '<copy the original user task here>'}`;
}

function formatSubagentSkillReadSteps(requiredSkills = []) {
  if (!requiredSkills.length) return '- No skill reads are required for this subagent.';
  return requiredSkills.map((skill) => {
    const candidates = skillReadNameCandidates(skill, { limit: 3 });
    const preferred = candidates[0] ?? skill;
    const aliasNote = preferred !== skill ? ` (accepted alias for ${skill})` : '';
    const fallbackUris = preferred !== skill
      ? candidates.slice(1).filter((candidate) => candidate && candidate !== preferred).map((candidate) => `skill://${candidate}`)
      : [];
    const fallbackNote = fallbackUris.length ? ` Fallbacks accepted: ${fallbackUris.join(', ')}.` : '';
    return `- Read \`skill://${preferred}\`${aliasNote}.${fallbackNote}`;
  }).join('\n');
}

function formatSubagentUsageBlock(values = []) {
  const subagents = normalizeSubagentValues(values);
  if (!subagents.length) return 'SUBAGENT_USAGE:\n- none';

  return [
    'SUBAGENT_USAGE:',
    ...subagents.map(({ agent, requiredSkills }) => `- ${agent}: ${requiredSkills.join(', ') || 'none'}`),
  ].join('\n');
}

function normalizeSubagentValues(values = []) {
  return values.map((value) => {
    if (typeof value === 'string') return { agent: value, requiredSkills: [], modelRoles: [] };
    return {
      agent: value?.agent,
      requiredSkills: Array.isArray(value?.requiredSkills) ? value.requiredSkills : [],
      modelRoles: Array.isArray(value?.modelRoles) ? value.modelRoles : [],
    };
  }).filter(({ agent }) => agent);
}

function parseSubagentLaunchContract(prompt = '') {
  return {
    agent: parseRequiredSubagent(prompt),
    requiredSkills: parseRequiredSubagentSkills(prompt),
  };
}

function parseRequiredSubagent(prompt = '') {
  const match = String(prompt).match(/OMP_REQUIRED_SUBAGENT:\s*([^\r\n]+)/i);
  return match ? match[1].trim().replace(/[.;,，。]+$/, '') : '';
}

function parseRequiredSubagentSkills(prompt = '') {
  const lines = String(prompt).split(/\r?\n/);
  const start = lines.findIndex((line) => /^Required skills for this subagent:/i.test(line.trim()));
  if (start === -1) return [];

  const skills = [];
  for (const rawLine of lines.slice(start + 1)) {
    const line = rawLine.trim();
    if (!line) {
      if (skills.length) break;
      continue;
    }
    if (/^(Workflow and gate briefing|Before acting|Final subagent output|SUBAGENT_RESULT|SKILL_USAGE|BLOCKERS|Assignment)/i.test(line)) break;
    const match = line.match(/^[-*]\s*(.+)$/);
    if (!match) {
      if (skills.length) break;
      continue;
    }
    const skill = match[1].trim();
    if (skill && skill.toLowerCase() !== 'none') skills.push(skill);
  }
  return skills;
}

function parseWorkflowGateBriefing(prompt = '') {
  const lines = String(prompt).split(/\r?\n/);
  const start = lines.findIndex((line) => /^Workflow and gate briefing:/i.test(line.trim()));
  if (start === -1) return [];

  const collected = [];
  for (const rawLine of lines.slice(start)) {
    const line = rawLine.trimEnd();
    if (collected.length && /^(Required skills for this subagent:|Before acting:|Final subagent output|SUBAGENT_RESULT|SKILL_USAGE|BLOCKERS:|Assignment:)/i.test(line.trim())) break;
    collected.push(line);
  }

  return collected.map((line) => line.trim()).filter(Boolean);
}

function needsWritingQuality(route) {
  if (useEnforcedRoutePlan(route)) {
    return (route.routePlan.gateRequirements ?? [])
      .some((gate) => gate.key === 'writing-quality' && gate.mode === 'required');
  }
  return (route.intent === 'writing.zh' || route.intent === 'writing.en')
    && (route.requiredTools ?? []).some((tool) => tool === 'writing_quality_check' || tool === 'writing_logic_check');
}

function needsTesting(route) {
  if (route?.taskDescriptor?.constraints?.testExecution === 'forbidden') return false;
  if (useEnforcedRoutePlan(route)) {
    return (route.routePlan.gateRequirements ?? [])
      .some((gate) => gate.key === 'test-evidence' && gate.mode === 'required');
  }
  return route.intent === 'testing'
    || (route.intent === 'implementation-with-tests' || route.intent === 'bug-audit')
      && (route.requiredTools ?? []).some((tool) => /^omp_test_/i.test(tool));
}

function needsFactCheck(route) {
  if (useEnforcedRoutePlan(route)) {
    return (route.routePlan.gateRequirements ?? [])
      .some((gate) => gate.key === 'fact-evidence' && gate.mode === 'required');
  }
  return route.intent === 'fact-check';
}
