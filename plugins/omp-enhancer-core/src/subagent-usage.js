import { skillNamesEquivalent } from './skill-usage.js';

const chatMessageRoles = new Set(['assistant', 'developer', 'system', 'tool', 'user']);

export function validateSubagentUsage({ requiredSubagents = [], output = '' } = {}) {
  const required = normalizeSubagents(requiredSubagents);
  if (!required.length) return { ok: true, missing: [], missingSkills: [], unexpectedSkills: [], forked: [], message: 'No routed subagents are required.' };

  const forked = parseSubagentUsageDetails(output);
  const forkedByAgent = new Map(forked.map((item) => [item.agent, item]));
  const missing = required.map(({ agent }) => agent).filter((agent) => !forkedByAgent.has(agent));

  if (!forked.length) {
    return {
      ok: false,
      missing,
      missingSkills: [],
      unexpectedSkills: [],
      forked: [],
      message: `Missing SUBAGENT_USAGE block. Required subagents: ${required.map(({ agent }) => agent).join(', ')}.`,
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

  const missingSkills = required.flatMap(({ agent, requiredSkills }) => {
    const loaded = forkedByAgent.get(agent)?.skills ?? [];
    const skills = requiredSkills.filter((skill) => !hasEquivalentSkill(loaded, skill));
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

  const unexpectedSkills = required.flatMap(({ agent, requiredSkills, enforceSkills }) => {
    if (!enforceSkills) return [];
    const unexpected = (forkedByAgent.get(agent)?.skills ?? [])
      .filter((skill) => !hasEquivalentRequiredSkill(requiredSkills, skill));
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
    message: `SUBAGENT_USAGE is complete for ${required.length} required subagent(s).`,
  };
}

export function parseSubagentUsage(output = '') {
  return parseSubagentUsageDetails(output).map(({ agent }) => agent);
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
  for (const candidate of jsonEnvelopeCandidates(output)) {
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

function jsonEnvelopeCandidates(output = '') {
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

export function collectSubagentNames(event = {}) {
  return collectSubagentTaskRecords(event).map(({ agent }) => agent);
}

export function collectSubagentTaskRecords(event = {}) {
  const records = [];
  const roots = [
    event,
    event.params,
    event.arguments,
    event.args,
    event.input,
    event.request,
    event.details,
    event.result,
  ].filter(Boolean);

  for (const root of roots) collectRecords(root, records);
  return uniqueRecords(records);
}

function collectRecords(value, records) {
  if (Array.isArray(value)) {
    for (const item of value) collectRecords(item, records);
    return;
  }

  if (!value || typeof value !== 'object') return;

  const agent = findAgentValue(value);
  if (agent && !isGenericTaskDispatcher(value, agent)) {
    const text = collectText(value);
    records.push({ agent, text, skills: parseRequiredSkillList(text) });
  }

  for (const [key, nested] of Object.entries(value)) {
    if (isAgentKey(key)) continue;
    collectRecords(nested, records);
  }
}

function isAgentKey(key) {
  return ['agent', 'role', 'subagent', 'subagent_type', 'subagentType'].includes(key);
}

function findAgentValue(value) {
  const explicitAgent = findExplicitAgentValue(value);
  if (explicitAgent && isGenericTaskDispatcher(value, explicitAgent)) return explicitAgent;

  const markerAgent = parseRequiredSubagentMarker(collectOwnText(value));
  if (markerAgent) return markerAgent;

  if (explicitAgent) return explicitAgent;

  const roleAgent = findRoleAgentValue(value);
  if (roleAgent) return roleAgent;

  return '';
}

function findExplicitAgentValue(value) {
  for (const key of ['agent', 'subagent', 'subagent_type', 'subagentType']) {
    const nested = value[key];
    if (typeof nested !== 'string') continue;
    const agent = normalizeAgent(nested);
    if (isUsableAgentName(agent)) return agent;
  }
  return '';
}

function isGenericTaskDispatcher(value, agent) {
  return agent === 'task' && Array.isArray(value.tasks);
}

function findRoleAgentValue(value) {
  if (typeof value.role !== 'string') return '';
  const agent = normalizeAgent(value.role);
  return isPlausibleRoleAgent(agent) ? agent : '';
}

function isPlausibleRoleAgent(agent) {
  return isUsableAgentName(agent) && /^[a-z][a-z0-9_.-]*$/i.test(agent);
}

function isUsableAgentName(agent) {
  return Boolean(agent) && !chatMessageRoles.has(agent.toLowerCase());
}

function parseRequiredSubagentMarker(text = '') {
  const match = String(text).match(/(?:^|\n)\s*OMP_REQUIRED_SUBAGENT:\s*([^\r\n]+)/i);
  return match ? normalizeAgent(match[1]) : '';
}

function collectOwnText(value) {
  return Object.entries(value)
    .filter(([key]) => !isAgentKey(key) && key !== 'tasks')
    .map(([, nested]) => collectShallowText(nested))
    .join('\n');
}

function collectShallowText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .filter((item) => typeof item === 'string')
      .join('\n');
  }
  return '';
}

function collectText(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => collectText(item)).join('\n');
  if (!value || typeof value !== 'object') return '';
  return Object.entries(value)
    .filter(([key]) => !isAgentKey(key))
    .map(([, nested]) => collectText(nested))
    .join('\n');
}

function normalizeSubagents(values = []) {
  return values.map((value) => {
    if (typeof value === 'string') return { agent: normalizeAgent(value), requiredSkills: [], enforceSkills: false };
    return {
      agent: normalizeAgent(value?.agent),
      requiredSkills: normalizeSkills(value?.requiredSkills ?? value?.skills ?? []),
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

function hasEquivalentSkill(loadedSkills = [], requiredSkill = '') {
  return loadedSkills.some((loadedSkill) => skillNamesEquivalent(requiredSkill, loadedSkill));
}

function hasEquivalentRequiredSkill(requiredSkills = [], loadedSkill = '') {
  return requiredSkills.some((requiredSkill) => skillNamesEquivalent(requiredSkill, loadedSkill));
}

function parseRequiredSkillList(text = '') {
  const lines = String(text).split(/\r?\n/);
  const start = lines.findIndex((line) => /^Required skills for this subagent:/i.test(line.trim()));
  if (start === -1) return [];

  const skills = [];
  for (const rawLine of lines.slice(start + 1)) {
    const line = rawLine.trim();
    if (!line) {
      if (skills.length) break;
      continue;
    }
    if (/^(Workflow and gate briefing|Before acting|Final subagent output|SUBAGENT_RESULT|SKILL_USAGE|BLOCKERS|Assignment|Evidence)/i.test(line)) break;
    const match = line.match(/^[-*]\s*(.+)$/);
    if (!match) {
      if (skills.length) break;
      continue;
    }
    const skill = match[1].trim();
    if (skill && skill.toLowerCase() !== 'none') skills.push(skill);
  }
  return skills;
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

function uniqueRecords(records) {
  const byKey = new Map();
  for (const record of records) {
    const key = `${record.agent}\0${record.text}`;
    byKey.set(key, record);
  }
  return [...byKey.values()];
}

function uniqueStrings(values) {
  return [...new Set(values.map((value) => String(value)).filter(Boolean))];
}

function formatMissingSkills(values) {
  return values.map(({ agent, skills }) => `${agent} [${skills.join(', ')}]`).join('; ');
}
