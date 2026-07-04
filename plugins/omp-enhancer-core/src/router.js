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
const enWritingActionTerms = ['draft', 'write', 'revise', 'polish', 'edit', 'improve'];
const enWritingObjectTerms = ['paper', 'report', 'manuscript', 'abstract', 'related work', 'paragraph', 'release notes', 'changelog', 'letter', 'email', 'proposal', 'summary'];
const testingTerms = ['tests', 'testing', 'unit test', 'coverage', 'mutation', 'e2e', 'playwright', 'regression', 'flaky', 'flakiness', 'test flakiness', '测试', '覆盖率', '门禁'];
const codingTerms = ['implement', 'refactor', 'fix', 'bug', 'build', 'modify', 'code', 'component', '实现', '重构', '修复', '报错', '功能', '代码', '接口'];
const configTerms = ['omp-config', 'config asset', 'config assets', 'asset paths', 'config templates', 'assets', 'hooks', 'templates', 'modelroles', 'model roles', 'agents', 'skills', '配置资产', '配置模板', '技能清单'];
const securityTerms = ['security', 'vulnerability', 'vulnerabilities', 'path traversal', 'path expansion', 'unsafe path', 'command injection', 'command execution', 'auth bypass', 'xss', 'ssrf', 'injection', 'auth', 'authentication', 'authorization', 'oauth', 'owasp', '安全', '漏洞', '注入', '鉴权', '认证', '权限', '密钥', 'secret', 'secrets', '路径穿越'];
const noCodeChangeTerms = ['不要改代码', '不要改', '不要修改代码', '先不要修', '不要修复', '不要修改', '只诊断', '只分析', '只检查', '只列清单', 'do not change', 'do not modify', 'do not fix', 'diagnosis only', 'read-only'];
const diagnosisTerms = ['why', 'diagnose', 'diagnosis', 'investigate', 'root cause', '原因', '为什么', '诊断', '定位', '排查', '是什么导致', '是什么原因', 'warning:', 'failed', 'failure'];
const releaseTerms = ['push', 'publish', 'upgrade', '推送', '发布', '升级', '刷新'];
const noReleaseTerms = ['without publishing', 'without publish', 'do not publish', 'do not push', 'do not release', 'not publish', 'not push', 'not release', '不要发布', '不要推送', '不要刷新', '不发布', '不推送'];

export const routedIntents = [
  'config-assets',
  'diagnosis',
  'release',
  'security-review',
  'implementation-with-tests',
  'testing',
  'writing.zh',
  'writing.en',
  'unknown',
];

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
    subagent('ecc-security-reviewer', 'audit user-input, auth, file, network, secrets, and dependency risks', ['security-review', 'security-scan']),
    subagent('reviewer', 'check the remediation diff for behavior regressions', ['security-review']),
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

  const conceptOnly = isConceptOnlyQuestion(normalized);
  const asksNoCodeChange = includesAny(normalized, noCodeChangeTerms);
  const hasTesting = isTestingRequest(normalized);
  const hasDirectTestAuthoring = isDirectTestAuthoring(normalized);
  const hasTestAnalysis = isTestAnalysisRequest(normalized);
  const hasTestReportWriting = isTestReportWritingRequest(normalized);
  const hasCoding = !asksNoCodeChange && (includesAny(normalized, codingTerms) || hasWholeWord(normalized, 'api') || isCodeChangeRequest(normalized));
  const hasCodeChange = hasCoding && !hasTestReportWriting;
  const hasChineseWriting = isChineseWriting(normalized, prompt);
  const hasWriting = hasChineseWriting || isEnglishWriting(normalized);
  const hasSecurity = includesAny(normalized, securityTerms);
  const hasRelease = isReleaseRequest(normalized);
  const hasConfigAssets = isConfigAssetRequest(normalized);
  const hasDiagnosisOnly = isDiagnosisOnlyRequest(normalized, asksNoCodeChange);

  if (conceptOnly && !isSecurityConceptQuestion(normalized)) return unknownRoute();

  if (hasSecurity && !hasWriting) {
    return routeByIntent('security-review');
  }

  if (hasCodeChange && hasTesting) {
    return routeByIntent('implementation-with-tests');
  }

  if (hasDirectTestAuthoring) {
    return routeByIntent('testing');
  }

  if (hasTestAnalysis && !hasTestReportWriting) {
    return routeByIntent('testing');
  }

  if (hasChineseWriting) {
    return routeByIntent('writing.zh');
  }

  if (hasWriting) {
    return routeByIntent('writing.en');
  }

  if (hasCodeChange) {
    return routeByIntent('implementation-with-tests');
  }

  if (hasRelease && !hasDiagnosisOnly) {
    return routeByIntent('release');
  }

  if (hasConfigAssets) {
    return routeByIntent('config-assets');
  }

  if (hasDiagnosisOnly) {
    return routeByIntent('diagnosis');
  }

  if (hasTesting && !hasWriting) {
    return routeByIntent('testing');
  }

  return unknownRoute();
}

export function routeByIntent(intent, { source = 'natural-language' } = {}) {
  if (intent === 'diagnosis') {
    return route({
      intent,
      agent: null,
      requiredSkills: [],
      requiredTools: [],
      requiredSubagents: [],
      source,
    });
  }

  if (intent === 'release') {
    return route({
      intent,
      agent: null,
      requiredSkills: [],
      requiredTools: [],
      requiredSubagents: [],
      source,
    });
  }

  if (intent === 'config-assets') {
    return route({
      intent,
      agent: 'config-assets',
      requiredSkills: [],
      requiredTools: ['omp_config_doctor', 'omp_config_assets', 'omp_config_plan'],
      requiredSubagents: subagentPlans.configAssets,
      source,
    });
  }

  if (intent === 'security-review') {
    return route({
      intent,
      agent: 'ecc-security-reviewer',
      requiredSkills: ['security-review', 'security-scan'],
      requiredTools: [],
      requiredSubagents: subagentPlans.security,
      source,
    });
  }

  if (intent === 'implementation-with-tests') {
    return route({
      intent,
      agent: 'implementer',
      requiredSkills: ['brainstorming', 'test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
      requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_gate', 'omp_test_report'],
      requiredSubagents: subagentPlans.implementation,
      source,
    });
  }

  if (intent === 'testing') {
    return route({
      intent,
      agent: 'tester',
      requiredSkills: ['test-driven-development', 'subagent-driven-development', 'verification-before-completion'],
      requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_gate', 'omp_test_report'],
      requiredSubagents: subagentPlans.testing,
      source,
    });
  }

  if (intent === 'writing.zh') {
    return route({
      intent,
      agent: 'writing-helper.zh-writer',
      requiredSkills: ['plain-chinese-writing', 'zh-writing-polish', 'zh-writing-checkers'],
      requiredTools: ['writing_logic_check', 'writing_quality_check'],
      requiredSubagents: subagentPlans.writingZh,
      source,
    });
  }

  if (intent === 'writing.en') {
    return route({
      intent,
      agent: 'writing-helper.writer',
      requiredSkills: ['writing-markdown-helper', 'writing-checkers'],
      requiredTools: ['writing_logic_check', 'writing_quality_check'],
      requiredSubagents: subagentPlans.writingEn,
      source,
    });
  }

  return unknownRoute(source);
}

function route({ intent, agent, requiredSkills = [], requiredTools = [], requiredSubagents = [], source = 'natural-language' }) {
  return {
    intent,
    agent,
    requiredSkills,
    requiredTools,
    requiredSubagents,
    source,
  };
}

function subagent(agent, duty, requiredSkills = []) {
  return { agent, duty, requiredSkills };
}

function isChineseWriting(normalized, original) {
  if (!/[\u4e00-\u9fff]/.test(original)) return false;
  if (isConceptOnlyQuestion(normalized)) return false;
  if (isDirectTestAuthoring(normalized)) return false;
  if (includesAny(normalized, strongZhWritingTerms)) return true;
  if (!normalized.includes('写')) return false;
  return !includesAny(normalized, ['函数', '代码', '接口', '实现', 'api', 'component']);
}

function isEnglishWriting(text) {
  if (includesAny(text, enWritingActionTerms) && includesAny(text, enWritingObjectTerms)) return true;
  return /(?:check|review|improve|edit)\s+.*(?:logic|style|wording|paragraph|abstract|paper|manuscript|report|release notes|changelog|letter|email|proposal|summary)/.test(text);
}

function isTestingRequest(text) {
  return includesAny(text, testingTerms)
    || /(?:write|add|create|run|execute|fix|update|check)\s+tests?\b/.test(text)
    || /\btest\s+(?:this|the|my|our|it|function|code|plugin|workflow|route|logic)\b/.test(text)
    || text.includes('写高信号单元测试')
    || text.includes('写测试')
    || text.includes('补测试');
}

function isDirectTestAuthoring(text) {
  if (isTestReportWritingRequest(text)) return false;
  return /(?:write|add|create)\s+tests?\b/.test(text)
    || text.includes('写高信号单元测试')
    || text.includes('写测试')
    || text.includes('补测试');
}

function isTestReportWritingRequest(text) {
  return /(?:写|起草|撰写|润色|改写|整理)(?:一份|一个|这份|这段|当前)?(?:测试|覆盖率|门禁|回归|e2e|playwright)?(?:报告|总结|说明|文档|记录|复盘|计划)/.test(text)
    || /(?:draft|write|revise|polish|edit|improve)\s+.*(?:test|testing|coverage|gate|regression|e2e|playwright).*(?:report|summary|notes|document|doc|writeup|postmortem)/.test(text)
    || /(?:draft|write|revise|polish|edit|improve)\s+.*(?:report|summary|notes|document|doc|writeup|postmortem).*(?:test|testing|coverage|gate|regression|e2e|playwright)/.test(text);
}

function isTestAnalysisRequest(text) {
  return includesAny(text, ['flaky', 'flakiness', 'test flakiness'])
    || /(?:review|check|analyze|analyse|audit|investigate|inspect)\s+.*(?:tests?|testing|coverage|flaky|flakiness|browser|e2e|playwright)/.test(text)
    || /(?:run|execute|rerun)\s+.*(?:tests?|testing|browser|e2e|playwright)/.test(text)
    || /(?:检查|分析|审查|排查|运行|执行).*(?:测试|覆盖率|门禁|浏览器|e2e|回归)/.test(text);
}

function isCodeChangeRequest(text) {
  return /(?:修改|修复|实现|重构|开发|优化|改)\s*(?:这个|当前|一下|本)?(?:插件|配置|逻辑|代码|功能|接口|hook|hooks|marketplace|workflow|工作流|门禁|路由|提示词)/.test(text)
    || /(?:fix|implement|modify|refactor|build|update)\s+(?:the\s+)?(?:plugin|config|configuration|logic|code|api|hook|hooks|marketplace|workflow|governance|prompt|router|route|validator|gate)/.test(text);
}

function isReleaseRequest(text) {
  if (includesAny(text, noReleaseTerms)) return false;
  return (includesAny(text, releaseTerms) && includesAny(text, ['github', 'marketplace', '插件', '版本', 'plugin', 'release']))
    || /(?:create|cut|prepare|ship)\s+(?:a\s+)?release/.test(text)
    || /\bship\s+(?:the\s+)?(?:plugin\s+)?release/.test(text)
    || /\bupgrade\s+\S+@\S+/.test(text)
    || /\brelease\s+(?:the\s+)?(?:current|plugin|version)/.test(text)
    || /(?:plugin|marketplace)\s+upgrade/.test(text);
}

function isConfigAssetRequest(text) {
  return includesAny(text, configTerms)
    && includesAny(text, ['config', 'assets', 'asset', 'hooks', 'hook', 'skills', 'skill', 'agents', 'templates', 'omp-config', 'marketplace', '配置', '打包', '模板', '清单', '技能']);
}

function isDiagnosisOnlyRequest(text, asksNoCodeChange) {
  if (!includesAny(text, diagnosisTerms)) return false;
  return asksNoCodeChange
    || includesAny(text, ['原因', '为什么', 'why', 'root cause', 'what caused', '是什么导致', '是什么原因'])
    || /\b(?:diagnose|investigate)\b.*\b(?:failure|failing|failed|error|warning|root cause|cause)\b/.test(text);
}

function includesAny(text, terms) {
  return terms.some((term) => hasTerm(text, term));
}

function hasTerm(text, term) {
  if (hasNonAscii(term)) return text.includes(term);
  if (/^[a-z0-9][a-z0-9\s_-]*[a-z0-9]$/i.test(term)) return hasWholeWord(text, term);
  return text.includes(term);
}

function hasWholeWord(text, term) {
  const pattern = escapeRegExp(term).replace(/[\s_-]+/g, '[\\s_-]+');
  return new RegExp(`(^|[^a-z0-9_])${pattern}([^a-z0-9_]|$)`).test(text);
}

function hasNonAscii(value) {
  return /[^\x00-\x7F]/.test(value);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isConceptOnlyQuestion(text) {
  if (!/^(?:what\s+(?:is|are|does|do)\b|who\s+(?:is|was)\b|where\s+(?:is|are)\b|when\s+(?:is|was)\b|define\b|什么是|.*是什么[。？?]?$|.*是什么意思[。？?]?$)/.test(text)) {
    return false;
  }
  return !/(?:fix|implement|modify|refactor|build|update|write|draft|revise|polish|review|check|run|execute|publish|push|upgrade|diagnos|debug|investigate|analy[sz]e|修复|实现|修改|检查|分析|排查|运行|执行|发布|推送|升级|写|润色|改写|审查)/.test(text);
}

function isSecurityConceptQuestion(text) {
  return includesAny(text, [
    'xss',
    'ssrf',
    'owasp',
    'path traversal',
    'command injection',
    'auth bypass',
    'vulnerability',
    'vulnerabilities',
    '漏洞',
    '注入',
    '路径穿越',
  ]);
}

function unknownRoute(source = 'natural-language') {
  return {
    intent: 'unknown',
    agent: null,
    requiredSkills: [],
    requiredTools: [],
    requiredSubagents: [],
    source,
  };
}
