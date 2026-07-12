import { routeByIntent, routedIntents, routeNaturalLanguageTask } from './router.js';
import { buildRoutePlan, projectRouteResourceCeilings } from './route-policy.js';
import { normalizeTaskDescriptor } from './task-descriptor.js';

export const classifierDefaults = {
  modelRole: 'tiny',
  model: 'opencode-go/deepseek-v4-flash:medium',
  temperature: 0,
  maxOutputTokens: 500,
  minResolvedConfidence: 0.55,
  minRouteOverrideConfidence: 0.72,
  minUnknownOverrideConfidence: 0.7,
};

export const classifierIntents = [
  'writing.zh',
  'writing.en',
  'planning',
  'bug-audit',
  'fact-check',
  'implementation-with-tests',
  // Legacy classifier value. The router resolves it through the bug-audit workflow.
  'testing',
  'security-review',
  'config-assets',
  'diagnosis',
  'release',
  'unknown',
];

export const classifierRiskFlags = [
  'needs-tests',
  'needs-review',
  'needs-subagents',
  'needs-writing-qa',
  'needs-fact-check',
  'needs-security-review',
  'needs-marketplace-check',
  'release-or-push',
  'ambiguous',
  'user-asks-diagnosis-only',
];

export const classifierLanguages = ['zh', 'en', 'mixed', 'unknown'];

export const classifierOperationHints = [
  'answer',
  'inspect',
  'diagnose',
  'plan',
  'create',
  'modify',
  'execute',
  'release',
];

export const classifierDomains = [
  'general',
  'code',
  'tests',
  'writing',
  'facts',
  'security',
  'config',
  'visual',
  'document',
  'plugin',
];

export const classifierPhaseKinds = [
  'answer',
  'inspect',
  'diagnose',
  'plan',
  'create',
  'modify',
  'execute',
  'verify',
  'review',
  'release',
];

export const classifierSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['operationHint', 'domains', 'phaseHints', 'riskFlags', 'language', 'confidence', 'reason'],
  properties: {
    operationHint: { type: 'string', enum: classifierOperationHints },
    domains: {
      type: 'array',
      items: { type: 'string', enum: classifierDomains },
    },
    phaseHints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'domain'],
        properties: {
          kind: { type: 'string', enum: classifierPhaseKinds },
          domain: { type: 'string', enum: classifierDomains },
        },
      },
    },
    language: { type: 'string', enum: classifierLanguages },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    riskFlags: {
      type: 'array',
      items: { type: 'string', enum: classifierRiskFlags },
    },
    reason: { type: 'string' },
  },
};

const legacyClassifierSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'secondaryIntents', 'language', 'confidence', 'riskFlags', 'domainHints', 'reason'],
  properties: {
    intent: { type: 'string', enum: classifierIntents },
    secondaryIntents: {
      type: 'array',
      items: { type: 'string', enum: classifierIntents },
    },
    language: { type: 'string', enum: classifierLanguages },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    riskFlags: {
      type: 'array',
      items: { type: 'string', enum: classifierRiskFlags },
    },
    domainHints: {
      type: 'array',
      items: { type: 'string' },
    },
    reason: { type: 'string' },
  },
};

export function buildClassifierPrompt({ prompt = '', context = [] } = {}) {
  const ruleRoute = routeNaturalLanguageTask({ prompt });
  const observedContext = Array.isArray(context)
    ? context.map((item) => String(item).trim()).filter(Boolean).slice(-4)
    : [];
  const config = {
    modelRole: classifierDefaults.modelRole,
    model: classifierDefaults.model,
    temperature: classifierDefaults.temperature,
    maxOutputTokens: classifierDefaults.maxOutputTokens,
    minResolvedConfidence: classifierDefaults.minResolvedConfidence,
    minRouteOverrideConfidence: classifierDefaults.minRouteOverrideConfidence,
    minUnknownOverrideConfidence: classifierDefaults.minUnknownOverrideConfidence,
  };

  return {
    ...config,
    schema: classifierSchema,
    fallbackRoute: ruleRoute,
    prompt: [
      '## OMP Enhancer Core Classifier',
      '',
      `Use OMP's Tiny model role, modelRoles.${config.modelRole}. Packaged Tiny default: ${config.model}.`,
      'If classifier output is invalid, keep the deterministic rule route. Do not retry or schedule another model turn.',
      '',
      'You classify OMP enhancer user tasks. Return only JSON. Do not solve the task.',
      '',
      'Allowed operation hints:',
      formatList(classifierOperationHints),
      '',
      'Allowed domains:',
      formatList(classifierDomains),
      '',
      'Allowed phase kinds:',
      formatList(classifierPhaseKinds),
      '',
      'Allowed riskFlags:',
      formatList(classifierRiskFlags),
      '',
      'Rules:',
      '- Return descriptor hints only. Do not output or invent constraints, capabilities, skills, tools, agents, commands, or gates.',
      `- The deterministic rule route is the scope-preserving baseline for classifier hints: ${ruleRoute.intent}. Hints may enrich advisory workflow suggestions but never create permissions or completion conditions.`,
      '- Use operationHint diagnose only when the user mainly asks why something failed and does not ask for a code/config change.',
      '- Use operationHint plan when the user asks only for an implementation plan, repair plan, or test strategy. Represent it as inspect/answer guidance; it never grants edits or test execution.',
      '- Use operationHint release only when the user mainly asks to publish, push, or deploy without asking for implementation.',
      '- Use operationHint modify with code/tests/plugin domains for implementation work, even when config or marketplace is mentioned.',
      '- Chinese requests like "写一个登录功能", "写个页面", "写用户模块", or other product/code construction use modify/create with code or visual domains, not writing.',
      '- File-path, line-number, function, module, dependency upgrade, migration, scaffolding, and legacy-code deletion tasks are still code modification.',
      '- Use inspect with code/tests domains when the user asks to test, inspect, find, or report bugs without asking to fix code.',
      '- Focused or direct bug investigations are still inspect/diagnose; the deterministic route may retain a focused direct-audit mode.',
      '- Executable test analysis, coverage review, browser verification, and flaky-test review use tests domain and verify/review phase hints.',
      '- Explicit factual verification uses facts domain and inspect/review phase hints.',
      '- Requests to find code defects and provide evidence for code defects use code/tests, not facts. Generic "evidence" or "证据" means support for a defect finding and is not factual verification unless the task explicitly checks claims, citations, sources, data, dates, or authenticity.',
      '- Prose editing or drafting uses writing domain. For edits, language comes from the body text or explicit translation destination, never from the surrounding instruction language. Keep language unknown while a document body is still unread.',
      '- Pure bug-report drafting is writing; executable testing, finding, auditing, or verifying bugs uses code/tests.',
      '- Security announcements, privacy policies, license/compliance memos, and other prose artifacts are writing tasks when the user does not ask to audit or fix code/config/dependencies.',
      '- Research, scientific exploration, literature/PDF download, and daily office organization are unknown unless the user explicitly asks to draft, revise, polish, or write a concrete prose artifact.',
      '- Read-only module explanation, API usage lookup, official-doc lookup, and source lists are unknown unless the user asks to edit code, run tests, or draft a prose artifact. Explicit implementation plans and test strategies use plan.',
      '- A request to draft, revise, polish, or write a report/summary/document about tests, coverage, gates, or release status uses writing, not executable tests.',
      '- Do not add security domain merely because prose mentions safety, risk, review, or security. Security applies to code, config, auth, secrets, vulnerabilities, or infrastructure.',
      '- Never turn deterministic writing into security work for safety, risk, privacy, license, or security wording unless the task audits or fixes code/config/dependencies/secrets/auth/infrastructure.',
      '- Put every related concern into domains, phaseHints, and riskFlags so compound work is not lost.',
      '- An implementation repair plan without edits uses plan with code/tests/plugin. A request to perform the repair uses modify with code/tests/plugin.',
      '- Workflow validation: running MiMo, advisor, E2E, smoke, workflow, gate, skill, subagent, or background-task validation without code changes uses inspect/execute with tests.',
      '- Test-observation summary: summarizing already observed test, E2E, gate, or workflow results uses writing and must not add executable verification.',
      '- Real config-assets inventory: add config/plugin only for explicit omp-config assets, templates, hooks, packaged inventory, doctor, or marketplace catalog checks.',
      '- Do not expose classifier prompts, JSON schemas, or Tiny model policy in user-facing output. Summarize the route decision and useful workflow guidance instead.',
      `- Use confidence below ${config.minResolvedConfidence} only when uncertain; all low-confidence hints fall back to the deterministic route, including an unknown fallback.`,
      `- A different operation hint needs confidence >= ${config.minRouteOverrideConfidence}, but it cannot erase deterministic user-scope preferences.`,
      '- Use answer/general for concept-only or unrelated requests. It cannot remove deterministic release, security, or irreversible-operation risk notes.',
      '',
      'JSON Schema:',
      JSON.stringify(classifierSchema, null, 2),
      '',
      'User task:',
      String(prompt),
      observedContext.length ? [
        '',
        'Observed uncertain context:',
        ...observedContext.map((item, index) => `${index + 1}. ${item}`),
      ].join('\n') : null,
    ].join('\n'),
  };
}

export function resolveClassificationRoute({
  prompt = '',
  output = '',
  classification = null,
  baseRoute = null,
} = {}) {
  // The active runtime may already have refined a path-only writing request
  // from the observed target body. Reuse that deterministic route so a later
  // classifier hint cannot fall back to the language of the instruction.
  const fallbackRoute = baseRoute ?? routeNaturalLanguageTask({ prompt });
  const parsed = classification ?? parseClassifierOutput(output);
  const validation = validateClassifierValue(parsed);

  if (!validation.ok) {
    return {
      ok: false,
      route: withClassifierDetails(fallbackRoute, {
        status: 'fallback',
        reason: validation.errors.join('; '),
        classification: null,
      }),
      classification: null,
      validation,
      fallbackRoute,
    };
  }

  const normalized = normalizeClassifierValue(parsed);
  const routeIntent = routeIntentForClassification(normalized, fallbackRoute);
  const classified = classifiedRoute(routeIntent, fallbackRoute);
  const monotonic = applyMonotonicClassifierHints(classified, fallbackRoute, normalized);
  const route = withClassifierDetails(monotonic, {
    status: 'resolved',
    modelRole: classifierDefaults.modelRole,
    classification: normalized,
    fallbackIntent: fallbackRoute.intent,
    acceptedIntent: monotonic.intent,
    authority: classifierAuthority(normalized, routeIntent, monotonic.intent),
  });

  return {
    ok: true,
    route,
    classification: normalized,
    validation,
    fallbackRoute,
  };
}

function classifierAuthority(classification, routeIntent, acceptedIntent) {
  if (classification.confidence < classifierDefaults.minResolvedConfidence) return 'fallback';
  if (classification.intent == null) return 'advisory';
  if (routeIntent === classification.intent) return 'advisory';
  if (classification.intent === 'testing' && acceptedIntent === 'bug-audit') return 'advisory';
  return 'fallback';
}

export function parseClassifierOutput(output = '') {
  const text = String(output).trim();
  if (!text) return null;
  const jsonText = stripJsonFence(text);
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function validateClassifierValue(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['Classifier output is not a JSON object.'] };
  }
  const legacy = isLegacyClassifierValue(value);
  const schema = legacy ? legacyClassifierSchema : classifierSchema;
  for (const key of Object.keys(value)) {
    if (!schema.required.includes(key)) errors.push(`Unsupported classifier field: ${key}`);
  }
  for (const key of schema.required) {
    if (!(key in value)) errors.push(`Missing classifier field: ${key}`);
  }
  if (!classifierLanguages.includes(value.language)) errors.push(`Invalid language: ${String(value.language)}`);
  const confidence = Number(value.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) errors.push('Invalid confidence.');
  if (legacy) validateLegacyClassifierFields(value, errors);
  else validateDescriptorHintFields(value, errors);
  for (const flag of Array.isArray(value.riskFlags) ? value.riskFlags : []) {
    if (!classifierRiskFlags.includes(flag)) errors.push(`Invalid riskFlag: ${String(flag)}`);
  }
  if (typeof value.reason !== 'string') errors.push('reason must be a string.');
  return { ok: errors.length === 0, errors };
}

function isLegacyClassifierValue(value) {
  return 'intent' in value || 'secondaryIntents' in value || 'domainHints' in value;
}

function validateLegacyClassifierFields(value, errors) {
  if (!classifierIntents.includes(value.intent)) errors.push(`Invalid intent: ${String(value.intent)}`);
  for (const key of ['secondaryIntents', 'riskFlags', 'domainHints']) {
    if (!Array.isArray(value[key])) errors.push(`${key} must be an array.`);
  }
  for (const intent of Array.isArray(value.secondaryIntents) ? value.secondaryIntents : []) {
    if (!classifierIntents.includes(intent)) errors.push(`Invalid secondaryIntent: ${String(intent)}`);
  }
}

function validateDescriptorHintFields(value, errors) {
  if (!classifierOperationHints.includes(value.operationHint)) {
    errors.push(`Invalid operationHint: ${String(value.operationHint)}`);
  }
  for (const key of ['domains', 'phaseHints', 'riskFlags']) {
    if (!Array.isArray(value[key])) errors.push(`${key} must be an array.`);
  }
  for (const domain of Array.isArray(value.domains) ? value.domains : []) {
    if (!classifierDomains.includes(domain)) errors.push(`Invalid domain: ${String(domain)}`);
  }
  for (const phase of Array.isArray(value.phaseHints) ? value.phaseHints : []) {
    if (!phase || typeof phase !== 'object' || Array.isArray(phase)) {
      errors.push('phaseHint must be an object.');
      continue;
    }
    for (const key of Object.keys(phase)) {
      if (key !== 'kind' && key !== 'domain') errors.push(`Unsupported phaseHint field: ${key}`);
    }
    if (!classifierPhaseKinds.includes(phase.kind)) errors.push(`Invalid phaseHint kind: ${String(phase.kind)}`);
    if (!classifierDomains.includes(phase.domain)) errors.push(`Invalid phaseHint domain: ${String(phase.domain)}`);
  }
}

function normalizeClassifierValue(value) {
  if (!isLegacyClassifierValue(value)) {
    return {
      intent: null,
      secondaryIntents: [],
      operationHint: value.operationHint,
      domains: unique((value.domains ?? []).filter((domain) => classifierDomains.includes(domain))),
      phaseHints: uniquePhases((value.phaseHints ?? []).filter(({ kind, domain } = {}) => (
        classifierPhaseKinds.includes(kind) && classifierDomains.includes(domain)
      ))),
      language: value.language,
      confidence: clamp(Number(value.confidence), 0, 1),
      riskFlags: unique((value.riskFlags ?? []).filter((flag) => classifierRiskFlags.includes(flag))),
      domainHints: [],
      reason: value.reason.trim(),
      format: 'descriptor-hints-v1',
    };
  }
  return {
    intent: value.intent,
    secondaryIntents: unique((value.secondaryIntents ?? []).filter((intent) => classifierIntents.includes(intent))),
    language: value.language,
    confidence: clamp(Number(value.confidence), 0, 1),
    riskFlags: unique((value.riskFlags ?? []).filter((flag) => classifierRiskFlags.includes(flag))),
    domainHints: unique((value.domainHints ?? []).map((hint) => String(hint).trim()).filter(Boolean)).slice(0, 8),
    reason: value.reason.trim(),
    format: 'legacy-intent-v1',
  };
}

function routeIntentForClassification(classification, fallbackRoute) {
  if (classification.confidence < classifierDefaults.minResolvedConfidence) {
    return fallbackRoute.intent;
  }
  if (classification.intent == null) return fallbackRoute.intent;
  if (classification.intent === 'unknown') {
    if (fallbackRoute.intent !== 'unknown') return fallbackRoute.intent;
    return 'unknown';
  }
  if (!routedIntents.includes(classification.intent)) {
    if (fallbackRoute.intent !== 'unknown') return fallbackRoute.intent;
    return 'unknown';
  }
  if (classification.intent === 'testing' && !isCanonicalTestingRoute(fallbackRoute)) {
    return fallbackRoute.intent;
  }
  if (classification.intent === fallbackRoute.intent) return classification.intent;
  if (isWritingIntent(fallbackRoute.intent) && isWritingIntent(classification.intent)) {
    return fallbackRoute.intent;
  }
  if (isNonWritingWorkflowIntent(fallbackRoute.intent) && isWritingIntent(classification.intent)) {
    return fallbackRoute.intent;
  }
  if (shouldPreserveWritingFallback(classification, fallbackRoute)) {
    return fallbackRoute.intent;
  }
  if (fallbackRoute.intent !== 'unknown' && classification.confidence < classifierDefaults.minRouteOverrideConfidence) return fallbackRoute.intent;
  if (routedIntents.includes(classification.intent)) {
    const candidateRoute = routeByIntent(classification.intent, { source: 'llm-classifier' });
    if (!routeFitsDeterministicCeiling(candidateRoute, fallbackRoute)) return fallbackRoute.intent;
    return classification.intent;
  }
  if (fallbackRoute.intent !== 'unknown') return fallbackRoute.intent;
  return 'unknown';
}

function isCanonicalTestingRoute(route = {}) {
  const descriptor = route.taskDescriptor ?? {};
  return route.intent === 'testing'
    && route.workflowRoute === 'code.test'
    && descriptor.operation === 'execute'
    && descriptor.constraints?.testExecution === 'required';
}

function applyMonotonicClassifierHints(route, fallbackRoute, classification) {
  const fallbackDescriptor = fallbackRoute.taskDescriptor;
  if (!fallbackDescriptor) return projectAdvisoryResources(route, fallbackRoute);
  if (isFocusedLocalFactRoute(fallbackRoute)) return fallbackRoute;

  const useHints = classification.confidence >= classifierDefaults.minResolvedConfidence;
  const additions = useHints
    ? classifierDescriptorAdditions(classification, fallbackRoute)
    : [];
  const descriptor = mergeTaskDescriptors(fallbackDescriptor, additions, classification, useHints);
  const compiledPlan = buildRoutePlan(descriptor, route);
  const routePlan = mergeRoutePlans(fallbackRoute.routePlan, route.routePlan, compiledPlan);

  return projectAdvisoryResources({
    ...route,
    taskDescriptor: descriptor,
    routePlan,
  }, fallbackRoute);
}

function isFocusedLocalFactRoute(route = {}) {
  const descriptor = route.taskDescriptor;
  return route.intent === 'fact-check'
    && descriptor?.operation === 'inspect'
    && descriptor.domains?.includes('facts')
    && descriptor.complexity === 'focused'
    && descriptor.constraints?.workspaceWrite === 'forbidden'
    && descriptor.constraints?.networkAccess === 'forbidden'
    && descriptor.constraints?.externalWrite === 'forbidden'
    && descriptor.constraints?.subagents === 'forbidden';
}

function classifierDescriptorAdditions(classification, fallbackRoute) {
  if (classification.format === 'descriptor-hints-v1') {
    const addition = safeHintDescriptorAddition(classification, fallbackRoute);
    return addition ? [addition] : [];
  }
  const intents = unique([
    classification.intent,
    ...classification.secondaryIntents,
    ...intentsForRiskFlags(classification.riskFlags),
  ]).filter((intent) => intent !== 'unknown');

  if (shouldPreserveWritingFallback(classification, fallbackRoute)) {
    return intents
      .filter((intent) => intent !== 'security-review')
      .map((intent) => safeDescriptorAddition(intent, fallbackRoute))
      .filter(Boolean);
  }

  return intents
    .map((intent) => safeDescriptorAddition(intent, fallbackRoute))
    .filter(Boolean);
}

function safeHintDescriptorAddition(classification, fallbackRoute) {
  const ceiling = fallbackRoute.taskDescriptor;
  if (!ceiling) return null;
  if (classification.operationHint === 'release' && ceiling.constraints.externalWrite !== 'required') return null;
  if (classification.operationHint === 'execute' && ceiling.constraints.testExecution !== 'required') return null;
  if ((classification.operationHint === 'modify' || classification.operationHint === 'create')
    && classification.domains.some((domain) => domain !== 'writing' && domain !== 'general')
    && ceiling.constraints.workspaceWrite !== 'required') return null;

  const planningHint = classification.operationHint === 'plan';
  const phases = classification.phaseHints
    .map((phase) => planningHint && phase.kind === 'plan'
      ? { kind: 'answer', domain: phase.domain }
      : phase)
    .filter((phase) => phaseFitsDeterministicCeiling(phase, ceiling));
  if (!phases.length) return null;
  const phaseDomains = new Set(phases.map(({ domain }) => domain));
  const domains = classification.domains.filter((domain) => (
    ceiling.domains.includes(domain) || phaseDomains.has(domain)
  ));
  if (!domains.length) return null;

  const riskFlags = [];
  let riskLevel = 'low';
  for (const flag of classification.riskFlags) {
    const mapped = descriptorRiskFlag(flag, ceiling);
    if (!mapped) continue;
    riskFlags.push(mapped.flag);
    riskLevel = maxRiskLevel(riskLevel, mapped.level);
  }
  if (domains.includes('security')) {
    riskFlags.push('security-sensitive');
    riskLevel = maxRiskLevel(riskLevel, 'high');
  }
  if (domains.includes('facts')) {
    riskFlags.push('factual-claims');
    riskLevel = maxRiskLevel(riskLevel, 'medium');
  }

  return normalizeTaskDescriptor({
    operation: planningHint ? 'inspect' : classification.operationHint,
    domains,
    constraints: ceiling.constraints,
    capabilities: ceiling.capabilities,
    phases,
    risk: { level: riskLevel, flags: riskFlags },
    complexity: domains.length > 2 ? 'broad' : 'focused',
    language: classification.language,
    provenance: planningHint ? {
      ruleConfidence: classification.confidence,
      reasons: ['classifier planning hint'],
      requiresPolicyRoute: true,
    } : undefined,
  });
}

function safeDescriptorAddition(intent, fallbackRoute) {
  const candidate = routeByIntent(intent, { source: 'llm-classifier' });
  const descriptor = candidate.taskDescriptor;
  const ceiling = fallbackRoute.taskDescriptor;
  if (!descriptor || !ceiling) return null;

  if (intent === 'release' && ceiling.constraints.externalWrite !== 'required') return null;
  if ((intent === 'testing' || intent === 'implementation-with-tests')
    && descriptor.constraints.testExecution === 'required'
    && ceiling.constraints.testExecution !== 'required') return null;
  if (descriptor.constraints.workspaceWrite === 'required'
    && ceiling.constraints.workspaceWrite !== 'required') return null;
  if (descriptor.constraints.networkAccess === 'required'
    && ceiling.constraints.networkAccess !== 'required') return null;

  const phases = descriptor.phases.filter((phase) => phaseFitsDeterministicCeiling(phase, ceiling));
  if (!phases.length) return null;
  return {
    ...descriptor,
    constraints: ceiling.constraints,
    capabilities: ceiling.capabilities,
    phases,
  };
}

function mergeTaskDescriptors(fallbackDescriptor, additions, classification, useHints) {
  const domains = [...fallbackDescriptor.domains];
  const phases = [...fallbackDescriptor.phases];
  const riskFlags = [...fallbackDescriptor.risk.flags];
  let riskLevel = fallbackDescriptor.risk.level;
  let complexity = fallbackDescriptor.complexity;

  for (const addition of additions) {
    domains.push(...addition.domains);
    phases.push(...addition.phases);
    riskFlags.push(...addition.risk.flags);
    riskLevel = maxRiskLevel(riskLevel, addition.risk.level);
    complexity = maxComplexity(complexity, addition.complexity);
  }

  if (useHints) {
    for (const flag of classification.riskFlags) {
      const mapped = descriptorRiskFlag(flag, fallbackDescriptor);
      if (!mapped) continue;
      riskFlags.push(mapped.flag);
      riskLevel = maxRiskLevel(riskLevel, mapped.level);
    }
  }

  return normalizeTaskDescriptor({
    ...fallbackDescriptor,
    domains,
    constraints: fallbackDescriptor.constraints,
    capabilities: fallbackDescriptor.capabilities,
    phases,
    risk: { level: riskLevel, flags: riskFlags },
    complexity,
    language: useHints
      && fallbackDescriptor.writingSourcePending !== true
      && fallbackDescriptor.language === 'unknown'
      && classification.language !== 'unknown'
      ? classification.language
      : fallbackDescriptor.language,
    provenance: {
      ...fallbackDescriptor.provenance,
      reasons: unique([
        ...fallbackDescriptor.provenance.reasons,
        ...(additions.length ? ['classifier advisory suggestions merged'] : []),
      ]),
    },
  });
}

function routeFitsDeterministicCeiling(candidateRoute, fallbackRoute) {
  const candidate = candidateRoute.taskDescriptor;
  const ceiling = fallbackRoute.taskDescriptor;
  if (!candidate || !ceiling) return candidateRoute.intent === fallbackRoute.intent;

  for (const key of ['workspaceWrite', 'testExecution', 'networkAccess', 'externalWrite', 'subagents']) {
    if (candidate.constraints[key] === 'required' && ceiling.constraints[key] !== 'required') return false;
  }
  const allowedCapabilities = new Set(ceiling.capabilities);
  if (candidate.capabilities.some((capability) => !allowedCapabilities.has(capability))) return false;
  return candidate.phases.every((phase) => phaseFitsDeterministicCeiling(phase, ceiling));
}

function phaseFitsDeterministicCeiling(phase, ceiling) {
  if (!phase?.kind) return false;
  if (phase.kind === 'release') {
    return ceiling.constraints.externalWrite === 'required' && ceiling.capabilities.includes('external.write');
  }
  if (phase.kind === 'verify' || phase.kind === 'execute' && phase.domain === 'tests') {
    return ceiling.constraints.testExecution === 'required' && ceiling.capabilities.includes('tests.execute');
  }
  if ((phase.kind === 'modify' || phase.kind === 'create') && phase.domain !== 'writing' && phase.domain !== 'general') {
    return ceiling.constraints.workspaceWrite === 'required' && ceiling.capabilities.includes('fs.write');
  }
  if (phase.domain === 'facts') {
    return ceiling.constraints.networkAccess === 'required' && ceiling.capabilities.includes('network.read');
  }
  if (phase.domain === 'general' || phase.domain === 'writing') return true;
  return ceiling.capabilities.includes('fs.read');
}

function projectAdvisoryResources(route, fallbackRoute) {
  return projectRouteResourceCeilings({
    ...route,
    routePlan: mergeRoutePlans(fallbackRoute.routePlan, route.routePlan),
  });
}

function mergeRoutePlans(...values) {
  const plans = values.filter(Boolean);
  const fallback = plans[0] ?? {};
  const latest = plans.at(-1) ?? fallback;
  return {
    version: 2,
    mode: 'advisory',
    autoContinue: false,
    steps: uniquePhases(plans.flatMap((plan) => plan.steps ?? plan.phases ?? [])),
    skills: unique(plans.flatMap((plan) => plan.skills ?? plan.requiredSkills ?? [])),
    tools: unique(plans.flatMap((plan) => plan.tools ?? plan.requiredTools ?? [])),
    roles: uniqueRoles(plans.flatMap((plan) => plan.roles ?? plan.requiredSubagents ?? [])),
    qualityChecks: unique(plans.flatMap(({ qualityChecks = [] }) => qualityChecks)),
    riskNotes: unique(plans.flatMap(({ riskNotes = [] }) => riskNotes)),
    legacyIntent: latest.legacyIntent ?? fallback.legacyIntent ?? null,
    workflowRoute: latest.workflowRoute ?? fallback.workflowRoute ?? null,
  };
}

function uniquePhases(phases) {
  const seen = new Set();
  return phases.filter((phase) => {
    const key = `${phase?.kind ?? ''}:${phase?.domain ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(phase?.kind && phase?.domain);
  });
}

function uniqueRoles(subagents) {
  const byAgent = new Map();
  for (const subagent of subagents) {
    const agent = typeof subagent === 'string' ? subagent : subagent?.agent;
    if (!agent) continue;
    const current = byAgent.get(agent);
    if (typeof subagent === 'string' && current) continue;
    const incoming = typeof subagent === 'string' ? { agent, skills: [] } : subagent;
    byAgent.set(agent, {
      ...(typeof current === 'object' ? current : {}),
      ...incoming,
      agent,
      skills: unique([
        ...(current?.skills ?? current?.requiredSkills ?? []),
        ...(incoming?.skills ?? incoming?.requiredSkills ?? []),
      ]),
      ...(current?.modelRoles || incoming?.modelRoles ? {
        modelRoles: unique([...(current?.modelRoles ?? []), ...(incoming?.modelRoles ?? [])]),
      } : {}),
    });
  }
  return [...byAgent.values()];
}

function intentsForRiskFlags(flags) {
  const intents = [];
  if (flags.includes('needs-security-review')) intents.push('security-review');
  if (flags.includes('needs-tests')) intents.push('testing');
  if (flags.includes('needs-writing-qa')) intents.push('writing.en');
  if (flags.includes('needs-fact-check')) intents.push('fact-check');
  if (flags.includes('release-or-push')) intents.push('release');
  return intents;
}

function descriptorRiskFlag(flag, ceiling) {
  if (flag === 'needs-security-review' && ceiling.capabilities.includes('fs.read')) {
    return { flag: 'security-sensitive', level: 'high' };
  }
  if (flag === 'needs-tests' && ceiling.constraints.testExecution === 'required') {
    return { flag: 'test-execution', level: 'medium' };
  }
  if (flag === 'needs-fact-check' && ceiling.constraints.networkAccess === 'required') {
    return { flag: 'factual-claims', level: 'medium' };
  }
  if ((flag === 'release-or-push' || flag === 'needs-marketplace-check')
    && ceiling.constraints.externalWrite === 'required') {
    return { flag: 'external-write', level: 'high' };
  }
  if (flag === 'ambiguous') return { flag: 'ambiguous', level: 'low' };
  return null;
}

function maxRiskLevel(left, right) {
  const order = ['low', 'medium', 'high', 'critical'];
  return order[Math.max(order.indexOf(left), order.indexOf(right), 0)];
}

function maxComplexity(left, right) {
  const order = ['simple', 'focused', 'broad'];
  return order[Math.max(order.indexOf(left), order.indexOf(right), 0)];
}

function isWritingIntent(intent) {
  return intent === 'writing.pending' || intent === 'writing.zh' || intent === 'writing.en';
}

function isNonWritingWorkflowIntent(intent) {
  return intent === 'security-review'
    || intent === 'planning'
    || intent === 'bug-audit'
    || intent === 'fact-check'
    || intent === 'testing'
    || intent === 'implementation-with-tests'
    || intent === 'config-assets'
    || intent === 'release';
}

function shouldPreserveWritingFallback(classification, fallbackRoute) {
  if (!isWritingIntent(fallbackRoute.intent) || !isNonWritingWorkflowIntent(classification.intent)) return false;
  if (classification.intent === 'security-review') return true;
  return classification.secondaryIntents.includes(fallbackRoute.intent) && classifierMentionsWritingArtifact(classification);
}

function classifierMentionsWritingArtifact(classification) {
  const text = [
    classification.reason,
    ...classification.domainHints,
  ].join(' ').toLowerCase();
  return /(?:prose|writing|wording|draft|report|policy|memo|announcement|document|docs?|summary|release notes|changelog|文案|文字|文本|表述|措辞|润色|改写|草稿|报告|文档|公告|政策|总结)/.test(text);
}

function classifiedRoute(routeIntent, fallbackRoute) {
  if (fallbackRoute.intent === routeIntent) {
    return {
      ...fallbackRoute,
      source: 'llm-classifier',
    };
  }
  return routeByIntent(routeIntent, { source: 'llm-classifier' });
}

function withClassifierDetails(route, classifier) {
  return {
    ...route,
    classifier,
  };
}

function stripJsonFence(text) {
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) return fenceMatch[1].trim();
  const objectMatch = text.match(/\{[\s\S]*\}/);
  return objectMatch ? objectMatch[0] : text;
}

function formatList(values) {
  return values.map((value) => `- ${value}`).join('\n');
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function unique(values) {
  return [...new Set(values)];
}
