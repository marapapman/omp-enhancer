export const workflowRouteNames = [
  'agentic.simple',
  'writing.pending',
  'writing.zh',
  'writing.en',
  'writing.latex',
  'writing.markdown',
  'doc.convert.word',
  'factcheck.document',
  'code.plan',
  'code.dev',
  'code.debug',
  'code.test',
  'code.review',
  'omp.plugin',
  'security.review',
  'design.visual',
  'release.publish',
];

export const WORKFLOW_CATALOG_VERSION = 3;

const workflowSelectionGuidance = Object.freeze({
  'agentic.simple': 'The request is focused and does not benefit from a specialized workflow.',
  'writing.pending': 'A writing task names a target but the text being changed has not been observed yet.',
  'writing.zh': 'The prose being drafted or revised is Chinese, regardless of the instruction language.',
  'writing.en': 'The prose being drafted or revised is English, regardless of the instruction language.',
  'writing.latex': 'The target artifact is LaTeX; compose this format workflow with the prose language workflow.',
  'writing.markdown': 'The target artifact is Markdown; compose this format workflow with the prose language workflow.',
  'doc.convert.word': 'The requested output is a Word document or a conversion to or from Word.',
  'factcheck.document': 'The user asks to verify factual claims, citations, freshness, or source support.',
  'code.plan': 'The deliverable is an implementation, repair, migration, or test plan rather than the change itself.',
  'code.dev': 'The user authorizes a code or configuration change, usually with verification.',
  'code.debug': 'The task is to reproduce, localize, or explain a concrete failure or mismatch.',
  'code.test': 'The task requires designing, adding, running, or interpreting tests.',
  'code.review': 'The user asks for a read-only code review, bug audit, regression audit, or diff review.',
  'omp.plugin': 'The target is an OMP plugin, marketplace entry, packaged skill, hook, agent, or config asset.',
  'security.review': 'The task explicitly reviews security trust boundaries, vulnerability impact, or remediation.',
  'design.visual': 'The requested output is a UI, visual asset, diagram, layout, or interaction design.',
  'release.publish': 'The user explicitly asks to commit, push, publish, deploy, version, upgrade, or synchronize an installed artifact.',
});

const workflowComposition = Object.freeze({
  'writing.pending': ['writing.latex', 'writing.markdown', 'doc.convert.word'],
  'writing.zh': ['writing.latex', 'writing.markdown', 'doc.convert.word', 'factcheck.document'],
  'writing.en': ['writing.latex', 'writing.markdown', 'doc.convert.word', 'factcheck.document'],
  'writing.latex': ['writing.pending', 'writing.zh', 'writing.en', 'factcheck.document'],
  'writing.markdown': ['writing.pending', 'writing.zh', 'writing.en', 'factcheck.document'],
  'doc.convert.word': ['writing.pending', 'writing.zh', 'writing.en'],
  'factcheck.document': ['writing.zh', 'writing.en', 'writing.latex', 'writing.markdown'],
  'code.plan': ['code.review', 'security.review'],
  'code.dev': ['code.debug', 'code.test', 'code.review', 'security.review', 'omp.plugin'],
  'code.debug': ['code.dev', 'code.test', 'code.review'],
  'code.test': ['code.plan', 'code.dev', 'code.debug', 'code.review', 'omp.plugin'],
  'code.review': ['code.plan', 'code.debug', 'code.test', 'security.review'],
  'omp.plugin': ['code.plan', 'code.dev', 'code.test', 'code.review', 'release.publish'],
  'security.review': ['code.plan', 'code.dev', 'code.review', 'code.test'],
  'design.visual': ['code.dev', 'code.test'],
  'release.publish': ['omp.plugin', 'code.dev', 'code.test', 'code.review'],
});

export const workflowRouteCatalog = {
  'agentic.simple': routeMeta({
    steps: ['Understand the outcome and inspect minimal context.', 'Perform the requested work.', 'Verify proportionally and respond.'],
    scopeNotes: ['No specialized workflow is inferred.'],
    skills: [],
    qualityChecks: ['requested outcome, scope, and factual consistency'],
  }),
  'writing.pending': routeMeta({
    steps: ['Read the exact text or document section.', 'Detect its body language.', 'Compose writing.zh or writing.en with any format companion.', 'Revise and review.'],
    scopeNotes: ['The instruction language is not evidence of the document language.', 'Language-specific skills remain undecided until source text is available.'],
    skills: [],
    qualityChecks: ['preserve meaning, anchors, markup, and document structure'],
  }),
  'writing.zh': routeMeta({
    steps: ['Establish meaning and preservation constraints.', 'Draft or revise natural Chinese prose.', 'Review logic, tone, terminology, and readability.', 'Apply requested fixes.'],
    scopeNotes: ['This route concerns prose rather than code implementation.'],
    skills: ['plain-chinese-writing', 'zh-writing-review', 'zh-writing-polish', 'zh-writing-checkers'],
    qualityChecks: ['meaning preservation, Chinese logic and style, terminology consistency, and requested format'],
  }),
  'writing.en': routeMeta({
    steps: ['Establish meaning and preservation constraints.', 'Draft or revise the English prose.', 'Review logic, tone, terminology, formatting, and readability.', 'Apply requested fixes.'],
    scopeNotes: ['This route concerns prose rather than code implementation.'],
    skills: ['writing-review', 'writing-checkers', 'writing-markdown-helper'],
    qualityChecks: ['meaning preservation, English logic and style, terminology consistency, and requested venue or format'],
  }),
  'writing.latex': routeMeta({
    steps: ['Read the relevant source and local macros.', 'Preserve commands, comments, citations, math, labels, and revision markers.', 'Make the requested change.', 'Inspect the diff and compile when in scope.'],
    scopeNotes: ['Compilation and publication are separate workflow steps when requested.'],
    skills: ['format-markdown2latex', 'format-latex2markdown', 'format-template-latex'],
    qualityChecks: ['LaTeX structure, active-text boundaries, reference integrity, and compile evidence when requested'],
  }),
  'writing.markdown': routeMeta({
    steps: ['Read the source and local conventions.', 'Make the requested revision or conversion.', 'Review headings, lists, links, citations, and code fences.', 'Render or verify when in scope.'],
    scopeNotes: ['Code mentioned inside prose does not by itself make this a code implementation task.'],
    skills: ['writing-markdown-helper', 'zh-writing-markdown-helper'],
    qualityChecks: ['Markdown structure, link and fence integrity, and consistent prose'],
  }),
  'doc.convert.word': routeMeta({
    steps: ['Inspect source and target format.', 'Confirm output location and preservation needs.', 'Create or convert.', 'Review headings, tables, figures, and document structure.'],
    scopeNotes: ['Source preservation and overwrite risk deserve explicit attention.'],
    skills: ['docx'],
    qualityChecks: ['source fidelity, target readability, output existence, and overwrite awareness'],
    riskNotes: ['Confirm the intended output path before replacing an existing document.'],
  }),
  'factcheck.document': routeMeta({
    steps: ['Extract checkable claims.', 'Collect relevant independent evidence.', 'Cross-check conflicts and dates.', 'Report support, contradiction, staleness, or insufficiency.', 'Revise only when authorized.'],
    scopeNotes: ['Unverified memory is not equivalent to sourced evidence.'],
    skills: ['fact-checking', 'claim-extraction', 'source-evaluation', 'citation-authenticity'],
    qualityChecks: ['claim-to-evidence correspondence, source quality, temporal validity, and clear uncertainty'],
    roles: ['fact-planner', 'fact-researcher-a', 'fact-researcher-b', 'fact-cross-checker', 'fact-reviewer'],
  }),
  'code.plan': routeMeta({
    steps: ['Inspect minimal implementation and test context.', 'Define scope and invariants.', 'Decompose implementation and verification.', 'Record dependencies and risks.', 'Deliver an actionable plan without executing it.'],
    scopeNotes: ['Planning is advisory and does not imply permission to edit files or run tests.'],
    skills: ['brainstorming', 'writing-plans'],
    qualityChecks: ['scope completeness, dependency order, and verification correspondence'],
  }),
  'code.dev': routeMeta({
    steps: ['Inspect affected code, tests, and conventions.', 'Plan the smallest coherent change.', 'Write or update focused tests where appropriate.', 'Implement.', 'Verify and review the semantic diff.'],
    scopeNotes: ['Release or deployment is a separate step when the user requests it.'],
    skills: ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
    qualityChecks: ['focused tests, behavior preservation, semantic diff review, and user-scope compliance'],
    roles: ['plan', 'implementation-task', 'reviewer'],
  }),
  'code.debug': routeMeta({
    steps: ['Reproduce or localize the failure.', 'Trace the concrete path and runtime truth.', 'Form and test hypotheses.', 'Explain the root cause with evidence.', 'Compose code.dev only when a fix is requested.'],
    scopeNotes: ['Implementation is a follow-on step when a fix is in scope.'],
    skills: ['diagnose', 'systematic-debugging'],
    qualityChecks: ['reproducible evidence, cause rather than symptom, and installed-versus-source consistency'],
  }),
  'code.test': routeMeta({
    steps: ['Identify targets and real project commands.', 'Prepare needed fixtures or context.', 'Run the relevant tests.', 'Interpret host-observed output.', 'Report failures and coverage honestly.'],
    scopeNotes: ['The user-provided target list defines the intended testing scope.'],
    skills: ['verification-before-completion'],
    qualityChecks: ['command-to-target correspondence, non-empty execution, exit status, and failure visibility'],
  }),
  'code.review': routeMeta({
    steps: ['Inspect requested paths and surrounding contracts.', 'Trace concrete callers and failure paths.', 'Validate findings against tests or runtime evidence.', 'Report prioritized findings with file and symbol evidence.'],
    scopeNotes: ['Speculative concerns should be labeled as hypotheses.'],
    skills: ['diagnose', 'verification-before-completion'],
    qualityChecks: ['finding-to-code evidence, severity rationale, regression impact, and explicit hypotheses'],
  }),
  'omp.plugin': routeMeta({
    steps: ['Inventory plugin assets and live installed state.', 'Make the requested change.', 'Run targeted tests and package checks.', 'Verify marketplace consistency.', 'Release, sync, or upgrade only when requested.'],
    scopeNotes: ['Publishing is a separate externally visible action.'],
    skills: ['omp-marketplace-plugin-activation'],
    qualityChecks: ['package contents, marketplace metadata, installed-runtime parity, and advisory-only lifecycle behavior'],
    roles: ['config-librarian', 'reviewer'],
  }),
  'security.review': routeMeta({
    steps: ['Identify assets, actors, boundaries, callers, and sinks.', 'Inspect concrete paths.', 'Distinguish demonstrated impact from hypotheses.', 'Report evidence, severity, and remediation.', 'Independently review high-impact findings.'],
    scopeNotes: ['General security prose is not automatically a code security audit.'],
    skills: ['security-review', 'security-scan'],
    qualityChecks: ['caller-to-sink evidence, exploit preconditions, impact, and remediation feasibility'],
    riskNotes: ['High-impact findings benefit from independent review before remediation or disclosure.'],
    roles: ['ecc-security-reviewer', 'reviewer'],
  }),
  'design.visual': routeMeta({
    steps: ['Inspect existing visual context and constraints.', 'Choose a direction.', 'Create or refine the design.', 'Review hierarchy, spacing, typography, responsiveness, accessibility, and states.', 'Verify in the relevant renderer.'],
    scopeNotes: ['Publication and deployment are separate workflow steps.'],
    skills: ['frontend-design', 'canvas-design'],
    qualityChecks: ['visual coherence, responsive behavior, accessibility, and rendered evidence'],
  }),
  'release.publish': routeMeta({
    steps: ['Confirm the requested target and release scope.', 'Run relevant preflight checks.', 'Perform the requested mutation once.', 'Independently verify the remote or installed result.', 'Report the exact released state.'],
    scopeNotes: ['A plan or dry run is not a completed release.', 'Do not infer a different repository, package, ref, environment, or install target.'],
    skills: ['conventional-commits', 'finishing-a-development-branch', 'verification-before-completion'],
    qualityChecks: ['target and version correspondence, successful preflight, independent post-mutation verification, and exact final state'],
    riskNotes: ['Use host approval and the user-authorized target for irreversible or externally visible actions.'],
    roles: ['reviewer'],
  }),
};

export function buildWorkflowCatalogPrompt({ availableSkills = [], audience = 'main' } = {}) {
  const inventory = normalizeSkillInventory(availableSkills);
  const lines = [
    `OMP_WORKFLOW_CATALOG_VERSION: ${WORKFLOW_CATALOG_VERSION}`,
    'This catalog is a composable menu, not an exclusive classifier. Select one or more workflows from the observed task; a legacy route hint is diagnostic only.',
    'For writing, select writing.zh or writing.en from the language of the text being changed, then compose writing.latex, writing.markdown, or doc.convert.word for the artifact format. The surrounding instruction language does not decide the writing language.',
    '',
  ];

  for (const name of workflowRouteNames) {
    const meta = workflowRouteCatalog[name];
    const compositions = workflowComposition[name] ?? [];
    lines.push(
      `### ${name}`,
      `Choose when: ${workflowSelectionGuidance[name]}`,
      `Compose with: ${compositions.length ? compositions.join(', ') : 'none normally'}`,
      'Ordered steps:',
      ...meta.steps.map((step, index) => `- ${index + 1}. [step-${index + 1}] ${step}`),
      'Skill candidates:',
      ...(meta.skills.length
        ? meta.skills.map((skill) => `- skill://${skill} — load only when it directly supports a selected step`)
        : ['- none by default; inspect the active inventory for an exact task match']),
      'Delegation:',
      ...delegationLines(meta),
      'Quality checks:',
      ...(meta.qualityChecks.length ? meta.qualityChecks.map((line) => `- ${line}`) : ['- confirm the user-visible result matches the request']),
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

export function workflowRouteForLegacyIntent(intent, { auditMode = null } = {}) {
  if (intent === 'testing') return 'code.test';
  if (intent === 'implementation-with-tests') return 'code.dev';
  if (intent === 'diagnosis') return 'code.debug';
  if (intent === 'bug-audit') return auditMode === 'focused' ? 'code.review' : 'code.review';
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

function delegationLines(meta = {}) {
  const roles = meta.roles ?? [];
  if (roles.length) {
    return roles.map((role, index) => `- step-${Math.min(index + 1, Math.max(meta.steps?.length ?? 1, 1))}: ${role}; parallel when it is independent of the other selected steps`);
  }
  const parallelStep = (meta.steps ?? []).findIndex((step) => /inspect|review|collect|cross-check|audit|test|verify/i.test(step));
  if (parallelStep >= 0) return [`- step-${parallelStep + 1}: delegate an independent evidence lane when useful`];
  return ['- keep with the main agent unless the selected TODO exposes an independent workstream'];
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

function unique(values = []) {
  return [...new Set((values ?? []).filter(Boolean))];
}
