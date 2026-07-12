export const workflowRouteNames = [
  'agentic.simple',
  'writing.pending',
  'writing.zh',
  'writing.en',
  'writing.latex',
  'writing.markdown',
  'doc.convert.word',
  'factcheck.document',
  'code.dev',
  'code.debug',
  'code.test',
  'code.review',
  'omp.plugin',
  'security.review',
  'design.visual',
];

export const workflowRouteCatalog = {
  'agentic.simple': routeMeta({
    steps: ['Understand the request and inspect the smallest relevant context.', 'Respond with the requested result.'],
    scopeNotes: ['No specialized workflow is inferred.'],
    skills: [],
  }),
  'writing.pending': routeMeta({
    steps: ['Read the text or exact document section that will be revised.', 'Detect the body language from that content.', 'Select the matching language skills, revise, and review.'],
    scopeNotes: ['The instruction language is not evidence of the document language.', 'Language-specific skills remain undecided until source text is available.'],
    skills: [],
    qualityChecks: ['preserve meaning and document structure'],
  }),
  'writing.zh': routeMeta({
    steps: ['Revise Chinese prose with plain, natural wording.', 'Review logic, tone, and readability.'],
    scopeNotes: ['This route concerns prose rather than code implementation.'],
    skills: ['plain-chinese-writing', 'zh-writing-polish'],
    qualityChecks: ['Chinese logic and style review'],
  }),
  'writing.en': routeMeta({
    steps: ['Draft or revise English prose.', 'Review logic, tone, formatting, and readability.'],
    scopeNotes: ['This route concerns prose rather than code implementation.'],
    skills: ['writing-markdown-helper'],
    qualityChecks: ['English logic and style review'],
  }),
  'writing.latex': routeMeta({
    steps: ['Read the relevant LaTeX source.', 'Apply the requested content or formatting change.', 'Review citations, math, figures, and section structure.'],
    scopeNotes: ['Compilation and publication are separate workflow steps when requested.'],
    skills: ['format-markdown2latex', 'format-latex2markdown', 'format-template-latex'],
    qualityChecks: ['LaTeX structure preservation'],
  }),
  'writing.markdown': routeMeta({
    steps: ['Read the Markdown source.', 'Apply the requested revision or conversion.', 'Review headings, lists, citations, and code fences.'],
    scopeNotes: ['Code mentioned inside prose does not by itself make this a code implementation task.'],
    skills: [],
    qualityChecks: ['Markdown structure preservation'],
  }),
  'doc.convert.word': routeMeta({
    steps: ['Inspect the source document and target format.', 'Create or convert the Word document.', 'Review headings, tables, and document structure.'],
    scopeNotes: ['Source preservation and overwrite risk deserve explicit attention.'],
    skills: ['docx'],
    riskNotes: ['Confirm the intended output path before replacing an existing document.'],
  }),
  'factcheck.document': routeMeta({
    steps: ['Extract checkable claims.', 'Collect relevant evidence from independent sources when available.', 'Cross-check conflicts and report support, contradiction, staleness, or insufficiency.'],
    scopeNotes: ['Unverified memory is not equivalent to sourced evidence.'],
    skills: ['fact-checking', 'claim-extraction', 'source-evaluation', 'citation-authenticity'],
    qualityChecks: ['claim-to-evidence consistency'],
    roles: ['fact-planner', 'fact-researcher-a', 'fact-researcher-b', 'fact-cross-checker', 'fact-reviewer'],
  }),
  'code.dev': routeMeta({
    steps: ['Inspect the affected code and existing patterns.', 'Plan the smallest coherent change.', 'Implement the change.', 'Run relevant verification and review the diff.'],
    scopeNotes: ['Release or deployment is a separate step when the user requests it.'],
    skills: ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
    qualityChecks: ['focused tests', 'semantic diff review'],
    roles: ['plan', 'implementation-task', 'reviewer'],
  }),
  'code.debug': routeMeta({
    steps: ['Reproduce or localize the reported failure.', 'Trace the concrete failure path.', 'Explain the root cause and relevant evidence.'],
    scopeNotes: ['Implementation is a follow-on step when a fix is in scope.'],
    skills: ['diagnose', 'systematic-debugging'],
    qualityChecks: ['root-cause evidence'],
  }),
  'code.test': routeMeta({
    steps: ['Identify the requested test targets.', 'Run the relevant test command.', 'Report the host-observed result.'],
    scopeNotes: ['The user-provided target list defines the intended testing scope.'],
    skills: [],
    qualityChecks: ['test result and target correspondence'],
  }),
  'code.review': routeMeta({
    steps: ['Inspect the requested code paths.', 'Trace concrete failure and regression risks.', 'Report findings with file and symbol evidence.'],
    scopeNotes: ['Speculative concerns should be labeled as hypotheses.'],
    skills: ['diagnose', 'verification-before-completion'],
    qualityChecks: ['finding-to-code evidence'],
  }),
  'omp.plugin': routeMeta({
    steps: ['Inventory plugin assets, routes, skills, hooks, and templates.', 'Apply or propose the requested change.', 'Run relevant package and marketplace checks.'],
    scopeNotes: ['Publishing is a separate externally visible action.'],
    skills: ['omp-marketplace-plugin-activation'],
    qualityChecks: ['package and marketplace consistency'],
    roles: ['config-librarian', 'reviewer'],
  }),
  'security.review': routeMeta({
    steps: ['Inspect concrete trust boundaries, callers, and sinks.', 'Separate supported impact from hypothetical risk.', 'Report evidence, severity rationale, and remediation options.'],
    scopeNotes: ['General security prose is not automatically a code security audit.'],
    skills: ['security-review', 'security-scan'],
    qualityChecks: ['caller and sink evidence'],
    riskNotes: ['High-impact findings benefit from independent review before remediation or disclosure.'],
    roles: ['ecc-security-reviewer', 'reviewer'],
  }),
  'design.visual': routeMeta({
    steps: ['Inspect the visual context and constraints.', 'Create or refine the design.', 'Review hierarchy, spacing, typography, responsiveness, and interaction states.'],
    scopeNotes: ['Publication and deployment are separate workflow steps.'],
    skills: ['frontend-design'],
    qualityChecks: ['visual and interaction review'],
  }),
};

export function workflowRouteForLegacyIntent(intent, { auditMode = null } = {}) {
  if (intent === 'testing') return 'code.test';
  if (intent === 'implementation-with-tests') return 'code.dev';
  if (intent === 'diagnosis') return 'code.debug';
  if (intent === 'bug-audit') return auditMode === 'focused' ? 'code.review' : 'code.review';
  if (intent === 'fact-check') return 'factcheck.document';
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
    : workflowRouteForLegacyIntent(route.intent, route);
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
    // One-release compatibility aliases. Runtime and prompt generation use the
    // advisory fields above; these aliases never imply enforcement.
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

function routeMeta({
  steps = [],
  scopeNotes = [],
  skills = [],
  qualityChecks = [],
  riskNotes = [],
  roles = [],
}) {
  return { steps, scopeNotes, skills, qualityChecks, riskNotes, roles };
}

function withoutLegacyRouteFields(route = {}) {
  const {
    requiredSkills: _requiredSkills,
    requiredTools: _requiredTools,
    requiredSubagents: _requiredSubagents,
    hardBlock: _hardBlock,
    hardBlockReasons: _hardBlockReasons,
    gateMode: _gateMode,
    skillGateMode: _skillGateMode,
    shouldForkSubagents: _shouldForkSubagents,
    ...rest
  } = route;
  return rest;
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
