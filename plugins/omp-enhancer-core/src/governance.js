export function buildGovernancePromptFragment({ route } = {}) {
  const resolved = route ?? {
    intent: 'unknown',
    agent: null,
    requiredSkills: [],
    requiredTools: [],
  };

  if (resolved.intent === 'unknown') {
    return [
      '## OMP Enhancer Core Routing',
      '',
      'Intent: unknown',
      'Use natural language context. Do not force a plugin workflow unless the user asks for coding, writing, testing, or config work.',
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
    'Before doing the routed work, load each required skill listed here. If a required skill is unavailable, state that explicitly and do not pretend it was loaded.',
    '',
    'Required skills:',
    formatList(resolved.requiredSkills),
    '',
    'Toolchain:',
    formatList(resolved.requiredTools),
    '',
    workflowFor(resolved.intent),
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
  if (intent === 'testing') return 'Testing workflow: omp_test_analyze -> omp_test_context -> omp_test_gate -> omp_test_report.';
  if (intent === 'implementation-with-tests') return 'Coding workflow: lightweight TDD -> implementer -> reviewer -> omp_test_gate -> omp_test_report.';
  if (intent === 'config-assets') return 'Config workflow: use omp_config_doctor, omp_config_assets, or omp_config_plan as needed.';
  return 'Workflow: use the selected agent and tools.';
}

function formatList(values = []) {
  if (!values.length) return '- none';
  return values.map((value) => `- ${value}`).join('\n');
}

function isWriting(route) {
  return route.intent === 'writing.zh' || route.intent === 'writing.en';
}

function needsTesting(route) {
  return route.intent === 'testing' || route.intent === 'implementation-with-tests';
}
