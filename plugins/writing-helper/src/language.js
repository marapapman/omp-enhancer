function countMatches(text, pattern) {
  return Array.from(text.matchAll(pattern)).length;
}

/**
 * Human-readable location of an index inside a document, counting the
 * 1-based paragraph number (paragraphs are split on blank lines).
 *
 * @param {string} text  Document text
 * @param {number} index  Character offset (negative values treated as 0)
 * @param {string} language  'zh' for Chinese labels, anything else for English
 * @returns {string}  e.g. `paragraph 2` or `第 2 段`
 */
export function paragraphLocation(text, index, language) {
  const before = text.slice(0, Math.max(0, index));
  const paragraph = before.split(/\n\s*\n/u).length;
  return language === 'zh' ? `第 ${paragraph} 段` : `paragraph ${paragraph}`;
}

export function resolveLanguage(language, text) {
  if (language === 'zh' || language === 'en') return language;

  const cjkCount = countMatches(text, /[\u3400-\u9fff]/gu);
  const latinCount = countMatches(text, /[A-Za-z]/gu);

  if (cjkCount === 0 && latinCount === 0) return 'en';
  return cjkCount >= latinCount * 0.35 ? 'zh' : 'en';
}
