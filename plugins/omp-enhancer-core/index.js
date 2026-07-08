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
import { buildSmartGatePrompt, resolveSmartGateDecision, smartGateDefaults } from './src/smart-gate.js';
import {
  createLoopGuardState,
  readLoopGuardSnapshot,
  recordGeneratedText,
  recordLoopGuardProgress,
  prepareLoopGuardContinuation,
  serializeLoopGuardState,
  startLoopGuardRun,
  takeLoopRecoveryContext,
  buildLoopRecoveryContext,
  defaultLoopGuardConfig,
} from './src/loop-guard.js';
import {
  createGateRecoveryState,
  readGateRecoveryState,
  recordGateRecovery,
  serializeGateRecoveryState,
} from './src/gate-recovery.js';
import { appendDebugLog, buildDebugRecord } from './src/debug-logger.js';

const CORE_STATE_ENTRY = 'omp-enhancer-core.state';
const LOOP_GUARD_RECOVERY_MESSAGE = 'omp-enhancer-core.loop-guard-recovery';
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
const CLASSIFIER_PREFLIGHT_EXEMPT_TOOLS = new Set([
  'omp_core_classifier_prompt',
  'omp_core_resolve_classification',
  'omp_core_smart_gate_prompt',
  'omp_core_resolve_smart_gate',
  'omp_core_route_task',
  'omp_core_governance_prompt',
  'omp_core_subagent_status',
  'read',
]);
const CLASSIFIER_PREFLIGHT_FAILURE_TOOLS = new Set([
  'task',
  'omp_test_gate',
  'omp_test_report',
  'writing_quality_check',
  'writing_logic_check',
  'omp_core_validate_skill_usage',
  'omp_core_validate_subagent_usage',
  'omp_config_doctor',
  'omp_config_assets',
  'omp_config_plan',
  'fact_check_gate',
]);

export default function registerCoreEnhancer(pi) {
  const state = createState();
  const z = pi.zod?.z ?? pi.z;

  pi.setLabel?.('OMP Enhancer Core');

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
    description: 'Build the strict JSON classifier prompt and schema for OMP Tiny model routing.',
    parameters: z?.object ? z.object({
      prompt: z.string(),
    }) : undefined,
    execute: async (_callId, params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const classifier = buildClassifierPrompt({
        prompt: params.prompt,
        context: classifierPromptContext(state, params.prompt),
      });
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
      setRouteState(state, result.route, params.prompt, { classifierResolved: true });
      await persistState(pi, state);
      return okResult(formatRoute(result.route), result);
    },
  });

  pi.registerTool({
    name: 'omp_core_smart_gate_prompt',
    label: 'Build OMP smart gate prompt',
    description: 'Build the strict JSON smart-gate prompt and schema for OMP Tiny model gate review.',
    parameters: z?.object ? z.object({
      finalOutput: z.string().optional(),
      gateKey: z.string().optional(),
    }) : undefined,
    execute: async (_callId, params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const ruleGate = resolveSmartGatePromptRuleGate(state, params.gateKey);
      if (!ruleGate) {
        const openGateKeys = openSmartGateRuleGates(state).map((gate) => gate.gateKey);
        const requestedGateKey = String(params.gateKey ?? '').trim();
        const mismatch = Boolean(requestedGateKey && openGateKeys.length);
        return okResult(
          mismatch
            ? `Requested smart gate key "${requestedGateKey}" is not open. Open gate keys: ${openGateKeys.join(', ')}.`
            : 'No open OMP Enhancer Core rule gate requires smart-gate review.',
          {
            smartGate: {
              required: openGateKeys.length > 0,
              error: mismatch ? 'gate-key-mismatch' : null,
              requestedGateKey: requestedGateKey || null,
              openGateKeys,
            },
          },
        );
      }
      const pending = createPendingSmartGate(state, ruleGate, params.finalOutput ?? '');
      state.pendingSmartGate = pending;
      await persistState(pi, state);
      const promptRuleGate = { ...ruleGate, gateInstanceId: pending.gateInstanceId };
      const smartGate = buildSmartGatePrompt({
        prompt: state.lastPrompt,
        route: state.lastRoute,
        ruleGate: promptRuleGate,
        evidence: summarizeSmartGateEvidence(state),
        finalOutput: pending.finalOutput,
      });
      return okResult(smartGate.prompt, {
        smartGate: {
          ...smartGate,
          gateInstanceId: pending.gateInstanceId,
        },
      });
    },
  });

  pi.registerTool({
    name: 'omp_core_resolve_smart_gate',
    label: 'Resolve OMP smart gate output',
    description: 'Validate Tiny smart-gate JSON and record whether it can release the current rule gate.',
    parameters: z?.object ? z.object({ gateKey: z.string().optional(), output: z.string() }) : undefined,
    execute: async (_callId, params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const pending = pendingSmartGateForResolve(state, params.gateKey);
      const gateKey = pending?.gateKey ?? String(params.gateKey ?? '').trim();
      const result = pending
        ? resolveSmartGateDecision({ gateKey, output: params.output })
        : rejectedSmartGateResult(
          `No current pending smart gate matches "${gateKey || 'unknown'}". Call omp_core_smart_gate_prompt for an open gate before resolving.`,
        );
      state.smartGate = {
        gateInstanceId: pending?.gateInstanceId ?? null,
        routeStartedAt: state.routeStartedAt,
        gateKey,
        accepted: result.accepted,
        ok: result.ok,
        decision: result.decision,
        validation: result.validation,
        resolvedAt: Date.now(),
      };
      await persistState(pi, state);
      return okResult(formatSmartGateResult(result), result);
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
        visibility: 'explicit',
      });
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

  pi.on?.('message_end', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    const changed = recordAsyncResultMessage(state, event);
    if (changed) await persistState(pi, state);
    return undefined;
  });

  for (const eventName of ['turn_start', 'agent_start']) {
    pi.on?.(eventName, async (_event = {}, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      if (!state.loopGuard.streamTriggered || state.loopGuard.recoveryPending) return undefined;
      prepareLoopGuardContinuation(state.loopGuard);
      await persistState(pi, state);
      return undefined;
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
    if (isInternalCoreContinuation(prompt)) {
      if (isLoopGuardRecoveryContinuation(prompt) && state.loopGuard.streamTriggered && !state.loopGuard.recoveryPending) {
        prepareLoopGuardContinuation(state.loopGuard);
        await persistState(pi, state);
      }
      return undefined;
    }
    if (isSubagentLaunchPrompt(prompt)) {
      const fragment = buildSubagentPromptFragment({ prompt });
      if (event.systemPrompt) event.systemPrompt = `${event.systemPrompt}\n\n${fragment}`;
      else event.additionalContext = [event.additionalContext, fragment].filter(Boolean).join('\n\n');
      return { additionalContext: fragment, route: { intent: 'subagent', agent: null, requiredSkills: [], requiredTools: [], requiredSubagents: [] } };
    }
    const route = routeNaturalLanguageTask({ prompt });
    setRouteState(state, route, prompt);
    await writeDebugLog(ctx, 'routes', buildDebugRecord({ kind: 'routes', prompt, route }));
    startLoopGuardRun(state.loopGuard, `${route.intent}:${state.routeStartedAt}`);
    await persistState(pi, state);
    const fragment = buildRoutedGovernanceContext(state, { route, parentTask: prompt, visibility: 'automatic' });
    if (!fragment) return { route };
    if (event.systemPrompt) event.systemPrompt = `${event.systemPrompt}\n\n${fragment}`;
    else event.additionalContext = [event.additionalContext, fragment].filter(Boolean).join('\n\n');
    return { additionalContext: fragment, route };
  });

  pi.on?.('tool_call', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    const name = toolEventName(event);
    if (name) recordLoopGuardProgress(state.loopGuard, `tool_call:${name}`);
    const classifierBlock = buildClassifierPreflightGateBlock(state, name);
    if (classifierBlock) {
      await persistState(pi, state);
      return classifierBlock;
    }
    if (name === 'task') {
      const taskSkillBlock = buildTaskSubagentSkillGateBlock(state, event);
      if (taskSkillBlock) {
        state.pendingSmartGate = createPendingSmartGate(state, taskSkillBlock.ruleGate, '');
        await persistState(pi, state);
        await writeDebugLog(ctx, 'gates', buildDebugRecord({
          kind: 'gates',
          prompt: state.lastPrompt,
          route: state.lastRoute,
          gateKey: taskSkillBlock.ruleGate?.gateKey,
          reasonCode: taskSkillBlock.reasonCode ?? 'task_subagent_contract',
          payload: { level: taskSkillBlock.recovery?.level ?? 'block' },
        }));
        return smartGateWrappedToolBlock(state, taskSkillBlock);
      }
      recordSubagentDispatchStarted(state, event);
    } else {
      const preworkBlock = buildPreworkSkillGateBlock(state, name);
      if (preworkBlock) {
        await writeDebugLog(ctx, 'gates', buildDebugRecord({
          kind: 'gates',
          prompt: state.lastPrompt,
          route: state.lastRoute,
          gateKey: preworkBlock.ruleGate?.gateKey,
          reasonCode: preworkBlock.reasonCode ?? 'missing_skill_read',
          payload: { level: preworkBlock.recovery?.level ?? 'coach', toolName: name },
        }));
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
    const changed = recordSubagentTaskProgressEvidence(state, event);
    if (changed || updates.some((update) => update.persist)) await persistState(pi, state);
    return undefined;
  });

  pi.on?.('tool_result', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    const name = toolEventName(event);
    if (name) recordLoopGuardProgress(state.loopGuard, `tool_result:${name}`);
    const successful = isSuccessfulToolEvent(event);
    if (name && successful && name !== 'read') clearToolFailures(state, name);
    if (name && !successful) {
      recordToolFailure(state, name, event);
      maybeRequireClassifierAfterToolFailure(state, name, event);
    }
    if ((name === 'writing_quality_check' || name === 'writing_logic_check') && successful) state.evidence.writingQuality = true;
    if (name === 'omp_test_gate' && successful) state.evidence.testingGate = true;
    if (name === 'omp_test_report' && successful) state.evidence.testingReport = true;
    if (name === 'fact_check_gate' && successful) state.evidence.factCheckGate = true;
    if (name === 'task') {
      recordTaskResult(state, event, { successful });
      recordSubagentTaskResultEvidence(state, event, { successful });
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

    const finalOutput = extractFinalOutputText(event);
    if (state.classifierPreflight?.required && isClassifierInfrastructureChurnDelivery(finalOutput)) {
      state.classifierPreflight = null;
      await persistState(pi, state);
    }

    const missingClassifierPreflightContext = buildMissingClassifierPreflightContext(state);
    if (missingClassifierPreflightContext) {
      return { continue: true, additionalContext: missingClassifierPreflightContext };
    }

    const ruleGate = buildCompletionRuleGateBlock(state);
    if (ruleGate) {
      if (consumeSmartGateCompletionAllowance(state, ruleGate)) {
        const nextRuleGate = buildCompletionRuleGateBlock(state);
        if (!nextRuleGate) {
          await persistState(pi, state);
          return undefined;
        }
        state.pendingSmartGate = createPendingSmartGate(state, nextRuleGate, finalOutput);
        await persistState(pi, state);
        return { continue: true, additionalContext: buildSmartGateRequiredContext(state, nextRuleGate) };
      }
      state.pendingSmartGate = createPendingSmartGate(state, ruleGate, finalOutput);
      await persistState(pi, state);
      return { continue: true, additionalContext: buildSmartGateRequiredContext(state, ruleGate) };
    }

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
    classifierPreflight: null,
    pendingSmartGate: null,
    smartGate: null,
    smartGateCompletionBypasses: [],
    evidence: emptyEvidence(),
    loopGuard: createLoopGuardState(),
    gateRecovery: createGateRecoveryState(),
  };
}

function emptyEvidence() {
  return {
    writingQuality: false,
    writingLogic: false,
    testingGate: false,
    testingReport: false,
    factCheckGate: false,
    deliveredBugAuditReport: false,
    taskToolCalls: 0,
    loadedSkills: new Set(),
    toolFailures: [],
    forkedSubagents: new Set(),
    taskSubagents: new Set(),
    pendingSubagents: new Map(),
    pendingSubagentCalls: new Map(),
    pendingAsyncSubagentJobs: new Map(),
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

function setRouteState(state, route, prompt = '', { classifierResolved = false } = {}) {
  const previousPreflight = state.classifierPreflight;
  state.lastRoute = route;
  state.lastPrompt = String(prompt ?? '');
  state.routeStartedAt = Date.now();
  state.lastSkillUsage = null;
  state.lastSubagentUsage = null;
  state.classifierPreflight = classifierResolved ? null : buildClassifierPreflight(route, prompt, [], { previousPreflight });
  state.pendingSmartGate = null;
  state.smartGate = null;
  state.smartGateCompletionBypasses = [];
  state.evidence = emptyEvidence();
  state.loopGuard = createLoopGuardState();
  state.gateRecovery = createGateRecoveryState();
}

function resetState(state) {
  state.lastRoute = null;
  state.lastPrompt = '';
  state.routeStartedAt = 0;
  state.lastSkillUsage = null;
  state.lastSubagentUsage = null;
  state.classifierPreflight = null;
  state.pendingSmartGate = null;
  state.smartGate = null;
  state.smartGateCompletionBypasses = [];
  state.evidence = emptyEvidence();
  state.loopGuard = createLoopGuardState();
  state.gateRecovery = createGateRecoveryState();
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

async function writeDebugLog(ctx = {}, kind = 'routes', record = {}) {
  try {
    await appendDebugLog({
      cwd: ctx.cwd || process.cwd(),
      kind,
      record,
      env: process.env,
    });
  } catch {
    // Debug logging must never alter route, tool, or gate behavior.
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
  target.classifierPreflight = source.classifierPreflight ?? null;
  target.pendingSmartGate = source.pendingSmartGate ?? null;
  target.smartGate = source.smartGate ?? null;
  target.smartGateCompletionBypasses = source.smartGateCompletionBypasses ?? [];
  target.evidence = source.evidence;
  target.loopGuard = mergeLiveLoopGuardState(liveLoopGuard, source.loopGuard ?? createLoopGuardState());
  target.gateRecovery = readGateRecoveryState(source.gateRecovery);
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
    classifierPreflight: state.classifierPreflight,
    pendingSmartGate: state.pendingSmartGate,
    smartGate: state.smartGate,
    smartGateCompletionBypasses: state.smartGateCompletionBypasses,
    loopGuard: serializeLoopGuardState(state.loopGuard),
    gateRecovery: serializeGateRecoveryState(state.gateRecovery),
    evidence: {
      writingQuality: state.evidence.writingQuality,
      writingLogic: state.evidence.writingLogic,
      testingGate: state.evidence.testingGate,
      testingReport: state.evidence.testingReport,
      factCheckGate: state.evidence.factCheckGate,
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
      pendingAsyncSubagentJobs: [...state.evidence.pendingAsyncSubagentJobs.entries()].map(([jobId, pending]) => ({
        jobId,
        dispatchId: pending.dispatchId,
        agents: [...pending.agents],
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
    classifierPreflight: readClassifierPreflight(value.classifierPreflight),
    pendingSmartGate: readPendingSmartGate(value.pendingSmartGate),
    smartGate: readSmartGateState(value.smartGate),
    smartGateCompletionBypasses: readSmartGateCompletionBypasses(value.smartGateCompletionBypasses),
    loopGuard: readLoopGuardSnapshot(value.loopGuard),
    gateRecovery: readGateRecoveryState(value.gateRecovery),
    evidence,
  };
}

function readClassifierPreflight(value) {
  if (!isRecord(value) || (value.required !== true && value.mode !== 'observe')) return null;
  const mode = value.mode === 'observe' ? 'observe' : 'required';
  return {
    required: mode === 'required',
    mode,
    prompt: isString(value.prompt) ? value.prompt : '',
    fallbackIntent: isString(value.fallbackIntent) ? value.fallbackIntent : 'unknown',
    reasons: Array.isArray(value.reasons) ? value.reasons.filter(isString) : [],
    observations: Array.isArray(value.observations) ? value.observations.filter(isString).slice(-4) : [],
  };
}

function readPendingSmartGate(value) {
  if (!isRecord(value) || typeof value.gateKey !== 'string') return null;
  return {
    gateInstanceId: isString(value.gateInstanceId) ? value.gateInstanceId : legacySmartGateInstanceId(value),
    gateKey: value.gateKey,
    kind: isString(value.kind) ? value.kind : 'unknown',
    routeStartedAt: Number.isFinite(value.routeStartedAt) ? value.routeStartedAt : 0,
    routeIntent: isString(value.routeIntent) ? value.routeIntent : 'unknown',
    context: isString(value.context) ? value.context : '',
    finalOutput: isString(value.finalOutput) ? value.finalOutput : '',
    createdAt: Number.isFinite(value.createdAt) ? value.createdAt : 0,
  };
}

function readSmartGateState(value) {
  if (!isRecord(value) || typeof value.gateKey !== 'string') return null;
  return {
    gateInstanceId: isString(value.gateInstanceId) ? value.gateInstanceId : legacySmartGateInstanceId(value),
    routeStartedAt: Number.isFinite(value.routeStartedAt) ? value.routeStartedAt : 0,
    gateKey: value.gateKey,
    accepted: value.accepted === true,
    ok: value.ok === true,
    decision: isRecord(value.decision) ? value.decision : null,
    validation: isRecord(value.validation) ? value.validation : null,
    resolvedAt: Number.isFinite(value.resolvedAt) ? value.resolvedAt : 0,
  };
}

function readSmartGateCompletionBypasses(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || !isString(item.gateKey)) return [];
    return [{
      routeStartedAt: Number.isFinite(item.routeStartedAt) ? item.routeStartedAt : 0,
      gateKey: item.gateKey,
      kind: isString(item.kind) ? item.kind : 'unknown',
      acceptedAt: Number.isFinite(item.acceptedAt) ? item.acceptedAt : 0,
    }];
  });
}

function legacySmartGateInstanceId(value) {
  const routeStartedAt = Number.isFinite(value?.routeStartedAt) ? value.routeStartedAt : 0;
  const gateKey = isString(value?.gateKey) ? value.gateKey : 'unknown';
  return `${routeStartedAt}:${gateKey}:legacy`;
}

function readEvidenceSnapshot(value) {
  if (!isRecord(value)) return null;
  return {
    writingQuality: value.writingQuality === true,
    writingLogic: value.writingLogic === true,
    testingGate: value.testingGate === true,
    testingReport: value.testingReport === true,
    factCheckGate: value.factCheckGate === true,
    deliveredBugAuditReport: value.deliveredBugAuditReport === true,
    taskToolCalls: Number.isInteger(value.taskToolCalls) ? value.taskToolCalls : 0,
    loadedSkills: new Set(Array.isArray(value.loadedSkills) ? value.loadedSkills.filter(isString) : []),
    toolFailures: readToolFailures(value.toolFailures),
    forkedSubagents: new Set(Array.isArray(value.forkedSubagents) ? value.forkedSubagents.filter(isString) : []),
    taskSubagents: new Set(Array.isArray(value.taskSubagents) ? value.taskSubagents.filter(isString) : []),
    pendingSubagents: readPendingSubagents(value.pendingSubagents),
    pendingSubagentCalls: readPendingSubagentCalls(value.pendingSubagentCalls),
    pendingAsyncSubagentJobs: readPendingAsyncSubagentJobs(value.pendingAsyncSubagentJobs),
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

function readPendingAsyncSubagentJobs(value) {
  const jobs = new Map();
  if (!Array.isArray(value)) return jobs;
  for (const item of value) {
    if (!isRecord(item) || typeof item.jobId !== 'string') continue;
    jobs.set(item.jobId, {
      dispatchId: typeof item.dispatchId === 'string' ? item.dispatchId : '',
      agents: new Set(Array.isArray(item.agents) ? item.agents.filter(isString) : []),
    });
  }
  return jobs;
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
    if (Number.isInteger(item.attempts) && item.attempts > 0) failure.attempts = item.attempts;
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
  return String(prompt ?? '').includes('OMP Enhancer Core')
    && String(prompt ?? '').includes('gate is still open')
    || isLoopGuardRecoveryContinuation(prompt);
}

function isLoopGuardRecoveryContinuation(prompt) {
  return String(prompt ?? '').trimStart().startsWith('LOOP_BREAKER');
}

function isSlashCommandPrompt(prompt) {
  return /^\/[A-Za-z][A-Za-z0-9:_-]*(?:\s|$)/.test(String(prompt ?? '').trim());
}

function isSubagentLaunchPrompt(prompt) {
  return /OMP_REQUIRED_SUBAGENT:/i.test(prompt)
    || /Required skills for this subagent:/i.test(prompt);
}

function buildClassifierPreflight(route, prompt = '', extraReasons = [], { previousPreflight = null } = {}) {
  const reasons = uniqueValues([
    ...classifierPreflightReasons(route, prompt),
    ...extraReasons,
  ]);
  if (!reasons.length) return null;
  const mode = classifierPreflightMode(route, reasons, extraReasons);
  return {
    required: mode === 'required',
    mode,
    prompt: String(prompt ?? ''),
    fallbackIntent: route?.intent ?? 'unknown',
    reasons,
    observations: classifierPreflightObservations(previousPreflight, prompt, mode),
  };
}

function classifierPreflightMode(route, reasons = [], extraReasons = []) {
  if (extraReasons.length) return 'required';
  return reasons.some((reason) => isBlockingClassifierPreflightReason(reason, route)) ? 'required' : 'observe';
}

function isBlockingClassifierPreflightReason(reason = '', route = null) {
  if (route?.intent === 'unknown') return false;
  return reason === 'user reports a concrete routing, workflow, gate, or classifier failure';
}

function classifierPreflightObservations(previousPreflight, prompt = '', mode = 'required') {
  const previous = previousPreflight?.mode === 'observe'
    ? previousPreflight.observations ?? []
    : [];
  const current = cleanText(prompt);
  const observations = uniqueValues([
    ...previous,
    ...(current ? [current] : []),
  ]).slice(-4);
  return mode === 'observe' || observations.length > 1 ? observations : [];
}

function classifierPreflightReasons(route, prompt = '') {
  const text = String(prompt ?? '').toLowerCase();
  const reasons = [];
  if (!text.trim() || !route) return reasons;

  if (route.intent === 'unknown') {
    reasons.push('deterministic route is unknown');
  }
  if (route.intent === 'diagnosis') {
    return reasons;
  }
  if (!isWritingIntent(route.intent) && mentionsRoutingAnomaly(text) && !isClassifierInfrastructureRepairRequest(text)) {
    reasons.push('user reports a concrete routing, workflow, gate, or classifier failure');
  }
  if (isMixedWorkflowBoundary(text)) {
    reasons.push('task mixes writing, implementation, testing, or security workflow signals');
  }
  if (isShortConstructionPrompt(text, prompt)) {
    reasons.push('short construction prompt is a low-confidence rule hit');
  }

  return reasons;
}

function isWritingIntent(intent) {
  return typeof intent === 'string' && intent.startsWith('writing.');
}

function mentionsRoutingAnomaly(text = '') {
  if (isCompletedGateStatusReport(text)) return false;
  if (isClassifierInfrastructureRepairRequest(text)) return false;
  const classifierOrRoute = /(?:classifier|classifer|router|route|routing|路由|分类|分发)/.test(stripRouteFileNames(text));
  const governance = /(?:workflow|gate|subagent|fork|validator|governance|工作流|门禁|验证器|子代理|治理)/.test(text);
  const routeProblem = /(?:wrong|mis[- ]?route|confus|fail|failed|failure|bug|issue|problem|错误|误判|误路由|异常|问题|失败|不顺|不对)/.test(text);
  const governanceProblem = /(?:blocked|block|loop|stuck|\bmissing\s+skills?\b|\bmissing\s+subagent\b|\brequires?\b.{0,20}\bsubagent\b|gate.{0,20}(?:open|block|fail)|workflow.{0,30}(?:wrong|confus|stuck|fail|not smooth)|validator.{0,30}(?:wrong|fail|missing)|挡住|拦住|循环|卡住|缺少.{0,12}(?:skill|技能|subagent|子代理)|仍然.{0,20}要求|重复.{0,20}检查|没有意识到|无法|不能|不顺|触发.{0,20}securityreview)/.test(text);
  return (classifierOrRoute && routeProblem) || (governance && governanceProblem);
}

function isClassifierInfrastructureRepairRequest(text = '') {
  const value = String(text ?? '').toLowerCase();
  const mentionsInfra = /(?:classifier|classifer|router|route|routing|workflow|gate|validator|governance|preflight|smart gate|分类器|分类|路由|工作流|门禁|验证器|治理|预检|智能门禁)/.test(value);
  const mentionsChurn = /(?:loop|churn|spin|stuck|block|blocked|blocking|repeat|repeated|unrelated|irrelevant|打转|循环|卡住|阻止|挡住|拦住|反复|重复|无关|不相关|无意义)/.test(value);
  const asksRepair = /(?:fix|repair|resolve|optimi[sz]e|improve|reduce|avoid|prevent|stop|suppress|adjust|change|update|patch|修复|解决|优化|改进|减少|避免|防止|停止|抑制|调整|修改|更新|处理)/.test(value);
  return mentionsInfra && asksRepair && mentionsChurn;
}

function isClassifierInfrastructureChurnDelivery(output = '') {
  const text = String(output ?? '').toLowerCase();
  if (!text.trim()) return false;
  const mentionsInfra = /(?:classifier|classifer|router|route|routing|workflow|gate|validator|governance|preflight|smart gate|分类器|分类|路由|工作流|门禁|验证器|治理|预检|智能门禁)/.test(text);
  const mentionsChurn = /(?:loop|churn|spin|stuck|blocker|blocked|blocking|repeat|repeated|unrelated|irrelevant|wasted|打转|循环|卡住|阻止|挡住|拦住|反复|重复|无关|不相关|无意义|消耗)/.test(text);
  const saysDeliveryDone = /(?:task|user request|delivery|deliverable|work|用户.*任务|请求|交付|工作).{0,40}(?:complete|completed|done|delivered|finished|已完成|完成|已交付|交付|结束)/.test(text)
    || /(?:complete|completed|done|delivered|finished|已完成|完成|已交付|交付).{0,40}(?:task|user request|delivery|deliverable|work|用户.*任务|请求|工作)/.test(text)
    || /(?:写入|修改).{0,20}(?:第\s*)?\d+\s*(?:[-~至到]\s*\d+\s*)?(?:行|line)/.test(text)
    || /(?:结构|验证|tests?|coverage|检查).{0,20}(?:clean|pass|passed|通过|干净|无误)/.test(text);
  const saysStopInfraWork = /(?:stop|go silent|do not|don't|dont|直接|确认交付|停止|不要|别).{0,50}(?:classifier|classifer|route|routing|workflow|gate|validator|分类器|路由|工作流|门禁|验证器|打转|循环|消耗)/.test(text)
    || /(?:classifier|classifer|route|routing|workflow|gate|validator|分类器|路由|工作流|门禁|验证器).{0,50}(?:stop|go silent|do not|don't|dont|停止|不要|别|消耗|无关|不相关)/.test(text);
  return mentionsInfra && mentionsChurn && saysDeliveryDone && saysStopInfraWork;
}

function stripRouteFileNames(text = '') {
  return String(text).replace(/(?:^|[\s"'`(,[{/\\])(?:[\w.-]+[\\/])*[\w.-]*(?:router|route)[\w.-]*\.(?:c?m?js|tsx?|jsx?|py|go|rs|java|kt|swift|rb|php)\b/g, ' ');
}

function isCompletedGateStatusReport(text = '') {
  return /(?:gate validator|validator|门禁|验证器)/.test(text)
    && /(?:报告已交付|无更多工作|审计完成|已知 bug|已知bug|所有.{0,20}完成|gate complete|final verification summary|no more work)/.test(text);
}

function isMixedWorkflowBoundary(text = '') {
  const directTestAuthoring = /(?:(?:写|编写|生成|创建|补充).{0,20}(?:测试用例|单元测试|测试文件|测试)|(?:write|add|create).{0,20}\btests?\b)/.test(text)
    && !/(?:报告|总结|说明|文档|report|summary|document|notes)/.test(text);
  const reportOnlyAudit = /(?:(?:只|仅).{0,12}(?:报告|列出|指出)|only.{0,12}(?:report|list|flag)|without.{0,20}(?:fixing|changing|modifying).{0,12}code|(?:do not|don't|dont|no).{0,20}(?:fix|change|modify).{0,12}code)/.test(text)
    && /(?:bug|issue|问题|审计|audit|检查|测试|test)/.test(text)
    && /(?:报告|清单|report|findings?|issues?)/.test(text);
  const reportAboutTests = /(?:测试报告|test report|report.{0,20}(?:test|coverage|verification)|(?:测试|覆盖率|验证).{0,12}报告)/.test(text);
  if (reportOnlyAudit || reportAboutTests) return false;
  const actionText = text.replace(/(?:不要|不用|无需|别|不需要|do not|don't|dont|without|no)\s*.{0,12}(?:修复|修改|实现|变更|edit|fix|modify|implement|change)/g, '');
  const writing = !directTestAuthoring
    && /(?:起草|撰写|润色|改写|文案|文字|文本|报告|文档|公告|政策|总结|draft|write|revise|polish|edit|wording|prose|report|document|policy|memo|announcement|summary)/.test(text);
  const implementation = /(?:实现|开发|修复|修改|重构|编码|功能|页面|模块|接口|组件|hook|implement|build|fix|modify|refactor|code|feature|page|module|component|api)/.test(actionText);
  const security = /(?:安全|漏洞|隐私|权限|认证|鉴权|密钥|security|vulnerability|privacy|permission|auth|secret|license|compliance)/.test(text);
  return writing && (implementation || security);
}

function isShortConstructionPrompt(text = '', original = '') {
  if (!/[\u4e00-\u9fff]/.test(String(original))) return false;
  const compact = text.replace(/\s+/g, '');
  if (compact.length > 10) return false;
  return /(?:写|做|建|实现|开发).*(?:功能|页面|模块|组件|接口|api|hook|路由|插件)/.test(compact);
}

function buildClassifierPreflightGateBlock(state, toolName) {
  const preflight = state.classifierPreflight;
  if (!preflight?.required || !toolName || CLASSIFIER_PREFLIGHT_EXEMPT_TOOLS.has(toolName)) return null;
  return {
    block: true,
    reason: classifierPreflightInstructions(state, {
      heading: `OMP Enhancer Core classifier preflight blocked ${toolName}.`,
    }),
  };
}

function buildMissingClassifierPreflightContext(state) {
  if (!state.classifierPreflight?.required) return null;
  return classifierPreflightInstructions(state, {
    heading: 'OMP Enhancer Core classifier preflight is still required.',
  });
}

function classifierPreflightInstructions(state, { heading }) {
  const preflight = state.classifierPreflight;
  const prompt = preflight?.prompt || state.lastPrompt || '';
  return [
    heading,
    `Initial deterministic route: ${preflight?.fallbackIntent ?? state.lastRoute?.intent ?? 'unknown'}.`,
    preflight?.reasons?.length ? `Why classifier is required: ${preflight.reasons.join('; ')}.` : null,
    'Before loading route skills, calling QA/gate tools, forking task subagents, editing files, or finishing, resolve the route through the configured LLM classifier.',
    'Required classifier sequence:',
    '1. Call omp_core_classifier_prompt with the original user task to get the strict JSON schema and classifier prompt.',
    '2. Use OMP Tiny (`modelRoles.tiny`) to produce only the classifier JSON. Do not configure a separate classifier role.',
    '3. Call omp_core_resolve_classification with prompt set to the original user task and output set to the classifier JSON.',
    '4. Continue only under the resolved route, skills, tools, gates, and subagents.',
    prompt ? `Original user task: ${prompt.slice(0, 500)}` : null,
  ].filter(Boolean).join('\n');
}

function maybeRequireClassifierAfterToolFailure(state, toolName, event = {}) {
  if (!CLASSIFIER_PREFLIGHT_FAILURE_TOOLS.has(toolName)) return;
  if (!state.lastRoute || state.lastRoute.intent === 'subagent') return;
  if (!toolFailureSuggestsRouteMismatch(event)) return;
  state.classifierPreflight = buildClassifierPreflight(
    state.lastRoute,
    state.lastPrompt,
    [`${toolName} failed after routing; re-check whether the workflow route is correct`],
  );
}

function toolFailureSuggestsRouteMismatch(event = {}) {
  const text = [
    extractFailureMessage(event),
    extractFailureSummary(event),
    extractRepairHint(event),
  ].filter(Boolean).join('\n').toLowerCase();
  if (!text.trim()) return false;
  return /(?:route mismatch|wrong route|mis[- ]?route|classifier|classification|workflow route|unexpected route|路由误判|误路由|路由不对|分类错误|工作流路由)/.test(text);
}

function buildCompletionRuleGateBlock(state) {
  return buildCompletionRuleGateBlocks(state)
    .find((ruleGate) => !completionSmartGateBypassAllows(state, ruleGate)) ?? null;
}

function buildCompletionRuleGateBlocks(state) {
  const blocks = [];
  const missingSubagentContext = buildMissingSubagentUsageContext(state);
  if (missingSubagentContext) blocks.push(completionRuleGateBlock(state, 'subagent', missingSubagentContext));

  const missingGateContext = buildMissingGateContext({ route: state.lastRoute, state });
  if (missingGateContext) blocks.push(completionRuleGateBlock(state, 'workflow', missingGateContext));

  const missingSkillContext = buildMissingSkillUsageContext(state);
  if (missingSkillContext) blocks.push(completionRuleGateBlock(state, 'skill', missingSkillContext));

  return blocks;
}

function resolveSmartGatePromptRuleGate(state, requestedGateKey = '') {
  const gates = openSmartGateRuleGates(state);
  const requested = String(requestedGateKey ?? '').trim();
  if (requested) return gates.find((gate) => gate.gateKey === requested) ?? null;
  return gates[0] ?? null;
}

function openSmartGateRuleGates(state) {
  const gates = [];
  const pending = pendingSmartGateRuleGate(state);
  if (pending) gates.push(pending);
  for (const gate of buildCompletionRuleGateBlocks(state)) {
    if (!completionSmartGateBypassAllows(state, gate)
      && !gates.some((candidate) => candidate.gateKey === gate.gateKey)) {
      gates.push(gate);
    }
  }
  return gates;
}

function pendingSmartGateRuleGate(state) {
  const pending = state.pendingSmartGate;
  if (!pending || pending.routeStartedAt !== state.routeStartedAt) return null;
  return {
    gateInstanceId: pending.gateInstanceId,
    kind: pending.kind,
    gateKey: pending.gateKey,
    routeIntent: pending.routeIntent,
    context: pending.context,
  };
}

function completionRuleGateBlock(state, kind, context) {
  const routeIntent = state.lastRoute?.intent ?? 'unknown';
  return {
    kind,
    gateKey: `${routeIntent}:${specificGateKind(kind, context)}`,
    routeIntent,
    context,
  };
}

function toolRuleGateBlock(state, kind, context) {
  const routeIntent = state.lastRoute?.intent ?? 'unknown';
  return {
    kind,
    gateKey: `${routeIntent}:${kind}`,
    routeIntent,
    context,
  };
}

function specificGateKind(kind, context = '') {
  const text = String(context).toLowerCase();
  if (kind === 'workflow' && /writing qa|writing task|writing_quality_check|writing_logic_check/.test(text)) return 'writing-qa';
  if (kind === 'workflow' && /omp_test_gate|testing task|bug-audit|test gate|testing gate/.test(text)) return 'testing';
  if (kind === 'workflow' && /fact_check_gate|fact-check|fact checking|factual verification|事实审查|事实核查/.test(text)) return 'fact-check';
  return kind;
}

function createPendingSmartGate(state, ruleGate, finalOutput = '') {
  const createdAt = Date.now();
  return {
    gateInstanceId: ruleGate.gateInstanceId ?? createSmartGateInstanceId(state, ruleGate, createdAt),
    gateKey: ruleGate.gateKey,
    kind: ruleGate.kind,
    routeStartedAt: state.routeStartedAt,
    routeIntent: state.lastRoute?.intent ?? 'unknown',
    context: ruleGate.context,
    finalOutput: String(finalOutput ?? '').slice(0, 4000),
    createdAt,
  };
}

function createSmartGateInstanceId(state, ruleGate, createdAt = Date.now()) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${state.routeStartedAt}:${ruleGate.gateKey}:${createdAt}:${suffix}`;
}

function pendingSmartGateForResolve(state, requestedGateKey = '') {
  const pending = pendingSmartGateRuleGate(state);
  if (!pending) return null;
  const requested = String(requestedGateKey ?? '').trim();
  if (requested && pending.gateKey !== requested) return null;
  return pending;
}

function rejectedSmartGateResult(message) {
  return {
    ok: false,
    accepted: false,
    decision: null,
    validation: { ok: false, errors: [message] },
  };
}

function consumeSmartGateToolAllowance(state, ruleGate) {
  if (!smartGateMatchesPendingRule(state, ruleGate)) return false;
  state.smartGate = null;
  state.pendingSmartGate = null;
  return true;
}

function consumeSmartGateCompletionAllowance(state, ruleGate) {
  if (!isCompletionRuleGateKind(ruleGate.kind)) return false;
  if (!smartGateMatchesPendingRule(state, ruleGate)) return false;
  recordCompletionSmartGateBypass(state, ruleGate);
  state.smartGate = null;
  state.pendingSmartGate = null;
  return true;
}

function smartGateMatchesPendingRule(state, ruleGate) {
  const pending = pendingSmartGateRuleGate(state);
  return state.smartGate?.accepted === true
    && state.smartGate.routeStartedAt === state.routeStartedAt
    && state.smartGate.gateKey === ruleGate.gateKey
    && pending?.gateKey === ruleGate.gateKey
    && pending.gateInstanceId === state.smartGate.gateInstanceId;
}

function isCompletionRuleGateKind(kind = '') {
  return kind === 'subagent' || kind === 'workflow' || kind === 'skill';
}

function completionSmartGateBypassAllows(state, ruleGate) {
  return (state.smartGateCompletionBypasses ?? []).some((item) => (
    item.routeStartedAt === state.routeStartedAt
    && item.gateKey === ruleGate.gateKey
  ));
}

function recordCompletionSmartGateBypass(state, ruleGate) {
  const bypasses = state.smartGateCompletionBypasses ?? [];
  if (!bypasses.some((item) => item.routeStartedAt === state.routeStartedAt && item.gateKey === ruleGate.gateKey)) {
    bypasses.push({
      routeStartedAt: state.routeStartedAt,
      gateKey: ruleGate.gateKey,
      kind: ruleGate.kind,
      acceptedAt: Date.now(),
    });
  }
  state.smartGateCompletionBypasses = bypasses;
}

function smartGateWrappedToolBlock(state, block) {
  const ruleGate = block.ruleGate;
  return {
    block: true,
    reason: [
      block.reason,
      '',
      'Tiny smart-gate override:',
      `Rule gate key: ${ruleGate.gateKey}.`,
      `Use OMP Tiny (\`modelRoles.${smartGateDefaults.modelRole}\`, packaged default ${smartGateDefaults.model}) only if this rule gate is a false positive or equivalent evidence already satisfies the required workflow.`,
      `Required sequence: call omp_core_smart_gate_prompt with gateKey "${ruleGate.gateKey}", use Tiny to produce strict JSON, then call omp_core_resolve_smart_gate. Retry the blocked tool only if the smart gate returns verdict pass; if it returns needs-work, do the listed local follow-up instead of reporting BLOCKERS unless there is a real external blocker.`,
      state.smartGate?.gateKey === ruleGate.gateKey ? formatPreviousSmartGateDecision(state.smartGate) : null,
    ].filter(Boolean).join('\n'),
  };
}

function buildSmartGateRequiredContext(state, ruleGate) {
  const previous = state.smartGate?.routeStartedAt === state.routeStartedAt && state.smartGate.gateKey === ruleGate.gateKey
    ? state.smartGate
    : null;
  return [
    'OMP Enhancer Core smart gate is required.',
    `Rule gate still open: ${ruleGate.gateKey}.`,
    `Tiny model policy: use OMP Tiny (\`modelRoles.${smartGateDefaults.modelRole}\`, packaged default ${smartGateDefaults.model}).`,
    'Required smart-gate sequence:',
    '1. Call omp_core_smart_gate_prompt with finalOutput set to the final answer text you want judged.',
    '2. Use OMP Tiny (`modelRoles.tiny`) to produce only the strict smart-gate JSON.',
    '3. Call omp_core_resolve_smart_gate with output set to that JSON.',
    '4. Continue only if the resolved smart gate returns verdict pass; if it returns needs-work, perform the listed local actions and deliver the focused answer when possible. Report BLOCKERS only for real external blockers such as missing credentials, inaccessible files/services, permission limits, or required user-provided input.',
    previous ? formatPreviousSmartGateDecision(previous) : null,
    '',
    'Deterministic rule gate context:',
    ruleGate.context,
  ].filter(Boolean).join('\n');
}

function formatPreviousSmartGateDecision(previous) {
  if (previous.accepted) return 'Previous smart-gate decision: pass.';
  const validationErrors = previous.validation?.errors?.length
    ? `Validation errors: ${previous.validation.errors.join('; ')}.`
    : null;
  const decision = previous.decision;
  if (!decision) return ['Previous smart-gate decision did not validate.', validationErrors].filter(Boolean).join(' ');
  return [
    `Previous smart-gate decision: ${decision.verdict} (${Math.round(decision.confidence * 100)}% confidence).`,
    decision.reason ? `Reason: ${decision.reason}` : null,
    decision.missing?.length ? `Missing: ${decision.missing.join(', ')}` : null,
    decision.actions?.length ? `Actions: ${decision.actions.join('; ')}` : null,
    validationErrors,
  ].filter(Boolean).join(' ');
}

function formatSmartGateResult(result) {
  if (!result.ok) return `Smart gate rejected: ${result.validation.errors.join('; ')}`;
  const decision = result.decision;
  return [
    `Smart gate verdict: ${decision.verdict}`,
    `Gate: ${decision.gate}`,
    `Accepted: ${result.accepted ? 'yes' : 'no'}`,
    `Confidence: ${Math.round(decision.confidence * 100)}%`,
    decision.reason ? `Reason: ${decision.reason}` : null,
    decision.missing.length ? `Missing: ${decision.missing.join(', ')}` : null,
    decision.actions.length ? `Actions: ${decision.actions.join('; ')}` : null,
  ].filter(Boolean).join('\n');
}

function summarizeSmartGateEvidence(state) {
  const requiredSubagents = subagentRequirements(state.lastRoute?.requiredSubagents);
  const pending = [...state.evidence.pendingSubagents.entries()]
    .map(([agent, item]) => `${agent}:${item.attempts ?? 1}:${[...item.skills].join(',') || 'no-skills'}`);
  const completed = [...completedSubagentsForGate(state)];
  const loadedSkills = [...state.evidence.loadedSkills];
  const delegatedSkills = [...state.evidence.subagentLoadedSkills.entries()]
    .map(([agent, skills]) => `${agent}: ${[...skills].join(', ') || 'none'}`);
  const failures = state.evidence.toolFailures.map((failure) => {
    const attempts = Number.isInteger(failure.attempts) && failure.attempts > 1 ? ` x${failure.attempts}` : '';
    const detail = [failure.summary, failure.message, failure.repairHint].filter(Boolean).join(' ');
    return `${failure.tool}${attempts}${detail ? `: ${detail}` : ''}`;
  });
  return [
    `Route intent: ${state.lastRoute?.intent ?? 'unknown'}`,
    `Required skills: ${(state.lastRoute?.requiredSkills ?? []).join(', ') || 'none'}`,
    `Loaded main-agent skills: ${loadedSkills.join(', ') || 'none'}`,
    `Required subagents: ${requiredSubagents.map(({ agent }) => agent).join(', ') || 'none'}`,
    `Completed subagents: ${completed.join(', ') || 'none'}`,
    `Pending subagents: ${pending.join('; ') || 'none'}`,
    `Delegated loaded skills: ${delegatedSkills.join('; ') || 'none'}`,
    `Skill validator: ${state.lastSkillUsage?.ok ? 'ok' : state.lastSkillUsage?.message ?? 'not recorded'}`,
    `Subagent validator: ${state.lastSubagentUsage?.ok ? 'ok' : state.lastSubagentUsage?.message ?? 'not recorded'}`,
    `Writing QA evidence: ${state.evidence.writingQuality ? 'ok' : 'not recorded'}`,
    `Testing gate evidence: ${state.evidence.testingGate ? 'ok' : 'not recorded'}`,
    `Testing report evidence: ${state.evidence.testingReport ? 'ok' : 'not recorded'}`,
    `Fact-check gate evidence: ${state.evidence.factCheckGate ? 'ok' : 'not recorded'}`,
    `Tool failures: ${failures.join('; ') || 'none'}`,
  ].join('\n');
}

function buildMissingSkillUsageContext(state) {
  const requiredSkills = state.lastRoute?.requiredSkills ?? [];
  if (!requiredSkills.length) return null;
  if (state.lastRoute?.gateMode === 'hidden-coach') return null;
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

function buildRoutedGovernanceContext(state, { route, parentTask = '', visibility = 'automatic' } = {}) {
  const automatic = visibility !== 'explicit';
  if (automatic && route?.intent === 'unknown' && !state.classifierPreflight?.required) return null;

  return [
    buildModelRoutingCheckpointBlock({
      route,
      parentTask,
      preflight: state.classifierPreflight,
      includePassiveGuidance: !automatic,
    }),
    buildPreworkSkillBootstrapBlock(state),
    buildGovernancePromptFragment({
      route,
      parentTask,
      includeModelWorkflowHints: !automatic,
    }),
  ].filter(Boolean).join('\n\n');
}

function buildModelRoutingCheckpointBlock({
  route,
  parentTask = '',
  preflight = null,
  includePassiveGuidance = false,
} = {}) {
  if (!route || route.intent === 'subagent') return null;
  if (preflight?.required) {
    return [
      '### OMP Enhancer Core model routing checkpoint',
      'Classifier preflight: required before route skills, QA/gate tools, task subagents, file edits, or final output.',
      `Initial deterministic route: ${route.intent}.`,
      preflight.reasons?.length ? `Trigger reasons: ${preflight.reasons.join('; ')}.` : null,
      preflight.observations?.length > 1 ? formatClassifierObservationBlock(preflight.observations) : null,
      'Required sequence: call `omp_core_classifier_prompt`, use OMP Tiny (`modelRoles.tiny`) to produce strict classifier JSON, then call `omp_core_resolve_classification` with the original user task and JSON output.',
      'The resolved classifier route supersedes this initial route for skills, tools, gates, and subagents.',
      parentTask ? `Original user task: ${String(parentTask).slice(0, 500)}` : null,
    ].filter(Boolean).join('\n');
  }
  if (!includePassiveGuidance) return null;
  if (preflight?.mode === 'observe') {
    return [
      '### OMP Enhancer Core model routing checkpoint',
      'Classifier observation: non-blocking.',
      `Initial deterministic route: ${route.intent}.`,
      preflight.reasons?.length ? `Observation reasons: ${preflight.reasons.join('; ')}.` : null,
      'Do not block tools or final output only because this route is unknown. Allow ordinary work to proceed while accumulating context.',
      'If a later user turn or tool result clarifies the task as coding, writing, testing, security, config, diagnosis, or release work, call `omp_core_classifier_prompt` with the accumulated context and then `omp_core_resolve_classification`.',
      preflight.observations?.length ? formatClassifierObservationBlock(preflight.observations) : null,
      parentTask ? `Current user task: ${String(parentTask).slice(0, 500)}` : null,
    ].filter(Boolean).join('\n');
  }
  return [
    '### OMP Enhancer Core model routing checkpoint',
    `Initial deterministic route: ${route.intent}.`,
    'The deterministic route is a fallback, not a lock. Before loading skills, using QA tools, or forking task subagents, check whether the user task clearly fits a different OMP workflow.',
    'If the route looks wrong or ambiguous, produce classifier JSON with the allowed classifier schema and call `omp_core_resolve_classification` using the original user task. The resolved classifier route supersedes this initial route for skills, tools, gates, and subagents.',
    'Do not continue under a route that would obviously trigger the wrong workflow gate.',
    parentTask ? `Original user task: ${String(parentTask).slice(0, 500)}` : null,
  ].filter(Boolean).join('\n');
}

function formatClassifierObservationBlock(observations = []) {
  if (!observations.length) return null;
  return [
    'Observed uncertain context:',
    ...observations.map((item, index) => `${index + 1}. ${String(item).slice(0, 240)}`),
  ].join('\n');
}

function classifierPromptContext(state, prompt = '') {
  const observations = state.classifierPreflight?.observations ?? [];
  const current = cleanText(prompt);
  return uniqueValues([
    ...observations,
    ...(current ? [current] : []),
  ]).slice(-4);
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
      missing.length ? 'Direct main-agent work auto-read queue: if you intend to call edit, write, bash, QA, or test gates yourself, read these root skills before the first direct tool call:' : null,
      ...(missing.length ? missing.map(formatMissingSkillReadStep) : []),
      missing.length ? 'Do not use Tiny smart gate for ordinary missing skill reads; read the skills, wait for evidence, then retry the direct tool.' : null,
      'Before calling task, put the matching subagent skill contract into each task assignment. Do not read root route skills in the main agent just to unlock task.',
      'Required task assignment contracts:',
      ...requiredSubagents.flatMap((subagent) => formatSubagentSkillAssignmentStep(subagent, { parentTask, route: state.lastRoute })),
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
  const ruleGate = toolRuleGateBlock(state, `prework:${toolName}`, [
    `OMP Enhancer Core pre-work main-agent skill gate detected missing skills before ${toolName}.`,
    `Missing skills: ${missing.join(', ')}.`,
  ].join('\n'));
  const recovery = recordGateRecovery(state.gateRecovery, {
    gateKey: ruleGate.gateKey,
    reasonCode: 'missing_skill_read',
    doNext: missing.map((skill) => formatMissingSkillReadStep(skill).replace(/^- /, '')).join('; '),
    doNot: `repeat ${toolName} before the skill reads return`,
    after: `retry ${toolName} or continue the original task`,
  });

  return {
    block: false,
    reason: recovery.context,
    additionalContext: recovery.context,
    reasonCode: 'missing_skill_read',
    recovery,
    ruleGate,
  };
}

function buildTaskSubagentSkillGateBlock(state, event = {}) {
  const requiredSubagents = subagentRequirements(state.lastRoute?.requiredSubagents);
  if (!requiredSubagents.length) return null;

  const requiredByAgent = new Map(requiredSubagents.map((item) => [item.agent, item.requiredSkills]));
  let records = collectSubagentTaskRecords(event);
  if (!records.length) {
    return taskSubagentSkillBlock(state, 'task-subagent-contract', [
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

  return taskSubagentSkillBlock(state, 'task-subagent-contract', [
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

function taskSubagentSkillBlock(state, kind, lines) {
  const ruleGate = toolRuleGateBlock(state, kind, lines.filter(Boolean).join('\n'));
  if (consumeSmartGateToolAllowance(state, ruleGate)) return null;
  return {
    block: true,
    reason: ruleGate.context,
    ruleGate,
  };
}

function formatSubagentSkillAssignmentStep({ agent, requiredSkills = [], modelRoles = [] }, { parentTask = '', route = null } = {}) {
  const workflowBriefing = formatWorkflowGateBriefingForAssignment(route);
  return [
    `- ${agent}:`,
    `  OMP_REQUIRED_SUBAGENT: ${agent}`,
    `  OMP_PARENT_TASK: ${formatParentTaskForAssignment(parentTask)}`,
    ...(modelRoles.length ? [
      `  OMP_MODEL_ROLE_HINT: ${modelRoles.join(' -> ')}`,
      '  Use the first available listed OMP model role for this subagent; do not silently downgrade to the generic task role unless those roles are unavailable.',
    ] : []),
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

  const additionalContext = buildLoopRecoveryContext(state.loopGuard);
  await writeDebugLog(ctx, 'loops', buildDebugRecord({
    kind: 'loops',
    prompt: state.lastPrompt,
    route: state.lastRoute,
    reasonCode: detection.kind ?? 'repeated_generation',
    payload: {
      reason: detection.reason,
      repeatedText: detection.repeatedText,
    },
  }));
  const autoContinuation = await queueLoopGuardRecoveryContinuation(pi, state, additionalContext, detection);
  await persistState(pi, state);
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
    autoContinue: autoContinuation.queued,
    details: { loopGuard: detection, autoContinuation },
  };
}

async function queueLoopGuardRecoveryContinuation(pi, state, fallbackContext, detection) {
  if (typeof pi?.sendMessage !== 'function') {
    return { queued: false, reason: 'sendMessage unavailable' };
  }
  if (!state.loopGuard.recoveryPending) {
    return { queued: false, reason: 'recovery context unavailable' };
  }
  if (state.loopGuard.recoveryAttempts >= defaultLoopGuardConfig.maxRecoveryAttempts) {
    return { queued: false, reason: 'recovery attempt limit reached' };
  }
  const content = fallbackContext;
  if (!content) return { queued: false, reason: 'recovery context unavailable' };

  try {
    await pi.sendMessage({
      customType: LOOP_GUARD_RECOVERY_MESSAGE,
      content,
      display: false,
      attribution: 'agent',
      details: {
        reason: detection.reason,
        repeatedText: detection.repeatedText,
      },
    }, {
      deliverAs: 'followUp',
      triggerTurn: true,
    });
    takeLoopRecoveryContext(state.loopGuard);
    return { queued: true, customType: LOOP_GUARD_RECOVERY_MESSAGE };
  } catch (error) {
    return {
      queued: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
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

  const completedSubagents = completedSubagentsForGate(state);
  const pending = pendingRequiredSubagents(state, requiredSubagents);
  const stuck = stuckRequiredSubagents(state, requiredSubagents);
  const runningAsyncJobs = runningRequiredSubagentJobs(state, requiredSubagents);
  const pendingAgents = new Set(pending.map(({ agent }) => agent));
  const missing = requiredSubagents.map(({ agent }) => agent).filter((agent) => !completedSubagents.has(agent) && !pendingAgents.has(agent));
  const missingSkillAssignments = requiredSubagents.flatMap(({ agent, requiredSkills }) => {
    const recorded = state.evidence.subagentSkills.get(agent) ?? new Set();
    const missingSkills = requiredSkills.filter((skill) => !recorded.has(skill));
    return missingSkills.length ? [{ agent, skills: missingSkills }] : [];
  });
  const hasCompleteFinalEvidence = hasCompleteFinalSubagentEvidence(state, requiredSubagents);
  const hasNativeCompletionEvidence = hasNativeSubagentCompletionEvidence(state, requiredSubagents);
  const missingAssignmentContext = hasCompleteFinalEvidence && !hasNativeCompletionEvidence
    ? []
    : missingSubagentAssignmentContext(state, requiredSubagents);
  const unexpectedSkillAssignments = requiredSubagents.flatMap(({ agent }) => {
    const unexpected = [...(state.evidence.unexpectedSubagentSkills.get(agent) ?? new Set())];
    return unexpected.length ? [{ agent, skills: unexpected }] : [];
  });

  const failureContext = formatRecentToolFailures(state, ['task']);
  if (!missing.length && !missingSkillAssignments.length && !missingAssignmentContext.length && !unexpectedSkillAssignments.length && !pending.length && !stuck.length && !runningAsyncJobs.length && !failureContext) return null;

  return [
    'OMP Enhancer Core subagent gate is still open.',
    'Fork the required roles with the OMP task tool before doing or finishing routed work so OMP can render native subagent status lines, and include each role-specific skill list in the task prompt.',
    'If the native task/completion tool is unavailable in this environment, do not keep retrying unavailable tooling; finish the role checkpoints directly and close with complete SUBAGENT_USAGE plus SUBAGENT_RESULT evidence blocks.',
    `Required subagents: ${formatRequiredSubagents(requiredSubagents)}.`,
    pending.length ? `Pending subagent task results: ${formatPendingSubagents(pending)}.` : null,
    stuck.length ? `Potentially stuck subagent tasks: ${formatPendingSubagents(stuck)}. Do not wait indefinitely; retry those task calls with smaller assignments or report BLOCKERS if they keep failing.` : null,
    runningAsyncJobs.length ? `Running background subagent jobs: ${formatRunningSubagentJobs(runningAsyncJobs)}. Wait for their async-result completion before releasing the final answer; do not re-fork while the original job is still running.` : null,
    missing.length ? `Missing subagent completion evidence: ${missing.join(', ')}.` : null,
    missingSkillAssignments.length ? `Missing subagent skill assignments: ${formatMissingSkillAssignments(missingSkillAssignments)}.` : null,
    missingAssignmentContext.length ? `Missing bug-audit assignment context: ${missingAssignmentContext.join(', ')}. Re-run those task calls with OMP_PARENT_TASK and a concrete bug-audit assignment inherited from the user request.` : null,
    unexpectedSkillAssignments.length ? `Unexpected subagent skill assignments: ${formatMissingSkillAssignments(unexpectedSkillAssignments)}.` : null,
    failureContext,
    'Final-answer contract: close with the actual SUBAGENT_USAGE block in assistant output. Native task-tool evidence is preferred for TUI status, but a validated complete SUBAGENT_USAGE block can close the subagent gate when task telemetry is unavailable.',
    state.lastSubagentUsage?.message
      ? `Last validation: ${state.lastSubagentUsage.message}`
      : 'No successful SUBAGENT_USAGE validation has been recorded.',
  ].filter(Boolean).join('\n');
}

function completedSubagentsForGate(state) {
  const completed = new Set(state.evidence.taskSubagents ?? []);
  if (state.lastSubagentUsage?.ok) {
    for (const agent of state.lastSubagentUsage.forked ?? []) completed.add(agent);
    for (const agent of state.evidence.forkedSubagents ?? []) completed.add(agent);
  }
  return completed;
}

function hasCompleteFinalSubagentEvidence(state, requiredSubagents) {
  if (!state.lastSubagentUsage?.ok) return false;
  const completed = completedSubagentsForGate(state);
  return requiredSubagents.every(({ agent }) => completed.has(agent));
}

function hasNativeSubagentCompletionEvidence(state, requiredSubagents) {
  const taskSubagents = state.evidence.taskSubagents ?? new Set();
  return requiredSubagents.some(({ agent }) => taskSubagents.has(agent));
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
  const update = recordTaskProgress(state, event, { status: '', source: 'tool_execution_update' });
  return update ? [update] : [];
}

function recordTaskResult(state, event = {}, { successful } = {}) {
  return recordTaskProgress(state, event, {
    status: successful ? 'completed' : 'failed',
    source: 'tool_result',
  });
}

function recordAsyncResultMessage(state, event = {}) {
  const message = asyncResultMessage(event);
  if (!message) return false;
  let changed = false;
  for (const job of extractAsyncResultJobs(message)) {
    const jobId = asyncResultJobId(job);
    if (!jobId) continue;
    const { records, dispatchId } = pendingRecordsForAsyncJob(state, jobId);
    if (!records.length) continue;
    const jobEvent = taskEventFromAsyncResultJob(job, { dispatchId, jobId, message });
    const progressUpdate = recordTaskProgress(state, jobEvent, { status: '', source: 'async-result' });
    const evidenceChanged = applySubagentTaskCompletionEvidence(state, jobEvent, {
      records,
      dispatchId,
      legacyCompleteWithoutSignal: false,
    });
    changed = changed || Boolean(progressUpdate?.persist) || evidenceChanged;
  }
  return changed;
}

function asyncResultMessage(event = {}) {
  const message = isRecord(event.message) ? event.message : event;
  const customType = cleanText(message.customType ?? event.customType);
  return customType === 'async-result' ? message : null;
}

function extractAsyncResultJobs(message = {}) {
  const details = isRecord(message.details) ? message.details : {};
  const jobs = [];
  for (const key of ['jobs', 'results']) {
    if (Array.isArray(details[key])) jobs.push(...details[key].filter(isRecord));
  }
  for (const key of ['job', 'result']) {
    if (isRecord(details[key])) jobs.push(details[key]);
  }
  if (isRecord(details) && asyncResultJobId(details)) jobs.push(details);
  if (!jobs.length) {
    const text = collectTextCandidates(message.content).join('\n');
    const matches = [...text.matchAll(/\b[\w.-]*job[\w.-]*\b/gi)].map(([match]) => match);
    const jobId = matches.findLast((match) => /[-.]\w|\d/.test(match) && match.toLowerCase() !== 'job') ?? '';
    if (jobId) jobs.push({ jobId, type: 'task', status: 'completed' });
  }
  return jobs;
}

function asyncResultJobId(job = {}) {
  return cleanProgressId(job.jobId ?? job.id ?? job.async?.jobId);
}

function taskEventFromAsyncResultJob(job = {}, { dispatchId = '', jobId = '', message = {} } = {}) {
  const jobDetails = isRecord(job.details) ? { ...job.details } : {};
  const rawStatus = cleanText(job.status ?? job.state ?? jobDetails.status ?? jobDetails.async?.state);
  const asyncState = rawStatus ? normalizeSubagentStatus(rawStatus) : 'completed';
  jobDetails.async = {
    ...(isRecord(jobDetails.async) ? jobDetails.async : {}),
    state: asyncState,
    jobId,
    type: cleanText(job.type ?? jobDetails.async?.type) || 'task',
  };
  if (!Array.isArray(jobDetails.results) && Array.isArray(job.results)) jobDetails.results = job.results;
  if (!Array.isArray(jobDetails.progress) && Array.isArray(job.progress)) jobDetails.progress = job.progress;
  return {
    toolCallId: dispatchId || jobId,
    details: jobDetails,
    content: job.content ?? message.content,
  };
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

function asyncTaskJobId(event = {}) {
  const details = extractTaskDetails(event);
  return cleanProgressId(details.async?.jobId ?? details.jobId ?? event.jobId ?? event.id);
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

function recordSubagentTaskResultEvidence(state, event, { successful }) {
  const { records, dispatchId } = subagentRecordsForToolResult(state, event);
  if (!successful) {
    clearPendingSubagentsForResult(state, { records, dispatchId });
    clearPendingAsyncSubagentJobs(state, { records, dispatchId });
    return Boolean(records.length);
  }

  return applySubagentTaskCompletionEvidence(state, event, { records, dispatchId, legacyCompleteWithoutSignal: true });
}

function recordSubagentTaskProgressEvidence(state, event) {
  const { records, dispatchId } = subagentRecordsForToolResult(state, event);
  return applySubagentTaskCompletionEvidence(state, event, { records, dispatchId, legacyCompleteWithoutSignal: false });
}

function applySubagentTaskCompletionEvidence(state, event, { records = [], dispatchId = null, legacyCompleteWithoutSignal = false } = {}) {
  if (!records.length) return false;
  const decision = resolveSubagentTaskCompletion(event, records, { legacyCompleteWithoutSignal });
  const jobId = asyncTaskJobId(event);
  if (jobId && (decision.active || decision.completed.length || decision.failed.length)) {
    recordPendingAsyncSubagentJob(state, jobId, dispatchId, records);
  }

  let changed = false;
  if (decision.completed.length) {
    for (const record of decision.completed) recordCompletedSubagent(state, record);
    clearPendingSubagentCallRecords(state, {
      records: decision.completed,
      dispatchId: decision.completed.length === records.length ? dispatchId : null,
    });
    clearPendingAsyncSubagentJobs(state, {
      records: decision.completed,
      dispatchId: decision.completed.length === records.length ? dispatchId : null,
    });
    changed = true;
  }

  if (decision.failed.length && !decision.active) {
    clearPendingSubagentsForResult(state, {
      records: decision.failed,
      dispatchId: decision.failed.length === records.length ? dispatchId : null,
    });
    clearPendingAsyncSubagentJobs(state, {
      records: decision.failed,
      dispatchId: decision.failed.length === records.length ? dispatchId : null,
    });
    changed = true;
  }

  return changed || Boolean(jobId && decision.active);
}

function resolveSubagentTaskCompletion(event, records = [], { legacyCompleteWithoutSignal = false } = {}) {
  const details = extractTaskDetails(event);
  const items = taskProgressItems(details);
  const rawDirectStatus = cleanText(details.async?.state ?? details.status);
  const directStatus = rawDirectStatus ? normalizeSubagentStatus(rawDirectStatus) : '';
  const hasDirectStatus = ['running', 'completed', 'failed', 'aborted'].includes(directStatus);
  const hasSignal = hasDirectStatus || items.length > 0;

  if (!hasSignal) {
    return {
      completed: legacyCompleteWithoutSignal ? records : [],
      failed: [],
      active: !legacyCompleteWithoutSignal,
    };
  }

  if (isActiveSubagentStatus(directStatus)) return { completed: completedRecordsFromTaskItems(items, records), failed: [], active: true };
  if (isCompletedSubagentStatus(directStatus) && !items.length) return { completed: records, failed: [], active: false };
  if (isFailedSubagentStatus(directStatus) && !items.length) return { completed: [], failed: records, active: false };

  const completed = completedRecordsFromTaskItems(items, records);
  const failed = failedRecordsFromTaskItems(items, records);
  const active = items.some((item) => isActiveSubagentStatus(taskItemStatus(item)));
  if (!active && completed.length === records.length) return { completed: records, failed: [], active: false };
  if (!active && failed.length === records.length) return { completed: [], failed: records, active: false };
  return { completed, failed, active };
}

function taskProgressItems(details = {}) {
  const progressItems = Array.isArray(details.progress) ? details.progress.filter(isRecord) : [];
  if (progressItems.length) return progressItems;
  return Array.isArray(details.results) ? details.results.filter(isRecord) : [];
}

function completedRecordsFromTaskItems(items = [], records = []) {
  return recordsFromTaskItemsByStatus(items, records, isCompletedSubagentStatus);
}

function failedRecordsFromTaskItems(items = [], records = []) {
  return recordsFromTaskItemsByStatus(items, records, isFailedSubagentStatus);
}

function recordsFromTaskItemsByStatus(items = [], records = [], predicate = () => false) {
  const selected = [];
  const seen = new Set();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const status = taskItemStatus(item);
    if (!predicate(status)) continue;
    const record = recordForTaskItem(item, records, index);
    if (!record || seen.has(record.agent)) continue;
    selected.push(record);
    seen.add(record.agent);
  }
  return selected;
}

function recordForTaskItem(item = {}, records = [], index = 0) {
  const agent = taskItemAgentName(item);
  if (agent) {
    const exact = records.find((record) => record.agent === agent);
    if (exact) return exact;
  }
  return records.length === 1 ? records[0] : records[index] ?? null;
}

function taskItemAgentName(item = {}) {
  const explicit = cleanAgentName(item.role ?? item.subagent ?? item.subagentRole ?? item.requiredSubagent);
  if (explicit && explicit !== 'task') return explicit;
  const parsed = collectSubagentTaskRecords({ input: { tasks: [item] } });
  return parsed[0]?.agent ?? '';
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

function pendingRecordsForAsyncJob(state, jobId) {
  const job = state.evidence.pendingAsyncSubagentJobs.get(jobId);
  if (!job) return { records: [], dispatchId: null };
  const records = [...job.agents].map((agent) => {
    const pending = state.evidence.pendingSubagents.get(agent);
    return pending ? { agent, skills: [...pending.skills], text: [...(pending.texts ?? [])].join('\n') } : { agent, skills: [] };
  });
  return { records, dispatchId: job.dispatchId || null };
}

function recordPendingAsyncSubagentJob(state, jobId, dispatchId, records = []) {
  const id = cleanProgressId(jobId);
  if (!id || !records.length) return;
  const current = state.evidence.pendingAsyncSubagentJobs.get(id);
  const agents = new Set(current?.agents ?? []);
  for (const { agent } of records) agents.add(agent);
  state.evidence.pendingAsyncSubagentJobs.set(id, {
    dispatchId: dispatchId || current?.dispatchId || '',
    agents,
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

function clearPendingAsyncSubagentJobs(state, { records = [], dispatchId = null } = {}) {
  if (!records.length && !dispatchId) {
    state.evidence.pendingAsyncSubagentJobs.clear();
    return;
  }
  const completedAgents = new Set(records.map(({ agent }) => agent));
  for (const [jobId, pending] of state.evidence.pendingAsyncSubagentJobs.entries()) {
    if (dispatchId && pending.dispatchId === dispatchId) {
      state.evidence.pendingAsyncSubagentJobs.delete(jobId);
      continue;
    }
    for (const agent of completedAgents) pending.agents.delete(agent);
    if (!pending.agents.size) state.evidence.pendingAsyncSubagentJobs.delete(jobId);
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

function runningRequiredSubagentJobs(state, requiredSubagents) {
  const required = new Set(requiredSubagents.map(({ agent }) => agent));
  const running = [];
  for (const [jobId, pending] of state.evidence.pendingAsyncSubagentJobs.entries()) {
    const agents = [...pending.agents].filter((agent) => required.has(agent));
    if (!agents.length) continue;
    const progress = state.evidence.taskProgress.get(pending.dispatchId) ?? state.evidence.taskProgress.get(jobId);
    const status = progress?.status ?? 'running';
    if (isActiveSubagentStatus(status)) running.push({ jobId, dispatchId: pending.dispatchId, agents, status });
  }
  return running;
}

function formatRunningSubagentJobs(values) {
  return values.map(({ jobId, dispatchId, agents, status }) => {
    const id = jobId || dispatchId || 'unknown-job';
    return `${id} (${status}, ${agents.join(', ')})`;
  }).join(', ');
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
    completed: [...completedSubagentsForGate(state)],
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
  const failure = { tool: name, attempts: 1 };
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
    attempts: (Number.isInteger(previous.attempts) ? previous.attempts : 1) + (Number.isInteger(current.attempts) ? current.attempts : 1),
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
      const attempts = Number.isInteger(failure.attempts) && failure.attempts > 1 ? ` (${failure.attempts} attempts)` : '';
      return `- ${failure.tool}${attempts}: ${details || 'tool returned a failed result'}`;
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
    if (typeof value === 'string') return { agent: value, requiredSkills: [], modelRoles: [] };
    return {
      agent: value?.agent,
      requiredSkills: Array.isArray(value?.requiredSkills) ? value.requiredSkills : [],
      modelRoles: Array.isArray(value?.modelRoles) ? value.modelRoles : [],
    };
  }).filter(({ agent }) => agent);
}

function formatRequiredSubagents(subagents) {
  return subagents.map(({ agent, requiredSkills, modelRoles = [] }) => {
    const roles = modelRoles.length ? `; models: ${modelRoles.join(' -> ')}` : '';
    return `${agent} [${requiredSkills.join(', ') || 'none'}${roles}]`;
  }).join('; ');
}

function formatMissingSkillAssignments(assignments) {
  return assignments.map(({ agent, skills }) => `${agent} [${skills.join(', ')}]`).join('; ');
}

function uniqueValues(values) {
  return [...new Set(values)];
}
