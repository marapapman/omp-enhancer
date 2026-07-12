const DEFAULT_MAX_CLAIMS = 20;

const CLAIM_CATEGORY_RULES = [
  ['citation', /\b(?:doi|arxiv|isbn|pmid|pubmed)\b|https?:\/\/(?:dx\.)?doi\.org|arxiv\.org|\\cite|\[@/iu],
  ['date', /\b(?:19|20)\d{2}\b|(?:today|yesterday|tomorrow|currently|latest|最新|当前|目前|去年|今年|今天|昨天|明天)/iu],
  ['numeric', /\b\d+(?:\.\d+)?\s*(?:%|percent|倍|个|年|月|日|million|billion|k|m|万|亿)?\b/u],
  ['entity', /(?:公司|机构|大学|政府|标准|法律|政策|CEO|president|minister|founder|总部|成立|发布|宣布|收购|获得)/iu],
  ['causal', /(?:because|therefore|causes?|leads? to|due to|由于|因此|导致|证明|说明)/iu],
  ['comparative', /(?:best|largest|first|only|most|least|higher|lower|sota|state[- ]of[- ]the[- ]art|最佳|最大|首次|唯一|最高|最低|领先)/iu],
];

const HIGH_RISK_PATTERN = /(?:medical|clinical|health|drug|dose|legal|law|policy|financial|investment|stock|crypto|safety|security|医学|临床|药物|剂量|法律|法规|政策|金融|投资|股票|加密|安全)/iu;

export function normalizeWhitespace(value = '') {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

export function normalizeDoi(value = '') {
  return normalizeWhitespace(value).replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '').replace(/[),.;]+$/u, '').toLowerCase();
}

export function extractFactClaims({ text = '', maxClaims = DEFAULT_MAX_CLAIMS } = {}) {
  const source = String(text ?? '');
  const segments = sentenceSegments(source);
  const claims = [];

  for (const segment of segments) {
    const category = claimCategory(segment.text);
    if (!category) continue;
    const id = `FC-${String(claims.length + 1).padStart(3, '0')}`;
    claims.push({
      id,
      text: segment.text,
      category,
      priority: claimPriority(segment.text, category),
      location: segment.location,
      evidencePlan: evidencePlanFor(segment.text, category),
    });
    if (claims.length >= maxClaims) break;
  }

  return claims;
}

export function buildFactCheckPlan({ text = '', maxClaims = DEFAULT_MAX_CLAIMS } = {}) {
  const allClaims = extractFactClaims({ text, maxClaims: Number.POSITIVE_INFINITY });
  const claims = allClaims.slice(0, normalizeMaxClaims(maxClaims));
  const highPriority = allClaims.filter((claim) => claim.priority === 'high').length;
  return {
    claims,
    riskLevel: highPriority > 0 ? 'high' : allClaims.length > 2 ? 'standard' : 'low',
    requiredStages: requiredStagesFor({ claims: allClaims }),
  };
}

function normalizeMaxClaims(value) {
  if (!Number.isFinite(value)) return DEFAULT_MAX_CLAIMS;
  return Math.max(1, Math.min(DEFAULT_MAX_CLAIMS, Math.trunc(value)));
}

export function formatFactCheckPlan(plan = {}) {
  const claims = Array.isArray(plan.claims) ? plan.claims : [];
  return [
    'FACT_CHECK_PLAN',
    `Risk: ${plan.riskLevel ?? 'unknown'}`,
    'Recommended stages:',
    ...((plan.requiredStages ?? []).map((stage) => `- ${stage}`)),
    '',
    'Claims:',
    ...(claims.length ? claims.flatMap((claim) => [
      `- ${claim.id}: ${claim.text}`,
      `  category: ${claim.category}`,
      `  priority: ${claim.priority}`,
      `  evidence: ${(claim.evidencePlan ?? []).join(', ') || 'none'}`,
    ]) : ['- none']),
  ].join('\n');
}

export function collectLocalEvidence({ claims = [], evidenceRecords = [], lane = 'A' } = {}) {
  return claims.map((claim) => {
    const matches = evidenceRecords
      .filter((record) => evidenceRecordMatchesClaim(record, claim))
      .map((record) => normalizeEvidenceRecord(record, claim, lane));
    if (matches.length > 0) return matches[0];
    return {
      claimId: claim.id,
      lane,
      provider: 'local',
      status: 'INSUFFICIENT',
      quote: '',
      source: '',
      reason: 'No local evidence record matched this claim.',
    };
  });
}

export function crossCheckEvidence({ claims = [], evidenceRecords = [] } = {}) {
  return claims.map((claim) => {
    const records = evidenceRecords.filter((record) => record.claimId === claim.id);
    const lanes = new Map();
    for (const record of records) {
      const lane = String(record.lane ?? 'A').toUpperCase();
      if (!lanes.has(lane)) lanes.set(lane, []);
      lanes.get(lane).push(record);
    }
    const laneA = strongestStatus(lanes.get('A') ?? []);
    const laneB = strongestStatus(lanes.get('B') ?? []);
    return {
      claimId: claim.id,
      status: crossCheckStatus(laneA, laneB),
      laneA,
      laneB,
      conflicts: conflictFields(lanes.get('A') ?? [], lanes.get('B') ?? []),
    };
  });
}

export function buildFactCheckReport({ claims = [], evidenceRecords = [], crossChecks = [] } = {}) {
  const crossByClaim = new Map(crossChecks.map((item) => [item.claimId, item]));
  const results = claims.map((claim) => {
    const records = evidenceRecords.filter((record) => record.claimId === claim.id);
    const strongest = strongestStatus(records);
    const cross = crossByClaim.get(claim.id);
    const verdict = finalVerdict(strongest, cross);
    return {
      claimId: claim.id,
      claim: claim.text,
      category: claim.category,
      priority: claim.priority,
      verdict,
      crossCheck: cross?.status ?? 'NOT_RUN',
      evidence: records.map((record) => ({
        lane: record.lane,
        provider: record.provider,
        status: record.status,
        source: record.source,
        quote: record.quote,
      })),
    };
  });
  return { results, summary: summarizeResults(results) };
}

export function formatFactCheckReport(report = {}) {
  const results = Array.isArray(report.results) ? report.results : [];
  const summary = report.summary ?? summarizeResults(results);
  return [
    'FACT_CHECK_REPORT',
    `Supported: ${summary.supported}`,
    `Contradicted: ${summary.contradicted}`,
    `Insufficient: ${summary.insufficient}`,
    `Unverifiable: ${summary.unverifiable}`,
    '',
    ...results.flatMap((result) => [
      `- ${result.claimId}: ${result.verdict}`,
      `  claim: ${result.claim}`,
      `  cross-check: ${result.crossCheck}`,
      `  evidence: ${result.evidence.length ? result.evidence.map((item) => `${item.lane ?? '?'}:${item.provider}:${item.status}`).join('; ') : 'none'}`,
    ]),
  ].join('\n');
}

export function validateFactCheckGate({
  finalOutput = '',
  riskLevel = 'standard',
} = {}) {
  const text = String(finalOutput ?? '');
  const missing = [];
  const hasPlan = /\bFACT_CHECK_PLAN\b/i.test(text);
  const hasEvidenceA = /\bFACT_EVIDENCE_A\b/i.test(text);
  const hasEvidenceB = /\bFACT_EVIDENCE_B\b/i.test(text);
  const hasCrossCheck = /\bFACT_CROSS_CHECK\b/i.test(text);
  const hasReview = /\bFACT_REVIEW\b/i.test(text);
  const hasReport = /\bFACT_CHECK_REPORT\b/i.test(text);
  const hasUsage = /\bFACT_CHECK_USAGE\b/i.test(text);
  const degraded = /\bCROSS_CHECK_DEGRADED\b|network unavailable|api unavailable|insufficient external evidence|无法联网|api 不可用/i.test(text);

  if (!hasPlan) missing.push('FACT_CHECK_PLAN');
  if (!hasEvidenceA) missing.push('FACT_EVIDENCE_A');
  if (!hasEvidenceB && riskLevel !== 'low' && !degraded) missing.push('FACT_EVIDENCE_B or CROSS_CHECK_DEGRADED');
  if (!hasCrossCheck) missing.push('FACT_CROSS_CHECK');
  if (!hasReview) missing.push('FACT_REVIEW');
  if (!hasReport) missing.push('FACT_CHECK_REPORT');
  if (!hasUsage) missing.push('FACT_CHECK_USAGE');

  return {
    ok: missing.length === 0,
    missing,
    degraded,
  };
}

function sentenceSegments(text = '') {
  const normalized = String(text ?? '').replace(/\r\n/gu, '\n');
  const raw = normalized
    .split(/(?<=[。！？.!?])\s+|\n+/u)
    .map((item) => normalizeWhitespace(item))
    .filter((item) => item.length >= 8);
  return raw.map((item, index) => ({ text: item, location: `segment ${index + 1}` }));
}

function claimCategory(text = '') {
  for (const [category, pattern] of CLAIM_CATEGORY_RULES) {
    if (pattern.test(text)) return category;
  }
  return null;
}

function claimPriority(text = '', category = '') {
  if (HIGH_RISK_PATTERN.test(text)) return 'high';
  if (category === 'citation' || category === 'numeric' || category === 'date') return 'medium';
  return 'low';
}

function evidencePlanFor(text = '', category = '') {
  const plan = [];
  if (category === 'citation') plan.push('Crossref', 'OpenAlex', 'arXiv/PubMed/DataCite when applicable');
  if (category === 'numeric' || category === 'comparative') plan.push('primary source', 'independent secondary source');
  if (category === 'date' || category === 'entity') plan.push('official source', 'Wikidata/OpenAlex when applicable');
  if (category === 'causal') plan.push('primary study or authoritative review', 'counter-evidence search');
  if (HIGH_RISK_PATTERN.test(text)) plan.push('high-risk domain reviewer');
  return [...new Set(plan)];
}

function requiredStagesFor({ claims = [] } = {}) {
  const highRisk = claims.some((claim) => claim.priority === 'high');
  const multiClaim = claims.length > 2;
  return [
    'fact-planner',
    highRisk || multiClaim ? 'fact-researcher-a' : 'main-agent evidence pass',
    highRisk || multiClaim ? 'fact-researcher-b' : 'optional second evidence pass',
    'fact-cross-checker',
    'fact-reviewer',
  ];
}

function evidenceRecordMatchesClaim(record = {}, claim = {}) {
  if (record.claimId && record.claimId === claim.id) return true;
  const haystack = normalizeWhitespace([
    record.claim,
    record.title,
    record.quote,
    record.source,
    record.url,
  ].filter(Boolean).join(' ')).toLowerCase();
  const claimTerms = normalizeWhitespace(claim.text).toLowerCase().split(/\s+/u).filter((term) => term.length > 4);
  if (!haystack || claimTerms.length === 0) return false;
  return claimTerms.some((term) => haystack.includes(term));
}

function normalizeEvidenceRecord(record = {}, claim = {}, lane = 'A') {
  return {
    claimId: record.claimId ?? claim.id,
    lane: String(record.lane ?? lane).toUpperCase(),
    provider: record.provider ?? 'local',
    status: normalizeEvidenceStatus(record.status ?? record.verdict),
    quote: normalizeWhitespace(record.quote ?? record.title ?? ''),
    source: normalizeWhitespace(record.source ?? record.url ?? record.doi ?? ''),
    observed: record.observed,
    reason: record.reason ?? '',
  };
}

function normalizeEvidenceStatus(status = '') {
  const value = String(status ?? '').toUpperCase();
  if (['SUPPORTED', 'SUPPORTS', 'VERIFIED', 'TRUE'].includes(value)) return 'SUPPORTED';
  if (['CONTRADICTED', 'CONTRADICTS', 'MISMATCH', 'FALSE'].includes(value)) return 'CONTRADICTED';
  if (['UNVERIFIABLE', 'NOT_APPLICABLE'].includes(value)) return 'UNVERIFIABLE';
  return 'INSUFFICIENT';
}

function strongestStatus(records = []) {
  const statuses = records.map((record) => normalizeEvidenceStatus(record.status));
  if (statuses.includes('CONTRADICTED')) return 'CONTRADICTED';
  if (statuses.includes('SUPPORTED')) return 'SUPPORTED';
  if (statuses.includes('UNVERIFIABLE')) return 'UNVERIFIABLE';
  return 'INSUFFICIENT';
}

function crossCheckStatus(a, b) {
  if (a === 'INSUFFICIENT' && b === 'INSUFFICIENT') return 'INSUFFICIENT';
  if (a === 'UNVERIFIABLE' || b === 'UNVERIFIABLE') return 'UNVERIFIABLE';
  if (a !== 'INSUFFICIENT' && b !== 'INSUFFICIENT' && a !== b) return 'CONFLICTED';
  if (a === b && a !== 'INSUFFICIENT') return 'AGREED';
  return 'PARTIAL';
}

function conflictFields(a = [], b = []) {
  if (!a.length || !b.length) return [];
  const conflicts = [];
  for (const field of ['title', 'year', 'doi', 'source']) {
    const left = new Set(a.map((item) => item.observed?.[field] ?? item[field]).filter(Boolean));
    const right = new Set(b.map((item) => item.observed?.[field] ?? item[field]).filter(Boolean));
    if (left.size && right.size && [...left].some((value) => !right.has(value))) conflicts.push(field);
  }
  return conflicts;
}

function finalVerdict(strongest, cross) {
  if (cross?.status === 'CONFLICTED') return 'CONFLICTED';
  if (strongest === 'SUPPORTED') return 'SUPPORTED';
  if (strongest === 'CONTRADICTED') return 'CONTRADICTED';
  if (strongest === 'UNVERIFIABLE') return 'UNVERIFIABLE';
  return 'INSUFFICIENT';
}

function summarizeResults(results = []) {
  return {
    supported: results.filter((item) => item.verdict === 'SUPPORTED').length,
    contradicted: results.filter((item) => item.verdict === 'CONTRADICTED' || item.verdict === 'CONFLICTED').length,
    insufficient: results.filter((item) => item.verdict === 'INSUFFICIENT').length,
    unverifiable: results.filter((item) => item.verdict === 'UNVERIFIABLE').length,
  };
}
