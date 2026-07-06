import { loopGuardPromptSection } from './loop-guard.js';
import { skillReadNameCandidates } from './skill-usage.js';

export function buildGovernancePromptFragment({ route, parentTask = '' } = {}) {
  const resolved = route ?? {
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
    '',
    ...workflowGateBriefingLines(resolved),
    '',
    loopGuardPromptSection(),
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
    ...subagentWorkflowLines(resolved, { parentTask }),
    '',
    ...reviewToTestingHandoffLines(resolved),
    '',
    ...bugAuditTestGenerationLines(resolved),
    '',
    workflowFor(resolved),
    '',
    '### SUBAGENT_USAGE contract',
    '',
    'Final routed outputs that list required subagents must include:',
    'Put this block in the final assistant answer text. A successful omp_core_validate_subagent_usage tool call is only a preflight and does not replace the closing SUBAGENT_USAGE block.',
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

function skillWorkflowLines(route) {
  const hasSubagents = (route.requiredSubagents ?? []).length > 0;
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
    'Before doing the routed work, call the read tool once for each required skill using the exact URI `skill://<skill-name>`. Wait for those reads to finish before acting. If a required skill is unavailable, state that explicitly and do not pretend it was loaded.',
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
  if (!route || route.intent === 'unknown') return null;

  if (needsWritingQuality(route) && !state?.evidence?.writingQuality) {
    return [
      'OMP Enhancer Core gate is still open for this writing task.',
      'Run writing QA before finishing. Use writing_quality_check or writing_logic_check, and make sure SKILL_USAGE lists the required writing skills such as plain-chinese-writing when required.',
      formatRecentToolFailures(state, ['writing_quality_check', 'writing_logic_check']),
    ].filter(Boolean).join('\n');
  }

  if (needsTesting(route) && !state?.evidence?.testingGate) {
    if (route.intent === 'implementation-with-tests') {
      return [
        'OMP Enhancer Core gate is still open for this implementation testing task.',
        'Review is not the terminal phase. After plan, implementation-task, and reviewer have returned, switch to the post-review testing checkpoint before finishing.',
        'Post-review testing checkpoint: resolve reviewer blockers or report BLOCKERS, load any root skills needed for direct testing tools, run the relevant local test commands, then run omp_test_analyze, omp_test_context, omp_test_gate, and omp_test_report.',
        'Do not finish with only reviewer approval. The testing gate closes only after a successful omp_test_gate result, with SKILL_USAGE evidence in the final response.',
        formatRecentToolFailures(state, ['omp_test_gate']),
      ].filter(Boolean).join('\n');
    }

    return [
      'OMP Enhancer Core gate is still open for this bug-audit or implementation testing task.',
      'Run the testing-enhancer workflow and finish with omp_test_gate. Use omp_test_analyze and omp_test_context first; for bug-audit, build and execute a deduplicated test matrix instead of relying on static analysis alone. Call omp_test_browser_check only when browserPlan exists, omp_test_coverage_analyze only when a coverage report exists, and omp_test_mutation_context only when a mutation report exists. Keep SKILL_USAGE evidence in the final response.',
      formatRecentToolFailures(state, ['omp_test_gate']),
    ].filter(Boolean).join('\n');
  }

  return null;
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

  if (requiredSubagents.length) {
    gates.push(`Native subagent gate: fork ${requiredSubagents.map(({ agent }) => agent).join(', ')} with their role skill contracts and finish with SUBAGENT_USAGE.`);
  }

  if (route.intent === 'implementation-with-tests') {
    gates.push('Review-to-testing gate: reviewer approval is followed by the post-review testing checkpoint; reviewer approval alone is not enough.');
  }

  if (needsTesting(route)) {
    gates.push('Testing gate: run relevant local test/build/lint commands, then omp_test_analyze, omp_test_context, omp_test_gate, and omp_test_report before final claims.');
  }

  if (needsWritingQuality(route)) {
    gates.push('Writing QA gate: run writing_logic_check or writing_quality_check before final writing claims.');
  }

  if (route.intent === 'bug-audit') {
    gates.push(isFocusedBugAuditRoute(route)
      ? 'Focused audit gate: generate and run a compact bounded test matrix before the focused BUG-AUDIT-REPORT.'
      : 'Bug-audit gate: generate, deduplicate, execute, and report high-signal test cases before BUG-AUDIT-REPORT claims.');
  }

  if (route.intent === 'security-review') {
    gates.push('Security gate: complete security risk analysis first; remediation or final risk claims must be checked by the reviewer role when changes are in scope.');
  }

  if (route.intent === 'config-assets') {
    gates.push('Config gate: use the config doctor/assets/plan tools as relevant, then have config-librarian and reviewer evidence before config or marketplace claims.');
  }

  if (route.intent === 'diagnosis') {
    gates.push('Diagnosis gate: inspect the concrete failure path and explain root cause before proposing or making fixes.');
  }

  if (route.intent === 'release') {
    gates.push('Release gate: verify repository state and the requested packaging, push, marketplace, or upgrade checks before release claims.');
  }

  if (!gates.length) {
    gates.push('No additional plugin-specific tool gate beyond the route boundary and final evidence requirements.');
  }

  gates.push('Final evidence gate: final assistant answer text includes SKILL_USAGE, and includes SUBAGENT_USAGE when routed subagents are required; validator tool calls are preflight only and do not replace the final blocks.');
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
  if (route.intent !== 'implementation-with-tests') return [];
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
      return `- ${failure.tool}: ${details || 'tool returned a failed result'}`;
    }),
  ].join('\n');
}

function workflowFor(route) {
  const intent = route.intent;
  if ((intent === 'writing.zh' || intent === 'writing.en') && !(route.requiredSubagents ?? []).length) {
    return 'Writing workflow: lightweight edit handled directly by the main agent after required skills are loaded.';
  }
  if (intent === 'writing.zh') return 'Writing workflow: for simple writing, the main agent edits directly; for complex writing, zh-writer -> zh-checker -> writing_quality_check.';
  if (intent === 'writing.en') return 'Writing workflow: for simple writing, the main agent edits directly; for complex writing, writer -> checker -> writing_quality_check.';
  if (intent === 'bug-audit' && isFocusedBugAuditRoute(route)) return 'Focused bug audit workflow: preload focused audit skills -> inspect the bounded failure path directly -> generate and run the smallest high-signal local test matrix -> omp_test_analyze -> omp_test_context -> conditional browser, coverage, and mutation checks from testing-enhancer -> omp_test_gate -> omp_test_report -> focused BUG-AUDIT-REPORT.';
  if (intent === 'bug-audit') return 'Bug audit workflow: ecc-tdd-guide generates a deduplicated multi-channel executable test matrix -> ecc-code-reviewer static audit -> ecc-silent-failure-hunter failure-path audit -> ecc-pr-test-analyzer checks generated tests, duplicate removal, execution results, and coverage gaps -> omp_test_analyze -> omp_test_context -> conditional browser, coverage, and mutation checks from testing-enhancer -> omp_test_gate -> omp_test_report -> BUG-AUDIT-REPORT or final bug report.';
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
  if ((intent === 'writing.zh' || intent === 'writing.en') && !(route.requiredSubagents ?? []).length) {
    return 'Route boundary: this is a lightweight writing workflow. The main agent must load the required writing skill(s), edit directly, and must not fork writer/checker subagents.';
  }
  if (intent === 'writing.zh' || intent === 'writing.en') {
    return 'Route boundary: this is a writing workflow. Do not call omp_test_* tools unless a separate routed code/testing task is created later.';
  }
  if (intent === 'bug-audit') {
    return 'Route boundary: this is a bug audit workflow. Test-case files, disposable harnesses, and command invocations are allowed when needed for audit verification, but production-code fixes require a separate user request. Do not turn audit findings into production code edits without a fix request. The omp_test_* tools are owned by omp-testing-enhancer; core only routes to them and listens for their results.';
  }
  if (intent === 'testing' || intent === 'implementation-with-tests') {
    return 'Route boundary: this is a code/testing workflow. Use the omp-testing-enhancer tools only after routed test or implementation work has actually been performed.';
  }
  return 'Route boundary: use only the tools listed for this route unless the user explicitly changes the task.';
}

function bugAuditTestGenerationLines(route) {
  if (route.intent !== 'bug-audit') return [];

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

function subagentWorkflowLines(route, { parentTask = '' } = {}) {
  const requiredSubagents = route.requiredSubagents ?? [];
  const common = [
    '### Mandatory Subagent Workflow',
    '',
    'Runtime model policy: the main/default agent uses MiMo v2.5; the advisor uses DeepSeek V4 Flash. Keep task subagents and all other model roles on the active OMP configuration unless the user explicitly overrides them.',
    '',
    'Classifier model policy: ambiguous routing may use the configured `modelRoles.classifier` role. The packaged config defaults it to `opencode-go/deepseek-v4-flash:medium`. A valid, high-confidence classifier route that resolves through the OMP route whitelist supersedes the deterministic rule route before assigning skills, tools, or subagents.',
    '',
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
    '',
    'When calling task, set each task item `role` or `agent` to the exact required subagent name, such as `writer`, `checker`, `zh-writer`, or `zh-checker`. Do not use generic `task` as the only role for required subagents.',
    '',
    'Give every task item a short `description` or first assignment line that names the subagent duty; this is the text OMP can show after the subagent name in its native status display. Keep it specific and under 100 characters.',
    '',
    'When forking each subagent, include that subagent-specific skill list in the task prompt. Tell the subagent to read the listed skill URI for each required skill before acting and to report which skills it loaded.',
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

function formatList(values = []) {
  if (!values.length) return '- none';
  return values.map((value) => `- ${value}`).join('\n');
}

function formatSubagents(values = []) {
  if (!values.length) return '- none';
  return values.map((value) => {
    if (typeof value === 'string') return `- ${value}`;
    const skills = value.requiredSkills?.length ? value.requiredSkills.join(', ') : 'none';
    return `- ${value.agent}: ${value.duty}; skills: ${skills}`;
  }).join('\n');
}

function formatPreforkSubagentContracts(values = [], { parentTask = '', route = null } = {}) {
  const subagents = normalizeSubagentValues(values);
  if (!subagents.length) return 'No routed subagents are required.';
  const parentTaskLine = formatParentTaskLine(parentTask);
  const workflowBriefing = formatWorkflowGateBriefingForAssignment(route);

  return subagents.map(({ agent, requiredSkills }) => [
    `Subagent: ${agent}`,
    'Task item fields:',
    `- role: ${agent}`,
    `- agent: ${agent}`,
    '- description: short duty text for OMP native subagent status',
    'Assignment must start with:',
    `OMP_REQUIRED_SUBAGENT: ${agent}`,
    parentTaskLine,
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
    if (typeof value === 'string') return { agent: value, requiredSkills: [] };
    return {
      agent: value?.agent,
      requiredSkills: Array.isArray(value?.requiredSkills) ? value.requiredSkills : [],
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
  return (route.intent === 'writing.zh' || route.intent === 'writing.en')
    && (route.requiredTools ?? []).some((tool) => tool === 'writing_quality_check' || tool === 'writing_logic_check');
}

function needsTesting(route) {
  return route.intent === 'testing' || route.intent === 'implementation-with-tests' || route.intent === 'bug-audit';
}
