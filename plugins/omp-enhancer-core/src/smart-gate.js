export const smartGateDefaults = {
  modelRole: 'tiny',
  model: 'opencode-go/deepseek-v4-flash:medium',
  fallbackModelRole: 'default',
  fallbackModel: 'xiaomi/mimo-v2.5:high',
  retryLimit: 1,
  temperature: 0,
  maxOutputTokens: 700,
  minPassConfidence: 0.72,
};

export const smartGateVerdicts = ['pass', 'needs-work', 'blocked'];

export const smartGateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['gate', 'verdict', 'confidence', 'satisfied', 'missing', 'actions', 'reason'],
  properties: {
    gate: { type: 'string' },
    verdict: { type: 'string', enum: smartGateVerdicts },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    satisfied: { type: 'boolean' },
    missing: {
      type: 'array',
      items: { type: 'string' },
    },
    actions: {
      type: 'array',
      items: { type: 'string' },
    },
    reason: { type: 'string' },
  },
};

export function buildSmartGatePrompt({
  prompt = '',
  route = null,
  ruleGate = null,
  evidence = '',
  finalOutput = '',
} = {}) {
  const config = {
    modelRole: smartGateDefaults.modelRole,
    model: smartGateDefaults.model,
    fallbackModelRole: smartGateDefaults.fallbackModelRole,
    fallbackModel: smartGateDefaults.fallbackModel,
    retryLimit: smartGateDefaults.retryLimit,
    temperature: smartGateDefaults.temperature,
    maxOutputTokens: smartGateDefaults.maxOutputTokens,
    minPassConfidence: smartGateDefaults.minPassConfidence,
  };
  const gateKey = ruleGate?.gateKey ?? 'unknown';

  return {
    ...config,
    gateKey,
    schema: smartGateSchema,
    prompt: [
      '## OMP Enhancer Core Smart Gate',
      '',
      `Use OMP's Tiny model role, modelRoles.${config.modelRole}. Packaged Tiny default: ${config.model}.`,
      `If smart-gate output is invalid after ${config.retryLimit + 1} attempt(s), fall back to the deterministic rule gate.`,
      '',
      'You are reviewing whether an OMP workflow rule gate should stay blocked or be released.',
      'Return only JSON. Do not solve the task, do not invent tools, and do not ask for more broad work than the gate requires.',
      '',
      'Allowed verdicts:',
      formatList(smartGateVerdicts),
      '',
      'Decision rules:',
      `- Set gate exactly to: ${gateKey}.`,
      `- Use verdict "pass" only when the evidence clearly satisfies the routed workflow and confidence is >= ${config.minPassConfidence}.`,
      '- A pass also requires satisfied=true and missing=[].',
      '- Keep blocking when final output only says the validator is wrong, the gate is buggy, or the report was delivered, without concrete matching evidence.',
      '- Missing SKILL_USAGE or SUBAGENT_USAGE can pass only if equivalent loaded/forked evidence is present in the final output or captured tool evidence.',
      '- Failed QA/test tools can pass only if independent equivalent evidence proves the same checkpoint; otherwise use needs-work.',
      '- For pre-work tool gates, pass only when the block is a clear false positive or equivalent prerequisite evidence is already present.',
      '- For implementation or bug-audit testing gates, require relevant local test/build/lint evidence or a clear blocker. Reviewer approval alone is not enough.',
      '- For writing gates, accept checker/writer evidence only when it clearly reviews logic or quality for the requested writing task.',
      '- For security and release gates, do not pass unless the exact high-risk claim has concrete verification evidence.',
      '- Use verdict "blocked" when external state or missing user input prevents completion.',
      '',
      'JSON Schema:',
      JSON.stringify(smartGateSchema, null, 2),
      '',
      'Original user task:',
      String(prompt),
      '',
      'Routed workflow:',
      JSON.stringify(route ?? {}, null, 2),
      '',
      'Deterministic rule gate that is currently blocking:',
      JSON.stringify(ruleGate ?? {}, null, 2),
      '',
      'Captured evidence summary:',
      String(evidence || 'none'),
      '',
      'Final assistant output to judge:',
      String(finalOutput || 'none'),
    ].join('\n'),
  };
}

export function resolveSmartGateDecision({ gateKey = '', output = '', decision = null } = {}) {
  const parsed = decision ?? parseSmartGateOutput(output);
  const validation = validateSmartGateValue(parsed, gateKey);

  if (!validation.ok) {
    return {
      ok: false,
      accepted: false,
      decision: null,
      validation,
    };
  }

  const normalized = normalizeSmartGateValue(parsed);
  const accepted = normalized.verdict === 'pass'
    && normalized.satisfied === true
    && normalized.missing.length === 0
    && normalized.confidence >= smartGateDefaults.minPassConfidence;

  return {
    ok: true,
    accepted,
    decision: normalized,
    validation,
  };
}

export function parseSmartGateOutput(output = '') {
  const text = String(output).trim();
  if (!text) return null;
  const jsonText = stripJsonFence(text);
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function validateSmartGateValue(value, gateKey = '') {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['Smart gate output is not a JSON object.'] };
  }
  for (const key of Object.keys(value)) {
    if (!smartGateSchema.required.includes(key)) errors.push(`Unsupported smart gate field: ${key}`);
  }
  if (gateKey && value.gate !== gateKey) errors.push(`Invalid gate: ${String(value.gate)}`);
  if (typeof value.gate !== 'string' || !value.gate.trim()) errors.push('gate must be a non-empty string.');
  if (!smartGateVerdicts.includes(value.verdict)) errors.push(`Invalid verdict: ${String(value.verdict)}`);
  const confidence = Number(value.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) errors.push('Invalid confidence.');
  if (typeof value.satisfied !== 'boolean') errors.push('satisfied must be a boolean.');
  for (const key of ['missing', 'actions']) {
    if (!Array.isArray(value[key])) errors.push(`${key} must be an array.`);
    else if (value[key].some((item) => typeof item !== 'string')) errors.push(`${key} must contain only strings.`);
  }
  if (typeof value.reason !== 'string') errors.push('reason must be a string.');
  return { ok: errors.length === 0, errors };
}

function normalizeSmartGateValue(value) {
  return {
    gate: value.gate.trim(),
    verdict: value.verdict,
    confidence: clamp(Number(value.confidence), 0, 1),
    satisfied: value.satisfied === true,
    missing: unique((value.missing ?? []).map((item) => String(item).trim()).filter(Boolean)).slice(0, 12),
    actions: unique((value.actions ?? []).map((item) => String(item).trim()).filter(Boolean)).slice(0, 12),
    reason: value.reason.trim(),
  };
}

function stripJsonFence(text) {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) return fenced[1].trim();
  const objectMatch = text.match(/\{[\s\S]*\}/);
  return objectMatch ? objectMatch[0] : text;
}

function formatList(values) {
  return values.map((value) => `- ${value}`).join('\n');
}

function unique(values) {
  return [...new Set(values)];
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
