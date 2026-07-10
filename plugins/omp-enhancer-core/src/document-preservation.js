import { createHash } from 'node:crypto';
import { posix as path } from 'node:path';

const SCHEMA_VERSION = 1;
const SHA256 = /^[a-f0-9]{64}$/;

const EXACT_LITERAL_PATTERN = /https?:\/\/[^\s<>()\[\]{}"']+|\\cite[a-z]*\{[^{}\n]+\}|\[@[^\]\n]+\]|`[^`\n]+`|“[^”\n]+”|‘[^’\n]+’|"[^"\n]+"|\bv?\d+(?:\.\d+){2,}\b|\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|(?<![A-Za-z0-9_])(?:(?:[<>]=?|[≤≥=≈~]|[+\-−])\s*)?(?:\d+(?:\.\d+)?[eE][+\-−]?\d+|0[xX][0-9a-fA-F]+|0[bB][01]+|0[oO][0-7]+)(?![A-Za-z0-9_])|(?<![A-Za-z0-9_])(?:(?:[<>]=?|[≤≥=≈~]|[+\-−])\s*)?[$€£¥]?\d+(?:,\d{3})*(?:\.\d+)?(?:(?:\s*(?:%|‰|°\s*[cf]|℃|℉|万元|元|个|版|人|天|年|月|日|公里|千克|米|ms|kg|mb|gb|km|mhz|px))|[A-Za-zµμΩ]+)?(?![A-Za-z0-9_])/giu;

const CONTROLLED_TERMS = Object.freeze({
  polarity: Object.freeze({
    english: /\b(?:without|neither|never|none|not|no|nor|false|untrue|exclud(?:e|es|ed|ing)|reject(?:s|ed|ing)?|refus(?:e|es|ed|ing)|den(?:y|ies|ied|ying))\b|\b(?:is|are|was|were|has|have|had|do|does|did|can|could|would|should|will|must)n['’]t\b/giu,
    chinese: /并非|不是|没有|从不|拒绝|拒不|否认|排除|不予|未|无|不/gu,
  }),
  range: Object.freeze({
    english: /\b(?:greater\s+than|fewer\s+than|more\s+than|less\s+than|at\s+least|at\s+most|approximately|exactly|around|nearly|about|only|up\s+to|over|under)\b/giu,
    chinese: /不超过|不低于|不高于|至少|至多|大约|约为|仅仅|只有|恰好|正好|超过|多于|少于|接近|约|仅|只/gu,
  }),
  modality: Object.freeze({
    english: /\b(?:possibly|probably|perhaps|likely|might|could|may)\b/giu,
    chinese: /有可能|可能|也许|或许|大概|或可/gu,
  }),
});

const ENGLISH_STOP_WORDS = new Set([
  'a', 'an', 'are', 'as', 'at', 'be', 'been', 'being', 'by', 'for',
  'from', 'had', 'has', 'have', 'in', 'is', 'it', 'its', 'of', 'on', 'still',
  'that', 'the', 'their', 'these', 'this', 'those', 'to', 'was', 'were', 'with',
]);
const CHINESE_STOP_WORDS = new Set([
  '一个', '一种', '仍然', '这个', '那个', '这些', '那些',
  '为', '了', '于', '仍', '其', '在', '是', '有', '的',
]);
const CONTROLLED_TERM_TOKENS = new Set([
  'about', 'approximately', 'at', 'could', 'least', 'may', 'might', 'not', 'only',
  'most', '不', '不是', '未', '没有', '无', '至少', '至多', '大约', '约', '仅', '只',
  '可能', '也许', '或许',
]);

const ENGLISH_FACT_CUE = /\b(?:is|are|was|were|has|have|had|contains?|equals?|remains?|supports?|uses?|requires?|provides?|returns?)\b/iu;
const CHINESE_FACT_CUE = /(?:是|为|有|包含|等于|达到|保持|支持|使用|需要|提供|返回)/u;

let chineseSegmenter;

/**
 * Return true only for an explicit instruction to preserve document facts,
 * claims, literals, or meaning. Descriptive prose such as "facts remain
 * unchanged" is intentionally not treated as an instruction.
 */
export function requiresDocumentPreservation(prompt = '') {
  const text = String(prompt).normalize('NFKC').trim();
  if (!text) return false;
  const directiveText = stripQuotedDirectiveMentions(text);

  const chineseProtected = '(?:事实|数据|数字|数值|含义|意义|语义|主张|声明|结论|引用)';
  const englishProtected = '(?:factual\\s+claims?|facts?|data|numbers?|values?|meaning|semantics?|claims?|statements?|conclusions?|citations?)';
  return hasDirectiveMatch(directiveText, new RegExp(`(?:保持|保留|维持).{0,40}${chineseProtected}.{0,24}(?:不变|一致|原样)`, 'iu'), 'zh')
    || hasDirectiveMatch(directiveText, new RegExp(`${chineseProtected}.{0,20}(?:保持|维持)?(?:不变|一致|原样)`, 'iu'), 'zh')
    || new RegExp(`(?:不要|不得|不能|不可|禁止|避免).{0,20}(?:改变|更改|修改|改动|篡改).{0,48}${chineseProtected}`, 'iu').test(directiveText)
    || hasDirectiveMatch(directiveText, new RegExp(`(?:不改变|不更改|不修改|不改动|不改).{0,48}${chineseProtected}`, 'iu'), 'zh')
    || hasDirectiveMatch(directiveText, new RegExp(`(?:不动|别动).{0,24}${chineseProtected}`, 'iu'), 'zh')
    || hasDirectiveMatch(directiveText, new RegExp(`\\b(?:keep(?:s|ing)?|preserv(?:e|es|ed|ing)|retain(?:s|ed|ing)?)\\b.{0,64}\\b${englishProtected}\\b(?:.{0,32}\\b(?:unchanged|intact|the\\s+same)\\b)?`, 'iu'), 'en')
    || hasDirectiveMatch(directiveText, new RegExp(`\\b${englishProtected}\\b.{0,24}\\b(?:remain(?:s|ed)?\\s+)?(?:unchanged|intact|the\\s+same)\\b`, 'iu'), 'en')
    || hasDirectiveMatch(directiveText, new RegExp(`\\bwithout\\s+(?:changing|altering|modifying)\\b.{0,48}\\b(?:its\\s+)?${englishProtected}\\b`, 'iu'), 'en')
    || new RegExp(`\\b(?:do\\s+not|don't|must\\s+not|never)\\s+(?:change|alter|modify)\\b.{0,48}\\b(?:the\\s+|its\\s+)?${englishProtected}\\b`, 'iu').test(directiveText);
}

function stripQuotedDirectiveMentions(value = '') {
  return String(value)
    .replace(/[“‘][^”’\n]*[”’]/gu, ' ')
    .replace(/"[^"\n]*"/gu, ' ')
    .replace(/(?<![\p{L}\p{N}])'[^'\n]+'(?![\p{L}\p{N}])/gu, ' ');
}

function hasDirectiveMatch(text, pattern, language) {
  const match = String(text).match(pattern);
  if (!match) return false;
  const prefix = String(text).slice(0, match.index ?? 0);
  if (!prefix.trim() || /(?:^|[.!?;:。！？；：\n,，])\s*$/u.test(prefix)) return true;
  if (language === 'zh') {
    if (/(?:请|务必|必须|应当|需要|同时|并且|但|且)\s*$/u.test(prefix)) return true;
    return /(?:润色|改写|编辑|修改|更新|调整|转换|翻译)/u.test(prefix);
  }
  if (/\b(?:please|while|and|but|then|must|should|to)\s+$/iu.test(prefix)) return true;
  if (/\b(?:can|could|would)\s+you\s+$/iu.test(prefix)) return true;
  return /\b(?:polish|rewrite|edit|revise|rephrase|update|convert|translate)\b/iu.test(prefix);
}

/**
 * Build a persistence-safe baseline from a trusted pre-mutation document.
 * Raw paths, document text, and lexical tokens are replaced by SHA-256
 * digests. Counts are retained so later evaluation also notices duplicate or
 * deleted literals and anchors.
 */
export function createDocumentPreservationBaseline({ oldText, targetPath } = {}) {
  if (typeof oldText !== 'string') return null;
  const normalizedTarget = normalizeTargetPath(targetPath);
  if (!normalizedTarget) return null;

  const document = analyzeDocument(oldText, normalizedTarget);
  return {
    schemaVersion: SCHEMA_VERSION,
    source: 'host-document-preservation-baseline',
    targetPathDigest: digest(`target:${normalizedTarget}`),
    documentDigest: digest(`document:${normalizeDocumentText(oldText)}`),
    exactLiterals: document.exactLiterals,
    controlledTerms: document.controlledTerms,
    coreAnchors: document.coreAnchors,
    counts: document.counts,
  };
}

/**
 * Compare a new trusted document snapshot with a persistence-safe baseline.
 * The returned evidence also contains no raw path, text, or lexical token.
 */
export function evaluateDocumentPreservation({ baseline, newText, targetPath } = {}) {
  if (!isDocumentPreservationBaseline(baseline) || typeof newText !== 'string') return null;
  const normalizedTarget = normalizeTargetPath(targetPath);
  if (!normalizedTarget) return null;

  const targetPathDigest = digest(`target:${normalizedTarget}`);
  const targetMatches = targetPathDigest === baseline.targetPathDigest;
  const document = analyzeDocument(newText, normalizedTarget);
  const exactLiterals = compareDigestCounts(baseline.exactLiterals, document.exactLiterals);
  const polarityTerms = compareDigestCounts(baseline.controlledTerms.polarity, document.controlledTerms.polarity);
  const rangeTerms = compareDigestCounts(baseline.controlledTerms.range, document.controlledTerms.range);
  const modalityTerms = compareDigestCounts(baseline.controlledTerms.modality, document.controlledTerms.modality);
  const coreAnchors = compareDigestCounts(baseline.coreAnchors, document.coreAnchors);
  const reasonCodes = [];
  const proseLines = {
    addedCount: Math.max(0, document.counts.proseLines - baseline.counts.proseLines),
    removedCount: Math.max(0, baseline.counts.proseLines - document.counts.proseLines),
  };

  if (!targetMatches) reasonCodes.push('target-path-mismatch');
  if (exactLiterals.addedUniqueCount > 0 || exactLiterals.removedUniqueCount > 0) {
    reasonCodes.push('exact-literal-set-changed');
  } else if (exactLiterals.addedCount > 0 || exactLiterals.removedCount > 0) {
    reasonCodes.push('exact-literal-count-changed');
  }
  appendTermReasons(reasonCodes, 'polarity', polarityTerms);
  appendTermReasons(reasonCodes, 'range', rangeTerms);
  appendTermReasons(reasonCodes, 'modality', modalityTerms);
  if (proseLines.addedCount > 0) reasonCodes.push('prose-lines-added');
  if (proseLines.removedCount > 0) reasonCodes.push('prose-lines-removed');
  if (coreAnchors.addedCount > 0) reasonCodes.push('core-anchors-added');
  if (coreAnchors.removedCount > 0) reasonCodes.push('core-anchors-dropped');

  const checks = {
    targetPath: checkResult(targetMatches, targetMatches ? 0 : 1, 0),
    exactLiterals: checkResult(exactLiterals.addedCount === 0 && exactLiterals.removedCount === 0, exactLiterals.addedCount, exactLiterals.removedCount),
    polarityTerms: checkResult(polarityTerms.addedCount === 0 && polarityTerms.removedCount === 0, polarityTerms.addedCount, polarityTerms.removedCount),
    rangeTerms: checkResult(rangeTerms.addedCount === 0 && rangeTerms.removedCount === 0, rangeTerms.addedCount, rangeTerms.removedCount),
    modalityTerms: checkResult(modalityTerms.addedCount === 0 && modalityTerms.removedCount === 0, modalityTerms.addedCount, modalityTerms.removedCount),
    proseLines: checkResult(proseLines.addedCount === 0 && proseLines.removedCount === 0, proseLines.addedCount, proseLines.removedCount),
    coreAnchors: checkResult(coreAnchors.addedCount === 0 && coreAnchors.removedCount === 0, coreAnchors.addedCount, coreAnchors.removedCount),
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    source: 'host-document-preservation-evidence',
    baselineDigest: digest(`baseline:${JSON.stringify(baseline)}`),
    targetPathDigest,
    documentDigest: digest(`document:${normalizeDocumentText(newText)}`),
    ok: reasonCodes.length === 0,
    reasonCodes,
    checks,
    counts: {
      baselineProseLines: baseline.counts.proseLines,
      observedProseLines: document.counts.proseLines,
      baselineFactualLines: baseline.counts.factualLines,
      observedFactualLines: document.counts.factualLines,
      baselineExactLiterals: baseline.counts.exactLiterals,
      observedExactLiterals: document.counts.exactLiterals,
      baselineCoreAnchors: baseline.counts.coreAnchors,
      observedCoreAnchors: document.counts.coreAnchors,
    },
  };
}

function analyzeDocument(value = '', targetPath = '') {
  const lines = documentProseLines(normalizeDocumentText(value), targetPath);
  const literalValues = [];
  const controlledValues = { polarity: [], range: [], modality: [] };
  const anchorValues = [];
  let factualLines = 0;

  for (const line of lines.prose) {
    const literals = exactLiteralValues(line);
    if (isFactualProseLine(line, literals)) factualLines += 1;
    literalValues.push(...literals);
    for (const kind of Object.keys(controlledValues)) {
      controlledValues[kind].push(...controlledTermValues(line, kind));
    }
    anchorValues.push(...coreAnchorValues(line, literals));
  }

  const exactLiterals = digestCounts(literalValues, 'literal');
  const controlledTerms = {
    polarity: digestCounts(controlledValues.polarity, 'polarity'),
    range: digestCounts(controlledValues.range, 'range'),
    modality: digestCounts(controlledValues.modality, 'modality'),
  };
  const coreAnchors = digestCounts(anchorValues, 'anchor');
  return {
    exactLiterals,
    controlledTerms,
    coreAnchors,
    counts: {
      proseLines: lines.prose.length,
      factualLines,
      headingLines: lines.headingCount,
      exactLiterals: countDigestEntries(exactLiterals),
      polarityTerms: countDigestEntries(controlledTerms.polarity),
      rangeTerms: countDigestEntries(controlledTerms.range),
      modalityTerms: countDigestEntries(controlledTerms.modality),
      coreAnchors: countDigestEntries(coreAnchors),
    },
  };
}

function documentProseLines(text = '', targetPath = '') {
  const source = stripInactiveDocumentContent(text, targetPath).split('\n');
  const prose = [];
  let headingCount = 0;
  let fence = '';

  for (let index = 0; index < source.length; index += 1) {
    const line = source[index];
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/u);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = '';
      continue;
    }
    if (fence || !line.trim()) continue;
    if (isMarkdownDocument(targetPath) && /^(?: {4}|\t)/u.test(line)) continue;
    if (isMarkdownReferenceComment(line, targetPath)) continue;
    if (/^\s{0,3}#{1,6}(?:\s|$)/u.test(line)) {
      headingCount += 1;
      continue;
    }
    if (/^\s{0,3}(?:=+|-+)\s*$/u.test(source[index + 1] ?? '')) {
      headingCount += 1;
      index += 1;
      continue;
    }
    if (/^\s{0,3}(?:=+|-+)\s*$/u.test(line)) continue;
    prose.push(stripMarkdownPrefix(line));
  }
  return { prose, headingCount };
}

function stripInactiveDocumentContent(value = '', targetPath = '') {
  let text = String(value)
    .replace(/<!--[\s\S]*?(?:-->|$)/gu, preserveNewlines)
    .replace(/<(script|style|template|pre)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/giu, preserveNewlines)
    .replace(/<([a-z][\w:-]*)\b(?=[^>]*\bhidden(?:\s|=|>))[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/giu, preserveNewlines);
  if (/\.tex$/iu.test(targetPath)) {
    text = text
      .replace(/\\begin\{comment\}[\s\S]*?(?:\\end\{comment\}|$)/gu, preserveNewlines)
      .replace(/\\iffalse\b[\s\S]*?(?:\\fi\b|$)/gu, preserveNewlines)
      .split('\n')
      .map(stripLatexLineComment)
      .join('\n');
  }
  return text;
}

function preserveNewlines(value = '') {
  return String(value).replace(/[^\n]/gu, '');
}

function stripLatexLineComment(line = '') {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== '%') continue;
    let escapes = 0;
    for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) escapes += 1;
    if (escapes % 2 === 0) return line.slice(0, index);
  }
  return line;
}

function isMarkdownReferenceComment(line = '', targetPath = '') {
  if (!isMarkdownDocument(targetPath)) return false;
  return /^\s{0,3}\[(?:(?:\/\/)|comment|_)[^\]]*\]:\s*#(?:\s+(?:\([^\n]*\)|["'][^\n]*["']))?\s*$/iu.test(line);
}

function isMarkdownDocument(targetPath = '') {
  return /\.(?:md|mdx|markdown)$/iu.test(targetPath);
}

function stripMarkdownPrefix(value = '') {
  return String(value)
    .replace(/^\s{0,3}(?:>\s*)+/u, '')
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/u, '')
    .trim();
}

function isFactualProseLine(line = '', literals = []) {
  if (literals.length > 0) return true;
  const text = String(line);
  const wordCount = (text.match(/[A-Za-z][A-Za-z'’-]*/gu) ?? []).length;
  if (wordCount >= 3 && (ENGLISH_FACT_CUE.test(text) || hasEnglishRelationalVerb(text))) return true;
  const hanCount = (text.match(/[\p{Script=Han}]/gu) ?? []).length;
  return hanCount >= 4 && CHINESE_FACT_CUE.test(text);
}

function hasEnglishRelationalVerb(value = '') {
  const words = (String(value).match(/[A-Za-z][A-Za-z'’-]*/gu) ?? [])
    .map((word) => word.toLowerCase());
  if (words.length < 3) return false;
  return words.slice(1, -1).some((word) => /(?:ed|s)$/u.test(word)
    || new Set(['did', 'does', 'can', 'cannot', 'will', 'must']).has(word));
}

function exactLiteralValues(line = '') {
  return [...String(line).matchAll(EXACT_LITERAL_PATTERN)]
    .map((match) => normalizeExactLiteral(match[0]))
    .filter(Boolean);
}

function normalizeExactLiteral(value = '') {
  let literal = String(value).normalize('NFC').trim().replace(/−/gu, '-').replace(/\s+/gu, ' ').replace(/[.,;:!?。，；：！？]+$/u, '');
  if (!literal) return '';
  if (/^(?:(?:[<>]=?|[≤≥=≈~]|[+\-])\s*)?[$€£¥]?\d/u.test(literal)) {
    literal = literal
      .replace(/\s+/gu, '')
      .replace(/°[cf]$/iu, (unit) => unit.toUpperCase())
      .replace(/E/gu, 'e')
      .replace(/e\+/gu, 'e')
      .replace(/0[xbo][0-9a-f]+/giu, (baseLiteral) => baseLiteral.toLowerCase());
  }
  const kind = /^https?:\/\//iu.test(literal) ? 'url'
    : /^\\cite/iu.test(literal) || /^\[@/u.test(literal) ? 'citation'
      : /^[`“‘"]/u.test(literal) ? 'quoted'
        : 'number';
  return `${kind}:${literal}`;
}

function controlledTermValues(line = '', kind = '') {
  const patterns = CONTROLLED_TERMS[kind];
  if (!patterns) return [];
  const english = [...String(line).matchAll(patterns.english)]
    .map((match) => normalizeControlledTerm(match[0]));
  const chinese = [...String(line).matchAll(patterns.chinese)]
    .map((match) => normalizeControlledTerm(match[0]));
  return [...english, ...chinese].filter(Boolean);
}

function normalizeControlledTerm(value = '') {
  return String(value).normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
}

function coreAnchorValues(line = '', literals = exactLiteralValues(line)) {
  const anchors = [];
  for (const match of String(line).matchAll(/[A-Za-z][A-Za-z'’-]*/gu)) {
    const token = match[0].normalize('NFKC').toLowerCase().replace(/(?:'s|’s)$/u, '');
    if (token.length < 2 || ENGLISH_STOP_WORDS.has(token) || CONTROLLED_TERM_TOKENS.has(token)) continue;
    anchors.push(`en:${token}`);
  }

  for (const token of chineseWordTokens(line)) {
    if (CHINESE_STOP_WORDS.has(token)
      || CONTROLLED_TERM_TOKENS.has(token)) continue;
    anchors.push(`zh:${token}`);
  }
  const semanticAnchors = anchors.filter((anchor) => !claimCueAnchor(anchor));
  return [...semanticAnchors, ...claimBindingValues(line, literals, anchors)];
}

function claimBindingValues(line = '', literals = [], anchors = []) {
  if (!anchors.length) return [];
  const semanticAnchors = anchors.filter((anchor) => !claimCueAnchor(anchor));
  if (!semanticAnchors.length) return [];
  const bag = [...semanticAnchors].sort().join('|');
  const bindings = [...new Set(literals)].map((literal) => `claim-literal-binding:${literal}:${bag}`);
  if (literals.length > 1) bindings.push(`claim-literal-order:${literals.join('|')}`);
  const needsOrderedBinding = !literals.length
    || !hasEquativeCue(line)
    || semanticAnchors.length >= 3;
  if (needsOrderedBinding) bindings.push(`claim-anchor-order:${semanticAnchors.join('|')}`);
  return bindings;
}

function claimCueAnchor(anchor = '') {
  return /^(?:en:(?:is|are|was|were|has|have|had|contains?|equals?|remains?|supports?|uses?|requires?|provides?|returns?)|zh:(?:是|为|有|包含|等于|达到|保持|支持|使用|需要|提供|返回))$/iu.test(anchor);
}

function hasEquativeCue(line = '') {
  return /\b(?:is|are|was|were|equals?|remains?)\b/iu.test(line)
    || /(?:是|为|等于|保持)/u.test(line);
}

function chineseWordTokens(value = '') {
  const text = String(value);
  try {
    chineseSegmenter ??= new Intl.Segmenter('zh', { granularity: 'word' });
    return [...chineseSegmenter.segment(text)]
      .filter(({ segment, isWordLike }) => isWordLike && /\p{Script=Han}/u.test(segment))
      .map(({ segment }) => segment.normalize('NFKC').trim())
      .filter(Boolean);
  } catch {
    return text.match(/[\p{Script=Han}]+/gu) ?? [];
  }
}

function digestCounts(values = [], kind = '') {
  const counts = new Map();
  for (const value of values) {
    const fingerprint = digest(`${kind}:${value}`);
    counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fingerprint, count]) => ({ digest: fingerprint, count }));
}

function compareDigestCounts(before = [], after = []) {
  const left = new Map(before.map(({ digest: fingerprint, count }) => [fingerprint, count]));
  const right = new Map(after.map(({ digest: fingerprint, count }) => [fingerprint, count]));
  let addedCount = 0;
  let removedCount = 0;
  let addedUniqueCount = 0;
  let removedUniqueCount = 0;

  for (const [fingerprint, count] of right) {
    const previous = left.get(fingerprint) ?? 0;
    if (!left.has(fingerprint)) addedUniqueCount += 1;
    if (count > previous) addedCount += count - previous;
  }
  for (const [fingerprint, count] of left) {
    const observed = right.get(fingerprint) ?? 0;
    if (!right.has(fingerprint)) removedUniqueCount += 1;
    if (count > observed) removedCount += count - observed;
  }
  return { addedCount, removedCount, addedUniqueCount, removedUniqueCount };
}

function appendTermReasons(reasonCodes, prefix, comparison) {
  if (comparison.addedCount > 0) reasonCodes.push(`${prefix}-terms-added`);
  if (comparison.removedCount > 0) reasonCodes.push(`${prefix}-terms-removed`);
}

function checkResult(ok, addedCount, removedCount) {
  return { ok, addedCount, removedCount };
}

function isDocumentPreservationBaseline(value) {
  return value?.schemaVersion === SCHEMA_VERSION
    && value?.source === 'host-document-preservation-baseline'
    && SHA256.test(value?.targetPathDigest ?? '')
    && SHA256.test(value?.documentDigest ?? '')
    && isDigestCountList(value?.exactLiterals)
    && isDigestCountList(value?.controlledTerms?.polarity)
    && isDigestCountList(value?.controlledTerms?.range)
    && isDigestCountList(value?.controlledTerms?.modality)
    && isDigestCountList(value?.coreAnchors)
    && isSafeCountRecord(value?.counts);
}

function isDigestCountList(value) {
  return Array.isArray(value)
    && value.every((entry) => entry
      && Object.keys(entry).length === 2
      && SHA256.test(entry.digest)
      && Number.isSafeInteger(entry.count)
      && entry.count > 0);
}

function isSafeCountRecord(value) {
  return value && typeof value === 'object'
    && Object.values(value).every((count) => Number.isSafeInteger(count) && count >= 0);
}

function countDigestEntries(entries = []) {
  return entries.reduce((sum, entry) => sum + entry.count, 0);
}

function normalizeDocumentText(value = '') {
  return String(value).normalize('NFC').replace(/\r\n?/gu, '\n');
}

function normalizeTargetPath(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const normalized = path.normalize(value.trim().replace(/\\/gu, '/'));
  return normalized && normalized !== '.' ? normalized : '';
}

function digest(value = '') {
  return createHash('sha256').update(String(value)).digest('hex');
}
