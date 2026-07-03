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
    },
  });

  assert.match(fragment, /Mandatory Skill Workflow/);
  assert.match(fragment, /plain-chinese-writing/);
  assert.match(fragment, /zh-writing-polish/);
  assert.match(fragment, /load each required skill/i);
  assert.match(fragment, /SKILL_USAGE/);
  assert.match(fragment, /Required/);
  assert.match(fragment, /Loaded/);
});

test('names the selected agent route and toolchain in the governance fragment', () => {
  const fragment = buildGovernancePromptFragment({
    route: {
      intent: 'implementation-with-tests',
      agent: 'implementer',
      requiredSkills: ['brainstorming', 'test-driven-development', 'verification-before-completion'],
      requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_gate', 'omp_test_report'],
    },
  });

  assert.match(fragment, /Agent route:\s*implementer/);
  assert.match(fragment, /Intent:\s*implementation-with-tests/);
  assert.match(fragment, /Toolchain/);
  assert.match(fragment, /omp_test_analyze/);
  assert.match(fragment, /omp_test_context/);
  assert.match(fragment, /omp_test_gate/);
  assert.match(fragment, /omp_test_report/);
});

test('keeps routing governance independent from slash commands', () => {
  const fragment = buildGovernancePromptFragment({
    route: {
      intent: 'testing',
      agent: 'tester',
      requiredSkills: ['test-driven-development'],
      requiredTools: ['omp_test_gate'],
    },
  });

  assert.doesNotMatch(fragment, /\/test\b/);
  assert.doesNotMatch(fragment, /slash command/i);
  assert.match(fragment, /natural language/i);
});
