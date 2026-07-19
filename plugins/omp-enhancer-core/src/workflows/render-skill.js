import { WORKFLOW_CATALOG_VERSION, workflowDefinitions } from './catalog.js';

export const WORKFLOW_SKILL_NAME = 'omp-enhancer-workflows';

const DOMAIN_ORDER = Object.freeze([
  'general',
  'writing',
  'research',
  'code',
  'network',
  'database',
  'ml',
  'growth',
  'operations',
]);

export function buildWorkflowSkillIndexMarkdown() {
  const grouped = groupDefinitions();
  const lines = [
    '---',
    `name: ${WORKFLOW_SKILL_NAME}`,
    'description: Workflow navigation for analysis, judgment, staged work, or delegation.',
    '---',
    '',
    '# OMP Enhancer workflows',
    '',
    `Catalog version: ${WORKFLOW_CATALOG_VERSION}.`,
    '',
    'This Skill is navigation, not a domain method. It does not route tasks, select Agents, create gates, change tools, grant permission, or decide completion.',
    '',
    '## Staged protocol',
    '',
    '1. **DISCOVER** — For non-mechanical work, read this index alone before project work and wait. A mechanical field lookup without analysis uses no Skill or TODO.',
    '',
    '2. **PLAN + LOAD** — Choose from the requested operation, source, and output. Emit the exact block below, load only its resources, and wait; project facts wait until READY.',
    '',
    '3. **READY + EXECUTE** — After resources, emit READY, commit the loaded method to detailed native TODO when exposed, wait, then execute it.',
    '',
    'Delegation is Main-owned; OMP native settings, tools, permissions, TODO, dynamic Agents, and completion remain authoritative.',
    '',
    'WORKFLOW MATCH: test every whole Primary condition, not words like plan. Choose one for the central requested operation or deliverable; put every other independently matching requested operation or output in Add-ons. Do not add a workflow merely for an internal phase already covered by the Primary. Format-conversion plans match source/output rows, not `code.dev`. LaTeX prose correction keeps `writing.latex` + its language workflow; no converter/template unless requested.',
    '',
    '## Domain index',
    '',
    'SELECTION TABLE ONLY: choose here, emit PLAN, then read its literal PLAN URIs. A PLAN URI is `Load order` text, not an early call. Choose Skills from native descriptions and `Not for` boundaries, never for awareness.',
    '',
  ];

  for (const domain of DOMAIN_ORDER) {
    const definitions = grouped.get(domain) ?? [];
    lines.push(
      `### ${domain}`,
      '',
      ...definitions.map((definition) => (
        `- \`${definition.id}\` — Primary: ${definition.chooseWhen} PLAN URI: \`${workflowReferenceUri(definition.id)}\`.`
      )),
      '',
    );
  }

  lines.push(
    '## State handoff',
    '',
    'SOFT, MAIN-OWNED TRACE: no plugin enforces this order. Only visible assistant text counts; thinking, tool arguments, and files do not.',
    '',
    'SELECTION: Primary is exactly one central workflow ID. Put every other independently matching operation or output in Add-ons, never joined with `+`. From the native inventory, exclude every `Not for` match and choose the smallest Skill set positively owning the requested method, evidence, verdict, or format, never one for awareness. Format-only conversion loads its converter, not a target-format prose Skill unless content editing is requested. A workflow reference is not a domain Skill.',
    '',
    'LOAD ORDER: list every declared exact domain Skill or catalog `skill://...` URI first, then copy each selected row\'s literal workflow `PLAN URI:` once and last. This makes the final card cue READY. Resolve an exact nested Skill URI revealed by a declared catalog before the workflow references; name it, read it, wait, and do not repeat PLAN.',
    '',
    'NEXT VISIBLE ASSISTANT TEXT — plain, unquoted, fully filled before any tool call:',
    'WORKFLOW PLAN',
    'Primary: <one-workflow-id-or-none>',
    'Add-ons: <comma-separated-workflow-ids-or-none>',
    'Skills: <comma-separated-exact-domain-skill-uris-or-none>',
    'Load order: <comma-separated-skill-then-reference-uris-or-none>',
    'Actions:',
    '1. <how every selected workflow and Skill will be applied and verified>',
    'OUTPUT BRIDGE: the first visible content item is this full `WORKFLOW PLAN`; resource calls follow it. Use a separate numbered Action for each distinct requested checkpoint or evidence phase; do not collapse them into one catch-all line. Thinking, narration without the block, or `...` does not count. Call every Load order URI and nothing else, end, and wait; no project tool, `todo`, `task`, or final.',
    '',
    'AFTER ALL DECLARED RESOURCES AND ANY CATALOG EXTENSION HAVE RETURNED, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`; then rebase the detailed TODO once before the first project action. When native `todo` is exposed, the only call in this response is TODO init; end and wait, then start project work in the next response.',
    '',
  );

  return lines.join('\n');
}

export function buildWorkflowSkillReferenceMarkdown(workflowId) {
  const definition = workflowDefinitions.find(({ id }) => id === workflowId);
  if (!definition) throw new Error(`Unknown workflow skill reference: ${workflowId}.`);
  const lines = [
    `# \`${workflowId}\` workflow reference`,
    '',
    'Optional reference only. OMP native runtime instructions and settings remain authoritative.',
    'RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.',
    '',
    ...renderCard(definition),
    '',
    'NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.',
    '',
  ];
  return lines.join('\n');
}

export function buildWorkflowSkillReferences() {
  return Object.freeze(Object.fromEntries(
    workflowDefinitions.map(({ id }) => [id, buildWorkflowSkillReferenceMarkdown(id)]),
  ));
}

export function workflowReferenceUri(workflowId) {
  return `skill://${WORKFLOW_SKILL_NAME}/references/${workflowId}.md`;
}

function groupDefinitions() {
  const grouped = new Map(DOMAIN_ORDER.map((domain) => [domain, []]));
  for (const definition of workflowDefinitions) {
    grouped.get(domainForWorkflow(definition.id)).push(definition);
  }
  return grouped;
}

function domainForWorkflow(id) {
  if (id === 'agentic.simple') return 'general';
  if (/^(?:writing\.|slides\.|diagram\.|doc\.)/.test(id)) return 'writing';
  if (/^(?:research\.|factcheck\.)/.test(id)) return 'research';
  if (/^(?:code\.|performance\.)/.test(id)) return 'code';
  if (id.startsWith('network.')) return 'network';
  if (id.startsWith('database.')) return 'database';
  if (id.startsWith('ml.')) return 'ml';
  if (/^(?:marketing\.|seo\.)/.test(id)) return 'growth';
  return 'operations';
}

function renderCard(definition) {
  return [
    `## \`${definition.id}\``,
    '',
    `- Primary when: ${definition.chooseWhen}`,
    '- Reference steps:',
    ...definition.steps.map(({ id, text }, index) => `  ${index + 1}. [${id}] ${text}`),
    `- Optional Agent candidates: ${definition.roles.length ? definition.roles.map(code).join(', ') : 'none suggested'}.`,
    ...renderSublist('Optional delegation ideas', definition.delegation),
    ...renderSublist('Quality checks', definition.qualityChecks),
    ...renderSublist('Scope notes', definition.scopeNotes, 'none'),
    ...renderSublist('Risk notes', definition.riskNotes, 'none'),
  ];
}

function code(value) {
  return `\`${value}\``;
}

function renderSublist(label, values, fallback = '') {
  const items = values.length ? values : [fallback];
  return [
    `- ${label}:`,
    ...items.map((value) => `  - ${value || 'none'}`),
  ];
}
