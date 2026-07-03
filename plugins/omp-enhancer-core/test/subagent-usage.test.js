import test from 'node:test';
import assert from 'node:assert/strict';

import { collectSubagentNames, parseSubagentUsage, validateSubagentUsage } from '../src/subagent-usage.js';

test('parses forked subagents from SUBAGENT_USAGE block', () => {
  const forked = parseSubagentUsage([
    'SUBAGENT_USAGE',
    'Required:',
    '- plan',
    '- task',
    '- reviewer',
    'Forked:',
    '- plan',
    '- task',
    '- reviewer',
    '',
    'SKILL_USAGE',
    'Required:',
    '- brainstorming',
  ].join('\n'));

  assert.deepEqual(forked, ['plan', 'task', 'reviewer']);
});

test('validateSubagentUsage reports missing routed roles', () => {
  const validation = validateSubagentUsage({
    requiredSubagents: ['zh-writer', 'zh-checker'],
    output: [
      'SUBAGENT_USAGE',
      'Required:',
      '- zh-writer',
      '- zh-checker',
      'Forked:',
      '- zh-writer',
    ].join('\n'),
  });

  assert.equal(validation.ok, false);
  assert.deepEqual(validation.missing, ['zh-checker']);
});

test('collectSubagentNames reads common task tool argument shapes', () => {
  const agents = collectSubagentNames({
    name: 'task',
    params: {
      tasks: [
        { agent: 'plan', task: 'decompose' },
        { subagent_type: 'reviewer', prompt: 'review' },
      ],
      nested: { subagentType: 'ecc-pr-test-analyzer' },
    },
  });

  assert.deepEqual(agents, ['plan', 'reviewer', 'ecc-pr-test-analyzer']);
});
