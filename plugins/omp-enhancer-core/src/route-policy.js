import { subagentPlans } from './subagent-plans.js';
import { buildWorkflowRouteCard } from './workflow-routes.js';

export const PUBLIC_INTENT_ALIASES = Object.freeze({
  'agentic.simple': 'unknown',
  unknown: 'unknown',
  'writing.pending': 'writing.pending',
  'writing.zh': 'writing.zh',
  'writing.en': 'writing.en',
  'writing.latex': 'writing.latex',
  'writing.markdown': 'writing.markdown',
  'doc.convert.word': 'doc.convert.word',
  'factcheck.document': 'fact-check',
  'fact-check': 'fact-check',
  'code.plan': 'planning',
  planning: 'planning',
  'code.dev': 'implementation-with-tests',
  'implementation-with-tests': 'implementation-with-tests',
  'code.debug': 'diagnosis',
  diagnosis: 'diagnosis',
  'code.test': 'testing',
  testing: 'testing',
  'code.review': 'bug-audit',
  'bug-audit': 'bug-audit',
  'omp.plugin': 'config-assets',
  'config-assets': 'config-assets',
  'security.review': 'security-review',
  'security-review': 'security-review',
  'design.visual': 'design.visual',
  release: 'release',
});

const FACT_SKILLS = ['fact-checking', 'claim-extraction', 'source-evaluation', 'citation-authenticity'];
const FACT_TOOLS = ['fact_check_analyze', 'fact_check_evidence', 'fact_check_report'];
const TESTING_TOOLS = ['omp_test_analyze', 'omp_test_context', 'omp_test_browser_check', 'omp_test_coverage_analyze', 'omp_test_mutation_context', 'omp_test_report'];
const BUG_AUDIT_SKILLS = ['diagnose', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion', 'search-first', 'ai-regression-testing'];
const IMPLEMENTATION_SKILLS = ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'];

export function legacyIntentForPublicIntent(intent = 'unknown') {
  return PUBLIC_INTENT_ALIASES[intent] ?? 'unknown';
}

export function compileTaskRoutePolicy(descriptor, { requestedIntent = '', legacyRoute = null } = {}) {
  const explicitIntent = requestedIntent ? legacyIntentForPublicIntent(requestedIntent) : '';
  const intent = explicitIntent || legacyIntentForDescriptor(descriptor);
  return {
    intent,
    workflowRoute: workflowRouteForIntent(intent, descriptor),
    auditMode: intent === 'bug-audit' && descriptor?.complexity === 'focused' ? 'focused' : null,
    writingComplexity: descriptor?.complexity === 'broad' ? 'complex' : 'simple',
    advisoryOnly: true,
    autoContinue: false,
    shouldOverrideLegacy: Boolean(requestedIntent || descriptor?.provenance?.requiresPolicyRoute),
    legacyIntent: legacyRoute?.intent ?? null,
  };
}

export function buildRoutePlan(descriptor = {}, route = {}) {
  const domains = new Set(descriptor.domains ?? []);
  const constraints = descriptor.constraints ?? {};
  const testsSuggested = constraints.testExecution === 'required';
  const rolesAllowedByRequest = constraints.subagents !== 'forbidden';
  const exactMethodRequest = descriptor.exclusiveToolContract?.mode === 'exclusive';
  const localFactInspection = descriptor.operation === 'inspect'
    && domains.has('facts')
    && constraints.networkAccess === 'forbidden'
    && (descriptor.complexity === 'focused' || domains.has('document'));
  const primaryDirectTestAuthoring = (descriptor.provenance?.reasons ?? [])
    .includes('primary direct test authoring requested');
  const exactTestExecution = descriptor.operation === 'execute'
    && testsSuggested
    && (descriptor.testExecutionTargets ?? []).length > 0
    && (descriptor.phases ?? []).every(({ kind }) => kind === 'verify');
  const broadCodeAudit = descriptor.operation === 'inspect'
    && domains.has('code')
    && descriptor.complexity === 'broad'
    && !domains.has('security')
    && route.intent === 'bug-audit'
    && route.auditMode !== 'focused';

  const steps = uniqueSteps(descriptor.phases ?? []);
  if (route.intent === 'writing.pending' && !steps.some(({ kind }) => kind === 'inspect')) {
    steps.unshift({ kind: 'inspect', domain: domains.has('document') ? 'document' : 'writing' });
  }
  if (broadCodeAudit && testsSuggested
    && !steps.some(({ kind, domain }) => kind === 'verify' && domain === 'tests')) {
    const reviewIndex = steps.findIndex(({ kind }) => kind === 'review');
    const verify = { kind: 'verify', domain: 'tests' };
    if (reviewIndex >= 0) steps.splice(reviewIndex, 0, verify);
    else steps.push(verify);
  }

  const skills = [];
  const tools = [];
  const roles = [];
  const qualityChecks = [];
  const riskNotes = riskNotesFor(descriptor);
  const codeModification = steps.some(({ kind, domain }) => ['modify', 'create'].includes(kind) && domain === 'code');
  const testArtifactModification = primaryDirectTestAuthoring
    && steps.some(({ kind, domain }) => kind === 'modify' && domain === 'tests');

  if (domains.has('facts')) {
    if (localFactInspection) {
      skills.push('fact-checking');
    } else {
      skills.push(...FACT_SKILLS);
      tools.push(...FACT_TOOLS);
      if (rolesAllowedByRequest) roles.push(...subagentPlans.factCheck);
    }
    qualityChecks.push('fact-evidence');
  }

  const writingWorkflow = domains.has('writing') && descriptor.operation !== 'execute';
  if (writingWorkflow && !localFactInspection) {
    const language = descriptor.language;
    const taskKind = descriptor.writingTaskKind ?? 'unknown';
    const complexReview = ['review', 'draft', 'unknown'].includes(taskKind) && descriptor.complexity === 'broad';
    if (language === 'zh') {
      skills.push('plain-chinese-writing');
      if (taskKind === 'review') skills.push('zh-writing-review');
      else skills.push('zh-writing-polish');
      if (complexReview) skills.push('zh-writing-checkers');
      if (complexReview && rolesAllowedByRequest) roles.push(...subagentPlans.writingZh);
    } else if (language === 'en') {
      skills.push(taskKind === 'review' ? 'writing-review' : 'writing-markdown-helper');
      if (complexReview) skills.push('writing-checkers');
      if (complexReview && rolesAllowedByRequest) roles.push(...subagentPlans.writingEn);
    } else {
      qualityChecks.push('detect-source-language');
      riskNotes.push(language === 'mixed'
        ? 'Select Chinese or English writing guidance per target or section; do not force a single language across mixed source text.'
        : 'Read the target text before selecting Chinese or English writing skills.');
    }
    if (complexReview && ['zh', 'en'].includes(language)) {
      tools.push('writing_logic_check', 'writing_quality_check');
      qualityChecks.push('writing-quality');
    }
    if (taskKind === 'review' && descriptor.writingSourceTargets?.some((target) => /\.docx?$/i.test(target))) {
      skills.push('docx');
    }
  }

  if (route.intent === 'planning') {
    skills.push('writing-plans');
    qualityChecks.push('plan-scope-consistency');
  }

  const routeDiagnosticProbe = (descriptor.provenance?.reasons ?? [])
    .includes('route status skill diagnostic probe');
  if (!routeDiagnosticProbe && (route.intent === 'diagnosis'
    || route.intent === 'bug-audit' && descriptor.operation === 'inspect')) {
    skills.push('diagnose');
  }

  if (domains.has('security') && descriptor.operation !== 'answer') {
    skills.unshift('security-review', 'security-scan');
    qualityChecks.push('security-evidence');
    if (descriptor.complexity === 'broad' && !codeModification && rolesAllowedByRequest) {
      roles.push(...subagentPlans.securityReview);
    }
  }

  if (testArtifactModification) {
    skills.push('test-driven-development', 'verification-before-completion');
    if (testsSuggested) tools.push('omp_test_analyze', 'omp_test_report');
  } else if (codeModification) {
    if (descriptor.complexity === 'broad') skills.push(...IMPLEMENTATION_SKILLS);
    else {
      if (testsSuggested) skills.push('test-driven-development');
      skills.push('verification-before-completion');
    }
    if (testsSuggested) tools.push(...(descriptor.complexity === 'broad' ? TESTING_TOOLS : ['omp_test_analyze', 'omp_test_report']));
    if (descriptor.complexity === 'broad' && rolesAllowedByRequest) {
      roles.push(...(domains.has('security') ? subagentPlans.securityRemediation : subagentPlans.implementation));
    }
  }

  if (broadCodeAudit) {
    skills.push(...BUG_AUDIT_SKILLS);
    if (testsSuggested) tools.push(...TESTING_TOOLS);
    if (rolesAllowedByRequest) roles.push(...subagentPlans.bugAudit);
    qualityChecks.push('review-evidence');
  }

  if (domains.has('config') && descriptor.complexity === 'broad' && rolesAllowedByRequest) {
    roles.push(...subagentPlans.configAssets);
  }

  if (route.intent === 'config-assets') {
    skills.push(...routeSkills(route));
    tools.push(...routeTools(route));
  }
  if (descriptor.writingTaskKind === 'convert') {
    const conversionSkill = conversionSkillFor(descriptor.writingConversion);
    if (conversionSkill) skills.push(conversionSkill);
  } else if (route.workflowRoute === 'doc.convert.word'
    && descriptor.writingTaskKind === 'review') {
    skills.push('docx');
  } else if (route.workflowRoute === 'design.visual'
    || descriptor.writingTaskKind === 'unknown'
      && ['writing.latex', 'writing.markdown', 'doc.convert.word'].includes(route.workflowRoute)) {
    skills.push(...routeSkills(route));
  }
  if (descriptor.operation === 'modify' && domains.has('document') && !domains.has('writing')) {
    skills.push('verification-before-completion');
  }
  if (descriptor.operation === 'execute' && domains.has('tests') && !exactTestExecution) {
    skills.push('verification-before-completion');
    tools.push('omp_test_report');
  }
  if (testsSuggested) qualityChecks.push('test-evidence');
  if (steps.some(({ kind }) => kind === 'review')) qualityChecks.push('review-evidence');
  if (steps.some(({ kind }) => kind === 'release')) qualityChecks.push('post-action-verification');

  return {
    version: 2,
    mode: 'advisory',
    autoContinue: false,
    steps,
    skills: exactMethodRequest ? [] : unique(skills).filter((skill) => (
      (rolesAllowedByRequest || skill !== 'subagent-driven-development')
      && (testsSuggested || !['test-driven-development', 'ai-regression-testing'].includes(skill))
    )),
    tools: exactMethodRequest ? [] : unique(tools).filter((tool) => testsSuggested || !TESTING_TOOLS.includes(tool)),
    roles: exactMethodRequest || !rolesAllowedByRequest ? [] : uniqueRoles(roles, { testsSuggested }),
    qualityChecks: unique(qualityChecks),
    riskNotes: unique(riskNotes),
    legacyIntent: route.intent ?? null,
    workflowRoute: route.workflowRoute ?? null,
  };
}

export function attachCompiledTaskRoute(route, descriptor) {
  return projectRouteResourceCeilings({
    ...route,
    taskDescriptor: descriptor,
    routePlan: buildRoutePlan(descriptor, route),
  });
}

// Kept under its historical export name for one compatibility cycle. It now
// projects advisory resources and never acts as an authority ceiling.
export function projectRouteResourceCeilings(route = {}) {
  const plan = route.routePlan ?? buildRoutePlan(route.taskDescriptor, route);
  const legacyRoles = plan.roles.map(({ skills = [], ...role }) => ({
    ...role,
    requiredSkills: [...skills],
  }));
  return {
    ...route,
    advisoryOnly: true,
    autoContinue: false,
    routePlan: plan,
    skills: plan.skills,
    tools: plan.tools,
    roles: plan.roles,
    requiredSkills: plan.skills,
    requiredTools: plan.tools,
    requiredSubagents: legacyRoles,
    deprecatedAliases: unique([
      ...(route.deprecatedAliases ?? []),
      'requiredSkills',
      'requiredTools',
      'requiredSubagents',
    ]),
    ...(route.intent === 'writing.zh' || route.intent === 'writing.en'
      ? { writingComplexity: route.taskDescriptor?.complexity === 'broad' ? 'complex' : 'simple' }
      : {}),
    routeCard: buildWorkflowRouteCard({
      route: route.workflowRoute,
      skills: plan.skills,
      roles: plan.roles,
      includeCatalogSkills: false,
    }),
  };
}

function legacyIntentForDescriptor(descriptor = {}) {
  const domains = new Set(descriptor.domains ?? []);
  const reasons = descriptor.provenance?.reasons ?? [];
  if (descriptor.operation === 'answer') return 'unknown';
  if (descriptor.operation === 'execute' && domains.has('tests')) return 'testing';
  if (descriptor.operation === 'execute') return 'unknown';
  if (descriptor.operation === 'diagnose' && domains.has('config')) return 'config-assets';
  if (descriptor.operation === 'diagnose') return 'diagnosis';
  if (descriptor.operation === 'release') return 'release';
  if (reasons.includes('implementation or test planning requested')) return 'planning';
  if (['create', 'modify'].includes(descriptor.operation) && domains.has('visual')) return 'design.visual';
  if (descriptor.operation === 'create' && domains.has('code')) return 'implementation-with-tests';
  if (reasons.includes('primary direct test authoring requested')
    && descriptor.operation === 'modify' && domains.has('tests')) return 'bug-audit';
  if (domains.has('facts')) return 'fact-check';
  if (domains.has('security') && domains.has('code') && descriptor.operation === 'modify') return 'security-review';
  if (reasons.includes('explicit security audit requested') && domains.has('security') && domains.has('writing')) return 'security-review';
  if (domains.has('security') && descriptor.operation !== 'modify') return 'security-review';
  if (descriptor.operation === 'modify' && (domains.has('code') || domains.has('security')
    || domains.has('document') && domains.has('plugin') && !domains.has('writing'))) return 'implementation-with-tests';
  if (domains.has('writing')) {
    if (descriptor.language === 'zh') return 'writing.zh';
    if (descriptor.language === 'en') return 'writing.en';
    return 'writing.pending';
  }
  if (domains.has('config') || domains.has('plugin') && !domains.has('code')) return 'config-assets';
  if (descriptor.operation === 'inspect' && (domains.has('code') || domains.has('tests'))) return 'bug-audit';
  return 'unknown';
}

function workflowRouteForIntent(intent, descriptor = {}) {
  if (['writing.pending', 'writing.zh', 'writing.en'].includes(intent)) {
    if (descriptor.writingTaskKind === 'convert') {
      if (descriptor.writingConversion === 'latex-to-markdown') return 'writing.markdown';
      if (descriptor.writingConversion === 'word') return 'doc.convert.word';
      if (['markdown-to-latex', 'latex-template'].includes(descriptor.writingConversion)) return 'writing.latex';
    }
    const targets = descriptor.writingSourceTargets?.length
      ? descriptor.writingSourceTargets
      : descriptor.workspaceWriteTargets ?? [];
    if (targets.some((target) => /\.tex$/i.test(target))) return 'writing.latex';
    if (targets.some((target) => /\.(?:md|mdx|rst)$/i.test(target))) return 'writing.markdown';
    if (targets.some((target) => /\.docx?$/i.test(target))) return 'doc.convert.word';
  }
  return ({
    unknown: 'agentic.simple',
    'writing.pending': 'writing.pending',
    'writing.zh': 'writing.zh',
    'writing.en': 'writing.en',
    'writing.latex': 'writing.latex',
    'writing.markdown': 'writing.markdown',
    'doc.convert.word': 'doc.convert.word',
    'fact-check': 'factcheck.document',
    planning: 'code.plan',
    'implementation-with-tests': 'code.dev',
    testing: 'code.test',
    diagnosis: 'code.debug',
    'bug-audit': 'code.review',
    'config-assets': 'omp.plugin',
    'security-review': 'security.review',
    'design.visual': 'design.visual',
    release: 'agentic.simple',
  })[intent] ?? 'agentic.simple';
}

function conversionSkillFor(conversion = 'unknown') {
  return ({
    'markdown-to-latex': 'format-markdown2latex',
    'latex-to-markdown': 'format-latex2markdown',
    'latex-template': 'format-template-latex',
    word: 'docx',
  })[conversion] ?? null;
}

function routeSkills(route = {}) {
  return route.skills ?? route.requiredSkills ?? [];
}

function routeTools(route = {}) {
  return route.tools ?? route.requiredTools ?? [];
}

function riskNotesFor(descriptor = {}) {
  const notes = [];
  const flags = new Set(descriptor.risk?.flags ?? []);
  if (flags.has('external-write')) notes.push('Confirm the external target and verify the observed result after the action.');
  if (flags.has('irreversible-file-operation')) notes.push('An irreversible file operation deserves an explicit target check and recovery plan.');
  if (flags.has('security-sensitive')) notes.push('Security-sensitive changes benefit from independent review of trust boundaries and impact.');
  if (flags.has('credential-dependent')) notes.push('The host may need credentials or an interactive approval for the requested external action.');
  if (flags.has('network-read')) notes.push('Network evidence may be unavailable or stale; report the sources actually observed.');
  return notes;
}

function unique(values = []) {
  return [...new Set((values ?? []).filter(Boolean))];
}

function uniqueSteps(values = []) {
  const seen = new Set();
  return (values ?? []).filter(({ kind, domain } = {}) => {
    const key = `${kind}:${domain}`;
    if (!kind || !domain || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(({ kind, domain }) => ({ kind, domain }));
}

function uniqueRoles(values = [], { testsSuggested = true } = {}) {
  const testOnlyAgents = new Set(['ecc-tdd-guide', 'ecc-pr-test-analyzer']);
  const byAgent = new Map();
  for (const value of values ?? []) {
    const normalized = typeof value === 'string'
      ? { agent: value, duty: '', skills: [] }
      : { ...value, skills: unique(value?.skills ?? value?.requiredSkills ?? []) };
    if (!normalized.agent || !testsSuggested && testOnlyAgents.has(normalized.agent)) continue;
    if (!testsSuggested) {
      normalized.skills = normalized.skills.filter((skill) => !['test-driven-development', 'ai-regression-testing'].includes(skill));
      if (normalized.agent === 'implementation-task') {
        normalized.duty = normalized.duty.replace(/\s+and (?:regression )?tests?(?: changes)?/g, '');
      }
    }
    const current = byAgent.get(normalized.agent);
    byAgent.set(normalized.agent, {
      ...(current ?? {}),
      ...normalized,
      skills: unique([...(current?.skills ?? []), ...normalized.skills]),
    });
  }
  return [...byAgent.values()];
}
