export const PROVIDER_ID = 'aliyun-bailian-token-plan';
export const PROVIDER_NAME = 'Alibaba Cloud Bailian Token Plan';
export const TOKEN_PLAN_BASE_URL = 'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
export const TOKEN_PLAN_API_KEY_URL =
  'https://bailian.console.aliyun.com/cn-beijing?tab=plan#/efm/subscription/token-plan';
export const TOKEN_PLAN_API_KEY_INSTRUCTIONS =
  'Copy an API key from the Alibaba Cloud Bailian Token Plan API-key page.';
export const TOKEN_PLAN_API_KEY_ENV_VARS = Object.freeze([
  'DASHSCOPE_API_KEY',
  'ALIYUN_BAILIAN_TOKEN_PLAN_API_KEY',
  'BAILIAN_TOKEN_PLAN_API_KEY',
]);

const ZERO_COST = Object.freeze({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
});

const TOKEN_PLAN_COMPAT = Object.freeze({
  supportsDeveloperRole: false,
});
const QWEN38_MAX_COMPAT = Object.freeze({
  ...TOKEN_PLAN_COMPAT,
  supportsReasoningEffort: true,
  whenThinking: Object.freeze({
    thinkingFormat: 'openai',
    extraBody: Object.freeze({ enable_thinking: true }),
  }),
});
const QWEN_EFFORTS = Object.freeze(['minimal', 'low', 'medium', 'high']);
const QWEN38_MAX_EFFORTS = Object.freeze(['low', 'medium', 'xhigh']);
const DEEPSEEK_EFFORTS = Object.freeze(['low', 'high', 'max']);
const DEEPSEEK_V3_EFFORTS = Object.freeze(['high', 'max']);
const GLM_EFFORTS = Object.freeze(['minimal', 'low', 'medium', 'high', 'max']);
const IMAGE_INPUT_MODELS = new Set([
  'qwen3.8-max',
  'qwen3.8-flash',
  'qwen3.7-plus',
  'qwen3.6-plus',
  'qwen3.6-flash',
  'kimi-k2.7-code',
  'kimi-k2.6',
  'kimi-k2.5',
]);

function defineModel(
  id,
  contextWindow,
  maxTokens,
  efforts,
  compat = TOKEN_PLAN_COMPAT,
  reasoning = true,
  defaultLevel,
) {
  return Object.freeze({
    id,
    name: id,
    reasoning,
    ...(efforts
      ? {
          thinking: Object.freeze({
            mode: 'effort',
            efforts: Object.freeze([...efforts]),
            ...(defaultLevel ? { defaultLevel } : {}),
          }),
        }
      : {}),
    input: Object.freeze(IMAGE_INPUT_MODELS.has(id) ? ['text', 'image'] : ['text']),
    supportsTools: true,
    cost: ZERO_COST,
    contextWindow,
    maxTokens,
    compat,
  });
}

export const TOKEN_PLAN_MODELS = Object.freeze([
  defineModel('qwen3.8-max', 1000000, 131072, QWEN38_MAX_EFFORTS, QWEN38_MAX_COMPAT, true, 'xhigh'),
  defineModel('qwen3.8-flash', 1000000, 131072, QWEN_EFFORTS),
  defineModel('qwen3.7-max', 1000000, 65536, QWEN_EFFORTS),
  defineModel('qwen3.7-plus', 1000000, 64000, QWEN_EFFORTS),
  defineModel('qwen3.6-plus', 1000000, 65536, QWEN_EFFORTS),
  defineModel('qwen3.6-flash', 1000000, 65536, QWEN_EFFORTS),
  defineModel('deepseek-v4-pro', 1000000, 384000, DEEPSEEK_EFFORTS),
  defineModel('deepseek-v4-pro-0813', 1000000, 384000, DEEPSEEK_EFFORTS),
  defineModel('deepseek-v4-flash', 1000000, 384000, DEEPSEEK_EFFORTS),
  defineModel('deepseek-v4-flash-0731', 1000000, 384000, DEEPSEEK_EFFORTS),
  defineModel('deepseek-v3.2', 131072, 65536, DEEPSEEK_V3_EFFORTS),
  // These entries have no documented manual-effort contract for this Token
  // Plan endpoint; leave the provider default enabled without synthesizing one.
  defineModel('kimi-k2.7-code', 262144, 262144, null, TOKEN_PLAN_COMPAT, false),
  defineModel('kimi-k2.6', 262144, 262144, null, TOKEN_PLAN_COMPAT, false),
  defineModel('kimi-k2.5', 262144, 98304, null, TOKEN_PLAN_COMPAT, false),
  defineModel('glm-5.2', 1000000, 131072, GLM_EFFORTS),
  defineModel('glm-5.1', 202752, 128000, GLM_EFFORTS),
  defineModel('glm-5', 202752, 16384, GLM_EFFORTS),
  // No documented manual-effort contract is published for MiniMax here.
  defineModel('MiniMax-M2.5', 196608, 32768, null, TOKEN_PLAN_COMPAT, false),
]);

export function resolveApiKey(env = process.env) {
  if (!env || typeof env !== 'object') return undefined;

  for (const name of TOKEN_PLAN_API_KEY_ENV_VARS) {
    const value = env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

export function buildProviderConfig(env = process.env) {
  const apiKey = resolveApiKey(env);
  return {
    baseUrl: TOKEN_PLAN_BASE_URL,
    api: 'openai-completions',
    authHeader: true,
    models: TOKEN_PLAN_MODELS,
    oauth: {
      name: PROVIDER_NAME,
      login: loginTokenPlan,
    },
    ...(apiKey ? { apiKey } : {}),
  };
}

function loginError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

export async function loginTokenPlan(callbacks) {
  const signal = callbacks?.signal;
  if (signal?.aborted) {
    throw loginError('LoginCancelledError', 'Alibaba Cloud Bailian Token Plan login cancelled');
  }
  if (typeof callbacks?.onAuth !== 'function' || typeof callbacks?.onPrompt !== 'function') {
    throw new TypeError('Alibaba Cloud Bailian Token Plan login requires onAuth and onPrompt callbacks');
  }

  callbacks.onAuth({
    url: TOKEN_PLAN_API_KEY_URL,
    instructions: TOKEN_PLAN_API_KEY_INSTRUCTIONS,
  });

  const rawKey = await callbacks.onPrompt({
    message: 'Paste your Alibaba Cloud Bailian Token Plan API key',
    placeholder: 'sk-sp-....',
  });

  if (signal?.aborted) {
    throw loginError('LoginCancelledError', 'Alibaba Cloud Bailian Token Plan login cancelled');
  }

  const key = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!key) {
    throw loginError('ApiKeyRequiredError', 'A non-empty Alibaba Cloud Bailian Token Plan API key is required');
  }
  return key;
}

export default function aliyunBailianTokenPlanExtension(pi) {
  pi.registerProvider(PROVIDER_ID, buildProviderConfig());
}
