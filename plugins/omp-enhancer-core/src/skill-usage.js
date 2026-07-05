import { existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const placeholderValues = new Set(['todo', 'tbd', '<required skill>', '<skill>', '[skill]', 'required skill']);
let runtimeSkillAliases;

export function validateSkillUsage({ requiredSkills = [], output = '', loadedSkills = [] } = {}) {
  const authoritative = findAuthoritativeSkillUsage(String(output));
  const denied = findDeniedSkills(String(output), requiredSkills);
  const externallyLoaded = normalizeLoadedSkills(loadedSkills, requiredSkills);

  if (!authoritative) {
    const missing = findMissingSkills(requiredSkills, externallyLoaded);
    const ok = missing.length === 0 && denied.length === 0;

    return {
      ok,
      required: requiredSkills,
      loaded: externallyLoaded,
      missing,
      invalid: [],
      denied,
      message: ok
        ? (requiredSkills.length ? 'SKILL_USAGE ok from read skill evidence.' : 'No required skills.')
        : (missing.length ? `Missing SKILL_USAGE for ${missing.join(', ')}` : buildMessage({ missing, invalid: [], denied })),
    };
  }

  const parsed = parseSkillUsageBlock(authoritative);
  const invalid = parsed.loaded.filter((entry) => isPlaceholder(entry));
  const effectiveLoaded = parsed.loaded.filter((entry) => !isPlaceholder(entry));
  const loaded = uniqueValues([
    ...effectiveLoaded.map((entry) => canonicalizeSkillName(entry, requiredSkills)).filter(Boolean),
    ...externallyLoaded,
  ]);
  const missing = findMissingSkills(requiredSkills, loaded);
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
    return skillNameVariants(skill).some((variant) => {
      const escaped = escapeRegExp(variant);
      return new RegExp(`did not load\\s+${escaped}|without loading\\s+${escaped}|未加载\\s*${escaped}|没有加载\\s*${escaped}`).test(lower);
    }) || hasNamespacedDenial(lower, skill);
  });
}

function isPlaceholder(entry) {
  const normalized = normalizeSkillToken(entry);
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

export function normalizeSkillName(value) {
  const normalized = normalizeSkillToken(value);
  return lookupSkillAlias(normalized) || normalized;
}

export function skillNamesEquivalent(requiredSkill, loadedSkill) {
  const required = normalizeSkillName(requiredSkill);
  const loaded = normalizeSkillName(loadedSkill);
  if (!required || !loaded) return false;
  if (required === loaded) return true;

  const rawRequired = normalizeSkillToken(requiredSkill);
  const rawLoaded = normalizeSkillToken(loadedSkill);
  if (rawRequired && rawLoaded && rawRequired === rawLoaded) return true;
  if (rawLoaded && hasNamespacedSuffix(rawLoaded, required)) return true;
  if (rawLoaded && skillNameVariants(required).includes(rawLoaded)) return true;
  return false;
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

function canonicalizeSkillName(value, requiredSkills = []) {
  const normalized = normalizeSkillToken(value);
  if (!normalized) return '';
  const aliased = lookupSkillAlias(normalized);
  if (aliased) return aliased;
  const requiredMatch = requiredSkills.find((skill) => skillNamesEquivalent(skill, normalized));
  return requiredMatch ? normalizeSkillName(requiredMatch) : normalized;
}

function normalizeLoadedSkills(skills, requiredSkills = []) {
  const values = Array.isArray(skills) || skills instanceof Set ? [...skills] : [];
  return uniqueValues(values.map((entry) => canonicalizeSkillName(entry, requiredSkills)).filter(Boolean));
}

function findMissingSkills(requiredSkills, loadedSkills) {
  return requiredSkills.filter((skill) => !loadedSkills.some((loaded) => skillNamesEquivalent(skill, loaded)));
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
  return suffix.includes('-') && (value.endsWith(`-${suffix}`) || value.endsWith(`/${suffix}`));
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
    return;
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
