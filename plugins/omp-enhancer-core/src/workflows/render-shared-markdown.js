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
    'This catalog is shared by the main agent and Advisor. It is guidance, not a router, permission system, completion gate, or continuation controller. The acting agent chooses and may compose workflows from the observed task, target content, user constraints, and active skill inventory.',
    '',
    '## Main-agent orchestration protocol',
    '',
    'For every non-trivial task:',
    '',
    '1. Read the request and the smallest context needed to understand the target.',
    '2. Select one or more workflows below. Treat format workflows as companions when appropriate.',
    '3. Inspect the active skill inventory and choose the smallest applicable skill set. Do not assume a listed candidate is installed.',
    '4. Initialize the native `todo` before substantive project work and make it the first tool call. Do not read, glob, grep, edit, or otherwise inspect the project first. Include the selected workflow, required steps, selected skills, explicit user requirements, verification, and final reconciliation.',
    '5. After TODO initialization and before project reads, load each selected installed skill with `read` path `skill://<exact-name>`. A native `skill-prompt` body already in context also counts. `manage_skill`, `learn`, memory, and a verbal claim do not load installed skills.',
    '6. Execute TODO items in dependency order and update their status as evidence arrives. Do not rely on memory to retain unfinished requirements.',
    '7. When at least two useful workstreams are independent, fork multiple subagents, preferably in one `task.tasks[]` batch. Keep integration, irreversible choices, and final verification with the parent. Do not fork ceremonial work for a trivial or tightly coupled task.',
    '8. Select every child through the exact installed agent ID in the chosen workflow\'s `Agent roles` entry or an explicitly composed workflow. Give every child its workflow, exact workflow step, TODO item, selected skills, scope, non-goals, dependencies, deliverable, and acceptance evidence. Begin with the literal `[workflow=<ids> step=<step-id> todo=<exact-item> skills=<comma-separated-skill-names>]` prefix; do not abbreviate or rename those keys. A child owns only that checkpoint.',
    '9. Native `task` starts background jobs. Consume child results when delivered; if status is needed and native `job` is available, use one bounded `job` list or poll. Never launch another `task` merely to poll children or check temporary report files.',
    '10. Reconcile the TODO, child results, and verification before the final response.',
    '',
    'If `todo`, `task`, or a selected skill is unavailable, continue with a concise checklist or direct work and report a material limitation. Missing workflow mechanics are findings, never authorization or completion gates. The host alone owns sandboxing and approval.',
    '',
    'Writing intent comes from the user instruction. Chinese or English writing resources come from the body of the text being modified, never from the prompt language. For a path-only writing request, read the target first and use `writing.pending` until the body language is observed. Once language is known, prose drafting and revision use the matching writer subagent and an independent checker subagent. LaTeX, Beamer modification, Markdown, and Word are format companions and do not choose the prose language or language roles. For a new Beamer deck, establish the output language explicitly during story discussion. For evidence-backed online research, compose `research.web` with `factcheck.document` and the selected output-language or format workflow.',
    '',
    'Every `Agent roles` entry below names exact installed agent IDs for that workflow. Invoke only those direct roles plus roles inherited from an explicitly composed workflow. `none` means that the workflow stays with the parent unless a composed workflow supplies an exact role.',
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
    `- Agent roles: ${definition.roles.length ? codeList(definition.roles) : 'none'}.`,
    `- Delegation: ${proseList(definition.delegation.map((line) => codeFirstExactIds(line, roleIds)))}.`,
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
