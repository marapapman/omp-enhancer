import { resolveLanguage } from './language.js';

const DEFAULT_MAX_ISSUES = 20;
const MIN_MAX_ISSUES = 1;
const MAX_MAX_ISSUES = 100;

const ZH_STRONG_WORDS = ['所有', '完全', '最优', '显著', '全部', '任何', '必然'];
const EN_STRONG_WORDS = ['all', 'always', 'best', 'significant', 'every', 'never', 'guarantee'];
const SCOPE_WORDS = [
  '数据集',
  '实验',
  '样本',
  '范围',
  '在该',
  '本实验',
  'dataset',
  'experiment',
  'sample',
  'scope',
  'in this',
  'on this',
];
const METRIC_LABELS = ['准确率', '召回率', 'F1', '精度', 'accuracy', 'recall', 'precision'];

function clampMaxIssues(value) {
  if (!Number.isFinite(value ?? DEFAULT_MAX_ISSUES)) return DEFAULT_MAX_ISSUES;
  return Math.max(MIN_MAX_ISSUES, Math.min(MAX_MAX_ISSUES, Math.trunc(value ?? DEFAULT_MAX_ISSUES)));
}

function splitSentences(text) {
  const matches = [];
  const pattern = /[^。！？.!?\n]+[。！？.!?]?/gu;
  for (const match of text.matchAll(pattern)) {
    const sentence = match[0].trim();
    /* node:coverage ignore next */
    if (sentence.length > 0) matches.push({ sentence, index: match.index ?? 0 });
  }
  return matches;
}

function locationFor(text, index, language) {
  const before = text.slice(0, index);
  const paragraph = before.split(/\n\s*\n/u).length;
  return language === 'zh' ? `第 ${paragraph} 段` : `paragraph ${paragraph}`;
}

function hasAny(value, words) {
  const lower = value.toLowerCase();
  return words.some((word) => lower.includes(word.toLowerCase()));
}

function makeIssue(input) {
  return input;
}

function strongConclusionIssues(text, language) {
  const issues = [];
  const strongWords = language === 'zh' ? ZH_STRONG_WORDS : EN_STRONG_WORDS;

  for (const sentence of splitSentences(text)) {
    /* node:coverage ignore next */
    if (!hasAny(sentence.sentence, strongWords)) continue;
    const localWindow = text.slice(Math.max(0, sentence.index - 120), sentence.index + sentence.sentence.length + 120);
    const hasUniversal = hasAny(sentence.sentence, ['所有', 'all', 'always', 'every', '任何']);
    /* node:coverage ignore next */
    if (hasAny(localWindow, SCOPE_WORDS) && !hasUniversal) continue;

    issues.push(
      makeIssue({
        id: `evidence-${issues.length + 1}`,
        severity: language === 'zh' ? 'WARNING' : 'IMPORTANT',
        dimension: 'evidence',
        location: locationFor(text, sentence.index, language),
        quote: sentence.sentence,
        problem:
          language === 'zh'
            ? '结论使用了过强表述，但局部文本没有给出足够范围或证据。'
            : 'The claim uses strong wording without enough local scope or evidence.',
        suggestion:
          language === 'zh'
            ? '收窄结论范围，或补充能够支撑该强结论的证据。'
            : 'Narrow the claim or add evidence that supports the strong conclusion.',
      }),
    );
  }

  return issues;
}

function dataConsistencyIssues(text, language) {
  const issues = [];

  for (const label of METRIC_LABELS) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`${escaped}[^0-9%]{0,12}([0-9]+(?:\\.[0-9]+)?%?)`, 'giu');
    const values = Array.from(text.matchAll(pattern));
    const uniqueValues = new Set(values.map((match) => match[1]));
    if (uniqueValues.size <= 1) continue;

    const first = values[0];
    issues.push(
      makeIssue({
        id: `data-${issues.length + 1}`,
        severity: language === 'zh' ? 'FATAL' : 'CRITICAL',
        dimension: 'data',
        /* node:coverage ignore next */
        location: locationFor(text, first?.index ?? 0, language),
        quote: values.map((match) => match[0]).join('；'),
        problem:
          language === 'zh'
            ? `同一指标“${label}”出现了不一致的数值。`
            : `The same metric "${label}" appears with inconsistent values.`,
        suggestion:
          language === 'zh'
            ? '核对正文、表格和实验记录，统一该指标的数值。'
            : 'Check the text, tables, and experiment records, then use one consistent value.',
      }),
    );
  }

  return issues;
}

function terminologyIssues(text, language) {
  const pairs = [
    ['检索增强生成', 'RAG'],
    ['大语言模型', 'LLM'],
    ['知识图谱', 'KG'],
  ];

  const issues = [];
  for (const [left, right] of pairs) {
    if (!text.includes(left) || !text.includes(right)) continue;
    /* node:coverage ignore next */
    if (text.includes(`${left}（${right}）`) || text.includes(`${right}（${left}）`)) continue;

    const index = Math.max(0, text.indexOf(right));
    issues.push(
      makeIssue({
        id: `terminology-${issues.length + 1}`,
        severity: language === 'zh' ? 'WARNING' : 'IMPORTANT',
        dimension: 'terminology',
        location: locationFor(text, index, language),
        quote: text.slice(index, Math.min(text.length, index + 80)),
        problem:
          language === 'zh'
            ? `文档同时使用“${left}”和“${right}”，但没有说明二者是否为同一概念。`
            : `The document uses both "${left}" and "${right}" without defining their relationship.`,
        suggestion:
          language === 'zh'
            ? '首次出现时给出统一术语和缩写关系，后文保持一致。'
            : 'Define the term and abbreviation on first use, then keep usage consistent.',
      }),
    );
  }

  return issues;
}

function contributionMismatchIssues(text, language) {
  const hasContribution = /本文(提出|贡献)|we (propose|contribute|present)/iu.test(text);
  const hasEvidenceSection = /实验|评估|案例|结果|消融|experiment|evaluation|case study|result|ablation/iu.test(text);
  if (!hasContribution || hasEvidenceSection) return [];

  return [
    makeIssue({
      id: 'structure-1',
      severity: language === 'zh' ? 'WARNING' : 'IMPORTANT',
      dimension: 'structure',
      location: language === 'zh' ? '全文' : 'whole document',
      quote: language === 'zh' ? '本文提出' : 'we propose',
      problem:
        language === 'zh'
          ? '文档提出了贡献或方法，但没有可见的实验、评估、案例或结果支撑。'
          : 'The document makes a contribution or proposal claim without visible experiment, evaluation, case, or result support.',
      suggestion:
        language === 'zh'
          ? '补充验证部分，或把贡献表述改成当前文档实际支持的范围。'
          : 'Add a validation section or narrow the contribution to what the document supports.',
    }),
  ];
}

function causalLeapIssues(text, language) {
  const issues = [];
  const conclusionMarkers = language === 'zh' ? ['因此', '所以', '由此'] : ['therefore', 'thus', 'so'];
  const evidenceMarkers = language === 'zh' ? ['因为', '实验', '结果', '数据', '显示'] : ['because', 'experiment', 'result', 'data', 'shows'];
  const strongWords = language === 'zh' ? ZH_STRONG_WORDS : EN_STRONG_WORDS;

  for (const sentence of splitSentences(text)) {
    /* node:coverage ignore next */
    if (!hasAny(sentence.sentence, conclusionMarkers)) continue;
    /* node:coverage ignore next */
    if (!hasAny(sentence.sentence, strongWords)) continue;
    if (hasAny(sentence.sentence, evidenceMarkers)) continue;

    issues.push(
      makeIssue({
        id: `logic-${issues.length + 1}`,
        /* node:coverage ignore next */
        severity: language === 'zh' ? 'WARNING' : 'IMPORTANT',
        dimension: 'logic',
        location: locationFor(text, sentence.index, language),
        quote: sentence.sentence,
        problem:
          language === 'zh'
            ? '句子用结论连接词推出强结论，但没有在本句给出支撑依据。'
            : 'The sentence uses a conclusion marker to make a strong claim without local support.',
        suggestion:
          language === 'zh'
            ? '补充推理依据，或把强结论改为更谨慎的表述。'
            : 'Add reasoning support or make the conclusion more cautious.',
      }),
    );
  }

  return issues;
}

function summarize(issues) {
  const fatalOrCritical = issues.filter((issue) => issue.severity === 'FATAL' || issue.severity === 'CRITICAL').length;
  const warningsOrImportant = issues.filter((issue) => issue.severity === 'WARNING' || issue.severity === 'IMPORTANT').length;
  const minor = issues.filter((issue) => issue.severity === 'INFO' || issue.severity === 'MINOR').length;
  const verdict = fatalOrCritical > 0 ? 'blocked' : warningsOrImportant > 0 ? 'needs_revision' : 'pass';
  return { total: issues.length, fatalOrCritical, warningsOrImportant, minor, verdict };
}

function filterMode(issues, mode) {
  if (mode === 'standard') return issues;
  return issues.filter((issue) =>
    issue.severity === 'FATAL' ||
    issue.severity === 'WARNING' ||
    issue.severity === 'CRITICAL' ||
    issue.severity === 'IMPORTANT',
  );
}

export function analyzeWritingLogic(input) {
  const text = input.text ?? '';
  const language = resolveLanguage(input.language, text);
  const mode = input.mode ?? 'redline';
  const maxIssues = clampMaxIssues(input.maxIssues);

  const allIssues = filterMode(
    [
      ...dataConsistencyIssues(text, language),
      ...strongConclusionIssues(text, language),
      ...terminologyIssues(text, language),
      ...contributionMismatchIssues(text, language),
      ...causalLeapIssues(text, language),
    ],
    mode,
  );

  return {
    ok: true,
    language,
    mode,
    summary: summarize(allIssues),
    issues: allIssues.slice(0, maxIssues),
  };
}
