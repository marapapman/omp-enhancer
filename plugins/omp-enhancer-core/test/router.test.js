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
    requiredSkills: ['diagnose', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion', 'search-first', 'ai-regression-testing'],
    requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_browser_check', 'omp_test_coverage_analyze', 'omp_test_mutation_context', 'omp_test_gate', 'omp_test_report'],
    requiredSubagents: ['ecc-tdd-guide', 'ecc-code-reviewer', 'ecc-silent-failure-hunter', 'ecc-pr-test-analyzer'],
    requiredSubagentSkills: {
      'ecc-tdd-guide': ['test-driven-development', 'search-first', 'ai-regression-testing'],
      'ecc-code-reviewer': ['verification-before-completion'],
      'ecc-silent-failure-hunter': ['diagnose'],
      'ecc-pr-test-analyzer': ['verification-before-completion'],
    },
  },
  {
    name: 'bug audit request routes to bug audit profile',
    prompt: '帮我测试项目并检查 bug，写 bug audit report，不要修复代码。',
    expectedIntent: 'bug-audit',
    expectedAgent: 'tester',
    requiredSkills: ['diagnose', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion', 'search-first', 'ai-regression-testing'],
    requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_browser_check', 'omp_test_coverage_analyze', 'omp_test_mutation_context', 'omp_test_gate', 'omp_test_report'],
    requiredSubagents: ['ecc-tdd-guide', 'ecc-code-reviewer', 'ecc-silent-failure-hunter', 'ecc-pr-test-analyzer'],
    requiredSubagentSkills: {
      'ecc-tdd-guide': ['test-driven-development', 'search-first', 'ai-regression-testing'],
      'ecc-code-reviewer': ['verification-before-completion'],
      'ecc-silent-failure-hunter': ['diagnose'],
      'ecc-pr-test-analyzer': ['verification-before-completion'],
    },
  },
  {
    name: 'implementation with tests request routes to coding plus testing profile',
    prompt: '实现这个路由功能并补测试，先写失败用例，再完成实现。',
    expectedIntent: 'implementation-with-tests',
    expectedAgent: 'implementer',
    requiredSkills: ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
    requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_browser_check', 'omp_test_coverage_analyze', 'omp_test_mutation_context', 'omp_test_gate', 'omp_test_report'],
    requiredSubagents: ['plan', 'task', 'reviewer'],
    requiredSubagentSkills: {
      plan: ['brainstorming', 'subagent-driven-development'],
      task: ['test-driven-development', 'verification-before-completion'],
      reviewer: ['verification-before-completion'],
    },
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
    requiredSkills: ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
    requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_browser_check', 'omp_test_coverage_analyze', 'omp_test_mutation_context', 'omp_test_gate', 'omp_test_report'],
    requiredSubagents: ['plan', 'task', 'reviewer'],
    requiredSubagentSkills: {
      plan: ['brainstorming', 'subagent-driven-development'],
      task: ['test-driven-development', 'verification-before-completion'],
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
    name: 'config asset request routes to config asset profile',
    prompt: '检查 omp marketplace 插件打包出来的 config assets 和 hooks 是否齐全。',
    expectedIntent: 'config-assets',
    expectedAgent: 'config-assets',
    requiredSkills: [],
    requiredTools: ['omp_config_doctor', 'omp_config_assets', 'omp_config_plan'],
    requiredSubagents: ['librarian', 'reviewer'],
    requiredSubagentSkills: {
      librarian: [],
      reviewer: [],
    },
  },
];

test('routes natural language tasks to required skill profiles without slash commands', () => {
  for (const item of routingCases) {
    const route = routeNaturalLanguageTask({ prompt: item.prompt });

    assert.equal(route.intent, item.expectedIntent, item.name);
    assert.equal(route.agent, item.expectedAgent, item.name);
    assert.deepEqual(route.requiredSkills, item.requiredSkills, item.name);
    assert.deepEqual(route.requiredTools, item.requiredTools, item.name);
    assert.deepEqual(route.requiredSubagents.map(({ agent }) => agent), item.requiredSubagents, item.name);
    assert.deepEqual(
      Object.fromEntries(route.requiredSubagents.map(({ agent, requiredSkills }) => [agent, requiredSkills])),
      item.requiredSubagentSkills,
      item.name,
    );
    assert.equal(route.source, 'natural-language', item.name);
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

test('required route subagents are packaged by omp-config or writing-helper', async () => {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const roots = [
    path.join(repoRoot, 'plugins', 'omp-config', 'agents'),
    path.join(repoRoot, 'plugins', 'writing-helper', 'agents'),
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

test('subagent providers match the configured workflow ownership', async () => {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const ownerAgents = {
    'omp-config': await agentNames(path.join(repoRoot, 'plugins', 'omp-config', 'agents')),
    'writing-helper': await agentNames(path.join(repoRoot, 'plugins', 'writing-helper', 'agents')),
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

test('routes common Chinese document and report requests to Chinese writing first', () => {
  for (const prompt of [
    '请写一份项目报告',
    '请写测试报告，重点说明当前验证风险，不要生成测试代码。',
    '请写一份测试覆盖率报告，说明当前风险。',
    '帮我起草中文文档',
    '请帮我润色这段中文风险提示，写得安全、克制、直接。',
    '请审查这段中文安全说明的逻辑表达，不要做代码安全审计。',
  ]) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.intent, 'writing.zh', prompt);
    assert.equal(route.requiredSkills[0], 'plain-chinese-writing', prompt);
    assert.equal(route.requiredTools.some((tool) => tool.startsWith('omp_test_')), false, prompt);
    assert.deepEqual(route.requiredSubagents.map(({ agent }) => agent), ['zh-writer', 'zh-checker'], prompt);
  }
});

test('routes English writing to English writing skills instead of development planning', () => {
  for (const prompt of [
    'Draft an English related work paragraph for a systems paper and check the logic.',
    'Write a test coverage report for the release notes; do not run tests.',
  ]) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.equal(route.intent, 'writing.en', prompt);
    assert.deepEqual(route.requiredSkills, ['writing-markdown-helper', 'writing-checkers'], prompt);
    assert.deepEqual(route.requiredSubagents, [
      {
        agent: 'writer',
        duty: 'draft or revise English writing after required writing skills are loaded',
        requiredSkills: ['writing-markdown-helper'],
      },
      {
        agent: 'checker',
        duty: 'review English logic, style, formatting, and citation quality before final output',
        requiredSkills: ['writing-checkers'],
      },
    ], prompt);
    assert.equal(route.requiredTools.some((tool) => tool.startsWith('omp_test_')), false, prompt);
    assert.equal(route.requiredSkills.includes('writing-plans'), false, prompt);
  }
});

test('routes simple English writing edits without writer checker subagents', () => {
  const route = routeNaturalLanguageTask({
    prompt: 'Polish this sentence for clarity and keep it concise.',
  });

  assert.equal(route.intent, 'writing.en');
  assert.equal(route.writingComplexity, 'simple');
  assert.deepEqual(route.requiredSkills, ['writing-markdown-helper']);
  assert.deepEqual(route.requiredTools, []);
  assert.deepEqual(route.requiredSubagents, []);
});

test('leaves unrelated prompts unclaimed instead of inventing a plugin workflow', () => {
  for (const prompt of [
    '今天下午三点提醒我给妈妈打电话。',
    'What is the capital of France?',
  ]) {
    const route = routeNaturalLanguageTask({ prompt });

    assert.deepEqual(route, {
      intent: 'unknown',
      agent: null,
      requiredSkills: [],
      requiredTools: [],
      requiredSubagents: [],
      source: 'natural-language',
    }, prompt);
  }
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
  if (['bug-audit', 'implementation-with-tests', 'security-review', 'config-assets'].includes(intent)) return 'omp-config';
  return null;
}

function skillFrontmatterName(text) {
  const match = String(text).match(/^name:\s*['"]?([^'"\r\n]+)['"]?\s*$/m);
  return match?.[1]?.trim() ?? '';
}
