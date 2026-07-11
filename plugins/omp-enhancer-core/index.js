import {
  buildGovernancePromptFragment,
  buildMissingGateContexts,
  buildSubagentPromptFragment,
  formatWorkflowGateBriefingForAssignment,
  governanceRouteConflictReason,
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
  recordFinalGeneratedText,
  recordGeneratedText,
  recordLoopGuardProgress,
  prepareLoopGuardContinuation,
  serializeLoopGuardState,
  startLoopGuardRun,
  buildLoopRecoveryContext,
} from './src/loop-guard.js';
import {
  createGateRecoveryState,
  readGateRecoveryState,
  recordGateRecovery,
  serializeGateRecoveryState,
} from './src/gate-recovery.js';
import {
  applyGateEvidence,
  createGateControllerState,
  evaluateGateController,
  readGateControllerState,
  resetGateControllerForRoute,
  serializeGateControllerState,
} from './src/gate-controller.js';
import { appendDebugLog, buildDebugRecord } from './src/debug-logger.js';
import { installPluginSkills } from './src/install-skills.js';
import { readRuntimePolicy, useEnforcedRoutePlan } from './src/runtime-policy.js';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import {
  classifyToolAction,
  classifyTestExecutionScope,
  hasUnsafeResultMasking,
  isDryRunAction,
} from './src/action-policy.js';
import {
  analyzeReleasePromptContract,
  createReleaseMutationRecord,
  releaseMutationMatchesPrompt,
  supportsReleaseMutation,
  verifyReleaseMutation,
} from './src/release-evidence.js';
import { externalActionMatchesTool } from './src/external-action-policy.js';
import {
  DOCUMENT_SENTENCE_SEGMENTER_VERSION,
  createDocumentPreservationBaseline,
  evaluateDocumentPreservation,
  requiresDocumentPreservation,
} from './src/document-preservation.js';

const CORE_STATE_ENTRY = 'omp-enhancer-core.state';
const CORE_GATE_OWNER_ENTRY = 'omp-enhancer-core.gate-owner';
const TESTING_EVIDENCE_ENTRY = 'omp-testing-enhancer.evidence';
const CORE_GATE_OWNER_SYMBOL = Symbol.for('omp-enhancer.core.gate-owner');
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
const USER_INPUT_ACTION_BLOCKERS = new Set([
  'external-destructive-action-unsupported',
  'external-action-target-confirmation-required',
  'document-preservation-multi-target-unsupported',
  'document-preservation-scope-confirmation-required',
  'document-preservation-snapshot-too-large',
  'release-target-confirmation-required',
  'release-verification-unsupported',
  'irreversible-approval-required',
  'exclusive-tool-contract-unsatisfiable',
  'network-access-unverifiable',
]);
const REPAIRABLE_ACTION_BLOCKERS = new Set([
  'test-target-authorization-required',
  'workspace-test-artifact-authorization-required',
  'document-preservation-baseline-required',
  'external-action-repair-required',
  'external-target-excluded',
  'external-target-repair-required',
  'irreversible-approval-mismatch-repair-required',
  'release-command-repair-required',
]);
const TRUSTED_HOST_TEST_EXECUTORS = new Set([
  'bash',
  'shell',
  'terminal',
  'exec',
  'exec_command',
  'run',
  'run_command',
  'command',
  // The host-owned functions namespace is trusted only for these exact shell
  // executor names. Provider or attacker-controlled lookalikes are not.
  'functions.bash',
  'functions.shell',
  'functions.terminal',
  'functions.exec',
  'functions.exec_command',
  'functions.run',
  'functions.run_command',
  'functions.command',
]);

export default function registerCoreEnhancer(pi) {
  const state = createState();
  const z = pi.zod?.z ?? pi.z;

  pi.setLabel?.('OMP Enhancer Core');

  pi.registerTool({
    name: 'omp_core_route_task',
    label: 'Route OMP task',
    description: 'Probe a natural-language task and return the required OMP enhancer route, skills, tools, and agent. This model-callable tool never creates or replaces active user-turn authorization.',
    parameters: z?.object ? z.object({ prompt: z.string(), activate: z.boolean().optional() }) : undefined,
    execute: async (_callId, params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const route = routeNaturalLanguageTask({ prompt: params.prompt });
      const shouldActivate = false;
      const probeOnly = !shouldActivate;
      if (shouldActivate) {
        // A model-callable tool is not a trusted user-turn boundary. An initial
        // call may bootstrap otherwise-empty state, but prompt variance on an
        // active route must never mint a new route id or replenish the shared
        // GateController budget. before_agent_start owns genuine turn resets.
        setRouteState(state, route, params.prompt, { newTurn: false });
      } else {
        state.lastRouteProbe = {
          route,
          prompt: String(params.prompt ?? ''),
          changedActiveRoute: false,
          probedAt: Date.now(),
        };
      }
      recordDirectExclusiveToolSuccess(state, 'omp_core_route_task', _callId, params, ctx);
      await persistState(pi, state);
      const suffix = shouldActivate ? '' : '\nRoute probe only: active route state was not changed.';
      return okResult(`${formatRoute(route)}${suffix}${formatRouteProbeGuidance(route, { probeOnly })}`, {
        route,
        activated: shouldActivate,
        probe_only: probeOnly,
        state_changed: shouldActivate,
      });
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
      if (!state.lastRoute || !state.routeStartedAt) {
        const probe = resolveClassificationRoute({
          prompt: String(params.prompt ?? ''),
          output: params.output,
        });
        state.lastRouteProbe = {
          route: probe.route,
          prompt: String(params.prompt ?? ''),
          changedActiveRoute: false,
          probedAt: Date.now(),
        };
        await persistState(pi, state);
        return okResult(`${formatRoute(probe.route)}\nClassifier probe only: no trusted active user route was changed.`, {
          ...probe,
          activated: false,
          probe_only: true,
        });
      }
      if (state.classifierAttempted) {
        return okResult(`${formatRoute(state.lastRoute)}\nClassifier refinement already attempted for this user turn; the active monotonic route was preserved.`, {
          ok: true,
          route: state.lastRoute,
          fallbackRoute: state.lastRoute,
          activated: false,
          repeated: true,
        });
      }
      const previousPreflight = state.classifierPreflight;
      // Classifier output may refine the active user task, but its model-owned
      // prompt argument is not an authorization boundary. Pin resolution to
      // the original active prompt whenever one exists.
      const classificationPrompt = state.lastPrompt || String(params.prompt ?? '');
      const result = resolveClassificationRoute({ prompt: classificationPrompt, output: params.output });
      state.classifierAttempted = true;
      setRouteState(state, result.route, classificationPrompt, {
        classifierResolved: result.ok === true,
        newTurn: false,
      });
      if (!result.ok) {
        const fallbackPreflight = state.classifierPreflight ?? previousPreflight ?? {
          prompt: classificationPrompt,
          fallbackIntent: result.route?.intent ?? state.lastRoute?.intent ?? 'unknown',
          reasons: ['classifier output was invalid; deterministic fallback retained'],
          observations: [],
        };
        state.classifierPreflight = {
          ...fallbackPreflight,
          required: false,
          mode: 'observe',
          attempted: true,
          failed: true,
        };
      }
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
      const requiredSkills = state.lastRoute
        ? routeRequiredSkills(state.lastRoute)
        : params.requiredSkills ?? [];
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
      const requiredSubagents = state.lastRoute
        ? routeRequiredSubagents(state.lastRoute)
        : params.requiredSubagents ?? [];
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
      const result = okResult(formatSubagentStatus(state), { status: buildSubagentStatus(state) });
      recordDirectExclusiveToolSuccess(state, 'omp_core_subagent_status', _callId, _params, ctx);
      await persistState(pi, state);
      return result;
    },
  });

  pi.registerTool({
    name: 'omp_core_governance_prompt',
    label: 'Build governance prompt',
    description: 'Build the governance prompt fragment for a natural-language OMP enhancer route.',
    parameters: z?.object ? z.object({ prompt: z.string().optional() }) : undefined,
    execute: async (_callId, params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const requestedRoute = params.prompt ? routeNaturalLanguageTask({ prompt: params.prompt }) : null;
      const route = state.lastRoute ?? requestedRoute;
      const fragment = buildRoutedGovernanceContext(state, {
        route,
        parentTask: params.prompt ?? state.lastPrompt,
        visibility: 'explicit',
      });
      return okResult(fragment, { route, fragment });
    },
  });


  pi.registerTool({
    name: 'omp_core_install_skills',
    label: 'Install plugin skills',
    description: 'Install all marketplace plugin skills into OMP skill resolution paths (~/.omp/skills/ and managed-skills/). Skills are symlinked from the plugin cache. Idempotent — only creates missing symlinks, never overwrites real skill directories.',
    parameters: z?.object ? z.object({ dryRun: z.boolean().optional() }) : undefined,
    execute: async (_callId, params = {}) => {
      const result = await installPluginSkills({ dryRun: params.dryRun ?? false });
      const summary = [
        `Installed: ${result.installed.length}`,
        `Skipped: ${result.skipped.length}`,
        `Errors: ${result.errors.length}`,
        ...(result.warnings.length ? [`Warnings: ${result.warnings.length}`] : []),
      ].join(', ');
      return okResult(summary, result);
    },
  });

  pi.on?.('session_start', async (_event = {}, ctx = {}) => {
    const restored = restoreStateFromContext(state, ctx);
    if (!restored) resetState(state);
    refreshTestingToolAvailability(state, pi);
    await persistCoreGateOwner(pi);
    return undefined;
  });

  pi.on?.('tool_approval_requested', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    recordTrustedApprovalRequest(state, event, ctx);
    return undefined;
  });

  pi.on?.('tool_approval_resolved', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    recordTrustedApprovalResolution(state, event, ctx);
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
    const reviewChanged = recordAssistantReviewEvidence(state, event);
    if (changed || reviewChanged) await persistState(pi, state);
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
    refreshTestingToolAvailability(state, pi);
    const prompt = extractPrompt(event);
    // Slash commands are owned by OMP or by the registering plugin command handler.
    // Core routing only handles natural-language tasks.
    if (isSlashCommandPrompt(prompt)) return undefined;
    if (isInternalCoreContinuation(prompt)) {
      if ((isLoopGuardRecoveryContinuation(prompt) || /^OMP_GATE_REPAIR\b/.test(String(prompt).trimStart()))
        && state.loopGuard.streamTriggered) {
        prepareLoopGuardContinuation(state.loopGuard);
        await persistState(pi, state);
      }
      return undefined;
    }
    if (isSubagentLaunchPrompt(prompt)) {
      const fragment = buildSubagentPromptFragment({ prompt });
      const injection = injectBeforeAgentSystemPrompt(event, fragment);
      return {
        ...injection,
        route: { intent: 'subagent', agent: null, requiredSkills: [], requiredTools: [], requiredSubagents: [] },
      };
    }
    const inheritedContinuation = shouldInheritUserContinuation(state, prompt);
    const effectivePrompt = inheritedContinuation
      ? `${state.lastPrompt}\nTrusted user continuation: ${prompt}`
      : prompt;
    const route = inheritedContinuation
      ? inheritContinuationRoute(state.lastRoute)
      : routeNaturalLanguageTask({ prompt });
    const preserveExclusiveBudget = inheritedContinuation
      && state.exclusiveToolState
      && (state.exclusiveToolState.status !== 'unused'
        || state.exclusiveToolState.finalCorrectionUsed === true);
    setRouteState(state, route, effectivePrompt, { preserveExclusiveBudget });
    await writeDebugLog(ctx, 'routes', buildDebugRecord({
      kind: 'routes',
      prompt: effectivePrompt,
      route,
      payload: {
        routerMode: route.routerMode ?? null,
        routeObservation: route.routeObservation ?? null,
      },
    }));
    startLoopGuardRun(state.loopGuard, `${route.intent}:${state.routeStartedAt}`);
    await persistState(pi, state);
    const fragment = buildRoutedGovernanceContext(state, { route, parentTask: effectivePrompt, visibility: 'automatic' });
    if (!fragment) return { route };
    return {
      ...injectBeforeAgentSystemPrompt(event, fragment, buildImmediateRouteContract(state)),
      route,
    };
  });

  pi.on?.('tool_call', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    const name = toolEventName(event);
    if (state.actionBoundary?.terminal === true && isCanonicalExactTestRepair(state, name, event)) {
      state.actionBoundary = createActionBoundaryState();
    }
    if (isTerminalOnlyGateState(state.gateController)
      || state.actionBoundary?.terminal === true
      || state.actionBoundary?.awaitingUserReason) {
      return {
        block: true,
        reasonCode: state.actionBoundary?.awaitingUserReason ?? 'protected-action-terminal',
        reason: state.actionBoundary?.awaitingUserReason
          ? formatAwaitingUserToolBlock(state.actionBoundary.awaitingUserReason)
          : 'OMP_GATE_TERMINAL is active. Do not call or run any more tools or commands; produce only the final degraded or blocked status for the user.',
      };
    }
    let protectedBoundary = buildProtectedActionBoundaryBlock(state, name, event, ctx);
    if (protectedBoundary) {
      if (exclusiveToolCallMatchesAllowedTool(state, name)
        && !/^(?:exclusive-tool-|focused-fact-search-)/.test(String(protectedBoundary.reasonCode))) {
        markExclusiveToolBlocked(state, protectedBoundary.reasonCode);
        protectedBoundary = protectedConstraintBlock(
          'exclusive-tool-contract-unsatisfiable',
          `${protectedBoundary.reason} The only user-authorized tool call cannot pass the protected route boundary. Do not inspect, substitute another tool, or retry; report the limitation and ask the user to restate the exact action and input without the conflicting constraint if they want execution.`,
        );
      }
      const denial = recordProtectedActionDenial(state, protectedBoundary, name, event);
      await persistState(pi, state);
      return denial;
    }
    const classifierBlock = buildClassifierPreflightGateBlock(state, name);
    if (classifierBlock) {
      await persistState(pi, state);
      return classifierBlock;
    }
    if (name === 'task') {
      const taskSkillBlock = buildTaskSubagentSkillGateBlock(state, event);
      if (taskSkillBlock) {
        if (taskSkillBlock.block !== false) {
          state.pendingSmartGate = createPendingSmartGate(state, taskSkillBlock.ruleGate, '');
        }
        await persistState(pi, state);
        await writeDebugLog(ctx, 'gates', buildDebugRecord({
          kind: 'gates',
          prompt: state.lastPrompt,
          route: state.lastRoute,
          gateKey: taskSkillBlock.ruleGate?.gateKey,
          reasonCode: taskSkillBlock.reasonCode ?? 'task_subagent_contract',
          payload: { level: taskSkillBlock.recovery?.level ?? (taskSkillBlock.block === false ? 'coach' : 'block') },
        }));
        return taskSkillBlock.block === false ? taskSkillBlock : smartGateWrappedToolBlock(state, taskSkillBlock);
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
    recordExclusiveToolCallStart(state, name, event, ctx);
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
    const failed = isFailedToolEvent(event);
    const pending = isPendingToolEvent(event);
    const successful = isSuccessfulToolEvent(event);
    if (name && successful) recordLoopGuardProgress(state.loopGuard, `tool_result:${name}`);
    const mutationEvidenceChanged = name && recordMutationEvidenceInvalidation(state, name, event, { successful });
    const documentPreservationEvidenceChanged = name && recordDocumentPreservationEvidence(
      state,
      name,
      event,
      { successful, mutationEvidenceChanged },
    );
    const testEvidenceChanged = name && recordObservedTestEvidence(state, name, event, { successful });
    const focusedFactEvidenceBefore = state.evidence.focusedFactEvidence;
    const localFactEvidenceChanged = name && recordFocusedLocalFactEvidence(state, name, event, { successful });
    const focusedFactSearchChanged = name && recordFocusedFactSearchResult(state, name, event, {
      successful,
      pending,
      evidenceRecorded: state.evidence.focusedFactEvidence !== focusedFactEvidenceBefore,
    });
    const securityEvidenceChanged = name && recordSecurityInspectionEvidence(state, name, event, { successful });
    const releaseEvidenceChanged = name && recordReleaseEvidence(state, name, event, { successful, ctx });
    recordTrustedIrreversibleResult(state, name, event, { successful });
    if (name && successful && name !== 'read') clearToolFailures(state, name);
    if (name && failed) {
      recordToolFailure(state, name, event);
      maybeRequireClassifierAfterToolFailure(state, name, event);
    }
    if ((name === 'writing_quality_check' || name === 'writing_logic_check') && successful) state.evidence.writingQuality = true;
    if (name === 'omp_test_gate' && isExplicitPassingGateResult(event)) state.evidence.testingGate = true;
    if (name === 'omp_test_report' && successful) state.evidence.testingReport = true;
    if (name === 'fact_check_gate'
      && !isFocusedLocalFactInspectionRoute(state.lastRoute)
      && isExplicitPassingGateResult(event)) state.evidence.factCheckGate = true;
    if (name === 'task') {
      recordTaskResult(state, event, { successful, pending });
      recordSubagentTaskResultEvidence(state, event, { successful, pending });
    }
    if (name === 'read' && successful) recordReadSkillEvidence(state, event);
    if (name && (isRelevantSuccessfulGateEvidence(name, event)
      || mutationEvidenceChanged || documentPreservationEvidenceChanged
      || testEvidenceChanged || localFactEvidenceChanged || focusedFactSearchChanged
      || securityEvidenceChanged || releaseEvidenceChanged)) {
      state.gateController = applyGateEvidence(state.gateController, {
        routeId: gateControllerRouteId(state),
        evidenceRevision: state.gateController.evidenceRevision + 1,
      });
    }
    const exclusiveDisposition = exclusiveToolResultDisposition(state, name, {
      successful,
      failed,
      pending,
    });
    recordExclusiveToolResult(state, name, event, exclusiveDisposition, ctx);
    await persistState(pi, state);
    return undefined;
  });

  pi.on?.('session_stop', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    if (state.lastRoute?.taskDescriptor?.exclusiveToolContract
      && state.exclusiveToolState?.status === 'succeeded'
      && state.actionBoundary?.awaitingUserReason !== 'exclusive-tool-contract-unsatisfiable'
      && !exclusiveSuccessfulTerminalOutputIsHonest(state, event)) {
      if (state.exclusiveToolState.finalCorrectionUsed !== true) {
        state.exclusiveToolState = {
          ...state.exclusiveToolState,
          finalCorrectionUsed: true,
        };
        const expected = exclusiveSuccessfulExpectedOutput(state.lastPrompt);
        await persistState(pi, state);
        return {
          continue: true,
          additionalContext: [
            'OMP_GATE_TERMINAL: the single exclusive tool call already succeeded and no further tool call is authorized.',
            expected
              ? `Correct only the final text once and return exactly: ${expected}`
              : 'Correct only the final text once so it reflects the successful host result without claiming failure or non-execution.',
            'Do not call a tool, load a skill, inspect, retry, or substitute another method.',
          ].join('\n'),
          details: { reasonCode: 'exclusive-tool-success-output-correction' },
        };
      }
      state.exclusiveToolState = {
        ...state.exclusiveToolState,
        reasonCode: 'exclusive-tool-success-output-correction-budget-exhausted',
      };
      await persistState(pi, state);
      return undefined;
    }
    if (exclusiveToolStopsCompletionRepair(state)) {
      const honestTerminalOutput = exclusiveToolTerminalOutputIsHonest(state, event);
      if (!honestTerminalOutput && state.exclusiveToolState?.finalCorrectionUsed !== true) {
        state.exclusiveToolState = {
          ...state.exclusiveToolState,
          finalCorrectionUsed: true,
        };
        await persistState(pi, state);
        return {
          continue: true,
          additionalContext: [
            'OMP_GATE_TERMINAL: the exclusive one-tool route cannot collect more evidence and no further tool call is authorized.',
            'Do not call a tool, load a skill, inspect, retry, or substitute a method. Correct only the final text once: explicitly state that the requested action was not completed or that the sole observed call failed, and do not claim PASS, SAFE, release, or completion.',
          ].join('\n'),
          details: { reasonCode: 'exclusive-tool-terminal-output-correction' },
        };
      }
      if (!honestTerminalOutput) {
        state.exclusiveToolState = {
          ...state.exclusiveToolState,
          reasonCode: 'exclusive-tool-terminal-correction-budget-exhausted',
        };
        await persistState(pi, state);
        return undefined;
      }
      await persistState(pi, state);
      return undefined;
    }
    if (state.actionBoundary?.awaitingUserReason) {
      const output = extractFinalOutputText(event).trim();
      const honestAwaitingUserOutput = terminalAwaitingUserOutputIsHonest(
        output,
        state.actionBoundary.awaitingUserReason,
      );
      if (!honestAwaitingUserOutput && state.actionBoundary.finalCorrectionUsed !== true) {
        state.actionBoundary.finalCorrectionUsed = true;
        await persistState(pi, state);
        return {
          continue: true,
          additionalContext: [
            'OMP_AWAITING_USER is active and no tool call is authorized.',
            'Correct only the final text once. State that the requested action was not executed or completed, explain the conflicting authorization or missing trusted host capability, and ask the user to restate the exact action without the conflict. Do not claim PASS, success, verification, release, or completion.',
          ].join('\n'),
          details: { reasonCode: 'awaiting-user-terminal-output-correction' },
        };
      }
      if (!honestAwaitingUserOutput) state.actionBoundary.terminal = true;
      await persistState(pi, state);
      return undefined;
    }
    adoptTestingEnhancerEvidence(state, ctx);
    recordFinalOutputEvidence(state, event);
    reconcileSkillUsageFromReadEvidence(state);
    const loopMode = readRuntimePolicy().loopMode;
    const loopRecoveryContext = loopMode === 'legacy' || loopMode === 'enforce'
      ? buildLoopRecoveryStopContext(state, event)
      : null;
    const gateRecords = buildSessionStopGateRecords(state, { loopRecoveryContext });
    if (state.actionBoundary?.terminal === true) {
      state.gateController = {
        ...state.gateController,
        budget: {
          ...state.gateController.budget,
          repairUsed: state.gateController.budget.repairMax,
        },
      };
    }
    const evaluation = evaluateGateController(state.gateController, {
      routeId: gateControllerRouteId(state),
      evidenceRevision: state.gateController.evidenceRevision,
      evidenceDigest: gateEvidenceDigest(state),
      openGates: gateRecords,
      repairActions: [{
        actionKind: 'collect_gate_evidence',
        normalizedResultCode: 'missing_evidence',
        evidenceDigest: gateEvidenceDigest(state),
      }],
    });
    state.gateController = evaluation.state;
    await writeDebugLog(ctx, 'gates', buildDebugRecord({
      kind: 'gates',
      route: state.lastRoute,
      reasonCode: evaluation.decision.kind,
      payload: {
        phase: evaluation.decision.phase,
        openGateCount: evaluation.decision.openGateKeys.length,
        missingEvidenceCodes: evaluation.decision.missingEvidenceCodes,
        budget: evaluation.decision.budget,
        terminalReason: evaluation.decision.terminalReason ?? null,
      },
    }));

    if (evaluation.decision.kind === 'release' || evaluation.decision.kind === 'coach') {
      state.pendingSmartGate = null;
      await persistState(pi, state);
      return undefined;
    }

    await persistState(pi, state);
    const details = { gateDecision: evaluation.decision };
    if (evaluation.decision.kind === 'repair') {
      return {
        continue: true,
        additionalContext: formatGateRepairContext(state, gateRecords, evaluation.decision),
        details,
      };
    }
    if (evaluation.decision.kind === 'terminal') {
      return {
        continue: true,
        additionalContext: formatGateTerminalContext(state, gateRecords, evaluation.decision),
        details,
      };
    }
    return { continue: false, details };
  });
  // Publish the live owner lease only after every synchronous registration
  // succeeded. A partially loaded/discarded core must not suppress Testing's
  // bounded standalone completion owner.
  registerCoreGateOwner(pi);
 }

export function createState() {
  return {
    lastRoute: null,
    lastPrompt: '',
    routeStartedAt: 0,
    lastRouteProbe: null,
    lastSkillUsage: null,
    lastSubagentUsage: null,
    classifierPreflight: null,
    classifierAttempted: false,
    pendingSmartGate: null,
    smartGate: null,
    smartGateCompletionBypasses: [],
    evidence: emptyEvidence(),
    loopGuard: createLoopGuardState(),
    gateRecovery: createGateRecoveryState(),
    gateController: createGateControllerState(),
    trustedApprovals: createTrustedApprovalState(),
    testingToolAvailability: 'unknown',
    actionBoundary: createActionBoundaryState(),
    exclusiveToolState: null,
    // Ephemeral only: the path is authorized by the route and the raw read
    // result is consumed directly from the matching host event. Nothing from
    // this map is serialized into session state.
    pendingDocumentPreservationReads: new Map(),
    focusedFactSearch: null,
  };
}

function registerCoreGateOwner(pi) {
  const marker = coreGateOwnerMarker();
  const ownerSurface = gateOwnerSurface(pi);
  try {
    Object.defineProperty(ownerSurface, CORE_GATE_OWNER_SYMBOL, {
      configurable: true,
      enumerable: false,
      writable: false,
      value: marker,
    });
  } catch {
    try {
      ownerSurface[CORE_GATE_OWNER_SYMBOL] = marker;
    } catch {
      // Persisted markers remain diagnostics; Testing keeps its bounded
      // standalone owner when this live shared lease cannot be installed.
    }
  }
}

function gateOwnerSurface(pi) {
  const events = pi?.events;
  return events && (typeof events === 'object' || typeof events === 'function') ? events : pi;
}

async function persistCoreGateOwner(pi) {
  if (typeof pi?.appendEntry !== 'function') return;
  try {
    await pi.appendEntry(CORE_GATE_OWNER_ENTRY, coreGateOwnerMarker());
  } catch {
    // Marker persistence is advisory; the in-process symbol remains authoritative.
  }
}

function coreGateOwnerMarker() {
  return {
    schemaVersion: 1,
    owner: 'omp-enhancer-core',
    controllerSchemaVersion: 2,
  };
}

function emptyEvidence() {
  return {
    writingQuality: false,
    writingLogic: false,
    testingGate: false,
    testingReport: false,
    factCheckGate: false,
    focusedFactEvidence: null,
    documentPreservationBaseline: null,
    documentPreservationEvidence: null,
    testingEnhancerEvidence: null,
    reviewEvidence: false,
    mainAgentSecurityReview: false,
    securityInspectionObserved: false,
    securityInspectionEvidence: null,
    testCommandEvidence: null,
    releaseActionEvidence: null,
    releaseVerificationEvidence: null,
    releaseVerified: false,
    irreversibleExecution: null,
    irreversibleApproved: false,
    lastDefiniteMutationAt: 0,
    mutationRevision: 0,
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
    subagentResultTexts: new Map(),
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
  const descriptor = route?.taskDescriptor ?? {};
  const constraints = descriptor.constraints ?? {};
  const phases = Array.isArray(descriptor.phases) ? descriptor.phases : [];
  return [
    `Intent: ${route.intent}`,
    `Agent route: ${route.agent ?? 'none'}`,
    route.auditMode ? `Audit mode: ${route.auditMode}` : null,
    `constraints.workspaceWrite: ${constraints.workspaceWrite ?? 'unspecified'}`,
    `constraints.testExecution: ${constraints.testExecution ?? 'unspecified'}`,
    `constraints.networkAccess: ${constraints.networkAccess ?? 'unspecified'}`,
    `constraints.externalWrite: ${constraints.externalWrite ?? 'unspecified'}`,
    `constraints.subagents: ${constraints.subagents ?? 'unspecified'}`,
    `complexity: ${descriptor.complexity ?? 'unknown'}`,
    `phases: ${phases.length ? phases.map(({ kind, domain }) => `${kind}:${domain}`).join(' -> ') : 'none'}`,
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

function formatRouteProbeGuidance(route, { probeOnly = false } = {}) {
  if (!probeOnly) return '';
  const requiredSkills = route?.requiredSkills ?? [];
  if (!requiredSkills.length) return '';
  return [
    '',
    `Returned required skill URIs: ${requiredSkills.map((skill) => `skill://${skill}`).join(', ')}`,
    'Probe guidance: if this audit must judge skill usage, read these returned skills before marking them loaded or missing; do not execute this routed workflow unless the user explicitly activates it.',
  ].join('\n');
}

function isRouteProbeOnlyPrompt(prompt = '') {
  const normalized = normalizeRoutePrompt(prompt).toLowerCase();
  if (!normalized) return false;
  return /(?:tool check only|route\s*probe|probe prompt|probe changed active route|路由行为|路由自检|route\s*check)/.test(normalized)
    || /(?:just|only)\s+(?:check|test|probe).*(?:route|routing)/.test(normalized)
    || /\b(?:route|routing)\b.*(?:only|do not|don't|without|not).*(?:activat|run|execut|start)/.test(normalized)
    || (/(?:omp_core_route_task|route_task)/.test(normalized)
      && /omp_core_subagent_status/.test(normalized)
      && /(?:call exactly|call .*twice|status route|probe|changed active route|只检查|不修改|不运行测试|do not modify|do not run tests)/.test(normalized));
}

function normalizeRoutePrompt(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function shouldInheritUserContinuation(state, prompt = '') {
  if (!isTerseUserContinuation(prompt) || !state?.lastRoute?.taskDescriptor) return false;
  const descriptor = state.lastRoute.taskDescriptor;
  const exclusiveContinuation = descriptor.exclusiveToolContract?.mode === 'exclusive';
  if (!exclusiveContinuation && !['modify', 'create', 'execute'].includes(descriptor.operation)) return false;
  if (descriptor.constraints?.externalWrite === 'required') return false;
  if ((descriptor.risk?.flags ?? []).includes('irreversible-file-operation')) return false;
  return Boolean(state.lastPrompt && state.routeStartedAt);
}

function isTerseUserContinuation(prompt = '') {
  const text = normalizeRoutePrompt(prompt)
    .replace(/[。！？.!?]+$/u, '')
    .trim()
    .toLowerCase()
    .replace(/^(?:please\s+|请\s*|麻烦\s*)/u, '');
  return /^(?:继续(?:吧|执行|实现|修复|开发)?|开始吧|开始(?:执行|实现|修复|开发)(?:吧)?|按(?:照)?(?:这个|该|上述)?计划执行|照(?:这个|该|上述)?方案做|就(?:按)?这么做|执行吧|go ahead|continue|proceed(?: with (?:the|this) plan)?|start now|do it)$/i.test(text);
}

function inheritContinuationRoute(previousRoute) {
  const descriptor = previousRoute.taskDescriptor;
  return {
    ...previousRoute,
    taskDescriptor: {
      ...descriptor,
      provenance: {
        ...descriptor.provenance,
        reasons: [...new Set([...(descriptor.provenance?.reasons ?? []), 'trusted user continuation'])],
      },
    },
    continuation: { inherited: true },
  };
}

function setRouteState(state, route, prompt = '', {
  classifierResolved = false,
  newTurn = true,
  preserveExclusiveBudget = false,
} = {}) {
  const previousPreflight = state.classifierPreflight;
  const previousRouteStartedAt = Number.isFinite(state.routeStartedAt) ? state.routeStartedAt : 0;
  const previousExclusiveToolState = preserveExclusiveBudget ? state.exclusiveToolState : null;
  if (!newTurn && state.routeStartedAt) {
    state.lastRoute = route;
    state.lastRouteProbe = null;
    state.lastPrompt = String(prompt ?? '');
    state.classifierPreflight = classifierResolved ? null : buildClassifierPreflight(route, prompt, [], { previousPreflight });
    state.pendingSmartGate = null;
    state.smartGate = null;
    state.smartGateCompletionBypasses = [];
    return;
  }
  state.lastRoute = route;
  state.lastRouteProbe = null;
  state.lastPrompt = String(prompt ?? '');
  state.routeStartedAt = Math.max(Date.now(), previousRouteStartedAt + 1);
  state.lastSkillUsage = null;
  state.lastSubagentUsage = null;
  state.classifierAttempted = false;
  state.classifierPreflight = classifierResolved ? null : buildClassifierPreflight(route, prompt, [], { previousPreflight });
  state.pendingSmartGate = null;
  state.smartGate = null;
  state.smartGateCompletionBypasses = [];
  state.evidence = emptyEvidence();
  state.pendingDocumentPreservationReads?.clear();
  state.focusedFactSearch = null;
  state.loopGuard = createLoopGuardState();
  state.gateRecovery = createGateRecoveryState();
  state.gateController = resetGateControllerForRoute(state.gateController, {
    routeId: gateControllerRouteId(state),
  });
  state.trustedApprovals = createTrustedApprovalState();
  state.actionBoundary = createActionBoundaryState();
  state.exclusiveToolState = createExclusiveToolState(state.lastRoute, gateControllerRouteId(state));
  if (previousExclusiveToolState && state.exclusiveToolState) {
    state.exclusiveToolState = {
      ...previousExclusiveToolState,
      routeId: gateControllerRouteId(state),
    };
    state.actionBoundary.awaitingUserReason = 'exclusive-tool-contract-unsatisfiable';
  }
  const routeConflict = governanceRouteConflictReason(state.lastRoute);
  if (routeConflict && !state.exclusiveToolState) {
    state.actionBoundary.awaitingUserReason = 'network-access-unverifiable';
  }
}

function resetState(state) {
  state.lastRoute = null;
  state.lastRouteProbe = null;
  state.lastPrompt = '';
  state.routeStartedAt = 0;
  state.lastSkillUsage = null;
  state.lastSubagentUsage = null;
  state.classifierPreflight = null;
  state.classifierAttempted = false;
  state.pendingSmartGate = null;
  state.smartGate = null;
  state.smartGateCompletionBypasses = [];
  state.evidence = emptyEvidence();
  state.pendingDocumentPreservationReads = new Map();
  state.focusedFactSearch = null;
  state.loopGuard = createLoopGuardState();
  state.gateRecovery = createGateRecoveryState();
  state.gateController = createGateControllerState();
  state.trustedApprovals = createTrustedApprovalState();
  state.actionBoundary = createActionBoundaryState();
  state.exclusiveToolState = null;
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
  const trustedPriorExclusiveSuccesses = new Set();
  for (const [entryIndex, entry] of entries.entries()) {
    if (!isCoreStateEntry(entry)) continue;
    const parsed = readStateSnapshot(entry.data, { trustedPriorExclusiveSuccesses });
    if (parsed) {
      snapshot = parsed;
      index = entryIndex;
      if (parsed.exclusiveToolState?.status === 'succeeded'
        && !parsed.exclusiveToolState.reasonCode) {
        trustedPriorExclusiveSuccesses.add(exclusiveToolStateIdentity(parsed.exclusiveToolState));
      }
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
  const liveApprovals = target.trustedApprovals;
  const liveTestingToolAvailability = target.testingToolAvailability;
  const liveFocusedFactSearch = target.focusedFactSearch;
  const liveExclusiveToolState = target.exclusiveToolState;
  target.lastRoute = source.lastRoute;
  target.lastPrompt = source.lastPrompt ?? '';
  target.routeStartedAt = source.routeStartedAt;
  target.lastRouteProbe = source.lastRouteProbe;
  target.lastSkillUsage = source.lastSkillUsage;
  target.lastSubagentUsage = source.lastSubagentUsage;
  target.classifierPreflight = source.classifierPreflight ?? null;
  target.classifierAttempted = source.classifierAttempted === true;
  target.pendingSmartGate = source.pendingSmartGate ?? null;
  target.smartGate = source.smartGate ?? null;
  target.smartGateCompletionBypasses = source.smartGateCompletionBypasses ?? [];
  target.evidence = source.evidence;
  target.loopGuard = mergeLiveLoopGuardState(liveLoopGuard, source.loopGuard ?? createLoopGuardState());
  target.gateRecovery = readGateRecoveryState(source.gateRecovery);
  target.gateController = readGateControllerState(source.gateController, {
    routeId: gateControllerRouteId(source),
  });
  target.trustedApprovals = liveApprovals ?? createTrustedApprovalState();
  target.testingToolAvailability = liveTestingToolAvailability ?? 'unknown';
  target.actionBoundary = source.actionBoundary ?? createActionBoundaryState();
  target.exclusiveToolState = mergeExclusiveToolState(
    liveExclusiveToolState,
    source.exclusiveToolState,
    gateControllerRouteId(source),
  );
  target.focusedFactSearch = mergeLiveFocusedFactSearchState(
    liveFocusedFactSearch,
    source.focusedFactSearch,
    gateControllerRouteId(source),
  );
}

function mergeLiveFocusedFactSearchState(live, restored, routeId = '') {
  const current = live?.routeId === routeId ? live : null;
  const snapshot = restored?.routeId === routeId ? restored : null;
  if (!current) return snapshot;
  if (!snapshot) return current;
  const rank = { started: 1, succeeded: 2, failed: 2 };
  return (rank[current.status] ?? 0) > (rank[snapshot.status] ?? 0)
    ? current
    : snapshot;
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
    lastRouteProbe: state.lastRouteProbe,
    lastPrompt: state.lastPrompt ?? '',
    routeStartedAt: state.routeStartedAt,
    lastSkillUsage: state.lastSkillUsage,
    lastSubagentUsage: state.lastSubagentUsage,
    classifierPreflight: state.classifierPreflight,
    classifierAttempted: state.classifierAttempted === true,
    pendingSmartGate: state.pendingSmartGate,
    smartGate: state.smartGate,
    smartGateCompletionBypasses: state.smartGateCompletionBypasses,
    loopGuard: serializeLoopGuardState(state.loopGuard),
    gateRecovery: serializeGateRecoveryState(state.gateRecovery),
    gateController: serializeGateControllerState(state.gateController),
    actionBoundary: state.actionBoundary,
    exclusiveToolState: state.exclusiveToolState,
    focusedFactSearch: state.focusedFactSearch,
    evidence: {
      writingQuality: state.evidence.writingQuality,
      writingLogic: state.evidence.writingLogic,
      testingGate: state.evidence.testingGate,
      testingReport: state.evidence.testingReport,
      factCheckGate: state.evidence.factCheckGate,
      focusedFactEvidence: state.evidence.focusedFactEvidence,
      documentPreservationBaseline: state.evidence.documentPreservationBaseline,
      documentPreservationEvidence: state.evidence.documentPreservationEvidence,
      testingEnhancerEvidence: state.evidence.testingEnhancerEvidence,
      reviewEvidence: state.evidence.reviewEvidence,
      mainAgentSecurityReview: state.evidence.mainAgentSecurityReview,
      securityInspectionObserved: state.evidence.securityInspectionObserved,
      securityInspectionEvidence: state.evidence.securityInspectionEvidence,
      testCommandEvidence: state.evidence.testCommandEvidence,
      releaseActionEvidence: state.evidence.releaseActionEvidence,
      releaseVerificationEvidence: state.evidence.releaseVerificationEvidence,
      releaseVerified: state.evidence.releaseVerified,
      irreversibleExecution: state.evidence.irreversibleExecution,
      irreversibleApproved: false,
      lastDefiniteMutationAt: state.evidence.lastDefiniteMutationAt,
      mutationRevision: state.evidence.mutationRevision,
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
        mutationRevision: pending.mutationRevision,
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
      subagentResultTexts: [...state.evidence.subagentResultTexts.entries()].map(([agent, texts]) => ({
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

function readStateSnapshot(value, { trustedPriorExclusiveSuccesses = new Set() } = {}) {
  if (!isRecord(value)) return null;
  const evidence = readEvidenceSnapshot(value.evidence);
  if (!evidence) return null;
  const routeId = gateControllerRouteId(value);
  const focusedFactSearch = readFocusedFactSearchState(
    value.focusedFactSearch,
    routeId,
    value.focusedFactSearchRouteId,
  );
  constrainEvidenceToRoute(evidence, routeId);
  if (isFocusedLocalFactInspectionRoute(value.lastRoute)
    && evidence.focusedFactEvidence?.routeId !== routeId
    && focusedFactSearch?.status !== 'failed') evidence.factCheckGate = false;
  return {
    lastRoute: isRecord(value.lastRoute) ? value.lastRoute : null,
    lastRouteProbe: isRecord(value.lastRouteProbe) ? value.lastRouteProbe : null,
    lastPrompt: isString(value.lastPrompt) ? value.lastPrompt : '',
    routeStartedAt: Number.isFinite(value.routeStartedAt) ? value.routeStartedAt : 0,
    lastSkillUsage: isRecord(value.lastSkillUsage) ? value.lastSkillUsage : null,
    lastSubagentUsage: isRecord(value.lastSubagentUsage) ? value.lastSubagentUsage : null,
    classifierPreflight: readClassifierPreflight(value.classifierPreflight),
    classifierAttempted: value.classifierAttempted === true || Boolean(value.lastRoute?.classifier),
    pendingSmartGate: readPendingSmartGate(value.pendingSmartGate),
    smartGate: readSmartGateState(value.smartGate),
    smartGateCompletionBypasses: readSmartGateCompletionBypasses(value.smartGateCompletionBypasses),
    loopGuard: readLoopGuardSnapshot(value.loopGuard),
    gateRecovery: readGateRecoveryState(value.gateRecovery),
    gateController: readGateControllerState(value, {
      routeId: gateControllerRouteId(value),
    }),
    actionBoundary: readActionBoundaryState(value.actionBoundary),
    exclusiveToolState: readExclusiveToolState(
      value.exclusiveToolState,
      gateControllerRouteId(value),
      value.lastRoute?.taskDescriptor?.exclusiveToolContract,
      { trustedPriorExclusiveSuccesses },
    ),
    focusedFactSearch,
    evidence,
  };
}

function readBoundEvidenceRecord(value, expectedSource) {
  const digest = value?.commandDigest ?? value?.inputDigest ?? value?.toolCallIdDigest;
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || value.source !== expectedSource
    || !isString(value.routeId)
    || !/^[a-f0-9]{64}$/.test(String(digest ?? ''))) return null;
  return { ...value };
}

function readFocusedFactEvidenceRecord(value) {
  const record = readBoundEvidenceRecord(value, 'host-focused-fact-inspection');
  const digestArray = (items, { required = false } = {}) => Array.isArray(items)
    && (!required || items.length > 0)
    && items.every((item) => /^[a-f0-9]{64}$/.test(String(item)));
  // Legacy evidence always required a concrete claim path. Only a new record
  // that explicitly stores false may opt into the pathless one-search contract.
  const claimSourceBound = record?.claimSourceBound === undefined
    ? true
    : record.claimSourceBound;
  const grepRecord = record?.toolName === 'grep';
  const readRecord = record?.toolName === 'read';
  if (!record
    || !grepRecord && !readRecord
    || !/^[a-f0-9]{64}$/.test(String(record.resultDigest ?? ''))
    || !digestArray(record.queryTermDigests, { required: grepRecord })
    || typeof claimSourceBound !== 'boolean'
    || !digestArray(record.claimPathDigests, { required: claimSourceBound })
    || !claimSourceBound && record.claimPathDigests.length > 0
    || !digestArray(record.matchedPathDigests)
    || !['no-match', 'claim-only', 'independent-hit', 'unparseable-hit'].includes(record.matchKind)
    || readRecord && (!['claim-only', 'unparseable-hit'].includes(record.matchKind)
      || record.independentMatchObserved !== false)
    || typeof record.independentMatchObserved !== 'boolean'
    || !Number.isFinite(record.observedAt)) return null;
  return {
    ...record,
    claimSourceBound,
    queryTermDigests: uniqueValues(record.queryTermDigests),
    claimPathDigests: uniqueValues(record.claimPathDigests),
    matchedPathDigests: uniqueValues(record.matchedPathDigests),
  };
}

function readFocusedFactSearchState(value, routeId = '', legacyRouteId = null) {
  if (legacyRouteId === routeId && !isRecord(value)) {
    return {
      schemaVersion: 1,
      routeId,
      status: 'started',
      failureCode: null,
      observedAt: 0,
    };
  }
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || value.routeId !== routeId
    || !['started', 'succeeded', 'failed'].includes(value.status)
    || !Number.isFinite(value.observedAt)) return null;
  const failureCode = value.failureCode == null ? null : String(value.failureCode);
  if (value.status === 'failed'
    && !['tool-failed', 'empty-or-unusable-result'].includes(failureCode)) return null;
  if (value.status !== 'failed' && failureCode !== null) return null;
  return {
    schemaVersion: 1,
    routeId,
    status: value.status,
    failureCode,
    observedAt: value.observedAt,
  };
}

function readDocumentPreservationBaselineRecord(value) {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || value.source !== 'host-document-preservation-baseline'
    || !isString(value.routeId)
    || !Number.isFinite(value.observedAt)
    || !isSha256Digest(value.targetPathDigest)
    || !isSha256Digest(value.documentDigest)) return null;
  const exactLiterals = readDigestCountList(value.exactLiterals);
  const polarity = readDigestCountList(value.controlledTerms?.polarity);
  const range = readDigestCountList(value.controlledTerms?.range);
  const modality = readDigestCountList(value.controlledTerms?.modality);
  const coreAnchors = readDigestCountList(value.coreAnchors);
  const scope = value.scope === undefined ? undefined : readDocumentPreservationScope(value.scope);
  const counts = readNonnegativeCountRecord(value.counts, [
    'proseLines', 'factualLines', 'headingLines', 'exactLiterals',
    'polarityTerms', 'rangeTerms', 'modalityTerms', 'coreAnchors',
  ]);
  if (!exactLiterals || !polarity || !range || !modality || !coreAnchors || !counts
    || value.scope !== undefined && !scope) return null;
  return {
    schemaVersion: 1,
    source: 'host-document-preservation-baseline',
    routeId: value.routeId,
    targetPathDigest: value.targetPathDigest,
    documentDigest: value.documentDigest,
    exactLiterals,
    controlledTerms: { polarity, range, modality },
    coreAnchors,
    counts,
    ...(scope ? { scope } : {}),
    observedAt: value.observedAt,
  };
}

function readDocumentPreservationScope(value) {
  if (!isRecord(value)
    || value.mode !== 'explicit-sentence'
    || !['resolved', 'unresolved'].includes(value.status)
    || value.segmenterVersion !== DOCUMENT_SENTENCE_SEGMENTER_VERSION
    || !isSha256Digest(value.contractDigest)) return null;
  if (value.status === 'unresolved') {
    const reasons = new Set([
      'ambiguous-editable-sentence',
      'protected-literal-missing',
      'editable-sentence-out-of-range',
      'protected-heading-missing',
      'protected-literal-ambiguous',
      'protected-literal-in-editable-sentence',
    ]);
    if (!reasons.has(value.reasonCode)) return null;
    const contract = {
      mode: 'explicit-sentence',
      status: 'unresolved',
      segmenterVersion: DOCUMENT_SENTENCE_SEGMENTER_VERSION,
      reasonCode: value.reasonCode,
    };
    if (value.contractDigest !== digestEvidence(`explicit-sentence:${JSON.stringify(contract)}`)) return null;
    return { ...contract, contractDigest: value.contractDigest };
  }
  if (!Array.isArray(value.editableSentenceOrdinals)
    || value.editableSentenceOrdinals.length !== 1
    || !value.editableSentenceOrdinals.every((ordinal) => Number.isSafeInteger(ordinal) && ordinal > 0)
    || !Number.isSafeInteger(value.sentenceCount)
    || value.sentenceCount < value.editableSentenceOrdinals[0]
    || !isSha256Digest(value.immutableSkeletonDigest)
    || !isSha256Digest(value.headingSequenceDigest)) return null;
  const protectedLiteralDigests = readDigestCountList(value.protectedLiteralDigests);
  if (!protectedLiteralDigests?.length) return null;
  const contract = {
    mode: 'explicit-sentence',
    status: 'resolved',
    segmenterVersion: DOCUMENT_SENTENCE_SEGMENTER_VERSION,
    editableSentenceOrdinals: [...value.editableSentenceOrdinals],
    sentenceCount: value.sentenceCount,
    immutableSkeletonDigest: value.immutableSkeletonDigest,
    headingSequenceDigest: value.headingSequenceDigest,
    protectedLiteralDigests,
  };
  if (value.contractDigest !== digestEvidence(`explicit-sentence:${JSON.stringify(contract)}`)) return null;
  return { ...contract, contractDigest: value.contractDigest };
}

function readDocumentPreservationEvidenceRecord(value) {
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || value.source !== 'host-document-preservation-evidence'
    || !isString(value.routeId)
    || !Number.isInteger(value.mutationRevision)
    || value.mutationRevision < 0
    || !Number.isFinite(value.observedAt)
    || !isSha256Digest(value.baselineDigest)
    || !isSha256Digest(value.targetPathDigest)
    || !isSha256Digest(value.documentDigest)
    || typeof value.ok !== 'boolean') return null;
  const allowedReasons = new Set([
    'target-path-mismatch', 'exact-literal-set-changed', 'exact-literal-count-changed',
    'polarity-terms-added', 'polarity-terms-removed',
    'range-terms-added', 'range-terms-removed',
    'modality-terms-added', 'modality-terms-removed',
    'prose-lines-added', 'prose-lines-removed',
    'core-anchors-added', 'core-anchors-dropped',
    'protected-literal-count-changed', 'sentence-count-changed',
    'heading-sequence-changed', 'immutable-scope-changed',
  ]);
  const reasonCodes = Array.isArray(value.reasonCodes)
    ? uniqueValues(value.reasonCodes.filter((reason) => allowedReasons.has(reason)))
    : null;
  if (!reasonCodes || reasonCodes.length !== value.reasonCodes.length || value.ok !== (reasonCodes.length === 0)) return null;
  const checks = {};
  for (const key of ['targetPath', 'exactLiterals', 'polarityTerms', 'rangeTerms', 'modalityTerms', 'proseLines', 'coreAnchors']) {
    const check = value.checks?.[key];
    if (!isRecord(check)
      || typeof check.ok !== 'boolean'
      || !Number.isInteger(check.addedCount)
      || check.addedCount < 0
      || !Number.isInteger(check.removedCount)
      || check.removedCount < 0) return null;
    if (check.applicable !== undefined && typeof check.applicable !== 'boolean') return null;
    checks[key] = {
      ok: check.ok,
      addedCount: check.addedCount,
      removedCount: check.removedCount,
      ...(check.applicable === false ? { applicable: false } : {}),
    };
  }
  let scopeChecks;
  if (value.scopeChecks !== undefined) {
    scopeChecks = {};
    for (const key of ['protectedLiterals', 'sentenceCount', 'headingSequence', 'immutableScope']) {
      const check = value.scopeChecks?.[key];
      if (!isRecord(check)
        || typeof check.ok !== 'boolean'
        || !Number.isInteger(check.addedCount)
        || check.addedCount < 0
        || !Number.isInteger(check.removedCount)
        || check.removedCount < 0) return null;
      scopeChecks[key] = { ok: check.ok, addedCount: check.addedCount, removedCount: check.removedCount };
    }
  }
  const counts = readNonnegativeCountRecord(value.counts, [
    'baselineProseLines', 'observedProseLines',
    'baselineFactualLines', 'observedFactualLines',
    'baselineExactLiterals', 'observedExactLiterals',
    'baselineCoreAnchors', 'observedCoreAnchors',
  ]);
  if (!counts) return null;
  return {
    schemaVersion: 1,
    source: 'host-document-preservation-evidence',
    routeId: value.routeId,
    mutationRevision: value.mutationRevision,
    baselineDigest: value.baselineDigest,
    targetPathDigest: value.targetPathDigest,
    documentDigest: value.documentDigest,
    ok: value.ok,
    reasonCodes,
    checks,
    ...(scopeChecks ? { scopeChecks } : {}),
    counts,
    observedAt: value.observedAt,
  };
}

function readDigestCountList(value) {
  if (!Array.isArray(value)) return null;
  const entries = [];
  const seen = new Set();
  for (const entry of value) {
    if (!isRecord(entry)
      || !isSha256Digest(entry.digest)
      || !Number.isInteger(entry.count)
      || entry.count <= 0
      || seen.has(entry.digest)) return null;
    seen.add(entry.digest);
    entries.push({ digest: entry.digest, count: entry.count });
  }
  return entries;
}

function readNonnegativeCountRecord(value, keys = []) {
  if (!isRecord(value)) return null;
  const record = {};
  for (const key of keys) {
    if (!Number.isInteger(value[key]) || value[key] < 0) return null;
    record[key] = value[key];
  }
  return record;
}

function isSha256Digest(value) {
  return /^[a-f0-9]{64}$/.test(String(value ?? ''));
}

function constrainEvidenceToRoute(evidence, routeId) {
  for (const key of [
    'focusedFactEvidence', 'documentPreservationBaseline', 'documentPreservationEvidence',
    'securityInspectionEvidence', 'testCommandEvidence', 'releaseActionEvidence',
    'releaseVerificationEvidence', 'irreversibleExecution',
  ]) {
    if (evidence[key]?.routeId !== routeId) evidence[key] = null;
  }
  evidence.releaseVerified = evidence.releaseVerified === true
    && releaseEvidencePairMatches(evidence.releaseActionEvidence, evidence.releaseVerificationEvidence);
}

function releaseEvidencePairMatches(actionEvidence, verificationEvidence) {
  return Boolean(actionEvidence
    && verificationEvidence
    && actionEvidence.routeId === verificationEvidence.routeId
    && isRecord(actionEvidence.policy)
    && actionEvidence.policy.schemaVersion === 1
    && /^[a-f0-9]{64}$/.test(String(actionEvidence.policy.targetFingerprint ?? ''))
    && verificationEvidence.actionCommandDigest === actionEvidence.commandDigest
    && verificationEvidence.policyDigest === digestEvidence(JSON.stringify(actionEvidence.policy)));
}

function gateControllerRouteId(state = {}) {
  const startedAt = Number.isFinite(state.routeStartedAt) ? state.routeStartedAt : 0;
  return `route:${startedAt || 'unknown'}`;
}

function routeRequiredSkills(route) {
  const skills = useDescriptorCeilingProjection(route)
    ? route.routePlan?.requiredSkills ?? []
    : route?.requiredSkills ?? [];
  const constraints = route?.taskDescriptor?.constraints ?? {};
  return skills.filter((skill) => {
    if (constraints.testExecution === 'forbidden'
      && ['test-driven-development', 'ai-regression-testing'].includes(skill)) return false;
    if (constraints.subagents === 'forbidden' && skill === 'subagent-driven-development') return false;
    return true;
  });
}

function routeRequiredTools(route) {
  const tools = useDescriptorCeilingProjection(route)
    ? route.routePlan?.requiredTools ?? []
    : route?.requiredTools ?? [];
  if (route?.taskDescriptor?.constraints?.testExecution !== 'forbidden') return tools;
  return tools.filter((toolName) => !/^omp_test_/i.test(toolName));
}

function routeRequiredSubagents(route) {
  const constraints = route?.taskDescriptor?.constraints ?? {};
  if (constraints.subagents === 'forbidden') return [];
  if (!useDescriptorCeilingProjection(route)) return route?.requiredSubagents ?? [];
  const planned = route.routePlan?.requiredSubagents ?? [];
  const legacyByAgent = new Map(
    subagentRequirements(route?.requiredSubagents).map((item) => [item.agent, item]),
  );
  return planned.map((entry) => {
    const agent = typeof entry === 'string' ? entry : entry?.agent;
    const legacy = legacyByAgent.get(agent);
    return {
      ...(legacy ?? {}),
      ...(typeof entry === 'object' && entry ? entry : {}),
      agent,
      requiredSkills: [...new Set([
        ...(legacy?.requiredSkills ?? []),
        ...(Array.isArray(entry?.requiredSkills) ? entry.requiredSkills : []),
      ])],
    };
  }).filter((item) => item.agent);
}

function useDescriptorCeilingProjection(route) {
  const constraints = route?.taskDescriptor?.constraints ?? {};
  return useEnforcedRoutePlan(route)
    || constraints.testExecution === 'forbidden'
    || constraints.subagents === 'forbidden';
}

function routeForRuntime(route) {
  if (!route) return route;
  const requiredSubagents = routeRequiredSubagents(route);
  return {
    ...route,
    requiredSkills: routeRequiredSkills(route),
    requiredTools: routeRequiredTools(route),
    requiredSubagents,
    shouldForkSubagents: requiredSubagents.length > 0,
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
    attempted: value.attempted === true,
    failed: value.failed === true,
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
  const releaseActionEvidence = readBoundEvidenceRecord(value.releaseActionEvidence, 'host-release-action');
  const releaseVerificationEvidence = readBoundEvidenceRecord(value.releaseVerificationEvidence, 'host-release-verification');
  const focusedFactEvidence = readFocusedFactEvidenceRecord(value.focusedFactEvidence);
  const documentPreservationBaseline = readDocumentPreservationBaselineRecord(value.documentPreservationBaseline);
  const documentPreservationEvidence = readDocumentPreservationEvidenceRecord(value.documentPreservationEvidence);
  const securityInspectionEvidence = readBoundEvidenceRecord(value.securityInspectionEvidence, 'host-security-inspection');
  return {
    writingQuality: value.writingQuality === true,
    writingLogic: value.writingLogic === true,
    testingGate: value.testingGate === true,
    testingReport: value.testingReport === true,
    factCheckGate: value.factCheckGate === true,
    focusedFactEvidence,
    documentPreservationBaseline,
    documentPreservationEvidence,
    testingEnhancerEvidence: readTestingEnhancerEvidence(value.testingEnhancerEvidence),
    reviewEvidence: value.reviewEvidence === true,
    mainAgentSecurityReview: value.mainAgentSecurityReview === true,
    securityInspectionEvidence,
    securityInspectionObserved: securityInspectionEvidence?.complete === true,
    testCommandEvidence: readBoundEvidenceRecord(value.testCommandEvidence, 'host-tool-result'),
    releaseActionEvidence,
    releaseVerificationEvidence,
    releaseVerified: value.releaseVerified === true
      && releaseEvidencePairMatches(releaseActionEvidence, releaseVerificationEvidence),
    irreversibleExecution: readBoundEvidenceRecord(value.irreversibleExecution, 'host-tool-approval'),
    // Legacy booleans cannot grant either execution authority or completion.
    irreversibleApproved: false,
    lastDefiniteMutationAt: Number.isFinite(value.lastDefiniteMutationAt) ? Math.max(0, value.lastDefiniteMutationAt) : 0,
    mutationRevision: Number.isInteger(value.mutationRevision) ? Math.max(0, value.mutationRevision) : 0,
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
    subagentResultTexts: readSubagentAssignments(value.subagentResultTexts),
    taskProgress: readTaskProgress(value.taskProgress),
    testAnalysis: isRecord(value.testAnalysis) ? value.testAnalysis : null,
    testContext: isRecord(value.testContext) ? value.testContext : null,
    testGate: isRecord(value.testGate) ? value.testGate : null,
    testReport: isRecord(value.testReport) ? value.testReport : null,
  };
}

function readTestingEnhancerEvidence(value) {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (!isString(value.routeId) || !isString(value.runId)) return null;
  if (!['pending', 'passed', 'failed'].includes(value.status)) return null;
  if (!/^[a-f0-9]{64}$/.test(String(value.evidenceDigest ?? ''))) return null;
  return {
    schemaVersion: 1,
    routeId: value.routeId,
    runId: value.runId,
    status: value.status,
    pending: value.pending === true,
    passed: value.passed === true,
    failed: value.failed === true,
    blockers: Array.isArray(value.blockers) ? value.blockers.filter(isString).slice(0, 16) : [],
    evidenceDigest: value.evidenceDigest,
    evidenceRevision: Number.isInteger(value.evidenceRevision) ? Math.max(0, value.evidenceRevision) : 0,
    updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
  };
}

function adoptTestingEnhancerEvidence(state, ctx = {}) {
  const entries = ctx.sessionManager?.getBranch?.();
  if (!Array.isArray(entries)) return false;
  const expectedRouteId = state.gateController?.routeId;
  if (!expectedRouteId) return false;

  let evidence = null;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.customType !== TESTING_EVIDENCE_ENTRY) continue;
    evidence = readTestingEnhancerEvidence(entry.data);
    if (evidence) break;
  }
  if (!evidence || evidence.routeId !== expectedRouteId) return false;
  if (!evidence.runId || evidence.runId === 'testing-unscoped') return false;
  if (evidence.updatedAt && evidence.updatedAt < state.routeStartedAt) return false;
  if (state.evidence.lastDefiniteMutationAt > 0
    && (!evidence.updatedAt || evidence.updatedAt < state.evidence.lastDefiniteMutationAt)) return false;
  const previous = state.evidence.testingEnhancerEvidence;
  if (previous?.evidenceDigest === evidence.evidenceDigest
    && previous?.evidenceRevision === evidence.evidenceRevision) return false;

  state.evidence.testingEnhancerEvidence = evidence;
  if (evidence.status === 'passed' && evidence.passed) {
    state.evidence.testingGate = true;
    state.gateController = applyGateEvidence(state.gateController, {
      routeId: gateControllerRouteId(state),
      evidenceRevision: state.gateController.evidenceRevision + 1,
    });
  } else if (evidence.status === 'failed' && evidence.failed) {
    state.evidence.testingGate = false;
  }
  return true;
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
      mutationRevision: Number.isInteger(item.mutationRevision) ? Math.max(0, item.mutationRevision) : 0,
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
  return /^(?:OMP_GATE_REPAIR|OMP_GATE_TERMINAL)\b/.test(String(prompt ?? '').trimStart())
    || String(prompt ?? '').includes('OMP Enhancer Core')
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
  state.classifierPreflight = {
    ...preflight,
    required: false,
    mode: 'observe',
    attempted: true,
    failed: false,
  };
  return null;
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
    'Do not print XML or <tool_call> text. Make actual tool calls only.',
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

  for (const missingGate of buildMissingGateContexts({
    route: routeForRuntime(state.lastRoute),
    state,
  })) {
    blocks.push(completionRuleGateBlock(state, 'workflow', missingGate.context, missingGate.key));
  }
  if (stateRequiresObservedTestCommand(state)
    && state.evidence.testingGate
    && !hasFreshRouteScopedTestCommandEvidence(state)) {
    blocks.push(completionRuleGateBlock(state, 'workflow', [
      'OMP Enhancer Core has recorded a passing Testing Enhancer gate, but the required host-observed test command evidence is still missing.',
      'Do not rerun omp_test_gate: that gate has already passed. Run the relevant local test command through a host shell or command tool and use its real successful result.',
      'Dry runs, masked failures, model-authored summaries, and test results from an older route or from before the latest workspace mutation do not satisfy this evidence boundary.',
    ].join('\n'), 'testing'));
  }

  const missingSkillContext = buildMissingSkillUsageContext(state);
  if (missingSkillContext) blocks.push(completionRuleGateBlock(state, 'skill', missingSkillContext));

  return blocks;
}

function stateRequiresObservedTestCommand(state) {
  return state.lastRoute?.taskDescriptor?.constraints?.testExecution === 'required';
}

function hasFreshRouteScopedTestCommandEvidence(state) {
  const evidence = state.evidence?.testCommandEvidence;
  const observedAt = evidence?.observedAt;
  const routeStartedAt = Number.isFinite(state.routeStartedAt) ? state.routeStartedAt : 0;
  const mutationRevision = Number.isInteger(state.evidence?.mutationRevision)
    ? state.evidence.mutationRevision
    : 0;
  const lastMutationAt = Number.isFinite(state.evidence?.lastDefiniteMutationAt)
    ? state.evidence.lastDefiniteMutationAt
    : 0;
  return Boolean(evidence
    && evidence.schemaVersion === 1
    && evidence.source === 'host-tool-result'
    && evidence.routeId === gateControllerRouteId(state)
    && /^[a-f0-9]{64}$/.test(String(evidence.commandDigest ?? ''))
    && /^[a-f0-9]{64}$/.test(String(evidence.resultDigest ?? ''))
    && Number.isFinite(observedAt)
    && observedAt >= routeStartedAt
    && observedAt >= lastMutationAt
    && evidence.mutationRevision === mutationRevision);
}

function buildSessionStopGateRecords(state, { loopRecoveryContext = null } = {}) {
  const records = [];
  if (state.classifierPreflight?.required) {
    state.classifierPreflight = {
      ...state.classifierPreflight,
      required: false,
      mode: 'observe',
      attempted: state.classifierPreflight.attempted === true,
    };
  }

  if (state.actionBoundary?.terminal === true) {
    records.push(sessionGateRecord({
      gateKey: 'action-boundary',
      reasonCode: 'protected_action_denials_exhausted',
      missingEvidenceCodes: ['constraint_violation'],
      protection: 'protected',
      context: 'Repeated protected-action denials exhausted the route boundary. Do not call more tools or claim the task succeeded; report the violated user constraint and the incomplete action.',
    }, state));
  }

  for (const ruleGate of buildCompletionRuleGateBlocks(state)) {
    const protection = completionGateProtection(ruleGate);
    const softBypass = protection !== 'protected'
      && (completionSmartGateBypassAllows(state, ruleGate)
        || consumeSmartGateCompletionAllowance(state, ruleGate));
    if (softBypass) continue;
    records.push(sessionGateRecord({
      gateKey: ruleGate.gateKey,
      missingEvidenceCodes: completionMissingEvidenceCodes(ruleGate),
      protection,
      context: ruleGate.context,
    }, state));
  }

  const requiredGateKeys = new Set(
    (state.lastRoute?.routePlan?.gateRequirements ?? [])
      .filter((gate) => gate.mode === 'required')
      .map((gate) => gate.key),
  );
  if (isDocumentPreservationRoute(state)
    && state.evidence.mutationRevision > 0
    && !hasFreshDocumentPreservationEvidence(state)) {
    records.push(sessionGateRecord({
      gateKey: 'document-preservation',
      reasonCode: 'preservation_invariant',
      missingEvidenceCodes: ['preservation_invariant'],
      protection: 'soft',
      context: documentPreservationRepairContext(state),
    }, state));
  }
  if (requiredGateKeys.has('review-evidence') && !hasReviewEvidence(state)) {
    records.push(sessionGateRecord({
      gateKey: 'review',
      missingEvidenceCodes: ['review_gate'],
      protection: 'soft',
      context: [
        'Required review evidence is still open. Complete the routed reviewer checkpoint, or for an explicitly focused main-agent task provide concrete multiline evidence without copying instruction placeholders:',
        'REVIEW_EVIDENCE',
        'Scope: state the target and change actually reviewed',
        'Findings: state the concrete findings actually observed',
        'OpenBlockers: state none only when no blocker remains; otherwise list the blockers',
        'Verdict: use PASS only when the review actually passes; otherwise report the blocking verdict',
      ].join('\n'),
    }, state));
  }
  if (requiredGateKeys.has('security-evidence') && !hasSecurityReviewEvidence(state)) {
    records.push(sessionGateRecord({
      gateKey: 'security',
      missingEvidenceCodes: ['review_gate'],
      protection: 'protected',
      context: [
        'Protected security gate is open. Complete the routed security review and provide this exact multiline evidence block without unsupported risk claims:',
        'SECURITY_REVIEW',
        'Scope: <reviewed file and any callers actually inspected>',
        'Findings: <supported findings, or none confirmed in the inspected scope>',
        'Evidence: <concrete boundary, caller, or sink evidence; a function name or missing validation alone is insufficient>',
        'OpenBlockers: none',
        'Verdict: COMPLETE',
      ].join('\n'),
    }, state));
  }
  if (requiredGateKeys.has('release-approval') && !state.evidence.releaseVerified) {
    records.push(sessionGateRecord({
      gateKey: 'release',
      missingEvidenceCodes: ['release_verification'],
      protection: 'protected',
      context: 'Protected release gate is open. Do not claim or repeat a publish, push, deploy, or upgrade until a successful release action and verification are recorded.',
    }, state));
  }
  if (requiredGateKeys.has('irreversible-approval') && !hasTrustedIrreversibleCompletion(state)) {
    records.push(sessionGateRecord({
      gateKey: 'irreversible',
      missingEvidenceCodes: ['user-approval-required'],
      protection: 'protected',
      context: 'Protected irreversible-operation gate is open. A trusted host approval event is required; route text, model output, and tool arguments cannot grant it. Do not delete, wipe, or clear files or caches.',
    }, state));
  }
  if (loopRecoveryContext) {
    records.push(sessionGateRecord({
      gateKey: 'legacy:loop',
      reasonCode: 'legacy_loop_recovery_pending',
      missingEvidenceCodes: ['non_repeated_progress'],
      protection: 'protected',
      context: loopRecoveryContext,
    }, state));
  }
  return mergeSessionGateRecords(records);
}

function sessionGateRecord({
  gateKey,
  reasonCode = 'missing_evidence',
  missingEvidenceCodes = [],
  protection = 'soft',
  context = '',
}, state) {
  return {
    gateKey,
    reasonCode,
    missingEvidenceCodes,
    protection,
    evidenceDigest: gateEvidenceDigest(state),
    context,
  };
}

function completionGateProtection(ruleGate = {}) {
  const gateKind = ruleGate.gateKind || specificGateKind(ruleGate.kind, ruleGate.context);
  if (ruleGate.kind === 'workflow' && gateKind === 'fact-check') {
    return 'protected';
  }
  return 'soft';
}

function completionMissingEvidenceCodes(ruleGate = {}) {
  if (ruleGate.kind === 'skill') return ['skill_usage'];
  if (ruleGate.kind === 'subagent') return ['review_gate'];
  const gateKind = ruleGate.gateKind || specificGateKind(ruleGate.kind, ruleGate.context);
  if (gateKind === 'writing-qa') return ['writing_qa'];
  if (gateKind === 'testing') return ['testing_gate'];
  if (gateKind === 'fact-check') return ['review_gate'];
  return ['missing_evidence'];
}

function mergeSessionGateRecords(records = []) {
  const rank = { coach: 0, soft: 1, protected: 2 };
  const merged = new Map();
  for (const record of records) {
    const previous = merged.get(record.gateKey);
    if (!previous) {
      merged.set(record.gateKey, { ...record, missingEvidenceCodes: [...record.missingEvidenceCodes] });
      continue;
    }
    previous.missingEvidenceCodes = [...new Set([
      ...previous.missingEvidenceCodes,
      ...record.missingEvidenceCodes,
    ])].sort();
    if (rank[record.protection] > rank[previous.protection]) previous.protection = record.protection;
    previous.context = [previous.context, record.context].filter(Boolean).join('\n\n');
  }
  return [...merged.values()];
}

function hasSecurityReviewEvidence(state) {
  return hasQualifiedSecuritySubagentEvidence(state)
    || (state.lastRoute?.taskDescriptor?.constraints?.subagents === 'forbidden'
      && state.evidence.mainAgentSecurityReview === true
      && state.evidence.securityInspectionEvidence?.routeId === gateControllerRouteId(state)
      && state.evidence.securityInspectionEvidence?.complete === true
      && hasHostObservedSkills(state, ['security-review', 'security-scan']));
}

function hasQualifiedSecuritySubagentEvidence(state) {
  const requirement = subagentRequirements(routeRequiredSubagents(state.lastRoute))
    .find(({ agent }) => agent === 'ecc-security-reviewer');
  if (!requirement || !state.evidence.taskSubagents.has(requirement.agent)) return false;
  const assigned = [...(state.evidence.subagentSkills.get(requirement.agent) ?? new Set())];
  const loaded = [...(state.evidence.subagentLoadedSkills.get(requirement.agent) ?? new Set())];
  const securitySkills = ['security-review', 'security-scan'];
  const hasSkills = securitySkills.every((skill) => (
    assigned.some((candidate) => skillNamesEquivalent(skill, candidate))
    && loaded.some((candidate) => skillNamesEquivalent(skill, candidate))
  ));
  if (!hasSkills) return false;
  return [...(state.evidence.subagentResultTexts.get(requirement.agent) ?? new Set())]
    .some((text) => isStructuredSecurityReview(text));
}

function hasHostObservedSkills(state, required = []) {
  const loaded = [...state.evidence.loadedSkills];
  return required.every((skill) => loaded.some((candidate) => skillNamesEquivalent(skill, candidate)));
}

function hasReviewEvidence(state) {
  const completed = completedSubagentsForGate(state);
  return state.evidence.reviewEvidence === true
    || completed.has('reviewer')
    || completed.has('ecc-code-reviewer')
    || completed.has('fact-reviewer')
    || completed.has('fact-cross-checker');
}

function hasFreshDocumentPreservationEvidence(state) {
  const baseline = state.evidence.documentPreservationBaseline;
  const evidence = state.evidence.documentPreservationEvidence;
  const routeId = gateControllerRouteId(state);
  return Boolean(baseline
    && evidence
    && baseline.routeId === routeId
    && evidence.routeId === routeId
    && evidence.targetPathDigest === baseline.targetPathDigest
    && evidence.baselineDigest === digestEvidence(`baseline:${JSON.stringify(documentPreservationBaselinePayload(baseline))}`)
    && evidence.mutationRevision === state.evidence.mutationRevision
    && evidence.ok === true);
}

function documentPreservationRepairContext(state) {
  const evidence = state.evidence.documentPreservationEvidence;
  const issues = evidence?.routeId === gateControllerRouteId(state)
    && evidence.mutationRevision === state.evidence.mutationRevision
    ? evidence.reasonCodes
    : [];
  return [
    'Document preservation evidence is still open for this explicitly fact-preserving edit.',
    issues.length ? `Host-observed invariant failures: ${issues.join(', ')}.` : 'The host did not observe a usable old/new document snapshot for the current mutation.',
    'Restore the original factual proposition or use a minimal equivalent rephrase. Preserve exact values, dates, citations, polarity, quantifiers, range terms, modality, and the claim core; keeping only the number is not sufficient.',
    'Use one direct edit on the authorized document and then read it back. Do not run tests, use the network, fork subagents, or claim that a self-authored REVIEW_EVIDENCE block overrides this host evidence.',
  ].join('\n');
}

function gateEvidenceDigest(state) {
  return `revision-${state.gateController?.evidenceRevision ?? 0}`;
}

function isTerminalOnlyGateState(controller = {}) {
  return (controller.phase === 'degraded' || controller.phase === 'blocked')
    && (controller.budget?.terminalUsed ?? 0) > 0
    && Object.keys(controller.openGates ?? {}).length > 0;
}

function formatGateRepairContext(state, records, decision) {
  return [
    'OMP_GATE_REPAIR',
    `Gate status: collecting. Shared route budget: ${decision.budget.repairUsed}/${decision.budget.repairMax} repairs; ${decision.budget.terminalUsed}/${decision.budget.terminalMax} terminal-only continuations.`,
    `Open gates (${records.length}) and all missing evidence:`,
    ...records.map((record) => `- ${record.gateKey} [${record.protection}]: ${record.missingEvidenceCodes.join(', ')}`),
    '',
    'Perform one combined evidence-repair pass for all open gates. Do not repeat a failed action without new relevant evidence.',
    ...records.map((record) => record.context).filter(Boolean),
  ].join('\n');
}

function formatGateTerminalContext(state, records, decision) {
  const blocked = decision.phase === 'blocked';
  return [
    'OMP_GATE_TERMINAL',
    `Final terminal status: ${blocked ? 'BLOCKED' : 'DEGRADED'}.`,
    'Do not call more tools or commands. Produce only one concise user-facing final status.',
    blocked
      ? 'Protected security, release, fact, irreversible, or action-boundary evidence is still missing; do not claim success or perform the protected action.'
      : 'Low-risk workflow evidence remains unverified; clearly state what was not completed and do not claim it passed.',
    `Terminal reason: ${decision.terminalReason ?? 'missing_evidence'}.`,
    'Open gates and missing evidence:',
    ...records.map((record) => `- ${record.gateKey}: ${record.missingEvidenceCodes.join(', ')}`),
  ].join('\n');
}

function resolveSmartGatePromptRuleGate(state, requestedGateKey = '') {
  const gates = openSmartGateRuleGates(state);
  const requested = String(requestedGateKey ?? '').trim();
  if (requested) return gates.find((gate) => gate.gateKey === requested) ?? null;
  return gates[0] ?? null;
}

function openSmartGateRuleGates(state) {
  const pending = pendingSmartGateRuleGate(state);
  return pending ? [pending] : [];
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

function completionRuleGateBlock(state, kind, context, gateKind = '') {
  const routeIntent = state.lastRoute?.intent ?? 'unknown';
  const normalizedGateKind = gateKind || specificGateKind(kind, context);
  return {
    kind,
    gateKind: normalizedGateKind,
    gateKey: `${routeIntent}:${normalizedGateKind}`,
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
    'Do not print XML or <tool_call> text. Make actual tool calls only.',
    'Use writing_quality_check, not write_quality_check.',
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
    decision.actions?.length ? `Actions: ${decision.actions.map(normalizeSmartGateActionText).join('; ')}` : null,
    validationErrors,
  ].filter(Boolean).join(' ');
}

function normalizeSmartGateActionText(value) {
  return String(value ?? '').replace(/\bwrite_quality_check\b/g, 'writing_quality_check');
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
  const requiredSubagents = subagentRequirements(routeRequiredSubagents(state.lastRoute));
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
    `Required skills: ${routeRequiredSkills(state.lastRoute).join(', ') || 'none'}`,
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
  const requiredSkills = routeRequiredSkills(state.lastRoute);
  if (!requiredSkills.length) return null;
  if (state.lastRoute?.gateMode === 'hidden-coach') return null;
  if (state.lastSkillUsage?.ok) return null;
  const failureContext = formatRecentToolFailures(state, ['read', 'omp_core_validate_skill_usage']);
  const requiredSubagents = subagentRequirements(routeRequiredSubagents(state.lastRoute));

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
  const governedRoute = routeForRuntime(route);
  if (governedRoute.taskDescriptor?.exclusiveToolContract?.mode === 'exclusive'
    && state.actionBoundary?.awaitingUserReason === 'exclusive-tool-contract-unsatisfiable'
    && state.exclusiveToolState?.status !== 'unused') {
    return [
      '## OMP Enhancer Core Exhausted Exclusive Tool Route',
      '',
      `The prior exclusive tool budget is already ${state.exclusiveToolState?.status ?? 'unavailable'}.`,
      'Do not call any tool, reload a skill, inspect another source, retry the prior input, or substitute another method.',
      'Report exactly that no additional action was performed and the prior result is unchanged; do not restate PASS, success, or completion.',
      'A terse continuation does not authorize a second call. To request another execution, the user must restate the exact tool action and input as a new explicit instruction.',
    ].join('\n');
  }
  if (governanceRouteConflictReason(governedRoute)
    || governedRoute.taskDescriptor?.exclusiveToolContract?.mode === 'exclusive') {
    return buildGovernancePromptFragment({
      route: governedRoute,
      parentTask,
      includeModelWorkflowHints: false,
    });
  }

  return [
    buildModelRoutingCheckpointBlock({
      route: governedRoute,
      parentTask,
      preflight: state.classifierPreflight,
      includePassiveGuidance: !automatic,
    }),
    buildPreworkSkillBootstrapBlock(state),
    buildGovernancePromptFragment({
      route: governedRoute,
      parentTask,
      includeModelWorkflowHints: !automatic,
    }),
  ].filter(Boolean).join('\n\n');
}

function injectBeforeAgentSystemPrompt(event = {}, fragment = '', immediateContract = '') {
  const existing = Array.isArray(event.systemPrompt)
    ? event.systemPrompt.filter((block) => typeof block === 'string' && block.length > 0)
    : typeof event.systemPrompt === 'string' && event.systemPrompt.length > 0
      ? [event.systemPrompt]
      : [];
  const systemPrompt = [...existing, String(fragment)];

  // Current OMP consumes the returned systemPrompt block array. Keep the
  // additionalContext mirror for older hosts and the public test/debug shape.
  event.systemPrompt = systemPrompt;
  event.additionalContext = [event.additionalContext, fragment].filter(Boolean).join('\n\n');
  return {
    systemPrompt,
    additionalContext: fragment,
    ...(immediateContract ? {
      message: {
        customType: 'omp-enhancer-core.route-contract',
        content: immediateContract,
        display: false,
        attribution: 'agent',
      },
    } : {}),
  };
}

function focusedFactExactVerdictOnlyRequested(prompt = '') {
  const text = activeUnquotedTerminalInstructionText(prompt);
  if (!/FACT_VERDICT\s*:\s*(?:INSUFFICIENT|SUPPORTED|CONTRADICTED)/iu.test(text)) return false;
  return /\b(?:return|respond|output|report)\s+(?:(?:only|exactly)\s+){1,2}(?:one\s+of\s*:?\s*)?FACT_VERDICT\b/iu.test(text)
    || /(?:只|仅)(?:需|要)?(?:返回|输出|报告)|(?:精确|严格)(?:地)?(?:返回|输出|报告)/u.test(text);
}

function buildImmediateRouteContract(state) {
  const route = state.lastRoute;
  if (!route) return '';
  const reasons = new Set(route.taskDescriptor?.provenance?.reasons ?? []);
  if (reasons.has('exclusive route task diagnostic probe')) {
    return [
      'OMP Enhancer Core immediate route contract:',
      'Call omp_core_route_task exactly once with the user-supplied probe prompt copied byte-for-byte, including terminal punctuation. Do not call any other tool or execute the probed task. Return the route output and any explanation explicitly requested by the user in the first completion response.',
    ].join('\n');
  }
  if (reasons.has('exclusive subagent status diagnostic probe')) {
    return [
      'OMP Enhancer Core immediate route contract:',
      'Call omp_core_subagent_status exactly once. Do not call any other tool. Return only the user-requested status literal in the first completion response.',
    ].join('\n');
  }
  const exclusiveContract = route.taskDescriptor?.exclusiveToolContract;
  if (exclusiveContract?.mode === 'exclusive'
    && state.actionBoundary?.awaitingUserReason === 'exclusive-tool-contract-unsatisfiable'
    && state.exclusiveToolState?.status !== 'unused') {
    return [
      'OMP Enhancer Core exhausted exclusive-tool contract:',
      `Do not call ${exclusiveContract.allowedTools?.[0] ?? 'the prior tool'} or any other tool. The one-call budget is already ${state.exclusiveToolState?.status ?? 'unavailable'}.`,
      'Report exactly that no additional action was performed and the prior result is unchanged; do not restate PASS, success, or completion. A terse continuation cannot authorize a retry; the user must restate the exact action and input in a new explicit instruction.',
    ].join('\n');
  }
  if (exclusiveContract?.mode !== 'exclusive' && governanceRouteConflictReason(route)) {
    return [
      'OMP Enhancer Core immediate execution boundary:',
      'Do not call any tool. The requested repository-controlled test cannot prove the explicit no-network constraint without a real host network sandbox.',
      'Do not inspect, load skills, call QA/status tools, substitute another method, or retry. Report once that execution did not occur and ask the user to restate the exact action and input without the conflicting constraint, or with the required trusted host capability explicitly available.',
    ].join('\n');
  }
  if (exclusiveContract?.mode === 'exclusive') {
    if (state.exclusiveToolState?.status === 'blocked') {
      const networkConflict = state.exclusiveToolState.reasonCode === 'exclusive-tool-network-sandbox-required';
      return [
        'OMP Enhancer Core immediate exclusive-tool contract:',
        networkConflict
          ? `Do not call ${route.taskDescriptor?.testExecutionCommand ?? exclusiveContract.allowedTools[0]} or any other tool. A repository-controlled test cannot verify the explicit no-network constraint without a real host network sandbox.`
          : 'Do not call any tool. The requested single-tool constraint conflicts with the protected evidence contract or does not bind one unambiguous input.',
        'Do not inspect, load skills, call QA/status tools, substitute a method, or retry. In the first response, report that execution did not occur and ask the user to restate the exact action and input without the conflict if they want it performed.',
      ].join('\n');
    }
    const allowedTool = exclusiveContract.allowedTools[0];
    if (isExactTestExecutionRoute(route)) {
      return [
        'OMP Enhancer Core immediate exclusive-tool contract:',
        `Use the ${allowedTool} tool exactly once with the exact authorized command: ${route.taskDescriptor.testExecutionCommand}.`,
        'Do not read files, load skills, call QA/status tools, add flags or commands, substitute another method, or retry after failure. After the host result, follow the user-requested final response format in the first completion response.',
      ].join('\n');
    }
    if (isFocusedLocalFactInspectionRoute(route) && allowedTool === 'read') {
      return [
        'OMP Enhancer Core immediate exclusive-tool contract:',
        `Use read exactly once for ${exclusiveContract.input?.target}. Do not call grep, search, skills, fact_check_* tools, or any other method, and do not retry after failure.`,
        'One bounded read cannot establish independent repository-wide support. You may explain the observed limitation, but end the first response with exactly one line: FACT_VERDICT: INSUFFICIENT.',
      ].join('\n');
    }
    if (isFocusedLocalFactInspectionRoute(route) && allowedTool === 'grep') {
      const exactVerdictOnly = focusedFactExactVerdictOnlyRequested(state.lastPrompt);
      return [
        'OMP Enhancer Core immediate exclusive-tool contract:',
        'Use exactly one built-in repository grep for the claim. Do not retry, switch search methods, or call the heavyweight fact toolchain.',
        exactVerdictOnly
          ? 'After the host result, return only one evidence-consistent FACT_VERDICT line exactly as requested. Do not add prose, Markdown, headings, quoting, prefixes, or suffixes.'
          : 'Explain the host-observed evidence as requested, then end the first response with exactly one evidence-consistent FACT_VERDICT line.',
      ].join('\n');
    }
    return [
      'OMP Enhancer Core immediate exclusive-tool contract:',
      `Call only ${allowedTool} exactly once with the bound input. Do not load skills, call workflow/QA tools, delegate, substitute another method, or retry after failure.`,
      'If the user requested an exact final literal, copy it byte-for-byte in the first completion response without Markdown backticks, quoting, prefixes, suffixes, or explanatory prose.',
    ].join('\n');
  }
  if (isExactTestExecutionRoute(route)) {
    const commandOnly = reasons.has('exclusive command-only exact test requested');
    return commandOnly
      ? [
        'OMP Enhancer Core immediate route contract:',
        'Run only the exact authorized test command once, using the single direct shell tool requested by the user. Do not read files, load skills, call QA/status tools, or add another command. Return the requested result literal in the first completion response.',
      ].join('\n')
      : [
        'OMP Enhancer Core immediate route contract:',
        'Read only the runner configuration needed for the exact target, load any routed direct-work skills, then run one direct command naming every authorized test target once and in order. Do not start a bug audit, generate tests, substitute an aggregate suite, or call unrelated QA/status tools.',
      ].join('\n');
  }
  if (isFocusedLocalFactInspectionRoute(route)) {
    const exactVerdictOnly = focusedFactExactVerdictOnlyRequested(state.lastPrompt);
    return [
      'OMP Enhancer Core immediate route contract:',
      exactVerdictOnly
        ? 'Use exactly one built-in repository grep for the claim. Do not retry, switch search methods, or call the heavyweight fact toolchain. After the host result, return only one evidence-consistent FACT_VERDICT line exactly as requested, with no prose or Markdown.'
        : 'Use exactly one built-in repository grep for the claim. Do not retry, switch search methods, or call the heavyweight fact toolchain. Explain the observed evidence as requested, then end the first completion response with exactly one evidence-consistent FACT_VERDICT line.',
    ].join('\n');
  }

  const directMainAgent = routeRequiredSubagents(route).length === 0;
  const missingSkills = directMainAgent ? missingReadSkills(state) : [];
  const requiredTools = directMainAgent ? routeRequiredTools(route) : [];
  const requiredGateKeys = new Set(
    (route.routePlan?.gateRequirements ?? [])
      .filter(({ mode }) => mode === 'required')
      .map(({ key }) => key),
  );
  const needsDirectReview = directMainAgent && requiredGateKeys.has('review-evidence');
  if (!missingSkills.length && !requiredTools.length && !needsDirectReview) return '';

  const lines = ['OMP Enhancer Core immediate route contract:'];
  if (missingSkills.length) {
    lines.push(
      `FIRST, before any repository read, edit, shell, QA, or workflow tool, read every required skill and wait for all results: ${missingSkills.map((skill) => `skill://${skill}`).join(', ')}.`,
      'Do not defer these skill reads to session_stop or a completion repair.',
    );
  }
  if (requiredTools.length) {
    lines.push(`AFTER the skill reads, use the routed workflow tools as needed: ${requiredTools.join(', ')}.`);
  }
  if (needsDirectReview) {
    lines.push(
      'Only if the static review actually passes with no open blocker, include concrete review evidence in the FIRST completion response using this multiline shape:',
      'REVIEW_EVIDENCE',
      'Scope: write the target and change actually reviewed',
      'Findings: write the concrete static review findings',
      'OpenBlockers: write none only when no blocker remains; otherwise list the real blockers',
      'Verdict: use PASS only when the review actually passes',
      'If the review finds a blocker, report the real blockers and omit a PASS verdict; never copy placeholder text as evidence.',
    );
  }
  return lines.join('\n');
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
  const requiredSubagents = subagentRequirements(routeRequiredSubagents(state.lastRoute));
  const missing = missingReadSkills(state);
  const parentTask = state.lastPrompt;
  if (!requiredSubagents.length && !missing.length) return null;

  if (isExactTestExecutionRoute(state.lastRoute)) {
    return [
      '### OMP Enhancer Core exact-test skill preflight',
      'This route authorizes one complete list of exact test files, not a broader audit workflow.',
      'Read the missing direct-work skill(s) before the test command:',
      ...missing.map(formatMissingSkillReadStep),
      'Use read for runner configuration, then run one direct command naming every authorized test target once and in order. Do not call bug-audit analysis tools, generate tests, omit targets, or substitute an aggregate suite.',
    ].join('\n');
  }

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

function buildProtectedActionBoundaryBlock(state, toolName = '', event = {}, ctx = {}) {
  const descriptor = state.lastRoute?.taskDescriptor;
  if (!toolName) return null;
  const exclusiveToolBlock = exclusiveToolBoundaryBlock(state, toolName, event, ctx);
  if (exclusiveToolBlock) return exclusiveToolBlock;
  const text = toolActionText(event);
  const action = classifyToolAction({ toolName, text });
  if (isKnownFirstPartyNetworkAction(toolName, event)) action.networkAccess = true;
  if (toolName === 'omp_core_install_skills') {
    action.workspaceWrite = firstToolInputRecord(event).dryRun !== true;
  }
  const approvalToken = consumeTrustedApprovalToken(state, event, toolName);

  if (!descriptor) {
    if (action.workspaceWrite || action.subagent || action.testExecution || action.networkAccess || action.externalWrite || action.opaqueEffects || action.unverifiableNetworkEffects || action.irreversible) {
      return protectedConstraintBlock(
        'active-route-required',
        'A trusted before_agent_start user route is required before tools may write files, run tests, delegate work, publish, or perform destructive actions.',
      );
    }
    return null;
  }
  const constraints = descriptor.constraints ?? {};

  const focusedSearchKind = isFocusedLocalFactInspectionRoute(state.lastRoute)
    ? classifyFocusedFactSearchAction(toolName, text)
    : 'none';
  if (focusedSearchKind !== 'none') {
    const routeId = gateControllerRouteId(state);
    if (state.focusedFactSearch?.routeId === routeId) {
      return protectedConstraintBlock(
        'focused-fact-search-budget-exhausted',
        `This focused offline route authorizes one repository search, and that budget is already ${state.focusedFactSearch.status}. Do not launch a parallel, broader, wrapped, namespaced, or alternate search method; use the recorded result or report the failed search as insufficient evidence.`,
      );
    }
    if (focusedSearchKind !== 'trusted-grep') {
      return protectedConstraintBlock(
        'focused-fact-search-method-forbidden',
        'This focused offline route permits only one direct built-in grep call. Shell grep/rg, namespaced grep variants, search/glob tools, and other alternate repository-search methods are outside the route contract. Use the built-in grep once; do not retry through another method.',
      );
    }
    state.focusedFactSearch = {
      schemaVersion: 1,
      routeId,
      status: 'started',
      failureCode: null,
      observedAt: Date.now(),
    };
  }

  if (action.subagent && constraints.subagents === 'forbidden') {
    return protectedConstraintBlock('subagents-forbidden', 'The user explicitly forbade subagents; route plans and classifier hints cannot delegate this task.');
  }
  const testScope = classifyTestExecutionScope({ toolName, text });
  const testAttempt = testScope !== 'none';
  const fullSuiteExcluded = (descriptor.testExclusions ?? []).includes('full-suite');
  if (fullSuiteExcluded && testAttempt && testScope !== 'focused') {
    return protectedConstraintBlock(
      'test-kind-forbidden',
      'The user excluded the full test suite. Only one directly classifiable focused test target or an explicitly named unit, integration, e2e, or smoke suite is authorized; aggregate, wrapped, generic, or opaque runners are forbidden.',
    );
  }
  const testKind = testAttempt
    ? toolName === 'omp_test_browser_check' ? 'e2e' : testKindForCommand(text)
    : null;
  const testAllowlist = Array.isArray(descriptor.testAllowlist) ? descriptor.testAllowlist : [];
  if (testAttempt && testAllowlist.length
    && (testScope !== 'focused' || !testKind || !testAllowlist.includes(testKind))) {
    return protectedConstraintBlock(
      'test-kind-authorization-required',
      `The user authorized only ${testAllowlist.join(', ')} tests. ${testKind ? `${testKind} is outside that allowlist.` : 'This generic test command does not prove which test kind it will execute.'} Use an explicitly named allowed test target; do not retry with an alias or aggregate suite.`,
    );
  }
  const exactTestTargets = Array.isArray(descriptor.testExecutionTargets) ? descriptor.testExecutionTargets : [];
  if (testAttempt && exactTestTargets.length) {
    const observedTestTargets = testExecutionTargetsInCommand(text);
    const outsideTarget = observedTestTargets.find((target) => !exactTestTargets.some((allowed) => exactTestPathMatches(target, allowed)));
    const incompleteOrReorderedTargets = observedTestTargets.length !== exactTestTargets.length
      || observedTestTargets.some((target, index) => !exactTestPathMatches(target, exactTestTargets[index]));
    const trustedExecutionTarget = directTestTargetsWithinTrustedRoot(exactTestTargets, event, ctx, {
      requireRootCwd: true,
      requireExisting: false,
    });
    if (hasUnsafeResultMasking(text) || !observedTestTargets.length || outsideTarget || incompleteOrReorderedTargets
      || !isDirectExactLocalTestCommand(text, exactTestTargets) || !trustedExecutionTarget) {
      return protectedConstraintBlock(
        'test-target-authorization-required',
        `The user authorized only the exact test target${exactTestTargets.length === 1 ? '' : 's'} ${exactTestTargets.join(', ')}. Use exactly: node --test ${exactTestTargets.join(' ')}. Aggregate suites, omitted, reordered, duplicated, nested, or substituted files, runner preloads, pipelines, redirections, and compound commands are outside the authorization.`,
      );
    }
  }
  const exactLocalTestCommandAuthorized = action.testExecution
    && constraints.testExecution === 'required'
    && exactTestTargets.length > 0
    && TRUSTED_HOST_TEST_EXECUTORS.has(String(toolName).toLowerCase())
    && isDirectExactLocalTestCommand(text, exactTestTargets)
    && directTestTargetsWithinTrustedRoot(exactTestTargets, event, ctx, {
      requireRootCwd: true,
      requireExisting: false,
    })
    && !action.networkAccess
    && !action.externalWrite
    && !action.workspaceWrite
    && !action.irreversible;
  const excludedTestKind = testKind && (descriptor.testExclusions ?? []).includes(testKind) ? testKind : null;
  if (excludedTestKind) {
    return protectedConstraintBlock(
      'test-kind-forbidden',
      `The user authorized selected tests but explicitly excluded ${excludedTestKind} tests. Choose an authorized test kind; do not retry with an equivalent ${excludedTestKind} runner.`,
    );
  }
  if (testAttempt && constraints.testExecution === 'forbidden') {
    return protectedConstraintBlock('test-execution-forbidden', 'The user explicitly forbade test execution; classifier or workflow hints cannot override that constraint.');
  }
  if (action.networkAccess && constraints.networkAccess === 'forbidden') {
    return protectedConstraintBlock('network-access-forbidden', 'The user explicitly forbade network access; web, fetch, remote shell, and provider calls are not authorized.');
  }
  if ((action.opaqueEffects || action.unverifiableNetworkEffects)
    && constraints.networkAccess === 'forbidden') {
    return protectedConstraintBlock('network-access-unverifiable', 'This opaque script or automation target can execute hidden network effects, so it cannot run while the user has explicitly forbidden network access. Inspect it or use a directly classifiable local command.');
  }
  if ((action.opaqueEffects || action.unverifiableTestEffects) && constraints.testExecution === 'forbidden') {
    return protectedConstraintBlock(
      'test-execution-unverifiable',
      'The user explicitly forbade test execution. This opaque command can hide a test runner, so it cannot run even when another external or workspace action is authorized. Use a directly classifiable non-test command; do not retry through an interpreter, pipe, or wrapper.',
    );
  }
  if (action.opaqueEffects && constraints.subagents === 'forbidden') {
    return protectedConstraintBlock(
      'subagent-effects-unverifiable',
      'The user explicitly forbade subagents. This opaque command can hide an agent CLI or delegated process, so it cannot run even when another action is authorized. Use a directly classifiable main-agent command; do not retry through an interpreter, pipe, or wrapper.',
    );
  }
  const workspaceScopeBlock = scopedWorkspaceActionBlock(descriptor, action, event, text, ctx);
  if (workspaceScopeBlock) return workspaceScopeBlock;
  const testArtifactScopeBlock = primaryTestAuthoringWorkspaceActionBlock(descriptor, action, event, text, ctx);
  if (testArtifactScopeBlock) return testArtifactScopeBlock;
  const externalScopeBlock = scopedExternalActionBlock(descriptor, action, text);
  if (externalScopeBlock) return externalScopeBlock;
  if (action.externalWrite
    && action.irreversible
    && descriptor.provenance?.reasons?.includes('irreversible external operation requested')) {
    return protectedConstraintBlock(
      'external-destructive-action-unsupported',
      'The request authorizes a destructive external target, but this runtime has no deterministic pre-mutation target contract and independent post-deletion verification for that provider action. It is intentionally unsupported: do not retry or substitute another target; report the limitation so the user can use a provider-native manual workflow.',
    );
  }
  const connectorBoundary = externalConnectorActionBlock(descriptor, action, toolName, event);
  if (connectorBoundary) return connectorBoundary;
  if (action.externalWrite
    && routeRequiresReleaseVerification(state.lastRoute)
    && hasPendingReleaseMutation(state)) {
    return protectedConstraintBlock(
      'release-verification-pending',
      'A prior external mutation on this route is still awaiting its bound independent verification. Verify that exact target and immutable value before starting another release mutation; do not replace or skip the pending evidence.',
    );
  }
  if ((action.externalWrite || action.opaqueEffects
      || action.unverifiableNetworkEffects
        && !action.unverifiableWorkspaceEffects
        && isUnverifiableReleaseCandidate(text))
    && routeRequiresReleaseVerification(state.lastRoute)
    && !supportsReleaseMutation(releaseEvidenceInput(toolName, event, ctx))) {
    const promptContract = analyzeReleasePromptContract(state.lastPrompt);
    if (promptContract.status === 'complete') {
      return protectedConstraintBlock(
        'release-command-repair-required',
        `The trusted user request already contains a complete ${promptContract.kind} target, but this command does not encode the deterministic mutation/verification contract. Correct the command once using this contract: ${formatReleaseCommandRepair(promptContract)}. Do not ask the user to repeat the same authorization and do not substitute another target.`,
      );
    }
    return protectedConstraintBlock(
      'release-verification-unsupported',
      `This external mutation has no deterministic independent-verification contract and the trusted prompt target is ${promptContract.status}. Stop tool use and ask for one complete, non-conflicting supported target, or report that the provider action is unsupported.`,
    );
  }
  if (action.externalWrite
    && routeRequiresReleaseVerification(state.lastRoute)
    && !releaseMutationMatchesPrompt(releaseEvidenceInput(toolName, event, ctx), state.lastPrompt)) {
    return protectedConstraintBlock(
      'release-target-confirmation-required',
      'The release command target is not fully bound to the trusted user request. Ask the user to confirm the exact repository/registry/cluster target and immutable revision, version, ref, tag, or image in one message; do not execute or retry a different release command.',
    );
  }
  if (action.unverifiableWorkspaceEffects
    && constraints.workspaceWrite === 'forbidden'
    && !exactLocalTestCommandAuthorized
    && descriptor.provenance?.reasons?.includes('read-only or advisory language')) {
    return protectedConstraintBlock(
      'workspace-effects-unverifiable',
      'The user explicitly forbade workspace changes. This repository-controlled test, build, or script can write files, and no trusted read-only workspace sandbox is available, so it cannot safely run on this route.',
    );
  }
  if (action.workspaceWrite && constraints.workspaceWrite === 'forbidden') {
    return protectedConstraintBlock('workspace-write-forbidden', 'The deterministic task descriptor is read-only; file writes are not authorized.');
  }
  if (action.externalWrite && constraints.externalWrite !== 'required') {
    return protectedConstraintBlock('external-write-forbidden', 'Push, publish, deploy, merge, and upgrade actions require explicit user authorization in the current task.');
  }
  if (action.unverifiableNetworkEffects
    && constraints.externalWrite !== 'required'
    && !exactLocalTestCommandAuthorized
    && descriptor.provenance?.reasons?.includes('external write forbidden')) {
    return protectedConstraintBlock(
      'external-effects-unverifiable',
      'The user explicitly forbade push, publish, deploy, or other external writes. This unclassified command can hide remote mutations, so use a directly classifiable local command or inspect the command implementation first.',
    );
  }
  if (action.testExecution && !trustedToolExecutionContext(event, ctx)) {
    return protectedConstraintBlock(
      'test-target-authorization-required',
      'The test execution cwd/workdir is missing, conflicting, nonexistent, or outside the trusted project root. Run the test only from the active project or one real in-project subdirectory; do not substitute an external directory containing a same-named test.',
    );
  }
  const implicitImplementationVerification = implicitlyAuthorizedImplementationVerification({
    route: state.lastRoute,
    toolName,
    command: text,
    action,
    testScope,
    event,
    ctx,
  });
  if (action.testExecution
    && constraints.testExecution !== 'required'
    && !implicitImplementationVerification) {
    return protectedConstraintBlock(
      'test-execution-not-authorized',
      'The active trusted user route does not explicitly authorize test execution. Do not infer test authority from a model continuation, an unknown route, or a tool argument; wait for a new user instruction that requests the exact testing work.',
    );
  }
  if (action.irreversible) {
    if (!approvalToken) {
      if (hasTrustedApprovalForRouteTool(state, toolName)) {
        return protectedConstraintBlock(
          'irreversible-approval-mismatch-repair-required',
          'A trusted approval exists for this route and tool, but not for this tool-call identity. Use the already approved host call exactly once; do not ask the user to repeat approval and do not substitute another call id or tool.',
        );
      }
      return protectedConstraintBlock(
        'irreversible-approval-required',
        'This irreversible operation requires a trusted host approval event before execution; approval cannot be granted by route or tool arguments. Yolo/automatic host modes may emit no approval event and therefore cannot satisfy this boundary: do not retry the command, and ask the user to rerun it with interactive write approval enabled.',
      );
    }
    stageTrustedIrreversibleCall(state, approvalToken, text);
  }
  if (action.opaqueEffects && !action.externalWrite && constraints.externalWrite !== 'required') {
    return protectedConstraintBlock('external-effects-unverifiable', 'This opaque script or automation target can hide remote mutations, so it cannot run without explicit external-write authorization. Inspect it or use a directly classifiable local command.');
  }
  if (action.opaqueEffects && !action.externalWrite) {
    return protectedConstraintBlock(
      'protected-effects-unverifiable',
      'This opaque command can hide destructive, delegated, test, workspace, network, or external effects that the host cannot bind to the active route and approval chain. Use directly classifiable commands or inspect the implementation first; external-write authorization for one target does not authorize hidden side effects.',
    );
  }
  const preservationBoundary = prepareDocumentPreservationToolCall(state, toolName, event, action, ctx);
  if (preservationBoundary) return preservationBoundary;
  return null;
}

function implicitlyAuthorizedImplementationVerification({
  route,
  toolName = '',
  command = '',
  action = {},
  testScope = 'none',
  event = {},
  ctx = {},
} = {}) {
  const descriptor = route?.taskDescriptor;
  const capabilities = new Set(descriptor?.capabilities ?? []);
  const targets = testExecutionTargetsInCommand(command);
  return descriptor?.constraints?.testExecution === 'unspecified'
    && route?.intent === 'implementation-with-tests'
    && ['modify', 'create'].includes(descriptor.operation)
    && descriptor.domains?.includes('code')
    && descriptor.constraints?.workspaceWrite === 'required'
    && capabilities.has('fs.write')
    && capabilities.has('shell.execute')
    && (descriptor.phases ?? []).some(({ kind, domain }) => (
      ['modify', 'create'].includes(kind) && domain === 'code'
    ))
    && TRUSTED_HOST_TEST_EXECUTORS.has(String(toolName).toLowerCase())
    && testScope === 'focused'
    && targets.length > 0
    && isDirectExactLocalTestCommand(command, targets)
    && directTestTargetsWithinTrustedRoot(targets, event, ctx, { requireExisting: true })
    && !hasUnsafeResultMasking(command)
    && !isDryRunAction(command)
    && !action.networkAccess
    && !action.externalWrite
    && !action.workspaceWrite
    && !action.irreversible
    && !action.opaqueEffects;
}

function directTestTargetsWithinTrustedRoot(targets = [], event = {}, ctx = {}, {
  requireRootCwd = false,
  requireExisting = true,
} = {}) {
  const executionContext = trustedToolExecutionContext(event, ctx);
  if (!executionContext || requireRootCwd && executionContext.cwd !== executionContext.root) return false;
  const { root, cwd } = executionContext;
  return targets.length > 0 && targets.every((target) => {
    const raw = String(target).trim().replace(/\\/g, '/').replace(/^\.\//, '');
    const normalized = posix.normalize(raw);
    if (!normalized || normalized === '.' || raw.split('/').includes('..')
      || normalized.startsWith('../') || isAbsolute(normalized)) return false;
    const candidate = resolve(cwd, normalized);
    const lexicalRelative = relative(root, candidate);
    if (!lexicalRelative || lexicalRelative === '..' || lexicalRelative.startsWith('../') || isAbsolute(lexicalRelative)) return false;
    try {
      const actual = realpathSync(candidate);
      return pathIsStrictlyWithinRoot(actual, root);
    } catch {
      if (requireExisting) return false;
      try {
        if (lstatSync(candidate).isSymbolicLink()) return false;
      } catch {
        // A user-authorized exact test path may not exist yet. Its nearest
        // existing ancestor must still resolve inside the trusted root.
      }
      let ancestor = dirname(candidate);
      while (ancestor !== dirname(ancestor)) {
        try {
          return ancestor === root || pathIsStrictlyWithinRoot(realpathSync(ancestor), root);
        } catch {
          ancestor = dirname(ancestor);
        }
      }
      return false;
    }
  });
}

function trustedToolExecutionContext(event = {}, ctx = {}) {
  let root;
  try {
    if (typeof ctx.cwd === 'string' && ctx.cwd.trim() && !isAbsolute(ctx.cwd)) return null;
    root = realpathSync(resolve(typeof ctx.cwd === 'string' && ctx.cwd.trim()
      ? ctx.cwd
      : process.cwd()));
  } catch {
    return null;
  }
  const declared = [
    event.cwd,
    event.workdir,
    event.details?.cwd,
    event.details?.workdir,
    ...toolInputRecords(event).flatMap((record) => [record.cwd, record.workdir]),
  ].filter((value) => typeof value === 'string' && value.trim());
  const resolved = new Set();
  for (const value of declared) {
    try {
      const cwd = realpathSync(isAbsolute(value) ? value : resolve(root, value));
      if (cwd !== root && !pathIsStrictlyWithinRoot(cwd, root)) return null;
      resolved.add(cwd);
    } catch {
      return null;
    }
  }
  if (resolved.size > 1) return null;
  return { root, cwd: resolved.values().next().value ?? root };
}

function pathIsStrictlyWithinRoot(path = '', root = '') {
  const fromRoot = relative(root, path);
  return Boolean(fromRoot)
    && fromRoot !== '..'
    && !fromRoot.startsWith('../')
    && !isAbsolute(fromRoot);
}

function prepareDocumentPreservationToolCall(state, toolName = '', event = {}, action = {}, ctx = {}) {
  if (!isDocumentPreservationRequest(state)) return null;
  const subagentMutation = isDocumentPreservationPotentialSubagentMutation(toolName, action);
  const targets = state.lastRoute.taskDescriptor.workspaceWriteTargets;
  if (targets.length !== 1) {
    if (!action.workspaceWrite && !action.definiteWorkspaceMutation && !subagentMutation) return null;
    return protectedConstraintBlock(
      'document-preservation-multi-target-unsupported',
      `This fact-preserving edit names ${targets.length || 'no exact'} document targets, but the current host evidence contract binds one complete document baseline at a time. Do not mutate any target; ask the user to split the request into one document per task with one exact path.`,
    );
  }
  if (!isDocumentPreservationRoute(state)) return null;
  const name = String(toolName).toLowerCase();
  const targetPath = targets[0];
  const routeId = gateControllerRouteId(state);
  const input = firstToolInputRecord(event);

  if (name === 'read') {
    const callId = toolEventCallId(event);
    const expectedPath = trustedDocumentPreservationReadPath(input.path, targetPath, ctx);
    const selector = typeof input.selector === 'string' ? input.selector.trim().toLowerCase() : input.selector;
    const partialRead = selector !== undefined && selector !== 'raw';
    if (callId && !partialRead && expectedPath) {
      const pending = state.pendingDocumentPreservationReads ?? new Map();
      if (pending.size >= 8) pending.delete(pending.keys().next().value);
      pending.set(callId, { routeId, path: targetPath, resolvedPath: expectedPath });
      state.pendingDocumentPreservationReads = pending;
    }
    return null;
  }

  if (!action.workspaceWrite && !action.definiteWorkspaceMutation && !subagentMutation) return null;
  const baseline = state.evidence.documentPreservationBaseline;
  if (baseline?.routeId === routeId) {
    if (baseline.scope?.mode === 'explicit-sentence' && baseline.scope.status === 'unresolved') {
      return protectedConstraintBlock(
        'document-preservation-scope-confirmation-required',
        `The trusted document snapshot could not resolve the explicit sentence-preservation contract (${baseline.scope.reasonCode}). Ask the user to name exactly one editable sentence and one exact protected literal outside that sentence; do not reread, edit, or guess another scope.`,
      );
    }
    return null;
  }
  const priorMutation = state.evidence.mutationRevision > 0;
  return protectedConstraintBlock(
    'document-preservation-baseline-required',
    priorMutation
      ? `The fact-preserving document baseline is unavailable because this route already observed a mutation before a trusted full read of ${targetPath}. Do not use a later edit to redefine the drifted text as the baseline; report that the original document must be restored or start a new trusted route after restoration.`
      : `Before changing ${targetPath}, read the complete authorized document once with the direct read tool so the host can bind a factual-preservation baseline. Write, edit, patch, shell, and subagent mutations cannot run before that baseline, and model-supplied old/new text is not trusted evidence.`,
  );
}

function isDocumentPreservationPotentialSubagentMutation(toolName = '', action = {}) {
  if (!action.subagent) return false;
  const name = String(toolName).trim().replace(/[./:\\]+/g, '_').replace(/_+/g, '_').toLowerCase();
  return /^(?:task|spawn_agent|delegate|collaboration_(?:spawn_agent|delegate|followup_task|send_message))$/u.test(name)
    || !/^(?:collaboration_(?:list_agents|wait_agent|interrupt_agent))$/u.test(name);
}

function trustedDocumentPreservationReadPath(observedPath, targetPath, ctx = {}) {
  if (typeof observedPath !== 'string' || typeof targetPath !== 'string') return '';
  const root = typeof ctx.cwd === 'string' && isAbsolute(ctx.cwd) ? resolve(ctx.cwd) : resolve(process.cwd());
  const target = posix.normalize(targetPath.trim().replace(/\\/g, '/').replace(/^\.\//, ''));
  if (!target || target === '.' || target.startsWith('../')) return '';
  const expected = isAbsolute(target) ? resolve(target) : resolve(root, target);
  const observed = resolve(root, observedPath.trim());
  const expectedRelative = relative(root, expected);
  if (expectedRelative === '..' || expectedRelative.startsWith('../') || isAbsolute(expectedRelative)) return '';
  return observed === expected ? expected : '';
}

function externalConnectorActionBlock(descriptor, action, toolName = '', event = {}) {
  if (!action.externalWrite) return null;
  const expected = descriptor.externalActionContract;
  if (!expected || expected.state === 'unsupported') return null;

  if (expected.state === 'incomplete') {
    return protectedConstraintBlock(
      'external-action-target-confirmation-required',
      `The trusted request names a ${expected.provider ?? 'connector'} ${expected.action ?? 'mutation'} but does not contain one complete target. Stop before any external mutation and ask once for the exact target; do not guess or try candidate recipients, channels, projects, folders, calendars, or pages.`,
    );
  }

  if (expected.state === 'conflicting') {
    const multiAction = expected.reasons?.some((reason) => String(reason).includes('unsupported-multi-action'));
    return protectedConstraintBlock(
      'external-action-target-confirmation-required',
      multiAction
        ? 'The trusted request contains multiple connector mutations. This route intentionally supports one bound connector action at a time: ask once to split or sequence the actions, and do not choose one target or provider on the user\'s behalf.'
        : `The trusted request contains conflicting targets for the ${expected.provider ?? 'connector'} ${expected.action ?? 'mutation'}. Ask once for one exact target; do not try each candidate.`,
    );
  }

  if (expected.state === 'complete'
    && !externalActionMatchesTool(expected, {
      toolName,
      input: firstToolInputRecord(event),
    })) {
    return protectedConstraintBlock(
      'external-action-repair-required',
      `This external tool call does not match the provider, action, and exact target already authorized by the trusted request (${formatExternalActionContract(expected)}). Correct the call once using only that contract; do not ask the user to repeat it, substitute another target, or try a different external service.`,
    );
  }
  return null;
}

function formatExternalActionContract(contract = {}) {
  const provider = String(contract.provider ?? 'connector');
  const action = String(contract.action ?? 'mutation');
  const targetKind = String(contract.target?.kind ?? 'target');
  const targetValue = String(contract.target?.value ?? 'missing');
  return `${provider}/${action} ${targetKind}=${targetValue}`;
}

function isUnverifiableReleaseCandidate(command = '') {
  return /(?:^|[\s_./:-])(?:publish|deploy|release|push|upload|upgrade|promote|rollback|rollout|ship)(?:$|[\s_./:-])/i.test(String(command));
}

function formatReleaseCommandRepair(contract = {}) {
  const target = contract.target ?? {};
  switch (contract.kind) {
    case 'git-push':
      return `git push ${target.remote} ${target.sourceName}:${target.targetRef}`;
    case 'npm-publish':
      return `from the trusted package directory run npm publish . --ignore-scripts --registry ${target.registry} --tag ${target.tag}; the host manifest must be ${target.packageName}@${target.version}`;
    case 'docker-push':
      return `docker push ${target.image}`;
    case 'gh-release':
      return `gh release create ${target.tag} --repo ${target.repo}${target.prerelease ? ' --prerelease' : ''}${target.targetCommitish ? ` --target ${target.targetCommitish}` : ''}`;
    case 'kubectl-rollout':
      return `kubectl set image deployment/${target.deployment} ${(target.containerImages ?? []).map(({ container, image }) => `${container}=${image}`).join(' ')} --namespace ${target.namespace} --context ${target.context}`;
    case 'helm-upgrade':
      return `helm upgrade --install ${target.release} ${target.chart} --namespace ${target.namespace} --kube-context ${target.context}${target.chartVersion ? ` --version ${target.chartVersion}` : ''}`;
    case 'omp-plugin-upgrade':
      return `omp plugin upgrade ${target.pluginId} --scope ${target.scope}`;
    default:
      return JSON.stringify(target);
  }
}

function testKindForCommand(command = '') {
  const text = String(command).toLowerCase();
  const patterns = {
    unit: /(?:^|[\s:_./-])unit(?:$|[\s:_./-])/,
    integration: /(?:^|[\s:_./-])integration(?:$|[\s:_./-])/,
    e2e: /(?:^|[\s:_./-])(?:e2e|end-to-end|playwright|cypress|webdriver|selenium|browser-smoke)(?:$|[\s:_./-])/,
    smoke: /(?:^|[\s:_./-])smoke(?:$|[\s:_./-])/,
  };
  const namedKind = ['unit', 'integration', 'e2e', 'smoke'].find((kind) => patterns[kind].test(text));
  if (namedKind) return namedKind;
  const aggregateSuite = /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test(?:\s|$)/.test(text.trim())
    || /^node\s+--test\s*$/.test(text.trim())
    || /^go\s+test\s+\.\/\.\.\.\s*$/.test(text.trim())
    || /^(?:python\s+-m\s+)?pytest\s*(?:\.|\.\/)?\s*$/.test(text.trim());
  return aggregateSuite ? 'full-suite' : null;
}

function testExecutionTargetsInCommand(command = '') {
  return uniqueValues([...String(command).matchAll(/(?:^|[\s`'"])((?:\.\/)?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+(?:\.test|\.spec)\.(?:[cm]?[jt]sx?|py|go|rs|java))(?=$|[\s`'",;:])/gi)]
    .map((match) => String(match[1]).replace(/^\.\//, '').replace(/\\/g, '/')));
}

function isDirectExactLocalTestCommand(command = '', allowedTargets = []) {
  if (hasUnsafeResultMasking(command) || allowedTargets.length === 0) return false;
  // Every explicitly named test file is treated as user-authorized executable
  // code. This proves the command boundary only; it is not a sandbox or a
  // proof that the test files and their imports have no internal side effects.
  const match = String(command).trim().match(/^node\s+--test\s+(.+)$/i);
  if (!match) return false;
  const tokens = match[1].match(/"[^"]*"|'[^']*'|[^\s]+/g) ?? [];
  const observed = tokens.map((token) => token.replace(/^(?:"([^"]*)"|'([^']*)')$/, '$1$2'));
  if (observed.length !== allowedTargets.length
    || observed.some((target) => !/^(?:\.\/)?[a-z0-9_.\/-]+(?:\.test|\.spec)\.[cm]?[jt]sx?$/i.test(target))) return false;
  return observed.every((target, index) => exactTestPathMatches(target, allowedTargets[index]));
}

function isAuthorizedExactTestCommand(command = '', descriptor = {}) {
  if (hasUnsafeResultMasking(command)) return false;
  const authorized = String(descriptor.testExecutionCommand ?? '').trim().replace(/\s+/g, ' ');
  const observed = String(command).trim().replace(/\s+/g, ' ');
  if (authorized) return observed === authorized;
  return isDirectExactLocalTestCommand(command, descriptor.testExecutionTargets ?? []);
}

function exactTestPathMatches(observed = '', allowed = '') {
  const normalize = (value) => posix.normalize(String(value).trim().replace(/\\/g, '/').replace(/^\.\//, ''));
  const left = normalize(observed);
  const right = normalize(allowed);
  if (!left || !right || left === '.' || right === '.' || left.startsWith('../') || right.startsWith('../')) return false;
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function scopedWorkspaceActionBlock(descriptor, action, event = {}, actionText = '', ctx = {}) {
  if (!action.workspaceWrite && !action.definiteWorkspaceMutation) return null;
  const allowed = Array.isArray(descriptor.workspaceWriteTargets) ? descriptor.workspaceWriteTargets : [];
  const excluded = Array.isArray(descriptor.workspaceWriteExclusions) ? descriptor.workspaceWriteExclusions : [];
  const escapedDirectTarget = directWorkspaceActionTargetOutsideRoot(event, ctx);
  if (escapedDirectTarget) {
    return protectedConstraintBlock(
      'workspace-target-authorization-required',
      `The direct workspace target ${escapedDirectTarget} resolves outside the trusted workspace root. Symlink and realpath escapes cannot be authorized by a lexical allowlist entry.`,
    );
  }
  if (!allowed.length && !excluded.length) return null;
  const observed = workspaceActionTargets(event, actionText, ctx);
  const denied = observed.find((target) => excluded.some((entry) => scopedPathMatches(target, entry)));
  if (denied) {
    return protectedConstraintBlock(
      'workspace-target-excluded',
      `The trusted user request explicitly excludes workspace target ${denied}. Modify only the authorized target set: ${allowed.join(', ') || 'no other target was named'}.`,
    );
  }
  if (allowed.length && action.definiteWorkspaceMutation
    && (!observed.length || observed.some((target) => !allowed.some((entry) => scopedPathMatches(target, entry))))) {
    return protectedConstraintBlock(
      'workspace-target-authorization-required',
      `This definite workspace mutation is outside the trusted target allowlist (${allowed.join(', ')}). Use a directly targeted edit within that scope; do not broaden the file set.`,
    );
  }
  return null;
}

function primaryTestAuthoringWorkspaceActionBlock(descriptor, action, event = {}, actionText = '', ctx = {}) {
  const primaryTestAuthoring = (descriptor?.provenance?.reasons ?? [])
    .includes('primary direct test authoring requested');
  if (!primaryTestAuthoring || (!action.workspaceWrite && !action.definiteWorkspaceMutation)) return null;

  if (action.opaqueEffects || action.unverifiableWorkspaceEffects) {
    return protectedConstraintBlock(
      'workspace-test-artifact-authorization-required',
      'This test-authoring route permits writes only to directly attributable test artifacts. Opaque scripts and automation do not prove their mutation targets; use a direct edit, write, or patch whose every target is a test artifact.',
    );
  }

  const observed = workspaceActionTargets(event, actionText, ctx);
  const outsideTestArtifacts = observed.filter((target) => !isTestArtifactWorkspacePath(target));
  if (!observed.length || outsideTestArtifacts.length) {
    const targetSummary = outsideTestArtifacts.length
      ? outsideTestArtifacts.join(', ')
      : 'no verifiable workspace target';
    return protectedConstraintBlock(
      'workspace-test-artifact-authorization-required',
      `The user authorized test authoring, not production-code changes. This mutation resolves to ${targetSummary}. Use one directly attributable target below test/, tests/, __tests__, or another conventional *.test.*, *.spec.*, test_*.py, or *_test.go test artifact; do not modify production files or retry through a script.`,
    );
  }
  return null;
}

function isTestArtifactWorkspacePath(value = '') {
  const normalized = posix.normalize(String(value).trim().replace(/\\/g, '/').replace(/^\.\//, ''));
  if (!normalized || normalized === '.' || normalized === '..' || normalized.startsWith('../')) return false;
  const lower = normalized.toLowerCase();
  const name = basename(lower);
  return /(?:^|\/)(?:tests?|__tests__|__snapshots__)(?:\/|$)/u.test(lower)
    || /\.(?:test|spec)\.[^/]+$/u.test(name)
    || /^test_[^/]+\.(?:py|rb|php)$/u.test(name)
    || /_test\.go$/u.test(name);
}

function directWorkspaceActionTargetOutsideRoot(event = {}, ctx = {}) {
  const input = firstToolInputRecord(event);
  const direct = [
    input.path,
    input.file,
    input.filePath,
    input.filename,
    ...(Array.isArray(input.paths) ? input.paths : []),
    ...(Array.isArray(input.files) ? input.files : []),
  ].filter((value) => typeof value === 'string' && value.length > 0);
  if (!direct.length) return '';
  let root;
  try {
    root = realpathSync(resolve(ctx.cwd || process.cwd()));
  } catch {
    return direct[0];
  }
  for (const target of direct) {
    const authoredPath = resolve(root, target);
    let exists = false;
    try {
      lstatSync(authoredPath);
      exists = true;
    } catch (error) {
      if (error?.code !== 'ENOENT') return target;
    }
    let effectivePath;
    if (exists) {
      try {
        effectivePath = realpathSync(authoredPath);
      } catch {
        return target;
      }
    } else {
      effectivePath = nearestExistingRealPath(dirname(authoredPath));
      if (!effectivePath) return target;
    }
    if (!sameRealPath(root, effectivePath) && !relativeWorkspaceRealPath(root, effectivePath)) return target;
  }
  return '';
}

function nearestExistingRealPath(startPath = '') {
  let candidate = startPath;
  while (candidate) {
    try {
      lstatSync(candidate);
      try {
        return realpathSync(candidate);
      } catch {
        return '';
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') return '';
    }
    const parent = dirname(candidate);
    if (parent === candidate) return '';
    candidate = parent;
  }
  return '';
}

function workspaceActionTargets(event = {}, actionText = '', ctx = {}) {
  const input = firstToolInputRecord(event);
  const direct = [
    input.path,
    input.file,
    input.filePath,
    input.filename,
    ...(Array.isArray(input.paths) ? input.paths : []),
    ...(Array.isArray(input.files) ? input.files : []),
  ].filter((value) => typeof value === 'string');
  const commandPaths = [...String(actionText).matchAll(/(?:^|[\s"'`])((?:\.\/)?(?:[a-z0-9_.-]+\/)*[a-z0-9_.-]+\.(?:[a-z0-9_.-]+))(?:$|[\s"'`,;:])/gi)]
    .map((match) => match[1]);
  const patchTexts = [input.patch, input.diff]
    .filter((value) => typeof value === 'string' && value.trim());
  const patchPaths = patchTexts.flatMap((patch) => [
    ...[...patch.matchAll(/^\*\*\*\s+(?:Add|Update|Delete)\s+File:\s+(.+?)\s*$/gmi)].map((match) => match[1]),
    ...[...patch.matchAll(/^\*\*\*\s+Move\s+(?:to|from):\s+(.+?)\s*$/gmi)].map((match) => match[1]),
    ...[...patch.matchAll(/^(?:---|\+\+\+)\s+(?:[ab]\/)?(.+?)\s*$/gm)].map((match) => match[1]),
  ]).filter((value) => value !== '/dev/null');
  const readBoundEditPaths = editAnchorTargetsFromBranch(event, ctx);
  return uniqueValues([...direct, ...commandPaths, ...patchPaths, ...readBoundEditPaths]
    .map((value) => normalizeWorkspaceActionPath(value)));
}

function editAnchorTargetsFromBranch(event = {}, ctx = {}) {
  const input = firstToolInputRecord(event);
  const anchors = uniqueValues([input.input, input.anchor, input.patch, input.diff]
    .filter((value) => typeof value === 'string')
    .flatMap((value) => [...value.matchAll(/\[[^\]\n#]+#[a-z0-9]+\]/gi)].map((match) => match[0])));
  if (!anchors.length) return [];
  const entries = ctx.sessionManager?.getBranch?.();
  if (!Array.isArray(entries)) return ['__omp_unresolved_edit_anchor__'];
  let root;
  try {
    root = realpathSync(resolve(ctx.cwd || process.cwd()));
  } catch {
    return ['__omp_unresolved_edit_anchor__'];
  }
  const targets = [];
  for (const anchor of anchors) {
    const anchorMatch = anchor.match(/^\[([^\]\n#]+)#([a-z0-9]+)\]$/i);
    if (!anchorMatch) return ['__omp_unresolved_edit_anchor__'];
    const [, declaredPath, rawAnchorTag] = anchorMatch;
    const anchorTag = rawAnchorTag.toLowerCase();
    const declared = editAnchorDeclaredPathSelection(root, declaredPath);
    if (!declared) return ['__omp_unresolved_edit_anchor__'];
    const sourcePaths = [];
    for (const entry of entries) {
      const message = entry?.message ?? entry;
      if (message?.role !== 'toolResult' || message?.toolName !== 'read' || !isSuccessfulToolEvent(message)) continue;
      const observedTags = [...toolResultText(message).matchAll(/\[[^\]\n#]+#([a-z0-9]+)\]/gi)]
        .map((match) => match[1].toLowerCase());
      if (!observedTags.includes(anchorTag)) continue;
      const sourcePath = trustedEditAnchorReadSourcePath(message, root);
      if (!sourcePath) return ['__omp_unresolved_edit_anchor__'];
      sourcePaths.push(sourcePath);
    }
    // Hashline narrows missing-path recovery to snapshots with the same
    // platform-native basename before requiring one unique source.
    const candidateSources = declared.exists
      ? sourcePaths
      : sourcePaths.filter((sourcePath) => basename(declaredPath) === basename(sourcePath));
    const uniqueSources = uniqueRealPaths(candidateSources);
    if (uniqueSources.length !== 1) return ['__omp_unresolved_edit_anchor__'];
    const sourcePath = uniqueSources[0];
    let selectedPath = sourcePath;
    if (declared.exists) {
      if (!sameRealPath(declared.realPath, sourcePath)) return ['__omp_unresolved_edit_anchor__'];
      selectedPath = declared.realPath;
    }
    const target = relativeWorkspaceRealPath(root, selectedPath);
    if (!target) return ['__omp_unresolved_edit_anchor__'];
    targets.push(target);
  }
  return uniqueValues(targets);
}

function editAnchorDeclaredPathSelection(root, declaredPath = '') {
  if (typeof declaredPath !== 'string' || !declaredPath) return null;
  const authoredPath = resolve(root, declaredPath);
  try {
    lstatSync(authoredPath);
  } catch (error) {
    return error?.code === 'ENOENT' ? { exists: false, authoredPath } : null;
  }
  try {
    const realPath = realpathSync(authoredPath);
    return relativeWorkspaceRealPath(root, realPath)
      ? { exists: true, authoredPath, realPath }
      : null;
  } catch {
    // A broken or looping symlink exists lexically, so the host will not
    // safely recover it through an unrelated tag source.
    return null;
  }
}

function trustedEditAnchorReadSourcePath(message = {}, root = '') {
  const details = isRecord(message.details) ? message.details : null;
  if (!details) return '';
  const hasResolvedPath = Object.prototype.hasOwnProperty.call(details, 'resolvedPath');
  const hasMetaSource = isRecord(details.meta)
    && Object.prototype.hasOwnProperty.call(details.meta, 'source');
  if (!hasResolvedPath && !hasMetaSource) return '';

  const candidates = [];
  if (hasResolvedPath) candidates.push(details.resolvedPath);
  if (hasMetaSource) {
    const source = details.meta.source;
    if (!isRecord(source) || source.type !== 'path') return '';
    candidates.push(source.value);
  }

  const realPaths = [];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate || !isAbsolute(candidate)) return '';
    try {
      const realPath = realpathSync(candidate);
      if (!relativeWorkspaceRealPath(root, realPath)) return '';
      realPaths.push(realPath);
    } catch {
      return '';
    }
  }
  const uniquePaths = uniqueRealPaths(realPaths);
  return uniquePaths.length === 1 ? uniquePaths[0] : '';
}

function relativeWorkspaceRealPath(root = '', target = '') {
  const value = relative(root, target);
  if (!value || value === '..' || value.startsWith(`..${sep}`) || isAbsolute(value)) return '';
  return value;
}

function uniqueRealPaths(paths = []) {
  const byIdentity = new Map();
  for (const path of paths) byIdentity.set(realPathIdentity(path), path);
  return [...byIdentity.values()];
}

function sameRealPath(left = '', right = '') {
  return realPathIdentity(left) === realPathIdentity(right);
}

function realPathIdentity(value = '') {
  const path = String(value);
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

function normalizeWorkspaceActionPath(value = '') {
  let path = String(value).trim().replace(/^['"]|['"]$/g, '').replace(/^\.\//, '');
  if (process.platform === 'win32') path = path.replace(/\\/g, '/');
  return path;
}

function scopedPathMatches(observed = '', scoped = '') {
  const normalize = (value) => {
    const separators = process.platform === 'win32' ? String(value).replace(/\\/g, '/') : String(value);
    const path = posix.normalize(separators.replace(/^\.\//, ''));
    if (!path || path === '..' || path.startsWith('../')) return null;
    return process.platform === 'win32' ? path.toLowerCase() : path;
  };
  const target = normalize(observed);
  const expected = normalize(scoped);
  if (!target || !expected) return false;
  return target === expected || target.startsWith(`${expected.replace(/\/$/, '')}/`);
}

function scopedExternalActionBlock(descriptor, action, actionText = '') {
  if (!action.externalWrite) return null;
  const allowed = Array.isArray(descriptor.externalWriteTargets) ? descriptor.externalWriteTargets : [];
  const excluded = Array.isArray(descriptor.externalWriteExclusions) ? descriptor.externalWriteExclusions : [];
  if (!allowed.length && !excluded.length) return null;
  const observed = environmentTargetsInAction(actionText);
  const denied = observed.find((target) => excluded.includes(target));
  if (denied) {
    return protectedConstraintBlock(
      'external-target-excluded',
      `The user explicitly excluded the ${denied} external target. Retry at most once using only the authorized target (${allowed.join(', ') || 'none'}); never substitute another environment.`,
    );
  }
  if (allowed.length && (!observed.length || observed.some((target) => !allowed.includes(target)))) {
    return protectedConstraintBlock(
      'external-target-repair-required',
      `The external command does not prove the trusted target allowlist (${allowed.join(', ')}). Encode that exact environment once; do not ask the user to repeat the same scope and do not choose a different target.`,
    );
  }
  return null;
}

function environmentTargetsInAction(value = '') {
  const text = String(value).toLowerCase();
  const observed = [];
  if (/(?:^|[^a-z])(?:production|prod)(?:$|[^a-z])/.test(text)) observed.push('production');
  if (/(?:^|[^a-z])(?:staging|stage)(?:$|[^a-z])/.test(text)) observed.push('staging');
  if (/(?:^|[^a-z])(?:development|dev)(?:$|[^a-z])/.test(text)) observed.push('development');
  if (/(?:^|[^a-z])test(?:$|[^a-z])/.test(text)) observed.push('test');
  return uniqueValues(observed);
}

function isKnownFirstPartyNetworkAction(toolName = '', event = {}) {
  const input = firstToolInputRecord(event);
  if (toolName === 'writing_quality_check') return input.allowNetwork !== false;
  if (toolName === 'fact_check_evidence') return input.allowNetwork === true;
  return false;
}

function firstToolInputRecord(event = {}) {
  return toolInputRecords(event)[0] ?? {};
}

function toolInputRecords(event = {}) {
  return [
    event.input,
    event.params,
    event.args,
    event.arguments,
    event.details?.input,
    event.details?.params,
  ].filter(isRecord);
}

function protectedConstraintBlock(reasonCode, reason) {
  return {
    block: true,
    reasonCode,
    reason: `OMP protected action boundary blocked this tool call. ${reason}`,
  };
}

function formatAwaitingUserToolBlock(reasonCode = '') {
  if (reasonCode === 'document-preservation-snapshot-too-large') {
    return 'OMP_AWAITING_USER is active because the authorized document could not be read completely without host truncation. Line-range and chunked reads cannot establish this whole-document baseline. Do not try another selector, read, edit, shell, or subagent method; ask the user to split the document/task into one smaller exact file or explicitly narrow the preservation scope.';
  }
  if (reasonCode === 'document-preservation-scope-confirmation-required') {
    return 'OMP_AWAITING_USER is active because the editable sentence or protected literal could not be mapped to one unambiguous document scope. Do not call more tools; ask the user to name exactly one sentence and one protected literal outside that sentence.';
  }
  return `OMP_AWAITING_USER is active for ${reasonCode}. Do not call or run more tools; ask the user for the required authorization or confirmation.`;
}

function createActionBoundaryState() {
  return {
    schemaVersion: 1,
    denialCount: 0,
    terminal: false,
    awaitingUserReason: null,
    finalCorrectionUsed: false,
    fingerprints: [],
    reasonCounts: {},
  };
}

function createExclusiveToolState(route, routeId = '') {
  const contract = route?.taskDescriptor?.exclusiveToolContract;
  if (contract?.mode !== 'exclusive') return null;
  const blockedReason = exclusiveToolUnsatisfiableReason(route);
  return {
    schemaVersion: 1,
    routeId,
    status: blockedReason ? 'blocked' : 'unused',
    toolName: null,
    toolCallIdDigest: null,
    inputDigest: null,
    reasonCode: blockedReason,
    finalCorrectionUsed: false,
  };
}

function exclusiveToolUnsatisfiableReason(route) {
  const descriptor = route?.taskDescriptor ?? {};
  const contract = descriptor.exclusiveToolContract;
  if (contract?.mode !== 'exclusive') return null;
  if (contract.input?.status === 'ambiguous') return 'exclusive-tool-input-ambiguous';
  const allowed = new Set(contract.allowedTools ?? []);
  const requiredGates = new Set((route.routePlan?.gateRequirements ?? [])
    .filter(({ mode }) => mode === 'required')
    .map(({ key }) => key));
  if (requiredGates.has('release-approval') || requiredGates.has('irreversible-approval')) {
    return 'exclusive-tool-protected-action-unsatisfied';
  }
  if (requiredGates.has('security-evidence') || requiredGates.has('writing-quality')
    || requiredGates.has('review-evidence')) return 'exclusive-tool-multi-evidence-unsatisfied';
  if (requiredGates.has('test-evidence')) {
    if (![...allowed].some((tool) => ['bash', 'shell', 'terminal', 'exec', 'exec_command', 'run', 'run_command'].includes(tool))
      || !descriptor.testExecutionCommand) return 'exclusive-tool-test-command-unbound';
    if (descriptor.constraints?.networkAccess === 'forbidden') {
      return 'exclusive-tool-network-sandbox-required';
    }
  }
  if (requiredGates.has('fact-evidence')
    && (!isFocusedLocalFactInspectionRoute(route)
      || !allowed.has('grep') && !(allowed.has('read') && contract.input?.kind === 'exact-path'))) {
    return 'exclusive-tool-fact-method-unsatisfied';
  }
  return null;
}

function readExclusiveToolState(value, routeId = '', contract = null, {
  trustedPriorExclusiveSuccesses = new Set(),
} = {}) {
  if (contract?.mode !== 'exclusive') return null;
  const unavailable = () => ({
    schemaVersion: 1,
    routeId,
    status: 'blocked',
    toolName: null,
    toolCallIdDigest: null,
    inputDigest: null,
    reasonCode: 'exclusive-tool-state-unavailable',
    finalCorrectionUsed: false,
  });
  if (!isRecord(value) || value.schemaVersion !== 1 || value.routeId !== routeId
    || !['unused', 'pending', 'succeeded', 'failed', 'blocked'].includes(value.status)) {
    return unavailable();
  }
  const digest = (candidate) => /^[a-f0-9]{64}$/.test(String(candidate ?? '')) ? String(candidate) : null;
  const restored = {
    schemaVersion: 1,
    routeId,
    status: value.status,
    toolName: typeof value.toolName === 'string' ? canonicalExclusiveRuntimeToolName(value.toolName) : null,
    toolCallIdDigest: digest(value.toolCallIdDigest),
    inputDigest: digest(value.inputDigest),
    reasonCode: typeof value.reasonCode === 'string' ? value.reasonCode : null,
    finalCorrectionUsed: value.finalCorrectionUsed === true,
  };
  const allowedTool = contract.allowedTools?.[0] ?? null;
  if (restored.status === 'unused'
    && (restored.toolName || restored.toolCallIdDigest || restored.inputDigest || restored.reasonCode)) return unavailable();
  if (['pending', 'succeeded', 'failed'].includes(restored.status)
    && (restored.toolName !== allowedTool || !restored.toolCallIdDigest || !restored.inputDigest)) return unavailable();
  if (restored.status === 'pending' && restored.reasonCode) return unavailable();
  if (restored.status === 'succeeded'
    && restored.reasonCode
    && !(restored.reasonCode === 'exclusive-tool-success-output-correction-budget-exhausted'
      && restored.finalCorrectionUsed === true
      && trustedPriorExclusiveSuccesses.has(exclusiveToolStateIdentity(restored)))) return unavailable();
  if (restored.status === 'failed'
    && !['exclusive-tool-result-failed', 'exclusive-tool-terminal-correction-budget-exhausted']
      .includes(restored.reasonCode)) return unavailable();
  if (restored.status === 'blocked'
    && (!restored.reasonCode
      || restored.toolName && restored.toolName !== allowedTool
      || Boolean(restored.toolCallIdDigest) !== Boolean(restored.inputDigest))) return unavailable();
  return restored;
}

function exclusiveToolStateIdentity(value = {}) {
  return digestEvidence([
    value.routeId,
    value.toolName,
    value.toolCallIdDigest,
    value.inputDigest,
  ].map((item) => String(item ?? '')).join(':'));
}

function mergeExclusiveToolState(live, restored, routeId = '') {
  const current = live?.routeId === routeId ? live : null;
  const snapshot = restored?.routeId === routeId ? restored : null;
  if (!current) return snapshot;
  if (!snapshot) return current;
  const rank = { unused: 0, pending: 1, succeeded: 2, failed: 2, blocked: 3 };
  return (rank[current.status] ?? 3) >= (rank[snapshot.status] ?? 3) ? current : snapshot;
}

function exclusiveToolBoundaryBlock(state, toolName = '', event = {}, ctx = {}) {
  const contract = state.lastRoute?.taskDescriptor?.exclusiveToolContract;
  if (contract?.mode !== 'exclusive') return null;
  const toolState = state.exclusiveToolState;
  if (!toolState || toolState.routeId !== gateControllerRouteId(state)) {
    markExclusiveToolBlocked(state, 'exclusive-tool-state-unavailable');
    return protectedConstraintBlock('exclusive-tool-state-unavailable', 'The persisted one-tool budget is unavailable, so it cannot be safely reset or replayed. Do not call another tool.');
  }
  if (toolState.status === 'blocked') {
    return protectedConstraintBlock('exclusive-tool-contract-unsatisfiable', `The one-tool contract is unavailable (${toolState.reasonCode ?? 'conflicting route requirements'}). Do not try another method.`);
  }
  if (toolState.finalCorrectionUsed === true) {
    return protectedConstraintBlock('exclusive-tool-terminal', 'The route already used its only final-text correction. No tool call or alternate method is authorized.');
  }
  if (toolState.status !== 'unused') {
    markExclusiveToolBlocked(state, 'exclusive-tool-budget-exhausted');
    const reasonCode = isFocusedLocalFactInspectionRoute(state.lastRoute)
      && contract.allowedTools?.[0] === 'grep'
      ? 'focused-fact-search-budget-exhausted'
      : 'exclusive-tool-budget-exhausted';
    return protectedConstraintBlock(reasonCode, `The exclusive tool budget is already ${toolState.status}. Failure, pending execution, and successful execution all consume the single-call budget; do not retry or switch methods.`);
  }
  if (!exclusiveToolCallMatchesAllowedTool(state, toolName)) {
    markExclusiveToolBlocked(state, 'exclusive-tool-not-authorized');
    return protectedConstraintBlock('exclusive-tool-not-authorized', `The user authorized only ${(contract.allowedTools ?? []).join(', ')} exactly once and forbade every other tool. Do not substitute ${toolName || 'another tool'}.`);
  }
  if (!exclusiveToolInputMatches(state, event, ctx)) {
    markExclusiveToolBlocked(state, 'exclusive-tool-input-mismatch');
    return protectedConstraintBlock('exclusive-tool-input-mismatch', 'The proposed input does not match the trusted one-tool input binding. The single-call contract forbids a mechanical retry or alternate input.');
  }
  return null;
}

function exclusiveToolCallMatchesAllowedTool(state, toolName = '') {
  const allowed = state.lastRoute?.taskDescriptor?.exclusiveToolContract?.allowedTools ?? [];
  return allowed.includes(canonicalExclusiveRuntimeToolName(toolName));
}

function exclusiveToolInputMatches(state, event = {}, ctx = {}) {
  const input = state.lastRoute?.taskDescriptor?.exclusiveToolContract?.input;
  if (!input || input.status === 'ambiguous') return false;
  if (input.kind === 'exact-command') {
    const command = String(toolActionText(event)).trim().replace(/\s+/g, ' ');
    const executionContext = trustedToolExecutionContext(event, ctx);
    return digestEvidence(command) === input.digest
      && Boolean(executionContext)
      && executionContext.cwd === executionContext.root;
  }
  if (input.kind === 'exact-path') {
    const record = firstToolInputRecord(event);
    const path = String(record.path ?? record.file ?? record.filename ?? event.path ?? '').trim()
      .replace(/^\.\//, '').replace(/\\/g, '/');
    return path === input.target && digestEvidence(path) === input.digest;
  }
  if (input.kind === 'focused-claim-search') {
    return digestEvidence(state.lastPrompt) === input.digest
      && exclusiveFocusedFactGrepInputMatches(state, event);
  }
  if (input.kind === 'route-probe') {
    const record = firstToolInputRecord(event);
    return digestEvidence(String(record.prompt ?? '').trim()) === input.digest;
  }
  if (input.kind === 'status-probe') {
    const record = firstToolInputRecord(event);
    return Object.keys(record).length === 0 && input.digest === digestEvidence('{}');
  }
  return false;
}

function exclusiveFocusedFactGrepInputMatches(state, event = {}) {
  const record = firstToolInputRecord(event);
  const pattern = String(record.pattern ?? record.query ?? record.search ?? '').trim();
  const scope = String(record.path ?? record.cwd ?? '.').trim().replace(/\\/g, '/');
  if (!pattern || !new Set(['', '.', './', '*', './*', '**/*', './**/*']).has(scope)) return false;
  const claimPaths = extractFocusedFactClaimPaths(state.lastPrompt);
  const claimTokens = new Set(focusedFactLexicalTokens(focusedFactClaimLexicalText(state.lastPrompt, claimPaths)));
  return focusedFactLexicalTokens(pattern).some((term) => claimTokens.has(term));
}

function canonicalExclusiveRuntimeToolName(value = '') {
  const name = String(value).trim().toLowerCase();
  if (TRUSTED_HOST_TEST_EXECUTORS.has(name)) return 'bash';
  return name;
}

function recordDirectExclusiveToolSuccess(state, toolName = '', callId = '', input = {}, ctx = {}) {
  const event = {
    toolName,
    toolCallId: String(callId ?? ''),
    input,
  };
  if (state.exclusiveToolState?.status === 'unused') {
    if (!exclusiveToolCallMatchesAllowedTool(state, toolName) || !exclusiveToolInputMatches(state, event, ctx)) return false;
    recordExclusiveToolCallStart(state, toolName, event, ctx);
  }
  return recordExclusiveToolResult(state, toolName, event, { successful: true }, ctx);
}

function recordExclusiveToolCallStart(state, toolName = '', event = {}, ctx = {}) {
  if (!exclusiveToolCallMatchesAllowedTool(state, toolName) || state.exclusiveToolState?.status !== 'unused') return false;
  if (!exclusiveToolInputMatches(state, event, ctx)) return false;
  state.exclusiveToolState = {
    ...state.exclusiveToolState,
    status: 'pending',
    toolName: canonicalExclusiveRuntimeToolName(toolName),
    toolCallIdDigest: digestEvidence(toolEventCallId(event) || `${toolName}:${gateControllerRouteId(state)}`),
    inputDigest: digestEvidence(toolActionText(event)),
    reasonCode: null,
  };
  return true;
}

function exclusiveToolResultDisposition(state, toolName = '', {
  successful = false,
  failed = false,
  pending = false,
} = {}) {
  if (pending) return { successful: false, failed: false, pending: true };
  const contract = state.lastRoute?.taskDescriptor?.exclusiveToolContract;
  if (['focused-claim-search', 'exact-path'].includes(contract?.input?.kind)
    && isFocusedLocalFactInspectionRoute(state.lastRoute)) {
    const acceptedFactEvidence = successful
      && state.focusedFactSearch?.routeId === gateControllerRouteId(state)
      && state.focusedFactSearch?.status === 'succeeded'
      && state.evidence.focusedFactEvidence?.routeId === gateControllerRouteId(state);
    return {
      successful: acceptedFactEvidence,
      failed: failed || !acceptedFactEvidence,
      pending: false,
    };
  }
  if (contract?.input?.kind !== 'exact-command'
    || !contract.allowedTools?.includes(canonicalExclusiveRuntimeToolName(toolName))) {
    return { successful, failed: failed || !successful, pending: false };
  }
  const acceptedTestEvidence = successful
    && state.evidence.testingGate === true
    && isAuthorizedExactTestCommand(
      state.lastRoute?.taskDescriptor?.testExecutionCommand ?? '',
      state.lastRoute?.taskDescriptor ?? {},
    );
  return {
    successful: acceptedTestEvidence,
    failed: failed || !acceptedTestEvidence,
    pending: false,
  };
}

function recordExclusiveToolResult(state, toolName = '', event = {}, { successful = false, failed = false, pending = false } = {}, ctx = {}) {
  const current = state.exclusiveToolState;
  if (!current || pending) return false;
  if (current.status === 'unused'
    && exclusiveToolCallMatchesAllowedTool(state, toolName)
    && exclusiveToolInputMatches(state, event, ctx)) {
    markExclusiveToolBlocked(state, 'exclusive-tool-unpaired-result');
    return true;
  }
  if (current.status !== 'pending') return false;
  const normalizedTool = canonicalExclusiveRuntimeToolName(toolName);
  if (current.toolName !== normalizedTool || !exclusiveToolInputMatches(state, event, ctx)) return false;
  const callId = toolEventCallId(event);
  if (!callId || current.toolCallIdDigest !== digestEvidence(callId)) return false;
  state.exclusiveToolState = {
    ...current,
    status: successful ? 'succeeded' : failed ? 'failed' : 'failed',
    toolName: normalizedTool,
    toolCallIdDigest: current.toolCallIdDigest,
    inputDigest: current.inputDigest,
    reasonCode: successful ? null : 'exclusive-tool-result-failed',
  };
  return true;
}

function markExclusiveToolBlocked(state, reasonCode = 'exclusive-tool-contract-unsatisfiable') {
  if (!state.lastRoute?.taskDescriptor?.exclusiveToolContract) return false;
  state.exclusiveToolState = {
    ...(state.exclusiveToolState ?? {
      schemaVersion: 1,
      routeId: gateControllerRouteId(state),
      toolName: null,
      toolCallIdDigest: null,
      inputDigest: null,
      finalCorrectionUsed: false,
    }),
    status: 'blocked',
    reasonCode,
  };
  return true;
}

function exclusiveToolStopsCompletionRepair(state) {
  if (!state.lastRoute?.taskDescriptor?.exclusiveToolContract) return false;
  return state.exclusiveToolState?.status !== 'succeeded';
}

function exclusiveToolTerminalOutputIsHonest(state, event = {}) {
  const output = extractFinalOutputText(event).trim();
  if (!output) return false;
  const status = state.exclusiveToolState?.status;
  if (terminalOutputHasPositiveClaim(output)) return false;
  const blocked = terminalOutputHasBlockedClaim(output);
  if (status === 'blocked' || status === 'unused') return blocked;
  if (status === 'failed') {
    return blocked
      || /^\s*FAIL\s*$/iu.test(output)
      || /(?:^|\n)\s*FACT_VERDICT\s*:\s*INSUFFICIENT\s*$/iu.test(output)
      || /\b(?:failed|failure|error)\b|(?:失败|出错|错误)/iu.test(output);
  }
  return status === 'pending' && (/\b(?:pending|still running|in progress)\b|(?:仍在运行|进行中|等待结果)/iu.test(output));
}

function exclusiveSuccessfulTerminalOutputIsHonest(state, event = {}) {
  const contract = state.lastRoute?.taskDescriptor?.exclusiveToolContract;
  const kind = contract?.input?.kind;
  if (!['exact-command', 'status-probe'].includes(kind)) return true;
  const output = extractFinalOutputText(event).trim();
  if (!output) return false;
  const expected = exclusiveSuccessfulExpectedOutput(state.lastPrompt);
  if (expected) return output === expected;
  return !terminalOutputHasBlockedClaim(output)
    && !terminalOutputHasFalseFailureClaim(output);
}

function exclusiveSuccessfulExpectedOutput(prompt = '') {
  const value = activeUnquotedTerminalInstructionText(prompt);
  const literal = String.raw`([A-Z0-9_.-]{1,48}(?:\s*:\s*[A-Z0-9_.-]{1,48})?)`;
  const conditionalFirst = value.match(new RegExp(
    String.raw`\bif\b[^.;\n]{0,160}\b(?:passes|passed|succeeds|succeeded|is\s+successful)\b\s*,\s*(?:return|respond|output|report)\s+exactly\s+${literal}`,
    'iu',
  ))?.[1];
  if (conditionalFirst) return conditionalFirst.replace(/\s*:\s*/g, ': ');
  const literalFirst = value.match(new RegExp(
    String.raw`\b(?:return|respond|output|report)\s+exactly\s+${literal}\s+if\b[^.;\n]{0,120}\b(?:passes|passed|succeeds|succeeded|is\s+successful)\b`,
    'iu',
  ))?.[1];
  if (literalFirst) return literalFirst.replace(/\s*:\s*/g, ': ');
  const chinese = value.match(/(?:如果|若)[^。；\n]{0,120}(?:通过|成功)[，,]\s*(?:只)?(?:返回|输出|报告)\s*([A-Z0-9_.-]{1,48}(?:\s*:\s*[A-Z0-9_.-]{1,48})?)/iu)?.[1];
  return chinese ? chinese.replace(/\s*:\s*/g, ': ') : '';
}

function activeUnquotedTerminalInstructionText(prompt = '') {
  return String(prompt).normalize('NFKC')
    .replace(/(?:^|(?<=[.!?。！？]\s))(?:(?:please)\s+)?follow\s+(?:this|the\s+following)\s+instruction\s+exactly\s*:\s*(?:"([^"\n]+)"|“([^”\n]+)”|`([^`\n]+)`)/giu,
      (_match, straight, curly, tick) => ` ${straight ?? curly ?? tick ?? ''} `)
    .replace(/(?:^|(?<=[。！？]\s))请?\s*(?:严格)?(?:按照|遵循|执行)\s*(?:这条|以下|下面)?\s*(?:指令|要求)\s*[:：]\s*(?:“([^”\n]+)”|`([^`\n]+)`)/gu,
      (_match, curly, tick) => ` ${curly ?? tick ?? ''} `)
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/gu, ' ')
    .replace(/^[\t ]*>[^\n]*(?:\n|$)/gmu, ' ')
    .replace(/“[^”\n]*”|‘[^’\n]*’|"[^"\n]*"|`[^`\n]*`/gu, ' ')
    .replace(/(?<![\p{L}\p{N}])'[^'\n]+'(?![\p{L}\p{N}])/gu, ' ');
}

function terminalOutputHasFalseFailureClaim(output = '') {
  const text = String(output)
    .replace(/\b(?:no|zero)\s+(?:tests?\s+)?(?:failed|failures?|errors?)\b/giu, ' ')
    .replace(/\b(?:0|zero)\s+(?:tests?\s+)?(?:failed|failures?|errors?)\b/giu, ' ')
    .replace(/\b(?:tests?\s+)?(?:failed|failures?|errors?)\s*[:=]\s*(?:0|zero)\b/giu, ' ')
    .replace(/\b(?:did\s+not|didn't|has\s+not|have\s+not|never|not)\s+fail(?:ed)?\b/giu, ' ')
    .replace(/\bwithout\s+(?:any\s+)?(?:failures?|errors?)\b/giu, ' ')
    .replace(/(?:没有|无|零|0\s*个?)\s*(?:测试)?(?:失败|错误)|(?:失败|错误)\s*[:：=]\s*0/gu, ' ');
  return /^\s*(?:FAIL|FAILED|FAILURE|ERROR|NO)\s*[.!。！]?\s*$/iu.test(text)
    || /\b(?:tests?|test\s+run|command|execution|run|tool(?:\s+call)?|result|outcome)\b[^.!?\n]{0,32}\b(?:failed|failure|errored|unsuccessful)\b/iu.test(text)
    || /\b(?:a\s+)?(?:failure|error)\s+(?:occurred|was\s+(?:reported|observed)|prevented\s+completion)\b/iu.test(text)
    || /(?:测试|命令|执行|运行|工具调用|结果).{0,16}(?:失败|出错|错误|未成功)|(?:失败|错误|出错)(?:了|发生)/u.test(text);
}

function terminalBlockedOutputIsHonest(output = '') {
  const text = String(output).trim();
  return Boolean(text) && !terminalOutputHasPositiveClaim(text) && terminalOutputHasBlockedClaim(text);
}

function terminalAwaitingUserOutputIsHonest(output = '', reasonCode = '') {
  const text = String(output).trim();
  if (!text || terminalOutputHasPositiveClaim(text)) return false;
  if (terminalOutputHasBlockedClaim(text)) return true;
  const patterns = {
    'external-destructive-action-unsupported': /\b(?:unsupported|not\s+safely\s+supported|provider-native\s+(?:manual\s+)?workflow)\b|(?:不支持|无法安全支持|提供商原生.{0,8}手动流程)/iu,
    'external-action-target-confirmation-required': /\b(?:provide|confirm|name|identify|split|sequence)\b[^.!?\n]{0,96}\b(?:exact|single|one)\b[^.!?\n]{0,64}\b(?:target|recipient|channel|folder|calendar|page|action)\b|(?:请)?(?:提供|确认|指定|说明|拆分|排序).{0,32}(?:一个|单一|唯一|明确|确切).{0,24}(?:目标|收件人|频道|文件夹|日历|页面|操作)/iu,
    'document-preservation-multi-target-unsupported': /\b(?:provide|name|identify|choose|split)\b[^.!?\n]{0,96}\b(?:one|single|exact)\b[^.!?\n]{0,48}\b(?:document|file|target)\b|(?:请)?(?:提供|指定|明确|选择|拆分).{0,32}(?:一个|单一|唯一|明确|确切).{0,24}(?:文档|文件|目标)/iu,
    'document-preservation-scope-confirmation-required': /\b(?:identify|provide|name|confirm)\b[^.!?\n]{0,96}\b(?:one|single|exact)\b[^.!?\n]{0,64}\b(?:editable\s+sentence|sentence|protected\s+literal|scope)\b|(?:请)?(?:明确|提供|指定|确认).{0,32}(?:一个|单一|唯一|明确|确切).{0,24}(?:可编辑的?句子|句子|受保护的?字面量|范围)/iu,
    'document-preservation-snapshot-too-large': /\b(?:need|provide|split|choose|use)\b[^.!?\n]{0,96}\b(?:smaller|narrower|one|single|exact)\b[^.!?\n]{0,64}\b(?:task|file|document|scope|section)\b|(?:需要|请提供|请拆分|请选择|请使用).{0,32}(?:更小|更窄|一个|单一|明确|确切).{0,24}(?:任务|文件|文档|范围|章节)/iu,
    'release-target-confirmation-required': /\b(?:provide|confirm|name|identify)\b[^.!?\n]{0,96}\b(?:exact|complete)\b[^.!?\n]{0,64}\b(?:repository|registry|cluster|target|revision|version|ref|tag|image)\b|(?:请)?(?:提供|确认|指定|明确).{0,32}(?:明确|完整|确切).{0,24}(?:仓库|注册表|集群|目标|修订|版本|引用|标签|镜像)/iu,
    'release-verification-unsupported': /\b(?:unsupported|provide|confirm|needs?|requires?)\b[^.!?\n]{0,128}\b(?:verifiable|verification|exact|supported)\b[^.!?\n]{0,64}\b(?:target|contract|command|workflow)?\b|(?:不支持|请提供|请确认|需要|要求).{0,48}(?:可验证|验证|明确|确切|受支持).{0,24}(?:目标|契约|命令|流程)?/iu,
    'irreversible-approval-required': /\b(?:rerun|enable|provide|requires?)\b[^.!?\n]{0,96}\b(?:interactive|trusted|host)\b[^.!?\n]{0,48}\bapproval\b|(?:请)?(?:重新运行|启用|提供|需要).{0,32}(?:交互式|可信|宿主).{0,24}(?:批准|审批|授权)/iu,
    'exclusive-tool-contract-unsatisfiable': /\b(?:restate|provide|confirm|needs?|requires?)\b[^.!?\n]{0,128}\b(?:exact|authorized|conflict|constraint|capability|input|action)\b|(?:请)?(?:重新说明|提供|确认|需要).{0,48}(?:明确|确切|已授权|冲突|约束|能力|输入|操作)/iu,
    'network-access-unverifiable': /\b(?:restate|provide|confirm|needs?|requires?)\b[^.!?\n]{0,128}\b(?:network|sandbox|offline|exact|conflict|constraint)\b|(?:请)?(?:重新说明|提供|确认|需要).{0,48}(?:网络|沙箱|离线|明确|确切|冲突|约束)/iu,
  };
  return patterns[reasonCode]?.test(text) === true;
}

function terminalOutputHasPositiveClaim(output = '') {
  const positiveScope = String(output)
    .replace(/\b(?:did|does|do|was|were|is|has|have|could|can)\s+not\s+(?:successfully\s+)?(?:execute|run|perform|complete|succeed|finish|verify|publish|release|deploy)(?:d|ed)?(?:\s+successfully)?\b/giu, ' ')
    .replace(/\b(?:not|never|cannot|unable\s+to)\s+(?:be\s+)?(?:successfully\s+)?(?:executed|run|performed|completed|successful|succeeded|finished|verified|published|released|deployed)(?:\s+successfully)?\b/giu, ' ')
    .replace(/(?:未|没有|无法|不能|不曾)\s*(?:能\s*)?(?:成功(?:地)?\s*)?(?:执行|运行|完成|验证|发布|部署)|(?:未|没有|无法|不能)\s*成功/gu, ' ');
  return /\b(?:PASS|SAFE|SUCCESS(?:FUL(?:LY)?)?|SUCCEEDED|COMPLETED?|RELEASED|PUBLISHED|DEPLOYED|VERIFIED)\b|(?:已完成|成功|已发布|已部署|已验证|安全通过)/iu.test(positiveScope);
}

function terminalOutputHasBlockedClaim(output = '') {
  return /\b(?:blocked|not\s+(?:executed|run|performed|completed|successful)|did\s+not\s+(?:execute|run|complete|succeed)|no\s+(?:additional|further)\s+(?:tool\s+call|action)\s+was\s+(?:performed|taken|executed)|cannot|unable|conflicting\s+constraint|requires?\s+(?:new\s+)?authorization)\b|(?:未执行|未运行|未完成|未成功|没有(?:执行|采取)更多(?:工具调用|操作)|受阻|无法|约束冲突|需要.{0,12}授权)/iu.test(String(output));
}

function readActionBoundaryState(value) {
  if (!isRecord(value) || value.schemaVersion !== 1) return createActionBoundaryState();
  const denialCount = Math.min(2, Math.max(0, Number.isInteger(value.denialCount) ? value.denialCount : 0));
  const reasonCounts = isRecord(value.reasonCounts)
    ? Object.fromEntries(Object.entries(value.reasonCounts)
      .filter(([key, count]) => /^[a-z0-9-]{1,64}$/.test(key) && Number.isInteger(count))
      .map(([key, count]) => [key, Math.min(2, Math.max(0, count))])
      .slice(-8))
    : {};
  return {
    schemaVersion: 1,
    denialCount,
    terminal: value.terminal === true || denialCount >= 2 || Object.values(reasonCounts).some((count) => count >= 2),
    awaitingUserReason: USER_INPUT_ACTION_BLOCKERS.has(value.awaitingUserReason)
      ? value.awaitingUserReason
      : null,
    finalCorrectionUsed: value.finalCorrectionUsed === true,
    fingerprints: Array.isArray(value.fingerprints)
      ? value.fingerprints.filter((item) => /^[a-f0-9]{64}$/.test(String(item))).slice(-2)
      : [],
    reasonCounts,
  };
}

function recordProtectedActionDenial(state, boundary, toolName = '', event = {}) {
  const current = readActionBoundaryState(state.actionBoundary);
  const fingerprint = digestEvidence(`${boundary.reasonCode}:${toolName}:${toolActionText(event)}`);
  current.denialCount = Math.min(2, current.denialCount + 1);
  current.reasonCounts[boundary.reasonCode] = Math.min(2, (current.reasonCounts[boundary.reasonCode] ?? 0) + 1);
  current.fingerprints = [...new Set([...current.fingerprints, fingerprint])].slice(-2);
  if (REPAIRABLE_ACTION_BLOCKERS.has(boundary.reasonCode)) {
    current.terminal = current.denialCount >= 2 || current.reasonCounts[boundary.reasonCode] >= 2;
    state.actionBoundary = current;
    if (!current.terminal) {
      return {
        ...boundary,
        reason: `${boundary.reason} This is one bounded mechanical repair using existing user authority; retry only with the exact trusted target fields.`,
      };
    }
    if (boundary.reasonCode === 'test-target-authorization-required') {
      const exactTargets = state.lastRoute?.taskDescriptor?.testExecutionTargets ?? [];
      return {
        ...boundary,
        reasonCode: 'protected-action-terminal',
        reason: `OMP_GATE_TERMINAL: repeated non-canonical exact-test commands exhausted alternative repairs. Do not try another method. The only remaining permitted tool call is the canonical command: node --test ${exactTargets.join(' ')}. If that exact command cannot run, report the task blocked.`,
      };
    }
  }
  if (USER_INPUT_ACTION_BLOCKERS.has(boundary.reasonCode)) {
    current.awaitingUserReason = boundary.reasonCode;
    current.terminal = false;
    state.actionBoundary = current;
    return {
      ...boundary,
      reason: `${boundary.reason} Stop tool use now and ask the user once; the completion gate will allow that clarification message without a repair loop.`,
    };
  }
  current.terminal = current.denialCount >= 2 || current.reasonCounts[boundary.reasonCode] >= 2;
  state.actionBoundary = current;
  if (!current.terminal) {
    return {
      ...boundary,
      reason: `${boundary.reason} Do not retry this protected action without new user authorization or a new trusted route.`,
    };
  }
  return {
    ...boundary,
    reasonCode: 'protected-action-terminal',
    reason: `OMP_GATE_TERMINAL: repeated protected action denials exhausted the route-local action budget. Do not call or run any more tools or commands; report the blocked constraint to the user. Last denial: ${boundary.reason}`,
  };
}

function isCanonicalExactTestRepair(state, toolName = '', event = {}) {
  if ((state.actionBoundary?.reasonCounts?.['test-target-authorization-required'] ?? 0) < 2) return false;
  if (!TRUSTED_HOST_TEST_EXECUTORS.has(String(toolName).toLowerCase())) return false;
  const targets = state.lastRoute?.taskDescriptor?.testExecutionTargets ?? [];
  return isExactTestExecutionRoute(state.lastRoute)
    && isDirectExactLocalTestCommand(toolActionText(event), targets);
}

function createTrustedApprovalState() {
  return {
    requests: new Map(),
    tokens: new Map(),
    inFlight: new Map(),
    usedCallIds: new Set(),
  };
}

function recordTrustedApprovalRequest(state, event = {}, ctx = {}) {
  const approval = approvalEventIdentity(state, event, ctx);
  if (!approval || state.trustedApprovals.usedCallIds.has(approval.toolCallId)) return false;
  pruneTrustedApprovalState(state.trustedApprovals);
  state.trustedApprovals.requests.set(approval.toolCallId, approval);
  return true;
}

function recordTrustedApprovalResolution(state, event = {}, ctx = {}) {
  const approval = approvalEventIdentity(state, event, ctx);
  if (!approval) return false;
  pruneTrustedApprovalState(state.trustedApprovals);
  const requested = state.trustedApprovals.requests.get(approval.toolCallId);
  if (!sameApprovalIdentity(requested, approval)) return false;
  state.trustedApprovals.requests.delete(approval.toolCallId);
  if (event.approved !== true) {
    state.trustedApprovals.usedCallIds.add(approval.toolCallId);
    return false;
  }
  state.trustedApprovals.tokens.set(approval.toolCallId, approval);
  return true;
}

function approvalEventIdentity(state, event = {}, ctx = {}) {
  const sessionId = cleanApprovalIdentity(event.sessionId);
  const toolCallId = toolEventCallId(event);
  const toolName = cleanApprovalIdentity(toolEventName(event));
  const expectedSessionId = cleanApprovalIdentity(ctx.sessionManager?.getSessionId?.());
  if (!state.lastRoute || !state.routeStartedAt || !sessionId || !toolCallId || !toolName) return null;
  if (expectedSessionId && sessionId !== expectedSessionId) return null;
  return {
    routeId: gateControllerRouteId(state),
    sessionId,
    toolCallId,
    toolName,
    recordedAt: Date.now(),
  };
}

function sameApprovalIdentity(left, right) {
  return Boolean(left && right
    && left.routeId === right.routeId
    && left.sessionId === right.sessionId
    && left.toolCallId === right.toolCallId
    && left.toolName === right.toolName);
}

function consumeTrustedApprovalToken(state, event = {}, toolName = '') {
  const toolCallId = toolEventCallId(event);
  if (!toolCallId || !toolName) return null;
  pruneTrustedApprovalState(state.trustedApprovals);
  const token = state.trustedApprovals.tokens.get(toolCallId);
  if (!token) return null;
  state.trustedApprovals.tokens.delete(toolCallId);
  state.trustedApprovals.usedCallIds.add(toolCallId);
  if (token.routeId !== gateControllerRouteId(state) || token.toolName !== toolName) return null;
  return token;
}

function hasTrustedApprovalForRouteTool(state, toolName = '') {
  pruneTrustedApprovalState(state.trustedApprovals);
  return [...state.trustedApprovals.tokens.values()].some((token) => (
    token.routeId === gateControllerRouteId(state) && token.toolName === toolName
  ));
}

function stageTrustedIrreversibleCall(state, token, text = '') {
  if (!token) return false;
  const toolCallId = token.toolCallId;
  state.trustedApprovals.inFlight.set(toolCallId, {
    ...token,
    inputDigest: digestEvidence(text),
  });
  return true;
}

function recordTrustedIrreversibleResult(state, toolName = '', event = {}, { successful = false } = {}) {
  const toolCallId = toolEventCallId(event);
  if (!toolCallId) return false;
  const pending = state.trustedApprovals.inFlight.get(toolCallId);
  if (!pending) return false;
  state.trustedApprovals.inFlight.delete(toolCallId);
  if (!successful
    || !isSuccessfulApprovedToolResult(event)
    || pending.routeId !== gateControllerRouteId(state)
    || pending.toolName !== toolName
    || pending.inputDigest !== digestEvidence(toolActionText(event))) return false;
  state.evidence.irreversibleExecution = {
    schemaVersion: 1,
    source: 'host-tool-approval',
    routeId: pending.routeId,
    toolName,
    toolCallIdDigest: digestEvidence(toolCallId),
    inputDigest: pending.inputDigest,
    completedAt: Date.now(),
  };
  return true;
}

function isSuccessfulApprovedToolResult(event = {}) {
  const exitCodes = [event.exitCode, event.details?.exitCode, event.result?.exitCode, event.result?.details?.exitCode]
    .filter((value) => Number.isFinite(value));
  if (exitCodes.some((value) => value !== 0)) return false;
  const asyncStates = [event.details?.async?.state, event.result?.details?.async?.state]
    .map((value) => String(value ?? '').toLowerCase())
    .filter(Boolean);
  return !asyncStates.some((value) => ['pending', 'running', 'started', 'in_progress', 'in-progress'].includes(value));
}

function hasTrustedIrreversibleCompletion(state) {
  const evidence = state.evidence.irreversibleExecution;
  return evidence?.schemaVersion === 1
    && evidence.source === 'host-tool-approval'
    && evidence.routeId === gateControllerRouteId(state);
}

function pruneTrustedApprovalState(approvals, now = Date.now()) {
  const expiresBefore = now - 2 * 60 * 1000;
  while (approvals.requests.size > 64) approvals.requests.delete(approvals.requests.keys().next().value);
  for (const collection of [approvals.tokens, approvals.inFlight]) {
    for (const [key, value] of collection) {
      if ((value.recordedAt ?? 0) < expiresBefore) collection.delete(key);
    }
    while (collection.size > 64) collection.delete(collection.keys().next().value);
  }
  while (approvals.usedCallIds.size > 128) approvals.usedCallIds.delete(approvals.usedCallIds.values().next().value);
}

function cleanApprovalIdentity(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
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
  const requiredSubagents = subagentRequirements(routeRequiredSubagents(state.lastRoute));
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
  const recovery = recordGateRecovery(state.gateRecovery, {
    gateKey: ruleGate.gateKey,
    reasonCode: kind,
    doNext: 'use the routed pre-work assignment contracts on the next task call when subagent work is still needed',
    doNot: 'fork extra subagents after the user-facing answer only to satisfy this gate',
    after: 'continue the original task with the best available evidence',
  });
  return {
    block: false,
    reason: [ruleGate.context, recovery.context].filter(Boolean).join('\n\n'),
    additionalContext: recovery.context,
    reasonCode: kind,
    recovery,
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
  return routeRequiredSkills(state.lastRoute)
    .filter((skill) => !loaded.some((loadedSkill) => skillNamesEquivalent(skill, loadedSkill)));
}

function recordFinalOutputEvidence(state, event = {}) {
  const output = extractFinalOutputText(event);
  if (isFocusedLocalFactInspectionRoute(state.lastRoute)) {
    state.evidence.factCheckGate = focusedFactConclusionMatchesEvidence(state, output);
  }
  if (!output) return;

  if (state.lastRoute?.intent === 'bug-audit' && isDeliverableBugAuditReport(output)) {
    state.evidence.deliveredBugAuditReport = true;
  }
  if (isStructuredReviewEvidence(output)) state.evidence.reviewEvidence = true;
  if (isStructuredSecurityReview(output, {
    allowFindings: isReadOnlySecurityReportRoute(state.lastRoute),
    securitySignals: state.evidence.securityInspectionEvidence?.securitySignals ?? [],
  })) {
    state.evidence.mainAgentSecurityReview = true;
  }
  if (matchesObservedManualTestingReport(state, output)) {
    state.evidence.testingGate = true;
  }

  const requiredSkills = routeRequiredSkills(state.lastRoute);
  if (requiredSkills.length && !state.lastSkillUsage?.ok && hasLoadedSkillEvidence(output)) {
    state.lastSkillUsage = validateSkillUsage({
      requiredSkills,
      output,
      loadedSkills: effectiveLoadedSkillsForValidation(state),
    });
  }

  const requiredSubagents = subagentRequirements(routeRequiredSubagents(state.lastRoute));
  if (requiredSubagents.length && !state.lastSubagentUsage?.ok && /\bSUBAGENT_USAGE\b/i.test(output)) {
    state.lastSubagentUsage = validateSubagentUsage({ requiredSubagents, output });
    if (state.lastSubagentUsage.ok) recordSubagentFinalUsage(state, output);
  }
}

function recordAssistantReviewEvidence(state, event = {}) {
  const message = isRecord(event.message) ? event.message : event;
  if (message?.role !== 'assistant') return false;
  const output = extractGeneratedOutputText(event);
  if (!isStructuredReviewEvidence(output) || state.evidence.reviewEvidence === true) return false;
  state.evidence.reviewEvidence = true;
  return true;
}

function isStructuredReviewEvidence(output = '') {
  const text = String(output);
  const scope = structuredEvidenceField(text, 'Scope');
  const findings = structuredEvidenceField(text, 'Findings?');
  return /(?:^|\n)\s*REVIEW_EVIDENCE\s*(?:\n|$)/i.test(text)
    && isConcreteStructuredEvidenceValue(scope)
    && isConcreteStructuredEvidenceValue(findings)
    && /(?:^|\n)\s*Verdict:\s*(?:PASS|READY|APPROVED)\b/i.test(text)
    && !hasContradictoryPassEvidence(text);
}

function isStructuredSecurityReview(output = '', { allowFindings = false, securitySignals = [] } = {}) {
  const text = String(output);
  const scope = structuredEvidenceField(text, 'Scope');
  const findings = structuredEvidenceField(text, 'Findings?');
  const evidence = structuredEvidenceField(text, 'Evidence');
  const verdict = text.match(/(?:^|\n)\s*Verdict:\s*(PASS|READY|APPROVED|FINDINGS|COMPLETE)\b/i)?.[1]?.toUpperCase();
  const acceptedVerdict = ['PASS', 'READY', 'APPROVED'].includes(verdict)
    || allowFindings && ['FINDINGS', 'COMPLETE'].includes(verdict);
  return /(?:^|\n)\s*SECURITY_REVIEW\s*(?:\n|$)/i.test(text)
    && isConcreteStructuredEvidenceValue(scope)
    && isConcreteStructuredEvidenceValue(findings)
    && isConcreteStructuredEvidenceValue(evidence)
    && acceptedVerdict
    && (!allowFindings || !hasUnsupportedSecurityClaims(text, securitySignals))
    && (['FINDINGS', 'COMPLETE'].includes(verdict) || !hasContradictoryPassEvidence(text));
}

function structuredEvidenceField(text = '', labelPattern = '') {
  return String(text).match(new RegExp(`(?:^|\\n)\\s*${labelPattern}:\\s*([^\\n]+)`, 'i'))?.[1]?.trim() ?? '';
}

function isConcreteStructuredEvidenceValue(value = '') {
  const text = String(value).trim();
  if (!text || /<[^>\n]+>/.test(text)) return false;
  return !/^(?:write|state|describe|list|provide|insert|replace|fill|enter)\b/i.test(text)
    && !/^(?:reviewed target and change|reviewed file and any callers actually inspected|concrete static review findings|supported findings,? or none confirmed in the inspected scope|concrete boundary,? caller,? or sink evidence)\s*$/i.test(text);
}

function hasUnsupportedSecurityClaims(output = '', securitySignals = []) {
  const findings = securityEvidenceField(String(output), 'Findings?');
  if (isPureSecurityNoFinding(findings)) return false;
  const categories = securityClaimCategories(findings);
  const observed = new Set(Array.isArray(securitySignals) ? securitySignals : []);
  return [...categories].some((category) => !observed.has(category));
}

function isPureSecurityNoFinding(value = '') {
  const text = String(value).trim();
  if (!text) return false;
  const negativeClause = String.raw`no\s+(?:(?:confirmed|supported|demonstrated|open|unresolved|high[- ]severity|exploitable)\s+){0,5}(?:security\s+)?(?:bypass(?:es)?|findings?|issues?|vulnerabilit(?:y|ies)|blockers?)(?:\s+(?:remain|remains|found|were\s+found|was\s+found|in\s+(?:the\s+)?inspected\s+(?:scope|paths?)))?`;
  const noneClause = String.raw`none(?:\s+confirmed)?(?:\s+in\s+(?:the\s+)?inspected\s+(?:scope|paths?))?`;
  const english = new RegExp(`^(?:${negativeClause}|${noneClause}(?:\\s*(?::|[-–—]|\\()\\s*${negativeClause}\\s*\\)?)?)[.!]?$`, 'i');
  const chinese = /^(?:无|没有|未发现)(?:已确认|有证据支持|可证实|未解决|开放|遗留|高危|严重)?(?:的)?(?:安全)?(?:发现|漏洞|问题|阻塞项)(?:存在|遗留|未解决|在已检查范围内)?[。！]?$/;
  return english.test(text) || chinese.test(text);
}

function securityClaimCategories(value = '') {
  const text = String(value);
  const categories = new Set();
  if (/\b(?:xss|cross[- ]site scripting)\b|(?:跨站脚本|跨站注入)/i.test(text)) categories.add('xss-sink');
  if (/\b(?:sql\s*injection|sqli)\b|sql\s*注入/i.test(text)) categories.add('sql-sink');
  if (/\b(?:command\s*injection|rce|remote\s+code\s+execution)\b|(?:命令注入|远程代码执行|任意代码执行)/i.test(text)) categories.add('code-execution-sink');
  if (/\bpath\s*traversal\b|路径遍历/i.test(text)) categories.add('filesystem-sink');
  if (/\bcrlf\s*injection\b|crlf\s*注入/i.test(text)) categories.add('header-sink');
  if (/\bssrf\b|服务端请求伪造/i.test(text)) categories.add('network-sink');
  if (/\b(?:auth(?:entication|orization)?\s*bypass|access[- ]control\s*bypass)\b|(?:鉴权绕过|认证绕过|权限绕过)/i.test(text)) categories.add('auth-boundary');
  if (/\b(?:authorize|authorization|authentication|permissions?|access[- ]control)\b[^.;\n]{0,80}\b(?:always|unconditional(?:ly)?)\b[^.;\n]{0,30}\b(?:return|allow|grant|true)\b|(?:鉴权|认证|授权|权限)[^。；\n]{0,60}(?:始终|无条件)[^。；\n]{0,20}(?:返回|允许|放行|true)/i.test(text)) {
    categories.add('auth-boundary');
  }
  if (/\b(?:open\s+redirect|credential\s+theft|csrf|prototype\s+pollution|redos|denial\s+of\s+service|hard[- ]coded\s+secret|api\s+key\s+leak|arbitrary\s+(?:files?|read|write)|unauthori[sz]ed\s+(?:access|state|action))\b|(?:开放重定向|凭据窃取|原型污染|拒绝服务|硬编码密钥|任意文件|未授权访问)/i.test(text)) {
    categories.add('generic-risk');
  }
  if (categories.size === 0
    && /\b(?:high|critical|medium|unsafe|vulnerabilit(?:y|ies)|exploit(?:able|ation)?|attacker|attackers|security\s+(?:issue|risk|flaw))\b|(?:高危|严重|中危|不安全|漏洞|攻击者)/i.test(text)) {
    categories.add('generic-risk');
  }
  if (categories.size === 0) categories.add('generic-risk');
  return categories;
}

function securityEvidenceField(output = '', label = '') {
  const match = String(output).match(new RegExp(
    `(?:^|\\n)\\s*${label}:\\s*([\\s\\S]*?)(?=\\n\\s*(?:Scope|Findings?|Evidence|OpenBlockers|Verdict):|$)`,
    'i',
  ));
  return match?.[1]?.trim() ?? '';
}

function isReadOnlySecurityReportRoute(route) {
  const descriptor = route?.taskDescriptor;
  return descriptor?.operation === 'inspect'
    && descriptor.domains?.includes('security')
    && descriptor.constraints?.workspaceWrite === 'forbidden'
    && descriptor.constraints?.externalWrite !== 'required';
}

function hasContradictoryPassEvidence(value = '') {
  const text = String(value);
  if (/(?:^|\n)\s*Verdict:\s*(?:FAIL|FAILED|BLOCKED|NEEDS?[-_ ]WORK)\b/i.test(text)) return true;

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const blocker = lines[index].match(/^\s*(?:OpenBlockers|Blockers):\s*(.*)$/i);
    if (!blocker) continue;
    const inline = blocker[1].trim();
    if (inline && !/^(?:none|no(?:ne)?|n\/a|nil|zero|\[\]|无|没有|不存在)[.!。]?$/i.test(inline)) return true;
    if (!inline) {
      const next = lines[index + 1]?.trim() ?? '';
      if (/^-\s*\S/.test(next) && !/^-\s*(?:none|n\/a|无|没有)\b/i.test(next)) return true;
    }
  }

  return text.split(/[\n.;。；]+/).some((clause) => contradictoryFindingClause(clause));
}

function contradictoryFindingClause(value = '') {
  const clause = String(value).trim();
  if (!clause) return false;
  const englishSeverity = /\b(?:critical|high(?:-severity)?)\b/i.test(clause);
  const englishResolved = /\b(?:fixed|resolved|remediated|mitigated|closed|addressed)\b/i.test(clause);
  const englishNegated = /\b(?:no|none|zero|without)\b.{0,80}\b(?:critical|high(?:-severity)?|unresolved|open|remaining|vulnerabilit(?:y|ies)|bypass)\b/i.test(clause);
  const explicitOpen = /\b(?:unresolved|unfixed|unmitigated|remaining|still\s+open|remains?\s+(?:open|unresolved)|active|exploitable)\b/i.test(clause);
  const confirmedSevere = englishSeverity
    && /\b(?:confirmed|vulnerabilit(?:y|ies)|bypass|blockers?)\b/i.test(clause);
  if (englishSeverity && !englishResolved && !englishNegated && (explicitOpen || confirmedSevere)) return true;

  const chineseSeverity = /(?:高危|严重|关键)/.test(clause);
  const chineseResolved = /(?:已修复|已解决|已缓解|已关闭|不存在|未发现|没有|无(?:任何)?)/.test(clause);
  const chineseOpen = /(?:未解决|仍存在|未修复|可利用|已确认|漏洞|阻断)/.test(clause);
  return chineseSeverity && chineseOpen && !chineseResolved;
}

function parseStructuredManualTestingReport(output = '') {
  const text = String(output);
  if (!/(?:^|\n)\s*MANUAL_TESTING_GATE_REPORT\s*(?:\n|$)/i.test(text)
    || !/(?:^|\n)\s*Result:\s*PASS\b/i.test(text)
    || !/(?:^|\n)\s*Scope:\s*\S/i.test(text)
    || !/(?:^|\n)\s*Evidence:\s*\S/i.test(text)) return null;
  const command = text.match(/(?:^|\n)\s*Command:\s*(\S[^\n]*)/i)?.[1]?.trim();
  return command ? { command } : null;
}

function matchesObservedManualTestingReport(state, output = '') {
  const report = parseStructuredManualTestingReport(output);
  const evidence = state.evidence.testCommandEvidence;
  return Boolean(report
    && state.evidence.testingEnhancerEvidence?.status !== 'failed'
    && hasTestingToolUnavailableEvidence(state)
    && evidence?.source === 'host-tool-result'
    && evidence.routeId === gateControllerRouteId(state)
    && manualTestScopeMatches(state.lastPrompt, report.command)
    && evidence.commandDigest === digestEvidence(report.command));
}

function manualTestScopeMatches(prompt = '', command = '') {
  const targets = extractSecurityScopePaths(String(prompt).toLowerCase())
    .filter((path) => /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|swift|rb|php|cs)$|(?:^|\/)(?:src|lib|app|server|api)\//i.test(path));
  if (!targets.length || isFullTestSuiteCommand(command)) return true;
  const text = String(command).toLowerCase();
  return targets.every((target) => {
    const basename = target.split('/').at(-1) ?? target;
    const stem = basename.replace(/\.[^.]+$/, '');
    return text.includes(target) || stem.length >= 3 && new RegExp(`(?:^|[^a-z0-9])${escapeRegularExpression(stem)}(?:[^a-z0-9]|$)`, 'i').test(text);
  });
}

function escapeRegularExpression(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isFullTestSuiteCommand(command = '') {
  const text = String(command).trim();
  return /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test(?:\s+--(?:workspace|workspaces)\s+\S+)?$/i.test(text)
    || /^cargo\s+(?:test|nextest\s+run)(?:\s+--workspace)?$/i.test(text)
    || /^go\s+test\s+\.\/\.\.\.$/i.test(text)
    || /^pytest(?:\s+-[\w=-]+)*$/i.test(text)
    || /^node\s+--test$/i.test(text);
}

function hasTestingToolUnavailableEvidence(state) {
  return state.testingToolAvailability === 'unavailable'
    || state.evidence.toolFailures.some((failure) => (
    /^omp_test_/i.test(failure.tool)
    && /(?:not found|unknown tool|unavailable|not registered|missing tool|unsupported)/i.test([
      failure.message,
      failure.summary,
      failure.repairHint,
    ].filter(Boolean).join(' '))
    ));
}

function refreshTestingToolAvailability(state, pi) {
  if (typeof pi?.getActiveTools !== 'function') return;
  try {
    const active = pi.getActiveTools();
    if (!Array.isArray(active)) return;
    state.testingToolAvailability = active.includes('omp_test_gate') ? 'available' : 'unavailable';
  } catch {
    state.testingToolAvailability = 'unknown';
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
  const output = extractFinalOutputText(event);
  if (state.loopGuard.recoveryPending) {
    if (!output || state.loopGuard.streamTriggered) return buildLoopRecoveryContext(state.loopGuard);
    const recoveryDetection = recordFinalGeneratedText(state.loopGuard, output);
    if (recoveryDetection.repeated) return buildLoopRecoveryContext(state.loopGuard);
    recordLoopGuardProgress(state.loopGuard, 'non_repeated_progress');
    return null;
  }
  if (!output) return null;
  const detection = recordFinalGeneratedText(state.loopGuard, output);
  if (!detection.repeated) return null;
  return buildLoopRecoveryContext(state.loopGuard);
}

async function handleLoopGuardGeneratedOutput(pi, state, ctx = {}, text = '') {
  const loopMode = readRuntimePolicy().loopMode;
  if (loopMode === 'disabled') return undefined;
  if (state.loopGuard.streamTriggered) return undefined;
  if (!text) return undefined;
  const detection = recordGeneratedText(state.loopGuard, text);
  if (!detection.repeated) return undefined;

  await writeDebugLog(ctx, 'loops', buildDebugRecord({
    kind: 'loops',
    route: state.lastRoute,
    reasonCode: detection.kind ?? 'repeated_generation',
    payload: {
      fingerprint: detection.fingerprint,
      repairUsed: state.gateController?.budget?.repairUsed ?? 0,
      terminalUsed: state.gateController?.budget?.terminalUsed ?? 0,
    },
  }));
  if (loopMode === 'observe') {
    recordLoopGuardProgress(state.loopGuard, 'observe-only');
    await persistState(pi, state);
    return undefined;
  }
  await persistState(pi, state);
  await ctx.ui?.notify?.('OMP Enhancer Core detected repeated generation; bounded recovery will run when this turn settles.', 'warn');
  // OMP maps extension ctx.abort() to a deliberate user interrupt. That path
  // intentionally skips session_stop, so aborting here would bypass the shared
  // GateController repair/terminal budget and terminate print-mode runs. Keep
  // the pending loop evidence and let the natural settle path perform the one
  // bounded recovery. A successful tool result clears this pending state as
  // real progress before session_stop.
  return undefined;
}

function reconcileSkillUsageFromReadEvidence(state) {
  const requiredSkills = routeRequiredSkills(state.lastRoute);
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
  const requiredSubagents = subagentRequirements(routeRequiredSubagents(state.lastRoute));
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
  // Hidden reasoning is not user-visible output. Models commonly restate a
  // gate instruction while selecting the next tool, so enforcing the output
  // loop guard on thinking_delta can abort the method attempt itself.
  if (assistantEvent.type && assistantEvent.type !== 'text_delta') return '';
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
  const requiredSubagents = subagentRequirements(routeRequiredSubagents(state.lastRoute));
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

function recordTaskResult(state, event = {}, { successful, pending } = {}) {
  return recordTaskProgress(state, event, {
    status: pending ? 'running' : successful ? 'completed' : 'failed',
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
    mutationRevision: current?.mutationRevision ?? state.evidence.mutationRevision ?? 0,
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

function recordSubagentTaskResultEvidence(state, event, { successful, pending }) {
  const { records, dispatchId } = subagentRecordsForToolResult(state, event);
  if (pending) {
    return applySubagentTaskCompletionEvidence(state, event, {
      records,
      dispatchId,
      legacyCompleteWithoutSignal: false,
    });
  }
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
    mutationRevision: current?.mutationRevision ?? state.evidence.mutationRevision ?? 0,
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

function recordCompletedSubagent(state, { agent, text = '', resultText = '', skills = [] }) {
  const pending = state.evidence.pendingSubagents.get(agent);
  if (isReviewEvidenceAgent(agent)
    && (pending?.mutationRevision ?? -1) < (state.evidence.mutationRevision ?? 0)) {
    state.evidence.pendingSubagents.delete(agent);
    return;
  }
  const mergedSkills = new Set(pending?.skills ?? []);
  for (const skill of skills) mergedSkills.add(skill);
  const mergedTexts = new Set(pending?.texts ?? []);
  if (text) mergedTexts.add(text);

  state.evidence.pendingSubagents.delete(agent);
  state.evidence.forkedSubagents.add(agent);
  state.evidence.taskSubagents.add(agent);
  recordSubagentAssignmentEvidence(state, { agent, texts: [...mergedTexts] });
  recordSubagentSkillEvidence(state, { agent, text, skills: [...mergedSkills] });
  recordSubagentResultEvidence(state, { agent, text: resultText });
  recordSubagentLoadedSkillEvidence(state, { agent, texts: resultText ? [resultText] : [] });
}

function isReviewEvidenceAgent(agent = '') {
  return /(?:reviewer|checker|cross-check|security|silent-failure|pr-test)/i.test(String(agent));
}

function recordSubagentResultEvidence(state, { agent, text = '' }) {
  const cleaned = cleanText(text);
  if (!agent || !cleaned) return;
  const recorded = state.evidence.subagentResultTexts.get(agent) ?? new Set();
  recorded.add(cleaned);
  state.evidence.subagentResultTexts.set(agent, recorded);
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
  const requiredByAgent = new Map(subagentRequirements(routeRequiredSubagents(state.lastRoute)).map((item) => [item.agent, item.requiredSkills]));
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
  const requiredByAgent = new Map(subagentRequirements(routeRequiredSubagents(state.lastRoute)).map((item) => [item.agent, item.requiredSkills]));
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
    resultText: cleaned,
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
  const requiredSubagents = subagentRequirements(routeRequiredSubagents(state.lastRoute));
  return {
    route: state.lastRoute?.intent ?? 'none',
    active_route: state.lastRoute?.intent ?? 'none',
    last_probe_route: state.lastRouteProbe?.route?.intent ?? 'none',
    last_probe_changed_active_route: Boolean(state.lastRouteProbe?.changedActiveRoute),
    required_tools: routeRequiredTools(state.lastRoute),
    gate_requirements: state.lastRoute?.routePlan?.gateRequirements ?? [],
    testing_gate_satisfied: state.evidence.testingGate === true,
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
    `Active route: ${status.active_route}`,
    `Last probe route: ${status.last_probe_route}`,
    `Probe changed active route: ${status.last_probe_changed_active_route}`,
    `Required tools: ${status.required_tools.length ? status.required_tools.join(', ') : 'none'}`,
    `Gate requirements: ${status.gate_requirements.length ? status.gate_requirements.map(({ key, mode }) => `${key}:${mode}`).join(', ') : 'none'}`,
    `Testing gate satisfied: ${status.testing_gate_satisfied}`,
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

function recordMutationEvidenceInvalidation(state, toolName = '', event = {}, result = {}) {
  const command = toolActionText(event);
  const action = classifyToolAction({ toolName, text: command });
  const preservationSubagentMutation = isDocumentPreservationPotentialSubagentMutation(toolName, action)
    && result.successful === true
    && isDocumentPreservationRoute(state);
  if ((!action.workspaceWrite && !action.definiteWorkspaceMutation && !preservationSubagentMutation)
    || toolName === 'omp_core_install_skills') return false;

  state.evidence.releaseActionEvidence = null;
  state.evidence.releaseVerificationEvidence = null;
  state.evidence.releaseVerified = false;
  if (isVcsMetadataOnlyMutation(command, toolName)) return true;

  state.evidence.lastDefiniteMutationAt = Math.max(
    Date.now(),
    (state.evidence.lastDefiniteMutationAt ?? 0) + 1,
  );
  state.evidence.mutationRevision = (state.evidence.mutationRevision ?? 0) + 1;

  state.evidence.writingQuality = false;
  state.evidence.writingLogic = false;
  state.evidence.testingGate = false;
  state.evidence.testingReport = false;
  state.evidence.testingEnhancerEvidence = null;
  state.evidence.testCommandEvidence = null;
  state.evidence.factCheckGate = false;
  state.evidence.focusedFactEvidence = null;
  state.evidence.documentPreservationEvidence = null;
  state.evidence.reviewEvidence = false;
  state.evidence.mainAgentSecurityReview = false;
  state.evidence.securityInspectionObserved = false;
  state.evidence.securityInspectionEvidence = null;
  state.lastSubagentUsage = null;
  invalidateReviewSubagentEvidence(state);
  return true;
}

function recordDocumentPreservationEvidence(
  state,
  toolName = '',
  event = {},
  { successful = false } = {},
) {
  if (!isDocumentPreservationRoute(state) || String(toolName).toLowerCase() !== 'read') return false;
  const callId = toolEventCallId(event);
  const pending = callId ? state.pendingDocumentPreservationReads?.get(callId) : null;
  if (callId) state.pendingDocumentPreservationReads?.delete(callId);
  if (!successful || !pending) return false;
  const targetPath = state.lastRoute.taskDescriptor.workspaceWriteTargets[0];
  const routeId = gateControllerRouteId(state);
  if (pending.routeId !== routeId || pending.path !== targetPath) return false;
  const snapshot = documentReadSnapshotPayload(event, pending);
  if (!snapshot) {
    if (!documentReadSnapshotIsTruncated(event, pending)) return false;
    recordProtectedActionDenial(state, protectedConstraintBlock(
      'document-preservation-snapshot-too-large',
      `The complete trusted read of ${targetPath} was truncated or elided, so this route cannot establish a whole-document preservation baseline. Additional line-range reads cannot satisfy this invariant. Do not try another read, edit, shell command, or subagent method; ask the user to split the document/task into one smaller exact file or explicitly narrow the preservation scope.`,
    ), 'read', event);
    return true;
  }
  const documentText = snapshot.text;
  let baseline = state.evidence.documentPreservationBaseline;
  if (!baseline || baseline.routeId !== routeId) {
    // Once any mutation occurred without a baseline, a read of the drifted
    // document must never redefine that content as the original truth.
    if (state.evidence.mutationRevision > 0) return false;
    const created = createDocumentPreservationBaseline({
      oldText: documentText,
      targetPath,
      prompt: state.lastPrompt,
    });
    baseline = created ? {
      ...created,
      routeId,
      observedAt: Date.now(),
    } : null;
    state.evidence.documentPreservationBaseline = baseline;
  }

  if (!baseline) {
    state.evidence.documentPreservationEvidence = null;
    return true;
  }
  const evaluated = evaluateDocumentPreservation({
    baseline: documentPreservationBaselinePayload(baseline),
    newText: documentText,
    targetPath,
  });
  state.evidence.documentPreservationEvidence = evaluated ? {
    ...evaluated,
    routeId,
    mutationRevision: state.evidence.mutationRevision,
    observedAt: Date.now(),
  } : null;
  return true;
}

function documentReadSnapshotPayload(event = {}, pending = {}) {
  const details = [
    event.details,
    event.result?.details,
    event.details?.result,
    event.details?.result?.details,
  ].find((value) => isRecord(value) && isRecord(value.displayContent));
  if (!details) return null;
  if (!trustedDocumentReadResultPath(details, pending)
    || details.suffixResolution !== undefined && details.suffixResolution !== null) return null;
  const display = details.displayContent;
  if (typeof display.text !== 'string' || display.startLine !== 1) return null;
  if (details.truncation !== undefined && details.truncation !== null && details.truncation !== false) return null;
  const summary = isRecord(details.summary) ? details.summary : null;
  if (summary && (hasPositiveElision(summary.elidedSpans) || hasPositiveElision(summary.elidedLines))) return null;
  return { text: display.text };
}

function documentReadSnapshotIsTruncated(event = {}, pending = {}) {
  const details = [
    event.details,
    event.result?.details,
    event.details?.result,
    event.details?.result?.details,
  ].find((value) => isRecord(value) && isRecord(value.displayContent));
  if (!details
    || !trustedDocumentReadResultPath(details, pending)
    || details.suffixResolution !== undefined && details.suffixResolution !== null) return false;
  return details.truncation !== undefined && details.truncation !== null && details.truncation !== false;
}

function trustedDocumentReadResultPath(details = {}, pending = {}) {
  if (typeof pending.resolvedPath !== 'string' || !isAbsolute(pending.resolvedPath)) return '';
  const expected = resolve(pending.resolvedPath);
  let trustedPathCount = 0;

  if (details.resolvedPath !== undefined) {
    if (typeof details.resolvedPath !== 'string'
      || !isAbsolute(details.resolvedPath)
      || resolve(details.resolvedPath) !== expected) return '';
    trustedPathCount += 1;
  }

  const source = isRecord(details.meta) ? details.meta.source : undefined;
  if (source !== undefined) {
    if (!isRecord(source)
      || source.type !== 'path'
      || typeof source.value !== 'string'
      || !isAbsolute(source.value)
      || resolve(source.value) !== expected) return '';
    trustedPathCount += 1;
  }

  return trustedPathCount > 0 ? expected : '';
}

function hasPositiveElision(value) {
  if (Array.isArray(value)) return value.length > 0;
  return Number.isFinite(value) ? Number(value) > 0 : Boolean(value);
}

function isDocumentPreservationRoute(state) {
  const descriptor = state.lastRoute?.taskDescriptor;
  return isDocumentPreservationRequest(state)
    && Array.isArray(descriptor.workspaceWriteTargets)
    && descriptor.workspaceWriteTargets.length === 1;
}

function isDocumentPreservationRequest(state) {
  const descriptor = state.lastRoute?.taskDescriptor;
  return descriptor?.operation === 'modify'
    && descriptor?.domains?.includes('document')
    && descriptor?.constraints?.workspaceWrite === 'required'
    && Array.isArray(descriptor.workspaceWriteTargets)
    && requiresDocumentPreservation(state.lastPrompt);
}

function documentPreservationBaselinePayload(value = {}) {
  return {
    schemaVersion: value.schemaVersion,
    source: value.source,
    targetPathDigest: value.targetPathDigest,
    documentDigest: value.documentDigest,
    exactLiterals: value.exactLiterals,
    controlledTerms: value.controlledTerms,
    coreAnchors: value.coreAnchors,
    counts: value.counts,
    ...(value.scope ? { scope: value.scope } : {}),
  };
}

function invalidateReviewSubagentEvidence(state) {
  const agents = new Set([
    ...state.evidence.taskSubagents,
    ...state.evidence.forkedSubagents,
    ...state.evidence.subagentResultTexts.keys(),
  ].filter((agent) => /(?:reviewer|checker|cross-check|security|silent-failure|pr-test)/i.test(agent)));
  for (const agent of agents) {
    state.evidence.taskSubagents.delete(agent);
    state.evidence.forkedSubagents.delete(agent);
    state.evidence.subagentSkills.delete(agent);
    state.evidence.subagentLoadedSkills.delete(agent);
    state.evidence.subagentAssignments.delete(agent);
    state.evidence.subagentResultTexts.delete(agent);
  }
}

function isVcsMetadataOnlyMutation(command = '', toolName = '') {
  if (!/^(?:bash|shell|terminal|exec|exec_command|run|run_command|command)$/i.test(toolName)) return false;
  const text = String(command).trim();
  // A commit may run repository-controlled pre/post hooks that rewrite source
  // files. Keep only operations without executable hook surfaces on the
  // metadata-only fast path.
  if (hasUnsafeResultMasking(text)) return false;
  if (/^git\s+add\b/i.test(text)) return true;
  return /^git\s+tag\b/i.test(text) && !/(?:^|\s)(?:-d|--delete)(?:\s|$)/i.test(text);
}

function recordObservedTestEvidence(state, toolName = '', event = {}, { successful = false } = {}) {
  if (!TRUSTED_HOST_TEST_EXECUTORS.has(String(toolName).toLowerCase())) return false;
  const command = toolActionText(event);
  const action = classifyToolAction({ toolName, text: command });
  if (!action.testExecution) return false;
  const exactTestRoute = isExactTestExecutionRoute(state.lastRoute);
  const exactCommand = exactTestRoute
    && isAuthorizedExactTestCommand(command, state.lastRoute?.taskDescriptor ?? {});
  const resultText = toolResultText(event);
  if (!successful
    || hasUnsafeResultMasking(command)
    || isDryRunAction(command)
    || isNonExecutingTestProbe(command)
    || !isExplicitPositiveTestOutput(resultText, command)) {
    state.evidence.testCommandEvidence = null;
    if (exactTestRoute) state.evidence.testingGate = false;
    return false;
  }
  state.evidence.testCommandEvidence = {
    schemaVersion: 1,
    source: 'host-tool-result',
    routeId: gateControllerRouteId(state),
    commandDigest: digestEvidence(command),
    resultDigest: digestEvidence(resultText),
    mutationRevision: state.evidence.mutationRevision,
    observedAt: Math.max(
      Date.now(),
      Number.isFinite(state.routeStartedAt) ? state.routeStartedAt : 0,
      Number.isFinite(state.evidence.lastDefiniteMutationAt) ? state.evidence.lastDefiniteMutationAt : 0,
    ),
  };
  if (exactCommand) state.evidence.testingGate = true;
  return true;
}

function isExactTestExecutionRoute(route) {
  const descriptor = route?.taskDescriptor;
  const commandOnlyExclusive = (descriptor?.provenance?.reasons ?? [])
    .includes('exclusive command-only exact test requested');
  return descriptor?.operation === 'execute'
    && descriptor.constraints?.testExecution === 'required'
    && ((Array.isArray(descriptor.testExecutionTargets) && descriptor.testExecutionTargets.length > 0)
      || commandOnlyExclusive && typeof descriptor.testExecutionCommand === 'string' && descriptor.testExecutionCommand.length > 0)
    && (descriptor.phases ?? []).every(({ kind }) => kind === 'verify');
}

function isExplicitPositiveTestOutput(value = '', command = '') {
  const text = String(value).trim();
  const nodeTestSummary = parseNodeTestSummary(text);
  if (nodeTestSummary && (nodeTestSummary.tests === 0
    || nodeTestSummary.pass === 0
    || nodeTestSummary.fail > 0
    || nodeTestSummary.cancelled > 0)) return false;
  const goTestCommand = /^go\s+test\b/i.test(String(command).trim());
  const goExecutedSuite = text.split(/\r?\n/).some((line) => /^ok\s+\S+/.test(line.trim()) && !/\[no test files\]/i.test(line));
  const gradleTestCommand = /^(?:\.\/)?gradle(?:w)?\b[^\n]*\b(?:test|check)\b/i.test(String(command).trim());
  const gradleTestTaskLines = text.split(/\r?\n/).filter((line) => /^>\s*Task\s+:[^\n]*test\b/i.test(line.trim()));
  const gradleExecutedSuite = gradleTestTaskLines.some((line) => !/\b(?:NO-SOURCE|SKIPPED|UP-TO-DATE|FROM-CACHE)\b/i.test(line));
  if (!text) return false;
  const unittestSummary = text.match(/\bran\s+([1-9]\d*)\s+tests?\b[\s\S]{0,160}(?:^|\n)\s*OK(?:\s*\(([^\n)]*)\))?\s*$/i);
  const unittestSkipped = unittestSummary?.[2]?.match(/\bskipped\s*=\s*(\d+)\b/i);
  if (unittestSummary && unittestSkipped
    && Number(unittestSkipped[1]) >= Number(unittestSummary[1])) return false;
  const phpunitIssueSummary = text.match(/\bOK,\s*but there were issues!(?=\s|$)[\s\S]{0,200}\btests?\s*:\s*([1-9]\d*)\s*,\s*assertions?\s*:\s*(\d+)\b/i);
  if (phpunitIssueSummary && Number(phpunitIssueSummary[2]) === 0) return false;
  const withoutZeroFailures = text
    .replace(/\b0\s+(?:tests?\s+)?fail(?:ed|ures?)\b/gi, '')
    .replace(/(?:^|\n)\s*#\s*fail\s+0\b/gi, '');
  if (/(?:^|\n)\s*not ok\b|\btests? failed\b|\b[1-9]\d*\s+(?:tests?\s+)?fail(?:s|ed|ures?)?\b|\b(?:failed|failing|failures?|errors?)\s*:\s*[1-9]\d*\b|(?:^|\n)\s*#\s*fail\s+[1-9]\d*\b|\bBUILD FAILED\b|\bfatal:|\berror:/i.test(withoutZeroFailures)) return false;
  const hasCountedNonzeroSuite = Boolean(nodeTestSummary)
    || /\b[1-9]\d*\s+(?:tests?\s+)?passed\b|\btests?\s+[1-9]\d*\s+passed\b|\b[1-9]\d*\s+passing\b|\b[1-9]\d*\s+pass\b|(?:^|\n)\s*#\s*pass\s+[1-9]\d*\b|\btest result:\s*ok\.[^\n]*\b[1-9]\d*\s+passed\b|\btests?\s+run:\s*[1-9]\d*\s*,\s*failures?\s*:\s*0\s*,\s*errors?\s*:\s*0\b|\bfailed\s*:\s*0\b[^\n]{0,120}\bpassed\s*:\s*[1-9]\d*\b|\bpassed\s*:\s*[1-9]\d*\b[^\n]{0,120}\bfailed\s*:\s*0\b|\btest summary\s*:\s*total\s*:\s*[1-9]\d*\s*,\s*failed\s*:\s*0\s*,\s*succeeded\s*:\s*[1-9]\d*\b|\btest run successful\b[^\n]{0,120}\btotal tests?\s*:\s*[1-9]\d*\b|\bran\s+[1-9]\d*\s+tests?\b[\s\S]{0,160}(?:^|\n)\s*OK(?:\s*\([^\n)]*\))?\s*$|\bOK,\s*but there were issues!\b[\s\S]{0,200}\btests?\s*:\s*[1-9]\d*\b|\b[1-9]\d*\s+tests?\s+completed\b|\b[1-9]\d*\s+examples?\s*,\s*0\s+failures?\b|\b100%\s+tests?\s+passed\b[^\n]{0,100}\b0\s+tests?\s+failed\s+out\s+of\s+[1-9]\d*\b|\bOK\s*\(\s*[1-9]\d*\s+tests?\s*,\s*[1-9]\d*\s+assertions?\s*\)|\bexecuted\s+[1-9]\d*\s+tests?\s*,\s*with\s+0\s+failures?\b|\b[1-9]\d*\s+tests?\s*,\s*0\s+failures?\b|\btests?\s*:\s*[1-9]\d*\b[\s\S]{0,200}\bpassing\s*:\s*[1-9]\d*\b[\s\S]{0,120}\bfailing\s*:\s*0\b/i.test(text);
  const hasPhpunitIssuesNonzeroSuite = Boolean(phpunitIssueSummary && Number(phpunitIssueSummary[2]) > 0);
  const hasWeakPositiveSuite = /(?:^|\n)\s*PASS\s+\S/i.test(text)
    || !goTestCommand && /(?:^|\n)\s*ok\s+\S+/i.test(text);
  const hasRunnerSpecificNonzeroSuite = goTestCommand && goExecutedSuite
    || gradleTestCommand && gradleExecutedSuite && /\bBUILD SUCCESSFUL\b/i.test(text);
  const hasEmptySuite = /\b(?:no tests? (?:found|collected|run)|zero tests?|ran\s+0\s+tests?|collected\s+0\s+(?:items?|tests?)|0\s+tests?\s+(?:passed|run|collected)|tests?\s+0\s+passed|0\s+passed|0\s+passing)\b/i.test(text)
    || /\[(?:no test files|no tests? to run)\]/i.test(text)
    || /(?:^|\n)\s*#\s*(?:pass|tests?)\s+0\b/i.test(text)
    || gradleTestCommand && gradleTestTaskLines.length > 0 && !gradleExecutedSuite;
  if (hasEmptySuite && !hasCountedNonzeroSuite && !hasRunnerSpecificNonzeroSuite && !hasPhpunitIssuesNonzeroSuite) return false;
  return hasCountedNonzeroSuite || hasWeakPositiveSuite || hasRunnerSpecificNonzeroSuite || hasPhpunitIssuesNonzeroSuite;
}

function parseNodeTestSummary(value = '') {
  const text = String(value);
  const field = (name) => {
    const match = text.match(new RegExp(`(?:^|\\n)\\s*(?:ℹ\\s*)?${name}\\s+(\\d+)\\b`, 'i'));
    return match ? Number(match[1]) : null;
  };
  const tests = field('tests');
  const pass = field('pass');
  const fail = field('fail');
  if (![tests, pass, fail].every(Number.isInteger)) return null;
  return {
    tests,
    pass,
    fail,
    cancelled: field('cancelled') ?? 0,
    skipped: field('skipped') ?? 0,
  };
}

function isNonExecutingTestProbe(command = '') {
  return /(?:^|\s)(?:--help|-h|--listtests|--list-tests|--collect-only|--passwithnotests|-list(?:=\S+)?)(?:\s|$)/i.test(String(command));
}

function recordFocusedLocalFactEvidence(state, toolName = '', event = {}, { successful = false } = {}) {
  if (!successful || !isFocusedLocalFactInspectionRoute(state.lastRoute)) return false;
  if (isExclusiveFocusedFactRead(state, toolName)) {
    return recordExclusiveFocusedFactReadEvidence(state, event);
  }
  if (classifyFocusedFactSearchAction(toolName, toolActionText(event)) !== 'trusted-grep') return false;
  const input = firstToolInputRecord(event);
  const pattern = String(input.pattern ?? input.query ?? input.search ?? '').trim();
  const scope = String(input.path ?? input.cwd ?? '.').trim().replace(/\\/g, '/');
  const repositoryWide = new Set(['', '.', './', '*', './*', '**/*', './**/*']).has(scope);
  const claimPaths = extractFocusedFactClaimPaths(state.lastPrompt);
  const claimLexicalText = focusedFactClaimLexicalText(state.lastPrompt, claimPaths);
  const claimTokens = new Set(focusedFactLexicalTokens(claimLexicalText));
  const claimTerms = focusedFactLexicalTokens(pattern).filter((term) => claimTokens.has(term));
  const resultText = toolResultText(event).trim();
  if (!pattern || !repositoryWide || !claimTerms.length || !resultText) return false;

  const observation = classifyFocusedFactGrepResult(event, resultText, claimPaths, claimTerms);
  const routeId = gateControllerRouteId(state);
  const previous = state.evidence.focusedFactEvidence?.routeId === routeId
    ? state.evidence.focusedFactEvidence
    : null;
  const inputDigest = digestEvidence(JSON.stringify({ pattern, scope }));
  const resultDigest = digestEvidence(JSON.stringify({
    resultText,
    observedPaths: observation.observedPaths,
    matchCount: observation.matchCount,
  }));
  const evidence = {
    schemaVersion: 1,
    source: 'host-focused-fact-inspection',
    routeId,
    toolName: 'grep',
    inputDigest,
    resultDigest,
    queryTermDigests: claimTerms.map(digestEvidence),
    claimPathDigests: claimPaths.map(digestEvidence),
    claimSourceBound: claimPaths.length > 0,
    matchedPathDigests: uniqueValues([
      ...(previous?.matchedPathDigests ?? []),
      ...observation.matchedPaths.map(digestEvidence),
    ]),
    matchKind: observation.matchKind,
    independentMatchObserved: previous?.independentMatchObserved === true
      || observation.matchKind === 'independent-hit',
    observedAt: Date.now(),
  };
  const changed = state.evidence.factCheckGate === true
    || !previous
    || previous.inputDigest !== evidence.inputDigest
    || previous.resultDigest !== evidence.resultDigest
    || previous.matchKind !== evidence.matchKind
    || previous.independentMatchObserved !== evidence.independentMatchObserved;
  state.evidence.focusedFactEvidence = evidence;
  state.evidence.factCheckGate = false;
  return changed;
}

function isExclusiveFocusedFactRead(state, toolName = '') {
  return String(toolName).toLowerCase() === 'read'
    && state.lastRoute?.taskDescriptor?.exclusiveToolContract?.allowedTools?.[0] === 'read';
}

function recordExclusiveFocusedFactReadEvidence(state, event = {}) {
  const resultText = toolResultText(event).trim();
  if (!resultText) return false;
  const input = firstToolInputRecord(event);
  const path = normalizeFocusedFactPath(input.path ?? input.file ?? input.filename ?? event.path ?? '');
  const claimPaths = extractFocusedFactClaimPaths(state.lastPrompt);
  const routeId = gateControllerRouteId(state);
  const claimSourceBound = claimPaths.length > 0;
  state.evidence.focusedFactEvidence = {
    schemaVersion: 1,
    source: 'host-focused-fact-inspection',
    routeId,
    toolName: 'read',
    inputDigest: digestEvidence(path),
    resultDigest: digestEvidence(resultText),
    queryTermDigests: [],
    claimPathDigests: claimPaths.map(digestEvidence),
    claimSourceBound,
    matchedPathDigests: path ? [digestEvidence(path)] : [],
    matchKind: path && claimPaths.some((claimPath) => focusedFactPathsMatch(path, claimPath))
      ? 'claim-only'
      : 'unparseable-hit',
    independentMatchObserved: false,
    observedAt: Date.now(),
  };
  state.evidence.factCheckGate = false;
  return true;
}

function recordFocusedFactSearchResult(
  state,
  toolName = '',
  event = {},
  { successful = false, pending = false, evidenceRecorded = false } = {},
) {
  if (pending || !isFocusedLocalFactInspectionRoute(state.lastRoute)) return false;
  const focusedGrep = classifyFocusedFactSearchAction(toolName, toolActionText(event)) === 'trusted-grep';
  const focusedRead = isExclusiveFocusedFactRead(state, toolName);
  if (!focusedGrep && !focusedRead) return false;
  const routeId = gateControllerRouteId(state);
  const next = {
    schemaVersion: 1,
    routeId,
    status: successful && evidenceRecorded ? 'succeeded' : 'failed',
    failureCode: successful && evidenceRecorded
      ? null
      : successful ? 'empty-or-unusable-result' : 'tool-failed',
    observedAt: Date.now(),
  };
  const previous = state.focusedFactSearch?.routeId === routeId
    ? state.focusedFactSearch
    : null;
  const changed = !previous
    || previous.status !== next.status
    || previous.failureCode !== next.failureCode;
  state.focusedFactSearch = next;
  if (next.status === 'failed') state.evidence.factCheckGate = false;
  return changed;
}

function isFocusedLocalFactInspectionRoute(route) {
  const descriptor = route?.taskDescriptor;
  return descriptor?.operation === 'inspect'
    && descriptor.domains?.includes('facts')
    && descriptor.complexity === 'focused'
    && descriptor.constraints?.workspaceWrite === 'forbidden'
    && descriptor.constraints?.networkAccess === 'forbidden'
    && descriptor.constraints?.externalWrite === 'forbidden'
    && descriptor.constraints?.subagents === 'forbidden';
}

function classifyFocusedFactSearchAction(toolName = '', actionText = '') {
  const rawName = String(toolName).trim().toLowerCase();
  if (rawName === 'grep') return 'trusted-grep';
  const canonicalName = rawName
    .replace(/[./:\\]+/g, '_')
    .replace(/_+/g, '_');
  if (/(?:^|_)(?:grep|rg|ripgrep|search|glob|find|fd|ag|ack)(?:_|$)/u.test(canonicalName)) {
    return 'alternate';
  }
  if (TRUSTED_HOST_TEST_EXECUTORS.has(rawName)
    && /\b(?:git\s+grep|grep|rg|ripgrep|ag|ack|find|fd)\b/iu.test(String(actionText))) {
    return 'alternate';
  }
  return 'none';
}

function focusedFactLexicalText(value = '') {
  let text = String(value).normalize('NFKC').toLowerCase()
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/(?:^|[\s"'`(])(?:\.\.?\/)?(?:[a-z0-9_.@-]+\/)*[a-z0-9_.@-]+\.[a-z0-9]{1,12}(?=$|[\s"'`),:.;!?，。；：！？])/gi, ' ');
  const metaTerms = [
    'independent evidence', 'repository evidence', 'claim verification', 'factual verification',
    'contradicted', 'contradiction', 'verification', 'repository', 'supported', 'supporting',
    'documents', 'document', 'evidence', 'sources', 'source', 'claims', 'claim', 'facts', 'fact',
    'verify', 'support', 'contradict', 'conclusion', 'offline', 'local', 'subagent', 'network',
    'target', 'this', 'says', 'states', 'contains', 'content',
    'tests', 'test', 'edits', 'edit', 'commit', 'publish', 'files', 'file', 'true', 'false',
    '独立证据', '仓库证据', '事实性核查', '事实核查', '事实审查', '得到支持', '证据支持',
    '陈述', '声明', '事实', '证据', '支持', '反驳', '矛盾', '核查', '核验', '查证', '仓库',
    '来源', '文档', '文件', '目标', '对象', '内容', '结论', '真实', '属实', '离线', '本地', '联网', '网络', '测试', '修改',
    '禁止', '提交', '发布', '是否', '能否', '若', '如果', '明确报告',
  ].sort((left, right) => right.length - left.length);
  for (const term of metaTerms) {
    text = text.replace(new RegExp(escapeRegularExpression(term), 'giu'), ' ');
  }
  return text.replace(/\s+/g, ' ').trim();
}

function focusedFactClaimLexicalText(value = '', claimPaths = []) {
  if (!claimPaths.length) {
    const explicitQuotedClaim = String(value).normalize('NFKC').match(
      /\bclaim\s+(?:that\s+)?["“']([^"”'\n]{1,240})["”']/iu,
    );
    const lexicalClaim = focusedFactLexicalText(explicitQuotedClaim?.[1] ?? '');
    if (lexicalClaim) return lexicalClaim;
  }
  const placeholders = [];
  const masked = focusedFactPromptWithImplicitPaths(value).replace(
    /(?:^|[\s"'`(])((?:\.\.?\/)?(?:[a-z0-9_.@-]+\/)*[a-z0-9_.@-]+\.[a-z0-9]{1,12})(?=$|[\s"'`),:.;!?，。；：！？])/gi,
    (_match, path) => {
      const normalized = normalizeFocusedFactPath(path);
      const index = placeholders.push(normalized) - 1;
      return ` FOCUSED_FACT_PATH_${index} `;
    },
  );
  const wantedPaths = new Set(claimPaths.map(normalizeFocusedFactPath));
  const clauses = masked.split(/[。！？!?\n\r;,；，]+/u).map((clause) => clause.trim()).filter(Boolean);
  const selected = new Set();
  for (let index = 0; index < clauses.length; index += 1) {
    const clausePaths = [...clauses[index].matchAll(/FOCUSED_FACT_PATH_(\d+)/g)]
      .map((match) => placeholders[Number(match[1])])
      .filter(Boolean);
    if (!clausePaths.some((path) => wantedPaths.has(path))) continue;
    selected.add(index);
    const withoutPaths = stripFocusedFactConstraintSpans(clauses[index].replace(/FOCUSED_FACT_PATH_\d+/g, ' '));
    if (focusedFactClaimClauseTokens(withoutPaths).length > 0) continue;
    for (const adjacent of [index - 1, index + 1]) {
      if (adjacent < 0 || adjacent >= clauses.length || focusedFactInstructionClause(clauses[adjacent])) continue;
      selected.add(adjacent);
    }
  }
  return [...selected]
    .sort((left, right) => left - right)
    .map((index) => stripFocusedFactConstraintSpans(clauses[index].replace(/FOCUSED_FACT_PATH_\d+/g, ' ')))
    .map(focusedFactLexicalText)
    .filter(Boolean)
    .join(' ');
}

function stripFocusedFactConstraintSpans(value = '') {
  return String(value)
    .replace(/\b(?:do\s+not|don't|must\s+not|without)\s+(?:use\s+)?(?:the\s+)?(?:network|internet|edit|modify|write|run|execute|start|launch|commit|publish)(?:\s+(?:any\s+)?(?:files?|tests?|subagents?|sub-agents?|changes?))?(?:\s+(?:while|during))?/giu, ' ')
    .replace(/(?:禁止|不得|不要|不可|不允许|无需)(?:联网|使用网络|修改(?:任何)?文件|编辑(?:任何)?文件|写入(?:任何)?文件|运行测试|执行测试|启动(?:任何)?(?:subagent|子代理)|提交|发布)(?:并|且|同时)?/gu, ' ');
}

function focusedFactInstructionClause(value = '') {
  const text = String(value).normalize('NFKC').toLowerCase();
  return /(?:禁止|不得|不要|不可|不允许|无需)[^。！？!?]{0,80}(?:联网|网络|修改|编辑|写入|测试|运行|执行|启动|subagent|子代理|提交|发布)/u.test(text)
    || /\b(?:do\s+not|don't|must\s+not|without|forbid(?:den)?)\b[^.!?]{0,120}\b(?:network|internet|edit|write|test|run|execute|start|subagent|commit|publish)\b/iu.test(text)
    || /(?:若|如果)[^。！？!?]{0,40}(?:证据不足|无独立证据)[^。！？!?]{0,40}(?:报告|说明|指出)/u.test(text)
    || /\bif\b[^.!?]{0,80}\b(?:insufficient evidence|no independent evidence)\b[^.!?]{0,80}\b(?:report|say|state)\b/iu.test(text);
}

function focusedFactLexicalTokens(value = '') {
  const lexical = focusedFactLexicalText(value);
  return uniqueValues((lexical.match(/[a-z0-9][a-z0-9_@.-]*|[\u3400-\u9fff]+/giu) ?? [])
    .map((term) => term.replace(/[.@_-]+$/u, ''))
    .filter(Boolean));
}

function focusedFactClaimClauseTokens(value = '') {
  const taskLabels = new Set([
    'check', 'checking', 'fact-check', 'fact-checking', 'target', 'this', 'file', 'document', 'claim',
    '核查', '核验', '查证', '事实核查', '目标', '文件', '文档', '声明',
  ]);
  return focusedFactLexicalTokens(value).filter((term) => !taskLabels.has(term));
}

function extractFocusedFactClaimPaths(value = '') {
  return uniqueValues([...focusedFactPromptWithImplicitPaths(value).matchAll(/(?:^|[\s"'`(])((?:\.\.?\/)?(?:[a-z0-9_.@-]+\/)*[a-z0-9_.@-]+\.[a-z0-9]{1,12})(?=$|[\s"'`),:.;!?，。；：！？])/gi)]
    .map((match) => normalizeFocusedFactPath(match[1]))
    .filter(Boolean));
}

function focusedFactPromptWithImplicitPaths(value = '') {
  return String(value).replace(/\bREADME\b(?!\s*\.(?:md|mdx|rst|txt))/giu, 'README.md');
}

function normalizeFocusedFactPath(value = '') {
  const normalized = posix.normalize(String(value).trim().replace(/\\/g, '/').replace(/^\.\//, ''));
  return normalized === '.' ? '' : normalized.replace(/^\/+/, '');
}

function classifyFocusedFactGrepResult(event = {}, resultText = '', claimPaths = [], claimTerms = []) {
  const text = stripFocusedFactTerminalControls(resultText).trim();
  const details = isRecord(event.details) ? event.details : {};
  const observedPaths = focusedFactObservedResultPaths(details);
  const matchCount = Number.isFinite(details.matchCount) ? Number(details.matchCount) : null;
  const noMatch = /^(?:no matches?(?: found)?|0 matches?(?: found)?|未找到(?:任何)?匹配|无匹配(?:结果)?)\.?$/iu.test(text)
    || matchCount === 0 && observedPaths.length === 0;
  if (noMatch) return { matchKind: 'no-match', matchedPaths: [], observedPaths, matchCount };

  const lines = text.split(/\r?\n/);
  const parsedMatches = [];
  for (const line of lines) {
    const match = line.match(/^\s*(?:[-*]\s*)?((?:\/|\.\.?\/)?(?:[^:\r\n]+\/)*[^:\r\n/]+\.[a-z0-9]{1,12}):(?:(?:\d+):)?(.*)$/i);
    if (!match || !focusedFactLineContainsClaimTerm(match[2], claimTerms)) continue;
    parsedMatches.push(normalizeFocusedFactPath(match[1]));
  }

  let groupedDirectory = '';
  let groupedPath = '';
  for (const line of lines) {
    const directory = line.match(/^\s*#(?!#)\s+(.+?\/)\s*$/u);
    if (directory) {
      groupedDirectory = normalizeFocusedFactPath(directory[1]);
      groupedPath = '';
      continue;
    }
    const file = line.match(/^\s*##\s+(.+?)(?:#[0-9a-f]+)?\s*$/iu);
    if (file) {
      groupedPath = normalizeFocusedFactPath(posix.join(groupedDirectory, file[1]));
      continue;
    }
    const resultLine = line.match(/^\s*\*?\s*\d+\s*[:│]\s?(.*)$/u);
    if (groupedPath && resultLine && focusedFactLineContainsClaimTerm(resultLine[1], claimTerms)) {
      parsedMatches.push(groupedPath);
    }
  }

  const matchedPaths = uniqueValues(parsedMatches)
    .filter(Boolean)
    .filter((path) => !focusedFactExcludedEvidencePath(path))
    .filter((path) => observedPaths.length === 0
      || observedPaths.some((observedPath) => focusedFactObservedPathsMatch(path, observedPath)));
  if (!matchedPaths.length) {
    return { matchKind: 'unparseable-hit', matchedPaths: [], observedPaths, matchCount };
  }
  const independent = matchedPaths.some((matchedPath) => !claimPaths.some((claimPath) => focusedFactPathsMatch(matchedPath, claimPath)));
  return {
    matchKind: independent ? 'independent-hit' : 'claim-only',
    matchedPaths,
    observedPaths,
    matchCount,
  };
}

function stripFocusedFactTerminalControls(value = '') {
  return String(value)
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

function focusedFactObservedResultPaths(details = {}) {
  const filePaths = Array.isArray(details.files) ? details.files : [];
  const fileMatches = Array.isArray(details.fileMatches) ? details.fileMatches : [];
  return uniqueValues([...filePaths, ...fileMatches].flatMap((entry) => {
    if (typeof entry === 'string') return [normalizeFocusedFactPath(entry)];
    if (!isRecord(entry)) return [];
    const path = entry.path ?? entry.file ?? entry.filePath;
    return typeof path === 'string' ? [normalizeFocusedFactPath(path)] : [];
  }).filter(Boolean));
}

function focusedFactObservedPathsMatch(parsedPath = '', observedPath = '') {
  const parsed = normalizeFocusedFactPath(parsedPath);
  const observed = normalizeFocusedFactPath(observedPath);
  return parsed === observed || parsed.endsWith(`/${observed}`) || observed.endsWith(`/${parsed}`);
}

function focusedFactLineContainsClaimTerm(value = '', claimTerms = []) {
  const text = focusedFactLexicalText(stripFocusedFactTerminalControls(value));
  const tokens = new Set(focusedFactLexicalTokens(text));
  return claimTerms.some((term) => /^[\u3400-\u9fff]+$/u.test(term)
    ? text.includes(term)
    : tokens.has(term));
}

function focusedFactExcludedEvidencePath(value = '') {
  const path = normalizeFocusedFactPath(value);
  return /(?:^|\/)(?:\.git|\.omp|node_modules)(?:\/|$)/u.test(path);
}

function focusedFactPathsMatch(observedPath = '', claimPath = '') {
  const observed = normalizeFocusedFactPath(observedPath);
  const claim = normalizeFocusedFactPath(claimPath);
  if (!observed || !claim) return false;
  if (observed === claim || observed.endsWith(`/${claim}`)) return true;
  return !observed.includes('/') && observed === claim.split('/').at(-1);
}

function focusedFactConclusionMatchesEvidence(state, output = '') {
  const evidence = readFocusedFactEvidenceRecord(state.evidence.focusedFactEvidence);
  const routeId = gateControllerRouteId(state);
  const search = readFocusedFactSearchState(state.focusedFactSearch, routeId);
  const failedSearch = search?.status === 'failed';
  if ((!evidence || evidence.routeId !== routeId) && !failedSearch) return false;
  const verdict = extractFocusedFactVerdict(output);
  if (!verdict) return false;
  const prose = String(output).replace(/(?:^|\n)\s*FACT_VERDICT\s*:\s*(?:INSUFFICIENT|SUPPORTED|CONTRADICTED)\s*(?=\n|$)/giu, '\n');
  if (!prose.trim()) {
    if (verdict === 'insufficient') {
      return failedSearch || ['no-match', 'claim-only', 'unparseable-hit'].includes(evidence?.matchKind);
    }
    return evidence?.independentMatchObserved === true
      && (verdict === 'supported' || verdict === 'contradicted');
  }
  const conclusion = classifyFocusedFactConclusion(prose);
  if (conclusion.kind !== verdict) return false;
  if (verdict === 'insufficient') {
    const claimPaths = extractFocusedFactClaimPaths(state.lastPrompt);
    const claimText = focusedFactRestatementClaimText(state.lastPrompt, claimPaths);
    return !hasAffirmativeFocusedFactRestatement(prose, claimText);
  }
  return evidence?.independentMatchObserved === true
    && (verdict === 'supported' || verdict === 'contradicted');
}

function hasAffirmativeFocusedFactRestatement(value = '', claimText = '') {
  const claimTokens = focusedFactLexicalTokens(claimText);
  if (!claimTokens.length) return false;
  return String(value).split(/[.!?。！？\n;,，；]+|\b(?:but|however|nevertheless)\b|(?:但|不过|然而)/iu).some((clause) => {
    if (/\b(?:no|zero|insufficient|unverified|unproven|unsupported|unconfirmed|unresolved|inconclusive|cannot|unable|not)\b|(?:证据不足|未验证|未证实|未确认|不受支持|无法|不能|不足以|没有|未找到)/iu.test(clause)) return false;
    if (!/\b(?:is|are|was|were|equals?|remains?|holds?)\b|(?:为|是|等于|成立|属实|正确|准确)/iu.test(clause)) return false;
    const normalized = focusedFactLexicalText(clause);
    const tokens = new Set(focusedFactLexicalTokens(normalized));
    const exactRestatement = claimTokens.every((token) => /^[\u3400-\u9fff]+$/u.test(token)
      ? normalized.includes(token)
      : tokens.has(token));
    const numericClaimTokens = claimTokens.filter((token) => /\d/u.test(token));
    return exactRestatement || numericClaimTokens.length > 0
      && numericClaimTokens.every((token) => tokens.has(token));
  });
}

function focusedFactRestatementClaimText(value = '', claimPaths = []) {
  const source = focusedFactPromptWithImplicitPaths(value).normalize('NFKC');
  const afterPath = source.match(/(?:^|[\s"'`(])(?:\.\.?\/)?(?:[a-z0-9_.@-]+\/)*[a-z0-9_.@-]+\.[a-z0-9]{1,12}\s*(?:中|里|内)\s*([^。！？!?\n]{1,240}?)(?=\s*(?:是否|能否).{0,32}(?:证据|支持|支撑))/iu);
  if (afterPath?.[1]) {
    const lexical = focusedFactLexicalText(afterPath[1]);
    if (lexical) return lexical;
  }
  const explicitClaim = source.match(/\bclaim\s+(?:that\s+)?([^.!?\n]{1,160}?)(?=\s*(?:is\s+supported|has\s+support|$|[.;!?]))/iu);
  if (explicitClaim?.[1]) {
    const lexical = focusedFactLexicalText(explicitClaim[1]);
    if (lexical) return lexical;
  }
  return focusedFactClaimLexicalText(source, claimPaths);
}

function extractFocusedFactVerdict(value = '') {
  const text = String(value).trimEnd();
  const controlLines = [...text.matchAll(/(?:^|\n)\s*FACT_VERDICT\s*:[^\n]*(?=\n|$)/giu)];
  if (controlLines.length !== 1) return null;
  const match = controlLines[0];
  const valid = match[0].trim().match(/^FACT_VERDICT\s*:\s*(INSUFFICIENT|SUPPORTED|CONTRADICTED)$/iu);
  if (!valid) return null;
  if ((match.index ?? -1) + match[0].length !== text.length) return null;
  const prefix = text.slice(0, match.index ?? 0);
  const openFences = [...prefix.matchAll(/^\s*(?:```|~~~)/gmu)].length;
  if (openFences % 2 !== 0) return null;
  return valid[1].toLowerCase();
}

function classifyFocusedFactConclusion(value = '') {
  const text = String(value).normalize('NFKC').toLowerCase();
  if (/\b(?:not|does\s+not\s+have)\s+(?:unsupported|insufficient(?:\s+(?:repository\s+)?evidence)?|false|incorrect|inaccurate|wrong)\b/iu.test(text)
    || /(?:并非|不是|非)\s*(?:证据不足|没有独立证据|无独立证据|未找到独立证据|不属实|不正确|不准确|错误)/u.test(text)) {
    return { kind: 'mixed' };
  }
  let residual = text;
  const insufficientPatterns = [
    /\bnot\s+(?:independently\s+)?supported\b/giu,
    /\b(?:did|does|do)\s+not\s+establish\s+(?:independent\s+)?(?:repository\s+)?support\b/giu,
    /\b(?:the|this)\s+(?:claim|statement|assertion)\s+(?:is|was|remains)\s+(?:currently\s+)?(?:unverified|unproven|unsupported|unresolved|inconclusive|not\s+(?:proven|verified|confirmed)|under\s+review)\b/giu,
    /\bno\s+(?:repository[- ]local|local|repository)\s+evidence\s+(?:was\s+)?found\b/giu,
    /\b(?:grep|search)[^.!?\n]{0,120}\b(?:returned|found)\s+(?:zero|no|0)\s+matches?\b/giu,
    /\b(?:no|zero)\b[^.!?\n]{0,120}\b(?:can|could|is\s+able\s+to)\s+(?:independently\s+)?(?:support|confirm|verify|contradict|corroborate)\b/giu,
    /\b(?:unsupported|insufficient\s+(?:repository\s+)?evidence|(?:repository\s+)?evidence\s+(?:(?:is|was|remains)\s+)?insufficient|not\s+enough\s+evidence|no\s+independent\s+(?:repository\s+)?evidence|cannot\s+(?:confirm|support|verify|contradict)|unable\s+to\s+(?:confirm|support|verify|contradict))\b/giu,
    /(?:没有|无|未找到|不存在)[^。！？\n]{0,120}(?:能|能够|可以|足以)(?:独立)?(?:支持|证实|确认|验证|反驳)/gu,
    /(?:证据不足|没有|未找到|无)独立证据/gu,
    /(?:证据不足|不足以支持|无法支持|不能支持|未得到支持|无法证实|不能确认|无法确认|无法反驳|不能反驳)/gu,
  ];
  const insufficient = insufficientPatterns.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(residual);
  });
  if (insufficient && hasConflictingFocusedFactAssertion(text, insufficientPatterns)) return { kind: 'mixed' };
  for (const pattern of insufficientPatterns) residual = residual.replace(pattern, ' ');
  const { supported, contradicted } = classifyExplicitFocusedFactVerdict(residual);
  if (insufficient && !supported && !contradicted) return { kind: 'insufficient' };
  if (!insufficient && supported && !contradicted) return { kind: 'supported' };
  if (!insufficient && contradicted && !supported) return { kind: 'contradicted' };
  return { kind: supported || contradicted || insufficient ? 'mixed' : 'unknown' };
}

function hasConflictingFocusedFactAssertion(value = '', insufficientPatterns = []) {
  const clauses = String(value).split(/[.!?。！？\n;；]+/u).map((clause) => clause.trim()).filter(Boolean);
  return clauses.some((clause) => {
    const containsInsufficient = insufficientPatterns.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(clause);
    });
    if (containsInsufficient) return false;
    const englishClaimAssertion = /\b(?:(?:the|this)\s+)?(?:claim|statement|assertion|proposition)\b[^.!?\n]{0,48}(?:(?:is|was|remains|appears\s+to\s+be)\s+(?:proven|proved|verified|established|supported|confirmed|corroborated|substantiated|validated|true|accurate|correct|valid|false|incorrect|inaccurate|wrong|refuted|disproved|disproven|invalid)|holds?\b)/iu.test(clause);
    const englishFirstPersonAssertion = /\bi\s+(?:still\s+)?(?:accept|consider|regard|believe|treat)\s+(?:it|the\s+(?:claim|statement|assertion|proposition))\s+(?:as\s+)?(?:a\s+)?(?:fact|true|proven|proved|verified|established|supported|false|wrong|invalid)\b/iu.test(clause);
    const englishPronounAssertion = /\b(?:(?:it|this|that)\s+(?:is|remains)\s+(?:true|false|correct|incorrect|accurate|inaccurate|proven|proved|established|supported|confirmed|refuted|wrong|invalid)|(?:but|still|nevertheless|however)\s+(?:(?:it|this|that)\s+(?:is|remains)\s+)?(?:true|false|correct|incorrect|accurate|inaccurate|proven|proved|established|supported|confirmed|refuted|wrong|invalid))\b/iu.test(clause);
    const chineseClaimAssertion = /(?:该|此|这个)?(?:陈述|声明|断言|结论|说法|命题)[^。！？\n]{0,48}(?:为真|为假|是真的|是假的|成立|不成立|属实|不属实|正确|不正确|准确|不准确|真实|不真实|可信|不可信|可靠|不可靠|错误|得到支持|被反驳|证实|确认|证明)/u.test(clause);
    const chineseFirstPersonAssertion = /我[^。！？\n]{0,16}(?:仍然|还是)?(?:认为|认定|接受|相信)[^。！？\n]{0,16}(?:它|其|该(?:陈述|声明|断言|结论)|这个(?:陈述|声明|断言|结论))[^。！？\n]{0,16}(?:为真|是真的|成立|属实|正确|错误|为假|不成立)/u.test(clause);
    const chinesePronounAssertion = /(?:(?:这|它|这个)\s*(?:是真的|是假的|为真|为假|成立|不成立|属实|不属实|正确|不正确|错误)|(?:但|不过|仍然|还是)\s*(?:(?:这|它|这个)\s*)?(?:是真的|是假的|为真|为假|成立|不成立|属实|不属实|正确|不正确|错误))/u.test(clause);
    return englishClaimAssertion || englishFirstPersonAssertion
      || englishPronounAssertion || chineseClaimAssertion || chineseFirstPersonAssertion
      || chinesePronounAssertion;
  });
}

function classifyExplicitFocusedFactVerdict(value = '') {
  const text = String(value);
  const claim = String.raw`(?:(?:the|this|README)\s+)?(?:claim|statement|assertion)`;
  const evidence = String.raw`(?:independent\s+)?(?:(?:repository(?:[- ]local)?|local\s+repository)\s+)?evidence`;
  const supportedPatterns = [
    new RegExp(String.raw`\b${claim}\s+(?:is|was|remains|appears\s+to\s+be)\s+(?:independently\s+)?(?:supported|confirmed|corroborated|substantiated|validated|proven|proved|verified|established|true|accurate|correct|valid)\b`, 'iu'),
    new RegExp(String.raw`\b${evidence}\s+(?:supports?|confirms?|corroborates?|substantiates?|validates?)\s+${claim}\b`, 'iu'),
    new RegExp(String.raw`\b${evidence}\b[^.!?\n]{0,64}\b(?:supports?|confirms?|corroborates?|substantiates?|validates?)\b[^.!?\n]{0,64}\b${claim}\b`, 'iu'),
    new RegExp(String.raw`\b${evidence}\s+(?:shows?|demonstrates?|indicates?)\s+that\s+${claim}\s+(?:is|was)\s+(?:true|accurate|correct|valid)\b`, 'iu'),
    /\b(?:the|this)\s+(?:claim|statement|assertion)\b[^.!?\n]{0,160}\bappears?\s+verbatim\b/iu,
    /(?:该|此|这个)?(?:陈述|声明|断言|结论)[^。！？\n]{0,24}(?:(?:得到|获得|受到)[^。！？\n]{0,12}支持|(?<!不)(?:为真|成立|属实|正确|准确|真实|可信|可靠))/u,
    /(?:独立的?)?(?:仓库内?)?证据[^。！？\n]{0,12}(?:支持|证实|确认)(?:了)?(?:该|此|这个)?(?:陈述|声明|断言|结论)/u,
    /(?:独立的?)?(?:仓库内?)?证据[^。！？\n]{0,12}(?:表明|显示|证明)(?:了)?(?:该|此|这个)?(?:陈述|声明|断言|结论)[^。！？\n]{0,8}(?<!不)(?:属实|正确|准确|真实)/u,
    /(?:^|\n)\s*(?:verdict|conclusion|status)\s*:\s*(?:supported|confirmed|corroborated|substantiated|validated|true|accurate|correct|valid)\b/iu,
    /(?:^|\n)\s*(?:判定|结论|状态)\s*[：:]\s*(?:得到支持|支持|属实|正确|准确|真实)(?:\s|$)/u,
  ];
  const contradictedPatterns = [
    new RegExp(String.raw`\b${claim}\s+(?:is|was|remains|appears\s+to\s+be)\s+(?:contradicted|refuted|disproved|disproven|not\s+true|false|incorrect|inaccurate|wrong|invalid)\b`, 'iu'),
    new RegExp(String.raw`\b${evidence}\s+(?:contradicts?|refutes?|disproves?)\s+${claim}\b`, 'iu'),
    new RegExp(String.raw`\b${evidence}\s+(?:shows?|demonstrates?|indicates?)\s+that\s+${claim}\s+(?:is|was)\s+(?:not\s+true|false|incorrect|inaccurate|wrong)\b`, 'iu'),
    /(?:该|此|这个)?(?:陈述|声明|断言|结论)[^。！？\n]{0,24}(?:被反驳|为假|不成立|不属实|不正确|不准确|不真实|不可信|不可靠|错误)/u,
    /(?:独立的?)?(?:仓库内?)?证据[^。！？\n]{0,12}(?:反驳)(?:了)?(?:该|此|这个)?(?:陈述|声明|断言|结论)/u,
    /(?:独立的?)?(?:仓库内?)?证据[^。！？\n]{0,12}(?:与)?(?:该|此|这个)?(?:陈述|声明|断言|结论)[^。！？\n]{0,8}(?:矛盾)/u,
    /(?:独立的?)?(?:仓库内?)?证据[^。！？\n]{0,12}(?:表明|显示|证明)(?:了)?(?:该|此|这个)?(?:陈述|声明|断言|结论)[^。！？\n]{0,8}(?:错误|不属实|不正确|不准确|不真实)/u,
    /(?:^|\n)\s*(?:verdict|conclusion|status)\s*:\s*(?:contradicted|refuted|disproved|false|incorrect|inaccurate|wrong)\b/iu,
    /(?:^|\n)\s*(?:判定|结论|状态)\s*[：:]\s*(?:被反驳|不属实|不正确|不准确|不真实|错误)(?:\s|$)/u,
  ];
  return {
    supported: supportedPatterns.some((pattern) => pattern.test(text)),
    contradicted: contradictedPatterns.some((pattern) => pattern.test(text)),
  };
}

function recordSecurityInspectionEvidence(state, toolName = '', event = {}, { successful = false } = {}) {
  if (!successful || !routeRequiresSecurityEvidence(state.lastRoute)) return false;
  if (toolName === 'read' && extractReadSkillNames(event).length > 0) return false;
  const command = toolActionText(event);
  const resultText = toolResultText(event);
  const shellTool = /^(?:bash|shell|terminal|exec|exec_command|run|run_command|command)$/i.test(toolName);
  if (shellTool && hasUnsafeResultMasking(command)) return false;
  const scanner = /^(?:semgrep|trivy|snyk|codeql)$/i.test(toolName)
    || shellTool
      && /^(?:semgrep|trivy|snyk|codeql)\b/i.test(command)
      && !/\s--(?:version|help)\b/i.test(command);
  const inspectionTool = /^(?:read|grep|rg|search)$/i.test(toolName)
    || shellTool
      && /^(?:rg|grep|sed\s+-n|cat|head|tail)\b/i.test(command)
      && !/\s--(?:version|help)\b/i.test(command);
  const targetText = securityInspectionTargetText(event, command);
  const requestedSecurityPaths = extractSecurityScopePaths(state.lastPrompt);
  const previousCoverage = state.evidence.securityInspectionEvidence?.routeId === gateControllerRouteId(state)
    ? state.evidence.securityInspectionEvidence.targetCoverageDigests ?? []
    : [];
  const previousSignals = state.evidence.securityInspectionEvidence?.routeId === gateControllerRouteId(state)
    ? state.evidence.securityInspectionEvidence.securitySignals ?? []
    : [];
  const scopeCoverage = securityRouteCoverage(state.lastPrompt, targetText, previousCoverage);
  const observedSignals = securitySignalsForHostText(resultText, { trustScannerFindings: scanner });
  const inspectedPaths = extractSecurityScopePaths(targetText);
  const directCallerEvidence = !scopeCoverage.matched
    && state.evidence.securityInspectionEvidence?.routeId === gateControllerRouteId(state)
    && state.evidence.securityInspectionEvidence?.complete === true
    && observedSignals.length > 0
    && isDirectSecurityCallerEvidence(requestedSecurityPaths, inspectedPaths, resultText, observedSignals);
  if ((scanner && /--(?:version|help)\b/i.test(command))
    || (scanner && (!hasSecurityInspectionTarget(targetText) || isEmptySecurityScanResult(resultText)))
    || (!scanner && (!inspectionTool || !hasSecurityInspectionTarget(targetText)))
    || requestedSecurityPaths.some((path) => securityCommandExcludesPath(command, path))
    || (!scopeCoverage.matched && !directCallerEvidence)
    || !resultText.trim()) return false;
  state.evidence.securityInspectionEvidence = {
    schemaVersion: 1,
    source: 'host-security-inspection',
    routeId: gateControllerRouteId(state),
    toolName,
    inputDigest: digestEvidence(command),
    resultDigest: digestEvidence(resultText),
    targetCoverageDigests: scopeCoverage.coveredDigests,
    expectedTargetCount: scopeCoverage.expectedCount,
    securitySignals: uniqueValues([...previousSignals, ...observedSignals]),
    complete: scopeCoverage.complete,
    observedAt: Date.now(),
  };
  state.evidence.securityInspectionObserved = scopeCoverage.complete;
  return true;
}

function securitySignalsForHostText(value = '', { trustScannerFindings = false } = {}) {
  const text = stripCodeComments(String(value));
  if (trustScannerFindings) {
    const categoryToSignal = new Map([
      ['xss-sink', 'xss-sink'],
      ['sql-sink', 'sql-sink'],
      ['code-execution-sink', 'code-execution-sink'],
      ['filesystem-sink', 'filesystem-sink'],
      ['header-sink', 'header-sink'],
      ['network-sink', 'network-sink'],
      ['auth-boundary', 'auth-boundary'],
    ]);
    return uniqueValues([...securityClaimCategories(text)]
      .map((category) => categoryToSignal.get(category))
      .filter(Boolean));
  }

  const staticBindings = new Set();
  const signals = new Set();
  for (const statement of splitSecurityStatements(text)) {
    if (hasDynamicXssSink(statement, staticBindings)) signals.add('xss-sink');
    if (hasDynamicCallSink(statement, /(?:[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*\.(?:query|execute|rawQuery)|prisma\.\$queryRaw)/i, staticBindings)) signals.add('sql-sink');
    if (hasDynamicCallSink(statement, /(?:eval|Function|[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*\.(?:exec|execFile|spawn|system))/i, staticBindings)) signals.add('code-execution-sink');
    if (hasDynamicCallSink(statement, /(?:[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*\.(?:readFile|writeFile|createReadStream|createWriteStream|open|unlink|rename|copyFile))/i, staticBindings)) signals.add('filesystem-sink');
    if (hasDynamicCallSink(statement, /(?:[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*\.(?:setHeader|writeHead|appendHeader|header))/i, staticBindings)) signals.add('header-sink');
    if (hasDynamicCallSink(statement, /(?:fetch|axios(?:\.[a-z_$][\w$]*)?|got(?:\.[a-z_$][\w$]*)?|[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*\.request)/i, staticBindings)) signals.add('network-sink');
    if (hasUnconditionalAuthBoundary(statement)) signals.add('auth-boundary');
    updateStaticSecurityBinding(statement, staticBindings);
  }
  return [...signals];
}

function hasDynamicXssSink(statement = '', staticBindings = new Set()) {
  return securityXssExpressions(statement)
    .some((expression) => isDynamicSecurityExpression(expression, staticBindings));
}

function securityXssExpressions(statement = '') {
  const patterns = [
    /\bdangerouslySetInnerHTML\s*(?:=|:)\s*\{\{?\s*__html\s*:\s*([^}\n]+)/gi,
    /(?:\b(?:this|[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*)|\])\s*\.\s*(?:innerHTML|outerHTML)\s*=\s*([^\n]+)/gi,
    /\b[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*\s*\[\s*['"](?:innerHTML|outerHTML)['"]\s*\]\s*=\s*([^\n]+)/gi,
    /\bdocument\.write\s*\(\s*([^\n)]*)/gi,
  ];
  const stringRanges = securityNonCodeRanges(statement);
  return patterns.flatMap((pattern) => [...String(statement).matchAll(pattern)]
    .filter((match) => !securityIndexInsideRanges(match.index ?? -1, stringRanges))
    .map((match) => match[1]));
}

function hasDynamicCallSink(statement = '', calleePattern, staticBindings = new Set()) {
  return securityCallExpressions(statement, calleePattern)
    .some((arg) => isDynamicSecurityExpression(arg, staticBindings));
}

function securityCallExpressions(statement = '', calleePattern) {
  const pattern = new RegExp(`\\b${calleePattern.source}\\s*\\(\\s*([^\\n)]*)`, 'gi');
  const stringRanges = securityNonCodeRanges(statement);
  return [...String(statement).matchAll(pattern)]
    .filter((match) => !securityIndexInsideRanges(match.index ?? -1, stringRanges))
    .filter((match) => !isSecurityCallDeclaration(statement, match))
    .flatMap((match) => splitSimpleCallArguments(match[1]));
}

function isSecurityCallDeclaration(statement = '', match = {}) {
  const text = String(statement);
  const callee = String(match[0] ?? '').split('(')[0].trim();
  if (callee.includes('.')) return false;
  const before = text.slice(0, match.index ?? 0);
  if (/\b(?:function|func|fn|def|async|get|set)\s*$/i.test(before)) return true;
  const after = text.slice((match.index ?? 0) + String(match[0] ?? '').length);
  if (/\b(?:if|for|while|switch|catch|with)\s*$/i.test(before)
    && /^\)\s*(?:\{|:)/.test(after)) return false;
  return /^\)\s*(?::[^={;]+)?\{/i.test(after)
    || /^\)\s*:\s*[^;{}]+\s*(?:;|$)/i.test(after);
}

function splitSimpleCallArguments(value = '') {
  return String(value).split(',').map((part) => part.trim()).filter(Boolean);
}

function isDynamicSecurityExpression(value = '', staticBindings = new Set()) {
  const expression = String(value).trim().replace(/[})\]]+\s*$/, '').trim();
  if (!expression) return false;
  const staticAtom = String.raw`(?:null|undefined|true|false|-?\d+(?:\.\d+)?|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\`(?:\\.|[^\`$]|\$(?!\{))*\`)`;
  if (new RegExp(`^${staticAtom}(?:\\s*\\+\\s*${staticAtom})*$`, 'i').test(expression)) return false;
  if (/^[a-z_$][\w$]*$/i.test(expression) && staticBindings.has(expression)) return false;
  return true;
}

function updateStaticSecurityBinding(statement = '', staticBindings = new Set()) {
  const assignment = String(statement).trim().match(/^(?:(?:const|let|var)\s+)?([a-z_$][\w$]*)\s*=(?!=)\s*([\s\S]+)$/i);
  if (!assignment) return;
  if (isDynamicSecurityExpression(assignment[2], staticBindings)) staticBindings.delete(assignment[1]);
  else staticBindings.add(assignment[1]);
}

function hasUnconditionalAuthBoundary(statement = '') {
  const text = String(statement);
  return hasSecurityCodeMatch(text, /\b(?:authorize|authenticate|checkAccess|hasPermission|isAdmin|accessControl)\b[^{}\n]{0,80}\{[^}\n]{0,120}\breturn\s+true\b/i)
    || hasSecurityCodeMatch(text, /\b(?:authorize|authenticate|checkAccess|hasPermission|isAdmin|accessControl)\b[^=\n]{0,80}=>\s*true\b/i);
}

function splitSecurityStatements(value = '') {
  const text = String(value);
  const statements = [];
  let start = 0;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === ';' || character === '\n') {
      statements.push(text.slice(start, index));
      start = index + 1;
    }
  }
  statements.push(text.slice(start));
  return statements;
}

function securityStringRanges(value = '') {
  const text = String(value);
  const ranges = [];
  let start = -1;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (!quote) {
      if (character === '"' || character === "'" || character === '`') {
        quote = character;
        start = index;
      }
      continue;
    }
    if (escaped) escaped = false;
    else if (character === '\\') escaped = true;
    else if (character === quote) {
      ranges.push([start, index]);
      quote = '';
      start = -1;
    }
  }
  if (quote && start >= 0) ranges.push([start, text.length - 1]);
  return ranges;
}

function securityRegexRanges(value = '') {
  const text = String(value);
  const stringRanges = securityStringRanges(text);
  const ranges = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '/' || securityIndexInsideRanges(index, stringRanges)) continue;
    if (text[index + 1] === '/' || text[index + 1] === '*') continue;
    let previousIndex = index - 1;
    while (previousIndex >= 0 && /\s/.test(text[previousIndex])) previousIndex -= 1;
    const previous = previousIndex >= 0 ? text[previousIndex] : '';
    const prefix = text.slice(0, index).match(/([a-z_$][\w$]*)\s*$/i)?.[1]?.toLowerCase() ?? '';
    const startsExpression = previousIndex < 0
      || /[=(:,[!&|?;{}]/.test(previous)
      || ['return', 'case', 'throw', 'yield', 'await'].includes(prefix);
    if (!startsExpression) continue;

    let escaped = false;
    let inCharacterClass = false;
    let end = -1;
    for (let cursor = index + 1; cursor < text.length; cursor += 1) {
      const character = text[cursor];
      if (character === '\n') break;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === '\\') {
        escaped = true;
        continue;
      }
      if (character === '[') inCharacterClass = true;
      else if (character === ']') inCharacterClass = false;
      else if (character === '/' && !inCharacterClass) {
        end = cursor;
        while (/[dgimsuvy]/i.test(text[end + 1] ?? '')) end += 1;
        break;
      }
    }
    if (end < 0) continue;
    ranges.push([index, end]);
    index = end;
  }
  return ranges;
}

function securityNonCodeRanges(value = '') {
  return [...securityStringRanges(value), ...securityRegexRanges(value)];
}

function securityIndexInsideRanges(index = -1, ranges = []) {
  return ranges.some(([start, end]) => index >= start && index <= end);
}

function hasSecurityCodeMatch(value = '', pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matches = String(value).matchAll(new RegExp(pattern.source, flags));
  const ranges = securityNonCodeRanges(value);
  return [...matches].some((match) => !securityIndexInsideRanges(match.index ?? -1, ranges));
}

function stripCodeComments(value = '') {
  return String(value)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/(^|\s)#[^\n]*/g, '$1 ');
}

function isDirectSecurityCallerEvidence(requestedPaths = [], inspectedPaths = [], value = '', observedSignals = []) {
  const code = stripCodeComments(String(value));
  const callerPaths = uniqueValues(inspectedPaths.map(normalizeSecurityModulePath).filter(Boolean));
  if (callerPaths.length !== 1) return false;
  return requestedPaths.some((requestedPath) => {
    const bindings = [];
    for (const match of code.matchAll(/\bimport\s+([^;\n]+?)\s+from\s*['"]([^'"]+)['"]/gi)) {
      if (!securityImportMatchesRequestedPath(match[2], callerPaths[0], requestedPath)) continue;
      bindings.push(...importedLocalBindings(match[1]));
    }
    for (const match of code.matchAll(/\b(?:const|let|var)\s+([^=;\n]+?)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/gi)) {
      if (!securityImportMatchesRequestedPath(match[2], callerPaths[0], requestedPath)) continue;
      bindings.push(...requiredLocalBindings(match[1]));
    }
    const uniqueBindings = uniqueValues(bindings);
    if (!uniqueBindings.length) return false;
    return hasBoundSecuritySignal(code, uniqueBindings, observedSignals);
  });
}

function securityImportMatchesRequestedPath(specifier = '', callerPath = '', requestedPath = '') {
  if (!/^\.\.?\//.test(String(specifier))) return false;
  const callerDirectory = posix.dirname(normalizeSecurityModulePath(callerPath));
  const resolvedImport = normalizeSecurityModulePath(posix.join(callerDirectory, specifier));
  const requested = normalizeSecurityModulePath(requestedPath);
  return stripSecurityModuleExtension(resolvedImport) === stripSecurityModuleExtension(requested);
}

function normalizeSecurityModulePath(value = '') {
  const normalized = posix.normalize(String(value).trim().replace(/\\/g, '/').replace(/^\.\//, ''));
  return normalized === '.' || normalized.startsWith('../') || posix.isAbsolute(normalized) ? '' : normalized;
}

function stripSecurityModuleExtension(value = '') {
  return String(value).replace(/\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|swift|rb|php|cs)$/i, '');
}

function hasBoundSecuritySignal(code = '', bindings = [], observedSignals = []) {
  if (!bindings.length) return false;
  const tainted = new Set();
  const staticBindings = new Set();
  for (const statement of splitSecurityStatements(code)) {
    if (observedSignals.some((signal) => securitySignalUsesBoundData(
      statement,
      signal,
      bindings,
      tainted,
      staticBindings,
    ))) return true;

    const assignment = String(statement).trim().match(/^(?:(?:const|let|var)\s+)?([a-z_$][\w$]*)\s*=(?!=)\s*([\s\S]+)$/i);
    if (assignment) {
      const rhs = assignment[2];
      const taintedRhs = hasDynamicBoundCall(rhs, bindings, staticBindings)
        || expressionReferencesSecurityNames(rhs, tainted);
      if (taintedRhs) tainted.add(assignment[1]);
      else tainted.delete(assignment[1]);
    }
    updateStaticSecurityBinding(statement, staticBindings);
  }
  return false;
}

function securitySignalUsesBoundData(statement = '', signal = '', bindings = [], tainted = new Set(), staticBindings = new Set()) {
  const expressions = securityExpressionsForSignal(statement, signal);
  return expressions.some((expression) => isDynamicSecurityExpression(expression, staticBindings)
    && (hasDynamicBoundCall(expression, bindings, staticBindings)
      || expressionReferencesSecurityNames(expression, tainted)));
}

function securityExpressionsForSignal(statement = '', signal = '') {
  if (signal === 'xss-sink') return securityXssExpressions(statement);
  const patterns = {
    'sql-sink': /(?:[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*\.(?:query|execute|rawQuery)|prisma\.\$queryRaw)/i,
    'code-execution-sink': /(?:eval|Function|[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*\.(?:exec|execFile|spawn|system))/i,
    'filesystem-sink': /(?:[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*\.(?:readFile|writeFile|createReadStream|createWriteStream|open|unlink|rename|copyFile))/i,
    'header-sink': /(?:[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*\.(?:setHeader|writeHead|appendHeader|header))/i,
    'network-sink': /(?:fetch|axios(?:\.[a-z_$][\w$]*)?|got(?:\.[a-z_$][\w$]*)?|[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)*\.request)/i,
  };
  return patterns[signal] ? securityCallExpressions(statement, patterns[signal]) : [];
}

function hasDynamicBoundCall(value = '', bindings = [], staticBindings = new Set()) {
  const text = String(value);
  const stringRanges = securityNonCodeRanges(text);
  return bindings.some((binding) => {
    const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}(?:\\.[a-z_$][\\w$]*)?\\s*\\(\\s*([^\\n)]*)`, 'gi');
    return [...text.matchAll(pattern)]
      .filter((match) => !securityIndexInsideRanges(match.index ?? -1, stringRanges))
      .some((match) => splitSimpleCallArguments(match[1])
        .some((arg) => isDynamicSecurityExpression(arg, staticBindings)));
  });
}

function expressionReferencesSecurityNames(value = '', names = new Set()) {
  return [...names].some((name) => hasSecurityCodeMatch(
    value,
    new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
  ));
}

function importedLocalBindings(clause = '') {
  const text = String(clause);
  const bindings = [];
  const named = text.match(/\{([^}]*)\}/)?.[1] ?? '';
  for (const item of named.split(',')) {
    const match = item.trim().match(/^[a-z_$][\w$]*(?:\s+as\s+([a-z_$][\w$]*))?$/i);
    if (match) bindings.push(match[1] ?? item.trim());
  }
  const namespace = text.match(/\*\s+as\s+([a-z_$][\w$]*)/i)?.[1];
  if (namespace) bindings.push(namespace);
  const defaultBinding = text.replace(/\{[^}]*\}|\*\s+as\s+[a-z_$][\w$]*/gi, '').split(',')[0].trim();
  if (/^[a-z_$][\w$]*$/i.test(defaultBinding)) bindings.push(defaultBinding);
  return uniqueValues(bindings);
}

function requiredLocalBindings(clause = '') {
  const text = String(clause).trim();
  const named = text.match(/^\{([^}]*)\}$/)?.[1];
  if (named != null) {
    return uniqueValues(named.split(',').flatMap((item) => {
      const match = item.trim().match(/^([a-z_$][\w$]*)(?:\s*:\s*([a-z_$][\w$]*))?$/i);
      return match ? [match[2] ?? match[1]] : [];
    }));
  }
  return /^[a-z_$][\w$]*$/i.test(text) ? [text] : [];
}

function securityCommandExcludesPath(command = '', requestedPath = '') {
  const exclusions = [];
  const optionPattern = /(?:^|\s)(--exclude(?:-dir)?|--ignore(?:-pattern)?|--glob|-g)(?:=|\s+)(?:"([^"]*)"|'([^']*)'|([^\s]+))/gi;
  for (const match of String(command).matchAll(optionPattern)) {
    const option = match[1].toLowerCase();
    let pattern = String(match[2] ?? match[3] ?? match[4] ?? '').trim();
    if ((option === '--glob' || option === '-g') && !pattern.startsWith('!')) continue;
    pattern = pattern.replace(/^!+/, '').replace(/^\.\//, '').replace(/\\/g, '/');
    if (pattern) exclusions.push({ option, pattern });
  }

  const requested = String(requestedPath).toLowerCase().replace(/^\.\//, '').replace(/\\/g, '/');
  const basename = requested.split('/').at(-1) ?? requested;
  return exclusions.some(({ option, pattern }) => {
    const normalized = pattern.toLowerCase().replace(/\/{2,}/g, '/');
    if (normalized === requested || normalized === basename) return true;
    if (requested.startsWith(`${normalized.replace(/\/$/, '')}/`)) return true;
    if (option === '--exclude-dir' && requested.split('/').includes(normalized.replace(/^.*\//, ''))) return true;
    const glob = normalized
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '\\x00')
      .replace(/\*/g, '[^/]*')
      .replace(/\\x00/g, '.*');
    try {
      return new RegExp(`^(?:${glob}|.*/${glob})$`, 'i').test(requested);
    } catch {
      return true;
    }
  });
}

function securityInspectionTargetText(event = {}, command = '') {
  const candidates = [
    event.path,
    event.file,
    event.uri,
    event.input?.path,
    event.input?.file,
    event.input?.uri,
    event.input?.cwd,
    event.params?.path,
    event.params?.file,
    event.params?.uri,
    event.args?.path,
    event.args?.file,
    event.details?.input?.path,
    event.details?.input?.file,
    command,
  ];
  return candidates.filter((value) => typeof value === 'string').join('\n');
}

function hasSecurityInspectionTarget(value = '') {
  const text = String(value);
  if (!text.trim()) return false;
  return /(?:^|[\s"'`:(])(?:\.\/)?(?:src|lib|app|server|api|auth|security|config|scripts?|\.github\/workflows)\//i.test(text)
    || /(?:^|[\s"'`/:(])(?:Dockerfile|Makefile|package(?:-lock)?\.json|pyproject\.toml|Cargo\.toml|go\.mod)(?:$|[\s"'`:)])/i.test(text)
    || /\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|swift|rb|php|cs|ya?ml|toml|json|env|sh|sql)(?::\d+)?(?:$|[\s"'`:)])/i.test(text);
}

function isEmptySecurityScanResult(value = '') {
  const text = String(value);
  return /\b(?:0\s+files?\s+(?:scanned|analyzed|checked)|(?:scanned|analyzed|checked)\s+0\s+files?|no\s+files?\s+(?:were\s+)?(?:scanned|analyzed|checked)|nothing\s+to\s+scan)\b/i.test(text)
    || /(?:^|\n)\s*usage:\s*(?:semgrep|trivy|snyk|codeql)\b/i.test(text);
}

function securityRouteCoverage(prompt = '', inspectedTarget = '', previousDigests = []) {
  const request = String(prompt).toLowerCase();
  const target = String(inspectedTarget).toLowerCase();
  const explicitPaths = extractSecurityScopePaths(request);
  if (explicitPaths.length) {
    const expected = explicitPaths.map((path) => digestEvidence(path));
    const covered = new Set(previousDigests.filter((digest) => expected.includes(digest)));
    let matched = false;
    for (const path of explicitPaths) {
      if (!inspectionCoversSecurityPath(target, path)) continue;
      covered.add(digestEvidence(path));
      matched = true;
    }
    return {
      matched,
      coveredDigests: [...covered].sort(),
      expectedCount: expected.length,
      complete: expected.every((digest) => covered.has(digest)),
    };
  }

  const scopedTerms = [];
  if (/(?:authentication|authorization|\bauth\b|登录|认证|鉴权|授权)/i.test(request)) scopedTerms.push(/(?:auth|credential|identity|session|login|access)/i);
  if (/(?:cryptograph|encryption|cipher|\btls\b|\bssl\b|加密|密码学|证书)/i.test(request)) scopedTerms.push(/(?:crypto|cipher|encrypt|decrypt|tls|ssl|cert|key)/i);
  if (/(?:secret|credential|token|密钥|凭据|令牌)/i.test(request)) scopedTerms.push(/(?:secret|credential|token|env|config|auth)/i);
  if (/(?:dependenc|supply chain|依赖|供应链)/i.test(request)) scopedTerms.push(/(?:package(?:-lock)?\.json|lock|depend|vendor|cargo\.toml|go\.mod|pyproject)/i);
  const matched = scopedTerms.every((pattern) => pattern.test(target))
    || /(?:^|[\s"'`=])(?:\.\/)?(?:src|lib|app|server|api)\/(?:$|[\s"'`])/i.test(target);
  return { matched, coveredDigests: [], expectedCount: 0, complete: matched };
}

function extractSecurityScopePaths(value = '') {
  return uniqueValues([...String(value).matchAll(/(?:^|[\s"'`(])((?:\.\.?\/)?(?:[a-z0-9_.-]+\/)+[a-z0-9_.-]+|[a-z0-9_.-]+\.(?:[cm]?[jt]sx?|py|go|rs|java|kt|swift|rb|php|cs|ya?ml|toml|json|env|sh|sql))(?:$|[\s"'`),:])/gi)]
    .map((match) => match[1].replace(/^\.\//, '').replace(/\/{2,}/g, '/')));
}

function inspectionCoversSecurityPath(inspectedTarget = '', requestedPath = '') {
  const target = String(inspectedTarget).toLowerCase();
  const requested = String(requestedPath).toLowerCase();
  if (hasStandaloneSecurityPath(target, requested)) return true;
  const parts = requested.split('/');
  if (parts.length < 2) return false;
  for (let length = parts.length - 1; length >= 1; length -= 1) {
    const ancestor = `${parts.slice(0, length).join('/')}/`;
    if (hasStandaloneSecurityPath(target, ancestor)) return true;
  }
  return false;
}

function hasStandaloneSecurityPath(value = '', path = '') {
  const escaped = String(path).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[\\s"'\\x60=:(,])(?:\\.\\/)?${escaped}(?:$|[\\s"'\\x60),])`, 'i').test(String(value));
}

function routeRequiresSecurityEvidence(route) {
  return route?.intent === 'security-review'
    || (route?.routePlan?.gateRequirements ?? []).some(({ key, mode }) => key === 'security-evidence' && mode === 'required');
}

function routeRequiresReleaseVerification(route) {
  return (route?.routePlan?.gateRequirements ?? [])
    .some(({ key, mode }) => key === 'release-approval' && mode === 'required');
}

function hasPendingReleaseMutation(state) {
  return state.evidence.releaseActionEvidence?.routeId === gateControllerRouteId(state)
    && state.evidence.releaseVerified !== true;
}

function recordReleaseEvidence(state, toolName = '', event = {}, { successful = false, ctx = {} } = {}) {
  const command = toolActionText(event);
  const action = classifyToolAction({ toolName, text: command });
  const routeId = gateControllerRouteId(state);
  const input = releaseEvidenceInput(toolName, event, ctx, { successful });
  if (action.externalWrite) {
    if (state.evidence.releaseActionEvidence?.routeId === routeId
      && state.evidence.releaseVerified !== true) return false;
    state.evidence.releaseVerified = false;
    state.evidence.releaseVerificationEvidence = null;
    if (!releaseMutationMatchesPrompt(input, state.lastPrompt)) {
      state.evidence.releaseActionEvidence = null;
      return false;
    }
    const policy = createReleaseMutationRecord(input);
    if (!policy) {
      state.evidence.releaseActionEvidence = null;
      return false;
    }
    state.evidence.releaseActionEvidence = {
      schemaVersion: 1,
      source: 'host-release-action',
      routeId,
      commandDigest: digestEvidence(command),
      policy,
      observedAt: Date.now(),
    };
    return true;
  }

  const actionEvidence = state.evidence.releaseActionEvidence;
  if (!actionEvidence || actionEvidence.routeId !== routeId) return false;
  if (!verifyReleaseMutation(actionEvidence.policy, input)) return false;
  state.evidence.releaseVerificationEvidence = {
    schemaVersion: 1,
    source: 'host-release-verification',
    routeId,
    commandDigest: digestEvidence(command),
    resultDigest: digestEvidence(toolResultText(event)),
    actionCommandDigest: actionEvidence.commandDigest,
    policyDigest: digestEvidence(JSON.stringify(actionEvidence.policy)),
    observedAt: Date.now(),
  };
  state.evidence.releaseVerified = true;
  return true;
}

function releaseEvidenceInput(toolName = '', event = {}, ctx = {}, { successful = false } = {}) {
  const command = toolActionText(event);
  const npmContext = trustedNpmReleaseContext(command, event, ctx);
  const npmEvidenceCommand = isNpmReleaseEvidenceCommand(command);
  return {
    toolName,
    command,
    resultText: toolResultText(event),
    successful,
    masked: hasUnsafeResultMasking(command),
    dryRun: isDryRunAction(command),
    cwd: npmEvidenceCommand ? npmContext?.cwd ?? '' : toolWorkingDirectory(event, ctx),
    npmManifest: npmContext?.manifest ?? null,
  };
}

function isNpmReleaseEvidenceCommand(command = '') {
  return /^(?:(?:\/[^\s/]+)+\/)?npm\s+(?:publish|view|info)\b/i.test(String(command).trim());
}

function trustedNpmReleaseContext(command = '', event = {}, ctx = {}) {
  if (!isNpmReleaseEvidenceCommand(command)) return null;
  if (typeof ctx.cwd !== 'string' || !isAbsolute(ctx.cwd)) return null;
  let trustedRoot;
  try {
    trustedRoot = realpathSync(ctx.cwd);
  } catch {
    return null;
  }

  const declaredCwds = [
    event.cwd,
    event.workdir,
    event.input?.cwd,
    event.input?.workdir,
    event.params?.cwd,
    event.params?.workdir,
    event.args?.cwd,
    event.args?.workdir,
    event.details?.cwd,
    event.details?.workdir,
    event.details?.input?.cwd,
    event.details?.input?.workdir,
  ].filter((value) => typeof value === 'string' && value.trim());
  const effectiveCwds = new Set();
  for (const declared of declaredCwds) {
    try {
      const declaredPath = realpathSync(isAbsolute(declared) ? declared : resolve(trustedRoot, declared));
      const fromRoot = relative(trustedRoot, declaredPath);
      if (fromRoot === '..' || fromRoot.startsWith('../') || isAbsolute(fromRoot)) return null;
      effectiveCwds.add(declaredPath);
    } catch {
      return null;
    }
  }
  if (effectiveCwds.size > 1) return null;
  const cwd = effectiveCwds.values().next().value ?? trustedRoot;

  if (!/^(?:(?:\/[^\s/]+)+\/)?npm\s+publish\b/i.test(String(command).trim())) {
    return { cwd, manifest: null };
  }
  try {
    const packageJsonPath = join(cwd, 'package.json');
    if (realpathSync(packageJsonPath) !== packageJsonPath) return null;
    const raw = readFileSync(packageJsonPath, 'utf8');
    const manifest = JSON.parse(raw);
    return {
      cwd,
      manifest: {
        source: 'host-package-json',
        cwd,
        name: manifest?.name,
        version: manifest?.version,
        digest: digestEvidence(raw),
      },
    };
  } catch {
    return null;
  }
}

function toolWorkingDirectory(event = {}, ctx = {}) {
  const candidates = [
    event.cwd,
    event.workdir,
    event.input?.cwd,
    event.input?.workdir,
    event.params?.cwd,
    event.params?.workdir,
    event.args?.cwd,
    event.args?.workdir,
    event.details?.cwd,
    event.details?.workdir,
    event.details?.input?.cwd,
    event.details?.input?.workdir,
    ctx.cwd,
    process.cwd(),
  ];
  return candidates.find((value) => typeof value === 'string' && value.startsWith('/')) ?? '';
}

function toolResultText(event = {}) {
  const candidates = [
    event.output,
    event.stdout,
    event.stderr,
    event.content,
    event.response,
    event.result,
    event.details?.output,
    event.details?.stdout,
    event.details?.stderr,
    event.details?.content,
    event.details?.response,
  ];
  return candidates
    .flatMap((candidate) => collectTextCandidates(candidate))
    .map((text) => text.trim())
    .filter(Boolean)
    .join('\n');
}

function digestEvidence(value = '') {
  return createHash('sha256').update(String(value).trim()).digest('hex');
}

function isSuccessfulToolEvent(event = {}) {
  return !isFailedToolEvent(event) && !isPendingToolEvent(event);
}

function isPendingToolEvent(event = {}) {
  const envelopes = [
    event,
    event.details,
    event.result,
    event.result?.details,
    event.details?.result,
    event.details?.result?.details,
    event.details?.async,
    event.result?.details?.async,
  ].filter(isRecord);
  return envelopes.some((value) => {
    const status = String(value.state ?? value.status ?? '').trim().toLowerCase();
    return ['pending', 'running', 'started', 'in_progress', 'in-progress'].includes(status);
  });
}

function isFailedToolEvent(event = {}) {
  const envelopes = [
    event,
    event.details,
    event.result,
    event.result?.details,
    event.details?.result,
    event.details?.result?.details,
  ].filter(isRecord);
  return envelopes.some((value) => {
    const status = String(value.status ?? '').trim().toLowerCase();
    const exitCode = value.exitCode ?? value.exit_code;
    return value.isError === true
      || value.error === true
      || value.ok === false
      || value.passed === false
      || Number.isFinite(exitCode) && exitCode !== 0
      || ['error', 'failed', 'failure', 'blocked', 'cancelled', 'canceled'].includes(status);
  });
}

function isExplicitPassingGateResult(event = {}) {
  if (isFailedToolEvent(event)) return false;
  const envelopes = [
    event,
    event.details,
    event.result,
    event.result?.details,
    event.details?.result,
    event.details?.result?.details,
  ].filter(isRecord);
  return envelopes.some((value) => {
    const status = String(value.status ?? '').trim().toLowerCase();
    if (value.ok === true || value.passed === true) return true;
    if (['ok', 'pass', 'passed', 'success', 'succeeded', 'completed'].includes(status)) return true;
    return Array.isArray(value.results)
      && value.results.length > 0
      && value.results.every((result) => isRecord(result) && result.passed === true);
  });
}

function isRelevantSuccessfulGateEvidence(toolName = '', event = {}) {
  if (isFailedToolEvent(event)) return false;
  if (toolName === 'omp_core_validate_skill_usage' || toolName === 'omp_core_validate_subagent_usage') {
    return [
      event.validation,
      event.details?.validation,
      event.result?.validation,
      event.result?.details?.validation,
      event.details?.result?.validation,
      event.details?.result?.details?.validation,
    ].some((validation) => isRecord(validation) && validation.ok === true);
  }
  if (toolName === 'omp_test_gate' || toolName === 'fact_check_gate') {
    return isExplicitPassingGateResult(event);
  }
  if (toolName === 'read') return extractReadSkillNames(event).length > 0;
  return toolName === 'task'
    || toolName === 'writing_quality_check'
    || toolName === 'writing_logic_check'
    || toolName === 'omp_test_report';
}

function safeEventSearchText(event = {}) {
  try {
    return JSON.stringify({
      params: event.params,
      input: event.input,
      args: event.args,
      arguments: event.arguments,
      command: event.command,
      details: {
        command: event.details?.command,
        params: event.details?.params,
        input: event.details?.input,
      },
    });
  } catch {
    return '';
  }
}

function toolActionText(event = {}) {
  const candidates = [
    event.command,
    event.input?.command,
    event.input?.cmd,
    event.params?.command,
    event.params?.cmd,
    event.args?.command,
    event.args?.cmd,
    event.arguments?.command,
    event.arguments?.cmd,
    event.details?.command,
    event.details?.input?.command,
    event.details?.input?.cmd,
    event.details?.params?.command,
    event.details?.params?.cmd,
  ];
  const command = candidates.find((value) => typeof value === 'string' && value.trim());
  return command ? command.trim() : safeEventSearchText(event);
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
