const ANCHOR_PATTERNS = [
  ['qualifier', /\b(?:always|typically|often|usually|generally)\b|(?:通常|经常|一般|往往)/giu],
  ['intensity', /\b(?:significantly|substantially)\b|(?:显著|大幅)/giu],
  ['modality', /\b(?:may|might|can|could)\b|(?:可能|或许|可以|能够)/giu],
  ['scope', /\b(?:only|at\s+least|at\s+most|up\s+to)\b|(?:仅|只有|至少|至多|不高于)/giu],
  ['negation', /\b(?:not|no|never|without|cannot|can't|doesn't|didn't|isn't|aren't)\b|(?:并非|没有|不能|不会|未能|不|未|无)/giu],
  ['direction', /\b(?:higher|lower|increase[ds]?|decrease[ds]?|improve[ds]?|reduce[ds]?|outperform(?:s|ed)?|underperform(?:s|ed)?)\b|(?:高于|低于|提升|下降|增加|减少|优于|劣于)/giu],
  ['causal', /\b(?:because|therefore|thus|due\s+to|causes?|leads?\s+to)\b|(?:由于|导致|因此|所以)/giu],
  ['citation', /\[@[^\]]+\]|\\(?:cite|citep|citet|autocite|parencite|textcite)\*?(?:\[[^\]]*\])*\{[^{}]+\}|\bdoi:\s*10\.\d{4,9}\/[^\s}\]]+|https?:\/\/(?:dx\.)?doi\.org\/10\.\d{4,9}\/[^\s}\]]+|\barxiv:\s*\d{4}\.\d{4,5}(?:v\d+)?\b/giu],
  ['latex', /\\(?:label|ref|eqref|pageref|cref|Cref|autoref)\*?(?:\[[^\]]*\])?\{[^{}]+\}|\\(?:begin|end)\{[^{}]+\}|\$\$[\s\S]*?\$\$|\$[^$\n]+\$/gu],
  ['number', /(?<![\p{L}\p{N}_])\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:-|–|~|至|到)\s*\d+(?:,\d{3})*(?:\.\d+)?)?\s*(?:%|％|倍|x|×|ms|s|kg|g|mb|gb|hz|khz|mhz|年|月|日)?(?![\p{L}\p{N}_])/giu],
];

function normalizeAnchor(value) {
  return String(value)
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim()
    .toLowerCase();
}

export function extractSemanticAnchors(text = '') {
  const anchors = new Map();
  const source = String(text ?? '');

  for (const [category, pattern] of ANCHOR_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const value = normalizeAnchor(match[0]);
      const key = `${category}\u0000${value}`;
      const current = anchors.get(key);
      anchors.set(key, {
        category,
        value,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  return [...anchors.values()];
}

function anchorMap(anchors) {
  return new Map(anchors.map((anchor) => [`${anchor.category}\u0000${anchor.value}`, anchor]));
}

function findingFor(anchor, originalCount, revisedCount, language) {
  const added = revisedCount > originalCount;
  const change = added ? 'added' : 'removed';
  const changeCount = Math.abs(revisedCount - originalCount);
  const chinese = language === 'zh';
  return {
    category: 'preservation',
    dimension: chinese ? '语义保真' : 'semantic preservation',
    severity: 'IMPORTANT',
    location: chinese ? '全文' : 'document',
    problem: chinese
      ? `语义锚点“${anchor.value}”的出现次数从 ${originalCount} 变为 ${revisedCount}。`
      : `Semantic anchor "${anchor.value}" changed from ${originalCount} occurrence(s) to ${revisedCount}.`,
    quote: anchor.value,
    suggestion: chinese
      ? '确认该变化是否经过作者授权；否则恢复原有限定、事实或结构。'
      : 'Confirm that the author intended this change; otherwise restore the original qualifier, fact, or structure.',
    anchorCategory: anchor.category,
    anchor: anchor.value,
    change,
    changeCount,
    originalCount,
    revisedCount,
  };
}

export function compareSemanticPreservation(originalText = '', revisedText = '', options = {}) {
  const originalAnchors = extractSemanticAnchors(originalText);
  const revisedAnchors = extractSemanticAnchors(revisedText);
  const originalByKey = anchorMap(originalAnchors);
  const revisedByKey = anchorMap(revisedAnchors);
  const keys = new Set([...originalByKey.keys(), ...revisedByKey.keys()]);
  const findings = [];
  let preservedAnchorCount = 0;

  for (const key of keys) {
    const original = originalByKey.get(key);
    const revised = revisedByKey.get(key);
    const anchor = original ?? revised;
    const originalCount = original?.count ?? 0;
    const revisedCount = revised?.count ?? 0;
    preservedAnchorCount += Math.min(originalCount, revisedCount);
    if (originalCount !== revisedCount) {
      findings.push(findingFor(anchor, originalCount, revisedCount, options.language ?? 'en'));
    }
  }

  return {
    compared: true,
    driftDetected: findings.length > 0,
    originalAnchorCount: originalAnchors.reduce((total, anchor) => total + anchor.count, 0),
    revisedAnchorCount: revisedAnchors.reduce((total, anchor) => total + anchor.count, 0),
    preservedAnchorCount,
    findings,
  };
}
