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
        { agent: 'zh-writer', duty: 'draft Chinese text', requiredSkills: ['plain-chinese-writing', 'zh-writing-polish'] },
        { agent: 'zh-checker', duty: 'review Chinese text', requiredSkills: ['plain-chinese-writing', 'zh-writing-checkers'] },
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
  assert.match(fragment, /zh-writer:\s*draft Chinese text; skills: plain-chinese-writing, zh-writing-polish/);
  assert.match(fragment, /zh-checker:\s*review Chinese text; skills: plain-chinese-writing, zh-writing-checkers/);
  assert.match(fragment, /include that subagent-specific skill list/i);
  assert.match(fragment, /SUBAGENT_USAGE/);
  assert.match(fragment, /agent-name: every skill required by that subagent/);
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
        { agent: 'plan', duty: 'decompose the task', requiredSkills: ['brainstorming', 'subagent-driven-development'] },
        { agent: 'task', duty: 'implement the task', requiredSkills: ['test-driven-development', 'verification-before-completion'] },
        { agent: 'reviewer', duty: 'review the diff', requiredSkills: ['verification-before-completion'] },
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
  assert.match(fragment, /plan:\s*decompose the task; skills: brainstorming, subagent-driven-development/);
  assert.match(fragment, /task:\s*implement the task; skills: test-driven-development, verification-before-completion/);
  assert.match(fragment, /reviewer:\s*review the diff; skills: verification-before-completion/);
});

test('keeps routing governance independent from slash commands', () => {
  const fragment = buildGovernancePromptFragment({
    route: {
      intent: 'testing',
      agent: 'tester',
      requiredSkills: ['test-driven-development'],
      requiredTools: ['omp_test_gate'],
      requiredSubagents: [{ agent: 'ecc-tdd-guide', duty: 'drive TDD', requiredSkills: ['test-driven-development'] }],
    },
  });

  assert.doesNotMatch(fragment, /\/test\b/);
  assert.doesNotMatch(fragment, /slash command/i);
  assert.match(fragment, /natural language/i);
});
