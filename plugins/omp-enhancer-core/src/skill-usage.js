const placeholderValues = new Set(['todo', 'tbd', '<required skill>', '<skill>', '[skill]', 'required skill']);

export function validateSkillUsage({ requiredSkills = [], output = '' } = {}) {
  const authoritative = findAuthoritativeSkillUsage(String(output));
  const denied = findDeniedSkills(String(output), requiredSkills);

  if (!authoritative) {
    return {
      ok: requiredSkills.length === 0 && denied.length === 0,
      required: requiredSkills,
      loaded: [],
      missing: [...requiredSkills],
      invalid: [],
      denied,
      message: requiredSkills.length ? `Missing SKILL_USAGE for ${requiredSkills.join(', ')}` : 'No required skills.',
    };
  }

  const parsed = parseSkillUsageBlock(authoritative);
  const invalid = parsed.loaded.filter((entry) => isPlaceholder(entry));
  const effectiveLoaded = parsed.loaded.filter((entry) => !isPlaceholder(entry));
  const loaded = uniqueValues(effectiveLoaded.map((entry) => normalizeSkillName(entry)).filter(Boolean));
  const loadedSet = new Set(loaded);
  const missing = requiredSkills.filter((skill) => !loadedSet.has(normalizeSkillName(skill)));
  const ok = missing.length === 0 && invalid.length === 0 && denied.length === 0;

  return {
    ok,
    required: requiredSkills,
    loaded,
    missing,
    invalid,
    denied,
    message: ok ? 'SKILL_USAGE ok.' : buildMessage({ missing, invalid, denied }),
  };
}

export function parseSkillUsage(output = '') {
  const block = findAuthoritativeSkillUsage(String(output));
  return block ? parseSkillUsageBlock(block) : { required: [], loaded: [] };
}

function findAuthoritativeSkillUsage(output) {
  const lines = output.split(/\r?\n/);
  let inFence = false;
  const plainStarts = [];
  const fencedStarts = [];

  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (!isSkillUsageHeader(line)) return;
    if (inFence) fencedStarts.push(index);
    else plainStarts.push(index);
  });

  if (plainStarts.length) return sliceUsageBlock(lines, plainStarts[plainStarts.length - 1]);
  if (fencedStarts.length) return sliceUsageBlock(lines, fencedStarts[fencedStarts.length - 1]);
  return null;
}

function parseSkillUsageBlock(block) {
  const required = [];
  const loaded = [];
  let section = null;

  for (const raw of block.split(/\r?\n/).slice(1)) {
    const line = cleanMarkdownLine(raw);
    if (!line) continue;
    if (/^\s*```/.test(raw)) break;
    if (isSkillUsageHeader(line)) continue;
    if (isNextBlockHeader(line)) break;

    const requiredMatch = line.match(/^required(?:\s+skills?)?\s*:\s*(.*)$/i);
    if (requiredMatch) {
      section = 'required';
      required.push(...extractSkillEntries(requiredMatch[1]));
      continue;
    }
    const loadedMatch = line.match(/^loaded(?:\s+skills?)?\s*:\s*(.*)$/i);
    if (loadedMatch) {
      section = 'loaded';
      loaded.push(...extractSkillEntries(loadedMatch[1]));
      continue;
    }
    if (!section) continue;
    const entries = extractSkillEntries(line);
    if (section === 'required') required.push(...entries);
    if (section === 'loaded') loaded.push(...entries);
  }

  return { required: uniqueValues(required), loaded: uniqueValues(loaded) };
}

function findDeniedSkills(output, requiredSkills) {
  const lower = output.toLowerCase();
  return requiredSkills.filter((skill) => {
    const escaped = escapeRegExp(skill.toLowerCase());
    return new RegExp(`did not load\\s+${escaped}|without loading\\s+${escaped}|未加载\\s*${escaped}|没有加载\\s*${escaped}`).test(lower);
  });
}

function isPlaceholder(entry) {
  const normalized = normalizeSkillName(entry);
  return placeholderValues.has(normalized) || normalized.includes('todo') || normalized.includes('required skill');
}

function buildMessage({ missing, invalid, denied }) {
  const parts = [];
  if (missing.length) parts.push(`Missing loaded skills: ${missing.join(', ')}`);
  if (invalid.length) parts.push(`Invalid loaded skill entries: ${invalid.join(', ')}`);
  if (denied.length) parts.push(`Denied required skill loading: ${denied.join(', ')}`);
  return parts.join('; ');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sliceUsageBlock(lines, start) {
  const block = [];
  for (const line of lines.slice(start)) {
    if (/^\s*```/.test(line)) break;
    block.push(line);
  }
  return block.join('\n');
}

function isSkillUsageHeader(line) {
  return normalizeHeader(line) === 'SKILL_USAGE';
}

function isNextBlockHeader(line) {
  const cleaned = cleanMarkdownLine(line).replace(/:$/, '').trim();
  const header = cleaned.replace(/[\s-]+/g, '_').toUpperCase();
  if (!header || header === 'SKILL_USAGE' || header === 'REQUIRED' || header === 'LOADED') return false;
  if (['SUBAGENT_USAGE', 'SUBAGENT_RESULT', 'BLOCKERS', 'EVIDENCE', 'VERIFICATION', 'RESULT', 'SUMMARY'].includes(header)) return true;
  return /^[A-Z][A-Z_ ]+$/.test(cleaned.replace(/[\s-]+/g, '_'));
}

function normalizeHeader(line) {
  return cleanMarkdownLine(line)
    .replace(/:$/, '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

function cleanMarkdownLine(line) {
  return String(line)
    .trim()
    .replace(/^#{1,6}\s*/, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function extractSkillEntries(value) {
  const cleaned = cleanSkillEntry(value);
  if (!cleaned) return [];
  return cleaned
    .split(/\s*(?:[,，;；]|\band\b)\s*/i)
    .map((entry) => cleanSkillEntry(entry))
    .filter(Boolean);
}

function cleanSkillEntry(value) {
  return cleanMarkdownLine(value)
    .replace(/^[-*+]\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/skill:\/\//gi, '')
    .replace(/\s+\((?:loaded|read|required)\)$/i, '')
    .replace(/[.。；;，,]+$/, '')
    .trim();
}

function normalizeSkillName(value) {
  return cleanSkillEntry(value)
    .replace(/^[<["'({]+/, '')
    .replace(/[>\]"')}]+$/, '')
    .trim()
    .toLowerCase();
}

function uniqueValues(values) {
  return [...new Set(values)];
}
