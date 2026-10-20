const JUDGE_THINKING_SUFFIXES = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'auto', 'inherit']);
const TYPESAFE_API = 'typesafe';

function modelRoles(settings) {
  try {
    if (typeof settings?.getModelRoles === 'function') return settings.getModelRoles();
  } catch {
    return undefined;
  }
  return settings?.modelRoles;
}

export function configuredJudgeSelector(settings) {
  const roles = modelRoles(settings);
  const value = roles?.judge;
  if (typeof value !== 'string') return '';
  const selector = value.split(',')[0].trim();
  return selector.startsWith('@') ? '' : selector;
}

export function parseModelSelector(selector) {
  if (typeof selector !== 'string') return null;
  const trimmed = selector.split(',')[0].trim();
  if (trimmed === '' || trimmed.startsWith('@')) return null;
  const segments = trimmed.split(':');
  if (segments.length > 1 && JUDGE_THINKING_SUFFIXES.has(segments[segments.length - 1])) {
    segments.pop();
  }
  const value = segments.join(':');
  const slash = value.indexOf('/');
  if (slash <= 0 || slash === value.length - 1) return null;
  return { provider: value.slice(0, slash), id: value.slice(slash + 1) };
}

function providerModels(modelRegistry, provider) {
  try {
    const models = modelRegistry.getProviderModels(provider);
    return Array.isArray(models) ? models : [];
  } catch {
    return [];
  }
}

function hasAuthorization(headers) {
  return Object.keys(headers).some((name) => {
    const lower = name.toLowerCase();
    return lower === 'authorization' || lower === 'x-api-key' || lower === 'api-key';
  });
}

async function judgeHeaders(modelRegistry, model) {
  try {
    if (typeof modelRegistry?.getApiKeyAndHeaders === 'function') {
      const resolved = await modelRegistry.getApiKeyAndHeaders(model);
      const headers = { ...(resolved?.headers ?? {}) };
      if (resolved?.apiKey && !hasAuthorization(headers)) {
        headers.authorization = `Bearer ${resolved.apiKey}`;
      }
      if (hasAuthorization(headers)) return headers;
    }
  } catch {
    // Fall through to the header resolver.
  }
  try {
    if (typeof modelRegistry?.resolveModelHeaders === 'function') {
      const headers = await modelRegistry.resolveModelHeaders(model);
      if (headers && hasAuthorization(headers)) return { ...headers };
    }
  } catch {
    return null;
  }
  return null;
}

function providerIds(models) {
  const ids = new Set();
  for (const model of models?.list?.() ?? []) {
    if (typeof model?.provider === 'string' && model.provider !== '') ids.add(model.provider);
  }
  return ids;
}

function judgeCandidates({ settings, modelRegistry, models }) {
  const candidates = [];
  const parsed = parseModelSelector(configuredJudgeSelector(settings));
  if (parsed) {
    const selected = providerModels(modelRegistry, parsed.provider)
      .find((model) => model?.id === parsed.id && model?.kind === 'judge');
    if (selected) candidates.push(selected);
  }
  if (candidates.length > 0) return candidates;
  for (const provider of providerIds(models)) {
    if (typeof modelRegistry?.hasConcreteAuth === 'function' && !modelRegistry.hasConcreteAuth(provider)) continue;
    for (const model of providerModels(modelRegistry, provider)) {
      if (model?.kind === 'judge' && model?.api === TYPESAFE_API) candidates.push(model);
    }
  }
  return candidates;
}

export async function resolveOmpJudge({ settings, modelRegistry, models } = {}) {
  if (!modelRegistry || typeof modelRegistry.getProviderModels !== 'function') {
    return { ok: false, reason: 'no_model_registry' };
  }
  for (const model of judgeCandidates({ settings, modelRegistry, models })) {
    if (model.api !== TYPESAFE_API) continue;
    const headers = await judgeHeaders(modelRegistry, model);
    if (!headers) continue;
    return {
      ok: true,
      model: {
        id: model.id,
        provider: model.provider,
        baseUrl: model.baseUrl,
        api: model.api,
        headers,
      },
    };
  }
  return { ok: false, reason: 'no_judge_model' };
}
