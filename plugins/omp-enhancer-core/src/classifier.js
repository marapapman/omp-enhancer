import { routeByIntent, routedIntents, routeNaturalLanguageTask } from './router.js';

export const classifierDefaults = {
  modelRole: 'tiny',
  model: 'opencode-go/deepseek-v4-flash:medium',
  fallbackModelRole: 'default',
  fallbackModel: 'xiaomi/mimo-v2.5:high',
  retryLimit: 1,
  temperature: 0,
  maxOutputTokens: 500,
  minResolvedConfidence: 0.55,
  minRouteOverrideConfidence: 0.72,
  minUnknownOverrideConfidence: 0.7,
};

export const classifierIntents = [
  'writing.zh',
  'writing.en',
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

export const classifierSchema = {
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
    fallbackModelRole: classifierDefaults.fallbackModelRole,
    fallbackModel: classifierDefaults.fallbackModel,
    retryLimit: classifierDefaults.retryLimit,
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
      `If classifier output is invalid after ${config.retryLimit + 1} attempt(s), fall back to modelRoles.${config.fallbackModelRole} or the deterministic rule route.`,
      '',
      'You classify OMP enhancer user tasks. Return only JSON. Do not solve the task.',
      '',
      'Allowed intents:',
      formatList(classifierIntents),
      '',
      'Allowed riskFlags:',
      formatList(classifierRiskFlags),
      '',
      'Rules:',
      '- Do not invent skill names, agent names, tools, commands, or gates.',
      `- Deterministic rule route is only a fallback baseline: ${ruleRoute.intent}. You may override it when the task intent clearly fits another allowed workflow.`,
      '- Use diagnosis only when the user mainly asks why something failed and does not ask for a code/config change.',
      '- Use release only when the user mainly asks to publish, push, upgrade, or release without asking for implementation.',
      '- Prefer implementation-with-tests for code/plugin changes, even when the task mentions config or marketplace.',
      '- Chinese requests like "写一个登录功能", "写个页面", "写用户模块", or other product/code construction are implementation-with-tests, not prose writing.',
      '- File-path, line-number, function, module, or scoped source edits are still implementation-with-tests even when the user asks for a small precise change.',
      '- Dependency upgrades, code migrations, scaffolding new plugin commands/agents/skills, and deleting legacy code are implementation-with-tests.',
      '- Use bug-audit when the user asks to test, inspect, find, or report bugs without asking to fix or modify code.',
      '- Focused or direct bug investigations are still bug-audit; the deterministic route may attach a focused direct-audit mode.',
      '- Use bug-audit for executable test analysis, coverage review, browser verification, flaky test review, and read-only testing workflows. The legacy testing intent resolves to bug-audit and should not be preferred for new outputs.',
      '- Use fact-check when the user explicitly asks to verify factual claims, data, dates, citations, source authenticity, or whether statements are supported by evidence. Fact-check is a plan + independent evidence + cross-check + review workflow, not a generic search route.',
      '- Prefer writing.zh for Chinese prose editing or drafting; prefer writing.en for English prose editing or drafting.',
      '- Pure bug-report drafting is writing; testing, finding, auditing, or verifying bugs is bug-audit.',
      '- Security announcements, privacy policies, license/compliance memos, and other prose artifacts are writing tasks when the user does not ask to audit or fix code/config/dependencies.',
      '- Research, scientific exploration, literature/PDF download, and daily office organization are unknown unless the user explicitly asks to draft, revise, polish, or write a concrete prose artifact.',
      '- Read-only module explanation, API usage lookup, official-doc lookup, source lists, and implementation-plan research are unknown unless the user asks to edit code, run tests, or draft a prose artifact.',
      '- A request to draft, revise, polish, or write a report/summary/document about tests, coverage, gates, or release status is a writing task, not a testing workflow. Use bug-audit only when the user asks to run, add, repair, or analyze tests as executable verification work.',
      '- Do not classify prose drafting, editing, or polishing as security-review only because the text mentions safety, risk, review, or security. Use security-review only for code, config, auth, secrets, vulnerability, or infrastructure security work.',
      '- Never override a deterministic writing route into security-review for safety, risk, privacy, license, or security wording unless the original task asks to audit or fix code/config/dependencies/secrets/auth/infrastructure.',
      '- Put related concerns such as config-assets or release into secondaryIntents and riskFlags when they are not the main task.',
      `- Use confidence below ${config.minResolvedConfidence} only when uncertain; low-confidence non-unknown classifications may fall back to the deterministic route.`,
      `- To override a non-unknown deterministic route with a different routed workflow, use confidence >= ${config.minRouteOverrideConfidence} and explain the intent mismatch in reason.`,
      `- Use high-confidence unknown only when no OMP plugin workflow should run; confidence >= ${config.minUnknownOverrideConfidence} can suppress an over-eager deterministic fallback.`,
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

export function resolveClassificationRoute({ prompt = '', output = '', classification = null } = {}) {
  const fallbackRoute = routeNaturalLanguageTask({ prompt });
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
  const route = withClassifierDetails(classifiedRoute(routeIntent, fallbackRoute), {
    status: 'resolved',
    modelRole: classifierDefaults.modelRole,
    classification: normalized,
    fallbackIntent: fallbackRoute.intent,
    acceptedIntent: routeIntent,
    authority: routeIntent === normalized.intent || (normalized.intent === 'testing' && routeIntent === 'bug-audit')
      ? 'classifier'
      : 'fallback',
  });

  return {
    ok: true,
    route,
    classification: normalized,
    validation,
    fallbackRoute,
  };
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
  for (const key of Object.keys(value)) {
    if (!classifierSchema.required.includes(key)) errors.push(`Unsupported classifier field: ${key}`);
  }
  if (!classifierIntents.includes(value.intent)) errors.push(`Invalid intent: ${String(value.intent)}`);
  if (!classifierLanguages.includes(value.language)) errors.push(`Invalid language: ${String(value.language)}`);
  const confidence = Number(value.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) errors.push('Invalid confidence.');
  for (const key of ['secondaryIntents', 'riskFlags', 'domainHints']) {
    if (!Array.isArray(value[key])) errors.push(`${key} must be an array.`);
  }
  for (const intent of value.secondaryIntents ?? []) {
    if (!classifierIntents.includes(intent)) errors.push(`Invalid secondaryIntent: ${String(intent)}`);
  }
  for (const flag of value.riskFlags ?? []) {
    if (!classifierRiskFlags.includes(flag)) errors.push(`Invalid riskFlag: ${String(flag)}`);
  }
  if (typeof value.reason !== 'string') errors.push('reason must be a string.');
  return { ok: errors.length === 0, errors };
}

function normalizeClassifierValue(value) {
  return {
    intent: value.intent,
    secondaryIntents: unique((value.secondaryIntents ?? []).filter((intent) => classifierIntents.includes(intent))),
    language: value.language,
    confidence: clamp(Number(value.confidence), 0, 1),
    riskFlags: unique((value.riskFlags ?? []).filter((flag) => classifierRiskFlags.includes(flag))),
    domainHints: unique((value.domainHints ?? []).map((hint) => String(hint).trim()).filter(Boolean)).slice(0, 8),
    reason: value.reason.trim(),
  };
}

function routeIntentForClassification(classification, fallbackRoute) {
  if (classification.intent === 'unknown') {
    if (classification.confidence >= classifierDefaults.minUnknownOverrideConfidence) return 'unknown';
    if (fallbackRoute.intent !== 'unknown') return fallbackRoute.intent;
    return 'unknown';
  }
  if (!routedIntents.includes(classification.intent)) {
    if (fallbackRoute.intent !== 'unknown') return fallbackRoute.intent;
    return 'unknown';
  }
  if (classification.confidence < classifierDefaults.minResolvedConfidence && fallbackRoute.intent !== 'unknown') {
    return fallbackRoute.intent;
  }
  if (classification.intent === fallbackRoute.intent) return classification.intent;
  if (shouldPreserveWritingFallback(classification, fallbackRoute)) {
    return fallbackRoute.intent;
  }
  if (fallbackRoute.intent !== 'unknown' && classification.confidence < classifierDefaults.minRouteOverrideConfidence) return fallbackRoute.intent;
  if (routedIntents.includes(classification.intent)) return classification.intent;
  if (fallbackRoute.intent !== 'unknown') return fallbackRoute.intent;
  return 'unknown';
}

function isWritingIntent(intent) {
  return intent === 'writing.zh' || intent === 'writing.en';
}

function isNonWritingWorkflowIntent(intent) {
  return intent === 'security-review'
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
