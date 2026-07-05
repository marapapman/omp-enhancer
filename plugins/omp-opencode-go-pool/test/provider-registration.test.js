import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BALANCED_API,
  OPENCODE_GO_PROVIDER,
} from '../src/config.js';
import {
  buildBalancedModelOverlay,
  getOpenCodeGoUpstreamApi,
  registerOpenCodeGoPoolProvider,
} from '../src/provider-registration.js';

test('registers the same provider with the balanced internal api', () => {
  const calls = [];
  registerOpenCodeGoPoolProvider({
    registerProvider: (name, config) => calls.push({ name, config }),
  }, {
    streamSimple: () => {},
    fetchModels: async () => [],
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, OPENCODE_GO_PROVIDER);
  assert.equal(calls[0].config.api, BALANCED_API);
  assert.equal(typeof calls[0].config.streamSimple, 'function');
  assert.equal(calls[0].config.models, undefined);
  assert.equal(calls[0].config.fetchDynamicModels, undefined);
  assert.equal(typeof calls[0].config.oauth.login, 'function');
});

test('model overlay preserves visible fields and changes only runtime api/provider routing', () => {
  const original = {
    id: 'mimo-v2.5',
    name: 'MiMo V2.5',
    api: 'openai-completions',
    provider: OPENCODE_GO_PROVIDER,
    baseUrl: 'https://opencode.ai/zen/go/v1',
    reasoning: true,
    input: ['text', 'image'],
    cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 100,
    maxTokens: 10,
  };

  const overlay = buildBalancedModelOverlay(original);
  assert.equal(overlay.id, original.id);
  assert.equal(overlay.name, original.name);
  assert.equal(overlay.provider, OPENCODE_GO_PROVIDER);
  assert.equal(overlay.api, BALANCED_API);
  assert.equal(getOpenCodeGoUpstreamApi(overlay), 'openai-completions');

  const visibleText = `${overlay.provider}/${overlay.id} ${overlay.name}`;
  assert.doesNotMatch(visibleText, /balanced|pool|usage|cooldown|extra/i);
});
