import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGovernancePromptFragment, buildSubagentPromptFragment } from '../src/governance.js';

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
  assert.match(fragment, /delegates required skill loading to the task subagents/i);
  assert.match(fragment, /Do not read root route skills in the main agent just to unlock task/i);
  assert.match(fragment, /subagent task evidence and SUBAGENT_USAGE/i);
  assert.match(fragment, /MiMo v2\.5/);
  assert.match(fragment, /DeepSeek V4 Flash/);
  assert.match(fragment, /modelRoles\.classifier/);
  assert.match(fragment, /opencode-go\/deepseek-v4-flash:medium/);
  assert.match(fragment, /route whitelist/);
  assert.match(fragment, /active OMP configuration/);
  assert.match(fragment, /task tool/i);
  assert.match(fragment, /zh-writer:\s*draft Chinese text; skills: plain-chinese-writing, zh-writing-polish/);
  assert.match(fragment, /zh-checker:\s*review Chinese text; skills: plain-chinese-writing, zh-writing-checkers/);
  assert.match(fragment, /include that subagent-specific skill list/i);
  assert.match(fragment, /Pre-fork Subagent Contract/);
  assert.match(fragment, /OMP_REQUIRED_SUBAGENT:\s*zh-writer/);
  assert.match(fragment, /role:\s*zh-writer/);
  assert.match(fragment, /Do not fork another OMP Enhancer Core role gate/);
  assert.match(fragment, /SUBAGENT_RESULT/);
  assert.match(fragment, /SUBAGENT_USAGE/);
  assert.match(fragment, /SUBAGENT_USAGE:\n- zh-writer: plain-chinese-writing, zh-writing-polish\n- zh-checker: plain-chinese-writing, zh-writing-checkers/);
  assert.match(fragment, /agent-name: every skill required by that subagent/);
  assert.match(fragment, /SKILL_USAGE/);
  assert.match(fragment, /Required/);
  assert.match(fragment, /Loaded/);
  assert.match(fragment, /Use this exact plain-text block shape/);
  assert.match(fragment, /- skill-name/);
  assert.match(fragment, /this is a writing workflow/i);
  assert.match(fragment, /Do not call omp_test_\* tools/);
  assert.doesNotMatch(fragment, /Toolchain:\n(?:- .+\n)*- omp_test_gate/);
});

test('builds a lightweight subagent contract without root workflow gates', () => {
  const fragment = buildSubagentPromptFragment({
    prompt: [
      'OMP_REQUIRED_SUBAGENT: writer',
      'Required skills for this subagent:',
      '- writing-markdown-helper',
      '',
      'Assignment: revise the section.',
    ].join('\n'),
  });

  assert.match(fragment, /OMP Enhancer Core Subagent Contract/);
  assert.match(fragment, /Subagent:\s*writer/);
  assert.match(fragment, /writing-markdown-helper/);
  assert.match(fragment, /not a root routed workflow/);
  assert.match(fragment, /Do not start another OMP Enhancer Core role-gate cycle/);
  assert.match(fragment, /SUBAGENT_RESULT/);
  assert.doesNotMatch(fragment, /Mandatory Subagent Workflow/);
  assert.doesNotMatch(fragment, /Required subagents:/);
});

test('prefers installed skill aliases in subagent read instructions', () => {
  const fragment = buildGovernancePromptFragment({
    route: {
      intent: 'security-review',
      agent: 'ecc-security-reviewer',
      requiredSkills: ['security-review', 'security-scan'],
      requiredTools: [],
      requiredSubagents: [
        {
          agent: 'ecc-security-reviewer',
          duty: 'audit security risks',
          requiredSkills: ['security-review', 'security-scan'],
        },
      ],
    },
  });

  assert.match(fragment, /Required skills for this subagent:\n- security-review\n- security-scan/);
  assert.match(fragment, /Read `skill:\/\/ecc-security-review` \(accepted alias for security-review\)/);
  assert.match(fragment, /Read `skill:\/\/ecc-security-scan` \(accepted alias for security-scan\)/);
  assert.match(fragment, /SUBAGENT_USAGE:\n- ecc-security-reviewer: security-review, security-scan/);
});

test('subagent contracts accept installed aliases while preserving canonical Required names', () => {
  const fragment = buildSubagentPromptFragment({
    prompt: [
      'OMP_REQUIRED_SUBAGENT: ecc-security-reviewer',
      'Required skills for this subagent:',
      '- security-review',
      '- security-scan',
    ].join('\n'),
  });

  assert.match(fragment, /Required:\n- security-review\n- security-scan/);
  assert.match(fragment, /Read `skill:\/\/ecc-security-review` \(accepted alias for security-review\)/);
  assert.match(fragment, /Read `skill:\/\/ecc-security-scan` \(accepted alias for security-scan\)/);
  assert.match(fragment, /aliases equivalent to the Required entries are accepted/);
});

test('names the selected agent route and toolchain in the governance fragment', () => {
  const fragment = buildGovernancePromptFragment({
    route: {
      intent: 'implementation-with-tests',
      agent: 'implementer',
      requiredSkills: ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
      requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_browser_check', 'omp_test_coverage_analyze', 'omp_test_mutation_context', 'omp_test_gate', 'omp_test_report'],
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
  assert.match(fragment, /omp_test_browser_check/);
  assert.match(fragment, /omp_test_coverage_analyze/);
  assert.match(fragment, /omp_test_mutation_context/);
  assert.match(fragment, /omp_test_gate/);
  assert.match(fragment, /omp_test_report/);
  assert.match(fragment, /this is a code\/testing workflow/i);
  assert.match(fragment, /subagent-driven-development/);
  assert.match(fragment, /plan:\s*decompose the task; skills: brainstorming, subagent-driven-development/);
  assert.match(fragment, /task:\s*implement the task; skills: test-driven-development, verification-before-completion/);
  assert.match(fragment, /reviewer:\s*review the diff; skills: verification-before-completion/);
});

test('keeps routing governance independent from slash commands', () => {
  const fragment = buildGovernancePromptFragment({
    route: {
      intent: 'bug-audit',
      agent: 'tester',
      requiredSkills: ['diagnose', 'test-driven-development'],
      requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_gate'],
      requiredSubagents: [
        {
          agent: 'ecc-tdd-guide',
          duty: 'generate audit tests',
          requiredSkills: ['test-driven-development', 'search-first', 'ai-regression-testing'],
        },
        { agent: 'ecc-code-reviewer', duty: 'review bugs', requiredSkills: ['verification-before-completion'] },
      ],
    },
  });

  assert.doesNotMatch(fragment, /(^|\s)\/test(\s|$)/);
  assert.doesNotMatch(fragment, /slash command/i);
  assert.match(fragment, /natural language/i);
  assert.match(fragment, /Bug Audit Test Generation Contract/);
  assert.match(fragment, /Static analysis alone is not sufficient/);
  assert.match(fragment, /Local code summary/);
  assert.match(fragment, /External or knowledge evidence/);
  assert.match(fragment, /Model-derived adversarial cases/);
  assert.match(fragment, /Deduplicate by behavior signature/);
  assert.match(fragment, /generated, executed, skipped, and duplicate-removed/);
  assert.match(fragment, /search-first/);
  assert.match(fragment, /ai-regression-testing/);
});
