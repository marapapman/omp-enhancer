/**
 * Advisory workflow candidate suggester.
 *
 * Pure function: task-descriptor → narrowed candidate workflow IDs.
 * Does NOT import catalog, does NOT route, does NOT select the Primary.
 * Returns a candidate list for the model to choose from.
 */

const DOMAIN_WRITING = 'writing';
const DOMAIN_CODE = 'code';
const DOMAIN_FACTS = 'facts';
const DOMAIN_SECURITY = 'security';
const DOMAIN_VISUAL = 'visual';
const DOMAIN_NETWORK = 'network';
const DOMAIN_DATABASE = 'database';
const DOMAIN_ML = 'ml';

/**
 * @param {object} taskDescriptor
 * @returns {{ candidates: string[], languageHint: string|null, rationale: string }}
 */
export function suggestWorkflowCandidates(taskDescriptor = {}) {
  const td = taskDescriptor ?? {};
  const domains = toLowerSet(td.domains);
  const operation = String(td.operation ?? '').toLowerCase();
  const complexity = String(td.complexity ?? '').toLowerCase();
  const language = String(td.language ?? '').toLowerCase();
  const writingSourcePending = td.writingSourcePending === true;
  const writingTaskKind = String(td.writingTaskKind ?? '').toLowerCase();
  const workspaceWrite = String(td.constraints?.workspaceWrite ?? '').toLowerCase();

  const candidates = [];
  let languageHint = null;
  let rationale = 'general match';

  // ── Simple one-step operations ──
  if (operation === 'answer' && complexity === 'simple') {
    candidates.push('agentic.simple');
    rationale = 'simple answer operation';
  }

  // ── Code workflows ──
  if (candidates.length === 0 && domains.has(DOMAIN_CODE) && !domains.has(DOMAIN_WRITING)) {
    if (['modify', 'create', 'release', 'diagnose'].includes(operation)) {
      candidates.push('code.dev');
      rationale = `code ${operation} operation`;
    }
  }

  // ── Writing workflows (highest priority after code-specific) ──
  if (domains.has(DOMAIN_WRITING)) {
    if (writingTaskKind === 'convert') {
      candidates.push('doc.convert.word');
      rationale = 'writing conversion to word format';
    }
    if (language === 'zh') {
      candidates.push('writing.zh');
      languageHint = 'language=zh → select writing.zh directly; skip writing.pending';
      rationale = 'Chinese writing task';
    } else if (language === 'en') {
      candidates.push('writing.en');
      languageHint = 'language=en → select writing.en directly; skip writing.pending';
      rationale = 'English writing task';
    } else if (writingSourcePending || language === 'unknown') {
      candidates.push('writing.pending');
      rationale = 'writing language unknown; pending resolution needed';
    } else {
      // language detected but not zh/en (e.g. mixed) → both candidates
      candidates.push('writing.zh', 'writing.en');
      rationale = 'writing task; language ambiguity';
    }
    // LaTeX as add-on candidate
    candidates.push('writing.latex');
  }

  // ── Fact-checking ──
  if (candidates.length === 0 && domains.has(DOMAIN_FACTS) && operation === 'answer') {
    candidates.push('factcheck.document');
    rationale = 'fact-checking request';
  }

  // ── Security ──
  if (candidates.length === 0 && domains.has(DOMAIN_SECURITY)) {
    candidates.push('security.review');
    rationale = 'security review request';
  }

  // ── Visual ──
  if (candidates.length === 0 && domains.has(DOMAIN_VISUAL)) {
    candidates.push('design.visual');
    rationale = 'visual design request';
  }

  // ── Network ──
  if (candidates.length === 0 && domains.has(DOMAIN_NETWORK)) {
    if (operation === 'diagnose') {
      candidates.push('network.debug');
      rationale = 'network diagnostics';
    } else if (operation === 'inspect') {
      candidates.push('network.review');
      rationale = 'network configuration review';
    } else {
      candidates.push('network.design');
      rationale = 'network architecture';
    }
  }

  // ── Database ──
  if (candidates.length === 0 && domains.has(DOMAIN_DATABASE)) {
    if (workspaceWrite === 'required') {
      candidates.push('database.change');
      rationale = 'database modification';
    } else {
      candidates.push('database.review');
      rationale = 'database review';
    }
  }

  // ── ML ──
  if (candidates.length === 0 && domains.has(DOMAIN_ML)) {
    if (['modify', 'create'].includes(operation)) {
      candidates.push('ml.debug');
      rationale = 'ML debugging/fix';
    } else {
      candidates.push('ml.review');
      rationale = 'ML review';
    }
  }

  // ── Release ──
  if (candidates.length === 0 && operation === 'release') {
    candidates.push('release.publish');
    rationale = 'release operation';
  }

  // ── Default fallback ──
  if (candidates.length === 0) {
    candidates.push('general.subagent');
    rationale = 'no specific domain match';
  }

  // Cap at 5 candidates
  const trimmed = candidates.filter(Boolean).slice(0, 5);

  return {
    candidates: trimmed,
    languageHint: languageHint || null,
    rationale,
  };
}

function toLowerSet(values = []) {
  return new Set(
    (Array.isArray(values) ? values : [])
      .map((v) => String(v ?? '').toLowerCase())
      .filter(Boolean),
  );
}
