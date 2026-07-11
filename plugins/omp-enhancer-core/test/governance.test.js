import test from 'node:test';
import assert from 'node:assert/strict';

import { buildGovernancePromptFragment, buildMissingGateContexts, buildSubagentPromptFragment } from '../src/governance.js';
import { routeNaturalLanguageTask } from '../src/router.js';

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
  assert.doesNotMatch(fragment, /MiMo v2\.5/);
  assert.doesNotMatch(fragment, /DeepSeek V4 Flash/);
  assert.match(fragment, /active OMP configuration/);
  assert.match(fragment, /without binding the prompt to a specific model name/);
  assert.match(fragment, /modelRoles\.tiny/);
  assert.match(fragment, /separate classifier role/);
  assert.match(fragment, /route whitelist/);
  assert.match(fragment, /active OMP configuration/);
  assert.match(fragment, /task tool/i);
  assert.match(fragment, /zh-writer:\s*draft Chinese text; skills: plain-chinese-writing, zh-writing-polish/);
  assert.match(fragment, /zh-checker:\s*review Chinese text; skills: plain-chinese-writing, zh-writing-checkers/);
  assert.match(fragment, /include that subagent-specific skill list/i);
  assert.match(fragment, /`agent:\/\/` names completed subagent outputs, not callable agent types/i);
  assert.match(fragment, /Use the task tool to launch required agent types/i);
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

test('governance tells main agent to apply and reconcile advisor guidance', () => {
  const fragment = buildGovernancePromptFragment({
    route: {
      intent: 'implementation-with-tests',
      agent: 'implementer',
      requiredSkills: ['test-driven-development'],
      requiredTools: ['omp_test_gate'],
      requiredSubagents: [],
    },
  });

  assert.match(fragment, /Advisor Guidance Policy/);
  assert.match(fragment, /serious weight/i);
  assert.match(fragment, /If empirical evidence contradicts advisor guidance/i);
  assert.match(fragment, /do not silently ignore/i);
  assert.match(fragment, /without binding the prompt to a specific advisor model/i);
  assert.doesNotMatch(fragment, /DeepSeek V4 Flash/);
});

test('unknown route still carries advisor guidance without workflow gates', () => {
  const fragment = buildGovernancePromptFragment({
    route: {
      intent: 'unknown',
      agent: null,
      requiredSkills: [],
      requiredTools: [],
      requiredSubagents: [],
    },
  });

  assert.match(fragment, /Intent:\s*unknown/);
  assert.match(fragment, /Advisor Guidance Policy/);
  assert.match(fragment, /specific advisor model/i);
  assert.doesNotMatch(fragment, /Mandatory Skill Workflow/);
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

test('focused fact-preserving document polish warns that keeping only a number is not preservation', () => {
  const parentTask = '润色 docs/notes.md 的标题和英文句子，但保持事实 42 不变。只修改 docs/notes.md；禁止运行测试、联网、启动 subagent、提交或发布。';
  const route = routeNaturalLanguageTask({ prompt: parentTask, routerMode: 'enforce' });
  const fragment = buildGovernancePromptFragment({ route, parentTask });

  assert.match(fragment, /Document preservation constraint/i);
  assert.match(fragment, /Preserve the full claim.*subject.*predicate.*exact values.*polarity.*quantifiers.*range.*modality/is);
  assert.match(fragment, /Keeping only the same number does not preserve the fact/i);
  assert.match(fragment, /Before any direct or subagent mutation.*read.*complete authorized document/is);
  assert.match(fragment, /parent agent.*read.*complete authorized document once/is);
  assert.match(fragment, /smallest equivalent rephrase/i);

  const ordinaryTask = '润色 docs/notes.md 的标题和英文句子。只修改 docs/notes.md；禁止运行测试、联网、启动 subagent、提交或发布。';
  const ordinary = buildGovernancePromptFragment({
    route: routeNaturalLanguageTask({ prompt: ordinaryTask, routerMode: 'enforce' }),
    parentTask: ordinaryTask,
  });
  assert.doesNotMatch(ordinary, /Document preservation constraint/i);
});

test('broad document preservation receives the same baseline guidance and multi-target work is split', () => {
  const broadTask = '全面润色 docs/thesis.md 的全部章节，保持所有事实、数据和引用不变。只修改 docs/thesis.md，不联网。';
  const broadRoute = routeNaturalLanguageTask({ prompt: broadTask, routerMode: 'enforce' });
  assert.equal(broadRoute.taskDescriptor.complexity, 'broad');
  const broad = buildGovernancePromptFragment({ route: broadRoute, parentTask: broadTask });
  assert.match(broad, /Document preservation constraint/i);
  assert.match(broad, /Before any direct or subagent mutation.*complete authorized document/is);
  assert.match(broad, /After the final direct edit and after all subagent work/is);

  const multiTask = '润色 docs/a.md、docs/b.md，保持事实不变，只修改 docs/a.md、docs/b.md。';
  const multiRoute = routeNaturalLanguageTask({ prompt: multiTask, routerMode: 'enforce' });
  const multi = buildGovernancePromptFragment({ route: multiRoute, parentTask: multiTask });
  assert.match(multi, /multiple document targets/i);
  assert.match(multi, /split.*one exact document per task/i);
  assert.match(multi, /Do not.*delegate a writing subagent/is);
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
  assert.match(fragment, /preload only the listed focused audit skills/i);
  assert.match(fragment, /Focused Bug Audit Test Generation Contract/);
  assert.match(fragment, /No routed subagents are required/);
  assert.match(fragment, /Required subagents:\n- none/);
  assert.match(fragment, /omp_test_gate/);
  assert.match(fragment, /diagnose/);
  assert.doesNotMatch(fragment, /ecc-tdd-guide generates/);
  assert.doesNotMatch(fragment, /OMP_REQUIRED_SUBAGENT:/);
});

test('focused read-only review governance never asks the model to repair forbidden test evidence', () => {
  for (const routerMode of ['observe', 'enforce']) {
    const route = routeNaturalLanguageTask({
      prompt: '只读审查 src/router.js。禁止修改任何文件，禁止运行测试，禁止联网，禁止启动 subagent，禁止提交或发布。仅使用读取类工具，最后报告发现。',
      routerMode,
    });
    const fragment = buildGovernancePromptFragment({ route });

    assert.equal(route.taskDescriptor.constraints.testExecution, 'forbidden', routerMode);
    assert.match(fragment, /Intent:\s*code\.review/i, routerMode);
    assert.match(fragment, /Agent route:\s*none/i, routerMode);
    assert.match(fragment, /read-only code review/i, routerMode);
    assert.match(fragment, /test execution is forbidden/i, routerMode);
    assert.doesNotMatch(fragment, /Focused Bug Audit Test Generation Contract/, routerMode);
    assert.doesNotMatch(fragment, /generate and run .*test matrix/i, routerMode);
    assert.doesNotMatch(fragment, /command invocations are allowed/i, routerMode);
    assert.doesNotMatch(fragment, /omp_test_/i, routerMode);
  }
});

test('focused no-test modification governance keeps the edit target without suggesting test methods', () => {
  const route = routeNaturalLanguageTask({
    prompt: '修复 src/parser.js 中 parse 函数，只做最小修改。禁止修改任何其他文件，禁止运行测试，禁止联网，禁止启动 subagent，禁止提交或发布。',
    routerMode: 'enforce',
  });
  const fragment = buildGovernancePromptFragment({ route });

  assert.equal(route.taskDescriptor.operation, 'modify');
  assert.match(fragment, /Intent:\s*code\.dev/i);
  assert.match(fragment, /Agent route:\s*none/i);
  assert.match(fragment, /Edit only src\/parser\.js/i);
  assert.match(fragment, /test execution.*forbidden/i);
  assert.match(fragment, /REVIEW_EVIDENCE.*Scope.*Findings.*OpenBlockers.*Verdict:\s*PASS/is);
  assert.doesNotMatch(fragment, /post-review testing|test generation contract|omp_test_|run .*tests?/i);
});

test('no-test modification governance preserves unspecified capabilities and broad security actors', () => {
  const focused = buildGovernancePromptFragment({
    route: routeNaturalLanguageTask({
      prompt: 'Fix src/parser.js but do not run tests.',
      routerMode: 'enforce',
    }),
  });
  assert.doesNotMatch(focused, /network access, subagents.*forbidden/i);
  assert.doesNotMatch(focused, /post-review testing|test generation contract|omp_test_|run .*tests?/i);

  const security = buildGovernancePromptFragment({
    route: routeNaturalLanguageTask({
      prompt: '修复 src/auth.js 的安全漏洞，但禁止运行测试。',
      routerMode: 'enforce',
    }),
  });
  assert.match(security, /Intent:\s*security-review/i);
  assert.match(security, /ecc-security-reviewer/i);
  assert.match(security, /implementation-task/i);
  assert.match(security, /reviewer/i);
  assert.doesNotMatch(security, /focused code modification|subagents.*forbidden|network access.*forbidden/i);
  assert.doesNotMatch(security, /post-review testing|test generation contract|omp_test_|run .*tests?/i);
});

test('a no-test modification with release authority keeps release and verification guidance', () => {
  const fragment = buildGovernancePromptFragment({
    route: routeNaturalLanguageTask({
      prompt: '修复 src/parser.js，禁止运行测试，然后提交并发布插件。',
      routerMode: 'enforce',
    }),
  });
  assert.match(fragment, /Intent:\s*release/i);
  assert.match(fragment, /Release gate/i);
  assert.match(fragment, /authorized release/i);
  assert.match(fragment, /independent(?:ly)? verif/i);
  assert.match(fragment, /test execution.*forbidden/i);
  assert.doesNotMatch(fragment, /post-review testing|test generation contract|omp_test_|run .*tests?/i);
});

test('an exact test file is presented as bounded testing rather than a bug audit', () => {
  const route = routeNaturalLanguageTask({
    prompt: '只运行 test/router.test.js 并报告结果。禁止修改文件、联网、启动 subagent 或发布。',
    routerMode: 'enforce',
  });
  const fragment = buildGovernancePromptFragment({ route });
  const repair = buildMissingGateContexts({
    route,
    state: { evidence: {} },
  });
  assert.match(fragment, /Intent:\s*testing/i);
  assert.match(fragment, /Agent route:\s*none/i);
  assert.match(fragment, /test\/router\.test\.js/i);
  assert.match(fragment, /configuration with (?:the )?read tool/i);
  assert.match(fragment, /one direct (?:host )?test command/i);
  assert.match(fragment, /successful matching host result closes this exact-test evidence directly/i);
  assert.match(fragment, /do not call omp_test_gate or omp_core_subagent_status/i);
  assert.doesNotMatch(fragment, /bug audit|test generation contract|test matrix|omp_test_analyze|omp_test_context/i);
  assert.match(repair[0]?.context ?? '', /exact-test evidence.*one direct host command/is);
  assert.doesNotMatch(repair[0]?.context ?? '', /bug audit|omp_test_analyze|omp_test_context/i);
});

test('a constrained read-only security review gets one satisfiable evidence contract', () => {
  const fragment = buildGovernancePromptFragment({
    route: routeNaturalLanguageTask({
      prompt: '只读审查 src/router.js 是否存在安全问题。禁止修改任何文件，禁止运行测试，禁止联网，禁止启动 subagent，禁止提交或发布。只报告有代码证据支持的结论。',
      routerMode: 'enforce',
    }),
  });
  assert.match(fragment, /Intent:\s*security-review/i);
  assert.match(fragment, /Agent route:\s*none/i);
  assert.match(fragment, /read skill:\/\/security-review.*skill:\/\/security-scan/is);
  assert.match(fragment, /SECURITY_REVIEW.*Scope:.*Findings:.*Evidence:.*OpenBlockers:\s*none.*Verdict:\s*COMPLETE/is);
  assert.match(fragment, /COMPLETE means the evidence collection is complete.*does not approve a remediation/is);
  assert.match(fragment, /Missing validation.*not itself an exploitable vulnerability/is);
  assert.doesNotMatch(fragment, /omp_test_|-> reviewer -> fix|fork .*security/i);
});

test('a focused offline repository fact check avoids the heavyweight cross-source gate', () => {
  const route = routeNaturalLanguageTask({
    prompt: '离线核查 docs/notes.md 中 The stable fact is 42 是否能由仓库内证据支持。禁止联网，禁止修改任何文件，禁止运行测试，禁止启动 subagent，禁止提交或发布。若证据不足就明确报告证据不足。',
    routerMode: 'enforce',
  });
  const fragment = buildGovernancePromptFragment({ route });
  const repair = buildMissingGateContexts({ route, state: { evidence: {} } });

  assert.match(fragment, /Intent:\s*fact-check/i);
  assert.match(fragment, /Agent route:\s*none/i);
  assert.match(fragment, /focused offline repository-evidence check/i);
  assert.match(fragment, /claim text itself is not independent evidence/i);
  assert.match(fragment, /insufficient/i);
  assert.doesNotMatch(fragment, /fact_check_|fact-planner|fact-researcher/i);
  assert.equal(repair.length, 1);
  assert.match(repair[0].context, /local fact-evidence gate.*built-in grep.*repository root/is);
  assert.doesNotMatch(repair[0].context, /fact_check_analyze|fact_check_gate/i);
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

test('default observe mode gives explicit code fixes implementation governance', () => {
  for (const prompt of [
    'Fix src/parser.js and run tests.',
    '修复 parser 中的小 bug 并运行测试。',
  ]) {
    const route = routeNaturalLanguageTask({ prompt });
    const fragment = buildGovernancePromptFragment({ route, parentTask: prompt });

    assert.equal(route.routerMode, 'observe', prompt);
    assert.equal(route.intent, 'implementation-with-tests', prompt);
    assert.equal(route.workflowRoute, 'code.dev', prompt);
    assert.equal(route.routeObservation.legacyIntent, 'bug-audit', prompt);
    assert.equal(route.routeObservation.plannedIntent, 'implementation-with-tests', prompt);
    assert.match(fragment, /this is a code\/testing workflow/i, prompt);
    assert.doesNotMatch(fragment, /this is a bug audit workflow/i, prompt);
    assert.doesNotMatch(fragment, /production-code fixes require a separate user request/i, prompt);
  }
});

test('adds soft WORKFLOW_NEXT guidance for routed implementation work', () => {
  const fragment = buildGovernancePromptFragment({
    route: {
      intent: 'implementation-with-tests',
      agent: 'implementer',
      requiredSkills: ['test-driven-development', 'verification-before-completion'],
      requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_gate'],
      requiredSubagents: [
        { agent: 'implementation-task', duty: 'implement the task', requiredSkills: ['test-driven-development'] },
      ],
    },
  });

  assert.match(fragment, /WORKFLOW_NEXT/);
  assert.match(fragment, /Next action:/);
  assert.match(fragment, /(?:read|load) `?skill:\/\/test-driven-development`?.*before acting/i);

  const workflowNextSection = fragment.match(/WORKFLOW_NEXT[\s\S]*?(?=\n[A-Z][A-Z_ ]+\n|$)/)?.[0] ?? '';
  assert.doesNotMatch(workflowNextSection, /\b(?:MUST|REQUIRED|mandatory|gate|block|blocked|cannot proceed)\b/i);
});

test('adds constrained route probe governance for compact JSON checks without extra tools', () => {
  const prompt = [
    'OMP_E2E_ROUTE_WORKFLOW_AUDIT',
    'Only perform route/status/skill checks for the installed OMP enhancer.',
    'Do not modify files, do not run tests, do not fork subagents, and do not perform bug audit or security review.',
    'Call exactly omp_core_route_task for the probe prompts, then omp_core_subagent_status.',
    'Return compact JSON only with A intent, B intent, status route, skill usage, and whether any probe changed active route.',
  ].join('\n');
  const route = routeNaturalLanguageTask({ prompt });
  const fragment = buildGovernancePromptFragment({ route, parentTask: prompt });

  assert.equal(route.intent, 'diagnosis');
  assert.match(fragment, /route\/status\/skill checks/i);
  assert.match(fragment, /compact JSON/i);
  assert.match(fragment, /no Markdown fence/i);
  assert.match(fragment, /do not (?:call|use).*eval/i);
  assert.match(fragment, /do not (?:call|use).*bash/i);
  assert.match(fragment, /do not (?:call|use).*task/i);
  assert.match(fragment, /do not (?:call|use).*edit/i);
  assert.match(fragment, /do not (?:call|use).*write/i);
  assert.match(fragment, /do not (?:run|call|use).*test commands/i);
});

test('an exclusive route probe names the only allowed tool and adds no embedded workflow skills', () => {
  const prompt = 'Call omp_core_route_task exactly once with this prompt: Polish README.md to say do not push. Separately, push the release. Then report only constraints.externalWrite and whether a release phase is present. Do not execute the described release and do not use any other tools.';
  const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
  const fragment = buildGovernancePromptFragment({ route, parentTask: prompt });

  assert.equal(route.intent, 'diagnosis');
  assert.match(fragment, /call omp_core_route_task exactly once/i);
  assert.match(fragment, /do not call any tool other than.*omp_core_route_task/i);
  assert.match(fragment, /do not load routed skills or execute the probed workflow/i);
  assert.doesNotMatch(fragment, /writing-markdown-helper|verification-before-completion|Writing workflow/i);
});

test('compact JSON governance requires raw single-object final output without loop-prone evidence blocks', () => {
  const prompt = [
    'OMP_E2E_ROUTE_WORKFLOW_AUDIT',
    'Only perform route/status/skill checks for the installed OMP enhancer.',
    'Do not modify files, do not run tests, do not fork subagents, and do not perform bug audit or security review.',
    'Call exactly omp_core_route_task for the probe prompts, then omp_core_subagent_status.',
    'Return compact JSON only with A intent, B intent, status route, skill usage, and whether any probe changed active route.',
  ].join('\n');
  const route = routeNaturalLanguageTask({ prompt });
  const fragment = buildGovernancePromptFragment({ route, parentTask: prompt });

  assert.match(fragment, /raw single JSON object/i);
  assert.match(fragment, /without Markdown fences/i);
  assert.match(fragment, /without (?:a )?preface/i);
  assert.match(fragment, /without trailing explanation/i);
  assert.match(fragment, /do not repeat .*SKILL_USAGE/i);
  assert.match(fragment, /do not repeat .*SUBAGENT_USAGE/i);
  assert.match(fragment, /do not repeat .*evidence blocks/i);
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

test('focused code edit status reporting does not inject writing governance', () => {
  const prompt = 'Fix only src/parser.js so parseCsv trims whitespace around every comma-separated item. Do not modify any other file. Do not run tests. Do not use subagents. Do not access the network. Read src/parser.js, make one focused edit, read back src/parser.js, and report concisely.';
  const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });
  const fragment = buildGovernancePromptFragment({ route, parentTask: prompt });

  assert.equal(route.intent, 'implementation-with-tests');
  assert.match(fragment, /focused direct code modification with an explicit no-test boundary/i);
  assert.match(fragment, /verification-before-completion/);
  assert.match(fragment, /Review evidence gate/);
  assert.doesNotMatch(fragment, /Writing QA gate|Writing workflow|writing-markdown-helper|writing-checkers|writing_(?:logic|quality)_check/i);
});
