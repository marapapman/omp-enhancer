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

test('accepts common SUBAGENT_USAGE shorthand with colon heading', () => {
  const validation = validateSubagentUsage({
    requiredSubagents: ['writer', 'checker'],
    output: [
      'SUBAGENT_USAGE:',
      '- writer: WriterFinal3 (status: completed)',
      '- checker: CheckerFinal3 (status: completed)',
      '',
      'Work summary: completed.',
    ].join('\n'),
  });

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.forked, ['writer', 'checker']);
});

test('accepts markdown SUBAGENT_USAGE headings without required and forked sections', () => {
  const validation = validateSubagentUsage({
    requiredSubagents: ['zh-writer', 'zh-checker'],
    output: [
      '## SUBAGENT_USAGE',
      '',
      '- zh-writer: RewriteTask1',
      '- zh-checker: CheckerGate',
      '',
      '## Work Summary',
      'Done.',
    ].join('\n'),
  });

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.forked, ['zh-writer', 'zh-checker']);
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

test('validateSubagentUsage accepts equivalent installed skill aliases', () => {
  const validation = validateSubagentUsage({
    requiredSubagents: [
      { agent: 'ecc-security-reviewer', requiredSkills: ['security-review', 'security-scan'] },
      { agent: 'reviewer', requiredSkills: ['security-review'] },
    ],
    output: [
      'SUBAGENT_USAGE',
      'Required:',
      '- ecc-security-reviewer: security-review, security-scan',
      '- reviewer: security-review',
      'Forked:',
      '- ecc-security-reviewer: ecc-security-review, ecc-security-scan',
      '- reviewer: ecc/security-review',
    ].join('\n'),
  });

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.missingSkills, []);
  assert.deepEqual(validation.unexpectedSkills, []);
});

test('validateSubagentUsage reports unexpected per-subagent skills', () => {
  const validation = validateSubagentUsage({
    requiredSubagents: [
      { agent: 'writer', requiredSkills: ['writing-markdown-helper'] },
      { agent: 'checker', requiredSkills: ['writing-checkers'] },
    ],
    output: [
      'SUBAGENT_USAGE',
      'Required:',
      '- writer: writing-markdown-helper',
      '- checker: writing-checkers',
      'Forked:',
      '- writer: writing-markdown-helper, writing-plans',
      '- checker: writing-checkers',
    ].join('\n'),
  });

  assert.equal(validation.ok, false);
  assert.deepEqual(validation.unexpectedSkills, [{ agent: 'writer', skills: ['writing-plans'] }]);
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

test('collectSubagentNames reads task role fields from tool_call input', () => {
  const agents = collectSubagentNames({
    toolName: 'task',
    input: {
      agent: 'task',
      tasks: [
        { id: 'WriterGateFinal', role: 'writer', assignment: 'Required skills for this subagent:\n- writing-markdown-helper' },
        { id: 'CheckerGateFinal', role: 'checker', assignment: 'Required skills for this subagent:\n- writing-checkers' },
      ],
    },
  });

  assert.deepEqual(agents, ['writer', 'checker']);
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
      skills: ['test-driven-development', 'verification-before-completion'],
    },
  ]);
});
