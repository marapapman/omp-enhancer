import { existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const placeholderValues = new Set(['todo', 'tbd', '<required skill>', '<skill>', '[skill]', 'required skill']);
const SKILL_NAMESPACE_PREFIXES = new Set(['ecc', 'omp', 'superpowers', 'vendor']);
let runtimeSkillAliases;

export function validateSkillUsage({ suggestedSkills = [], output = '', loadedSkills = [] } = {}) {
  const text = String(output);
  const authoritative = findAuthoritativeSkillUsage(text);
  const denied = findDeniedSkills(text, suggestedSkills);
  const externallyLoaded = normalizeLoadedSkills(loadedSkills, suggestedSkills);
  const outputLoaded = normalizeLoadedSkills(parseLoadedSkillEvidence(text), suggestedSkills);
  const loadedEvidence = uniqueValues([
    ...outputLoaded,
    ...externallyLoaded,
  ]);

  if (!authoritative) {
    const missing = findMissingSkills(suggestedSkills, loadedEvidence);
    const ok = missing.length === 0 && denied.length === 0;

    return {
      ok,
      suggested: suggestedSkills,
      loaded: loadedEvidence,
      missing,
      invalid: [],
      denied,
      message: ok
        ? (suggestedSkills.length ? skillEvidenceMessage({ outputLoaded, externallyLoaded }) : 'No suggested skills.')
        : (missing.length ? missingSkillUsageMessage({ missing, output: text, hasLoadedEvidence: loadedEvidence.length > 0 }) : buildMessage({ missing, invalid: [], denied })),
    };
  }

  const parsed = parseSkillUsageBlock(authoritative);
  const invalid = parsed.loaded.filter((entry) => isPlaceholder(entry));
  const effectiveLoaded = parsed.loaded.filter((entry) => !isPlaceholder(entry));
  const loaded = uniqueValues([
    ...effectiveLoaded.map((entry) => canonicalizeSkillName(entry, suggestedSkills)).filter(Boolean),
    ...outputLoaded,
    ...externallyLoaded,
  ]);
  const missing = findMissingSkills(suggestedSkills, loaded);
  const ok = missing.length === 0 && invalid.length === 0 && denied.length === 0;

  return {
    ok,
    suggested: suggestedSkills,
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

export function parseLoadedSkillEvidence(output = '') {
  const text = String(output);
  return uniqueValues([
    ...parseSkillUsage(text).loaded,
    ...parseLooseLoadedSkillEvidence(text),
    ...parseJsonLoadedSkillEvidence(text),
  ].map((entry) => cleanSkillEntry(entry)).filter((entry) => entry && !isPlaceholder(entry)));
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

function findDeniedSkills(output, suggestedSkills) {
  const lower = output.toLowerCase();
  return suggestedSkills.filter((skill) => {
    return skillNameVariants(skill).some((variant) => {
      const escaped = escapeRegExp(variant);
      return new RegExp(`did not load\\s+${escaped}|without loading\\s+${escaped}|未加载\\s*${escaped}|没有加载\\s*${escaped}`).test(lower);
    }) || hasNamespacedDenial(lower, skill);
  });
}

function skillEvidenceMessage({ outputLoaded = [], externallyLoaded = [] } = {}) {
  if (outputLoaded.length && externallyLoaded.length) return 'SKILL_USAGE ok from loaded and read skill evidence.';
  if (outputLoaded.length) return 'SKILL_USAGE ok from loaded skill evidence.';
  return 'SKILL_USAGE ok from read skill evidence.';
}

function missingSkillUsageMessage({ missing, output, hasLoadedEvidence = false }) {
  const base = `Missing SKILL_USAGE for ${missing.join(', ')}`;
  if (hasLoadedEvidence || !looksLikeAssignmentMetadataOutput(output)) return base;
  return `${base}. Validator input looks like task assignment JSON; pass the subagent final response or combined SKILL_USAGE/SUBAGENT_USAGE evidence, not the dispatch assignment.`;
}

function parseLooseLoadedSkillEvidence(output) {
  const entries = [];
  const lines = output.split(/\r?\n/);

  lines.forEach((raw, index) => {
    const line = cleanMarkdownLine(raw);
    if (!line) return;

    const inlineLoaded = line.match(/^["'`]?skills[_\s-]*loaded["'`]?\s*[:=]\s*(.*)$/i)
      || line.match(/^["'`]?loaded[_\s-]*skills["'`]?\s*[:=]\s*(.*)$/i)
      || line.match(/^skills\s+loaded\s*[:=]\s*(.*)$/i);
    if (!inlineLoaded) return;

    const value = inlineLoaded[1].trim();
    if (value) {
      entries.push(...extractSkillEntries(value));
      return;
    }

    entries.push(...extractFollowingSkillEntries(lines, index + 1));
  });

  return entries;
}

function parseJsonLoadedSkillEvidence(output) {
  const entries = [];
  for (const value of parseJsonEvidenceValues(output)) {
    collectJsonLoadedEvidence(value, entries);
  }
  return entries;
}

function collectJsonLoadedEvidence(value, entries, key = '') {
  if (typeof value === 'string') {
    if (isJsonTextEvidenceKey(key)) entries.push(...skillTextEvidenceEntries(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLoadedEvidence(item, entries, key));
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, field] of Object.entries(value)) {
    const normalized = normalizeJsonEvidenceKey(key);
    if (normalized === 'skillusage') {
      entries.push(...skillUsageValueToEntries(field));
      continue;
    }
    if (isGlobalLoadedSkillEvidenceKey(normalized)) {
      entries.push(...jsonSkillValueToEntries(field));
      continue;
    }
    collectJsonLoadedEvidence(field, entries, normalized);
  }
}

function skillUsageValueToEntries(value) {
  if (typeof value === 'string') {
    const block = findAuthoritativeSkillUsage(value);
    return block ? parseSkillUsageBlock(block).loaded : extractSkillEntries(value);
  }
  if (Array.isArray(value)) return value.flatMap((item) => jsonSkillValueToEntries(item));
  if (!isRecord(value)) return [];

  const entries = [];
  for (const [key, field] of Object.entries(value)) {
    if (isSkillUsageLoadedKey(normalizeJsonEvidenceKey(key))) {
      entries.push(...jsonSkillValueToEntries(field));
    }
  }
  return entries;
}

function jsonSkillValueToEntries(value) {
  if (typeof value === 'string') return extractSkillEntries(value);
  if (Array.isArray(value)) return value.flatMap((item) => jsonSkillValueToEntries(item));
  if (isRecord(value)) {
    const direct = value.skill ?? value.skillName ?? value.name ?? value.id;
    if (typeof direct === 'string') return extractSkillEntries(direct);
    return skillUsageValueToEntries(value);
  }
  return [];
}

function skillTextEvidenceEntries(text) {
  return [
    ...parseSkillUsage(text).loaded,
    ...parseLooseLoadedSkillEvidence(text),
  ];
}

function parseJsonEvidenceValues(output) {
  const values = [];
  for (const candidate of jsonEvidenceCandidates(output)) {
    try {
      values.push(JSON.parse(candidate));
    } catch {
      // Ignore non-JSON fragments; this is a compatibility fallback for model output.
    }
  }
  return values;
}

function jsonEvidenceCandidates(output) {
  const text = String(output);
  const candidates = new Set();
  const trimmed = text.trim();
  if (/^[\[{]/.test(trimmed)) candidates.add(trimmed);

  const fencePattern = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  for (const match of text.matchAll(fencePattern)) {
    const candidate = match[1]?.trim();
    if (candidate) candidates.add(candidate);
  }

  for (const candidate of balancedJsonFragments(text)) {
    candidates.add(candidate);
  }

  return [...candidates].filter((candidate) => candidate.length <= 100000);
}

function balancedJsonFragments(text) {
  const fragments = [];
  for (let index = 0; index < text.length && fragments.length < 20; index += 1) {
    if (!isLikelyJsonStart(text, index)) continue;
    const end = findJsonFragmentEnd(text, index);
    if (end > index) fragments.push(text.slice(index, end));
  }
  return fragments;
}

function isLikelyJsonStart(text, index) {
  const char = text[index];
  if (char !== '{' && char !== '[') return false;
  const next = nextNonWhitespace(text, index + 1);
  if (char === '{') return next === '"' || next === '}';
  return next === '"' || next === '{' || next === '[' || next === ']';
}

function nextNonWhitespace(text, start) {
  for (let index = start; index < text.length; index += 1) {
    if (!/\s/.test(text[index])) return text[index];
  }
  return '';
}

function findJsonFragmentEnd(text, start) {
  const stack = [text[start] === '{' ? '}' : ']'];
  let inString = false;
  let escaped = false;

  for (let index = start + 1; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      stack.push('}');
      continue;
    }
    if (char === '[') {
      stack.push(']');
      continue;
    }
    if (char !== '}' && char !== ']') continue;
    if (stack.at(-1) !== char) return -1;
    stack.pop();
    if (!stack.length) return index + 1;
  }

  return -1;
}

function extractFollowingSkillEntries(lines, start) {
  const entries = [];
  for (const raw of lines.slice(start)) {
    const line = cleanMarkdownLine(raw);
    if (!line) {
      if (entries.length) break;
      continue;
    }
    if (/^\s*```/.test(raw)) {
      if (entries.length) break;
      continue;
    }
    if (isSkillEvidenceBoundary(line)) break;

    const bullet = line.match(/^[-*+]\s*(.+)$/);
    if (bullet) {
      entries.push(...extractSkillEntries(bullet[1]));
      continue;
    }

    const quoted = line.match(/^["']([^"']+)["']\s*,?$/);
    if (quoted) {
      entries.push(...extractSkillEntries(quoted[1]));
      continue;
    }

    if (isSkillTokenListLine(line)) {
      entries.push(...extractSkillEntries(line));
      continue;
    }

    break;
  }
  return entries;
}

function isSkillEvidenceBoundary(line) {
  if (isNextBlockHeader(line)) return true;
  if (/^[}\]]\s*,?$/.test(line)) return true;
  if (/^[A-Za-z0-9_ -]+\s*:\s*\S/.test(line)) return true;
  return false;
}

function isSkillTokenListLine(line) {
  return /^[\[\]"'`A-Za-z0-9_.\/-][\[\]"'`A-Za-z0-9_.\/,\s-]*\]?,?$/.test(line);
}

function looksLikeAssignmentMetadataOutput(output) {
  return parseJsonEvidenceValues(output).some((value) => hasAssignmentMetadata(value));
}

function hasAssignmentMetadata(value) {
  if (Array.isArray(value)) return value.some((item) => hasAssignmentMetadata(item));
  if (!isRecord(value)) return false;

  const keys = new Set(Object.keys(value).map((key) => normalizeJsonEvidenceKey(key)));
  if (keys.has('assignment') && (keys.has('requiredskills') || keys.has('agent') || keys.has('role') || keys.has('task'))) {
    return true;
  }

  return Object.values(value).some((item) => hasAssignmentMetadata(item));
}

function isGlobalLoadedSkillEvidenceKey(key) {
  return key === 'skillsloaded' || key === 'loadedskills';
}

function isSkillUsageLoadedKey(key) {
  return key === 'loaded' || key === 'skills' || isGlobalLoadedSkillEvidenceKey(key);
}

function isJsonTextEvidenceKey(key) {
  return ['content', 'message', 'output', 'outputtext', 'response', 'result', 'results', 'text', 'value', 'finalmessage', 'finaloutput', 'finalresponse', 'subagentoutput', 'stdout'].includes(key);
}

function normalizeJsonEvidenceKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPlaceholder(entry) {
  const normalized = normalizeSkillToken(entry);
  return placeholderValues.has(normalized) || normalized.includes('todo') || normalized.includes('required skill');
}

function buildMessage({ missing, invalid, denied }) {
  const parts = [];
  if (missing.length) parts.push(`Missing loaded skills: ${missing.join(', ')}`);
  if (invalid.length) parts.push(`Invalid loaded skill entries: ${invalid.join(', ')}`);
  if (denied.length) parts.push(`Declined suggested skill loading: ${denied.join(', ')}`);
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

export function normalizeSkillName(value) {
  const normalized = normalizeSkillToken(value);
  return lookupSkillAlias(normalized) || normalized;
}

export function skillNamesEquivalent(expectedSkill, loadedSkill) {
  const expected = normalizeSkillName(expectedSkill);
  const loaded = normalizeSkillName(loadedSkill);
  if (!expected || !loaded) return false;
  if (expected === loaded) return true;

  const rawExpected = normalizeSkillToken(expectedSkill);
  const rawLoaded = normalizeSkillToken(loadedSkill);
  if (rawExpected && rawLoaded && rawExpected === rawLoaded) return true;
  if (rawLoaded && hasNamespacedSuffix(rawLoaded, expected)) return true;
  if (rawExpected && hasNamespacedSuffix(rawExpected, loaded)) return true;
  if (rawLoaded && skillNameVariants(expected).includes(rawLoaded)) return true;
  return false;
}

export function skillReadNameCandidates(skill, { limit = 3, roots = defaultSkillAliasRoots() } = {}) {
  const normalized = normalizeSkillToken(skill);
  if (!normalized) return [];

  const candidates = collectSkillAliasCandidates(roots)
    .filter((candidate) => skillNamesEquivalent(skill, candidate.name) || skillNamesEquivalent(skill, candidate.canonical))
    .sort((left, right) => skillCandidateScore(skill, left) - skillCandidateScore(skill, right))
    .map((candidate) => candidate.name);

  const fallback = normalizeSkillName(skill) || normalized;
  return uniqueValues([...candidates, fallback]).slice(0, limit);
}

export function buildSkillAliasMapFromRoots(roots = []) {
  const aliases = new Map();
  for (const root of roots) {
    if (!root || !existsSync(root)) continue;
    collectSkillAliases(root, root, aliases);
  }

  const unambiguous = new Map();
  for (const [alias, canonicalNames] of aliases.entries()) {
    if (canonicalNames.size === 1) unambiguous.set(alias, [...canonicalNames][0]);
  }
  return unambiguous;
}

function normalizeSkillToken(value) {
  return cleanSkillEntry(value)
    .replace(/^[<["'({]+/, '')
    .replace(/[>\]"')}]+$/, '')
    .trim()
    .toLowerCase();
}

function canonicalizeSkillName(value, suggestedSkills = []) {
  const normalized = normalizeSkillToken(value);
  if (!normalized) return '';
  const suggestedMatch = suggestedSkills.find((skill) => skillNamesEquivalent(skill, normalized));
  if (suggestedMatch) return normalizeSkillName(suggestedMatch);
  return lookupSkillAlias(normalized) || normalized;
}

function normalizeLoadedSkills(skills, suggestedSkills = []) {
  const values = Array.isArray(skills) || skills instanceof Set ? [...skills] : [];
  return uniqueValues(values.map((entry) => canonicalizeSkillName(entry, suggestedSkills)).filter(Boolean));
}

function findMissingSkills(suggestedSkills, loadedSkills) {
  return suggestedSkills.filter((skill) => !loadedSkills.some((loaded) => skillNamesEquivalent(skill, loaded)));
}

function skillNameVariants(skill) {
  const canonical = normalizeSkillName(skill);
  return uniqueValues([
    canonical,
    normalizeSkillToken(skill),
    ...[...runtimeAliasMap().entries()]
      .filter(([, value]) => value === canonical)
      .map(([alias]) => alias),
  ].filter(Boolean));
}

function lookupSkillAlias(value) {
  if (!value) return '';
  return runtimeAliasMap().get(value) ?? '';
}

function hasNamespacedSuffix(value, suffix) {
  if (!suffix.includes('-')) return false;
  for (const separator of ['-', '/']) {
    const tail = `${separator}${suffix}`;
    if (!value.endsWith(tail)) continue;
    const namespace = value.slice(0, -tail.length).split(/[-/]/)[0];
    if (SKILL_NAMESPACE_PREFIXES.has(namespace)) return true;
  }
  return false;
}

function hasNamespacedDenial(output, skill) {
  const canonical = normalizeSkillName(skill);
  if (!canonical.includes('-')) return false;
  const namespaced = `(?:[a-z0-9_]+[-/])*${escapeRegExp(canonical)}`;
  return new RegExp(`did not load\\s+${namespaced}|without loading\\s+${namespaced}|未加载\\s*${namespaced}|没有加载\\s*${namespaced}`).test(output);
}

function runtimeAliasMap() {
  if (!runtimeSkillAliases) runtimeSkillAliases = buildSkillAliasMapFromRoots(defaultSkillAliasRoots());
  return runtimeSkillAliases;
}

function defaultSkillAliasRoots() {
  const roots = [];
  if (process.env.OMP_ENHANCER_SKILL_ROOTS) {
    roots.push(...process.env.OMP_ENHANCER_SKILL_ROOTS.split(path.delimiter));
  }

  const moduleFile = fileURLToPath(import.meta.url);
  const pluginRoot = path.dirname(path.dirname(moduleFile));
  const pluginParent = path.dirname(pluginRoot);
  const repoRoot = path.dirname(pluginParent);

  roots.push(
    path.join(repoRoot, 'plugins', 'omp-config', 'skills'),
    path.join(repoRoot, 'plugins', 'writing-helper', 'skills'),
    ...skillRootsUnder(pluginParent),
    path.join(os.homedir(), '.omp', 'agent', 'managed-skills'),
    path.join(os.homedir(), '.omp', 'agent', 'skills'),
  );

  return uniqueValues(roots).filter((root) => root && existsSync(root));
}

function skillRootsUnder(parent) {
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(parent, entry.name, 'skills'))
      .filter((root) => existsSync(root));
  } catch {
    return [];
  }
}

function collectSkillAliasCandidates(roots = []) {
  const candidates = [];
  for (const root of roots) {
    if (!root || !existsSync(root)) continue;
    collectSkillAliasCandidateRecords(root, root, rootKind(root), candidates);
  }
  return candidates;
}

function collectSkillAliasCandidateRecords(root, current, kind, candidates) {
  let entries;
  try {
    entries = readdirSync(current, { withFileTypes: true });
  } catch {
    return;
  }

  const skillFile = path.join(current, 'SKILL.md');
  if (existsSync(skillFile)) {
    addSkillFileAliasCandidates(root, current, skillFile, kind, candidates);
  }

  for (const entry of entries) {
    if (entry.isDirectory()) collectSkillAliasCandidateRecords(root, path.join(current, entry.name), kind, candidates);
  }
}

function addSkillFileAliasCandidates(root, skillDir, skillFile, kind, candidates) {
  let text = '';
  try {
    text = readFileSync(skillFile, 'utf8');
  } catch {
    return;
  }

  const relativePath = path.relative(root, skillDir).split(path.sep).join('/');
  if (!relativePath || relativePath.startsWith('..')) return;

  const leafName = relativePath.split('/').pop();
  const canonical = normalizeSkillToken(skillFrontmatterName(text) || leafName);
  for (const name of [canonical, leafName, relativePath, relativePath.replace(/\//g, '-')]) {
    const normalizedName = normalizeSkillToken(name);
    if (normalizedName) candidates.push({ name: normalizedName, canonical, kind, skillFile });
  }
}

function rootKind(root) {
  return String(root).includes(path.join('.omp', 'agent')) ? 'managed' : 'packaged';
}

function skillCandidateScore(skill, candidate) {
  const requested = normalizeSkillToken(skill);
  const packaged = candidate.kind === 'packaged';
  if (candidate.name === requested) return packaged ? 0 : 1;
  if (candidate.canonical === requested) return packaged ? 2 : 3;
  if (packaged) return candidate.name.includes('/') ? 5 : 4;
  return candidate.name.includes('/') ? 7 : 6;
}

function collectSkillAliases(root, current, aliases) {
  let entries;
  try {
    entries = readdirSync(current, { withFileTypes: true });
  } catch {
    return;
  }

  const skillFile = path.join(current, 'SKILL.md');
  if (existsSync(skillFile)) {
    addSkillFileAliases(root, current, skillFile, aliases);
  }

  for (const entry of entries) {
    if (entry.isDirectory()) collectSkillAliases(root, path.join(current, entry.name), aliases);
  }
}

function addSkillFileAliases(root, skillDir, skillFile, aliases) {
  let text = '';
  try {
    text = readFileSync(skillFile, 'utf8');
  } catch {
    return;
  }

  const relativePath = path.relative(root, skillDir).split(path.sep).join('/');
  if (!relativePath || relativePath.startsWith('..')) return;

  const leafName = relativePath.split('/').pop();
  const canonical = normalizeSkillToken(skillFrontmatterName(text) || leafName);
  for (const alias of [canonical, leafName, relativePath, relativePath.replace(/\//g, '-')]) {
    addAlias(aliases, alias, canonical);
  }
}

function addAlias(aliases, alias, canonical) {
  const normalizedAlias = normalizeSkillToken(alias);
  const normalizedCanonical = normalizeSkillToken(canonical);
  if (!normalizedAlias || !normalizedCanonical) return;
  if (!aliases.has(normalizedAlias)) aliases.set(normalizedAlias, new Set());
  aliases.get(normalizedAlias).add(normalizedCanonical);
}

function skillFrontmatterName(text) {
  const frontmatter = String(text).match(/^---\s*\n([\s\S]*?)\n---/);
  const source = frontmatter?.[1] ?? String(text);
  const match = source.match(/^name:\s*['"]?([^'"\r\n]+)['"]?\s*$/m);
  return match?.[1]?.trim() ?? '';
}

function uniqueValues(values) {
  return [...new Set(values)];
}
