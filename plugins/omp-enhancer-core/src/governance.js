import { preferredSkillReadTarget, skillReadNameCandidates } from './skill-usage.js';
import { buildWorkflowCatalogPrompt } from './workflow-routes.js';

export function buildGovernancePromptFragment({
  route,
  parentTask = '',
  includeModelWorkflowHints = true,
  workspaceRoot = '',
  skillsProvided = false,
  availableSkills = [],
} = {}) {
  const resolved = advisoryRoute(route);
  const catalog = buildWorkflowCatalogPrompt({ availableSkills, audience: 'main' });
  const lines = [
    '## OMP Main-Agent Workflow Orchestration',
    '',
    'This guidance is advisory. The main agent selects and composes workflows, skills, TODO items, tools, and subagents from the observed task.',
    'The plugin does not authorize actions, deny tool calls, hold the final response open, or schedule another turn.',
    '',
    '### Required planning sequence for non-trivial work',
    '',
    '1. From the user goal and already injected project instructions, choose or compose the matching workflows from the full catalog below. The legacy route object is diagnostic only and must not make this decision for you.',
    '2. Inspect the current model-visible skill inventory in this prompt and select the smallest skill set that directly supports the chosen workflow steps. Do not assume a remembered name exists.',
    '3. For non-trivial work, the FIRST tool call must initialize OMP\'s native `todo` tool with `op: "init"`; do not call `read`, `glob`, `grep`, `edit`, or another project tool first. Put the selected workflow IDs in phase names, record selected skills in the first item, and map every workflow step and every user requirement to its own stable TODO item.',
    '4. After TODO initialization and before any project read, load each selected installed skill with the `read` tool using the exact path `skill://<skill-name>`. A native `skill-prompt` body already present in context also counts as loaded. `manage_skill`, `learn`, memory, and a sentence claiming a skill was loaded do NOT load an installed skill.',
    '5. Execute TODO items in order and call `todo` with `op: "done"` immediately after each item finishes. Use the exact TODO content string; never invent task IDs. New user instructions must be added to the TODO before continuing.',
    '6. Before doing all work yourself, identify independent workstreams. When two or more useful workstreams are independent, fork multiple subagents early with the native `task` tool, preferably in one `tasks[]` batch when that schema is available. Select each child\'s exact installed agent ID from the chosen workflow\'s `Agent roles` list or from an explicitly composed workflow; never infer an unlisted role from generic delegation prose. A focused single-step task, an explicit no-subagent request, or a truly dependent sequence is an exception.',
    '7. Keep integration, conflict resolution, final verification, and the user-visible answer with the main agent. Reconcile every open TODO and every child result before finishing.',
    '',
    'Every child task must begin with a compact prefix inside its first 120 characters:',
    '`[workflow=<ids> step=<step-id> todo=<exact-item> skills=<comma-separated-skill-names>]`',
    'Copy that bracketed key format literally. Do not abbreviate it as WR/ST/TODO/SK, rename the keys, or put it after prose. Reuse the exact native TODO string in `todo=`.',
    'Pass the selected exact agent ID through the native `task` role or agent field. Then state the exact target, non-goals, requested change or investigation, and observable acceptance criteria. The parent chooses these values; Core only passes them through.',
    'The native `task` tool starts background jobs. Consume child results when delivered; if status is needed and the native `job` tool is available, use one bounded `job` list or poll. Never launch another `task` merely to poll children or check temporary report files.',
    '',
    'Learned memory, general model ability, and a managed skill created after finishing do not replace pre-work skill discovery. If a skill, `todo`, or `task` is unavailable, continue with the best concise checklist or direct method and report a material limitation; never block, loop, or auto-continue.',
    'Confirm a path exists before reading it. For a schema or path error, make at most one evidence-based targeted correction, then continue with the evidence already available.',
    ...evidenceDisciplineLines(resolved),
    '',
    '### Observed task facts (not a workflow decision)',
    '',
    ...taskFactLines(resolved, parentTask),
    '',
    '### Advisor guidance',
    '',
    'Treat advisor notes as evidence deltas. Incorporate each distinct material point once, applying a concrete newly evidenced correction before delivery when it improves the user result. A repeated note or a note without a new file, location, error, or observed result does not justify rereading skills, rerunning unchanged tools, reopening completed work, or emitting a second final answer.',
    'Finish tool use and absorb advisor notes already delivered before producing one user-visible deliverable. If the host invokes an advisor-only continuation after that deliverable, produce no user-visible text or tools and wait for an actual user message.',
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
  route,
  workspaceRoot = '',
  parentTask = '',
  skillsProvided = false,
  availableSkills = [],
} = {}) {
  const inventoryNames = unique((availableSkills ?? [])
    .map((skill) => typeof skill === 'string' ? skill : skill?.name)
    .map((name) => String(name ?? '').trim())
    .filter((name) => /^[a-z0-9][a-z0-9._/-]*$/i.test(name)));
  return [
    'OMP autonomous workflow reminder:',
    'For non-trivial work, choose workflows and skills from the injected catalog, initialize the native `todo` before substantive work, and make `todo` with `op: "init"` the FIRST tool call.',
    `Active installed skill names for this turn: ${inventoryNames.join(', ') || 'none exposed by the host'}. Choose directly from this list; do not probe bare \`skill://\` or list skill directories.`,
    'Next load each selected skill with `read` path `skill://<exact-name>` before project reads; never use `manage_skill` or a verbal claim as loading evidence.',
    'Fork multiple independent workstreams with `task`; select exact IDs from the workflow `Agent roles` list, and begin every child task with the exact `[workflow=... step=... todo=... skills=...]` prefix.',
    'This is advisory only. If a mechanism is unavailable, continue without blocking or automatic continuation.',
  ].join('\n');
}

export function buildSubagentPromptFragment({ prompt = '' } = {}) {
  const metadata = parseWorkflowMetadata(prompt);
  const agent = parseRole(prompt) || 'subagent';
  const skills = metadata.skills.length ? metadata.skills : parseRoleSkills(prompt);
  return [
    '## OMP Subagent Workflow Checkpoint',
    '',
    `Role: ${agent}`,
    `Parent-selected workflow: ${metadata.workflow || 'unspecified'}`,
    `Parent-selected step: ${metadata.step || 'unspecified'}`,
    `Parent TODO item: ${metadata.todo || 'unspecified'}`,
    '',
    'Parent-selected skills for this checkpoint:',
    formatSkillList(skills),
    '',
    'Do not reroute the whole parent task or select a different workflow. Own only this checkpoint. Load the exact parent-selected skills before substantive work, unless they are already present in the subagent context.',
    'If a selected skill cannot be loaded, make one targeted correction and continue with the available evidence. Missing metadata or skills are limitations to report, not reasons to block.',
    '',
    'Return a concise checkpoint result with evidence, files, checks, unresolved risks, and the acceptance criteria outcome. The parent integrates and verifies the final result.',
  ].join('\n');
}

export function formatWorkflowBriefingForAssignment(route) {
  if (!route || route.intent === 'unknown') return '';
  const resolved = advisoryRoute(route);
  return [
    'Legacy diagnostic briefing:',
    `Observed operation: ${resolved.taskDescriptor?.operation ?? 'unknown'}`,
    `Observed domains: ${(resolved.taskDescriptor?.domains ?? []).join(', ') || 'general'}`,
    'The parent agent must still choose the workflow, TODO item, and skills for each child assignment.',
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

export function inspectionBudgetForRoute(_route = {}, parentTask = '') {
  return inspectionBudgetForPrompt(parentTask);
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
