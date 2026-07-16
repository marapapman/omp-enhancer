import { preferredSkillReadTarget, skillReadNameCandidates } from './skill-usage.js';
import { buildWorkflowCatalogPrompt } from './workflow-routes.js';

export function buildGovernancePromptFragment({
  route,
  parentTask = '',
  includeModelWorkflowHints = true,
  availableSkills = [],
} = {}) {
  const resolved = advisoryRoute(route);
  const catalog = buildWorkflowCatalogPrompt({ availableSkills, audience: 'main' });
  const lines = [
    '## OMP Enhancer Workflow Reference (explicit and optional)',
    '',
    'This reference supplies optional workflow cards and observed task facts only when explicitly requested. Core does not inject it during agent startup.',
    'OMP\'s system prompt, current settings, permissions, active tools, dynamic Available Agents list, native TODO behavior, and native task behavior remain authoritative.',
    'A workflow card never requires a TODO, a particular tool or skill, delegation, a particular Agent ID, a fixed execution order, or a completion gate. Use a candidate only when OMP currently exposes it and the host instructions permit it.',
    'The plugin does not authorize actions, deny tool calls, alter tool inputs or results, hold the final response open, or schedule another turn.',
    '',
    '### How to use this optional reference',
    '',
    '- Treat workflow steps, skill names, quality checks, and role names as optional reference data.',
    '- Select, omit, reorder, or combine suggestions according to the user request and OMP\'s native instructions.',
    '- Use only skills, tools, and Agent IDs exposed by the current OMP session. The catalog cannot expand or narrow the host-provided set.',
    '- Let OMP decide whether and how to use TODOs or subagents. Do not derive eager behavior from this reference.',
    ...evidenceDisciplineLines(resolved),
    '',
    '### Observed task facts (not a workflow decision)',
    '',
    ...taskFactLines(resolved, parentTask),
    '',
    '## Complete workflow catalog',
    '',
    catalog,
  ];

  if (includeModelWorkflowHints) {
    lines.push(
      '',
      '### Routing model note',
      '',
      'Classifier output is diagnostic only. It cannot replace or refine the active main-agent workflow, and it does not create permissions or completion conditions.',
    );
  }

  return lines.join('\n');
}

export function buildImmediateWorkflowMessage({
  availableSkills = [],
} = {}) {
  const inventoryNames = unique((availableSkills ?? [])
    .map((skill) => typeof skill === 'string' ? skill : skill?.name)
    .map((name) => String(name ?? '').trim())
    .filter((name) => /^[a-z0-9][a-z0-9._/-]*$/i.test(name)));
  return [
    'OMP Enhancer optional workflow reference:',
    'No automatic action is required. OMP\'s system prompt, current settings, dynamic Available Agents, active tools, TODO behavior, and task behavior remain authoritative.',
    `Currently visible skill candidates: ${inventoryNames.join(', ') || 'none exposed by the host'}. This list is informational and does not require loading any skill.`,
    'Workflow cards are optional information. They cannot require TODO creation, delegation, a fixed Agent ID, a tool call, or a completion condition.',
  ].join('\n');
}

export function buildSubagentPromptFragment({ prompt = '' } = {}) {
  const metadata = parseWorkflowMetadata(prompt);
  const agent = parseRole(prompt) || 'subagent';
  const skills = metadata.skills.length ? metadata.skills : parseRoleSkills(prompt);
  return [
    '## OMP Enhancer Parent Metadata (optional reference)',
    '',
    `Observed role label: ${agent}`,
    `Observed workflow label: ${metadata.workflow || 'not supplied'}`,
    `Observed step label: ${metadata.step || 'not supplied'}`,
    `Observed TODO label: ${metadata.todo || 'not supplied'}`,
    '',
    'Observed skill candidates:',
    formatSkillList(skills),
    '',
    'This metadata is informational only. The OMP-provided subagent system prompt, assignment, tools, Available Agents, and host settings are authoritative.',
    'Do not load a skill, change workflow, create a TODO, delegate, or alter completion behavior solely because this metadata mentions it.',
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

function taskFactLines(route = {}, parentTask = '') {
  const descriptor = route.taskDescriptor ?? {};
  const constraints = descriptor.constraints ?? {};
  const targets = unique([
    ...(descriptor.workspaceWriteTargets ?? []),
    ...(descriptor.writingSourceTargets ?? []),
    ...(descriptor.releaseTargets ?? []),
  ]);
  const lines = [
    `- Requested operation: ${descriptor.operation ?? 'unknown'}.`,
    `- Observed domains: ${(descriptor.domains ?? []).join(', ') || 'general'}.`,
    `- Observed targets: ${targets.join(', ') || 'none extracted; use the user request and project context'}.`,
  ];
  if (descriptor.language) {
    lines.push(`- Observed target-text language: ${descriptor.language}; source: ${descriptor.writingLanguageSource ?? 'not recorded'}.`);
  }
  if (descriptor.writingSourcePending || route.intent === 'writing.pending') {
    lines.push('- Writing language is pending target-text inspection. Select `writing.pending` first; do not infer language from the instruction.');
  }
  for (const [key, value] of Object.entries(constraints)) {
    if (value === 'forbidden' || value === 'required') lines.push(`- Explicit constraint: ${key}=${value}.`);
  }
  lines.push(...scopeAndRiskLines(route, parentTask));
  return unique(lines);
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

function formatSkillList(skills = [], { workspaceRoot = '' } = {}) {
  if (!skills.length) return '- none yet';
  return skills.map((skill) => {
    const target = preferredSkillReadTarget(skill, { workspaceRoot });
    if (target) return `- ${target}`;
    const preferred = skillReadNameCandidates(skill, { limit: 1 })[0] ?? skill;
    return `- skill://${preferred}`;
  }).join('\n');
}

export function inspectionBudgetForPrompt(parentTask = '') {
  const text = String(parentTask ?? '').toLowerCase();
  const match = text.match(/(?:最多|不超过|限制在)\s*(\d{1,3})\s*次.{0,20}(?:读取|读|搜索|检索)/u)
    ?? text.match(/在\s*(\d{1,3})\s*次以内.{0,20}(?:读取|读|搜索|检索)/u)
    ?? text.match(/\b(?:within|at most|maximum of)\s+(\d{1,3})\s+(?:read|search)/u);
  if (!match) return 0;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : 0;
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

function parseWorkflowMetadata(prompt = '') {
  const source = String(prompt);
  const compact = source.match(/\[workflow=([^\]\s]+)\s+step=([^\]]*?)\s+todo=([^\]]*?)\s+skills=([^\]]*?)\]/i);
  const workflow = compact?.[1]?.trim()
    ?? source.match(/OMP_WORKFLOW(?:_ID)?:\s*([^\r\n]+)/i)?.[1]?.trim()
    ?? '';
  const step = compact?.[2]?.trim()
    ?? source.match(/OMP_WORKFLOW_STEP:\s*([^\r\n]+)/i)?.[1]?.trim()
    ?? '';
  const todo = compact?.[3]?.trim()
    ?? source.match(/OMP_TODO_ITEM:\s*([^\r\n]+)/i)?.[1]?.trim()
    ?? '';
  const compactSkills = compact?.[4]
    ? compact[4].split(',').map((value) => value.trim()).filter(Boolean)
    : [];
  const markerSkills = parseMarkedSkills(source);
  return {
    workflow,
    step,
    todo,
    skills: unique([...compactSkills, ...markerSkills]),
  };
}

function parseMarkedSkills(prompt = '') {
  const lines = String(prompt).split(/\r?\n/);
  const start = lines.findIndex((line) => /^OMP_(?:REQUIRED|SELECTED)_SKILLS:\s*/i.test(line.trim()));
  if (start < 0) return [];
  const inline = lines[start].replace(/^OMP_(?:REQUIRED|SELECTED)_SKILLS:\s*/i, '').trim();
  const skills = inline ? inline.split(',').map((value) => value.trim()) : [];
  for (const rawLine of lines.slice(start + 1)) {
    const match = rawLine.trim().match(/^[-*]\s*(?:skill:\/\/)?([A-Za-z0-9_.\/-]+)$/i);
    if (!match) break;
    skills.push(match[1]);
  }
  return unique(skills.filter(Boolean));
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

function unique(values = []) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function isDocumentStyleEdit(prompt = '') {
  const text = String(prompt);
  const styleAction = /(?:润色|改写|校对|措辞|文风|语法|polish|rewrite|proofread|copyedit|wording|style|grammar)/i.test(text);
  const documentTarget = /(?:论文|摘要|正文|段落|句子|文档|letter|paper|abstract|manuscript|section|paragraph|sentence|\.tex\b|\.md\b|\.docx?\b)/i.test(text);
  return styleAction && documentTarget;
}
