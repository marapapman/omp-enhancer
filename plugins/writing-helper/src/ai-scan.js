import { paragraphLocation, resolveLanguage } from './language.js';
import { MAX_ISSUES_CONFIG, clampMaxIssues } from './max-issues.js';
import { styleIssues } from './style.js';

const EN_WORD_RE = /[A-Za-z][A-Za-z'’-]*/gu;
const CJK_OR_WORD_RE = /[\u3400-\u9fff]|[A-Za-z][A-Za-z'’-]*/gu;
const EN_ABBREVIATIONS = ['e.g.', 'i.e.', 'et al.', 'vs.', 'Fig.', 'Eq.', 'No.', 'cf.'];

const EN_STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'while', 'because', 'as', 'of',
  'to', 'in', 'on', 'at', 'for', 'from', 'with', 'by', 'is', 'are', 'was',
  'were', 'be', 'been', 'being', 'this', 'that', 'these', 'those', 'it', 'its',
  'we', 'our', 'they', 'their', 'he', 'she', 'his', 'her', 'i', 'you', 'your',
]);

const ZH_STOPWORDS = new Set([
  '的', '了', '和', '与', '在', '是', '有', '也', '就', '都', '而', '及', '等',
  '对', '为', '从', '到', '中', '上', '下', '一个', '一种', '这', '那', '其',
  '我们', '他们', '它们', '可以', '能够', '已经', '没有', '不是', '就是',
]);

const EN_CONNECTIVES = [
  'because', 'for this reason', 'therefore', 'thus', 'moreover', 'furthermore',
  'in addition', 'however', 'nevertheless', 'although', 'in other words',
  'more precisely', 'specifically', 'in practice', 'generally speaking',
  'on the other hand', 'as a result', 'consequently', 'similarly',
  'in contrast', 'overall', 'in summary', 'first', 'second', 'third', 'finally',
];

const ZH_CONNECTIVES = [
  '因为', '因此', '所以', '然而', '但是', '不过', '此外', '同时', '也就是说',
  '换句话说', '具体来说', '更重要的是', '首先', '其次', '最后', '一方面',
  '另一方面', '不仅', '而且', '总之', '综上', '由此可见', '与此同时',
  '在此基础上',
];

const EN_PARALLEL_SETUPS = [
  { id: 'not-only-but-also', regex: /\bnot only\b[\s\S]{0,120}\bbut also\b/iu, reason: 'not only ... but also' },
  { id: 'both-and', regex: /\bboth\b[^.;]{0,80}\band\b/iu, reason: 'both ... and', weight: 0.5, weak: true },
  { id: 'on-one-hand', regex: /\bon the one hand\b[\s\S]{0,160}\bon the other hand\b/iu, reason: 'on the one hand ... on the other hand', weight: 0.5, weak: true },
  { id: 'first-second-third', regex: /\bfirst(?:ly)?\b[^.;]{0,120}\bsecond(?:ly)?\b[^.;]{0,120}\bthird(?:ly)?\b/iu, reason: 'first ... second ... third' },
  { id: 'from-to-to', regex: /\bfrom\b[^.;]{0,80}\bto\b[^.;]{0,80}\bto\b/iu, reason: 'from ... to ... to ...' },
  { id: 'two-three-forces', regex: /\b(?:two|three|four)\s+(?:things|forces|factors|dimensions|pillars|steps)\b/iu, reason: 'a numbered set announced before the list' },
];

const ZH_PARALLEL_SETUPS = [
  { id: 'not-only-but-also', regex: /不仅[\s\S]{0,100}而且/u, reason: '不仅……而且……' },
  { id: 'both-and', regex: /既[\s\S]{0,80}又/u, reason: '既……又……', weight: 0.5, weak: true },
  { id: 'one-hand-other', regex: /一方面[\s\S]{0,160}另一方面/u, reason: '一方面……另一方面……', weight: 0.5, weak: true },
  { id: 'first-second', regex: /首先[\s\S]{0,160}其次/u, reason: '首先……其次……' },
  { id: 'from-to-to', regex: /从[\s\S]{0,80}到[\s\S]{0,80}再到/u, reason: '从……到……再到……' },
  { id: 'numbered-set', regex: /(?:两个|三个|四个)(?:方面|层面|维度|要素|抓手|步骤|阶段)/u, reason: '先宣布数量再展开' },
  { id: 'not-x-but-y', regex: /不是[\s\S]{0,80}而是/u, reason: '不是……而是……' },
];

const EN_METAPHOR_MARKERS = [
  { id: 'is-like', regex: /\b(?:is|are|was|were)\s+like\b/iu },
  { id: 'viewed-as', regex: /\b(?:can be|may be)\s+(?:seen|viewed|thought of)\s+as\b/iu },
  { id: 'think-of-as', regex: /\bthink of\b[^.;]{0,40}\bas\b/iu },
];

const EN_METAPHOR_NOUNS = /\b(?:is|are|was|were|serves as|acts as|functions as|becomes)\b[^.;]{0,30}\b(?:engine|backbone|glue|bridge|lens|blueprint|dna|cornerstone|pillar|foundation|compass|mirror|double-edged sword|lifeblood|heart|nervous system|immune system|ecosystem|flywheel|moat)\b|\b(?:engine|backbone|glue|bridge|lens|blueprint|dna|cornerstone|pillar|foundation|compass|mirror|double-edged sword|lifeblood|heart|nervous system|immune system|ecosystem|flywheel|moat)\s+of\b/iu;
const EN_HEDGES = /\b(?:roughly|approximately|in some respects|to some extent|arguably|metaphorically)\b/iu;

const ZH_METAPHOR_MARKERS = [
  { id: 'simile', regex: /(?:如同|就像|好比|犹如|恰似|无异于|堪称|可谓|像是|仿佛是)/u },
  { id: 'is-x', regex: /(?:是|成为|充当|扮演)[^。；]{0,20}(?:基石|引擎|桥梁|纽带|钥匙|DNA|双刃剑|护城河|飞轮|心脏|大脑|神经|免疫系统|生态|镜子|灯塔|指南针|蓝图|支柱|根基)/u },
];
const ZH_HEDGES = /(?:在一定程度上|大致|某种意义上|可以说|打个比方)/u;

const EN_AI_TERMS = {
  delve: 0.15, intricate: 0.2, interplay: 0.1, tapestry: 0.05, testament: 0.1,
  pivotal: 0.15, foster: 0.2, garner: 0.1, showcase: 0.1, underscore: 0.15,
  vibrant: 0.1, leverage: 0.2, robust: 0.3, seamless: 0.15, comprehensive: 0.25,
  multifaceted: 0.05, nuanced: 0.1, crucial: 0.3, vital: 0.2, paramount: 0.1,
  meticulous: 0.05, realm: 0.1, landscape: 0.2, journey: 0.2, navigate: 0.15,
  unlock: 0.15, harness: 0.15, illuminate: 0.1, elucidate: 0.05,
  facilitate: 0.2, optimize: 0.2, streamline: 0.1, elevate: 0.1, empower: 0.1,
  holistic: 0.1, paradigm: 0.15, synergy: 0.05, ecosystem: 0.2,
};

const ZH_AI_TERMS = {
  赋能: 0.2, 闭环: 0.1, 抓手: 0.08, 底层逻辑: 0.05, 顶层设计: 0.08, 生态: 0.2,
  范式: 0.15, 维度: 0.2, 颗粒度: 0.05, 对齐: 0.15, 沉淀: 0.15, 复用: 0.1,
  打通: 0.1, 全链路: 0.05, 组合拳: 0.03, 护城河: 0.03, 飞轮: 0.03,
  破局: 0.05, 复盘: 0.05, 拉通: 0.05, 落地: 0.25, 势能: 0.05, 心智: 0.08,
  认知: 0.2, 价值: 0.5, 深度: 0.4, 广度: 0.2, 温度: 0.1, 力度: 0.2, 高度: 0.3,
};

const EN_THRESHOLDS = {
  cvLow: 0.5,
  openingEntropyLow: 0.75,
  connectiveDensityHigh: 8,
  connectiveEntropyLow: 0.85,
  ngramRatioHigh: 0.08,
  parallelScoreHigh: 4,
  parallelRateHigh: 5,
  metaphorScoreHigh: 3,
  metaphorRateHigh: 0.5,
  habitZHigh: 4,
  profileDirectionalLow: 0.9,
  profileDirectionalHigh: 1.8,
  lexicalZLow: 1.5,
  lexicalZHigh: 6.5,
  ngramRatioLow: 0.03,
  ngramRatioTop: 0.13,
  parallelRateLow: 2,
  parallelRateTop: 8,
  metaphorRateLow: 0.3,
  metaphorRateTop: 1.5,
  cvModerate: 0.5,
  cvSpan: 0.2,
  habitZLow: 3,
  habitZTop: 8,
};

const ZH_THRESHOLDS = {
  cvLow: 0.5,
  openingEntropyLow: 0.7,
  connectiveDensityHigh: 6,
  connectiveEntropyLow: 0.8,
  ngramRatioHigh: 0.08,
  parallelScoreHigh: 4,
  parallelRateHigh: 5,
  metaphorScoreHigh: 3,
  metaphorRateHigh: 0.5,
  habitZHigh: 4,
  profileDirectionalLow: 0.9,
  profileDirectionalHigh: 1.7,
  lexicalZLow: 2.5,
  lexicalZHigh: 7.5,
  ngramRatioLow: 0.04,
  ngramRatioTop: 0.1,
  parallelRateLow: 2,
  parallelRateTop: 8,
  metaphorRateLow: 0.3,
  metaphorRateTop: 1.5,
  cvModerate: 0.5,
  cvSpan: 0.2,
  habitZLow: 3,
  habitZTop: 8,
};

// Reference profile from a small pre-2020 human corpus (10 English, 10 Chinese
// documents). Directional weights compare that reference with a 2026 AI-written
// web sample. The resulting score is advisory distribution evidence, not an
// authorship verdict.
const EN_PROFILE = {
  fw_the: { mean: 55.3993, sd: 12.6427 },
  fw_and: { mean: 18.0339, sd: 5.1417 },
  fw_that: { mean: 15.0954, sd: 2.6583 },
  fw_have: { mean: 5.3623, sd: 2.4172 },
  fw_would: { mean: 2.6568, sd: 1.2158 },
  fw_was: { mean: 9.2435, sd: 6.2160 },
  fw_with: { mean: 4.6646, sd: 1.7901 },
  fw_but: { mean: 6.1339, sd: 1.8330 },
  fw_i: { mean: 6.0575, sd: 6.2933 },
  fw_you: { mean: 11.1786, sd: 11.3950 },
  fw_he: { mean: 3.1329, sd: 3.3755 },
  fw_it: { mean: 10.5930, sd: 3.3855 },
  pron_1p: { mean: 12.5164, sd: 6.8414 },
  pron_2p: { mean: 13.1579, sd: 13.2331 },
  pron_3p: { mean: 16.7415, sd: 9.9187 },
  contractions: { mean: 9.7179, sd: 12.3027 },
  nominalization: { mean: 23.2823, sd: 5.5628 },
  adverb_ly: { mean: 17.8680, sd: 3.4702 },
  long_words: { mean: 154.1545, sd: 25.3982 },
  mean_word_len: { mean: 4.7369, sd: 0.2000 },
  colon: { mean: 0.8612, sd: 0.8382 },
  comma: { mean: 8.9965, sd: 1.8561 },
  semicolon: { mean: 0.1869, sd: 0.1275 },
  dash: { mean: 0.1799, sd: 0.2746 },
  paren: { mean: 0.9463, sd: 1.0916 },
  sent_cv: { mean: 0.5967, sd: 0.0538 },
  short_sent: { mean: 30.0279, sd: 21.2780 },
  long_sent: { mean: 14.8831, sd: 15.5898 },
  adj_corr: { mean: 0.0677, sd: 0.1387 },
};

const ZH_PROFILE = {
  fw_的: { mean: 40.2376, sd: 11.2983 },
  fw_了: { mean: 11.8717, sd: 5.6635 },
  fw_是: { mean: 25.9079, sd: 11.1681 },
  fw_在: { mean: 10.1626, sd: 3.2500 },
  fw_和: { mean: 3.1254, sd: 3.2000 },
  fw_与: { mean: 0.7325, sd: 0.9140 },
  fw_对: { mean: 3.3558, sd: 2.4813 },
  fw_从: { mean: 1.5536, sd: 1.2809 },
  fw_为: { mean: 6.2781, sd: 2.8714 },
  fw_被: { mean: 0.9930, sd: 1.2875 },
  fw_把: { mean: 1.6025, sd: 1.3081 },
  fw_也: { mean: 6.0715, sd: 4.4035 },
  fw_都: { mean: 3.2061, sd: 2.2838 },
  fw_就: { mean: 8.3885, sd: 6.7145 },
  fw_而: { mean: 2.8784, sd: 1.5065 },
  fw_但: { mean: 2.0344, sd: 1.4051 },
  fw_并: { mean: 0.8356, sd: 0.6816 },
  fw_其: { mean: 2.5632, sd: 2.3113 },
  fw_这: { mean: 11.2418, sd: 6.8280 },
  fw_那: { mean: 1.9704, sd: 1.6689 },
  pron_我: { mean: 15.8219, sd: 8.8594 },
  pron_我们: { mean: 4.8860, sd: 6.1804 },
  pron_你: { mean: 1.8824, sd: 1.8506 },
  pron_你们: { mean: 0.0970, sd: 0.2185 },
  pron_他: { mean: 3.6902, sd: 4.1246 },
  pron_他们: { mean: 1.3053, sd: 1.4792 },
  suf_性: { mean: 1.7640, sd: 1.6124 },
  suf_化: { mean: 1.3479, sd: 1.9240 },
  suf_度: { mean: 1.7186, sd: 2.1886 },
  suf_力: { mean: 2.1446, sd: 3.0178 },
  suf_感: { mean: 1.1770, sd: 1.1903 },
  suf_者: { mean: 1.4467, sd: 1.7716 },
  comma: { mean: 46.9927, sd: 18.3398 },
  colon: { mean: 2.6088, sd: 1.5387 },
  dash: { mean: 0.2167, sd: 0.4834 },
  paren: { mean: 1.5588, sd: 3.4765 },
  dunhao: { mean: 4.6710, sd: 7.3385 },
  period: { mean: 21.6561, sd: 10.1308 },
  sent_cv: { mean: 0.6429, sd: 0.0795 },
  short_sent: { mean: 32.6310, sd: 21.1589 },
  long_sent: { mean: 12.6300, sd: 23.3917 },
  adj_corr: { mean: 0.0634, sd: 0.1289 },
};

const EN_PROFILE_DIRECTION = {
  fw_the: -0.1511,
  fw_and: 0.4132,
  fw_that: -0.3321,
  fw_have: -0.2498,
  fw_would: -0.2156,
  fw_was: -0.2269,
  fw_with: 0.2969,
  fw_but: -0.3599,
  fw_i: -0.1028,
  fw_you: -0.0274,
  fw_he: -0.1526,
  fw_it: 0.0284,
  pron_1p: -0.2234,
  pron_2p: 0.0252,
  pron_3p: -0.1870,
  contractions: -0.0454,
  nominalization: 0.1672,
  adverb_ly: 0.0646,
  long_words: 0.1375,
  mean_word_len: 0.2656,
  colon: 0.2822,
  comma: -0.0925,
  semicolon: 0.1558,
  dash: -0.0008,
  paren: -0.0174,
  sent_cv: -0.1245,
  short_sent: -0.0337,
  long_sent: -0.1493,
  adj_corr: -0.0866,
};

const ZH_PROFILE_DIRECTION = {
  fw_的: -0.0449,
  fw_了: -0.1170,
  fw_是: -0.1905,
  fw_在: -0.1226,
  fw_和: 0.0090,
  fw_与: 0.3415,
  fw_对: -0.0254,
  fw_从: 0.2209,
  fw_为: -0.0424,
  fw_被: 0.0935,
  fw_把: 0.1828,
  fw_也: -0.1168,
  fw_都: -0.1477,
  fw_就: -0.1184,
  fw_而: 0.1275,
  fw_但: -0.1524,
  fw_并: 0.0313,
  fw_其: -0.0914,
  fw_这: -0.0758,
  fw_那: -0.2016,
  pron_我: -0.1449,
  pron_我们: -0.0443,
  pron_你: 0.2028,
  pron_你们: -0.0697,
  pron_他: -0.1587,
  pron_他们: -0.1949,
  suf_性: 0.0064,
  suf_化: 0.2114,
  suf_度: 0.0766,
  suf_力: -0.1842,
  suf_感: -0.0286,
  suf_者: 0.0969,
  comma: -0.2770,
  colon: 0.3816,
  dash: 0.3514,
  paren: 0.0150,
  dunhao: -0.0190,
  period: -0.1577,
  sent_cv: 0.0439,
  short_sent: 0.0528,
  long_sent: -0.0316,
  adj_corr: 0.0603,
};

function defaultSegmenter() {
  return new Intl.Segmenter('zh', { granularity: 'word' });
}

const ZH_SEGMENTER = defaultSegmenter();

export function segmentWords(text, language, segmenter = ZH_SEGMENTER) {
  const source = String(text ?? '');
  if (language === 'zh') {
    if (segmenter) {
      const words = [];
      for (const part of segmenter.segment(source)) {
        if (part.isWordLike) words.push(part.segment);
      }
      return words;
    }
    return source.match(CJK_OR_WORD_RE) ?? [];
  }
  return source.match(EN_WORD_RE) ?? [];
}

export function splitSentences(text, language) {
  const source = String(text ?? '').replace(/\r\n?/gu, '\n').trim();
  if (source === '') return [];
  if (language === 'zh') {
    return source
      .split(/(?<=[。！？])|\n+/u)
      .map((sentence) => sentence.trim())
      .filter(Boolean);
  }

  let working = source;
  for (const abbreviation of EN_ABBREVIATIONS) {
    working = working.split(abbreviation).join(abbreviation.replace(/\./gu, '\u0000'));
  }
  return working
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(\[])|(?:\n+)/u)
    .map((sentence) => sentence.replaceAll('\u0000', '.').trim())
    .filter(Boolean);
}

export function shannonEntropy(counts) {
  const positive = counts.filter((count) => Number.isFinite(count) && count > 0);
  const total = positive.reduce((sum, count) => sum + count, 0);
  if (total === 0) return 0;
  const entropy = -positive.reduce((sum, count) => {
    const probability = count / total;
    return sum + probability * Math.log2(probability);
  }, 0);
  return entropy === 0 ? 0 : entropy;
}

export function normalizedEntropy(counts) {
  const types = counts.filter((count) => Number.isFinite(count) && count > 0).length;
  if (types <= 1) return 0;
  return shannonEntropy(counts) / Math.log2(types);
}

export function movingAverageTypeTokenRatio(tokens, window = 50) {
  if (tokens.length === 0) return 0;
  if (tokens.length <= window) {
    return new Set(tokens).size / tokens.length;
  }
  let total = 0;
  let windows = 0;
  for (let index = 0; index + window <= tokens.length; index += 1) {
    total += new Set(tokens.slice(index, index + window)).size / window;
    windows += 1;
  }
  return total / windows;
}

export function computeSentenceStats(sentences, language, segmenter = ZH_SEGMENTER) {
  const lengths = sentences
    .map((sentence) => segmentWords(sentence, language, segmenter).length)
    .filter((length) => length > 0);
  if (lengths.length === 0) {
    return { count: 0, mean: 0, stdDev: 0, coefficientOfVariation: 0, burstiness: 0, min: 0, max: 0 };
  }
  const mean = lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
  const variance = lengths.reduce((sum, length) => sum + (length - mean) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);
  return {
    count: lengths.length,
    mean,
    stdDev,
    coefficientOfVariation: stdDev / mean,
    burstiness: (stdDev - mean) / (stdDev + mean),
    min: Math.min(...lengths),
    max: Math.max(...lengths),
  };
}

function contentTokens(tokens, language) {
  const stopwords = language === 'zh' ? ZH_STOPWORDS : EN_STOPWORDS;
  return tokens.filter((token) => !stopwords.has(token));
}

export function repeatedNgrams(tokens, size = 3, limit = 5) {
  if (tokens.length < size) {
    return { total: 0, ratio: 0, repeatedCount: 0, top: [] };
  }
  const total = tokens.length - size + 1;
  const counts = new Map();
  for (let index = 0; index < total; index += 1) {
    const key = tokens.slice(index, index + size).join(' ');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const repeated = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const repeatedOccurrences = repeated.reduce((sum, [, count]) => sum + count, 0);
  return {
    total,
    ratio: Math.min(1, repeatedOccurrences / total),
    repeatedCount: repeated.length,
    top: repeated.slice(0, limit).map(([phrase, count]) => ({ phrase, count })),
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function countPhrase(text, phrase, language) {
  if (language === 'zh') {
    return text.split(phrase).length - 1;
  }
  const matches = text.match(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'giu'));
  return matches ? matches.length : 0;
}

export function connectiveStats(text, tokens, language) {
  const connectives = language === 'zh' ? ZH_CONNECTIVES : EN_CONNECTIVES;
  const counts = connectives.map((phrase) => countPhrase(text, phrase, language));
  const total = counts.reduce((sum, count) => sum + count, 0);
  const top = connectives
    .map((phrase, index) => ({ phrase, count: counts[index] }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count || left.phrase.localeCompare(right.phrase))
    .slice(0, 5);
  return {
    total,
    density: tokens.length > 0 ? (total / tokens.length) * 1000 : 0,
    entropy: normalizedEntropy(counts),
    top,
  };
}

function openingKey(tokens, language) {
  const stopwords = language === 'zh' ? ZH_STOPWORDS : EN_STOPWORDS;
  for (const token of tokens) {
    const key = language === 'zh' ? token : token.toLowerCase();
    if (!stopwords.has(key)) return key;
  }
  return '';
}

function endingKey(tokens, language) {
  const stopwords = language === 'zh' ? ZH_STOPWORDS : EN_STOPWORDS;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const key = language === 'zh' ? tokens[index] : tokens[index].toLowerCase();
    if (!stopwords.has(key)) return key;
  }
  return '';
}

function detectTriplet(sentence, language, segmenter) {
  const primary = sentence
    .split(language === 'zh' ? /[；;]/u : /[,;]/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const parts = primary.length >= 3
    ? primary
    : sentence
      .split(language === 'zh' ? /[、，,]/u : /[,]/u)
      .map((part) => part.trim())
      .filter(Boolean);
  if (parts.length < 3) return null;
  const lengths = parts.map((part) => segmentWords(part, language, segmenter).length);
  const minimum = Math.min(...lengths);
  const maximum = Math.max(...lengths);
  if (minimum < 2 || maximum - minimum > 3) return null;
  if (language === 'en' && !/\b(?:and|or)\b/iu.test(sentence)) return null;

  if (language === 'zh') {
    const prefixes = parts.map((part) => segmentWords(part, language, segmenter).slice(0, 2).join(' '));
    const suffixes = parts.map((part) => segmentWords(part, language, segmenter).slice(-2).join(' '));
    const sharedPrefix = prefixes.some((prefix) => prefix !== '' && prefixes.indexOf(prefix) !== prefixes.lastIndexOf(prefix));
    const sharedSuffix = suffixes.some((suffix) => suffix !== '' && suffixes.indexOf(suffix) !== suffixes.lastIndexOf(suffix));
    if (!sharedPrefix && !sharedSuffix) return null;
  }

  return {
    kind: 'triplet',
    quote: sentence.slice(0, 240),
    reason: `${parts.length} comma-separated parts of similar length`,
  };
}

export function detectParallelRuns(sentences, language, segmenter = ZH_SEGMENTER) {
  const setups = language === 'zh' ? ZH_PARALLEL_SETUPS : EN_PARALLEL_SETUPS;
  const runs = [];
  for (const sentence of sentences) {
    for (const setup of setups) {
      if (setup.regex.test(sentence)) {
        runs.push({
          kind: 'setup',
          id: setup.id,
          quote: sentence.slice(0, 240),
          reason: setup.reason,
          weight: setup.weight ?? 1.5,
          weak: setup.weak === true,
        });
      }
    }
    const triplet = detectTriplet(sentence, language, segmenter);
    if (triplet) runs.push(triplet);
  }

  let streak = [];
  const flush = () => {
    if (streak.length >= 3) {
      runs.push({
        kind: 'run',
        quote: streak.map((item) => item.sentence).join(' ').slice(0, 240),
        reason: `${streak.length} consecutive sentences share an opening or ending and a similar length`,
      });
    }
    streak = [];
  };
  for (const sentence of sentences) {
    const tokens = segmentWords(sentence, language, segmenter);
    if (tokens.length === 0) {
      flush();
      continue;
    }
    const previous = streak[streak.length - 1];
    const first = openingKey(tokens, language);
    const last = endingKey(tokens, language);
    const similarLength = previous
      ? Math.abs(tokens.length - previous.length) <= Math.max(2, Math.round(previous.length * 0.25))
      : false;
    const sharedEdge = previous ? Boolean((first && first === previous.first) || (last && last === previous.last)) : false;
    if (previous && similarLength && sharedEdge) {
      streak.push({ sentence, length: tokens.length, first, last });
    } else {
      flush();
      streak = [{ sentence, length: tokens.length, first, last }];
    }
  }
  flush();
  const score = runs.reduce((sum, run) => sum + (
    run.kind === 'run' ? 2 : run.kind === 'triplet' ? 1 : run.weight
  ), 0);
  return { score, runs };
}

function sentenceLength(sentence, language, segmenter) {
  return language === 'zh'
    ? Array.from(sentence.replace(/\s+/gu, '')).length
    : segmentWords(sentence, language, segmenter).length;
}

export function detectNeatMetaphors(sentences, language, segmenter = ZH_SEGMENTER) {
  const findings = [];
  const limit = language === 'zh' ? 40 : 18;
  for (const sentence of sentences) {
    const markers = language === 'zh' ? ZH_METAPHOR_MARKERS : EN_METAPHOR_MARKERS;
    const marker = markers.find((item) => item.regex.test(sentence));
    const hasMetaphorNoun = language === 'en' && EN_METAPHOR_NOUNS.test(sentence);
    if (!marker && !hasMetaphorNoun) continue;
    const hedged = (language === 'zh' ? ZH_HEDGES : EN_HEDGES).test(sentence);
    if (hedged) continue;
    if (sentenceLength(sentence, language, segmenter) > limit) continue;
    findings.push({
      kind: 'metaphor',
      quote: sentence.slice(0, 240),
      reason: language === 'zh'
        ? '短句用一个顺口的比喻把复杂概念收得过紧'
        : 'a short metaphor compresses a complex concept into a tidy image',
    });
  }
  return { score: findings.length * 2, findings };
}

function openingStats(sentences, language, segmenter) {
  const counts = new Map();
  for (const sentence of sentences) {
    const key = openingKey(segmentWords(sentence, language, segmenter), language);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([opening, count]) => ({ opening, count }));
  return { entropy: normalizedEntropy([...counts.values()]), top };
}

export function parseBaseline(value) {
  if (typeof value !== 'string' || value.trim() === '') return { ok: true, rates: null };
  try {
    const parsed = JSON.parse(value);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'baseline must be a JSON object mapping terms to rates per 1000 tokens' };
    }
    const rates = {};
    for (const [term, rate] of Object.entries(parsed)) {
      if (term.trim() === '' || typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) {
        return { ok: false, error: `invalid baseline rate for ${term || '(empty term)'}` };
      }
      rates[term] = rate;
    }
    return { ok: true, rates };
  } catch {
    return { ok: false, error: 'baseline is not valid JSON' };
  }
}

export function scoreWordHabits(text, language, tokens, rates) {
  const total = tokens.length;
  const findings = [];
  let lexicalTotal = 0;
  let lexicalExpected = 0;
  let lexicalDistinct = 0;
  for (const [term, rate] of Object.entries(rates)) {
    const count = countPhrase(text, term, language);
    if (count === 0) continue;
    const expected = (rate * total) / 1000;
    lexicalTotal += count;
    lexicalExpected += expected;
    lexicalDistinct += 1;
    const z = (count - expected) / Math.sqrt(Math.max(expected, 0.25));
    if (count >= 2 && z >= 2) {
      findings.push({
        term,
        count,
        expected: Number(expected.toFixed(2)),
        z: Number(z.toFixed(2)),
        density: total > 0 ? Number(((count / total) * 1000).toFixed(2)) : 0,
      });
    }
  }
  findings.sort((left, right) => right.z - left.z || left.term.localeCompare(right.term));
  const lexicalZ = lexicalExpected > 0
    ? (lexicalTotal - lexicalExpected) / Math.sqrt(Math.max(lexicalExpected, 0.25))
    : 0;
  return {
    findings,
    maxZ: findings.length > 0 ? findings[0].z : 0,
    lexical: {
      total: lexicalTotal,
      distinct: lexicalDistinct,
      expected: Number(lexicalExpected.toFixed(2)),
      density: total > 0 ? Number(((lexicalTotal / total) * 1000).toFixed(2)) : 0,
      z: Number(lexicalZ.toFixed(2)),
    },
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function perThousand(count, total) {
  return total > 0 ? (count / total) * 1000 : 0;
}

function countOccurrences(text, term) {
  let count = 0;
  let index = 0;
  while ((index = text.indexOf(term, index)) !== -1) {
    count += 1;
    index += term.length;
  }
  return count;
}

function countCjk(text) {
  return (text.match(/[\u3400-\u9fff]/gu) ?? []).length;
}

function percentageBelow(lengths, threshold) {
  return lengths.length > 0 ? (lengths.filter((length) => length < threshold).length / lengths.length) * 100 : 0;
}

function percentageAbove(lengths, threshold) {
  return lengths.length > 0 ? (lengths.filter((length) => length > threshold).length / lengths.length) * 100 : 0;
}

function pearson(left, right) {
  if (left.length < 2 || left.length !== right.length) return 0;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftMean;
    const rightDelta = right[index] - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta * leftDelta;
    rightVariance += rightDelta * rightDelta;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator > 0 ? covariance / denominator : 0;
}

export function computeStyleProfile({ text, tokens, sentences, language, segmenter, sentenceStats }) {
  const isZh = language === 'zh';
  const profile = isZh ? ZH_PROFILE : EN_PROFILE;
  const totalChars = text.length;
  const cjkCount = countCjk(text);
  const totalTokens = tokens.length;
  const tokenCounts = new Map();
  for (const token of tokens) {
    tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
  }
  const pronounSets = {
    '1p': ['i', 'me', 'we', 'us', 'my', 'our'],
    '2p': ['you', 'your', 'yours'],
    '3p': ['he', 'she', 'they', 'him', 'her', 'them', 'his', 'their'],
  };
  const values = {};
  for (const key of Object.keys(profile)) {
    if (key.startsWith('fw_')) {
      const term = key.slice(3);
      values[key] = isZh
        ? perThousand(countOccurrences(text, term), cjkCount)
        : perThousand(tokenCounts.get(term) ?? 0, totalTokens);
    } else if (key.startsWith('pron_')) {
      const person = key.slice(5);
      if (isZh) {
        values[key] = perThousand(countOccurrences(text, person), cjkCount);
      } else {
        const set = pronounSets[person];
        values[key] = perThousand(set.reduce((sum, term) => sum + (tokenCounts.get(term) ?? 0), 0), totalTokens);
      }
    } else if (key.startsWith('suf_')) {
      values[key] = perThousand(countOccurrences(text, key.slice(4)), cjkCount);
    }
  }
  if (isZh) {
    values.comma = perThousand(countOccurrences(text, '，'), totalChars);
    values.colon = perThousand(countOccurrences(text, '：'), totalChars);
    values.dash = perThousand(countOccurrences(text, '—'), totalChars);
    values.paren = perThousand(countOccurrences(text, '（') + countOccurrences(text, '）'), totalChars);
    values.dunhao = perThousand(countOccurrences(text, '、'), totalChars);
    values.period = perThousand(countOccurrences(text, '。'), totalChars);
  } else {
    const lower = text.toLowerCase();
    values.contractions = perThousand((lower.match(/\b\w+(?:n't|'re|'ve|'ll|'d|'m|'s)\b/gu) ?? []).length, totalTokens);
    values.nominalization = perThousand(tokens.filter((token) => /(?:tion|sion|ment|ness|ity|ance|ence|ism|ization|isation|ship|hood)$/u.test(token)).length, totalTokens);
    values.adverb_ly = perThousand(tokens.filter((token) => /ly$/u.test(token)).length, totalTokens);
    values.long_words = perThousand(tokens.filter((token) => token.length >= 8).length, totalTokens);
    values.mean_word_len = totalTokens > 0
      ? tokens.reduce((sum, token) => sum + token.length, 0) / totalTokens
      : 0;
    values.colon = perThousand(countOccurrences(text, ':'), totalChars);
    values.comma = perThousand(countOccurrences(text, ','), totalChars);
    values.semicolon = perThousand(countOccurrences(text, ';'), totalChars);
    values.dash = perThousand(countOccurrences(text, '—') + countOccurrences(text, '--'), totalChars);
    values.paren = perThousand(countOccurrences(text, '(') + countOccurrences(text, ')'), totalChars);
  }
  const lengths = sentences.map((sentence) => (isZh
    ? countCjk(sentence)
    : segmentWords(sentence, 'en', segmenter).length));
  values.sent_cv = sentenceStats.coefficientOfVariation;
  values.short_sent = percentageBelow(lengths, isZh ? 12 : 8);
  values.long_sent = percentageAbove(lengths, isZh ? 50 : 30);
  values.adj_corr = pearson(lengths.slice(0, -1), lengths.slice(1));

  const deviations = [];
  const zValues = {};
  let totalDeviation = 0;
  for (const [key, config] of Object.entries(profile)) {
    const value = Number(values[key]);
    const floor = Math.max(config.sd, Math.abs(config.mean) * 0.05, 0.05);
    const z = Math.max(-3, Math.min(3, (value - config.mean) / floor));
    zValues[key] = z;
    totalDeviation += Math.abs(z);
    deviations.push({
      feature: key,
      value: Number(value.toFixed(3)),
      z: Number(z.toFixed(2)),
    });
  }
  const direction = isZh ? ZH_PROFILE_DIRECTION : EN_PROFILE_DIRECTION;
  const directionNorm = Object.values(direction).reduce((sum, weight) => sum + Math.abs(weight), 0);
  let directional = 0;
  for (const [key, weight] of Object.entries(direction)) {
    directional += weight * zValues[key];
  }
  deviations.sort((left, right) => Math.abs(right.z) - Math.abs(left.z) || left.feature.localeCompare(right.feature));
  return {
    deviation: Number((totalDeviation / Object.keys(profile).length).toFixed(3)),
    directional: Number((directional / directionNorm).toFixed(3)),
    features: values,
    deviations: deviations.slice(0, 8),
  };
}

export function computeAiScore(metrics, language) {
  const thresholds = language === 'zh' ? ZH_THRESHOLDS : EN_THRESHOLDS;
  const enoughSentences = metrics.sentence.count >= 5;
  const profileDirectional = metrics.styleProfile?.directional ?? 0;
  const lexicalZ = metrics.wordHabits?.lexical?.z ?? 0;
  const contributions = {
    profile: enoughSentences
      ? clamp01((profileDirectional - thresholds.profileDirectionalLow) / (thresholds.profileDirectionalHigh - thresholds.profileDirectionalLow))
      : 0,
    lexical: clamp01((lexicalZ - thresholds.lexicalZLow) / (thresholds.lexicalZHigh - thresholds.lexicalZLow)),
    ngrams: clamp01((metrics.ngrams.ratio - thresholds.ngramRatioLow) / (thresholds.ngramRatioTop - thresholds.ngramRatioLow)),
    parallelism: clamp01((metrics.parallelism.rate - thresholds.parallelRateLow) / (thresholds.parallelRateTop - thresholds.parallelRateLow)),
    metaphor: clamp01((metrics.metaphor.rate - thresholds.metaphorRateLow) / (thresholds.metaphorRateTop - thresholds.metaphorRateLow)),
    rhythm: enoughSentences
      ? clamp01((thresholds.cvModerate - metrics.sentence.coefficientOfVariation) / thresholds.cvSpan)
      : 0,
    habits: clamp01((metrics.wordHabits.maxZ - thresholds.habitZLow) / (thresholds.habitZTop - thresholds.habitZLow)),
  };
  const score = Math.round(100 * (
    contributions.profile * 0.45
    + contributions.lexical * 0.2
    + contributions.ngrams * 0.1
    + contributions.parallelism * 0.1
    + contributions.metaphor * 0.05
    + contributions.rhythm * 0.05
    + contributions.habits * 0.05
  ));
  return { score: Math.max(0, Math.min(100, score)), contributions };
}

export function scoreBand(score) {
  if (score >= 60) return 'high';
  if (score >= 20) return 'moderate';
  return 'low';
}

function issueFromMetric({ id, language, text, quote, severity, problem, suggestion, metric }) {
  const index = quote ? text.indexOf(quote) : -1;
  return {
    id,
    category: 'ai-style',
    dimension: language === 'zh' ? 'AI 味' : 'AI style',
    severity,
    location: index >= 0 ? paragraphLocation(text, index, language) : (language === 'zh' ? '全文' : 'document'),
    quote,
    problem,
    suggestion,
    metric,
  };
}

function statisticalIssues(metrics, text, language, thresholds) {
  const issues = [];
  if (metrics.sentence.count >= 5 && metrics.sentence.coefficientOfVariation < thresholds.cvLow) {
    issues.push(issueFromMetric({
      id: 'ai-sentence-rhythm',
      language,
      text,
      quote: '',
      severity: 'MINOR',
      problem: language === 'zh'
        ? '句长分布过于均匀，缺少自然写作中的长短起伏。'
        : 'Sentence lengths are too uniform for natural prose.',
      suggestion: language === 'zh'
        ? '按论证需要调整句长，允许长句承载复句、短句承担转折。'
        : 'Vary sentence length where the argument changes direction.',
      metric: 'sentence.coefficientOfVariation',
    }));
  }
  if (metrics.sentence.count >= 5 && metrics.openings.entropy < thresholds.openingEntropyLow) {
    issues.push(issueFromMetric({
      id: 'ai-opening-repetition',
      language,
      text,
      quote: metrics.openings.top[0]?.opening ?? '',
      severity: 'MINOR',
      problem: language === 'zh'
        ? '多个句子以相同方式开头，句首分布过于集中。'
        : 'Several sentences open the same way; the opening distribution is concentrated.',
      suggestion: language === 'zh'
        ? '合并句子、更换主语，或从动作和事实开头。'
        : 'Merge sentences, change the subject, or start from the action.',
      metric: 'openings.entropy',
    }));
  }
  if (metrics.connectives.density > thresholds.connectiveDensityHigh
    && metrics.connectives.entropy < thresholds.connectiveEntropyLow) {
    issues.push(issueFromMetric({
      id: 'ai-connective-density',
      language,
      text,
      quote: metrics.connectives.top[0].phrase,
      severity: 'MINOR',
      problem: language === 'zh'
        ? '连接词密度偏高，段落衔接依赖显式路标。'
        : 'Connective density is high; transitions rely on explicit signposts.',
      suggestion: language === 'zh'
        ? '让事实和论证关系自然承接，删掉不承担逻辑作用的连接词。'
        : 'Let the facts carry the relation and remove connectives that do not change the logic.',
      metric: 'connectives.density',
    }));
  }
  if (metrics.ngrams.ratio > thresholds.ngramRatioHigh) {
    issues.push(issueFromMetric({
      id: 'ai-ngram-repetition',
      language,
      text,
      quote: metrics.ngrams.top[0].phrase,
      severity: 'MINOR',
      problem: language === 'zh'
        ? '三词片段重复率偏高，措辞习惯在文本内反复出现。'
        : 'Repeated three-word phrases show a recurring wording habit.',
      suggestion: language === 'zh'
        ? '改写重复片段，或把它们合并成一次完整表述。'
        : 'Rewrite the repeated phrases or state the point once.',
      metric: 'ngrams.ratio',
    }));
  }
  const strongRuns = metrics.parallelism.runs.filter((run) => !run.weak);
  const weakRuns = metrics.parallelism.runs.filter((run) => run.weak);
  const issueRuns = [...strongRuns, ...(weakRuns.length >= 2 ? weakRuns : [])];
  for (const run of issueRuns) {
    issues.push(issueFromMetric({
      id: `ai-parallel-${run.kind}-${issues.length + 1}`,
      language,
      text,
      quote: run.quote,
      severity: 'IMPORTANT',
      problem: language === 'zh'
        ? `出现排比或预备排比结构（${run.reason}）。`
        : `Parallelism or a parallelism setup appears (${run.reason}).`,
      suggestion: language === 'zh'
        ? '只有当每一项都独立成立且结构确实承载比较时保留排比；否则改成不同句式或逐项陈述。'
        : 'Keep the parallel only when every item is independently justified and the structure carries a real comparison; otherwise vary the syntax or state the items separately.',
      metric: 'parallelism.score',
    }));
  }
  for (const finding of metrics.metaphor.findings) {
    issues.push(issueFromMetric({
      id: `ai-metaphor-${issues.length + 1}`,
      language,
      text,
      quote: finding.quote,
      severity: 'IMPORTANT',
      problem: language === 'zh'
        ? '用一个顺口的比喻把复杂概念说得过于整齐。'
        : 'A catchy metaphor makes a complex concept sound too tidy.',
      suggestion: language === 'zh'
        ? '写清机制、条件和代价；比喻只在它确实承重且说明边界时保留。'
        : 'State the mechanism, conditions, and costs; keep the analogy only when it bears weight and its limits are stated.',
      metric: 'metaphor.score',
    }));
  }
  for (const habit of metrics.wordHabits.findings) {
    issues.push(issueFromMetric({
      id: `ai-word-habit-${issues.length + 1}`,
      language,
      text,
      quote: habit.term,
      severity: 'MINOR',
      problem: language === 'zh'
        ? `“${habit.term}”的出现频率高于参考分布（z=${habit.z}）。`
        : `"${habit.term}" appears above the reference distribution (z=${habit.z}).`,
      suggestion: language === 'zh'
        ? '换成具体动作、对象或测量结果；保留有技术含义的用法。'
        : 'Replace it with a concrete action, object, or measurement; keep technical uses.',
      metric: 'wordHabits.z',
    }));
  }
  return issues;
}

export function scanAiStyle(input = {}) {
  const text = String(input.text ?? '');
  const language = resolveLanguage(input.language, text);
  const mode = input.mode === 'standard' ? 'standard' : 'redline';
  const segmenter = Object.hasOwn(input, 'segmenter') ? input.segmenter : ZH_SEGMENTER;
  const sentences = splitSentences(text, language);
  const tokens = segmentWords(text, language, segmenter)
    .map((token) => (language === 'en' ? token.toLowerCase() : token));
  const content = contentTokens(tokens, language);
  const baseline = parseBaseline(input.baseline);
  const rates = {
    ...(language === 'zh' ? ZH_AI_TERMS : EN_AI_TERMS),
    ...(baseline.rates ?? {}),
  };
  const parallelism = detectParallelRuns(sentences, language, segmenter);
  const metaphor = detectNeatMetaphors(sentences, language, segmenter);
  const sentenceCount = sentences.length;
  const tokenCounts = new Map();
  for (const token of tokens) tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
  const hapaxCount = [...tokenCounts.values()].filter((count) => count === 1).length;
  const sentenceStats = computeSentenceStats(sentences, language, segmenter);
  const metrics = {
    tokens: tokens.length,
    sentences: sentences.length,
    sentence: sentenceStats,
    openings: openingStats(sentences, language, segmenter),
    lexicalDiversity: {
      movingAverageTypeTokenRatio: movingAverageTypeTokenRatio(tokens),
      hapaxRatio: tokens.length > 0 ? hapaxCount / tokens.length : 0,
    },
    connectives: connectiveStats(text, tokens, language),
    ngrams: repeatedNgrams(content),
    parallelism: {
      ...parallelism,
      rate: sentenceCount > 0 ? (parallelism.runs.length / sentenceCount) * 100 : 0,
    },
    metaphor: {
      ...metaphor,
      rate: sentenceCount > 0 ? (metaphor.findings.length / sentenceCount) * 100 : 0,
    },
    wordHabits: scoreWordHabits(text, language, tokens, rates),
    styleProfile: computeStyleProfile({ text, tokens, sentences, language, segmenter, sentenceStats }),
  };
  const thresholds = language === 'zh' ? ZH_THRESHOLDS : EN_THRESHOLDS;
  const score = computeAiScore(metrics, language);
  const keywordIssues = input.includeKeywordRules === false
    ? []
    : styleIssues(text, language).map((issue) => ({ ...issue, source: 'keyword' }));
  const allIssues = [
    ...keywordIssues,
    ...statisticalIssues(metrics, text, language, thresholds),
  ];
  const filtered = mode === 'redline'
    ? allIssues.filter((issue) => issue.severity !== 'MINOR')
    : allIssues;
  const maxIssues = clampMaxIssues(input.maxIssues, MAX_ISSUES_CONFIG.aiStyle);
  const returned = filtered.slice(0, maxIssues);
  const bySeverity = { IMPORTANT: 0, MINOR: 0 };
  for (const issue of filtered) {
    bySeverity[issue.severity] += 1;
  }
  return {
    ok: true,
    language,
    mode,
    reliable: sentences.length >= 5 && tokens.length >= 80,
    score: score.score,
    band: scoreBand(score.score),
    contributions: score.contributions,
    metrics,
    issues: returned,
    summary: {
      total: filtered.length,
      returned: returned.length,
      bySeverity,
      verdict: filtered.length === 0 ? 'pass' : bySeverity.IMPORTANT > 0 ? 'needs_revision' : 'minor_findings',
    },
    baselineError: baseline.ok ? null : baseline.error,
  };
}

function formatMetricLines(result) {
  const { metrics } = result;
  if (result.language === 'zh') {
    return [
      `- 句长：均值 ${metrics.sentence.mean.toFixed(1)} 词，变异系数 ${metrics.sentence.coefficientOfVariation.toFixed(2)}，句子 ${metrics.sentence.count} 句`,
      `- 句首熵：${metrics.openings.entropy.toFixed(2)}`,
      `- 连接词密度：${metrics.connectives.density.toFixed(1)}/1000 词，熵 ${metrics.connectives.entropy.toFixed(2)}`,
      `- 三词重复率：${metrics.ngrams.ratio.toFixed(2)}（${metrics.ngrams.repeatedCount} 个重复片段）`,
      `- 排比/预备排比：${metrics.parallelism.runs.length} 处`,
      `- 顺口比喻：${metrics.metaphor.findings.length} 处`,
      `- 用词习惯：${metrics.wordHabits.findings.length} 项偏高，词表密度 ${metrics.wordHabits.lexical.density.toFixed(2)}/1000 字，z ${metrics.wordHabits.lexical.z.toFixed(2)}`,
      `- 风格轮廓偏离：${metrics.styleProfile.deviation.toFixed(2)}，方向值 ${metrics.styleProfile.directional.toFixed(2)}（${metrics.styleProfile.deviations.slice(0, 3).map((item) => `${item.feature} ${item.z}`).join('，')}）`,
    ];
  }
  return [
    `- Sentence length: mean ${metrics.sentence.mean.toFixed(1)} words, CV ${metrics.sentence.coefficientOfVariation.toFixed(2)}, ${metrics.sentence.count} sentences`,
    `- Sentence-opening entropy: ${metrics.openings.entropy.toFixed(2)}`,
    `- Connective density: ${metrics.connectives.density.toFixed(1)} per 1000 words, entropy ${metrics.connectives.entropy.toFixed(2)}`,
    `- Three-word repetition: ${metrics.ngrams.ratio.toFixed(2)} (${metrics.ngrams.repeatedCount} repeated n-grams)`,
    `- Parallelism or setup: ${metrics.parallelism.runs.length}`,
    `- Neat metaphors: ${metrics.metaphor.findings.length}`,
    `- Word habits: ${metrics.wordHabits.findings.length} above reference, lexicon density ${metrics.wordHabits.lexical.density.toFixed(2)} per 1000 words, z ${metrics.wordHabits.lexical.z.toFixed(2)}`,
    `- Style profile: deviation ${metrics.styleProfile.deviation.toFixed(2)}, directional ${metrics.styleProfile.directional.toFixed(2)} (${metrics.styleProfile.deviations.slice(0, 3).map((item) => `${item.feature} ${item.z}`).join(', ')})`,
  ];
}

function formatIssue(issue, index, language) {
  if (language === 'zh') {
    return [
      `### 问题 ${index + 1}：${issue.dimension} ${issue.severity}`,
      `- 位置：${issue.location}`,
      `- 问题：${issue.problem}`,
      `- 原文：「${issue.quote}」`,
      `- 建议：${issue.suggestion}`,
    ].join('\n');
  }
  return [
    `### Issue ${index + 1}: ${issue.dimension} ${issue.severity}`,
    `- Location: ${issue.location}`,
    `- Problem: ${issue.problem}`,
    `- Quote: "${issue.quote}"`,
    `- Suggestion: ${issue.suggestion}`,
  ].join('\n');
}

function formatEnsembleLines(ensemble, language) {
  if (ensemble.status === 'unavailable') {
    if (ensemble.reason === 'network_not_allowed') {
      return [language === 'zh'
        ? '[AIGC + Jev 组合未启用] 未授权网络访问；本次仅运行本地统计扫描。'
        : '[AIGC + Jev ensemble disabled] Network access was not allowed; this run used the local statistical scan only.'];
    }
    const missing = ensemble.missing?.join(language === 'zh' ? '、' : ', ') ?? '';
    return [language === 'zh'
      ? `[AIGC + Jev 组合未配置] 缺少 ${missing}；本次仅运行本地统计扫描。`
      : `[AIGC + Jev ensemble not configured] Missing ${missing}; this run used the local statistical scan only.`];
  }
  if (ensemble.status !== 'decided') return [];
  const components = ensemble.components ?? {};
  const format = (value) => (typeof value === 'number' ? value.toFixed(3) : 'n/a');
  const source = ensemble.source === 'slow' ? 'slow' : 'weighted';
  const slow = components.slow === null ? (language === 'zh' ? '未使用' : 'not used') : components.slow;
  const lines = [
    language === 'zh' ? '### AIGC + Jev 组合判定' : '### AIGC + Jev Ensemble Decision',
    '',
    `- AIGC P(AI) = ${format(components.aigc)}`,
    `- Jev P(AI) = ${format(components.jev)}`,
    `- ${language === 'zh' ? '加权分' : 'Weighted score'} = ${format(ensemble.score)}`,
    `- ${language === 'zh' ? '判定阈值' : 'Threshold'} = ${format(ensemble.threshold)}`,
    `- ${language === 'zh' ? '判定' : 'Decision'} = ${ensemble.label} (${source})`,
    `- ${language === 'zh' ? '慢模型回退' : 'Slow fallback'} = ${slow}`,
  ];
  if (typeof ensemble.jevModel === 'string') {
    lines.push(`- Jev model = ${ensemble.jevModel}`);
  }
  if (typeof ensemble.slowError === 'string') {
    lines.push(`- ${language === 'zh' ? '慢模型错误' : 'Slow fallback error'} = ${ensemble.slowError}`);
  }
  return lines;
}

export function formatAiScanReport(result) {
  const language = result.language;
  const omitted = Math.max(0, result.summary.total - result.issues.length);
  const title = language === 'zh' ? '## AI 味扫描结果' : '## AI Style Scan Results';
  const scoreLine = language === 'zh'
    ? `评分：${result.score}/100（${result.band}）${result.reliable ? '' : '；文本过短，统计结果仅供参考'}`
    : `Score: ${result.score}/100 (${result.band})${result.reliable ? '' : '; short text, statistical results are advisory'}`;
  const baselineLine = result.baselineError
    ? (language === 'zh' ? `\n基线解析失败：${result.baselineError}` : `\nBaseline error: ${result.baselineError}`)
    : '';
  const lines = [title, '', scoreLine, baselineLine, '', ...formatMetricLines(result)];
  if (result.ensemble) {
    lines.push('', ...formatEnsembleLines(result.ensemble, language));
  }
  if (result.issues.length === 0) {
    lines.push('', language === 'zh' ? '[未发现明显的 AI 味特征]' : '[No strong AI-style tells found]');
    return lines.join('\n').trim();
  }
  lines.push('', ...result.issues.flatMap((issue, index) => [formatIssue(issue, index, language), '']));
  if (omitted > 0) {
    lines.push(language === 'zh' ? `另有 ${omitted} 个问题未显示。` : `${omitted} additional issue(s) omitted.`);
  }
  return lines.join('\n').trim();
}
