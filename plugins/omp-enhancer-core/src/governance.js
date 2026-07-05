import { loopGuardPromptSection } from './loop-guard.js';

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
    loopGuardPromptSection(),
    '',
    '### Mandatory Skill Workflow',
    '',
    'Before doing the routed work, call the read tool once for each required skill using the exact URI `skill://<skill-name>`. Wait for those reads to finish before acting. If a required skill is unavailable, state that explicitly and do not pretend it was loaded.',
    'The runtime enforces this as a pre-work skill gate: work tools such as task, edit, write, bash, route-specific QA, and test gates may be blocked until every required skill has successful read evidence.',
    'When validating loaded skills, prefer this order in the same assistant continuation: read every missing `skill://<skill-name>` first, wait for those read results, then call `omp_core_validate_skill_usage` with the full SKILL_USAGE output. This avoids stale branch snapshots hiding just-loaded skills.',
    '',
    'Required skills:',
    formatList(resolved.requiredSkills),
    '',
    'Toolchain:',
    formatList(resolved.requiredTools),
    '',
    ...subagentWorkflowLines(resolved, { parentTask }),
    '',
    workflowFor(resolved),
    '',
    '### SUBAGENT_USAGE contract',
    '',
    'Final routed outputs that list required subagents must include:',
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

export function buildSubagentPromptFragment({ prompt = '' } = {}) {
  const { agent, requiredSkills } = parseSubagentLaunchContract(prompt);
  const resolvedAgent = agent || 'subagent';

  return [
    '## OMP Enhancer Core Subagent Contract',
    '',
    `Subagent: ${resolvedAgent}`,
    '',
    'This is a spawned subagent assignment, not a root routed workflow. Do not start another OMP Enhancer Core role-gate cycle and do not fork extra subagents unless the assignment explicitly asks for nested delegation.',
    '',
    'Required skills for this subagent:',
    formatList(requiredSkills),
    '',
    'Before acting, read each listed skill with the exact URI `skill://<skill-name>`. If a required skill is unavailable, stop and report it in BLOCKERS.',
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
    return [
      'OMP Enhancer Core gate is still open for this implementation or testing task.',
      'Run the testing workflow and finish with omp_test_gate. Keep test-driven-development and SKILL_USAGE evidence in the final response.',
      formatRecentToolFailures(state, ['omp_test_gate']),
    ].filter(Boolean).join('\n');
  }

  return null;
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
  if (intent === 'bug-audit') return 'Bug audit workflow: ecc-code-reviewer -> ecc-silent-failure-hunter -> ecc-pr-test-analyzer -> omp_test_gate -> BUG-AUDIT-REPORT or final bug report.';
  if (intent === 'testing') return 'Testing workflow: ecc-tdd-guide -> ecc-pr-test-analyzer -> omp_test_analyze -> omp_test_context -> omp_test_gate -> omp_test_report.';
  if (intent === 'implementation-with-tests') return 'Coding workflow: plan -> task -> reviewer -> lightweight TDD -> omp_test_gate -> omp_test_report.';
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
    return 'Route boundary: this is a writing workflow. Do not call omp_test_analyze, omp_test_context, omp_test_gate, or omp_test_report unless a separate routed code/testing task is created later.';
  }
  if (intent === 'testing' || intent === 'implementation-with-tests') {
    return 'Route boundary: this is a code/testing workflow. Use the OMP testing tools only after routed test or implementation work has actually been performed.';
  }
  if (intent === 'bug-audit') {
    return 'Route boundary: this is a read-only bug audit workflow unless the user explicitly asks for fixes. Do not turn audit findings into code edits without a separate fix request.';
  }
  return 'Route boundary: use only the tools listed for this route unless the user explicitly changes the task.';
}

function subagentWorkflowLines(route, { parentTask = '' } = {}) {
  const requiredSubagents = route.requiredSubagents ?? [];
  const common = [
    '### Mandatory Subagent Workflow',
    '',
    'Runtime model policy: the main/default agent uses MiMo v2.5; the advisor uses DeepSeek V4 Flash. Keep task subagents and all other model roles on the active OMP configuration unless the user explicitly overrides them.',
    '',
    'Classifier model policy: ambiguous routing may use the configured `modelRoles.classifier` role. The packaged config defaults it to `opencode-go/deepseek-v4-flash:medium`. Classifier output is advisory only; resolve it through the OMP route whitelist before assigning skills, tools, or subagents.',
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
    'When forking each subagent, include that subagent-specific skill list in the task prompt. Tell the subagent to read each required skill with `skill://<skill-name>` before acting and to report which skills it loaded.',
    '',
    'Required subagents:',
    formatSubagents(requiredSubagents),
    '',
    '### Pre-fork Subagent Contract',
    '',
    'Before calling task, prepare each subagent assignment with the matching contract below. Copy the required role, required skills, and final output block into the task assignment before forking so the subagent does not need to infer the gate format.',
    '',
    formatPreforkSubagentContracts(requiredSubagents, { parentTask }),
    '',
    'After the task call returns, the main agent must include this exact subagent evidence block in the routed final output:',
    '',
    formatSubagentUsageBlock(requiredSubagents),
  ];
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

function formatPreforkSubagentContracts(values = [], { parentTask = '' } = {}) {
  const subagents = normalizeSubagentValues(values);
  if (!subagents.length) return 'No routed subagents are required.';
  const parentTaskLine = formatParentTaskLine(parentTask);

  return subagents.map(({ agent, requiredSkills }) => [
    `Subagent: ${agent}`,
    'Task item fields:',
    `- role: ${agent}`,
    `- agent: ${agent}`,
    '- description: short duty text for OMP native subagent status',
    'Assignment must start with:',
    `OMP_REQUIRED_SUBAGENT: ${agent}`,
    parentTaskLine,
    'Required skills for this subagent:',
    formatList(requiredSkills),
    'Before acting:',
    '- Read each required skill with `skill://<skill-name>`.',
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
    if (/^(Before acting|Final subagent output|SUBAGENT_RESULT|SKILL_USAGE|BLOCKERS|Assignment)/i.test(line)) break;
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

function needsWritingQuality(route) {
  return (route.intent === 'writing.zh' || route.intent === 'writing.en')
    && (route.requiredTools ?? []).some((tool) => tool === 'writing_quality_check' || tool === 'writing_logic_check');
}

function needsTesting(route) {
  return route.intent === 'testing' || route.intent === 'implementation-with-tests' || route.intent === 'bug-audit';
}
