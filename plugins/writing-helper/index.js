import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';

import { analyzeWritingLogic } from './src/analyzer.js';
import { AI_ENSEMBLE_SLOW_MARGIN, decideAiEnsemble } from './src/ai-ensemble.js';
import { JEV_AUTHORSHIP_PROMPT, ensembleConfiguration, fetchAigcProbability, fetchJevProbability, fetchSlowLabel } from './src/ai-detectors.js';
import { formatAiScanReport, scanAiStyle } from './src/ai-scan.js';
import { fetchExternalCitationEvidence, parseLocalLiteratureRecords } from './src/citations.js';
import { censusDeck, formatDeckCensusReport } from './src/deck-census.js';
import { loadWritingLogicDocument } from './src/document-loader.js';
import { analyzeWritingQuality } from './src/quality.js';
import { formatWritingLogicReport, formatWritingQualityReport } from './src/report.js';
import { withToolErrorHandling } from './src/tool-error-utils.js';

function buildBaseShape(z) {
  return {
    path: z.string().optional().describe('File path to the document to check. Example: \'/path/to/paper.md\'. Omit when passing text directly.'),
    text: z.string().optional().describe('Document text to check in-line, used when no path is provided. Example: \'The document content...\'.'),
    language: z.enum(['zh', 'en', 'auto']).optional().describe('Language of the document: zh (Chinese), en (English), or auto (detect).'),
    mode: z.enum(['redline', 'standard']).optional().describe('Check mode: standard (balanced) or redline (strict, minimal noise).'),
    maxIssues: z.number().optional().describe('Maximum number of issues to report. Example: 10. Default: 20 (logic) / 30 (quality).'),
  };
}

function buildLogicParameters(z) {
  return z.object(buildBaseShape(z));
}

function buildQualityParameters(z) {
  return z.object({
    ...buildBaseShape(z),
    checks: z.array(z.enum(['logic', 'style', 'citation', 'preservation'])).optional().describe('Check types to run: logic, style, citation, preservation. Example: [\'logic\', \'style\']. Omit to run all relevant checks.'),
    originalText: z.string().optional().describe('Original text for preservation comparison. Required when checks includes preservation.'),
    preservation: z.boolean().optional().describe('Enable semantic preservation analysis between originalText and the input document.'),
    bibliography: z.string().optional().describe('Bibliography content as a string, alternative to bibliographyPath.'),
    bibliographyPath: z.string().optional().describe('File path to a bibliography file. Example: \'/path/to/references.bib\'.'),
    literaturePath: z.string().optional().describe('File path to local literature records for citation verification.'),
    allowNetwork: z.boolean().optional().describe('Allow network access for citation verification via DOI, arXiv, or Crossref. Default: false.'),
    citationProviders: z.array(z.enum(['local', 'doi', 'arxiv', 'crossref'])).optional().describe('Citation verification providers to use. Example: [\'doi\', \'crossref\'].'),
  });
}

function buildAiScanParameters(z) {
  return z.object({
    ...buildBaseShape(z),
    includeKeywordRules: z.boolean().optional().describe('Include keyword and phrase rules in addition to the statistical scan. Default: true.'),
    baseline: z.string().optional().describe('Optional JSON object mapping terms to expected occurrences per 1000 tokens, e.g. \'{"delve":0.1}\'. Rates override the built-in reference distribution.'),
    detector: z.enum(['auto', 'ensemble', 'local']).optional().describe('Detector mode: auto uses AIGC+Jev when configured and local statistics otherwise; ensemble requires allowNetwork, AIGC_DETECTOR_URL, and TYPESAFE_API_KEY; local runs only the built-in scanner.'),
    allowNetwork: z.boolean().optional().describe('Allow the ensemble to send the text to AIGC_DETECTOR_URL and TypeSafe. Default: false; local scanning never uses the network.'),
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
    if (token === '--baseline') {
      input.baseline = tokens[index + 1];
      index += 1;
      continue;
    }
    if (token === '--no-keywords') {
      input.includeKeywordRules = false;
      continue;
    }
    if (token === '--detector') {
      const value = tokens[index + 1];
      if (['auto', 'ensemble', 'local'].includes(value)) input.detector = value;
      index += 1;
      continue;
    }
    if (!input.path) input.path = token;
  }

  return input;
}

function readOptionalFile(path, cwd) {
  if (typeof path !== 'string' || path.trim() === '') return { ok: true, text: '' };
  try {
    return { ok: true, text: readFileSync(resolve(cwd, path), 'utf8') };
  } catch (error) {
    const message = error.message;
    return { ok: false, error: `Unable to read ${path}: ${message}` };
  }
}

function qualityEvidenceCandidates(input, cwd) {
  if (typeof input.path !== 'string' || input.path.trim() === '') {
    return { bibliography: [], literature: [] };
  }

  const documentPath = resolve(cwd, input.path);
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
      (typeof input.bibliography === 'string' && input.bibliography.trim() !== ''
        ? undefined
        : firstExistingPath(candidates.bibliography)),
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
      bibliography: typeof input.bibliography === 'string' && input.bibliography.trim() !== ''
        ? input.bibliography
        : bibliographyFile.text,
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
  return input.allowNetwork === true;
}

function isDeckSource(input, text) {
  if (typeof input.path !== 'string' || !input.path.endsWith('.tex')) return false;
  return text.includes('\\input') || text.includes('\\include');
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

function ensembleFailureReport(language, title, lines) {
  const heading = language === 'zh' ? '## AIGC + Jev 组合检测失败' : '## AIGC + Jev Ensemble Failed';
  return [heading, '', title, ...lines.map((line) => `- ${line}`)].join('\n');
}

export async function runWritingAiScan(input, cwd, options = {}) {
  const loaded = loadWritingLogicDocument(input, cwd);
  if (!loaded.ok) {
    return {
      ok: false,
      report: loaded.error,
      details: { error: loaded.error, source: loaded.source },
    };
  }

  const base = scanAiStyle({
    ...input,
    text: loaded.text,
  });
  const detector = input.detector ?? 'auto';
  if (detector === 'local') {
    const result = { ...base, detector: 'local' };
    return { ok: true, report: formatAiScanReport(result), details: result };
  }

  if (input.allowNetwork !== true) {
    const result = { ...base, detector: 'local', ensemble: { status: 'unavailable', reason: 'network_not_allowed' } };
    if (detector === 'ensemble') {
      const title = base.language === 'zh'
        ? '网络访问未授权：allowNetwork 必须为 true'
        : 'Network access is not allowed: allowNetwork must be true';
      return {
        ok: false,
        report: ensembleFailureReport(base.language, title, base.language === 'zh'
          ? ['显式传入 allowNetwork=true 后重试，或使用 detector=local。']
          : ['Pass allowNetwork=true explicitly and retry, or use detector=local.']),
        details: result,
      };
    }
    return { ok: true, report: formatAiScanReport(result), details: result };
  }

  const env = options.env ?? process.env;
  const configuration = ensembleConfiguration(env);
  if (!configuration.ready) {
    const result = {
      ...base,
      detector: 'local',
      ensemble: { status: 'unavailable', missing: configuration.missing },
    };
    if (detector === 'ensemble') {
      const title = base.language === 'zh'
        ? `缺少配置：${configuration.missing.join('、')}`
        : `Missing configuration: ${configuration.missing.join(', ')}`;
      return {
        ok: false,
        report: ensembleFailureReport(base.language, title, base.language === 'zh'
          ? ['设置这些环境变量后重试，或显式使用 detector=local。']
          : ['Set those environment variables and retry, or pass detector=local explicitly.']),
        details: result,
      };
    }
    return { ok: true, report: formatAiScanReport(result), details: result };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const aigc = await fetchAigcProbability({
    text: loaded.text,
    language: base.language,
    env,
    fetchImpl,
  });
  if (!aigc.ok) {
    const result = { ...base, detector: 'ensemble', ensemble: { status: 'error', component: 'aigc', error: aigc.error } };
    return {
      ok: false,
      report: ensembleFailureReport(base.language, aigc.error, base.language === 'zh'
        ? ['检查 AIGC_DETECTOR_URL 指向的服务。']
        : ['Check the service behind AIGC_DETECTOR_URL.']),
      details: result,
    };
  }

  const jev = await fetchJevProbability({ text: loaded.text, env, fetchImpl });
  if (!jev.ok) {
    const result = { ...base, detector: 'ensemble', ensemble: { status: 'error', component: 'jev', error: jev.error } };
    return {
      ok: false,
      report: ensembleFailureReport(base.language, jev.error, base.language === 'zh'
        ? ['检查 TYPESAFE_API_KEY，以及 TYPESAFE_BASE_URL 和 TYPESAFE_MODEL。']
        : ['Check TYPESAFE_API_KEY, TYPESAFE_BASE_URL, and TYPESAFE_MODEL.']),
      details: result,
    };
  }

  let decision = decideAiEnsemble({ aigcP: aigc.probability, jevP: jev.probability });
  const slowBand = decideAiEnsemble({
    aigcP: aigc.probability,
    jevP: jev.probability,
    slowMargin: AI_ENSEMBLE_SLOW_MARGIN,
  });
  let slowLabel = null;
  let slowError = null;
  if (slowBand.uncertain) {
    const slow = await fetchSlowLabel({ text: loaded.text, language: base.language, env, fetchImpl });
    if (slow.ok) {
      slowLabel = slow.label;
      decision = decideAiEnsemble({
        aigcP: aigc.probability,
        jevP: jev.probability,
        slowLabel,
        slowMargin: AI_ENSEMBLE_SLOW_MARGIN,
      });
    } else if (slow.code !== 'slow_not_configured') {
      slowError = slow.error;
      decision = { ...decision, uncertain: true };
    }
  }

  const result = {
    ...base,
    detector: 'ensemble',
    ensemble: {
      status: 'decided',
      ...decision,
      components: {
        aigc: aigc.probability,
        jev: jev.probability,
        slow: slowLabel,
      },
      jevModel: jev.model,
      jevPrompt: JEV_AUTHORSHIP_PROMPT,
      slowError,
    },
  };
  return { ok: true, report: formatAiScanReport(result), details: result };
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

  if (isDeckSource(input, loaded.text)) {
    const census = censusDeck({
      mainPath: resolve(cwd, input.path),
      mainText: loaded.text,
      readFile: (path) => readFileSync(path, 'utf8'),
    });
    if (!census.ok) {
      return {
        ok: false,
        report: census.error,
        details: { error: census.error },
      };
    }
    return {
      ok: true,
      report: formatDeckCensusReport(census),
      details: { deck: census },
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
  let result;
  try {
    result = analyzeWritingQuality(localInput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      report: message,
      details: { error: message },
    };
  }

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
  const aiScanParameters = buildAiScanParameters(z);
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
    execute: withToolErrorHandling('writing_logic_check', async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const output = runWritingLogicCheck(paramsOrEmpty(params), cwdFromContext(ctx));
      return {
        content: [textContent(output.report)],
        details: output.details,
        isError: !output.ok,
      };
    }),
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
      'Set allowNetwork to true only when network access is authorized; tool activation alone is not network permission.',
      'Pass originalText and enable preservation check; drift findings are advisory and never block editing.',
      'Sentence-level information gain is semantic and stays outside this tool: route it to the writer/zh-writer self-check and the checker/zh-checker clarity review, while this tool reports only its supported checks — writing logic, language-specific style, citation authenticity, and optional semantic preservation — and never presents them as an information-gain finding.',
      'Do not use this tool to rewrite documents; it reports issues only.',
    ],
    parameters: qualityParameters,
    execute: withToolErrorHandling('writing_quality_check', async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const output = await runWritingQualityCheck(paramsOrEmpty(params), cwdFromContext(ctx));
      return {
        content: [textContent(output.report)],
        details: output.details,
        isError: !output.ok,
      };
    }),
  });

  omp.registerTool({
    name: 'writing_ai_scan',
    label: 'Writing AI Style Scan',
    description:
      'Detect AI-generated prose with the AIGC + Jev score ensemble: 0.325 * AIGC P(AI) + 0.675 * Jev P(AI), decision threshold 0.38, and an optional slow-model fallback inside a 0.20 uncertainty band. AIGC comes from AIGC_DETECTOR_URL; Jev comes from TypeSafe with TYPESAFE_API_KEY. The built-in keyword and distribution scan supplies supporting evidence and can run alone with detector=local. Run it with allowNetwork=true after every completed writing task and after each repair pass. Advisory only; it reports findings and does not rewrite.',
    defaultInactive: false,
    approval: 'read',
    promptSnippet: 'Run the AIGC + Jev ensemble after every completed writing task and after each repair pass.',
    promptGuidelines: [
      'Run writing_ai_scan with detector=ensemble and allowNetwork=true on the final text of every completed writing task before checker review and delivery, then rerun it after each writer/zh-writer repair pass.',
      'The ensemble is 0.325 * AIGC P(AI) + 0.675 * Jev P(AI) with threshold 0.38; do not re-tune those values per invocation.',
      'When network access is not allowed or AIGC_DETECTOR_URL/TYPESAFE_API_KEY is missing, record that limitation instead of presenting the local scanner as the ensemble.',
      'Ensemble mode sends the text to AIGC_DETECTOR_URL and TypeSafe; use detector=local for offline or sensitive text.',
      'Treat the label and local score as advisory distribution evidence, not as a gate or a quality verdict.',
      'Neither the AIGC+Jev authorship score nor the local metrics replace the sentence-level information-gain review — they cannot tell whether a sentence adds a new fact, a necessary qualification, or a key logical relation — so the writer/zh-writer self-check runs first and this scan stays advisory evidence.',
      'Use detector=local only for diagnostics; it is a simple statistical scan, not the ensemble.',
      'Do not use this tool to rewrite documents; it reports findings only.',
    ],
    parameters: aiScanParameters,
    execute: withToolErrorHandling('writing_ai_scan', async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const output = await runWritingAiScan(paramsOrEmpty(params), cwdFromContext(ctx));
      return {
        content: [textContent(output.report)],
        details: output.details,
        isError: !output.ok,
      };
    }),
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

  omp.registerCommand('writing-ai-scan', {
    description: 'Check a document path for AI-style tells with keyword and statistical evidence.',
    async handler(args, ctx) {
      const input = parseCommandArgs(typeof args === 'string' ? args : '');
      let output;
      if (hasCommandInput(input)) {
        output = await runWritingAiScan(input, cwdFromContext(ctx));
      } else {
        output = missingCommandInputResult('writing-ai-scan');
      }
      notifyResult(ctx, output);
      return output;
    },
  });
}
