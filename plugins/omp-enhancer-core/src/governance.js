export function buildGovernancePromptFragment({ route } = {}) {
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
    ].join('\n');
  }

  return [
    '## OMP Enhancer Core Routing',
    '',
    `Intent: ${resolved.intent}`,
    `Agent route: ${resolved.agent ?? 'none'}`,
    '',
    'Use this natural language route. Do not require a command prefix.',
    '',
    '### Mandatory Skill Workflow',
    '',
    'Before doing the routed work, call the read tool once for each required skill using the exact URI `skill://<skill-name>`. Wait for those reads to finish before acting. If a required skill is unavailable, state that explicitly and do not pretend it was loaded.',
    '',
    'Required skills:',
    formatList(resolved.requiredSkills),
    '',
    'Toolchain:',
    formatList(resolved.requiredTools),
    '',
    '### Mandatory Subagent Workflow',
    '',
    'Runtime model policy: the main/default agent uses MiMo v2.5; the advisor uses DeepSeek V4 Flash. Keep task subagents and all other model roles on the active OMP configuration unless the user explicitly overrides them.',
    '',
    'Use a subagent-driven workflow for routed work. Before doing non-trivial implementation, testing, writing, security, or config work yourself, fork the listed roles with the task tool. Call task once per distinct agent role; if several items share one agent, use the batch task shape.',
    '',
    'When calling task, set each task item `role` or `agent` to the exact required subagent name, such as `writer`, `checker`, `zh-writer`, or `zh-checker`. Do not use generic `task` as the only role for required subagents.',
    '',
    'When forking each subagent, include that subagent-specific skill list in the task prompt. Tell the subagent to read each required skill with `skill://<skill-name>` before acting and to report which skills it loaded.',
    '',
    'Required subagents:',
    formatSubagents(resolved.requiredSubagents),
    '',
    workflowFor(resolved.intent),
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

export function buildMissingGateContext({ route, state } = {}) {
  if (!route || route.intent === 'unknown') return null;

  if (isWriting(route) && !state?.evidence?.writingQuality) {
    return [
      'OMP Enhancer Core gate is still open for this writing task.',
      'Run writing QA before finishing. Use writing_quality_check or writing_logic_check, and make sure SKILL_USAGE lists the required writing skills such as plain-chinese-writing when required.',
    ].join('\n');
  }

  if (needsTesting(route) && !state?.evidence?.testingGate) {
    return [
      'OMP Enhancer Core gate is still open for this implementation or testing task.',
      'Run the testing workflow and finish with omp_test_gate. Keep test-driven-development and SKILL_USAGE evidence in the final response.',
    ].join('\n');
  }

  return null;
}

function workflowFor(intent) {
  if (intent === 'writing.zh') return 'Writing workflow: zh-writer -> zh-checker -> writing_quality_check.';
  if (intent === 'writing.en') return 'Writing workflow: writer -> checker -> writing_quality_check.';
  if (intent === 'testing') return 'Testing workflow: ecc-tdd-guide -> ecc-pr-test-analyzer -> omp_test_analyze -> omp_test_context -> omp_test_gate -> omp_test_report.';
  if (intent === 'implementation-with-tests') return 'Coding workflow: plan -> task -> reviewer -> lightweight TDD -> omp_test_gate -> omp_test_report.';
  if (intent === 'security-review') return 'Security workflow: ecc-security-reviewer -> reviewer -> fix or report only after risk evidence is checked.';
  if (intent === 'config-assets') return 'Config workflow: use omp_config_doctor, omp_config_assets, or omp_config_plan as needed.';
  return 'Workflow: use the selected agent and tools.';
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

function isWriting(route) {
  return route.intent === 'writing.zh' || route.intent === 'writing.en';
}

function needsTesting(route) {
  return route.intent === 'testing' || route.intent === 'implementation-with-tests';
}
