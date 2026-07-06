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

const deliveryControlBlockerPattern = new RegExp([
  String.raw`should\s+i\b`,
  String.raw`shall\s+i\b`,
  String.raw`whether\s+to\s+(?:proceed|continue|fix|change)`,
  String.raw`confirm(?:ation)?\s+(?:to\s+)?(?:proceed|continue|fix|change)`,
  String.raw`waiting\s+for\s+(?:the\s+)?user(?:'s)?\s+(?:reply|confirmation|approval)`,
  String.raw`awaiting\s+(?:the\s+)?user(?:'s)?\s+(?:reply|confirmation|approval)`,
  String.raw`ask(?:ing)?\s+(?:the\s+)?user\s+(?:whether|if)`,
  String.raw`\u8981\u6211.*(?:\u6539|\u505a|\u4fee)`,
  String.raw`\u76f4\u63a5\u6539\u5417`,
  String.raw`\u662f\u5426.*(?:\u7ee7\u7eed|\u76f4\u63a5|\u4fee\u6539|\u4fee\u590d)`,
  String.raw`\u7b49\u5f85.*\u7528\u6237.*(?:\u786e\u8ba4|\u56de\u590d|\u7b54\u590d)`,
  String.raw`\u9700\u8981.*\u7528\u6237.*\u786e\u8ba4`,
].join('|'), 'i');

const realExternalBlockerPattern = new RegExp([
  String.raw`credential`,
  String.raw`api[-\s]?key`,
  String.raw`token`,
  String.raw`secret`,
  String.raw`password`,
  String.raw`permission\s+denied`,
  String.raw`access\s+denied`,
  String.raw`sandbox\s+approval`,
  String.raw`approval\s+(?:to\s+)?(?:access|run|write|use)`,
  String.raw`outside\s+sandbox`,
  String.raw`network`,
  String.raw`dns`,
  String.raw`host\s+resolution`,
  String.raw`offline`,
  String.raw`service\s+unavailable`,
  String.raw`rate\s+limit`,
  String.raw`quota`,
  String.raw`missing\s+file`,
  String.raw`file\s+not\s+found`,
  String.raw`no\s+such\s+file`,
  String.raw`cannot\s+access`,
  String.raw`read\s+access`,
  String.raw`write\s+access`,
  String.raw`external\s+state`,
  String.raw`user-provided`,
  String.raw`must\s+provide`,
  String.raw`requires?\s+user\s+input\s+that\s+cannot\s+be\s+inferred`,
  String.raw`need(?:s)?\s+a\s+specific\s+user-provided`,
  String.raw`\u51ed\u8bc1`,
  String.raw`\u5bc6\u94a5`,
  String.raw`\u6743\u9650`,
  String.raw`\u65e0\u6cd5\u8bbf\u95ee`,
  String.raw`\u7f51\u7edc`,
  String.raw`\u670d\u52a1\u4e0d\u53ef\u7528`,
  String.raw`\u9700\u8981\u7528\u6237\u63d0\u4f9b`,
  String.raw`\u7528\u6237\u5fc5\u987b\u63d0\u4f9b`,
  String.raw`\u6c99\u7bb1`,
  String.raw`\u5ba1\u6279`,
  String.raw`\u6388\u6743`,
].join('|'), 'i');

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
      '- Use verdict "blocked" only for real external blockers: missing credentials, unavailable files/services, permission/access limits, network failures, or user-provided input that is necessary and cannot be inferred.',
      '- Do not use verdict "blocked" merely because the assistant asked whether to proceed, waited for confirmation, or deferred with "should I continue" / "要我直接改吗". For focused factual questions or proposed-fix requests, use needs-work with an action to deliver the concise answer unless the final output already does so.',
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
  const normalized = {
    gate: value.gate.trim(),
    verdict: value.verdict,
    confidence: clamp(Number(value.confidence), 0, 1),
    satisfied: value.satisfied === true,
    missing: unique((value.missing ?? []).map((item) => String(item).trim()).filter(Boolean)).slice(0, 12),
    actions: unique((value.actions ?? []).map((item) => String(item).trim()).filter(Boolean)).slice(0, 12),
    reason: value.reason.trim(),
  };
  return normalizeBlockedSmartGateDecision(normalized);
}

function normalizeBlockedSmartGateDecision(decision) {
  if (decision.verdict !== 'blocked') return decision;

  const text = smartGateDecisionText(decision);
  if (isDeliveryControlBlocker(text) || !hasRealExternalBlocker(text)) {
    const action = isDeliveryControlBlocker(text)
      ? 'deliver the focused answer directly instead of asking whether to proceed'
      : 'perform the listed workflow actions; report BLOCKERS only for a real external blocker';
    return {
      ...decision,
      verdict: 'needs-work',
      satisfied: false,
      missing: unique([...decision.missing, 'focused answer or concrete workflow evidence']).slice(0, 12),
      actions: unique([...decision.actions, action]).slice(0, 12),
      reason: decision.reason
        ? `${decision.reason} This is local follow-up work, not a real external blocker.`
        : 'The blocked verdict describes local follow-up work, not a real external blocker.',
    };
  }

  return decision;
}

function smartGateDecisionText(decision) {
  return [
    decision.reason,
    ...(decision.missing ?? []),
    ...(decision.actions ?? []),
  ].join('\n').toLowerCase();
}

function isDeliveryControlBlocker(text) {
  return deliveryControlBlockerPattern.test(text);
}

function hasRealExternalBlocker(text) {
  return realExternalBlockerPattern.test(text);
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
