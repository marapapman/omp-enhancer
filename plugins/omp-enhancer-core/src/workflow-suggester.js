/**
 * Advisory workflow candidate suggester.
 *
 * Pure function: task-descriptor → narrowed candidate workflow IDs.
 * Does NOT import catalog, does NOT route, does NOT select a workflow.
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
 * @returns {{ candidates: string[], rationale: string }}
 */
export function suggestWorkflowCandidates(taskDescriptor = {}) {
  const td = taskDescriptor ?? {};
  const domains = toLowerSet(td.domains);
  const operation = String(td.operation ?? '').toLowerCase();
  const complexity = String(td.complexity ?? '').toLowerCase();

  const candidates = [];
  let rationale = 'general match';

  // ── Simple one-step operations need no workflow card ──
  if (operation === 'answer' && complexity === 'simple') {
    return { candidates: [], rationale: 'simple answer operation; no workflow needed' };
  }

  // ── Code: code + database + ml domains ──
  if (candidates.length === 0
    && (domains.has(DOMAIN_CODE) || domains.has(DOMAIN_DATABASE) || domains.has(DOMAIN_ML))
    && !domains.has(DOMAIN_WRITING)) {
    candidates.push('code');
    rationale = `code ${operation} operation`;
  }

  // ── Writing ──
  if (candidates.length === 0 && domains.has(DOMAIN_WRITING) && !domains.has(DOMAIN_SECURITY)) {
    candidates.push('writing');
    rationale = 'writing task';
  }

  // ── Fact-checking ──
  if (candidates.length === 0 && domains.has(DOMAIN_FACTS)
    && (operation === 'answer' || operation === 'inspect')
    && !domains.has(DOMAIN_SECURITY)) {
    candidates.push('research');
    rationale = 'fact-checking request';
  }

  // ── Security ──
  if (candidates.length === 0 && domains.has(DOMAIN_SECURITY)) {
    candidates.push('operations');
    rationale = 'security review request';
  }

  // ── Visual ──
  if (candidates.length === 0 && domains.has(DOMAIN_VISUAL)) {
    candidates.push('visual');
    rationale = 'visual design request';
  }

  // ── Network ──
  if (candidates.length === 0 && domains.has(DOMAIN_NETWORK)) {
    candidates.push('operations');
    rationale = 'network operations';
  }

  // ── Release ──
  if (candidates.length === 0 && operation === 'release') {
    candidates.push('operations');
    rationale = 'release operation';
  }

  // ── Default fallback ──
  if (candidates.length === 0) {
    candidates.push('operations');
    rationale = 'no specific domain match';
  }

  return {
    candidates: candidates.filter(Boolean).slice(0, 5),
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
