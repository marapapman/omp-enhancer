import { WORKFLOW_CATALOG_VERSION, workflowDefinitions } from './catalog.js';

export function buildWorkflowCatalogPrompt({ availableSkills = [], audience = 'main' } = {}) {
  const inventory = normalizeSkillInventory(availableSkills);
  const lines = [
    `OMP_WORKFLOW_CATALOG_VERSION: ${WORKFLOW_CATALOG_VERSION}`,
    'Supplemental reference only: OMP\'s native system prompt, settings, active tools, dynamic Available Agents list, permissions, and completion behavior are authoritative.',
    'This catalog is a composable menu, not a router or required execution protocol. The acting Agent may select, combine, simplify, or ignore workflows; a legacy route hint is diagnostic only.',
    'For writing, select writing.zh or writing.en from the language of the text being changed, then compose writing.latex, slides.modify, writing.markdown, or doc.convert.word for the artifact format. For a new deck, slides.generate establishes the output language during story discussion. The surrounding instruction language does not decide the writing language. For evidence-backed online research, compose research.web with factcheck.document and the selected output-language or format workflow.',
    'Agent candidates are non-exclusive suggestions. Use one only when it appears in OMP\'s current dynamic Available Agents list; other native or future Agents remain valid.',
    '',
  ];

  for (const definition of workflowDefinitions) {
    lines.push(
      `### ${definition.id}`,
      `Choose when: ${definition.chooseWhen}`,
      `Compose with: ${definition.composeWith.length ? definition.composeWith.join(', ') : 'none normally'}`,
      'Ordered steps:',
      ...definition.steps.map(({ id, text }, index) => `- ${index + 1}. [${id}] ${text}`),
      'Skill candidates:',
      ...(definition.skills.length
        ? definition.skills.map((skill) => `- skill://${skill} — load only when it directly supports a selected step`)
        : ['- none by default; inspect the active inventory for an exact task match']),
      'Optional agent candidates:',
      ...(definition.roles.length
        ? definition.roles.map((role) => `- \`${role}\` — use only when currently available in OMP`)
        : ['- none suggested']),
      'Optional delegation ideas:',
      ...definition.delegation.map((line) => `- ${line}`),
      'Quality checks:',
      ...definition.qualityChecks.map((line) => `- ${line}`),
      'Scope notes:',
      ...(definition.scopeNotes.length ? definition.scopeNotes.map((line) => `- ${line}`) : ['- none']),
      'Risk notes:',
      ...(definition.riskNotes.length ? definition.riskNotes.map((line) => `- ${line}`) : ['- none']),
      '',
    );
  }

  if (audience === 'main') {
    lines.push(
      '## Current model-visible skill inventory',
      '',
      ...(inventory.length
        ? inventory.map(({ name, description }) => `- skill://${name}${description ? ` — ${description}` : ''}`)
        : ['- The host did not expose an inventory. Use an exact project skill if known; otherwise continue and report a material limitation.']),
    );
  }

  return lines.join('\n');
}

function normalizeSkillInventory(values = []) {
  const byName = new Map();
  for (const value of values ?? []) {
    const rawName = typeof value === 'string' ? value : value?.name;
    const name = String(rawName ?? '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._/-]{0,127}$/.test(name) || byName.has(name)) continue;
    const description = typeof value === 'object'
      ? String(value.description ?? '').replace(/\s+/g, ' ').trim().slice(0, 240)
      : '';
    byName.set(name, { name, description });
  }
  return [...byName.values()];
}
