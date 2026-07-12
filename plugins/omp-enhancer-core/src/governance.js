import { preferredSkillReadTarget, skillReadNameCandidates } from './skill-usage.js';

export function buildGovernancePromptFragment({
  route,
  parentTask = '',
  includeModelWorkflowHints = true,
  workspaceRoot = '',
} = {}) {
  const resolved = advisoryRoute(route);
  const plan = resolved.routePlan;
  const primarySkills = primarySkillsFor(resolved);
  const primaryTargets = primarySkills
    .map((skill) => preferredSkillReadTarget(skill, { workspaceRoot }))
    .filter(Boolean);
  const lines = [
    '## OMP Enhancer Core Workflow Guidance',
    '',
    'This guidance is advisory. It selects relevant skills and a useful workflow, while the agent remains responsible for following the user request and host tool results.',
    'The plugin does not authorize actions, deny tool calls, hold the final response open, or schedule another turn.',
    '',
    `Intent: ${resolved.intent}`,
    `Workflow: ${resolved.workflowRoute}`,
    ...startWithSkillLines(resolved, primaryTargets),
    '',
    '### Suggested steps',
    '',
    formatSteps(plan.steps),
    '',
    '### Relevant skills',
    '',
    formatSkillList(plan.skills, { workspaceRoot }),
    '',
    'Before substantive work, read exactly the smallest directly applicable primary skill once. Prefer an exact project-specified skill, then the exact routed URI, then one inventory-confirmed equivalent. A skill counts as loaded only after a successful read of its SKILL.md. If resolution fails, make one targeted correction, continue without the skill, and report the limitation briefly. Do not invent aliases, create replacement skills, or retry unchanged calls.',
    'For a focused task, one primary skill is normally enough; Chinese writing may use its base language guidance plus one task-specific skill. When writing language is pending, inspect the source first and only then select a language skill. Do not expand into the whole skill list unless the primary skill explicitly requires a companion.',
    'Unless the user is auditing historical gate behavior, use only current routed or project-specified skills; do not load legacy gate-satisfy or gate-unblock compatibility resources.',
    '',
    '### Bounded execution guidance',
    '',
    'Confirm a path exists before reading it; do not guess report files or resource URIs. For a schema or path error, make at most one evidence-based targeted correction, then continue with the evidence already available.',
    'For focused work, treat 6 to 8 read or search calls as a convergence checkpoint and synthesize the result. For a broad audit, produce at least one file-backed finding within that window. If time is short, deliver a clearly scoped partial result instead of searching indefinitely.',
    'Dispatch an asynchronous task once. Wait through the host job or messaging mechanism when available; do not dispatch a second task merely to poll and do not create an unauthorized file rendezvous.',
    ...evidenceDisciplineLines(resolved),
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
    'Treat advisor notes as evidence deltas. Incorporate each distinct material point once, applying a concrete newly evidenced correction before delivery when it improves the user result. A repeated note or a note without a new file, location, error, or observed result does not justify rereading skills, rerunning unchanged tools, reopening completed work, or emitting a second final answer.',
    'Finish tool use and absorb advisor notes already delivered before producing one user-visible deliverable. If the host invokes an advisor-only continuation after that deliverable, produce no user-visible text or tools and wait for an actual user message.',
  ];

  if (includeModelWorkflowHints) {
    lines.push(
      '',
      '### Routing model note',
      '',
      'Classifier output is a route hint. It may refine workflow suggestions, but it does not create permissions or completion conditions.',
    );
  }

  lines.push(...immediateNextActionLines(resolved, primaryTargets));

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
    'Before substantive work, read exactly the smallest directly applicable primary skill once. Prefer the exact project-specified or routed name. A skill counts as loaded only after a successful read of its SKILL.md.',
    'If resolution fails, make one targeted correction and then continue with the available evidence. Do not invent an alias or retry the unchanged call. Missing skills are a limitation to report, not a reason for the plugin to halt the role.',
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
    const targets = descriptor.writingSourceTargets ?? descriptor.workspaceWriteTargets ?? [];
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
    lines.push('After editing, compare the observed before and after text once and report every actual change accurately; do not claim that only one token changed when formatting or escaping also changed.');
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

function formatSkillList(skills = [], { workspaceRoot = '' } = {}) {
  if (!skills.length) return '- none yet';
  return skills.map((skill) => {
    const target = preferredSkillReadTarget(skill, { workspaceRoot });
    if (target) return `- ${target}`;
    const preferred = skillReadNameCandidates(skill, { limit: 1 })[0] ?? skill;
    return `- skill://${preferred}`;
  }).join('\n');
}

function startWithSkillLines(route, targets = []) {
  if (route.intent === 'writing.pending' || !targets.length) return [];
  const label = targets.length === 1 ? 'Primary skill to read now' : 'Primary skills to read now';
  return [
    '',
    '### Start with the workflow skill',
    '',
    `${label}: ${targets.map((target) => `\`${target}\``).join(', ')}.`,
    'Use the read tool on the exact target above before reading, searching, editing, or otherwise inspecting project files. This is workflow guidance, not a tool authorization or completion gate.',
    'If that exact read is unavailable, make one targeted correction from the returned inventory or an existing project path, then continue with the available evidence. Do not guess additional aliases or paths.',
  ];
}

function immediateNextActionLines(route, targets = []) {
  if (route.intent === 'writing.pending' || !targets.length) return [];
  const [first, ...rest] = targets;
  return [
    '',
    '### Immediate next action',
    '',
    `PREFERRED NEXT TOOL: read(path="${first}").`,
    ...(rest.length ? [`Then read: ${rest.map((target) => `\`${target}\``).join(', ')}.`] : []),
    'Try this before inspecting the task target. If the read fails, correct the target at most once; after a second failure, state the limitation and continue the user task with the available context.',
    'This sequence is advisory only: never block tools or completion, never retry an unchanged read, and never reopen completed work because a skill is unavailable.',
    'If the read succeeds, follow the skill and bounded workflow above; otherwise proceed with the user request using the available evidence.',
  ];
}

function primarySkillsFor(route = {}) {
  const skills = route.routePlan?.skills ?? [];
  const descriptor = route.taskDescriptor ?? {};
  if (route.intent === 'writing.pending') return [];
  if (route.intent === 'writing.zh') {
    return unique([
      skills.find((skill) => skill === 'plain-chinese-writing'),
      skills.find((skill) => /^zh-writing-(?:review|polish|markdown-helper)$/.test(skill)),
    ]);
  }
  if (route.intent === 'writing.en') {
    return unique([skills.find((skill) => ['writing-review', 'writing-markdown-helper'].includes(skill))]);
  }
  if (route.intent === 'fact-check') return unique([skills.find((skill) => skill === 'fact-checking')]);
  if (route.intent === 'planning') return unique([skills.find((skill) => skill === 'writing-plans')]);
  if (['diagnosis', 'bug-audit'].includes(route.intent)) {
    return unique([skills.find((skill) => ['diagnose', 'systematic-debugging'].includes(skill))]);
  }
  if (descriptor.domains?.includes('security')) {
    return unique([skills.find((skill) => skill === 'security-review')]);
  }
  return skills.slice(0, 1);
}

function evidenceDisciplineLines(route = {}) {
  const domains = new Set(route.taskDescriptor?.domains ?? []);
  const taskKind = route.taskDescriptor?.writingTaskKind;
  if (!domains.has('facts') && taskKind !== 'review' && !['bug-audit', 'diagnosis'].includes(route.intent)) return [];
  return [
    'For evidence-backed review, diagnosis, or fact checking, every quoted passage must be copied verbatim from a successful read; a paraphrase must not appear inside quotation marks.',
    'Check every quoted phrase and location once before the final response. Remove, correct, or clearly label any finding whose wording or location is not supported by the observed source.',
  ];
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
