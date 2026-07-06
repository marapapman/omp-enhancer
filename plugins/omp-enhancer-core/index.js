import {
  buildGovernancePromptFragment,
  buildMissingGateContext,
  buildSubagentPromptFragment,
  formatWorkflowGateBriefingForAssignment,
} from './src/governance.js';
import { routeNaturalLanguageTask } from './src/router.js';
import {
  normalizeSkillName,
  parseLoadedSkillEvidence,
  skillNamesEquivalent,
  skillReadNameCandidates,
  validateSkillUsage,
} from './src/skill-usage.js';
import { collectSubagentTaskRecords, parseSubagentUsageDetails, validateSubagentUsage } from './src/subagent-usage.js';
import { buildClassifierPrompt, resolveClassificationRoute } from './src/classifier.js';
import { ensureClassifierModelConfig, runClassifierCommand } from './src/classifier-config.js';
import {
  createLoopGuardState,
  readLoopGuardSnapshot,
  recordGeneratedText,
  recordLoopGuardProgress,
  serializeLoopGuardState,
  startLoopGuardRun,
  takeLoopRecoveryContext,
  buildLoopRecoveryContext,
} from './src/loop-guard.js';

const CORE_STATE_ENTRY = 'omp-enhancer-core.state';
const ASSISTANT_OUTPUT_EVENTS = [
  'assistant_delta',
  'assistant_message',
  'assistant_output',
  'response_delta',
  'response_output_delta',
  'message_update',
];
const SUBAGENT_STUCK_AFTER_MS = 10 * 60 * 1000;
const SUBAGENT_ACTIVE_STATUSES = new Set(['pending', 'running', 'started', 'in_progress', 'in-progress']);
const SUBAGENT_COMPLETED_STATUSES = new Set(['completed', 'complete', 'success', 'succeeded']);
const SUBAGENT_FAILED_STATUSES = new Set(['failed', 'failure', 'error', 'aborted', 'cancelled', 'canceled']);

export default function registerCoreEnhancer(pi) {
  const state = createState();
  const z = pi.zod?.z ?? pi.z;

  pi.setLabel?.('OMP Enhancer Core');

  pi.registerCommand?.('classifier', {
    description: 'Show or update modelRoles.classifier for OMP Enhancer routing.',
    async handler(args = '', ctx = {}) {
      const result = await runClassifierCommand({ args, ctx });
      await ctx.ui?.notify?.(result.text, result.ok ? 'info' : 'warn');
      return result;
    },
  });

  pi.registerTool({
    name: 'omp_core_route_task',
    label: 'Route OMP task',
    description: 'Classify a natural-language task and return the required OMP enhancer route, skills, tools, and agent.',
    parameters: z?.object ? z.object({ prompt: z.string() }) : undefined,
    execute: async (_callId, params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const route = routeNaturalLanguageTask({ prompt: params.prompt });
      setRouteState(state, route, params.prompt);
      await persistState(pi, state);
      return okResult(formatRoute(route), { route });
    },
  });

  pi.registerTool({
    name: 'omp_core_classifier_prompt',
    label: 'Build OMP classifier prompt',
    description: 'Build the strict JSON classifier prompt and schema for the configured classifier model role.',
    parameters: z?.object ? z.object({
      prompt: z.string(),
      modelRole: z.string().optional(),
      model: z.string().optional(),
      fallbackModelRole: z.string().optional(),
      fallbackModel: z.string().optional(),
    }) : undefined,
    execute: async (_callId, params = {}) => {
      const classifier = buildClassifierPrompt(params);
      return okResult(classifier.prompt, { classifier });
    },
  });

  pi.registerTool({
    name: 'omp_core_resolve_classification',
    label: 'Resolve OMP classifier output',
    description: 'Validate classifier JSON, map it through the route whitelist, and set the routed workflow state.',
    parameters: z?.object ? z.object({ prompt: z.string(), output: z.string() }) : undefined,
    execute: async (_callId, params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const result = resolveClassificationRoute({ prompt: params.prompt, output: params.output });
      setRouteState(state, result.route, params.prompt);
      await persistState(pi, state);
      return okResult(formatRoute(result.route), result);
    },
  });

  pi.registerTool({
    name: 'omp_core_validate_skill_usage',
    label: 'Validate routed skill usage',
    description: 'Validate that a routed agent output includes SKILL_USAGE with all required skills loaded.',
    parameters: z?.object ? z.object({ output: z.string(), requiredSkills: z.array(z.string()).optional() }) : undefined,
    execute: async (_callId, params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const requiredSkills = params.requiredSkills ?? state.lastRoute?.requiredSkills ?? [];
      const validation = validateSkillUsage({
        requiredSkills,
        output: params.output ?? '',
        loadedSkills: effectiveLoadedSkillsForValidation(state),
      });
      state.lastSkillUsage = validation;
      await persistState(pi, state);
      return okResult(validation.message, { validation });
    },
  });

  pi.registerTool({
    name: 'omp_core_validate_subagent_usage',
    label: 'Validate routed subagent usage',
    description: 'Preflight-check that routed output includes SUBAGENT_USAGE with all required subagents forked; final answers must still include the SUBAGENT_USAGE block in assistant text.',
    parameters: z?.object ? z.object({ output: z.string(), requiredSubagents: z.array(z.string()).optional() }) : undefined,
    execute: async (_callId, params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const requiredSubagents = params.requiredSubagents ?? state.lastRoute?.requiredSubagents ?? [];
      const validation = validateSubagentUsage({ requiredSubagents, output: params.output ?? '' });
      state.lastSubagentUsage = validation;
      if (validation.ok) recordSubagentFinalUsage(state, params.output ?? '');
      await persistState(pi, state);
      return okResult(validation.message, { validation });
    },
  });

  pi.registerTool({
    name: 'omp_core_subagent_status',
    label: 'Show routed task status',
    description: 'Report routed subagent gate state plus task-block progress captured from task tool calls and results.',
    parameters: z?.object ? z.object({}) : undefined,
    execute: async (_callId, _params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      return okResult(formatSubagentStatus(state), { status: buildSubagentStatus(state) });
    },
  });

  pi.registerTool({
    name: 'omp_core_governance_prompt',
    label: 'Build governance prompt',
    description: 'Build the governance prompt fragment for a natural-language OMP enhancer route.',
    parameters: z?.object ? z.object({ prompt: z.string().optional() }) : undefined,
    execute: async (_callId, params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const route = params.prompt ? routeNaturalLanguageTask({ prompt: params.prompt }) : state.lastRoute;
      if (params.prompt && route) {
        setRouteState(state, route, params.prompt);
        await persistState(pi, state);
      }
      const fragment = buildRoutedGovernanceContext(state, {
        route,
        parentTask: params.prompt ?? state.lastPrompt,
      });
      return okResult(fragment, { route, fragment });
    },
  });

  pi.on?.('session_start', async (_event = {}, ctx = {}) => {
    await ensureClassifierModelConfig({ ctx });
    const restored = restoreStateFromContext(state, ctx);
    if (!restored) resetState(state);
    return undefined;
  });

  for (const eventName of ASSISTANT_OUTPUT_EVENTS) {
    pi.on?.(eventName, async (event = {}, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const text = extractGeneratedOutputText(event);
      return await handleLoopGuardGeneratedOutput(pi, state, ctx, text);
    });
  }

  pi.on?.('before_agent_start', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    await ensureClassifierModelConfig({ ctx });
    const prompt = extractPrompt(event);
    // Slash commands are owned by OMP or by the registering plugin command handler.
    // Core routing only handles natural-language tasks.
    if (isSlashCommandPrompt(prompt)) return undefined;
    const recoveryContext = takeLoopRecoveryContext(state.loopGuard);
    if (recoveryContext) {
      if (event.systemPrompt) event.systemPrompt = `${event.systemPrompt}\n\n${recoveryContext}`;
      else event.additionalContext = [event.additionalContext, recoveryContext].filter(Boolean).join('\n\n');
      await persistState(pi, state);
      return { additionalContext: recoveryContext, route: state.lastRoute };
    }
    if (isInternalCoreContinuation(prompt)) return undefined;
    if (isSubagentLaunchPrompt(prompt)) {
      const fragment = buildSubagentPromptFragment({ prompt });
      if (event.systemPrompt) event.systemPrompt = `${event.systemPrompt}\n\n${fragment}`;
      else event.additionalContext = [event.additionalContext, fragment].filter(Boolean).join('\n\n');
      return { additionalContext: fragment, route: { intent: 'subagent', agent: null, requiredSkills: [], requiredTools: [], requiredSubagents: [] } };
    }
    const route = routeNaturalLanguageTask({ prompt });
    setRouteState(state, route, prompt);
    startLoopGuardRun(state.loopGuard, `${route.intent}:${state.routeStartedAt}`);
    await persistState(pi, state);
    const fragment = buildRoutedGovernanceContext(state, { route, parentTask: prompt });
    if (event.systemPrompt) event.systemPrompt = `${event.systemPrompt}\n\n${fragment}`;
    else event.additionalContext = [event.additionalContext, fragment].filter(Boolean).join('\n\n');
    return { additionalContext: fragment, route };
  });

  pi.on?.('tool_call', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    const name = toolEventName(event);
    if (name) recordLoopGuardProgress(state.loopGuard, `tool_call:${name}`);
    if (name === 'task') {
      const taskSkillBlock = buildTaskSubagentSkillGateBlock(state, event);
      if (taskSkillBlock) {
        await persistState(pi, state);
        return taskSkillBlock;
      }
      recordSubagentDispatchStarted(state, event);
    } else {
      const preworkBlock = buildPreworkSkillGateBlock(state, name);
      if (preworkBlock) {
        await persistState(pi, state);
        return preworkBlock;
      }
    }
    await persistState(pi, state);
    return undefined;
  });

  pi.on?.('tool_execution_update', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    if (toolEventName(event) !== 'task') return undefined;
    const updates = recordTaskExecutionUpdate(state, event);
    if (updates.some((update) => update.persist)) await persistState(pi, state);
    return undefined;
  });

  pi.on?.('tool_result', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    const name = toolEventName(event);
    if (name) recordLoopGuardProgress(state.loopGuard, `tool_result:${name}`);
    const successful = isSuccessfulToolEvent(event);
    if (name && successful && name !== 'read') clearToolFailures(state, name);
    if (name && !successful) recordToolFailure(state, name, event);
    if ((name === 'writing_quality_check' || name === 'writing_logic_check') && successful) state.evidence.writingQuality = true;
    if (name === 'omp_test_gate' && successful) state.evidence.testingGate = true;
    if (name === 'omp_test_report' && successful) state.evidence.testingReport = true;
    if (name === 'task') {
      recordTaskResult(state, event, { successful });
      recordSubagentDispatchFinished(state, event, { successful });
    }
    if (name === 'read' && successful) recordReadSkillEvidence(state, event);
    await persistState(pi, state);
    return undefined;
  });

  pi.on?.('session_stop', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    recordFinalOutputEvidence(state, event);
    reconcileSkillUsageFromReadEvidence(state);

    if (isBugAuditDeliveryComplete(state)) {
      await persistState(pi, state);
      return undefined;
    }

    const loopRecoveryContext = buildLoopRecoveryStopContext(state, event);
    if (loopRecoveryContext) {
      await persistState(pi, state);
      return { continue: true, additionalContext: loopRecoveryContext };
    }

    await persistState(pi, state);

    const missingSubagentContext = buildMissingSubagentUsageContext(state);
    if (missingSubagentContext) {
      return { continue: true, additionalContext: missingSubagentContext };
    }

    const missingGateContext = buildMissingGateContext({ route: state.lastRoute, state });
    if (missingGateContext) return { continue: true, additionalContext: missingGateContext };

    const missingSkillContext = buildMissingSkillUsageContext(state);
    if (missingSkillContext) return { continue: true, additionalContext: missingSkillContext };

    return undefined;
  });
}

export function createState() {
  return {
    lastRoute: null,
    lastPrompt: '',
    routeStartedAt: 0,
    lastSkillUsage: null,
    lastSubagentUsage: null,
    evidence: emptyEvidence(),
    loopGuard: createLoopGuardState(),
  };
}

function emptyEvidence() {
  return {
    writingQuality: false,
    writingLogic: false,
    testingGate: false,
    testingReport: false,
    deliveredBugAuditReport: false,
    taskToolCalls: 0,
    loadedSkills: new Set(),
    toolFailures: [],
    forkedSubagents: new Set(),
    taskSubagents: new Set(),
    pendingSubagents: new Map(),
    pendingSubagentCalls: new Map(),
    subagentSkills: new Map(),
    subagentLoadedSkills: new Map(),
    unexpectedSubagentSkills: new Map(),
    subagentAssignments: new Map(),
    taskProgress: new Map(),
    testAnalysis: null,
    testContext: null,
    testGate: null,
    testReport: null,
  };
}

function okResult(text, details = {}) {
  return {
    content: [{ type: 'text', text }],
    details,
    isError: false,
  };
}

function formatRoute(route) {
  return [
    `Intent: ${route.intent}`,
    `Agent route: ${route.agent ?? 'none'}`,
    route.auditMode ? `Audit mode: ${route.auditMode}` : null,
    `Required skills: ${route.requiredSkills.length ? route.requiredSkills.join(', ') : 'none'}`,
    `Required tools: ${route.requiredTools.length ? route.requiredTools.join(', ') : 'none'}`,
    `Required subagents: ${formatSubagents(route.requiredSubagents)}`,
  ].filter(Boolean).join('\n');
}

function formatSubagents(subagents = []) {
  if (!subagents.length) return 'none';
  return subagents.map(({ agent, duty, requiredSkills = [] }) => {
    const skills = requiredSkills.length ? `; skills: ${requiredSkills.join(', ')}` : '';
    return `${agent} (${duty}${skills})`;
  }).join(', ');
}

function setRouteState(state, route, prompt = '') {
  state.lastRoute = route;
  state.lastPrompt = String(prompt ?? '');
  state.routeStartedAt = Date.now();
  state.lastSkillUsage = null;
  state.lastSubagentUsage = null;
  state.evidence = emptyEvidence();
  state.loopGuard = createLoopGuardState();
}

function resetState(state) {
  state.lastRoute = null;
  state.lastPrompt = '';
  state.routeStartedAt = 0;
  state.lastSkillUsage = null;
  state.lastSubagentUsage = null;
  state.evidence = emptyEvidence();
  state.loopGuard = createLoopGuardState();
}

async function persistState(pi, state) {
  if (typeof pi.appendEntry !== 'function') return;
  try {
    await pi.appendEntry(CORE_STATE_ENTRY, serializeState(state));
  } catch {
    // State persistence is a recovery path for isolated tool/hook runtimes; never
    // let it turn an otherwise valid tool result into a host-level tool failure.
  }
}

function restoreStateFromContext(state, ctx = {}) {
  const entries = ctx.sessionManager?.getBranch?.();
  if (!Array.isArray(entries)) return false;
  const restored = restoreStateFromEntries(entries);
  if (!restored) return false;
  replaceState(state, restored.snapshot);
  recordReadSkillEvidenceFromEntries(state, entries, restored.routeStartIndex);
  return true;
}

function restoreStateFromEntries(entries) {
  let snapshot = null;
  let index = -1;
  for (const [entryIndex, entry] of entries.entries()) {
    if (!isCoreStateEntry(entry)) continue;
    const parsed = readStateSnapshot(entry.data);
    if (parsed) {
      snapshot = parsed;
      index = entryIndex;
    }
  }
  if (!snapshot) return null;
  return {
    snapshot,
    index,
    routeStartIndex: routeStartIndexFor(entries, snapshot.routeStartedAt, index),
  };
}

function isCoreStateEntry(entry) {
  return entry?.customType === CORE_STATE_ENTRY
    && (entry.type === undefined || entry.type === 'custom');
}

function routeStartIndexFor(entries, routeStartedAt, fallbackIndex) {
  if (!routeStartedAt) return fallbackIndex;
  for (const [index, entry] of entries.entries()) {
    if (!isCoreStateEntry(entry)) continue;
    const snapshot = readStateSnapshot(entry.data);
    if (snapshot?.routeStartedAt === routeStartedAt) return index;
  }
  return fallbackIndex;
}

function replaceState(target, source) {
  const liveLoopGuard = target.loopGuard;
  target.lastRoute = source.lastRoute;
  target.lastPrompt = source.lastPrompt ?? '';
  target.routeStartedAt = source.routeStartedAt;
  target.lastSkillUsage = source.lastSkillUsage;
  target.lastSubagentUsage = source.lastSubagentUsage;
  target.evidence = source.evidence;
  target.loopGuard = mergeLiveLoopGuardState(liveLoopGuard, source.loopGuard ?? createLoopGuardState());
}

function mergeLiveLoopGuardState(live, restored) {
  if (!live || !restored) return restored ?? createLoopGuardState();
  if (!live.currentRunId || live.currentRunId !== restored.currentRunId) return restored;
  if (restored.streamTriggered || restored.recoveryPending) return restored;

  return {
    ...restored,
    streamBuffer: live.streamBuffer || restored.streamBuffer || '',
    streamLineCarry: live.streamLineCarry || restored.streamLineCarry || '',
    recentBlockLines: Array.isArray(live.recentBlockLines) && live.recentBlockLines.length
      ? live.recentBlockLines
      : restored.recentBlockLines,
    recentBlockFingerprints: Array.isArray(live.recentBlockFingerprints) && live.recentBlockFingerprints.length
      ? live.recentBlockFingerprints
      : restored.recentBlockFingerprints,
    lastNonRepeatedSummary: live.lastNonRepeatedSummary || restored.lastNonRepeatedSummary || '',
  };
}

function serializeState(state) {
  return {
    lastRoute: state.lastRoute,
    lastPrompt: state.lastPrompt ?? '',
    routeStartedAt: state.routeStartedAt,
    lastSkillUsage: state.lastSkillUsage,
    lastSubagentUsage: state.lastSubagentUsage,
    loopGuard: serializeLoopGuardState(state.loopGuard),
    evidence: {
      writingQuality: state.evidence.writingQuality,
      writingLogic: state.evidence.writingLogic,
      testingGate: state.evidence.testingGate,
      testingReport: state.evidence.testingReport,
      deliveredBugAuditReport: state.evidence.deliveredBugAuditReport,
      taskToolCalls: state.evidence.taskToolCalls,
      loadedSkills: [...state.evidence.loadedSkills],
      toolFailures: state.evidence.toolFailures,
      forkedSubagents: [...state.evidence.forkedSubagents],
      taskSubagents: [...state.evidence.taskSubagents],
      pendingSubagents: [...state.evidence.pendingSubagents.entries()].map(([agent, pending]) => ({
        agent,
        startedAt: pending.startedAt,
        lastSeenAt: pending.lastSeenAt,
        attempts: pending.attempts,
        skills: [...pending.skills],
        texts: [...(pending.texts ?? [])],
      })),
      pendingSubagentCalls: [...state.evidence.pendingSubagentCalls.entries()].map(([id, agents]) => ({
        id,
        agents: [...agents],
      })),
      subagentSkills: [...state.evidence.subagentSkills.entries()].map(([agent, skills]) => ({
        agent,
        skills: [...skills],
      })),
      subagentLoadedSkills: [...state.evidence.subagentLoadedSkills.entries()].map(([agent, skills]) => ({
        agent,
        skills: [...skills],
      })),
      unexpectedSubagentSkills: [...state.evidence.unexpectedSubagentSkills.entries()].map(([agent, skills]) => ({
        agent,
        skills: [...skills],
      })),
      subagentAssignments: [...state.evidence.subagentAssignments.entries()].map(([agent, texts]) => ({
        agent,
        texts: [...texts],
      })),
      taskProgress: [...state.evidence.taskProgress.entries()].map(([key, progress]) => ({
        key,
        ...progress,
      })),
      testAnalysis: state.evidence.testAnalysis,
      testContext: state.evidence.testContext,
      testGate: state.evidence.testGate,
      testReport: state.evidence.testReport,
    },
  };
}

function readStateSnapshot(value) {
  if (!isRecord(value)) return null;
  const evidence = readEvidenceSnapshot(value.evidence);
  if (!evidence) return null;
  return {
    lastRoute: isRecord(value.lastRoute) ? value.lastRoute : null,
    lastPrompt: isString(value.lastPrompt) ? value.lastPrompt : '',
    routeStartedAt: Number.isFinite(value.routeStartedAt) ? value.routeStartedAt : 0,
    lastSkillUsage: isRecord(value.lastSkillUsage) ? value.lastSkillUsage : null,
    lastSubagentUsage: isRecord(value.lastSubagentUsage) ? value.lastSubagentUsage : null,
    loopGuard: readLoopGuardSnapshot(value.loopGuard),
    evidence,
  };
}

function readEvidenceSnapshot(value) {
  if (!isRecord(value)) return null;
  return {
    writingQuality: value.writingQuality === true,
    writingLogic: value.writingLogic === true,
    testingGate: value.testingGate === true,
    testingReport: value.testingReport === true,
    deliveredBugAuditReport: value.deliveredBugAuditReport === true,
    taskToolCalls: Number.isInteger(value.taskToolCalls) ? value.taskToolCalls : 0,
    loadedSkills: new Set(Array.isArray(value.loadedSkills) ? value.loadedSkills.filter(isString) : []),
    toolFailures: readToolFailures(value.toolFailures),
    forkedSubagents: new Set(Array.isArray(value.forkedSubagents) ? value.forkedSubagents.filter(isString) : []),
    taskSubagents: new Set(Array.isArray(value.taskSubagents) ? value.taskSubagents.filter(isString) : []),
    pendingSubagents: readPendingSubagents(value.pendingSubagents),
    pendingSubagentCalls: readPendingSubagentCalls(value.pendingSubagentCalls),
    subagentSkills: readSubagentSkills(value.subagentSkills),
    subagentLoadedSkills: readSubagentSkills(value.subagentLoadedSkills),
    unexpectedSubagentSkills: readSubagentSkills(value.unexpectedSubagentSkills),
    subagentAssignments: readSubagentAssignments(value.subagentAssignments),
    taskProgress: readTaskProgress(value.taskProgress),
    testAnalysis: isRecord(value.testAnalysis) ? value.testAnalysis : null,
    testContext: isRecord(value.testContext) ? value.testContext : null,
    testGate: isRecord(value.testGate) ? value.testGate : null,
    testReport: isRecord(value.testReport) ? value.testReport : null,
  };
}

function readPendingSubagents(value) {
  const pending = new Map();
  if (!Array.isArray(value)) return pending;
  for (const item of value) {
    if (!isRecord(item) || typeof item.agent !== 'string') continue;
    pending.set(item.agent, {
      startedAt: Number.isFinite(item.startedAt) ? item.startedAt : 0,
      lastSeenAt: Number.isFinite(item.lastSeenAt) ? item.lastSeenAt : 0,
      attempts: Number.isInteger(item.attempts) ? item.attempts : 1,
      skills: new Set(Array.isArray(item.skills) ? item.skills.filter(isString) : []),
      texts: new Set(Array.isArray(item.texts) ? item.texts.filter(isString) : []),
    });
  }
  return pending;
}

function readPendingSubagentCalls(value) {
  const calls = new Map();
  if (!Array.isArray(value)) return calls;
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string') continue;
    calls.set(item.id, new Set(Array.isArray(item.agents) ? item.agents.filter(isString) : []));
  }
  return calls;
}

function readSubagentSkills(value) {
  const skills = new Map();
  if (!Array.isArray(value)) return skills;
  for (const item of value) {
    if (!isRecord(item) || typeof item.agent !== 'string') continue;
    skills.set(item.agent, new Set(Array.isArray(item.skills) ? item.skills.filter(isString) : []));
  }
  return skills;
}

function readSubagentAssignments(value) {
  const assignments = new Map();
  if (!Array.isArray(value)) return assignments;
  for (const item of value) {
    if (!isRecord(item) || typeof item.agent !== 'string') continue;
    assignments.set(item.agent, new Set(Array.isArray(item.texts) ? item.texts.filter(isString) : []));
  }
  return assignments;
}

function readTaskProgress(value) {
  const progress = new Map();
  if (!Array.isArray(value)) return progress;
  for (const item of value) {
    if (!isRecord(item) || typeof item.key !== 'string') continue;
    const id = isString(item.id) ? item.id : item.key;
    progress.set(item.key, {
      id,
      status: normalizeSubagentStatus(item.status),
      text: isString(item.text) ? item.text : '',
      summary: isString(item.summary) ? item.summary : '',
      subagentCount: Number.isFinite(item.subagentCount) ? item.subagentCount : 0,
      runningCount: Number.isFinite(item.runningCount) ? item.runningCount : 0,
      completedCount: Number.isFinite(item.completedCount) ? item.completedCount : 0,
      failedCount: Number.isFinite(item.failedCount) ? item.failedCount : 0,
      toolCount: Number.isFinite(item.toolCount) ? item.toolCount : 0,
      requests: Number.isFinite(item.requests) ? item.requests : 0,
      tokens: Number.isFinite(item.tokens) ? item.tokens : 0,
      contextTokens: Number.isFinite(item.contextTokens) ? item.contextTokens : 0,
      contextWindow: Number.isFinite(item.contextWindow) ? item.contextWindow : 0,
      cost: Number.isFinite(item.cost) ? item.cost : 0,
      durationMs: Number.isFinite(item.durationMs) ? item.durationMs : 0,
      models: Array.isArray(item.models) ? item.models.filter(isString) : [],
      currentTool: isString(item.currentTool) ? item.currentTool : '',
      lastTool: isString(item.lastTool) ? item.lastTool : '',
      toolDetail: isString(item.toolDetail) ? item.toolDetail : '',
      startedAt: Number.isFinite(item.startedAt) ? item.startedAt : 0,
      updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0,
    });
  }
  return progress;
}

function readToolFailures(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((item) => {
    if (typeof item.tool !== 'string') return [];
    const failure = { tool: item.tool };
    if (typeof item.message === 'string') failure.message = item.message;
    if (typeof item.summary === 'string') failure.summary = item.summary;
    if (typeof item.repairHint === 'string') failure.repairHint = item.repairHint;
    return [failure];
  });
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value) {
  return typeof value === 'string';
}

function extractPrompt(event) {
  return String(event.prompt ?? event.userPrompt ?? event.message ?? event.task ?? '');
}

function toolEventName(event = {}) {
  return event.name ?? event.toolName ?? event.details?.toolName ?? event.tool?.name ?? event.tool?.toolName;
}

function toolEventCallId(event = {}) {
  return cleanToolCallId(
    event.callId
      ?? event.call_id
      ?? event.toolCallId
      ?? event.tool_call_id
      ?? event.id
      ?? event.toolCall?.id
      ?? event.tool_call?.id
      ?? event.details?.callId
      ?? event.details?.call_id
      ?? event.details?.toolCallId
      ?? event.details?.tool_call_id
      ?? event.details?.id
      ?? event.details?.toolCall?.id
      ?? event.details?.tool_call?.id,
  );
}

function cleanToolCallId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function isInternalCoreContinuation(prompt) {
  return prompt.includes('OMP Enhancer Core')
    && prompt.includes('gate is still open');
}

function isSlashCommandPrompt(prompt) {
  return /^\/[A-Za-z][A-Za-z0-9:_-]*(?:\s|$)/.test(String(prompt ?? '').trim());
}

function isSubagentLaunchPrompt(prompt) {
  return /OMP_REQUIRED_SUBAGENT:/i.test(prompt)
    || /Required skills for this subagent:/i.test(prompt);
}

function buildMissingSkillUsageContext(state) {
  const requiredSkills = state.lastRoute?.requiredSkills ?? [];
  if (!requiredSkills.length) return null;
  if (state.lastSkillUsage?.ok) return null;
  const failureContext = formatRecentToolFailures(state, ['read', 'omp_core_validate_skill_usage']);
  const requiredSubagents = subagentRequirements(state.lastRoute?.requiredSubagents);

  if (requiredSubagents.length) {
    return [
      'OMP Enhancer Core skill gate is still open.',
      `Validate SKILL_USAGE before finishing. Required skills: ${requiredSkills.join(', ')}.`,
      'Delegated recovery order: make the task subagents use their required skills and report SKILL_USAGE Loaded evidence, or rerun the missing task subagents with the required skill contracts attached. Then call omp_core_validate_skill_usage with output set to the combined final evidence.',
      'Do not repair delegated task skill gaps by repeatedly reading those skills in the main agent. The main agent should read skills only for direct main-agent work tools it uses itself.',
      failureContext,
      state.lastSkillUsage?.message ? `Last validation: ${state.lastSkillUsage.message}` : 'No successful SKILL_USAGE validation has been recorded.',
    ].filter(Boolean).join('\n');
  }

  return [
    'OMP Enhancer Core skill gate is still open.',
    `Validate SKILL_USAGE before finishing. Required skills: ${requiredSkills.join(', ')}.`,
    'Recovery order: in this same continuation, read each missing required skill with `skill://<skill-name>`, wait for those read results, then call omp_core_validate_skill_usage with output set to the full SKILL_USAGE response text.',
    'If your previous final response already included SKILL_USAGE, call omp_core_validate_skill_usage with output set to that full response text. Do not only say the evidence was already provided.',
    failureContext,
    state.lastSkillUsage?.message ? `Last validation: ${state.lastSkillUsage.message}` : 'No successful SKILL_USAGE validation has been recorded.',
  ].filter(Boolean).join('\n');
}

function buildRoutedGovernanceContext(state, { route, parentTask = '' } = {}) {
  return [
    buildModelRoutingCheckpointBlock({ route, parentTask }),
    buildPreworkSkillBootstrapBlock(state),
    buildGovernancePromptFragment({ route, parentTask }),
  ].filter(Boolean).join('\n\n');
}

function buildModelRoutingCheckpointBlock({ route, parentTask = '' } = {}) {
  if (!route || route.intent === 'subagent') return null;
  return [
    '### OMP Enhancer Core model routing checkpoint',
    `Initial deterministic route: ${route.intent}.`,
    'The deterministic route is a fallback, not a lock. Before loading skills, using QA tools, or forking task subagents, check whether the user task clearly fits a different OMP workflow.',
    'If the route looks wrong or ambiguous, produce classifier JSON with the allowed classifier schema and call `omp_core_resolve_classification` using the original user task. The resolved classifier route supersedes this initial route for skills, tools, gates, and subagents.',
    'Do not continue under a route that would obviously trigger the wrong workflow gate.',
    parentTask ? `Original user task: ${String(parentTask).slice(0, 500)}` : null,
  ].filter(Boolean).join('\n');
}

function buildPreworkSkillBootstrapBlock(state) {
  const requiredSubagents = subagentRequirements(state.lastRoute?.requiredSubagents);
  const missing = missingReadSkills(state);
  const parentTask = state.lastPrompt;
  if (!requiredSubagents.length && !missing.length) return null;

  if (requiredSubagents.length) {
    return [
      '### OMP Enhancer Core pre-work skill bootstrap',
      'Actor-specific skill rule: task subagents load subagent skills; the main agent loads skills only for direct main-agent work.',
      'Before calling task, put the matching subagent skill contract into each task assignment. Do not read root route skills in the main agent just to unlock task.',
      'Required task assignment contracts:',
      ...requiredSubagents.flatMap((subagent) => formatSubagentSkillAssignmentStep(subagent, { parentTask, route: state.lastRoute })),
      missing.length ? 'For direct main-agent work tools only, read missing root skills before using edit, write, bash, QA, or test gates:' : null,
      ...(missing.length ? missing.map(formatMissingSkillReadStep) : []),
    ].filter(Boolean).join('\n');
  }

  if (isFocusedBugAuditRoute(state.lastRoute)) {
    return [
      '### OMP Enhancer Core focused audit skill preflight',
      'This route is a focused direct bug audit. Do not fork the heavy bug-audit subagent set unless the user broadens the task.',
      'Before calling omp_test_* gates, bash, edit, write, or other direct work tools, read each focused audit skill and wait for the results:',
      ...missing.map(formatMissingSkillReadStep),
      'After the skill reads return, run the bounded audit directly, then call omp_test_gate and include SKILL_USAGE in the final evidence.',
      'If a required skill cannot be read, report that blocker instead of continuing with the audit.',
    ].join('\n');
  }

  return [
    '### OMP Enhancer Core pre-work skill bootstrap',
    'Before calling direct main-agent work tools, load the required root skills for this routed task.',
    'Call the read tool once for each missing skill now, using these exact URIs:',
    ...missing.map(formatMissingSkillReadStep),
    'Wait for those read results to return before calling edit, write, bash, QA, or test gates.',
    'If any required skill cannot be read, report that blocker instead of continuing with the work.',
  ].join('\n');
}

function isFocusedBugAuditRoute(route) {
  return route?.intent === 'bug-audit' && route.auditMode === 'focused';
}

function buildPreworkSkillGateBlock(state, toolName) {
  if (!isPreworkSkillGateTool(toolName, state.lastRoute)) return null;
  const missing = missingReadSkills(state);
  if (!missing.length) return null;

  return {
    block: true,
    reason: [
      `OMP Enhancer Core pre-work main-agent skill gate blocked ${toolName}.`,
      `Read all required skills before using this direct main-agent work tool. Missing skills: ${missing.join(', ')}.`,
      'Required recovery order:',
      ...missing.map(formatMissingSkillReadStep),
      `After those read results return, retry ${toolName}. If you are forking task subagents instead, put the skills into the task assignments rather than reading them in the main agent.`,
    ].join('\n'),
  };
}

function buildTaskSubagentSkillGateBlock(state, event = {}) {
  const requiredSubagents = subagentRequirements(state.lastRoute?.requiredSubagents);
  if (!requiredSubagents.length) return null;

  const requiredByAgent = new Map(requiredSubagents.map((item) => [item.agent, item.requiredSkills]));
  let records = collectSubagentTaskRecords(event);
  if (!records.length) {
    return taskSubagentSkillBlock([
      'OMP Enhancer Core task subagent skill gate blocked task.',
      'This routed task must fork named subagents and attach their skill contracts in the task assignment.',
      `Required subagents: ${formatRequiredSubagents(requiredSubagents)}.`,
      'Add one of these contracts to each task item before retrying:',
      ...requiredSubagents.flatMap((subagent) => formatSubagentSkillAssignmentStep(subagent, { parentTask: state.lastPrompt, route: state.lastRoute })),
    ]);
  }

  if (repairTaskSubagentAssignmentContracts(state, event, requiredSubagents, records)) {
    records = collectSubagentTaskRecords(event);
  }

  const unexpectedAgents = records
    .map(({ agent }) => agent)
    .filter((agent) => !requiredByAgent.has(agent));
  const missingSkillAssignments = records.flatMap(({ agent, skills = [] }) => {
    const requiredSkills = requiredByAgent.get(agent);
    if (!requiredSkills) return [];
    const missing = requiredSkills.filter((skill) => !skills.some((loadedSkill) => skillNamesEquivalent(skill, loadedSkill)));
    return missing.length ? [{ agent, skills: missing }] : [];
  });
  const missingParentTaskAssignments = state.lastRoute?.intent === 'bug-audit'
    ? records
      .filter(({ agent, text = '' }) => requiredByAgent.has(agent) && !hasParentTaskMarker(text))
      .map(({ agent }) => agent)
    : [];
  const unexpectedSkillAssignments = records.flatMap(({ agent, skills = [] }) => {
    const requiredSkills = requiredByAgent.get(agent);
    if (!requiredSkills) return [];
    const unexpected = skills.filter((skill) => !requiredSkills.some((requiredSkill) => skillNamesEquivalent(requiredSkill, skill)));
    return unexpected.length ? [{ agent, skills: unexpected }] : [];
  });

  if (!unexpectedAgents.length && !missingSkillAssignments.length && !missingParentTaskAssignments.length && !unexpectedSkillAssignments.length) return null;

  return taskSubagentSkillBlock([
    'OMP Enhancer Core task subagent skill gate blocked task.',
    'Repair the task assignment, not the main-agent read state. Each task subagent must carry its own required skills before fork.',
    unexpectedAgents.length ? `Unexpected task subagents: ${uniqueValues(unexpectedAgents).join(', ')}.` : null,
    missingSkillAssignments.length ? `Missing subagent skill assignments: ${formatMissingSkillAssignments(missingSkillAssignments)}.` : null,
    missingParentTaskAssignments.length ? `Missing bug-audit parent task context: ${uniqueValues(missingParentTaskAssignments).join(', ')}.` : null,
    unexpectedSkillAssignments.length ? `Unexpected subagent skill assignments: ${formatMissingSkillAssignments(unexpectedSkillAssignments)}.` : null,
    'Required task assignment contracts:',
    ...requiredSubagents.flatMap((subagent) => formatSubagentSkillAssignmentStep(subagent, { parentTask: state.lastPrompt, route: state.lastRoute })),
  ]);
}

function repairTaskSubagentAssignmentContracts(state, event, requiredSubagents, records) {
  const requiredByAgent = new Map(requiredSubagents.map((item) => [item.agent, item]));
  const recordByAgent = new Map(records.map((record) => [record.agent, record]));
  if ([...recordByAgent.keys()].some((agent) => !requiredByAgent.has(agent))) return false;
  if (records.some(({ agent, skills = [] }) => {
    const requiredSkills = requiredByAgent.get(agent)?.requiredSkills ?? [];
    return skills.some((skill) => !requiredSkills.some((requiredSkill) => skillNamesEquivalent(requiredSkill, skill)));
  })) return false;

  let repaired = false;
  for (const item of mutableTaskItems(event)) {
    const agent = inferRepairableTaskAgent(item, requiredByAgent);
    if (!agent) continue;
    const required = requiredByAgent.get(agent);
    const currentText = taskAssignmentText(item);
    const requiredSkills = required.requiredSkills ?? [];
    const hasAllSkills = requiredSkills.every((skill) => {
      const recorded = recordByAgent.get(agent)?.skills ?? [];
      return recorded.some((loadedSkill) => skillNamesEquivalent(skill, loadedSkill)) || textMentionsEquivalentSkill(currentText, skill);
    });
    const needsParent = state.lastRoute?.intent === 'bug-audit' && !hasParentTaskMarker(currentText);
    const needsContract = !hasRequiredSubagentMarker(currentText, agent) || !hasAllSkills || needsParent;
    if (!needsContract) continue;

    setTaskAssignmentText(item, prependSubagentAssignmentContract({
      agent,
      requiredSkills,
      parentTask: state.lastPrompt,
      route: state.lastRoute,
      currentText,
    }));
    repaired = true;
  }
  return repaired;
}

function mutableTaskItems(event = {}) {
  const items = [];
  const seen = new Set();
  const roots = [
    event,
    event.params,
    event.arguments,
    event.args,
    event.input,
    event.request,
    event.details,
  ].filter(Boolean);
  for (const root of roots) collectMutableTaskItems(root, items, seen);
  return items;
}

function collectMutableTaskItems(value, items, seen) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) collectMutableTaskItems(item, items, seen);
    return;
  }

  if (Array.isArray(value.tasks)) {
    for (const task of value.tasks) {
      if (task && typeof task === 'object' && !Array.isArray(task)) items.push(task);
    }
  }

  for (const [key, nested] of Object.entries(value)) {
    if (key === 'tasks') continue;
    collectMutableTaskItems(nested, items, seen);
  }
}

function inferRepairableTaskAgent(item, requiredByAgent) {
  const marker = parseRequiredSubagentMarker(taskAssignmentText(item));
  if (marker && requiredByAgent.has(marker)) return marker;

  for (const key of ['agent', 'subagent', 'subagent_type', 'subagentType']) {
    const agent = normalizeTaskAgent(item[key]);
    if (agent && requiredByAgent.has(agent)) return agent;
  }

  const role = normalizeTaskAgent(item.role);
  if (role && requiredByAgent.has(role)) return role;
  return '';
}

function taskAssignmentText(item) {
  return [item.assignment, item.prompt, item.description]
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value) => typeof value === 'string')
    .join('\n');
}

function setTaskAssignmentText(item, text) {
  if ('assignment' in item || !('prompt' in item)) item.assignment = text;
  else item.prompt = text;
}

function prependSubagentAssignmentContract({ agent, requiredSkills = [], parentTask = '', route = null, currentText = '' }) {
  const cleaned = cleanText(currentText);
  const workflowBriefing = formatWorkflowGateBriefingForAssignment(route);
  return [
    `OMP_REQUIRED_SUBAGENT: ${agent}`,
    `OMP_PARENT_TASK: ${formatParentTaskForAssignment(parentTask)}`,
    workflowBriefing || null,
    'Required skills for this subagent:',
    ...(requiredSkills.length ? requiredSkills.map((skill) => `- ${skill}`) : ['- none']),
    '',
    cleaned ? 'Assignment:' : null,
    cleaned || null,
  ].filter(Boolean).join('\n');
}

function parseRequiredSubagentMarker(text = '') {
  const match = String(text).match(/(?:^|\n)\s*OMP_REQUIRED_SUBAGENT:\s*([^\r\n]+)/i);
  return match ? normalizeTaskAgent(match[1]) : '';
}

function hasRequiredSubagentMarker(text = '', agent = '') {
  return parseRequiredSubagentMarker(text) === agent;
}

function normalizeTaskAgent(value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[:(].*$/, '').trim();
}

function taskSubagentSkillBlock(lines) {
  return {
    block: true,
    reason: lines.filter(Boolean).join('\n'),
  };
}

function formatSubagentSkillAssignmentStep({ agent, requiredSkills = [] }, { parentTask = '', route = null } = {}) {
  const workflowBriefing = formatWorkflowGateBriefingForAssignment(route);
  return [
    `- ${agent}:`,
    `  OMP_REQUIRED_SUBAGENT: ${agent}`,
    `  OMP_PARENT_TASK: ${formatParentTaskForAssignment(parentTask)}`,
    ...(workflowBriefing ? indentLines(workflowBriefing, '  ') : []),
    '  Required skills for this subagent:',
    ...(requiredSkills.length ? requiredSkills.map((skill) => `  - ${skill}`) : ['  - none']),
  ];
}

function indentLines(text = '', prefix = '') {
  return String(text).split(/\r?\n/).map((line) => `${prefix}${line}`);
}

function formatParentTaskForAssignment(parentTask = '') {
  const cleaned = String(parentTask).replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, 300) : '<copy the original user task here>';
}

function formatMissingSkillReadStep(skill) {
  const [primary] = skillReadNameCandidates(skill);
  if (!primary || primary === skill) return `- read skill://${skill}`;
  return `- read skill://${primary} (accepted for ${skill})`;
}

function isPreworkSkillGateTool(toolName, route) {
  if (!toolName || !route || route.intent === 'unknown') return false;
  if (toolName === 'task') return false;
  if (!(route.requiredSkills ?? []).length) return false;
  if (isSkillGateExemptTool(toolName)) return false;
  if ((route.requiredTools ?? []).includes(toolName)) return true;
  return genericWorkToolsRequiringSkills().has(toolName);
}

function isSkillGateExemptTool(toolName) {
  return toolName === 'read'
    || toolName.startsWith('omp_core_')
    || toolName === 'search'
    || toolName === 'glob'
    || toolName === 'grep'
    || toolName === 'rg'
    || toolName === 'list'
    || toolName === 'ls';
}

function genericWorkToolsRequiringSkills() {
  return new Set([
    'edit',
    'write',
    'patch',
    'apply_patch',
    'bash',
    'shell',
    'terminal',
    'run',
    'run_command',
    'python',
    'node',
  ]);
}

function missingReadSkills(state) {
  const loaded = [...state.evidence.loadedSkills];
  return (state.lastRoute?.requiredSkills ?? [])
    .filter((skill) => !loaded.some((loadedSkill) => skillNamesEquivalent(skill, loadedSkill)));
}

function recordFinalOutputEvidence(state, event = {}) {
  const output = extractFinalOutputText(event);
  if (!output) return;

  if (state.lastRoute?.intent === 'bug-audit' && isDeliverableBugAuditReport(output)) {
    state.evidence.deliveredBugAuditReport = true;
  }

  const requiredSkills = state.lastRoute?.requiredSkills ?? [];
  if (requiredSkills.length && !state.lastSkillUsage?.ok && hasLoadedSkillEvidence(output)) {
    state.lastSkillUsage = validateSkillUsage({
      requiredSkills,
      output,
      loadedSkills: effectiveLoadedSkillsForValidation(state),
    });
  }

  const requiredSubagents = subagentRequirements(state.lastRoute?.requiredSubagents);
  if (requiredSubagents.length && !state.lastSubagentUsage?.ok && /\bSUBAGENT_USAGE\b/i.test(output)) {
    state.lastSubagentUsage = validateSubagentUsage({ requiredSubagents, output });
    if (state.lastSubagentUsage.ok) recordSubagentFinalUsage(state, output);
  }
}

function isBugAuditDeliveryComplete(state) {
  return state.lastRoute?.intent === 'bug-audit' && state.evidence.deliveredBugAuditReport === true;
}

function hasLoadedSkillEvidence(output = '') {
  return /\bSKILL_USAGE\b/i.test(String(output)) || parseLoadedSkillEvidence(output).length > 0;
}

function isDeliverableBugAuditReport(output = '') {
  const text = String(output);
  const hasReportHeading = /\bBUG[- ]AUDIT[- ]REPORT\b/i.test(text)
    || /\bbug audit report\b/i.test(text)
    || /(?:bug|问题|缺陷).*(?:报告|清单)/i.test(text);
  const hasBugSubject = /\b(?:bugs?|issues?|findings?|defects?)\b/i.test(text)
    || /(?:bug|问题|缺陷)/i.test(text);
  const hasConfirmedEvidence = /\bRED(?:-|\s)?confirmed\b/i.test(text)
    || /\bconfirmed\b[^.\n]*(?:bug|issue|finding|defect)\b/i.test(text)
    || /\b(?:bug|issue|finding|defect)s?\b[^.\n]*\bconfirmed\b/i.test(text)
    || /\bfailing test\b/i.test(text)
    || /(?:已验证|已确认|确认).*(?:bug|问题|缺陷)/.test(text)
    || /\bRED\b/.test(text);
  return hasReportHeading && hasBugSubject && hasConfirmedEvidence;
}

function buildLoopRecoveryStopContext(state, event = {}) {
  if (state.loopGuard.recoveryPending) return takeLoopRecoveryContext(state.loopGuard);
  const output = extractFinalOutputText(event);
  if (!output) return null;
  const detection = recordGeneratedText(state.loopGuard, output, { flushIncompleteLine: true });
  if (!detection.repeated) return null;
  return takeLoopRecoveryContext(state.loopGuard);
}

async function handleLoopGuardGeneratedOutput(pi, state, ctx = {}, text = '') {
  if (state.loopGuard.streamTriggered) return undefined;
  if (!text) return undefined;
  const detection = recordGeneratedText(state.loopGuard, text);
  if (!detection.repeated) return undefined;

  await persistState(pi, state);
  const additionalContext = buildLoopRecoveryContext(state.loopGuard);
  await ctx.ui?.notify?.('OMP Enhancer Core stopped a repeated main-agent generation.', 'warn');
  try {
    ctx.abort?.();
  } catch {
    // Stream abort is best-effort; return the structured result for hosts that
    // honor handler return values.
  }
  return {
    abort: true,
    reason: `OMP Enhancer Core loop guard: ${detection.reason}`,
    additionalContext,
    details: { loopGuard: detection },
  };
}

function reconcileSkillUsageFromReadEvidence(state) {
  const requiredSkills = state.lastRoute?.requiredSkills ?? [];
  const loadedSkills = effectiveLoadedSkillsForValidation(state);
  if (!requiredSkills.length || state.lastSkillUsage?.ok || !loadedSkills.length) return;
  state.lastSkillUsage = validateSkillUsage({
    requiredSkills,
    output: '',
    loadedSkills,
  });
}

function effectiveLoadedSkillsForValidation(state) {
  return uniqueValues([
    ...state.evidence.loadedSkills,
    ...delegatedLoadedSkills(state),
  ]);
}

function delegatedLoadedSkills(state) {
  const requiredSubagents = subagentRequirements(state.lastRoute?.requiredSubagents);
  const loaded = [];
  for (const { agent, requiredSkills } of requiredSubagents) {
    const recorded = [...(state.evidence.subagentLoadedSkills.get(agent) ?? new Set())];
    for (const skill of requiredSkills) {
      if (recorded.some((loadedSkill) => skillNamesEquivalent(skill, loadedSkill))) loaded.push(skill);
    }
  }
  return loaded;
}

function extractGeneratedOutputText(event = {}) {
  const assistantDelta = extractAssistantMessageDelta(event);
  if (assistantDelta) return assistantDelta;
  if (event.assistantMessageEvent || event.details?.assistantMessageEvent) return '';

  const candidates = [
    event.delta,
    event.chunk,
    event.token,
    event.text,
    event.outputText,
    event.message,
    event.content,
    event.output,
    event.response,
    event.result,
    event.details?.delta,
    event.details?.chunk,
    event.details?.token,
    event.details?.text,
    event.details?.outputText,
    event.details?.message,
    event.details?.content,
    event.details?.output,
    event.details?.response,
    event.details?.result,
  ];

  return candidates
    .flatMap((candidate) => collectTextCandidates(candidate))
    .map((text) => text.trim())
    .filter(Boolean)
    .join('\n');
}

function extractFinalOutputText(event = {}) {
  const finalAssistantMessage = extractFinalAssistantMessage(event);
  const candidates = [
    event.output,
    event.response,
    event.text,
    finalAssistantMessage ?? event.message,
    event.finalMessage,
    event.finalResponse,
    event.finalOutput,
    event.content,
    event.result,
    event.details?.output,
    event.details?.response,
    event.details?.text,
    event.details?.message,
    event.details?.content,
  ];

  return candidates
    .flatMap((candidate) => collectTextCandidates(candidate))
    .map((text) => text.trim())
    .filter(Boolean)
    .join('\n\n');
}

function extractAssistantMessageDelta(event = {}) {
  const assistantEvent = event.assistantMessageEvent ?? event.details?.assistantMessageEvent;
  if (!isRecord(assistantEvent)) return '';
  if (assistantEvent.type && assistantEvent.type !== 'text_delta' && assistantEvent.type !== 'thinking_delta') return '';
  return typeof assistantEvent.delta === 'string' ? assistantEvent.delta : '';
}

function extractFinalAssistantMessage(event = {}) {
  const direct = [
    event.last_assistant_message,
    event.lastAssistantMessage,
    event.assistant_message,
    event.assistantMessage,
    event.assistantResponse,
    event.details?.last_assistant_message,
    event.details?.lastAssistantMessage,
    event.details?.assistant_message,
    event.details?.assistantMessage,
    event.details?.assistantResponse,
  ].find(Boolean);
  if (direct) return direct;

  const messages = Array.isArray(event.messages)
    ? event.messages
    : Array.isArray(event.details?.messages)
      ? event.details.messages
      : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'assistant') return message;
  }
  return null;
}

function collectTextCandidates(value, seen = new Set()) {
  if (typeof value === 'string') return [value];
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectTextCandidates(item, seen));
  if (typeof value !== 'object') return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const texts = [];
  if (typeof value.text === 'string') texts.push(value.text);
  if (typeof value.output_text === 'string') texts.push(value.output_text);
  if (typeof value.value === 'string') texts.push(value.value);
  for (const key of ['content', 'message', 'output', 'response', 'result']) {
    texts.push(...collectTextCandidates(value[key], seen));
  }
  return texts;
}

function buildMissingSubagentUsageContext(state) {
  const requiredSubagents = subagentRequirements(state.lastRoute?.requiredSubagents);
  if (!requiredSubagents.length) return null;

  const taskForked = state.evidence.taskSubagents ?? new Set();
  const pending = pendingRequiredSubagents(state, requiredSubagents);
  const stuck = stuckRequiredSubagents(state, requiredSubagents);
  const pendingAgents = new Set(pending.map(({ agent }) => agent));
  const missing = requiredSubagents.map(({ agent }) => agent).filter((agent) => !taskForked.has(agent) && !pendingAgents.has(agent));
  const missingSkillAssignments = requiredSubagents.flatMap(({ agent, requiredSkills }) => {
    const recorded = state.evidence.subagentSkills.get(agent) ?? new Set();
    const missingSkills = requiredSkills.filter((skill) => !recorded.has(skill));
    return missingSkills.length ? [{ agent, skills: missingSkills }] : [];
  });
  const missingAssignmentContext = missingSubagentAssignmentContext(state, requiredSubagents);
  const unexpectedSkillAssignments = requiredSubagents.flatMap(({ agent }) => {
    const unexpected = [...(state.evidence.unexpectedSubagentSkills.get(agent) ?? new Set())];
    return unexpected.length ? [{ agent, skills: unexpected }] : [];
  });

  const failureContext = formatRecentToolFailures(state, ['task']);
  if (!missing.length && !missingSkillAssignments.length && !missingAssignmentContext.length && !unexpectedSkillAssignments.length && !pending.length && !stuck.length && !failureContext) return null;

  return [
    'OMP Enhancer Core subagent gate is still open.',
    'Fork the required roles with the OMP task tool before doing or finishing routed work so OMP can render native subagent status lines, and include each role-specific skill list in the task prompt.',
    `Required subagents: ${formatRequiredSubagents(requiredSubagents)}.`,
    pending.length ? `Pending subagent task results: ${formatPendingSubagents(pending)}.` : null,
    stuck.length ? `Potentially stuck subagent tasks: ${formatPendingSubagents(stuck)}. Do not wait indefinitely; retry those task calls with smaller assignments or report BLOCKERS if they keep failing.` : null,
    missing.length ? `Missing task-launched subagents: ${missing.join(', ')}.` : null,
    missingSkillAssignments.length ? `Missing subagent skill assignments: ${formatMissingSkillAssignments(missingSkillAssignments)}.` : null,
    missingAssignmentContext.length ? `Missing bug-audit assignment context: ${missingAssignmentContext.join(', ')}. Re-run those task calls with OMP_PARENT_TASK and a concrete bug-audit assignment inherited from the user request.` : null,
    unexpectedSkillAssignments.length ? `Unexpected subagent skill assignments: ${formatMissingSkillAssignments(unexpectedSkillAssignments)}.` : null,
    failureContext,
    'Final-answer contract: close with the actual SUBAGENT_USAGE block in assistant output; do not send it only as omp_core_validate_subagent_usage output.',
    state.lastSubagentUsage?.message
      ? `Last validation: ${state.lastSubagentUsage.message}`
      : 'No successful SUBAGENT_USAGE validation has been recorded. SUBAGENT_USAGE is final evidence only; task-tool role evidence is still required for native TUI status.',
  ].filter(Boolean).join('\n');
}

function missingSubagentAssignmentContext(state, requiredSubagents) {
  if (state.lastRoute?.intent !== 'bug-audit') return [];
  return requiredSubagents
    .map(({ agent }) => agent)
    .filter((agent) => !subagentAssignmentTexts(state, agent).some(hasParentTaskMarker));
}

function subagentAssignmentTexts(state, agent) {
  const completed = [...(state.evidence.subagentAssignments.get(agent) ?? new Set())];
  const pending = [...(state.evidence.pendingSubagents.get(agent)?.texts ?? new Set())];
  return [...completed, ...pending].filter(Boolean);
}

function hasParentTaskMarker(text = '') {
  return /OMP_PARENT_TASK:\s*\S/i.test(String(text));
}

function recordTaskExecutionUpdate(state, event = {}) {
  const update = recordTaskProgress(state, event, { status: 'running', source: 'tool_execution_update' });
  return update ? [update] : [];
}

function recordTaskResult(state, event = {}, { successful } = {}) {
  return recordTaskProgress(state, event, {
    status: successful ? 'completed' : 'failed',
    source: 'tool_result',
  });
}

function recordTaskDispatchStarted(state, event = {}, { dispatchId = '', records = [], startedAt = Date.now() } = {}) {
  const id = cleanToolCallId(dispatchId) || cleanProgressId(event.id) || `task-call-${state.evidence.taskToolCalls}`;
  const previous = state.evidence.taskProgress.get(id);
  const text = summarizeTaskCallInput(event, records);
  state.evidence.taskProgress.set(id, {
    ...previous,
    key: id,
    id,
    status: 'running',
    text,
    summary: text || `${records.length || 1} task item${records.length === 1 ? '' : 's'} dispatched`,
    subagentCount: records.length,
    runningCount: records.length,
    completedCount: 0,
    failedCount: 0,
    toolCount: previous?.toolCount ?? 0,
    requests: previous?.requests ?? 0,
    tokens: previous?.tokens ?? 0,
    contextTokens: previous?.contextTokens ?? 0,
    contextWindow: previous?.contextWindow ?? 0,
    cost: previous?.cost ?? 0,
    durationMs: previous?.durationMs ?? 0,
    models: previous?.models ?? [],
    currentTool: previous?.currentTool ?? '',
    lastTool: previous?.lastTool ?? '',
    toolDetail: previous?.toolDetail ?? '',
    startedAt: previous?.startedAt ?? startedAt,
    updatedAt: startedAt,
    source: 'tool_call',
  });
}

function recordTaskProgress(state, event = {}, { status = '', source = '' } = {}) {
  const normalized = normalizeTaskProgress(event, { status, source });
  if (!normalized.id) return null;

  const previous = state.evidence.taskProgress.get(normalized.key);
  const current = {
    ...previous,
    ...normalized,
    startedAt: previous?.startedAt ?? normalized.startedAt,
  };
  state.evidence.taskProgress.set(normalized.key, current);

  const statusChanged = !previous || previous.status !== current.status;
  const toolChanged = previous?.currentTool !== current.currentTool || previous?.lastTool !== current.lastTool;
  const statsChanged = previous
    ? previous.summary !== current.summary
      || previous.text !== current.text
      || previous.subagentCount !== current.subagentCount
      || previous.runningCount !== current.runningCount
      || previous.completedCount !== current.completedCount
      || previous.failedCount !== current.failedCount
      || previous.toolCount !== current.toolCount
      || previous.requests !== current.requests
      || previous.tokens !== current.tokens
      || previous.contextTokens !== current.contextTokens
      || previous.contextWindow !== current.contextWindow
      || previous.cost !== current.cost
      || previous.durationMs !== current.durationMs
      || previous.models.join('\n') !== current.models.join('\n')
      || previous.toolDetail !== current.toolDetail
    : true;
  return {
    previous,
    current,
    persist: statusChanged || toolChanged || statsChanged,
    notify: statusChanged || toolChanged || (!previous && Boolean(current.id)),
  };
}

function normalizeTaskProgress(event = {}, { status = '', source = '' } = {}) {
  const id = cleanToolCallId(toolEventCallId(event)) || cleanProgressId(event.id ?? event.toolCallId ?? event.callId);
  const details = extractTaskDetails(event);
  const progressItems = Array.isArray(details.progress) ? details.progress.filter(isRecord) : [];
  const resultItems = Array.isArray(details.results) ? details.results.filter(isRecord) : [];
  const items = progressItems.length ? progressItems : resultItems;
  const statuses = items.map(taskItemStatus).filter(Boolean);
  const resolvedStatus = normalizeTaskStatus(details.async?.state || status, statuses, resultItems);
  const text = extractTaskBlockText(event);
  const models = uniqueStrings(items.map(resolveProgressModel).filter(Boolean));
  const tool = resolveTaskTool(items);
  const updatedAt = eventTimestamp(event);

  return {
    key: id,
    id,
    status: resolvedStatus,
    text,
    summary: summarizeTaskBlock({ text, details, items, status: resolvedStatus }),
    subagentCount: items.length,
    runningCount: statuses.filter(isActiveSubagentStatus).length,
    completedCount: statuses.filter(isCompletedSubagentStatus).length,
    failedCount: statuses.filter(isFailedSubagentStatus).length,
    toolCount: sumMetric(items, 'toolCount'),
    requests: sumMetric(items, 'requests'),
    tokens: sumMetric(items, 'tokens'),
    contextTokens: maxMetric(items, 'contextTokens'),
    contextWindow: maxMetric(items, 'contextWindow'),
    cost: taskCost(details, items),
    durationMs: Number.isFinite(details.totalDurationMs) ? details.totalDurationMs : maxMetric(items, 'durationMs'),
    models,
    currentTool: tool.currentTool,
    lastTool: tool.lastTool,
    toolDetail: tool.toolDetail,
    startedAt: updatedAt,
    updatedAt,
    source,
  };
}

function extractTaskDetails(event = {}) {
  const candidates = [
    event.partialResult?.details,
    event.result?.details,
    event.details,
    event.partialResult,
    event.result,
  ];
  return candidates.find(isRecord) ?? {};
}

function extractTaskBlockText(event = {}) {
  const candidates = [
    event.partialResult?.content,
    event.result?.content,
    event.content,
    event.partialResult?.text,
    event.result?.text,
    event.text,
  ];
  return candidates
    .flatMap((candidate) => collectTextCandidates(candidate))
    .map((text) => cleanText(text))
    .filter(Boolean)
    .join('\n');
}

function taskItemStatus(item = {}) {
  if (typeof item.status === 'string') return normalizeSubagentStatus(item.status);
  if (item.aborted === true) return 'aborted';
  if (Number.isFinite(item.exitCode)) return item.exitCode === 0 ? 'completed' : 'failed';
  return '';
}

function normalizeTaskStatus(value = '', itemStatuses = [], results = []) {
  const direct = typeof value === 'string' && value.trim() ? normalizeSubagentStatus(value) : '';
  if (['running', 'completed', 'failed', 'aborted'].includes(direct)) return direct;
  if (itemStatuses.some(isFailedSubagentStatus)) return 'failed';
  if (itemStatuses.some(isActiveSubagentStatus)) return 'running';
  if (itemStatuses.length && itemStatuses.every(isCompletedSubagentStatus)) return 'completed';
  if (results.length) return results.every((item) => taskItemStatus(item) === 'completed') ? 'completed' : 'failed';
  return 'running';
}

function summarizeTaskBlock({ text = '', details = {}, items = [], status = '' } = {}) {
  const line = text.split(/\r?\n/).map((value) => value.trim()).find(Boolean);
  if (line) return truncateText(line, 120);
  if (details.async?.jobId) return `async ${details.async.state ?? status} ${details.async.jobId}`;
  if (items.length) return `${items.length} task item${items.length === 1 ? '' : 's'} ${status}`;
  return status || 'task update';
}

function resolveTaskTool(items = []) {
  const current = items.find((item) => cleanText(item.currentTool));
  if (current) {
    return {
      currentTool: cleanText(current.currentTool),
      lastTool: '',
      toolDetail: resolveProgressToolDetail(current),
    };
  }
  for (const item of items) {
    const lastTool = resolveLastProgressTool(item, '');
    if (lastTool) {
      return {
        currentTool: '',
        lastTool,
        toolDetail: resolveProgressToolDetail(item),
      };
    }
  }
  return { currentTool: '', lastTool: '', toolDetail: '' };
}

function sumMetric(items = [], key) {
  return items.reduce((total, item) => total + finiteMetric(item[key]), 0);
}

function maxMetric(items = [], key) {
  return items.reduce((max, item) => Math.max(max, finiteMetric(item[key])), 0);
}

function taskCost(details = {}, items = []) {
  const direct = finiteCost(details.usage?.cost?.total ?? details.cost);
  if (direct) return direct;
  return items.reduce((total, item) => total + finiteCost(item.cost ?? item.usage?.cost?.total), 0);
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => cleanText(value)).filter(Boolean))];
}

function summarizeTaskCallInput(event = {}, records = []) {
  const names = records.map(({ agent }) => agent).filter(Boolean);
  if (names.length) return `dispatch ${names.join(', ')}`;
  const input = event.input ?? event.args ?? event.parameters ?? {};
  const text = collectTextCandidates(input).map((value) => cleanText(value)).find(Boolean);
  return text ? truncateText(text, 120) : 'dispatch task';
}

function finiteMetric(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function finiteCost(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function resolveLastProgressTool(progress = {}, currentTool = '') {
  const direct = cleanText(progress.lastTool ?? progress.last_tool);
  if (direct) return direct;
  const recent = Array.isArray(progress.recentTools) ? progress.recentTools : [];
  for (const item of recent) {
    const tool = cleanText(isRecord(item) ? item.tool ?? item.name : item);
    if (tool) return tool;
  }
  return currentTool;
}

function resolveProgressToolDetail(progress = {}) {
  const direct = cleanText(progress.toolDetail ?? progress.tool_detail ?? progress.lastIntent);
  if (direct) return direct;
  const currentArgs = cleanText(progress.currentToolArgs ?? progress.current_tool_args);
  if (currentArgs) return currentArgs;
  const recent = Array.isArray(progress.recentTools) ? progress.recentTools : [];
  for (const item of recent) {
    const args = cleanText(isRecord(item) ? item.args ?? item.detail : '');
    if (args) return args;
  }
  return '';
}

function resolveProgressModel(progress = {}) {
  const value = progress.resolvedModel ?? progress.model ?? progress.modelOverride;
  if (Array.isArray(value)) return value.filter(isString).map((item) => item.trim()).filter(Boolean).join(', ');
  if (isRecord(value)) {
    const provider = cleanText(value.provider);
    const id = cleanText(value.id ?? value.model ?? value.modelID ?? value.modelId);
    if (provider && id) return `${provider}/${id}`;
    return id || cleanText(value.name);
  }
  return cleanText(value);
}

function cleanProgressId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function cleanAgentName(value) {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .replace(/^`+|`+$/g, '')
    .replace(/^(agent|role|subagent)\s*[:=]\s*/i, '')
    .replace(/[.;,，。]+$/, '')
    .replace(/\s+\(.+\)$/, '')
    .trim();
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function truncateText(value = '', max = 120) {
  const text = cleanText(value).replace(/\s+/g, ' ');
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function normalizeSubagentStatus(value) {
  const status = typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : 'running';
  if (status === 'in_progress') return 'running';
  if (status === 'in-progress') return 'running';
  if (status === 'started') return 'running';
  if (status === 'complete') return 'completed';
  if (status === 'success' || status === 'succeeded') return 'completed';
  if (status === 'failure' || status === 'error') return 'failed';
  if (status === 'cancelled' || status === 'canceled') return 'aborted';
  return status;
}

function isActiveSubagentStatus(status) {
  return SUBAGENT_ACTIVE_STATUSES.has(status);
}

function isCompletedSubagentStatus(status) {
  return SUBAGENT_COMPLETED_STATUSES.has(status);
}

function isFailedSubagentStatus(status) {
  return SUBAGENT_FAILED_STATUSES.has(status);
}

function touchPendingSubagent(state, { agent, skills = [], text = '' }, startedAt, lastSeenAt = startedAt) {
  const current = state.evidence.pendingSubagents.get(agent);
  const nextSkills = new Set(current?.skills ?? []);
  for (const skill of skills) nextSkills.add(skill);
  const nextTexts = new Set(current?.texts ?? []);
  if (text) nextTexts.add(text);
  state.evidence.pendingSubagents.set(agent, {
    startedAt: current?.startedAt ?? startedAt,
    lastSeenAt,
    attempts: current?.attempts ?? 1,
    skills: nextSkills,
    texts: nextTexts,
  });
}

function recordSubagentDispatchStarted(state, event) {
  state.evidence.taskToolCalls += 1;
  const startedAt = eventTimestamp(event);
  const records = collectSubagentTaskRecords(event);
  const dispatchId = toolEventCallId(event) || `task-call-${state.evidence.taskToolCalls}`;
  recordTaskDispatchStarted(state, event, { dispatchId, records, startedAt });
  for (const record of records) {
    recordPendingSubagent(state, record, startedAt);
  }
  recordPendingSubagentCall(state, dispatchId, records);
  return records;
}

function recordSubagentDispatchFinished(state, event, { successful }) {
  const { records, dispatchId } = subagentRecordsForToolResult(state, event);
  if (!successful) {
    clearPendingSubagentsForResult(state, { records, dispatchId });
    return records;
  }

  for (const record of records) recordCompletedSubagent(state, record);
  clearPendingSubagentCallRecords(state, { records, dispatchId });
  return records;
}

function recordPendingSubagent(state, { agent, skills = [], text = '' }, startedAt) {
  const current = state.evidence.pendingSubagents.get(agent);
  const nextSkills = new Set(current?.skills ?? []);
  for (const skill of skills) nextSkills.add(skill);
  const nextTexts = new Set(current?.texts ?? []);
  if (text) nextTexts.add(text);
  state.evidence.pendingSubagents.set(agent, {
    startedAt: current?.startedAt ?? startedAt,
    lastSeenAt: startedAt,
    attempts: (current?.attempts ?? 0) + 1,
    skills: nextSkills,
    texts: nextTexts,
  });
}

function recordPendingSubagentCall(state, dispatchId, records) {
  if (!dispatchId || !records.length) return;
  const agents = state.evidence.pendingSubagentCalls.get(dispatchId) ?? new Set();
  for (const { agent } of records) agents.add(agent);
  state.evidence.pendingSubagentCalls.set(dispatchId, agents);
}

function recordCompletedSubagent(state, { agent, text = '', skills = [] }) {
  const pending = state.evidence.pendingSubagents.get(agent);
  const mergedSkills = new Set(pending?.skills ?? []);
  for (const skill of skills) mergedSkills.add(skill);
  const mergedTexts = new Set(pending?.texts ?? []);
  if (text) mergedTexts.add(text);

  state.evidence.pendingSubagents.delete(agent);
  state.evidence.forkedSubagents.add(agent);
  state.evidence.taskSubagents.add(agent);
  recordSubagentAssignmentEvidence(state, { agent, texts: [...mergedTexts] });
  recordSubagentSkillEvidence(state, { agent, text, skills: [...mergedSkills] });
  recordSubagentLoadedSkillEvidence(state, { agent, texts: [...mergedTexts] });
}

function recordSubagentFinalUsage(state, output) {
  for (const { agent, skills = [] } of parseSubagentUsageDetails(output)) {
    state.evidence.pendingSubagents.delete(agent);
    state.evidence.forkedSubagents.add(agent);
    recordSubagentSkillEvidence(state, { agent, skills });
  }
}

function recordSubagentAssignmentEvidence(state, { agent, texts = [] }) {
  const recorded = state.evidence.subagentAssignments.get(agent) ?? new Set();
  for (const text of texts) {
    const cleaned = cleanText(text);
    if (cleaned) recorded.add(cleaned);
  }
  state.evidence.subagentAssignments.set(agent, recorded);
}

function recordSubagentSkillEvidence(state, { agent, text = '', skills = [] }) {
  const requiredByAgent = new Map(subagentRequirements(state.lastRoute?.requiredSubagents).map((item) => [item.agent, item.requiredSkills]));
  const requiredSkills = requiredByAgent.get(agent) ?? [];
  const unexpectedSkills = skills.filter((skill) => !requiredSkills.some((requiredSkill) => skillNamesEquivalent(requiredSkill, skill)));
  if (unexpectedSkills.length) {
    const recordedUnexpected = state.evidence.unexpectedSubagentSkills.get(agent) ?? new Set();
    for (const skill of unexpectedSkills) recordedUnexpected.add(skill);
    state.evidence.unexpectedSubagentSkills.set(agent, recordedUnexpected);
  }
  if (!requiredSkills.length) return;

  const recorded = state.evidence.subagentSkills.get(agent) ?? new Set();
  for (const skill of requiredSkills) {
    if (skills.some((loadedSkill) => skillNamesEquivalent(skill, loadedSkill)) || textMentionsEquivalentSkill(text, skill)) {
      recorded.add(skill);
    }
  }
  state.evidence.subagentSkills.set(agent, recorded);
}

function recordSubagentLoadedSkillEvidence(state, { agent, texts = [] }) {
  const requiredByAgent = new Map(subagentRequirements(state.lastRoute?.requiredSubagents).map((item) => [item.agent, item.requiredSkills]));
  const requiredSkills = requiredByAgent.get(agent) ?? [];
  if (!requiredSkills.length) return;

  const loadedEntries = texts.flatMap((text) => parseLoadedSkillEvidence(text));
  if (!loadedEntries.length) return;

  const recorded = state.evidence.subagentLoadedSkills.get(agent) ?? new Set();
  for (const skill of requiredSkills) {
    if (loadedEntries.some((loadedSkill) => skillNamesEquivalent(skill, loadedSkill))) recorded.add(skill);
  }
  state.evidence.subagentLoadedSkills.set(agent, recorded);
}

function textMentionsEquivalentSkill(text = '', requiredSkill = '') {
  const lower = String(text).toLowerCase();
  if (!lower) return false;
  return [requiredSkill, ...skillReadNameCandidates(requiredSkill, { limit: 8 })]
    .filter(Boolean)
    .some((candidate) => lower.includes(String(candidate).toLowerCase()));
}

function subagentRecordsForToolResult(state, event) {
  const resultText = extractTaskBlockText(event);
  const records = collectSubagentTaskRecords(event);
  const explicitDispatchId = toolEventCallId(event);
  if (records.length) return { records: attachToolResultText(records, resultText), dispatchId: explicitDispatchId };

  const dispatchId = explicitDispatchId && state.evidence.pendingSubagentCalls.has(explicitDispatchId)
    ? explicitDispatchId
    : firstPendingSubagentCallId(state);
  if (dispatchId) return { records: attachToolResultText(pendingRecordsForCall(state, dispatchId), resultText), dispatchId };

  return { records: attachToolResultText(pendingRecords(state), resultText), dispatchId: null };
}

function attachToolResultText(records = [], resultText = '') {
  const cleaned = cleanText(resultText);
  if (!cleaned) return records;
  return records.map((record) => ({
    ...record,
    text: [record.text, cleaned].filter(Boolean).join('\n'),
  }));
}

function firstPendingSubagentCallId(state) {
  return state.evidence.pendingSubagentCalls.keys().next().value ?? null;
}

function pendingRecordsForCall(state, dispatchId) {
  return [...(state.evidence.pendingSubagentCalls.get(dispatchId) ?? [])]
    .map((agent) => {
      const pending = state.evidence.pendingSubagents.get(agent);
      return pending ? { agent, skills: [...pending.skills], text: [...(pending.texts ?? [])].join('\n') } : { agent, skills: [] };
    });
}

function clearPendingSubagentsForResult(state, { records = [], dispatchId = null } = {}) {
  const agents = records.length ? records.map(({ agent }) => agent) : [...state.evidence.pendingSubagents.keys()];
  for (const agent of agents) state.evidence.pendingSubagents.delete(agent);
  clearPendingSubagentCallRecords(state, { records, dispatchId });
}

function clearPendingSubagentCallRecords(state, { records = [], dispatchId = null } = {}) {
  if (dispatchId) {
    state.evidence.pendingSubagentCalls.delete(dispatchId);
    return;
  }
  if (!records.length) {
    state.evidence.pendingSubagentCalls.clear();
    return;
  }
  const completedAgents = new Set(records.map(({ agent }) => agent));
  for (const [id, agents] of state.evidence.pendingSubagentCalls.entries()) {
    for (const agent of completedAgents) agents.delete(agent);
    if (!agents.size) state.evidence.pendingSubagentCalls.delete(id);
  }
}

function pendingRecords(state) {
  return [...state.evidence.pendingSubagents.entries()].map(([agent, pending]) => ({
    agent,
    skills: [...pending.skills],
    text: [...(pending.texts ?? [])].join('\n'),
  }));
}

function pendingRequiredSubagents(state, requiredSubagents) {
  const required = new Set(requiredSubagents.map(({ agent }) => agent));
  return [...state.evidence.pendingSubagents.entries()]
    .filter(([agent]) => required.has(agent))
    .map(([agent, pending]) => ({ agent, ...pending }));
}

function stuckRequiredSubagents(state, requiredSubagents) {
  const now = Date.now();
  return pendingRequiredSubagents(state, requiredSubagents)
    .filter((pending) => pending.startedAt && now - pending.startedAt >= SUBAGENT_STUCK_AFTER_MS);
}

function formatPendingSubagents(values) {
  const now = Date.now();
  return values.map(({ agent, startedAt, attempts }) => {
    const ageSeconds = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : null;
    const age = ageSeconds === null ? 'unknown age' : `${ageSeconds}s`;
    return `${agent} (${age}, attempts ${attempts ?? 1})`;
  }).join(', ');
}

function buildSubagentStatus(state) {
  const requiredSubagents = subagentRequirements(state.lastRoute?.requiredSubagents);
  return {
    route: state.lastRoute?.intent ?? 'none',
    required: requiredSubagents,
    completed: [...(state.evidence.taskSubagents ?? new Set())],
    pending: pendingRequiredSubagents(state, requiredSubagents).map(({ agent, startedAt, lastSeenAt, attempts, skills }) => ({
      agent,
      startedAt,
      lastSeenAt,
      attempts,
      skills: [...skills],
      stuck: Boolean(startedAt && Date.now() - startedAt >= SUBAGENT_STUCK_AFTER_MS),
    })),
    tasks: [...state.evidence.taskProgress.values()].map((task) => ({
      id: task.id,
      status: task.status,
      text: task.text,
      summary: task.summary,
      subagentCount: task.subagentCount,
      runningCount: task.runningCount,
      completedCount: task.completedCount,
      failedCount: task.failedCount,
      toolCount: task.toolCount,
      requests: task.requests,
      tokens: task.tokens,
      contextTokens: task.contextTokens,
      contextWindow: task.contextWindow,
      cost: task.cost,
      durationMs: task.durationMs,
      models: task.models,
      currentTool: task.currentTool,
      lastTool: task.lastTool,
      toolDetail: task.toolDetail,
      startedAt: task.startedAt,
      updatedAt: task.updatedAt,
    })),
    failures: state.evidence.toolFailures.filter((failure) => failure.tool === 'task'),
  };
}

function formatSubagentStatus(state) {
  const status = buildSubagentStatus(state);
  const required = status.required.length
    ? status.required.map(({ agent, requiredSkills }) => `- ${agent}: ${requiredSkills.join(', ') || 'none'}`).join('\n')
    : '- none';
  const completed = status.completed.length ? status.completed.map((agent) => `- ${agent}`).join('\n') : '- none';
  const pending = status.pending.length
    ? status.pending.map(({ agent, attempts, stuck, skills }) => `- ${agent}: ${stuck ? 'stuck' : 'pending'}; attempts ${attempts}; skills ${skills.join(', ') || 'none'}`).join('\n')
    : '- none';
  const tasks = status.tasks.length
    ? status.tasks.map(formatTaskProgressLine).join('\n')
    : '- none';
  const failures = status.failures.length
    ? status.failures.map((failure) => `- ${failure.message ?? failure.summary ?? 'task failed'}`).join('\n')
    : '- none';

  return [
    `Route: ${status.route}`,
    'Required:',
    required,
    'Completed:',
    completed,
    'Pending:',
    pending,
    'Tasks:',
    tasks,
    'Failures:',
    failures,
  ].join('\n');
}

function formatTaskProgressLine(progress) {
  const title = progress.id ? `task ${progress.id}` : 'task';
  const stats = [
    progress.models?.length ? `models ${progress.models.join(', ')}` : null,
    progress.subagentCount ? formatTaskItemCounts(progress) : null,
    progress.toolCount ? `${formatMetricCount(progress.toolCount)} tools` : null,
    progress.requests ? `${progress.requests} req` : null,
    progress.tokens ? `${formatCompactMetric(progress.tokens)} tokens` : null,
    formatContextMetric(progress),
    progress.cost ? formatCost(progress.cost) : null,
    progress.durationMs ? `${Math.round(progress.durationMs / 1000)}s` : null,
  ].filter(Boolean).join(' | ');
  const description = progress.summary ? ` # ${progress.summary}` : '';
  const head = `- ${title}: ${progress.status}${description}${stats ? ` | ${stats}` : ''}`;
  const toolLine = formatProgressToolLine(progress);
  return toolLine ? `${head}\n  ${toolLine}` : head;
}

function formatTaskItemCounts(progress) {
  const parts = [
    progress.subagentCount ? `${progress.subagentCount} items` : null,
    progress.runningCount ? `${progress.runningCount} running` : null,
    progress.completedCount ? `${progress.completedCount} done` : null,
    progress.failedCount ? `${progress.failedCount} failed` : null,
  ].filter(Boolean);
  return parts.join(', ');
}

function formatMetricCount(value) {
  return Number.isFinite(value) ? String(Math.round(value)) : '0';
}

function formatCompactMetric(value) {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value);
  if (Math.abs(rounded) >= 1000000) return `${trimMetric(rounded / 1000000)}M`;
  if (Math.abs(rounded) >= 1000) return `${trimMetric(rounded / 1000)}k`;
  return String(rounded);
}

function trimMetric(value) {
  return value.toFixed(value >= 10 ? 0 : 1).replace(/\.0$/, '');
}

function formatContextMetric(progress) {
  if (!progress.contextTokens) return null;
  const tokens = formatCompactMetric(progress.contextTokens);
  if (!progress.contextWindow) return `ctx ${tokens}`;
  const window = formatCompactMetric(progress.contextWindow);
  const percent = (progress.contextTokens / progress.contextWindow) * 100;
  const pct = Number.isFinite(percent) ? ` (${trimMetric(percent)}%)` : '';
  return `ctx ${tokens}/${window}${pct}`;
}

function formatCost(value) {
  return `$${value.toFixed(2)}`;
}

function formatProgressToolLine(progress) {
  const tool = progress.currentTool || progress.lastTool;
  if (!tool) return '';
  const label = progress.currentTool ? 'current tool' : 'last tool';
  const detailText = progress.toolDetail || progress.lastIntent;
  const detail = detailText && detailText !== tool ? ` - ${detailText}` : '';
  return `${label}: ${tool}${detail}`;
}

function eventTimestamp(event = {}) {
  const candidates = [
    event.timestamp,
    event.time,
    event.startedAt,
    event.createdAt,
    event.details?.timestamp,
    event.details?.time,
    event.details?.startedAt,
    event.details?.createdAt,
  ];
  for (const candidate of candidates) {
    const parsed = parseTimestamp(candidate);
    if (parsed) return parsed;
  }
  return Date.now();
}

function parseTimestamp(value) {
  if (Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function recordReadSkillEvidence(state, event = {}) {
  if (isFailedToolEvent(event)) return;
  for (const skill of extractReadSkillNames(event)) {
    state.evidence.loadedSkills.add(skill);
  }
}

function recordReadSkillEvidenceFromEntries(state, entries = [], startIndex = -1) {
  for (const [index, entry] of entries.entries()) {
    if (index <= startIndex) continue;
    for (const candidate of branchToolEventCandidates(entry)) {
      if (toolEventName(candidate) !== 'read') continue;
      if (isFailedToolEvent(candidate)) continue;
      const timestamp = eventTimestamp(candidate);
      if (state.routeStartedAt && timestamp && timestamp < state.routeStartedAt) continue;
      recordReadSkillEvidence(state, candidate);
    }
  }
}

function branchToolEventCandidates(entry = {}) {
  return [
    entry,
    entry.data,
    entry.event,
    entry.details,
    entry.result,
    entry.message,
  ].filter(isRecord);
}

function recordToolFailure(state, name, event = {}) {
  const previous = state.evidence.toolFailures.find((item) => item.tool === name);
  const failure = mergeToolFailure(previous, buildToolFailure(name, event));
  state.evidence.toolFailures = [
    ...state.evidence.toolFailures.filter((item) => item.tool !== name),
    failure,
  ].slice(-8);
}

function clearToolFailures(state, name) {
  state.evidence.toolFailures = state.evidence.toolFailures.filter((item) => item.tool !== name);
}

function buildToolFailure(name, event = {}) {
  const failure = { tool: name };
  const message = extractFailureMessage(event);
  const summary = extractFailureSummary(event);
  const repairHint = extractRepairHint(event);
  if (message) failure.message = message;
  if (summary) failure.summary = summary;
  if (repairHint) failure.repairHint = repairHint;
  return failure;
}

function mergeToolFailure(previous, current) {
  if (!previous) return current;
  return {
    tool: current.tool,
    message: current.message ?? previous.message,
    summary: current.summary ?? previous.summary,
    repairHint: current.repairHint ?? previous.repairHint,
  };
}

function extractFailureMessage(event = {}) {
  const candidates = [
    event.message,
    event.error,
    event.details?.message,
    event.details?.error,
    event.details?.stderr,
    event.content,
  ];
  return candidates
    .flatMap((candidate) => collectTextCandidates(candidate))
    .map((text) => text.trim())
    .filter(Boolean)[0];
}

function extractFailureSummary(event = {}) {
  const candidates = [
    event.summary,
    event.details?.summary,
    ...(Array.isArray(event.details?.results) ? event.details.results.map((result) => result?.summary) : []),
  ];
  return candidates.find((value) => typeof value === 'string' && value.trim())?.trim();
}

function extractRepairHint(event = {}) {
  const candidates = [
    event.repairHint,
    event.details?.repairHint,
    ...(Array.isArray(event.details?.results) ? event.details.results.map((result) => result?.repairHint) : []),
  ];
  return candidates.find((value) => typeof value === 'string' && value.trim())?.trim();
}

function formatRecentToolFailures(state, toolNames = []) {
  const allowed = new Set(toolNames);
  const failures = state.evidence.toolFailures.filter((failure) => allowed.has(failure.tool));
  if (!failures.length) return null;
  return [
    'Recent failed tool results:',
    ...failures.map((failure) => {
      const details = [failure.summary, failure.message, failure.repairHint ? `Repair: ${failure.repairHint}` : null]
        .filter(Boolean)
        .join(' ');
      return `- ${failure.tool}: ${details || 'tool returned a failed result'}`;
    }),
  ].join('\n');
}

function isSuccessfulToolEvent(event = {}) {
  return !isFailedToolEvent(event);
}

function isFailedToolEvent(event = {}) {
  return event.isError === true
    || event.error === true
    || event.ok === false
    || event.passed === false
    || event.status === 'error'
    || event.details?.isError === true
    || event.details?.error === true
    || event.details?.ok === false
    || event.details?.passed === false;
}

function extractReadSkillNames(event = {}) {
  return uniqueValues([
    event.uri,
    event.path,
    event.resource,
    event.resourceUri,
    event.params,
    event.input,
    event.args,
    event.arguments,
    event.call,
    event.request,
    event.toolCall,
    event.tool_call,
    event.details?.uri,
    event.details?.path,
    event.details?.resource,
    event.details?.resourceUri,
    event.details?.params,
    event.details?.input,
    event.details?.args,
    event.details?.arguments,
    event.details?.call,
    event.details?.request,
    event.details?.toolCall,
    event.details?.tool_call,
  ].flatMap((value) => collectReadSkillNames(value)));
}

function collectReadSkillNames(value, seen = new Set()) {
  if (typeof value === 'string') return parseSkillUris(value);
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectReadSkillNames(item, seen));
  if (typeof value !== 'object') return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const skills = [];
  for (const [key, child] of Object.entries(value)) {
    if (isToolResultTextKey(key)) continue;
    skills.push(...collectReadSkillNames(child, seen));
  }
  return skills;
}

function isToolResultTextKey(key) {
  return ['content', 'output', 'result', 'response', 'message', 'text', 'stdout', 'stderr'].includes(String(key));
}

function parseSkillUris(value) {
  const skills = [];
  const pattern = /skill:\/\/([A-Za-z0-9_.\/-]+)/g;
  let match;
  while ((match = pattern.exec(value)) !== null) {
    const skill = cleanReadSkillName(match[1]);
    if (skill) skills.push(skill);
  }
  return skills;
}

function cleanReadSkillName(value) {
  return normalizeSkillName(String(value)
    .replace(/[.。；;，,]+$/, '')
    .replace(/[)\]}>]+$/, '')
    .trim());
}

function subagentNames(subagents = []) {
  return subagents.map((value) => (typeof value === 'string' ? value : value?.agent)).filter(Boolean);
}

function subagentRequirements(subagents = []) {
  return subagents.map((value) => {
    if (typeof value === 'string') return { agent: value, requiredSkills: [] };
    return {
      agent: value?.agent,
      requiredSkills: Array.isArray(value?.requiredSkills) ? value.requiredSkills : [],
    };
  }).filter(({ agent }) => agent);
}

function formatRequiredSubagents(subagents) {
  return subagents.map(({ agent, requiredSkills }) => `${agent} [${requiredSkills.join(', ') || 'none'}]`).join('; ');
}

function formatMissingSkillAssignments(assignments) {
  return assignments.map(({ agent, skills }) => `${agent} [${skills.join(', ')}]`).join('; ');
}

function uniqueValues(values) {
  return [...new Set(values)];
}
