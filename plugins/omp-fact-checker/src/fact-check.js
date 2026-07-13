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
const CURRENT_CLAIM_PATTERN = /\b(?:currently|current|latest|today|now|presently|as of)\b|(?:当前|目前|最新|现在|今天|截至|现任|本年度)/iu;

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
      freshnessRequirement: freshnessRequirementFor(segment.text),
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
      `  freshness-requirement: ${claim.freshnessRequirement ?? 'NOT_APPLICABLE'}`,
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
    const laneARecords = lanes.get('A') ?? [];
    const laneBRecords = lanes.get('B') ?? [];
    const laneA = strongestStatus(laneARecords);
    const laneB = strongestStatus(laneBRecords);
    const conflicts = conflictFields(laneARecords, laneBRecords, claim);
    const baseStatus = crossCheckStatus(laneA, laneB);
    return {
      claimId: claim.id,
      status: conflicts.length > 0 && baseStatus === 'AGREED' ? 'CONFLICTED' : baseStatus,
      laneA,
      laneB,
      conflicts,
      findings: hasStaleFinding(records) ? ['STALE_EVIDENCE'] : [],
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
    const strict = strictClaimAssessment({ claim, evidenceRecords: records, crossCheck: cross });
    return {
      claimId: claim.id,
      claim: claim.text,
      category: claim.category,
      priority: claim.priority,
      verdict,
      strictVerdict: strict.verdict,
      strictReasons: strict.reasons,
      crossCheck: cross?.status ?? 'NOT_RUN',
      evidence: records.map((record) => ({
        lane: record.lane,
        provider: record.provider,
        status: record.status,
        source: record.source,
        quote: record.quote,
        evidenceType: record.evidenceType,
        freshness: record.freshness,
        requirementsMet: record.requirementsMet,
        sourceLineage: record.sourceLineage,
        observed: record.observed,
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
    `Strict supported: ${summary.strictSupported ?? results.filter((item) => item.strictVerdict === 'SUPPORTED').length}`,
    `Strict unresolved: ${summary.strictUnresolved ?? results.filter((item) => item.strictVerdict !== 'SUPPORTED').length}`,
    '',
    ...results.flatMap((result) => [
      `- ${result.claimId}: ${result.verdict}`,
      `  strict-verdict: ${result.strictVerdict ?? result.verdict}`,
      ...(result.strictReasons?.length ? [`  strict-reasons: ${result.strictReasons.join('; ')}`] : []),
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

function freshnessRequirementFor(text = '') {
  return CURRENT_CLAIM_PATTERN.test(text) ? 'CURRENT' : 'NOT_APPLICABLE';
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
    evidenceType: normalizeEvidenceType(record.evidenceType),
    freshness: normalizeFreshness(record.freshness),
    requirementsMet: record.requirementsMet === true,
    sourceLineage: normalizeWhitespace(record.sourceLineage ?? ''),
  };
}

function normalizeEvidenceType(value) {
  const normalized = String(value ?? '').toLowerCase();
  return ['passage', 'table', 'dataset', 'metadata'].includes(normalized) ? normalized : '';
}

function normalizeFreshness(value) {
  const normalized = String(value ?? '').toUpperCase();
  return ['CURRENT', 'STALE', 'UNKNOWN', 'NOT_APPLICABLE'].includes(normalized) ? normalized : '';
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

function conflictFields(a = [], b = [], claim = {}) {
  if (!a.length || !b.length) return [];
  const conflicts = [];
  const fields = ['value', 'number', 'unit', 'date', 'version', 'effectiveDate'];
  if (claim.category === 'citation') fields.push('title', 'year', 'doi');
  for (const field of fields) {
    const left = comparableFieldValues(a, field);
    const right = comparableFieldValues(b, field);
    if (left.size && right.size && (
      [...left].some((value) => !right.has(value))
      || [...right].some((value) => !left.has(value))
    )) conflicts.push(field);
  }
  return conflicts;
}

function comparableFieldValues(records = [], field = '') {
  return new Set(records
    .map((item) => item.observed?.[field] ?? item[field])
    .filter((value) => value !== undefined && value !== null && value !== '')
    .map((value) => field === 'doi'
      ? normalizeDoi(value)
      : normalizeWhitespace(value).toLowerCase()));
}

function finalVerdict(strongest, cross) {
  if (cross?.status === 'CONFLICTED') return 'CONFLICTED';
  if (strongest === 'SUPPORTED') return 'SUPPORTED';
  if (strongest === 'CONTRADICTED') return 'CONTRADICTED';
  if (strongest === 'UNVERIFIABLE') return 'UNVERIFIABLE';
  return 'INSUFFICIENT';
}

export function strictClaimVerdict(input = {}) {
  return strictClaimAssessment(input).verdict;
}

function strictClaimAssessment({ claim = {}, evidenceRecords = [], crossCheck } = {}) {
  const strongest = strongestStatus(evidenceRecords);
  const compatibilityVerdict = finalVerdict(strongest, crossCheck);
  if (compatibilityVerdict === 'CONFLICTED' || crossCheck?.status === 'CONFLICTED') {
    return { verdict: 'CONFLICTED', reasons: ['independent evidence conflicts'] };
  }
  if (hasStaleFinding(evidenceRecords, crossCheck)) {
    return { verdict: 'INSUFFICIENT', reasons: ['stale evidence cannot strictly support a current claim'] };
  }
  if (compatibilityVerdict === 'CONTRADICTED') {
    const contradicted = evidenceRecords.filter((record) => normalizeEvidenceStatus(record.status) === 'CONTRADICTED');
    const directContradicted = contradicted.filter(hasDirectClaimEvidence);
    if (!everyClaimedLaneHasDirectEvidence(contradicted, directContradicted)) {
      return { verdict: 'INSUFFICIENT', reasons: ['a contradiction lane lacks a supporting passage, table, or dataset'] };
    }
    if (!freshnessRequirementSatisfied(claim, directContradicted)) {
      return { verdict: 'INSUFFICIENT', reasons: ['current evidence is required for this time-sensitive claim'] };
    }
    return { verdict: 'CONTRADICTED', reasons: [] };
  }
  if (compatibilityVerdict === 'UNVERIFIABLE') {
    return { verdict: 'UNVERIFIABLE', reasons: [] };
  }
  if (compatibilityVerdict !== 'SUPPORTED') {
    return { verdict: 'INSUFFICIENT', reasons: ['no supporting evidence'] };
  }
  if (crossCheck?.status !== 'AGREED') {
    return {
      verdict: 'INSUFFICIENT',
      reasons: [crossCheck?.status === 'PARTIAL'
        ? 'only one evidence lane has usable support'
        : 'independent cross-check agreement is missing'],
    };
  }

  const supported = evidenceRecords.filter((record) => normalizeEvidenceStatus(record.status) === 'SUPPORTED');
  const directEvidence = supported.filter(hasDirectClaimEvidence);
  if (!everyClaimedLaneHasDirectEvidence(supported, directEvidence)) {
    return {
      verdict: 'INSUFFICIENT',
      reasons: ['a supporting lane lacks a passage, table, or dataset that directly supports the claim'],
    };
  }
  if (new Set(directEvidence.map(evidenceLane)).size < 2) {
    return { verdict: 'INSUFFICIENT', reasons: ['independent direct-evidence lane agreement is missing'] };
  }
  if (!freshnessRequirementSatisfied(claim, directEvidence)) {
    return { verdict: 'INSUFFICIENT', reasons: ['current evidence is required for this time-sensitive claim'] };
  }

  const evidencePlan = Array.isArray(claim.evidencePlan) ? claim.evidencePlan.filter(Boolean) : [];
  if (evidencePlan.length > 0 && !directEvidence.some((record) => record.requirementsMet === true)) {
    return {
      verdict: 'INSUFFICIENT',
      reasons: ['preplanned evidence requirements are not explicitly satisfied'],
    };
  }

  if (evidencePlan.some((requirement) => /independent/iu.test(String(requirement)))) {
    const lineages = new Set(directEvidence
      .map((record) => normalizeWhitespace(record.sourceLineage || record.source))
      .filter(Boolean));
    if (lineages.size < 2) {
      return {
        verdict: 'INSUFFICIENT',
        reasons: ['the evidence plan requires independent sources'],
      };
    }
  }

  return { verdict: 'SUPPORTED', reasons: [] };
}

function everyClaimedLaneHasDirectEvidence(records = [], directRecords = []) {
  const claimedLanes = new Set(records.map(evidenceLane));
  const directLanes = new Set(directRecords.map(evidenceLane));
  return claimedLanes.size > 0 && [...claimedLanes].every((lane) => directLanes.has(lane));
}

function evidenceLane(record = {}) {
  return String(record.lane ?? 'A').toUpperCase();
}

function freshnessRequirementSatisfied(claim = {}, records = []) {
  const requirement = String(claim.freshnessRequirement ?? '').toUpperCase();
  const needsCurrent = requirement === 'CURRENT'
    || (!requirement && CURRENT_CLAIM_PATTERN.test(String(claim.text ?? '')));
  return !needsCurrent || (records.length > 0
    && records.every((record) => normalizeFreshness(record.freshness) === 'CURRENT'));
}

function hasDirectClaimEvidence(record = {}) {
  return ['passage', 'table', 'dataset'].includes(normalizeEvidenceType(record.evidenceType))
    && Boolean(normalizeWhitespace(record.source))
    && Boolean(normalizeWhitespace(record.quote));
}

function hasStaleFinding(records = [], crossCheck = {}) {
  if (String(crossCheck?.status ?? '').toUpperCase() === 'STALE') return true;
  const findings = Array.isArray(crossCheck?.findings) ? crossCheck.findings : [];
  if (findings.some((finding) => /\bstale\b|outdated|superseded/iu.test(String(finding)))) return true;
  return records.some((record) => (
    normalizeFreshness(record?.freshness) === 'STALE'
    || record?.stale === true
    || (Array.isArray(record?.findings)
      && record.findings.some((finding) => /\bstale\b|outdated|superseded/iu.test(String(finding))))
  ));
}

function summarizeResults(results = []) {
  return {
    supported: results.filter((item) => item.verdict === 'SUPPORTED').length,
    contradicted: results.filter((item) => item.verdict === 'CONTRADICTED' || item.verdict === 'CONFLICTED').length,
    insufficient: results.filter((item) => item.verdict === 'INSUFFICIENT').length,
    unverifiable: results.filter((item) => item.verdict === 'UNVERIFIABLE').length,
    strictSupported: results.filter((item) => item.strictVerdict === 'SUPPORTED').length,
    strictUnresolved: results.filter((item) => item.strictVerdict !== 'SUPPORTED').length,
  };
}
