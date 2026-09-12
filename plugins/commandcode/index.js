export const PROVIDER_ID = 'commandcode';
export const PROVIDER_NAME = 'Command Code';
export const COMMANDCODE_BASE_URL = 'https://api.commandcode.ai/provider/v1';
export const COMMANDCODE_API_KEY_URL = 'https://commandcode.ai/settings/keys';
export const COMMANDCODE_API_KEY_INSTRUCTIONS =
  'Create or copy an API key from the Command Code Studio API-keys page. The same key authenticates the CLI and the Provider API.';
export const COMMANDCODE_API_KEY_ENV_VARS = Object.freeze([
  'CMD_API_KEY',
  'COMMANDCODE_API_KEY',
]);

const ZERO_COST = Object.freeze({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
});

// Effort ladders mirror the official Command Code CLI registry
// (command-code@1.53.0, dist/cli.mjs), which is authoritative for which levels
// the model picker offers per model. Command Code forwards the level upstream
// as reasoning_effort (OpenAI transport) or a thinking budget (Anthropic
// transport). Trim a ladder if a model rejects a level with a 400 naming the
// offending effort.
const MAX_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
const XHIGH_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh']);
const MEDIUM_EFFORTS = Object.freeze(['low', 'medium', 'high']);
const LOW_HIGH_MAX_EFFORTS = Object.freeze(['low', 'high', 'max']);
const HIGH_MAX_EFFORTS = Object.freeze(['high', 'max']);
const QWEN_EFFORTS = Object.freeze(['low', 'medium', 'xhigh']);
const FUGU_EFFORTS = Object.freeze(['high', 'xhigh']);

const OPENAI_COMPAT = Object.freeze({ supportsDeveloperRole: false });
const ANTHROPIC_COMPAT = Object.freeze({
  supportsDeveloperRole: false,
  // commandcode.ai is not api.anthropic.com; do not treat it as official.
  officialEndpoint: false,
});

function defineModel(id, contextWindow, maxTokens, input = ['text'], efforts = null, compat = OPENAI_COMPAT) {
  const anthropic = id.startsWith('claude');
  return Object.freeze({
    id,
    name: id,
    reasoning: Boolean(efforts),
    api: anthropic ? 'anthropic-messages' : 'openai-completions',
    ...(efforts
      ? { thinking: Object.freeze({ mode: anthropic ? 'budget' : 'effort', efforts }) }
      : {}),
    input: Object.freeze([...input]),
    supportsTools: true,
    cost: ZERO_COST,
    contextWindow,
    maxTokens,
    compat: anthropic
      ? Object.freeze({ ...compat, ...ANTHROPIC_COMPAT })
      : compat,
  });
}

const VISION = ['text', 'image'];

export const COMMANDCODE_MODELS = Object.freeze([
  // Anthropic — routed through /provider/v1/messages
  defineModel('claude-sonnet-5', 1000000, 64000, VISION, MAX_EFFORTS),
  defineModel('claude-sonnet-4-6', 1000000, 64000, VISION, MAX_EFFORTS),
  defineModel('claude-fable-5-1', 1000000, 64000, VISION, MAX_EFFORTS),
  defineModel('claude-fable-5', 1000000, 64000, VISION, MAX_EFFORTS),
  defineModel('claude-opus-5', 1000000, 64000, VISION, MAX_EFFORTS),
  defineModel('claude-opus-4-8', 1000000, 64000, VISION, MAX_EFFORTS),
  defineModel('claude-opus-4-7', 1000000, 64000, VISION, MAX_EFFORTS),
  // Haiku carries no reasoning flag in the official registry.
  defineModel('claude-haiku-4-5-20251001', 200000, 64000, VISION, null),
  // OpenAI — routed through /provider/v1/chat/completions
  defineModel('gpt-5.6-sol', 1050000, 128000, ['text'], MAX_EFFORTS),
  defineModel('gpt-5.6-terra', 1050000, 128000, ['text'], MAX_EFFORTS),
  defineModel('gpt-5.6-luna', 1050000, 128000, ['text'], MAX_EFFORTS),
  defineModel('gpt-5.5', 400000, 128000, ['text'], XHIGH_EFFORTS),
  defineModel('gpt-5.4', 400000, 128000, ['text'], XHIGH_EFFORTS),
  defineModel('gpt-5.3-codex', 400000, 128000, ['text'], XHIGH_EFFORTS),
  defineModel('gpt-5.4-mini', 400000, 128000, ['text'], MEDIUM_EFFORTS),
  // DeepSeek
  defineModel('deepseek/deepseek-v4-pro', 1000000, 384000, ['text'], HIGH_MAX_EFFORTS),
  defineModel('deepseek/deepseek-v4-flash', 1000000, 384000, ['text'], HIGH_MAX_EFFORTS),
  defineModel('deepseek/deepseek-v4-flash-vision-exp', 1000000, 384000, VISION, HIGH_MAX_EFFORTS),
  defineModel('deepseek/deepseek-v4-flash-fast', 1000000, 384000, ['text'], LOW_HIGH_MAX_EFFORTS),
  defineModel('deepseek/deepseek-v4.1-flash', 1000000, 384000, VISION, LOW_HIGH_MAX_EFFORTS),
  // Moonshot
  defineModel('moonshotai/Kimi-K3', 1000000, 131072, ['text'], LOW_HIGH_MAX_EFFORTS),
  // Kimi K2.7/K2.6/K2.5 reason on their own; the registry grants no effort levels.
  defineModel('moonshotai/Kimi-K2.7-Code', 256000, 131072, VISION, null),
  defineModel('moonshotai/Kimi-K2.7-Code-Highspeed', 262000, 131072, VISION, null),
  defineModel('moonshotai/Kimi-K2.6', 256000, 131072, VISION, null),
  defineModel('moonshotai/Kimi-K2.5', 256000, 131072, VISION, null),
  // Z AI
  defineModel('z-ai/glm-5.3-flash', 1048576, 131072, VISION, LOW_HIGH_MAX_EFFORTS),
  defineModel('zai-org/GLM-5.3', 1000000, 131072, ['text'], LOW_HIGH_MAX_EFFORTS),
  defineModel('zai-org/GLM-5.2', 1000000, 131072, ['text'], HIGH_MAX_EFFORTS),
  // GLM 5.2-Fast/5.1/5 expose no effort levels in the registry.
  defineModel('zai-org/GLM-5.2-Fast', 1000000, 131072, ['text'], null),
  defineModel('zai-org/GLM-5.1', 200000, 128000, ['text'], null),
  defineModel('zai-org/GLM-5', 200000, 16384, ['text'], null),
  // MiniMax — only M3 exposes effort levels; M2.7/M2.5 reason without them.
  defineModel('MiniMaxAI/MiniMax-M3', 1000000, 131072, VISION, MEDIUM_EFFORTS),
  defineModel('MiniMaxAI/MiniMax-M2.7', 200000, 32768, ['text'], null),
  defineModel('MiniMaxAI/MiniMax-M2.5', 200000, 32768, ['text'], null),
  // Xiaomi MiMo reasons without adjustable effort.
  defineModel('xiaomi/mimo-v2.5-pro', 1000000, 131072, ['text'], null),
  defineModel('xiaomi/mimo-v2.5', 1000000, 131072, ['text'], null),
  // Alibaba Qwen — 3.8 family exposes low/medium/xhigh; 3.7/3.6 do not.
  defineModel('Qwen/Qwen3.8-Max-0902', 1000000, 131072, VISION, QWEN_EFFORTS),
  defineModel('Qwen/Qwen3.8-Max', 1000000, 131072, VISION, QWEN_EFFORTS),
  defineModel('Qwen/Qwen3.8-27B', 262144, 131072, VISION, QWEN_EFFORTS),
  defineModel('Qwen/Qwen3.8-Flash', 1000000, 131072, VISION, QWEN_EFFORTS),
  defineModel('Qwen/Qwen3.7-Max', 1000000, 65536, VISION, null),
  defineModel('Qwen/Qwen3.7-Plus', 1000000, 64000, VISION, null),
  defineModel('Qwen/Qwen3.7-Flash', 1000000, 65536, VISION, null),
  defineModel('Qwen/Qwen3.6-Max-Preview', 200000, 65536, ['text'], null),
  defineModel('Qwen/Qwen3.6-Plus', 200000, 65536, VISION, null),
  // Google — every Gemini entry exposes low/medium/high.
  defineModel('google/gemini-3.8-flash', 1000000, 65536, VISION, MEDIUM_EFFORTS),
  defineModel('google/gemini-3.7-flash', 1048576, 65536, VISION, MEDIUM_EFFORTS),
  defineModel('google/gemini-3.6-flash', 1000000, 65536, VISION, MEDIUM_EFFORTS),
  defineModel('google/gemini-3.5-flash', 1000000, 65536, VISION, MEDIUM_EFFORTS),
  defineModel('google/gemini-3.5-flash-lite', 1000000, 65536, VISION, MEDIUM_EFFORTS),
  defineModel('google/gemini-3.1-flash-lite', 1000000, 65536, VISION, MEDIUM_EFFORTS),
  // Other open / niche
  defineModel('meituan/LongCat-2.0:free', 1048576, 131072, ['text'], null),
  defineModel('stepfun/Step-3.7-Flash', 256000, 65536, VISION, null),
  defineModel('stepfun/Step-3.5-Flash', 1000000, 65536, VISION, null),
  defineModel('tencent/hy3-paid', 262144, 65536, ['text'], null),
  defineModel('tencent/hy4-preview', 1048576, 65536, ['text'], MEDIUM_EFFORTS),
  defineModel('sakana/fugu-ultra', 1000000, 65536, VISION, FUGU_EFFORTS),
  defineModel('nvidia/nemotron-3-ultra-550b-a55b', 1000000, 65536, ['text'], null),
  defineModel('thinkingmachines/inkling', 256000, 65536, VISION, null),
  defineModel('thinkingmachines/inkling-small', 1000000, 65536, VISION, null),
  defineModel('poolside/laguna-s-2.1-free', 256000, 131072, ['text'], null),
  defineModel('inclusionai/ling-3.0-flash-sante:free', 262144, 65536, VISION, null),
  // Meta Muse Spark — contributor builds stop at xhigh; base 1.3 adds max.
  defineModel('meta/muse-spark-1.3', 1048576, 131072, VISION, MAX_EFFORTS),
  defineModel('meta/muse-spark-1.3-contributor', 1048576, 131072, VISION, XHIGH_EFFORTS),
  defineModel('meta/muse-spark-1.2', 1048576, 131072, VISION, XHIGH_EFFORTS),
  defineModel('meta/muse-spark-1.2-contributor', 1048576, 131072, VISION, XHIGH_EFFORTS),
  defineModel('meta/muse-spark-1.1', 1048576, 131072, VISION, XHIGH_EFFORTS),
  defineModel('xai/grok-4.6', 500000, 65536, VISION, XHIGH_EFFORTS),
  defineModel('xai/grok-4.5', 500000, 65536, VISION, MEDIUM_EFFORTS),
]);

export function resolveApiKey(env = process.env) {
  if (!env || typeof env !== 'object') return undefined;

  for (const name of COMMANDCODE_API_KEY_ENV_VARS) {
    const value = env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

export function buildProviderConfig(env = process.env) {
  const apiKey = resolveApiKey(env);
  return {
    baseUrl: COMMANDCODE_BASE_URL,
    api: 'openai-completions',
    authHeader: true,
    models: COMMANDCODE_MODELS,
    oauth: {
      name: PROVIDER_NAME,
      login: loginCommandCode,
    },
    ...(apiKey ? { apiKey } : {}),
  };
}

function loginError(name, message) {
  const error = new Error(message);
  error.name = name;
  return error;
}

export async function loginCommandCode(callbacks) {
  const signal = callbacks?.signal;
  if (signal?.aborted) {
    throw loginError('LoginCancelledError', 'Command Code login cancelled');
  }
  if (typeof callbacks?.onAuth !== 'function' || typeof callbacks?.onPrompt !== 'function') {
    throw new TypeError('Command Code login requires onAuth and onPrompt callbacks');
  }

  callbacks.onAuth({
    url: COMMANDCODE_API_KEY_URL,
    instructions: COMMANDCODE_API_KEY_INSTRUCTIONS,
  });

  const rawKey = await callbacks.onPrompt({
    message: 'Paste your Command Code API key',
    placeholder: 'cmd-... or sk-...',
  });

  if (signal?.aborted) {
    throw loginError('LoginCancelledError', 'Command Code login cancelled');
  }

  const key = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!key) {
    throw loginError('ApiKeyRequiredError', 'A non-empty Command Code API key is required');
  }
  return key;
}

export default function commandCodeExtension(pi) {
  pi.registerProvider(PROVIDER_ID, buildProviderConfig());
}
