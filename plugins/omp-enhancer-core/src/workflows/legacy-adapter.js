import { withoutLegacyRouteFields } from '../legacy-fields.js';
import { workflowRouteCatalog, workflowRouteNames } from './catalog.js';

export function workflowRouteForLegacyIntent(intent) {
  if (intent === 'testing') return 'code.test';
  if (intent === 'implementation-with-tests') return 'code.dev';
  if (intent === 'diagnosis') return 'code.debug';
  if (intent === 'bug-audit') return 'code.review';
  if (intent === 'fact-check') return 'factcheck.document';
  if (intent === 'planning') return 'code.plan';
  if (intent === 'security-review') return 'security.review';
  if (intent === 'config-assets') return 'omp.plugin';
  if (intent === 'writing.pending') return 'writing.pending';
  if (intent === 'writing.zh') return 'writing.zh';
  if (intent === 'writing.en') return 'writing.en';
  return 'agentic.simple';
}

export function decorateWorkflowRoute(route, { workflowRoute = null } = {}) {
  const resolvedWorkflowRoute = workflowRouteNames.includes(workflowRoute)
    ? workflowRoute
    : workflowRouteForLegacyIntent(route.intent);
  const meta = workflowRouteCatalog[resolvedWorkflowRoute] ?? workflowRouteCatalog['agentic.simple'];
  const skills = unique([...(route.skills ?? route.requiredSkills ?? []), ...meta.skills]);
  const tools = unique(route.tools ?? route.requiredTools ?? []);
  const roles = normalizeRoles(route.roles ?? route.requiredSubagents ?? []);
  return {
    ...withoutLegacyRouteFields(route),
    skills,
    tools,
    roles,
    workflowRoute: resolvedWorkflowRoute,
    workflowTaskType: resolvedWorkflowRoute,
    routeCard: buildWorkflowRouteCard({ route: resolvedWorkflowRoute, skills, roles }),
    routeCardSections: workflowRouteCardSections(),
    workflowMode: 'advisory',
    advisoryOnly: true,
    autoContinue: false,
    classifierMode: 'route-hint-only',
    shouldUseClassifier: false,
    qualityChecks: unique(meta.qualityChecks),
    riskNotes: unique(meta.riskNotes),
    requiredSkills: skills,
    requiredTools: tools,
    requiredSubagents: roles.map(toLegacyRoleAlias),
    deprecatedAliases: ['requiredSkills', 'requiredTools', 'requiredSubagents'],
  };
}

export function buildWorkflowRouteCard({
  route = 'agentic.simple',
  skills = [],
  roles = [],
  requiredSkills = [],
  includeCatalogSkills = true,
} = {}) {
  const workflowRoute = workflowRouteNames.includes(route) ? route : 'agentic.simple';
  const meta = workflowRouteCatalog[workflowRoute];
  const selectedSkills = includeCatalogSkills
    ? unique([...(skills ?? []), ...(requiredSkills ?? []), ...meta.skills])
    : unique([...(skills ?? []), ...(requiredSkills ?? [])]);
  const selectedRoles = unique([
    ...normalizeRoles(roles).map(({ agent }) => agent),
    ...meta.roles,
  ]);
  return [
    'WORKFLOW_GUIDE',
    `Task type: ${workflowRoute}`,
    '',
    'Suggested steps:',
    ...meta.steps.map((line) => `- ${line}`),
    '',
    'Skills:',
    ...(selectedSkills.length ? selectedSkills.map((skill) => `- ${skill}`) : ['- none yet']),
    '',
    'Optional roles:',
    ...(selectedRoles.length ? selectedRoles.map((role) => `- ${role}`) : ['- none']),
    '',
    'Quality checks:',
    ...(meta.qualityChecks.length ? meta.qualityChecks.map((line) => `- ${line}`) : ['- use task-appropriate judgment']),
    '',
    'Scope and risk notes:',
    ...[...meta.scopeNotes, ...meta.riskNotes].map((line) => `- ${line}`),
  ].join('\n');
}

export function workflowRouteCardSections() {
  return ['WORKFLOW_GUIDE', 'Task type', 'Suggested steps', 'Skills', 'Optional roles', 'Quality checks', 'Scope and risk notes'];
}

function normalizeRoles(values = []) {
  return (values ?? []).map((value) => {
    if (typeof value === 'string') return { agent: value, duty: '', skills: [] };
    return {
      ...value,
      skills: unique(value?.skills ?? value?.requiredSkills ?? []),
    };
  }).filter(({ agent }) => agent);
}

function toLegacyRoleAlias(value) {
  const { skills = [], ...rest } = value;
  return { ...rest, requiredSkills: [...skills] };
}

function unique(values = []) {
  return [...new Set((values ?? []).filter(Boolean))];
}
