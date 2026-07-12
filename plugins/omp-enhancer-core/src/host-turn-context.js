const AUTOLEARN_CUSTOM_TYPE = 'autolearn-nudge';
const AUTOLEARN_PROTOCOL_MARKERS = [
  'Automated capture turn — not a user reply.',
  'The user has not yet responded to your previous turn.',
  'Do not treat this prompt as their answer, as approval to continue, or as acceptance of any pending action',
  'If your previous turn produced anything reusable, capture it now:',
  'Only capture what will genuinely help next time.',
  'Then stop. Do not run any other tools, do not resume prior work',
  "Yield and wait for the user's next prompt.",
];

export function classifyHostTurn(event = {}, ctx = {}) {
  const prompt = eventPrompt(event);
  const direct = directCustomMetadata(event);
  if (isTrustedAutolearnMetadata(direct)) {
    return { kind: 'autolearn-capture', source: 'event' };
  }

  const branch = safeBranch(ctx);
  const matchingEntries = branch
    .map(branchMessageMetadata)
    .filter((entry) => samePrompt(contentText(entry?.content), prompt));
  const currentMatchingEntry = matchingEntries.at(-1);
  if (isTrustedAutolearnMetadata(currentMatchingEntry)) {
    return { kind: 'autolearn-capture', source: 'branch' };
  }

  // A matching branch entry means host metadata is available. Do not let a
  // model/user-authored lookalike override metadata that says this is another
  // kind of message.
  if (!matchingEntries.length && matchesOfficialAutolearnProtocol(prompt)) {
    return { kind: 'autolearn-capture', source: 'protocol' };
  }

  return { kind: 'user', source: 'default' };
}

export function matchesOfficialAutolearnProtocol(prompt = '') {
  const normalized = normalizeText(prompt);
  if (!normalized.startsWith(normalizeText(AUTOLEARN_PROTOCOL_MARKERS[0]))) return false;
  return AUTOLEARN_PROTOCOL_MARKERS.every((marker) => normalized.includes(normalizeText(marker)));
}

function directCustomMetadata(event = {}) {
  const details = isRecord(event.details) ? event.details : {};
  const message = isRecord(event.message) ? event.message : {};
  return {
    customType: event.customType ?? details.customType ?? message.customType,
    display: event.display ?? details.display ?? message.display,
    attribution: event.attribution ?? details.attribution ?? message.attribution,
  };
}

function branchMessageMetadata(entry = {}) {
  if (entry.type === 'custom_message') return { ...entry, type: 'custom_message' };
  if (entry.type === 'message' && isRecord(entry.message)) {
    return entry.message.role === 'custom'
      ? { ...entry.message, type: 'custom_message' }
      : { ...entry.message, type: 'message' };
  }
  return entry;
}

function isTrustedAutolearnMetadata(value = {}) {
  if (value?.customType !== AUTOLEARN_CUSTOM_TYPE) return false;
  if (value.display !== undefined && value.display !== false) return false;
  if (value.attribution !== undefined && value.attribution !== 'user') return false;
  if (value.type !== undefined && value.type !== 'custom_message') return false;
  return true;
}

function safeBranch(ctx = {}) {
  try {
    const branch = ctx.sessionManager?.getBranch?.();
    return Array.isArray(branch) ? branch.slice(-24) : [];
  } catch {
    return [];
  }
}

function eventPrompt(event = {}) {
  return String(event.prompt ?? event.userPrompt ?? (typeof event.message === 'string' ? event.message : '') ?? '');
}

function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

function normalizeText(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function samePrompt(left, right) {
  const normalizedLeft = normalizeText(left);
  return Boolean(normalizedLeft) && normalizedLeft === normalizeText(right);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
