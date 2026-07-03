import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGovernancePromptFragment } from '../src/governance.js';

test('builds a Mandatory Skill Workflow fragment with required and loaded skill accounting', () => {
  const fragment = buildGovernancePromptFragment({
    route: {
      intent: 'writing.zh',
      agent: 'writing-helper.zh-writer',
      requiredSkills: ['plain-chinese-writing', 'zh-writing-polish'],
      requiredTools: ['writing_logic_check', 'writing_quality_check'],
      requiredSubagents: [
        { agent: 'zh-writer', duty: 'draft Chinese text' },
        { agent: 'zh-checker', duty: 'review Chinese text' },
      ],
    },
  });

  assert.match(fragment, /Mandatory Skill Workflow/);
  assert.match(fragment, /Mandatory Subagent Workflow/);
  assert.match(fragment, /plain-chinese-writing/);
  assert.match(fragment, /zh-writing-polish/);
  assert.match(fragment, /read tool once for each required skill/i);
  assert.match(fragment, /skill:\/\/<skill-name>/);
  assert.match(fragment, /MiMo v2\.5/);
  assert.match(fragment, /DeepSeek V4 Flash/);
  assert.match(fragment, /active OMP configuration/);
  assert.match(fragment, /task tool/i);
  assert.match(fragment, /zh-writer:\s*draft Chinese text/);
  assert.match(fragment, /zh-checker:\s*review Chinese text/);
  assert.match(fragment, /SUBAGENT_USAGE/);
  assert.match(fragment, /SKILL_USAGE/);
  assert.match(fragment, /Required/);
  assert.match(fragment, /Loaded/);
  assert.match(fragment, /Use this exact plain-text block shape/);
  assert.match(fragment, /- skill-name/);
});

test('names the selected agent route and toolchain in the governance fragment', () => {
  const fragment = buildGovernancePromptFragment({
    route: {
      intent: 'implementation-with-tests',
      agent: 'implementer',
      requiredSkills: ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
      requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_gate', 'omp_test_report'],
      requiredSubagents: [
        { agent: 'plan', duty: 'decompose the task' },
        { agent: 'task', duty: 'implement the task' },
        { agent: 'reviewer', duty: 'review the diff' },
      ],
    },
  });

  assert.match(fragment, /Agent route:\s*implementer/);
  assert.match(fragment, /Intent:\s*implementation-with-tests/);
  assert.match(fragment, /Toolchain/);
  assert.match(fragment, /omp_test_analyze/);
  assert.match(fragment, /omp_test_context/);
  assert.match(fragment, /omp_test_gate/);
  assert.match(fragment, /omp_test_report/);
  assert.match(fragment, /subagent-driven-development/);
  assert.match(fragment, /plan:\s*decompose the task/);
  assert.match(fragment, /task:\s*implement the task/);
  assert.match(fragment, /reviewer:\s*review the diff/);
});

test('keeps routing governance independent from slash commands', () => {
  const fragment = buildGovernancePromptFragment({
    route: {
      intent: 'testing',
      agent: 'tester',
      requiredSkills: ['test-driven-development'],
      requiredTools: ['omp_test_gate'],
      requiredSubagents: [{ agent: 'ecc-tdd-guide', duty: 'drive TDD' }],
    },
  });

  assert.doesNotMatch(fragment, /\/test\b/);
  assert.doesNotMatch(fragment, /slash command/i);
  assert.match(fragment, /natural language/i);
});
