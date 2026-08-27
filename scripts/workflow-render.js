import { WORKFLOW_CATALOG_VERSION, workflowDefinitions } from './workflow-definitions.js';
const WORKFLOW_PHASE_LINE = 'ANALYZE -> EXECUTE -> REVIEW';

const AGENT_DESCRIPTIONS = Object.freeze({
  checker: 'Read-only English checker for a narrow semantic-drift, logic, and clarity check or a broad seven-dimension advisory audit.',
  'fact-cross-checker': 'Compares independent fact-check evidence lanes and identifies agreement, conflicts, stale evidence, and unresolved claims.',
  designer: 'UI/UX specialist for design implementation, review, and visual refinement.',
  'fact-planner': 'Decomposes a fact-checking task into checkable claims, evidence plans, risk levels, and scope boundaries.',
  'fact-researcher-a': 'First independent evidence lane for fact checking; collects primary-source evidence for planned claims.',
  'fact-researcher-b': 'Second independent evidence lane; looks for corroboration, counter-evidence, and source conflicts.',
  'fact-reviewer': 'Final fact-check reviewer; reviews plan, evidence, cross-check status, and final verdicts for overclaiming.',
  scout: 'Fast read-only scout returning compressed context for handoff; use for exploratory codebase research and broad pattern searches.',
  task: 'General-purpose subagent with full capabilities for delegated multi-step work.',
  visioner: 'Read-only visual QA specialist for slide decks, UI/web screenshots and interaction states, and static canvas/export artifacts.',
  writer: 'Bounded English writer for drafting or revision, including LaTeX passages and read-only proposed replacements.',
  'zh-checker': '中文只读 checker，可执行窄范围的语义漂移、逻辑与清晰度核查，或完整七维审查。',
  'zh-writer': '有界中文写作与修改 agent，支持 LaTeX 段落和只读修改稿，输出自然中文。',
});

export function describeAgent(role) {
  const description = AGENT_DESCRIPTIONS[role];
  if (!description) throw new Error(`No agent description for workflow role ${role}.`);
  return description;
}

const SHARED_CATALOG_BLOCK_START = '<!-- OMP-ENHANCER-WORKFLOW-CATALOG:START -->';
const SHARED_CATALOG_BLOCK_END = '<!-- OMP-ENHANCER-WORKFLOW-CATALOG:END -->';

export function buildSharedWorkflowCatalogMarkdown() {
  const lines = [
    SHARED_CATALOG_BLOCK_START,
    `# OMP Enhancer Workflow Catalog v${WORKFLOW_CATALOG_VERSION}`,
    '',
    `Advisory reference. Main orchestrates freely through ${WORKFLOW_PHASE_LINE}.`,
    '',
  ];

  for (const definition of workflowDefinitions) {
    lines.push(...renderWorkflowCard(definition), '');
  }

  lines.push(SHARED_CATALOG_BLOCK_END, '');
  return lines.join('\n');
}

function renderWorkflowCard(definition) {
  return [
    `## \`${definition.id}\``,
    '',
    `- When: ${definition.chooseWhen}`,
    `- Skills: ${codeList(definition.skills)}`,
    `- Agents: ${definition.roles.length ? codeList(definition.roles) : 'none suggested'}`,
    '- Flow:',
    ...definition.suggestedFlow.map((text, index) => `  ${index + 1}. ${text}`),
  ];
}

export function buildWorkflowSkillIndexMarkdown() {
  const lines = [
    '---',
    'name: omp-enhancer-workflows',
    'description: Workflow reference catalog for Main orchestration.',
    '---',
    '',
    '# Workflow reference catalog',
    '',
    'Advisory reference only. Main selects workflows, Skills, Agents, and delegation width freely. OMP native instructions remain authoritative.',
    '',
    `Phases: ${WORKFLOW_PHASE_LINE}. Main chooses direct work or delegation at each phase based on task complexity.`,
    '',
    '## Domain index',
    '',
  ];
  for (const definition of workflowDefinitions) {
    lines.push(renderIndexRow(definition));
  }
  lines.push('', ...renderAgentDescriptions(), '## Usage', '');
  lines.push(
    '1. Match the task to a domain above.',
    '2. Load matching skills as needed for methods and evidence rules.',
    '3. Choose the Agents you need from the descriptions above; OMP exposes their current availability.',
    '',
  );
  return lines.join('\n');
}

export function buildWorkflowSkillReferences() {
  return Object.freeze(Object.fromEntries(
    workflowDefinitions.map(({ id }) => [id, buildWorkflowSkillReferenceMarkdown(id)]),
  ));
}

function renderAgentDescriptions() {
  const roles = [...new Set(workflowDefinitions.flatMap(({ roles }) => roles))].sort();
  return [
    '## Agent descriptions',
    '',
    ...roles.map((role) => `- \`${role}\` — ${describeAgent(role)}`),
    '',
  ];
}

function buildWorkflowSkillReferenceMarkdown(workflowId) {
  const definition = workflowDefinitions.find(({ id }) => id === workflowId);
  if (!definition) throw new Error(`Unknown workflow skill reference: ${workflowId}.`);
  return [
    `# \`${workflowId}\` workflow reference`,
    '',
    'Optional advisory reference. Main orchestrates freely.',
    '',
    `- When: ${definition.chooseWhen}`,
    `- Skills: ${codeList(definition.skills)}`,
    `- Agent candidates: ${definition.roles.length ? definition.roles.map(code).join(', ') : 'none suggested'}.`,
    '',
  ].join('\n');
}

function renderIndexRow(definition) {
  return `- \`${definition.id}\` — ${definition.chooseWhen} ${renderSkillDiscovery(definition)} Reference: \`${workflowReferenceUri(definition.id)}\`.`;
}

function renderSkillDiscovery(definition) {
  const direct = definition.skills
    .filter((skill) => !definition.catalogSkills.includes(skill))
    .map((skill) => code(`skill://${skill}`));
  const catalog = definition.catalogSkills
    .map((directory) => code(`skill://ecc-skill-catalog/${directory}/SKILL.md`));
  if (!direct.length && !catalog.length) return 'S=[none].';
  return [
    ...(direct.length ? [`D=[${direct.join(', ')}]`] : []),
    ...(catalog.length ? [`C=[${catalog.join(', ')}]`] : []),
  ].join(' ') + '.';
}

export function workflowReferenceUri(workflowId) {
  return `skill://omp-enhancer-workflows/references/${workflowId}.md`;
}

function code(value) {
  return `\`${value}\``;
}

function codeList(values) {
  return values.map((value) => `\`${value}\``).join(', ');
}