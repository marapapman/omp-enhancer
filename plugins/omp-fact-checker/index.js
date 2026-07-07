import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import {
  buildFactCheckPlan,
  buildFactCheckReport,
  collectLocalEvidence,
  crossCheckEvidence,
  formatFactCheckPlan,
  formatFactCheckReport,
  validateFactCheckGate,
} from './src/fact-check.js';
import { fetchProviderEvidence } from './src/providers.js';

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
  if (typeof input.text === 'string' && input.text.trim()) return { ok: true, text: input.text, source: 'text' };
  if (typeof input.path !== 'string' || !input.path.trim()) {
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
  return z.object({
    path: z.string().optional(),
    text: z.string().optional(),
    claims: z.array(z.any()).optional(),
    evidenceRecords: z.array(z.any()).optional(),
    lane: z.enum(['A', 'B']).optional(),
    allowNetwork: z.boolean().optional(),
    providers: z.array(z.enum(['crossref', 'arxiv', 'openalex', 'datacite', 'google-fact-check'])).optional(),
  });
}

function buildReportParameters(z) {
  return z.object({
    claims: z.array(z.any()).optional(),
    evidenceRecords: z.array(z.any()).optional(),
    crossChecks: z.array(z.any()).optional(),
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

  omp.registerTool({
    name: 'fact_check_analyze',
    label: 'Fact Check Analyze',
    description: 'Extract checkable factual claims and produce a FACT_CHECK_PLAN before evidence collection.',
    parameters: buildAnalyzeParameters(z),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const input = paramsOrEmpty(params);
      const loaded = loadInputText(input, cwdFromContext(ctx));
      if (!loaded.ok) return { content: [textContent(loaded.error)], details: { error: loaded.error }, isError: true };
      const plan = buildFactCheckPlan({ text: loaded.text, maxClaims: input.maxClaims });
      return {
        content: [textContent(formatFactCheckPlan(plan))],
        details: { ...plan, source: loaded.source },
        isError: false,
      };
    },
  });

  omp.registerTool({
    name: 'fact_check_evidence',
    label: 'Fact Check Evidence',
    description: 'Collect local and optional provider evidence for fact-check claims. Network/API failures degrade to insufficient evidence.',
    parameters: buildEvidenceParameters(z),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const input = paramsOrEmpty(params);
      let claims = Array.isArray(input.claims) ? input.claims : [];
      if (!claims.length) {
        const loaded = loadInputText(input, cwdFromContext(ctx));
        if (!loaded.ok) return { content: [textContent(loaded.error)], details: { error: loaded.error }, isError: true };
        claims = buildFactCheckPlan({ text: loaded.text }).claims;
      }
      const lane = input.lane ?? 'A';
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
      return {
        content: [textContent(formatEvidenceBlock(lane, records))],
        details: { lane, records },
        isError: false,
      };
    },
  });

  omp.registerTool({
    name: 'fact_check_report',
    label: 'Fact Check Report',
    description: 'Build a source-aware FACT_CHECK_REPORT from claims, evidence lanes, and cross-check results.',
    parameters: buildReportParameters(z),
    async execute(_toolCallId, params) {
      const input = paramsOrEmpty(params);
      const claims = Array.isArray(input.claims) ? input.claims : [];
      const evidenceRecords = Array.isArray(input.evidenceRecords) ? input.evidenceRecords : [];
      const crossChecks = Array.isArray(input.crossChecks) && input.crossChecks.length
        ? input.crossChecks
        : crossCheckEvidence({ claims, evidenceRecords });
      const report = buildFactCheckReport({ claims, evidenceRecords, crossChecks });
      return {
        content: [textContent(`${formatCrossCheckBlock(crossChecks)}\n\n${formatFactCheckReport(report)}`)],
        details: { ...report, crossChecks },
        isError: false,
      };
    },
  });

  omp.registerTool({
    name: 'fact_check_gate',
    label: 'Fact Check Gate',
    description: 'Validate that fact-check workflow evidence includes plan, independent evidence, cross-check, review, report, and usage blocks.',
    parameters: buildGateParameters(z),
    async execute(_toolCallId, params) {
      const result = validateFactCheckGate(paramsOrEmpty(params));
      const report = result.ok
        ? 'fact_check_gate passed'
        : `fact_check_gate failed: missing ${result.missing.join(', ')}`;
      return {
        content: [textContent(report)],
        details: result,
        isError: !result.ok,
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
