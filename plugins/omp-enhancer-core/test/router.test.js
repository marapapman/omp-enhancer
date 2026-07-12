import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { routeNaturalLanguageTask } from '../src/router.js';

const routingCases = [
  {
    name: 'Chinese writing request routes to Chinese writing profile',
    prompt: '请帮我润色这段中文论文摘要，要求语气自然，不要有翻译腔。',
    expectedIntent: 'writing.zh',
    expectedAgent: 'writing-helper.zh-writer',
    requiredSkills: ['plain-chinese-writing', 'zh-writing-polish', 'zh-writing-checkers'],
    requiredTools: ['writing_logic_check', 'writing_quality_check'],
    requiredSubagents: ['zh-writer', 'zh-checker'],
    requiredSubagentSkills: {
      'zh-writer': ['plain-chinese-writing', 'zh-writing-polish'],
      'zh-checker': ['plain-chinese-writing', 'zh-writing-checkers'],
    },
  },
  {
    name: 'English writing request routes to English writing profile',
    prompt: 'Draft an English related work paragraph for a systems paper and check the logic.',
    expectedIntent: 'writing.en',
    expectedAgent: 'writing-helper.writer',
    requiredSkills: ['writing-markdown-helper', 'writing-checkers'],
    requiredTools: ['writing_logic_check', 'writing_quality_check'],
    requiredSubagents: ['writer', 'checker'],
    requiredSubagentSkills: {
      writer: ['writing-markdown-helper'],
      checker: ['writing-checkers'],
    },
  },
  {
    name: 'test-writing request routes to merged bug audit profile',
    prompt: '为 src/router.js 写高信号单元测试，覆盖边界和错误路径。',
    expectedIntent: 'bug-audit',
    expectedAgent: 'tester',
    requiredSkills: ['test-driven-development', 'verification-before-completion'],
    requiredTools: ['omp_test_analyze', 'omp_test_report'],
    requiredSubagents: [],
    requiredSubagentSkills: {},
    auditMode: 'focused',
  },
  {
    name: 'bug audit request routes to bug audit profile',
    prompt: '帮我测试项目并检查 bug，写 bug audit report，不要修复代码。',
    expectedIntent: 'bug-audit',
    expectedAgent: 'tester',
    requiredSkills: ['diagnose', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion', 'search-first', 'ai-regression-testing'],
    requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_browser_check', 'omp_test_coverage_analyze', 'omp_test_mutation_context', 'omp_test_report'],
    requiredSubagents: ['ecc-tdd-guide', 'ecc-code-reviewer', 'ecc-silent-failure-hunter', 'ecc-pr-test-analyzer'],
    requiredSubagentSkills: {
      'ecc-tdd-guide': ['test-driven-development', 'search-first', 'ai-regression-testing'],
      'ecc-code-reviewer': ['verification-before-completion'],
      'ecc-silent-failure-hunter': ['diagnose'],
      'ecc-pr-test-analyzer': ['verification-before-completion'],
    },
  },
  {
    name: 'focused direct bug audit routes to direct audit profile',
    prompt: 'Do the bug investigation directly as a focused audit; report verified findings only.',
    expectedIntent: 'bug-audit',
    expectedAgent: 'tester',
    requiredSkills: [],
    requiredTools: [],
    requiredSubagents: [],
    requiredSubagentSkills: {},
    auditMode: 'focused',
  },
  {
    name: 'fact-check request routes to fact-check workflow',
    prompt: '帮我事实核查这段文字里的数据、年份和引用真实性。',
    expectedIntent: 'fact-check',
    expectedAgent: 'fact-checker',
    requiredSkills: ['fact-checking', 'claim-extraction', 'source-evaluation', 'citation-authenticity'],
    requiredTools: ['fact_check_analyze', 'fact_check_evidence', 'fact_check_report'],
    requiredSubagents: ['fact-planner', 'fact-researcher-a', 'fact-researcher-b', 'fact-cross-checker', 'fact-reviewer'],
    requiredSubagentSkills: {
      'fact-planner': ['fact-checking', 'claim-extraction'],
      'fact-researcher-a': ['fact-checking', 'source-evaluation', 'citation-authenticity'],
      'fact-researcher-b': ['fact-checking', 'source-evaluation', 'citation-authenticity'],
      'fact-cross-checker': ['fact-checking', 'source-evaluation'],
      'fact-reviewer': ['fact-checking', 'source-evaluation', 'citation-authenticity'],
    },
  },
  {
    name: 'implementation with tests request routes to coding plus testing profile',
    prompt: '实现这个路由功能并补测试，先写失败用例，再完成实现。',
    expectedIntent: 'implementation-with-tests',
    expectedAgent: 'implementer',
    requiredSkills: ['test-driven-development', 'verification-before-completion'],
    requiredTools: ['omp_test_analyze', 'omp_test_report'],
    requiredSubagents: [],
    requiredSubagentSkills: {},
  },
  {
    name: 'Chinese sentence rewrite with coding words still routes to writing',
    prompt: '把下面这句话改成朴素、直接、少形容词的中文：鉴于当前系统存在较为显著的功能复杂性，我们需要进一步推动配置层面的优化与能力沉淀。',
    expectedIntent: 'writing.zh',
    expectedAgent: 'writing-helper.zh-writer',
    requiredSkills: ['plain-chinese-writing', 'zh-writing-polish'],
    requiredTools: [],
    requiredSubagents: [],
    requiredSubagentSkills: {},
  },
  {
    name: 'Chinese coding request routes to implementation with tests instead of writing',
    prompt: '请写一个函数实现排序功能',
    expectedIntent: 'implementation-with-tests',
    expectedAgent: 'implementer',
    requiredSkills: ['verification-before-completion'],
    requiredTools: [],
    requiredSubagents: [],
    requiredSubagentSkills: {},
  },
  {
    name: 'explicit Chinese implementation with tests is not bug audit',
    prompt: '实现 router 的 workflowRoute 回退逻辑并补测试。',
    expectedIntent: 'implementation-with-tests',
    expectedAgent: 'implementer',
    requiredSkills: ['test-driven-development', 'verification-before-completion'],
    requiredTools: ['omp_test_analyze', 'omp_test_report'],
    requiredSubagents: [],
    requiredSubagentSkills: {},
  },
  {
    name: 'Chinese write feature routes to implementation instead of writing',
    prompt: '写一个登录功能',
    expectedIntent: 'implementation-with-tests',
    expectedAgent: 'implementer',
    requiredSkills: [],
    requiredTools: [],
    requiredSubagents: [],
    requiredSubagentSkills: {},
  },
  {
    name: 'Chinese write page routes to implementation instead of writing',
    prompt: '写个页面',
    expectedIntent: 'implementation-with-tests',
    expectedAgent: 'implementer',
    requiredSkills: ['brainstorming', 'subagent-driven-development', 'verification-before-completion'],
    requiredTools: [],
    requiredSubagents: ['plan', 'implementation-task', 'reviewer'],
    requiredSubagentSkills: {
      plan: ['brainstorming', 'subagent-driven-development'],
      'implementation-task': ['verification-before-completion'],
      reviewer: ['verification-before-completion'],
    },
  },
  {
    name: 'Chinese write register module routes to implementation instead of writing',
    prompt: '写一个用户注册模块',
    expectedIntent: 'implementation-with-tests',
    expectedAgent: 'implementer',
    requiredSkills: ['brainstorming', 'subagent-driven-development', 'verification-before-completion'],
    requiredTools: [],
    requiredSubagents: ['plan', 'implementation-task', 'reviewer'],
    requiredSubagentSkills: {
      plan: ['brainstorming', 'subagent-driven-development'],
      'implementation-task': ['verification-before-completion'],
      reviewer: ['verification-before-completion'],
    },
  },
  {
    name: 'security review request routes to security reviewer',
    prompt: "审查这段 Express 代码的安全风险：app.get('/file', (req, res) => res.sendFile(req.query.path));",
    expectedIntent: 'security-review',
    expectedAgent: 'ecc-security-reviewer',
    requiredSkills: ['security-review', 'security-scan'],
    requiredTools: [],
    requiredSubagents: ['ecc-security-reviewer', 'reviewer'],
    requiredSubagentSkills: {
      'ecc-security-reviewer': ['security-review', 'security-scan'],
      reviewer: ['security-review'],
    },
  },
  {
    name: 'Chinese security prose polish routes to writing instead of security review',
    prompt: '帮我润色这份安全公告的表述，让语气更自然，不要触发代码安全审查。',
    expectedIntent: 'writing.pending',
    expectedAgent: null,
    requiredSkills: [],
    requiredTools: [],
    requiredSubagents: [],
    requiredSubagentSkills: {},
  },
  {
    name: 'English security policy edit routes to writing instead of security review',
    prompt: 'Review the wording of this security policy draft for clarity and tone.',
    expectedIntent: 'writing.pending',
    expectedAgent: null,
    requiredSkills: [],
    requiredTools: [],
    requiredSubagents: [],
    requiredSubagentSkills: {},
  },
  {
    name: 'config asset request routes to config asset profile',
    prompt: '检查 omp marketplace 插件打包出来的 config assets 和 hooks 是否齐全。',
    expectedIntent: 'config-assets',
    expectedAgent: 'config-assets',
    requiredSkills: ['omp-marketplace-plugin-activation'],
    requiredTools: ['omp_config_doctor', 'omp_config_assets', 'omp_config_plan'],
    requiredSubagents: [],
    requiredSubagentSkills: {},
  },
];

test('routes natural language tasks to advisory skill and role profiles without slash commands', () => {
  for (const item of routingCases) {
    const route = routeNaturalLanguageTask({ prompt: item.prompt });

    assert.equal(route.intent, item.expectedIntent, item.name);
    assert.equal(route.agent, item.expectedAgent, item.name);
    assert.equal(route.routePlan.mode, 'advisory', item.name);
    assert.equal(route.routePlan.autoContinue, false, item.name);
    assert.deepEqual(route.routePlan.skills, item.requiredSkills, item.name);
    assert.deepEqual(route.routePlan.tools, item.requiredTools, item.name);
    assert.deepEqual(route.routePlan.roles.map(({ agent }) => agent), item.requiredSubagents, item.name);
    assert.deepEqual(
      Object.fromEntries(route.routePlan.roles.map(({ agent, skills }) => [agent, skills])),
      item.requiredSubagentSkills,
      item.name,
    );
    assert.equal(route.auditMode ?? null, item.auditMode ?? null, item.name);
    assert.equal(route.source, 'natural-language', item.name);
  }
});

test('routes mixed real-world workloads without false workflow gates', () => {
  const cases = [
    ['large agentic code writing', '请大规模重构这个插件的 subagent fork 逻辑，修改多个文件并补完整测试。', 'implementation-with-tests', ['plan', 'implementation-task', 'reviewer']],
    ['direct audit context followed by workflow optimization', 'The OMP gate is blocking delegation. Let me do the bug investigation directly as a focused audit. 帮我优化插件的工作流，再事前准备好skills。', 'implementation-with-tests', []],
    ['precise scoped code edit', '只修改 plugins/omp-enhancer-core/src/router.js 里 routeNaturalLanguageTask 的一个判断，保持范围最小。', 'implementation-with-tests', []],
    ['agentic code modification', 'Agentically update the codebase to improve gate handling and add regression tests.', 'implementation-with-tests', ['plan', 'implementation-task', 'reviewer']],
    ['read-only code bug finding', '帮我在代码里找 bug，只报告问题，不要修复。', 'bug-audit', ['ecc-code-reviewer', 'ecc-silent-failure-hunter']],
    ['focused direct bug audit', '直接做 focused bug audit，只报告验证过的问题。', 'bug-audit', []],
    ['code testing workload', '帮我为 subagent fork 逻辑生成测试并运行门禁，不要改实现。', 'bug-audit', []],
    ['fact-check workload', 'Verify citation authenticity and factual claims in this paragraph.', 'fact-check', ['fact-planner', 'fact-researcher-a', 'fact-researcher-b', 'fact-cross-checker', 'fact-reviewer']],
    ['large Chinese writing', '请写一份中文长篇项目总结报告，包含背景、方法、结果和风险。', 'writing.zh', ['zh-writer', 'zh-checker']],
    ['chapter writing polish with logic wording', '帮我优化第一章的中文写作，让整体行文更顺滑，逻辑更通畅。', 'writing.pending', []],
    ['small Chinese text revision', '把这句话改成朴素直接的中文：我们需要进一步推动能力沉淀。', 'writing.zh', []],
    ['large English writing', 'Draft a full English research proposal with background, methods, risks, and timeline.', 'writing.en', ['writer', 'checker']],
    ['small English text revision', 'Polish this sentence for clarity: The workflow blocks unexpectedly.', 'writing.en', []],
    ['research workload', '帮我调研一下 agentic coding workflow 的最佳实践，列出要点。', 'unknown', []],
    ['scientific research workload', '帮我做科研选题调研，分析最近论文里的方法路线。', 'unknown', []],
    ['literature download workload', '帮我下载这些论文 PDF 并整理到 papers 目录，不要写代码。', 'unknown', []],
    ['daily office workload', '帮我整理今天的会议纪要和待办事项。', 'unknown', []],
    ['scientific writing workload', '请写一份中文科研调研报告，分析最近论文里的方法路线。', 'writing.zh', ['zh-writer', 'zh-checker']],
  ];

  for (const [name, prompt, expectedIntent, expectedSubagents] of cases) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.intent, expectedIntent, name);
    assert.deepEqual(route.routePlan.roles.map(({ agent }) => agent), expectedSubagents, name);
  }
});

test('routes common work situations without unreasonable workflow escalation', () => {
  const cases = [
    ['code read-only explanation', '解释 plugins/omp-enhancer-core/src/router.js 这个模块怎么工作，不改代码。', 'unknown'],
    ['architecture review read-only', '评估当前 subagent fork 设计、接口边界和依赖方向，不要改代码。', 'unknown'],
    ['performance diagnosis', '定位 router stress 测试里的慢路径，提出优化建议，不要改代码。', 'diagnosis'],
    ['performance optimization', '优化 router stress 测试的慢路径，修改代码并补 benchmark。', 'implementation-with-tests'],
    ['behavior-preserving refactor', '重构 router 的判断逻辑，不改变行为，并补回归测试。', 'implementation-with-tests'],
    ['dependency upgrade', '升级项目里的 npm 依赖，处理 breaking changes，并跑测试。', 'implementation-with-tests'],
    ['code migration', '把这个模块从 JS 迁移到 TypeScript，并补测试。', 'implementation-with-tests'],
    ['plugin scaffold', '新增一个 OMP 插件命令和对应 agent/skill 模板。', 'implementation-with-tests'],
    ['delete legacy feature', '删除旧的 classifier fallback 逻辑，清理测试和文档。', 'implementation-with-tests'],
    ['runtime diagnosis', '定位本地运行失败的原因，只看日志和环境，不修。', 'diagnosis'],
    ['runtime fix', '修复本地运行失败的问题，并验证 dev server 能启动。', 'implementation-with-tests'],
    ['ci flaky analysis', '分析 CI 失败的 job，判断是否 flaky，不改代码。', 'bug-audit'],
    ['local environment fix without code', '修复本地依赖安装和端口冲突问题，不要改项目代码。', 'unknown'],
    ['config inventory diagnosis', '排查 env、modelRoles、marketplace、hooks 和 agent 配置是否有问题，只列清单。', 'config-assets'],
    ['pre-release check', '做发布前检查：pack、test、marketplace check、plugin list，不要发布。', 'bug-audit'],
    ['local OMP process smoke result', '帮我再后台启动一个 omp 进程，把模型换成 mimo v2.5 advisor 换成 deepseek v4 flash，测试结果。', 'unknown'],
    ['local extension smoke only', '运行本地插件加载 smoke 和进程验证，只报告是否启动成功，不查 bug，不改代码。', 'unknown'],
    ['local smoke with bug check', 'Run plugin load smoke and check for bugs, result only.', 'bug-audit', { focused: true }],
    ['rollback analysis', '分析是否需要 revert 这个提交，避免误删用户改动，不要改代码。', 'unknown'],
    ['unit test completion', '补全 router 的单元测试，覆盖边界情况。', 'bug-audit'],
    ['integration test completion', '补全集成测试，覆盖插件 hook 和 session state。', 'bug-audit'],
    ['e2e smoke verification', '运行 browser smoke 和 Playwright e2e，报告失败。', 'bug-audit'],
    ['load and stress tests', '做并发和压力测试，检查不同负载下的门禁行为。', 'bug-audit'],
    ['flaky test diagnosis', '定位 flaky test 的原因，不修实现。', 'bug-audit'],
    ['mutation and coverage audit', '分析 mutation 和 coverage 缺口，指出弱断言。', 'bug-audit'],
    ['test report writing', '请写一份测试报告，不运行测试。', 'writing.pending'],
    ['test code review', '审查测试代码，避免重复测试和弱断言，不改实现。', 'bug-audit'],
    ['pr description writing', '帮我写 PR 描述和 release notes，不要发布。', 'writing.pending'],
    ['technical design doc writing', '起草一份技术设计文档，说明方案、风险和验证计划。', 'writing.pending'],
    ['readme writing', '更新 README 的用户文档和安装说明。', 'writing.pending'],
    ['pure bug report writing', '写一份 bug report，包含复现步骤和影响范围。', 'writing.pending'],
    ['weekly note organization', '整理本周周报和会议纪要。', 'unknown'],
    ['English email writing', 'Write an email announcing the plugin fix.', 'writing.pending'],
    ['paper polishing', '润色论文摘要、引言和相关工作。', 'writing.pending'],
    ['translation and polish', '把这段中文技术说明翻译成英文并润色。', 'writing.en'],
    ['research summary', '搜索资料并总结 agentic coding workflow 的主流做法。', 'writing.pending'],
    ['official docs lookup', '查官方文档并给出相关链接。', 'unknown'],
    ['paper download', '下载并整理这批论文 PDF 到 papers 目录。', 'unknown'],
    ['literature review writing', '写一份文献综述，比较三类方法。', 'writing.pending'],
    ['competitor research', '做竞品和方案调研，列出优缺点。', 'unknown'],
    ['technical choice comparison', '比较几个技术选型，给出推荐。', 'unknown'],
    ['api usage lookup', '查询这个库的 API 用法并给例子，不改代码。', 'unknown'],
    ['source list only', '只列资料清单，不写正文。', 'unknown'],
    ['diagnose before fix later', '先诊断这个 gate 为什么失败，不要改；确认后再修。', 'diagnosis'],
    ['write tests without implementation changes', '写测试但不要改实现。', 'bug-audit'],
    ['write test report without running tests', '写测试报告，不要运行测试。', 'writing.pending'],
    ['find bugs without fixing', '查 bug，只报告，不修。', 'bug-audit'],
    ['one-line code edit', '只改一行代码，但不要跑全量测试。', 'implementation-with-tests', { direct: true }],
    ['push and upgrade only', '推送并升级插件，但不要改代码。', 'release'],
    ['release notes without publish', '写 release notes，但不要发布。', 'writing.pending'],
    ['research implementation plan only', '调研方案，并生成实现计划，但先不要实现。', 'unknown'],
  ];

  const nonGated = new Set(['unknown', 'release']);

  for (const [name, prompt, expectedIntent, options = {}] of cases) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.intent, expectedIntent, name);
    if (options.direct) {
      assert.equal(route.workflowRoute, 'code.dev', `${name} workflow`);
      assert.deepEqual(route.routePlan.roles, [], `${name} roles`);
      assert.deepEqual(route.taskDescriptor.testExclusions, ['full-suite'], `${name} test ceiling`);
    } else if (options.focused) {
      assert.equal(route.auditMode, 'focused', `${name} audit mode`);
      assert.deepEqual(route.routePlan.roles, [], `${name} roles`);
    } else if (nonGated.has(expectedIntent)) {
      assert.deepEqual(route.routePlan.skills, [], `${name} skills`);
      assert.deepEqual(route.routePlan.tools, [], `${name} tools`);
      assert.deepEqual(route.routePlan.roles, [], `${name} roles`);
    } else if (expectedIntent === 'writing.pending') {
      assert.equal(
        route.routePlan.skills.some((skill) => [
          'plain-chinese-writing',
          'zh-writing-polish',
          'writing-markdown-helper',
          'writing-checkers',
        ].includes(skill)),
        false,
        `${name} should not select language-specific skills before source text is available`,
      );
      assert.deepEqual(route.routePlan.tools, [], `${name} tools pending source text`);
      assert.deepEqual(route.routePlan.roles, [], `${name} roles pending source text`);
    } else if (expectedIntent === 'diagnosis') {
      assert.deepEqual(route.routePlan.tools, [], `${name} tools`);
      assert.deepEqual(route.routePlan.roles, [], `${name} roles`);
    } else if (route.taskDescriptor.complexity === 'focused'
      && route.routePlan.roles.length === 0) {
      assert.deepEqual(route.routePlan.roles, [], `${name} focused direct workflow`);
    } else {
      assert.equal(route.routePlan.roles.length > 0, true, `${name} should suggest concrete roles`);
    }
  }
});

test('routes explicit agentic review or analysis prompts away from bug audit when no bug finding is requested', () => {
  const cases = [
    {
      name: 'parallel read-only architecture review',
      prompt: 'Parallelize this: fork subagents to review and analyze the router architecture, then summarize tradeoffs. Do not find bugs and do not modify files.',
      expectedIntent: 'unknown',
      expectedWorkflowRoute: 'agentic.simple',
      expectedSubagents: [],
    },
    {
      name: 'agentic implementation with review subagents',
      prompt: 'Please parallelize the work: fork subagents for code review and analysis, then update the router behavior and add regression tests. I am not asking for a bug audit.',
      expectedIntent: 'implementation-with-tests',
      expectedWorkflowRoute: 'code.dev',
      expectedSubagents: ['plan', 'implementation-task', 'reviewer'],
    },
  ];

  for (const { name, prompt, expectedIntent, expectedWorkflowRoute, expectedSubagents } of cases) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.intent, expectedIntent, name);
    assert.notEqual(route.intent, 'bug-audit', name);
    assert.equal(route.workflowRoute ?? null, expectedWorkflowRoute, name);
    assert.deepEqual(route.requiredSubagents.map(({ agent }) => agent), expectedSubagents, name);
  }
});

test('routes Chinese agentic route and skill probes away from writing without dispatching subagents', () => {
  const route = routeNaturalLanguageTask({
    prompt: '请并行派发多个 subagents，一个检查 router，一个检查 governance，一个检查 testing gate，然后汇总结论。注意这只是路由和技能使用测试，不要真的派发。',
  });

  assert.notEqual(route.intent, 'writing.zh');
  assert.equal(route.intent, 'bug-audit');
  assert.equal(route.auditMode, 'focused');
  assert.deepEqual(route.requiredSubagents, []);
});

test('routes E2E route/status/skill workflow audits as diagnosis-only probes', () => {
  const prompt = [
    'OMP_E2E_ROUTE_WORKFLOW_AUDIT',
    'Only perform route/status/skill checks for the installed OMP enhancer.',
    'Do not modify files, do not run tests, do not fork subagents, and do not perform bug audit or security review.',
    'Call exactly omp_core_route_task for the probe prompts, then omp_core_subagent_status.',
    'Return compact JSON only with A intent, B intent, status route, skill usage, and whether any probe changed active route.',
  ].join('\n');

  const route = routeNaturalLanguageTask({ prompt });

  assert.equal(route.intent, 'diagnosis');
  assert.notEqual(route.intent, 'writing.zh');
  assert.notEqual(route.intent, 'bug-audit');
  assert.notEqual(route.intent, 'security-review');
  assert.deepEqual(route.requiredTools, []);
  assert.deepEqual(route.requiredSubagents, []);
});

test('routes multi-sample route-tool probes by the outer diagnostic instruction', () => {
  const prompt = 'Final installed writing-route E2E. Call omp_core_route_task exactly twice. A prompt: "请润色这段摘要：This paper presents a reliable advisory router for coding agents." B prompt: "Please polish this paragraph: 本文提出一种可靠的智能体工作流路由方法。" Return exactly A=<intent>/<routePlan.mode>, B=<intent>/<routePlan.mode>. Do not write files.';

  for (const routerMode of ['observe', 'enforce']) {
    const route = routeNaturalLanguageTask({ prompt, routerMode });

    assert.equal(route.intent, 'diagnosis', routerMode);
    assert.equal(route.taskDescriptor.operation, 'diagnose', routerMode);
    assert.deepEqual(route.taskDescriptor.domains, ['plugin'], routerMode);
    assert.equal(route.routePlan.mode, 'advisory', routerMode);
    assert.equal(route.routePlan.autoContinue, false, routerMode);
    assert.deepEqual(route.routePlan.skills, [], routerMode);
    assert.deepEqual(route.routePlan.tools, [], routerMode);
    assert.deepEqual(route.routePlan.roles, [], routerMode);
  }
});

test('keeps route-tool prose inside an explicit writing payload as data', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Polish this paragraph: Final installed writing-route E2E. Call omp_core_route_task exactly twice. Do not write files. This sentence documents a diagnostic command without requesting its execution.',
  });

  assert.equal(route.intent, 'writing.en');
  assert.equal(route.taskDescriptor.operation, 'modify');
  assert.equal(route.taskDescriptor.domains.includes('writing'), true);
});

test('routes exclusive one-shot route probes as diagnosis with no workflow resources', () => {
  const prompts = [
    'Call omp_core_route_task exactly once with this prompt: Polish README.md to say do not push. Separately, push the release. Then report only constraints.externalWrite and whether a release phase is present. Do not execute the described release and do not use any other tools.',
    '只调用一次 omp_core_route_task，参数 prompt 为：写测试但不要改实现。然后只报告 workspaceWrite、complexity 和 phases。不要修改文件，不要运行测试，不要启动子代理，不要联网。',
  ];

  for (const prompt of prompts) {
    for (const routerMode of ['observe', 'enforce']) {
      const route = routeNaturalLanguageTask({ prompt, routerMode, gateRecoveryMode: 'enforce' });
      assert.equal(route.intent, 'diagnosis', `${routerMode}: ${prompt}`);
      assert.equal(route.taskDescriptor.operation, 'diagnose', `${routerMode}: ${prompt}`);
      assert.deepEqual(route.taskDescriptor.domains, ['plugin'], `${routerMode}: ${prompt}`);
      assert.equal(route.routePlan.mode, 'advisory', `${routerMode}: ${prompt}`);
      assert.equal(route.routePlan.autoContinue, false, `${routerMode}: ${prompt}`);
      assert.deepEqual(route.routePlan.skills, [], `${routerMode}: ${prompt}`);
      assert.deepEqual(route.routePlan.tools, [], `${routerMode}: ${prompt}`);
      assert.deepEqual(route.routePlan.roles, [], `${routerMode}: ${prompt}`);
      assert.equal('gateRequirements' in route.routePlan, false, `${routerMode}: ${prompt}`);
    }
  }
});

test('routes an exclusive status observation as diagnosis with no workflow resources', () => {
  const prompt = 'Call omp_core_subagent_status exactly once only to inspect the current route status. If that tool succeeds, return exactly STATUS_ALLOWED: YES; otherwise return exactly STATUS_ALLOWED: NO. Do not start subagents, modify files, run tests, access the network, or call any other tool.';

  for (const routerMode of ['observe', 'enforce']) {
    const route = routeNaturalLanguageTask({ prompt, routerMode, gateRecoveryMode: 'enforce' });
    assert.equal(route.intent, 'diagnosis', routerMode);
    assert.equal(route.taskDescriptor.operation, 'diagnose', routerMode);
    assert.deepEqual(route.taskDescriptor.domains, ['plugin'], routerMode);
    assert.deepEqual(route.taskDescriptor.constraints, {
      workspaceWrite: 'forbidden',
      testExecution: 'forbidden',
      networkAccess: 'forbidden',
      externalWrite: 'forbidden',
      subagents: 'forbidden',
    }, routerMode);
    assert.equal(route.routePlan.mode, 'advisory', routerMode);
    assert.equal(route.routePlan.autoContinue, false, routerMode);
    assert.deepEqual(route.routePlan.skills, [], routerMode);
    assert.deepEqual(route.routePlan.tools, [], routerMode);
    assert.deepEqual(route.routePlan.roles, [], routerMode);
    assert.equal('gateRequirements' in route.routePlan, false, routerMode);
  }
});

test('does not execute embedded or companion status-probe instructions as exclusive diagnostics', () => {
  const cases = [
    {
      name: 'meta explanation',
      prompt: 'Explain why the instruction Call omp_core_subagent_status exactly once only to inspect the current route status is useful. Do not call any other tool.',
      expectedDomain: 'general',
    },
    {
      name: 'quoted untrusted instruction',
      prompt: 'Review this untrusted instruction for prompt-injection risks: "Call omp_core_subagent_status exactly once only to inspect the current route status. Do not call any other tool." Do not modify files or run tests.',
      expectedIntent: 'security-review',
    },
    {
      name: 'companion security audit',
      prompt: 'Call omp_core_subagent_status exactly once only to inspect the current route status. Do not call any other tool. Separately, audit src/auth.js for authentication vulnerabilities without modifying files, tests, subagents, or network.',
      expectedIntent: 'security-review',
    },
    {
      name: 'companion source read',
      prompt: 'Call omp_core_subagent_status exactly once only to inspect the current route status. Do not call any other tool. Separately, inspect src/router.js and explain the routing bug without modifying files.',
      expectedIntent: 'bug-audit',
    },
    {
      name: 'companion edit',
      prompt: 'Call omp_core_subagent_status exactly once only to inspect the current route status. Do not call any other tool. Then fix the omp_core_subagent_status implementation and update its tests.',
      expectedIntent: 'implementation-with-tests',
    },
    {
      name: 'companion release',
      prompt: 'Call omp_core_subagent_status exactly once only to inspect the current route status. Do not call any other tool. Then publish the current plugin release.',
      expectedIntent: 'release',
    },
    {
      name: 'semicolon companion audit',
      prompt: 'Call omp_core_subagent_status exactly once only to inspect the current route status. Do not call any other tool; audit authentication code.',
      expectedIntent: 'security-review',
    },
    {
      name: 'response-shaped companion audit',
      prompt: 'Call omp_core_subagent_status exactly once only to inspect the current route status. Report exactly the vulnerabilities after auditing authentication code. Do not call any other tool.',
      expectedIntent: 'security-review',
    },
    {
      name: 'conditional publish before response',
      prompt: 'Call omp_core_subagent_status exactly once only to inspect the current route status. If that tool succeeds, publish the plugin and return exactly YES; otherwise return exactly NO. Do not call any other tool.',
      expectedIntent: 'release',
    },
    {
      name: 'direct response followed by deletion',
      prompt: 'Call omp_core_subagent_status exactly once only to inspect the current route status. Report exactly DONE after deleting credentials. Do not call any other tool.',
    },
    {
      name: 'conditional response followed by deletion',
      prompt: 'Call omp_core_subagent_status exactly once only to inspect the current route status. If that tool succeeds, return exactly YES; otherwise return exactly NO and delete credentials. Do not call any other tool.',
    },
  ];

  for (const item of cases) {
    const route = routeNaturalLanguageTask({ prompt: item.prompt, routerMode: 'enforce' });
    assert.equal(
      route.taskDescriptor.provenance.reasons.includes('exclusive subagent status diagnostic probe'),
      false,
      item.name,
    );
    if (item.expectedIntent) assert.equal(route.intent, item.expectedIntent, item.name);
    if (item.expectedDomain) assert.ok(route.taskDescriptor.domains.includes(item.expectedDomain), item.name);
  }
});

test('routes constrained E2E workflow audits with plain-text summaries as diagnosis-only probes', () => {
  const cases = [
    {
      name: 'short plain-text route status skill summary',
      prompt: [
        'OMP_E2E_ROUTE_WORKFLOW_AUDIT',
        'Only perform route/status/skill checks for the installed OMP enhancer.',
        'Do not modify files, do not run tests, and do not fork subagents.',
        'Call exactly omp_core_route_task for the probe prompts, then omp_core_subagent_status.',
        'Return a short plain-text summary with A intent, B intent, status route, skill usage, and whether any probe changed active route.',
      ].join('\n'),
    },
    {
      name: 'negated security-review wording stays bounded to routing checks',
      prompt: [
        'OMP_E2E_ROUTE_WORKFLOW_AUDIT',
        'Only perform route/status/skill checks for the installed OMP enhancer.',
        'Do not modify files, do not run tests, do not fork subagents, and do not perform security review.',
        'Call exactly omp_core_route_task for the probe prompts, then omp_core_subagent_status.',
        'Return a short plain-text summary with A intent, B intent, status route, skill usage, and whether any probe changed active route.',
      ].join('\n'),
    },
  ];

  for (const { name, prompt } of cases) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.intent, 'diagnosis', name);
    assert.notEqual(route.intent, 'security-review', name);
    assert.notEqual(route.intent, 'bug-audit', name);
    assert.notEqual(route.intent, 'writing.zh', name);
    assert.deepEqual(route.requiredTools, [], name);
    assert.deepEqual(route.requiredSubagents, [], name);
  }
});

test('routes observed gate workflow regressions before classifier or smart-gate recovery', () => {
  const workflowValidation = routeNaturalLanguageTask({
    prompt: '我已经重启 OMP，请利用 MiMo 对 OMP 进行一次端到端测试，验证整个工作流中门禁的误挡、主进程结束后长时间后台任务，以及主 agent 或 task 漏用 skills 或不遵守 workflow 的情况。',
  });
  assert.equal(workflowValidation.intent, 'bug-audit');
  assert.equal(workflowValidation.auditMode, 'focused');
  assert.deepEqual(workflowValidation.requiredSubagents, []);
  assert.ok(workflowValidation.requiredTools.includes('omp_test_report'));
  assert.equal(workflowValidation.requiredTools.includes('omp_test_gate'), false);
  const observedSummary = routeNaturalLanguageTask({
    prompt: '统一总结一下这一轮测试里面观察到的问题。',
  });
  assert.equal(observedSummary.intent, 'writing.pending');
  assert.deepEqual(observedSummary.requiredSubagents, []);
  assert.deepEqual(observedSummary.requiredTools, []);

  const observedDiagnosticSummary = routeNaturalLanguageTask({
    prompt: '总结已观测的 E2E 诊断结果：DeepSeek V4 Flash 主 agent 加 GLM 5.2 advisor 的测试中，记录路由、门禁、skill 使用和 workflow 遵守情况，不执行 bug audit，不修改代码，不运行新的测试。',
  });
  assert.equal(observedDiagnosticSummary.intent, 'writing.pending');
  assert.deepEqual(observedDiagnosticSummary.requiredSubagents, []);
  assert.deepEqual(observedDiagnosticSummary.requiredTools, []);

  const fileSummaryWithRouteWords = routeNaturalLanguageTask({
    prompt: '请读取 observations.md，汇总里面的问题。不要修改文件，不要重新跑测试，只基于文件内容做判断。请特别检查这种总结请求是否会被错误路由到 bug-audit 或 config-assets。最后输出 E2E_MARKER_SUMMARY、SKILL_USAGE、是否触发 SUBAGENT_USAGE 或 session-stop-continuation。',
  });
  assert.equal(fileSummaryWithRouteWords.intent, 'writing.zh');
  assert.deepEqual(fileSummaryWithRouteWords.requiredSubagents, []);
  assert.deepEqual(fileSummaryWithRouteWords.requiredTools, []);

  const observedResultsQuestion = routeNaturalLanguageTask({
    prompt: '本轮测试暴露了哪些问题',
  });
  assert.equal(observedResultsQuestion.intent, 'writing.pending');
  assert.deepEqual(observedResultsQuestion.requiredSubagents, []);
  assert.deepEqual(observedResultsQuestion.requiredTools, []);

  const installedRouteCheckSummary = routeNaturalLanguageTask({
    prompt: '总结已观测的 E2E 诊断结果。请验证已安装的 OMP enhancer 新版本路由行为，不修改文件，不运行测试。必须使用工具调用 omp_core_route_task 分别检查两个 probe prompt，然后调用 omp_core_subagent_status。最终输出 E2E_MARKER_ROUTE_RESET，并报告 A 的 intent、B 的 intent、status 是否被 probe 污染成 bug-audit、SKILL_USAGE。',
  });
  assert.equal(installedRouteCheckSummary.intent, 'diagnosis');
  assert.deepEqual(installedRouteCheckSummary.requiredSubagents, []);
  assert.deepEqual(installedRouteCheckSummary.requiredTools, []);

  const focusedRouteToolCheck = routeNaturalLanguageTask({
    prompt: 'Tool check only. Do not modify files. Do not run tests. Do not fork subagents. Call exactly these tools in order: omp_core_route_task twice, then omp_core_subagent_status. Final answer must include E2E_MARKER_ROUTE_PROBE_JSON, A intent, B intent, status route, and whether any probe changed active route.',
  });
  assert.equal(focusedRouteToolCheck.intent, 'diagnosis');
  assert.deepEqual(focusedRouteToolCheck.requiredSubagents, []);
  assert.deepEqual(focusedRouteToolCheck.requiredTools, []);

  const routeTaskCodeAudit = routeNaturalLanguageTask({
    prompt: 'Review the omp_core_route_task implementation for bugs. Do not edit files; report concrete file-line findings only.',
  });
  assert.equal(routeTaskCodeAudit.intent, 'bug-audit');

  const routeTaskChineseAudit = routeNaturalLanguageTask({
    prompt: '检查 omp_core_route_task 的实现是否有 bug，不要修改代码，只报告。',
  });
  assert.equal(routeTaskChineseAudit.intent, 'bug-audit');

  const freshChineseAuditSummary = routeNaturalLanguageTask({
    prompt: '请检查当前代码并总结问题，不要修改文件。',
  });
  assert.equal(freshChineseAuditSummary.intent, 'bug-audit');

  const freshConfigAuditSummary = routeNaturalLanguageTask({
    prompt: '检查 docker-compose.yml 配置并汇总问题，只报告。',
  });
  assert.equal(freshConfigAuditSummary.intent, 'bug-audit');

  const implementationWorkflowPrompt = routeNaturalLanguageTask({
    prompt: '请在当前项目中实现 sortNumbers(values, options) 的 unique 模式：当 options.unique === true 时，返回升序且去重的新数组；默认行为保持只排序不去重。请遵守 implementation-with-tests workflow，先读取相关 skills，不要调用不存在的 skill 工具。按需 fork 子代理。完成后运行 npm test。最终输出 E2E_MARKER_IMPL、SKILL_USAGE、SUBAGENT_USAGE、测试命令和结果。',
  });
  assert.equal(implementationWorkflowPrompt.intent, 'implementation-with-tests');

  const repairPlan = routeNaturalLanguageTask({
    prompt: '去修复这些问题，但是先给我一个计划。对于门禁有关的问题，你的思路应该是尽量在事前做好工作，而不是事后阻止，不要给用户反复尝试的感觉。',
  });
  assert.equal(repairPlan.intent, 'implementation-with-tests');
  assert.equal(repairPlan.taskDescriptor.operation, 'modify');
  assert.equal(repairPlan.taskDescriptor.constraints.workspaceWrite, 'required');
  assert.ok(repairPlan.taskDescriptor.phases.some(({ kind, domain }) => kind === 'modify' && domain === 'code'));
  assert.deepEqual(repairPlan.requiredSubagents, []);

  const configAssets = routeNaturalLanguageTask({
    prompt: '检查 omp-config marketplace 插件打包出来的 assets 和 hooks 是否齐全。',
  });
  assert.equal(configAssets.intent, 'config-assets');
  assert.deepEqual(configAssets.requiredSubagents, []);

  const configAssetsWithCodeNegation = routeNaturalLanguageTask({
    prompt: '不要修改代码，检查 config assets 是否齐全。',
  });
  assert.equal(configAssetsWithCodeNegation.intent, 'config-assets');

  const genericSubagentInventory = routeNaturalLanguageTask({
    prompt: '列出当前可用的 subagents 清单，不要检查 config assets。',
  });
  assert.equal(genericSubagentInventory.intent, 'unknown');

  const genericSkillInventory = routeNaturalLanguageTask({
    prompt: '查看当前 skills 是否齐全。',
  });
  assert.equal(genericSkillInventory.intent, 'unknown');

  const smartGatePromptFix = routeNaturalLanguageTask({
    prompt: '更新 classifier 和 smart gate prompt，减少错误恢复循环，并补测试。',
  });
  assert.equal(smartGatePromptFix.intent, 'implementation-with-tests');
});

test('routes generic workflow compliance audit away from security review', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Audit workflow compliance for route and skill usage, report violations only.',
  });

  assert.equal(route.intent, 'bug-audit');
  assert.equal(route.auditMode, 'focused');
  assert.deepEqual(route.requiredSubagents, []);
});

test('routes compliance audit phrased before workflow target to focused bug audit', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Audit compliance with workflow and skill usage, report violations only.',
  });

  assert.equal(route.intent, 'bug-audit');
  assert.equal(route.auditMode, 'focused');
  assert.deepEqual(route.requiredSubagents, []);
});

test('routes Chinese workflow compliance audit with no-write constraint to focused bug audit', () => {
  const route = routeNaturalLanguageTask({
    prompt: '审计工作流合规性和 skill 使用情况，只报告违规，不改代码。',
  });

  assert.equal(route.intent, 'bug-audit');
  assert.equal(route.auditMode, 'focused');
  assert.deepEqual(route.requiredSubagents, []);
});

test('routes English workflow compliance audit with no-write constraint to focused bug audit', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Audit workflow compliance for route and skill usage. Do not write files; report violations only.',
  });

  assert.equal(route.intent, 'bug-audit');
  assert.equal(route.auditMode, 'focused');
  assert.deepEqual(route.requiredSubagents, []);
});

test('keeps workflow compliance report writing pending until source text is available', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Write a workflow compliance report for OMP gates; do not run tests.',
  });

  assert.equal(route.intent, 'writing.pending');
  assert.equal(route.agent, null);
  assert.deepEqual(route.routePlan.skills, []);
  assert.deepEqual(route.routePlan.tools, []);
  assert.deepEqual(route.routePlan.roles, []);
});

test('routes workflow compliance report prose editing to English writing profile', () => {
  for (const prompt of [
    'Review the workflow compliance report for grammar and clarity.',
    'Check the workflow compliance report wording.',
  ]) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.intent, 'writing.en', prompt);
    assert.equal(route.agent, 'writing-helper.writer', prompt);
    assert.deepEqual(route.requiredSubagents, [], prompt);
  }
});

test('keeps dependency license compliance security audit on security review', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Audit dependency license compliance and security vulnerabilities in this repo; report risks only and do not change code.',
  });

  assert.equal(route.intent, 'security-review');
  assert.deepEqual(route.requiredSubagents.map(({ agent }) => agent), ['ecc-security-reviewer', 'reviewer']);
});

test('keeps security compliance audit for OMP gates on security review', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Run an E2E security compliance audit for OMP gates: check auth permissions and security vulnerabilities, report risks only.',
  });

  assert.equal(route.intent, 'security-review');
  assert.deepEqual(route.requiredSubagents.map(({ agent }) => agent), ['ecc-security-reviewer', 'reviewer']);
});

test('routes extended boundary work situations without workflow confusion', () => {
  const cases = [
    ['find symbol read-only', '帮我找到 routeNaturalLanguageTask 在哪里定义，只告诉我文件和行号，不改代码。', 'unknown'],
    ['call graph read-only', '画一下 subagent gate 的调用链路，不要修改代码。', 'unknown'],
    ['explain gate cause', '解释 task tool_call 为什么会进入 subagent gate，不改代码。', 'diagnosis'],
    ['style-only diff review', 'review 当前 diff 的可维护性问题，不要修改代码。', 'unknown'],
    ['PR bug review', 'review 当前 PR diff，重点找 bug，不要修。', 'bug-audit'],
    ['API example lookup', '查这个库的 API 用法，给最小例子，不要写入文件。', 'unknown'],
    ['rename variable', '把 router.js 里的变量名改得更清楚，只改这一处。', 'implementation-with-tests'],
    ['format code', '格式化这个模块的代码并保持行为不变。', 'implementation-with-tests'],
    ['add env option', '给配置增加一个环境变量开关，并更新相关文档。', 'implementation-with-tests'],
    ['remove dead code', '清理未使用的 helper 函数和对应测试。', 'implementation-with-tests'],
    ['add package script', '给 package.json 增加一个 npm script 并验证能运行。', 'implementation-with-tests'],
    ['edit yaml config', '修改 config.yml 的 modelRoles 默认值并更新测试。', 'implementation-with-tests'],
    ['summarize CI logs', '总结这段 CI 日志失败原因，不要修。', 'diagnosis'],
    ['rerun failed CI tests', '重跑失败的 CI 测试并报告结果，不改实现。', 'testing'],
    ['update snapshot tests', '更新 snapshot 测试并确认 diff 合理。', 'bug-audit'],
    ['review weak assertions', '检查现有测试有没有弱断言和重复断言。', 'bug-audit'],
    ['write coverage plan', '写一份提升覆盖率的测试计划，不运行测试。', 'writing.zh'],
    ['implement coverage plan', '根据覆盖率缺口补测试并运行门禁。', 'bug-audit'],
    ['polish README', '润色 README 的安装说明，不发布。', 'writing.pending'],
    ['write API reference', '写一份 API reference 文档。', 'writing.zh'],
    ['generate user docs', '根据当前代码生成用户文档，不改代码。', 'writing.zh'],
    ['audit README accuracy', '检查 README 是否和当前实现一致，只报告不改。', 'unknown'],
    ['release notes from diff', '根据当前 diff 写 release notes，不推送。', 'writing.pending'],
    ['commit message writing', '帮我写一个 conventional commit message。', 'writing.zh'],
    ['translate review comment', '把这段英文 review comment 翻译成中文。', 'writing.zh'],
    ['compare test libraries', '调研 Vitest 和 node:test 的区别，给推荐，不改代码。', 'unknown'],
    ['latest official docs lookup', '查最新官方文档，确认 API 是否变更。', 'unknown'],
    ['paper contribution summary', '总结这三篇论文的主要贡献，不写综述正文。', 'writing.pending'],
    ['write related work', '写一段 related work，总结这三篇论文。', 'writing.pending'],
    ['clean CSV output', '清洗这个 CSV 文件并输出整理后的表格。', 'unknown'],
    ['edit JSON fixture', '修改 fixtures/data.json 的字段名并更新测试。', 'implementation-with-tests'],
    ['security concept only', '解释一下 CSRF 是什么。', 'unknown'],
    ['security applicability check', '解释 CSRF，并判断这个项目是否需要安全审查。', 'security-review'],
    ['security audit read-only', '审查登录接口的权限绕过风险，只报告不修。', 'security-review'],
    ['security fix', '修复登录接口的权限绕过风险并补测试。', 'security-review'],
    ['secret scan', '扫描仓库是否有 secret 泄漏，不改代码。', 'security-review'],
    ['list model roles', '列出当前配置里的 modelRoles，不改文件。', 'config-assets'],
    ['fix model roles', '修复 modelRoles 配置错误并验证。', 'implementation-with-tests'],
    ['inspect marketplace catalog', '检查 marketplace catalog 里的插件版本是否一致，只报告。', 'config-assets'],
    ['fix marketplace catalog', '修复 marketplace catalog 版本不同步的问题并打包验证。', 'implementation-with-tests'],
    ['release dry-run', '做一次发布 dry-run，不推送不升级。', 'release'],
    ['push only', '只推送当前提交，不改代码。', 'release'],
    ['write release announcement', '写发布公告，但不要发布。', 'writing.zh'],
    ['extract todos', '从这段会议纪要里提取待办事项。', 'unknown'],
    ['english security concept no code review', 'Explain XSS conceptually, no code review.', 'unknown'],
    ['polish Chinese email', '润色这封中文邮件，让语气更克制。', 'writing.zh'],
    ['calendar planning', '帮我规划明天的工作日程。', 'unknown'],
    ['make markdown table', '把这些事项整理成 Markdown 表格。', 'writing.pending'],
    ['English resume bullets', '把这段经历改成英文简历 bullet。', 'writing.en'],
    ['review test report without running tests', '检查报告里的测试章节是否准确，不运行测试。', 'writing.zh'],
    ['review test report with test verification', '检查测试报告里的结论是否准确，并运行相关测试验证。', 'bug-audit'],
    ['fix prose wording', '修复这段说明里的表述问题，不改代码。', 'writing.zh'],
    ['fix test report wording', '修复测试报告里的措辞，不运行测试。', 'writing.pending'],
    ['workflow advice only', '优化工作流建议，先不要实现。', 'unknown'],
    ['workflow implementation', '优化工作流实现并补测试。', 'implementation-with-tests'],
    ['pre-commit bug audit', '提交前审查当前改动是否有 bug，并运行必要测试。', 'bug-audit'],
    ['commit only', '提交当前改动，不要再修改文件。', 'release'],
  ];

  for (const [name, prompt, expectedIntent] of cases) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.intent, expectedIntent, name);
  }
});

test('routes operational edge workloads without workflow confusion', () => {
  const cases = [
    ['build fix', '修复 TypeScript 编译错误并补回归测试。', 'implementation-with-tests'],
    ['lint run only', '运行 eslint 和 prettier 检查，报告问题，不修改文件。', 'bug-audit'],
    ['benchmark run only', '跑一下 benchmark，对比当前实现的性能，不改代码。', 'bug-audit'],
    ['benchmark optimization', '根据 benchmark 结果优化热点函数并补测试。', 'implementation-with-tests'],
    ['database migration add', '新增数据库 migration 脚本，创建 audit_logs 表，并补测试。', 'implementation-with-tests'],
    ['database migration audit', '检查 migration 是否可回滚，只报告风险。', 'bug-audit'],
    ['ui implementation', '实现设置页面 UI，并用浏览器截图验证。', 'implementation-with-tests'],
    ['browser check only', '打开浏览器检查设置页布局和交互，不改代码。', 'bug-audit'],
    ['docker fix', '修复 Dockerfile 构建失败，并验证镜像能启动。', 'implementation-with-tests'],
    ['license audit', '审查依赖 license 合规风险，只报告。', 'security-review'],
    ['privacy audit', '检查日志里是否泄漏隐私数据，不改代码。', 'security-review'],
    ['shell one-liner', '给我一个 bash one-liner 统计当前目录文件数量，不写入项目。', 'unknown'],
    ['script file implementation', '写一个 Python 脚本加入项目，用来清理旧日志。', 'implementation-with-tests'],
    ['script example only', '演示一个 Node.js 脚本片段，说明如何读取 JSON，不写入文件。', 'unknown'],
    ['sql query only', '给我一条 SQL 查询，统计每个用户的订单数，不改数据库。', 'unknown'],
    ['sql file update', '修改 migrations/001_init.sql，增加索引并补测试。', 'implementation-with-tests'],
    ['merge conflict resolve', '解决当前 merge conflict，保持用户改动并跑测试。', 'implementation-with-tests'],
    ['push branch and create pr', '把当前分支 push 到 GitHub 并创建 PR，不改代码。', 'release'],
    ['version consistency check only', '检查 package-lock 和 package.json 版本是否一致，只报告。', 'unknown'],
    ['install diagnosis only', '定位 npm install 失败原因，不改代码。', 'diagnosis'],
    ['cleanup generated files', '清理生成的临时文件，并更新 .gitignore。', 'implementation-with-tests'],
    ['test strategy writing', '写一份测试策略文档，不运行测试。', 'writing.pending'],
    ['test cases into files', '把这些测试用例写成测试文件并运行。', 'bug-audit'],
    ['workflow route fallback test cases only', '创建 workflowRoute fallback 测试用例。', 'bug-audit'],
    ['workflow route fallback test file only', '创建 workflowRoute fallback 测试文件。', 'bug-audit'],
    ['workflow route fallback logic with test file', '创建 workflowRoute fallback 逻辑并补测试文件。', 'implementation-with-tests'],
    ['slides outline writing', '写一份中文课程 slides 大纲。', 'writing.zh'],
    ['html slides implementation', '实现 HTML slides 页面，并截图检查。', 'implementation-with-tests'],
    ['config doctor run', '运行 config doctor，检查 hooks 和 assets 是否齐全。', 'config-assets'],
    ['agent inventory', '列出当前可用 subagent 和技能清单。', 'unknown'],
    ['agent design doc', '起草 subagent fork 设计文档。', 'writing.pending'],
    ['model policy change', '修改 modelRoles.tiny 的默认模型，并更新测试。', 'implementation-with-tests'],
    ['model policy comparison', '比较 DeepSeek Flash 和 MiMo 在路由上的适用场景，不改代码。', 'unknown'],
    ['cost audit report only', '分析当前 agent 调用成本，只输出报告。', 'unknown'],
    ['cost optimization implementation', '优化 advisor 调用频率，降低成本并补测试。', 'implementation-with-tests'],
    ['error message wording implementation', '把这个错误提示文案改得更清楚，更新相关测试。', 'writing.pending'],
    ['error report writing', '写一份错误分析报告，不修代码。', 'writing.pending'],
    ['data clean local output', '清洗 CSV 数据并输出汇总表，不改项目代码。', 'writing.pending'],
    ['api mock implementation', '实现 API mock server，并补集成测试。', 'implementation-with-tests'],
    ['api docs lookup', '查 API 文档，确认参数含义，不改代码。', 'unknown'],
    ['security fix tests', '修复 XSS 风险并补安全测试。', 'security-review'],
    ['security explanation only', '解释 OAuth PKCE 流程是什么。', 'unknown'],
    ['office minutes', '整理会议纪要，提取行动项。', 'unknown'],
    ['office email polish', '润色这封中文邮件，语气简洁。', 'writing.zh'],
    ['english guide writing', 'Write a complete troubleshooting guide for plugin installation.', 'writing.pending'],
    ['english small wording', 'Improve this wording: gate failed unexpectedly.', 'writing.en'],
    ['research link collection', '收集 10 篇 recent agentic coding papers 的链接，不写综述。', 'writing.pending'],
    ['research review writing', '写一篇 agentic coding 文献综述。', 'writing.pending'],
    ['pdf download', '下载这些 DOI 对应论文 PDF，整理到 papers 目录。', 'unknown'],
    ['runtime log diagnosis', '分析日志中的 warning 和 failure，只定位原因。', 'diagnosis'],
    ['runtime warning fix', '修复 warning 导致的启动失败，并验证。', 'implementation-with-tests'],
    ['gate preflight audit', '检查门禁事前检查逻辑是否误挡，只报告不修。', 'bug-audit'],
    ['gate preflight fix', '修正门禁事前检查逻辑，并补压力测试。', 'implementation-with-tests'],
    ['classifier churn fix', '帮我修复这类分类器打转的情况。', 'implementation-with-tests'],
    ['gate validator state report', 'Gate validator 状态追踪问题说明：所有 subagent 输出文件都包含完整的 skill 加载证据 skills_loaded，但验证工具无法识别。', 'diagnosis'],
    ['delivered gate validator report', '审计完成。Gate validator 有已知 bug。所有 subagent 已成功完成。报告已交付。无更多工作。', 'diagnosis'],
    ['gate complete evidence report', '证据：GATE COMPLETE: reviewer skills [security-review] loaded and applied. 结论：Gate validator 有已知状态追踪 bug，gate 显示为 open。', 'diagnosis'],
  ];

  for (const [name, prompt, expectedIntent] of cases) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.intent, expectedIntent, name);
  }
});

test('routes mixed CI security documentation and data workloads without workflow confusion', () => {
  const cases = [
    ['ci rerun failed job', '重跑 CI 失败的 job，收集日志并报告，不改代码。', 'bug-audit'],
    ['ci workflow fix', '修复 GitHub Actions workflow 的缓存配置，并补验证。', 'implementation-with-tests'],
    ['ci yaml edit', '修改 .github/workflows/test.yml 里的 node 版本并跑测试。', 'implementation-with-tests'],
    ['lockfile update', '更新 package-lock.json，解决依赖冲突并跑测试。', 'implementation-with-tests'],
    ['diff bug review', '审查当前 diff 是否引入 bug，只列问题。', 'bug-audit'],
    ['english commit message', '帮我写一个英文 conventional commit message。', 'writing.en'],
    ['tag release', '给当前版本打 tag 并推送到 GitHub，不改代码。', 'release'],
    ['pack dry run', '运行 npm pack 做发布 dry-run，不发布。', 'release'],
    ['plugin list verification', '运行 plugin list 检查本地安装是否升级成功，不修改文件。', 'bug-audit'],
    ['config assets repair', '修复 config assets 打包遗漏，并更新测试。', 'implementation-with-tests'],
    ['config assets inventory', '列出插件打包出的 agents、skills、hooks 和 templates。', 'config-assets'],
    ['install docs polish', '润色安装文档，让步骤更清楚。', 'writing.pending'],
    ['install script fix', '修复 setup.sh 安装脚本的路径错误，并补测试。', 'implementation-with-tests'],
    ['shell command answer', '给我一条命令查看当前系统时间，不写入项目。', 'unknown'],
    ['cron expression example', '给一个 cron 表达式示例，每小时运行一次，不写文件。', 'unknown'],
    ['sql slow query explanation', '解释这条 SQL 查询为什么慢，不改数据库。', 'unknown'],
    ['sql migration generation', '生成 migrations/002_add_user_index.sql 并验证回滚。', 'implementation-with-tests'],
    ['secret docs lookup', '查 secret scanning 的官方文档链接，不改代码。', 'unknown'],
    ['secret scan repo', '扫描仓库是否有 secret 泄露，只报告。', 'security-review'],
    ['secret redaction fix', '修复日志 secret 泄漏，增加脱敏测试。', 'security-review'],
    ['privacy policy writing', '写一份隐私政策草稿。', 'writing.zh'],
    ['security announcement writing', '起草安全公告，不审代码。', 'writing.pending'],
    ['oauth docs lookup', '查 OAuth PKCE 官方文档并给链接，不改代码。', 'unknown'],
    ['model provider config', '增加一个模型 provider 配置项，并更新文档和测试。', 'implementation-with-tests'],
    ['model routing advice only', '分析模型路由策略的优缺点，给建议，不改代码。', 'unknown'],
    ['classifier whitelist update', '更新 classifier 模型白名单代码，并补回归测试。', 'implementation-with-tests'],
    ['model config inventory', '列出当前 modelRoles 和 provider 配置，不改文件。', 'config-assets'],
    ['model price research', '调研 DeepSeek 和 MiMo 的价格与上下文长度，列出链接。', 'unknown'],
    ['large Chinese office writing', '写一份中文季度工作总结，包含成果、风险和下季度计划。', 'writing.pending'],
    ['small Chinese revision', '把这句中文改得更短：该功能的可观测性仍有进一步提升空间。', 'writing.pending'],
    ['error string file edit', 'Polish the error message string in src/errors.ts and update tests.', 'implementation-with-tests'],
    ['error wording only', 'Polish this error message wording: Gate failed unexpectedly.', 'writing.en'],
    ['readme fragment translation', '把 README 这段安装说明翻译成英文。', 'writing.en'],
    ['comment translation in file', '把 src/router.js 里的中文注释翻译成英文，并跑测试。', 'implementation-with-tests'],
    ['comment style explanation', '说明代码注释应该遵循什么风格，不改文件。', 'unknown'],
    ['bug audit test matrix', '为 bug-audit 工作流生成大量边界测试用例，但不要写入文件。', 'bug-audit'],
    ['bug audit online examples', '总结被测代码块，再查找类似测试用例经验，用于 bug 审计。', 'bug-audit'],
    ['fork route audit', '测试 subagent fork 逻辑在不同负载下是否误路由，只报告。', 'bug-audit'],
    ['fork route fix', '修复 subagent fork 路由误判，并补压力测试。', 'implementation-with-tests'],
    ['arxiv pdf download', '下载这些 arXiv 论文 PDF，整理文件名。', 'unknown'],
    ['latex section writing', 'Write a LaTeX methods section for the experiment.', 'writing.pending'],
    ['latex compile fix', '修复 main.tex 的 LaTeX 编译错误，并重新生成 PDF。', 'implementation-with-tests'],
    ['latex compile check', '编译 LaTeX 并报告 warnings，不修改文件。', 'bug-audit'],
    ['image asset generation', '生成一张产品 hero 图，不改代码。', 'unknown'],
    ['frontend visual fix', '修复移动端按钮文字溢出，并用截图验证。', 'implementation-with-tests'],
    ['frontend visual audit', '检查移动端布局是否有重叠，只报告截图问题。', 'bug-audit'],
    ['database backup command', '给我一条 pg_dump 备份命令，不写脚本。', 'unknown'],
    ['database backup script', '新增 scripts/backup-db.sh，支持 pg_dump 并补文档。', 'implementation-with-tests'],
    ['meeting action items', '把会议记录整理成行动项清单。', 'writing.pending'],
    ['markdown table writing', '把这些性能数据整理成 Markdown 表格。', 'writing.pending'],
    ['json fixture inspect', '检查 fixtures/users.json 是否缺字段，只报告。', 'bug-audit'],
    ['json fixture edit', '修改 fixtures/users.json 的字段结构并更新测试。', 'implementation-with-tests'],
    ['api contract audit', '审查 API contract 是否和实现一致，只报告。', 'bug-audit'],
    ['api contract update', '更新 API contract fixture，并补集成测试。', 'implementation-with-tests'],
    ['browser manual check', '打开浏览器登录后台，检查用户列表能否加载，不改代码。', 'bug-audit'],
    ['browser copywriting', '润色登录页按钮文案，不改代码。', 'writing.pending'],
    ['i18n file update', '更新 locales/zh.json 的翻译并跑测试。', 'implementation-with-tests'],
    ['i18n sentence translation', '把这句话翻译成英文：门禁误挡了任务。', 'writing.en'],
    ['dependency audit', '检查依赖是否有漏洞和 license 风险，只报告。', 'security-review'],
    ['dependency safe bump', '升级 vulnerable dependency 并补安全回归测试。', 'security-review'],
  ];

  for (const [name, prompt, expectedIntent] of cases) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.intent, expectedIntent, name);
  }
});

test('routes command data notebook and publication workloads without workflow confusion', () => {
  const cases = [
    ['regex explanation', '解释这个正则表达式每一段的含义，不改文件。', 'unknown'],
    ['regex file fix', '修复 src/parser.ts 里的正则边界 bug，并补测试。', 'implementation-with-tests'],
    ['jq command only', '给我一条 jq 命令提取 JSON 里的 id，不写脚本。', 'unknown'],
    ['jq script file', '新增 scripts/extract-ids.sh，使用 jq 提取 JSON 字段。', 'implementation-with-tests'],
    ['docker compose audit', '检查 docker-compose.yml 端口和 volume 配置是否有问题，只报告。', 'bug-audit'],
    ['docker compose fix', '修复 docker-compose.yml 的端口映射，并验证服务启动。', 'implementation-with-tests'],
    ['k8s manifest fix', '更新 k8s deployment manifest 的资源限制，并补验证。', 'implementation-with-tests'],
    ['helm values audit', '检查 helm values 是否缺少 required 字段，只报告。', 'bug-audit'],
    ['env example update', '更新 .env.example，补充新的 API_KEY 配置说明。', 'implementation-with-tests'],
    ['env local explanation', '解释 .env 里这个变量的作用，不改文件。', 'unknown'],
    ['jira ticket writing', '写一个 Jira ticket，描述这个 gate 误挡问题。', 'writing.zh'],
    ['bug reproduction test', '为这个 bug 写复现测试，不修实现。', 'bug-audit'],
    ['regression test file', '新增 regression test 文件覆盖这个边界。', 'bug-audit'],
    ['failing test assertion fix', '修复失败的测试断言，并确认实现没有被误改。', 'bug-audit'],
    ['mutation rerun', '重跑 mutation testing，报告 survived mutants。', 'testing'],
    ['screenshot review', '审查 Playwright screenshots，找布局重叠问题，不改代码。', 'bug-audit'],
    ['image generation', '生成一张透明背景 logo 图片，不改代码。', 'unknown'],
    ['dataset download', '下载这个公开数据集并整理文件名。', 'unknown'],
    ['notebook create', '新增 notebooks/analyze.ipynb，读取 CSV 并输出图表。', 'implementation-with-tests'],
    ['csv stats only', '分析 CSV 的缺失值和分布，只输出统计结果。', 'unknown'],
    ['paper peer review writing', '写一份中文审稿意见，评价论文贡献和实验。', 'writing.pending'],
    ['paper logic review writing', '审查这篇论文段落的逻辑并润色语言。', 'writing.pending'],
    ['diff maintainability only', 'review 当前 diff 的可维护性问题，不要找 bug，不改代码。', 'unknown'],
    ['diff security risk', 'review 当前 diff 的安全风险和 auth bypass，只报告。', 'security-review'],
    ['auth middleware fix', '修复 auth middleware 的权限绕过问题，并补测试。', 'security-review'],
    ['security tool docs', '查 semgrep secret 规则的官方文档链接，不改代码。', 'unknown'],
    ['license memo writing', '写一份 license 合规说明给法务，不审代码。', 'writing.pending'],
    ['english changelog', '写一份英文 changelog，总结这次插件修复。', 'writing.en'],
    ['english release notes', '写英文 release notes，不发布。', 'writing.en'],
    ['Chinese release notes', '写中文 release notes，不发布。', 'writing.zh'],
    ['release notes publish', '发布当前 release notes 到 GitHub。', 'release'],
    ['latest docs lookup', '查最新官方文档，确认 CLI 参数是否变更。', 'unknown'],
    ['web research links', '上网调研三个类似插件的实现方式，列出链接。', 'unknown'],
    ['bibtex download', '下载这些论文的 BibTeX，整理成 references.bib。', 'writing.pending'],
    ['bib file edit', '修改 references.bib，补全缺失字段并重新编译。', 'implementation-with-tests'],
    ['citation fix', '修复 main.tex 里的 citation 编译错误，并重新生成 PDF。', 'implementation-with-tests'],
    ['latex text polish in file', '润色 main.tex 里的 related work 段落并重新编译。', 'writing.pending'],
    ['latex text polish only', '润色下面这段 related work，不改文件。', 'writing.pending'],
    ['date command', '告诉我用什么命令查看当前日期，不写脚本。', 'unknown'],
    ['port kill command', '给我一条命令查找并结束占用 3000 端口的进程，不写脚本。', 'unknown'],
    ['port conflict fix', '修复 dev server 端口冲突处理逻辑，并补测试。', 'implementation-with-tests'],
    ['memory lookup', '查一下之前关于路由策略的记忆，总结要点，不改代码。', 'writing.pending'],
    ['memory note update', '新增一条 memory note，记录这次路由修复经验。', 'unknown'],
    ['agent role audit', '检查 subagent role 字段是否会被误解释为类型，只报告。', 'bug-audit'],
    ['agent role fix', '修复 subagent role 字段被误解释的问题，并补回归测试。', 'implementation-with-tests'],
    ['classifier prompt audit', '审查 classifier prompt 是否会诱导错误路由，只报告。', 'bug-audit'],
    ['classifier prompt update', '更新 classifier prompt，让测试生成任务优先走 bug-audit。', 'implementation-with-tests'],
    ['mobile copy polish', '润色移动端空状态文案，不改代码。', 'writing.pending'],
    ['mobile copy file edit', '修改 src/i18n/zh.json 里的空状态文案并跑测试。', 'implementation-with-tests'],
    ['product requirements writing', '起草一份产品需求文档，描述路由矩阵能力。', 'writing.pending'],
  ];

  for (const [name, prompt, expectedIntent] of cases) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.intent, expectedIntent, name);
  }
});

test('routes infrastructure api schema and policy workloads without workflow confusion', () => {
  const cases = [
    ['terraform plan', '运行 terraform plan，报告 drift，不修改文件。', 'bug-audit'],
    ['terraform fix', '修复 terraform module 的变量默认值，并验证 plan。', 'implementation-with-tests'],
    ['openapi docs lookup', '查 OpenAPI 3.1 的官方文档链接，不改代码。', 'unknown'],
    ['openapi spec audit', '检查 OpenAPI spec 是否和实现一致，只报告。', 'bug-audit'],
    ['openapi spec update', '更新 openapi.yaml，补充新接口并跑契约测试。', 'implementation-with-tests'],
    ['mcp tools list', '列出当前 MCP tools 的能力清单，不改文件。', 'unknown'],
    ['mcp tool add', '新增一个 MCP tool 定义，并补集成测试。', 'implementation-with-tests'],
    ['makefile target add', '给 Makefile 新增 test-router target，并验证能运行。', 'implementation-with-tests'],
    ['makefile security audit', '检查 Makefile target 是否有危险命令，只报告。', 'security-review'],
    ['prettier check', '运行 prettier --check，报告格式问题，不修改文件。', 'bug-audit'],
    ['prettier format', '运行 prettier 格式化 src 目录，并确认 diff。', 'implementation-with-tests'],
    ['markdown spellcheck', '检查 README.md 的拼写和语法，不改文件。', 'writing.zh'],
    ['readme file edit', '修改 README.md 的安装章节并跑链接检查。', 'implementation-with-tests'],
    ['npm audit', '运行 npm audit，检查漏洞，只报告。', 'security-review'],
    ['npm audit fix', '修复 npm audit 报告的 high severity 漏洞并补测试。', 'security-review'],
    ['sql permission audit', '审查 SQL 权限配置是否可能越权，只报告。', 'security-review'],
    ['linkedin post', '写一条英文 LinkedIn post 宣布插件更新。', 'writing.en'],
    ['json translation file', '翻译 locales/en.json 里的按钮文案并跑测试。', 'implementation-with-tests'],
    ['math answer', '计算 37 * 42 的结果，不写代码。', 'unknown'],
    ['table sort', '把这些条目按优先级整理成表格。', 'writing.pending'],
    ['roadmap writing', '写一份中文产品 roadmap。', 'writing.zh'],
    ['roadmap research', '调研竞品 roadmap 写法，列出链接，不写正文。', 'unknown'],
    ['browser accessibility audit', '用浏览器检查页面可访问性问题，只报告。', 'bug-audit'],
    ['browser accessibility fix', '修复页面可访问性问题，并用浏览器验证。', 'implementation-with-tests'],
    ['schema generate', '生成 schema.graphql 文件并补 resolver 测试。', 'implementation-with-tests'],
    ['schema audit', '检查 schema.graphql 和 resolver 是否一致，只报告。', 'bug-audit'],
    ['workflow plan only', '制定修复 gate 的实现计划，先不要写代码。', 'unknown'],
    ['workflow execute plan', '按计划修复 gate，并补回归测试。', 'implementation-with-tests'],
    ['subagent inventory', '查看当前 packaged subagents 是否齐全，只报告。', 'config-assets'],
    ['subagent add', '新增一个 reviewer subagent 模板，并更新 marketplace。', 'implementation-with-tests'],
    ['browser copy check', '检查登录页文案是否清楚，不改代码。', 'writing.zh'],
    ['browser copy file', '修改登录页文案文件并跑截图验证。', 'writing.pending'],
    ['policy docs lookup', '查 GitHub Actions permissions 官方文档，不改代码。', 'unknown'],
    ['policy security audit', '审查 GitHub Actions permissions 是否过宽，只报告。', 'security-review'],
    ['policy security fix', '收紧 GitHub Actions permissions，并验证 workflow。', 'security-review'],
  ];

  for (const [name, prompt, expectedIntent] of cases) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.intent, expectedIntent, name);
  }
});

test('routes writing workflow edge cases with advisory resources and source-language status', () => {
  const writingTools = ['writing_logic_check', 'writing_quality_check'];
  const writingCases = [
    ['zh simple sentence', '把这句话改成朴素直接的中文：我们需要进一步推动能力沉淀。', 'writing.zh', 'simple', []],
    ['zh simple paragraph', '润色下面这段中文段落，让语气更自然。', 'writing.zh', 'simple', []],
    ['zh complex report', '请写一份中文长篇项目总结报告，包含背景、方法、结果和风险。', 'writing.zh', 'complex', ['zh-writer', 'zh-checker']],
    ['zh review response', '帮我起草中文审稿回复，要求语气克制、逻辑清楚。', 'writing.pending', 'complex', []],
    ['zh test report without running tests', '请写测试报告，重点说明当前验证风险，不要运行测试。', 'writing.pending', 'complex', []],
    ['test report with verification', '检查测试报告里的结论是否准确，并运行相关测试验证。', 'bug-audit', null, []],
    ['zh security announcement writing', '起草一份中文安全公告，不做代码安全审计。', 'writing.pending', 'complex', []],
    ['zh license memo writing', '写一份 license 合规说明给法务，不审代码。', 'writing.pending', 'complex', []],
    ['security audit remains security', '审查当前 GitHub Actions permissions 是否过宽，只报告。', 'security-review', null, ['ecc-security-reviewer', 'reviewer']],
    ['security docs lookup remains unknown', '查 GitHub Actions permissions 官方文档，不改代码。', 'unknown', null, ['ecc-security-reviewer', 'reviewer']],
    ['copy file edit remains implementation', '修改 src/i18n/zh.json 里的空状态文案并跑测试。', 'implementation-with-tests', null, []],
    ['latex text file edit waits for body language', '润色 main.tex 里的 related work 段落并重新编译。', 'writing.pending', 'complex', []],
    ['latex text snippet waits for body text', '润色下面这段 related work，不改文件。', 'writing.pending', 'simple', []],
    ['research links remain unknown', '调研竞品 roadmap 写法，列出链接，不写正文。', 'unknown', null, []],
    ['literature review writing', '写一份文献综述，比较三类方法。', 'writing.pending', 'complex', []],
    ['en simple sentence', 'Polish this sentence for clarity and keep it concise.', 'writing.pending', 'simple', []],
    ['en grammar fix', 'Fix grammar in this paragraph.', 'writing.en', 'simple', []],
    ['en abstract proofread', 'Proofread this abstract for grammar and style.', 'writing.pending', 'complex', []],
    ['en related work writing', 'Draft an English related work paragraph for a systems paper and check the logic.', 'writing.en', 'complex', ['writer', 'checker']],
    ['en guide writing', 'Write a complete troubleshooting guide for plugin installation.', 'writing.pending', 'complex', []],
    ['en release notes', 'Write English release notes for the plugin fix; do not publish.', 'writing.en', 'complex', ['writer', 'checker']],
    ['zh prompt for en release notes', '写英文 release notes，不发布。', 'writing.en', 'complex', ['writer', 'checker']],
    ['zh prompt for en email', '写一封英文邮件，说明插件升级风险。', 'writing.en', 'complex', ['writer', 'checker']],
    ['zh prompt for en bug report', '写一份英文 bug report，包含复现步骤和影响范围，不运行测试。', 'writing.en', 'complex', ['writer', 'checker']],
    ['en bug report without tests', 'Write a bug report with reproduction steps; do not run tests.', 'writing.pending', 'complex', []],
    ['en security announcement writing', 'Draft a security announcement for users; do not audit code.', 'writing.pending', 'complex', []],
    ['en privacy policy writing', 'Write a privacy policy draft for the product.', 'writing.pending', 'complex', []],
    ['en license memo writing', 'Draft a license compliance memo for legal; do not audit dependencies.', 'writing.pending', 'complex', []],
    ['en security audit remains security', 'Audit the Makefile target for dangerous commands and report risks.', 'security-review', null, []],
    ['en docs lookup remains unknown', 'Look up the official OpenAPI docs and list relevant links; do not write prose.', 'unknown', null, []],
    ['pure readme wording edit waits for body language', 'Polish README.md installation wording and save the changes.', 'writing.pending', 'simple', []],
    ['comment file translation remains implementation', 'Translate comments in src/router.js to English and run tests.', 'implementation-with-tests', null, []],
    ['en paper paragraph waits for body text', 'Review the logic of this paper paragraph and improve the wording.', 'writing.pending', 'simple', []],
    ['en linkedin post', 'Write an English LinkedIn post announcing the plugin update.', 'writing.en', 'complex', ['writer', 'checker']],
    ['en changelog entry', 'Draft a changelog entry for the route workflow fixes.', 'writing.pending', 'complex', []],
    ['writing tool failure remains implementation', 'Fix the writing_quality_check tool failure and add regression tests.', 'implementation-with-tests', null, []],
    ['plugin workflow logic optimization remains implementation', '帮我优化插件的工作流逻辑，并补测试。', 'implementation-with-tests', null, []],
  ];

  for (const [name, prompt, expectedIntent, expectedComplexity, expectedSubagents] of writingCases) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.intent, expectedIntent, name);
    assert.deepEqual(route.routePlan.roles.map(({ agent }) => agent), expectedSubagents, name);
    if (expectedComplexity) {
      assert.equal(route.writingComplexity, expectedComplexity, `${name} complexity`);
      const expectedTools = expectedIntent !== 'writing.pending' && expectedComplexity === 'complex'
        ? writingTools
        : [];
      assert.deepEqual(route.routePlan.tools, expectedTools, `${name} tools`);
    }
  }
});

test('routes bug-report artifacts without confusing their subject with implementation', () => {
  const cases = [
    ['Write a bug report for the parser bug; do not run tests.', 'writing.pending'],
    ['写一份英文 bug report，描述 parser 的 bug，不运行测试。', 'writing.en'],
    ['Summarize the existing bug report without inspecting code or running tests.', 'writing.pending'],
    ['Create a bug report for the parser issue.', 'writing.pending'],
    ['Prepare a bug report for the parser issue.', 'writing.pending'],
    ['File a bug report for the parser issue.', 'writing.pending'],
    ['Fix the bug described in the bug report.', 'implementation-with-tests'],
    ['Write a bug report generator in src/report.js.', 'implementation-with-tests'],
    ['Revise the bug report parser implementation.', 'implementation-with-tests'],
    ['Write tests from this bug report.', 'implementation-with-tests'],
    ['Write a bug report and fix the parser bug.', 'implementation-with-tests'],
    ['Create a bug report; repair the parser.', 'implementation-with-tests'],
    ['Prepare a bug report. Resolve the parser issue.', 'implementation-with-tests'],
    ['写一份 bug report，修一下 parser。', 'implementation-with-tests'],
    ['Write a complete troubleshooting guide.', 'writing.pending'],
  ];

  for (const mode of ['observe', 'enforce']) {
    for (const [prompt, intent] of cases) {
      const route = routeNaturalLanguageTask({ prompt, routerMode: mode });
      assert.equal(route.intent, intent, `${mode}: ${prompt}`);
      assert.equal(route.routePlan.mode, 'advisory', `${mode}: ${prompt}`);
      assert.equal(route.routePlan.autoContinue, false, `${mode}: ${prompt}`);
      assert.equal('gateRequirements' in route.routePlan, false, `${mode}: ${prompt}`);
    }
  }
});

test('routes observed E2E summaries without turning a no-rerun clause into test authority', () => {
  for (const mode of ['observe', 'enforce']) {
    for (const [prompt, intent] of [
      ['总结本轮 E2E 测试结果，不重新运行测试。', 'writing.pending'],
      ['总结本轮 E2E 测试结果，不再运行测试。', 'writing.pending'],
      ['整理已观测到的测试问题，不做任何新测试。', 'writing.pending'],
      ['总结本轮 E2E 测试结果。', 'writing.pending'],
      ['Summarize the observed E2E results; do not run new tests.', 'writing.pending'],
    ]) {
      const summary = routeNaturalLanguageTask({ prompt, routerMode: mode });
      assert.equal(summary.intent, intent, `${mode}: ${prompt}`);
      assert.equal(summary.taskDescriptor.constraints.testExecution, 'forbidden', `${mode}: ${prompt}`);
    }

    const rerun = routeNaturalLanguageTask({
      prompt: '总结本轮 E2E 测试结果，然后重新运行失败测试。',
      routerMode: mode,
    });
    assert.equal(rerun.intent, mode === 'enforce' ? 'testing' : 'bug-audit', mode);
    assert.equal(rerun.taskDescriptor.constraints.testExecution, 'required', mode);
  }
});

test('routes a primary testing workflow run directly without writing or audit escalation', () => {
  const prompt = 'Run the testing workflow and summarize the gate result.';
  for (const routerMode of ['observe', 'enforce']) {
    const route = routeNaturalLanguageTask({ prompt, routerMode });
    assert.equal(route.intent, 'testing', routerMode);
    assert.equal(route.workflowRoute, 'code.test', routerMode);
    assert.equal(route.taskDescriptor.operation, 'execute', routerMode);
    assert.equal(route.taskDescriptor.constraints.testExecution, 'required', routerMode);
    assert.equal(route.routePlan.mode, 'advisory', routerMode);
    assert.equal(route.routePlan.autoContinue, false, routerMode);
    assert.deepEqual(route.routePlan.skills, ['verification-before-completion'], routerMode);
    assert.deepEqual(route.routePlan.tools, ['omp_test_report'], routerMode);
    assert.deepEqual(route.routePlan.roles, [], routerMode);
    assert.equal('gateRequirements' in route.routePlan, false, routerMode);
  }
});

test('routes one requested regression test as a focused direct audit contract', () => {
  const prompt = 'Write one regression test for routeNaturalLanguageTask.';
  for (const routerMode of ['observe', 'enforce']) {
    const route = routeNaturalLanguageTask({ prompt, routerMode });
    assert.equal(route.intent, 'bug-audit', routerMode);
    assert.equal(route.auditMode, 'focused', routerMode);
    assert.equal(route.taskDescriptor.complexity, 'focused', routerMode);
    assert.equal(route.taskDescriptor.constraints.testExecution, 'required', routerMode);
    assert.deepEqual(route.requiredSkills, ['test-driven-development', 'verification-before-completion'], routerMode);
    assert.deepEqual(route.requiredTools, ['omp_test_analyze', 'omp_test_report'], routerMode);
    assert.deepEqual(route.requiredSubagents, [], routerMode);
  }
});

test('required route skills are registered in the root marketplace catalog', async () => {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const catalog = JSON.parse(await readFile(path.join(repoRoot, '.omp-plugin', 'marketplace.json'), 'utf8'));
  const registeredSkills = await registrySkillNames(repoRoot, catalog);

  for (const item of routingCases) {
    const route = routeNaturalLanguageTask({ prompt: item.prompt });
    const requiredSkills = new Set([
      ...route.requiredSkills,
      ...route.requiredSubagents.flatMap(({ requiredSkills: subagentSkills = [] }) => subagentSkills),
    ]);

    for (const skill of requiredSkills) {
      assert.equal(registeredSkills.has(skill), true, `${item.name} requires unregistered skill ${skill}`);
    }
  }
});

test('required route subagents are packaged by owning workflow plugins', async () => {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const roots = [
    path.join(repoRoot, 'plugins', 'omp-config', 'agents'),
    path.join(repoRoot, 'plugins', 'writing-helper', 'agents'),
    path.join(repoRoot, 'plugins', 'omp-fact-checker', 'agents'),
  ];

  for (const item of routingCases) {
    for (const agent of item.requiredSubagents) {
      const found = await Promise.all(
        roots.map(async (root) => {
          try {
            await readFile(path.join(root, `${agent}.md`), 'utf8');
            return true;
          } catch {
            return false;
          }
        }),
      );

      assert.equal(found.some(Boolean), true, `${item.name} requires unpackaged subagent ${agent}`);
    }
  }
});

test('fact-check route pins planning and review checkpoints to higher-capability model roles', () => {
  const route = routeNaturalLanguageTask({
    prompt: '帮我事实核查这段文字里的数据、年份和引用真实性。',
  });
  const byAgent = new Map(route.requiredSubagents.map((item) => [item.agent, item]));

  assert.deepEqual(byAgent.get('fact-planner')?.modelRoles, ['pi/plan', 'pi/slow']);
  assert.deepEqual(byAgent.get('fact-cross-checker')?.modelRoles, ['pi/slow']);
  assert.deepEqual(byAgent.get('fact-reviewer')?.modelRoles, ['pi/slow']);
  assert.equal(byAgent.get('fact-researcher-a')?.modelRoles, undefined);
  assert.equal(byAgent.get('fact-researcher-b')?.modelRoles, undefined);
});

test('packaged fact-check agents declare the model roles used by routing', async () => {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const agentsRoot = path.join(repoRoot, 'plugins', 'omp-fact-checker', 'agents');

  const planner = await readFile(path.join(agentsRoot, 'fact-planner.md'), 'utf8');
  const crossChecker = await readFile(path.join(agentsRoot, 'fact-cross-checker.md'), 'utf8');
  const reviewer = await readFile(path.join(agentsRoot, 'fact-reviewer.md'), 'utf8');

  assert.match(planner, /model:\s*\n\s*-\s*pi\/plan\s*\n\s*-\s*pi\/slow/);
  assert.match(crossChecker, /model:\s*\n\s*-\s*pi\/slow/);
  assert.match(reviewer, /model:\s*\n\s*-\s*pi\/slow/);
});

test('subagent providers match the configured workflow ownership', async () => {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const ownerAgents = {
    'omp-config': await agentNames(path.join(repoRoot, 'plugins', 'omp-config', 'agents')),
    'writing-helper': await agentNames(path.join(repoRoot, 'plugins', 'writing-helper', 'agents')),
    'omp-fact-checker': await agentNames(path.join(repoRoot, 'plugins', 'omp-fact-checker', 'agents')),
  };
  const testingEnhancerAgents = await agentNames(path.join(repoRoot, 'plugins', 'omp-test-enhancer', 'agents'));

  assert.deepEqual([...testingEnhancerAgents], [], 'omp-testing-enhancer is tool-only; testing subagents are routed through omp-config');

  for (const item of routingCases) {
    const owner = expectedSubagentOwner(item.expectedIntent);
    if (!owner) {
      assert.deepEqual(item.requiredSubagents, [], `${item.name} should not require subagents`);
      continue;
    }

    for (const agent of item.requiredSubagents) {
      assert.equal(ownerAgents[owner].has(agent), true, `${item.name} should use ${owner} subagent ${agent}`);
      for (const [otherOwner, names] of Object.entries(ownerAgents)) {
        if (otherOwner !== owner) assert.equal(names.has(agent), false, `${item.name} should not resolve ${agent} from ${otherOwner}`);
      }
    }
  }
});

test('forces plain-chinese-writing before any other Chinese writing skill', () => {
  const route = routeNaturalLanguageTask({
    prompt: '把下面中文博士论文段落改得更平直，去掉 AI 味。',
  });

  assert.equal(route.intent, 'writing.zh');
  assert.equal(route.requiredSkills[0], 'plain-chinese-writing');
  assert.equal(new Set(route.requiredSkills).size, route.requiredSkills.length);
});

test('keeps bodyless Chinese writing pending until source text or an explicit output language is available', () => {
  for (const [prompt, expectedIntent, expectedRoles = []] of [
    ['请写一份项目报告', 'writing.pending'],
    ['请写测试报告，重点说明当前验证风险，不要生成测试代码。', 'writing.pending'],
    ['请写一份测试覆盖率报告，说明当前风险。', 'writing.pending'],
    ['帮我起草中文文档', 'writing.zh', ['zh-writer', 'zh-checker']],
    ['请帮我润色这段中文风险提示，写得安全、克制、直接。', 'writing.pending'],
    ['请审查这段中文安全说明的逻辑表达，不要做代码安全审计。', 'writing.zh'],
  ]) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.intent, expectedIntent, prompt);
    assert.equal(route.routePlan.mode, 'advisory', prompt);
    assert.equal(route.routePlan.tools.some((tool) => tool.startsWith('omp_test_')), false, prompt);
    assert.deepEqual(route.routePlan.roles.map(({ agent }) => agent), expectedRoles, prompt);
  }
});

test('suggests English writing resources only when the output language is explicit', () => {
  for (const [prompt, expectedIntent, expectedRoles] of [
    ['Draft an English related work paragraph for a systems paper and check the logic.', 'writing.en', ['writer', 'checker']],
    ['Write a test coverage report for the release notes; do not run tests.', 'writing.pending', []],
  ]) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.intent, expectedIntent, prompt);
    assert.deepEqual(route.routePlan.roles.map(({ agent }) => agent), expectedRoles, prompt);
    assert.deepEqual(
      route.routePlan.roles.map(({ agent, skills }) => ({ agent, skills })),
      expectedRoles.length > 0
        ? [
          { agent: 'writer', skills: ['writing-markdown-helper'] },
          { agent: 'checker', skills: ['writing-checkers'] },
        ]
        : [],
      prompt,
    );
    assert.equal(route.routePlan.tools.some((tool) => tool.startsWith('omp_test_')), false, prompt);
    assert.equal(route.routePlan.skills.includes('writing-plans'), false, prompt);
  }
});

test('keeps bodyless simple English writing edits pending without language-specific resources', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Polish this sentence for clarity and keep it concise.',
  });

  assert.equal(route.intent, 'writing.pending');
  assert.equal(route.writingComplexity, 'simple');
  assert.deepEqual(route.routePlan.skills, []);
  assert.deepEqual(route.routePlan.tools, []);
  assert.deepEqual(route.routePlan.roles, []);
  assert.doesNotMatch(route.routeCard, /writing-checkers/);
});

test('leaves unrelated prompts unclaimed instead of inventing a plugin workflow', () => {
  for (const prompt of [
    '今天下午三点提醒我给妈妈打电话。',
    'What is the capital of France?',
  ]) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.intent, 'unknown', prompt);
    assert.equal(route.agent, null, prompt);
    assert.deepEqual(route.requiredSkills, [], prompt);
    assert.deepEqual(route.requiredTools, [], prompt);
    assert.deepEqual(route.requiredSubagents, [], prompt);
    assert.equal(route.source, 'natural-language', prompt);
    assert.equal(route.workflowRoute, 'agentic.simple', prompt);
  }
});

test('routes result-only plugin load bug smoke as focused audit', () => {
  for (const prompt of [
    'Run plugin load smoke and check for bugs, result only.',
    'Check plugin load smoke for bugs, result only.',
    'Execute plugin load smoke for bugs, result only.',
  ]) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.intent, 'bug-audit', prompt);
    assert.equal(route.auditMode, 'focused', prompt);
    assert.deepEqual(route.requiredSubagents, [], prompt);
    assert.equal(route.workflowRoute, 'code.review', prompt);
  }
});

test('enforce mode keeps a focused code edit with a trailing status report out of writing routes', () => {
  const prompt = 'Fix only src/parser.js so parseCsv trims whitespace around every comma-separated item. Do not modify any other file. Do not run tests. Do not use subagents. Do not access the network. Read src/parser.js, make one focused edit, read back src/parser.js, and report concisely.';
  const route = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });

  assert.equal(route.intent, 'implementation-with-tests');
  assert.equal(route.workflowRoute, 'code.dev');
  assert.deepEqual(route.taskDescriptor.domains, ['code']);
  assert.equal(route.taskDescriptor.complexity, 'focused');
  assert.deepEqual(route.requiredSkills, ['verification-before-completion']);
  assert.deepEqual(route.requiredTools, []);
  assert.deepEqual(route.requiredSubagents, []);
  assert.equal(route.routePlan.mode, 'advisory');
  assert.equal(route.routePlan.autoContinue, false);
  assert.deepEqual(route.routePlan.qualityChecks, ['review-evidence']);
  assert.equal('gateRequirements' in route.routePlan, false);
  assert.doesNotMatch(route.routeCard, /writing-markdown-helper|writing-checkers|writing_(?:logic|quality)_check/i);
});

async function registrySkillNames(repoRoot, catalog) {
  const names = new Set();
  const pluginRoot = catalog.metadata?.pluginRoot ?? '';
  for (const plugin of catalog.plugins ?? []) {
    const source = String(plugin.source ?? plugin.name ?? '').replace(/^\.\//, '');
    for (const skillPath of plugin.skills ?? []) {
      const skillDir = String(skillPath).replace(/^\.\//, '');
      const skillFile = path.join(repoRoot, pluginRoot, source, skillDir, 'SKILL.md');
      const text = await readFile(skillFile, 'utf8');
      const name = skillFrontmatterName(text);
      if (name) names.add(name);
    }
  }
  return names;
}

async function agentNames(root) {
  try {
    const entries = await readdir(root);
    return new Set(entries.filter((entry) => entry.endsWith('.md')).map((entry) => entry.replace(/\.md$/, '')));
  } catch {
    return new Set();
  }
}

function expectedSubagentOwner(intent) {
  if (intent === 'writing.zh' || intent === 'writing.en') return 'writing-helper';
  if (intent === 'fact-check') return 'omp-fact-checker';
  if (['bug-audit', 'implementation-with-tests', 'security-review', 'config-assets'].includes(intent)) return 'omp-config';
  return null;
}

function skillFrontmatterName(text) {
  const match = String(text).match(/^name:\s*['"]?([^'"\r\n]+)['"]?\s*$/m);
  return match?.[1]?.trim() ?? '';
}
