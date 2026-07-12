import { createHash } from 'node:crypto';

const SOURCE_SEARCH_TOOLS = new Set(['read', 'grep', 'glob', 'find']);
const WEB_TOOLS = new Set(['web', 'web_search', 'search_query', 'fetch', 'browse', 'browser']);
const PLUGIN_CONTINUATION_TYPES = new Set([
  'omp-continuation',
  'omp-enhancer-continuation',
  'session-stop-continuation',
]);
const EQUIVALENT_SKILL_NAMESPACE_PREFIXES = ['superpowers-'];

export function parseNdjson(text = '') {
  const events = [];
  const invalidLines = [];
  for (const [index, rawLine] of String(text).split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      invalidLines.push({ line: index + 1, preview: line.slice(0, 160) });
    }
  }
  return { events, invalidLines };
}

export function summarizeWorkflowEvents(events = [], metadata = {}) {
  const calls = [];
  const callsById = new Map();
  const unresolvedByFingerprint = new Map();
  const customMessages = [];
  const assistantTexts = [];
  const assistantStops = [];
  const finals = [];
  const observedSkills = new Set();
  const claimedSkills = new Set();
  const routes = [];
  let pendingTurnKind = 'user';
  let activeTurnKind = 'user';
  let agentStarts = 0;
  let agentEnds = 0;

  for (const event of events) {
    const custom = customMessageFromEvent(event);
    if (custom) {
      customMessages.push(custom);
      if (custom.customType === 'autolearn-nudge') {
        pendingTurnKind = 'autolearn-capture';
        if (agentStarts > agentEnds) activeTurnKind = 'autolearn-capture';
      }
    }

    if (event?.type === 'agent_start') {
      agentStarts += 1;
      activeTurnKind = pendingTurnKind;
      pendingTurnKind = 'user';
    } else if (event?.type === 'agent_end') {
      agentEnds += 1;
    }

    const message = event?.message;
    if (event?.type === 'message_end' && message?.role === 'assistant') {
      assistantStops.push({
        stopReason: message.stopReason ?? null,
        errorMessage: message.errorMessage ?? null,
        turnKind: activeTurnKind,
        empty: !Array.isArray(message.content) || message.content.length === 0,
      });
      const content = Array.isArray(message.content) ? message.content : [];
      const messageCalls = content.filter((item) => item?.type === 'toolCall');
      for (const item of messageCalls) registerCall(calls, callsById, unresolvedByFingerprint, {
        id: item.id ?? item.toolCallId,
        name: item.name,
        arguments: item.arguments ?? item.input ?? {},
        turnKind: activeTurnKind,
      });
      const text = content
        .filter((item) => item?.type === 'text')
        .map((item) => String(item.text ?? ''))
        .join('\n')
        .trim();
      if (text) {
        assistantTexts.push(text);
        for (const name of claimedSkillNames(text)) claimedSkills.add(name);
        if (!messageCalls.length) finals.push({ text, turnKind: activeTurnKind });
      }
    }

    if (event?.type === 'tool_execution_start') {
      registerCall(calls, callsById, unresolvedByFingerprint, {
        id: event.toolCallId ?? event.callId ?? event.id,
        name: event.toolName ?? event.name,
        arguments: event.arguments ?? event.input ?? {},
        turnKind: activeTurnKind,
      });
    }

    if (event?.type === 'tool_execution_end') {
      const result = event.result ?? {};
      const call = resolveCall(calls, callsById, {
        id: event.toolCallId ?? event.callId ?? event.id,
        name: event.toolName ?? event.name,
      });
      const isError = result.isError === true || event.isError === true;
      if (call) {
        call.completed = true;
        call.isError = isError;
        call.resultPreview = resultText(result).slice(0, 1000);
        if (!isError && call.name === 'read') {
          const skill = skillNameFromRead(call.arguments, result);
          if (skill) observedSkills.add(skill);
        }
      }
      const route = result?.details?.route ?? result?.details?.result?.route;
      if (route && typeof route === 'object') routes.push(routeSummary(route));
    }
    const eventRoute = event?.route ?? event?.details?.route;
    if (eventRoute && typeof eventRoute === 'object') routes.push(routeSummary(eventRoute));
  }

  const failedFingerprints = new Map();
  for (const call of calls.filter(({ isError }) => isError === true)) {
    const fingerprint = callFingerprint(call.name, call.arguments);
    failedFingerprints.set(fingerprint, (failedFingerprints.get(fingerprint) ?? 0) + 1);
  }

  const primaryFinals = finals.filter(({ turnKind }) => turnKind !== 'autolearn-capture');
  const autolearnFinals = finals.filter(({ turnKind }) => turnKind === 'autolearn-capture');
  const unobservedClaims = [...claimedSkills].filter((name) => !hasEquivalentSkill(observedSkills, name));

  return {
    scenarioId: metadata.scenarioId ?? null,
    exitCode: metadata.exitCode ?? null,
    signal: metadata.signal ?? null,
    durationMs: metadata.durationMs ?? null,
    timedOut: metadata.timedOut === true,
    invalidJsonLines: metadata.invalidJsonLines ?? [],
    agentStarts,
    agentEnds,
    toolCalls: calls,
    toolCallCount: calls.length,
    sourceSearchCallCount: calls.filter(({ name }) => SOURCE_SEARCH_TOOLS.has(name)).length,
    webCallCount: calls.filter(({ name }) => WEB_TOOLS.has(name) || /(?:web|browse|search_query)/i.test(name)).length,
    observedSkills: [...observedSkills].sort(),
    claimedSkills: [...claimedSkills].sort(),
    unobservedClaims: unobservedClaims.sort(),
    routes,
    primaryFinalCount: primaryFinals.length,
    primaryFinals,
    autolearnFinalCount: autolearnFinals.length,
    autolearnToolCallCount: calls.filter(({ turnKind }) => turnKind === 'autolearn-capture').length,
    autolearnCaptureCount: customMessages.filter(({ customType }) => customType === 'autolearn-nudge').length,
    advisorMessageCount: customMessages.filter(({ customType }) => customType === 'advisor').length,
    pluginContinuationCount: customMessages.filter(({ customType }) => PLUGIN_CONTINUATION_TYPES.has(customType)).length,
    customMessages,
    duplicateFailedCalls: [...failedFingerprints.entries()]
      .filter(([, count]) => count > 1)
      .map(([fingerprint, count]) => ({ fingerprint, count })),
    assistantStops,
    abortedAssistantCount: assistantStops.filter(({ stopReason }) => stopReason === 'aborted').length,
    assistantTextDigest: digest(assistantTexts.join('\n')),
  };
}

export function evaluateWorkflowSummary(summary, expectations = {}) {
  const failures = [];
  const observed = new Set(summary.observedSkills ?? []);

  for (const skill of expectations.requiredSkills ?? []) {
    if (!hasEquivalentSkill(observed, skill)) failures.push(`required skill was not observed: ${skill}`);
  }
  for (const skill of expectations.forbiddenSkills ?? []) {
    if (hasEquivalentSkill(observed, skill)) failures.push(`forbidden skill was observed: ${skill}`);
  }
  if (expectations.noWeb === true && summary.webCallCount > 0) {
    failures.push(`web tools were called ${summary.webCallCount} time(s)`);
  }
  if (Number.isFinite(expectations.maxToolCalls) && summary.toolCallCount > expectations.maxToolCalls) {
    failures.push(`tool calls ${summary.toolCallCount} exceeded ${expectations.maxToolCalls}`);
  }
  if (Number.isFinite(expectations.maxSourceSearchCalls)
    && summary.sourceSearchCallCount > expectations.maxSourceSearchCalls) {
    failures.push(`source/search calls ${summary.sourceSearchCallCount} exceeded ${expectations.maxSourceSearchCalls}`);
  }
  if (expectations.requireFinal !== false && summary.primaryFinalCount < 1) {
    failures.push('no non-empty primary final was observed');
  }
  if (Number.isFinite(expectations.maxPrimaryFinals)
    && summary.primaryFinalCount > expectations.maxPrimaryFinals) {
    failures.push(`primary finals ${summary.primaryFinalCount} exceeded ${expectations.maxPrimaryFinals}`);
  }
  if (expectations.noUnobservedSkillClaims === true && summary.unobservedClaims.length) {
    failures.push(`unobserved skill claims: ${summary.unobservedClaims.join(', ')}`);
  }
  if (Number.isFinite(expectations.maxDuplicateFailedCalls)
    && summary.duplicateFailedCalls.some(({ count }) => count - 1 > expectations.maxDuplicateFailedCalls)) {
    failures.push('an unchanged failed tool call was repeated too many times');
  }
  if (expectations.pluginContinuationCount != null
    && summary.pluginContinuationCount !== expectations.pluginContinuationCount) {
    failures.push(`plugin continuation count was ${summary.pluginContinuationCount}, expected ${expectations.pluginContinuationCount}`);
  }
  if (expectations.autolearnCaptureCount != null
    && summary.autolearnCaptureCount !== expectations.autolearnCaptureCount) {
    failures.push(`autolearn capture count was ${summary.autolearnCaptureCount}, expected ${expectations.autolearnCaptureCount}`);
  }
  if (Number.isFinite(expectations.maxAutolearnFinals)
    && summary.autolearnFinalCount > expectations.maxAutolearnFinals) {
    failures.push(`autolearn finals ${summary.autolearnFinalCount} exceeded ${expectations.maxAutolearnFinals}`);
  }
  if (Number.isFinite(expectations.maxAutolearnToolCalls)
    && summary.autolearnToolCallCount > expectations.maxAutolearnToolCalls) {
    failures.push(`autolearn tool calls ${summary.autolearnToolCallCount} exceeded ${expectations.maxAutolearnToolCalls}`);
  }
  if (Number.isFinite(expectations.maxAbortedAssistants)
    && summary.abortedAssistantCount > expectations.maxAbortedAssistants) {
    failures.push(`aborted assistant messages ${summary.abortedAssistantCount} exceeded ${expectations.maxAbortedAssistants}`);
  }
  if (expectations.expectedRoute) {
    const effective = summary.routes.at(-1);
    if (!effective || effective.intent !== expectations.expectedRoute) {
      failures.push(`effective route was ${effective?.intent ?? 'unobserved'}, expected ${expectations.expectedRoute}`);
    }
  }
  if (summary.exitCode != null && summary.exitCode !== 0) failures.push(`process exited with code ${summary.exitCode}`);
  if (summary.signal) failures.push(`process exited from signal ${summary.signal}`);
  if (summary.timedOut) failures.push('runner hard timeout was reached');

  return { pass: failures.length === 0, failures };
}

export function mergeCustomEventFallbacks(primaryEvents = [], fallbackEvents = []) {
  const primaryKeys = new Set(primaryEvents
    .map(customMessageFromEvent)
    .filter(Boolean)
    .map(customIdentity));
  return [
    ...primaryEvents,
    ...fallbackEvents.filter((event) => {
      const custom = customMessageFromEvent(event);
      return custom && !primaryKeys.has(customIdentity(custom));
    }),
  ];
}

function registerCall(calls, callsById, unresolvedByFingerprint, value) {
  const name = String(value.name ?? '').trim();
  if (!name) return null;
  const argumentsValue = normalizeArguments(value.arguments);
  const id = value.id == null ? '' : String(value.id);
  if (id && callsById.has(id)) return callsById.get(id);
  const fingerprint = callFingerprint(name, argumentsValue);
  const unresolved = unresolvedByFingerprint.get(fingerprint);
  if (!id && unresolved && !unresolved.completed) return unresolved;

  const call = {
    id: id || `observed-${calls.length + 1}`,
    name,
    arguments: argumentsValue,
    turnKind: value.turnKind ?? 'user',
    completed: false,
    isError: null,
  };
  calls.push(call);
  if (id) callsById.set(id, call);
  unresolvedByFingerprint.set(fingerprint, call);
  return call;
}

function resolveCall(calls, callsById, { id, name }) {
  const normalizedId = id == null ? '' : String(id);
  if (normalizedId && callsById.has(normalizedId)) return callsById.get(normalizedId);
  const normalizedName = String(name ?? '').trim();
  return calls.find((call) => !call.completed && (!normalizedName || call.name === normalizedName)) ?? null;
}

function customMessageFromEvent(event) {
  if (event?.type === 'session_custom' && event.entry) return normalizeCustom(event.entry);
  const message = event?.message;
  if (event?.type === 'message_end' && message?.role === 'custom') return normalizeCustom(message);
  if (!event?.type && (event?.role === 'custom' || event?.customType)) return normalizeCustom(event);
  return null;
}

function customIdentity(custom) {
  return `${custom.customType}:${custom.contentDigest}:${custom.attribution ?? ''}:${custom.display}`;
}

function normalizeCustom(value) {
  const customType = String(value?.customType ?? value?.custom_type ?? '').trim();
  if (!customType) return null;
  return {
    customType,
    display: value?.display !== false,
    attribution: value?.attribution ?? null,
    contentDigest: digest(typeof value?.content === 'string' ? value.content : JSON.stringify(value?.content ?? '')),
  };
}

function normalizeArguments(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : { value };
    } catch {
      return { value };
    }
  }
  return {};
}

function skillNameFromRead(args, result) {
  const target = String(args?.path ?? args?.file_path ?? args?.uri ?? args?.value ?? '');
  const uriMatch = target.match(/^skill:\/\/([^/\s]+)(?:\/SKILL\.md)?/i);
  if (uriMatch) return normalizeSkillName(uriMatch[1]);
  if (!/(?:^|\/)SKILL\.md$/i.test(target)) return '';
  const contentName = resultText(result).match(/^name:\s*['"]?([^'"\r\n]+)['"]?\s*$/m)?.[1];
  if (contentName) return normalizeSkillName(contentName);
  const parts = target.replace(/\\/g, '/').split('/');
  return normalizeSkillName(parts.at(-2) ?? '');
}

function claimedSkillNames(text) {
  const names = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!/(?:loaded|read|used|applied|followed|加载|读取|使用|采用|遵循)/i.test(line)) continue;
    for (const match of line.matchAll(/skill:\/\/([a-z0-9][a-z0-9/_-]*)/gi)) {
      names.push(normalizeSkillName(match[1].split('/').at(-1)));
    }
    for (const match of line.matchAll(/\bskills?\s*(?:named\s*)?[:：]?\s*[`'"]([a-z0-9][a-z0-9/_-]*)[`'"]/gi)) {
      names.push(normalizeSkillName(match[1].split('/').at(-1)));
    }
    for (const match of line.matchAll(/(?:加载|读取|使用|采用|遵循)(?:了)?\s*[`'"]([a-z0-9][a-z0-9/_-]*)[`'"]\s*(?:技能|skill)|\b(?:loaded|read|used|applied|followed)\s+(?:the\s+)?[`'"]([a-z0-9][a-z0-9/_-]*)[`'"]\s+skills?\b/gi)) {
      names.push(normalizeSkillName((match[1] ?? match[2]).split('/').at(-1)));
    }
    for (const listMatch of line.matchAll(/\b(?:loaded|used|applied|followed)\s+skills?\s*[:：](?!\/\/)\s*([^.;]+)/gi)) {
      for (const match of listMatch[1].matchAll(/(?:^|[,，])\s*[`'"]?([a-z][a-z0-9/_-]*)[`'"]?/gi)) {
        names.push(normalizeSkillName(match[1].split('/').at(-1)));
      }
    }
  }
  return [...new Set(names.filter(Boolean))];
}

function hasEquivalentSkill(values, expected) {
  const wanted = normalizeSkillName(expected);
  return [...values].some((value) => {
    const actual = normalizeSkillName(value);
    if (actual === wanted) return true;
    return EQUIVALENT_SKILL_NAMESPACE_PREFIXES.some((prefix) => (
      actual === `${prefix}${wanted}` || wanted === `${prefix}${actual}`
    ));
  });
}

function normalizeSkillName(value) {
  return String(value ?? '').trim().toLowerCase().replace(/^skill:\/\//, '').replace(/\/SKILL\.md$/i, '');
}

function resultText(result) {
  return (result?.content ?? [])
    .filter((item) => item?.type === 'text')
    .map((item) => String(item.text ?? ''))
    .join('\n');
}

function routeSummary(route) {
  return {
    intent: route.intent ?? null,
    workflowRoute: route.workflowRoute ?? null,
    language: route.taskDescriptor?.language ?? null,
    writingTaskKind: route.taskDescriptor?.writingTaskKind ?? null,
    advisoryOnly: route.advisoryOnly === true,
    coreAutoContinue: route.autoContinue === true,
  };
}

function callFingerprint(name, argumentsValue) {
  return `${name}:${stableJson(argumentsValue)}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function digest(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex').slice(0, 16);
}
