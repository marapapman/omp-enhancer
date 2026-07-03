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
    '### Pre-fork Subagent Contract',
    '',
    'Before calling task, prepare each subagent assignment with the matching contract below. Copy the required role, required skills, and final output block into the task assignment before forking so the subagent does not need to infer the gate format.',
    '',
    formatPreforkSubagentContracts(resolved.requiredSubagents),
    '',
    'After the task call returns, the main agent must include this exact subagent evidence block in the routed final output:',
    '',
    formatSubagentUsageBlock(resolved.requiredSubagents),
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

function formatPreforkSubagentContracts(values = []) {
  const subagents = normalizeSubagentValues(values);
  if (!subagents.length) return 'No routed subagents are required.';

  return subagents.map(({ agent, requiredSkills }) => [
    `Subagent: ${agent}`,
    'Task item fields:',
    `- role: ${agent}`,
    `- agent: ${agent}`,
    'Assignment must start with:',
    `OMP_REQUIRED_SUBAGENT: ${agent}`,
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

function isWriting(route) {
  return route.intent === 'writing.zh' || route.intent === 'writing.en';
}

function needsTesting(route) {
  return route.intent === 'testing' || route.intent === 'implementation-with-tests';
}
