import { skillReadNameCandidates } from './skill-usage.js';

export function buildGovernancePromptFragment({
  route,
  parentTask = '',
  includeModelWorkflowHints = true,
} = {}) {
  const resolved = advisoryRoute(route);
  const plan = resolved.routePlan;
  const lines = [
    '## OMP Enhancer Core Workflow Guidance',
    '',
    'This guidance is advisory. It selects relevant skills and a useful workflow, while the agent remains responsible for following the user request and host tool results.',
    'The plugin does not authorize actions, deny tool calls, hold the final response open, or schedule another turn.',
    '',
    `Intent: ${resolved.intent}`,
    `Workflow: ${resolved.workflowRoute}`,
    '',
    '### Suggested steps',
    '',
    formatSteps(plan.steps),
    '',
    '### Relevant skills',
    '',
    formatSkillList(plan.skills),
    '',
    'Skill use is flexible: load the relevant skill URI when it helps the task. If a suggested skill is unavailable, continue with the best available method and mention the limitation when material.',
    '',
    '### Useful tools',
    '',
    formatList(plan.tools),
    '',
    '### Optional roles',
    '',
    formatRoles(plan.roles),
    '',
    'Roles are collaboration suggestions. The main agent may work directly, delegate selected checkpoints, or adapt the sequence to the task and available runtime.',
    '',
    '### Quality checks',
    '',
    formatList(plan.qualityChecks),
    '',
    '### Scope and risk notes',
    '',
    ...scopeAndRiskLines(resolved, parentTask),
    '',
    '### Advisor guidance',
    '',
    'Use advisor input as another evidence source when it is available and useful. Reconcile it with the user request, repository facts, and observed tool results.',
  ];

  if (includeModelWorkflowHints) {
    lines.push(
      '',
      '### Routing model note',
      '',
      'Classifier output is a route hint. It may refine workflow suggestions, but it does not create permissions or completion conditions.',
    );
  }

  return lines.join('\n');
}

export function buildSubagentPromptFragment({ prompt = '' } = {}) {
  const agent = parseRole(prompt) || 'subagent';
  const skills = parseRoleSkills(prompt);
  const parentBriefing = parseWorkflowBriefing(prompt);
  return [
    '## OMP Enhancer Core Role Guidance',
    '',
    `Role: ${agent}`,
    '',
    ...(parentBriefing.length ? [
      'Parent workflow context:',
      ...parentBriefing,
      '',
    ] : []),
    'Suggested skills for this role:',
    formatSkillList(skills),
    '',
    'Use the suggested skills when they improve the assigned checkpoint. Missing skills are a limitation to report, not a reason for the plugin to halt the role.',
    '',
    'Return a concise result with the evidence, files, checks, and decisions used. The parent agent integrates this checkpoint into the overall task.',
  ].join('\n');
}

export function formatWorkflowBriefingForAssignment(route) {
  if (!route || route.intent === 'unknown') return '';
  const resolved = advisoryRoute(route);
  return [
    'Workflow briefing:',
    `Parent intent: ${resolved.intent}`,
    `Parent workflow: ${resolved.workflowRoute}`,
    'Suggested parent steps:',
    formatSteps(resolved.routePlan.steps),
    'This role contributes one checkpoint; the parent agent coordinates the final result.',
  ].join('\n');
}

function advisoryRoute(route = {}) {
  const rawPlan = route.routePlan ?? {};
  const skills = unique(rawPlan.skills ?? route.skills ?? route.requiredSkills ?? []);
  const tools = unique(rawPlan.tools ?? route.tools ?? route.requiredTools ?? []);
  const roles = normalizeRoles(rawPlan.roles ?? route.roles ?? route.requiredSubagents ?? []);
  const steps = normalizeSteps(rawPlan.steps ?? route.taskDescriptor?.phases ?? []);
  return {
    ...route,
    intent: route.intent ?? 'unknown',
    workflowRoute: route.workflowRoute ?? 'agentic.simple',
    routePlan: {
      version: 2,
      mode: 'advisory',
      autoContinue: false,
      steps,
      skills,
      tools,
      roles,
      qualityChecks: unique(rawPlan.qualityChecks ?? route.qualityChecks ?? []),
      riskNotes: unique(rawPlan.riskNotes ?? route.riskNotes ?? []),
    },
  };
}

function scopeAndRiskLines(route, parentTask = '') {
  const lines = [];
  const descriptor = route.taskDescriptor ?? {};
  const plan = route.routePlan;

  if (descriptor.writingSourcePending || route.intent === 'writing.pending') {
    const targets = descriptor.workspaceWriteTargets ?? [];
    if (descriptor.language === 'mixed') {
      lines.push('The observed writing source is mixed-language. Select Chinese or English guidance per target or section instead of forcing one global language skill.');
    } else {
      lines.push(targets.length
        ? `Writing language is pending content inspection. Read ${targets.join(', ')} and refine the language-specific skill suggestions from the body text.`
        : 'Writing language is pending source inspection. Read or obtain the text being revised, then refine the language-specific skill suggestions from that body text.');
    }
    lines.push('The language of the surrounding instruction is not evidence of the body language.');
  }

  if (isDocumentStyleEdit(parentTask)) {
    lines.push('This style-edit request benefits from preserving subjects, predicates, values, polarity, quantifiers, ranges, modality, citations, math, and document structure.');
    lines.push('A before-and-after read of the complete target is useful when practical, especially for factual or structural preservation.');
  }

  if (descriptor.constraints?.testExecution === 'forbidden') {
    lines.push('The user-stated scope excludes test execution, so static inspection and an explicit untested-status note are appropriate.');
  }
  if (descriptor.constraints?.subagents === 'forbidden') {
    lines.push('The user-stated scope keeps the work with the main agent.');
  }
  if (descriptor.constraints?.networkAccess === 'forbidden') {
    lines.push('The user-stated scope is local and offline; conclusions should identify the evidence actually available in the workspace.');
  }
  if (descriptor.constraints?.externalWrite === 'required') {
    lines.push('The requested external action deserves a target check and independent observation of the result. Host approval behavior remains outside this plugin.');
  }
  lines.push(...plan.riskNotes);
  if (!lines.length) lines.push('Use task-appropriate judgment and keep the work aligned with the user request.');
  return unique(lines).map((line) => `- ${line}`);
}

function formatSteps(values = []) {
  if (!values.length) return '- Follow the user request using the smallest useful workflow.';
  return values.map(({ kind, domain }, index) => `- ${index + 1}. ${stepDescription(kind, domain)}`).join('\n');
}

function stepDescription(kind, domain) {
  const action = ({
    answer: 'Prepare the response',
    inspect: 'Inspect the relevant context',
    diagnose: 'Trace and explain the cause',
    modify: 'Apply the requested change',
    create: 'Create the requested artifact',
    execute: 'Run the requested operation',
    verify: 'Verify the observed behavior',
    review: 'Review the result',
    release: 'Perform and observe the requested release action',
  })[kind] ?? kind;
  return `${action} (${domain}).`;
}

function formatSkillList(skills = []) {
  if (!skills.length) return '- none yet';
  return skills.map((skill) => {
    const preferred = skillReadNameCandidates(skill, { limit: 1 })[0] ?? skill;
    const alias = preferred === skill ? '' : ` (available as ${preferred})`;
    return `- skill://${preferred}${alias}`;
  }).join('\n');
}

function formatList(values = []) {
  if (!values.length) return '- none suggested';
  return values.map((value) => `- ${value}`).join('\n');
}

function formatRoles(values = []) {
  if (!values.length) return '- none suggested';
  return values.map(({ agent, duty, skills, modelRoles }) => {
    const parts = [duty, skills.length ? `skills: ${skills.join(', ')}` : null, modelRoles.length ? `model roles: ${modelRoles.join(', ')}` : null]
      .filter(Boolean);
    return `- ${agent}${parts.length ? `: ${parts.join('; ')}` : ''}`;
  }).join('\n');
}

function normalizeSteps(values = []) {
  const seen = new Set();
  return (values ?? []).filter(({ kind, domain } = {}) => {
    const key = `${kind}:${domain}`;
    if (!kind || !domain || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(({ kind, domain }) => ({ kind, domain }));
}

function normalizeRoles(values = []) {
  return (values ?? []).map((value) => {
    if (typeof value === 'string') return { agent: value, duty: '', skills: [], modelRoles: [] };
    return {
      agent: value?.agent,
      duty: String(value?.duty ?? ''),
      skills: unique(value?.skills ?? value?.requiredSkills ?? []),
      modelRoles: unique(value?.modelRoles ?? []),
    };
  }).filter(({ agent }) => agent);
}

function parseRole(prompt = '') {
  const source = String(prompt);
  return source.match(/OMP_WORKFLOW_ROLE:\s*([^\r\n]+)/i)?.[1]?.trim().replace(/[.;,，。]+$/, '')
    ?? source.match(/OMP_REQUIRED_SUBAGENT:\s*([^\r\n]+)/i)?.[1]?.trim().replace(/[.;,，。]+$/, '')
    ?? source.match(/(?:Suggested role|Role):\s*([^\r\n]+)/i)?.[1]?.trim()
    ?? '';
}

function parseRoleSkills(prompt = '') {
  const lines = String(prompt).split(/\r?\n/);
  const start = lines.findIndex((line) => /^(?:Suggested skills for this role|Skills for this role|Required skills for this subagent):/i.test(line.trim()));
  if (start < 0) return [];
  const skills = [];
  for (const rawLine of lines.slice(start + 1)) {
    const line = rawLine.trim();
    if (!line) {
      if (skills.length) break;
      continue;
    }
    const match = line.match(/^[-*]\s*(?:skill:\/\/)?(.+)$/i);
    if (!match) break;
    const skill = match[1].trim();
    if (skill && skill.toLowerCase() !== 'none') skills.push(skill);
  }
  return unique(skills);
}

function parseWorkflowBriefing(prompt = '') {
  const lines = String(prompt).split(/\r?\n/);
  const start = lines.findIndex((line) => /^Workflow briefing:/i.test(line.trim()));
  if (start < 0) return [];
  const collected = [];
  for (const rawLine of lines.slice(start)) {
    const line = rawLine.trimEnd();
    if (collected.length && /^(?:Suggested skills for this role|Skills for this role|Required skills for this subagent|Before acting|Final subagent output):/i.test(line.trim())) break;
    collected.push(line.trim());
  }
  return collected.filter(Boolean);
}

function unique(values = []) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function isDocumentStyleEdit(prompt = '') {
  const text = String(prompt);
  const styleAction = /(?:润色|改写|校对|措辞|文风|语法|polish|rewrite|proofread|copyedit|wording|style|grammar)/i.test(text);
  const documentTarget = /(?:论文|摘要|正文|段落|句子|文档|letter|paper|abstract|manuscript|section|paragraph|sentence|\.tex\b|\.md\b|\.docx?\b)/i.test(text);
  return styleAction && documentTarget;
}
