import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path';

import { analyzeWritingLogic } from './src/analyzer.js';
import { fetchExternalCitationEvidence, parseLocalLiteratureRecords, verifyCitations } from './src/citations.js';
import { loadWritingLogicDocument } from './src/document-loader.js';
import { analyzeWritingQuality } from './src/quality.js';
import { formatWritingLogicReport, formatWritingQualityReport } from './src/report.js';

function buildBaseShape(z) {
  return {
    path: z.string().optional(),
    text: z.string().optional(),
    language: z.enum(['zh', 'en', 'auto']).optional(),
    mode: z.enum(['redline', 'standard']).optional(),
    maxIssues: z.number().optional(),
  };
}

function buildLogicParameters(z) {
  return z.object(buildBaseShape(z));
}

function buildQualityParameters(z) {
  return z.object({
    ...buildBaseShape(z),
    checks: z.array(z.enum(['logic', 'style', 'citation', 'preservation'])).optional(),
    originalText: z.string().optional(),
    preservation: z.boolean().optional(),
    bibliography: z.string().optional(),
    bibliographyPath: z.string().optional(),
    literaturePath: z.string().optional(),
    allowNetwork: z.boolean().optional(),
    citationProviders: z.array(z.enum(['local', 'doi', 'arxiv', 'crossref'])).optional(),
  });
}

function textContent(text) {
  return { type: 'text', text };
}

function parseChecks(value = '') {
  if (value.length === 0) return undefined;
  return value.split(',').map((check) => check.trim()).filter(Boolean);
}

function paramsOrEmpty(params) {
  if (params && typeof params === 'object') return params;
  return {};
}

function cwdFromContext(ctx) {
  if (ctx && typeof ctx.cwd === 'string') return ctx.cwd;
  return process.cwd();
}

function notifyResult(ctx, output) {
  if (!ctx || !ctx.ui || typeof ctx.ui.notify !== 'function') return;
  const level = output.ok ? 'info' : 'error';
  ctx.ui.notify(output.report, level);
}

function hasCommandInput(input) {
  return Boolean(input.path);
}


function parseCommandArgs(args) {
  const tokens = args.trim().split(/\s+/u).filter(Boolean);
  const input = {};

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--redline') {
      input.mode = 'redline';
      continue;
    }
    if (token === '--standard') {
      input.mode = 'standard';
      continue;
    }
    if (token === '--lang') {
      const value = tokens[index + 1];
      if (['zh', 'en', 'auto'].includes(value)) input.language = value;
      index += 1;
      continue;
    }
    if (token === '--max') {
      const value = Number(tokens[index + 1]);
      if (Number.isFinite(value)) input.maxIssues = value;
      index += 1;
      continue;
    }
    if (token === '--checks') {
      input.checks = parseChecks(tokens[index + 1]);
      index += 1;
      continue;
    }
    if (token === '--bib') {
      input.bibliographyPath = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === '--literature') {
      input.literaturePath = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === '--allow-network') {
      input.allowNetwork = true;
      continue;
    }
    if (token === '--no-network' || token === '--disable-network') {
      input.allowNetwork = false;
      continue;
    }
    if (token === '--citation-providers') {
      input.citationProviders = parseChecks(tokens[index + 1]);
      index += 1;
      continue;
    }
    if (!input.path) input.path = token;
  }

  return input;
}

function resolveInputPath(path, cwd) {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

function readOptionalFile(path, cwd) {
  if (typeof path !== 'string' || path.trim() === '') return { ok: true, text: '' };
  try {
    return { ok: true, text: readFileSync(resolveInputPath(path, cwd), 'utf8') };
  } catch (error) {
    const message = error.message;
    return { ok: false, error: `Unable to read ${path}: ${message}` };
  }
}

function qualityEvidenceCandidates(input, cwd) {
  if (typeof input.path !== 'string' || input.path.trim() === '') {
    return { bibliography: [], literature: [] };
  }

  const documentPath = resolveInputPath(input.path, cwd);
  const documentDir = dirname(documentPath);
  const documentBase = basename(documentPath, extname(documentPath));
  return {
    bibliography: [
      join(documentDir, `${documentBase}.bib`),
      join(documentDir, 'refs.bib'),
      join(documentDir, 'references.bib'),
      join(documentDir, 'paper.bib'),
    ],
    literature: [join(documentDir, 'literature.md')],
  };
}

function firstExistingPath(paths) {
  return paths.find((path) => existsSync(path));
}

function withDiscoveredQualityEvidence(input, cwd) {
  const candidates = qualityEvidenceCandidates(input, cwd);
  return {
    ...input,
    bibliographyPath:
      input.bibliographyPath ??
      (input.bibliography ? undefined : firstExistingPath(candidates.bibliography)),
    literaturePath: input.literaturePath ?? firstExistingPath(candidates.literature),
  };
}

function commandUsage(commandName) {
  return `Usage: /${commandName} paper.md`;
}

function missingCommandInputResult(commandName) {
  const report = commandUsage(commandName);
  return {
    ok: false,
    report,
    details: { error: report },
  };
}

function enrichQualityInput(input, cwd) {
  const bibliographyFile = readOptionalFile(input.bibliographyPath, cwd);
  if (!bibliographyFile.ok) return bibliographyFile;
  const literatureFile = readOptionalFile(input.literaturePath, cwd);
  if (!literatureFile.ok) return literatureFile;
  return {
    ok: true,
    input: {
      ...input,
      bibliography: input.bibliography ?? bibliographyFile.text,
      evidenceRecords: [
        ...(Array.isArray(input.evidenceRecords) ? input.evidenceRecords : []),
        ...parseLocalLiteratureRecords(literatureFile.text),
      ],
    },
  };
}

function citationEvidenceMissing(result) {
  return (
    Array.isArray(result.checks) &&
    result.checks.includes('citation') &&
    Array.isArray(result.citations) &&
    result.citations.some((citation) => citation.status === 'UNVERIFIED')
  );
}

function networkFallbackAllowed(input) {
  return input.allowNetwork !== false;
}

export function runWritingLogicCheck(input, cwd) {
  const loaded = loadWritingLogicDocument(input, cwd);
  if (!loaded.ok) {
    return {
      ok: false,
      report: loaded.error,
      details: { error: loaded.error, source: loaded.source },
    };
  }

  const result = analyzeWritingLogic({
    ...input,
    text: loaded.text,
  });

  return {
    ok: true,
    report: formatWritingLogicReport(result),
    details: result,
  };
}

export async function runWritingQualityCheck(input, cwd) {
  const loaded = loadWritingLogicDocument(input, cwd);
  if (!loaded.ok) {
    return {
      ok: false,
      report: loaded.error,
      details: { error: loaded.error, source: loaded.source },
    };
  }

  const enriched = enrichQualityInput(withDiscoveredQualityEvidence(input, cwd), cwd);
  if (!enriched.ok) {
    return {
      ok: false,
      report: enriched.error,
      details: { error: enriched.error },
    };
  }

  const localEvidenceRecords = enriched.input.evidenceRecords;
  const localInput = {
    ...enriched.input,
    text: loaded.text,
    evidenceRecords: localEvidenceRecords,
  };
  let result = analyzeWritingQuality(localInput);

  if (citationEvidenceMissing(result) && networkFallbackAllowed(enriched.input)) {
    const externalEvidence = await fetchExternalCitationEvidence({
      text: loaded.text,
      bibliography: enriched.input.bibliography,
      allowNetwork: true,
      citationProviders: enriched.input.citationProviders,
    });
    if (externalEvidence.length > 0) {
      result = analyzeWritingQuality({
        ...localInput,
        evidenceRecords: [...localEvidenceRecords, ...externalEvidence],
      });
    }
  }

  return {
    ok: true,
    report: formatWritingQualityReport(result),
    details: result,
  };
}

export default function writingLogicExtension(omp) {
  const z = omp.zod.z;
  const logicParameters = buildLogicParameters(z);
  const qualityParameters = buildQualityParameters(z);
  omp.registerTool({
    name: 'writing_logic_check',
    label: 'Writing Logic Check',
    description:
      'Check a draft or document for substantive writing logic issues, including unsupported conclusions, data inconsistencies, terminology drift, and causal leaps.',
    defaultInactive: true,
    approval: 'read',
    promptSnippet: 'Check writing logic for a draft, selected text, or document path.',
    promptGuidelines: [
      'Use writing_logic_check before claiming a draft is logically consistent.',
      'Use redline mode for final checks where noisy style feedback would be harmful.',
      'Do not use this tool to rewrite documents; it reports issues only.',
    ],
    parameters: logicParameters,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const output = runWritingLogicCheck(paramsOrEmpty(params), cwdFromContext(ctx));
      return {
        content: [textContent(output.report)],
        details: output.details,
        isError: !output.ok,
      };
    },
  });

  omp.registerTool({
    name: 'writing_quality_check',
    label: 'Writing Quality Check',
    description:
      'Run advisory writing logic, language-specific style, citation authenticity, and optional semantic preservation checks. Citations are VERIFIED only when evidence confirms metadata, MISMATCH when evidence contradicts it, and UNVERIFIED when evidence is absent.',
    defaultInactive: true,
    approval: 'read',
    promptSnippet: 'Check writing quality, style, and citation authenticity for a draft or document path.',
    promptGuidelines: [
      'Use writing_quality_check for final writing QA across logic, style, and citations.',
      'Treat UNVERIFIED citations as needing evidence, not as fabricated or true.',
      'For preservation review, pass originalText and select the preservation check; drift findings are advisory and never block editing or completion.',
      'Do not use this tool to rewrite documents; it reports issues only.',
    ],
    parameters: qualityParameters,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const output = await runWritingQualityCheck(paramsOrEmpty(params), cwdFromContext(ctx));
      return {
        content: [textContent(output.report)],
        details: output.details,
        isError: !output.ok,
      };
    },
  });

  omp.registerCommand('writing-logic', {
    description: 'Check a document path for substantive writing logic issues.',
    async handler(args, ctx) {
      const input = parseCommandArgs(typeof args === 'string' ? args : '');
      let output;
      if (hasCommandInput(input)) {
        output = runWritingLogicCheck(input, cwdFromContext(ctx));
      } else {
        output = missingCommandInputResult('writing-logic');
      }
      notifyResult(ctx, output);
      return output;
    },
  });

  omp.registerCommand('writing-quality', {
    description: 'Check a document path for logic, style, and citation authenticity issues.',
    async handler(args, ctx) {
      const input = parseCommandArgs(typeof args === 'string' ? args : '');
      let output;
      if (hasCommandInput(input)) {
        output = await runWritingQualityCheck(input, cwdFromContext(ctx));
      } else {
        output = missingCommandInputResult('writing-quality');
      }
      notifyResult(ctx, output);
      return output;
    },
  });
}

export { compareSemanticPreservation, extractSemanticAnchors } from './src/preservation.js';
export { verifyCitations };
