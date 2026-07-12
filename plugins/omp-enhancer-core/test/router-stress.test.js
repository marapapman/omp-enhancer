import test from 'node:test';
import assert from 'node:assert/strict';

import { routeNaturalLanguageTask } from '../src/router.js';

const routeSuites = {
  'writing.zh': [
    '请把这段中文论文摘要改得更平实。',
    '请起草一份中文项目报告。',
    '把这句话改成朴素直接的中文。',
    '请检查这段中文相关工作的逻辑表达。',
    '请润色下面的中文段落。',
    '帮我改写中文摘要，让它更自然。',
    '请写一份中文实验报告。',
    '润色中文申请材料里的研究计划段落。',
    '请检查中文论文段落是否有翻译腔。',
    '请写一份中文长篇项目总结报告，包含背景、方法、结果和风险。',
    '请写一份中文科研调研报告，分析最近论文里的方法路线。',
    '请起草中文文档的开头。',
  ],
  'writing.en': [
    'Draft an English related work paragraph for a systems paper.',
    'Draft a full English research proposal with background, methods, risks, and timeline.',
    'Polish this sentence for clarity: The workflow blocks unexpectedly.',
    'Write a concise project report in English.',
    'Draft an English letter explaining the release.',
  ],
  'writing.pending': [
    '帮我润色博士论文引言，去掉翻译腔。',
    '请写测试报告，重点说明当前验证风险，不要生成测试代码。',
    '请写一份测试覆盖率报告，说明当前风险。',
    '帮我写一段中文审稿回复。',
    '把这段话改得少一点 AI 味。',
    '把下面文字改成博士论文风格但更平直。',
    '帮我起草中文相关工作小节。',
    'Revise this manuscript abstract for clarity.',
    'Polish the paragraph and check the wording.',
    'Edit the proposal summary for a technical audience.',
    'Improve this release notes paragraph without publishing anything.',
    'Draft a changelog entry for the plugin fix.',
    'Write an email summarizing the test results.',
    'Write a test coverage report for the release notes; do not run tests.',
    'Revise the paper introduction and improve style.',
    'Polish the report conclusion for readability.',
    'Edit this abstract for logic and flow.',
    'Improve the manuscript paragraph without changing claims.',
    'Write a short proposal summary.',
    'Draft release notes for the plugin changelog without publishing anything.',
  ],
  'bug-audit': [
    'Write tests for src/router.js around fallback behavior.',
    'Add tests for classifier routing confidence thresholds.',
    'Create regression tests for the skill gate parser.',
    'Review test flakiness around the browser smoke suite.',
    'Check coverage gaps in the router tests.',
    'Analyze flaky e2e failures in Playwright.',
    '为 src/router.js 写高信号单元测试。',
    '补测试覆盖 skill usage 的错误路径。',
    '检查浏览器回归测试为什么失败。',
    '分析覆盖率缺口，不要改实现。',
    '审查测试是否覆盖 marketplace upgrade。',
    '帮我测试项目并检查 bug，写 bug audit report，不要修复代码。',
    '测试整个项目并检查 bug，输出已验证的问题清单。',
    'Run tests and audit for bugs; write a bug report without fixing code.',
    'Find bugs in the project and report verified findings only.',
    'Inspect the plugin for defects and summarize concrete file-line findings.',
    '帮我在代码里找 bug，只报告问题，不要修复。',
    '帮我为 subagent fork 逻辑生成测试并运行门禁，不要改实现。',
  ],
  testing: [
    'Run unit tests for the marketplace release script.',
    'Execute the browser smoke tests and report failures.',
    'Run the testing workflow and summarize the gate result.',
    '运行测试门禁并报告结果。',
  ],
  'implementation-with-tests': [
    'Implement classifier fallback handling and add tests.',
    'Fix the plugin gate bug and add regression tests.',
    'Modify the marketplace release logic and test it.',
    'Refactor the router code with focused unit tests.',
    'Build the config workflow and cover error paths.',
    'Update the hook workflow and add regression tests.',
    'Implement API route detection for plugin tasks.',
    'Fix code that mishandles final evidence.',
    'Modify the config doctor logic and add tests.',
    '实现自然语言路由并补测试。',
    '修复插件门禁状态恢复 bug。',
    '修改 marketplace 发布逻辑并补测试。',
    '重构配置资产扫描逻辑。',
    '开发新的 hook 修复流程。',
    '优化代码路径并补充回归测试。',
    '请大规模重构这个插件的 subagent fork 逻辑，修改多个文件并补完整测试。',
    '只修改 plugins/omp-enhancer-core/src/router.js 里 routeNaturalLanguageTask 的一个判断，保持范围最小。',
    'Agentically update the codebase to improve gate handling and add regression tests.',
  ],
  'security-review': [
    'Review this API handler for auth bypass and injection risks.',
    'Audit the file download route for path traversal.',
    'Check this Express code for SSRF vulnerabilities.',
    'Review token handling for secret leakage.',
    'Analyze authentication and authorization risks in this middleware.',
    'Audit the plugin hook for command injection.',
    'Review OAuth callback handling for security issues.',
    'Check whether user input can trigger XSS.',
    'Assess dependency vulnerability impact in this package.',
    '审查这段代码是否有权限绕过。',
    '检查文件读取接口的路径穿越风险。',
    '分析这个 hook 是否会泄露密钥。',
    '审查认证逻辑里的安全问题。',
    '检查用户输入是否可能造成注入。',
    '评估插件发布流程里的 secret 风险。',
  ],
  'config-assets': [
    'List packaged omp-config assets and hooks.',
    'Inspect config assets shipped by the plugin.',
    'Check the omp-config skill asset inventory.',
    'Show marketplace config asset paths.',
    'Review bundled hooks and templates in omp-config.',
    'List all packaged agents and skills from config assets.',
    'Inspect the plugin config templates.',
    'Check whether config assets include model overrides.',
    'Show packaged hooks without applying them.',
    '检查 omp-config 打包的配置资产。',
    '列出插件里的 config assets 和 hooks。',
    '检查配置模板和技能清单。',
    '查看 marketplace 注册的配置资产。',
    '列出打包后的 agents 和 skills。',
    '检查 omp-config 的模型覆盖模板。',
  ],
  diagnosis: [
    '为什么 SKILL_USAGE validation 一直失败？先诊断原因，不要改代码。',
    '只诊断这个 Warning 是什么导致的。',
    '排查 gate 为什么反复打开，不要修改代码。',
    '定位 session state 丢失的根因，先不要修复。',
    '解释这个 failed validation 的 root cause。',
    'Why does the validator keep failing? Diagnosis only.',
    'Find the root cause of the missing content array warning.',
    'Investigate why session_stop repeats without changing files.',
    'Diagnose the marketplace upgrade failure first.',
    'What caused this test gate failure? Do not fix yet.',
    '只分析为什么 subagent usage 没有通过。',
    '定位工具返回 invalid result 的原因。',
    '排查插件加载失败的原因，只列清单。',
    '为什么 advisor 建议没有被使用？先诊断。',
    'Root cause analysis for the routing failure, read-only.',
  ],
  release: [
    'Push the current release commit and upgrade marketplace plugins.',
    'Publish the plugin update to GitHub marketplace.',
    'Upgrade omp-enhancer-core@omp-enhancer after pushing main.',
    'Run marketplace update and plugin upgrade for the release.',
    'Push to GitHub and refresh the omp-enhancer marketplace.',
    'Ship the plugin release after packaging checks.',
    'Create a release for the current plugin version.',
    'Upgrade the installed plugin from marketplace.',
    'Publish current changes and verify plugin upgrade.',
    '推送当前提交到 GitHub 并升级 marketplace 插件。',
    '发布插件版本并刷新 marketplace。',
    '升级 omp-config@omp-enhancer 到最新版本。',
    '推送 main 后执行 marketplace update。',
    '发布当前 release 并验证插件升级。',
    '刷新插件 marketplace 并升级用户安装。',
  ],
  unknown: [
    'What is the capital of France?',
    'Who is the author of Hamlet?',
    'What is an API?',
    'What does bug mean in English?',
    'What is a unit test?',
    'What is a browser?',
    'What is a report?',
    'Define authentication in one sentence.',
    'The report is due tomorrow.',
    'The browser history was deleted yesterday.',
    'The capital market opened higher today.',
    'GitHub release 是什么？简单解释一下。',
    '今天下午三点提醒我给妈妈打电话。',
    '谢谢，辛苦了。',
    'What does the word test mean in English?',
    '什么是单元测试？',
    '什么是 API？',
    '这句话里的 bug 是什么意思？',
    '作者是谁？',
    '解释一下浏览器是什么。',
    '帮我调研一下 agentic coding workflow 的最佳实践，列出要点。',
    '帮我做科研选题调研，分析最近论文里的方法路线。',
    '帮我下载这些论文 PDF 并整理到 papers 目录，不要写代码。',
    '帮我整理今天的会议纪要和待办事项。',
  ],
};

const routeCases = Object.entries(routeSuites).flatMap(([intent, prompts]) =>
  prompts.map((prompt, index) => ({ name: `${intent} ${index + 1}`, intent, prompt })),
);

test('router stress matrix covers at least 100 natural-language cases without wrong intents', () => {
  assert.equal(routeCases.length >= 100, true, `expected at least 100 route cases, got ${routeCases.length}`);

  const mismatches = [];
  for (const { name, prompt, intent } of routeCases) {
    const route = routeNaturalLanguageTask({ prompt });

    if (route.intent !== intent) {
      mismatches.push(`${name}: expected ${intent}, got ${route.intent}: ${prompt}`);
      continue;
    }
    assert.equal(route.routePlan.mode, 'advisory', name);
    assert.equal(route.routePlan.autoContinue, false, name);
    for (const field of ['steps', 'skills', 'tools', 'roles', 'qualityChecks', 'riskNotes']) {
      assert.ok(Array.isArray(route.routePlan[field]), `${name}: routePlan.${field}`);
    }
    assert.equal('gateRequirements' in route.routePlan, false, name);
    assert.equal('hardBlock' in route.routePlan, false, name);
    for (const role of route.routePlan.roles) {
      assert.equal(typeof role.agent, 'string', `${name}: advisory role agent`);
      assert.ok(Array.isArray(role.skills), `${name}: advisory role skills`);
    }
    if (intent === 'writing.pending') {
      assert.equal(route.taskDescriptor.language, 'unknown', `${name}: pending source language`);
      assert.equal(route.taskDescriptor.writingSourcePending, true, `${name}: source text must be requested`);
      assert.ok(route.routePlan.qualityChecks.includes('detect-source-language'), `${name}: source-language guidance`);
      assert.equal(
        route.routePlan.skills.some((skill) => [
          'plain-chinese-writing',
          'zh-writing-polish',
          'writing-markdown-helper',
          'writing-checkers',
        ].includes(skill)),
        false,
        `${name}: language-specific skill selected without source text`,
      );
    }
  }

  assert.deepEqual(mismatches, []);
});
