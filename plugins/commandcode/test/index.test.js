import test from 'node:test';
import assert from 'node:assert/strict';

import extension, {
  COMMANDCODE_API_KEY_ENV_VARS,
  COMMANDCODE_API_KEY_URL,
  COMMANDCODE_BASE_URL,
  COMMANDCODE_MODELS,
  PROVIDER_ID,
  PROVIDER_NAME,
  buildProviderConfig,
  loginCommandCode,
  resolveApiKey,
} from '../index.js';

const EXPECTED_MODELS = {
  'claude-sonnet-5': { api: 'anthropic-messages', reasoning: true, contextWindow: 1000000, maxTokens: 64000, input: ['text', 'image'] },
  'claude-haiku-4-5-20251001': { api: 'anthropic-messages', reasoning: true, contextWindow: 200000, maxTokens: 64000, input: ['text', 'image'] },
  'gpt-5.6-sol': { api: 'openai-completions', reasoning: true, contextWindow: 1050000, maxTokens: 128000, input: ['text'] },
  'deepseek/deepseek-v4-flash': { api: 'openai-completions', reasoning: true, contextWindow: 1000000, maxTokens: 384000, input: ['text'] },
  'moonshotai/Kimi-K3': { api: 'openai-completions', reasoning: false, contextWindow: 1000000, maxTokens: 131072, input: ['text'] },
  'google/gemini-3.8-flash': { api: 'openai-completions', reasoning: false, contextWindow: 1000000, maxTokens: 65536, input: ['text', 'image'] },
  'meituan/LongCat-2.0:free': { api: 'openai-completions', reasoning: false, contextWindow: 1048576, maxTokens: 131072, input: ['text'] },
};

function withEnvironment(values, callback) {
  const previous = new Map();
  for (const name of COMMANDCODE_API_KEY_ENV_VARS) {
    previous.set(name, Object.hasOwn(process.env, name) ? process.env[name] : undefined);
    if (Object.hasOwn(values, name)) {
      if (values[name] === undefined) delete process.env[name];
      else process.env[name] = values[name];
    } else {
      delete process.env[name];
    }
  }

  try {
    return callback();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('registers the Command Code provider with native OpenAI transport default', () => {
  withEnvironment({ CMD_API_KEY: undefined, COMMANDCODE_API_KEY: undefined }, () => {
    const registrations = [];
    extension({
      registerProvider(name, config) {
        registrations.push({ name, config });
      },
    });

    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].name, PROVIDER_ID);
    assert.equal(registrations[0].config.api, 'openai-completions');
    assert.equal(registrations[0].config.baseUrl, COMMANDCODE_BASE_URL);
    assert.equal(registrations[0].config.authHeader, true);
    assert.equal(typeof registrations[0].config.oauth.login, 'function');
    assert.equal(registrations[0].config.apiKey, undefined);
    assert.equal(Object.isFrozen(COMMANDCODE_MODELS), true);
  });
});

test('prefers CMD_API_KEY over descriptive fallback and trims values', () => {
  assert.deepEqual(COMMANDCODE_API_KEY_ENV_VARS, ['CMD_API_KEY', 'COMMANDCODE_API_KEY']);
  withEnvironment({
    CMD_API_KEY: '  cmd-secret  ',
    COMMANDCODE_API_KEY: 'fallback-secret',
  }, () => {
    assert.equal(resolveApiKey(), 'cmd-secret');
  });
  withEnvironment({ CMD_API_KEY: undefined, COMMANDCODE_API_KEY: 'fallback-secret' }, () => {
    assert.equal(resolveApiKey(), 'fallback-secret');
  });
});

test('config carries env key when present and omits it otherwise', () => {
  withEnvironment({ CMD_API_KEY: 'env-key' }, () => {
    assert.equal(buildProviderConfig().apiKey, 'env-key');
  });
  withEnvironment({ CMD_API_KEY: '   ' }, () => {
    assert.equal(buildProviderConfig().apiKey, undefined);
  });
});

test('catalog covers every live Command Code model id exactly once', () => {
  const ids = COMMANDCODE_MODELS.map((model) => model.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    [...ids].sort(),
    [
      'MiniMaxAI/MiniMax-M2.5',
      'MiniMaxAI/MiniMax-M2.7',
      'MiniMaxAI/MiniMax-M3',
      'Qwen/Qwen3.6-Max-Preview',
      'Qwen/Qwen3.6-Plus',
      'Qwen/Qwen3.7-Flash',
      'Qwen/Qwen3.7-Max',
      'Qwen/Qwen3.7-Plus',
      'Qwen/Qwen3.8-27B',
      'Qwen/Qwen3.8-Flash',
      'Qwen/Qwen3.8-Max',
      'Qwen/Qwen3.8-Max-0902',
      'claude-fable-5',
      'claude-fable-5-1',
      'claude-haiku-4-5-20251001',
      'claude-opus-4-7',
      'claude-opus-4-8',
      'claude-opus-5',
      'claude-sonnet-4-6',
      'claude-sonnet-5',
      'deepseek/deepseek-v4-flash',
      'deepseek/deepseek-v4-flash-fast',
      'deepseek/deepseek-v4-flash-vision-exp',
      'deepseek/deepseek-v4-pro',
      'deepseek/deepseek-v4.1-flash',
      'google/gemini-3.1-flash-lite',
      'google/gemini-3.5-flash',
      'google/gemini-3.5-flash-lite',
      'google/gemini-3.6-flash',
      'google/gemini-3.7-flash',
      'google/gemini-3.8-flash',
      'gpt-5.3-codex',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.5',
      'gpt-5.6-luna',
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'inclusionai/ling-3.0-flash-sante:free',
      'meituan/LongCat-2.0:free',
      'meta/muse-spark-1.1',
      'meta/muse-spark-1.2',
      'meta/muse-spark-1.2-contributor',
      'meta/muse-spark-1.3',
      'meta/muse-spark-1.3-contributor',
      'moonshotai/Kimi-K2.5',
      'moonshotai/Kimi-K2.6',
      'moonshotai/Kimi-K2.7-Code',
      'moonshotai/Kimi-K2.7-Code-Highspeed',
      'moonshotai/Kimi-K3',
      'nvidia/nemotron-3-ultra-550b-a55b',
      'poolside/laguna-s-2.1-free',
      'sakana/fugu-ultra',
      'stepfun/Step-3.5-Flash',
      'stepfun/Step-3.7-Flash',
      'tencent/hy3-paid',
      'tencent/hy4-preview',
      'thinkingmachines/inkling',
      'thinkingmachines/inkling-small',
      'xai/grok-4.5',
      'xai/grok-4.6',
      'xiaomi/mimo-v2.5',
      'xiaomi/mimo-v2.5-pro',
      'z-ai/glm-5.3-flash',
      'zai-org/GLM-5',
      'zai-org/GLM-5.1',
      'zai-org/GLM-5.2',
      'zai-org/GLM-5.2-Fast',
      'zai-org/GLM-5.3',
    ].sort(),
  );
});

test('model entries carry frozen per-model api, envelope, thinking, and cost', () => {
  for (const [id, expected] of Object.entries(EXPECTED_MODELS)) {
    const model = COMMANDCODE_MODELS.find((entry) => entry.id === id);
    assert.ok(model, `missing model ${id}`);
    assert.equal(model.api, expected.api, `${id} api`);
    assert.equal(model.reasoning, expected.reasoning, `${id} reasoning`);
    assert.equal(model.contextWindow, expected.contextWindow, `${id} contextWindow`);
    assert.equal(model.maxTokens, expected.maxTokens, `${id} maxTokens`);
    assert.deepEqual(model.input, expected.input);
    assert.deepEqual(model.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    if (expected.reasoning) {
      assert.equal(model.thinking.mode, id.startsWith('claude') ? 'budget' : 'effort');
      assert.equal(model.thinking.efforts.length > 0, true);
      assert.equal(Object.isFrozen(model.thinking), true);
      assert.equal(Object.isFrozen(model.thinking.efforts), true);
    } else {
      assert.equal(model.thinking, undefined);
    }
    assert.equal(Object.isFrozen(model), true);
    assert.equal(Object.isFrozen(model.input), true);
    assert.equal(Object.isFrozen(model.cost), true);
    assert.equal(Object.isFrozen(model.compat), true);
  }
});

test('claude entries route through anthropic-messages with non-official compat', () => {
  for (const model of COMMANDCODE_MODELS) {
    if (!model.id.startsWith('claude')) continue;
    assert.equal(model.api, 'anthropic-messages', `${model.id} must use anthropic-messages`);
    assert.equal(model.compat.officialEndpoint, false);
  }
  for (const model of COMMANDCODE_MODELS) {
    if (model.id.startsWith('claude')) continue;
    assert.equal(model.api, 'openai-completions', `${model.id} must use openai-completions`);
  }
});

test('families without a documented effort contract expose no thinking ladder', () => {
  const noLadderPrefixes = ['moonshotai/', 'MiniMaxAI/', 'xiaomi/', 'Qwen/', 'google/', 'meta/'];
  const noLadderExact = new Set([
  ]);
  for (const model of COMMANDCODE_MODELS) {
    const expectedNoLadder = noLadderPrefixes.some((p) => model.id.startsWith(p)) || noLadderExact.has(model.id);
    if (!expectedNoLadder) continue;
    assert.equal(model.thinking, undefined, `${model.id} must not synthesize a ladder`);
    assert.equal(model.reasoning, false, `${model.id} must not claim reasoning`);
  }
  const laddered = COMMANDCODE_MODELS.filter((model) => model.thinking);
  assert.equal(laddered.length, 8 + 7 + 5 + 5, 'claude(8) + gpt(7) + deepseek(5) + glm(5) opt into ladders');
  assert.deepEqual(
    laddered.map((m) => m.id).sort(),
    [
      ...COMMANDCODE_MODELS.filter((m) => m.id.startsWith('claude')).map((m) => m.id),
      ...COMMANDCODE_MODELS.filter((m) => m.id.startsWith('gpt-')).map((m) => m.id),
      ...COMMANDCODE_MODELS.filter((m) => m.id.startsWith('deepseek/')).map((m) => m.id),
      ...COMMANDCODE_MODELS.filter((m) => m.id.startsWith('zai-org/')).map((m) => m.id),
    ].sort(),
    'only claude/gpt/deepseek/glm families opt into effort ladders',
  );
  for (const model of laddered) {
    assert.equal(model.reasoning, true, `${model.id} must claim reasoning`);
  }
});

test('login surfaces the official key page and requires a trimmed key', async () => {
  const auths = [];
  const prompts = [];
  const callbacks = {
    signal: undefined,
    onAuth(value) {
      auths.push(value);
    },
    onPrompt(value) {
      prompts.push(value);
      return Promise.resolve('  cmd-live-key  ');
    },
  };

  const key = await loginCommandCode(callbacks);
  assert.equal(key, 'cmd-live-key');
  assert.equal(auths.length, 1);
  assert.equal(auths[0].url, COMMANDCODE_API_KEY_URL);
  assert.equal(COMMANDCODE_API_KEY_URL, 'https://commandcode.ai/settings/keys');
  assert.equal(prompts.length, 1);
  assert.equal(typeof prompts[0].message, 'string');
  assert.equal(prompts[0].message.length > 0, true);
});

test('login rejects empty keys and missing callbacks', async () => {
  await assert.rejects(
    loginCommandCode({
      onAuth() {},
      onPrompt: () => Promise.resolve('   '),
    }),
    (error) => error.name === 'ApiKeyRequiredError',
  );

  await assert.rejects(
    loginCommandCode({}),
    (error) => error instanceof TypeError,
  );
});

test('login honours abort before prompting', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    loginCommandCode({
      signal: controller.signal,
      onAuth() {},
      onPrompt: () => Promise.resolve('key'),
    }),
    (error) => error.name === 'LoginCancelledError',
  );
});

test('login honours abort after prompting', async () => {
  const controller = new AbortController();
  await assert.rejects(
    (async () => {
      const pending = loginCommandCode({
        signal: controller.signal,
        onAuth() {},
        onPrompt: () => {
          controller.abort();
          return Promise.resolve('key');
        },
      });
      return pending;
    })(),
    (error) => error.name === 'LoginCancelledError',
  );
});
