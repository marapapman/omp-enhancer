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
  assert.match(fragment, /Workflow and Gate Briefing/);
  assert.match(fragment, /Routed intent:\s*writing\.zh/);
  assert.match(fragment, /Writing QA gate/);
  assert.match(fragment, /Mandatory Subagent Workflow/);
  assert.match(fragment, /plain-chinese-writing/);
  assert.match(fragment, /zh-writing-polish/);
  assert.match(fragment, /delegates required skill loading to the task subagents/i);
  assert.match(fragment, /Do not read root route skills in the main agent just to unlock task/i);
  assert.match(fragment, /subagent task evidence and SUBAGENT_USAGE/i);
  assert.match(fragment, /MiMo v2\.5/);
  assert.match(fragment, /DeepSeek V4 Flash/);
  assert.match(fragment, /modelRoles\.tiny/);
  assert.match(fragment, /separate classifier role/);
  assert.match(fragment, /route whitelist/);
  assert.match(fragment, /active OMP configuration/);
  assert.match(fragment, /task tool/i);
  assert.match(fragment, /zh-writer:\s*draft Chinese text; skills: plain-chinese-writing, zh-writing-polish/);
  assert.match(fragment, /zh-checker:\s*review Chinese text; skills: plain-chinese-writing, zh-writing-checkers/);
  assert.match(fragment, /include that subagent-specific skill list/i);
  assert.match(fragment, /Pre-fork Subagent Contract/);
  assert.match(fragment, /OMP_REQUIRED_SUBAGENT:\s*zh-writer/);
  assert.match(fragment, /Workflow and gate briefing:/);
  assert.match(fragment, /Parent intent:\s*writing\.zh/);
  assert.match(fragment, /role:\s*zh-writer/);
  assert.match(fragment, /Do not fork another OMP Enhancer Core role gate/);
  assert.match(fragment, /SUBAGENT_RESULT/);
  assert.match(fragment, /SUBAGENT_USAGE/);
  assert.match(fragment, /final assistant answer text/i);
  assert.match(fragment, /successful .*validate_subagent_usage tool call can satisfy the internal subagent gate/i);
  assert.match(fragment, /closing answer should still include the SUBAGENT_USAGE block/i);
  assert.doesNotMatch(fragment, /validator tool calls are preflight only/i);
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

test('governance tells agents not to expose internal classifier and smart-gate prompts', () => {
  const fragment = buildGovernancePromptFragment({
    route: {
      intent: 'implementation-with-tests',
      agent: 'implementer',
      requiredSkills: ['test-driven-development'],
      requiredTools: ['omp_test_gate'],
      requiredSubagents: [],
    },
  });

  assert.match(fragment, /Do not expose internal classifier or smart-gate prompts/i);
  assert.match(fragment, /summarize route and gate status for the user/i);
  assert.match(fragment, /Do not quote JSON Schema/i);
  assert.match(fragment, /Do not quote Tiny model policy/i);
});

test('governance tells MiMo to load skills with read instead of a nonexistent skill tool', () => {
  const fragment = buildGovernancePromptFragment({
    route: {
      intent: 'writing.zh',
      agent: 'writing-helper.zh-writer',
      requiredSkills: ['plain-chinese-writing'],
      requiredTools: [],
      requiredSubagents: [],
    },
  });

  assert.match(fragment, /There is no tool named `skill` in this runtime/i);
  assert.match(fragment, /call the `read` tool/i);
  assert.match(fragment, /Do not print XML or <tool_call> text/i);
  assert.match(fragment, /skill:\/\/plain-chinese-writing/i);
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

test('focused bug audit governance preloads skills without heavy subagent delegation', () => {
  const fragment = buildGovernancePromptFragment({
    route: {
      intent: 'bug-audit',
      agent: 'tester',
      auditMode: 'focused',
      requiredSkills: ['diagnose', 'test-driven-development', 'verification-before-completion', 'search-first'],
      requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_gate', 'omp_test_report'],
      requiredSubagents: [],
    },
  });

  assert.match(fragment, /focused direct bug-audit route/i);
  assert.match(fragment, /preload the focused audit skills/i);
  assert.match(fragment, /Focused Bug Audit Test Generation Contract/);
  assert.match(fragment, /No routed subagents are required/);
  assert.match(fragment, /Required subagents:\n- none/);
  assert.match(fragment, /omp_test_gate/);
  assert.match(fragment, /diagnose/);
  assert.doesNotMatch(fragment, /ecc-tdd-guide generates/);
  assert.doesNotMatch(fragment, /OMP_REQUIRED_SUBAGENT:/);
});

test('fact-check governance advertises plan, independent evidence, cross-check, review, and gate', () => {
  const fragment = buildGovernancePromptFragment({
    route: {
      intent: 'fact-check',
      agent: 'fact-checker',
      requiredSkills: ['fact-checking', 'claim-extraction', 'source-evaluation', 'citation-authenticity'],
      requiredTools: ['fact_check_analyze', 'fact_check_evidence', 'fact_check_report', 'fact_check_gate'],
      requiredSubagents: [
        { agent: 'fact-planner', duty: 'plan claims', requiredSkills: ['fact-checking', 'claim-extraction'], modelRoles: ['pi/plan', 'pi/slow'] },
        { agent: 'fact-researcher-a', duty: 'lane A evidence', requiredSkills: ['fact-checking', 'source-evaluation', 'citation-authenticity'] },
        { agent: 'fact-researcher-b', duty: 'lane B evidence', requiredSkills: ['fact-checking', 'source-evaluation', 'citation-authenticity'] },
        { agent: 'fact-cross-checker', duty: 'compare evidence lanes', requiredSkills: ['fact-checking', 'source-evaluation'], modelRoles: ['pi/slow'] },
        { agent: 'fact-reviewer', duty: 'review final verdicts', requiredSkills: ['fact-checking', 'source-evaluation', 'citation-authenticity'], modelRoles: ['pi/slow'] },
      ],
    },
  });

  assert.match(fragment, /Intent:\s*fact-check/);
  assert.match(fragment, /Fact-check workflow/);
  assert.match(fragment, /independent evidence lanes/);
  assert.match(fragment, /Fact-check gate/);
  assert.match(fragment, /fact_check_gate/);
  assert.match(fragment, /factual verification workflow/);
  assert.match(fragment, /do not rewrite the source document/i);
  assert.match(fragment, /OMP_REQUIRED_SUBAGENT:\s*fact-planner/);
  assert.match(fragment, /OMP_REQUIRED_SUBAGENT:\s*fact-researcher-a/);
  assert.match(fragment, /OMP_REQUIRED_SUBAGENT:\s*fact-researcher-b/);
  assert.match(fragment, /OMP_REQUIRED_SUBAGENT:\s*fact-cross-checker/);
  assert.match(fragment, /OMP_REQUIRED_SUBAGENT:\s*fact-reviewer/);
  assert.match(fragment, /SUBAGENT_USAGE:\n- fact-planner: fact-checking, claim-extraction/);
  assert.match(fragment, /- fact-reviewer: fact-checking, source-evaluation, citation-authenticity/);
  assert.match(fragment, /fact-planner: plan claims; skills: fact-checking, claim-extraction; model roles: pi\/plan, pi\/slow/);
  assert.match(fragment, /OMP_MODEL_ROLE_HINT:\s*pi\/plan -> pi\/slow/);
  assert.match(fragment, /fact-reviewer: review final verdicts; skills: fact-checking, source-evaluation, citation-authenticity; model roles: pi\/slow/);
  assert.match(fragment, /does not expose the native task\/completion tool/i);
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
        { agent: 'implementation-task', duty: 'implement the task', requiredSkills: ['test-driven-development', 'verification-before-completion'] },
        { agent: 'reviewer', duty: 'review the diff', requiredSkills: ['verification-before-completion'] },
      ],
    },
  });

  assert.match(fragment, /Agent route:\s*implementer/);
  assert.match(fragment, /Intent:\s*implementation-with-tests/);
  assert.match(fragment, /Toolchain/);
  assert.match(fragment, /Workflow and Gate Briefing/);
  assert.match(fragment, /Completion gates before final answer/);
  assert.match(fragment, /omp_test_analyze/);
  assert.match(fragment, /omp_test_context/);
  assert.match(fragment, /omp_test_browser_check/);
  assert.match(fragment, /omp_test_coverage_analyze/);
  assert.match(fragment, /omp_test_mutation_context/);
  assert.match(fragment, /omp_test_gate/);
  assert.match(fragment, /omp_test_report/);
  assert.match(fragment, /this is a code\/testing workflow/i);
  assert.match(fragment, /Review-to-Testing Handoff/);
  assert.match(fragment, /semantic review first, deterministic testing second/);
  assert.match(fragment, /Reviewer approval does not close the testing gate/);
  assert.match(fragment, /plan -> implementation-task -> reviewer -> post-review testing checkpoint/);
  assert.match(fragment, /subagent-driven-development/);
  assert.match(fragment, /plan:\s*decompose the task; skills: brainstorming, subagent-driven-development/);
  assert.match(fragment, /implementation-task:\s*implement the task; skills: test-driven-development, verification-before-completion/);
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
