export const workflowRouteNames = [
  'agentic.simple',
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

const hardBlockReasons = [
  'external_credential_missing',
  'irreversible_file_operation',
  'release_or_deploy',
  'real_high_security_risk',
  'network_or_service_unavailable',
  'user_required_approval',
];

export const workflowRouteCatalog = {
  'agentic.simple': routeMeta({
    do: ['Answer or inspect only the requested local context.', 'Use the smallest tool path that resolves the request.'],
    doNot: ['Do not force coding, writing, testing, or security workflows.', 'Do not fork subagents unless the user asks for parallel work.'],
    skills: [],
    gate: ['No pre-work skill gate.', `Hard block only for ${hardBlockReasons.join(', ')}.`],
    shouldForkSubagents: false,
  }),
  'writing.zh': routeMeta({
    do: ['Write or revise Chinese prose with plain, natural wording.', 'Run writing checks when the deliverable is substantive.'],
    doNot: ['Do not treat prose about risk or safety as a security audit.', 'Do not edit code for a prose request.'],
    skills: ['plain-chinese-writing'],
    gate: ['Missing writing skills produce hidden coaching, not a hard block.', 'Writing QA gates apply to substantive drafts.'],
  }),
  'writing.en': routeMeta({
    do: ['Draft or revise English prose.', 'Run writing checks when the deliverable is substantive.'],
    doNot: ['Do not convert prose drafting into testing or security workflows.', 'Do not edit code for a prose request.'],
    skills: ['writing-markdown-helper'],
    gate: ['Missing writing skills produce hidden coaching, not a hard block.', 'Writing QA gates apply to substantive drafts.'],
  }),
  'writing.latex': routeMeta({
    do: ['Convert, repair, or prepare LaTeX writing artifacts.', 'Preserve citations, math, figures, and section structure.'],
    doNot: ['Do not compile or publish unless requested.', 'Do not rewrite content beyond the requested conversion or formatting.'],
    skills: ['format-markdown2latex', 'format-latex2markdown', 'format-template-latex'],
    gate: ['Missing format skills produce hidden coaching, not a hard block.', 'Hard block only before publish or irreversible overwrite.'],
  }),
  'writing.markdown': routeMeta({
    do: ['Draft, revise, or convert Markdown documents.', 'Preserve headings, lists, citations, and code fences.'],
    doNot: ['Do not switch into code implementation because Markdown mentions code.', 'Do not publish generated docs unless requested.'],
    skills: ['writing-markdown-helper'],
    gate: ['Missing Markdown writing skills produce hidden coaching, not a hard block.'],
  }),
  'doc.convert.word': routeMeta({
    do: ['Read, create, or convert Word documents.', 'Preserve document structure, headings, tables, and tracked content where relevant.'],
    doNot: ['Do not treat a Word conversion as generic prose unless no file operation is requested.', 'Do not overwrite source documents irreversibly without approval.'],
    skills: ['docx'],
    gate: ['Missing docx skill produces hidden coaching, not a hard block.', 'Irreversible overwrite requires hard block approval.'],
  }),
  'factcheck.document': routeMeta({
    do: ['Extract checkable claims before evidence collection.', 'Use independent evidence lanes when sources are available.'],
    doNot: ['Do not answer from memory as if claims were verified.', 'Do not blur supported, contradicted, stale, and insufficient evidence.'],
    skills: ['fact-checking', 'claim-extraction', 'source-evaluation', 'citation-authenticity'],
    gate: ['Fact-check gate applies before final factual verdicts.', 'Missing skills produce hidden coaching, not a hard block.'],
    shouldForkSubagents: true,
  }),
  'code.dev': routeMeta({
    do: ['Implement requested code changes and update affected tests.', 'Use existing patterns and verify the changed behavior.'],
    doNot: ['Do not shrink scope to scaffolding or TODOs.', 'Do not run release or deploy steps.'],
    skills: ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
    gate: ['Testing and review gates apply before final completion claims.', 'Skill gaps are coached or recovered, not hard-blocked.'],
    shouldForkSubagents: true,
  }),
  'code.debug': routeMeta({
    do: ['Reproduce or localize the reported failure before changing code.', 'Return root cause and verification evidence.'],
    doNot: ['Do not patch symptoms without evidence.', 'Do not broaden into implementation unless the user asks for a fix.'],
    skills: ['diagnose', 'systematic-debugging'],
    gate: ['Debugging may stop at diagnosis when the user requested read-only analysis.', 'Missing skills produce hidden coaching, not a hard block.'],
  }),
  'code.test': routeMeta({
    do: ['Run only the explicitly authorized local test target or target list.', 'Report the host-observed result without generating or broadening tests.'],
    doNot: ['Do not turn bounded test execution into implementation or bug-audit work.', 'Do not add aggregate suites, redirects, preloads, pipelines, or substituted targets.'],
    skills: [],
    gate: ['Exact host-observed test evidence closes the route.', 'A rejected non-exact command receives one bounded mechanical correction.'],
  }),
  'code.review': routeMeta({
    do: ['Review code paths for concrete defects, maintainability, and regressions.', 'Report file, symbol, and evidence for each finding.'],
    doNot: ['Do not edit production code in a read-only review.', 'Do not report speculative issues as confirmed bugs.'],
    skills: [],
    gate: ['Review evidence gate applies before final findings.', 'Missing skills produce hidden coaching, not a hard block.'],
  }),
  'omp.plugin': routeMeta({
    do: ['Inspect OMP plugin assets, routes, skills, hooks, and templates.', 'Use packaged OMP config tools for asset inventory and portability checks.'],
    doNot: ['Do not publish marketplace changes unless explicitly requested.', 'Do not edit user-authored skills.'],
    skills: ['omp-marketplace-plugin-activation'],
    gate: ['OMP plugin checks apply when modifying packaged assets.', 'Release or marketplace publish remains a hard block.'],
    shouldForkSubagents: true,
  }),
  'security.review': routeMeta({
    do: ['Audit concrete code, config, auth, secret, file, network, or dependency risks.', 'Separate real exploitable risk from wording that only mentions safety.'],
    doNot: ['Do not route general security explanations here.', 'Do not treat prose editing about risk as a security audit.'],
    skills: ['security-review', 'security-scan'],
    gate: ['Real high security risk can hard block unsafe continuation.', 'Missing security skills produce hidden coaching, not a hard block.'],
    shouldForkSubagents: true,
  }),
  'design.visual': routeMeta({
    do: ['Design or refine visual interfaces, artifacts, or component presentation.', 'Apply frontend or artifact design skills before implementation.'],
    doNot: ['Do not default to generic styling.', 'Do not publish or deploy designs unless requested.'],
    skills: ['frontend-design'],
    gate: ['Design review or visual QA applies when appearance is the deliverable.', 'Missing design skills produce hidden coaching, not a hard block.'],
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
  if (intent === 'writing.zh') return 'writing.zh';
  if (intent === 'writing.en') return 'writing.en';
  return 'agentic.simple';
}

export function decorateWorkflowRoute(route, { workflowRoute = null } = {}) {
  const resolvedWorkflowRoute = workflowRouteNames.includes(workflowRoute)
    ? workflowRoute
    : workflowRouteForLegacyIntent(route.intent, route);
  const meta = workflowRouteCatalog[resolvedWorkflowRoute] ?? workflowRouteCatalog['agentic.simple'];
  const requiredSkills = unique([...(route.requiredSkills ?? []), ...meta.skills]);
  return {
    ...route,
    requiredSkills,
    workflowRoute: resolvedWorkflowRoute,
    workflowTaskType: resolvedWorkflowRoute,
    routeCard: buildWorkflowRouteCard({ route: resolvedWorkflowRoute, requiredSkills }),
    routeCardSections: workflowRouteCardSections(),
    gateMode: gateModeForRoute(resolvedWorkflowRoute, route),
    skillGateMode: 'hidden-coach',
    classifierMode: 'route-hint-only',
    shouldUseClassifier: false,
    shouldForkSubagents: Boolean((route.requiredSubagents ?? []).length || meta.shouldForkSubagents),
    hardBlockReasons,
  };
}

export function buildWorkflowRouteCard({ route = 'agentic.simple', requiredSkills = [], includeCatalogSkills = true } = {}) {
  const workflowRoute = workflowRouteNames.includes(route) ? route : 'agentic.simple';
  const meta = workflowRouteCatalog[workflowRoute];
  const skills = includeCatalogSkills
    ? unique([...(requiredSkills ?? []), ...meta.skills])
    : unique(requiredSkills ?? []);
  return [
    'WORKFLOW_CARD',
    `Task type: ${workflowRoute}`,
    '',
    'Do:',
    ...meta.do.map((line) => `- ${line}`),
    '',
    'Do not:',
    ...meta.doNot.map((line) => `- ${line}`),
    '',
    'Skills:',
    ...(skills.length ? skills.map((skill) => `- ${skill}`) : ['- none']),
    '',
    'Gate:',
    ...meta.gate.map((line) => `- ${line}`),
  ].join('\n');
}

export function workflowRouteCardSections() {
  return ['WORKFLOW_CARD', 'Task type', 'Do', 'Do not', 'Skills', 'Gate'];
}

export function gateModeForRoute(workflowRoute, route = {}) {
  if (route.intent === 'release') return 'hard-block';
  if (workflowRoute === 'agentic.simple') return 'none';
  if (workflowRoute === 'factcheck.document') return 'fact-check-gate';
  if (workflowRoute === 'code.dev') return 'test-review-gate';
  if (workflowRoute === 'code.test') return 'test-gate';
  if (workflowRoute === 'code.review') return 'review-gate';
  if (workflowRoute === 'security.review') return 'security-gate';
  if (workflowRoute === 'writing.zh' || workflowRoute === 'writing.en' || workflowRoute === 'writing.latex' || workflowRoute === 'writing.markdown' || workflowRoute === 'doc.convert.word') return 'quality-gate';
  return 'hidden-coach';
}

function routeMeta({ do: doLines, doNot, skills, gate, shouldForkSubagents = false }) {
  return { do: doLines, doNot, skills, gate, shouldForkSubagents };
}

function unique(values) {
  return [...new Set((values ?? []).filter(Boolean))];
}
