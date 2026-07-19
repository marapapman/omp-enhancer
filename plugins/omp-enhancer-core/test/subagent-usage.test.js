import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseSubagentUsageDetails,
  validateSubagentUsage,
} from '../src/subagent-usage.js';

test('parses forked subagents from SUBAGENT_USAGE block', () => {
  const forked = parseSubagentUsageDetails([
    'SUBAGENT_USAGE',
    'Required:',
    '- plan: code-development',
    '- task: code-development',
    '- reviewer: code-development',
    'Forked:',
    '- plan: code-development',
    '- task: code-development',
    '- reviewer: code-development',
    '',
    'SKILL_USAGE',
    'Required:',
    '- code-development',
  ].join('\n')).map(({ agent }) => agent);

  assert.deepEqual(forked, ['plan', 'task', 'reviewer']);
  assert.deepEqual(parseSubagentUsageDetails([
    'SUBAGENT_USAGE',
    'Required:',
    '- plan: code-development',
    'Forked:',
    '- plan: code-development',
  ].join('\n')), [{ agent: 'plan', skills: ['code-development'] }]);
});

test('accepts common SUBAGENT_USAGE shorthand with colon heading', () => {
  const validation = validateSubagentUsage({
    suggestedAgents: ['writer', 'checker'],
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
    suggestedAgents: ['zh-writer', 'zh-checker'],
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

test('accepts SUBAGENT_USAGE blocks nested inside JSON string output envelopes', () => {
  const validation = validateSubagentUsage({
    suggestedAgents: [
      { agent: 'writer', suggestedSkills: ['writing-markdown-helper'] },
      { agent: 'checker', suggestedSkills: ['writing-checkers'] },
    ],
    output: JSON.stringify({
      status: 'complete',
      result: {
        output: [
          'Done.',
          '',
          'SUBAGENT_USAGE:',
          '- writer: writing-markdown-helper',
          '- checker: writing-checkers',
        ].join('\n'),
      },
    }),
  });

  assert.equal(validation.ok, true);
  assert.deepEqual(validation.forked, ['writer', 'checker']);
});

test('does not accept SUBAGENT_USAGE examples nested only in assignment JSON fields', () => {
  const validation = validateSubagentUsage({
    suggestedAgents: [
      { agent: 'writer', suggestedSkills: ['writing-markdown-helper'] },
    ],
    output: JSON.stringify({
      assignment: [
        'Final output must include:',
        'SUBAGENT_USAGE:',
        '- writer: writing-markdown-helper',
      ].join('\n'),
    }),
  });

  assert.equal(validation.ok, false);
  assert.deepEqual(validation.forked, []);
  assert.deepEqual(validation.missing, ['writer']);
});

test('validateSubagentUsage reports unobserved suggested Agents', () => {
  const validation = validateSubagentUsage({
    suggestedAgents: ['zh-writer', 'zh-checker'],
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
    suggestedAgents: [
      { agent: 'zh-writer', suggestedSkills: ['plain-chinese-writing', 'zh-writing-polish'] },
      { agent: 'zh-checker', suggestedSkills: ['plain-chinese-writing', 'zh-writing-checkers'] },
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
    suggestedAgents: [
      { agent: 'ecc-security-reviewer', suggestedSkills: ['security-review', 'security-scan'] },
      { agent: 'reviewer', suggestedSkills: ['security-review'] },
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
    suggestedAgents: [
      { agent: 'writer', suggestedSkills: ['writing-markdown-helper'] },
      { agent: 'checker', suggestedSkills: ['writing-checkers'] },
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
