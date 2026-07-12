import { analyzeWritingLogic } from './analyzer.js';
import { verifyCitations } from './citations.js';
import { resolveLanguage } from './language.js';
import { styleIssues } from './style.js';

const DEFAULT_CHECKS = ['logic', 'style', 'citation'];
const VALID_CHECKS = new Set(DEFAULT_CHECKS);
const DEFAULT_MAX_ISSUES = 30;

function normalizeChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return DEFAULT_CHECKS;
  return checks.filter((check) => VALID_CHECKS.has(check));
}

function maxIssueCount(value) {
  const number = Number(value ?? DEFAULT_MAX_ISSUES);
  if (!Number.isFinite(number)) return DEFAULT_MAX_ISSUES;
  return Math.min(150, Math.max(1, Math.trunc(number)));
}

function normalizeLogicIssue(issue) {
  return {
    ...issue,
    category: 'logic',
  };
}

function summarize(issues, returnedIssues) {
  const byCategory = { logic: 0, style: 0, citation: 0 };
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
  const checks = normalizeChecks(input.checks);
  const maxIssues = maxIssueCount(input.maxIssues);
  const issues = [];
  let citationDetails = [];

  if (checks.includes('logic')) {
    const logic = analyzeWritingLogic({
      text,
      language,
      mode: input.mode,
      maxIssues: 150,
    });
    issues.push(...logic.issues.map(normalizeLogicIssue));
  }

  if (checks.includes('style')) {
    issues.push(...styleIssues(text, language));
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

  const returnedIssues = issues.slice(0, maxIssues);
  return {
    ok: true,
    language,
    mode: input.mode ?? 'redline',
    checks,
    summary: summarize(issues, returnedIssues),
    issues: returnedIssues,
    citations: citationDetails,
  };
}
