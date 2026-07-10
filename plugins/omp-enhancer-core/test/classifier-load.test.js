import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildClassifierPrompt,
  classifierDefaults,
  resolveClassificationRoute,
} from '../src/classifier.js';

const validRouteCases = [
  caseFor({
    name: 'zh writing',
    prompt: '请帮我润色这段中文论文摘要，要求语气自然，不要有翻译腔。',
    intent: 'writing.zh',
    language: 'zh',
    riskFlags: ['needs-writing-qa', 'needs-subagents'],
    expectedAgent: 'writing-helper.zh-writer',
    expectedSubagents: ['zh-writer', 'zh-checker'],
  }),
  caseFor({
    name: 'en writing',
    prompt: 'Draft an English related work paragraph for a systems paper and check the logic.',
    intent: 'writing.en',
    language: 'en',
    riskFlags: ['needs-writing-qa', 'needs-review'],
    expectedAgent: 'writing-helper.writer',
    expectedSubagents: ['writer', 'checker'],
  }),
  caseFor({
    name: 'implementation',
    prompt: '修复这个插件 bug，并补充高信号单元测试。',
    intent: 'implementation-with-tests',
    language: 'zh',
    riskFlags: ['needs-tests', 'needs-review', 'needs-subagents'],
    expectedAgent: 'implementer',
    expectedSubagents: ['plan', 'implementation-task', 'reviewer'],
  }),
  caseFor({
    name: 'legacy testing classifier',
    prompt: '为 classifier 写高信号单元测试，覆盖 fallback 和边界。',
    intent: 'testing',
    expectedRouteIntent: 'bug-audit',
    language: 'zh',
    riskFlags: ['needs-tests', 'needs-subagents'],
    expectedAgent: 'tester',
    expectedSubagents: ['ecc-tdd-guide', 'ecc-code-reviewer', 'ecc-silent-failure-hunter', 'ecc-pr-test-analyzer'],
  }),
  caseFor({
    name: 'bug audit',
    prompt: '帮我测试项目并检查 bug，写 bug audit report，不要修复代码。',
    intent: 'bug-audit',
    language: 'zh',
    riskFlags: ['needs-tests', 'needs-review', 'needs-subagents'],
    expectedAgent: 'tester',
    expectedSubagents: ['ecc-tdd-guide', 'ecc-code-reviewer', 'ecc-silent-failure-hunter', 'ecc-pr-test-analyzer'],
  }),
  caseFor({
    name: 'focused bug audit',
    prompt: 'Do the bug investigation directly as a focused audit; report verified findings only.',
    intent: 'bug-audit',
    language: 'en',
    riskFlags: ['needs-tests', 'needs-review'],
    expectedAgent: 'tester',
    expectedSubagents: [],
  }),
  caseFor({
    name: 'security',
    prompt: "审查这段 Express 代码的安全风险：app.get('/file', (req, res) => res.sendFile(req.query.path));",
    intent: 'security-review',
    language: 'zh',
    riskFlags: ['needs-security-review', 'needs-review', 'needs-subagents'],
    expectedAgent: 'ecc-security-reviewer',
    expectedSubagents: ['ecc-security-reviewer', 'reviewer'],
  }),
  caseFor({
    name: 'config assets',
    prompt: '检查 omp-config marketplace 插件打包出来的 assets 和 hooks 是否齐全。',
    intent: 'config-assets',
    language: 'zh',
    riskFlags: ['needs-marketplace-check', 'needs-subagents'],
    expectedAgent: 'config-assets',
    expectedSubagents: ['config-librarian', 'reviewer'],
  }),
  caseFor({
    name: 'diagnosis only',
    prompt: '为什么这个插件一直提示 SKILL_USAGE validation 失败？先诊断原因，不要改代码。',
    intent: 'diagnosis',
    language: 'zh',
    riskFlags: ['user-asks-diagnosis-only', 'ambiguous'],
    expectedAgent: null,
    expectedSubagents: [],
  }),
  caseFor({
    name: 'release only',
    prompt: '把当前插件版本推送到 GitHub，并刷新 marketplace。',
    intent: 'release',
    language: 'zh',
    riskFlags: ['release-or-push', 'needs-marketplace-check'],
    expectedAgent: null,
    expectedSubagents: [],
  }),
  caseFor({
    name: 'unknown reminder',
    prompt: '今天下午三点提醒我给妈妈打电话。',
    intent: 'unknown',
    language: 'zh',
    riskFlags: ['ambiguous'],
    expectedAgent: null,
    expectedSubagents: [],
  }),
];

const fallbackCases = [
  {
    name: 'non-json output',
    prompt: 'Draft an English related work paragraph for a systems paper and check the logic.',
    output: 'The task is English writing.',
    expectedIntent: 'writing.en',
  },
  {
    name: 'invented field output',
    prompt: '修复这个插件 bug，并补充高信号单元测试。',
    output: outputFor({
      intent: 'implementation-with-tests',
      secondaryIntents: [],
      language: 'zh',
      confidence: 0.9,
      riskFlags: ['needs-tests'],
      domainHints: ['plugin'],
      reason: 'Coding task.',
      skills: ['invented-skill'],
    }),
    expectedIntent: 'implementation-with-tests',
  },
  {
    name: 'bad confidence output',
    prompt: '检查 omp-config marketplace 插件打包出来的 assets 和 hooks 是否齐全。',
    output: outputFor({
      intent: 'config-assets',
      secondaryIntents: [],
      language: 'zh',
      confidence: 3,
      riskFlags: ['needs-marketplace-check'],
      domainHints: ['plugin'],
      reason: 'Config task.',
    }),
    expectedIntent: 'config-assets',
  },
];

const deterministicAuditCases = [
  ['zh writing polish', '请帮我润色这段中文论文摘要，要求语气自然，不要有翻译腔。', 'writing.zh'],
  ['zh rewrite sentence', '把下面这句话改成朴素直接的中文：我们需要进一步推动配置层面的优化。', 'writing.zh'],
  ['zh write report', '请写一份项目报告，语气正式但不要 AI 味。', 'writing.zh'],
  ['zh write test report', '请写测试报告，重点说明当前验证风险，不要生成测试代码。', 'writing.zh'],
  ['zh write coverage report', '请写一份测试覆盖率报告，说明当前风险。', 'writing.zh'],
  ['zh large workload writing', '请写一份中文长篇项目总结报告，包含背景、方法、结果和风险。', 'writing.zh'],
  ['zh scientific report writing', '请写一份中文科研调研报告，分析最近论文里的方法路线。', 'writing.zh'],
  ['en draft', 'Draft an English related work paragraph for a systems paper.', 'writing.en'],
  ['en revise', 'Revise this abstract and check the logic.', 'writing.en'],
  ['en write coverage report', 'Write a test coverage report for the release notes; do not run tests.', 'writing.en'],
  ['en large workload writing', 'Draft a full English research proposal with background, methods, risks, and timeline.', 'writing.en'],
  ['en write tests', 'Write tests for src/router.js around fallback behavior.', 'bug-audit'],
  ['bug audit zh', '帮我测试项目并检查 bug，写 bug audit report，不要修复代码。', 'bug-audit'],
  ['bug audit en', 'Run tests and audit for bugs; write a bug report without fixing code.', 'bug-audit'],
  ['focused bug audit', 'Do the bug investigation directly as a focused audit; report verified findings only.', 'bug-audit'],
  ['bug finding read-only', '帮我在代码里找 bug，只报告问题，不要修复。', 'bug-audit'],
  ['code testing read-only', '帮我为 subagent fork 逻辑生成测试并运行门禁，不要改实现。', 'bug-audit'],
  ['implementation bug tests', '修复这个插件 bug，并补充高信号单元测试。', 'implementation-with-tests'],
  ['implementation config plugin', '帮我修改插件配置逻辑并补测试。', 'implementation-with-tests'],
  ['implementation marketplace code', '修改 marketplace 发布逻辑，修复版本同步 bug，并补测试。', 'implementation-with-tests'],
  ['implementation hook', 'Update the plugin hook workflow and add regression tests.', 'implementation-with-tests'],
  ['implementation scoped file edit', '只修改 plugins/omp-enhancer-core/src/router.js 里 routeNaturalLanguageTask 的一个判断，保持范围最小。', 'implementation-with-tests'],
  ['implementation direct audit context', 'The OMP gate is blocking delegation. Let me do the bug investigation directly as a focused audit. 帮我优化插件的工作流，再事前准备好skills。', 'implementation-with-tests'],
  ['implementation agentic code writing', '请大规模重构这个插件的 subagent fork 逻辑，修改多个文件并补完整测试。', 'implementation-with-tests'],
  ['diagnosis validation', '为什么这个插件一直提示 SKILL_USAGE validation 失败？先诊断原因，不要改代码。', 'diagnosis'],
  ['diagnosis warning', '帮我看一下 Warning: Todo update failed 是什么原因，先不要修。', 'diagnosis'],
  ['diagnosis release fail', '为什么 GitHub release 失败？先诊断，不要修改代码。', 'diagnosis'],
  ['release only', '把当前插件版本推送到 GitHub，并刷新 marketplace。', 'release'],
  ['upgrade only', '升级本地 marketplace 缓存和已安装插件，不要修改代码。', 'release'],
  ['release english', 'Push the current plugin to GitHub and upgrade the marketplace install.', 'release'],
  ['github question', 'GitHub release 是什么？简单解释一下。', 'unknown'],
  ['config assets inventory', '检查 omp-config marketplace 插件打包出来的 assets 和 hooks 是否齐全。', 'config-assets'],
  ['config assets skills', '诊断 omp-config assets 里面缺了哪些 skills，只列清单。', 'config-assets'],
  ['config template', '列出 omp-config 模板里包含哪些 modelRoles 和 hooks。', 'config-assets'],
  ['security code', "审查这段 Express 代码的安全风险：app.get('/file', (req, res) => res.sendFile(req.query.path));", 'security-review'],
  ['security config secret', '检查这个配置文件有没有 secret 泄漏和权限风险。', 'security-review'],
  ['security explain', '解释一下 XSS 是什么。', 'unknown'],
  ['testing only', '为 classifier 写高信号单元测试，覆盖 fallback 和边界。', 'bug-audit'],
  ['coverage only', '检查当前测试覆盖率，并指出缺口，不要改代码。', 'bug-audit'],
  ['test word', 'What does the word test mean in English?', 'unknown'],
  ['unknown reminder', '今天下午三点提醒我给妈妈打电话。', 'unknown'],
  ['unknown smalltalk', '谢谢，辛苦了。', 'unknown'],
  ['research workload', '帮我调研一下 agentic coding workflow 的最佳实践，列出要点。', 'unknown'],
  ['scientific research workload', '帮我做科研选题调研，分析最近论文里的方法路线。', 'unknown'],
  ['literature download workload', '帮我下载这些论文 PDF 并整理到 papers 目录，不要写代码。', 'unknown'],
  ['daily office workload', '帮我整理今天的会议纪要和待办事项。', 'unknown'],
];

test('classifier prompt builder remains stable under parallel load profiles', async () => {
  const loadProfiles = [
    { name: 'single', multiplier: 1 },
    { name: 'burst', multiplier: 16 },
    { name: 'stress', multiplier: 96 },
  ];

  for (const profile of loadProfiles) {
    const jobs = expandJobs(validRouteCases, profile.multiplier);
    const prompts = await Promise.all(jobs.map(async ({ item }) => buildClassifierPrompt({ prompt: item.prompt })));

    assert.equal(prompts.length, validRouteCases.length * profile.multiplier, profile.name);
    for (const built of prompts) {
      assert.equal(built.modelRole, 'tiny');
      assert.equal(built.model, classifierDefaults.model);
      assert.equal(built.temperature, 0);
      assert.equal(built.maxOutputTokens, 500);
      assert.match(built.prompt, /Return only JSON/);
      assert.match(built.prompt, /descriptor hints only/);
      assert.match(built.prompt, /capability ceiling/);
      assert.match(built.prompt, /JSON Schema:/);
    }
  }
});

test('classifier deterministic fallback matrix avoids missing, extra, and wrong intents', async () => {
  const results = await Promise.all(deterministicAuditCases.map(async ([name, prompt, expectedIntent]) => ({
    name,
    expectedIntent,
    route: buildClassifierPrompt({ prompt }).fallbackRoute,
  })));

  for (const { name, expectedIntent, route } of results) {
    assert.equal(route.intent, expectedIntent, name);
  }
});

test('classifier resolver maps mixed valid outputs through the route whitelist under parallel load', async () => {
  const loadProfiles = [
    { name: 'single', multiplier: 1 },
    { name: 'burst', multiplier: 12 },
    { name: 'stress', multiplier: 80 },
  ];

  for (const profile of loadProfiles) {
    const jobs = expandJobs(validRouteCases, profile.multiplier);
    const results = await Promise.all(jobs.map(async ({ item, index }) => ({
      item,
      result: resolveClassificationRoute({
        prompt: item.prompt,
        output: outputFor(item.classification, index),
      }),
    })));

    assert.equal(results.length, validRouteCases.length * profile.multiplier, profile.name);
    for (const { item, result } of results) {
      const expectedRouteIntent = item.expectedRouteIntent ?? item.intent;
      assert.equal(result.ok, true, item.name);
      assert.equal(result.route.intent, expectedRouteIntent, item.name);
      assert.equal(result.route.source, 'llm-classifier', item.name);
      assert.equal(result.route.agent, item.expectedAgent, item.name);
      assert.equal(result.route.classifier.status, 'resolved', item.name);
      assert.equal(result.route.classifier.classification.intent, item.intent, item.name);
      assert.deepEqual(result.route.requiredSubagents.map(({ agent }) => agent), item.expectedSubagents, item.name);
    }
  }
});

test('classifier resolver falls back deterministically for malformed outputs under parallel load', async () => {
  const jobs = expandJobs(fallbackCases, 64);
  const results = await Promise.all(jobs.map(async ({ item }) => ({
    item,
    result: resolveClassificationRoute({
      prompt: item.prompt,
      output: item.output,
    }),
  })));

  for (const { item, result } of results) {
    assert.equal(result.ok, false, item.name);
    assert.equal(result.route.intent, item.expectedIntent, item.name);
    assert.equal(result.route.source, 'natural-language', item.name);
    assert.equal(result.route.classifier.status, 'fallback', item.name);
    assert.equal(result.classification, null, item.name);
    assert.ok(result.validation.errors.length >= 1, item.name);
  }
});

function caseFor({
  name,
  prompt,
  intent,
  language,
  riskFlags,
  expectedAgent,
  expectedSubagents,
  expectedRouteIntent,
}) {
  return {
    name,
    prompt,
    intent,
    expectedRouteIntent,
    expectedAgent,
    expectedSubagents,
    classification: {
      intent,
      secondaryIntents: [],
      language,
      confidence: intent === 'unknown' ? 0.52 : 0.91,
      riskFlags,
      domainHints: [name],
      reason: `${name} request.`,
    },
  };
}

function outputFor(value, index = 0) {
  const json = JSON.stringify(value);
  if (index % 3 === 0) return json;
  if (index % 3 === 1) return ['```json', json, '```'].join('\n');
  return `Classifier result:\n${json}\n`;
}

function expandJobs(items, multiplier) {
  return Array.from({ length: items.length * multiplier }, (_, index) => ({
    index,
    item: items[index % items.length],
  }));
}
