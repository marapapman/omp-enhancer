import { createHash } from 'node:crypto';
import nodePath from 'node:path';

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
const WORKFLOW_PLAN_PATTERN = /^[ \t]*(?:#{1,6}[ \t]+)?(?:\*{1,3}|_{1,3})?WORKFLOW[ \t]+PLAN(?:\*{1,3}|_{1,3})?[ \t]*(?=\||\r?$)/gimu;
const WORKFLOW_READY_PATTERN = /\bWORKFLOW\s+READY(?:\s*(?:\*{1,3}|_{1,3}))?\s*\|/iu;
const RESOURCE_EXTENSION_PATTERN = /^[ \t]*RESOURCE[ \t]+EXTENSION[ \t]*(?=\|)/gimu;
const MAX_RESOURCE_EXTENSION_BATCHES = 3;
const MAX_RESOURCE_EXTENSION_READS = 6;
const WORKFLOW_INDEX_URI_PATTERN = /^skill:\/\/omp-enhancer-workflows(?:\/SKILL\.md)?(?:[?#].*)?$/iu;
const WORKFLOW_REFERENCE_URI_PATTERN = /^skill:\/\/omp-enhancer-workflows\/references\/[^\s?#]+(?:[?#].*)?$/iu;
const CLAIM_VERDICTS = new Set([
  'SUPPORTED',
  'CONTRADICTED',
  'LOCAL_UNVERIFIED',
  'INSUFFICIENT',
  'UNVERIFIABLE',
  'CONFLICTED',
  'PARTIAL',
]);
const CLAIM_VERDICT_TOKEN = '(LOCAL[ _-]+UNVERIFIED|SUPPORTED|CONTRADICTED|INSUFFICIENT|UNVERIFIABLE|CONFLICTED|PARTIAL)';

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
  const assistantBatches = [];
  const assistantStops = [];
  const finals = [];
  const observedSkills = new Set();
  const providedSkills = new Set();
  const providedSkillEvidence = new Map();
  const claimedSkills = new Set();
  const agentArtifactPreviews = [];
  const visibleAdvisorMessages = [];
  let pendingTurnKind = 'user';
  let activeTurnKind = 'user';
  let agentStarts = 0;
  let agentEnds = 0;
  let sawPrimaryFinal = false;
  let postFinalAdvisorMessageCount = 0;

  for (const [eventIndex, event] of events.entries()) {
    for (const target of agentArtifactPreviewsFromEvent(event)) {
      agentArtifactPreviews.push({ target, eventIndex });
    }
    asyncJobResults.push(...asyncJobResultsFromEvent(event).map((job) => ({
      ...job,
      eventIndex,
    })));
    const custom = customMessageFromEvent(event);
    if (custom) {
      customMessages.push(custom);
      if (custom.customType === 'advisor'
        && sawPrimaryFinal
        && event?.type === 'message_end') {
        postFinalAdvisorMessageCount += 1;
      }
      if (custom.customType === 'advisor' && custom.display !== false) {
        visibleAdvisorMessages.push({
          eventIndex,
          text: customContentTextFromEvent(event),
        });
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
      const assistantBatchIndex = assistantBatches.length;
      const batch = {
        batchIndex: assistantBatchIndex,
        eventIndex,
        turnKind: activeTurnKind,
        text: '',
        workflowPlanContentIndex: null,
        workflowPlanCharacterIndex: null,
        workflowPlanDeclaration: null,
        workflowReadyContentIndex: null,
        workflowReadyCharacterIndex: null,
        workflowReadyDeclaration: null,
        resourceExtensionContentIndex: null,
        resourceExtensionCharacterIndex: null,
        resourceExtensionDeclaration: null,
        firstVisibleTextContentIndex: null,
        toolCallIds: [],
        toolNames: [],
      };
      assistantBatches.push(batch);
      const messageCalls = content.filter((item) => item?.type === 'toolCall');
      for (const [contentIndex, item] of content.entries()) {
        if (item?.type === 'text') {
          const itemText = String(item.text ?? '');
          if (batch.firstVisibleTextContentIndex == null && itemText.trim()) {
            batch.firstVisibleTextContentIndex = contentIndex;
          }
          const workflowPlanMarker = workflowPlanMarkerFromVisibleText(itemText);
          const workflowReadyCharacterIndex = itemText.search(WORKFLOW_READY_PATTERN);
          const resourceExtensionMarker = resourceExtensionMarkerFromVisibleText(itemText);
          if (batch.workflowPlanContentIndex == null && workflowPlanMarker) {
            batch.workflowPlanContentIndex = contentIndex;
            batch.workflowPlanCharacterIndex = workflowPlanMarker.characterIndex;
            batch.workflowPlanDeclaration = workflowPlanMarker.declaration;
          }
          if (batch.workflowReadyContentIndex == null && workflowReadyCharacterIndex >= 0) {
            batch.workflowReadyContentIndex = contentIndex;
            batch.workflowReadyCharacterIndex = workflowReadyCharacterIndex;
            batch.workflowReadyDeclaration = workflowDeclarationFromVisibleMarker(
              itemText,
              workflowReadyCharacterIndex,
            );
          }
          if (batch.resourceExtensionContentIndex == null && resourceExtensionMarker) {
            batch.resourceExtensionContentIndex = contentIndex;
            batch.resourceExtensionCharacterIndex = resourceExtensionMarker.characterIndex;
            batch.resourceExtensionDeclaration = resourceExtensionMarker.declaration;
          }
          continue;
        }
        if (item?.type !== 'toolCall') continue;
        const call = registerCall(calls, callsById, unresolvedByFingerprint, {
          id: item.id ?? item.toolCallId,
          name: item.name,
          arguments: item.arguments ?? item.input ?? {},
          turnKind: activeTurnKind,
          eventIndex,
          observation: 'assistant-message',
          assistantBatchIndex,
          contentIndex,
        });
        if (call) {
          batch.toolCallIds.push(call.id);
          batch.toolNames.push(call.name);
        }
      }
      const text = content
        .filter((item) => item?.type === 'text')
        .map((item) => String(item.text ?? ''))
        .join('\n')
        .trim();
      batch.text = text;
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
        observation: 'execution-start',
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
        call.completionEventIndex = eventIndex;
        const fullResultText = resultText(result);
        call.resultPreview = fullResultText.slice(0, 1000);
        call.revealedSkillUris = exactSkillUrisFromText(fullResultText);
        if (!isError && call.name === 'todo') {
          call.todoResult = summarizeTodoResult(result?.details);
        }
        if (!isError && call.name === 'task') {
          call.taskResult = summarizeTaskResult(result?.details);
        }
        if (!isError && call.name === 'job') {
          call.jobResults = summarizeJobResults(result?.details);
        }
        if (call.name === 'bash') {
          call.commandResult = summarizeCommandResult(result?.details, isError);
        }
        if (!isError && call.name === 'read') {
          const skill = skillNameFromRead(call.arguments, result);
          if (skill) {
            observedSkills.add(skill);
            call.resolvedSkillName = skill;
          }
        }
      }
    }
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
  for (const call of calls) call.workflowStageKind = workflowStageKindFromCall(call);
  const workflowPreparation = summarizeWorkflowPreparation(calls, assistantBatches);
  const skillPathDiagnostics = summarizeSkillPathDiagnostics(
    calls,
    workflowPreparation,
    visibleAdvisorMessages,
  );
  const pendingPreparationCallIds = new Set();
  if (workflowPreparation.pendingLanguageTransition?.valid === true) {
    pendingPreparationCallIds.add(workflowPreparation.pendingLanguageTransition.languageReadCallId);
    for (const batchIndex of [
      workflowPreparation.pendingLanguageTransition.initialReadyBatchIndex,
      workflowPreparation.pendingLanguageTransition.replacementReadyBatchIndex,
    ]) {
      for (const call of calls.filter(({ assistantBatchIndex }) => assistantBatchIndex === batchIndex)) {
        pendingPreparationCallIds.add(call.id);
      }
    }
  }
  const projectToolCalls = calls.filter((call) => (
    !nonProjectResourceReadFromCall(call) && !pendingPreparationCallIds.has(call.id)
  ));
  const firstProjectToolCallEventIndex = projectToolCalls.length
    ? Math.min(...projectToolCalls.map(({ eventIndex }) => eventIndex))
    : null;
  const substantiveToolCalls = calls.filter((call) => (
    !nonProjectResourceReadFromCall(call)
    && !ORCHESTRATION_TOOLS.has(call.name)
    && !pendingPreparationCallIds.has(call.id)
  ));
  const firstSubstantiveToolCallEventIndex = substantiveToolCalls.length
    ? Math.min(...substantiveToolCalls.map(({ eventIndex }) => eventIndex))
    : null;
  const nativeTodo = summarizeNativeTodo(calls, firstSubstantiveToolCallEventIndex);
  const nativeTask = summarizeNativeTask(calls, asyncJobResults);
  const tddTrace = summarizeTddTrace(calls, metadata.projectRoot);
  const mainReviews = assistantBatches
    .map(({ eventIndex, batchIndex, text: batchText }) => {
      const markerIndex = String(batchText ?? '').search(/^MAIN REVIEW\b/imu);
      if (markerIndex < 0) return null;
      return {
        eventIndex,
        batchIndex,
        text: String(batchText).slice(markerIndex).trim(),
      };
    })
    .filter(Boolean);
  const provisionMode = [...providedSkillEvidence.values()].some(({ source }) => source === 'autoload')
    ? 'native'
    : customMessages.some(({ customType }) => customType === 'omp-enhancer-core.workflow-guidance')
      ? 'workflow-fallback'
      : providedSkillEvidence.size
        ? 'user-invoked'
        : 'none';
  const agentArtifactReads = summarizeAgentArtifactReads(calls, agentArtifactPreviews);

  return {
    scenarioId: metadata.scenarioId ?? null,
    exitCode: metadata.exitCode ?? null,
    signal: metadata.signal ?? null,
    durationMs: metadata.durationMs ?? null,
    timedOut: metadata.timedOut === true,
    invalidJsonLines: metadata.invalidJsonLines ?? [],
    eventCapture: metadata.eventCapture ?? null,
    agentStarts,
    agentEnds,
    assistantBatches,
    workflowPreparation,
    toolCalls: calls,
    toolCallCount: calls.length,
    sourceSearchCallCount: calls.filter(({ name }) => SOURCE_SEARCH_TOOLS.has(name)).length,
    agentArtifactReadCount: agentArtifactReads.readCount,
    agentArtifactReadViolations: agentArtifactReads.violations,
    webCallCount: calls.filter(({ name }) => WEB_TOOLS.has(name) || /(?:web|browse|search_query)/i.test(name)).length,
    observedSkills: [...observedSkills].sort(),
    providedSkills: [...providedSkills].sort(),
    providedSkillEvidence: [...providedSkillEvidence.values()]
      .sort((left, right) => skillEvidenceIdentity(left).localeCompare(skillEvidenceIdentity(right))),
    provisionMode,
    duplicateSkillReads,
    skillReadAttempts,
    duplicateSkillReadAttempts,
    ...skillPathDiagnostics,
    firstProjectToolCallEventIndex,
    firstSubstantiveToolCallEventIndex,
    nativeTodo,
    nativeTask,
    tddTrace,
    mainReviews,
    claimedSkills: [...claimedSkills].sort(),
    unobservedClaims: unobservedClaims.sort(),
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
    assistantErrorCount: assistantStops.filter(({ stopReason }) => stopReason === 'error').length,
    abortedAssistantCount: assistantStops.filter(({ stopReason }) => stopReason === 'aborted').length,
    assistantTextDigest: digest(assistantTexts.join('\n')),
  };
}

export function evaluateWorkflowSummary(summary, expectations = {}) {
  const failures = [];
  const eventCapture = summary.eventCapture ?? {};
  const invalidJsonLineCount = Array.isArray(summary.invalidJsonLines)
    ? summary.invalidJsonLines.length
    : 0;
  const captureInvalidLineCount = Number.isSafeInteger(eventCapture.invalidLineCount)
    && eventCapture.invalidLineCount > 0
    ? eventCapture.invalidLineCount
    : 0;
  const malformedLineCount = Math.max(invalidJsonLineCount, captureInvalidLineCount);
  const oversizedLineCount = Number.isSafeInteger(eventCapture.oversizedLineCount)
    && eventCapture.oversizedLineCount > 0
    ? eventCapture.oversizedLineCount
    : 0;
  const capacityDroppedLineCount = Number.isSafeInteger(eventCapture.capacityDroppedLineCount)
    && eventCapture.capacityDroppedLineCount > 0
    ? eventCapture.capacityDroppedLineCount
    : 0;
  if (malformedLineCount > 0) {
    failures.push(`workflow event stream contained ${malformedLineCount} malformed NDJSON line(s)`);
  }
  if (eventCapture.captureTruncated === true) {
    failures.push('workflow event capture was truncated');
  }
  if (oversizedLineCount > 0) {
    failures.push(`workflow event capture dropped ${oversizedLineCount} oversized line(s)`);
  }
  if (capacityDroppedLineCount > 0) {
    failures.push(`workflow event capture dropped ${capacityDroppedLineCount} line(s) at capacity`);
  }
  const assistantErrors = (summary.assistantStops ?? [])
    .filter(({ stopReason }) => stopReason === 'error');
  if (assistantErrors.length > 0) {
    const messages = [...new Set(assistantErrors
      .map(({ errorMessage }) => String(errorMessage ?? '').replace(/\s+/gu, ' ').trim().slice(0, 240))
      .filter(Boolean))];
    failures.push(
      `assistant model or transport error(s): ${assistantErrors.length}`
      + (messages.length ? ` (${messages.join('; ')})` : ''),
    );
  }
  const workflowPreparation = summary.workflowPreparation ?? {};
  if (workflowPreparation.pendingLanguageTransition?.valid === false) {
    failures.push(...workflowPreparation.pendingLanguageTransition.failures);
  }
  if (expectations.requireWorkflowIndexOnlyFirstToolBatch === true
    && workflowPreparation.indexOnlyFirstToolBatch !== true) {
    failures.push('workflow index was not the only successful call in the first assistant tool batch');
  }
  if (expectations.requireWorkflowPlanBeforeResourceLoads === true
    && workflowPreparation.planAfterIndexBeforeLoadsOrProjectTools !== true) {
    failures.push('WORKFLOW PLAN was not observed after the workflow index completed and before resource or project tools');
  }
  if (expectations.requireWorkflowPlanBeforeResourceLoads === true
    && expectations.requiredWorkflowPlanFormat
    && workflowPreparation.workflowPlanDeclaration?.format !== expectations.requiredWorkflowPlanFormat) {
    failures.push(`WORKFLOW PLAN format was ${workflowPreparation.workflowPlanDeclaration?.format ?? '<none>'}, expected ${expectations.requiredWorkflowPlanFormat}`);
  }
  if (expectations.requireWorkflowPlanBeforeResourceLoads === true
    && Number.isFinite(expectations.minWorkflowPlanNumberedActions)
    && (workflowPreparation.workflowPlanDeclaration?.numberedActionCount ?? 0) < expectations.minWorkflowPlanNumberedActions) {
    failures.push(`WORKFLOW PLAN numbered actions ${workflowPreparation.workflowPlanDeclaration?.numberedActionCount ?? 0} were below ${expectations.minWorkflowPlanNumberedActions}`);
  }
  if (expectations.requireWorkflowPlanFirstVisibleContent === true
    && workflowPreparation.workflowPlanFirstVisibleContent !== true) {
    failures.push('WORKFLOW PLAN was not the first nonempty visible text item in its assistant response');
  }
  if (expectations.requireWorkflowPlanLoadCallsSameBatch === true) {
    failures.push(...workflowPlanLoadBatchFailures(summary, workflowPreparation));
  }
  if (expectations.requireStructuredWorkflowLoadPhases === true) {
    failures.push(...structuredWorkflowLoadPhaseFailures(summary, workflowPreparation));
  }
  if (expectations.forbidResourceProjectSameBatch === true
    && (workflowPreparation.mixedResourceProjectBatchIndexes?.length ?? 0) > 0) {
    failures.push(`workflow preparation resources and project tools shared assistant batch(es): ${workflowPreparation.mixedResourceProjectBatchIndexes.join(', ')}`);
  }
  if (expectations.requireWorkflowReadyAfterLoadsBeforeProjectTools === true
    && workflowPreparation.readyAfterLoadsBeforeProjectTools !== true) {
    failures.push('WORKFLOW READY was not observed after resource loads completed and before project tools');
  }
  if (expectations.requireWorkflowReadyFirstVisibleContent === true
    && workflowPreparation.workflowReadyFirstVisibleContent !== true) {
    failures.push('WORKFLOW READY was not the first nonempty visible text item in its assistant response');
  }
  if (expectations.requireWorkflowReadyTodoOnlyBatch === true
    && workflowPreparation.workflowReadyOnlyTodoInitCall !== true) {
    failures.push('WORKFLOW READY batch did not contain only native TODO init followed by a wait');
  }
  failures.push(...workflowSelectionFailures(workflowPreparation, expectations));
  failures.push(...workflowResourceDeclarationFailures(summary, workflowPreparation, expectations));
  failures.push(...linkedResourceExtensionFailures(summary, workflowPreparation));
  failures.push(...workflowLoadOrderFailures(summary, workflowPreparation, expectations));
  if (expectations.requireExactSelectedWorkflowReferences === true) {
    failures.push(...exactWorkflowReferenceFailures(summary, workflowPreparation));
  }
  if (Number.isFinite(expectations.minWorkflowReferenceReads)) {
    const successfulReferenceReads = (summary.toolCalls ?? []).filter((call) => (
      call.workflowStageKind === 'workflow-reference'
      && call.completed === true
      && call.isError === false
    )).length;
    if (successfulReferenceReads < expectations.minWorkflowReferenceReads) {
      failures.push(`successful workflow reference reads ${successfulReferenceReads} were below ${expectations.minWorkflowReferenceReads}`);
    }
  }
  if (expectations.forbidWorkflowMarkers === true
    && ((workflowPreparation.workflowPlanMarkerCount ?? 0) > 0
      || (workflowPreparation.workflowReadyMarkerCount ?? 0) > 0)) {
    failures.push('workflow markers were observed for a direct mechanical task');
  }
  const observed = new Set([
    ...(summary.observedSkills ?? []),
    ...(summary.providedSkills ?? []),
  ]);
  const observedOnly = new Set(summary.observedSkills ?? []);

  for (const skill of expectations.requiredSkills ?? []) {
    if (!hasEquivalentSkill(observed, skill)) failures.push(`required skill was not observed or provided: ${skill}`);
  }
  for (const skill of expectations.requiredObservedSkills ?? []) {
    if (!hasEquivalentSkill(observedOnly, skill)) failures.push(`required observed skill was not read successfully: ${skill}`);
  }
  for (const skill of expectations.requiredObservedSkillsBeforeProjectTools ?? []) {
    const firstProjectTool = summary.firstProjectToolCallEventIndex;
    const observedBeforeProjectTools = (summary.skillReadAttempts ?? []).some((attempt) => (
      attempt.completed === true
      && attempt.isError === false
      && hasEquivalentSkill(new Set([attempt.name]), skill)
      && Number.isFinite(firstProjectTool)
      && Number.isFinite(attempt.eventIndex)
      && attempt.eventIndex < firstProjectTool
    ));
    if (!observedBeforeProjectTools) {
      failures.push(`required observed skill was not read successfully before project tools: ${skill}`);
    }
  }
  for (const uri of expectations.requiredExactSkillUrisBeforeProjectTools ?? []) {
    const expectedUri = stripOuterMarkdown(uri);
    const firstProjectTool = summary.firstProjectToolCallEventIndex;
    const exactReadBeforeProjectTools = (summary.toolCalls ?? []).some((call) => (
      call.name === 'read'
      && readTargetFromCall(call) === expectedUri
      && call.completed === true
      && call.isError === false
      && Number.isFinite(firstProjectTool)
      && Number.isFinite(call.eventIndex)
      && call.eventIndex < firstProjectTool
    ));
    if (!exactReadBeforeProjectTools) {
      failures.push(`required exact Skill URI was not read successfully before project tools: ${expectedUri}`);
    }
  }
  if (Array.isArray(expectations.requiredAnySkills)
    && expectations.requiredAnySkills.length > 0
    && !expectations.requiredAnySkills.some((skill) => hasEquivalentSkill(observed, skill))) {
    failures.push(`none of the acceptable skills were observed or provided: ${expectations.requiredAnySkills.join(', ')}`);
  }
  for (const skill of expectations.forbiddenSkills ?? []) {
    if (hasEquivalentSkill(observed, skill)) failures.push(`forbidden skill was observed or provided: ${skill}`);
  }
  if (Number.isFinite(expectations.maxProvidedSkills)
    && (summary.providedSkills?.length ?? 0) > expectations.maxProvidedSkills) {
    failures.push(`provided skills ${summary.providedSkills.length} exceeded ${expectations.maxProvidedSkills}`);
  }
  if (Number.isFinite(expectations.maxObservedSkills)
    && (summary.observedSkills?.length ?? 0) > expectations.maxObservedSkills) {
    failures.push(`observed skills ${summary.observedSkills.length} exceeded ${expectations.maxObservedSkills}`);
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
  if (Number.isFinite(expectations.maxAgentArtifactReadCalls)
    && summary.agentArtifactReadCount > expectations.maxAgentArtifactReadCalls) {
    failures.push(`agent artifact reads ${summary.agentArtifactReadCount} exceeded ${expectations.maxAgentArtifactReadCalls}`);
  }
  if (expectations.agentArtifactReadPolicy === 'preview-once') {
    for (const violation of summary.agentArtifactReadViolations ?? []) {
      if (violation.reason === 'no-preview') {
        failures.push(`agent artifact read had no matching preview: ${violation.target}`);
      } else if (violation.reason === 'before-preview') {
        failures.push(`agent artifact read occurred before its matching preview: ${violation.target}`);
      } else if (violation.reason === 'duplicate') {
        failures.push(`agent artifact was read more than once: ${violation.target}`);
      }
    }
  } else if (expectations.agentArtifactReadPolicy != null) {
    failures.push(`unsupported agent artifact read policy: ${expectations.agentArtifactReadPolicy}`);
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
  const primaryFinalText = (summary.primaryFinals ?? [])
    .map(({ text }) => String(text ?? ''))
    .join('\n');
  for (const specification of expectations.requiredFinalPatterns ?? []) {
    const pattern = expectationPattern(specification);
    if (!pattern) {
      failures.push(`required final pattern was invalid: ${expectationPatternLabel(specification)}`);
    } else if (!pattern.test(primaryFinalText)) {
      failures.push(`required final pattern was not observed: ${expectationPatternLabel(specification)}`);
    }
  }
  for (const specification of expectations.forbiddenFinalPatterns ?? []) {
    const pattern = expectationPattern(specification);
    if (!pattern) {
      failures.push(`forbidden final pattern was invalid: ${expectationPatternLabel(specification)}`);
    } else if (pattern.test(primaryFinalText)) {
      failures.push(`forbidden final pattern was observed: ${expectationPatternLabel(specification)}`);
    }
  }
  evaluateRequiredClaimVerdicts(
    primaryFinalText,
    expectations.requiredClaimVerdicts,
    failures,
  );
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
  if (expectations.forbidMisaddressedDeclaredSkillReads === true
    && (summary.misaddressedDeclaredSkillReads?.length ?? 0) > 0) {
    const skills = uniqueSorted(summary.misaddressedDeclaredSkillReads.map(({ skill }) => skill));
    failures.push(`misaddressed declared Skill read(s): ${skills.join(', ')}`);
  }
  if (expectations.forbidUnsupportedAdvisorSkillAbsenceClaims === true
    && (summary.unsupportedAdvisorSkillAbsenceClaims?.length ?? 0) > 0) {
    const skills = uniqueSorted(summary.unsupportedAdvisorSkillAbsenceClaims.map(({ skill }) => skill));
    failures.push(`unsupported Advisor Skill absence claim(s): ${skills.join(', ')}`);
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
  if (Number.isFinite(expectations.maxNativeTodoCalls)
    && (nativeTodo.callCount ?? 0) > expectations.maxNativeTodoCalls) {
    failures.push(`native todo calls ${(nativeTodo.callCount ?? 0)} exceeded ${expectations.maxNativeTodoCalls}`);
  }
  if (expectations.requireNativeTodoInit === true && !(nativeTodo.initCallCount > 0)) {
    failures.push('native todo was not initialized successfully');
  }
  if (expectations.requireNativeTodoFirstTool === true
    && summary.toolCalls?.[0]?.name !== 'todo') {
    failures.push(`first tool call was ${summary.toolCalls?.[0]?.name ?? '<none>'}, expected todo`);
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
  evaluateRequiredNativeTodoItemPatterns(
    nativeTodo.initializedItems ?? [],
    expectations.requiredNativeTodoItemPatterns,
    failures,
  );

  const tddCycle = evaluateRequiredTddCycle(summary, expectations.requireTddCycle, failures);
  evaluateRequiredReviewStages(summary, expectations.requireReviewStages, tddCycle, failures);
  evaluateRequiredSubagentDrivenCode(summary, expectations.requireSubagentDrivenCode, failures);

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
  if (Number.isFinite(expectations.maxNativeTaskCalls)
    && (nativeTask.callCount ?? 0) > expectations.maxNativeTaskCalls) {
    failures.push(`native task calls ${(nativeTask.callCount ?? 0)} exceeded ${expectations.maxNativeTaskCalls}`);
  }
  if (Number.isFinite(expectations.maxProjectInspectionCallsBeforeNativeTask)
    && (nativeTask.projectInspectionCallCountBeforeFirstTask ?? 0)
      > expectations.maxProjectInspectionCallsBeforeNativeTask) {
    failures.push(`project inspection calls before first native task ${(nativeTask.projectInspectionCallCountBeforeFirstTask ?? 0)} exceeded ${expectations.maxProjectInspectionCallsBeforeNativeTask}`);
  }
  if (Number.isFinite(expectations.maxProjectInspectionCallsAfterNativeTask)
    && (nativeTask.projectInspectionCallCountAfterFirstTask ?? 0)
      > expectations.maxProjectInspectionCallsAfterNativeTask) {
    failures.push(`project inspection calls after first native task ${(nativeTask.projectInspectionCallCountAfterFirstTask ?? 0)} exceeded ${expectations.maxProjectInspectionCallsAfterNativeTask}`);
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
  if (expectations.requireNonemptyNativeTaskContext === true) {
    const missing = (nativeTask.assignments ?? []).filter(({ context }) => (
      typeof context !== 'string' || !context.trim()
    ));
    if (!nativeTask.assignments?.length || missing.length) {
      failures.push(`${missing.length || 'all'} native task assignment(s) omitted nonempty native task context`);
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
  evaluateRequiredNativeTaskAgentSequence(
    nativeTask,
    expectations.requiredNativeTaskAgentSequence,
    failures,
  );
  for (const workflow of expectations.requiredNativeTaskWorkflows ?? []) {
    if (!nativeTaskWorkflows.has(workflow)) failures.push(`required native task workflow was not observed: ${workflow}`);
  }
  for (const workflow of expectations.requiredNativeTaskWorkflowsPerAssignment ?? []) {
    const assignments = nativeTask.assignments ?? [];
    const mismatched = assignments.filter(({ metadata }) => !metadataItems(metadata?.workflow).includes(workflow));
    if (!assignments.length || mismatched.length) {
      failures.push(`${mismatched.length || 'all'} native task assignment(s) omitted required workflow metadata: ${workflow}`);
    }
  }
  for (const skill of expectations.requiredNativeTaskSkills ?? []) {
    if (!hasEquivalentSkill(nativeTaskSkills, skill)) failures.push(`required native task skill was not observed: ${skill}`);
  }
  for (const skill of expectations.requiredNativeTaskSkillsPerAssignment ?? []) {
    const assignments = nativeTask.assignments ?? [];
    const mismatched = assignments.filter(({ metadata }) => (
      !hasEquivalentSkill(new Set(metadataItems(metadata?.skills)), skill)
    ));
    if (!assignments.length || mismatched.length) {
      failures.push(`${mismatched.length || 'all'} native task assignment(s) omitted required Skill metadata: ${skill}`);
    }
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
  if (expectations.requireExactNativeTaskMetadataPrefix === true) {
    const assignments = nativeTask.assignments ?? [];
    const inexact = assignments.filter(({ hasExactMetadataPrefix }) => hasExactMetadataPrefix !== true);
    if (!assignments.length || inexact.length) {
      failures.push(`${inexact.length || 'all'} native task assignment(s) omitted the exact compact metadata prefix`);
    }
  }
  if (expectations.requireNativeTaskMetadataMatchesDelegatedTodoRows === true) {
    const assignments = nativeTask.assignments ?? [];
    const initializedItems = summary.nativeTodo?.initializedItems ?? [];
    const mismatched = unmatchedAssignmentsForDelegatedTodoRows(initializedItems, assignments);
    if (!assignments.length || mismatched.length) {
      failures.push(`${mismatched.length || 'all'} native task assignment(s) did not mechanically match an initialized delegated TODO row`);
    }
  }
  if (expectations.requireNativeTaskSubmissionForEveryAssignment === true
    && nativeTask.submittedJobCount !== nativeTask.assignmentAttemptCount) {
    failures.push(`native task submitted jobs ${nativeTask.submittedJobCount} did not match assignment attempts ${nativeTask.assignmentAttemptCount}`);
  }
  if (summary.exitCode != null && summary.exitCode !== 0) failures.push(`process exited with code ${summary.exitCode}`);
  if (summary.signal) failures.push(`process exited from signal ${summary.signal}`);
  if (summary.timedOut) failures.push('runner hard timeout was reached');

  return { pass: failures.length === 0, failures };
}

function evaluateRequiredNativeTodoItemPatterns(initializedItems, specifications, failures) {
  if (specifications == null) return;
  if (!Array.isArray(specifications)) {
    failures.push('requiredNativeTodoItemPatterns must be an array of regular-expression strings');
    return;
  }

  for (const specification of specifications) {
    if (typeof specification !== 'string' || specification.length === 0) {
      failures.push('requiredNativeTodoItemPatterns contained an empty or non-string pattern');
      continue;
    }

    let matcher;
    try {
      matcher = new RegExp(specification, 'iu');
    } catch (error) {
      failures.push(`requiredNativeTodoItemPatterns contained an invalid pattern ${JSON.stringify(specification)}: ${error.message}`);
      continue;
    }

    if (!initializedItems.some((item) => matcher.test(String(item)))) {
      failures.push(`native todo initialization had no item matching required pattern: ${JSON.stringify(specification)}`);
    }
  }
}

function evaluateRequiredNativeTaskAgentSequence(nativeTask, specification, failures) {
  if (specification == null) return;
  const agents = Array.isArray(specification)
    ? specification.map((value) => String(value ?? '').trim()).filter(Boolean)
    : [];
  if (agents.length < 2 || agents.length !== specification.length) {
    failures.push('required native task Agent sequence expectation was invalid');
    return;
  }

  const assignments = [...(nativeTask.assignments ?? [])]
    .sort((left, right) => left.eventIndex - right.eventIndex || left.index - right.index);
  const selected = [];
  const occurrences = new Map();
  for (const agent of agents) {
    const occurrence = occurrences.get(agent) ?? 0;
    const assignment = assignments.filter((candidate) => candidate.agent === agent)[occurrence];
    if (!assignment) {
      failures.push(`required native task Agent sequence was missing assignment: ${agent}`);
      return;
    }
    selected.push(assignment);
    occurrences.set(agent, occurrence + 1);
  }

  for (let index = 1; index < selected.length; index += 1) {
    const prior = selected[index - 1];
    const current = selected[index];
    if (prior.jobStatus !== 'completed' || !Number.isFinite(prior.jobCompletionEventIndex)) {
      failures.push(`required native task Agent ${prior.agent} did not complete successfully before ${current.agent} assignment`);
      continue;
    }
    if (!prior.deliveryText || !Number.isFinite(prior.deliveryEventIndex)) {
      failures.push(`required native task Agent ${prior.agent} did not return a successful delivery before ${current.agent} assignment`);
      continue;
    }
    if (!Number.isFinite(current.eventIndex)
      || current.eventIndex <= prior.deliveryEventIndex) {
      failures.push(`required native task Agent ${current.agent} started before ${prior.agent} successful delivery`);
    }
  }
}

export function classifyWorkflowRun(summary = {}, evaluation = {}) {
  const eventCapture = summary.eventCapture ?? {};
  const captureFailed = (summary.invalidJsonLines?.length ?? 0) > 0
    || eventCapture.captureTruncated === true
    || (eventCapture.oversizedLineCount ?? 0) > 0
    || (eventCapture.capacityDroppedLineCount ?? 0) > 0;
  const processFailed = summary.timedOut === true
    || Boolean(summary.signal)
    || summary.exitCode != null && summary.exitCode !== 0;
  const assistantErrorCount = summary.assistantErrorCount ?? 0;
  const hasUsableTrace = (summary.primaryFinalCount ?? 0) > 0
    || (summary.toolCallCount ?? 0) > 0;
  const infrastructureFailed = captureFailed
    || processFailed
    || assistantErrorCount > 0 && !hasUsableTrace;
  const infrastructure = infrastructureFailed
    ? 'failed'
    : assistantErrorCount > 0
      ? 'degraded'
      : 'clean';
  if (infrastructureFailed || !hasUsableTrace) {
    return { behavior: 'not_evaluable', infrastructure };
  }

  const behaviorFailures = (evaluation.failures ?? [])
    .filter((failure) => !infrastructureFailureMessage(failure));
  return {
    behavior: behaviorFailures.length ? 'fail' : 'pass',
    infrastructure,
  };
}

function infrastructureFailureMessage(value) {
  return /^(?:assistant model or transport error|process exited|runner hard timeout|workflow event capture|invalid NDJSON)/iu.test(
    String(value ?? '').trim(),
  );
}

function evaluateRequiredTddCycle(summary, specification, failures) {
  if (specification == null || specification === false) return null;
  if (!specification || typeof specification !== 'object' || Array.isArray(specification)) {
    failures.push('TDD cycle expectation was invalid');
    return null;
  }
  const commandPattern = expectationPattern(specification.testCommandPattern);
  const testPathPatterns = configuredPatterns(specification.testPathPatterns);
  const productionPathPatterns = configuredPatterns(specification.productionPathPatterns);
  const redResultPattern = specification.redResultPattern == null
    ? null
    : expectationPattern(specification.redResultPattern);
  const requiredCommandCount = specification.requiredCommandCount;
  const forbidOtherCommands = specification.forbidOtherCommands;
  if (!commandPattern || !testPathPatterns.length || !productionPathPatterns.length
    || specification.redResultPattern != null && !redResultPattern
    || requiredCommandCount != null && (!Number.isSafeInteger(requiredCommandCount) || requiredCommandCount < 1)
    || forbidOtherCommands != null && typeof forbidOtherCommands !== 'boolean') {
    failures.push('TDD cycle expectation contained an invalid command, path, RED-result, count, or exclusivity rule');
    return null;
  }

  const trace = summary.tddTrace ?? { mutationCalls: [], commandCalls: [] };
  const testMutations = (trace.mutationCalls ?? [])
    .filter(({ target }) => testPathPatterns.some((pattern) => pattern.test(target)));
  const productionMutations = (trace.mutationCalls ?? [])
    .filter(({ target }) => productionPathPatterns.some((pattern) => pattern.test(target)));
  if (!testMutations.length) failures.push('TDD cycle did not observe a successful test mutation');
  if (!productionMutations.length) failures.push('TDD cycle did not observe a successful production mutation');
  if (!testMutations.length || !productionMutations.length) return null;

  const firstProductionMutation = productionMutations
    .reduce((earliest, call) => call.eventIndex < earliest.eventIndex ? call : earliest);
  const toolCallsById = new Map((summary.toolCalls ?? []).map((call) => [call.id, call]));
  const matchingCommands = (trace.commandCalls ?? [])
    .filter(({ command }) => commandPattern.test(command));
  if (requiredCommandCount != null && matchingCommands.length !== requiredCommandCount) {
    failures.push(`TDD cycle observed ${matchingCommands.length} matching test command(s), expected exactly ${requiredCommandCount}`);
  }
  if (forbidOtherCommands === true) {
    const otherCommands = (trace.commandCalls ?? [])
      .filter(({ command }) => !commandPattern.test(command));
    if (otherCommands.length) {
      failures.push(`TDD cycle observed ${otherCommands.length} non-matching command(s)`);
    }
  }
  const red = matchingCommands.find((commandCall) => {
    const rawCall = toolCallsById.get(commandCall.id);
    return commandCall.eventIndex < firstProductionMutation.eventIndex
      && Number.isFinite(commandCall.completionEventIndex)
      && commandCall.completionEventIndex < firstProductionMutation.eventIndex
      && Number.isSafeInteger(commandCall.exitCode)
      && commandCall.exitCode !== 0
      && rawCall?.commandResult?.timedOut !== true
      && testMutations.some(({ completionEventIndex }) => (
        Number.isFinite(completionEventIndex) && completionEventIndex < commandCall.eventIndex
      ))
      && (!redResultPattern || redResultPattern.test(rawCall?.resultPreview ?? ''));
  });
  if (!red) {
    failures.push('TDD RED was not observed before the first production mutation with a prior test mutation and the expected failing command evidence');
    return null;
  }

  const green = matchingCommands.find((commandCall) => {
    const rawCall = toolCallsById.get(commandCall.id);
    return Number.isFinite(firstProductionMutation.completionEventIndex)
      && commandCall.eventIndex > firstProductionMutation.completionEventIndex
      && commandCall.command === red.command
      && commandCall.exitCode === 0
      && rawCall?.commandResult?.timedOut !== true;
  });
  if (!green) {
    failures.push('TDD GREEN was not observed after the first production mutation with the same focused command');
    return null;
  }
  return { red, green, firstProductionMutation };
}

function evaluateRequiredSubagentDrivenCode(summary, specification, failures) {
  if (specification == null || specification === false) return;
  if (!specification || typeof specification !== 'object' || Array.isArray(specification)) {
    failures.push('subagent-driven code expectation was invalid');
    return;
  }

  const planReviewAgent = String(specification.planReviewAgent ?? '').trim();
  const implementationAgent = String(specification.implementationAgent ?? '').trim();
  const reviewerAgent = String(specification.reviewerAgent ?? '').trim();
  const repairAgent = String(specification.repairAgent ?? '').trim();
  const minImplementationSlices = specification.minImplementationSlices;
  const maxFreshReviewerAssignments = specification.maxFreshReviewerAssignments;
  const planReviewAssignmentPatterns = configuredAssignmentPatterns(
    specification.planReviewAssignmentPatterns,
    'plan review',
    failures,
  );
  const planReviewDeliveryPatterns = configuredAssignmentPatterns(
    specification.planReviewDeliveryPatterns,
    'plan review delivery',
    failures,
  );
  const implementationAssignmentPatterns = configuredAssignmentPatterns(
    specification.implementationAssignmentPatterns,
    'implementation',
    failures,
  );
  const implementationDeliveryPatterns = configuredAssignmentPatterns(
    specification.implementationDeliveryPatterns,
    'implementation delivery',
    failures,
  );
  const mainReviewPatterns = configuredAssignmentPatterns(
    specification.mainReviewPatterns,
    'Main review',
    failures,
  );
  const reviewerAssignmentPatterns = configuredAssignmentPatterns(
    specification.reviewerAssignmentPatterns,
    'reviewer',
    failures,
  );
  const repairAssignmentPatterns = configuredAssignmentPatterns(
    specification.repairAssignmentPatterns,
    'repair',
    failures,
  );
  const mainReviewPattern = expectationPattern(specification.mainReviewPattern);
  const mainVerificationCommandPattern = expectationPattern(
    specification.mainVerificationCommandPattern,
  );
  const supportedFindingPattern = expectationPattern(specification.supportedFindingPattern);
  const forbiddenParentTools = Array.isArray(specification.forbiddenParentTools)
    ? specification.forbiddenParentTools.map((name) => String(name ?? '').trim()).filter(Boolean)
    : null;
  const invalid = !planReviewAgent
    || !implementationAgent
    || !reviewerAgent
    || !repairAgent
    || !Number.isSafeInteger(minImplementationSlices)
    || minImplementationSlices < 1
    || specification.requireParallelImplementationBatch !== true
    || specification.requireCompleteAssignmentInput !== true
    || !planReviewAssignmentPatterns.length
    || !planReviewDeliveryPatterns.length
    || !implementationAssignmentPatterns.length
    || !implementationDeliveryPatterns.length
    || !mainReviewPattern
    || !mainReviewPatterns.length
    || !mainVerificationCommandPattern
    || !reviewerAssignmentPatterns.length
    || !supportedFindingPattern
    || !repairAssignmentPatterns.length
    || !Number.isSafeInteger(maxFreshReviewerAssignments)
    || maxFreshReviewerAssignments < 0
    || forbiddenParentTools === null
    || forbiddenParentTools.length !== specification.forbiddenParentTools.length;
  if (invalid) {
    failures.push('subagent-driven code expectation contained an invalid Agent, pattern, slice, batch, verification, review, repair, or parent-tool rule');
    return;
  }

  const assignments = [...(summary.nativeTask?.assignments ?? [])]
    .sort((left, right) => left.eventIndex - right.eventIndex || left.index - right.index);
  const planReview = assignments.find(({ agent }) => agent === planReviewAgent);
  if (!planReview || planReview.jobStatus !== 'completed'
    || !Number.isFinite(planReview.jobCompletionEventIndex)) {
    failures.push(`plan review by ${planReviewAgent} did not complete before implementation`);
  }
  evaluateAssignmentPatterns(summary, planReview, planReviewAssignmentPatterns, 'plan review', failures);
  if (planReview && (!planReview.deliveryText || !planReview.deliverySource)) {
    failures.push(`plan review by ${planReviewAgent} had no host-observed delivery`);
  } else if (planReview) {
    for (const pattern of planReviewDeliveryPatterns) {
      if (!pattern.test(planReview.deliveryText)) {
        failures.push(`plan review delivery did not match required evidence pattern: ${pattern.source}`);
      }
    }
  }

  const reviewerAssignments = assignments.filter(({ agent }) => agent === reviewerAgent);
  const firstReviewer = reviewerAssignments[0] ?? null;
  const firstReviewerEventIndex = firstReviewer?.eventIndex ?? Number.POSITIVE_INFINITY;
  const implementationAssignments = assignments.filter(({ agent, eventIndex }) => (
    agent === implementationAgent && eventIndex < firstReviewerEventIndex
  ));
  if (implementationAssignments.length < minImplementationSlices) {
    failures.push(`subagent-driven implementation observed ${implementationAssignments.length} slice(s), expected at least ${minImplementationSlices}`);
  }
  if (planReview && Number.isFinite(planReview.jobCompletionEventIndex)
    && implementationAssignments.some(({ eventIndex }) => eventIndex <= planReview.jobCompletionEventIndex)) {
    failures.push(`implementation by ${implementationAgent} began before the ${planReviewAgent} PLAN REVIEW completed`);
  }

  const implementationGroups = new Map();
  for (const assignment of implementationAssignments) {
    const group = implementationGroups.get(assignment.callId) ?? [];
    group.push(assignment);
    implementationGroups.set(assignment.callId, group);
  }
  const hasParallelBatch = [...implementationGroups.values()].some((group) => (
    group.length >= minImplementationSlices && group.every(({ batch }) => batch === true)
  ));
  if (!hasParallelBatch) {
    failures.push(`independent implementation slices were not submitted in the same parallel tasks[] batch`);
  }

  for (const assignment of implementationAssignments) {
    const input = assignmentInputText(summary, assignment);
    for (const pattern of implementationAssignmentPatterns) {
      if (!pattern.test(input)) {
        failures.push(`implementation assignment input did not match required complete pattern: ${pattern.source}`);
      }
    }
    if (assignment.jobStatus !== 'completed' || !Number.isFinite(assignment.jobCompletionEventIndex)) {
      failures.push(`implementation assignment ${assignment.name ?? assignment.jobId ?? '<unnamed>'} did not complete`);
    }
    if (!assignment.deliveryText || !assignment.deliverySource) {
      failures.push(`implementation assignment ${assignment.name ?? assignment.jobId ?? '<unnamed>'} had no host-observed child delivery`);
      continue;
    }
    for (const pattern of implementationDeliveryPatterns) {
      if (!pattern.test(assignment.deliveryText)) {
        failures.push(`implementation delivery did not match required child-evidence pattern: ${pattern.source}`);
      }
    }
  }

  const forbiddenCalls = (summary.toolCalls ?? []).filter(({ name }) => (
    forbiddenParentTools.includes(name)
  ));
  for (const call of forbiddenCalls) {
    failures.push(`forbidden parent tool ${call.name} was used for a subagent-driven implementation mutation`);
  }

  const implementationCompletionIndexes = implementationAssignments
    .map(({ jobCompletionEventIndex }) => jobCompletionEventIndex)
    .filter(Number.isFinite);
  const lastImplementationCompletion = implementationCompletionIndexes.length
    ? Math.max(...implementationCompletionIndexes)
    : null;
  const matchingMainReviews = (summary.mainReviews ?? [])
    .filter(({ text }) => mainReviewPattern.test(String(text ?? '')))
    .sort((left, right) => left.eventIndex - right.eventIndex);
  const firstMainReview = matchingMainReviews[0] ?? null;
  if (!firstMainReview) {
    failures.push('MAIN REVIEW was not observed before reviewer assignment');
  } else {
    if (!Number.isFinite(lastImplementationCompletion)
      || firstMainReview.eventIndex <= lastImplementationCompletion) {
      failures.push('MAIN REVIEW was written before all implementation task deliveries completed');
    }
    for (const pattern of mainReviewPatterns) {
      if (!pattern.test(firstMainReview.text)) {
        failures.push(`MAIN REVIEW did not match required current-tree evidence pattern: ${pattern.source}`);
      }
    }
  }

  const verificationCalls = (summary.toolCalls ?? []).filter((call) => (
    call.name === 'bash'
    && mainVerificationCommandPattern.test(String(call.arguments?.command ?? ''))
    && call.completed === true
    && call.isError === false
    && call.commandResult?.exitCode === 0
    && Number.isFinite(lastImplementationCompletion)
    && call.eventIndex > lastImplementationCompletion
    && firstMainReview
    && Number.isFinite(call.completionEventIndex)
    && call.completionEventIndex < firstMainReview.eventIndex
  ));
  if (verificationCalls.length !== 1) {
    failures.push(`Main broader verification command was observed ${verificationCalls.length} time(s) after all task deliveries and before MAIN REVIEW, expected exactly 1`);
  }

  if (!firstReviewer) {
    failures.push(`native ${reviewerAgent} assignment was not observed after MAIN REVIEW`);
    return;
  }
  if (!firstMainReview || firstReviewer.eventIndex <= firstMainReview.eventIndex) {
    failures.push(`native ${reviewerAgent} assignment was not after MAIN REVIEW`);
  }
  evaluateAssignmentPatterns(summary, firstReviewer, reviewerAssignmentPatterns, 'reviewer', failures);
  if (firstReviewer.jobStatus !== 'completed'
    || !Number.isFinite(firstReviewer.jobCompletionEventIndex)
    || !firstReviewer.deliveryText
    || !firstReviewer.deliverySource) {
    failures.push(`native ${reviewerAgent} did not return a host-observed completed review delivery`);
  }

  const supportedFinding = firstReviewer.deliveryText
    && supportedFindingPattern.test(firstReviewer.deliveryText);
  const freshReviewerAssignments = reviewerAssignments.slice(1);
  if (freshReviewerAssignments.length > maxFreshReviewerAssignments) {
    failures.push(`fresh reviewer assignments ${freshReviewerAssignments.length} exceeded at most ${maxFreshReviewerAssignments}`);
  }
  if (!supportedFinding) return;

  const repairAssignments = assignments.filter(({ agent, eventIndex }) => (
    agent === repairAgent
    && Number.isFinite(firstReviewer.jobCompletionEventIndex)
    && eventIndex > firstReviewer.jobCompletionEventIndex
  ));
  if (!repairAssignments.length) {
    failures.push(`SUPPORTED reviewer finding was not sent to ${repairAgent} as a bounded repair`);
    return;
  }
  for (const repair of repairAssignments) {
    evaluateAssignmentPatterns(summary, repair, repairAssignmentPatterns, 'repair', failures);
    if (repair.jobStatus !== 'completed'
      || !Number.isFinite(repair.jobCompletionEventIndex)
      || !repair.deliveryText
      || !repair.deliverySource) {
      failures.push(`bounded repair by ${repairAgent} did not return a host-observed completed delivery`);
    }
  }
  const repairCompletionIndexes = repairAssignments
    .map(({ jobCompletionEventIndex }) => jobCompletionEventIndex)
    .filter(Number.isFinite);
  const lastRepairCompletion = repairCompletionIndexes.length
    ? Math.max(...repairCompletionIndexes)
    : null;
  const secondMainReview = matchingMainReviews.find(({ eventIndex }) => (
    Number.isFinite(lastRepairCompletion) && eventIndex > lastRepairCompletion
  ));
  if (!secondMainReview) {
    failures.push('SUPPORTED repair completed without a second MAIN REVIEW of the repaired tree');
  }
  for (const freshReviewer of freshReviewerAssignments) {
    if (!secondMainReview || freshReviewer.eventIndex <= secondMainReview.eventIndex) {
      failures.push('fresh reviewer assignment was not after the second MAIN REVIEW');
    }
    evaluateAssignmentPatterns(summary, freshReviewer, reviewerAssignmentPatterns, 'fresh reviewer', failures);
    if (freshReviewer.jobStatus !== 'completed'
      || !Number.isFinite(freshReviewer.jobCompletionEventIndex)
      || !freshReviewer.deliveryText
      || !freshReviewer.deliverySource) {
      failures.push(`fresh native ${reviewerAgent} did not return a host-observed completed review delivery`);
    }
  }
}

function evaluateRequiredReviewStages(summary, specification, tddCycle, failures) {
  if (specification == null || specification === false) return;
  if (!specification || typeof specification !== 'object' || Array.isArray(specification)) {
    failures.push('review-stage expectation was invalid');
    return;
  }
  const planReviewAgent = String(specification.planReviewAgent ?? '').trim();
  const diffReviewAgent = String(specification.diffReviewAgent ?? '').trim();
  const planReviewStep = String(specification.planReviewStep ?? '').trim();
  const diffReviewStep = String(specification.diffReviewStep ?? '').trim();
  if (!planReviewAgent || !diffReviewAgent) {
    failures.push('review-stage expectation omitted the plan-review or diff-review Agent');
    return;
  }
  if (specification.planReviewStep != null && !planReviewStep
    || specification.diffReviewStep != null && !diffReviewStep) {
    failures.push('review-stage expectation contained an invalid plan-review or diff-review step');
    return;
  }
  if (specification.requireAssignmentTodoMatch != null
    && typeof specification.requireAssignmentTodoMatch !== 'boolean') {
    failures.push('review-stage expectation contained an invalid assignment TODO-match flag');
    return;
  }
  const planPatterns = configuredAssignmentPatterns(
    specification.planReviewAssignmentPatterns,
    'plan review',
    failures,
  );
  const diffPatterns = configuredAssignmentPatterns(
    specification.diffReviewAssignmentPatterns,
    'semantic diff review',
    failures,
  );
  if (!tddCycle) {
    failures.push('review-stage ordering could not be evaluated without a complete TDD cycle');
    return;
  }

  const assignments = summary.nativeTask?.assignments ?? [];
  const planReview = assignments.find(({ agent, metadata }) => (
    agent === planReviewAgent && (!planReviewStep || metadata?.step === planReviewStep)
  ));
  if (!planReview && assignments.some(({ agent }) => agent === planReviewAgent) && planReviewStep) {
    failures.push(`plan review by ${planReviewAgent} did not use expected step ${planReviewStep}`);
  }
  if (!planReview || !Number.isFinite(planReview.jobCompletionEventIndex)
    || planReview.jobCompletionEventIndex >= tddCycle.firstProductionMutation.eventIndex) {
    failures.push(`plan review by ${planReviewAgent} did not complete before the first production mutation`);
  }
  if (Number.isFinite(summary.nativeTodo?.firstInitEventIndex)
    && planReview && planReview.eventIndex <= summary.nativeTodo.firstInitEventIndex) {
    failures.push(`plan review by ${planReviewAgent} was assigned before the parent TODO was initialized`);
  }
  evaluateAssignmentPatterns(summary, planReview, planPatterns, 'plan review', failures);
  if (specification.requireAssignmentTodoMatch === true) {
    evaluateAssignmentTodoMatch(summary, planReview, 'plan review', failures);
  }

  const diffReview = assignments.find(({ agent, metadata }) => (
    agent === diffReviewAgent && (!diffReviewStep || metadata?.step === diffReviewStep)
  ));
  if (!diffReview && assignments.some(({ agent }) => agent === diffReviewAgent) && diffReviewStep) {
    failures.push(`semantic diff review by ${diffReviewAgent} did not use expected step ${diffReviewStep}`);
  }
  const greenCompletion = tddCycle.green.completionEventIndex ?? tddCycle.green.eventIndex;
  if (!diffReview || !Number.isFinite(diffReview.eventIndex)
    || diffReview.eventIndex <= greenCompletion) {
    failures.push(`semantic diff review by ${diffReviewAgent} was not assigned after TDD GREEN completed`);
  }
  evaluateAssignmentPatterns(summary, diffReview, diffPatterns, 'semantic diff review', failures);
  if (specification.requireAssignmentTodoMatch === true) {
    evaluateAssignmentTodoMatch(summary, diffReview, 'semantic diff review', failures);
  }
}

function configuredAssignmentPatterns(specifications, label, failures) {
  if (specifications == null) return [];
  const patterns = configuredPatterns(specifications);
  if (!Array.isArray(specifications)
    || !specifications.length
    || patterns.length !== specifications.length) {
    failures.push(`${label} assignment patterns were invalid`);
    return [];
  }
  return patterns;
}

function evaluateAssignmentPatterns(summary, assignment, patterns, label, failures) {
  if (!patterns.length || !assignment) return;
  const text = assignmentInputText(summary, assignment);
  for (const pattern of patterns) {
    if (!pattern.test(text)) {
      failures.push(`${label} assignment did not match required supplied-input pattern: ${pattern.source}`);
    }
  }
}

function evaluateAssignmentTodoMatch(summary, assignment, label, failures) {
  if (!assignment) return;
  const initializedItems = summary.nativeTodo?.initializedItems ?? [];
  const metadata = assignment.metadata ?? {};
  const matches = initializedItems.includes(metadata.todo)
    || assignmentMatchesDelegatedTodoRow(initializedItems, assignment);
  if (!matches) {
    failures.push(`${label} assignment metadata did not match an initialized parent TODO item or delegated row`);
  }
}

function assignmentMatchesDelegatedTodoRow(initializedItems, assignment) {
  return initializedItems.some((item) => {
    const delegated = delegatedTodoMetadata(item);
    return delegatedTodoMatchesAssignment(delegated, assignment);
  });
}

function unmatchedAssignmentsForDelegatedTodoRows(initializedItems, assignments) {
  const delegatedRows = initializedItems.map(delegatedTodoMetadata);
  const consumedRowIndexes = new Set();
  return assignments.filter((assignment) => {
    const matchingRowIndex = delegatedRows.findIndex((delegated, index) => (
      !consumedRowIndexes.has(index) && delegatedTodoMatchesAssignment(delegated, assignment)
    ));
    if (matchingRowIndex === -1) return true;
    consumedRowIndexes.add(matchingRowIndex);
    return false;
  });
}

function delegatedTodoMatchesAssignment(delegated, assignment) {
  const metadata = assignment?.metadata ?? {};
  return delegated
    && delegated.agent === normalizeMetadataValue(assignment?.agent)
    && delegated.workflow === metadata.workflow
    && delegated.step === metadata.step
    && delegated.skills === metadata.skills
    && delegated.todo === metadata.todo;
}

function delegatedTodoMetadata(value) {
  const match = /^Delegate Agent=([^\s]+) workflow=([^\s]+) step=([^\s]+) skills=([^\s]+) checkpoint=(.+)$/u.exec(
    String(value ?? '').trim(),
  );
  if (!match) return null;
  const checkpoint = match[5].trim();
  if (!checkpoint
    || checkpoint.includes(']')
    || /\s(?:workflow|step|skills|checkpoint)=/iu.test(checkpoint)) return null;
  return {
    agent: normalizeMetadataValue(match[1]),
    workflow: normalizeMetadataValue(match[2]),
    step: normalizeMetadataValue(match[3]),
    skills: normalizeOptionalMetadataValue(match[4]),
    todo: normalizeOptionalMetadataValue(checkpoint),
  };
}

function assignmentInputText(summary, assignment) {
  const call = (summary.toolCalls ?? []).find(({ id }) => id === assignment?.callId);
  const args = call?.arguments ?? {};
  const item = Array.isArray(args.tasks)
    ? args.tasks[assignment?.index ?? 0]
    : args;
  return typeof item?.task === 'string' ? item.task : '';
}

function configuredPatterns(specifications) {
  if (!Array.isArray(specifications) || !specifications.length) return [];
  const patterns = specifications.map(expectationPattern);
  return patterns.every(Boolean) ? patterns : [];
}

function expectationPattern(specification) {
  const source = typeof specification === 'string'
    ? specification
    : specification?.pattern;
  const flags = typeof specification === 'object' && specification?.flags != null
    ? String(specification.flags)
    : 'iu';
  if (typeof source !== 'string' || !source) return null;
  try {
    return new RegExp(source, flags.replace(/[gy]/gu, ''));
  } catch {
    return null;
  }
}

function expectationPatternLabel(specification) {
  return typeof specification === 'string'
    ? specification
    : String(specification?.pattern ?? '<invalid>');
}

function evaluateRequiredClaimVerdicts(text, specifications, failures) {
  if (specifications == null) return;
  if (!specifications || typeof specifications !== 'object' || Array.isArray(specifications)) {
    failures.push('required claim verdicts expectation was invalid');
    return;
  }

  const observed = parseClaimVerdicts(text);
  for (const [rawClaim, rawExpected] of Object.entries(specifications)) {
    const claim = normalizeClaimIdentifier(rawClaim);
    const expectedValues = Array.isArray(rawExpected) ? rawExpected : [rawExpected];
    const expected = expectedValues.map(normalizeClaimVerdict).filter(Boolean);
    if (!claim || !expectedValues.length || expected.length !== expectedValues.length) {
      failures.push(`required claim verdict expectation was invalid: ${rawClaim}`);
      continue;
    }

    const actual = [...(observed.get(claim) ?? [])];
    if (!actual.length) {
      failures.push(`required claim verdict was not observed: ${rawClaim} (expected ${expected.join(' or ')})`);
      continue;
    }
    if (actual.length > 1) {
      failures.push(`claim ${rawClaim} had conflicting explicit verdicts: ${actual.join(', ')}`);
      continue;
    }
    if (!expected.includes(actual[0])) {
      failures.push(`claim ${rawClaim} verdict was ${actual[0]}, expected ${expected.join(' or ')}`);
    }
  }
}

function parseClaimVerdicts(text) {
  const verdicts = new Map();
  let activeClaim = null;
  let standaloneVerdictOpen = false;
  let verdictLabelPending = false;
  for (const rawLine of String(text ?? '').split(/\r?\n/u)) {
    const titledVerdict = numberedClaimVerdictTitle(rawLine);
    if (titledVerdict) {
      activeClaim = titledVerdict.claim;
      addClaimVerdict(verdicts, activeClaim, titledVerdict.verdict);
      standaloneVerdictOpen = false;
      verdictLabelPending = false;
      continue;
    }
    const verdictTitleClaim = numberedVerdictClaimTitle(rawLine);
    if (verdictTitleClaim) {
      activeClaim = verdictTitleClaim;
      standaloneVerdictOpen = true;
      verdictLabelPending = false;
      continue;
    }
    const title = claimTitle(rawLine);
    if (title) {
      activeClaim = title.claim;
      const inlineVerdict = explicitClaimVerdict(title.remainder, {
        allowArrow: true,
        allowInline: true,
      });
      if (inlineVerdict) addClaimVerdict(verdicts, activeClaim, inlineVerdict);
      standaloneVerdictOpen = !inlineVerdict;
      verdictLabelPending = false;
      continue;
    }
    if (/^\s*#{1,6}\s+/u.test(rawLine)) {
      activeClaim = null;
      standaloneVerdictOpen = false;
      verdictLabelPending = false;
      continue;
    }
    if (!activeClaim) continue;
    const hasContent = Boolean(String(rawLine ?? '').trim());
    if (claimVerdictSectionBoundary(rawLine)) {
      standaloneVerdictOpen = false;
      verdictLabelPending = false;
      continue;
    }
    if (verdictLabelPending) {
      verdictLabelPending = false;
      standaloneVerdictOpen = false;
      if (!hasContent) continue;
      const labeledStandaloneVerdict = standaloneClaimVerdict(rawLine);
      if (labeledStandaloneVerdict) {
        addClaimVerdict(verdicts, activeClaim, labeledStandaloneVerdict);
      }
      continue;
    }
    const verdict = explicitClaimVerdict(rawLine) || tableClaimVerdict(rawLine);
    if (verdict) {
      addClaimVerdict(verdicts, activeClaim, verdict);
      standaloneVerdictOpen = false;
      continue;
    }
    if (!standaloneVerdictOpen || !hasContent) continue;
    if (standaloneClaimVerdictLabel(rawLine)) {
      standaloneVerdictOpen = false;
      verdictLabelPending = true;
      continue;
    }
    const standaloneVerdict = standaloneClaimVerdict(rawLine);
    if (standaloneVerdict) {
      addClaimVerdict(verdicts, activeClaim, standaloneVerdict);
      standaloneVerdictOpen = false;
    }
  }
  return verdicts;
}

function numberedClaimVerdictTitle(rawLine) {
  const raw = String(rawLine ?? '').trim();
  const heading = /^#{1,6}\s+(.+)$/u.exec(raw);
  const line = stripOuterMarkdown(heading?.[1] ?? raw);
  const labeled = new RegExp(
    `^verdict\\s*#?\\s*([A-Za-z0-9][A-Za-z0-9_.-]*)(?:\\s*[:.)]\\s*|\\s+[-–—]\\s+)(?:[*_\`]+\\s*)*${CLAIM_VERDICT_TOKEN}(?:\\s*[*_\`]+)*(?:\\s*(?:[-–—:]|$))`,
    'iu',
  ).exec(line);
  if (!labeled) return null;
  const claim = normalizeClaimIdentifier(labeled[1]);
  const verdict = normalizeClaimVerdict(labeled[2]);
  return claim && verdict ? { claim, verdict } : null;
}

function numberedVerdictClaimTitle(rawLine) {
  const heading = /^\s*#{1,6}\s+(.+)$/u.exec(String(rawLine ?? ''));
  if (!heading) return '';
  const line = stripOuterMarkdown(heading[1]);
  const labeled = /^verdict\s*#?\s*([A-Za-z0-9][A-Za-z0-9_.-]*)(?:\s*[:.)]\s*|\s+[-–—]\s+).+$/iu.exec(line);
  return normalizeClaimIdentifier(labeled?.[1]);
}

function claimTitle(rawLine) {
  const raw = String(rawLine ?? '').trim();
  const heading = /^#{1,6}\s+(.+)$/u.exec(raw);
  const line = stripOuterMarkdown(heading?.[1] ?? raw);
  const labeled = /^claim\s*#?\s*([A-Za-z0-9][A-Za-z0-9_.-]*)(?:\b|(?=\s*[:.)]))(.*)$/iu.exec(line);
  if (labeled) {
    return {
      claim: normalizeClaimIdentifier(labeled[1]),
      remainder: labeled[2] ?? '',
    };
  }
  if (!heading) return null;
  const numbered = /^(\d+)(?:\s*[.):]\s*|\s+[-–—]\s+|\s+)(.*)$/u.exec(line);
  if (!numbered) return null;
  return {
    claim: normalizeClaimIdentifier(numbered[1]),
    remainder: numbered[2] ?? '',
  };
}

function explicitClaimVerdict(rawLine, { allowArrow = false, allowInline = false } = {}) {
  const line = stripOuterMarkdown(String(rawLine ?? '').trim())
    .replace(/^[-*+]\s+/u, '')
    .replace(/^[*_`]+/u, '');
  const anchored = new RegExp(`^verdict\\s*[:=]\\s*(?:[*_\`]+\\s*)*${CLAIM_VERDICT_TOKEN}`, 'iu').exec(line);
  if (anchored) return normalizeClaimVerdict(anchored[1]);
  if (allowInline) {
    const inline = new RegExp(`\\bverdict\\s*[:=]\\s*(?:[*_\`]+\\s*)*${CLAIM_VERDICT_TOKEN}`, 'iu').exec(line);
    if (inline) return normalizeClaimVerdict(inline[1]);
  }
  if (!allowArrow) return '';
  const arrow = new RegExp(`(?:→|->|=>)\\s*[*_\`]*\\s*${CLAIM_VERDICT_TOKEN}(?:\\b|$)`, 'iu').exec(line);
  return normalizeClaimVerdict(arrow?.[1]);
}

function standaloneClaimVerdict(rawLine) {
  const line = stripOuterMarkdown(String(rawLine ?? '').trim())
    .replace(/^[-*+]\s+/u, '')
    .replace(/[.!。]+$/u, '')
    .trim();
  return normalizeClaimVerdict(line);
}

function tableClaimVerdict(rawLine) {
  const cells = markdownTableCells(rawLine);
  if (cells.length !== 2) return '';
  const label = stripOuterMarkdown(cells[0]).replace(/[*_`]/gu, '').trim();
  if (!/^verdict\s*:?\s*$/iu.test(label)) return '';
  return standaloneClaimVerdict(cells[1]);
}

function standaloneClaimVerdictLabel(rawLine) {
  const line = stripOuterMarkdown(
    String(rawLine ?? '').trim().replace(/^[-*+]\s+/u, ''),
  );
  return /^verdict\s*[:：]\s*$/iu.test(line);
}

function claimVerdictSectionBoundary(rawLine) {
  const raw = String(rawLine ?? '').trim();
  const cells = markdownTableCells(raw);
  const line = (cells[0] ?? raw)
    .trim()
    .replace(/^[-*+]\s+/u, '')
    .replace(/[*_`]/gu, '')
    .trim();
  return /^(?:evidence|analysis|reasoning|limitations?)\s*(?::|：|[-–—]\s|$)/iu.test(line);
}

function markdownTableCells(rawLine) {
  const line = String(rawLine ?? '').trim();
  if (!line.startsWith('|') || !line.endsWith('|')) return [];
  return line
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

function addClaimVerdict(verdicts, claim, verdict) {
  if (!claim || !verdict) return;
  if (!verdicts.has(claim)) verdicts.set(claim, new Set());
  verdicts.get(claim).add(verdict);
}

function normalizeClaimIdentifier(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return '';
  if (/^\d+$/u.test(normalized)) return String(Number(normalized));
  return normalized;
}

function normalizeClaimVerdict(value) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/gu, '_');
  return CLAIM_VERDICTS.has(normalized) ? normalized : '';
}

function stripOuterMarkdown(value) {
  return String(value ?? '')
    .trim()
    .replace(/^(?:\*\*|__|`)+/u, '')
    .replace(/(?:\*\*|__|`)+$/u, '')
    .trim();
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
  if (id && callsById.has(id)) {
    const existing = callsById.get(id);
    mergeCallObservation(existing, value);
    return existing;
  }
  const fingerprint = callFingerprint(name, argumentsValue);
  const unresolved = unresolvedByFingerprint.get(fingerprint);
  if (!id && unresolved && !unresolved.completed) {
    mergeCallObservation(unresolved, value);
    return unresolved;
  }

  const call = {
    id: id || `observed-${calls.length + 1}`,
    name,
    arguments: argumentsValue,
    turnKind: value.turnKind ?? 'user',
    eventIndex: Number.isFinite(value.eventIndex) ? value.eventIndex : -1,
    completed: false,
    isError: null,
    assistantBatchIndex: null,
    assistantEventIndex: null,
    contentIndex: null,
    executionStartEventIndex: null,
    completionEventIndex: null,
  };
  mergeCallObservation(call, value);
  calls.push(call);
  if (id) callsById.set(id, call);
  unresolvedByFingerprint.set(fingerprint, call);
  return call;
}

function mergeCallObservation(call, value) {
  if (!call || !value) return;
  if (value.observation === 'assistant-message') {
    if (!Number.isFinite(call.assistantBatchIndex)
      && Number.isFinite(value.assistantBatchIndex)) {
      call.assistantBatchIndex = value.assistantBatchIndex;
    }
    if (!Number.isFinite(call.assistantEventIndex) && Number.isFinite(value.eventIndex)) {
      call.assistantEventIndex = value.eventIndex;
    }
    if (!Number.isFinite(call.contentIndex) && Number.isFinite(value.contentIndex)) {
      call.contentIndex = value.contentIndex;
    }
  }
  if (value.observation === 'execution-start'
    && !Number.isFinite(call.executionStartEventIndex)
    && Number.isFinite(value.eventIndex)) {
    call.executionStartEventIndex = value.eventIndex;
  }
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

function customContentTextFromEvent(event) {
  const value = event?.type === 'session_custom'
    ? event.entry
    : event?.type === 'message_end'
      ? event.message
      : event;
  if (typeof value?.content === 'string') return value.content;
  if (!Array.isArray(value?.content)) return '';
  return value.content
    .filter((item) => item?.type === 'text')
    .map((item) => String(item.text ?? ''))
    .join('\n');
}

function asyncJobResultsFromEvent(event) {
  const message = event?.type === 'message_end' ? event.message : event;
  const customAsyncResult = message?.role === 'custom' && message?.customType === 'async-result';
  const hubToolResult = event?.type === 'tool_execution_end'
    && String(event.toolName ?? event.name ?? '').trim() === 'hub'
    && event?.isError !== true
    && event?.result?.isError !== true;
  if (!customAsyncResult && !hubToolResult) return [];
  if (hubToolResult) {
    const structuredJobs = structuredHubJobs(event.result?.details);
    if (structuredJobs !== null) {
      return structuredJobs.map((job) => ({ ...job, deliverySource: 'hub-structured' }));
    }
    return legacyHubJobsFromText(resultText(event.result))
      .map((job) => ({ ...job, deliverySource: 'hub-observed' }));
  }
  const content = typeof message.content === 'string'
    ? message.content
    : Array.isArray(message.content)
      ? message.content.map((item) => String(item?.text ?? '')).join('\n')
      : '';
  const jobs = [];
  const closedIds = new Set();
  for (const match of content.matchAll(/<task-result\b([^>]*)>([\s\S]*?)<\/task-result\s*>/giu)) {
    const attributes = match[1];
    const id = attributeValue(attributes, 'id');
    const status = normalizeJobStatus(attributeValue(attributes, 'status'));
    if (!id) continue;
    closedIds.add(id);
    jobs.push({
      id,
      status,
      deliveryText: normalizeDeliveryText(match[2]),
      deliverySource: 'async-task-result',
    });
  }
  for (const match of content.matchAll(/<task-result\b([^>]*)\/?\s*>/giu)) {
    const attributes = match[1];
    const id = attributeValue(attributes, 'id');
    if (!id || closedIds.has(id)) continue;
    jobs.push({
      id,
      status: normalizeJobStatus(attributeValue(attributes, 'status')),
      deliveryText: '',
      deliverySource: 'async-task-result',
    });
  }
  return normalizeJobRecords(jobs);
}

function structuredHubJobs(details) {
  const records = nestedJobsArray(details);
  return records === null ? null : normalizeJobRecords(records);
}

function nestedJobsArray(value, depth = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Array.isArray(value.jobs)) return value.jobs;
  if (depth >= 2) return null;
  for (const key of ['result', 'data', 'snapshot', 'details']) {
    const records = nestedJobsArray(value[key], depth + 1);
    if (records !== null) return records;
  }
  return null;
}

function legacyHubJobsFromText(content) {
  const jobs = [];
  let section = null;
  let expectedCompleted = 0;
  let observedCompleted = 0;
  let current = null;
  let fence = null;
  const flush = () => {
    if (!current) return;
    jobs.push({
      id: current.id,
      status: current.status,
      deliveryText: normalizeDeliveryText(current.lines.join('\n')),
    });
    current = null;
  };
  for (const line of String(content ?? '').split(/\r?\n/u)) {
    const fenceMatch = /^(`{3,}|~{3,})[^\r\n]*$/u.exec(line);
    if (fenceMatch) {
      if (current) current.lines.push(line);
      const marker = fenceMatch[1][0];
      if (fence === marker) fence = null;
      else if (fence === null) fence = marker;
      continue;
    }
    if (fence !== null) {
      if (current) current.lines.push(line);
      continue;
    }
    const sectionMatch = /^## (Completed|Still Running) \((\d+)\)$/u.exec(line);
    if (sectionMatch) {
      flush();
      section = sectionMatch[1];
      expectedCompleted = section === 'Completed' ? Number(sectionMatch[2]) : 0;
      observedCompleted = 0;
      continue;
    }
    if (/^## /u.test(line)) {
      flush();
      section = null;
      continue;
    }
    if (section === 'Completed') {
      const jobMatch = /^### (\S(?:.*\S)?) \[(?:task|bash)\] — (completed|failed|cancelled)$/u.exec(line);
      if (jobMatch && observedCompleted < expectedCompleted) {
        flush();
        current = { id: jobMatch[1], status: jobMatch[2], lines: [] };
        observedCompleted += 1;
      } else if (current) {
        current.lines.push(line);
      }
      continue;
    }
    if (section === 'Still Running') {
      const runningMatch = /^- `([^`]+)` \[(?:task|bash)\] — .+$/u.exec(line);
      if (runningMatch) jobs.push({ id: runningMatch[1], status: 'running', deliveryText: '' });
    }
  }
  flush();
  return normalizeJobRecords(jobs);
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
  const nestedUriMatch = target.match(/^skill:\/\/([^/\s]+)\/(.+\/SKILL\.md)(?:[?#].*)?$/i);
  if (nestedUriMatch) {
    const contentName = resultText(result).match(/^name:\s*['"]?([^'"\r\n]+)['"]?\s*$/m)?.[1];
    if (contentName) return normalizeSkillName(contentName);
  }
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
    assistantBatchIndex: call.assistantBatchIndex,
    contentIndex: call.contentIndex,
    completionEventIndex: call.completionEventIndex,
  };
}

function summarizeSkillPathDiagnostics(calls, workflowPreparation, advisorMessages) {
  const plan = workflowPreparation?.workflowPlanDeclaration;
  const resourcesByUri = new Map();
  const resourcesBySkill = new Map();
  const addResource = (value) => {
    const resource = skillResourceFromUri(value);
    if (!resource || resourcesByUri.has(resource.uri)) return;
    resourcesByUri.set(resource.uri, resource);
    if (!resourcesBySkill.has(resource.skill)) resourcesBySkill.set(resource.skill, new Map());
    resourcesBySkill.get(resource.skill).set(resource.uri, resource);
  };
  for (const rawUri of [...(plan?.skills ?? []), ...(plan?.loadOrder ?? [])]) {
    addResource(rawUri);
  }
  const knownUris = new Set(resourcesByUri.keys());
  for (const call of [...calls].sort(compareCallPositions)) {
    const target = readTargetFromCall(call);
    if (call?.name !== 'read'
      || call.completed !== true
      || call.isError !== false
      || !knownUris.has(target)) continue;
    for (const uri of call.revealedSkillUris ?? []) {
      addResource(uri);
      knownUris.add(uri);
    }
  }
  const declaredBySkill = new Map([...resourcesBySkill]
    .flatMap(([skill, resources]) => (
      resources.size === 1 ? [[skill, resources.values().next().value]] : []
    )));

  const misaddressedDeclaredSkillReads = calls.flatMap((call) => {
    const target = call?.name === 'read' ? readTargetFromCall(call) : '';
    const resource = isBareSkillId(target) && declaredBySkill.get(normalizeSkillName(target));
    return resource ? [{
      callId: call.id,
      declaredUri: resource.uri,
      skill: resource.skill,
      target,
      eventIndex: call.eventIndex,
      completionEventIndex: call.completionEventIndex,
      completed: call.completed,
      isError: call.isError,
    }] : [];
  });

  const unsupportedAdvisorSkillAbsenceClaims = [];
  for (const message of advisorMessages) {
    for (const resource of declaredBySkill.values()) {
      if (!advisorTextClaimsSkillAbsent(message.text, resource)) continue;
      const supported = calls.some((call) => (
        call?.name === 'read'
        && readTargetFromCall(call) === resource.uri
        && call.completed === true
        && call.isError === true
        && Number.isFinite(call.completionEventIndex)
        && call.completionEventIndex < message.eventIndex
      ));
      if (supported) continue;
      unsupportedAdvisorSkillAbsenceClaims.push({
        skill: resource.skill,
        declaredUri: resource.uri,
        eventIndex: message.eventIndex,
        reason: 'no-prior-exact-skill-uri-resolver-failure',
      });
    }
  }
  return { misaddressedDeclaredSkillReads, unsupportedAdvisorSkillAbsenceClaims };
}

function skillResourceFromUri(value) {
  const uri = stripOuterMarkdown(value);
  if (!isDomainSkillUri(uri)) return null;
  const match = /^skill:\/\/([a-z0-9._-]+(?:\/[a-z0-9._-]+)*)(?:[?#].*)?$/iu.exec(uri);
  if (!match) return null;
  const segments = match[1].split('/');
  if (/^SKILL\.md$/iu.test(segments.at(-1) ?? '')) segments.pop();
  const skill = normalizeSkillName(segments.at(-1));
  return isBareSkillId(skill) ? { uri, skill } : null;
}

function exactSkillUrisFromText(text) {
  const uris = [];
  for (const match of String(text ?? '').matchAll(/skill:\/\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*/giu)) {
    const uri = match[0].replace(/[.,;:!?]+$/gu, '');
    if (isExactSkillUri(uri) && !uris.includes(uri)) uris.push(uri);
  }
  return uris;
}

function isExactSkillUri(value) {
  return /^skill:\/\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/iu.test(
    stripOuterMarkdown(value),
  );
}

function skillUriNamespace(value) {
  return /^skill:\/\/([a-z0-9][a-z0-9._-]*)(?:\/|$)/iu.exec(
    stripOuterMarkdown(value),
  )?.[1]?.toLowerCase() ?? '';
}

function advisorTextClaimsSkillAbsent(text, resource) {
  const absencePattern = /(?:不存在|未(?:能)?找到|找不到|不可用|无法(?:加载|读取|解析)|does\s+not\s+exist|doesn't\s+exist|not\s+found|unavailable|missing|cannot\s+(?:load|read|resolve)|failed\s+to\s+(?:load|read|resolve))/iu;
  const negatedAbsencePattern = /(?:(?:并非|不是|并不)\s*(?:不存在|不可用|缺失|未(?:能)?找到)|\bnot\s+(?:missing|unavailable)\b)/iu;
  return String(text ?? '')
    .split(/[\r\n.!?。！？;；]+/u)
    .some((statement) => !negatedAbsencePattern.test(statement)
      && absencePattern.test(statement)
      && statementMentionsSkillResource(statement, resource));
}

function statementMentionsSkillResource(statement, resource) {
  const text = String(statement ?? '');
  if (text.toLowerCase().includes(resource.uri.toLowerCase())) return true;
  const escaped = resource.skill.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}_-])${escaped}(?:$|[^\\p{L}\\p{N}_-])`, 'iu').test(text);
}

function nonProjectResourceReadFromCall(call) {
  if (call?.name !== 'read') return false;
  const target = String(
    call.arguments?.path
    ?? call.arguments?.file_path
    ?? call.arguments?.uri
    ?? call.arguments?.value
    ?? '',
  ).trim();
  return /^(?:agent|artifact|history|issue|local|mcp|omp|pr|skill):\/\//iu.test(target);
}

function workflowStageKindFromCall(call) {
  if (ORCHESTRATION_TOOLS.has(call?.name)) return 'orchestration';
  if (call?.name !== 'read') return 'project';
  const target = readTargetFromCall(call);
  if (WORKFLOW_INDEX_URI_PATTERN.test(target)) return 'workflow-index';
  if (WORKFLOW_REFERENCE_URI_PATTERN.test(target)) return 'workflow-reference';
  if (skillReadAttemptFromCall(call)) return 'domain-skill';
  if (nonProjectResourceReadFromCall(call)) return 'auxiliary-resource';
  return 'project';
}

function exactWorkflowReferenceFailures(summary, workflowPreparation) {
  const failures = [];
  const selected = new Set(workflowPreparation.workflowPlanDeclaration?.selectedWorkflowIds ?? []);
  const allowed = new Set((workflowPreparation.workflowPlanPhases ?? [])
    .flatMap(({ declaration }) => declaration?.selectedWorkflowIds ?? []));
  if (allowed.size === 0) for (const workflowId of selected) allowed.add(workflowId);
  const expectedUris = new Map([...selected].map((id) => [
    id,
    `skill://omp-enhancer-workflows/references/${id}.md`,
  ]));
  const declaredLoadOrder = new Set((workflowPreparation.workflowPlanPhases ?? [])
    .flatMap(({ declaration }) => declaration?.loadOrder ?? []));
  if (declaredLoadOrder.size === 0) {
    for (const uri of workflowPreparation.workflowPlanDeclaration?.loadOrder ?? []) {
      declaredLoadOrder.add(uri);
    }
  }
  const successfulReferenceIds = new Set();

  for (const call of summary.toolCalls ?? []) {
    if (call.workflowStageKind !== 'workflow-reference'
      || call.completed !== true
      || call.isError === true) continue;
    const target = readTargetFromCall(call);
    const workflowId = workflowIdFromReferenceUri(target);
    if (!workflowId) {
      failures.push(`successful workflow reference did not use a per-workflow URI: ${target}`);
      continue;
    }
    successfulReferenceIds.add(workflowId);
    if (!allowed.has(workflowId)) {
      failures.push(`successful workflow reference was read for an unselected workflow: ${workflowId}`);
    }
  }

  for (const [workflowId, uri] of expectedUris) {
    if (!declaredLoadOrder.has(uri)) {
      failures.push(`WORKFLOW PLAN load-order omitted selected workflow reference: ${uri}`);
    }
    if (!successfulReferenceIds.has(workflowId)) {
      failures.push(`selected workflow reference was not read successfully: ${workflowId}`);
    }
  }
  return failures;
}

function workflowIdFromReferenceUri(value) {
  return /^skill:\/\/omp-enhancer-workflows\/references\/([^\s/?#]+)\.md(?:[?#].*)?$/iu.exec(String(value ?? '').trim())?.[1] ?? '';
}

function readTargetFromCall(call) {
  return String(
    call?.arguments?.path
    ?? call?.arguments?.file_path
    ?? call?.arguments?.uri
    ?? call?.arguments?.value
    ?? '',
  ).trim();
}

function summarizeWorkflowPreparation(calls, assistantBatches) {
  const primaryCalls = calls.filter(({ turnKind }) => turnKind !== 'autolearn-capture');
  const primaryBatches = assistantBatches.filter(({ turnKind }) => turnKind !== 'autolearn-capture');
  const callsByBatch = new Map();
  for (const call of primaryCalls) {
    if (!Number.isFinite(call.assistantBatchIndex)) continue;
    const batchCalls = callsByBatch.get(call.assistantBatchIndex) ?? [];
    batchCalls.push(call);
    callsByBatch.set(call.assistantBatchIndex, batchCalls);
  }
  const toolBatches = primaryBatches.filter(({ batchIndex }) => (
    (callsByBatch.get(batchIndex)?.length ?? 0) > 0
  ));
  const firstToolBatch = toolBatches.at(0) ?? null;
  const firstToolBatchCalls = firstToolBatch
    ? callsByBatch.get(firstToolBatch.batchIndex) ?? []
    : [];
  const unattributedCallIds = primaryCalls
    .filter(({ assistantBatchIndex }) => !Number.isFinite(assistantBatchIndex))
    .map(({ id }) => id);
  const provenanceComplete = unattributedCallIds.length === 0;
  const preparationCalls = primaryCalls.filter(({ workflowStageKind }) => (
    isWorkflowPreparationResourceKind(workflowStageKind)
  ));
  const projectCalls = primaryCalls.filter(({ workflowStageKind }) => (
    !isWorkflowPreparationResourceKind(workflowStageKind)
  ));
  const mixedResourceProjectBatchIndexes = toolBatches
    .filter(({ batchIndex }) => {
      const batchCalls = callsByBatch.get(batchIndex) ?? [];
      return batchCalls.some(({ workflowStageKind }) => isWorkflowPreparationResourceKind(workflowStageKind))
        && batchCalls.some(({ workflowStageKind }) => !isWorkflowPreparationResourceKind(workflowStageKind));
    })
    .map(({ batchIndex }) => batchIndex);
  const planMarkers = primaryBatches
    .filter(({ workflowPlanContentIndex }) => Number.isFinite(workflowPlanContentIndex))
    .map((batch) => markerFromBatch(batch, 'plan'));
  const readyMarkers = primaryBatches
    .filter(({ workflowReadyContentIndex }) => Number.isFinite(workflowReadyContentIndex))
    .map((batch) => markerFromBatch(batch, 'ready'));
  const resourceExtensionMarkers = primaryBatches
    .filter(({ resourceExtensionContentIndex }) => Number.isFinite(resourceExtensionContentIndex))
    .map((batch) => markerFromBatch(batch, 'extension'));
  const successfulIndexCalls = preparationCalls
    .filter(({ workflowStageKind, completed, isError }) => (
      workflowStageKind === 'workflow-index' && completed === true && isError === false
    ))
    .sort(compareCallPositions);
  const discoveryIndexCall = successfulIndexCalls.at(0) ?? null;
  const indexOnlyFirstToolBatch = provenanceComplete
    && firstToolBatchCalls.length === 1
    && firstToolBatchCalls[0].workflowStageKind === 'workflow-index'
    && firstToolBatchCalls[0].completed === true
    && firstToolBatchCalls[0].isError === false;
  const callsAfterDiscoveryGate = discoveryIndexCall
    ? primaryCalls.filter(({ id }) => id !== discoveryIndexCall.id)
    : primaryCalls;
  const initialValidPlanMarker = discoveryIndexCall
    ? planMarkers.find((marker) => (
      Number.isFinite(discoveryIndexCall.completionEventIndex)
      && discoveryIndexCall.completionEventIndex < marker.eventIndex
      && callsAfterDiscoveryGate.every((call) => markerBeforeCall(marker, call))
    )) ?? null
    : null;
  const pendingLanguageTransition = summarizePendingLanguageTransition({
    planMarkers,
    readyMarkers,
    initialPlanMarker: initialValidPlanMarker,
    primaryCalls,
    preparationCalls,
    callsByBatch,
  });
  const validPlanMarker = pendingLanguageTransition?.valid
    ? pendingLanguageTransition.replacementPlanMarker
    : initialValidPlanMarker;
  const validReadyMarker = pendingLanguageTransition?.valid
    ? pendingLanguageTransition.replacementReadyMarker
    : readyMarkers.find((marker) => (
    preparationCalls.every((call) => (
      call.completed === true
      && Number.isFinite(call.completionEventIndex)
      && call.completionEventIndex < marker.eventIndex
    ))
    && projectCalls.every((call) => markerBeforeCall(marker, call))
      && (!validPlanMarker || markerBeforeMarker(validPlanMarker, marker))
    )) ?? null;
  const readyBatchCalls = validReadyMarker
    ? callsByBatch.get(validReadyMarker.batchIndex) ?? []
    : [];
  const readyOnlyTodoInitCall = readyBatchCalls.length === 1
    && readyBatchCalls[0].name === 'todo'
    && readyBatchCalls[0].arguments?.op === 'init'
    && readyBatchCalls[0].completed === true
    && readyBatchCalls[0].isError === false;

  return {
    provenanceComplete,
    unattributedCallIds,
    firstToolBatchIndex: firstToolBatch?.batchIndex ?? null,
    workflowPlanMarkerCount: planMarkers.length,
    workflowReadyMarkerCount: readyMarkers.length,
    resourceExtensionMarkerCount: resourceExtensionMarkers.length,
    resourceExtensions: resourceExtensionMarkers.map((marker) => ({
      batchIndex: marker.batchIndex,
      eventIndex: marker.eventIndex,
      firstVisibleContent: marker.firstVisibleContent,
      source: marker.declaration?.source ?? null,
      reads: [...(marker.declaration?.reads ?? [])],
      valid: marker.declaration != null,
    })),
    resourceExtensionReadUris: resourceExtensionMarkers
      .flatMap(({ declaration }) => declaration?.reads ?? []),
    workflowIndexCallIds: preparationCalls
      .filter(({ workflowStageKind }) => workflowStageKind === 'workflow-index')
      .map(({ id }) => id),
    preparationResourceCallIds: preparationCalls.map(({ id }) => id),
    projectCallIds: projectCalls.map(({ id }) => id),
    mixedResourceProjectBatchIndexes,
    indexOnlyFirstToolBatch,
    planAfterIndexBeforeLoadsOrProjectTools: provenanceComplete && Boolean(validPlanMarker),
    readyAfterLoadsBeforeProjectTools: provenanceComplete
      && Boolean(validPlanMarker)
      && Boolean(validReadyMarker),
    workflowPlanBatchIndex: validPlanMarker?.batchIndex ?? null,
    workflowReadyBatchIndex: validReadyMarker?.batchIndex ?? null,
    workflowPlanFirstVisibleContent: validPlanMarker?.firstVisibleContent === true,
    workflowReadyFirstVisibleContent: validReadyMarker?.firstVisibleContent === true,
    workflowReadyOnlyTodoInitCall: readyOnlyTodoInitCall,
    workflowPlanDeclaration: workflowDeclarationSummary(validPlanMarker?.declaration),
    workflowReadyDeclaration: workflowDeclarationSummary(validReadyMarker?.declaration),
    initialWorkflowPlanDeclaration: workflowDeclarationSummary(initialValidPlanMarker?.declaration),
    pendingLanguageTransition: pendingLanguageTransition ? {
      valid: pendingLanguageTransition.valid,
      failures: [...pendingLanguageTransition.failures],
      languageReadCallId: pendingLanguageTransition.languageReadCall?.id ?? null,
      initialPlanBatchIndex: pendingLanguageTransition.initialPlanMarker?.batchIndex ?? null,
      initialReadyBatchIndex: pendingLanguageTransition.initialReadyMarker?.batchIndex ?? null,
      replacementPlanBatchIndex: pendingLanguageTransition.replacementPlanMarker?.batchIndex ?? null,
      replacementReadyBatchIndex: pendingLanguageTransition.replacementReadyMarker?.batchIndex ?? null,
    } : null,
    workflowPlanPhases: workflowPlanPhases({
      pendingLanguageTransition,
      validPlanMarker,
      validReadyMarker,
    }),
  };
}

function summarizePendingLanguageTransition({
  planMarkers,
  readyMarkers,
  initialPlanMarker,
  primaryCalls,
  preparationCalls,
  callsByBatch,
}) {
  const initialPrimary = initialPlanMarker?.declaration?.primary ?? null;
  if (initialPrimary !== 'writing.pending') {
    if (planMarkers.length <= 1) return null;
    return {
      valid: false,
      failures: ['repeated WORKFLOW PLAN is allowed only for writing.pending language resolution'],
      initialPlanMarker,
      initialReadyMarker: null,
      replacementPlanMarker: planMarkers.at(1) ?? null,
      replacementReadyMarker: null,
      languageReadCall: null,
    };
  }

  const failures = [];
  if (planMarkers.length !== 2) {
    failures.push(`writing.pending requires exactly one replacement WORKFLOW PLAN; observed ${Math.max(0, planMarkers.length - 1)}`);
  }
  if (readyMarkers.length !== 2) {
    failures.push(`writing.pending requires initial and replacement WORKFLOW READY; observed ${readyMarkers.length}`);
  }
  const replacementPlanMarker = planMarkers.at(1) ?? null;
  const initialReadyMarker = readyMarkers.find((marker) => (
    initialPlanMarker
    && markerBeforeMarker(initialPlanMarker, marker)
    && (!replacementPlanMarker || markerBeforeMarker(marker, replacementPlanMarker))
  )) ?? null;
  const replacementReadyMarker = readyMarkers.find((marker) => (
    replacementPlanMarker && markerBeforeMarker(replacementPlanMarker, marker)
  )) ?? null;
  if (!initialReadyMarker) failures.push('writing.pending initial WORKFLOW READY was missing before language resolution');
  if (!replacementPlanMarker) failures.push('writing.pending replacement WORKFLOW PLAN was missing');
  if (!replacementReadyMarker) failures.push('writing.pending replacement WORKFLOW READY was missing');

  for (const [label, marker] of [
    ['initial WORKFLOW PLAN', initialPlanMarker],
    ['initial WORKFLOW READY', initialReadyMarker],
    ['replacement WORKFLOW PLAN', replacementPlanMarker],
    ['replacement WORKFLOW READY', replacementReadyMarker],
  ]) {
    if (marker && marker.firstVisibleContent !== true) {
      failures.push(`writing.pending ${label} was not visible at byte 0`);
    }
  }

  const initialPlan = initialPlanMarker?.declaration ?? null;
  const initialReady = initialReadyMarker?.declaration ?? null;
  const replacementPlan = replacementPlanMarker?.declaration ?? null;
  const replacementReady = replacementReadyMarker?.declaration ?? null;
  if (initialReady && !declarationsShareSelection(initialPlan, initialReady)) {
    failures.push('writing.pending initial READY did not preserve the pending selection');
  }
  if (replacementPlan && !['writing.en', 'writing.zh'].includes(replacementPlan.primary)) {
    failures.push(`writing.pending replacement primary was ${replacementPlan.primary ?? '<none>'}, expected writing.en or writing.zh`);
  }
  if (replacementPlan && !sameStringList(initialPlan?.addOns, replacementPlan.addOns)) {
    failures.push('writing.pending format companions changed in the replacement PLAN');
  }
  if (replacementReady && !declarationsShareSelection(replacementPlan, replacementReady)) {
    failures.push('writing.pending replacement READY did not preserve the replacement selection');
  }

  const callsBetween = (startMarker, endMarker) => (
    !startMarker || !endMarker ? [] : primaryCalls.filter((call) => (
      Number.isFinite(call.eventIndex)
      && call.eventIndex > startMarker.eventIndex
      && call.eventIndex < endMarker.eventIndex
    ))
  );
  const transitionCalls = callsBetween(initialReadyMarker, replacementPlanMarker);
  const languageReads = transitionCalls.filter((call) => (
    call.name === 'read' && call.workflowStageKind === 'project'
  ));
  const languageReadCall = languageReads.length === 1 ? languageReads[0] : null;
  if (transitionCalls.length !== 1 || !languageReadCall) {
    failures.push('writing.pending transition must contain exactly one narrow project read and no substantive companion action');
  } else if (languageReadCall.completed !== true
    || languageReadCall.isError !== false
    || !Number.isFinite(languageReadCall.completionEventIndex)
    || languageReadCall.completionEventIndex >= replacementPlanMarker.eventIndex) {
    failures.push('writing.pending language-only read did not complete successfully before replacement PLAN');
  }

  const beforeInitialReady = preparationCalls.filter((call) => (
    initialPlanMarker
    && initialReadyMarker
    && markerBeforeCall(initialPlanMarker, call)
    && Number.isFinite(call.completionEventIndex)
    && call.completionEventIndex < initialReadyMarker.eventIndex
  ));
  const loadedBeforeTransition = new Set(beforeInitialReady
    .filter((call) => call.completed === true && call.isError === false)
    .map(readTargetFromCall));
  const repeated = (replacementPlan?.loadOrder ?? [])
    .map(stripOuterMarkdown)
    .filter((uri) => loadedBeforeTransition.has(uri));
  if (repeated.length > 0) {
    failures.push(`writing.pending replacement PLAN reread loaded companion resource(s): ${repeated.join(', ')}`);
  }
  const languageReference = replacementPlan?.primary
    ? `skill://omp-enhancer-workflows/references/${replacementPlan.primary}.md`
    : '';
  if (replacementPlan && replacementPlan.loadOrder.at(-1) !== languageReference) {
    failures.push(`writing.pending replacement PLAN did not put its language reference last: ${languageReference || '<none>'}`);
  }

  const replacementWindowCalls = callsBetween(replacementPlanMarker, replacementReadyMarker);
  const invalidReplacementCalls = replacementWindowCalls.filter((call) => (
    !isWorkflowPreparationResourceKind(call.workflowStageKind)
  ));
  if (invalidReplacementCalls.length > 0) {
    failures.push('writing.pending performed substantive work between replacement PLAN and replacement READY');
  }
  for (const [label, marker] of [
    ['initial', initialReadyMarker],
    ['replacement', replacementReadyMarker],
  ]) {
    if (!marker) continue;
    const batchCalls = callsByBatch.get(marker.batchIndex) ?? [];
    const todoOnly = batchCalls.length === 1
      && batchCalls[0].name === 'todo'
      && batchCalls[0].arguments?.op === 'init'
      && batchCalls[0].completed === true
      && batchCalls[0].isError === false;
    if (!todoOnly) failures.push(`writing.pending ${label} READY batch was not TODO-init-only`);
  }

  return {
    valid: failures.length === 0,
    failures,
    initialPlanMarker,
    initialReadyMarker,
    replacementPlanMarker,
    replacementReadyMarker,
    languageReadCall,
  };
}

function workflowPlanPhases({ pendingLanguageTransition, validPlanMarker, validReadyMarker }) {
  const phases = pendingLanguageTransition?.valid ? [
    {
      planMarker: pendingLanguageTransition.initialPlanMarker,
      readyMarker: pendingLanguageTransition.initialReadyMarker,
    },
    {
      planMarker: pendingLanguageTransition.replacementPlanMarker,
      readyMarker: pendingLanguageTransition.replacementReadyMarker,
    },
  ] : [{ planMarker: validPlanMarker, readyMarker: validReadyMarker }];
  return phases.filter(({ planMarker }) => planMarker).map(({ planMarker, readyMarker }) => ({
    planBatchIndex: planMarker.batchIndex,
    planEventIndex: planMarker.eventIndex,
    readyBatchIndex: readyMarker?.batchIndex ?? null,
    readyEventIndex: readyMarker?.eventIndex ?? null,
    declaration: workflowDeclarationSummary(planMarker.declaration),
  }));
}

function declarationsShareSelection(left, right) {
  return left?.primary === right?.primary && sameStringList(left?.addOns, right?.addOns);
}

function sameStringList(left = [], right = []) {
  return JSON.stringify([...(left ?? [])].sort()) === JSON.stringify([...(right ?? [])].sort());
}

function isWorkflowPreparationResourceKind(kind) {
  return kind === 'workflow-index' || kind === 'workflow-reference' || kind === 'domain-skill';
}

function markerFromBatch(batch, type) {
  const contentIndex = type === 'plan'
    ? batch.workflowPlanContentIndex
    : type === 'ready'
      ? batch.workflowReadyContentIndex
      : batch.resourceExtensionContentIndex;
  const characterIndex = type === 'plan'
    ? batch.workflowPlanCharacterIndex
    : type === 'ready'
      ? batch.workflowReadyCharacterIndex
      : batch.resourceExtensionCharacterIndex;
  return {
    batchIndex: batch.batchIndex,
    eventIndex: batch.eventIndex,
    contentIndex,
    characterIndex,
    firstVisibleContent: contentIndex === batch.firstVisibleTextContentIndex
      && characterIndex === 0,
    declaration: type === 'plan'
      ? batch.workflowPlanDeclaration
      : type === 'ready'
        ? batch.workflowReadyDeclaration
        : batch.resourceExtensionDeclaration,
  };
}

function workflowDeclarationFromVisibleMarker(text, characterIndex) {
  if (!Number.isFinite(characterIndex) || characterIndex < 0) return null;
  const tail = String(text ?? '').slice(characterIndex);
  const [line, ...followingLines] = tail.split(/\r?\n/u);
  const fields = new Map();
  const legacy = line.includes('|');
  if (legacy) {
    for (const segment of line.split('|').slice(1)) {
      const normalizedSegment = stripOuterMarkdown(segment);
      const match = /^(primary|add-ons|skills|load-order|skills-loaded|skills-unavailable)\s*=\s*(.*?)\s*$/iu.exec(normalizedSegment);
      if (!match) continue;
      fields.set(match[1].toLowerCase(), stripOuterMarkdown(match[2]));
    }
  } else {
    let duplicateField = false;
    for (const rawLine of followingLines.slice(0, 12)) {
      const normalizedLine = rawLine
        .trim()
        .replace(/^[-*+]\s+/u, '')
        .trim();
      if (/^(?:[*_`]{0,3})(?:numbered\s+)?actions?(?:[*_`]{0,3})\s*:/iu.test(normalizedLine)) break;
      const match = /^(?:[*_`]{0,3})(primary|add-ons|skills|load(?:-|\s+)order)(?:(?:[*_`]{0,3})\s*:\s*(?:[*_`]{0,3}))(.*?)\s*$/iu.exec(normalizedLine);
      if (!match) continue;
      const key = match[1].toLowerCase().replace(/\s+/gu, '-');
      if (fields.has(key)) duplicateField = true;
      fields.set(key, stripOuterMarkdown(match[2]));
    }
    if (duplicateField || !['primary', 'add-ons', 'skills', 'load-order'].every((key) => (
      fields.has(key) && String(fields.get(key)).trim() !== ''
    ))) {
      return null;
    }
  }

  const primary = workflowIdsFromDeclarationField(fields.get('primary')).at(0) ?? null;
  const addOns = workflowIdsFromDeclarationField(fields.get('add-ons'));
  const loadPhases = loadPhasesFromDeclarationField(fields.get('load-order'));
  return {
    format: legacy ? 'legacy' : 'block',
    numberedActionCount: workflowPlanNumberedActionCount(tail),
    primary,
    addOns,
    selectedWorkflowIds: [...new Set([primary, ...addOns].filter(Boolean))],
    skills: declarationListFromField(fields.get('skills')),
    loadOrder: loadPhases.loadOrder,
    loadNow: loadPhases.loadNow,
    loadThen: loadPhases.loadThen,
    structuredLoadOrder: loadPhases.structuredLoadOrder,
    skillsLoaded: declarationListFromField(fields.get('skills-loaded')),
    skillsUnavailable: declarationListFromField(fields.get('skills-unavailable')),
  };
}

function loadPhasesFromDeclarationField(value) {
  const normalized = stripOuterMarkdown(value);
  const match = /^NOW\s*=\s*\[([^\]]*)\]\s+THEN\s*=\s*\[([^\]]*)\]$/iu.exec(normalized);
  if (!match) {
    return {
      loadOrder: declarationListFromField(normalized),
      loadNow: [],
      loadThen: [],
      structuredLoadOrder: false,
    };
  }
  const loadNow = declarationListFromField(match[1]);
  const loadThen = declarationListFromField(match[2]);
  return {
    loadOrder: [...loadNow, ...loadThen],
    loadNow,
    loadThen,
    structuredLoadOrder: true,
  };
}

function workflowPlanNumberedActionCount(text) {
  return String(text ?? '')
    .split(/\r?\n/u)
    .slice(1)
    .filter((rawLine) => /^\s*\d+[.)]\s+\S/u.test(rawLine))
    .length;
}

function workflowPlanMarkerFromVisibleText(text) {
  for (const match of String(text ?? '').matchAll(WORKFLOW_PLAN_PATTERN)) {
    const declaration = workflowDeclarationFromVisibleMarker(text, match.index);
    if (declaration) return { characterIndex: match.index, declaration };
  }
  return null;
}

function resourceExtensionMarkerFromVisibleText(text) {
  for (const match of String(text ?? '').matchAll(RESOURCE_EXTENSION_PATTERN)) {
    return {
      characterIndex: match.index,
      declaration: resourceExtensionDeclarationFromVisibleMarker(text, match.index),
    };
  }
  return null;
}

function resourceExtensionDeclarationFromVisibleMarker(text, characterIndex) {
  if (!Number.isFinite(characterIndex) || characterIndex < 0) return null;
  const [line] = String(text ?? '').slice(characterIndex).split(/\r?\n/u);
  const fields = new Map();
  for (const segment of line.split('|').slice(1)) {
    const match = /^(source|reads)\s*=\s*(.*?)\s*$/iu.exec(stripOuterMarkdown(segment));
    if (!match || fields.has(match[1].toLowerCase())) return null;
    fields.set(match[1].toLowerCase(), stripOuterMarkdown(match[2]));
  }
  const source = stripOuterMarkdown(fields.get('source'));
  const reads = declarationListFromField(fields.get('reads'));
  if (!isExactSkillUri(source)
    || reads.length === 0
    || reads.some((uri) => !isExactSkillUri(uri))) return null;
  return { source, reads };
}

function declarationListFromField(value) {
  const normalized = stripOuterMarkdown(value);
  if (!normalized || /^(?:none|n\/a)$/iu.test(normalized)) return [];
  return [...new Set(normalized
    .split(/[\s,，+;；]+/u)
    .map((item) => stripOuterMarkdown(item)
      .replace(/^["'([{]+/u, '')
      .replace(/["')\]},;]+$/u, '')
      .trim())
    .filter(Boolean))];
}

function workflowIdsFromDeclarationField(value) {
  const normalized = stripOuterMarkdown(value);
  if (!normalized || /^(?:none|n\/a)$/iu.test(normalized)) return [];
  return [...new Set(normalized
    .split(/[\s,，+]+/u)
    .map(normalizeWorkflowId)
    .filter(Boolean))];
}

function normalizeWorkflowId(value) {
  const normalized = stripOuterMarkdown(value)
    .replace(/^["'([{]+/u, '')
    .replace(/["')\]},;:]+$/u, '')
    .trim()
    .toLowerCase();
  return /^[a-z0-9][a-z0-9._-]*$/u.test(normalized) ? normalized : '';
}

function workflowDeclarationSummary(declaration) {
  if (!declaration) return null;
  return {
    format: declaration.format ?? null,
    numberedActionCount: declaration.numberedActionCount ?? 0,
    primary: declaration.primary ?? null,
    addOns: [...(declaration.addOns ?? [])],
    selectedWorkflowIds: [...(declaration.selectedWorkflowIds ?? [])],
    skills: [...(declaration.skills ?? [])],
    loadOrder: [...(declaration.loadOrder ?? [])],
    loadNow: [...(declaration.loadNow ?? [])],
    loadThen: [...(declaration.loadThen ?? [])],
    structuredLoadOrder: declaration.structuredLoadOrder === true,
    skillsLoaded: [...(declaration.skillsLoaded ?? [])],
    skillsUnavailable: [...(declaration.skillsUnavailable ?? [])],
  };
}

function workflowResourceDeclarationFailures(summary, workflowPreparation, expectations) {
  const failures = [];
  const plan = workflowPreparation.workflowPlanDeclaration ?? null;
  const ready = workflowPreparation.workflowReadyDeclaration ?? null;

  if (expectations.requireWorkflowPlanSkillsUseDomainSkillUris === true && plan) {
    const invalid = (plan.skills ?? []).filter((value) => !isDomainSkillUri(value));
    if (invalid.length) {
      failures.push(`WORKFLOW PLAN skills contained non-domain Skill URI(s): ${invalid.join(', ')}`);
    }
  }

  if (expectations.requireWorkflowReadyLoadedSkillsUseBareIds === true && ready) {
    const invalid = (ready.skillsLoaded ?? []).filter((value) => !isBareSkillId(value));
    if (invalid.length) {
      failures.push(`WORKFLOW READY skills-loaded contained non-bare Skill ID(s): ${invalid.join(', ')}`);
    }
  }

  const matchExpectation = expectations.requireWorkflowReadyLoadedSkillsMatchSuccessfulDomainSkills;
  if (matchExpectation) {
    if (!ready) {
      failures.push('WORKFLOW READY declaration was unavailable for loaded Skill matching');
      return failures;
    }
    const options = typeof matchExpectation === 'object' ? matchExpectation : {};
    const expected = new Set((summary.toolCalls ?? [])
      .filter((call) => (
        call.workflowStageKind === 'domain-skill'
        && call.completed === true
        && call.isError === false
      ))
      .map((call) => normalizeSkillName(
        call.resolvedSkillName ?? skillReadAttemptFromCall(call)?.name,
      ))
      .filter(Boolean));
    if (options.includeProvidedSkills !== false) {
      for (const skill of summary.providedSkills ?? []) {
        const normalized = normalizeSkillName(skill);
        if (normalized) expected.add(normalized);
      }
    }
    const actual = new Set((ready.skillsLoaded ?? []).map(normalizeSkillName).filter(Boolean));
    const missing = [...expected].filter((skill) => !hasEquivalentSkill(actual, skill));
    const unexpected = [...actual].filter((skill) => !hasEquivalentSkill(expected, skill));
    if (missing.length) {
      failures.push(`WORKFLOW READY skills-loaded omitted successful domain Skill(s): ${missing.join(', ')}`);
    }
    if (unexpected.length) {
      failures.push(`WORKFLOW READY skills-loaded declared Skill(s) without a successful domain read or provision: ${unexpected.join(', ')}`);
    }
  }

  return failures;
}

function workflowPlanLoadBatchFailures(summary, workflowPreparation) {
  const phases = workflowPreparation.workflowPlanPhases?.length
    ? workflowPreparation.workflowPlanPhases
    : [{
      planBatchIndex: workflowPreparation.workflowPlanBatchIndex,
      declaration: workflowPreparation.workflowPlanDeclaration,
    }];
  return phases.flatMap((phase) => workflowPlanPhaseLoadBatchFailures(summary, phase));
}

function workflowPlanPhaseLoadBatchFailures(summary, phase) {
  const planBatchIndex = phase.planBatchIndex;
  const declaredLoadOrder = (phase.declaration?.loadOrder ?? [])
    .map(stripOuterMarkdown);
  if (!Number.isFinite(planBatchIndex)) {
    return ['WORKFLOW PLAN was unavailable for the same assistant response batch check'];
  }

  const primaryCalls = (summary.toolCalls ?? [])
    .filter(({ turnKind }) => turnKind !== 'autolearn-capture');
  const declaredTargets = new Set(declaredLoadOrder);
  const declaredCalls = primaryCalls.filter((call) => (
    call.name === 'read' && declaredTargets.has(readTargetFromCall(call))
  ));
  const declaredSkillCalls = declaredCalls.filter(({ workflowStageKind }) => (
    workflowStageKind === 'domain-skill'
  ));
  const declaredReferenceCalls = declaredCalls.filter(({ workflowStageKind }) => (
    workflowStageKind === 'workflow-reference'
  ));
  if (declaredSkillCalls.length === 0) {
    const lateDeclaredCalls = declaredCalls.filter(({ assistantBatchIndex }) => (
      assistantBatchIndex !== planBatchIndex
    ));
    return lateDeclaredCalls.length > 0
      ? [`WORKFLOW PLAN and declared resource reads did not share the same assistant response batch: ${lateDeclaredCalls.map(readTargetFromCall).join(', ')}`]
      : [];
  }

  const misplacedDeclaredSkills = declaredSkillCalls.filter((call) => (
    call.assistantBatchIndex !== planBatchIndex
  ));
  if (misplacedDeclaredSkills.length > 0) {
    return [
      `WORKFLOW PLAN and declared top-level Skill reads did not share the same assistant response batch: ${misplacedDeclaredSkills.map(readTargetFromCall).join(', ')}`,
    ];
  }
  const referenceBatchIndexes = new Set(declaredReferenceCalls.map(({ assistantBatchIndex }) => (
    assistantBatchIndex
  )));
  if (declaredReferenceCalls.some(({ assistantBatchIndex }) => assistantBatchIndex === planBatchIndex)
    || referenceBatchIndexes.size > 1) {
    return ['declared workflow references were not one final resource-only batch after the top-level Skill prefix'];
  }
  const referenceBatchIndex = [...referenceBatchIndexes].at(0);
  if (Number.isFinite(referenceBatchIndex)) {
    const referenceBatchCalls = primaryCalls.filter(({ assistantBatchIndex }) => (
      assistantBatchIndex === referenceBatchIndex
    ));
    if (referenceBatchCalls.some(({ workflowStageKind }) => workflowStageKind !== 'workflow-reference')) {
      return ['declared workflow reference batch contained a non-reference call'];
    }
  }
  return [];
}

function structuredWorkflowLoadPhaseFailures(summary, workflowPreparation) {
  const phases = workflowPreparation.workflowPlanPhases?.length
    ? workflowPreparation.workflowPlanPhases
    : [{
      planBatchIndex: workflowPreparation.workflowPlanBatchIndex,
      readyBatchIndex: workflowPreparation.workflowReadyBatchIndex,
      declaration: workflowPreparation.workflowPlanDeclaration,
    }];
  const primaryCalls = [...(summary.toolCalls ?? [])]
    .filter(({ turnKind }) => turnKind !== 'autolearn-capture')
    .sort(compareCallPositions);
  const extensionTargets = new Set(workflowPreparation.resourceExtensionReadUris ?? []);
  const failures = [];

  for (const [index, phase] of phases.entries()) {
    const label = phases.length > 1 ? `WORKFLOW PLAN phase ${index + 1}` : 'WORKFLOW PLAN';
    const declaration = phase.declaration;
    if (!declaration || declaration.structuredLoadOrder !== true) {
      failures.push(`${label} Load order did not use structured NOW=[...] THEN=[...] syntax`);
      continue;
    }

    const loadNow = (declaration.loadNow ?? []).map(stripOuterMarkdown);
    const loadThen = (declaration.loadThen ?? []).map(stripOuterMarkdown);
    const invalidNow = loadNow.filter((uri) => !isDomainSkillUri(uri));
    const invalidThen = loadThen.filter((uri) => !WORKFLOW_REFERENCE_URI_PATTERN.test(uri));
    if (invalidNow.length > 0) {
      failures.push(`${label} NOW contained non-domain Skill URI(s): ${invalidNow.join(', ')}`);
    }
    if (invalidThen.length > 0) {
      failures.push(`${label} THEN contained non-workflow reference URI(s): ${invalidThen.join(', ')}`);
    }

    const primaryReference = declaration.primary
      ? `skill://omp-enhancer-workflows/references/${declaration.primary}.md`
      : null;
    if (primaryReference && loadThen.at(-1) !== primaryReference) {
      failures.push(`${label} THEN did not put the Primary workflow reference last: ${primaryReference}`);
    }
    const addOnReferences = new Set((declaration.addOns ?? []).map((workflowId) => (
      `skill://omp-enhancer-workflows/references/${workflowId}.md`
    )));
    const precedingThen = primaryReference ? loadThen.slice(0, -1) : loadThen;
    const unselectedAddOnReferences = precedingThen.filter((uri) => !addOnReferences.has(uri));
    if (unselectedAddOnReferences.length > 0) {
      failures.push(`${label} THEN contained reference(s) that were not selected Add-ons before Primary: ${unselectedAddOnReferences.join(', ')}`);
    }

    if (!Number.isFinite(phase.planBatchIndex)) {
      failures.push(`${label} batch was unavailable for structured load-phase evaluation`);
      continue;
    }
    const phaseCalls = primaryCalls.filter((call) => (
      Number.isFinite(call.assistantBatchIndex)
      && call.assistantBatchIndex >= phase.planBatchIndex
      && (!Number.isFinite(phase.readyBatchIndex)
        || call.assistantBatchIndex < phase.readyBatchIndex)
    ));
    const planResourceCalls = phaseCalls.filter((call) => (
      call.assistantBatchIndex === phase.planBatchIndex
      && (call.workflowStageKind === 'domain-skill'
        || call.workflowStageKind === 'workflow-reference')
    ));
    const actualPlanTargets = planResourceCalls.map(readTargetFromCall);
    const validPlanTargets = loadNow.length > 0
      ? JSON.stringify(actualPlanTargets) === JSON.stringify(loadNow)
      : actualPlanTargets.length === 0
        || JSON.stringify(actualPlanTargets) === JSON.stringify(loadThen);
    if (!validPlanTargets) {
      const expected = loadNow.length > 0
        ? loadNow
        : [`<none or complete THEN: ${loadThen.join(' -> ') || '<none>'}>`];
      failures.push(`${label} response resource calls were ${actualPlanTargets.join(' -> ') || '<none>'}, expected NOW ${expected.join(' -> ') || '<none>'}`);
    }

    const actualThen = phaseCalls
      .filter((call) => (
        call.workflowStageKind === 'workflow-reference'
        && !extensionTargets.has(readTargetFromCall(call))
      ))
      .map(readTargetFromCall);
    if (JSON.stringify(actualThen) !== JSON.stringify(loadThen)) {
      failures.push(`${label} non-extension workflow reference calls were ${actualThen.join(' -> ') || '<none>'}, expected THEN ${loadThen.join(' -> ') || '<none>'}`);
    }
  }
  return failures;
}

function linkedResourceExtensionFailures(summary, workflowPreparation) {
  const phases = workflowPreparation.workflowPlanPhases ?? [];
  const plans = phases.map(({ declaration }) => declaration).filter(Boolean);
  if (plans.length === 0 && workflowPreparation.workflowPlanDeclaration) {
    plans.push(workflowPreparation.workflowPlanDeclaration);
  }
  if (plans.length === 0) return [];
  const failures = [];
  const extensions = workflowPreparation.resourceExtensions ?? [];
  const primaryCalls = (summary.toolCalls ?? [])
    .filter(({ turnKind }) => turnKind !== 'autolearn-capture');
  const declaredTargets = new Set(plans.flatMap(({ loadOrder }) => (
    (loadOrder ?? []).map(stripOuterMarkdown)
  )));
  const extensionTargets = new Set(extensions.flatMap(({ reads }) => reads ?? []));
  const undeclaredSkillCalls = primaryCalls.filter((call) => (
    call.workflowStageKind === 'domain-skill'
    && !declaredTargets.has(readTargetFromCall(call))
    && !extensionTargets.has(readTargetFromCall(call))
  ));
  if (undeclaredSkillCalls.length > 0) {
    failures.push(`undeclared linked-resource read(s): ${undeclaredSkillCalls.map(readTargetFromCall).join(', ')}`);
  }
  if (extensions.length === 0) return failures;
  if (extensions.length > MAX_RESOURCE_EXTENSION_BATCHES) {
    failures.push(`linked-resource extension batches ${extensions.length} exceeded ${MAX_RESOURCE_EXTENSION_BATCHES}`);
  }
  const totalReads = extensions.reduce((count, extension) => count + (extension.reads?.length ?? 0), 0);
  if (totalReads > MAX_RESOURCE_EXTENSION_READS) {
    failures.push(`linked-resource extension reads ${totalReads} exceeded ${MAX_RESOURCE_EXTENSION_READS}`);
  }

  const firstExtensionEventIndex = extensions.at(0)?.eventIndex ?? Number.MAX_SAFE_INTEGER;
  const seenTargets = new Set(primaryCalls
    .filter((call) => (
      call.workflowStageKind === 'domain-skill'
      && declaredTargets.has(readTargetFromCall(call))
      && call.completed === true
      && call.isError === false
      && Number.isFinite(call.completionEventIndex)
      && call.completionEventIndex < firstExtensionEventIndex
    ))
    .map(readTargetFromCall));
  for (const [index, extension] of extensions.entries()) {
    const label = `linked-resource extension ${index + 1}`;
    if (extension.valid !== true || !extension.source || extension.reads.length === 0) {
      failures.push(`${label} declaration was malformed`);
      continue;
    }
    if (extension.firstVisibleContent !== true) {
      failures.push(`${label} was not the first nonempty visible text at byte 0`);
    }
    const batchCalls = primaryCalls
      .filter(({ assistantBatchIndex }) => assistantBatchIndex === extension.batchIndex)
      .sort(compareCallPositions);
    const actualTargets = batchCalls.map(readTargetFromCall);
    if (batchCalls.some((call) => (
      call.name !== 'read' || call.workflowStageKind !== 'domain-skill'
    ))) {
      failures.push(`${label} was not a resource-only domain Skill read batch`);
    }
    if (JSON.stringify(actualTargets) !== JSON.stringify(extension.reads)) {
      failures.push(`${label} calls were ${actualTargets.join(' -> ') || '<none>'}, expected ${extension.reads.join(' -> ')}`);
    }
    const sourceCalls = primaryCalls
      .filter((call) => (
        call.name === 'read'
        && readTargetFromCall(call) === extension.source
        && call.completed === true
        && call.isError === false
        && Number.isFinite(call.completionEventIndex)
        && call.completionEventIndex < extension.eventIndex
      ))
      .sort(compareCallPositions);
    const sourceCall = sourceCalls.at(-1);
    if (!sourceCall || sourceCall.workflowStageKind !== 'domain-skill') {
      failures.push(`${label} source was not loaded successfully before declaration: ${extension.source}`);
      continue;
    }
    const revealed = new Set(sourceCall.revealedSkillUris ?? []);
    const sourceNamespace = skillUriNamespace(extension.source);
    for (const uri of extension.reads) {
      if (uri === extension.source || seenTargets.has(uri)) {
        failures.push(`${label} repeated a linked-resource URI: ${uri}`);
      }
      if (WORKFLOW_REFERENCE_URI_PATTERN.test(uri)) {
        failures.push(`${label} attempted to treat a workflow reference as a linked Skill resource: ${uri}`);
      }
      if (!sourceNamespace || skillUriNamespace(uri) !== sourceNamespace) {
        failures.push(`${label} URI escaped loaded source namespace ${sourceNamespace || '<invalid>'}: ${uri}`);
      }
      if (!revealed.has(uri)) {
        failures.push(`${label} URI was not revealed by loaded source ${extension.source}: ${uri}`);
      }
      seenTargets.add(uri);
    }
  }

  for (const [phaseIndex, phase] of phases.entries()) {
    const phaseEnd = Number.isFinite(phase.readyEventIndex)
      ? phase.readyEventIndex
      : Number.MAX_SAFE_INTEGER;
    const phaseExtensions = extensions.filter(({ eventIndex }) => (
      eventIndex > phase.planEventIndex && eventIndex < phaseEnd
    ));
    const referenceCalls = primaryCalls.filter((call) => (
      call.workflowStageKind === 'workflow-reference'
      && call.eventIndex > phase.planEventIndex
      && call.eventIndex < phaseEnd
    ));
    if (phaseExtensions.length === 0) continue;
    const referenceBatchIndexes = new Set(referenceCalls.map(({ assistantBatchIndex }) => assistantBatchIndex));
    if (referenceCalls.length > 0 && referenceBatchIndexes.size !== 1) {
      failures.push(`workflow references after linked-resource extensions in phase ${phaseIndex + 1} were split across batches`);
    }
    const lastExtension = phaseExtensions.at(-1);
    if (referenceCalls.some((call) => (
      !Number.isFinite(call.eventIndex) || call.eventIndex <= lastExtension.eventIndex
    ))) {
      failures.push(`workflow reference read occurred before linked-resource phase ${phaseIndex + 1} finished`);
    }
  }
  return failures;
}

function workflowLoadOrderFailures(summary, workflowPreparation, expectations) {
  const failures = [];
  const declared = (workflowPreparation.workflowPlanDeclaration?.loadOrder ?? [])
    .map(stripOuterMarkdown);
  const executionDeclared = workflowPreparation.pendingLanguageTransition?.valid === true
    ? (workflowPreparation.workflowPlanPhases ?? []).flatMap(({ declaration }) => (
      (declaration?.loadOrder ?? []).map(stripOuterMarkdown)
    ))
    : declared;
  const required = Array.isArray(expectations.requiredWorkflowLoadOrder)
    ? expectations.requiredWorkflowLoadOrder.map(stripOuterMarkdown)
    : null;

  if (required && JSON.stringify(declared) !== JSON.stringify(required)) {
    failures.push(`WORKFLOW PLAN load order was ${declared.join(' -> ') || '<none>'}, expected ${required.join(' -> ') || '<none>'}`);
  }

  if (expectations.requireWorkflowResourceCallsMatchLoadOrder === true) {
    const extensionUris = new Set(workflowPreparation.resourceExtensionReadUris ?? []);
    const actual = [...(summary.toolCalls ?? [])]
      .filter((call) => (
        call.turnKind !== 'autolearn-capture'
        && (call.workflowStageKind === 'domain-skill'
          || call.workflowStageKind === 'workflow-reference')
        && !extensionUris.has(readTargetFromCall(call))
      ))
      .sort((left, right) => (
        numericSortValue(left.assistantBatchIndex) - numericSortValue(right.assistantBatchIndex)
        || numericSortValue(left.contentIndex) - numericSortValue(right.contentIndex)
        || numericSortValue(left.eventIndex) - numericSortValue(right.eventIndex)
      ))
      .map(readTargetFromCall);
    if (JSON.stringify(actual) !== JSON.stringify(executionDeclared)) {
      failures.push(`workflow resource call order was ${actual.join(' -> ') || '<none>'}, expected declared Load order ${executionDeclared.join(' -> ') || '<none>'}`);
    }
  }
  return failures;
}

function numericSortValue(value) {
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function isDomainSkillUri(value) {
  const normalized = stripOuterMarkdown(value);
  return /^skill:\/\/[^\s]+$/iu.test(normalized)
    && !WORKFLOW_INDEX_URI_PATTERN.test(normalized)
    && !WORKFLOW_REFERENCE_URI_PATTERN.test(normalized);
}

function isBareSkillId(value) {
  return /^[a-z0-9][a-z0-9._-]*$/iu.test(stripOuterMarkdown(value));
}

function workflowSelectionFailures(workflowPreparation, expectations) {
  const requiredPrimary = normalizeWorkflowId(expectations.requiredWorkflowPrimary);
  const requiredAddOns = normalizedWorkflowExpectationList(expectations.requiredWorkflowAddOns);
  const requiredSelected = normalizedWorkflowExpectationList(expectations.requiredSelectedWorkflowIds);
  const forbiddenSelected = normalizedWorkflowExpectationList(expectations.forbiddenSelectedWorkflowIds);
  if (!requiredPrimary
    && requiredAddOns.length === 0
    && requiredSelected.length === 0
    && forbiddenSelected.length === 0) {
    return [];
  }

  const stages = [{
    label: 'WORKFLOW PLAN',
    declaration: workflowPreparation.workflowPlanDeclaration ?? null,
  }];
  if (expectations.requireWorkflowReadyAfterLoadsBeforeProjectTools === true
    || workflowPreparation.workflowReadyDeclaration) {
    stages.push({
      label: 'WORKFLOW READY',
      declaration: workflowPreparation.workflowReadyDeclaration ?? null,
    });
  }

  const failures = [];
  for (const { label, declaration } of stages) {
    const primary = normalizeWorkflowId(declaration?.primary);
    const addOns = new Set(normalizedWorkflowExpectationList(declaration?.addOns));
    const selected = new Set(normalizedWorkflowExpectationList(declaration?.selectedWorkflowIds));
    if (requiredPrimary && primary !== requiredPrimary) {
      failures.push(`${label} primary was ${primary || '<none>'}, expected ${requiredPrimary}`);
    }
    for (const workflowId of requiredAddOns) {
      if (!addOns.has(workflowId)) {
        failures.push(`${label} did not declare required workflow add-on: ${workflowId}`);
      }
    }
    for (const workflowId of requiredSelected) {
      if (!selected.has(workflowId)) {
        failures.push(`${label} did not declare required selected workflow ID: ${workflowId}`);
      }
    }
    for (const workflowId of forbiddenSelected) {
      if (selected.has(workflowId)) {
        failures.push(`${label} declared forbidden selected workflow ID: ${workflowId}`);
      }
    }
  }
  return failures;
}

function normalizedWorkflowExpectationList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(normalizeWorkflowId).filter(Boolean))];
}

function markerBeforeCall(marker, call) {
  if (!marker || !call) return false;
  if (Number.isFinite(call.assistantBatchIndex)) {
    if (marker.batchIndex !== call.assistantBatchIndex) {
      return marker.batchIndex < call.assistantBatchIndex;
    }
    return Number.isFinite(call.contentIndex) && marker.contentIndex < call.contentIndex;
  }
  return Number.isFinite(call.eventIndex) && marker.eventIndex < call.eventIndex;
}

function markerBeforeMarker(left, right) {
  if (!left || !right) return false;
  if (left.batchIndex !== right.batchIndex) return left.batchIndex < right.batchIndex;
  if (left.contentIndex !== right.contentIndex) return left.contentIndex < right.contentIndex;
  return Number.isFinite(left.characterIndex)
    && Number.isFinite(right.characterIndex)
    && left.characterIndex < right.characterIndex;
}

function compareCallPositions(left, right) {
  const leftBatch = Number.isFinite(left.assistantBatchIndex)
    ? left.assistantBatchIndex
    : Number.POSITIVE_INFINITY;
  const rightBatch = Number.isFinite(right.assistantBatchIndex)
    ? right.assistantBatchIndex
    : Number.POSITIVE_INFINITY;
  if (leftBatch !== rightBatch) return leftBatch - rightBatch;
  return (left.contentIndex ?? Number.POSITIVE_INFINITY)
    - (right.contentIndex ?? Number.POSITIVE_INFINITY);
}

function isAgentArtifactReadCall(call) {
  return Boolean(agentArtifactTargetFromCall(call));
}

function agentArtifactTargetFromCall(call) {
  if (call?.name !== 'read') return '';
  return normalizeAgentArtifactUri(
    call.arguments?.path
    ?? call.arguments?.file_path
    ?? call.arguments?.uri
    ?? call.arguments?.value
    ?? '',
  );
}

function normalizeAgentArtifactUri(value) {
  const target = String(value ?? '').trim();
  if (!/^agent:\/\/[^\s<>"']+$/iu.test(target)) return '';
  return target.replace(/^agent:\/\//iu, 'agent://');
}

function agentArtifactPreviewsFromEvent(event) {
  const texts = [];
  const toolName = String(event?.toolName ?? event?.name ?? '').trim();
  if (event?.type === 'tool_execution_end'
    && toolName === 'hub'
    && event?.isError !== true
    && event?.result?.isError !== true) {
    texts.push(resultText(event.result));
  }

  const message = event?.type === 'session_custom' ? event.entry : event?.message;
  if (event?.type === 'message_end'
    && message?.role === 'toolResult'
    && String(message.toolName ?? '').trim() === 'hub'
    && message?.isError !== true) {
    texts.push(messageContentText(message.content));
  }
  if (message?.role === 'custom' && message?.customType === 'async-result') {
    texts.push(messageContentText(message.content));
  }

  const targets = [];
  for (const text of texts) {
    for (const match of String(text).matchAll(/<preview\b([^>]*)>/giu)) {
      const target = normalizeAgentArtifactUri(attributeValue(match[1], 'full-output'));
      if (target) targets.push(target);
    }
  }
  return [...new Set(targets)];
}

function messageContentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((item) => item?.type === 'text')
    .map((item) => String(item.text ?? ''))
    .join('\n');
}

function summarizeAgentArtifactReads(calls, previews) {
  const previewIndexesByTarget = new Map();
  for (const { target, eventIndex } of previews) {
    const indexes = previewIndexesByTarget.get(target) ?? [];
    indexes.push(eventIndex);
    previewIndexesByTarget.set(target, indexes);
  }

  const readsByTarget = new Map();
  const violations = [];
  const reads = calls.filter(isAgentArtifactReadCall);
  for (const call of reads) {
    const target = agentArtifactTargetFromCall(call);
    const readCount = (readsByTarget.get(target) ?? 0) + 1;
    readsByTarget.set(target, readCount);
    const previewIndexes = previewIndexesByTarget.get(target) ?? [];
    if (!previewIndexes.length) {
      violations.push({ target, eventIndex: call.eventIndex, reason: 'no-preview' });
    } else if (!previewIndexes.some((eventIndex) => eventIndex < call.eventIndex)) {
      violations.push({ target, eventIndex: call.eventIndex, reason: 'before-preview' });
    }
    if (readCount > 1) {
      violations.push({ target, eventIndex: call.eventIndex, reason: 'duplicate' });
    }
  }
  return { readCount: reads.length, violations };
}

function claimedSkillNames(text) {
  const names = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!/(?:loaded|read|used|applied|followed|加载|读取|使用|采用|遵循)/i.test(line)) continue;
    for (const match of line.matchAll(/skill:\/\/([a-z0-9][a-z0-9/_-]*(?:\.md)?)/gi)) {
      const resource = match[1].toLowerCase();
      if (resource.includes('/references/')) continue;
      names.push(normalizeSkillName(resource).split('/').at(-1));
    }
    for (const match of line.matchAll(/\bskills?\s*(?:named\s*)?[:：]?\s*[`'"]([a-z0-9][a-z0-9/_-]*)[`'"]/gi)) {
      names.push(normalizeSkillName(match[1].split('/').at(-1)));
    }
    for (const match of line.matchAll(/(?:加载|读取|使用|采用|遵循)(?:了)?\s*[`'"]([a-z0-9][a-z0-9/_-]*)[`'"]\s*(?:技能|skill)|\b(?:loaded|read|used|applied|followed)\s+(?:the\s+)?[`'"]([a-z0-9][a-z0-9/_-]*)[`'"]\s+skills?\b/gi)) {
      names.push(normalizeSkillName((match[1] ?? match[2]).split('/').at(-1)));
    }
    for (const listMatch of line.matchAll(/^\s*(?:[-*+]\s*)?(?:\*\*)?(?:loaded|used|applied|followed)\s+skills?(?:\*\*)?\s*[:：](?!\/\/)\s*([^.;]+)/gi)) {
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
    const nested = record?.job && typeof record.job === 'object' ? record.job : {};
    const rawId = record?.id ?? record?.jobId ?? nested.id ?? nested.jobId;
    const id = typeof rawId === 'string' ? rawId.trim() : '';
    if (!id) continue;
    const existing = jobs.get(id) ?? {};
    const deliveryText = normalizeDeliveryText(
      record?.deliveryText
      ?? record?.delivery
      ?? record?.output
      ?? record?.resultText
      ?? record?.result
      ?? nested?.deliveryText
      ?? nested?.delivery
      ?? nested?.output
      ?? nested?.resultText
      ?? nested?.result,
    );
    const status = normalizeJobStatus(record.status ?? record.state ?? nested.status ?? nested.state);
    jobs.set(id, {
      id,
      status: status === 'unobserved' ? existing.status ?? status : status,
      deliveryText: deliveryText || existing.deliveryText || '',
      deliverySource: String(record?.deliverySource ?? existing.deliverySource ?? '').trim() || null,
    });
  }
  return [...jobs.values()];
}

function normalizeDeliveryText(value, depth = 0) {
  if (depth > 4 || value == null) return '';
  if (typeof value === 'string') {
    return value
      .replace(/<\/?task-result\b[^>]*>/giu, ' ')
      .replace(/<\/?preview\b[^>]*>/giu, ' ')
      .replace(/\s+/gu, ' ')
      .trim();
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeDeliveryText(item, depth + 1))
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  if (typeof value !== 'object') return '';
  const candidates = [
    value.text,
    value.content,
    value.output,
    value.delivery,
    value.deliveryText,
    value.resultText,
    value.message,
    value.response,
    value.result,
    value.value,
    value.summary,
  ];
  return candidates
    .map((item) => normalizeDeliveryText(item, depth + 1))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function normalizeJobStatus(value) {
  const status = String(value ?? '').trim().toLowerCase();
  return status || 'unobserved';
}

function summarizeCommandResult(details, isError) {
  const exitCode = Number.isSafeInteger(details?.exitCode)
    ? details.exitCode
    : isError === false
      ? 0
      : null;
  return {
    exitCode,
    timedOut: details?.timedOut === true,
  };
}

function summarizeTddTrace(calls, projectRoot) {
  const mutationCalls = calls
    .filter(({ name, completed, isError }) => (
      ['edit', 'write'].includes(name) && completed === true && isError === false
    ))
    .map((call) => ({
      id: call.id,
      target: mutationTargetFromCall(call, projectRoot),
      eventIndex: call.eventIndex,
      completionEventIndex: call.completionEventIndex ?? null,
    }))
    .filter(({ target }) => Boolean(target));
  const commandCalls = calls
    .filter(({ name, arguments: args }) => name === 'bash' && typeof args?.command === 'string')
    .map((call) => ({
      id: call.id,
      command: call.arguments.command.trim(),
      exitCode: call.commandResult?.exitCode ?? null,
      eventIndex: call.eventIndex,
      completionEventIndex: call.completionEventIndex ?? null,
    }));
  return { mutationCalls, commandCalls };
}

function mutationTargetFromCall(call, projectRoot) {
  const resultTarget = mutationTargetFromResult(call.resultPreview);
  if (resultTarget) return projectRelativeMutationTarget(resultTarget, projectRoot);

  for (const value of [call.arguments?.path, call.arguments?.file, call.arguments?.filename]) {
    if (typeof value === 'string' && value.trim()) {
      return projectRelativeMutationTarget(value, projectRoot);
    }
  }
  const input = String(call.arguments?.input ?? '');
  const anchor = /^\[([^\]#]+)#[^\]]+\]/u.exec(input.trimStart());
  return anchor ? projectRelativeMutationTarget(anchor[1], projectRoot) : null;
}

function mutationTargetFromResult(resultPreview) {
  const anchor = /^\s*\[([^\]#]+)#[^\]]+\]/u.exec(String(resultPreview ?? ''));
  return anchor ? normalizeProjectPath(anchor[1]) : null;
}

function projectRelativeMutationTarget(target, projectRoot) {
  if (!target) return null;
  const normalizedTarget = normalizeProjectPath(target);
  if (!normalizedTarget) return null;

  if (typeof projectRoot !== 'string' || !projectRoot.trim()) {
    if (nodePath.isAbsolute(normalizedTarget) || /^[A-Za-z]:\//u.test(normalizedTarget)) return null;
    const normalizedRelative = nodePath.posix.normalize(normalizedTarget);
    if (normalizedRelative === '..' || normalizedRelative.startsWith('../')) return null;
    return normalizedRelative === '.' ? null : normalizedRelative;
  }

  const root = nodePath.resolve(projectRoot);
  const absoluteTarget = nodePath.isAbsolute(normalizedTarget)
    ? nodePath.resolve(normalizedTarget)
    : nodePath.resolve(root, normalizedTarget);
  const relative = nodePath.relative(root, absoluteTarget);
  if (!relative
    || relative === '..'
    || relative.startsWith(`..${nodePath.sep}`)
    || nodePath.isAbsolute(relative)) {
    return null;
  }
  return relative.split(nodePath.sep).join('/');
}

function normalizeProjectPath(value) {
  return String(value).trim().replaceAll('\\', '/').replace(/^\.\//u, '');
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
  const initializedItems = todoInitItems(latestInit?.arguments);
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
    initializedItems,
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

function todoInitItems(args) {
  if (!args || args.op !== 'init') return [];
  const items = Array.isArray(args.list)
    ? args.list.flatMap((phase) => (Array.isArray(phase?.items) ? phase.items : []))
    : Array.isArray(args.items) ? args.items : [];
  return items.map((item) => (
    typeof item === 'string'
      ? item.trim()
      : String(item?.text ?? item?.content ?? item?.task ?? item?.name ?? '').trim()
  )).filter(Boolean);
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
  const firstTaskCallIndex = calls.findIndex(({ name }) => name === 'task');
  const callsBeforeFirstTask = firstTaskCallIndex === -1
    ? calls
    : calls.slice(0, firstTaskCallIndex);
  const callsAfterFirstTask = firstTaskCallIndex === -1
    ? []
    : calls.slice(firstTaskCallIndex + 1);
  const projectInspectionCallCountBeforeFirstTask = callsBeforeFirstTask.filter((call) => (
    call.turnKind === 'user'
      && SOURCE_SEARCH_TOOLS.has(call.name)
      && !nonProjectResourceReadFromCall(call)
  )).length;
  const projectInspectionCallCountAfterFirstTask = callsAfterFirstTask.filter((call) => (
    call.turnKind === 'user'
      && SOURCE_SEARCH_TOOLS.has(call.name)
      && !nonProjectResourceReadFromCall(call)
  )).length;
  const assignments = taskCalls.flatMap((call) => taskAssignmentsFromCall(call));
  const batchCalls = taskCalls.filter(({ arguments: args }) => Array.isArray(args?.tasks));
  const multiForkBatchCalls = batchCalls.filter(({ arguments: args }) => args.tasks.length > 1);
  const agents = uniqueSorted(assignments.map(({ agent }) => agent).filter(Boolean));
  const workflows = uniqueSorted(assignments.flatMap(({ metadata }) => metadataItems(metadata.workflow)));
  const skills = uniqueSorted(assignments.flatMap(({ metadata }) => metadataItems(metadata.skills)));
  const submittedJobs = new Map();
  const updateJob = (job, eventIndex) => {
    const existing = submittedJobs.get(job.id) ?? {
      status: 'unobserved',
      completionEventIndex: null,
      deliveryText: '',
      deliveryEventIndex: null,
      deliverySource: null,
    };
    const observedStatus = normalizeJobStatus(job.status);
    const status = observedStatus === 'unobserved' ? existing.status : observedStatus;
    const deliveryText = normalizeDeliveryText(job.deliveryText);
    submittedJobs.set(job.id, {
      status,
      completionEventIndex: isTerminalJobStatus(status)
        ? eventIndex ?? existing.completionEventIndex
        : existing.completionEventIndex,
      deliveryText: deliveryText || existing.deliveryText,
      deliveryEventIndex: deliveryText
        ? eventIndex ?? existing.deliveryEventIndex
        : existing.deliveryEventIndex,
      deliverySource: deliveryText
        ? job.deliverySource ?? existing.deliverySource
        : existing.deliverySource,
    });
  };
  for (const call of taskCalls) {
    for (const job of call.taskResult?.jobs ?? []) {
      updateJob({ ...job, deliverySource: job.deliverySource ?? 'task-tool-result' }, call.completionEventIndex);
    }
  }
  for (const call of calls.filter(({ name }) => name === 'job')) {
    for (const job of call.jobResults ?? []) {
      if (submittedJobs.has(job.id)) {
        updateJob({ ...job, deliverySource: job.deliverySource ?? 'job-tool-result' }, call.completionEventIndex);
      }
    }
  }
  for (const job of asyncJobResults) {
    if (submittedJobs.has(job.id)) updateJob(job, job.eventIndex);
  }
  const jobStatuses = [...submittedJobs.entries()]
    .map(([id, record]) => ({ id, status: record.status }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const jobDeliveries = [...submittedJobs.entries()]
    .map(([id, record]) => ({
      id,
      status: record.status,
      text: record.deliveryText,
      eventIndex: record.deliveryEventIndex,
      source: record.deliverySource,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const assignment of assignments) {
    const job = submittedJobs.get(assignment.jobId);
    assignment.jobStatus = job?.status ?? 'unobserved';
    assignment.jobCompletionEventIndex = job?.completionEventIndex ?? null;
    assignment.deliveryText = job?.deliveryText ?? '';
    assignment.deliveryEventIndex = job?.deliveryEventIndex ?? null;
    assignment.deliverySource = job?.deliverySource ?? null;
  }
  const completedForkCount = jobStatuses.filter(({ status }) => status === 'completed').length;
  return {
    callCount: taskCalls.length,
    projectInspectionCallCountBeforeFirstTask,
    projectInspectionCallCountAfterFirstTask,
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
    jobDeliveries,
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
      const leadingText = takeCodePoints(item.task, 8_192);
      const exactMetadata = exactTaskAssignmentMetadata(leadingText);
      const metadata = exactMetadata ?? taskAssignmentMetadata(prefix);
      const missingMetadata = TASK_ASSIGNMENT_METADATA_FIELDS.filter((field) => !metadata[field]);
      const explicitNoneMetadata = ['todo', 'skills'].filter((field) => metadata[field] === 'none');
      return {
        callId: call.id,
        index,
        batch: isBatch,
        context: typeof args.context === 'string' ? args.context : null,
        name: typeof item.name === 'string' ? item.name : null,
        agent: typeof item.agent === 'string' ? item.agent : null,
        eventIndex: call.eventIndex,
        completionEventIndex: call.completionEventIndex ?? null,
        jobId: call.taskResult?.jobs?.length === items.length
          ? call.taskResult.jobs[index]?.id ?? null
          : items.length === 1 && call.taskResult?.jobs?.length === 1
            ? call.taskResult.jobs[0].id
            : null,
        prefix,
        prefixCharacterCount: [...prefix].length,
        hasExactMetadataPrefix: Boolean(exactMetadata),
        metadata,
        missingMetadata,
        explicitNoneMetadata,
        metadataComplete: missingMetadata.length === 0,
        completed: call.completed,
        successful: call.completed === true && call.isError === false,
      };
    });
}

function exactTaskAssignmentMetadata(leadingText) {
  const compact = /^\[workflow=([^\]\s]+)\s+step=([^\]]*?)\s+todo=([^\]]*?)\s+skills=([^\]]*?)\](?=$|\s)/iu.exec(
    String(leadingText ?? ''),
  );
  if (!compact) return null;
  return {
    workflow: normalizeMetadataValue(compact[1]),
    step: normalizeMetadataValue(compact[2]),
    todo: normalizeOptionalMetadataValue(compact[3]),
    skills: normalizeOptionalMetadataValue(compact[4]),
  };
}

function isTerminalJobStatus(status) {
  return ['completed', 'failed', 'cancelled', 'canceled', 'aborted'].includes(status);
}

function taskAssignmentMetadata(prefix) {
  const compact = String(prefix).match(/\[workflow=([^\]\s]+)\s+step=([^\]]*?)\s+todo=([^\]]*?)\s+skills=([^\]]*?)\]/iu);
  if (compact) {
    return {
      workflow: normalizeMetadataValue(compact[1]),
      step: normalizeMetadataValue(compact[2]),
      todo: normalizeOptionalMetadataValue(compact[3]),
      skills: normalizeOptionalMetadataValue(compact[4]),
    };
  }
  return {
    workflow: metadataValue(prefix, /(?:OMP[_ -]?WORKFLOW(?![_ -]?STEP)|WORKFLOW(?![_ -]?STEP))/iu),
    step: metadataValue(prefix, /(?:OMP[_ -]?WORKFLOW[_ -]?STEP|WORKFLOW[_ -]?STEP|STEP)/iu),
    todo: metadataValue(prefix, /(?:OMP[_ -]?TODO(?:[_ -]?ITEM)?|TODO(?:[_ -]?ITEM)?)/iu, { optional: true }),
    skills: metadataValue(prefix, /(?:OMP[_ -]?(?:REQUIRED[_ -]?)?SKILLS?|(?:REQUIRED[_ -]?)?SKILLS?(?:[_ -]?FOR[_ -]?THIS[_ -]?ROLE)?)/iu, { optional: true }),
  };
}

function metadataValue(text, labelPattern, { optional = false } = {}) {
  const match = new RegExp(`${labelPattern.source}\\s*[:=]\\s*([^\\n;|]{1,80})`, labelPattern.flags).exec(text);
  return optional ? normalizeOptionalMetadataValue(match?.[1]) : normalizeMetadataValue(match?.[1]);
}

function normalizeOptionalMetadataValue(value) {
  const normalized = String(value ?? '').trim();
  if (/^(?:none|n\/a)$/iu.test(normalized)) return 'none';
  return normalizeMetadataValue(normalized);
}

function normalizeMetadataValue(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || /^(?:unspecified|unknown|none|n\/a|pending)$/iu.test(normalized)) return null;
  return normalized;
}

function metadataItems(value) {
  return String(value ?? '')
    .split(/[\s,，+]+/u)
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
