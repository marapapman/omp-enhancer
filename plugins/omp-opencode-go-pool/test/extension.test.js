import assert from 'node:assert/strict';
import test from 'node:test';

import registerOpenCodeGoPool from '../index.js';

test('extension registers provider and only the requested slash commands', () => {
  const commands = [];
  const tools = [];
  const providers = [];
  registerOpenCodeGoPool({
    setLabel: () => {},
    registerCommand: (name, config) => commands.push({ name, config }),
    registerTool: tool => tools.push(tool),
    registerProvider: (name, config) => providers.push({ name, config }),
    zod: { z: { object: () => ({}) } },
  });

  assert.deepEqual(commands.map(command => command.name).sort(), [
    'opencode_go_pool_key',
    'opencode_go_pool_status',
  ]);
  assert.deepEqual(tools.map(tool => tool.name), ['opencode_go_pool_status']);
  assert.equal(providers.length, 1);
  assert.equal(providers[0].name, 'opencode-go');
  assert.equal(providers[0].config.api, 'opencode-go-balanced');
  assert.equal(providers[0].config.models, undefined);
});

test('before_agent_start overlays the selected OpenCode Go model without changing visible fields', async () => {
  let beforeAgentStart;
  let selectedModel;
  const original = {
    id: 'hy3-preview',
    name: 'Hy3 Preview',
    provider: 'opencode-go',
    api: 'openai-completions',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    contextWindow: null,
    maxTokens: null,
    reasoning: false,
    input: ['text'],
    cost: { input: 0.063, output: 0.21, cacheRead: 0.021, cacheWrite: 0 },
  };

  registerOpenCodeGoPool({
    setLabel: () => {},
    registerCommand: () => {},
    registerTool: () => {},
    registerProvider: () => {},
    on: (event, handler) => {
      if (event === 'before_agent_start') beforeAgentStart = handler;
    },
    setModel: async model => {
      selectedModel = model;
      return true;
    },
    zod: { z: { object: () => ({}) } },
  });

  await beforeAgentStart({}, { model: original });

  assert.equal(selectedModel.id, original.id);
  assert.equal(selectedModel.name, original.name);
  assert.equal(selectedModel.provider, original.provider);
  assert.equal(selectedModel.api, 'opencode-go-balanced');
  assert.equal(selectedModel.contextWindow, null);
  assert.equal(selectedModel.maxTokens, null);
  assert.equal(selectedModel.reasoning, false);
  assert.equal(selectedModel.thinking, undefined);
});

test('status command includes primary key metadata without leaking the key', async () => {
  const commands = new Map();
  const notifications = [];
  const rawPrimary = 'sk-primary-secret-value-1234567890';
  registerOpenCodeGoPool({
    setLabel: () => {},
    registerCommand: (name, config) => commands.set(name, config),
    registerTool: () => {},
    registerProvider: () => {},
    zod: { z: { object: () => ({}) } },
  });

  const result = await commands.get('opencode_go_pool_status').handler('', {
    modelRegistry: {
      getApiKeyForProvider: async provider => (provider === 'opencode-go' ? rawPrimary : undefined),
    },
    ui: {
      notify: async (text, type) => notifications.push({ text, type }),
    },
  });

  assert.match(result.text, /primary/);
  assert.doesNotMatch(result.text, new RegExp(rawPrimary));
  assert.deepEqual(notifications, [{ text: result.text, type: 'info' }]);
});

test('key command notifies validation failures without exposing pasted key text', async () => {
  const commands = new Map();
  const notifications = [];
  const pastedKey = 'sk-extra-secret-value-1234567890';
  registerOpenCodeGoPool({
    setLabel: () => {},
    registerCommand: (name, config) => commands.set(name, config),
    registerTool: () => {},
    registerProvider: () => {},
    zod: { z: { object: () => ({}) } },
  });

  const result = await commands.get('opencode_go_pool_key').handler(pastedKey, {
    ui: {
      notify: async (text, type) => notifications.push({ text, type }),
    },
  });

  assert.equal(result.ok, false);
  assert.doesNotMatch(result.text, new RegExp(pastedKey));
  assert.deepEqual(notifications, [{ text: result.text, type: 'error' }]);
});

test('status command tolerates primary key resolver certificate failures', async () => {
  const commands = new Map();
  const notifications = [];
  registerOpenCodeGoPool({
    setLabel: () => {},
    registerCommand: (name, config) => commands.set(name, config),
    registerTool: () => {},
    registerProvider: () => {},
    zod: { z: { object: () => ({}) } },
  });

  const result = await commands.get('opencode_go_pool_status').handler('', {
    modelRegistry: {
      getApiKeyForProvider: async () => {
        throw new Error('unknown certificate verification error');
      },
    },
    ui: {
      notify: async (text, type) => notifications.push({ text, type }),
    },
  });

  assert.match(result.text, /OpenCode Go key pool status/);
  assert.deepEqual(notifications, [{ text: result.text, type: 'info' }]);
});
