import { WORKFLOW_CATALOG_VERSION, workflowDefinitions } from './catalog.js';
import { WORKFLOW_PHASE_LINE } from './staged-contract.js';
import { describeAgent } from './agent-descriptions.js';
import {
  directSkillCandidates,
  exactNestedEccSkillCandidates,
} from './skill-discovery.js';

export const WORKFLOW_SKILL_NAME = 'omp-enhancer-workflows';

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

function renderAgentDescriptions() {
  const roles = [...new Set(workflowDefinitions.flatMap(({ roles }) => roles))].sort();
  return [
    '## Agent descriptions',
    '',
    ...roles.map((role) => `- \`${role}\` — ${describeAgent(role)}`),
    '',
  ];
}

export function buildWorkflowSkillReferenceMarkdown(workflowId) {
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

export function buildWorkflowSkillReferences() {
  return Object.freeze(Object.fromEntries(
    workflowDefinitions.map(({ id }) => [id, buildWorkflowSkillReferenceMarkdown(id)]),
  ));
}

export function workflowReferenceUri(workflowId) {
  return `skill://${WORKFLOW_SKILL_NAME}/references/${workflowId}.md`;
}

function renderIndexRow(definition) {
  return `- \`${definition.id}\` — ${definition.chooseWhen} ${renderSkillDiscovery(definition)} Reference: \`${workflowReferenceUri(definition.id)}\`.`;
}

function renderSkillDiscovery(definition) {
  const direct = directSkillCandidates(definition)
    .map((skill) => code(`skill://${skill}`));
  const catalog = exactNestedEccSkillCandidates(definition).map(code);
  if (!direct.length && !catalog.length) return 'S=[none].';
  return [
    ...(direct.length ? [`D=[${direct.join(', ')}]`] : []),
    ...(catalog.length ? [`C=[${catalog.join(', ')}]`] : []),
  ].join(' ') + '.';
}

function code(value) {
  return `\`${value}\``;
}

function codeList(values) {
  return values.map((value) => `\`${value}\``).join(', ');
}
