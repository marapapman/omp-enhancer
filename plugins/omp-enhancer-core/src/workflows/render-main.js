import { WORKFLOW_CATALOG_VERSION, workflowDefinitions } from './catalog.js';

export function buildWorkflowCatalogPrompt({ availableSkills = [], audience = 'main' } = {}) {
  const inventory = normalizeSkillInventory(availableSkills);
  const lines = [
    `OMP_WORKFLOW_CATALOG_VERSION: ${WORKFLOW_CATALOG_VERSION}`,
    'This catalog is a composable menu, not an exclusive classifier. Select one or more workflows from the observed task; a legacy route hint is diagnostic only.',
    'For writing, select writing.zh or writing.en from the language of the text being changed, then compose writing.latex, slides.modify, writing.markdown, or doc.convert.word for the artifact format. For a new deck, slides.generate establishes the output language during story discussion. The surrounding instruction language does not decide the writing language. For evidence-backed online research, compose research.web with factcheck.document and the selected output-language or format workflow.',
    'Agent roles are exact installed agent IDs. Invoke only roles listed by the selected workflow plus roles inherited from an explicitly composed workflow.',
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
      'Agent roles:',
      ...(definition.roles.length
        ? definition.roles.map((role) => `- \`${role}\` — exact installed agent ID`)
        : ['- none']),
      'Delegation:',
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
