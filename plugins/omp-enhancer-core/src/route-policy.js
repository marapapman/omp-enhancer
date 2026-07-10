import { subagentPlans } from './subagent-plans.js';

export const PUBLIC_INTENT_ALIASES = Object.freeze({
  'agentic.simple': 'unknown',
  unknown: 'unknown',
  'writing.zh': 'writing.zh',
  'writing.en': 'writing.en',
  'writing.latex': 'writing.latex',
  'writing.markdown': 'writing.markdown',
  'doc.convert.word': 'doc.convert.word',
  'factcheck.document': 'fact-check',
  'fact-check': 'fact-check',
  'code.dev': 'implementation-with-tests',
  'implementation-with-tests': 'implementation-with-tests',
  'code.debug': 'diagnosis',
  diagnosis: 'diagnosis',
  'code.review': 'bug-audit',
  'bug-audit': 'bug-audit',
  'omp.plugin': 'config-assets',
  'config-assets': 'config-assets',
  'security.review': 'security-review',
  'security-review': 'security-review',
  'design.visual': 'design.visual',
  release: 'release',
  testing: 'bug-audit',
});

const FACT_SKILLS = ['fact-checking', 'claim-extraction', 'source-evaluation', 'citation-authenticity'];
const FACT_TOOLS = ['fact_check_analyze', 'fact_check_evidence', 'fact_check_report', 'fact_check_gate'];
const TESTING_TOOLS = ['omp_test_analyze', 'omp_test_context', 'omp_test_browser_check', 'omp_test_coverage_analyze', 'omp_test_mutation_context', 'omp_test_gate', 'omp_test_report'];
const BUG_AUDIT_SKILLS = ['diagnose', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion', 'search-first', 'ai-regression-testing'];
const IMPLEMENTATION_SKILLS = ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'];

export function legacyIntentForPublicIntent(intent = 'unknown') {
  return PUBLIC_INTENT_ALIASES[intent] ?? 'unknown';
}

export function compileTaskRoutePolicy(descriptor, { requestedIntent = '', legacyRoute = null } = {}) {
  const explicitIntent = requestedIntent ? legacyIntentForPublicIntent(requestedIntent) : '';
  const intent = explicitIntent || legacyIntentForDescriptor(descriptor);
  const workflowRoute = workflowRouteForIntent(intent);
  const auditMode = intent === 'bug-audit' && descriptor?.complexity === 'focused' ? 'focused' : null;
  return {
    intent,
    workflowRoute,
    auditMode,
    writingComplexity: descriptor?.complexity === 'simple' ? 'simple' : 'complex',
    hardBlock: intent === 'release',
    shouldOverrideLegacy: Boolean(requestedIntent || descriptor?.provenance?.requiresPolicyRoute),
    legacyIntent: legacyRoute?.intent ?? null,
  };
}

export function buildRoutePlan(descriptor, route = {}) {
  let phases = (descriptor?.phases ?? []).map(({ kind, domain }) => ({ kind, domain }));
  const domains = new Set(descriptor?.domains ?? []);
  const capabilities = new Set(descriptor?.capabilities ?? []);
  const testsAuthorized = descriptor?.constraints?.testExecution === 'required'
    && capabilities.has('tests.execute');
  const subagentsAuthorized = descriptor?.constraints?.subagents !== 'forbidden'
    && capabilities.has('subagents');
  const externalWriteAuthorized = descriptor?.constraints?.externalWrite === 'required'
    && capabilities.has('external.write');
  phases = phases.filter((phase) => phaseAllowedByDescriptor(
    phase,
    descriptor,
    { testsAuthorized, externalWriteAuthorized },
  ));
  const broadCodeAudit = descriptor?.operation === 'inspect'
    && domains.has('code')
    && descriptor?.complexity === 'broad'
    && !domains.has('security');
  if (broadCodeAudit && testsAuthorized
    && !phases.some(({ kind, domain }) => kind === 'verify' && domain === 'tests')) {
    const reviewIndex = phases.findIndex(({ kind }) => kind === 'review');
    const verify = { kind: 'verify', domain: 'tests' };
    phases = reviewIndex >= 0
      ? [...phases.slice(0, reviewIndex), verify, ...phases.slice(reviewIndex)]
      : [...phases, verify];
  }
  const phaseKinds = new Set(phases.map(({ kind }) => kind));
  const requiredSkills = [];
  const requiredTools = [];
  const requiredSubagents = [];
  const gateRequirements = [];

  if (domains.has('facts')) {
    requiredSkills.push(...FACT_SKILLS);
    requiredTools.push(...FACT_TOOLS);
    requiredSubagents.push(...subagentPlans.factCheck);
    gateRequirements.push(gateRequirement('fact-evidence', 'required'));
  }

  if (domains.has('writing')) {
    if (domains.has('document')) {
      requiredSkills.push('writing-markdown-helper');
    } else if (descriptor?.language === 'zh') {
      requiredSkills.push('plain-chinese-writing', 'zh-writing-polish');
      if (domains.has('facts') || descriptor?.complexity === 'broad') requiredSkills.push('zh-writing-checkers');
      if (domains.has('facts') || descriptor?.complexity === 'broad') requiredSubagents.push(...subagentPlans.writingZh);
    } else {
      requiredSkills.push('writing-markdown-helper');
      if (domains.has('facts') || descriptor?.complexity === 'broad') requiredSkills.push('writing-checkers');
      if (domains.has('facts') || descriptor?.complexity === 'broad') requiredSubagents.push(...subagentPlans.writingEn);
    }
    if (phaseKinds.has('review') && (domains.has('facts') || descriptor?.complexity === 'broad')) {
      requiredTools.push('writing_logic_check', 'writing_quality_check');
      gateRequirements.push(gateRequirement('writing-quality', 'required'));
    }
  }

  if (domains.has('security') && descriptor?.operation !== 'answer') {
    requiredSkills.unshift('security-review', 'security-scan');
    gateRequirements.push(gateRequirement('security-evidence', 'required'));
    if (descriptor?.operation === 'inspect' && descriptor?.complexity === 'broad') {
      requiredSubagents.push(...subagentPlans.securityReview);
    }
  }

  const codeModification = ['modify', 'create'].includes(descriptor?.operation) && domains.has('code');
  if (codeModification) {
    if (descriptor?.complexity === 'broad') requiredSkills.push(...IMPLEMENTATION_SKILLS);
    else {
      if (descriptor?.constraints?.testExecution === 'required') requiredSkills.push('test-driven-development');
      requiredSkills.push('verification-before-completion');
    }
    if (testsAuthorized) {
      requiredTools.push(...(descriptor?.complexity === 'broad' ? TESTING_TOOLS : ['omp_test_gate']));
    }
    if (descriptor?.complexity === 'broad') {
      requiredSubagents.push(...(domains.has('security')
        ? subagentPlans.securityRemediation
        : subagentPlans.implementation));
    }
  }

  if (broadCodeAudit) {
    requiredSkills.push(...BUG_AUDIT_SKILLS);
    if (testsAuthorized) {
      requiredTools.push(...TESTING_TOOLS);
      gateRequirements.push(gateRequirement('test-evidence', 'required'));
    }
    requiredSubagents.push(...subagentPlans.bugAudit);
  }

  if (domains.has('config') && descriptor?.complexity === 'broad') {
    requiredSubagents.push(...subagentPlans.configAssets);
  }

  if (descriptor?.operation === 'modify' && domains.has('document')) {
    requiredSkills.push('verification-before-completion');
  }

  if (descriptor?.operation === 'execute' && domains.has('tests')) {
    requiredSkills.push('verification-before-completion');
    requiredTools.push('omp_test_gate', 'omp_test_report');
  }

  if (testsAuthorized) {
    gateRequirements.push(gateRequirement('test-evidence', 'required'));
  }

  if (phaseKinds.has('review') && (codeModification || domains.has('document'))) {
    gateRequirements.push(gateRequirement('review-evidence', 'required'));
  } else if (descriptor?.operation === 'inspect' && domains.has('code')) {
    gateRequirements.push(gateRequirement('review-evidence', 'advisory'));
  }

  if (phaseKinds.has('release')) {
    gateRequirements.push(gateRequirement('release-approval', 'required'));
  }

  if ((descriptor?.risk?.flags ?? []).includes('irreversible-file-operation')) {
    gateRequirements.push(gateRequirement('irreversible-approval', 'required'));
  }

  return {
    version: 1,
    phases,
    requiredSkills: unique(requiredSkills).filter((skill) => (
      (subagentsAuthorized || skill !== 'subagent-driven-development')
      && (testsAuthorized || !['test-driven-development', 'ai-regression-testing'].includes(skill))
    )),
    requiredTools: unique(requiredTools).filter((tool) => testsAuthorized || !TESTING_TOOLS.includes(tool)),
    requiredSubagents: subagentsAuthorized
      ? sanitizeSubagents(uniqueSubagents(requiredSubagents), { testsAuthorized })
      : [],
    gateRequirements: uniqueGateRequirements(gateRequirements),
    legacyIntent: route.intent ?? null,
    workflowRoute: route.workflowRoute ?? null,
  };
}

function phaseAllowedByDescriptor(phase, descriptor, { testsAuthorized, externalWriteAuthorized }) {
  if (phase.kind === 'verify' && phase.domain === 'tests') return testsAuthorized;
  if (phase.kind === 'release') return externalWriteAuthorized;
  if ((phase.kind === 'modify' || phase.kind === 'create')
    && ['code', 'document', 'plugin', 'config', 'visual'].includes(phase.domain)) {
    return descriptor?.constraints?.workspaceWrite === 'required'
      && (descriptor?.capabilities ?? []).includes('fs.write');
  }
  return true;
}

function sanitizeSubagents(values, { testsAuthorized }) {
  if (testsAuthorized) return values;
  const testOnlyAgents = new Set(['ecc-tdd-guide', 'ecc-pr-test-analyzer']);
  return values
    .filter(({ agent }) => !testOnlyAgents.has(agent))
    .map((value) => ({
      ...value,
      duty: value.agent === 'implementation-task'
        ? value.duty.replace(/\s+and (?:regression )?tests?(?: changes)?/g, '')
        : value.duty,
      requiredSkills: (value.requiredSkills ?? []).filter((skill) => (
        !['test-driven-development', 'ai-regression-testing'].includes(skill)
      )),
    }));
}

export function attachCompiledTaskRoute(route, descriptor) {
  return {
    ...route,
    taskDescriptor: descriptor,
    routePlan: buildRoutePlan(descriptor, route),
  };
}

function legacyIntentForDescriptor(descriptor = {}) {
  const domains = new Set(descriptor.domains ?? []);
  if (descriptor.operation === 'answer') return 'unknown';
  if (descriptor.operation === 'execute' && domains.has('tests')) return 'bug-audit';
  if (descriptor.operation === 'execute') return 'unknown';
  if (descriptor.operation === 'diagnose') return 'diagnosis';
  if (descriptor.operation === 'release') return 'release';
  if (descriptor.operation === 'create' && domains.has('visual')) return 'design.visual';
  if (domains.has('facts')) return 'fact-check';
  if (domains.has('security') && descriptor.operation !== 'modify') return 'security-review';
  if (descriptor.operation === 'modify' && (domains.has('code') || domains.has('document') && domains.has('plugin') || domains.has('security'))) {
    return 'implementation-with-tests';
  }
  if (domains.has('writing')) return descriptor.language === 'zh' ? 'writing.zh' : 'writing.en';
  if (domains.has('config') || domains.has('plugin') && !domains.has('code')) return 'config-assets';
  if (descriptor.operation === 'inspect' && domains.has('code')) return 'bug-audit';
  return 'unknown';
}

function workflowRouteForIntent(intent) {
  const routes = {
    unknown: 'agentic.simple',
    'writing.zh': 'writing.zh',
    'writing.en': 'writing.en',
    'writing.latex': 'writing.latex',
    'writing.markdown': 'writing.markdown',
    'doc.convert.word': 'doc.convert.word',
    'fact-check': 'factcheck.document',
    'implementation-with-tests': 'code.dev',
    diagnosis: 'code.debug',
    'bug-audit': 'code.review',
    'config-assets': 'omp.plugin',
    'security-review': 'security.review',
    'design.visual': 'design.visual',
    release: 'agentic.simple',
  };
  return routes[intent] ?? 'agentic.simple';
}

function gateRequirement(key, mode) {
  return { key, mode };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueSubagents(values) {
  const byAgent = new Map();
  for (const value of values) {
    const normalized = typeof value === 'string'
      ? { agent: value, requiredSkills: [] }
      : value;
    if (!normalized?.agent) continue;
    const current = byAgent.get(normalized.agent);
    byAgent.set(normalized.agent, {
      ...(current ?? {}),
      ...normalized,
      requiredSkills: unique([
        ...(current?.requiredSkills ?? []),
        ...(normalized.requiredSkills ?? []),
      ]),
    });
  }
  return [...byAgent.values()];
}

function uniqueGateRequirements(values) {
  const byKey = new Map();
  for (const value of values) {
    if (!value?.key) continue;
    const current = byKey.get(value.key);
    if (!current || current.mode === 'advisory' && value.mode === 'required') byKey.set(value.key, value);
  }
  const order = ['security-evidence', 'test-evidence', 'review-evidence', 'fact-evidence', 'writing-quality', 'release-approval', 'irreversible-approval'];
  return [...byKey.values()].sort((left, right) => order.indexOf(left.key) - order.indexOf(right.key));
}
