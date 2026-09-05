import test from 'node:test';
import assert from 'node:assert/strict';

import extension, {
  TOKEN_PLAN_API_KEY_ENV_VARS,
  TOKEN_PLAN_API_KEY_URL,
  TOKEN_PLAN_BASE_URL,
  TOKEN_PLAN_MODELS,
  PROVIDER_ID,
  PROVIDER_NAME,
  buildProviderConfig,
  loginTokenPlan,
  resolveApiKey,
} from '../index.js';

const BASE_COMPAT = { supportsDeveloperRole: false };
const QWEN38_MAX_COMPAT = {
  supportsDeveloperRole: false,
  supportsReasoningEffort: true,
  whenThinking: {
    thinkingFormat: 'openai',
    extraBody: { enable_thinking: true },
  },
};
const EXPECTED_MODELS = {
  'qwen3.8-max': {
    reasoning: true,
    efforts: ['low', 'medium', 'xhigh'],
    defaultLevel: 'xhigh',
    contextWindow: 1000000,
    maxTokens: 131072,
    input: ['text', 'image'],
    compat: QWEN38_MAX_COMPAT,
  },
  'qwen3.8-flash': {
    reasoning: true,
    efforts: ['minimal', 'low', 'medium', 'high'],
    contextWindow: 1000000,
    maxTokens: 131072,
    input: ['text', 'image'],
    compat: BASE_COMPAT,
  },
  'qwen3.7-max': {
    reasoning: true,
    efforts: ['minimal', 'low', 'medium', 'high'],
    contextWindow: 1000000,
    maxTokens: 65536,
    input: ['text'],
    compat: BASE_COMPAT,
  },
  'qwen3.7-plus': {
    reasoning: true,
    efforts: ['minimal', 'low', 'medium', 'high'],
    contextWindow: 1000000,
    maxTokens: 64000,
    input: ['text', 'image'],
    compat: BASE_COMPAT,
  },
  'qwen3.6-plus': {
    reasoning: true,
    efforts: ['minimal', 'low', 'medium', 'high'],
    contextWindow: 1000000,
    maxTokens: 65536,
    input: ['text', 'image'],
    compat: BASE_COMPAT,
  },
  'qwen3.6-flash': {
    reasoning: true,
    efforts: ['minimal', 'low', 'medium', 'high'],
    contextWindow: 1000000,
    maxTokens: 65536,
    input: ['text', 'image'],
    compat: BASE_COMPAT,
  },
  'deepseek-v4-pro': {
    reasoning: true,
    efforts: ['low', 'high', 'max'],
    contextWindow: 1000000,
    maxTokens: 384000,
    input: ['text'],
    compat: BASE_COMPAT,
  },
  'deepseek-v4-pro-0813': {
    reasoning: true,
    efforts: ['low', 'high', 'max'],
    contextWindow: 1000000,
    maxTokens: 384000,
    input: ['text'],
    compat: BASE_COMPAT,
  },
  'deepseek-v4-flash': {
    reasoning: true,
    efforts: ['low', 'high', 'max'],
    contextWindow: 1000000,
    maxTokens: 384000,
    input: ['text'],
    compat: BASE_COMPAT,
  },
  'deepseek-v4-flash-0731': {
    reasoning: true,
    efforts: ['low', 'high', 'max'],
    contextWindow: 1000000,
    maxTokens: 384000,
    input: ['text'],
    compat: BASE_COMPAT,
  },
  'deepseek-v3.2': {
    reasoning: true,
    efforts: ['high', 'max'],
    contextWindow: 131072,
    maxTokens: 65536,
    input: ['text'],
    compat: BASE_COMPAT,
  },
  'kimi-k2.7-code': {
    reasoning: false,
    contextWindow: 262144,
    maxTokens: 262144,
    input: ['text', 'image'],
    compat: BASE_COMPAT,
  },
  'kimi-k2.6': {
    reasoning: false,
    contextWindow: 262144,
    maxTokens: 262144,
    input: ['text', 'image'],
    compat: BASE_COMPAT,
  },
  'kimi-k2.5': {
    reasoning: false,
    contextWindow: 262144,
    maxTokens: 98304,
    input: ['text', 'image'],
    compat: BASE_COMPAT,
  },
  'glm-5.2': {
    reasoning: true,
    efforts: ['minimal', 'low', 'medium', 'high', 'max'],
    contextWindow: 1000000,
    maxTokens: 131072,
    input: ['text'],
    compat: BASE_COMPAT,
  },
  'glm-5.1': {
    reasoning: true,
    efforts: ['minimal', 'low', 'medium', 'high', 'max'],
    contextWindow: 202752,
    maxTokens: 128000,
    input: ['text'],
    compat: BASE_COMPAT,
  },
  'glm-5': {
    reasoning: true,
    efforts: ['minimal', 'low', 'medium', 'high', 'max'],
    contextWindow: 202752,
    maxTokens: 16384,
    input: ['text'],
    compat: BASE_COMPAT,
  },
  'MiniMax-M2.5': {
    reasoning: false,
    contextWindow: 196608,
    maxTokens: 32768,
    input: ['text'],
    compat: BASE_COMPAT,
  },
};

function withEnvironment(values, callback) {
  const previous = new Map();
  for (const name of TOKEN_PLAN_API_KEY_ENV_VARS) {
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

test('registers the stable Alibaba Cloud provider with native OpenAI transport', () => {
  withEnvironment({
    DASHSCOPE_API_KEY: undefined,
    ALIYUN_BAILIAN_TOKEN_PLAN_API_KEY: undefined,
    BAILIAN_TOKEN_PLAN_API_KEY: undefined,
  }, () => {
    const registrations = [];
    extension({
      registerProvider(name, config) {
        registrations.push({ name, config });
      },
    });

    assert.equal(registrations.length, 1);
    const [{ name, config }] = registrations;
    assert.equal(name, PROVIDER_ID);
    assert.equal(name, 'aliyun-bailian-token-plan');
    assert.equal(config.baseUrl, TOKEN_PLAN_BASE_URL);
    assert.equal(config.api, 'openai-completions');
    assert.equal(config.authHeader, true);
    assert.equal(config.oauth.name, PROVIDER_NAME);
    assert.equal(config.oauth.login, loginTokenPlan);
    assert.equal(config.models, TOKEN_PLAN_MODELS);
    assert.equal(Object.hasOwn(config, 'apiKey'), false);
  });
});

test('keeps the documented static catalog exact and tool-capable', () => {
  assert.deepEqual(
    TOKEN_PLAN_MODELS.map((model) => model.id),
    Object.keys(EXPECTED_MODELS),
  );

  for (const model of TOKEN_PLAN_MODELS) {
    const expected = EXPECTED_MODELS[model.id];
    assert.ok(expected, `unexpected model ${model.id}`);
    assert.equal(model.name, model.id);
    assert.equal(model.reasoning, expected.reasoning);
    assert.equal(model.supportsTools, true);
    assert.equal(model.contextWindow, expected.contextWindow);
    assert.equal(model.maxTokens, expected.maxTokens);
    assert.deepEqual(model.input, expected.input);
    assert.deepEqual(model.compat, expected.compat);
    assert.deepEqual(model.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    if (expected.efforts) {
      assert.deepEqual(model.thinking, {
        mode: 'effort',
        efforts: expected.efforts,
        ...(expected.defaultLevel ? { defaultLevel: expected.defaultLevel } : {}),
      });
      assert.equal(Object.isFrozen(model.thinking), true);
      assert.equal(Object.isFrozen(model.thinking.efforts), true);
    } else {
      assert.equal(model.thinking, undefined);
    }
    assert.deepEqual(Object.keys(model).sort(), [
      'compat',
      'contextWindow',
      'cost',
      'id',
      'input',
      'maxTokens',
      'name',
      'reasoning',
      'supportsTools',
      ...(expected.efforts ? ['thinking'] : []),
    ].sort());
    assert.equal(Object.isFrozen(model), true);
    assert.equal(Object.isFrozen(model.compat), true);
    assert.equal(Object.isFrozen(model.input), true);
    assert.equal(Object.isFrozen(model.cost), true);
  }
  const qwen38Max = TOKEN_PLAN_MODELS.find((model) => model.id === 'qwen3.8-max');
  assert.equal(Object.isFrozen(qwen38Max.compat.whenThinking), true);
  assert.equal(Object.isFrozen(qwen38Max.compat.whenThinking.extraBody), true);
  assert.equal(Object.isFrozen(TOKEN_PLAN_MODELS), true);
});

test('resolves DashScope before descriptive fallbacks and trims values', () => {
  assert.deepEqual(TOKEN_PLAN_API_KEY_ENV_VARS, [
    'DASHSCOPE_API_KEY',
    'ALIYUN_BAILIAN_TOKEN_PLAN_API_KEY',
    'BAILIAN_TOKEN_PLAN_API_KEY',
  ]);
  withEnvironment({
    DASHSCOPE_API_KEY: '  dashscope-secret  ',
    ALIYUN_BAILIAN_TOKEN_PLAN_API_KEY: 'aliyun-secret',
    BAILIAN_TOKEN_PLAN_API_KEY: 'bailian-secret',
  }, () => {
    assert.equal(resolveApiKey(), 'dashscope-secret');
    assert.equal(buildProviderConfig().apiKey, 'dashscope-secret');
  });

  withEnvironment({
    DASHSCOPE_API_KEY: undefined,
    ALIYUN_BAILIAN_TOKEN_PLAN_API_KEY: '  aliyun-secret  ',
    BAILIAN_TOKEN_PLAN_API_KEY: 'bailian-secret',
  }, () => {
    assert.equal(resolveApiKey(), 'aliyun-secret');
    assert.equal(buildProviderConfig().apiKey, 'aliyun-secret');
  });

  withEnvironment({
    DASHSCOPE_API_KEY: undefined,
    ALIYUN_BAILIAN_TOKEN_PLAN_API_KEY: undefined,
    BAILIAN_TOKEN_PLAN_API_KEY: '  bailian-secret  ',
  }, () => {
    assert.equal(resolveApiKey(), 'bailian-secret');
    assert.equal(buildProviderConfig().apiKey, 'bailian-secret');
  });
});

test('omits apiKey when no environment credential exists', () => {
  withEnvironment({
    DASHSCOPE_API_KEY: undefined,
    ALIYUN_BAILIAN_TOKEN_PLAN_API_KEY: undefined,
    BAILIAN_TOKEN_PLAN_API_KEY: undefined,
  }, () => {
    const config = buildProviderConfig();
    assert.equal(resolveApiKey(), undefined);
    assert.equal(Object.hasOwn(config, 'apiKey'), false);
    assert.doesNotMatch(JSON.stringify(config), /DASHSCOPE_API_KEY|ALIYUN_BAILIAN_TOKEN_PLAN_API_KEY|BAILIAN_TOKEN_PLAN_API_KEY/);
  });
});

test('login opens the official key page and returns a trimmed key', async () => {
  let authInfo;
  let promptInfo;
  const result = await loginTokenPlan({
    onAuth(info) {
      authInfo = info;
    },
    async onPrompt(prompt) {
      promptInfo = prompt;
      return '  sk-test-key  \n';
    },
  });

  assert.deepEqual(authInfo, {
    url: TOKEN_PLAN_API_KEY_URL,
    instructions: 'Copy an API key from the Alibaba Cloud Bailian Token Plan API-key page.',
  });
  assert.equal(promptInfo.message, 'Paste your Alibaba Cloud Bailian Token Plan API key');
  assert.equal(promptInfo.placeholder, 'sk-sp-....');
  assert.equal(result, 'sk-test-key');
  assert.doesNotMatch(authInfo.instructions, /sk-test-key/);
});

test('login rejects an empty or whitespace-only key', async () => {
  await assert.rejects(
    loginTokenPlan({
      onAuth() {},
      async onPrompt() {
        return ' \n\t ';
      },
    }),
    /non-empty.*API key/i,
  );
});

test('login aborts before prompting and after a prompt aborts', async () => {
  const before = new AbortController();
  before.abort();
  let prompted = false;
  await assert.rejects(
    loginTokenPlan({
      signal: before.signal,
      onAuth() {
        assert.fail('pre-aborted login must not announce authentication');
      },
      async onPrompt() {
        prompted = true;
        return 'sk-never-returned';
      },
    }),
    /cancel/i,
  );
  assert.equal(prompted, false);

  const during = new AbortController();
  await assert.rejects(
    loginTokenPlan({
      signal: during.signal,
      onAuth() {},
      async onPrompt() {
        during.abort();
        return 'sk-never-returned';
      },
    }),
    /cancel/i,
  );
});
