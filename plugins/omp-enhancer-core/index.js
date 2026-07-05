import { buildGovernancePromptFragment, buildMissingGateContext, buildSubagentPromptFragment } from './src/governance.js';
import { routeNaturalLanguageTask } from './src/router.js';
import { normalizeSkillName, validateSkillUsage } from './src/skill-usage.js';
import { collectSubagentTaskRecords, parseSubagentUsageDetails, validateSubagentUsage } from './src/subagent-usage.js';
import { buildClassifierPrompt, resolveClassificationRoute } from './src/classifier.js';
import { runClassifierCommand } from './src/classifier-config.js';
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
const TASK_SUBAGENT_EVENT_CHANNEL = 'task:subagent:event';
const TASK_SUBAGENT_PROGRESS_CHANNEL = 'task:subagent:progress';
const TASK_SUBAGENT_LIFECYCLE_CHANNEL = 'task:subagent:lifecycle';
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
  registerSubagentEventBusHandlers(pi, state);

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
        loadedSkills: state.evidence.loadedSkills,
      });
      state.lastSkillUsage = validation;
      await persistState(pi, state);
      return okResult(validation.message, { validation });
    },
  });

  pi.registerTool({
    name: 'omp_core_validate_subagent_usage',
    label: 'Validate routed subagent usage',
    description: 'Validate that a routed agent output includes SUBAGENT_USAGE with all required subagents forked.',
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
    label: 'Show routed subagent status',
    description: 'Report required, completed, pending, and potentially stuck subagents for the current routed workflow.',
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
      const fragment = buildGovernancePromptFragment({ route, parentTask: params.prompt ?? state.lastPrompt });
      if (params.prompt && route) {
        setRouteState(state, route, params.prompt);
        await persistState(pi, state);
      }
      return okResult(fragment, { route, fragment });
    },
  });

  pi.on?.('session_start', async (_event = {}, ctx = {}) => {
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
    const fragment = buildGovernancePromptFragment({ route, parentTask: prompt });
    if (event.systemPrompt) event.systemPrompt = `${event.systemPrompt}\n\n${fragment}`;
    else event.additionalContext = [event.additionalContext, fragment].filter(Boolean).join('\n\n');
    return { additionalContext: fragment, route };
  });

  pi.on?.('tool_call', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    const name = toolEventName(event);
    if (name) recordLoopGuardProgress(state.loopGuard, `tool_call:${name}`);
    const preworkBlock = buildPreworkSkillGateBlock(state, name);
    if (preworkBlock) {
      await persistState(pi, state);
      return preworkBlock;
    }
    if (name === 'task') {
      const records = recordSubagentDispatchStarted(state, event);
      await notifySubagentDispatch(ctx, 'running', records, state);
    }
    await persistState(pi, state);
    return undefined;
  });

  pi.on?.('tool_execution_update', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    if (toolEventName(event) !== 'task') return undefined;
    const updates = recordTaskExecutionUpdate(state, event);
    await notifySubagentProgress(ctx, updates, state);
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
      const records = recordSubagentDispatchFinished(state, event, { successful });
      await notifySubagentDispatch(ctx, successful ? 'completed' : 'failed', records, state, event);
    }
    if (name === 'read' && successful) recordReadSkillEvidence(state, event);
    await persistState(pi, state);
    return undefined;
  });

  pi.on?.('session_stop', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    recordFinalOutputEvidence(state, event);
    reconcileSkillUsageFromReadEvidence(state);

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
    taskToolCalls: 0,
    loadedSkills: new Set(),
    toolFailures: [],
    forkedSubagents: new Set(),
    taskSubagents: new Set(),
    pendingSubagents: new Map(),
    pendingSubagentCalls: new Map(),
    subagentSkills: new Map(),
    unexpectedSubagentSkills: new Map(),
    subagentAssignments: new Map(),
    subagentProgress: new Map(),
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
    `Required skills: ${route.requiredSkills.length ? route.requiredSkills.join(', ') : 'none'}`,
    `Required tools: ${route.requiredTools.length ? route.requiredTools.join(', ') : 'none'}`,
    `Required subagents: ${formatSubagents(route.requiredSubagents)}`,
  ].join('\n');
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
      unexpectedSubagentSkills: [...state.evidence.unexpectedSubagentSkills.entries()].map(([agent, skills]) => ({
        agent,
        skills: [...skills],
      })),
      subagentAssignments: [...state.evidence.subagentAssignments.entries()].map(([agent, texts]) => ({
        agent,
        texts: [...texts],
      })),
      subagentProgress: [...state.evidence.subagentProgress.entries()].map(([key, progress]) => ({
        key,
        ...progress,
        skills: [...(progress.skills ?? [])],
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
    taskToolCalls: Number.isInteger(value.taskToolCalls) ? value.taskToolCalls : 0,
    loadedSkills: new Set(Array.isArray(value.loadedSkills) ? value.loadedSkills.filter(isString) : []),
    toolFailures: readToolFailures(value.toolFailures),
    forkedSubagents: new Set(Array.isArray(value.forkedSubagents) ? value.forkedSubagents.filter(isString) : []),
    taskSubagents: new Set(Array.isArray(value.taskSubagents) ? value.taskSubagents.filter(isString) : []),
    pendingSubagents: readPendingSubagents(value.pendingSubagents),
    pendingSubagentCalls: readPendingSubagentCalls(value.pendingSubagentCalls),
    subagentSkills: readSubagentSkills(value.subagentSkills),
    unexpectedSubagentSkills: readSubagentSkills(value.unexpectedSubagentSkills),
    subagentAssignments: readSubagentAssignments(value.subagentAssignments),
    subagentProgress: readSubagentProgress(value.subagentProgress),
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

function readSubagentProgress(value) {
  const progress = new Map();
  if (!Array.isArray(value)) return progress;
  for (const item of value) {
    if (!isRecord(item) || typeof item.key !== 'string') continue;
    const agent = cleanAgentName(item.agent);
    if (!agent) continue;
    progress.set(item.key, {
      id: isString(item.id) ? item.id : item.key,
      agent,
      status: normalizeSubagentStatus(item.status),
      parentToolCallId: isString(item.parentToolCallId) ? item.parentToolCallId : '',
      index: Number.isInteger(item.index) ? item.index : null,
      description: isString(item.description) ? item.description : '',
      currentTool: isString(item.currentTool) ? item.currentTool : '',
      lastIntent: isString(item.lastIntent) ? item.lastIntent : '',
      requests: Number.isFinite(item.requests) ? item.requests : 0,
      tokens: Number.isFinite(item.tokens) ? item.tokens : 0,
      durationMs: Number.isFinite(item.durationMs) ? item.durationMs : 0,
      startedAt: Number.isFinite(item.startedAt) ? item.startedAt : 0,
      updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt : 0,
      assignment: isString(item.assignment) ? item.assignment : '',
      task: isString(item.task) ? item.task : '',
      skills: new Set(Array.isArray(item.skills) ? item.skills.filter(isString) : []),
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

  return [
    'OMP Enhancer Core skill gate is still open.',
    `Validate SKILL_USAGE before finishing. Required skills: ${requiredSkills.join(', ')}.`,
    'Recovery order: in this same continuation, read each missing required skill with `skill://<skill-name>`, wait for those read results, then call omp_core_validate_skill_usage with output set to the full SKILL_USAGE response text.',
    'If your previous final response already included SKILL_USAGE, call omp_core_validate_skill_usage with output set to that full response text. Do not only say the evidence was already provided.',
    failureContext,
    state.lastSkillUsage?.message ? `Last validation: ${state.lastSkillUsage.message}` : 'No successful SKILL_USAGE validation has been recorded.',
  ].filter(Boolean).join('\n');
}

function buildPreworkSkillGateBlock(state, toolName) {
  if (!isPreworkSkillGateTool(toolName, state.lastRoute)) return null;
  const missing = missingReadSkills(state);
  if (!missing.length) return null;

  return {
    block: true,
    reason: [
      `OMP Enhancer Core pre-work skill gate blocked ${toolName}.`,
      `Read all required skills before using work tools. Missing skills: ${missing.join(', ')}.`,
      'Required recovery order:',
      ...missing.map((skill) => `- read skill://${skill}`),
      `After those read results return, retry ${toolName}. Do not wait until session_stop to repair missing skill evidence.`,
    ].join('\n'),
  };
}

function isPreworkSkillGateTool(toolName, route) {
  if (!toolName || !route || route.intent === 'unknown') return false;
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
    'task',
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
  const loaded = new Set([...state.evidence.loadedSkills].map(normalizeEvidenceSkillName));
  return (state.lastRoute?.requiredSkills ?? [])
    .filter((skill) => !loaded.has(normalizeEvidenceSkillName(skill)));
}

function normalizeEvidenceSkillName(value) {
  return normalizeSkillName(value);
}

function recordFinalOutputEvidence(state, event = {}) {
  const output = extractFinalOutputText(event);
  if (!output) return;

  const requiredSkills = state.lastRoute?.requiredSkills ?? [];
  if (requiredSkills.length && !state.lastSkillUsage?.ok && /\bSKILL_USAGE\b/i.test(output)) {
    state.lastSkillUsage = validateSkillUsage({
      requiredSkills,
      output,
      loadedSkills: state.evidence.loadedSkills,
    });
  }

  const requiredSubagents = subagentRequirements(state.lastRoute?.requiredSubagents);
  if (requiredSubagents.length && !state.lastSubagentUsage?.ok && /\bSUBAGENT_USAGE\b/i.test(output)) {
    state.lastSubagentUsage = validateSubagentUsage({ requiredSubagents, output });
    if (state.lastSubagentUsage.ok) recordSubagentFinalUsage(state, output);
  }
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
  if (!requiredSkills.length || state.lastSkillUsage?.ok || !state.evidence.loadedSkills.size) return;
  state.lastSkillUsage = validateSkillUsage({
    requiredSkills,
    output: '',
    loadedSkills: state.evidence.loadedSkills,
  });
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

function registerSubagentEventBusHandlers(pi, state) {
  const eventBus = pi.events;
  if (!eventBus || typeof eventBus.on !== 'function') return;

  const subscribe = (channel, handler) => {
    try {
      eventBus.on(channel, async (payload = {}) => {
        try {
          const updates = handler(payload);
          if (updates.some((update) => update.persist)) await persistState(pi, state);
        } catch {
          // EventBus updates are best-effort observability. They must not break
          // task execution or the stricter final gate checks.
        }
      });
    } catch {
      // Older hosts may expose a partial EventBus; extension startup should
      // remain compatible with those versions.
    }
  };

  subscribe(TASK_SUBAGENT_PROGRESS_CHANNEL, (payload) => recordSubagentEventBusProgress(state, payload));
  subscribe(TASK_SUBAGENT_LIFECYCLE_CHANNEL, (payload) => recordSubagentEventBusLifecycle(state, payload));
  subscribe(TASK_SUBAGENT_EVENT_CHANNEL, (payload) => recordSubagentEventBusRawEvent(state, payload));
}

function recordTaskExecutionUpdate(state, event = {}) {
  const parentToolCallId = toolEventCallId(event);
  return extractTaskProgressRecords(event).flatMap((progress) => {
    const update = recordSubagentProgress(state, progress, { parentToolCallId, source: 'tool_execution_update' });
    return update ? [update] : [];
  });
}

function recordSubagentEventBusProgress(state, payload = {}) {
  const raw = isRecord(payload.progress)
    ? {
        ...payload.progress,
        assignment: payload.progress.assignment ?? payload.assignment,
        task: payload.progress.task ?? payload.task,
        agent: payload.progress.agent ?? payload.agent,
        agentSource: payload.progress.agentSource ?? payload.agentSource,
        parentToolCallId: payload.progress.parentToolCallId ?? payload.parentToolCallId,
        detached: payload.progress.detached ?? payload.detached,
        sessionFile: payload.progress.sessionFile ?? payload.sessionFile,
      }
    : payload;
  const update = recordSubagentProgress(state, raw, {
    parentToolCallId: payload.parentToolCallId,
    source: TASK_SUBAGENT_PROGRESS_CHANNEL,
  });
  return update ? [update] : [];
}

function recordSubagentEventBusLifecycle(state, payload = {}) {
  const update = recordSubagentProgress(state, payload, {
    parentToolCallId: payload.parentToolCallId,
    source: TASK_SUBAGENT_LIFECYCLE_CHANNEL,
    lifecycle: true,
  });
  return update ? [update] : [];
}

function recordSubagentEventBusRawEvent(state, payload = {}) {
  if (!isRecord(payload) || !isRecord(payload.event)) return [];
  const key = subagentProgressKey({
    id: payload.id,
    parentToolCallId: payload.event.parentToolCallId,
    index: payload.event.index,
  });
  const existing = state.evidence.subagentProgress.get(key) ?? findSubagentProgressById(state, payload.id);
  if (!existing) return [];

  const event = payload.event;
  const name = toolEventName(event);
  if (!name) return [];
  const raw = {
    ...existing,
    id: existing.id,
    agent: existing.agent,
    parentToolCallId: existing.parentToolCallId,
    status: 'running',
    currentTool: event.type === 'tool_call' ? name : '',
    lastIntent: event.intent ?? existing.lastIntent,
  };
  const update = recordSubagentProgress(state, raw, { source: TASK_SUBAGENT_EVENT_CHANNEL });
  return update ? [update] : [];
}

function findSubagentProgressById(state, id) {
  const cleanId = cleanProgressId(id);
  if (!cleanId) return null;
  for (const progress of state.evidence.subagentProgress.values()) {
    if (progress.id === cleanId) return progress;
  }
  return null;
}

function extractTaskProgressRecords(event = {}) {
  const records = [];
  const seen = new Set();
  const roots = [
    event.partialResult,
    event.partialResult?.details,
    event.partialResult?.result,
    event.details,
    event.result,
    event,
  ].filter(Boolean);

  for (const root of roots) collectTaskProgressRecords(root, records, seen);
  return uniqueProgressRecords(records);
}

function collectTaskProgressRecords(value, records, seen) {
  if (!value) return;
  if (typeof value === 'object') {
    if (seen.has(value)) return;
    seen.add(value);
  }

  if (Array.isArray(value)) {
    if (value.some(isSubagentProgressRecord)) {
      for (const item of value) {
        if (isSubagentProgressRecord(item)) records.push(item);
      }
      return;
    }
    for (const item of value) collectTaskProgressRecords(item, records, seen);
    return;
  }

  if (!isRecord(value)) return;
  if (isSubagentProgressRecord(value)) records.push(value);
  for (const key of ['progress', 'details', 'result', 'partialResult', 'payload']) {
    collectTaskProgressRecords(value[key], records, seen);
  }
}

function isSubagentProgressRecord(value) {
  if (!isRecord(value)) return false;
  const hasIdentity = ['id', 'agent', 'role', 'subagent', 'subagent_type', 'subagentType', 'assignment', 'task', 'description']
    .some((key) => typeof value[key] === 'string' && value[key].trim());
  return hasIdentity && typeof value.status === 'string';
}

function uniqueProgressRecords(records) {
  const byKey = new Map();
  for (const record of records) {
    const key = subagentProgressKey(record);
    if (!byKey.has(key)) byKey.set(key, record);
  }
  return [...byKey.values()];
}

function recordSubagentProgress(state, rawProgress = {}, { parentToolCallId = '', source = '', lifecycle = false } = {}) {
  const normalized = normalizeSubagentProgress(state, rawProgress, { parentToolCallId, source, lifecycle });
  if (!normalized.agent) return null;

  const previous = state.evidence.subagentProgress.get(normalized.key);
  const mergedSkills = new Set(previous?.skills ?? []);
  for (const skill of normalized.skills) mergedSkills.add(skill);
  const current = {
    ...previous,
    ...normalized,
    startedAt: previous?.startedAt ?? normalized.startedAt,
    skills: mergedSkills,
  };
  state.evidence.subagentProgress.set(normalized.key, current);

  const record = { agent: current.agent, text: current.text, skills: [...mergedSkills] };
  if (isActiveSubagentStatus(current.status)) {
    touchPendingSubagent(state, record, current.startedAt, current.updatedAt);
    if (current.parentToolCallId) recordPendingSubagentCall(state, current.parentToolCallId, [record]);
  } else if (isCompletedSubagentStatus(current.status)) {
    recordCompletedSubagent(state, record);
    removePendingSubagentCallAgents(state, current.parentToolCallId, [current.agent]);
    clearSubagentTaskFailure(state, current.agent);
  } else if (isFailedSubagentStatus(current.status)) {
    state.evidence.pendingSubagents.delete(current.agent);
    removePendingSubagentCallAgents(state, current.parentToolCallId, [current.agent]);
    recordSubagentProgressFailure(state, current);
  }

  const statusChanged = !previous || previous.status !== current.status;
  const toolChanged = previous?.currentTool !== current.currentTool;
  return {
    previous,
    current,
    persist: statusChanged || toolChanged || lifecycle || isTerminalSubagentStatus(current.status),
    notify: statusChanged || (!previous && Boolean(current.agent)) || (isActiveSubagentStatus(current.status) && toolChanged),
  };
}

function normalizeSubagentProgress(state, rawProgress = {}, { parentToolCallId = '', source = '', lifecycle = false } = {}) {
  const progress = isRecord(rawProgress.progress) ? { ...rawProgress, ...rawProgress.progress } : rawProgress;
  const text = progressText(progress);
  const agent = resolveProgressAgent(state, progress, text);
  const status = normalizeSubagentStatus(progress.status ?? (lifecycle ? 'running' : ''));
  const updatedAt = eventTimestamp(progress);
  const id = cleanProgressId(progress.id ?? progress.agentId ?? progress.jobId ?? agent);
  const key = subagentProgressKey({
    id,
    agent,
    parentToolCallId: progress.parentToolCallId ?? parentToolCallId,
    index: progress.index,
  });
  const skills = subagentSkillsFromProgress(agent, progress, text);

  return {
    key,
    id,
    agent,
    status,
    parentToolCallId: cleanToolCallId(progress.parentToolCallId ?? parentToolCallId),
    index: Number.isInteger(progress.index) ? progress.index : null,
    description: cleanText(progress.description),
    currentTool: cleanText(progress.currentTool),
    lastIntent: cleanText(progress.lastIntent),
    requests: Number.isFinite(progress.requests) ? progress.requests : 0,
    tokens: Number.isFinite(progress.tokens) ? progress.tokens : 0,
    durationMs: Number.isFinite(progress.durationMs) ? progress.durationMs : 0,
    startedAt: Number.isFinite(progress.startedAt) ? progress.startedAt : updatedAt,
    updatedAt,
    assignment: cleanText(progress.assignment),
    task: cleanText(progress.task),
    source,
    text,
    skills,
  };
}

function resolveProgressAgent(state, progress = {}, text = '') {
  const required = subagentRequirements(state.lastRoute?.requiredSubagents);
  const requiredNames = new Set(required.map(({ agent }) => agent));
  const explicitRole = cleanAgentName(progress.role ?? progress.subagent ?? progress.subagent_type ?? progress.subagentType);
  if (requiredNames.has(explicitRole)) return explicitRole;

  const markerAgent = requiredAgentFromText(text, requiredNames);
  if (markerAgent) return markerAgent;

  const agent = cleanAgentName(progress.agent);
  if (requiredNames.has(agent)) return agent;

  const mentionedRequiredAgent = required.find(({ agent: name }) => textMentionsAgent(text, name))?.agent;
  if (mentionedRequiredAgent) return mentionedRequiredAgent;

  if (explicitRole) return explicitRole;
  if (agent && agent !== 'task') return agent;
  if (required.length === 1) return required[0].agent;
  return agent === 'task' ? '' : agent;
}

function requiredAgentFromText(text = '', requiredNames = new Set()) {
  const patterns = [
    /OMP_REQUIRED_SUBAGENT:\s*([^\r\n]+)/i,
    /^Subagent:\s*([^\r\n]+)/im,
    /^Agent:\s*([^\r\n]+)/im,
    /^Role:\s*([^\r\n]+)/im,
  ];
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    const agent = cleanAgentName(match?.[1]);
    if (agent && (!requiredNames.size || requiredNames.has(agent))) return agent;
  }
  return '';
}

function textMentionsAgent(text = '', agent = '') {
  if (!agent) return false;
  const escaped = agent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`).test(String(text));
}

function subagentSkillsFromProgress(agent, progress = {}, text = '') {
  const values = [];
  if (Array.isArray(progress.skills)) values.push(...progress.skills.filter(isString));
  if (Array.isArray(progress.requiredSkills)) values.push(...progress.requiredSkills.filter(isString));
  const records = collectSubagentTaskRecords({
    role: agent,
    assignment: [
      progress.assignment,
      progress.task,
      progress.description,
      text,
    ].filter(Boolean).join('\n'),
  });
  for (const record of records) values.push(...record.skills);
  return uniqueValues(values);
}

function progressText(progress = {}) {
  const values = [
    progress.assignment,
    progress.task,
    progress.description,
    progress.lastIntent,
    progress.currentToolArgs,
    progress.summary,
    progress.message,
    progress.output,
    progress.result,
    progress.content,
    progress.recentOutput,
  ];
  return values
    .flatMap((value) => collectTextCandidates(value))
    .map((value) => value.trim())
    .filter(Boolean)
    .join('\n');
}

function subagentProgressKey({ id = '', agent = '', parentToolCallId = '', index = null } = {}) {
  const idPart = cleanProgressId(id);
  const parent = cleanToolCallId(parentToolCallId);
  const indexPart = Number.isInteger(index) ? `index:${index}` : '';
  return [parent, idPart, indexPart, cleanAgentName(agent)].filter(Boolean).join(':') || 'subagent-progress';
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

function isTerminalSubagentStatus(status) {
  return isCompletedSubagentStatus(status) || isFailedSubagentStatus(status);
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
  const unexpectedSkills = skills.filter((skill) => !requiredSkills.includes(skill));
  if (unexpectedSkills.length) {
    const recordedUnexpected = state.evidence.unexpectedSubagentSkills.get(agent) ?? new Set();
    for (const skill of unexpectedSkills) recordedUnexpected.add(skill);
    state.evidence.unexpectedSubagentSkills.set(agent, recordedUnexpected);
  }
  if (!requiredSkills.length) return;

  const recorded = state.evidence.subagentSkills.get(agent) ?? new Set();
  for (const skill of requiredSkills) {
    if (text.includes(skill) || skills.includes(skill)) recorded.add(skill);
  }
  state.evidence.subagentSkills.set(agent, recorded);
}

function subagentRecordsForToolResult(state, event) {
  const records = collectSubagentTaskRecords(event);
  const explicitDispatchId = toolEventCallId(event);
  if (records.length) return { records, dispatchId: explicitDispatchId };

  const dispatchId = explicitDispatchId && state.evidence.pendingSubagentCalls.has(explicitDispatchId)
    ? explicitDispatchId
    : firstPendingSubagentCallId(state);
  if (dispatchId) return { records: pendingRecordsForCall(state, dispatchId), dispatchId };

  return { records: pendingRecords(state), dispatchId: null };
}

function firstPendingSubagentCallId(state) {
  return state.evidence.pendingSubagentCalls.keys().next().value ?? null;
}

function pendingRecordsForCall(state, dispatchId) {
  return [...(state.evidence.pendingSubagentCalls.get(dispatchId) ?? [])]
    .map((agent) => {
      const pending = state.evidence.pendingSubagents.get(agent);
      return pending ? { agent, skills: [...pending.skills] } : { agent, skills: [] };
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

function removePendingSubagentCallAgents(state, dispatchId, agents = []) {
  if (!dispatchId || !agents.length) return;
  const pending = state.evidence.pendingSubagentCalls.get(dispatchId);
  if (!pending) return;
  for (const agent of agents) pending.delete(agent);
  if (!pending.size) state.evidence.pendingSubagentCalls.delete(dispatchId);
}

function recordSubagentProgressFailure(state, progress) {
  const message = [
    progress.agent,
    progress.status,
    progress.lastIntent || progress.currentTool || progress.description,
  ].filter(Boolean).join(' ');
  recordToolFailure(state, 'task', {
    message: message || `${progress.agent} subagent ${progress.status}`,
    summary: `Subagent ${progress.agent} ${progress.status}`,
  });
}

function clearSubagentTaskFailure(state, agent) {
  state.evidence.toolFailures = state.evidence.toolFailures.filter((failure) => {
    if (failure.tool !== 'task') return true;
    const text = [failure.message, failure.summary].filter(Boolean).join('\n');
    return !text.includes(agent);
  });
}

function pendingRecords(state) {
  return [...state.evidence.pendingSubagents.entries()].map(([agent, pending]) => ({
    agent,
    skills: [...pending.skills],
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
    progress: [...state.evidence.subagentProgress.values()].map((progress) => ({
      id: progress.id,
      agent: progress.agent,
      status: progress.status,
      parentToolCallId: progress.parentToolCallId,
      index: progress.index,
      description: progress.description,
      currentTool: progress.currentTool,
      lastIntent: progress.lastIntent,
      requests: progress.requests,
      tokens: progress.tokens,
      durationMs: progress.durationMs,
      startedAt: progress.startedAt,
      updatedAt: progress.updatedAt,
      skills: [...(progress.skills ?? [])],
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
  const progress = status.progress.length
    ? status.progress.map(formatSubagentProgressLine).join('\n')
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
    'Progress:',
    progress,
    'Failures:',
    failures,
  ].join('\n');
}

function formatSubagentProgressLine(progress) {
  const details = [
    progress.description,
    progress.currentTool ? `tool ${progress.currentTool}` : null,
    progress.lastIntent && progress.lastIntent !== progress.currentTool ? progress.lastIntent : null,
    progress.requests ? `${progress.requests} requests` : null,
    progress.durationMs ? `${Math.round(progress.durationMs / 1000)}s` : null,
  ].filter(Boolean).join('; ');
  return `- ${progress.agent}: ${progress.status}${details ? `; ${details}` : ''}`;
}

async function notifySubagentDispatch(ctx = {}, status, records = [], state, event = {}) {
  const notify = ctx.ui?.notify;
  if (typeof notify !== 'function') return;
  const agents = formatSubagentNotificationAgents(records);
  if (!agents) return;

  const message = formatSubagentNotification({ status, agents, state, event });
  const level = status === 'failed' ? 'warn' : 'info';
  try {
    await notify(message, level);
  } catch {
    // TUI notifications are best-effort; routing and gates must keep working.
  }
}

async function notifySubagentProgress(ctx = {}, updates = [], state) {
  const notify = ctx.ui?.notify;
  if (typeof notify !== 'function') return;
  for (const update of updates) {
    if (!update.notify) continue;
    const message = formatSubagentProgressNotification(update.current, state);
    const level = isFailedSubagentStatus(update.current.status) ? 'warn' : 'info';
    try {
      await notify(message, level);
    } catch {
      // Progress notifications are informational only.
    }
  }
}

function formatSubagentNotification({ status, agents, state, event }) {
  const route = state.lastRoute?.intent ? ` Route: ${state.lastRoute.intent}.` : '';
  if (status === 'running') return `OMP subagents running: ${agents}.${route}`;
  if (status === 'completed') return `OMP subagents completed: ${agents}.${route}`;
  const message = extractFailureMessage(event);
  const suffix = message ? ` ${message}` : '';
  return `OMP subagents failed: ${agents}.${route}${suffix}`;
}

function formatSubagentProgressNotification(progress, state) {
  const route = state.lastRoute?.intent ? ` Route: ${state.lastRoute.intent}.` : '';
  const details = [
    progress.currentTool ? `tool ${progress.currentTool}` : null,
    progress.lastIntent && progress.lastIntent !== progress.currentTool ? progress.lastIntent : null,
    progress.description,
  ].filter(Boolean).join('; ');
  return `OMP subagent progress: ${progress.agent} ${progress.status}${details ? `; ${details}` : ''}.${route}`;
}

function formatSubagentNotificationAgents(records = []) {
  const byAgent = new Map();
  for (const { agent, skills = [] } of records) {
    if (!agent) continue;
    const current = byAgent.get(agent) ?? new Set();
    for (const skill of skills) current.add(skill);
    byAgent.set(agent, current);
  }

  return [...byAgent.entries()].map(([agent, skills]) => {
    const list = [...skills];
    return list.length ? `${agent} [${list.join(', ')}]` : agent;
  }).join(', ');
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
