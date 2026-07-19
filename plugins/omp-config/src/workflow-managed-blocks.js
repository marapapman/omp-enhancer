export const AGENTS_BLOCK_START = '<!-- OMP-ENHANCER-WORKFLOW-CONTEXT:START -->';
export const AGENTS_BLOCK_END = '<!-- OMP-ENHANCER-WORKFLOW-CONTEXT:END -->';
export const ADVISOR_BLOCK_START = '<!-- OMP-ENHANCER-ADVISOR-WORKFLOW-CONTEXT:START -->';
export const ADVISOR_BLOCK_END = '<!-- OMP-ENHANCER-ADVISOR-WORKFLOW-CONTEXT:END -->';
export const CATALOG_BLOCK_START = '<!-- OMP-ENHANCER-WORKFLOW-CATALOG:START -->';
export const CATALOG_BLOCK_END = '<!-- OMP-ENHANCER-WORKFLOW-CATALOG:END -->';

// These retired identifiers are byte-for-byte migration fingerprints only and
// are never emitted as current guidance. Keep the legacy suffix adjacency-gated:
// a partial or user-edited copy is user content and must survive context sync.
const LEGACY_ADVISOR_GUIDANCE_BLOCK = [
  "  Review the main agent as an advisory peer. Stay silent when the work is already correct or complete.",
  '',
  "  Skill and workflow selection belong to the main agent. Absence of a visible skill-read call is not evidence that a skill is missing when the transcript shows the skill body or another host-provided load. Raise a skill issue only when the main agent skipped active-inventory discovery for a non-trivial workflow, reports a concrete load failure, or applies instructions that conflict with the visible task. Do not ask for `omp_core_route_task`; its route is a compatibility diagnostic, not an execution decision.",
  '',
  "  Request another source read only when the transcript contains concrete truncation evidence, such as an explicit truncation marker or an incomplete requested range. A successful short-file read that reaches the file end is not clipped merely because it has few lines.",
  '',
  "  Deliver advice before the main agent's user-visible final. Once the main agent has emitted a complete final response, do not call `advise`, even if a late improvement is available. Stay silent rather than requesting a shorter restatement, another verification call, or a replacement final. Formatting taste, concision preference, and already-reported facts are not material post-final corrections.",
  '',
  "  ADVICE BUDGET: give at most one `advise` call for a primary task by default. Count prior advisor notes in this advisor session. After one note, stay silent unless later evidence reveals a new, materially different authorization, security, or irreversible-data-loss risk. A complete main-agent final sets this budget to zero unconditionally. Do not split one concern into follow-up notes, restate it after verification, or advise merely to refine how the final describes an already-correct outcome.",
  '',
  "  For an authorized edit, judge the concrete candidate rather than freezing the whole task. If one candidate would move a qualifier, change scope, or otherwise violate a semantic anchor, advise rejecting that candidate only. Preservation constraints do not make every other word immutable. When a safe lexical or structural improvement outside the protected anchors is visible, point to that alternative; do not conclude that no safe edit exists merely because one candidate is unsafe.",
  '',
  "  Use `concern`, not `blocker`, for a reversible wording candidate. Reserve `blocker` for an imminent authorization violation, security risk, or irreversible data loss.",
  '',
  "  Advisor notes are suggestions, not execution or completion gates. Never ask for repeated unchanged calls, a second skill load, or work outside the user's stated tool, write, test, network, and time scope.",
].join('\n');

// This is the exact instructions body from a846175^, before the managed block
// existed. A later sync appended the managed marker immediately after it.
const LEGACY_PRE_MARKER_ADVISOR_GUIDANCE_BLOCK = [
  "  Review the main agent as an advisory peer. Stay silent when the work is already correct or complete.",
  '',
  "  OMP workflow context may provide a skill without a read tool call. A hidden `skill-prompt`, a skill body followed by `Skill: <path>`, or system text saying `Routed workflow skills already loaded` means the host has already loaded that skill. Skill routing and loading are the main agent and Core's responsibility: absence of a visible skill-read call is not evidence that a skill is missing. Do not advise a skill read or `omp_core_route_task` merely because the rendered advisor transcript omits hidden host context. Raise a skill issue only when the main agent reports a concrete load failure or applies instructions that conflict with the visible task.",
  '',
  "  Request another source read only when the transcript contains concrete truncation evidence, such as an explicit truncation marker or an incomplete requested range. A successful short-file read that reaches the file end is not clipped merely because it has few lines.",
  '',
  "  Deliver advice before the main agent's user-visible final. Once the main agent has emitted a complete final response, do not call `advise`, even if a late improvement is available. Stay silent rather than requesting a shorter restatement, another verification call, or a replacement final. Formatting taste, concision preference, and already-reported facts are not material post-final corrections.",
  '',
  "  ADVICE BUDGET: give at most one `advise` call for a primary task by default. Count prior advisor notes in this advisor session. After one note, stay silent unless later evidence reveals a new, materially different authorization, security, or irreversible-data-loss risk. A complete main-agent final sets this budget to zero unconditionally. Do not split one concern into follow-up notes, restate it after verification, or advise merely to refine how the final describes an already-correct outcome.",
  '',
  "  For an authorized edit, judge the concrete candidate rather than freezing the whole task. If one candidate would move a qualifier, change scope, or otherwise violate a semantic anchor, advise rejecting that candidate only. Preservation constraints do not make every other word immutable. When a safe lexical or structural improvement outside the protected anchors is visible, point to that alternative; do not conclude that no safe edit exists merely because one candidate is unsafe.",
  '',
  "  Use `concern`, not `blocker`, for a reversible wording candidate. Reserve `blocker` for an imminent authorization violation, security risk, or irreversible data loss.",
  '',
  "  Advisor notes are suggestions, not execution or completion gates. Never ask for repeated unchanged calls, a second skill load, or work outside the user's stated tool, write, test, network, and time scope.",
].join('\n');

export function mergeManagedCatalog(existing, packagedCatalog) {
  assertCompleteMarkers(packagedCatalog, CATALOG_BLOCK_START, CATALOG_BLOCK_END, 'packaged workflow catalog');
  if (existing === null) return ensureTrailingNewline(packagedCatalog);
  assertCompleteMarkers(existing, CATALOG_BLOCK_START, CATALOG_BLOCK_END, 'existing workflow catalog');
  return ensureTrailingNewline(packagedCatalog);
}

export function mergeMarkdownManagedBlock(existing, managedBlock) {
  const managed = ensureTrailingNewline(managedBlock).trimEnd();
  if (existing === null || existing.trim() === '') return `${managed}\n`;
  const replaced = replaceExistingManagedBlock(existing, managed, AGENTS_BLOCK_START, AGENTS_BLOCK_END);
  if (replaced !== null) return ensureTrailingNewline(replaced);
  return `${existing.trimEnd()}\n\n${managed}\n`;
}

export function mergeWatchdogManagedBlock(existing, managedBlock) {
  const markerPattern = /^([ \t]*)<!-- OMP-ENHANCER-ADVISOR-WORKFLOW-CONTEXT:START -->/m;
  const existingMarker = existing.match(markerPattern);
  if (existingMarker) {
    const indented = indentBlock(managedBlock, existingMarker[1]);
    const replaced = replaceExistingManagedBlock(
      existing,
      indented,
      ADVISOR_BLOCK_START,
      ADVISOR_BLOCK_END,
      { lineBoundaries: true },
    );
    return ensureTrailingNewline(removeExactLegacyAdvisorGuidance(replaced));
  }
  if (existing.includes(ADVISOR_BLOCK_END)) {
    throw new Error('WATCHDOG.yml contains an incomplete OMP Enhancer advisor managed block.');
  }

  const lines = existing.split('\n');
  const headerIndex = lines.findIndex((line) => /^instructions:\s*\|[+-]?\s*(?:#.*)?$/.test(line));
  const unsupportedHeader = lines.some((line) => /^instructions\s*:/.test(line));
  if (headerIndex < 0 && unsupportedHeader) {
    throw new Error('WATCHDOG.yml has an unsupported instructions value; use a literal block scalar before syncing.');
  }
  if (headerIndex < 0) {
    const prefix = `instructions: |\n${indentBlock(managedBlock, '  ')}\n`;
    return existing.trim() ? `${prefix}\n${existing.trimStart()}` : prefix;
  }

  let scalarEnd = lines.length;
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '') continue;
    if (!/^\s/.test(line)) {
      scalarEnd = index;
      break;
    }
  }
  const contentIndent = lines
    .slice(headerIndex + 1, scalarEnd)
    .find((line) => line.trim() !== '')
    ?.match(/^[ \t]*/)?.[0] ?? '  ';
  const before = lines.slice(0, scalarEnd);
  if (before.at(-1)?.trim() !== '') before.push('');
  before.push(...indentBlock(managedBlock, contentIndent).split('\n'));
  if (scalarEnd < lines.length && before.at(-1)?.trim() !== '') before.push('');
  const merged = [...before, ...lines.slice(scalarEnd)].join('\n');
  return ensureTrailingNewline(removeExactLegacyAdvisorGuidance(merged));
}

function removeExactLegacyAdvisorGuidance(text) {
  const legacyPrefix = `instructions: |\n${LEGACY_PRE_MARKER_ADVISOR_GUIDANCE_BLOCK}\n\n  ${ADVISOR_BLOCK_START}`;
  const prefixStart = text.indexOf(legacyPrefix);
  const hasTopLevelLineBoundary = prefixStart === 0 || text[prefixStart - 1] === '\n';
  const withoutLegacyPrefix = prefixStart >= 0 && hasTopLevelLineBoundary
    ? `${text.slice(0, prefixStart)}instructions: |\n  ${ADVISOR_BLOCK_START}${text.slice(prefixStart + legacyPrefix.length)}`
    : text;
  const legacySuffix = `\n\n${LEGACY_ADVISOR_GUIDANCE_BLOCK}\n`;
  const managedEnd = withoutLegacyPrefix.indexOf(ADVISOR_BLOCK_END);
  const suffixStart = managedEnd + ADVISOR_BLOCK_END.length;
  if (
    managedEnd < 0
    || withoutLegacyPrefix.slice(suffixStart, suffixStart + legacySuffix.length) !== legacySuffix
  ) {
    return withoutLegacyPrefix;
  }
  return `${withoutLegacyPrefix.slice(0, suffixStart)}\n${withoutLegacyPrefix.slice(suffixStart + legacySuffix.length)}`;
}

export function extractManagedBlock(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || text.indexOf(startMarker, start + startMarker.length) >= 0) {
    throw new Error(`Packaged asset has an invalid managed block: ${startMarker}`);
  }
  const lineStart = text.lastIndexOf('\n', start) + 1;
  const markerEnd = end + endMarker.length;
  const lineEnd = text.indexOf('\n', markerEnd);
  return dedentBlock(text.slice(lineStart, lineEnd < 0 ? markerEnd : lineEnd));
}

function assertCompleteMarkers(text, startMarker, endMarker, label) {
  const starts = String(text).split(startMarker).length - 1;
  const ends = String(text).split(endMarker).length - 1;
  const start = String(text).indexOf(startMarker);
  const end = String(text).indexOf(endMarker);
  if (starts !== 1 || ends !== 1 || end <= start) {
    throw new Error(`Refusing to replace ${label} without one complete OMP Enhancer managed marker pair.`);
  }
}

function replaceExistingManagedBlock(existing, managed, startMarker, endMarker, options = {}) {
  const startMatches = [...existing.matchAll(new RegExp(escapeRegExp(startMarker), 'g'))];
  const endMatches = [...existing.matchAll(new RegExp(escapeRegExp(endMarker), 'g'))];
  if (startMatches.length === 0 && endMatches.length === 0) return null;
  if (startMatches.length !== 1 || endMatches.length !== 1) {
    throw new Error(`Managed block markers are incomplete or duplicated: ${startMarker}`);
  }
  let start = startMatches[0].index;
  let end = endMatches[0].index + endMarker.length;
  if (end <= start) throw new Error(`Managed block markers are out of order: ${startMarker}`);
  if (options.lineBoundaries) {
    start = existing.lastIndexOf('\n', start) + 1;
    const nextLine = existing.indexOf('\n', end);
    end = nextLine < 0 ? end : nextLine;
  }
  return `${existing.slice(0, start)}${managed}${existing.slice(end)}`;
}

function dedentBlock(text) {
  const lines = text.split('\n');
  const indents = lines
    .filter((line) => line.trim() !== '')
    .map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0);
  const indent = Math.min(...indents);
  return lines.map((line) => line.slice(Math.min(indent, line.length))).join('\n').trimEnd();
}

function indentBlock(text, indent) {
  return text
    .trimEnd()
    .split('\n')
    .map((line) => `${indent}${line}`)
    .join('\n');
}

function ensureTrailingNewline(text) {
  return text.endsWith('\n') ? text : `${text}\n`;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
