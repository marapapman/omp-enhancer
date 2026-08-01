import { WORKFLOW_CATALOG_VERSION, workflowDefinitions } from './catalog.js';
import { WORKFLOW_PHASE_LINE } from './staged-contract.js';

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

function codeList(values) {
  return values.map((value) => `\`${value}\``).join(', ');
}
