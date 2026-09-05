export const PROVIDER_ID = 'volcengine-coding-plan';
export const PROVIDER_NAME = 'Volcengine Ark Coding Plan';
export const CODING_PLAN_BASE_URL = 'https://ark.cn-beijing.volces.com/api/coding/v3';
export const CODING_PLAN_API_KEY_URL = 'https://console.volcengine.com/ark/region:ark+cn-beijing/apikey';
export const CODING_PLAN_API_KEY_INSTRUCTIONS =
  'Copy an API key from the Volcengine Ark Coding Plan API-key page.';
export const CODING_PLAN_API_KEY_ENV_VARS = Object.freeze([
  'ARK_API_KEY',
  'VOLCENGINE_CODING_PLAN_API_KEY',
]);

const ZERO_COST = Object.freeze({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
});

function defineModel(id, contextWindow, maxTokens, input) {
  return Object.freeze({
    id,
    name: id,
    reasoning: false,
    input: Object.freeze([...input]),
    supportsTools: true,
    cost: ZERO_COST,
    contextWindow,
    maxTokens,
  });
}

export const CODING_PLAN_MODELS = Object.freeze([
  // ark-code-latest is console-managed; use the largest documented envelope.
  defineModel('ark-code-latest', 1048576, 384000, ['text']),
  defineModel('doubao-seed-evolving', 1048576, 262144, ['text']),
  defineModel('doubao-seed-2.1-turbo', 262144, 65536, ['text', 'image']),
  defineModel('doubao-seed-2.0-lite', 262144, 131072, ['text', 'image']),
  defineModel('minimax-m3', 1048576, 131072, ['text', 'image']),
  defineModel('glm-5.3', 1048576, 131072, ['text']),
  defineModel('glm-5.3-flash', 1048576, 131072, ['text', 'image']),
  defineModel('deepseek-v4-flash', 1048576, 384000, ['text']),
  defineModel('deepseek-v4-pro', 1048576, 384000, ['text']),
  defineModel('kimi-k2.7-code', 262144, 32000, ['text', 'image']),
]);

export function resolveApiKey(env = process.env) {
  if (!env || typeof env !== 'object') return undefined;

  for (const name of CODING_PLAN_API_KEY_ENV_VARS) {
    const value = env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

export function buildProviderConfig(env = process.env) {
  const apiKey = resolveApiKey(env);
  return {
    baseUrl: CODING_PLAN_BASE_URL,
    api: 'openai-completions',
    authHeader: true,
    models: CODING_PLAN_MODELS,
    oauth: {
      name: PROVIDER_NAME,
      login: loginCodingPlan,
    },
    ...(apiKey ? { apiKey } : {}),
  };
}

function loginError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

export async function loginCodingPlan(callbacks) {
  const signal = callbacks?.signal;
  if (signal?.aborted) {
    throw loginError('LoginCancelledError', 'Volcengine Coding Plan login cancelled');
  }
  if (typeof callbacks?.onAuth !== 'function' || typeof callbacks?.onPrompt !== 'function') {
    throw new TypeError('Volcengine Coding Plan login requires onAuth and onPrompt callbacks');
  }

  callbacks.onAuth({
    url: CODING_PLAN_API_KEY_URL,
    instructions: CODING_PLAN_API_KEY_INSTRUCTIONS,
  });

  const rawKey = await callbacks.onPrompt({
    message: 'Paste your Volcengine Ark Coding Plan API key',
    placeholder: 'ARK-...',
  });

  if (signal?.aborted) {
    throw loginError('LoginCancelledError', 'Volcengine Coding Plan login cancelled');
  }

  const key = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!key) {
    throw loginError('ApiKeyRequiredError', 'A non-empty Volcengine Coding Plan API key is required');
  }
  return key;
}

export default function volcengineCodingPlanExtension(pi) {
  pi.registerProvider(PROVIDER_ID, buildProviderConfig());
}
