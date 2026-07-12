import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import {
  buildFactCheckPlan,
  buildFactCheckReport,
  collectLocalEvidence,
  crossCheckEvidence,
  formatFactCheckPlan,
  formatFactCheckReport,
  normalizeWhitespace,
  validateFactCheckGate,
} from './src/fact-check.js';
import { fetchProviderEvidence } from './src/providers.js';

const EVIDENCE_STATUSES = ['SUPPORTED', 'CONTRADICTED', 'INSUFFICIENT', 'UNVERIFIABLE'];
const FINAL_VERDICTS = [...EVIDENCE_STATUSES, 'CONFLICTED'];
function textContent(text) {
  return { type: 'text', text };
}

function cwdFromContext(ctx) {
  return typeof ctx?.cwd === 'string' ? ctx.cwd : process.cwd();
}

function paramsOrEmpty(params) {
  return params && typeof params === 'object' ? params : {};
}

function resolveInputPath(path, cwd) {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

function loadInputText(input = {}, cwd = process.cwd()) {
  const hasText = typeof input.text === 'string' && input.text.trim();
  const hasPath = typeof input.path === 'string' && input.path.trim();
  if (hasText && hasPath) return { ok: false, error: 'Provide exactly one of text or path for fact checking, not both.' };
  if (hasText) return { ok: true, text: input.text, source: 'text' };
  if (!hasPath) {
    return { ok: false, error: 'Provide text or path for fact checking.' };
  }
  const filePath = resolveInputPath(input.path, cwd);
  if (!existsSync(filePath)) return { ok: false, error: `File not found: ${input.path}` };
  return { ok: true, text: readFileSync(filePath, 'utf8'), source: filePath };
}

function buildAnalyzeParameters(z) {
  return z.object({
    path: z.string().optional(),
    text: z.string().optional(),
    maxClaims: z.number().optional(),
  });
}

function buildEvidenceParameters(z) {
  const claim = buildClaimSchema(z);
  const evidence = buildEvidenceRecordSchema(z);
  return z.object({
    path: z.string().optional(),
    text: z.string().optional(),
    claims: z.array(claim).optional(),
    evidenceRecords: z.array(evidence).optional(),
    lane: z.enum(['A', 'B']).optional(),
    allowNetwork: z.boolean().optional(),
    providers: z.array(z.enum(['crossref', 'arxiv', 'openalex', 'datacite', 'google-fact-check'])).optional(),
  });
}

function buildReportParameters(z) {
  const claim = buildClaimSchema(z);
  const evidence = buildEvidenceRecordSchema(z);
  const crossCheck = z.object({
    claimId: z.string(),
    status: z.string(),
    laneA: z.string().optional(),
    laneB: z.string().optional(),
    conflicts: z.array(z.string()).optional(),
  });
  return z.object({
    claims: z.array(claim).optional(),
    evidenceRecords: z.array(evidence).optional(),
    crossChecks: z.array(crossCheck).optional(),
  });
}

function buildClaimSchema(z) {
  return z.object({
    id: z.string(),
    text: z.string(),
    category: z.string().optional(),
    priority: z.string().optional(),
    location: z.string().optional(),
    evidencePlan: z.array(z.string()).optional(),
  });
}

function buildEvidenceRecordSchema(z) {
  return z.object({
    claimId: z.string(),
    lane: z.enum(['A', 'B']).optional(),
    provider: z.string().optional(),
    status: z.enum(EVIDENCE_STATUSES),
    quote: z.string().optional(),
    source: z.string().optional(),
    reason: z.string().optional(),
  });
}

function buildGateParameters(z) {
  return z.object({
    finalOutput: z.string(),
    riskLevel: z.enum(['low', 'standard', 'high']).optional(),
  });
}

function formatEvidenceBlock(lane, records = []) {
  return [
    `FACT_EVIDENCE_${String(lane ?? 'A').toUpperCase()}`,
    ...(records.length ? records.map((record) => [
      `- ${record.claimId}: ${record.status}`,
      `  provider: ${record.provider}`,
      `  source: ${record.source || 'none'}`,
      `  quote: ${record.quote || 'none'}`,
      record.reason ? `  reason: ${record.reason}` : null,
    ].filter(Boolean).join('\n')) : ['- none']),
  ].join('\n');
}

function formatCrossCheckBlock(crossChecks = []) {
  return [
    'FACT_CROSS_CHECK',
    ...(crossChecks.length ? crossChecks.map((item) => [
      `- ${item.claimId}: ${item.status}`,
      `  laneA: ${item.laneA}`,
      `  laneB: ${item.laneB}`,
      item.conflicts?.length ? `  conflicts: ${item.conflicts.join(', ')}` : null,
    ].filter(Boolean).join('\n')) : ['- none']),
  ].join('\n');
}

export default function factCheckerExtension(omp) {
  const z = omp.zod.z;
  const workflowStateFor = createWorkflowStateResolver();

  omp.registerTool({
    name: 'fact_check_analyze',
    label: 'Fact Check Analyze',
    description: 'Extract checkable factual claims and suggest a FACT_CHECK_PLAN. Workflow telemetry is optional and never blocks later tools.',
    parameters: buildAnalyzeParameters(z),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const input = paramsOrEmpty(params);
      const workflow = workflowStateFor(ctx);
      const loaded = loadInputText(input, cwdFromContext(ctx));
      if (!loaded.ok) return { content: [textContent(loaded.error)], details: { error: loaded.error }, isError: true };
      const plan = buildFactCheckPlan({ text: loaded.text, maxClaims: input.maxClaims });
      if (workflow) {
        workflow.plan = structuredClone(plan);
        workflow.evidenceByLane = new Map();
        workflow.report = null;
      }
      return {
        content: [textContent(formatFactCheckPlan(plan))],
        details: {
          ...plan,
          source: loaded.source,
          advisoryOnly: true,
          telemetry: workflow ? 'session' : 'stateless',
        },
        isError: false,
      };
    },
  });

  omp.registerTool({
    name: 'fact_check_evidence',
    label: 'Fact Check Evidence',
    description: 'Collect local and optional provider evidence for fact-check claims. path/text derive claims only when claims are omitted; when claims are supplied, pass structured evidenceRecords. Network/API failures degrade to insufficient evidence.',
    parameters: buildEvidenceParameters(z),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const input = paramsOrEmpty(params);
      const workflow = workflowStateFor(ctx);
      const warnings = [];
      let claims = Array.isArray(input.claims) ? input.claims : [];
      if (claims.length && !isValidClaimList(claims)) {
        return errorResult('Fact-check claims must contain non-empty id and text fields.');
      }
      if (claims.length && (input.path || input.text) && !Array.isArray(input.evidenceRecords)) {
        return errorResult('When claims are provided, supply structured evidenceRecords; path/text are only used to derive claims when claims are omitted.');
      }
      if (!claims.length) {
        const loaded = loadInputText(input, cwdFromContext(ctx));
        if (!loaded.ok) return { content: [textContent(loaded.error)], details: { error: loaded.error }, isError: true };
        claims = buildFactCheckPlan({ text: loaded.text }).claims;
      }
      if (workflow?.plan && !sameClaims(workflow.plan.claims, claims)) {
        warnings.push('Evidence claims differ from the earlier session plan; the supplied claims were reviewed as a new advisory scope.');
      }
      const lane = input.lane ?? 'A';
      if (Array.isArray(input.evidenceRecords)
        && !isValidEvidenceInputList(input.evidenceRecords, claims, lane)) {
        return errorResult('Fact-check evidenceRecords require a planned claimId, the active lane, a canonical status, and non-empty source and quote for deterministic verdicts.');
      }
      const localEvidence = collectLocalEvidence({
        claims,
        evidenceRecords: input.evidenceRecords ?? [],
        lane,
      });
      const providerEvidence = await fetchProviderEvidence({
        claims,
        lane,
        allowNetwork: input.allowNetwork === true,
        providers: input.providers,
      });
      const records = mergeEvidence(localEvidence, providerEvidence);
      if (workflow?.plan && sameClaims(workflow.plan.claims, claims)) {
        workflow.evidenceByLane.set(lane, structuredClone(records));
      }
      return {
        content: [textContent(formatEvidenceBlock(lane, records))],
        details: {
          lane,
          records,
          warnings,
          advisoryOnly: true,
          telemetry: workflow ? 'session' : 'stateless',
        },
        isError: false,
      };
    },
  });

  omp.registerTool({
    name: 'fact_check_report',
    label: 'Fact Check Report',
    description: 'Build an advisory source-aware FACT_CHECK_REPORT from supplied claims and evidence. Earlier workflow telemetry is helpful but optional.',
    parameters: buildReportParameters(z),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const input = paramsOrEmpty(params);
      const workflow = workflowStateFor(ctx);
      const warnings = [];
      const claims = Array.isArray(input.claims) ? input.claims : [];
      const evidenceRecords = Array.isArray(input.evidenceRecords) ? input.evidenceRecords : [];
      if (!isValidClaimList(claims)) {
        return errorResult('Fact-check report claims must contain non-empty id and text fields.');
      }
      if (!isValidEvidenceRecordList(evidenceRecords, claims)) {
        return errorResult('Fact-check report evidenceRecords must contain valid claimId, lane, canonical status, and required source/quote fields for planned claims.');
      }
      if (!workflow?.plan || !sameClaims(workflow.plan.claims, claims)) {
        warnings.push('No matching session plan was observed; the report was built from the supplied structured claims.');
      }
      const observedEvidenceRecords = workflow ? [...workflow.evidenceByLane.values()].flat() : [];
      if (observedEvidenceRecords.length && !sameEvidenceRecords(observedEvidenceRecords, evidenceRecords)) {
        warnings.push('Supplied evidence differs from earlier session telemetry; the supplied structured records were used for this advisory report.');
      }
      const crossChecks = crossCheckEvidence({ claims, evidenceRecords });
      if (Array.isArray(input.crossChecks) && input.crossChecks.length
        && !sameCrossChecks(input.crossChecks, crossChecks)) {
        warnings.push('Supplied crossChecks differed from the deterministic result and were ignored.');
      }
      if (!isValidCrossCheckList(crossChecks, claims)) {
        return errorResult('Fact-check crossChecks must contain one valid structured result for every planned claim.');
      }
      const report = buildFactCheckReport({ claims, evidenceRecords, crossChecks });
      if (workflow) workflow.report = structuredClone({ report, crossChecks, evidenceRecords });
      return {
        content: [textContent(`${formatCrossCheckBlock(crossChecks)}\n\n${formatFactCheckReport(report)}`)],
        details: {
          ...report,
          crossChecks,
          warnings,
          advisoryOnly: true,
          telemetry: workflow ? 'session' : 'stateless',
        },
        isError: false,
      };
    },
  });

  omp.registerTool({
    name: 'fact_check_gate',
    label: 'Fact Check Review',
    description: 'Compatibility alias for an advisory completeness review. It reports missing or inconsistent evidence but never blocks tools or session completion.',
    parameters: buildGateParameters(z),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const input = paramsOrEmpty(params);
      const workflow = workflowStateFor(ctx);
      const riskLevel = workflow?.plan?.riskLevel ?? input.riskLevel ?? 'standard';
      const textual = validateFactCheckGate({ ...input, riskLevel });
      const observed = workflow
        ? validateObservedWorkflow({ workflow, finalOutput: input.finalOutput, riskLevel })
        : {
          missingObserved: ['session workflow telemetry unavailable'],
          summary: { telemetry: 'stateless' },
        };
      const complete = textual.ok && observed.missingObserved.length === 0;
      const result = {
        ...textual,
        ok: complete,
        complete,
        advisoryOnly: true,
        missingObserved: observed.missingObserved,
        observed: observed.summary,
      };
      const report = complete
        ? 'Fact-check advisory review: ready.'
        : `Fact-check advisory review: needs attention (${[...result.missing, ...result.missingObserved].join(', ')}).`;
      return {
        content: [textContent(report)],
        details: result,
        isError: false,
      };
    },
  });

  omp.registerCommand('fact-check', {
    description: 'Run fact-check claim analysis for a document path or inline text.',
    async handler(args, ctx) {
      const input = parseCommandArgs(typeof args === 'string' ? args : '');
      const loaded = loadInputText(input, cwdFromContext(ctx));
      if (!loaded.ok) return { ok: false, report: loaded.error };
      const plan = buildFactCheckPlan({ text: loaded.text });
      const report = formatFactCheckPlan(plan);
      ctx.ui?.notify?.(report, 'info');
      return { ok: true, report, details: plan };
    },
  });
}

function createWorkflowStateResolver() {
  const objectStates = new WeakMap();
  const sessionStates = new Map();
  return (ctx = {}) => {
    const owner = ctx?.sessionManager;
    if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return null;
    const sessionId = stableSessionId(owner);
    if (sessionId) {
      if (!sessionStates.has(sessionId)) sessionStates.set(sessionId, emptyWorkflowState());
      return sessionStates.get(sessionId);
    }
    if (!objectStates.has(owner)) objectStates.set(owner, emptyWorkflowState());
    return objectStates.get(owner);
  };
}

function stableSessionId(owner) {
  try {
    const value = owner?.getSessionId?.();
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  } catch {
    return '';
  }
}

function emptyWorkflowState() {
  return { plan: null, evidenceByLane: new Map(), report: null };
}

function errorResult(message) {
  return {
    content: [textContent(message)],
    details: { error: message },
    isError: true,
  };
}

function isValidClaimList(claims) {
  return Array.isArray(claims) && claims.length > 0 && claims.every((claim) => (
    claim && typeof claim === 'object'
    && typeof claim.id === 'string' && claim.id.trim()
    && typeof claim.text === 'string' && claim.text.trim()
  ));
}

function sameClaims(expected = [], observed = []) {
  if (!isValidClaimList(expected) || !isValidClaimList(observed) || expected.length !== observed.length) return false;
  return expected.every((claim, index) => (
    claim.id === observed[index]?.id
    && normalizeWhitespace(claim.text) === normalizeWhitespace(observed[index]?.text)
  ));
}

function isValidEvidenceRecordList(records, claims) {
  const claimIds = new Set(claims.map((claim) => claim.id));
  return Array.isArray(records) && records.every((record) => (
    record && typeof record === 'object'
    && claimIds.has(record.claimId)
    && ['A', 'B'].includes(String(record.lane ?? '').toUpperCase())
    && isCanonicalEvidenceStatus(record.status)
    && evidenceHasRequiredCitation(record)
  ));
}

function isValidEvidenceInputList(records, claims, lane) {
  const claimIds = new Set(claims.map((claim) => claim.id));
  return records.every((record) => {
    const recordLane = String(record?.lane ?? lane).toUpperCase();
    return record && typeof record === 'object'
      && claimIds.has(record.claimId)
      && recordLane === lane
      && isCanonicalEvidenceStatus(record.status)
      && evidenceHasRequiredCitation(record);
  });
}

function isCanonicalEvidenceStatus(status) {
  return EVIDENCE_STATUSES.includes(String(status ?? ''));
}

function evidenceHasRequiredCitation(record = {}) {
  const status = String(record.status ?? '');
  if (status !== 'SUPPORTED' && status !== 'CONTRADICTED') return true;
  return typeof record.source === 'string' && Boolean(record.source.trim())
    && typeof record.quote === 'string' && Boolean(record.quote.trim());
}

function isValidCrossCheckList(crossChecks, claims) {
  const claimIds = new Set(claims.map((claim) => claim.id));
  return Array.isArray(crossChecks)
    && crossChecks.length === claims.length
    && new Set(crossChecks.map((item) => item?.claimId)).size === claims.length
    && crossChecks.every((item) => item && claimIds.has(item.claimId)
      && ['AGREED', 'CONFLICTED', 'PARTIAL', 'INSUFFICIENT', 'UNVERIFIABLE'].includes(item.status));
}

function sameEvidenceRecords(expected = [], observed = []) {
  const normalize = (record) => JSON.stringify({
    claimId: record?.claimId ?? '',
    lane: String(record?.lane ?? '').toUpperCase(),
    provider: record?.provider ?? '',
    status: String(record?.status ?? '').toUpperCase(),
    quote: normalizeWhitespace(record?.quote ?? ''),
    source: normalizeWhitespace(record?.source ?? ''),
    reason: normalizeWhitespace(record?.reason ?? ''),
  });
  const left = expected.map(normalize).sort();
  const right = observed.map(normalize).sort();
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function sameCrossChecks(expected = [], observed = []) {
  const normalize = (item) => JSON.stringify({
    claimId: item?.claimId ?? '',
    status: item?.status ?? '',
    laneA: item?.laneA ?? '',
    laneB: item?.laneB ?? '',
    conflicts: [...(item?.conflicts ?? [])].sort(),
  });
  const left = expected.map(normalize).sort();
  const right = observed.map(normalize).sort();
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function validateObservedWorkflow({ workflow, finalOutput = '', riskLevel = 'standard' } = {}) {
  const missingObserved = [];
  const planClaims = workflow?.plan?.claims ?? [];
  const laneA = workflow?.evidenceByLane?.get('A') ?? [];
  const laneB = workflow?.evidenceByLane?.get('B') ?? [];
  const report = workflow?.report?.report;
  const crossChecks = workflow?.report?.crossChecks ?? [];
  if (!isValidClaimList(planClaims)) missingObserved.push('host FACT_CHECK_PLAN');
  if (!laneCoversClaims(laneA, planClaims)) missingObserved.push('host FACT_EVIDENCE_A');
  if (riskLevel !== 'low' && !laneCoversClaims(laneB, planClaims)) missingObserved.push('host FACT_EVIDENCE_B');
  if (!isValidCrossCheckList(crossChecks, planClaims)) missingObserved.push('host FACT_CROSS_CHECK');
  if (!report || !Array.isArray(report.results) || report.results.length !== planClaims.length) {
    missingObserved.push('host FACT_CHECK_REPORT');
  } else if (!finalVerdictsMatchReport(finalOutput, report.results)) {
    missingObserved.push('final verdicts matching host FACT_CHECK_REPORT');
  }
  return {
    missingObserved,
    summary: {
      plannedClaims: planClaims.length,
      laneAClaims: laneA.length,
      laneBClaims: laneB.length,
      reportedClaims: Array.isArray(report?.results) ? report.results.length : 0,
    },
  };
}

function laneCoversClaims(records = [], claims = []) {
  const ids = new Set(records.map((record) => record?.claimId));
  return claims.length > 0 && claims.every((claim) => ids.has(claim.id));
}

function finalVerdictsMatchReport(finalOutput = '', results = []) {
  const text = String(finalOutput);
  return results.every(({ claimId, verdict }) => {
    const id = escapeRegex(claimId);
    const verdicts = FINAL_VERDICTS.map(escapeRegex).join('|');
    const occurrence = new RegExp(
      '^\\s*(?:[-*]\\s*)?' + id + '\\s*:\\s*(' + verdicts + ')\\b.*$',
      'i',
    );
    const canonical = new RegExp(
      '^\\s*(?:[-*]\\s*)?' + id + '\\s*:\\s*(' + verdicts + ')\\s*$',
      'i',
    );
    let section = '';
    const occurrences = [];
    for (const line of text.split(/\r?\n/u)) {
      const header = factCheckSectionHeader(line);
      if (header) {
        section = header;
        continue;
      }
      if (['FACT_EVIDENCE_A', 'FACT_EVIDENCE_B', 'FACT_CROSS_CHECK'].includes(section)) continue;
      const match = occurrence.exec(line);
      if (!match) continue;
      occurrences.push({
        verdict: match[1].toUpperCase(),
        canonical: canonical.test(line),
      });
    }
    return occurrences.length === 1
      && occurrences[0].canonical
      && occurrences[0].verdict === verdict;
  });
}

function factCheckSectionHeader(line = '') {
  const normalized = String(line)
    .trim()
    .replace(/^#+\s*/u, '')
    .replace(/\*/gu, '')
    .trim()
    .toUpperCase();
  return /^FACT_(?:CHECK_PLAN|EVIDENCE_[AB]|CROSS_CHECK|REVIEW|CHECK_REPORT|CHECK_USAGE)$/u.test(normalized)
    ? normalized
    : '';
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mergeEvidence(localEvidence = [], providerEvidence = []) {
  const byClaim = new Map();
  for (const record of [...localEvidence, ...providerEvidence]) {
    const key = `${record.claimId}:${record.lane}`;
    const current = byClaim.get(key);
    if (!current || evidenceRank(record.status) > evidenceRank(current.status)) byClaim.set(key, record);
  }
  return [...byClaim.values()];
}

function evidenceRank(status = '') {
  return { CONTRADICTED: 4, SUPPORTED: 3, UNVERIFIABLE: 2, INSUFFICIENT: 1 }[String(status).toUpperCase()] ?? 0;
}

function parseCommandArgs(args = '') {
  const tokens = args.trim().split(/\s+/u).filter(Boolean);
  const input = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--max') {
      const value = Number(tokens[index + 1]);
      if (Number.isFinite(value)) input.maxClaims = value;
      index += 1;
      continue;
    }
    if (!input.path) input.path = token;
  }
  if (!input.path && args.trim()) input.text = args.trim();
  return input;
}

export {
  buildFactCheckPlan,
  buildFactCheckReport,
  collectLocalEvidence,
  crossCheckEvidence,
  formatFactCheckPlan,
  formatFactCheckReport,
  validateFactCheckGate,
};
