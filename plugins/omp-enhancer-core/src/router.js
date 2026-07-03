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

export function routeNaturalLanguageTask(input = {}) {
  const prompt = String(input.prompt ?? input.text ?? '');
  const normalized = prompt.toLowerCase();

  if (!normalized.trim()) return unknownRoute();

  if (includesAny(normalized, configTerms) && includesAny(normalized, ['config', 'assets', 'hooks', 'omp-config', 'marketplace', '配置'])) {
    return {
      intent: 'config-assets',
      agent: 'config-assets',
      requiredSkills: [],
      requiredTools: ['omp_config_doctor', 'omp_config_assets', 'omp_config_plan'],
      source: 'natural-language',
    };
  }

  const hasTesting = includesAny(normalized, testingTerms);
  const hasCoding = includesAny(normalized, codingTerms);
  const hasWriting = includesAny(normalized, zhWritingTerms) || includesAny(normalized, enWritingTerms);
  const asksToWriteTests = /write\s+tests?/.test(normalized) || normalized.includes('写高信号单元测试') || normalized.includes('写测试') || normalized.includes('补测试');

  if (hasCoding && hasTesting) {
    return {
      intent: 'implementation-with-tests',
      agent: 'implementer',
      requiredSkills: ['brainstorming', 'test-driven-development', 'verification-before-completion'],
      requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_gate', 'omp_test_report'],
      source: 'natural-language',
    };
  }

  if (asksToWriteTests || (hasTesting && !hasWriting)) {
    return {
      intent: 'testing',
      agent: 'tester',
      requiredSkills: ['test-driven-development', 'verification-before-completion'],
      requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_gate', 'omp_test_report'],
      source: 'natural-language',
    };
  }

  if (isChineseWriting(normalized, prompt)) {
    return {
      intent: 'writing.zh',
      agent: 'writing-helper.zh-writer',
      requiredSkills: ['plain-chinese-writing', 'zh-writing-polish', 'zh-writing-checkers'],
      requiredTools: ['writing_logic_check', 'writing_quality_check'],
      source: 'natural-language',
    };
  }

  if (hasCoding) {
    return {
      intent: 'implementation-with-tests',
      agent: 'implementer',
      requiredSkills: ['brainstorming', 'test-driven-development', 'verification-before-completion'],
      requiredTools: ['omp_test_analyze', 'omp_test_context', 'omp_test_gate', 'omp_test_report'],
      source: 'natural-language',
    };
  }

  if (hasWriting) {
    return {
      intent: 'writing.en',
      agent: 'writing-helper.writer',
      requiredSkills: ['writing-plans', 'writing-markdown-helper', 'writing-checkers'],
      requiredTools: ['writing_logic_check', 'writing_quality_check'],
      source: 'natural-language',
    };
  }


  return unknownRoute();
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
    source: 'natural-language',
  };
}
