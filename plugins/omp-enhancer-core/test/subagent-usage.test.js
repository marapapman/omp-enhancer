import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectSubagentNames,
  collectSubagentTaskRecords,
  parseSubagentUsage,
  parseSubagentUsageDetails,
  validateSubagentUsage,
} from '../src/subagent-usage.js';

test('parses forked subagents from SUBAGENT_USAGE block', () => {
  const forked = parseSubagentUsage([
    'SUBAGENT_USAGE',
    'Required:',
    '- plan: brainstorming, subagent-driven-development',
    '- task: test-driven-development, verification-before-completion',
    '- reviewer: verification-before-completion',
    'Forked:',
    '- plan: brainstorming, subagent-driven-development',
    '- task: test-driven-development, verification-before-completion',
    '- reviewer: verification-before-completion',
    '',
    'SKILL_USAGE',
    'Required:',
    '- brainstorming',
  ].join('\n'));

  assert.deepEqual(forked, ['plan', 'task', 'reviewer']);
  assert.deepEqual(parseSubagentUsageDetails([
    'SUBAGENT_USAGE',
    'Required:',
    '- plan: brainstorming, subagent-driven-development',
    'Forked:',
    '- plan: brainstorming, subagent-driven-development',
  ].join('\n')), [{ agent: 'plan', skills: ['brainstorming', 'subagent-driven-development'] }]);
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

test('validateSubagentUsage reports missing per-subagent skills', () => {
  const validation = validateSubagentUsage({
    requiredSubagents: [
      { agent: 'zh-writer', requiredSkills: ['plain-chinese-writing', 'zh-writing-polish'] },
      { agent: 'zh-checker', requiredSkills: ['plain-chinese-writing', 'zh-writing-checkers'] },
    ],
    output: [
      'SUBAGENT_USAGE',
      'Required:',
      '- zh-writer: plain-chinese-writing, zh-writing-polish',
      '- zh-checker: plain-chinese-writing, zh-writing-checkers',
      'Forked:',
      '- zh-writer: plain-chinese-writing',
      '- zh-checker: plain-chinese-writing, zh-writing-checkers',
    ].join('\n'),
  });

  assert.equal(validation.ok, false);
  assert.deepEqual(validation.missingSkills, [{ agent: 'zh-writer', skills: ['zh-writing-polish'] }]);
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

test('collectSubagentTaskRecords includes prompt text for skill evidence', () => {
  const records = collectSubagentTaskRecords({
    name: 'task',
    params: {
      tasks: [
        {
          agent: 'task',
          prompt: [
            'Required skills for this subagent:',
            '- test-driven-development',
            '- verification-before-completion',
          ].join('\n'),
        },
      ],
    },
  });

  assert.deepEqual(records, [
    {
      agent: 'task',
      text: [
        'Required skills for this subagent:',
        '- test-driven-development',
        '- verification-before-completion',
      ].join('\n'),
    },
  ]);
});
