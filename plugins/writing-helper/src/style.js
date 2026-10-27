import { paragraphLocation } from './language.js';

function firstMatch(text, pattern, minMatches = 1) {
  const flags = `${pattern.flags.replace('g', '')}g`;
  const matches = [...text.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length < minMatches) return null;
  return { index: matches[0].index, quote: matches[0][0] };
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
    pattern: 'zh-concession-restatement-close',
    regex: /(?:无论[^，。！？；,.!?;\n]{0,24}|[^，。！？；,.!?;\n]{1,24}再[^，。！？；,.!?;\n]{0,12})[，,]?(?:[^，。！？；,.!?;\n]{1,50}[，,])?(?:(?:这一点|这点|这件事|这种情况|上述情况|这两点|这两样|这两项|这两种)(?:都|也|还|仍然|依然|依旧)?|(?:都|也|还|仍然|依然|依旧)?)(?:不变|没有改变|不会改变|仍然如此|依然如此|[^，。！？；,.!?;\n]{1,16}(?:都|也|还)(?:仍然|依然)只有这一份|[^，。！？；,.!?;\n]{1,16}(?:还是|仍是|依然是)这一份|仍然只有这一份|依然只有这一份|不会变多)(?=[。！？.!?，,；;]|$)/u,
    severity: 'IMPORTANT',
    problem: '让步分句后以「这一点不变」「也仍然只有这一份」「这两样也不会变多」这类空泛收束收尾，后半句可能只复述前文已经写过的数量与限制，缺少信息增量。',
    suggestion: '删除重复的收束，或补上新的条件、范围、原因、后果，不再重述前文已经写过的限制。',
  },
  {
    pattern: 'zh-anaphoric-passive-rider',
    regex: /(?<!里)(?<!中)(?<!下)(?<!时)(?<!后)(?<!前)(?<!以来)(?<!以前)(?<!方面)[，,](?!因为|由于|如果|若|当|除非|虽然|尽管|即使|所以|因此|因而|于是|但|但是|而|否则)[^，。！？；,.!?;\n]{1,24}由(?:它们|它|其(?!他|中|余)|该[^，。！？；,.!?;\n]{0,8}|这个[^，。！？；,.!?;\n]{0,8}|这种[^，。！？；,.!?;\n]{0,8}|上述[^，。！？；,.!?;\n]{0,8}|此[^，。！？；,.!?;\n]{0,8})[^，。！？；,.!?;\n]{1,16}(?=[。！？.!?，,；;]|$)/u,
    severity: 'IMPORTANT',
    problem: '主句完整后用逗号接『由』加回指施事的宾语前置小句，把同一次操作里的另一个动作另起一截说。',
    suggestion: '把尾巴的动作和新对象并进主句，用『并』接在主句动词后面；施事能从前文还原就写一次名称，还原不出来保留回指或拆成独立句。',
  },
  {
    pattern: 'zh-anaphoric-callback-clause',
    regex: /(?<!里)(?<!中)(?<!下)(?<!时)(?<!后)(?<!前)(?<!以来)(?<!以前)(?<!方面)[，,](?!因为|由于|如果|若|当|除非|虽然|尽管|即使|所以|因此|因而|于是|但|但是|而|否则)(?:(?:这|那|此)[^，。！？；,.!?;\n\d]{0,10}(?:就是|正是|便是|才是|是|成了|成为|构成|意味着|标志着|说明|证明|被[^，。！？；,.!?;\n\d]{0,8}视为|被视为|让|使得|使)|(?:正是|就是|便是|才是|成了|成为|构成|意味着|标志着))[^，。！？；,.!?;\n\d]{1,24}(?=[。！？.!?，,；;]|$)/u,
    severity: 'IMPORTANT',
    problem: '完整主句后用逗号接「这」「那」「此」起头的回指小句，只给前面作一次判断、使役或定性。',
    suggestion: '尾句带主句缺的事实、条件或对象就并入主句，只是贴标签就删掉；名称、数字、日期和限定照原文取用。',
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
    minMatches: 3,
    problem: 'Repeated formulaic transitions can make paragraph flow mechanical.',
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
    const match = firstMatch(text, new RegExp(rule.regex.source, rule.regex.flags), rule.minMatches ?? 1);
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
