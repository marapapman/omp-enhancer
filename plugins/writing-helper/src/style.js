import { paragraphLocation } from './language.js';

function firstMatch(text, pattern) {
  const match = pattern.exec(text);
  if (!match) return null;
  return { index: match.index, quote: match[0] };
}

function issue({ id, pattern, language, text, match, severity = 'MINOR', problem, suggestion }) {
  return {
    id,
    category: 'style',
    dimension: 'style',
    pattern,
    severity,
    location: paragraphLocation(text, match.index, language),
    quote: match.quote,
    problem,
    suggestion,
  };
}

export const ZH_RULES = [
  {
    pattern: 'zh-colon-claim',
    regex: /：(?![^\n]*[、，,；][^\n]*[、，,；])(?![ \u3000]*\$)(?![ \u3000]*\\texttt)(?![ \u3000]*\\verb)(?![ \u3000]*\\begin\{)(?![^。；\n]{0,30}是指)(?![^。；\n]{0,30}定义为)/u,
    severity: 'IMPORTANT',
    problem: '冒号把标签或论断直接接在句子上，读起来像标题式断言。',
    suggestion: '只有三项以上的列举、定义、公式和代码之前可以用冒号，其他情况改写成完整句子。',
  },
  {
    pattern: 'zh-negation-couplet-variant',
    regex: /不在(?:于)?[^。；\n]{1,30}而在(?:于)?/u,
    severity: 'IMPORTANT',
    problem: '“不在……而在……”式的否定对偶是套话结构。',
    suggestion: '直接写正面结论，删掉对比铺垫。',
  },
  {
    pattern: 'zh-pseudo-profound',
    regex: /核心思想是|其实是同一件事|本质上是/u,
    severity: 'IMPORTANT',
    problem: '用“本质”“核心”给结论盖章，没有增加信息。',
    suggestion: '改写成具体的机制、条件或结果。',
  },
  {
    pattern: 'zh-number-bundling',
    regex: /这三件事|这三处|两大|缺一不可/u,
    problem: '用数字打包把内容概括成口号。',
    suggestion: '把每一项单独写清楚，或改成具体的数量关系。',
  },
  {
    pattern: 'zh-x-decides-y',
    regex: /[^。；\n]{1,20}决定了?[^。；\n]{1,20}/u,
    problem: '“X 决定 Y”把关系压缩成口号式判断。',
    suggestion: '写清楚 X 通过什么机制影响 Y，或给出具体条件。',
  },
  {
    pattern: 'zh-colloquial-judgement',
    regex: /一眼看出|一眼可分|一眼就能|最能说明|又快又稳|划算得多|瞬间完成|躲不过|涨得最凶|越悬殊/u,
    problem: '口语化评判词替代了具体依据。',
    suggestion: '给出可核对的数字、条件或现象。',
  },
  {
    pattern: 'zh-didactic-cognition',
    regex: /(?<!栈)记住|请注意|划重点|分清楚|看清楚|搞清楚|(?:定|堵|卡|限)死/u,
    problem: '对读者发指令的说教式认知句。',
    suggestion: '删掉指令，直接陈述读者需要知道的事实；「栈记住」「写死」「锁死」「框死」这类字面用法除外。',
  },
  {
    pattern: 'zh-empty-opener',
    regex: /近年来，?随着[^。！？\n]{0,40}(快速发展|不断发展|持续发展)/u,
    problem: '空泛开头没有提供具体背景信息。',
    suggestion: '直接写研究对象、问题或事实背景。',
  },
  {
    pattern: 'zh-structure-signpost',
    regex: /本文将从以下几个方面展开|接下来[，,]?我们将深入探讨|本文旨在深入探讨/u,
    problem: '过度结构提示替代了实质内容。',
    suggestion: '删除提示句，直接进入论证内容。',
  },
  {
    pattern: 'zh-generic-evaluation',
    regex: /具有重要意义|发挥着重要作用|提供了有益参考|具有广阔前景|展现出巨大潜力/u,
    problem: '泛化评价缺少具体依据。',
    suggestion: '说明意义、作用或适用范围的具体内容。',
  },
  {
    pattern: 'zh-formulaic-ending',
    regex: /未来仍需进一步探索|相信[^。！？\n]{0,30}将在更多领域发挥价值/u,
    problem: '套话结尾没有给出具体后续工作。',
    suggestion: '改为具体限制、风险或下一步实验。',
  },
  {
    pattern: 'zh-translationese-verb',
    regex: /进行(分析|研究|处理|优化|验证)|实现了?(提升|改进|优化|识别)|基于上述分析/u,
    problem: '动词抽象化造成翻译腔。',
    suggestion: '改用直接动词，例如“分析”“提升”“根据”。',
  },
  {
    pattern: 'zh-passive-overuse',
    regex: /被用于|被用来|被认为|被证明/u,
    problem: '中文学术写作中过多被动句会削弱主语。',
    suggestion: '能明确执行者时改为主动句。',
  },
  {
    pattern: 'zh-de-chain',
    regex: /(?:[^。！？\n]{0,12}的){3,}[^。！？\n]{0,12}/u,
    problem: '连续“的”字结构可读性较差。',
    suggestion: '拆分修饰关系，或把部分限定移到句首、句尾。',
  },
  {
    pattern: 'zh-em-dash',
    regex: /——/u,
    severity: 'IMPORTANT',
    problem: '中文报告要求禁用破折号。',
    suggestion: '保留原意后改成普通句式，必要时拆句。',
  },
  {
    pattern: 'zh-markdown-residue',
    regex: /\*\*[^*]+\*\*|^#{1,6}\s+/mu,
    problem: '正文中残留 Markdown 标记。',
    suggestion: '按目标格式删除或转换这些标记。',
  },
  {
    pattern: 'zh-mixed-space',
    regex: /[\u4e00-\u9fff][A-Za-z0-9]|[A-Za-z0-9][\u4e00-\u9fff]/u,
    problem: '中英文或中文数字混排缺少空格。',
    suggestion: '在中文和英文、数字之间加入空格，专有名词例外。',
  },
];

const EN_RULES = [
  {
    pattern: 'en-formulaic-introduction',
    regex: /in today'?s rapidly evolving (landscape|field|era)|with the advent of|in recent years, there has been|this paper (explores|presents|delves into)/iu,
    problem: 'Formulaic introduction delays the concrete point.',
    suggestion: 'Start with the specific subject, fact, or problem.',
  },
  {
    pattern: 'en-generic-hedging',
    regex: /it is worth noting that|it is important to|it should be mentioned that|it is crucial to/iu,
    problem: 'Generic hedging adds padding without evidence.',
    suggestion: 'Remove the hedge or state the concrete condition.',
  },
  {
    pattern: 'en-repetitive-transition',
    regex: /\b(furthermore|moreover|in addition|consequently|nevertheless|thus|therefore),/iu,
    problem: 'Formulaic transition can make paragraph flow mechanical.',
    suggestion: 'Use the logical relationship directly or merge adjacent claims.',
  },
  {
    pattern: 'en-inflated-significance',
    regex: /stands as a testament|marks a pivotal moment|plays a crucial role|underscores the importance|represents a shift/iu,
    problem: 'Inflated significance substitutes emphasis for evidence.',
    suggestion: 'Name the concrete effect or remove the phrase.',
  },
  {
    pattern: 'en-ai-vocabulary',
    regex: /\b(delve|intricate|interplay|tapestry|testament|beacon|pivotal|foster|garner|showcase|underscore|vibrant)\b/iu,
    problem: 'Overused AI-style vocabulary weakens precision.',
    suggestion: 'Use a plain verb or a specific technical term.',
  },
  {
    pattern: 'en-negative-parallelism',
    regex: /not just about [^.;]+,? (it'?s )?about|not only [^.;]+ but also/iu,
    problem: 'Negative parallelism is often a rhetorical template.',
    suggestion: 'Rewrite as a direct positive claim.',
  },
  {
    pattern: 'en-generic-conclusion',
    regex: /the future looks bright|exciting times lie ahead|major step forward/iu,
    problem: 'Generic conclusion does not add a specific implication.',
    suggestion: 'Replace it with a concrete limitation or next step.',
  },
  {
    pattern: 'en-em-dash-overuse',
    regex: /(?:[^—]*—){3}/u,
    problem: 'Frequent em dashes create a choppy AI-like rhythm.',
    suggestion: 'Use periods, commas, or parentheses where they fit the syntax.',
  },
];

export function styleIssues(text, language) {
  const rules = language === 'zh' ? ZH_RULES : EN_RULES;
  const issues = [];
  for (const rule of rules) {
    const match = firstMatch(text, new RegExp(rule.regex.source, rule.regex.flags));
    if (!match) continue;
    issues.push(issue({
      id: `${rule.pattern}-${issues.length + 1}`,
      pattern: rule.pattern,
      language,
      text,
      match,
      severity: rule.severity,
      problem: rule.problem,
      suggestion: rule.suggestion,
    }));
  }
  return issues;
}
