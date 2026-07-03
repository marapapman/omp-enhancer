const zhWritingTerms = ['中文', '论文', '摘要', '润色', '改写', '翻译腔', 'ai 味', '博士', '段落', '写作', '写', '报告', '文档', '起草', '引言', '相关工作', '审稿'];
const strongZhWritingTerms = [
  '中文',
  '论文',
  '摘要',
  '润色',
  '改写',
  '翻译腔',
  'ai 味',
  '博士',
  '段落',
  '写作',
  '报告',
  '文档',
  '起草',
  '引言',
  '相关工作',
  '审稿',
  '这句话',
  '这段话',
  '文字',
  '文本',
  '改成',
  '改得',
];
const enWritingTerms = ['draft', 'write', 'revise', 'polish', 'paper', 'report', 'manuscript', 'abstract', 'related work', 'paragraph', 'logic'];
const testingTerms = ['test', 'tests', 'testing', 'unit test', 'coverage', 'mutation', 'browser', 'e2e', 'playwright', 'regression', '测试', '覆盖', '门禁'];
const codingTerms = ['implement', 'refactor', 'fix', 'bug', 'build', 'modify', 'code', 'api', 'component', '实现', '重构', '修复', '报错', '功能', '代码', '接口'];
const configTerms = ['omp-config', 'config assets', 'assets', 'hooks', 'marketplace', '配置资产'];
const securityTerms = ['security', 'vulnerability', 'xss', 'ssrf', 'injection', 'auth', 'owasp', '安全', '漏洞', '注入', '鉴权', '认证', '权限', '密钥', 'secret'];

const subagentPlans = {
  configAssets: [
    subagent('librarian', 'inventory packaged assets, agents, skills, hooks, and config templates before edits'),
    subagent('reviewer', 'review the final config or marketplace diff before release'),
  ],
  implementation: [
    subagent('plan', 'decompose non-trivial or multi-file changes into an executable plan', ['brainstorming', 'subagent-driven-development']),
    subagent('task', 'implement the planned code and test changes in the smallest coherent batch', ['test-driven-development', 'verification-before-completion']),
    subagent('reviewer', 'review the resulting diff before final claims, commit, or push', ['verification-before-completion']),
  ],
  security: [
    subagent('ecc-security-reviewer', 'audit user-input, auth, file, network, secrets, and dependency risks', ['ecc/security-review', 'ecc/security-scan']),
    subagent('reviewer', 'check the remediation diff for behavior regressions', ['ecc/security-review']),
  ],
  testing: [
    subagent('ecc-tdd-guide', 'drive the red-green-refactor test-first workflow', ['test-driven-development']),
    subagent('ecc-pr-test-analyzer', 'review whether the tests cover the changed behavior before completion', ['verification-before-completion']),
  ],
  writingZh: [
    subagent('zh-writer', 'draft or rewrite Chinese text after required writing skills are loaded', ['plain-chinese-writing', 'zh-writing-polish']),
    subagent('zh-checker', 'review Chinese logic, style, and plain-writing compliance before final output', ['plain-chinese-writing', 'zh-writing-checkers']),
  ],
  writingEn: [
    subagent('writer', 'draft or revise English writing after required writing skills are loaded', ['writing-markdown-helper']),
    subagent('checker', 'review English logic, style, formatting, and citation quality before final output', ['writing-checkers']),
  ],
};

export function routeNaturalLanguageTask(input = {}) {
  const prompt = String(input.prompt ?? input.text ?? '');
  const normalized = prompt.toLowerCase();

  if (!normalized.trim()) return unknownRoute();

  if (includesAny(normalized, configTerms) && includesAny(normalized, ['config', 'assets', 'hooks', 'omp-config', 'marketplace', '配置'])) {
    return route({
      intent: 'config-assets',
      agent: 'config-assets',
      requiredSkills: [],
      requiredTools: ['omp_config_doctor', 'omp_config_assets', 'omp_config_plan'],
      requiredSubagents: subagentPlans.configAssets,
    });
  }

  const hasTesting = includesAny(normalized, testingTerms);
  const hasCoding = includesAny(normalized, codingTerms);
  const hasWriting = includesAny(normalized, zhWritingTerms) || includesAny(normalized, enWritingTerms);
  const hasSecurity = includesAny(normalized, securityTerms);
  const asksToWriteTests = /write\s+tests?/.test(normalized) || normalized.includes('写高信号单元测试') || normalized.includes('写测试') || normalized.includes('补测试');

  if (hasSecurity && (hasCoding || normalized.includes('代码') || normalized.includes('审查') || normalized.includes('review'))) {
    return route({
      intent: 'security-review',
      agent: 'ecc-security-reviewer',
      requiredSkills: ['ecc/security-review', 'ecc/security-scan'],
      requiredTools: [],
      requiredSubagents: subagentPlans.security,
    });
  }

  if (hasCoding && hasTesting) {
    return route({
      intent: 'implementation-with-tests',
      agent: 'implementer',
      requiredSkills: ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
      requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_gate', 'omp_test_report'],
      requiredSubagents: subagentPlans.implementation,
    });
  }

  if (asksToWriteTests || (hasTesting && !hasWriting)) {
    return route({
      intent: 'testing',
      agent: 'tester',
      requiredSkills: ['test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
      requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_gate', 'omp_test_report'],
      requiredSubagents: subagentPlans.testing,
    });
  }

  if (isChineseWriting(normalized, prompt)) {
    return route({
      intent: 'writing.zh',
      agent: 'writing-helper.zh-writer',
      requiredSkills: ['plain-chinese-writing', 'zh-writing-polish', 'zh-writing-checkers'],
      requiredTools: ['writing_logic_check', 'writing_quality_check'],
      requiredSubagents: subagentPlans.writingZh,
    });
  }

  if (hasCoding) {
    return route({
      intent: 'implementation-with-tests',
      agent: 'implementer',
      requiredSkills: ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
      requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_gate', 'omp_test_report'],
      requiredSubagents: subagentPlans.implementation,
    });
  }

  if (hasWriting) {
    return route({
      intent: 'writing.en',
      agent: 'writing-helper.writer',
      requiredSkills: ['writing-markdown-helper', 'writing-checkers'],
      requiredTools: ['writing_logic_check', 'writing_quality_check'],
      requiredSubagents: subagentPlans.writingEn,
    });
  }

  return unknownRoute();
}

function route({ intent, agent, requiredSkills = [], requiredTools = [], requiredSubagents = [] }) {
  return {
    intent,
    agent,
    requiredSkills,
    requiredTools,
    requiredSubagents,
    source: 'natural-language',
  };
}

function subagent(agent, duty, requiredSkills = []) {
  return { agent, duty, requiredSkills };
}

function isChineseWriting(normalized, original) {
  if (!/[\u4e00-\u9fff]/.test(original)) return false;
  if (includesAny(normalized, strongZhWritingTerms)) return true;
  if (!normalized.includes('写')) return false;
  return !includesAny(normalized, ['函数', '代码', '接口', '实现', 'api', 'component']);
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function unknownRoute() {
  return {
    intent: 'unknown',
    agent: null,
    requiredSkills: [],
    requiredTools: [],
    requiredSubagents: [],
    source: 'natural-language',
  };
}
