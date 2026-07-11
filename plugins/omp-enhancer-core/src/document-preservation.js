import { createHash } from 'node:crypto';
import { posix as path } from 'node:path';

const SCHEMA_VERSION = 1;
export const DOCUMENT_SENTENCE_SEGMENTER_VERSION = 1;
const SENTENCE_SEGMENTER_VERSION = DOCUMENT_SENTENCE_SEGMENTER_VERSION;
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
export function createDocumentPreservationBaseline({ oldText, targetPath, prompt = '' } = {}) {
  if (typeof oldText !== 'string') return null;
  const normalizedTarget = normalizeTargetPath(targetPath);
  if (!normalizedTarget) return null;

  const document = analyzeDocument(oldText, normalizedTarget);
  const explicitScope = buildExplicitSentenceScope({ prompt, oldText, targetPath: normalizedTarget });
  return {
    schemaVersion: SCHEMA_VERSION,
    source: 'host-document-preservation-baseline',
    targetPathDigest: digest(`target:${normalizedTarget}`),
    documentDigest: digest(`document:${normalizeDocumentText(oldText)}`),
    exactLiterals: document.exactLiterals,
    controlledTerms: document.controlledTerms,
    coreAnchors: document.coreAnchors,
    counts: document.counts,
    ...(explicitScope.scope ? { scope: explicitScope.scope } : {}),
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
  if (baseline.scope?.mode === 'explicit-sentence') {
    if (baseline.scope.status !== 'resolved') return null;
    return evaluateExplicitSentenceScope({
      baseline,
      newText,
      normalizedTarget,
      targetPathDigest,
      targetMatches,
    });
  }
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

function buildExplicitSentenceScope({ prompt = '', oldText = '', targetPath = '' } = {}) {
  const directive = String(prompt).normalize('NFKC');
  const editableSentenceOrdinals = editableSentenceOrdinalsFor(directive);
  const explicitProtection = explicitSentenceProtectionClauses(directive);
  const eligible = editableSentenceOrdinals.length > 0
    && explicitProtection.clauses.length > 0
    && !hasResidualGlobalPreservationDirective(explicitProtection.residual);
  if (!eligible) return { eligible: false, scope: null };
  if (editableSentenceOrdinals.length !== 1) {
    return { eligible: true, scope: unresolvedExplicitSentenceScope('ambiguous-editable-sentence') };
  }

  const structure = documentSentenceStructure(oldText, targetPath);
  const requestedLiteralValues = requestedExactLiteralValues(
    explicitProtection.clauses.join('\n'),
    editableSentenceOrdinals,
  );
  if (!requestedLiteralValues.length) {
    return { eligible: true, scope: unresolvedExplicitSentenceScope('protected-literal-missing') };
  }
  if (!structure.sentences.length
    || editableSentenceOrdinals.some((ordinal) => ordinal < 1 || ordinal > structure.sentences.length)) {
    return { eligible: true, scope: unresolvedExplicitSentenceScope('editable-sentence-out-of-range') };
  }
  if (!structure.headings.length) {
    return { eligible: true, scope: unresolvedExplicitSentenceScope('protected-heading-missing') };
  }

  const normalizedText = normalizeDocumentText(oldText);
  const protectedLiteralDigests = digestCounts(requestedLiteralValues, 'literal');
  const allLiteralDigests = digestCounts(exactLiteralValues(normalizedText), 'literal');
  const protectedCounts = compareRequestedLiteralCounts(protectedLiteralDigests, allLiteralDigests);
  if (!protectedCounts.unique) {
    return { eligible: true, scope: unresolvedExplicitSentenceScope('protected-literal-ambiguous') };
  }
  if (structure.sentences.some((sentence) => editableSentenceOrdinals.includes(sentence.ordinal)
    && requestedLiteralValues.some((literal) => exactLiteralValues(sentence.text).includes(literal)))) {
    return { eligible: true, scope: unresolvedExplicitSentenceScope('protected-literal-in-editable-sentence') };
  }

  const immutableSkeletonDigest = explicitSentenceSkeletonDigest(
    normalizedText,
    structure.sentences,
    editableSentenceOrdinals,
    targetPath,
  );
  const headingSequenceDigest = digest(`headings:${JSON.stringify(structure.headings)}`);
  const scope = {
    mode: 'explicit-sentence',
    status: 'resolved',
    segmenterVersion: SENTENCE_SEGMENTER_VERSION,
    editableSentenceOrdinals,
    sentenceCount: structure.sentences.length,
    immutableSkeletonDigest,
    headingSequenceDigest,
    protectedLiteralDigests,
  };
  return {
    eligible: true,
    scope: {
      ...scope,
      contractDigest: digest(`explicit-sentence:${JSON.stringify(scope)}`),
    },
  };
}

function unresolvedExplicitSentenceScope(reasonCode = '') {
  const allowed = new Set([
    'ambiguous-editable-sentence',
    'protected-literal-missing',
    'editable-sentence-out-of-range',
    'protected-heading-missing',
    'protected-literal-ambiguous',
    'protected-literal-in-editable-sentence',
  ]);
  const scope = {
    mode: 'explicit-sentence',
    status: 'unresolved',
    segmenterVersion: SENTENCE_SEGMENTER_VERSION,
    reasonCode: allowed.has(reasonCode) ? reasonCode : 'ambiguous-editable-sentence',
  };
  return {
    ...scope,
    contractDigest: digest(`explicit-sentence:${JSON.stringify(scope)}`),
  };
}

function explicitSentenceProtectionClauses(value = '') {
  const source = String(value);
  const clauses = [];
  let residual = '';
  let cursor = 0;
  for (const match of source.matchAll(/[^.!?;。！？；\n]+(?:[.!?;。！？；\n]+|$)/gu)) {
    const index = match.index ?? 0;
    residual += source.slice(cursor, index);
    if (isExplicitSentenceProtectionClause(match[0])) clauses.push(match[0]);
    else residual += match[0];
    cursor = index + match[0].length;
  }
  residual += source.slice(cursor);
  return { clauses, residual };
}

function isExplicitSentenceProtectionClause(value = '') {
  const clause = String(value);
  const heading = /\b(?:preserv(?:e|es|ed|ing)|keep|retain)\b[^.!?;\n]{0,80}\b(?:the\s+)?(?:heading|title)s?\b|(?:保留|保持|维持)[^。！？；\n]{0,40}(?:标题|题目)|(?:标题|题目)[^。！？；\n]{0,24}(?:不变|原样)/iu.test(clause);
  const exact = /\b(?:preserv(?:e|es|ed|ing)|keep|retain)\b[^.!?;\n]{0,96}\bexact\b[^.!?;\n]{0,48}\b(?:factual\s+)?(?:values?|numbers?|literals?)\b|(?:保留|保持|维持)[^。！？；\n]{0,64}(?:精确|确切|准确|原样)[^。！？；\n]{0,24}(?:事实)?(?:数值|数字|值|字面量)/iu.test(clause);
  if (!heading || !exact || exactLiteralValues(clause).length === 0) return false;
  const withoutExplicitTerms = clause
    .replace(/\b(?:the\s+)?exact(?:\s+factual)?\s+(?:values?|numbers?|literals?)\b/giu, ' ')
    .replace(/(?:精确|确切|准确|原样)\s*(?:事实)?\s*(?:数值|数字|值|字面量)/gu, ' ');
  return !/\b(?:facts?|claims?|statements?|conclusions?|data|numbers?|values?|meaning|semantics?|citations?)\b|(?:事实|主张|声明|结论|数据|数字|数值|含义|意义|语义|引用)/iu.test(withoutExplicitTerms);
}

function hasResidualGlobalPreservationDirective(value = '') {
  const text = String(value);
  return requiresDocumentPreservation(text)
    || /\b(?:preserv(?:e|es|ed|ing)|keep|retain)\b[^.!?;\n]{0,96}\b(?:facts?|claims?|statements?|conclusions?|data|numbers?|values?|meaning|semantics?|citations?)\b/iu.test(text)
    || /\b(?:preserv(?:e|es|ed|ing)|keep|retain)\b[^.!?;\n]{0,96}\b(?:(?:all|every|entire|remaining|other)\s+(?:content|text|prose|wording|sentences?|paragraphs?|sections?)|everything|anything|the\s+rest)\b/iu.test(text)
    || /\b(?:(?:all|every|entire|remaining|other)\s+(?:content|text|prose|wording|sentences?|paragraphs?|sections?)|everything|anything|the\s+rest)\b[^.!?;\n]{0,48}\b(?:remain|stay|be|keep)\b[^.!?;\n]{0,24}\b(?:unchanged|intact|the\s+same)\b/iu.test(text)
    || /\b(?:do\s+not|don't|must\s+not|never|without)\b[^.!?;\n]{0,24}\b(?:change|changing|alter|altering|modify|modifying|rewrite|rewriting)\b[^.!?;\n]{0,48}\b(?:(?:all|any|the|this|remaining|other)\s+)?(?:content|text|prose|wording|sentences?|paragraphs?|sections?|everything|anything)\b/iu.test(text)
    || /(?:保留|保持|维持)[^。！？；\n]{0,64}(?:事实|主张|声明|结论|数据|数字|数值|含义|意义|语义|引用|(?:所有|全部|其余|其他|剩余)(?:内容|文本|文字|措辞|句子|段落|章节|部分)|其余|全部)/u.test(text)
    || /(?:(?:所有|全部|其余|其他|剩余)(?:内容|文本|文字|措辞|句子|段落|章节|部分)|其余|全部)[^。！？；\n]{0,32}(?:保持|维持)?(?:不变|原样)/u.test(text)
    || /(?:不要|不得|不能|不可|禁止|切勿|别|不)\s*(?:改变|更改|修改|改动)[^。！？；\n]{0,40}(?:(?:所有|全部|其余|其他|剩余)(?:内容|文本|文字|措辞|句子|段落|章节|部分)|内容|文本|文字)/u.test(text);
}

function evaluateExplicitSentenceScope({
  baseline,
  newText,
  normalizedTarget,
  targetPathDigest,
  targetMatches,
}) {
  const structure = documentSentenceStructure(newText, normalizedTarget);
  const document = analyzeDocument(newText, normalizedTarget);
  const scope = baseline.scope;
  const sentenceCountMatches = structure.sentences.length === scope.sentenceCount;
  const headingSequenceMatches = digest(`headings:${JSON.stringify(structure.headings)}`) === scope.headingSequenceDigest;
  const skeletonMatches = sentenceCountMatches
    && explicitSentenceSkeletonDigest(
      normalizeDocumentText(newText),
      structure.sentences,
      scope.editableSentenceOrdinals,
      normalizedTarget,
    ) === scope.immutableSkeletonDigest;
  const observedLiteralDigests = digestCounts(exactLiteralValues(normalizeDocumentText(newText)), 'literal');
  const literalComparison = compareDigestCounts(scope.protectedLiteralDigests, observedLiteralDigests, {
    restrictToBefore: true,
  });
  const polarityTerms = compareDigestCounts(baseline.controlledTerms.polarity, document.controlledTerms.polarity);
  const rangeTerms = compareDigestCounts(baseline.controlledTerms.range, document.controlledTerms.range);
  const modalityTerms = compareDigestCounts(baseline.controlledTerms.modality, document.controlledTerms.modality);
  const coreAnchors = compareDigestCounts(baseline.coreAnchors, document.coreAnchors);
  const proseLines = {
    addedCount: Math.max(0, document.counts.proseLines - baseline.counts.proseLines),
    removedCount: Math.max(0, baseline.counts.proseLines - document.counts.proseLines),
  };
  const protectedLiteralsMatch = literalComparison.addedCount === 0 && literalComparison.removedCount === 0;
  const reasonCodes = [];
  if (!targetMatches) reasonCodes.push('target-path-mismatch');
  if (!protectedLiteralsMatch) reasonCodes.push('protected-literal-count-changed');
  if (!sentenceCountMatches) reasonCodes.push('sentence-count-changed');
  if (!headingSequenceMatches) reasonCodes.push('heading-sequence-changed');
  if (!skeletonMatches) reasonCodes.push('immutable-scope-changed');

  const checks = {
    targetPath: checkResult(targetMatches, targetMatches ? 0 : 1, 0),
    exactLiterals: checkResult(protectedLiteralsMatch, literalComparison.addedCount, literalComparison.removedCount),
    polarityTerms: checkResult(polarityTerms.addedCount === 0 && polarityTerms.removedCount === 0, polarityTerms.addedCount, polarityTerms.removedCount, { applicable: false }),
    rangeTerms: checkResult(rangeTerms.addedCount === 0 && rangeTerms.removedCount === 0, rangeTerms.addedCount, rangeTerms.removedCount, { applicable: false }),
    modalityTerms: checkResult(modalityTerms.addedCount === 0 && modalityTerms.removedCount === 0, modalityTerms.addedCount, modalityTerms.removedCount, { applicable: false }),
    proseLines: checkResult(proseLines.addedCount === 0 && proseLines.removedCount === 0, proseLines.addedCount, proseLines.removedCount, { applicable: false }),
    coreAnchors: checkResult(coreAnchors.addedCount === 0 && coreAnchors.removedCount === 0, coreAnchors.addedCount, coreAnchors.removedCount, { applicable: false }),
  };
  const scopeChecks = {
    protectedLiterals: checkResult(protectedLiteralsMatch, literalComparison.addedCount, literalComparison.removedCount),
    sentenceCount: checkResult(sentenceCountMatches, Math.max(0, structure.sentences.length - scope.sentenceCount), Math.max(0, scope.sentenceCount - structure.sentences.length)),
    headingSequence: checkResult(headingSequenceMatches, headingSequenceMatches ? 0 : 1, headingSequenceMatches ? 0 : 1),
    immutableScope: checkResult(skeletonMatches, skeletonMatches ? 0 : 1, skeletonMatches ? 0 : 1),
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
    scopeChecks,
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

function editableSentenceOrdinalsFor(value = '') {
  const source = String(value).replace(/(?<=[\p{L}\p{N}/_-])\.(?=[\p{L}\p{N}])/gu, '_');
  const ordinals = [];
  const english = {
    first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
    sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  };
  const tokenSource = 'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\\d+(?:st|nd|rd|th)';
  const tokenPattern = `(${tokenSource})`;
  const editVerbSource = 'polish|rewrite|edit|revise|rephrase|improve|shorten|clarify|tighten|simplify|make';
  const coordinatedEnglish = new RegExp(
    `\\b(${editVerbSource})\\b[^.!?;\\n]{0,120}?\\b(?:the\\s+)?(${tokenSource})(?:\\s+sentences?)?(?:,\\s*(?:and\\s+)?|\\s+(?:and|as\\s+well\\s+as|&)\\s+)(?:the\\s+)?(${tokenSource})\\s+sentences?\\b`,
    'giu',
  );
  for (const match of source.matchAll(coordinatedEnglish)) {
    const verbOffset = (match.index ?? 0) + match[0].toLowerCase().indexOf(match[1].toLowerCase());
    const firstRelativeOffset = match[0].toLowerCase().indexOf(match[2].toLowerCase(), match[0].toLowerCase().indexOf(match[1].toLowerCase()) + match[1].length);
    const secondRelativeOffset = match[0].toLowerCase().lastIndexOf(match[3].toLowerCase());
    const firstOffset = (match.index ?? 0) + firstRelativeOffset;
    const secondOffset = (match.index ?? 0) + secondRelativeOffset;
    const sequenceExcluded = hasOrdinalExclusion(value, firstOffset, firstOffset + match[2].length, 'en');
    if (hasImmediateEditNegation(value, verbOffset, 'en') || sequenceExcluded) continue;
    for (const [token, ordinalOffset] of [[match[2], firstOffset], [match[3], secondOffset]]) {
      if (hasNegatedEditBeforeOrdinal(value, ordinalOffset, 'en')
        || hasOrdinalExclusion(value, ordinalOffset, ordinalOffset + token.length, 'en')) continue;
      ordinals.push(english[token.toLowerCase()] ?? Number.parseInt(token, 10));
    }
  }
  const englishPatterns = [
    new RegExp(`\\b(${editVerbSource})\\b[^.!?;,\\n]{0,120}\\b(?:the\\s+)?${tokenPattern}\\s+sentences?\\b`, 'giu'),
    new RegExp(`\\b(?:the\\s+)?${tokenPattern}\\s+sentences?\\b[^.!?;,\\n]{0,80}\\b(polish|rewrite|edit|revise|rephrase|improve|shorten|clarify|tighten|simplify)\\b`, 'giu'),
  ];
  for (const [patternIndex, pattern] of englishPatterns.entries()) {
    for (const match of source.matchAll(pattern)) {
      const verbIndex = patternIndex === 0 ? 1 : 2;
      const tokenIndex = patternIndex === 0 ? 2 : 1;
      const verbOffset = (match.index ?? 0) + match[0].toLowerCase().indexOf(match[verbIndex].toLowerCase());
      const ordinalOffset = (match.index ?? 0) + match[0].toLowerCase().indexOf(match[tokenIndex].toLowerCase());
      if (hasImmediateEditNegation(value, verbOffset, 'en')
        || hasNegatedEditBeforeOrdinal(value, ordinalOffset, 'en')
        || hasOrdinalExclusion(value, ordinalOffset, ordinalOffset + match[tokenIndex].length, 'en')) continue;
      const token = match[tokenIndex].toLowerCase();
      ordinals.push(english[token] ?? Number.parseInt(token, 10));
    }
  }

  const chinesePatterns = [
    /(?:润色|改写|编辑|修改|精简|优化|调整|简化|改善)[^。！？；，,\n]{0,64}第\s*([一二三四五六七八九十\d]+)\s*句/gu,
    /第\s*([一二三四五六七八九十\d]+)\s*句[^。！？；，,\n]{0,48}(?:润色|改写|编辑|修改|精简|优化|调整|简化|改善)/gu,
  ];
  const coordinatedChinese = /(?:润色|改写|编辑|修改|精简|优化|调整|简化|改善)[^。！？；，,\n]{0,64}?第\s*([一二三四五六七八九十\d]+)\s*(?:句)?\s*(?:、|和|及|与|以及|并)\s*第\s*([一二三四五六七八九十\d]+)\s*句/gu;
  for (const match of source.matchAll(coordinatedChinese)) {
    const verb = match[0].match(/(?:润色|改写|编辑|修改|精简|优化|调整|简化|改善)/u);
    const verbOffset = (match.index ?? 0) + (verb?.index ?? 0);
    const firstRelativeOffset = match[0].indexOf('第');
    const secondRelativeOffset = match[0].lastIndexOf('第');
    const firstOffset = (match.index ?? 0) + firstRelativeOffset;
    const secondOffset = (match.index ?? 0) + secondRelativeOffset;
    const firstOrdinalText = match[0].slice(firstRelativeOffset).match(/^第\s*[一二三四五六七八九十\d]+\s*(?:句)?/u)?.[0] ?? '';
    const secondOrdinalText = match[0].slice(secondRelativeOffset).match(/^第\s*[一二三四五六七八九十\d]+\s*句/u)?.[0] ?? '';
    const sequenceExcluded = hasOrdinalExclusion(value, firstOffset, firstOffset + firstOrdinalText.length, 'zh');
    if (hasImmediateEditNegation(value, verbOffset, 'zh') || sequenceExcluded) continue;
    for (const [token, ordinalOffset, ordinalText] of [
      [match[1], firstOffset, firstOrdinalText],
      [match[2], secondOffset, secondOrdinalText],
    ]) {
      if (hasNegatedEditBeforeOrdinal(value, ordinalOffset, 'zh')
        || hasOrdinalExclusion(value, ordinalOffset, ordinalOffset + ordinalText.length, 'zh')) continue;
      ordinals.push(chineseOrdinalValue(token));
    }
  }
  for (const pattern of chinesePatterns) {
    for (const match of source.matchAll(pattern)) {
      const verb = match[0].match(/(?:润色|改写|编辑|修改|精简|优化|调整|简化|改善)/u);
      const verbOffset = (match.index ?? 0) + (verb?.index ?? 0);
      const ordinalRelativeOffset = match[0].indexOf('第');
      const ordinalOffset = (match.index ?? 0) + ordinalRelativeOffset;
      const ordinalText = match[0]
        .slice(ordinalRelativeOffset)
        .match(/^第\s*[一二三四五六七八九十\d]+\s*句/u)?.[0] ?? '';
      if (hasImmediateEditNegation(value, verbOffset, 'zh')
        || hasNegatedEditBeforeOrdinal(value, ordinalOffset, 'zh')
        || hasOrdinalExclusion(value, ordinalOffset, ordinalOffset + ordinalText.length, 'zh')) continue;
      ordinals.push(chineseOrdinalValue(match[1]));
    }
  }
  return [...new Set(ordinals.filter((ordinal) => Number.isSafeInteger(ordinal) && ordinal > 0))].sort((left, right) => left - right);
}

function hasImmediateEditNegation(value = '', editOffset = 0, language = '') {
  const prefix = String(value).slice(Math.max(0, editOffset - 32), editOffset);
  if (language === 'zh') {
    return /(?:不要|不得|不能|不可|禁止|切勿|别|无需|不用|不)\s*(?:进行|做|作|予以)?\s*$/u.test(prefix)
      || /(?:不要|不得|不能|不可|禁止|切勿|别|无需|不用|不)\s*(?:希望|想要|需要|打算|计划|尝试|试图)(?:你|再)?\s*$/u.test(prefix)
      || /(?:避免|跳过|略过)\s*$/u.test(prefix);
  }
  return /\b(?:do\s+not|don't|never|must\s+not|should\s+not|cannot|can't|without)\s*$/iu.test(prefix)
    || /\b(?:do\s+not|don't|never|must\s+not|should\s+not|cannot|can't)\s+(?:want(?:\s+you)?\s+to|try\s+to|attempt\s+to|plan\s+to)\s*$/iu.test(prefix)
    || /\b(?:avoid|skip|forgo|refrain\s+from|rather\s+than|instead\s+of|except|no\s+need\s+to)\s*$/iu.test(prefix);
}

function hasNegatedEditBeforeOrdinal(value = '', ordinalOffset = 0, language = '') {
  const prefix = String(value).slice(Math.max(0, ordinalOffset - 56), ordinalOffset);
  if (language === 'zh') {
    return /(?:不要|不得|不能|不可|禁止|切勿|别|无需|不用|不)\s*(?:润色|改写|编辑|修改|精简|优化|调整|简化|改善)\s*$/u.test(prefix)
      || /(?:不要|不得|不能|不可|禁止|切勿|别|无需|不用|不)\s*(?:对|将|把|给)\s*$/u.test(prefix);
  }
  return /\b(?:do\s+not|don't|never|must\s+not|should\s+not|cannot|can't)\s+(?:polish|rewrite|edit|revise|rephrase|improve|shorten|clarify|tighten|simplify|make)\s+(?:the\s+)?$/iu.test(prefix)
    || /\bmake\s+no\s+(?:changes?|edits?|revisions?)\s+(?:to|in)\s+(?:the\s+)?$/iu.test(prefix);
}

function hasOrdinalExclusion(value = '', ordinalOffset = 0, ordinalEnd = ordinalOffset, language = '') {
  const source = String(value);
  const prefix = source.slice(Math.max(0, ordinalOffset - 40), ordinalOffset);
  const suffix = source.slice(ordinalEnd, Math.min(source.length, ordinalEnd + 32));
  if (language === 'zh') {
    return /(?:除|除了|但|但不|不包括|排除)\s*$/u.test(prefix)
      || /(?:除|除了|但不|不包括|排除)[^。！？；，,\n]{0,24}(?:和|及|与|、|或|以及)\s*$/u.test(prefix)
      || /^\s*(?:句)?\s*(?:除外|之外|以外|不要|不得|不能|不可|禁止|无需|不用|不做|不作|不动|保持不变)/u.test(suffix);
  }
  return /\b(?:except|excluding|other\s+than|but(?:\s+not)?|not)\s+(?:the\s+)?$/iu.test(prefix)
    || /\b(?:except|excluding|other\s+than|but(?:\s+not)?|not)\b[^.!?;,\n]{0,32}\b(?:and|or|&)\s+(?:the\s+)?$/iu.test(prefix)
    || /^\s*(?:sentence)?\s+(?:(?:must|should)\s+)?(?:remain\s+)?(?:excepted|excluded|unchanged|intact|unmodified)\b/iu.test(suffix);
}

function chineseOrdinalValue(value = '') {
  if (/^\d+$/u.test(value)) return Number(value);
  const digits = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === '十') return 10;
  if (value.startsWith('十')) return 10 + (digits[value[1]] ?? 0);
  if (value.endsWith('十')) return (digits[value[0]] ?? 0) * 10;
  if (value.includes('十')) return (digits[value[0]] ?? 0) * 10 + (digits[value[2]] ?? 0);
  return digits[value] ?? 0;
}

function requestedExactLiteralValues(prompt = '', editableSentenceOrdinals = []) {
  const ordinalLiterals = new Set(editableSentenceOrdinals.map((ordinal) => `number:${ordinal}`));
  return [...new Set(exactLiteralValues(prompt).filter((literal) => !ordinalLiterals.has(literal)))];
}

function compareRequestedLiteralCounts(requested = [], observed = []) {
  const right = new Map(observed.map(({ digest: fingerprint, count }) => [fingerprint, count]));
  return {
    unique: requested.every(({ digest: fingerprint, count }) => count === 1 && right.get(fingerprint) === 1),
  };
}

function documentSentenceStructure(value = '', targetPath = '') {
  const text = normalizeDocumentText(value);
  const masked = maskInactiveDocumentContent(text, targetPath);
  const rawLines = text.split('\n');
  const maskedLines = masked.split('\n');
  const headings = [];
  const sentences = [];
  const proseBlocks = [];
  let fence = '';
  let offset = 0;
  let blockStart = null;
  let blockEnd = null;

  const flushBlock = () => {
    if (blockStart !== null && blockEnd !== null && blockEnd > blockStart) {
      proseBlocks.push({ start: blockStart, end: blockEnd });
    }
    blockStart = null;
    blockEnd = null;
  };

  for (let index = 0; index < rawLines.length; index += 1) {
    const rawLine = rawLines[index];
    const maskedLine = maskedLines[index] ?? '';
    const fenceMatch = rawLine.match(/^\s{0,3}(`{3,}|~{3,})/u);
    if (fenceMatch) {
      flushBlock();
      const marker = fenceMatch[1][0];
      if (!fence) fence = marker;
      else if (fence === marker) fence = '';
      offset += rawLine.length + 1;
      continue;
    }
    const setext = isMarkdownDocument(targetPath)
      && /^\s{0,3}(?:=+|-+)\s*$/u.test(rawLines[index + 1] ?? '');
    const markdownHeading = isMarkdownDocument(targetPath) && /^\s{0,3}#{1,6}(?:\s|$)/u.test(rawLine);
    const latexHeading = /\.tex$/iu.test(targetPath)
      && /^\s*\\(?:part|chapter|section|subsection|subsubsection|paragraph)\*?\s*\{[^}]*\}/u.test(rawLine);
    if (!fence && (setext || markdownHeading || latexHeading)) {
      flushBlock();
      headings.push(normalizeHeadingText(rawLine, { setext }));
      offset += rawLine.length + 1;
      if (setext) {
        index += 1;
        offset += (rawLines[index]?.length ?? 0) + 1;
      }
      continue;
    }
    const visibleProse = !fence
      && maskedLine.trim()
      && !(isMarkdownDocument(targetPath) && /^(?: {4}|\t)/u.test(rawLine))
      && !isMarkdownReferenceComment(rawLine, targetPath)
      && !/^\s{0,3}(?:=+|-+)\s*$/u.test(rawLine);
    if (!visibleProse) {
      flushBlock();
      offset += rawLine.length + 1;
      continue;
    }
    if (blockStart !== null && startsNewVisibleProseBlock(rawLine, targetPath)) flushBlock();
    if (blockStart === null) blockStart = offset;
    blockEnd = offset + rawLine.length;
    offset += rawLine.length + 1;
  }
  flushBlock();

  for (const block of proseBlocks) {
    const blockMask = maskVisibleProsePrefixes(masked.slice(block.start, block.end), targetPath);
    for (const range of sentenceRanges(blockMask)) {
      const start = block.start + range.start;
      const end = block.start + range.end;
      const textValue = text.slice(start, end);
      if (!textValue.trim()) continue;
      sentences.push({
        ordinal: sentences.length + 1,
        start,
        end,
        text: textValue,
      });
    }
  }
  return { headings, sentences, segmenterVersion: SENTENCE_SEGMENTER_VERSION };
}

function sentenceRanges(value = '') {
  const text = String(value);
  const ranges = [];
  let start = nextNonWhitespace(text, 0);
  for (let index = start; index < text.length; index += 1) {
    if (!/[.!?。！？]/u.test(text[index]) || !isSentenceBoundaryAt(text, index, start)) continue;
    let end = index + 1;
    while (end < text.length && /[.!?。！？]/u.test(text[end])) end += 1;
    while (end < text.length && /["'”’\])}]/u.test(text[end])) end += 1;
    ranges.push({ start, end });
    start = nextNonWhitespace(text, end);
    index = Math.max(index, start - 1);
  }
  if (start < text.length) {
    let end = text.length;
    while (end > start && /\s/u.test(text[end - 1])) end -= 1;
    if (end > start) ranges.push({ start, end });
  }
  return ranges;
}

function isSentenceBoundaryAt(text = '', index = 0, sentenceStart = 0) {
  const character = text[index];
  if (character === '.' && /\d/u.test(text[index - 1] ?? '') && /\d/u.test(text[index + 1] ?? '')) return false;
  let cursor = index + 1;
  while (cursor < text.length && /[.!?。！？"'”’\])}]/u.test(text[cursor])) cursor += 1;
  if (/[。！？]/u.test(character)) return true;
  if (cursor < text.length && !/\s/u.test(text[cursor])) return false;
  if (character !== '.') return true;
  const prefix = text.slice(sentenceStart, index + 1).trim().toLowerCase();
  const abbreviation = prefix.match(/(?:^|\s)([a-z](?:\.[a-z])?\.|(?:mr|mrs|ms|dr|prof|sr|jr|vs|fig|no|etc)\.)$/u)?.[1] ?? '';
  return !abbreviation;
}

function nextNonWhitespace(text = '', from = 0) {
  let index = Math.max(0, from);
  while (index < text.length && /\s/u.test(text[index])) index += 1;
  return index;
}

function startsNewVisibleProseBlock(line = '', targetPath = '') {
  if (!isMarkdownDocument(targetPath)) return false;
  return /^\s{0,3}(?:(?:>\s*)+)?(?:[-+*]\s+|\d+[.)]\s+)/u.test(line);
}

function maskVisibleProsePrefixes(value = '', targetPath = '') {
  if (!isMarkdownDocument(targetPath)) return String(value);
  return String(value).split('\n').map((line) => {
    const prefix = line.match(/^\s{0,3}(?:(?:>\s*)+)?(?:[-+*]|\d+[.)])?\s*/u)?.[0] ?? '';
    if (!prefix) return line;
    return `${' '.repeat(prefix.length)}${line.slice(prefix.length)}`;
  }).join('\n');
}

function explicitSentenceSkeletonDigest(
  text = '',
  sentences = [],
  editableSentenceOrdinals = [],
  targetPath = '',
) {
  const editable = new Set(editableSentenceOrdinals);
  let cursor = 0;
  let skeleton = '';
  for (const sentence of sentences) {
    if (!editable.has(sentence.ordinal)) continue;
    skeleton += text.slice(cursor, sentence.start);
    skeleton += `__OMP_EDITABLE_SENTENCE_${sentence.ordinal}__`;
    cursor = sentence.end;
  }
  skeleton += text.slice(cursor);
  const containers = editableSentenceContainerSignatures(
    text,
    sentences,
    editableSentenceOrdinals,
    targetPath,
  );
  return digest(`skeleton:${skeleton}:containers:${JSON.stringify(containers)}`);
}

function editableSentenceContainerSignatures(
  text = '',
  sentences = [],
  editableSentenceOrdinals = [],
  targetPath = '',
) {
  if (!isMarkdownDocument(targetPath)) return [];
  const editable = new Set(editableSentenceOrdinals);
  return sentences.filter((sentence) => editable.has(sentence.ordinal)).map((sentence) => {
    const signatures = new Set();
    let lineStart = text.lastIndexOf('\n', Math.max(0, sentence.start - 1)) + 1;
    while (lineStart < sentence.end) {
      const nextBreak = text.indexOf('\n', lineStart);
      const lineEnd = nextBreak < 0 ? text.length : nextBreak;
      if (lineEnd >= sentence.start) {
        signatures.add(markdownContainerSignature(text.slice(lineStart, lineEnd)));
      }
      if (nextBreak < 0 || nextBreak >= sentence.end) break;
      lineStart = nextBreak + 1;
    }
    return { ordinal: sentence.ordinal, containers: [...signatures].sort() };
  });
}

function markdownContainerSignature(line = '') {
  let rest = String(line);
  const indentation = rest.match(/^[ \t]{0,3}/u)?.[0] ?? '';
  rest = rest.slice(indentation.length);
  let quoteDepth = 0;
  while (/^>\s?/u.test(rest)) {
    rest = rest.replace(/^>\s?/u, '');
    quoteDepth += 1;
  }
  let list = 'none';
  if (/^[-+*]\s+/u.test(rest)) list = 'unordered';
  else if (/^\d+[.)]\s+/u.test(rest)) list = 'ordered';
  return `indent:${indentation.replace(/\t/gu, '    ').length}|quote:${quoteDepth}|list:${list}`;
}

function normalizeHeadingText(value = '', { setext = false } = {}) {
  const text = String(value).normalize('NFC').trim();
  return setext ? `setext:${text}` : text.replace(/^#{1,6}\s*/u, '').trim();
}

function maskInactiveDocumentContent(value = '', targetPath = '') {
  const mask = (text) => String(text).replace(/[^\n]/gu, ' ');
  let text = String(value)
    .replace(/<!--[\s\S]*?(?:-->|$)/gu, mask)
    .replace(/<(script|style|template|pre)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/giu, mask)
    .replace(/<([a-z][\w:-]*)\b(?=[^>]*\bhidden(?:\s|=|>))[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/giu, mask);
  if (/\.tex$/iu.test(targetPath)) {
    text = text
      .replace(/\\begin\{comment\}[\s\S]*?(?:\\end\{comment\}|$)/gu, mask)
      .replace(/\\iffalse\b[\s\S]*?(?:\\fi\b|$)/gu, mask)
      .split('\n')
      .map(maskLatexLineComment)
      .join('\n');
  }
  return text;
}

function maskLatexLineComment(line = '') {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] !== '%') continue;
    let escapes = 0;
    for (let cursor = index - 1; cursor >= 0 && line[cursor] === '\\'; cursor -= 1) escapes += 1;
    if (escapes % 2 === 0) return `${line.slice(0, index)}${' '.repeat(line.length - index)}`;
  }
  return line;
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

function compareDigestCounts(before = [], after = [], { restrictToBefore = false } = {}) {
  const left = new Map(before.map(({ digest: fingerprint, count }) => [fingerprint, count]));
  const right = new Map(after.map(({ digest: fingerprint, count }) => [fingerprint, count]));
  let addedCount = 0;
  let removedCount = 0;
  let addedUniqueCount = 0;
  let removedUniqueCount = 0;

  for (const [fingerprint, count] of right) {
    if (restrictToBefore && !left.has(fingerprint)) continue;
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

function checkResult(ok, addedCount, removedCount, { applicable = true } = {}) {
  return { ok, addedCount, removedCount, ...(applicable ? {} : { applicable: false }) };
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
    && (value?.scope === undefined || isExplicitSentenceScope(value.scope))
    && isSafeCountRecord(value?.counts);
}

function isExplicitSentenceScope(value) {
  if (!value
    || value.mode !== 'explicit-sentence'
    || !['resolved', 'unresolved'].includes(value.status)
    || value.segmenterVersion !== SENTENCE_SEGMENTER_VERSION
    || !SHA256.test(value.contractDigest ?? '')) return false;
  if (value.status === 'unresolved') {
    const reasons = new Set([
      'ambiguous-editable-sentence',
      'protected-literal-missing',
      'editable-sentence-out-of-range',
      'protected-heading-missing',
      'protected-literal-ambiguous',
      'protected-literal-in-editable-sentence',
    ]);
    if (!reasons.has(value.reasonCode)) return false;
    const contract = {
      mode: value.mode,
      status: value.status,
      segmenterVersion: value.segmenterVersion,
      reasonCode: value.reasonCode,
    };
    return value.contractDigest === digest(`explicit-sentence:${JSON.stringify(contract)}`);
  }
  if (!Array.isArray(value.editableSentenceOrdinals)
    || value.editableSentenceOrdinals.length !== 1
    || !value.editableSentenceOrdinals.every((ordinal) => Number.isSafeInteger(ordinal) && ordinal > 0)
    || !Number.isSafeInteger(value.sentenceCount)
    || value.sentenceCount < value.editableSentenceOrdinals[0]
    || !SHA256.test(value.immutableSkeletonDigest ?? '')
    || !SHA256.test(value.headingSequenceDigest ?? '')
    || !isDigestCountList(value.protectedLiteralDigests)
    || value.protectedLiteralDigests.length === 0) return false;
  const contract = {
    mode: value.mode,
    status: value.status,
    segmenterVersion: value.segmenterVersion,
    editableSentenceOrdinals: value.editableSentenceOrdinals,
    sentenceCount: value.sentenceCount,
    immutableSkeletonDigest: value.immutableSkeletonDigest,
    headingSequenceDigest: value.headingSequenceDigest,
    protectedLiteralDigests: value.protectedLiteralDigests,
  };
  return value.contractDigest === digest(`explicit-sentence:${JSON.stringify(contract)}`);
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
