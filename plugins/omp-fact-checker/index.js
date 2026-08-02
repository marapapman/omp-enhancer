import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import {
  buildFactCheckPlan,
  buildFactCheckReport,
  collectLocalEvidence,
  crossCheckEvidence,
  FACT_ASSESSMENT_CONTRACT,
  formatCanonicalTuple,
  formatFactCheckPlan,
  formatFactCheckReport,
  isValidClaimTuple,
  isValidCountercheck,
  isValidEvidenceTuple,
  isValidLimitation,
  isValidStrength,
  normalizeWhitespace,
  strictClaimVerdict,
  validateFactCheckReview,
} from './src/fact-check.js';
import { fetchProviderEvidence } from './src/providers.js';
import { withToolErrorHandling } from './src/tool-error-utils.js';

const EVIDENCE_STATUSES = ['SUPPORTED', 'CONTRADICTED', 'INSUFFICIENT', 'UNVERIFIABLE'];
const FINAL_VERDICTS = [...EVIDENCE_STATUSES, 'CONFLICTED'];
// finalOutput claim-verdict aliases: the claim-verdict layer may write these
// tokens; they are normalized to the canonical report vocabulary before the
// strict comparison against structured report verdicts.
const FINAL_OUTPUT_VERDICT_ALIASES = Object.freeze({ LOCAL_UNVERIFIED: 'UNVERIFIABLE' });
const CLAIM_VERDICT_TOKENS = [...FINAL_VERDICTS, ...Object.keys(FINAL_OUTPUT_VERDICT_ALIASES)];
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
  try {
    return { ok: true, text: readFileSync(filePath, 'utf8'), source: filePath };
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: false, error: `File not found: ${input.path}` };
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Unable to read ${input.path}: ${message}` };
  }
}

function buildAnalyzeParameters(z) {
  return z.object({
    path: z.string().optional().describe('File path to the text to analyze. Provide exactly one of text or path. Example: "/path/to/document.txt".'),
    text: z.string().optional().describe('Inline text to analyze for fact-check claims. Provide exactly one of text or path. Example: "The sky is blue because of Rayleigh scattering."'),
    maxClaims: z.number().optional().describe('Maximum number of claims to extract. Limits the plan scope. Example: 10.'),
  });
}

function buildEvidenceParameters(z) {
  const claim = buildClaimSchema(z);
  const evidence = buildEvidenceRecordSchema(z);
  return z.object({
    path: z.string().optional().describe('File path to derive claims when claims are not supplied explicitly. Example: "/path/to/document.txt".'),
    text: z.string().optional().describe('Inline text to derive claims when claims are not supplied explicitly. Example: "The Eiffel Tower is 330 meters tall."'),
    claims: z.array(claim).optional().describe('Fact-check claims with id/text fields. Use results from fact_check_analyze. When supplied, evidenceRecords should also be provided.'),
    evidenceRecords: z.array(evidence).optional().describe('Pre-collected evidence records keyed by claimId. Each record requires claimId, lane, and a canonical status.'),
    lane: z.enum(['A', 'B']).optional().describe('Evidence lane identifier for structured multi-observer fact-checking. Example: "A".'),
    allowNetwork: z.boolean().optional().describe('Allow network access to fetch provider evidence. Set to true only when network access is authorized. Example: false.'),
    providers: z.array(z.enum(['crossref', 'arxiv', 'openalex', 'datacite', 'google-fact-check'])).optional().describe('External evidence providers to query. Only used when allowNetwork is true. Example: ["crossref", "arxiv"].'),
  });
}

function buildReportParameters(z) {
  const claim = buildClaimSchema(z);
  const evidence = buildEvidenceRecordSchema(z);
  const crossCheck = z.object({
    claimId: z.string().describe('The ID of the claim being cross-checked.'),
    status: z.string().describe('Cross-check status: AGREED, CONFLICTED, PARTIAL, INSUFFICIENT, or UNVERIFIABLE.'),
    laneA: z.string().optional().describe('First evidence lane for comparison. Example: "A".'),
    laneB: z.string().optional().describe('Second evidence lane for comparison. Example: "B".'),
    conflicts: z.array(z.string()).optional().describe('List of specific points of conflict between lanes. Example: ["source_disagrees_on_date"].'),
    findings: z.array(z.string()).optional().describe('Additional findings from the cross-check analysis. Example: ["both_lanes_agree_on_outcome"].'),
  });
  return z.object({
    claims: z.array(claim).optional().describe('Fact-check claims with id/text fields. Use results from fact_check_analyze.'),
    evidenceRecords: z.array(evidence).optional().describe('Evidence records keyed by claimId, from fact_check_evidence output.'),
    crossChecks: z.array(crossCheck).optional().describe('Pre-built cross-check results. If omitted, cross-checks are computed deterministically from claims and evidenceRecords.'),
  });
}

function buildClaimSchema(z) {
  return z.object({
    id: z.string().describe('Unique identifier for the claim. Example: "claim-1".'),
    text: z.string().describe('The factual assertion text to be checked. Example: "The sky is blue because of Rayleigh scattering.".'),
    category: z.string().optional().describe('Optional category label for the claim. Example: "science".'),
    priority: z.string().optional().describe('Optional priority level. Example: "high".'),
    location: z.string().optional().describe('Optional location context for the claim. Example: "Paris".'),
    evidencePlan: z.array(z.string()).optional().describe('Optional list of evidence sources to consult. Example: ["crossref", "arxiv"].'),
    freshnessRequirement: z.enum(['CURRENT', 'NOT_APPLICABLE']).optional().describe('Freshness requirement for evidence. Use CURRENT when the claim requires up-to-date sources. Example: "CURRENT".'),
    claimTuple: buildCanonicalTupleSchema(z).optional().describe('Canonical structured tuple representing the claim in subject-predicate-object form.'),
  });
}

function buildEvidenceRecordSchema(z) {
  return z.object({
    claimId: z.string().describe('The claim ID this evidence supports or contradicts. Must match a claim id from fact_check_analyze. Example: "claim-1".'),
    lane: z.enum(['A', 'B']).optional().describe('Evidence lane identifier for multi-observer fact-checking. Example: "A".'),
    provider: z.string().optional().describe('Provider name for the evidence source. Example: "crossref".'),
    status: z.enum(EVIDENCE_STATUSES).describe('Evidence status: SUPPORTED, CONTRADICTED, INSUFFICIENT, or UNVERIFIABLE. Example: "SUPPORTED".'),
    quote: z.string().optional().describe('Direct quote from the source supporting the evidence. Example: "The Eiffel Tower is 330 meters tall.".'),
    source: z.string().optional().describe('Source URL or citation for the evidence. Example: "https://example.com/source".'),
    reason: z.string().optional().describe('Explanation of why this status was assigned. Example: "Source confirms the measurement.".'),
    evidenceType: z.enum(['passage', 'table', 'dataset', 'metadata']).optional().describe('Type of evidence source. Example: "passage".'),
    freshness: z.enum(['CURRENT', 'STALE', 'UNKNOWN', 'NOT_APPLICABLE']).optional().describe('Freshness assessment of the evidence source. Example: "CURRENT".'),
    requirementsMet: z.boolean().optional().describe('Whether the evidence satisfies the evidence plan requirements. Example: true.'),
    sourceLineage: z.string().optional().describe('Provenance chain for the evidence source. Example: "primary -> secondary".'),
    observed: z.any().optional().describe('Raw observed data or metadata from the evidence collection process.'),
    evidenceTuple: z.object({
      ...buildCanonicalTupleShape(z),
      relation: z.enum(FACT_ASSESSMENT_CONTRACT.tupleRelations).describe('Relation between the canonical tuple fields: ENTAILS, NEGATES, ADJACENT, or UNKNOWN. Example: "ENTAILS".'),
      negatedField: z.enum(FACT_ASSESSMENT_CONTRACT.negatedFields).optional().describe('Field that is negated in this evidence, if applicable. Example: "OBJECT_VALUE".'),
    }).optional().describe('Canonical structured evidence tuple with relation assessment.'),
    strength: z.enum(FACT_ASSESSMENT_CONTRACT.strengths).optional().describe('Strength of the evidence: PROVEN, DISPROVED, LIKELY, or HYPOTHESIS. Example: "PROVEN".'),
    limitation: z.object({
      level: z.enum(FACT_ASSESSMENT_CONTRACT.limitationLevels).describe('Limitation severity: NONE, NON_MATERIAL, or MATERIAL. Example: "NON_MATERIAL".'),
      reason: z.string().optional().describe('Explanation of the limitation. Example: "Single source only.".'),
    }).optional().describe('Optional limitation assessment for this evidence record.'),
    countercheck: z.object({
      status: z.enum(FACT_ASSESSMENT_CONTRACT.countercheckStatuses).describe('Countercheck status: NOT_REQUIRED, COMPLETED, INCONCLUSIVE, or UNAVAILABLE. Example: "COMPLETED".'),
      outcome: z.enum(FACT_ASSESSMENT_CONTRACT.countercheckOutcomes).describe('Countercheck outcome: NOT_APPLICABLE, NO_DISCONFIRMING_EVIDENCE, DISCONFIRMING_EVIDENCE, or NO_RESULT. Example: "NO_DISCONFIRMING_EVIDENCE".'),
      note: z.string().optional().describe('Optional note about the countercheck result. Example: "Verified against original source.".'),
    }).optional().describe('Optional countercheck verification for this evidence record.'),
  });
}

function buildCanonicalTupleSchema(z) {
  return z.object(buildCanonicalTupleShape(z));
}

function buildCanonicalTupleShape(z) {
  const tupleField = () => z.object({
    value: z.string().describe('The canonical string value for this tuple field. Example: "sky".'),
    materiality: z.enum(FACT_ASSESSMENT_CONTRACT.tupleMaterialities).describe('Materiality level for this field: MATERIAL, or NOT_APPLICABLE. Example: "MATERIAL".'),
  });
  return {
    subject: tupleField(),
    basePredicate: tupleField(),
    objectValue: tupleField(),
    scope: tupleField(),
    timeVersion: tupleField(),
    quantifier: tupleField(),
  };
}

function buildReviewParameters(z) {
  return z.object({
    finalOutput: z.string().describe('The final fact-check report text to review for consistency and completeness. Example: "FACT_EVIDENCE_A\n- claim-1: SUPPORTED\n  source: example.com".'),
    riskLevel: z.enum(['low', 'standard', 'high']).optional().describe('Risk level context for the review evaluation. Example: "standard".'),
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
      record.evidenceType ? `  evidence-type: ${record.evidenceType}` : null,
      record.freshness ? `  freshness: ${record.freshness}` : null,
      record.requirementsMet === true ? '  evidence-plan: satisfied' : null,
      record.sourceLineage ? `  source-lineage: ${record.sourceLineage}` : null,
      record.evidenceTuple ? `  evidence-tuple: ${formatCanonicalTuple(record.evidenceTuple)}` : null,
      record.evidenceTuple?.relation ? `  relation: ${record.evidenceTuple.relation}` : null,
      record.evidenceTuple?.negatedField ? `  negated-field: ${record.evidenceTuple.negatedField}` : null,
      record.strength ? `  evidence-strength: ${record.strength}` : null,
      record.limitation ? `  limitation: ${record.limitation.level}${record.limitation.reason ? ` - ${record.limitation.reason}` : ''}` : null,
      record.countercheck ? `  countercheck: ${record.countercheck.status}/${record.countercheck.outcome}${record.countercheck.note ? ` - ${record.countercheck.note}` : ''}` : null,
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
      item.findings?.length ? `  findings: ${item.findings.join(', ')}` : null,
    ].filter(Boolean).join('\n')) : ['- none']),
  ].join('\n');
}

export default function factCheckerExtension(omp) {
  const z = omp.zod.z;
  const workflowStateFor = createWorkflowStateResolver();

  omp.on?.('session_stop', async (_event = {}, ctx = {}) => {
    workflowStateFor.clear(ctx);
  });

  omp.registerTool({
    name: 'fact_check_analyze',
    label: 'Fact Check Analyze',
    description: 'Extract checkable factual claims and suggest a FACT_CHECK_PLAN. Workflow telemetry is optional and never blocks later tools.',
    defaultInactive: true,
    approval: 'read',
    promptSnippet: 'Extract checkable claims from text and build a fact-check plan.',
    promptGuidelines: ['Pass either text or path (not both).', 'Set maxClaims to limit the number of claims extracted.', 'Returns advisory plan data; does not verify claims itself.'],
    parameters: buildAnalyzeParameters(z),
    execute: withToolErrorHandling('fact_check_analyze', async (_toolCallId, params, _signal, _onUpdate, ctx) => {
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
    }),
  });

  omp.registerTool({
    name: 'fact_check_evidence',
    label: 'Fact Check Evidence',
    description: 'Collect local and optional provider evidence for fact-check claims. path/text derive claims only when claims are omitted; when claims are supplied, pass structured evidenceRecords. Network/API failures degrade to insufficient evidence.',
    defaultInactive: true,
    approval: 'read',
    promptSnippet: 'Collect evidence for planned fact-check claims.',
    promptGuidelines: ['Requires a plan from fact_check_analyze first.', 'Set allowNetwork: true only when network access is authorized.', 'Returns evidence records; does not issue verdicts.'],
    parameters: buildEvidenceParameters(z),
    execute: withToolErrorHandling('fact_check_evidence', async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const input = paramsOrEmpty(params);
      const workflow = workflowStateFor(ctx);
      const warnings = [];
      let claims = Array.isArray(input.claims) ? input.claims : [];
      if (claims.length && !isValidClaimList(claims)) {
        return errorResult('Fact-check claims must contain non-empty id/text fields and a valid claimTuple when one is supplied.');
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
        return errorResult('Fact-check evidenceRecords require a planned claimId, the active lane, a canonical status, required source/quote fields, and valid structured tuple/assessment fields when supplied.');
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
      if (workflow?.plan && sameClaimIdentities(workflow.plan.claims, claims)) {
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
    }),
  });

  omp.registerTool({
    name: 'fact_check_report',
    label: 'Fact Check Report',
    description: 'Build an advisory source-aware FACT_CHECK_REPORT from supplied claims and evidence. Earlier workflow telemetry is used only to emit comparison warnings; the supplied structured records are authoritative.',
    defaultInactive: true,
    approval: 'read',
    promptSnippet: 'Generate a verdict report from evidence records.',
    promptGuidelines: ['Requires evidence from fact_check_evidence first.', 'strictVerdict uses fail-closed logic: SUPPORTED requires ENTAILS + PROVEN.', 'Output is advisory evidence; it does not decide completion.'],
    parameters: buildReportParameters(z),
    execute: withToolErrorHandling('fact_check_report', async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const input = paramsOrEmpty(params);
      const workflow = workflowStateFor(ctx);
      const warnings = [];
      const claims = Array.isArray(input.claims) ? input.claims : [];
      const evidenceRecords = Array.isArray(input.evidenceRecords) ? input.evidenceRecords : [];
      if (!isValidClaimList(claims)) {
        return errorResult('Fact-check report claims must contain non-empty id/text fields and a valid claimTuple when one is supplied.');
      }
      if (!isValidEvidenceRecordList(evidenceRecords, claims)) {
        return errorResult('Fact-check report evidenceRecords must contain valid claimId, lane, canonical status, required source/quote fields, and valid structured tuple/assessment fields when supplied.');
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
    }),
  });

  omp.registerTool({
    name: 'fact_check_review',
    label: 'Fact Check Review',
    description: 'Review the final fact-check report text (finalOutput) against the given riskLevel and report missing or inconsistent support. Session telemetry is used only as an optional comparison source. This advisory tool never blocks tools or session completion.',
    defaultInactive: true,
    approval: 'read',
    promptSnippet: 'Review the final fact-check report text and risk level for completeness.',
    promptGuidelines: ['Pass the final fact-check report text (finalOutput) and an optional riskLevel to review.', 'Reports advisory findings; does not execute commands or block completion.', 'Use this for independent quality assurance on fact-check results.'],
    parameters: buildReviewParameters(z),
    execute: withToolErrorHandling('fact_check_review', async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const input = paramsOrEmpty(params);
      const workflow = workflowStateFor(ctx);
      const riskLevel = workflow?.plan?.riskLevel ?? input.riskLevel ?? 'standard';
      const textual = validateFactCheckReview({ ...input, riskLevel });
      const observed = workflow
        ? validateObservedWorkflow({ workflow, finalOutput: input.finalOutput, riskLevel })
        : {
          missingObserved: ['session workflow telemetry unavailable'],
          summary: { telemetry: 'stateless' },
        };
      const ready = textual.ok && observed.missingObserved.length === 0;
      const strictSupportReady = ready && observed.summary.strictUnresolved === 0;
      const result = {
        ...textual,
        ok: ready,
        ready,
        strictSupportReady,
        advisoryOnly: true,
        missingObserved: observed.missingObserved,
        observed: observed.summary,
      };
      const report = strictSupportReady
        ? 'Fact-check advisory review: workflow ready; strict factual support complete.'
        : ready
          ? `Fact-check advisory review: workflow ready; strict factual support unresolved (${observed.summary.strictUnresolved} claim(s)).`
        : `Fact-check advisory review: needs attention (${[...result.missing, ...result.missingObserved].join(', ')}).`;
      return {
        content: [textContent(report)],
        details: result,
        isError: false,
      };
    }),
  });

  omp.registerCommand('fact-check', {
    description: 'Run fact-check claim analysis for a document path or explicit --text input.',
    async handler(args, ctx) {
      const input = parseCommandArgs(typeof args === 'string' ? args : '');
      const loaded = loadInputText(input, cwdFromContext(ctx));
      if (!loaded.ok) return { ok: false, report: loaded.error };
      const plan = buildFactCheckPlan({ text: loaded.text, maxClaims: input.maxClaims });
      const report = formatFactCheckPlan(plan);
      ctx.ui?.notify?.(report, 'info');
      return { ok: true, report, details: plan };
    },
  });
}

function createWorkflowStateResolver() {
  const objectStates = new WeakMap();
  const sessionStates = new Map();
  const resolveState = (ctx = {}) => {
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

  resolveState.clear = (ctx = {}) => {
    const owner = ctx?.sessionManager;
    if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return false;
    const sessionId = stableSessionId(owner);
    return sessionId ? sessionStates.delete(sessionId) : objectStates.delete(owner);
  };

  return resolveState;
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
    && (claim.claimTuple === undefined || isValidClaimTuple(claim.claimTuple))
  ));
}

function sameClaims(expected = [], observed = []) {
  return sameClaimIdentities(expected, observed) && expected.every((claim, index) => (
    normalizeStructuredValue(claim.claimTuple) === normalizeStructuredValue(observed[index]?.claimTuple)
  ));
}

function sameClaimIdentities(expected = [], observed = []) {
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
    && evidenceAssessmentIsValid(record)
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
      && evidenceHasRequiredCitation(record)
      && evidenceAssessmentIsValid(record);
  });
}

function evidenceAssessmentIsValid(record = {}) {
  return (record.evidenceTuple === undefined || isValidEvidenceTuple(record.evidenceTuple))
    && (record.strength === undefined || isValidStrength(record.strength))
    && (record.limitation === undefined || isValidLimitation(record.limitation))
    && (record.countercheck === undefined || isValidCountercheck(record.countercheck));
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
    evidenceType: record?.evidenceType ?? '',
    freshness: record?.freshness ?? '',
    requirementsMet: record?.requirementsMet === true,
    sourceLineage: normalizeWhitespace(record?.sourceLineage ?? ''),
    evidenceTuple: normalizeStructuredValue(record?.evidenceTuple),
    strength: String(record?.strength ?? '').toUpperCase(),
    limitation: normalizeStructuredValue(record?.limitation),
    countercheck: normalizeStructuredValue(record?.countercheck),
    observed: normalizeObserved(record?.observed),
  });
  const left = expected.map(normalize).sort();
  const right = observed.map(normalize).sort();
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function normalizeStructuredValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return JSON.stringify(stableStructuredValue(value));
}

function stableStructuredValue(value) {
  if (Array.isArray(value)) return value.map(stableStructuredValue);
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' ? normalizeWhitespace(value) : value;
  }
  return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => [key, stableStructuredValue(nested)]));
}

function normalizeObserved(observed) {
  if (!observed || typeof observed !== 'object' || Array.isArray(observed)) return '';
  return JSON.stringify(Object.fromEntries(
    Object.entries(observed)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, normalizeWhitespace(value)]),
  ));
}

function sameCrossChecks(expected = [], observed = []) {
  const normalize = (item) => JSON.stringify({
    claimId: item?.claimId ?? '',
    status: item?.status ?? '',
    laneA: item?.laneA ?? '',
    laneB: item?.laneB ?? '',
    conflicts: [...(item?.conflicts ?? [])].sort(),
    findings: [...(item?.findings ?? [])].sort(),
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
  const strictUnresolvedClaimIds = Array.isArray(report?.results)
    ? report.results.filter((item) => item.strictVerdict !== 'SUPPORTED').map((item) => item.claimId)
    : [];
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
      strictSupported: Array.isArray(report?.results)
        ? report.results.filter((item) => item.strictVerdict === 'SUPPORTED').length
        : 0,
      strictUnresolved: strictUnresolvedClaimIds.length,
      strictUnresolvedClaimIds,
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
    const verdicts = CLAIM_VERDICT_TOKENS.map(escapeRegex).join('|');
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
    if (occurrences.length !== 1 || !occurrences[0].canonical) return false;
    const observed = FINAL_OUTPUT_VERDICT_ALIASES[occurrences[0].verdict] ?? occurrences[0].verdict;
    return observed === verdict;
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
  const records = [...localEvidence, ...providerEvidence];
  const nonPlaceholderLanes = new Set(records
    .filter((record) => !isEmptyLocalPlaceholder(record))
    .map((record) => `${record.claimId}:${record.lane}`));
  const seen = new Set();
  return records.filter((record) => {
    const laneKey = `${record.claimId}:${record.lane}`;
    if (isEmptyLocalPlaceholder(record) && nonPlaceholderLanes.has(laneKey)) return false;
    const fingerprint = JSON.stringify(record);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}

function isEmptyLocalPlaceholder(record = {}) {
  return record.provider === 'local'
    && record.status === 'INSUFFICIENT'
    && !normalizeWhitespace(record.source)
    && !normalizeWhitespace(record.quote)
    && record.reason === 'No local evidence record matched this claim.';
}

function parseCommandArgs(args = '') {
  let value = args.trim();
  const input = {};

  const maxMatch = value.match(/(?:^|\s)--max\s+(\d+(?:\.\d+)?)\s*$/u);
  if (maxMatch) {
    const maxClaims = Number(maxMatch[1]);
    if (Number.isFinite(maxClaims)) input.maxClaims = maxClaims;
    value = value.slice(0, maxMatch.index).trim();
  }

  if (value === '--text') input.text = '';
  else if (value.startsWith('--text ')) input.text = value.slice('--text '.length).trim();
  else if (value === '--path') input.path = '';
  else if (value.startsWith('--path ')) input.path = value.slice('--path '.length).trim();
  else if (value) input.path = value;

  return input;
}

export {
  buildFactCheckPlan,
  buildFactCheckReport,
  collectLocalEvidence,
  crossCheckEvidence,
  formatFactCheckPlan,
  formatFactCheckReport,
  strictClaimVerdict,
  validateFactCheckReview,
};
