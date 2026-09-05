import test from 'node:test';
import assert from 'node:assert/strict';

import extension, {
  CODING_PLAN_API_KEY_ENV_VARS,
  CODING_PLAN_API_KEY_URL,
  CODING_PLAN_BASE_URL,
  CODING_PLAN_MODELS,
  PROVIDER_ID,
  PROVIDER_NAME,
  buildProviderConfig,
  loginCodingPlan,
  resolveApiKey,
} from '../index.js';

const EXPECTED_MODELS = {
  'ark-code-latest': { reasoning: true, contextWindow: 1048576, maxTokens: 384000, input: ['text'] },
  'doubao-seed-evolving': { reasoning: true, contextWindow: 1048576, maxTokens: 262144, input: ['text'] },
  'doubao-seed-2.1-turbo': { reasoning: true, contextWindow: 262144, maxTokens: 65536, input: ['text', 'image'] },
  'doubao-seed-2.0-lite': { reasoning: true, contextWindow: 262144, maxTokens: 131072, input: ['text', 'image'] },
  'minimax-m3': { reasoning: true, contextWindow: 1048576, maxTokens: 131072, input: ['text', 'image'] },
  'glm-5.3': { reasoning: true, contextWindow: 1048576, maxTokens: 131072, input: ['text'] },
  'glm-5.3-flash': { reasoning: true, contextWindow: 1048576, maxTokens: 131072, input: ['text', 'image'] },
  'deepseek-v4-flash': { reasoning: true, contextWindow: 1048576, maxTokens: 384000, input: ['text'] },
  'deepseek-v4-pro': { reasoning: true, contextWindow: 1048576, maxTokens: 384000, input: ['text'] },
  'kimi-k2.7-code': { reasoning: false, contextWindow: 262144, maxTokens: 32000, input: ['text', 'image'] },
};

function withEnvironment(values, callback) {
  const previous = new Map();
  for (const name of CODING_PLAN_API_KEY_ENV_VARS) {
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

test('registers the stable Volcengine provider with native OpenAI transport', () => {
  withEnvironment({ ARK_API_KEY: undefined, VOLCENGINE_CODING_PLAN_API_KEY: undefined }, () => {
    const registrations = [];
    extension({
      registerProvider(name, config) {
        registrations.push({ name, config });
      },
    });

    assert.equal(registrations.length, 1);
    const [{ name, config }] = registrations;
    assert.equal(name, PROVIDER_ID);
    assert.equal(name, 'volcengine-coding-plan');
    assert.equal(config.baseUrl, CODING_PLAN_BASE_URL);
    assert.equal(config.api, 'openai-completions');
    assert.equal(config.authHeader, true);
    assert.equal(config.oauth.name, PROVIDER_NAME);
    assert.equal(config.oauth.login, loginCodingPlan);
    assert.equal(config.models, CODING_PLAN_MODELS);
    assert.equal(Object.hasOwn(config, 'apiKey'), false);
  });
});

test('keeps the current static catalog exact, conservative, and tool-capable', () => {
  assert.equal(CODING_PLAN_MODELS.length, 10);
  assert.deepEqual(
    CODING_PLAN_MODELS.map((model) => model.id),
    Object.keys(EXPECTED_MODELS),
  );

  for (const model of CODING_PLAN_MODELS) {
    const expected = EXPECTED_MODELS[model.id];
    assert.ok(expected, `unexpected model ${model.id}`);
    assert.equal(model.reasoning, expected.reasoning);
    const expectedEfforts =
      model.id === 'kimi-k2.7-code'
        ? undefined
        : model.id === 'glm-5.3'
          ? ['low', 'medium', 'high', 'xhigh', 'max']
          : ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
    if (expectedEfforts) {
      assert.deepEqual(model.thinking, { mode: 'effort', efforts: expectedEfforts });
      assert.equal(Object.isFrozen(model.thinking), true);
    } else {
      assert.equal(model.thinking, undefined);
    }
    assert.equal(model.supportsTools, true);
    assert.equal(model.contextWindow, expected.contextWindow);
    assert.equal(model.maxTokens, expected.maxTokens);
    assert.deepEqual(model.input, expected.input);
    assert.deepEqual(model.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    assert.deepEqual(Object.keys(model).sort(), [
      'contextWindow',
      'cost',
      'id',
      'input',
      'maxTokens',
      'name',
      'reasoning',
      'supportsTools',
      ...(expectedEfforts ? ['thinking'] : []),
    ].sort());
    assert.equal(Object.isFrozen(model), true);
    assert.equal(Object.isFrozen(model.input), true);
    assert.equal(Object.isFrozen(model.cost), true);
    assert.equal(Object.isFrozen(CODING_PLAN_MODELS), true);
  }
});

test('resolves ARK_API_KEY before the descriptive fallback and trims values', () => {
  withEnvironment({
    ARK_API_KEY: '  ark-secret  ',
    VOLCENGINE_CODING_PLAN_API_KEY: 'descriptive-secret',
  }, () => {
    assert.equal(resolveApiKey(), 'ark-secret');
    assert.equal(buildProviderConfig().apiKey, 'ark-secret');
  });

  withEnvironment({
    ARK_API_KEY: undefined,
    VOLCENGINE_CODING_PLAN_API_KEY: '  descriptive-secret  ',
  }, () => {
    assert.equal(resolveApiKey(), 'descriptive-secret');
    assert.equal(buildProviderConfig().apiKey, 'descriptive-secret');
  });
});

test('omits apiKey when no environment credential exists', () => {
  withEnvironment({ ARK_API_KEY: undefined, VOLCENGINE_CODING_PLAN_API_KEY: undefined }, () => {
    const config = buildProviderConfig();
    assert.equal(resolveApiKey(), undefined);
    assert.equal(Object.hasOwn(config, 'apiKey'), false);
    assert.doesNotMatch(JSON.stringify(config), /ARK_API_KEY|VOLCENGINE_CODING_PLAN_API_KEY/);
  });
});

test('login opens the official key page and returns a trimmed key', async () => {
  let authInfo;
  let promptInfo;
  const result = await loginCodingPlan({
    onAuth(info) {
      authInfo = info;
    },
    async onPrompt(prompt) {
      promptInfo = prompt;
      return '  sk-test-key  \n';
    },
  });

  assert.deepEqual(authInfo, {
    url: CODING_PLAN_API_KEY_URL,
    instructions: 'Copy an API key from the Volcengine Ark Coding Plan API-key page.',
  });
  assert.equal(promptInfo.message, 'Paste your Volcengine Ark Coding Plan API key');
  assert.equal(promptInfo.placeholder, 'ARK-...');
  assert.equal(result, 'sk-test-key');
  assert.doesNotMatch(authInfo.instructions, /sk-test-key/);
});

test('login rejects an empty or whitespace-only key', async () => {
  await assert.rejects(
    loginCodingPlan({
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
    loginCodingPlan({
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
    loginCodingPlan({
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
