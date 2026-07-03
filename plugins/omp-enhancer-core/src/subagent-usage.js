export function validateSubagentUsage({ requiredSubagents = [], output = '' } = {}) {
  const required = normalizeAgents(requiredSubagents);
  if (!required.length) return { ok: true, missing: [], forked: [], message: 'No routed subagents are required.' };

  const forked = parseSubagentUsage(output);
  const forkedSet = new Set(forked);
  const missing = required.filter((agent) => !forkedSet.has(agent));

  if (!forked.length) {
    return {
      ok: false,
      missing: required,
      forked,
      message: `Missing SUBAGENT_USAGE block. Required subagents: ${required.join(', ')}.`,
    };
  }

  if (missing.length) {
    return {
      ok: false,
      missing,
      forked,
      message: `SUBAGENT_USAGE is incomplete. Missing forked subagents: ${missing.join(', ')}.`,
    };
  }

  return {
    ok: true,
    missing: [],
    forked,
    message: `SUBAGENT_USAGE is complete for ${required.length} required subagent(s).`,
  };
}

export function parseSubagentUsage(output = '') {
  const lines = String(output).split(/\r?\n/);
  const blockIndex = lines.findIndex((line) => line.trim().toUpperCase() === 'SUBAGENT_USAGE');
  if (blockIndex === -1) return [];

  let section = null;
  const forked = [];

  for (const rawLine of lines.slice(blockIndex + 1)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^[A-Z_]+$/.test(line) && line !== 'SUBAGENT_USAGE') break;
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
    const name = normalizeAgent(match[1]);
    if (name) forked.push(name);
  }

  return [...new Set(forked)];
}

export function collectSubagentNames(event = {}) {
  const candidates = new Set();
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

  for (const root of roots) collectFromValue(root, candidates);
  return [...candidates];
}

function collectFromValue(value, candidates) {
  if (Array.isArray(value)) {
    for (const item of value) collectFromValue(item, candidates);
    return;
  }

  if (!value || typeof value !== 'object') return;

  for (const [key, nested] of Object.entries(value)) {
    if (isAgentKey(key) && typeof nested === 'string') {
      const name = normalizeAgent(nested);
      if (name) candidates.add(name);
      continue;
    }
    collectFromValue(nested, candidates);
  }
}

function isAgentKey(key) {
  return ['agent', 'subagent', 'subagent_type', 'subagentType'].includes(key);
}

function normalizeAgents(values = []) {
  return values.map((value) => normalizeAgent(value)).filter(Boolean);
}

function normalizeAgent(value) {
  if (typeof value === 'string') return value.trim().replace(/[:(].*$/, '').trim();
  if (value?.agent) return normalizeAgent(value.agent);
  return '';
}
