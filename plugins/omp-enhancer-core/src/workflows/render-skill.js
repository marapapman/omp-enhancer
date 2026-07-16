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
    'description: Optional OMP Enhancer workflow reference. Use when a task benefits from a domain checklist or composable workflow card; OMP native settings, tools, permissions, TODO behavior, and dynamic Agents always remain authoritative.',
    '---',
    '',
    '# OMP Enhancer workflows',
    '',
    `Catalog version: ${WORKFLOW_CATALOG_VERSION}.`,
    '',
    'This skill provides optional reference information. It does not route the task, select an Agent, require TODO or delegation, change active tools, grant permission, or decide when work is complete.',
    '',
    'Use OMP\'s current system prompt and runtime settings first. Select, combine, simplify, or ignore the cards below. If more detail is useful, read only the relevant domain reference.',
    '',
    '## Domain index',
    '',
  ];

  for (const domain of DOMAIN_ORDER) {
    const definitions = grouped.get(domain) ?? [];
    lines.push(
      `### ${domain}`,
      '',
      `Reference: \`references/${domain}.md\``,
      '',
      ...definitions.map((definition) => `- \`${definition.id}\`: ${definition.chooseWhen}`),
      '',
    );
  }

  lines.push(
    '## Runtime authority',
    '',
    '- Use only skills that OMP currently exposes.',
    '- Treat listed Agent IDs as optional candidates, never as a whitelist.',
    '- Use an Agent only when it appears in OMP\'s current dynamic Available Agents list.',
    '- Follow OMP native behavior for TODOs, delegation, tools, approvals, and completion.',
    '',
  );
  return lines.join('\n');
}

export function buildWorkflowSkillReferenceMarkdown(domain) {
  if (!DOMAIN_ORDER.includes(domain)) throw new Error(`Unknown workflow skill domain: ${domain}.`);
  const definitions = groupDefinitions().get(domain) ?? [];
  const lines = [
    `# ${domain} workflow reference`,
    '',
    'Optional reference only. OMP native runtime instructions and settings remain authoritative.',
    '',
  ];
  for (const definition of definitions) {
    lines.push(...renderCard(definition), '');
  }
  return lines.join('\n');
}

export function buildWorkflowSkillReferences() {
  return Object.freeze(Object.fromEntries(
    DOMAIN_ORDER.map((domain) => [domain, buildWorkflowSkillReferenceMarkdown(domain)]),
  ));
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
    `- Use when: ${definition.chooseWhen}`,
    `- May compose with: ${definition.composeWith.length ? definition.composeWith.map(code).join(', ') : 'none normally'}.`,
    `- Reference steps: ${definition.steps.map(({ id, text }, index) => `(${index + 1}) [${id}] ${text}`).join(' ')}`,
    `- Optional skills: ${definition.skills.length ? definition.skills.map(code).join(', ') : 'none suggested'}.`,
    `- Optional Agent candidates: ${definition.roles.length ? definition.roles.map(code).join(', ') : 'none suggested'}.`,
    `- Optional delegation ideas: ${sentenceList(definition.delegation)}.`,
    `- Quality checks: ${sentenceList(definition.qualityChecks)}.`,
    `- Scope notes: ${sentenceList(definition.scopeNotes, 'none')}.`,
    `- Risk notes: ${sentenceList(definition.riskNotes, 'none')}.`,
  ];
}

function code(value) {
  return `\`${value}\``;
}

function sentenceList(values, fallback = '') {
  if (!values.length) return fallback;
  return values.map((value) => value.replace(/[.!?]+$/u, '')).join('; ');
}
