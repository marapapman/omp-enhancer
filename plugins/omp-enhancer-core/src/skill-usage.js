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
  const missing = requiredSkills.filter((skill) => !effectiveLoaded.includes(skill));
  const ok = missing.length === 0 && invalid.length === 0 && denied.length === 0;

  return {
    ok,
    required: requiredSkills,
    loaded: effectiveLoaded,
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
  const starts = [];

  lines.forEach((line, index) => {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (!inFence && line.trim() === 'SKILL_USAGE') starts.push(index);
  });

  if (!starts.length) return null;
  return lines.slice(starts[starts.length - 1]).join('\n');
}

function parseSkillUsageBlock(block) {
  const required = [];
  const loaded = [];
  let section = null;

  for (const raw of block.split(/\r?\n/).slice(1)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^required:?$/i.test(line)) {
      section = 'required';
      continue;
    }
    if (/^loaded:?$/i.test(line)) {
      section = 'loaded';
      continue;
    }
    if (!section) continue;
    const entry = line.replace(/^[-*]\s*/, '').trim();
    if (!entry) continue;
    if (section === 'required') required.push(entry);
    if (section === 'loaded') loaded.push(entry);
  }

  return { required, loaded };
}

function findDeniedSkills(output, requiredSkills) {
  const lower = output.toLowerCase();
  return requiredSkills.filter((skill) => {
    const escaped = escapeRegExp(skill.toLowerCase());
    return new RegExp(`did not load\\s+${escaped}|without loading\\s+${escaped}|未加载\\s*${escaped}|没有加载\\s*${escaped}`).test(lower);
  });
}

function isPlaceholder(entry) {
  const normalized = entry.trim().toLowerCase();
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
