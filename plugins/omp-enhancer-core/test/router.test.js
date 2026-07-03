import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
  },
  {
    name: 'English writing request routes to English writing profile',
    prompt: 'Draft an English related work paragraph for a systems paper and check the logic.',
    expectedIntent: 'writing.en',
    expectedAgent: 'writing-helper.writer',
    requiredSkills: ['writing-plans', 'writing-markdown-helper', 'writing-checkers'],
    requiredTools: ['writing_logic_check', 'writing_quality_check'],
  },
  {
    name: 'test-writing request routes to testing profile',
    prompt: '为 src/router.js 写高信号单元测试，覆盖边界和错误路径。',
    expectedIntent: 'testing',
    expectedAgent: 'tester',
    requiredSkills: ['test-driven-development', 'verification-before-completion'],
    requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_gate', 'omp_test_report'],
  },
  {
    name: 'implementation with tests request routes to coding plus testing profile',
    prompt: '实现这个路由功能并补测试，先写失败用例，再完成实现。',
    expectedIntent: 'implementation-with-tests',
    expectedAgent: 'implementer',
    requiredSkills: ['brainstorming', 'test-driven-development', 'verification-before-completion'],
    requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_gate', 'omp_test_report'],
  },
  {
    name: 'Chinese sentence rewrite with coding words still routes to writing',
    prompt: '把下面这句话改成朴素、直接、少形容词的中文：鉴于当前系统存在较为显著的功能复杂性，我们需要进一步推动配置层面的优化与能力沉淀。',
    expectedIntent: 'writing.zh',
    expectedAgent: 'writing-helper.zh-writer',
    requiredSkills: ['plain-chinese-writing', 'zh-writing-polish', 'zh-writing-checkers'],
    requiredTools: ['writing_logic_check', 'writing_quality_check'],
  },
  {
    name: 'Chinese coding request routes to implementation with tests instead of writing',
    prompt: '请写一个函数实现排序功能',
    expectedIntent: 'implementation-with-tests',
    expectedAgent: 'implementer',
    requiredSkills: ['brainstorming', 'test-driven-development', 'verification-before-completion'],
    requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_gate', 'omp_test_report'],
  },
  {
    name: 'config asset request routes to config asset profile',
    prompt: '检查 omp marketplace 插件打包出来的 config assets 和 hooks 是否齐全。',
    expectedIntent: 'config-assets',
    expectedAgent: 'config-assets',
    requiredSkills: [],
    requiredTools: ['omp_config_doctor', 'omp_config_assets', 'omp_config_plan'],
  },
];

test('routes natural language tasks to required skill profiles without slash commands', () => {
  for (const item of routingCases) {
    const route = routeNaturalLanguageTask({ prompt: item.prompt });

    assert.equal(route.intent, item.expectedIntent, item.name);
    assert.equal(route.agent, item.expectedAgent, item.name);
    assert.deepEqual(route.requiredSkills, item.requiredSkills, item.name);
    assert.deepEqual(route.requiredTools, item.requiredTools, item.name);
    assert.equal(route.source, 'natural-language', item.name);
  }
});

test('required route skills are registered in the root marketplace catalog', async () => {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const catalog = JSON.parse(await readFile(path.join(repoRoot, '.omp-plugin', 'marketplace.json'), 'utf8'));
  const registeredSkills = new Set(
    catalog.plugins.flatMap((plugin) =>
      (plugin.skills ?? []).map((skillPath) => skillPath.replace(/^\.\//, '').replace(/^skills\//, '')),
    ),
  );

  for (const item of routingCases) {
    for (const skill of item.requiredSkills) {
      assert.equal(registeredSkills.has(skill), true, `${item.name} requires unregistered skill ${skill}`);
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

test('routes common Chinese document and report requests to Chinese writing first', () => {
  for (const prompt of ['请写一份项目报告', '帮我起草中文文档']) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.intent, 'writing.zh', prompt);
    assert.equal(route.requiredSkills[0], 'plain-chinese-writing', prompt);
  }
});

test('leaves unrelated prompts unclaimed instead of inventing a plugin workflow', () => {
  const route = routeNaturalLanguageTask({
    prompt: '今天下午三点提醒我给妈妈打电话。',
  });

  assert.deepEqual(route, {
    intent: 'unknown',
    agent: null,
    requiredSkills: [],
    requiredTools: [],
    source: 'natural-language',
  });
});
