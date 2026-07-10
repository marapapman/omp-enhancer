const CONTRACT_STATES = new Set(['complete', 'incomplete', 'conflicting', 'unsupported']);
const UNSUPPORTED_ACTIONS = new Set(['delete']);
const PROVIDER_ACTIONS = Object.freeze({
  email: new Set(['send']),
  slack: new Set(['post-message']),
  jira: new Set(['create-issue']),
  'google-drive': new Set(['upload-file']),
  calendar: new Set(['create-event']),
  notion: new Set(['update-page']),
});

export function analyzeExternalActionPrompt(prompt = '') {
  const original = String(prompt);
  const source = normalizeDoubleNegative(original);
  const destructive = destructiveCandidates(source);
  if (destructive.length) {
    const providers = unique(destructive.map(({ provider }) => provider));
    const nonExecuting = isNonExecutingRequest(source);
    return contract({
      state: 'unsupported',
      provider: providers.length === 1 ? providers[0] : null,
      action: destructive.length === 1 ? destructive[0].action : null,
      target: destructive.length === 1 ? destructive[0].target : null,
      reasons: [nonExecuting
        ? 'connector deletion was requested only as advice, a template, simulation, or dry run'
        : 'irreversible connector action is unsupported by the reversible external-action contract'],
    });
  }

  const allCandidates = reversibleCandidates(source).filter(({ index }) => !isMetaImplementationAt(source, index));
  const candidates = allCandidates.filter(({ index }) => !isNegatedAt(source, index));
  if (candidates.length && isNonExecutingRequest(source)) {
    const providers = unique(candidates.map(({ provider }) => provider));
    const actions = unique(candidates.map(({ action }) => action));
    return contract({
      state: 'unsupported',
      provider: providers.length === 1 ? providers[0] : null,
      action: providers.length === 1 && actions.length === 1 ? actions[0] : null,
      target: null,
      reasons: ['connector action was requested only as advice, a template, simulation, or dry run'],
    });
  }
  if (!candidates.length) {
    if (allCandidates.length) {
      const providers = unique(allCandidates.map(({ provider }) => provider));
      return contract({
        state: 'unsupported',
        provider: providers.length === 1 ? providers[0] : null,
        action: allCandidates.length === 1 ? allCandidates[0].action : null,
        target: null,
        reasons: ['connector mutation is explicitly negated'],
      });
    }
    return null;
  }

  const operations = unique(candidates.map(({ provider, action }) => `${provider}:${action}`));
  if (operations.length !== 1) {
    return contract({
      state: 'conflicting',
      provider: null,
      action: null,
      target: null,
      reasons: ['unsupported-multi-action: split connector actions and confirm each unique target once'],
    });
  }

  const [{ provider, action, targetKind }] = candidates;
  const targets = targetsForPrompt(source, provider, targetKind);
  if (targets.length > 1) {
    return contract({
      state: 'conflicting',
      provider,
      action,
      target: null,
      reasons: ['multiple candidate external targets were requested'],
    });
  }
  if (!targets.length) {
    return contract({
      state: 'incomplete',
      provider,
      action,
      target: null,
      reasons: [`missing unique ${targetKind} target`],
    });
  }
  return contract({
    state: 'complete',
    provider,
    action,
    target: { kind: targetKind, value: targets[0] },
    reasons: [],
  });
}

export function analyzeExternalActionContracts(prompt = '') {
  const aggregate = analyzeExternalActionPrompt(prompt);
  if (!aggregate) return [];
  const source = normalizeDoubleNegative(String(prompt));
  const candidates = reversibleCandidates(source)
    .filter(({ index }) => !isNegatedAt(source, index) && !isMetaImplementationAt(source, index));
  const operations = unique(candidates.map(({ provider, action }) => `${provider}:${action}`));
  if (operations.length <= 1 || isNonExecutingRequest(source)) return [aggregate];

  return operations.map((operation) => {
    const [provider, action] = operation.split(':');
    const candidate = candidates.find((value) => value.provider === provider && value.action === action);
    const targets = targetsForPrompt(source, provider, candidate.targetKind);
    if (targets.length > 1) {
      return contract({
        state: 'conflicting', provider, action, target: null,
        reasons: ['multiple candidate external targets were requested'],
      });
    }
    if (!targets.length) {
      return contract({
        state: 'incomplete', provider, action, target: null,
        reasons: [`missing unique ${candidate.targetKind} target`],
      });
    }
    return contract({
      state: 'complete', provider, action,
      target: { kind: candidate.targetKind, value: targets[0] }, reasons: [],
    });
  });
}

export function normalizeExternalActionContract(value) {
  if (!value || typeof value !== 'object' || !CONTRACT_STATES.has(value.state)) return null;
  const provider = typeof value.provider === 'string' && PROVIDER_ACTIONS[value.provider]
    ? value.provider
    : null;
  const action = provider && typeof value.action === 'string'
    && (PROVIDER_ACTIONS[provider].has(value.action) || value.state === 'unsupported' && UNSUPPORTED_ACTIONS.has(value.action))
    ? value.action : null;
  const target = normalizeContractTarget(value.target, provider);
  const state = value.state;
  if (state === 'complete' && (!provider || !action || !target)) return null;
  return contract({
    state,
    provider,
    action,
    target: state === 'complete' ? target : target ?? null,
    reasons: unique((Array.isArray(value.reasons) ? value.reasons : [])
      .filter((reason) => typeof reason === 'string')
      .map((reason) => reason.trim())
      .filter(Boolean)),
  });
}

export function externalActionMatchesTool(externalActionContract, toolNameOrCall = '', inputValue) {
  const expected = normalizeExternalActionContract(externalActionContract);
  if (!expected || expected.state !== 'complete') return false;
  const call = toolNameOrCall && typeof toolNameOrCall === 'object' && !Array.isArray(toolNameOrCall)
    ? toolNameOrCall
    : { toolName: toolNameOrCall, input: inputValue };
  const input = parseInput(call.input ?? call.params ?? call.arguments);
  if (!input) return false;
  const actual = operationForToolCall(call.toolName ?? call.name ?? '', input);
  if (!actual || actual.provider !== expected.provider || actual.action !== expected.action) return false;
  const targets = targetsForToolInput(input, expected.provider, expected.target.kind);
  return targets.length === 1 && targets[0] === expected.target.value;
}

function reversibleCandidates(source) {
  const specs = [
    {
      provider: 'email', action: 'send', targetKind: 'recipient',
      patterns: [
        /\b(?:send(?:ing)?|email(?:ing)?)\b[^.!?\n]{0,48}\b(?:email|message)\b/gi,
        /\b(?:send(?:ing)?)\s+(?:an?\s+|the\s+)?email\b/gi,
        /(?:发送|寄送)\s*(?:一封)?\s*(?:电子)?邮件/g,
      ],
    },
    {
      provider: 'slack', action: 'post-message', targetKind: 'channel',
      patterns: [
        /\b(?:post|send)\b[^.!?\n]{0,56}\bslack\b[^.!?\n]{0,32}\b(?:message|post)?\b/gi,
        /\bslack\b[^.!?\n]{0,40}\b(?:post|send)\b/gi,
        /(?:在|向)?\s*slack\s*(?:频道)?\s*(?:发送|发布)\s*(?:消息)?/gi,
        /(?:在|向)?\s*slack\s*(?:频道)?\s*#?[a-z0-9_-]+\s*(?:发送|发布)\s*(?:消息)?/gi,
      ],
    },
    {
      provider: 'jira', action: 'create-issue', targetKind: 'project',
      patterns: [
        /\b(?:create|open|file)\b[^.!?\n]{0,48}\bjira\b[^.!?\n]{0,32}\b(?:issue|ticket)\b/gi,
        /\bjira\b[^.!?\n]{0,40}\b(?:create|open|file)\b[^.!?\n]{0,24}\b(?:issue|ticket)\b/gi,
        /(?:在|向)?\s*jira\s*(?:项目)?\s*(?:创建|新建)\s*(?:issue|工单|问题)/gi,
      ],
    },
    {
      provider: 'google-drive', action: 'upload-file', targetKind: 'folder',
      patterns: [
        /\bupload\b[^!?\n]{0,72}\b(?:google\s+drive|drive)\b/gi,
        /\b(?:google\s+drive|drive)\b[^!?\n]{0,48}\bupload\b/gi,
        /(?:上传|放入).{0,48}(?:google\s*drive|谷歌云端硬盘|云端硬盘)/gi,
      ],
    },
    {
      provider: 'calendar', action: 'create-event', targetKind: 'calendar',
      patterns: [
        /\b(?:create|schedule|add)\b[^!?\n]{0,56}\b(?:calendar\s+event|event|meeting)\b[^!?\n]{0,56}\b(?:google\s+calendar|outlook\s+calendar|calendar)\b/gi,
        /\b(?:create|schedule|add)\b[^.!?\n]{0,56}\bcalendar\s+(?:event|meeting)\b/gi,
        /\b(?:google|outlook)?\s*calendar\b[^.!?\n]{0,48}\b(?:create|schedule|add)\b[^.!?\n]{0,24}\bevent\b/gi,
        /(?:创建|新建|安排|添加).{0,32}(?:日历事件|日程|会议)/g,
      ],
    },
    {
      provider: 'notion', action: 'update-page', targetKind: 'page',
      patterns: [
        /\bupdate\b[^.!?\n]{0,48}\bnotion\b[^.!?\n]{0,24}\bpage\b/gi,
        /\bnotion\b[^.!?\n]{0,40}\bupdate\b[^.!?\n]{0,24}\bpage\b/gi,
        /(?:更新|修改)\s*notion\s*(?:页面|page)/gi,
      ],
    },
  ];
  const candidates = [];
  for (const spec of specs) {
    for (const pattern of spec.patterns) {
      for (const match of source.matchAll(pattern)) candidates.push({ ...spec, index: match.index ?? 0 });
    }
  }
  return dedupeCandidates(candidates);
}

function destructiveCandidates(source) {
  const providers = [
    ['email', /\b(?:email|gmail|outlook)\b/i],
    ['slack', /\bslack\b/i],
    ['jira', /\bjira\b/i],
    ['google-drive', /\b(?:google\s+drive|drive)\b/i],
    ['calendar', /\bcalendar\b/i],
    ['notion', /\bnotion\b/i],
  ];
  const destructive = [];
  const pattern = /\b(?:delete|remove|destroy|purge)\b|(?:删除|移除|销毁|清空)/gi;
  for (const match of source.matchAll(pattern)) {
    if (isNegatedAt(source, match.index ?? 0) || isMetaImplementationAt(source, match.index ?? 0)) continue;
    const context = source.slice(Math.max(0, (match.index ?? 0) - 24), (match.index ?? 0) + 96);
    for (const [provider, providerPattern] of providers) {
      if (providerPattern.test(context)) destructive.push({ provider, action: 'delete', target: null });
    }
  }
  return destructive;
}

function targetsForPrompt(source, provider, kind) {
  if (provider === 'email') return emailTargetsForPrompt(source);
  if (provider === 'slack') return slackTargetsForPrompt(source);
  const patterns = {
    jira: [/\b(?:jira\s+)?project\s+(?:key\s+)?[`'"]?([a-z][a-z0-9_-]+)[`'"]?/gi, /(?:jira\s*)?项目\s*[`'"]?([a-z][a-z0-9_-]+)[`'"]?/gi],
    'google-drive': [/\b(?:google\s+drive\s+)?folder\s+(?:id\s+)?[`'"]?([a-z0-9_-]+)[`'"]?/gi, /(?:文件夹|目录)\s*(?:id\s*)?[`'"]?([a-z0-9_-]+)[`'"]?/gi],
    calendar: [/\b(?:in|on)\s+(?:the\s+)?([a-z0-9_.@-]+)\s+calendar\b/gi, /\bcalendar\s+(?:id\s+)?[`'"]?([a-z0-9_.@-]+)[`'"]?/gi, /(?:日历|calendar)\s*(?:id\s*)?[`'"]?([a-z0-9_.@-]+)[`'"]?/gi],
    notion: [/\bnotion\s+page\s+(?:id\s+)?[`'"]?([a-z0-9_-]+)[`'"]?/gi, /\bpage\s+(?:id\s+)?[`'"]?([a-z0-9_-]+)[`'"]?/gi, /(?:notion\s*)?(?:页面|page)\s*(?:id\s*)?[`'"]?([a-z0-9_-]+)[`'"]?/gi],
  };
  const values = [];
  if (provider === 'jira') {
    for (const match of source.matchAll(/\b(?:[Jj]ira\s+)?(?:issue|ticket)\s+in\s+([A-Z][A-Z0-9_-]{1,})\b/g)) {
      if (isNegatedAt(source, match.index ?? 0)) continue;
      const normalized = normalizeTargetValue(kind, match[1]);
      if (normalized && !isPlaceholderTarget(kind, normalized)) values.push(normalized);
    }
  }
  for (const pattern of patterns[provider] ?? []) {
    for (const match of source.matchAll(pattern)) {
      const raw = match[1] ?? match[0];
      const normalized = normalizeTargetValue(kind, raw);
      if (normalized && !isPlaceholderTarget(kind, normalized)) values.push(normalized);
    }
  }
  return unique(values);
}

function emailTargetsForPrompt(source) {
  const address = "[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+";
  const lists = [
    new RegExp(`\\b(?:to|recipient|recipients|cc|bcc)\\s*[:=]?\\s*((?:${address})(?:\\s*(?:,|and|&)\\s*${address})*)`, 'gi'),
    new RegExp(`(?:给|收件人|抄送)\\s*((?:${address})(?:\\s*(?:、|，|,|和|及)\\s*${address})*)`, 'gi'),
    new RegExp(`\\bsend\\s+(${address})\\s+(?:an?\\s+)?(?:email|message)\\b`, 'gi'),
  ];
  const values = [];
  for (const pattern of lists) {
    for (const match of source.matchAll(pattern)) {
      if (isNegatedAt(source, match.index ?? 0)) continue;
      for (const target of match[1].match(new RegExp(address, 'gi')) ?? []) {
        values.push(normalizeTargetValue('recipient', target));
      }
    }
  }
  return unique(values);
}

function slackTargetsForPrompt(source) {
  const channel = '#?[a-z0-9_-]+';
  const patterns = [
    new RegExp(`\\bslack\\b[^.!?\\n]{0,56}\\b(?:to|in)\\s+(?:the\\s+)?(?:channel\\s+)?((?:${channel})(?:\\s*(?:,|and|&)\\s*${channel})*)`, 'gi'),
    new RegExp(`\\bslack\\b[^.!?\\n]{0,56}\\bchannel\\s+(?:id\\s+)?((?:${channel})(?:\\s*(?:,|and|&)\\s*${channel})*)`, 'gi'),
    new RegExp(`\\b(?:to|in)\\s+(?:the\\s+)?(?:channel\\s+)?((?:${channel})(?:\\s*(?:,|and|&)\\s*${channel})*)[^.!?\\n]{0,32}\\b(?:on|in)\\s+slack\\b`, 'gi'),
    new RegExp(`slack[^。！!？?\\n]{0,32}(?:到|向|在)\\s*(?:频道)?\\s*((?:${channel})(?:\\s*(?:、|，|,|和|及)\\s*${channel})*)`, 'gi'),
    new RegExp(`slack\\s*(?:频道)?\\s*((?:${channel})(?:\\s*(?:、|，|,|和|及)\\s*${channel})*)\\s*(?:发送|发布)`, 'gi'),
  ];
  const values = [];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (isNegatedAt(source, match.index ?? 0)) continue;
      for (const target of match[1].match(/#?[a-z0-9_-]+/gi) ?? []) {
        const normalized = normalizeTargetValue('channel', target);
        if (normalized && !isPlaceholderTarget('channel', normalized)) values.push(normalized);
      }
    }
  }
  return unique(values);
}

function operationForToolName(toolName = '') {
  const name = canonicalToolName(toolName);
  if (/(?:^|_)(?:gmail|outlook_email|email)(?:_|$)/.test(name)
    && /(?:^|_)send(?:_email|_message)?(?:_|$)/.test(name)) return { provider: 'email', action: 'send' };
  if (/(?:^|_)slack(?:_|$)/.test(name)
    && /(?:^|_)(?:post|send)(?:_message)?(?:_|$)/.test(name)) return { provider: 'slack', action: 'post-message' };
  if (/(?:^|_)(?:jira|atlassian_rovo)(?:_|$)/.test(name)
    && /(?:^|_)create(?:_jira)?_?(?:issue|ticket)(?:_|$)/.test(name)) return { provider: 'jira', action: 'create-issue' };
  if (/(?:^|_)(?:google_drive|drive)(?:_|$)/.test(name)
    && /(?:^|_)upload(?:_file)?(?:_|$)/.test(name)) return { provider: 'google-drive', action: 'upload-file' };
  if (/(?:^|_)calendar(?:_|$)/.test(name)
    && /(?:^|_)(?:create|schedule|add)(?:_calendar)?_?event(?:_|$)/.test(name)) return { provider: 'calendar', action: 'create-event' };
  if (/(?:^|_)notion(?:_|$)/.test(name)
    && /(?:^|_)update(?:_notion)?_?page(?:_|$)/.test(name)) return { provider: 'notion', action: 'update-page' };
  return null;
}

function operationForToolCall(toolName = '', input = {}) {
  const named = operationForToolName(toolName);
  if (named) return named;
  const name = canonicalToolName(toolName);
  if (/(?:^|_)slack(?:_|$)/.test(name) && /(?:^|_)(?:api|api_call|request|call)(?:_|$)/.test(name)) {
    const operations = scalarRoleValues(input, new Set(['operation', 'method'])).map((value) => value.toLowerCase());
    if (operations.length === 1 && operations[0] === 'chat.postmessage') {
      return { provider: 'slack', action: 'post-message' };
    }
  }
  if (/(?:^|_)notion(?:_|$)/.test(name) && /(?:^|_)(?:api|api_call|request|call)(?:_|$)/.test(name)) {
    const methods = scalarRoleValues(input, new Set(['method', 'httpmethod'])).map((value) => value.toUpperCase());
    const paths = scalarRoleValues(input, new Set(['path', 'url']));
    if (methods.length === 1 && methods[0] === 'PATCH'
      && paths.length === 1 && notionPageFromPath(paths[0])) {
      return { provider: 'notion', action: 'update-page' };
    }
  }
  return null;
}

function targetsForToolInput(input, provider, kind) {
  const keys = {
    email: new Set(['to', 'recipient', 'recipients', 'cc', 'bcc']),
    slack: new Set(['channel', 'channelid']),
    jira: new Set(['project', 'projectkey']),
    'google-drive': new Set(['folder', 'folderid', 'parent', 'parentid', 'parents']),
    calendar: new Set(['calendar', 'calendarid']),
    notion: new Set(['page', 'pageid', 'path']),
  }[provider] ?? new Set();
  const rawValues = collectRoleValues(input, keys);
  const values = [];
  for (const raw of rawValues) {
    const entries = Array.isArray(raw) ? raw : [raw];
    for (const entry of entries) {
      const scalar = entry && typeof entry === 'object' && provider === 'jira'
        ? entry.key ?? entry.id
        : entry;
      if (typeof scalar !== 'string') continue;
      if (provider === 'email') {
        for (const address of scalar.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []) {
          values.push(normalizeTargetValue(kind, address));
        }
      } else {
        const normalized = kind === 'page' && scalar.includes('/')
          ? notionPageFromPath(scalar)
          : normalizeTargetValue(kind, scalar);
        if (normalized) values.push(normalized);
      }
    }
  }
  return unique(values.filter(Boolean));
}

function scalarRoleValues(input, keys) {
  return unique(collectRoleValues(input, keys)
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean));
}

function notionPageFromPath(value = '') {
  const match = String(value).match(/(?:^|\/)pages\/([^/?#]+)(?:[/?#]|$)/i);
  return match ? normalizeTargetValue('page', decodeURIComponent(match[1])) : '';
}

function collectRoleValues(value, allowedKeys, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((entry) => collectRoleValues(entry, allowedKeys, seen));
  const values = [];
  for (const [key, child] of Object.entries(value)) {
    const canonicalKey = String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (allowedKeys.has(canonicalKey)) values.push(child);
    if (child && typeof child === 'object') values.push(...collectRoleValues(child, allowedKeys, seen));
  }
  return values;
}

function normalizeContractTarget(value, provider) {
  if (!value || typeof value !== 'object') return null;
  const expectedKinds = {
    email: 'recipient', slack: 'channel', jira: 'project', 'google-drive': 'folder', calendar: 'calendar', notion: 'page',
  };
  const kind = expectedKinds[provider];
  if (!kind || value.kind !== kind || typeof value.value !== 'string') return null;
  const normalized = normalizeTargetValue(kind, value.value);
  return normalized ? { kind, value: normalized } : null;
}

function normalizeTargetValue(kind, value = '') {
  let normalized = String(value).trim().replace(/^[`'"]+|[`'",.;:!?]+$/g, '');
  if (kind === 'recipient') normalized = normalized.toLowerCase();
  if (kind === 'channel') normalized = normalized.replace(/^#/, '').toLowerCase();
  if (kind === 'project') normalized = normalized.toUpperCase();
  return normalized;
}

function isPlaceholderTarget(kind, value) {
  const placeholders = {
    channel: new Set(['channel', 'message', 'post']),
    project: new Set(['PROJECT', 'ISSUE', 'TICKET']),
    folder: new Set(['folder', 'drive', 'file']),
    calendar: new Set(['event', 'calendar']),
    page: new Set(['page', 'notion']),
  };
  return placeholders[kind]?.has(value) ?? false;
}

function normalizeDoubleNegative(value = '') {
  const gerunds = {
    sending: 'send', posting: 'post', creating: 'create', scheduling: 'schedule', uploading: 'upload', updating: 'update',
  };
  return String(value)
    .replace(/\b(?:do not|don't|dont|never)\s+(?:hesitate\s+to|refrain\s+from)\s+(send(?:ing)?|post(?:ing)?|creat(?:e|ing)|schedul(?:e|ing)|upload(?:ing)?|updat(?:e|ing))\b/gi,
      (_match, verb) => {
        const normalized = String(verb).toLowerCase();
        if (gerunds[normalized]) return gerunds[normalized];
        return normalized.replace(/ing$/, '').replace(/^creat$/, 'create').replace(/^schedul$/, 'schedule').replace(/^updat$/, 'update');
      })
    .replace(/\b(?:do not|don't|dont|never)\s+(?:skip|omit|avoid)\s+(sending|posting|creating|scheduling|uploading|updating)\b/gi,
      (_match, gerund) => gerunds[String(gerund).toLowerCase()] ?? gerund)
    .replace(/(?:不要|别|不得)\s*(?:犹豫|迟疑)\s*(?:去)?\s*(发送|发布|创建|安排|上传|更新)/g, '$1')
    .replace(/(?:不要|别|不得)\s*(?:跳过|省略|避免)\s*(发送|发布|创建|安排|上传|更新)/g, '$1');
}

function isNonExecutingRequest(value = '') {
  const source = String(value);
  return /\b(?:how\s+(?:do|can|should|would)\s+i|(?:explain|show|tell|teach)\s+me\s+how\s+to|explain\s+how\s+to|walk\s+me\s+through\s+how\s+to)\b/i.test(source)
    || /(?:如何|怎么).{0,20}(?:发送|发布|创建|安排|上传|更新|删除)/.test(source)
    || /\btemplate\b|\b(?:an?\s+)?example\s+(?:of|for)\b|\bsample\s+(?:email|message|post|issue|event|page)\b|(?:模板|示例|样例)/i.test(source)
    || /(?:^|\s)--?dry[- ]?run(?:\s|$)|\bdry[- ]run\b|\bsimulat(?:e|ion)\b|(?:试运行|模拟执行)/i.test(source)
    || /\bwithout\s+actually\s+(?:sending|posting|creating|scheduling|uploading|updating|deleting)\b/i.test(source)
    || /(?:不要|不|别)\s*实际\s*(?:发送|发布|创建|安排|上传|更新|删除)/.test(source);
}

function isMetaImplementationAt(source, index) {
  const text = String(source);
  const before = text.slice(0, index);
  const boundary = Math.max(
    before.lastIndexOf(','),
    before.lastIndexOf(';'),
    before.lastIndexOf('，'),
    before.lastIndexOf('；'),
    lastWordBoundary(before, 'then'),
    lastWordBoundary(before, 'and'),
    before.lastIndexOf('然后'),
    before.lastIndexOf('并且'),
  );
  const after = text.slice(index);
  const endOffsets = [
    after.indexOf(','), after.indexOf(';'), after.indexOf('，'), after.indexOf('；'),
    wordBoundaryIndex(after, 'then'), wordBoundaryIndex(after, 'and'),
  ].filter((value) => value >= 0);
  const end = endOffsets.length ? index + Math.min(...endOffsets) : text.length;
  const clause = text.slice(boundary + 1, end);
  const metaVerb = /\b(?:implement|fix|add|build|develop|test|mock|support)\b|(?:实现|修复|添加|开发|测试|模拟|支持)/i.test(clause);
  const codeContext = /\b(?:support|handler|function|logic|integration|adapter|client|fixture|mock|test)\b|(?:支持|处理器|函数|逻辑|集成|适配器|客户端|夹具|测试)|(?:^|[\s`'"])(?:src\/|lib\/|app\/|[a-z0-9_./-]+\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|rb|php|cs))(?:$|[\s`'",.;])/i.test(clause);
  return metaVerb && codeContext;
}

function lastWordBoundary(value, word) {
  const pattern = new RegExp(`\\b${word}\\b`, 'gi');
  let index = -1;
  for (const match of String(value).matchAll(pattern)) index = match.index ?? index;
  return index;
}

function wordBoundaryIndex(value, word) {
  return new RegExp(`\\b${word}\\b`, 'i').exec(String(value))?.index ?? -1;
}

function isNegatedAt(source, index) {
  const prefix = String(source).slice(Math.max(0, index - 48), index);
  return /(?:\b(?:do not|don't|dont|never|without|not)\s+(?:(?:please|actually)\s+)?(?:\w+\s+){0,6}|(?:不要|不|别|不得|禁止)\s*(?:实际)?\s*)$/i.test(prefix);
}

function parseInput(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function canonicalToolName(value = '') {
  return String(value).trim().toLowerCase().replace(/[./:\\]+/g, '_').replace(/_+/g, '_');
}

function dedupeCandidates(values) {
  const seen = new Set();
  return values.filter(({ provider, action, index }) => {
    const key = `${provider}:${action}:${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function contract({ state, provider, action, target, reasons }) {
  return {
    version: 1,
    state,
    provider: provider ?? null,
    action: action ?? null,
    target: target ?? null,
    reasons: unique(reasons ?? []),
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}
