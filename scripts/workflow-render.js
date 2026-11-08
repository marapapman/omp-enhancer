import { WORKFLOW_CATALOG_VERSION, workflowDefinitions } from './workflow-definitions.js';
const WORKFLOW_PHASE_LINE = 'ANALYZE -> EXECUTE -> REVIEW';

const AGENT_DESCRIPTIONS = Object.freeze({
  'fact-planner': 'Decomposes a fact-checking task into checkable claims, evidence plans, risk levels, and scope boundaries.',
  'fact-researcher-a': 'First independent evidence lane for fact checking; collects primary-source evidence for planned claims and lists claims the plan omitted.',
  'fact-researcher-b': 'Second independent evidence lane; looks for corroboration, counter-evidence, source conflicts, and omitted claims.',
  'fact-researcher-c': 'Third independent evidence lane; third-model corroboration plus an independent enumeration of omitted claims.',
  'fact-challenger': 'Adversarial reviewer that attacks recorded verdicts and reports claims the plan missed (AGREE / REBUT / MISSED).',
  scout: 'Fast read-only scout returning compressed context for handoff; use for exploratory codebase research and broad pattern searches.',
  task: 'General-purpose subagent with full capabilities for delegated multi-step work.',
});

function describeAgent(role) {
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
    '4. Load the domain reference before starting matching work; it carries the required step order and checkpoints.',
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
    'Text capability note: `polisher` is a writing-helper tool, not an Agent. It is a stateless language pass: Main drafts every prose and copy surface, sends one bounded passage to `polisher`, and inserts the returned text verbatim. The polisher model role may be older or smaller because the tool has no tools, no file access, and no agentic work; planning, evidence, structure, layout, conversion, and validation stay with Main/task.',
    '',
  ];
}

function buildWorkflowSkillReferenceMarkdown(workflowId) {
  const definition = workflowDefinitions.find(({ id }) => id === workflowId);
  if (!definition) throw new Error(`Unknown workflow skill reference: ${workflowId}.`);
  const lines = [
    `# \`${workflowId}\` workflow reference`,
    '',
    'Optional advisory reference. Main orchestrates freely.',
    '',
    `- When: ${definition.chooseWhen}`,
    `- Skills: ${codeList(definition.skills)}`,
    `- Agent candidates: ${definition.roles.length ? definition.roles.map(code).join(', ') : 'none suggested'}.`,
    '',
    'Text capability note: `polisher` is a writing-helper tool, not an Agent. Main drafts the text, calls `polisher` on each bounded passage, and inserts the returned text verbatim; code, evidence, structure, layout, and validation stay with Main/task, and the polisher model may be older or smaller because it performs only language polishing.',
    '',
    '## Required step order',
    '',
    'These steps are the required execution order for this domain. The plugin provides no runtime gate, router, or completion condition — that means the runtime never blocks you, not that the steps are optional. Skipping a named step without a stated reason is a workflow violation; report it in the final delivery.',
    '',
    ...definition.suggestedFlow.map((text, index) => `${index + 1}. ${text}`),
    '',
  ];
  if (definition.scopeNotes.length > 0) {
    lines.push(
      '## Scope notes',
      '',
      ...definition.scopeNotes.map((text) => `- ${text}`),
      '',
    );
  }
  return lines.join('\n');
}
function renderIndexRow(definition) {
  return `- \`${definition.id}\` — ${definition.chooseWhen} ${renderSkillDiscovery(definition)} Reference: \`${workflowReferenceUri(definition.id)}\`.`;
}

function renderSkillDiscovery(definition) {
  if (!definition.skills.length) return 'S=[none].';
  return `D=[${definition.skills.map((skill) => code(`skill://${skill}`)).join(', ')}].`;
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