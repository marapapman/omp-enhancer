import { WORKFLOW_CATALOG_VERSION, workflowDefinitions } from './catalog.js';

const SHARED_CATALOG_BLOCK_START = '<!-- OMP-ENHANCER-WORKFLOW-CATALOG:START -->';
const SHARED_CATALOG_BLOCK_END = '<!-- OMP-ENHANCER-WORKFLOW-CATALOG:END -->';

export function buildSharedWorkflowCatalogMarkdown() {
  const lines = [
    SHARED_CATALOG_BLOCK_START,
    '# OMP Enhancer Workflow Catalog',
    '',
    `OMP_WORKFLOW_CATALOG_VERSION: ${WORKFLOW_CATALOG_VERSION}`,
    '',
    'This is optional reference material. OMP\'s native system prompt, settings, active tools, dynamic Agent list, approval flow, and completion behavior remain authoritative. The catalog never selects a workflow, grants permission, or imposes a required execution sequence.',
    '',
    '## Using this reference',
    '',
    'Use a workflow card only when it helps interpret the user request. The acting Agent may select, combine, simplify, or ignore cards. Follow OMP\'s native guidance for TODO usage, delegation, tools, permissions, and final delivery.',
    'Skill candidates are optional references and must exist in the current OMP skill inventory before use. Agent candidates are non-exclusive suggestions and may be used only when present in OMP\'s current dynamic Available Agents list; other native or future Agents remain valid.',
    '',
    'Writing intent comes from the user instruction. Chinese or English writing resources come from the body of the text being modified, never from the prompt language. For a path-only writing request, read the target first and use `writing.pending` until the body language is observed. Once language is known, prose drafting and revision use the matching writer subagent and an independent checker subagent. LaTeX, Beamer modification, Markdown, and Word are format companions and do not choose the prose language or language roles. For a new Beamer deck, establish the output language explicitly during story discussion. For evidence-backed online research, compose `research.web` with `factcheck.document` and the selected output-language or format workflow.',
    '',
    '## Workflow cards',
    '',
  ];

  for (const definition of workflowDefinitions) {
    lines.push(...renderWorkflowCard(definition), '');
  }

  lines.push(SHARED_CATALOG_BLOCK_END, '');
  return lines.join('\n');
}

function renderWorkflowCard(definition) {
  const roleIds = definition.roles;
  return [
    `### \`${definition.id}\``,
    '',
    `- Select when: ${definition.chooseWhen}`,
    `- Compose with: ${definition.composeWith.length ? codeList(definition.composeWith) : 'none normally'}.`,
    `- Steps: ${definition.steps.map(({ id, text }, index) => `(${index + 1}) [${id}] ${text}`).join(' ')}`,
    `- Skill candidates: ${definition.skills.length ? codeList(definition.skills) : 'none by default; inspect the active inventory for an exact match'}.`,
    `- Optional agent candidates: ${definition.roles.length ? codeList(definition.roles) : 'none suggested'}.`,
    `- Optional delegation ideas: ${proseList(definition.delegation.map((line) => codeFirstExactIds(line, roleIds)))}.`,
    `- Quality checks: ${proseList(definition.qualityChecks)}.`,
    `- Scope notes: ${proseList(definition.scopeNotes, 'none')}.`,
    `- Risk notes: ${proseList(definition.riskNotes, 'none')}.`,
  ];
}

function codeList(values) {
  return values.map((value) => `\`${value}\``).join(', ');
}

function codeFirstExactIds(value, identifiers) {
  return [...identifiers]
    .sort((left, right) => right.length - left.length)
    .reduce((text, identifier) => {
      const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return text.replace(new RegExp(`(^|[^a-z0-9-])(${escaped})(?=$|[^a-z0-9-])`, 'i'), '$1`$2`');
    }, value);
}

function proseList(values, fallback = '') {
  if (!values.length) return fallback;
  return values.map((value) => value.replace(/[.!?]+$/u, '')).join('; ');
}
