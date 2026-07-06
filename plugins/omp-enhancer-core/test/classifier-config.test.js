import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  ensureClassifierModelConfig,
  parseClassifierCommand,
  parseModelRolesFromYaml,
  runClassifierCommand,
  upsertYamlClassifierConfig,
  upsertYamlModelRole,
} from '../src/classifier-config.js';

test('parseClassifierCommand treats a bare model as set shorthand', () => {
  assert.deepEqual(parseClassifierCommand('set openai/gpt-5-nano'), {
    action: 'set',
    model: 'openai/gpt-5-nano',
  });
  assert.deepEqual(parseClassifierCommand('opencode-go/deepseek-v4-flash:medium'), {
    action: 'set',
    model: 'opencode-go/deepseek-v4-flash:medium',
  });
  assert.deepEqual(parseClassifierCommand(''), { action: 'status' });
});

test('upsertYamlModelRole inserts classifier near existing model roles', () => {
  const output = upsertYamlModelRole([
    'modelRoles:',
    '  advisor: deepseek/deepseek-v4-flash:xhigh',
    '  default: xiaomi/mimo-v2.5:high',
    'providers:',
    '  webSearch: codex',
    '',
  ].join('\n'));

  assert.match(output, /advisor: deepseek\/deepseek-v4-flash:xhigh\n  classifier: opencode-go\/deepseek-v4-flash:medium\n  default:/);
  assert.deepEqual(parseModelRolesFromYaml(output).classifier, 'opencode-go/deepseek-v4-flash:medium');
});

test('upsertYamlModelRole updates an existing classifier role', () => {
  const output = upsertYamlModelRole([
    'modelRoles:',
    '  classifier: old/model',
    '  default: xiaomi/mimo-v2.5:high',
  ].join('\n'), 'classifier', 'openai/gpt-5-nano');

  assert.match(output, /classifier: openai\/gpt-5-nano/);
  assert.doesNotMatch(output, /old\/model/);
});

test('runClassifierCommand writes modelRoles.classifier to a config file', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'omp-classifier-config-'));
  const configPath = path.join(root, 'config.yml');

  const result = await runClassifierCommand({
    args: 'set openai/gpt-5-nano',
    configPath,
  });
  const text = await readFile(configPath, 'utf8');

  assert.equal(result.ok, true);
  assert.equal(result.model, 'openai/gpt-5-nano');
  assert.match(result.text, /\/classifier set openai\/gpt-5-nano/);
  assert.deepEqual(parseModelRolesFromYaml(text), { classifier: 'openai/gpt-5-nano' });
  assert.match(text, /modelTags:\n  classifier:\n    name: Classifier\n    color: accent\n    hidden: false/);
});

test('ensureClassifierModelConfig makes classifier visible in settings-backed model UI', async () => {
  const roles = {};
  let tags = {};
  let flushCount = 0;
  const settings = {
    get: (key) => (key === 'modelTags' ? tags : key === 'modelRoles' ? roles : undefined),
    set: (key, value) => {
      if (key === 'modelTags') tags = value;
      if (key === 'modelRoles') Object.assign(roles, value);
    },
    setModelRole: (role, model) => { roles[role] = model; },
    getModelRole: (role) => roles[role],
    getModelRoles: () => roles,
    flush: async () => { flushCount += 1; },
  };

  const result = await ensureClassifierModelConfig({ ctx: { settings } });

  assert.equal(result.ok, true);
  assert.equal(result.source, 'settings');
  assert.equal(result.changed, true);
  assert.equal(roles.classifier, 'opencode-go/deepseek-v4-flash:medium');
  assert.deepEqual(tags.classifier, { name: 'Classifier', color: 'accent', hidden: false });
  assert.equal(flushCount, 1);
});

test('ensureClassifierModelConfig preserves an existing classifier model while adding missing visible tag', async () => {
  const roles = { classifier: 'openai/gpt-5-nano' };
  let tags = {};
  const settings = {
    get: (key) => (key === 'modelTags' ? tags : key === 'modelRoles' ? roles : undefined),
    set: (key, value) => {
      if (key === 'modelTags') tags = value;
    },
    setModelRole: (role, model) => { roles[role] = model; },
    getModelRole: (role) => roles[role],
    getModelRoles: () => roles,
    flush: async () => {},
  };

  await ensureClassifierModelConfig({ ctx: { settings } });

  assert.equal(roles.classifier, 'openai/gpt-5-nano');
  assert.deepEqual(tags.classifier, { name: 'Classifier', color: 'accent', hidden: false });
});

test('upsertYamlClassifierConfig adds both classifier role and visible model tag', () => {
  const output = upsertYamlClassifierConfig('providers:\n  webSearch: codex\n');

  assert.match(output, /modelRoles:\n  classifier: opencode-go\/deepseek-v4-flash:medium/);
  assert.match(output, /modelTags:\n  classifier:\n    name: Classifier\n    color: accent\n    hidden: false/);
});
