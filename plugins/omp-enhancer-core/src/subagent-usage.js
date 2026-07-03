export function validateSubagentUsage({ requiredSubagents = [], output = '' } = {}) {
  const required = normalizeSubagents(requiredSubagents);
  if (!required.length) return { ok: true, missing: [], forked: [], message: 'No routed subagents are required.' };

  const forked = parseSubagentUsageDetails(output);
  const forkedByAgent = new Map(forked.map((item) => [item.agent, item]));
  const missing = required.map(({ agent }) => agent).filter((agent) => !forkedByAgent.has(agent));

  if (!forked.length) {
    return {
      ok: false,
      missing,
      missingSkills: [],
      forked: [],
      message: `Missing SUBAGENT_USAGE block. Required subagents: ${required.map(({ agent }) => agent).join(', ')}.`,
    };
  }

  if (missing.length) {
    return {
      ok: false,
      missing,
      missingSkills: [],
      forked: forked.map(({ agent }) => agent),
      message: `SUBAGENT_USAGE is incomplete. Missing forked subagents: ${missing.join(', ')}.`,
    };
  }

  const missingSkills = required.flatMap(({ agent, requiredSkills }) => {
    const loaded = new Set(forkedByAgent.get(agent)?.skills ?? []);
    const skills = requiredSkills.filter((skill) => !loaded.has(skill));
    return skills.length ? [{ agent, skills }] : [];
  });

  if (missingSkills.length) {
    return {
      ok: false,
      missing: [],
      missingSkills,
      forked: forked.map(({ agent }) => agent),
      message: `SUBAGENT_USAGE is incomplete. Missing subagent skill assignments: ${formatMissingSkills(missingSkills)}.`,
    };
  }

  return {
    ok: true,
    missing: [],
    missingSkills: [],
    forked: forked.map(({ agent }) => agent),
    message: `SUBAGENT_USAGE is complete for ${required.length} required subagent(s).`,
  };
}

export function parseSubagentUsage(output = '') {
  return parseSubagentUsageDetails(output).map(({ agent }) => agent);
}

export function parseSubagentUsageDetails(output = '') {
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
  if (agent && !isGenericTaskDispatcher(value, agent)) records.push({ agent, text: collectText(value) });

  for (const [key, nested] of Object.entries(value)) {
    if (isAgentKey(key)) continue;
    collectRecords(nested, records);
  }
}

function isAgentKey(key) {
  return ['agent', 'role', 'subagent', 'subagent_type', 'subagentType'].includes(key);
}

function findAgentValue(value) {
  for (const [key, nested] of Object.entries(value)) {
    if (!isAgentKey(key) || typeof nested !== 'string') continue;
    const agent = normalizeAgent(nested);
    if (agent) return agent;
  }
  return '';
}

function isGenericTaskDispatcher(value, agent) {
  return agent === 'task' && Array.isArray(value.tasks);
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
    if (typeof value === 'string') return { agent: normalizeAgent(value), requiredSkills: [] };
    return {
      agent: normalizeAgent(value?.agent),
      requiredSkills: normalizeSkills(value?.requiredSkills ?? value?.skills ?? []),
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

function formatMissingSkills(values) {
  return values.map(({ agent, skills }) => `${agent} [${skills.join(', ')}]`).join('; ');
}
