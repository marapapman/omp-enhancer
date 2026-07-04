import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildGovernancePromptFragment, buildSubagentPromptFragment } from '../src/governance.js';
import { routeNaturalLanguageTask } from '../src/router.js';
import { validateSubagentUsage } from '../src/subagent-usage.js';

const expectedByIntent = {
  'writing.zh': {
    agent: 'writing-helper.zh-writer',
    requiredSkills: ['plain-chinese-writing', 'zh-writing-polish', 'zh-writing-checkers'],
    requiredTools: ['writing_logic_check', 'writing_quality_check'],
    subagents: {
      'zh-writer': ['plain-chinese-writing', 'zh-writing-polish'],
      'zh-checker': ['plain-chinese-writing', 'zh-writing-checkers'],
    },
  },
  'writing.en': {
    agent: 'writing-helper.writer',
    requiredSkills: ['writing-markdown-helper', 'writing-checkers'],
    requiredTools: ['writing_logic_check', 'writing_quality_check'],
    subagents: {
      writer: ['writing-markdown-helper'],
      checker: ['writing-checkers'],
    },
  },
  'implementation-with-tests': {
    agent: 'implementer',
    requiredSkills: ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
    requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_gate', 'omp_test_report'],
    subagents: {
      plan: ['brainstorming', 'subagent-driven-development'],
      task: ['test-driven-development', 'verification-before-completion'],
      reviewer: ['verification-before-completion'],
    },
  },
  testing: {
    agent: 'tester',
    requiredSkills: ['test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
    requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_gate', 'omp_test_report'],
    subagents: {
      'ecc-tdd-guide': ['test-driven-development'],
      'ecc-pr-test-analyzer': ['verification-before-completion'],
    },
  },
  'security-review': {
    agent: 'ecc-security-reviewer',
    requiredSkills: ['security-review', 'security-scan'],
    requiredTools: [],
    subagents: {
      'ecc-security-reviewer': ['security-review', 'security-scan'],
      reviewer: ['security-review'],
    },
  },
  'config-assets': {
    agent: 'config-assets',
    requiredSkills: [],
    requiredTools: ['omp_config_doctor', 'omp_config_assets', 'omp_config_plan'],
    subagents: {
      librarian: [],
      reviewer: [],
    },
  },
  diagnosis: {
    agent: null,
    requiredSkills: [],
    requiredTools: [],
    subagents: {},
  },
  release: {
    agent: null,
    requiredSkills: [],
    requiredTools: [],
    subagents: {},
  },
  unknown: {
    agent: null,
    requiredSkills: [],
    requiredTools: [],
    subagents: {},
  },
};

const workloadMatrix = [
  ['zh thesis polish', '请帮我润色这段中文论文摘要，要求语气自然，不要有翻译腔。', 'writing.zh'],
  ['zh reviewer response', '帮我起草中文审稿回复，要求语气克制、逻辑清楚。', 'writing.zh'],
  ['zh test report writing', '请写测试报告，重点说明当前验证风险，不要生成测试代码。', 'writing.zh'],
  ['zh coverage report writing', '请写一份测试覆盖率报告，说明当前风险。', 'writing.zh'],
  ['zh sentence rewrite with config terms', '把下面这句话改成朴素直接的中文：我们需要进一步推动配置层面的优化与能力沉淀。', 'writing.zh'],
  ['en related work', 'Draft an English related work paragraph for a systems paper and check the logic.', 'writing.en'],
  ['en abstract revision', 'Revise this abstract for clarity and citation-aware wording.', 'writing.en'],
  ['en release notes writing', 'Draft release notes for the plugin changelog without publishing anything.', 'writing.en'],
  ['en coverage report writing', 'Write a test coverage report for the release notes; do not run tests.', 'writing.en'],
  ['feature implementation', 'Implement the classifier routing fallback and add regression tests.', 'implementation-with-tests'],
  ['plugin config implementation', '帮我修改插件配置逻辑并补测试。', 'implementation-with-tests'],
  ['marketplace implementation', '修改 marketplace 发布逻辑，修复版本同步 bug，并补测试。', 'implementation-with-tests'],
  ['hook workflow implementation', 'Update the plugin hook workflow and add regression tests.', 'implementation-with-tests'],
  ['unit test authoring', '为 classifier 写高信号单元测试，覆盖 fallback 和边界。', 'testing'],
  ['coverage audit read-only', '检查当前测试覆盖率，并指出缺口，不要改代码。', 'testing'],
  ['test flakiness', 'Review test flakiness around the browser smoke suite and report the likely cause.', 'testing'],
  ['browser e2e verification', 'Run browser e2e verification for the changed workflow and report failures.', 'testing'],
  ['express path traversal', "审查这段 Express 代码的安全风险：app.get('/file', (req, res) => res.sendFile(req.query.path));", 'security-review'],
  ['secret leakage', '检查这个配置文件有没有 secret 泄漏和权限风险。', 'security-review'],
  ['auth bypass', 'Review this API handler for auth bypass and injection risks.', 'security-review'],
  ['owasp explanation', '解释一下 XSS 是什么，并说明这个项目是否需要安全审查。', 'security-review'],
  ['config asset inventory', '检查 omp-config marketplace 插件打包出来的 assets 和 hooks 是否齐全。', 'config-assets'],
  ['config skill inventory', '诊断 omp-config assets 里面缺了哪些 skills，只列清单。', 'config-assets'],
  ['model role template inventory', '列出 omp-config 模板里包含哪些 modelRoles 和 hooks。', 'config-assets'],
  ['packaged agent inventory', '核对 omp-config 打包的 agents、skills、hooks 和 templates 是否完整。', 'config-assets'],
  ['skill gate diagnosis', '为什么这个插件一直提示 SKILL_USAGE validation 失败？先诊断原因，不要改代码。', 'diagnosis'],
  ['tool warning diagnosis', '帮我看一下 Warning: Todo update failed 是什么原因，先不要修。', 'diagnosis'],
  ['release failure diagnosis', '为什么 GitHub release 失败？先诊断，不要修改代码。', 'diagnosis'],
  ['runtime regression diagnosis', '定位这个 workflow regression 的 root cause，只分析，不要改代码。', 'diagnosis'],
  ['github push release', '把当前插件版本推送到 GitHub，并刷新 marketplace。', 'release'],
  ['marketplace upgrade', '升级本地 marketplace 缓存和已安装插件，不要修改代码。', 'release'],
  ['publish plugin', 'Publish the current plugin and upgrade the marketplace install.', 'release'],
  ['plain github concept', 'GitHub release 是什么？简单解释一下。', 'unknown'],
  ['meeting reminder', '今天下午三点提醒我给妈妈打电话。', 'unknown'],
  ['word meaning', 'What does the word test mean in English?', 'unknown'],
];

test('workload matrix routes to the expected agent, tools, skills, and subagents', () => {
  for (const [name, prompt, expectedIntent] of workloadMatrix) {
    const route = routeNaturalLanguageTask({ prompt });
    const expected = expectedByIntent[expectedIntent];

    assert.equal(route.intent, expectedIntent, name);
    assert.equal(route.agent, expected.agent, name);
    assert.deepEqual(route.requiredSkills, expected.requiredSkills, name);
    assert.deepEqual(route.requiredTools, expected.requiredTools, name);
    assert.deepEqual(
      Object.fromEntries(route.requiredSubagents.map(({ agent, requiredSkills }) => [agent, requiredSkills])),
      expected.subagents,
      name,
    );
  }
});

test('governance fragments include exact pre-fork contracts and final evidence blocks for routed subagents', () => {
  const uniqueRoutes = routesFromMatrix().filter((route) => route.intent !== 'unknown');

  for (const route of uniqueRoutes) {
    const fragment = buildGovernancePromptFragment({ route });

    assert.match(fragment, new RegExp(`Intent: ${escapeRegExp(route.intent)}`), route.intent);
    assert.match(fragment, /Use this natural language route/, route.intent);
    assert.match(fragment, /SUBAGENT_USAGE contract/, route.intent);
    assert.match(fragment, /SKILL_USAGE contract/, route.intent);

    for (const skill of route.requiredSkills) {
      assert.match(fragment, new RegExp(`- ${escapeRegExp(skill)}`), `${route.intent} root skill ${skill}`);
    }

    for (const tool of route.requiredTools) {
      assert.match(fragment, new RegExp(`- ${escapeRegExp(tool)}`), `${route.intent} tool ${tool}`);
    }

    for (const { agent, requiredSkills } of route.requiredSubagents) {
      assert.match(fragment, new RegExp(`Subagent: ${escapeRegExp(agent)}`), `${route.intent} ${agent}`);
      assert.match(fragment, new RegExp(`role: ${escapeRegExp(agent)}`), `${route.intent} ${agent}`);
      assert.match(fragment, new RegExp(`OMP_REQUIRED_SUBAGENT: ${escapeRegExp(agent)}`), `${route.intent} ${agent}`);
      assert.match(fragment, new RegExp(`- ${escapeRegExp(agent)}: ${escapeRegExp(requiredSkills.join(', ') || 'none')}`), `${route.intent} evidence ${agent}`);
      for (const skill of requiredSkills) {
        assert.match(fragment, new RegExp(`- ${escapeRegExp(skill)}`), `${route.intent} ${agent} skill ${skill}`);
      }
    }

    if (!route.requiredSubagents.length) {
      assert.match(fragment, /No routed subagents are required|Required subagents:\n- none/, route.intent);
      assert.doesNotMatch(fragment, /OMP_REQUIRED_SUBAGENT:/, route.intent);
    }
  }
});

test('subagent evidence validation accepts complete assignments and rejects missing role skills', () => {
  const routes = routesFromMatrix().filter((route) => route.requiredSubagents.length);

  for (const route of routes) {
    const complete = formatSubagentUsage(route.requiredSubagents);
    const accepted = validateSubagentUsage({ requiredSubagents: route.requiredSubagents, output: complete });

    assert.equal(accepted.ok, true, route.intent);
    assert.deepEqual(accepted.forked, route.requiredSubagents.map(({ agent }) => agent), route.intent);

    const firstWithSkills = route.requiredSubagents.find(({ requiredSkills }) => requiredSkills.length);
    if (!firstWithSkills) continue;

    const incomplete = formatSubagentUsage(route.requiredSubagents.map((item) => (
      item.agent === firstWithSkills.agent
        ? { ...item, requiredSkills: item.requiredSkills.slice(0, -1) }
        : item
    )));
    const rejected = validateSubagentUsage({ requiredSubagents: route.requiredSubagents, output: incomplete });

    assert.equal(rejected.ok, false, route.intent);
    assert.deepEqual(rejected.missingSkills[0], {
      agent: firstWithSkills.agent,
      skills: [firstWithSkills.requiredSkills.at(-1)],
    }, route.intent);
  }
});

test('subagent launch fragments remain child-only contracts for every routed role', () => {
  const subagents = uniqueSubagentsFromMatrix();

  for (const { agent, requiredSkills } of subagents) {
    const fragment = buildSubagentPromptFragment({
      prompt: [
        `OMP_REQUIRED_SUBAGENT: ${agent}`,
        'Required skills for this subagent:',
        ...requiredSkills.map((skill) => `- ${skill}`),
        '',
        'Assignment: complete the bounded specialist task and report evidence.',
      ].join('\n'),
    });

    assert.match(fragment, new RegExp(`Subagent:\\s*${escapeRegExp(agent)}`), agent);
    assert.match(fragment, /not a root routed workflow/, agent);
    assert.match(fragment, /Do not start another OMP Enhancer Core role-gate cycle/, agent);
    assert.match(fragment, /SUBAGENT_RESULT/, agent);
    assert.doesNotMatch(fragment, /Mandatory Subagent Workflow/, agent);
    assert.doesNotMatch(fragment, /Required subagents:/, agent);
    for (const skill of requiredSkills) {
      assert.match(fragment, new RegExp(`- ${escapeRegExp(skill)}`), `${agent} ${skill}`);
    }
  }
});

test('all workflow matrix subagents and skills are packaged by installed plugin workspaces', async () => {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const agentRoots = [
    path.join(repoRoot, 'plugins', 'omp-config', 'agents'),
    path.join(repoRoot, 'plugins', 'writing-helper', 'agents'),
  ];
  const skillRoots = [
    path.join(repoRoot, 'plugins', 'omp-config', 'skills'),
    path.join(repoRoot, 'plugins', 'writing-helper', 'skills'),
  ];
  const skillNames = await skillNamesInRoots(skillRoots);

  for (const { agent } of uniqueSubagentsFromMatrix()) {
    assert.equal(await existsInRoots(agentRoots, `${agent}.md`), true, `missing packaged subagent ${agent}`);
  }

  for (const skill of uniqueSkillsFromMatrix()) {
    assert.equal(skillNames.has(skill), true, `missing packaged skill ${skill}`);
  }
});

function routesFromMatrix() {
  const byIntent = new Map();
  for (const [, prompt] of workloadMatrix) {
    const route = routeNaturalLanguageTask({ prompt });
    if (!byIntent.has(route.intent)) byIntent.set(route.intent, route);
  }
  return [...byIntent.values()];
}

function uniqueSubagentsFromMatrix() {
  const byAgent = new Map();
  for (const route of routesFromMatrix()) {
    for (const subagent of route.requiredSubagents) byAgent.set(subagent.agent, subagent);
  }
  return [...byAgent.values()];
}

function uniqueSkillsFromMatrix() {
  return [...new Set(routesFromMatrix().flatMap((route) => [
    ...route.requiredSkills,
    ...route.requiredSubagents.flatMap(({ requiredSkills = [] }) => requiredSkills),
  ]))].sort();
}

function formatSubagentUsage(subagents) {
  return [
    'SUBAGENT_USAGE',
    'Required:',
    ...subagents.map(({ agent, requiredSkills }) => `- ${agent}: ${requiredSkills.join(', ') || 'none'}`),
    'Forked:',
    ...subagents.map(({ agent, requiredSkills }) => `- ${agent}: ${requiredSkills.join(', ') || 'none'}`),
  ].join('\n');
}

async function existsInRoots(roots, relativePath) {
  for (const root of roots) {
    try {
      await access(path.join(root, relativePath));
      return true;
    } catch {
      // Try the next packaged plugin root.
    }
  }
  return false;
}

async function skillNamesInRoots(roots) {
  const names = new Set();
  for (const root of roots) await collectSkillNames(root, names);
  return names;
}

async function collectSkillNames(dir, names) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectSkillNames(entryPath, names);
      continue;
    }
    if (entry.name !== 'SKILL.md') continue;
    const name = skillFrontmatterName(await readFile(entryPath, 'utf8'));
    if (name) names.add(name);
  }
}

function skillFrontmatterName(text) {
  const match = String(text).match(/^name:\s*['"]?([^'"\r\n]+)['"]?\s*$/m);
  return match?.[1]?.trim() ?? '';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
