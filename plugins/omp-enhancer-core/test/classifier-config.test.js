import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  parseClassifierCommand,
  parseModelRolesFromYaml,
  runClassifierCommand,
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
});
