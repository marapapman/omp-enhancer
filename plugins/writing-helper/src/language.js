function countMatches(text, pattern) {
  return Array.from(text.matchAll(pattern)).length;
}

export function resolveLanguage(language, text) {
  if (language === 'zh' || language === 'en') return language;

  const cjkCount = countMatches(text, /[\u3400-\u9fff]/gu);
  const latinCount = countMatches(text, /[A-Za-z]/gu);

  if (cjkCount === 0 && latinCount === 0) return 'en';
  return cjkCount >= latinCount * 0.35 ? 'zh' : 'en';
}
