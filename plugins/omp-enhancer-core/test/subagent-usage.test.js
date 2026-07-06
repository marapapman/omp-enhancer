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
    '- implementation-task: test-driven-development, verification-before-completion',
    '- reviewer: verification-before-completion',
    'Forked:',
    '- plan: brainstorming, subagent-driven-development',
    '- implementation-task: test-driven-development, verification-before-completion',
    '- reviewer: verification-before-completion',
    '',
    'SKILL_USAGE',
    'Required:',
    '- brainstorming',
  ].join('\n'));

  assert.deepEqual(forked, ['plan', 'implementation-task', 'reviewer']);
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

test('accepts SUBAGENT_USAGE blocks nested inside JSON string output envelopes', () => {
  const validation = validateSubagentUsage({
    requiredSubagents: [
      { agent: 'writer', requiredSkills: ['writing-markdown-helper'] },
      { agent: 'checker', requiredSkills: ['writing-checkers'] },
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
    requiredSubagents: [
      { agent: 'writer', requiredSkills: ['writing-markdown-helper'] },
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

test('collectSubagentTaskRecords prefers OMP_REQUIRED_SUBAGENT over descriptive role text', () => {
  const records = collectSubagentTaskRecords({
    toolName: 'task',
    input: {
      agent: 'task',
      tasks: [
        {
          id: 'BugAuditTests',
          role: 'generate a deduplicated multi-channel test matrix',
          assignment: [
            'OMP_REQUIRED_SUBAGENT: ecc-tdd-guide',
            'Required skills for this subagent:',
            '- test-driven-development',
            '- search-first',
            '- ai-regression-testing',
          ].join('\n'),
        },
      ],
    },
  });

  assert.deepEqual(records, [
    {
      agent: 'ecc-tdd-guide',
      text: [
        'BugAuditTests',
        [
          'OMP_REQUIRED_SUBAGENT: ecc-tdd-guide',
          'Required skills for this subagent:',
          '- test-driven-development',
          '- search-first',
          '- ai-regression-testing',
        ].join('\n'),
      ].join('\n'),
      skills: ['test-driven-development', 'search-first', 'ai-regression-testing'],
    },
  ]);
});

test('collectSubagentTaskRecords reads marker-only task items without role or agent fields', () => {
  const records = collectSubagentTaskRecords({
    toolName: 'task',
    input: {
      agent: 'task',
      tasks: [
        {
          assignment: [
            'OMP_REQUIRED_SUBAGENT: ecc-code-reviewer',
            'Required skills for this subagent:',
            '- verification-before-completion',
          ].join('\n'),
        },
      ],
    },
  });

  assert.deepEqual(records.map(({ agent, skills }) => ({ agent, skills })), [
    { agent: 'ecc-code-reviewer', skills: ['verification-before-completion'] },
  ]);
});

test('collectSubagentTaskRecords ignores prose role values and chat message roles', () => {
  const records = collectSubagentTaskRecords({
    name: 'task',
    details: {
      role: 'assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Running task.' }] },
      tasks: [
        {
          role: 'review generated tests and duplicate removal',
          assignment: 'Required skills for this subagent:\n- verification-before-completion',
        },
      ],
    },
  });

  assert.deepEqual(records, []);
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

test('collectSubagentTaskRecords reads array assignments and keeps parent task evidence', () => {
  const records = collectSubagentTaskRecords({
    toolName: 'task',
    input: {
      tasks: [
        {
          role: 'implementation-task',
          assignment: [
            'OMP_REQUIRED_SUBAGENT: implementation-task',
            'OMP_PARENT_TASK: Fix workflow gate retries.',
            'Required skills for this subagent:',
            '- test-driven-development',
            '- verification-before-completion',
            '',
            'Assignment:',
            'Patch the runtime and add tests.',
          ],
        },
      ],
    },
  });

  assert.deepEqual(records, [
    {
      agent: 'implementation-task',
      text: [
        'OMP_REQUIRED_SUBAGENT: implementation-task',
        'OMP_PARENT_TASK: Fix workflow gate retries.',
        'Required skills for this subagent:',
        '- test-driven-development',
        '- verification-before-completion',
        '',
        'Assignment:',
        'Patch the runtime and add tests.',
      ].join('\n'),
      skills: ['test-driven-development', 'verification-before-completion'],
    },
  ]);
});

test('collectSubagentTaskRecords parses prompt contracts without duplicating mirrored task roots', () => {
  const input = {
    tasks: [
      {
        agent: 'reviewer',
        prompt: [
          'OMP_REQUIRED_SUBAGENT: reviewer',
          'Required skills for this subagent:',
          '- verification-before-completion',
          '',
          'Final subagent output must end with:',
          'SKILL_USAGE',
          'Loaded:',
          '- verification-before-completion',
        ].join('\n'),
      },
    ],
  };

  const records = collectSubagentTaskRecords({
    name: 'task',
    params: input,
    input,
  });

  assert.deepEqual(records.map(({ agent, skills }) => ({ agent, skills })), [
    { agent: 'reviewer', skills: ['verification-before-completion'] },
  ]);
});
