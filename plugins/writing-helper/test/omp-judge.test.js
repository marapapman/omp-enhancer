import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { configuredJudgeSelector, parseModelSelector, resolveOmpJudge } from '../src/omp-judge.js';

function judge(id, provider, extra = {}) {
  return { id, provider, kind: 'judge', api: 'typesafe', baseUrl: `https://${provider}.example`, ...extra };
}

function registry(modelsByProvider, { headers, resolveHeaders, concreteAuth, throwProviders = [] } = {}) {
  return {
    getProviderModels(provider) {
      if (throwProviders.includes(provider)) throw new Error('provider unavailable');
      return modelsByProvider[provider] ?? [];
    },
    hasConcreteAuth(provider) {
      return concreteAuth ? concreteAuth(provider) : true;
    },
    async getApiKeyAndHeaders(model) {
      if (!headers) return {};
      return headers(model);
    },
    async resolveModelHeaders(model) {
      if (!resolveHeaders) return {};
      return resolveHeaders(model);
    },
  };
}

describe('OMP judge model resolution', () => {
  it('reads the judge role from settings and builds a bearer header', async () => {
    const model = judge('jev-1.13-free', 'opencode-zen');
    const resolved = await resolveOmpJudge({
      settings: { getModelRoles: () => ({ judge: 'opencode-zen/jev-1.13-free,typesafe/jev-latest' }) },
      modelRegistry: registry({ 'opencode-zen': [model] }, { headers: () => ({ apiKey: 'omp-key', headers: {} }) }),
      models: { list: () => [] },
    });

    assert.equal(resolved.ok, true);
    assert.deepEqual(resolved.model, {
      id: 'jev-1.13-free',
      provider: 'opencode-zen',
      baseUrl: 'https://opencode-zen.example',
      api: 'typesafe',
      headers: { authorization: 'Bearer omp-key' },
    });
  });

  it('keeps a resolved authorization header without adding a bearer token', async () => {
    const model = judge('jev-latest', 'typesafe');
    const resolved = await resolveOmpJudge({
      settings: { modelRoles: { judge: 'typesafe/jev-latest' } },
      modelRegistry: registry({ typesafe: [model] }, { headers: () => ({ headers: { Authorization: 'Bearer stored' }, apiKey: 'ignored' }) }),
      models: { list: () => [] },
    });

    assert.equal(resolved.ok, true);
    assert.deepEqual(resolved.model.headers, { Authorization: 'Bearer stored' });
  });

  it('falls back to the first authenticated judge when the role is missing or stale', async () => {
    const stale = judge('gone', 'opencode-zen');
    const fallback = judge('jev-1.13', 'opencode-zen');
    const resolved = await resolveOmpJudge({
      settings: { getModelRoles: () => ({ judge: 'opencode-zen/gone' }) },
      modelRegistry: registry(
        { 'opencode-zen': [stale, fallback] },
        { resolveHeaders: () => ({ 'x-api-key': 'stored' }) },
      ),
      models: { list: () => [{ provider: 'opencode-zen' }, { provider: 'typesafe' }] },
    });

    assert.equal(resolved.ok, true);
    assert.equal(resolved.model.id, 'gone');
    assert.deepEqual(resolved.model.headers, { 'x-api-key': 'stored' });
  });

  it('skips providers without concrete auth and non-System-One judges', async () => {
    const wrongApi = judge('chat-judge', 'typesafe', { api: 'openai-decisions' });
    const good = judge('jev-1.13', 'opencode-zen');
    const resolved = await resolveOmpJudge({
      settings: {},
      modelRegistry: registry(
        { typesafe: [wrongApi], 'opencode-zen': [good] },
        {
          headers: (model) => (model.id === 'jev-1.13' ? { apiKey: 'omp-key' } : {}),
          concreteAuth: (provider) => provider !== 'typesafe',
        },
      ),
      models: { list: () => [{ provider: 'typesafe' }, { provider: 'opencode-zen' }] },
    });

    assert.equal(resolved.ok, true);
    assert.equal(resolved.model.provider, 'opencode-zen');
  });

  it('reports a missing registry, missing judges, and missing credentials', async () => {
    assert.deepEqual(await resolveOmpJudge({}), { ok: false, reason: 'no_model_registry' });
    assert.deepEqual(
      await resolveOmpJudge({
        modelRegistry: { getProviderModels: () => [] },
        models: { list: () => [] },
      }),
      { ok: false, reason: 'no_judge_model' },
    );
    assert.deepEqual(
      await resolveOmpJudge({
        settings: { getModelRoles: () => ({ judge: 'opencode-zen/jev-1.13-free' }) },
        modelRegistry: registry({ 'opencode-zen': [judge('jev-1.13-free', 'opencode-zen')] }),
        models: { list: () => [] },
      }),
      { ok: false, reason: 'no_judge_model' },
    );
  });

  it('survives throwing settings, provider lookups, and header resolvers', async () => {
    const model = judge('jev-1.13', 'opencode-zen');
    const result = await resolveOmpJudge({
      settings: {
        getModelRoles: () => {
          throw new Error('settings unavailable');
        },
        modelRoles: { judge: 'opencode-zen/jev-1.13' },
      },
      modelRegistry: {
        getProviderModels(provider) {
          if (provider === 'opencode-zen') throw new Error('provider unavailable');
          return [];
        },
        hasConcreteAuth: () => true,
        async getApiKeyAndHeaders() {
          throw new Error('key lookup failed');
        },
        async resolveModelHeaders() {
          throw new Error('header lookup failed');
        },
      },
      models: { list: () => [{ provider: 'opencode-zen' }] },
    });
    assert.deepEqual(result, { ok: false, reason: 'no_judge_model' });

    const headerFailure = await resolveOmpJudge({
      settings: { modelRoles: { judge: 'opencode-zen/jev-1.13' } },
      modelRegistry: registry({ 'opencode-zen': [model] }, { resolveHeaders: () => ({}) }),
      models: { list: () => [] },
    });
    assert.deepEqual(headerFailure, { ok: false, reason: 'no_judge_model' });
  });

  it('skips a configured judge model with an unsupported API', async () => {
    const model = judge('decision', 'typesafe', { api: 'openai-decisions' });
    const result = await resolveOmpJudge({
      settings: { getModelRoles: () => ({ judge: 'typesafe/decision' }) },
      modelRegistry: registry({ typesafe: [model] }, { headers: () => ({ apiKey: 'k' }) }),
      models: { list: () => [] },
    });
    assert.deepEqual(result, { ok: false, reason: 'no_judge_model' });
  });

  it('uses the header resolver when the key helper is absent', async () => {
    const model = judge('jev-1.13', 'opencode-zen');
    const result = await resolveOmpJudge({
      settings: { modelRoles: { judge: 'opencode-zen/jev-1.13' } },
      modelRegistry: {
        getProviderModels: () => [model],
        hasConcreteAuth: () => true,
        resolveModelHeaders: async () => ({ authorization: 'Bearer resolved' }),
      },
      models: { list: () => [{ provider: 5 }, {}, { provider: '' }] },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.model.headers, { authorization: 'Bearer resolved' });
  });

  it('returns no judge when both header lookups fail', async () => {
    const model = judge('jev-1.13', 'opencode-zen');
    const result = await resolveOmpJudge({
      settings: { modelRoles: { judge: 'opencode-zen/jev-1.13' } },
      modelRegistry: {
        getProviderModels: () => [model],
        hasConcreteAuth: () => true,
        async getApiKeyAndHeaders() {
          throw new Error('key lookup failed');
        },
        async resolveModelHeaders() {
          throw new Error('header lookup failed');
        },
      },
      models: { list: () => [{ provider: 'opencode-zen' }] },
    });
    assert.deepEqual(result, { ok: false, reason: 'no_judge_model' });
  });

  it('handles missing providers, non-array model lists, and absent helpers', async () => {
    const result = await resolveOmpJudge({
      settings: { modelRoles: { judge: 'opencode-zen/none' } },
      modelRegistry: {
        getProviderModels: () => undefined,
      },
      models: undefined,
    });
    assert.deepEqual(result, { ok: false, reason: 'no_judge_model' });

    const withoutHelpers = await resolveOmpJudge({
      settings: {},
      modelRegistry: {
        getProviderModels: () => [
          { id: 'chat', provider: 'p', kind: 'chat', api: 'typesafe', baseUrl: 'https://p' },
          { id: 'judge', provider: 'p', kind: 'judge', api: 'openai-decisions', baseUrl: 'https://p' },
        ],
      },
      models: { list: () => [{ provider: 'p' }] },
    });
    assert.deepEqual(withoutHelpers, { ok: false, reason: 'no_judge_model' });

    const noHeaders = await resolveOmpJudge({
      settings: { modelRoles: { judge: 'p/judge' } },
      modelRegistry: {
        getProviderModels: () => [{ id: 'judge', provider: 'p', kind: 'judge', api: 'typesafe', baseUrl: 'https://p' }],
        async getApiKeyAndHeaders() {
          return {};
        },
      },
      models: { list: () => [{ provider: 'p' }] },
    });
    assert.deepEqual(noHeaders, { ok: false, reason: 'no_judge_model' });
  });

  it('accepts api-key headers and a throwing header resolver', async () => {
    const apiKeyHeader = await resolveOmpJudge({
      settings: { modelRoles: { judge: 'p/judge' } },
      modelRegistry: {
        getProviderModels: () => [{ id: 'judge', provider: 'p', kind: 'judge', api: 'typesafe', baseUrl: 'https://p' }],
        hasConcreteAuth: () => true,
        async getApiKeyAndHeaders() {
          return { headers: { 'api-key': 'stored' } };
        },
      },
      models: { list: () => [{ provider: 'p' }] },
    });
    assert.equal(apiKeyHeader.ok, true);
    assert.deepEqual(apiKeyHeader.model.headers, { 'api-key': 'stored' });

    const throwingResolver = await resolveOmpJudge({
      settings: { modelRoles: { judge: 'p/judge' } },
      modelRegistry: {
        getProviderModels: () => [{ id: 'judge', provider: 'p', kind: 'judge', api: 'typesafe', baseUrl: 'https://p' }],
        hasConcreteAuth: () => true,
        async resolveModelHeaders() {
          throw new Error('header lookup failed');
        },
      },
      models: { list: () => [{ provider: 'p' }] },
    });
    assert.deepEqual(throwingResolver, { ok: false, reason: 'no_judge_model' });
  });

  it('parses role selectors and ignores aliases or malformed values', () => {
    assert.equal(configuredJudgeSelector({ getModelRoles: () => ({ judge: ' provider/model:high ' }) }), 'provider/model:high');
    assert.equal(configuredJudgeSelector({ modelRoles: { judge: '@slow' } }), '');
    assert.equal(configuredJudgeSelector({}), '');
    assert.equal(configuredJudgeSelector({ modelRoles: { judge: 5 } }), '');
    assert.equal(configuredJudgeSelector({ getModelRoles: () => { throw new Error('x'); } }), '');

    assert.deepEqual(parseModelSelector('provider/model:high'), { provider: 'provider', id: 'model' });
    assert.deepEqual(parseModelSelector('provider/model:xhigh'), { provider: 'provider', id: 'model' });
    assert.deepEqual(parseModelSelector('provider/model:max'), { provider: 'provider', id: 'model' });
    assert.deepEqual(parseModelSelector('provider/model:custom'), { provider: 'provider', id: 'model:custom' });
    assert.equal(parseModelSelector('@slow'), null);
    assert.equal(parseModelSelector('noslash'), null);
    assert.equal(parseModelSelector('provider/'), null);
    assert.equal(parseModelSelector('/model'), null);
    assert.equal(parseModelSelector(''), null);
    assert.equal(parseModelSelector(null), null);
  });
});
