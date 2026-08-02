import { analyzeWritingLogic, REDLINE_SEVERITIES } from './analyzer.js';
import { verifyCitations } from './citations.js';
import { resolveLanguage } from './language.js';
import { MAX_ISSUES_CONFIG, UNLIMITED, clampMaxIssues } from './max-issues.js';
import { compareSemanticPreservation } from './preservation.js';
import { styleIssues } from './style.js';

const DEFAULT_CHECKS = ['logic', 'style', 'citation'];
const VALID_CHECKS = new Set([...DEFAULT_CHECKS, 'preservation']);

function normalizeChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return DEFAULT_CHECKS;
  const invalidChecks = checks.filter((check) => !VALID_CHECKS.has(check));
  if (invalidChecks.length > 0) {
    throw new TypeError(`Unsupported writing checks: ${[...new Set(invalidChecks)].join(', ')}`);
  }
  return [...new Set(checks)];
}

function normalizeLogicIssue(issue) {
  return {
    ...issue,
    category: 'logic',
  };
}

function summarize(issues, returnedIssues) {
  const byCategory = { logic: 0, style: 0, citation: 0, preservation: 0 };
  let fatalOrCritical = 0;
  let warningsOrImportant = 0;
  let minor = 0;

  for (const issue of issues) {
    if (issue.category && byCategory[issue.category] !== undefined) {
      byCategory[issue.category] += 1;
    }
    if (issue.severity === 'FATAL' || issue.severity === 'CRITICAL') fatalOrCritical += 1;
    else if (issue.severity === 'WARNING' || issue.severity === 'IMPORTANT') warningsOrImportant += 1;
    else minor += 1;
  }

  return {
    total: issues.length,
    returned: returnedIssues.length,
    byCategory,
    fatalOrCritical,
    warningsOrImportant,
    minor,
    verdict: fatalOrCritical > 0 ? 'critical_findings' : warningsOrImportant > 0 ? 'needs_revision' : 'pass',
  };
}

export function analyzeWritingQuality(input = {}) {
  const text = String(input.text ?? '');
  const language = resolveLanguage(input.language, text);
  const mode = input.mode ?? 'redline';
  const selectedChecks = normalizeChecks(input.checks);
  const checks = input.preservation === true && !selectedChecks.includes('preservation')
    ? [...selectedChecks, 'preservation']
    : selectedChecks;
  const maxIssues = clampMaxIssues(input.maxIssues, MAX_ISSUES_CONFIG.quality);
  const issues = [];
  let citationDetails = [];
  let preservation = {
    compared: false,
    driftDetected: false,
    findings: [],
    reason: 'Preservation comparison was not requested.',
  };

  if (checks.includes('logic')) {
    const logic = analyzeWritingLogic({
      text,
      language,
      mode,
      maxIssues: UNLIMITED,
    });
    issues.push(...logic.issues.map(normalizeLogicIssue));
  }

  if (checks.includes('style')) {
    const styleResults = styleIssues(text, language);
    const filtered = mode === 'redline'
      ? styleResults.filter((issue) => REDLINE_SEVERITIES.has(issue.severity))
      : styleResults;
    issues.push(...filtered);
  }

  if (checks.includes('citation')) {
    const citationResult = verifyCitations({
      text,
      bibliography: input.bibliography,
      evidenceRecords: input.evidenceRecords,
      language,
    });
    citationDetails = citationResult.citations;
    issues.push(...citationResult.issues);
  }

  if (checks.includes('preservation')) {
    preservation = typeof input.originalText === 'string'
      ? compareSemanticPreservation(input.originalText, text, { language })
      : {
          compared: false,
          driftDetected: false,
          findings: [{
            category: 'preservation',
            dimension: language === 'zh' ? '语义保真' : 'semantic preservation',
            severity: 'IMPORTANT',
            location: language === 'zh' ? '全文' : 'document',
            problem: language === 'zh'
              ? '缺少原文，无法执行语义保真比较。'
              : 'The original text is missing, so semantic preservation cannot be compared.',
            quote: '',
            suggestion: language === 'zh'
              ? '提供 originalText 后重新执行语义保真检查。'
              : 'Provide originalText and rerun the preservation check.',
          }],
          reason: 'originalText is required for a preservation comparison.',
        };
    issues.push(...preservation.findings);
  }

  const returnedIssues = issues.slice(0, maxIssues);
  return {
    ok: true,
    language,
    mode,
    checks,
    summary: summarize(issues, returnedIssues),
    issues: returnedIssues,
    citations: citationDetails,
    preservation,
  };
}
