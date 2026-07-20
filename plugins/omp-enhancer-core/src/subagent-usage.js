import { skillNamesEquivalent } from './skill-usage.js';
import { jsonEvidenceCandidates } from './json-candidates.js';

export function validateSubagentUsage({ suggestedAgents = [], output = '' } = {}) {
  const suggested = normalizeSubagents(suggestedAgents);
  if (!suggested.length) return { ok: true, missing: [], missingSkills: [], unexpectedSkills: [], forked: [], message: 'No Agent candidates were supplied.' };

  const forked = parseSubagentUsageDetails(output);
  const forkedByAgent = new Map(forked.map((item) => [item.agent, item]));
  const missing = suggested.map(({ agent }) => agent).filter((agent) => !forkedByAgent.has(agent));

  if (!forked.length) {
    return {
      ok: false,
      missing,
      missingSkills: [],
      unexpectedSkills: [],
      forked: [],
      message: `Missing SUBAGENT_USAGE block. Unobserved Agent candidates: ${suggested.map(({ agent }) => agent).join(', ')}.`,
    };
  }

  if (missing.length) {
    return {
      ok: false,
      missing,
      missingSkills: [],
      unexpectedSkills: [],
      forked: forked.map(({ agent }) => agent),
      message: `SUBAGENT_USAGE is incomplete. Missing forked subagents: ${missing.join(', ')}.`,
    };
  }

  const missingSkills = suggested.flatMap(({ agent, suggestedSkills }) => {
    const loaded = forkedByAgent.get(agent)?.skills ?? [];
    const skills = suggestedSkills.filter((skill) => !hasEquivalentSkill(loaded, skill));
    return skills.length ? [{ agent, skills }] : [];
  });

  if (missingSkills.length) {
    return {
      ok: false,
      missing: [],
      missingSkills,
      unexpectedSkills: [],
      forked: forked.map(({ agent }) => agent),
      message: `SUBAGENT_USAGE is incomplete. Missing subagent skill assignments: ${formatMissingSkills(missingSkills)}.`,
    };
  }

  const unexpectedSkills = suggested.flatMap(({ agent, suggestedSkills, enforceSkills }) => {
    if (!enforceSkills) return [];
    const unexpected = (forkedByAgent.get(agent)?.skills ?? [])
      .filter((skill) => !hasEquivalentSuggestedSkill(suggestedSkills, skill));
    return unexpected.length ? [{ agent, skills: unexpected }] : [];
  });

  if (unexpectedSkills.length) {
    return {
      ok: false,
      missing: [],
      missingSkills: [],
      unexpectedSkills,
      forked: forked.map(({ agent }) => agent),
      message: `SUBAGENT_USAGE includes unexpected subagent skill assignments: ${formatMissingSkills(unexpectedSkills)}.`,
    };
  }

  return {
    ok: true,
    missing: [],
    missingSkills: [],
    unexpectedSkills: [],
    forked: forked.map(({ agent }) => agent),
    message: `SUBAGENT_USAGE observed all ${suggested.length} Agent candidate(s).`,
  };
}

export function parseSubagentUsageDetails(output = '') {
  const forked = [];
  for (const text of subagentUsageTextCandidates(output)) {
    forked.push(...parsePlainSubagentUsageDetails(text));
  }
  return uniqueSubagentUsage(forked);
}

function parsePlainSubagentUsageDetails(output = '') {
  const lines = String(output).split(/\r?\n/);
  const blockIndex = lines.findIndex((line) => isSubagentUsageHeader(line));
  if (blockIndex === -1) return [];

  let section = 'forked';
  const forked = [];

  for (const rawLine of lines.slice(blockIndex + 1)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (isSubagentUsageHeader(line)) continue;
    if (isNextBlockHeader(line)) break;
    if (/^Required:/i.test(line)) {
      section = 'required';
      continue;
    }
    if (/^Forked:/i.test(line)) {
      section = 'forked';
      continue;
    }
    if (section !== 'forked') continue;

    const match = line.match(/^[-*]\s*(.+)$/);
    if (!match) continue;
    const parsed = parseSubagentLine(match[1]);
    if (parsed.agent) forked.push(parsed);
  }

  return uniqueSubagentUsage(forked);
}

function subagentUsageTextCandidates(output = '') {
  const text = String(output);
  return uniqueStrings([
    text,
    ...jsonEnvelopeOutputTexts(text),
  ]);
}

function jsonEnvelopeOutputTexts(output = '') {
  const texts = [];
  for (const candidate of jsonEvidenceCandidates(output)) {
    try {
      collectJsonEnvelopeOutputTexts(JSON.parse(candidate), texts);
    } catch {
      // Ignore non-JSON fragments; task results are often plain text.
    }
  }
  return texts;
}

function collectJsonEnvelopeOutputTexts(value, texts, key = '') {
  if (typeof value === 'string') {
    if (isJsonTextEvidenceKey(key) && /\bSUBAGENT_USAGE\b/i.test(value)) texts.push(value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonEnvelopeOutputTexts(item, texts, key));
    return;
  }
  if (!value || typeof value !== 'object') return;

  for (const [fieldKey, fieldValue] of Object.entries(value)) {
    collectJsonEnvelopeOutputTexts(fieldValue, texts, normalizeJsonKey(fieldKey));
  }
}

function normalizeSubagents(values = []) {
  return values.map((value) => {
    if (typeof value === 'string') return { agent: normalizeAgent(value), suggestedSkills: [], enforceSkills: false };
    return {
      agent: normalizeAgent(value?.agent),
      suggestedSkills: normalizeSkills(value?.suggestedSkills ?? value?.skills ?? []),
      enforceSkills: true,
    };
  }).filter(({ agent }) => agent);
}

function normalizeAgent(value) {
  if (typeof value === 'string') return value.trim().replace(/[:(].*$/, '').trim();
  if (value?.agent) return normalizeAgent(value.agent);
  return '';
}

function isSubagentUsageHeader(line) {
  return String(line)
    .trim()
    .replace(/^#+\s*/, '')
    .replace(/:$/, '')
    .trim()
    .toUpperCase() === 'SUBAGENT_USAGE';
}

function isNextBlockHeader(line) {
  const normalized = String(line).trim().replace(/^#+\s*/, '').replace(/:$/, '').trim();
  if (!normalized) return false;
  if (normalized.toUpperCase() === 'SKILL_USAGE') return true;
  if (/^[A-Z][A-Z_ ]+$/.test(normalized) && normalized.toUpperCase() !== 'SUBAGENT_USAGE') return true;
  return /^#{1,6}\s+\S/.test(String(line).trim()) && normalized.toUpperCase() !== 'SUBAGENT_USAGE';
}

function parseSubagentLine(value) {
  const [agentPart, skillsPart = ''] = String(value).split(/:(.*)/s);
  return {
    agent: normalizeAgent(agentPart),
    skills: normalizeSkills(skillsPart),
  };
}

function normalizeSkills(values = []) {
  const raw = Array.isArray(values) ? values : String(values).split(/[,，]/);
  return raw
    .map((value) => String(value).trim().replace(/^skills?\s*[:=]\s*/i, ''))
    .filter((value) => value && value.toLowerCase() !== 'none');
}

function isJsonTextEvidenceKey(key) {
  return ['content', 'message', 'output', 'outputtext', 'response', 'result', 'results', 'text', 'value', 'finalmessage', 'finaloutput', 'finalresponse', 'subagentoutput', 'stdout'].includes(key);
}

function normalizeJsonKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function hasEquivalentSkill(loadedSkills = [], suggestedSkill = '') {
  return loadedSkills.some((loadedSkill) => skillNamesEquivalent(suggestedSkill, loadedSkill));
}

function hasEquivalentSuggestedSkill(suggestedSkills = [], loadedSkill = '') {
  return suggestedSkills.some((suggestedSkill) => skillNamesEquivalent(suggestedSkill, loadedSkill));
}

function uniqueSubagentUsage(values) {
  const byAgent = new Map();
  for (const { agent, skills } of values) {
    const current = byAgent.get(agent) ?? new Set();
    for (const skill of skills) current.add(skill);
    byAgent.set(agent, current);
  }
  return [...byAgent.entries()].map(([agent, skills]) => ({ agent, skills: [...skills] }));
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value)).filter(Boolean))];
}

function formatMissingSkills(values) {
  return values.map(({ agent, skills }) => `${agent} [${skills.join(', ')}]`).join('; ');
}
