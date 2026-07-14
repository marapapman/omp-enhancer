import { createHash } from 'node:crypto';

const SOURCE_SEARCH_TOOLS = new Set(['read', 'grep', 'glob', 'find']);
const WEB_TOOLS = new Set(['web', 'web_search', 'search_query', 'fetch', 'browse', 'browser']);
const PLUGIN_CONTINUATION_TYPES = new Set([
  'omp-continuation',
  'omp-enhancer-continuation',
  'session-stop-continuation',
]);
const EQUIVALENT_SKILL_NAMESPACE_PREFIXES = ['superpowers-'];
const ORCHESTRATION_TOOLS = new Set(['task', 'todo']);
export const TASK_METADATA_PREFIX_CHAR_LIMIT = 120;
const TASK_ASSIGNMENT_METADATA_FIELDS = ['workflow', 'step', 'todo', 'skills'];

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
  const asyncJobResults = [];
  const assistantTexts = [];
  const assistantStops = [];
  const finals = [];
  const observedSkills = new Set();
  const providedSkills = new Set();
  const providedSkillEvidence = new Map();
  const claimedSkills = new Set();
  const routes = [];
  let pendingTurnKind = 'user';
  let activeTurnKind = 'user';
  let agentStarts = 0;
  let agentEnds = 0;
  let sawPrimaryFinal = false;
  let postFinalAdvisorMessageCount = 0;

  for (const [eventIndex, event] of events.entries()) {
    asyncJobResults.push(...asyncJobResultsFromEvent(event));
    const custom = customMessageFromEvent(event);
    if (custom) {
      customMessages.push(custom);
      if (custom.customType === 'advisor'
        && sawPrimaryFinal
        && event?.type === 'message_end') {
        postFinalAdvisorMessageCount += 1;
      }
      for (const evidence of custom.providedSkillEvidence) {
        const locatedEvidence = {
          ...evidence,
          eventSource: event?.type === 'session_custom' ? 'session-fallback' : 'live',
          eventIndex,
        };
        if (['autoload', 'user'].includes(locatedEvidence.source)) {
          providedSkills.add(locatedEvidence.name);
        }
        const identity = skillEvidenceIdentity(locatedEvidence);
        const existing = providedSkillEvidence.get(identity);
        if (!existing || existing.eventSource === 'session-fallback' && locatedEvidence.eventSource === 'live') {
          providedSkillEvidence.set(identity, locatedEvidence);
        }
      }
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
        eventIndex,
      });
      const text = content
        .filter((item) => item?.type === 'text')
        .map((item) => String(item.text ?? ''))
        .join('\n')
        .trim();
      if (text) {
        assistantTexts.push(text);
        for (const name of claimedSkillNames(text)) claimedSkills.add(name);
        if (!messageCalls.length) {
          finals.push({ text, turnKind: activeTurnKind });
          if (activeTurnKind !== 'autolearn-capture') sawPrimaryFinal = true;
        }
      }
    }

    if (event?.type === 'tool_execution_start') {
      registerCall(calls, callsById, unresolvedByFingerprint, {
        id: event.toolCallId ?? event.callId ?? event.id,
        name: event.toolName ?? event.name,
        arguments: event.arguments ?? event.args ?? event.input ?? {},
        turnKind: activeTurnKind,
        eventIndex,
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
        if (!isError && call.name === 'todo') {
          call.todoResult = summarizeTodoResult(result?.details);
        }
        if (!isError && call.name === 'task') {
          call.taskResult = summarizeTaskResult(result?.details);
        }
        if (!isError && call.name === 'job') {
          call.jobResults = summarizeJobResults(result?.details);
        }
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
  const effectiveSkills = new Set([...observedSkills, ...providedSkills]);
  const unobservedClaims = [...claimedSkills].filter((name) => !hasEquivalentSkill(effectiveSkills, name));
  const duplicateSkillReads = [...observedSkills]
    .filter((name) => hasEquivalentSkill(providedSkills, name))
    .sort();
  const skillReadAttempts = calls
    .map(skillReadAttemptFromCall)
    .filter(Boolean);
  const duplicateSkillReadAttempts = skillReadAttempts
    .filter(({ name }) => hasEquivalentSkill(providedSkills, name));
  const projectToolCalls = calls.filter((call) => !skillReadAttemptFromCall(call));
  const firstProjectToolCallEventIndex = projectToolCalls.length
    ? Math.min(...projectToolCalls.map(({ eventIndex }) => eventIndex))
    : null;
  const substantiveToolCalls = calls.filter((call) => (
    !skillReadAttemptFromCall(call) && !ORCHESTRATION_TOOLS.has(call.name)
  ));
  const firstSubstantiveToolCallEventIndex = substantiveToolCalls.length
    ? Math.min(...substantiveToolCalls.map(({ eventIndex }) => eventIndex))
    : null;
  const nativeTodo = summarizeNativeTodo(calls, firstSubstantiveToolCallEventIndex);
  const nativeTask = summarizeNativeTask(calls, asyncJobResults);
  const provisionMode = [...providedSkillEvidence.values()].some(({ source }) => source === 'autoload')
    ? 'native'
    : customMessages.some(({ customType }) => customType === 'omp-enhancer-core.workflow-guidance')
      ? 'workflow-fallback'
      : providedSkillEvidence.size
        ? 'user-invoked'
        : 'none';

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
    providedSkills: [...providedSkills].sort(),
    providedSkillEvidence: [...providedSkillEvidence.values()]
      .sort((left, right) => skillEvidenceIdentity(left).localeCompare(skillEvidenceIdentity(right))),
    provisionMode,
    duplicateSkillReads,
    skillReadAttempts,
    duplicateSkillReadAttempts,
    firstProjectToolCallEventIndex,
    firstSubstantiveToolCallEventIndex,
    nativeTodo,
    nativeTask,
    claimedSkills: [...claimedSkills].sort(),
    unobservedClaims: unobservedClaims.sort(),
    routes,
    primaryFinalCount: primaryFinals.length,
    primaryFinals,
    autolearnFinalCount: autolearnFinals.length,
    autolearnToolCallCount: calls.filter(({ turnKind }) => turnKind === 'autolearn-capture').length,
    autolearnCaptureCount: customMessages.filter(({ customType }) => customType === 'autolearn-nudge').length,
    advisorMessageCount: customMessages.filter(({ customType }) => customType === 'advisor').length,
    postFinalAdvisorMessageCount,
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
  const observed = new Set([
    ...(summary.observedSkills ?? []),
    ...(summary.providedSkills ?? []),
  ]);

  for (const skill of expectations.requiredSkills ?? []) {
    if (!hasEquivalentSkill(observed, skill)) failures.push(`required skill was not observed or provided: ${skill}`);
  }
  if (Array.isArray(expectations.requiredAnySkills)
    && expectations.requiredAnySkills.length > 0
    && !expectations.requiredAnySkills.some((skill) => hasEquivalentSkill(observed, skill))) {
    failures.push(`none of the acceptable skills were observed or provided: ${expectations.requiredAnySkills.join(', ')}`);
  }
  for (const skill of expectations.forbiddenSkills ?? []) {
    if (hasEquivalentSkill(observed, skill)) failures.push(`forbidden skill was observed or provided: ${skill}`);
  }
  for (const expected of expectations.requiredProvidedSkills ?? []) {
    const requirement = typeof expected === 'string' ? { name: expected } : expected;
    const matches = (summary.providedSkillEvidence ?? []).filter((evidence) => (
      hasEquivalentSkill(new Set([evidence.name]), requirement?.name)
      && (!requirement?.source || evidence.source === requirement.source)
      && (!requirement?.eventSource || evidence.eventSource === requirement.eventSource)
    ));
    if (!matches.length) {
      failures.push(`required provided skill evidence was missing: ${requirement?.name ?? '<unnamed>'}`);
      continue;
    }
    if (requirement?.beforeFirstProjectTool === true) {
      const firstProjectTool = summary.firstProjectToolCallEventIndex;
      if (!Number.isFinite(firstProjectTool)
        || !matches.some(({ eventIndex }) => Number.isFinite(eventIndex) && eventIndex < firstProjectTool)) {
        failures.push(`required skill was not provided before the first project tool: ${requirement.name}`);
      }
    }
  }
  if (expectations.expectedProvisionMode
    && summary.provisionMode !== expectations.expectedProvisionMode) {
    failures.push(`skill provision mode was ${summary.provisionMode ?? 'unobserved'}, expected ${expectations.expectedProvisionMode}`);
  }
  if (Number.isFinite(expectations.maxSkillReadAttempts)
    && (summary.skillReadAttempts?.length ?? 0) > expectations.maxSkillReadAttempts) {
    failures.push(`skill read attempts ${summary.skillReadAttempts.length} exceeded ${expectations.maxSkillReadAttempts}`);
  }
  if (Number.isFinite(expectations.maxDuplicateSkillReadAttempts)
    && (summary.duplicateSkillReadAttempts?.length ?? 0) > expectations.maxDuplicateSkillReadAttempts) {
    failures.push(`duplicate skill read attempts ${summary.duplicateSkillReadAttempts.length} exceeded ${expectations.maxDuplicateSkillReadAttempts}`);
  }
  if (Array.isArray(expectations.expectedToolSequence)) {
    const actualSequence = (summary.toolCalls ?? []).map(({ name }) => name);
    if (JSON.stringify(actualSequence) !== JSON.stringify(expectations.expectedToolSequence)) {
      failures.push(`tool sequence was ${actualSequence.join(' -> ') || '<empty>'}, expected ${expectations.expectedToolSequence.join(' -> ') || '<empty>'}`);
    }
  }
  if (expectations.requireSuccessfulToolCalls === true) {
    const unsuccessful = (summary.toolCalls ?? []).filter(({ completed, isError }) => (
      completed !== true || isError !== false
    ));
    if (unsuccessful.length) failures.push(`${unsuccessful.length} tool call(s) did not complete successfully`);
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
  if (Number.isFinite(expectations.minAdvisorMessages)
    && summary.advisorMessageCount < expectations.minAdvisorMessages) {
    failures.push(`advisor messages ${summary.advisorMessageCount} was below ${expectations.minAdvisorMessages}`);
  }
  if (Number.isFinite(expectations.maxAdvisorMessages)
    && summary.advisorMessageCount > expectations.maxAdvisorMessages) {
    failures.push(`advisor messages ${summary.advisorMessageCount} exceeded ${expectations.maxAdvisorMessages}`);
  }
  if (Number.isFinite(expectations.maxPostFinalAdvisorMessages)
    && summary.postFinalAdvisorMessageCount > expectations.maxPostFinalAdvisorMessages) {
    failures.push(`post-final advisor messages ${summary.postFinalAdvisorMessageCount} exceeded ${expectations.maxPostFinalAdvisorMessages}`);
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
  const nativeTodo = summary.nativeTodo ?? {};
  if (expectations.requireNativeTodoInit === true && !(nativeTodo.initCallCount > 0)) {
    failures.push('native todo was not initialized successfully');
  }
  if (Number.isFinite(expectations.minNativeTodoItems)
    && (nativeTodo.initializedTaskCount ?? 0) < expectations.minNativeTodoItems) {
    failures.push(`native todo initialized ${(nativeTodo.initializedTaskCount ?? 0)} task(s), expected at least ${expectations.minNativeTodoItems}`);
  }
  if (Number.isFinite(expectations.minNativeTodoCompletionTransitions)
    && (nativeTodo.completionTransitionCount ?? 0) < expectations.minNativeTodoCompletionTransitions) {
    failures.push(`native todo completed ${(nativeTodo.completionTransitionCount ?? 0)} task transition(s), expected at least ${expectations.minNativeTodoCompletionTransitions}`);
  }
  if (expectations.requireNativeTodoCompletion === true && nativeTodo.allCompleted !== true) {
    failures.push(`native todo was not fully completed (${nativeTodo.completedTaskCount ?? 0}/${nativeTodo.currentTaskCount ?? 0})`);
  }
  if (expectations.requireNativeTodoInitBeforeSubstantiveTool === true
    && nativeTodo.initializedBeforeFirstSubstantiveTool !== true) {
    failures.push('native todo was not initialized before the first substantive tool call');
  }

  const nativeTask = summary.nativeTask ?? {};
  const assignmentAttemptCount = nativeTask.assignmentAttemptCount ?? nativeTask.forkCount ?? 0;
  const minAssignmentAttempts = Number.isFinite(expectations.minNativeTaskAssignmentAttempts)
    ? expectations.minNativeTaskAssignmentAttempts
    : expectations.minNativeTaskForks;
  const maxAssignmentAttempts = Number.isFinite(expectations.maxNativeTaskAssignmentAttempts)
    ? expectations.maxNativeTaskAssignmentAttempts
    : expectations.maxNativeTaskForks;
  if (Number.isFinite(expectations.minNativeTaskCalls)
    && (nativeTask.callCount ?? 0) < expectations.minNativeTaskCalls) {
    failures.push(`native task calls ${(nativeTask.callCount ?? 0)} was below ${expectations.minNativeTaskCalls}`);
  }
  if (Number.isFinite(minAssignmentAttempts)
    && assignmentAttemptCount < minAssignmentAttempts) {
    failures.push(`native task assignment attempts ${assignmentAttemptCount} was below ${minAssignmentAttempts}`);
  }
  if (Number.isFinite(maxAssignmentAttempts)
    && assignmentAttemptCount > maxAssignmentAttempts) {
    failures.push(`native task assignment attempts ${assignmentAttemptCount} exceeded ${maxAssignmentAttempts}`);
  }
  if (Number.isFinite(expectations.minNativeTaskBatchCalls)
    && (nativeTask.batchCallCount ?? 0) < expectations.minNativeTaskBatchCalls) {
    failures.push(`native task batch calls ${(nativeTask.batchCallCount ?? 0)} was below ${expectations.minNativeTaskBatchCalls}`);
  }
  if (expectations.requireNativeTaskBatch === true && !(nativeTask.multiForkBatchCallCount > 0)) {
    failures.push('no native task batch forked multiple subagents');
  }
  if (typeof expectations.requiredNativeTaskContext === 'string') {
    const mismatched = (nativeTask.assignments ?? []).filter(({ context }) => (
      context !== expectations.requiredNativeTaskContext
    ));
    if (!nativeTask.assignments?.length || mismatched.length) {
      failures.push(`${mismatched.length || 'all'} native task assignment(s) omitted the required native task context: ${expectations.requiredNativeTaskContext}`);
    }
  }
  if (expectations.requireNativeTaskCompletion === true) {
    const jobs = nativeTask.jobStatuses ?? [];
    if (!jobs.length) {
      failures.push('no spawned native task job status was observed');
    } else {
      for (const job of jobs) {
        if (job.status !== 'completed') {
          failures.push(`native task job ${job.id} ended with ${job.status ?? 'unobserved'}`);
        }
      }
    }
  }
  const nativeTaskAgents = new Set(nativeTask.agents ?? []);
  const nativeTaskWorkflows = new Set(nativeTask.workflows ?? []);
  const nativeTaskSkills = new Set(nativeTask.skills ?? []);
  for (const agent of expectations.requiredNativeTaskAgents ?? []) {
    if (!nativeTaskAgents.has(agent)) failures.push(`required native task agent was not observed: ${agent}`);
  }
  for (const agent of expectations.forbiddenNativeTaskAgents ?? []) {
    if (nativeTaskAgents.has(agent)) failures.push(`forbidden native task agent was observed: ${agent}`);
  }
  for (const workflow of expectations.requiredNativeTaskWorkflows ?? []) {
    if (!nativeTaskWorkflows.has(workflow)) failures.push(`required native task workflow was not observed: ${workflow}`);
  }
  for (const skill of expectations.requiredNativeTaskSkills ?? []) {
    if (!hasEquivalentSkill(nativeTaskSkills, skill)) failures.push(`required native task skill was not observed: ${skill}`);
  }
  const requiredTaskMetadata = Array.isArray(expectations.requiredNativeTaskMetadata)
    ? expectations.requiredNativeTaskMetadata
    : expectations.requireNativeTaskMetadataPrefix === true
      ? TASK_ASSIGNMENT_METADATA_FIELDS
      : [];
  if (requiredTaskMetadata.length) {
    const assignments = nativeTask.assignments ?? [];
    if (!assignments.length) {
      failures.push('no native task assignments were observed for metadata evaluation');
    } else {
      const incomplete = assignments.filter(({ metadata }) => (
        requiredTaskMetadata.some((field) => !metadata?.[field])
      ));
      if (incomplete.length) {
        failures.push(`${incomplete.length} native task assignment(s) omitted ${requiredTaskMetadata.join('/')} metadata from the first ${TASK_METADATA_PREFIX_CHAR_LIMIT} characters`);
      }
    }
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
    eventIndex: Number.isFinite(value.eventIndex) ? value.eventIndex : -1,
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

function asyncJobResultsFromEvent(event) {
  const message = event?.type === 'message_end' ? event.message : event;
  if (message?.role !== 'custom' || message?.customType !== 'async-result') return [];
  const content = typeof message.content === 'string'
    ? message.content
    : Array.isArray(message.content)
      ? message.content.map((item) => String(item?.text ?? '')).join('\n')
      : '';
  const jobs = [];
  for (const match of content.matchAll(/<task-result\b([^>]*)>/giu)) {
    const attributes = match[1];
    const id = attributeValue(attributes, 'id');
    const status = normalizeJobStatus(attributeValue(attributes, 'status'));
    if (id) jobs.push({ id, status });
  }
  return jobs;
}

function attributeValue(value, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}=(?:"([^"]*)"|'([^']*)')`, 'iu').exec(String(value ?? ''))?.slice(1).find((item) => item !== undefined) ?? '';
}

function customIdentity(custom) {
  const evidence = custom.providedSkillEvidence.map(skillEvidenceIdentity).sort().join(',');
  return `${custom.customType}:${custom.contentDigest}:${custom.attribution ?? ''}:${custom.display}:${evidence}`;
}

function normalizeCustom(value) {
  const customType = String(value?.customType ?? value?.custom_type ?? '').trim();
  if (!customType) return null;
  const details = value?.details && typeof value.details === 'object' ? value.details : {};
  const attribution = value?.attribution ?? null;
  const providedSkillEvidence = customType === 'skill-prompt'
    ? normalizeProvidedSkillEvidence(details, attribution)
    : [];
  return {
    customType,
    display: value?.display !== false,
    attribution,
    contentDigest: digest(typeof value?.content === 'string' ? value.content : JSON.stringify(value?.content ?? '')),
    providedSkills: [...new Set(providedSkillEvidence.map(({ name }) => name))],
    providedSkillEvidence,
  };
}

function normalizeProvidedSkillEvidence(details, attribution) {
  const coreAutoload = attribution === 'agent'
    && details.provisionProvider === 'omp-enhancer-core'
    && details.provisionSchemaVersion === 1;
  const source = coreAutoload ? 'autoload' : attribution === 'user' ? 'user' : 'untrusted';
  const routed = new Set((details.routedSkills ?? []).map(normalizeSkillName).filter(Boolean));
  const records = Array.isArray(details.providedSkillRecords)
    ? details.providedSkillRecords
    : [];
  const evidence = records.map((record) => ({
    name: normalizeSkillName(record?.name),
    path: String(record?.path ?? '').trim(),
    requestedSkill: normalizeSkillName(record?.requestedSkill),
    source: coreAutoload
      && routed.has(normalizeSkillName(record?.requestedSkill))
      && /(?:^|\/)SKILL\.md$/i.test(String(record?.path ?? '').replace(/\\/g, '/'))
      ? source
      : coreAutoload ? 'untrusted' : source,
  })).filter(({ name }) => name);
  if (!evidence.length && !coreAutoload) {
    const name = normalizeSkillName(details.name);
    if (name) evidence.push({
      name,
      path: String(details.path ?? '').trim(),
      requestedSkill: '',
      source,
    });
  }
  const uniqueEvidence = new Map();
  for (const item of evidence) uniqueEvidence.set(skillEvidenceIdentity(item), item);
  return [...uniqueEvidence.values()];
}

function skillEvidenceIdentity(evidence) {
  return [
    evidence.source ?? '',
    normalizeSkillName(evidence.name),
    String(evidence.path ?? ''),
    normalizeSkillName(evidence.requestedSkill),
  ].join(':');
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

function skillReadAttemptFromCall(call) {
  if (call?.name !== 'read') return null;
  const target = String(
    call.arguments?.path
    ?? call.arguments?.file_path
    ?? call.arguments?.uri
    ?? call.arguments?.value
    ?? '',
  ).trim();
  const uriMatch = target.match(/^skill:\/\/([^/\s]+)(?:\/SKILL\.md)?/i);
  let name = uriMatch?.[1] ?? '';
  if (!name && /(?:^|\/)SKILL\.md$/i.test(target)) {
    const parts = target.replace(/\\/g, '/').split('/');
    name = parts.at(-2) ?? '';
  }
  name = normalizeSkillName(name);
  if (!name) return null;
  return {
    id: call.id,
    name,
    target,
    completed: call.completed,
    isError: call.isError,
    turnKind: call.turnKind,
    eventIndex: call.eventIndex,
  };
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

function summarizeTodoResult(details) {
  if (!details || typeof details !== 'object') return null;
  const phases = Array.isArray(details.phases) ? details.phases : [];
  const tasks = phases.flatMap((phase) => (
    Array.isArray(phase?.tasks) ? phase.tasks : []
  ));
  const completedTasks = Array.isArray(details.completedTasks) ? details.completedTasks : [];
  return {
    op: typeof details.op === 'string' ? details.op : null,
    taskCount: tasks.length,
    completedTaskCount: tasks.filter(({ status }) => status === 'completed').length,
    pendingTaskCount: tasks.filter(({ status }) => status === 'pending' || status === 'in_progress').length,
    abandonedTaskCount: tasks.filter(({ status }) => status === 'abandoned').length,
    completionTransitions: completedTasks.length,
  };
}

function summarizeTaskResult(details) {
  if (!details || typeof details !== 'object') return null;
  const records = [
    ...(Array.isArray(details.progress) ? details.progress : []),
    ...(Array.isArray(details.results) ? details.results : []),
  ];
  if (details.async?.jobId) {
    records.push({ id: details.async.jobId, status: details.async.state });
  }
  return { jobs: normalizeJobRecords(records) };
}

function summarizeJobResults(details) {
  if (!details || typeof details !== 'object') return [];
  return normalizeJobRecords(Array.isArray(details.jobs) ? details.jobs : []);
}

function normalizeJobRecords(records) {
  const jobs = new Map();
  for (const record of records) {
    const id = typeof record?.id === 'string' ? record.id.trim() : '';
    if (!id) continue;
    jobs.set(id, {
      id,
      status: normalizeJobStatus(record.status ?? record.state),
    });
  }
  return [...jobs.values()];
}

function normalizeJobStatus(value) {
  const status = String(value ?? '').trim().toLowerCase();
  return status || 'unobserved';
}

function summarizeNativeTodo(calls, firstSubstantiveToolCallEventIndex) {
  const todoCalls = calls.filter(({ name }) => name === 'todo');
  const successful = todoCalls.filter(({ completed, isError }) => completed === true && isError === false);
  const initCalls = successful.filter((call) => (
    call.arguments?.op === 'init' || call.todoResult?.op === 'init'
  ));
  const doneCalls = successful.filter((call) => (
    call.arguments?.op === 'done' || call.todoResult?.op === 'done'
  ));
  const latestSnapshot = [...successful].reverse().find(({ todoResult }) => todoResult)?.todoResult ?? null;
  const latestInit = initCalls.at(-1);
  const initializedTaskCount = latestInit?.todoResult?.taskCount
    ?? todoInitTaskCount(latestInit?.arguments)
    ?? 0;
  const completionTransitionCount = successful.reduce((sum, call) => (
    sum + (call.todoResult?.completionTransitions ?? 0)
  ), 0);
  const earliestInitEventIndex = initCalls.length
    ? Math.min(...initCalls.map(({ eventIndex }) => eventIndex))
    : null;
  const initializedBeforeFirstSubstantiveTool = earliestInitEventIndex != null
    && (firstSubstantiveToolCallEventIndex == null
      || earliestInitEventIndex < firstSubstantiveToolCallEventIndex);
  const currentTaskCount = latestSnapshot?.taskCount ?? 0;
  const completedTaskCount = latestSnapshot?.completedTaskCount ?? 0;

  return {
    callCount: todoCalls.length,
    successfulCallCount: successful.length,
    initCallCount: initCalls.length,
    doneCallCount: doneCalls.length,
    initializedTaskCount,
    completionTransitionCount,
    currentTaskCount,
    completedTaskCount,
    pendingTaskCount: latestSnapshot?.pendingTaskCount ?? 0,
    abandonedTaskCount: latestSnapshot?.abandonedTaskCount ?? 0,
    allCompleted: currentTaskCount > 0 && completedTaskCount === currentTaskCount,
    firstInitEventIndex: earliestInitEventIndex,
    initializedBeforeFirstSubstantiveTool,
  };
}

function todoInitTaskCount(args) {
  if (!args || args.op !== 'init') return null;
  if (Array.isArray(args.list)) {
    return args.list.reduce((sum, phase) => sum + (Array.isArray(phase?.items) ? phase.items.length : 0), 0);
  }
  return Array.isArray(args.items) ? args.items.length : null;
}

function summarizeNativeTask(calls, asyncJobResults = []) {
  const taskCalls = calls.filter(({ name }) => name === 'task');
  const assignments = taskCalls.flatMap((call) => taskAssignmentsFromCall(call));
  const batchCalls = taskCalls.filter(({ arguments: args }) => Array.isArray(args?.tasks));
  const multiForkBatchCalls = batchCalls.filter(({ arguments: args }) => args.tasks.length > 1);
  const agents = uniqueSorted(assignments.map(({ agent }) => agent).filter(Boolean));
  const workflows = uniqueSorted(assignments.flatMap(({ metadata }) => metadataItems(metadata.workflow)));
  const skills = uniqueSorted(assignments.flatMap(({ metadata }) => metadataItems(metadata.skills)));
  const submittedJobs = new Map();
  for (const call of taskCalls) {
    for (const job of call.taskResult?.jobs ?? []) submittedJobs.set(job.id, job.status);
  }
  for (const call of calls.filter(({ name }) => name === 'job')) {
    for (const job of call.jobResults ?? []) {
      if (submittedJobs.has(job.id)) submittedJobs.set(job.id, job.status);
    }
  }
  for (const job of asyncJobResults) {
    if (submittedJobs.has(job.id)) submittedJobs.set(job.id, job.status);
  }
  const jobStatuses = [...submittedJobs.entries()]
    .map(([id, status]) => ({ id, status }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const completedForkCount = jobStatuses.filter(({ status }) => status === 'completed').length;
  return {
    callCount: taskCalls.length,
    successfulCallCount: taskCalls.filter(({ completed, isError }) => completed === true && isError === false).length,
    batchCallCount: batchCalls.length,
    multiForkBatchCallCount: multiForkBatchCalls.length,
    forkCount: assignments.length,
    assignmentAttemptCount: assignments.length,
    successfulForkCount: assignments.filter(({ successful }) => successful).length,
    successfulAssignmentAttemptCount: assignments.filter(({ successful }) => successful).length,
    submittedJobCount: jobStatuses.length,
    completedForkCount,
    allSubmittedJobsCompleted: jobStatuses.length > 0 && completedForkCount === jobStatuses.length,
    jobStatuses,
    metadataCompleteCount: assignments.filter(({ metadataComplete }) => metadataComplete).length,
    metadataIncompleteCount: assignments.filter(({ metadataComplete }) => !metadataComplete).length,
    agents,
    workflows,
    skills,
    assignments,
  };
}

function taskAssignmentsFromCall(call) {
  const args = call.arguments ?? {};
  const isBatch = Array.isArray(args.tasks);
  const items = isBatch ? args.tasks : [{ name: args.name, agent: args.agent, task: args.task }];
  return items
    .filter((item) => item && typeof item.task === 'string' && item.task.trim())
    .map((item, index) => {
      const prefix = takeCodePoints(item.task, TASK_METADATA_PREFIX_CHAR_LIMIT);
      const metadata = taskAssignmentMetadata(prefix);
      const missingMetadata = TASK_ASSIGNMENT_METADATA_FIELDS.filter((field) => !metadata[field]);
      return {
        callId: call.id,
        index,
        batch: isBatch,
        context: typeof args.context === 'string' ? args.context : null,
        name: typeof item.name === 'string' ? item.name : null,
        agent: typeof item.agent === 'string' ? item.agent : null,
        prefix,
        prefixCharacterCount: [...prefix].length,
        metadata,
        missingMetadata,
        metadataComplete: missingMetadata.length === 0,
        completed: call.completed,
        successful: call.completed === true && call.isError === false,
      };
    });
}

function taskAssignmentMetadata(prefix) {
  const compact = String(prefix).match(/\[workflow=([^\]\s]+)\s+step=([^\]]*?)\s+todo=([^\]]*?)\s+skills=([^\]]*?)\]/iu);
  if (compact) {
    return {
      workflow: normalizeMetadataValue(compact[1]),
      step: normalizeMetadataValue(compact[2]),
      todo: normalizeMetadataValue(compact[3]),
      skills: normalizeMetadataValue(compact[4]),
    };
  }
  return {
    workflow: metadataValue(prefix, /(?:OMP[_ -]?WORKFLOW(?![_ -]?STEP)|WORKFLOW(?![_ -]?STEP))/iu),
    step: metadataValue(prefix, /(?:OMP[_ -]?WORKFLOW[_ -]?STEP|WORKFLOW[_ -]?STEP|STEP)/iu),
    todo: metadataValue(prefix, /(?:OMP[_ -]?TODO(?:[_ -]?ITEM)?|TODO(?:[_ -]?ITEM)?)/iu),
    skills: metadataValue(prefix, /(?:OMP[_ -]?(?:REQUIRED[_ -]?)?SKILLS?|(?:REQUIRED[_ -]?)?SKILLS?(?:[_ -]?FOR[_ -]?THIS[_ -]?ROLE)?)/iu),
  };
}

function metadataValue(text, labelPattern) {
  const match = new RegExp(`${labelPattern.source}\\s*[:=]\\s*([^\\n;|]{1,80})`, labelPattern.flags).exec(text);
  return normalizeMetadataValue(match?.[1]);
}

function normalizeMetadataValue(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || /^(?:unspecified|unknown|none|n\/a|pending)$/iu.test(normalized)) return null;
  return normalized;
}

function metadataItems(value) {
  return String(value ?? '')
    .split(/[\s,，]+/u)
    .map((item) => item.trim())
    .filter((item) => normalizeMetadataValue(item));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function takeCodePoints(value, limit) {
  return [...String(value ?? '')].slice(0, limit).join('');
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
