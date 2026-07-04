import { routeByIntent, routedIntents, routeNaturalLanguageTask } from './router.js';

export const classifierDefaults = {
  modelRole: 'classifier',
  model: 'opencode-go/deepseek-v4-flash:medium',
  fallbackModelRole: 'default',
  fallbackModel: 'xiaomi/mimo-v2.5:high',
  retryLimit: 1,
  temperature: 0,
  maxOutputTokens: 500,
  minResolvedConfidence: 0.55,
  minUnknownOverrideConfidence: 0.7,
};

export const classifierIntents = [
  'writing.zh',
  'writing.en',
  'implementation-with-tests',
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

export function buildClassifierPrompt({
  prompt = '',
  modelRole = classifierDefaults.modelRole,
  model = classifierDefaults.model,
  fallbackModelRole = classifierDefaults.fallbackModelRole,
  fallbackModel = classifierDefaults.fallbackModel,
} = {}) {
  const ruleRoute = routeNaturalLanguageTask({ prompt });
  const config = {
    modelRole: cleanConfigValue(modelRole, classifierDefaults.modelRole),
    model: cleanConfigValue(model, classifierDefaults.model),
    fallbackModelRole: cleanConfigValue(fallbackModelRole, classifierDefaults.fallbackModelRole),
    fallbackModel: cleanConfigValue(fallbackModel, classifierDefaults.fallbackModel),
    retryLimit: classifierDefaults.retryLimit,
    temperature: classifierDefaults.temperature,
    maxOutputTokens: classifierDefaults.maxOutputTokens,
    minResolvedConfidence: classifierDefaults.minResolvedConfidence,
    minUnknownOverrideConfidence: classifierDefaults.minUnknownOverrideConfidence,
  };

  return {
    ...config,
    schema: classifierSchema,
    fallbackRoute: ruleRoute,
    prompt: [
      '## OMP Enhancer Core Classifier',
      '',
      `Use the model configured as modelRoles.${config.modelRole}. Default model: ${config.model}.`,
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
      '- Use diagnosis only when the user mainly asks why something failed and does not ask for a code/config change.',
      '- Use release only when the user mainly asks to publish, push, upgrade, or release without asking for implementation.',
      '- Prefer implementation-with-tests for code/plugin changes, even when the task mentions config or marketplace.',
      '- Prefer writing.zh for Chinese prose editing or drafting; prefer writing.en for English prose editing or drafting.',
      '- Do not classify prose drafting, editing, or polishing as security-review only because the text mentions safety, risk, review, or security. Use security-review only for code, config, auth, secrets, vulnerability, or infrastructure security work.',
      '- Put related concerns such as config-assets or release into secondaryIntents and riskFlags when they are not the main task.',
      `- Use confidence below ${config.minResolvedConfidence} only when uncertain; low-confidence non-unknown classifications may fall back to the deterministic route.`,
      `- Use high-confidence unknown only when no OMP plugin workflow should run; confidence >= ${config.minUnknownOverrideConfidence} can suppress an over-eager deterministic fallback.`,
      '',
      'JSON Schema:',
      JSON.stringify(classifierSchema, null, 2),
      '',
      'User task:',
      String(prompt),
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
  const route = withClassifierDetails(routeByIntent(routeIntent, { source: 'llm-classifier' }), {
    status: 'resolved',
    modelRole: classifierDefaults.modelRole,
    classification: normalized,
    fallbackIntent: fallbackRoute.intent,
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
  if (isWritingIntent(fallbackRoute.intent) && classification.intent === 'security-review') {
    return fallbackRoute.intent;
  }
  if (routedIntents.includes(classification.intent)) return classification.intent;
  if (fallbackRoute.intent !== 'unknown') return fallbackRoute.intent;
  return 'unknown';
}

function isWritingIntent(intent) {
  return intent === 'writing.zh' || intent === 'writing.en';
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

function cleanConfigValue(value, fallback) {
  const text = String(value ?? '').trim();
  return text || fallback;
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
