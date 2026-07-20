import { installPluginSkills } from './src/install-skills.js';
import { classifyHostTurn } from './src/host-turn-context.js';
import { describeNaturalLanguageTask } from './src/task-descriptor.js';
import {
  buildDynamicReviewBudgetPrompt,
  buildTaskShapePrompt,
} from './src/review-budget.js';
import {
  normalizeSkillName,
  parseLoadedSkillEvidence,
  skillReadNameCandidates,
  skillNamesEquivalent,
  validateSkillUsage,
} from './src/skill-usage.js';
import { validateSubagentUsage } from './src/subagent-usage.js';
import {
  createWorkflowProtocolCoachState,
  observeProtocolAssistantMessage,
  observeProtocolSuppliedWorkflowIndex,
  observeProtocolToolCall,
  observeProtocolToolResult,
  presentWorkflowProtocolCoachCue,
  sanitizeWorkflowProtocolCoachState,
  serializeWorkflowProtocolCoachState,
} from './src/workflow-protocol-coach.js';

const CORE_STATE_ENTRY = 'omp-enhancer-core.state';
const STATE_SCHEMA_VERSION = 7;
const SKILL_DISCOVERY_MESSAGE_TYPE = 'omp-enhancer-skill-discovery';
const PROTOCOL_COACH_MESSAGE_TYPE = 'omp-enhancer-protocol-coach';
const DISABLE_DEEPSEEK_COMPAT_ENV = 'OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT';
const DISABLE_MIMO_COMPAT_ENV = 'OMP_ENHANCER_DISABLE_MIMO_COMPAT';
const DISABLE_PROTOCOL_COACH_ENV = 'OMP_ENHANCER_DISABLE_PROTOCOL_COACH';
const SKILL_URI_IDENTITY = 'SKILL URI: visible `x` -> `skill://x`; nested only from a loaded source revealing the exact URI. Use `read.path`. Bare `x` is a project path, not Skill absence; only exact-URI failure = unavailable. `.agents/skills` is not the inventory.';
const STAGED_ENTRY = 'ENTRY (soft): DIRECT is a verbatim, no-judgment field/heading lookup with no Skill/TODO. Review, correction, comparison, verification, design, transformation, or planning is PROJECT at any size.';
const SKILL_STAGED_REMINDER = [
  STAGED_ENTRY,
  'PROJECT ONLY — DECLARE: next response starts at byte 0 with the visible WORKFLOW PLAN block using Primary/Add-ons none, chosen exact domain Skill URIs, `Load order: NOW=[<non-supplied Skill URIs-or-none>] THEN=[none]`, and four detailed Actions. Do not invent an ID.',
  SKILL_URI_IDENTITY,
  'PROJECT ONLY — LOAD: read only NOW exact Skill URIs, end, and wait. Omit a supplied native `skill-prompt` body; do not bulk-load or retry unchanged failures.',
  'PROJECT ONLY — COMMIT: first visible bytes are `WORKFLOW READY | workflows=unavailable | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`; rebase TODO, call TODO init only, wait, then execute.',
].join('\n');
const TASK_STAGED_REMINDER = [
  STAGED_ENTRY,
  'PROJECT ONLY — PHASE 1 — PLAN: before project tools, write a concise numbered plan and decide whether the request has genuinely independent runnable slices.',
  'PROJECT ONLY — PHASE 2 — COMMIT: map that plan to native `todo` when exposed and allowed. Decide direct work or delegation from the current Available Agents, native schema and capacity, dependencies, and user constraints; no fork or width is selected by this reminder.',
  'PROJECT ONLY — PHASE 3 — EXECUTE: follow the committed plan with bounded assignments and evidence, then integrate delivered results. Native tools, permissions, delivery, and completion remain authoritative.',
].join('\n');
const DELEGATION_DECISION = 'DELEGATION AFTER READY (soft): non-simple work defaults to delegation if native state permits. When parent-owned pre-dispatch prerequisites complete, the committed task is next. Main owns TODO/Agent/width; no runtime gate/router/retry/completion control.';
const ENHANCER_TOOL_GROUPS = Object.freeze({
  core: ['omp_core_'],
  config: ['omp_config_'],
  writing: ['writing_'],
  fact: ['fact_check_'],
  test: ['omp_test_'],
});

export default function registerCoreEnhancer(pi) {
  const state = createState();
  let activeHostTurnKind = 'user';
  let protocolCoachTurnEligible = false;
  const z = pi.zod?.z ?? pi.z;

  pi.setLabel?.('OMP Enhancer Core');

  pi.registerTool({
    name: 'omp_core_validate_skill_usage',
    label: 'Review skill usage',
    description: 'Compare observed skill reads with explicitly supplied skill candidates and return advisory evidence.',
    defaultInactive: true,
    approval: 'read',
    parameters: z?.object ? z.object({
      output: z.string(),
      skills: z.array(z.string()).optional(),
    }) : undefined,
    execute: async (_callId, params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const suggestedSkills = unique(params.skills ?? []);
      const validation = validateSkillUsage({
        suggestedSkills,
        output: '',
        loadedSkills: effectiveSkills(state),
      });
      for (const skill of parseLoadedSkillEvidence(params.output ?? '')) {
        state.claimedSkills.add(normalizeSkillName(skill));
      }
      state.lastSkillUsage = skillCoverageReview(validation, suggestedSkills, {
        claimedSkills: state.claimedSkills,
      });
      await persistState(pi, state);
      return okResult(state.lastSkillUsage.summary, {
        validation: state.lastSkillUsage,
      });
    },
  });

  pi.registerTool({
    name: 'omp_core_validate_subagent_usage',
    label: 'Review agent usage',
    description: 'Compare reported collaboration with explicitly supplied Agent candidates and return advisory evidence.',
    defaultInactive: true,
    approval: 'read',
    parameters: z?.object ? z.object({
      output: z.string(),
      agents: z.array(z.string()).optional(),
    }) : undefined,
    execute: async (_callId, params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const suggestedRoles = unique(params.agents ?? []);
      const validation = validateSubagentUsage({
        suggestedAgents: suggestedRoles,
        output: params.output ?? '',
      });
      state.lastSubagentUsage = roleCoverageReview(validation, suggestedRoles);
      await persistState(pi, state);
      return okResult(state.lastSubagentUsage.summary, {
        validation: state.lastSubagentUsage,
      });
    },
  });

  pi.registerTool({
    name: 'omp_core_observation_status',
    label: 'Show Core observations',
    description: 'Show observed skill reads and native task progress without selecting a workflow or Agent.',
    defaultInactive: true,
    approval: 'read',
    parameters: z?.object ? z.object({}) : undefined,
    execute: async (_callId, _params = {}, _signal, _onUpdate, ctx = {}) => {
      restoreStateFromContext(state, ctx);
      const status = buildObservationStatus(state);
      await persistState(pi, state);
      return okResult(formatObservationStatus(status), { status });
    },
  });

  pi.registerTool({
    name: 'omp_core_install_skills',
    label: 'Install plugin skills',
    description: 'Install marketplace plugin skills without overwriting real directories, and report exact legacy gate skills that can be ignored without disabling autolearn.',
    defaultInactive: true,
    approval: 'write',
    parameters: z?.object ? z.object({
      dryRun: z.boolean().optional(),
    }) : undefined,
    execute: async (_callId, params = {}) => {
      const result = await installPluginSkills({ dryRun: params.dryRun ?? false });
      const summary = [
        'Installed: ' + result.installed.length,
        'Skipped: ' + result.skipped.length,
        'Errors: ' + result.errors.length,
        ...(result.warnings.length ? ['Warnings: ' + result.warnings.length] : []),
        ...(result.legacyFindings.length ? ['Legacy gate skill findings: ' + result.legacyFindings.length] : []),
      ].join(', ');
      return okResult(summary, result);
    },
  });

  registerEnhancerToolsCommand(pi);

  pi.on?.('session_start', async (_event = {}, ctx = {}) => {
    activeHostTurnKind = 'user';
    protocolCoachTurnEligible = false;
    if (!restoreStateFromContext(state, ctx)) resetState(state);
    await persistState(pi, state);
    return undefined;
  });

  pi.on?.('before_agent_start', async (event = {}, ctx = {}) => {
    protocolCoachTurnEligible = false;
    restoreStateFromContext(state, ctx);
    const hostTurn = classifyHostTurn(event, ctx);
    activeHostTurnKind = hostTurn.kind;
    if (hostTurn.kind === 'autolearn-capture') return undefined;
    if (hostTurn.kind === 'advisor') return undefined;
    const prompt = extractPrompt(event);
    if (isSlashCommandPrompt(prompt)) return undefined;

    if (isSubagentSession(ctx) || isSubagentLaunchPrompt(prompt)) return undefined;

    const implementationTransition = isPlanningImplementationTransition(state, prompt);
    const inherited = !implementationTransition && shouldInheritContinuation(state, prompt);
    const previousPrompt = state.lastPrompt;
    const taskContext = inherited
      ? state.lastTaskContext
      : resolveMainTaskContext({
        prompt,
      });

    if (!inherited) {
      state.lastTaskContext = taskContext;
      state.lastPrompt = implementationTransition
        ? [previousPrompt, prompt].filter(Boolean).join('\n')
        : prompt;
      state.taskStartedAt = Math.max(Date.now(), state.taskStartedAt + 1);
      state.lastSkillUsage = null;
      state.lastSubagentUsage = null;
      state.observedSkills.clear();
      state.claimedSkills.clear();
      state.tasks.clear();
      state.completedAgents.clear();
      state.protocolCoach = createWorkflowProtocolCoachState();
    } else {
      state.lastPrompt = [state.lastPrompt, prompt].filter(Boolean).join('\n');
    }
    const visibleSkills = activeSkillInventory(pi);
    const compatibilityModel = stagedCompatibilityModel(ctx.model);
    protocolCoachTurnEligible = Boolean(compatibilityModel)
      && process.env[DISABLE_PROTOCOL_COACH_ENV] !== '1';
    const workflowIndexSupplied = hasSuppliedNativeSkillPrompt(
      event,
      ctx,
      'omp-enhancer-workflows',
    );
    if (protocolCoachTurnEligible && workflowIndexSupplied) {
      observeProtocolSuppliedWorkflowIndex(state.protocolCoach);
    }
    const compatibilityReminder = compatibilityModel
      ? buildStagedCompatibilityReminder({
        compatibilityModel,
        hasVisibleSkills: visibleSkills.length > 0,
        hasWorkflowSkill: visibleSkills.some(({ name }) => (
          skillNamesEquivalent(name, 'omp-enhancer-workflows')
        )),
        workflowIndexSupplied,
        hasNativeTask: hasActiveNativeTask(pi),
        subagentsAllowed: taskContext.taskDescriptor?.constraints?.subagents !== 'forbidden',
        implementationDelegationAllowed: taskContext.taskDescriptor?.constraints?.implementationDelegation !== 'forbidden',
        taskDescriptor: taskContext.taskDescriptor,
      })
      : null;
    const shouldRemindModel = (
      compatibilityReminder
      && state.compatibilityReminderTaskStartedAt !== state.taskStartedAt
    );
    if (shouldRemindModel) {
      state.compatibilityReminderTaskStartedAt = state.taskStartedAt;
    }
    await persistState(pi, state);
    if (shouldRemindModel) {
      return {
        message: {
          customType: SKILL_DISCOVERY_MESSAGE_TYPE,
          content: compatibilityReminder.content,
          display: false,
          attribution: 'user',
          details: {
            compatibility: 'skill-discovery',
            model: compatibilityModel,
            features: compatibilityReminder.features,
            source: 'omp-enhancer-core',
          },
        },
      };
    }
    return undefined;
  });

  pi.on?.('message_end', async (event = {}, ctx = {}) => {
    if (!protocolCoachEventEligible(protocolCoachTurnEligible, activeHostTurnKind, ctx)) return undefined;
    if (event.message?.role !== 'assistant' || !assistantMessageSucceeded(event.message)) return undefined;
    const text = visibleAssistantText(event.message);
    restoreStateFromContext(state, ctx);
    const changed = observeProtocolAssistantMessage(state.protocolCoach, text);
    if (!changed) return undefined;
    await persistState(pi, state);
    return undefined;
  });

  pi.on?.('context', async (event = {}, ctx = {}) => {
    if (!protocolCoachEventEligible(protocolCoachTurnEligible, activeHostTurnKind, ctx)) return undefined;
    if (!Array.isArray(event.messages)) return undefined;
    restoreStateFromContext(state, ctx);
    const cue = presentWorkflowProtocolCoachCue(state.protocolCoach);
    if (!cue) return undefined;
    return {
      messages: [
        ...event.messages,
        {
          role: 'custom',
          customType: PROTOCOL_COACH_MESSAGE_TYPE,
          content: cue.content,
          display: false,
          details: {
            advisory: true,
            phase: cue.kind,
            source: 'omp-enhancer-core',
          },
          attribution: 'user',
          timestamp: cue.timestamp,
        },
      ],
    };
  });

  pi.on?.('tool_call', async (event = {}, ctx = {}) => {
    if (activeHostTurnKind !== 'user') return undefined;
    restoreStateFromContext(state, ctx);
    if (protocolCoachEventEligible(protocolCoachTurnEligible, activeHostTurnKind, ctx)) {
      observeProtocolToolCall(state.protocolCoach, { name: toolEventName(event) });
    }
    if (toolEventName(event) === 'task') {
      recordTaskDispatch(state, event);
      await persistState(pi, state);
    }
    return undefined;
  });

  pi.on?.('tool_result', async (event = {}, ctx = {}) => {
    if (activeHostTurnKind !== 'user') return undefined;
    restoreStateFromContext(state, ctx);
    const name = toolEventName(event);
    if (name === 'read' && !toolEventFailed(event)) recordSkillReads(state, event);
    if (name === 'task') recordTaskResult(state, event);
    if (protocolCoachEventEligible(protocolCoachTurnEligible, activeHostTurnKind, ctx)) {
      observeProtocolToolResult(state.protocolCoach, {
        name,
        target: readToolTarget(event),
        body: name === 'read' ? readResultText(event) : '',
        failed: toolEventFailed(event),
        pending: toolEventPending(event),
      });
    }
    await persistState(pi, state);
    return undefined;
  });

  pi.on?.('session_stop', async (event = {}, ctx = {}) => {
    if (activeHostTurnKind !== 'user') {
      activeHostTurnKind = 'user';
      return undefined;
    }
    restoreStateFromContext(state, ctx);
    for (const skill of parseLoadedSkillEvidence(extractText(event))) {
      state.claimedSkills.add(normalizeSkillName(skill));
    }
    await persistState(pi, state);
    return undefined;
  });
}

function stagedCompatibilityModel(model) {
  const provider = String(model?.provider ?? '').trim().toLowerCase();
  const id = String(model?.id ?? '').trim().toLowerCase();
  if (provider !== 'opencode-go') return '';
  if (id === 'deepseek-v4-flash' && process.env[DISABLE_DEEPSEEK_COMPAT_ENV] !== '1') {
    return 'deepseek-v4-flash';
  }
  if (id === 'mimo-v2.5' && process.env[DISABLE_MIMO_COMPAT_ENV] !== '1') {
    return 'mimo-v2.5';
  }
  return '';
}

function protocolCoachEventEligible(turnEligible, hostTurnKind, ctx = {}) {
  return turnEligible === true
    && hostTurnKind === 'user'
    && process.env[DISABLE_PROTOCOL_COACH_ENV] !== '1'
    && Boolean(stagedCompatibilityModel(ctx.model))
    && !isSubagentSession(ctx);
}

function buildWorkflowEntryReminder(protocolLabel, workflowIndexSupplied, {
  delegationAvailable = false,
} = {}) {
  const firstProjectAction = workflowIndexSupplied
    ? '- OTHERWISE (PROJECT): INDEX STATUS=SUPPLIED BY EXACT NATIVE `skill-prompt`. Do not reread it; the next response starts at byte 0 with a filled `WORKFLOW PLAN` from that body.'
    : '- OTHERWISE (PROJECT): INDEX STATUS=NOT SUPPLIED. Call only `read` with `path=skill://omp-enhancer-workflows`, end the response and wait. Do not read a project path or call any other tool first.';
  const executionHandoff = delegationAvailable
    ? 'For a loaded non-simple card, assign at least one safe complete checkpoint to a current matching Agent when native state permits; keep parent VERIFY separate.'
    : 'For a loaded non-simple card, record the concrete permitted fallback on each affected checkpoint when native delegation is unavailable or forbidden; keep parent VERIFY separate.';
  return [
    `${protocolLabel} (soft one-shot for top-level Main).`,
    'FIRST RESPONSE: choose exactly one line below.',
    '- DIRECT ONLY: a verbatim, no-judgment field/heading lookup uses no Skill or TODO.',
    firstProjectAction,
    'Review, correction, comparison, verification, design, transformation, planning, research, and writing are PROJECT at any size. Available Skills metadata and this reminder are not the body; only the exact native `skill-prompt` body named `omp-enhancer-workflows` is supplied.',
    `AFTER THE INDEX RETURNS: follow its DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY protocol exactly. Emit a byte-0 \`WORKFLOW PLAN\` with one Primary, only independently matched Add-ons, exact Skill URIs, structured NOW/THEN, and at least four detailed Actions. Use resource-only load batches and waits; then emit byte-0 \`WORKFLOW READY\` + rebased detailed TODO only and wait before project tools. ${executionHandoff}`,
    'AUTHORITY: this reminder selects no workflow, Skill, Agent, or fork width and creates no runtime gate, router, retry, permission, or completion control. Main selects from the loaded index and current native state; OMP owns tools, permissions, delegation, and completion.',
  ].join('\n');
}

function buildStagedCompatibilityReminder({
  compatibilityModel = '',
  hasVisibleSkills = false,
  hasWorkflowSkill = false,
  workflowIndexSupplied = false,
  hasNativeTask = false,
  subagentsAllowed = true,
  implementationDelegationAllowed = true,
  taskDescriptor = {},
} = {}) {
  const sections = [];
  const features = [];
  const protocolLabel = compatibilityModel === 'mimo-v2.5'
    ? 'MIMO_SOFT_PROTOCOL'
    : 'DEEPSEEK_SOFT_PROTOCOL';
  const workflowEntryLabel = compatibilityModel === 'mimo-v2.5'
    ? 'MIMO_WORKFLOW_ENTRY'
    : 'DEEPSEEK_WORKFLOW_ENTRY';
  if (hasWorkflowSkill) {
    sections.push(buildWorkflowEntryReminder(workflowEntryLabel, workflowIndexSupplied, {
      delegationAvailable: hasNativeTask && subagentsAllowed && implementationDelegationAllowed,
    }));
    features.push('skill-discovery', 'workflow-selection');
    if (hasNativeTask && subagentsAllowed && implementationDelegationAllowed) {
      features.push('delegation-decision');
    }
  } else if (hasVisibleSkills) {
    sections.push(`${protocolLabel} (soft one-shot for top-level Main; this reminder selects no workflow or Agent):\n${SKILL_STAGED_REMINDER}`);
    features.push('skill-discovery');
  } else if (hasNativeTask && subagentsAllowed && implementationDelegationAllowed) {
    sections.push(`${protocolLabel} (soft one-shot for top-level Main; this reminder selects no workflow or Agent):\n${TASK_STAGED_REMINDER}`);
  }
  const taskShapePrompt = hasNativeTask && subagentsAllowed
    ? buildTaskShapePrompt(taskDescriptor, { workflowSkillVisible: hasWorkflowSkill })
    : '';
  if (taskShapePrompt) {
    sections.push(taskShapePrompt);
    features.push('task-shape-facts');
  }
  if (hasNativeTask && subagentsAllowed) {
    const reviewBudgetPrompt = buildDynamicReviewBudgetPrompt({
      taskDescriptor,
    });
    const delegationSections = [
      ...(reviewBudgetPrompt ? [reviewBudgetPrompt] : []),
      ...(implementationDelegationAllowed && !hasWorkflowSkill ? [
        DELEGATION_DECISION,
      ] : []),
    ];
    if (delegationSections.length) sections.push(delegationSections.join('\n'));
    if (implementationDelegationAllowed && !features.includes('delegation-decision')) {
      features.push('delegation-decision');
    }
    if (reviewBudgetPrompt) features.push('dynamic-review-budget');
  }
  if (!sections.length) return null;
  return {
    content: sections.join('\n\n'),
    features,
  };
}

function hasActiveNativeTool(pi, toolName) {
  if (typeof pi?.getActiveTools !== 'function') return false;
  try {
    const activeTools = pi.getActiveTools();
    return Array.isArray(activeTools) && activeTools.includes(toolName);
  } catch {
    return false;
  }
}

function hasActiveNativeTask(pi) {
  return hasActiveNativeTool(pi, 'task');
}

function registerEnhancerToolsCommand(pi) {
  if (typeof pi.registerCommand !== 'function') return;
  pi.registerCommand('enhancer-tools', {
    description: 'Explicitly enable, disable, or inspect opt-in OMP Enhancer tools without changing OMP native defaults.',
    async handler(args = '', ctx = {}) {
      const [rawAction = 'status', rawGroup = 'all'] = String(args).trim().toLowerCase().split(/\s+/).filter(Boolean);
      const action = rawAction || 'status';
      const group = rawGroup || 'all';
      const prefixes = enhancerToolPrefixes(group);
      if (!['status', 'enable', 'disable'].includes(action) || !prefixes) {
        await ctx.ui?.notify?.(
          'Usage: /enhancer-tools status | enable <core|config|writing|fact|test|all> | disable <group>',
          'warn',
        );
        return;
      }
      if (typeof pi.getActiveTools !== 'function' || typeof pi.getAllTools !== 'function') {
        await ctx.ui?.notify?.('This OMP runtime does not expose active-tool management.', 'warn');
        return;
      }
      const available = unique(pi.getAllTools()).filter((name) => prefixes.some((prefix) => name.startsWith(prefix)));
      const active = unique(pi.getActiveTools());
      if (action === 'status') {
        const enabled = available.filter((name) => active.includes(name));
        await ctx.ui?.notify?.(
          enabled.length ? `Enabled enhancer tools: ${enabled.join(', ')}` : 'No enhancer tools are enabled.',
          'info',
        );
        return;
      }
      if (typeof pi.setActiveTools !== 'function') {
        await ctx.ui?.notify?.('This OMP runtime cannot change active tools.', 'warn');
        return;
      }
      const next = action === 'enable'
        ? unique([...active, ...available])
        : active.filter((name) => !available.includes(name));
      await pi.setActiveTools(next);
      await ctx.ui?.notify?.(
        `${action === 'enable' ? 'Enabled' : 'Disabled'} ${available.length} ${group} enhancer tool${available.length === 1 ? '' : 's'}.`,
        'info',
      );
    },
  });
}

function enhancerToolPrefixes(group) {
  if (group === 'all') return Object.values(ENHANCER_TOOL_GROUPS).flat();
  return ENHANCER_TOOL_GROUPS[group] ?? null;
}

export function createState() {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    lastTaskContext: null,
    lastPrompt: '',
    taskStartedAt: 0,
    compatibilityReminderTaskStartedAt: 0,
    lastSkillUsage: null,
    lastSubagentUsage: null,
    observedSkills: new Set(),
    claimedSkills: new Set(),
    tasks: new Map(),
    completedAgents: new Set(),
    taskSequence: 0,
    protocolCoach: createWorkflowProtocolCoachState(),
  };
}

function resolveMainTaskContext({ prompt = '' } = {}) {
  const taskDescriptor = describeNaturalLanguageTask({
    prompt: String(prompt ?? ''),
  });
  return buildAgentSelectedTaskContext(taskDescriptor);
}

function buildAgentSelectedTaskContext(taskDescriptor) {
  return {
    intent: 'agent-selected',
    taskDescriptor,
  };
}

function recordTaskDispatch(state, event) {
  const items = taskInputItems(event);
  if (!items.length) return;
  state.taskSequence += 1;
  const id = toolEventCallId(event) || 'task-' + state.taskSequence;
  state.tasks.set(id, {
    id,
    status: 'running',
    roles: items.map(roleName).filter(Boolean),
    summary: items.map((item) => String(item[assignmentKey(item)] ?? '').split(/\r?\n/)[0]).filter(Boolean).join('; '),
    startedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

function recordTaskResult(state, event) {
  const id = toolEventCallId(event);
  const record = id
    ? state.tasks.get(id)
    : [...state.tasks.values()].findLast((item) => item.status === 'running');
  let taskId = id || record?.id;
  if (!taskId) {
    state.taskSequence += 1;
    taskId = 'task-result-' + state.taskSequence;
  }
  const details = event.result?.details ?? event.details ?? {};
  const results = Array.isArray(details.results) ? details.results : [];
  const failed = toolEventFailed(event);
  const pending = toolEventPending(event);
  const status = failed ? 'failed' : pending ? 'running' : 'completed';
  const roles = results.map((item) => roleName(item)).filter(Boolean);
  const effectiveRoles = roles.length ? roles : record?.roles ?? [];
  const task = {
    ...(record ?? {
      id: taskId,
      roles: effectiveRoles,
      startedAt: Date.now(),
    }),
    status,
    roles: effectiveRoles,
    summary: firstText([
      details.summary,
      event.result?.summary,
      extractText(event.result?.content),
      record?.summary,
    ]),
    updatedAt: Date.now(),
  };
  state.tasks.set(task.id, task);
  if (status === 'completed') {
    for (const role of effectiveRoles) state.completedAgents.add(role);
  }
}

function recordSkillReads(state, event) {
  const skill = verifiedSkillReadName(event);
  if (skill) state.observedSkills.add(normalizeSkillName(skill));
}

function verifiedSkillReadName(event = {}) {
  const declaredName = skillFrontmatterName(readResultText(event));
  if (!declaredName) return '';

  if (isEccNestedSkillRead(event)) return declaredName;

  const requestedNames = collectSkillReadNames(event);
  if (!requestedNames.length) return '';
  const requestedTokens = new Set(requestedNames.map(skillEvidenceToken).filter(Boolean));
  const declaredToken = skillEvidenceToken(declaredName);
  if (requestedTokens.has(declaredToken)) return declaredName;

  const inventoryNames = skillReadNameCandidates(declaredName, { limit: 64 });
  return inventoryNames.some((name) => requestedTokens.has(skillEvidenceToken(name)))
    ? declaredName
    : '';
}

function isEccNestedSkillRead(event = {}) {
  const input = event.input ?? event.params ?? event.arguments ?? {};
  const target = [input.path, input.file_path, input.uri, input.value]
    .find((value) => typeof value === 'string');
  return /^skill:\/\/ecc-skill-catalog\/[A-Za-z0-9_.-]+\/SKILL\.md(?:[?#].*)?$/i.test(target ?? '');
}

function readResultText(event = {}) {
  const result = event.result;
  if (typeof result === 'string') return result;
  if (result?.content !== undefined) return readContentText(result.content);
  if (result?.output !== undefined) return readContentText(result.output);
  if (event.content !== undefined) return readContentText(event.content);
  if (event.output !== undefined) return readContentText(event.output);
  return '';
}

function readToolTarget(event = {}) {
  const input = event.input ?? event.params ?? event.arguments ?? {};
  return typeof input.path === 'string' ? input.path.trim() : '';
}

function readContentText(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return '';
  return value
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

function skillFrontmatterName(text = '') {
  const frontmatter = String(text)
    .replace(/^\uFEFF/, '')
    .match(/^\s*---[ \t]*\r?\n([\s\S]*?)\r?\n---(?:[ \t]*\r?\n|\s*$)/);
  if (!frontmatter) return '';
  const match = frontmatter[1].match(/^name\s*:\s*(.*?)\s*$/mi);
  if (!match) return '';
  const value = match[1].trim();
  const unquoted = (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) ? value.slice(1, -1).trim() : value.replace(/\s+#.*$/, '').trim();
  return /^[A-Za-z0-9_.\/-]+$/.test(unquoted) ? unquoted : '';
}

function skillEvidenceToken(value = '') {
  return String(value)
    .trim()
    .replace(/^skill:\/\//i, '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
}

function collectSkillReadNames(event = {}) {
  const input = event.input ?? event.params ?? event.arguments ?? {};
  return unique([
    ...collectSkillUris(input),
    ...collectSkillFilePaths(input),
  ]);
}

function collectSkillUris(value, seen = new Set()) {
  if (typeof value === 'string') {
    return [...value.matchAll(/skill:\/\/([A-Za-z0-9_.\/-]+)/g)].map((match) => match[1]);
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((item) => collectSkillUris(item, seen));
  return Object.entries(value).flatMap(([key, child]) => (
    ['content', 'output', 'result', 'response', 'message', 'text', 'stdout', 'stderr'].includes(key)
      ? []
      : collectSkillUris(child, seen)
  ));
}

function collectSkillFilePaths(value, seen = new Set()) {
  if (typeof value === 'string') {
    const normalized = value.replace(/\\/g, '/').replace(/[?#].*$/, '');
    const match = normalized.match(/(?:^|\/)\s*([^/]+)\/SKILL\.md$/i);
    return match?.[1] ? [match[1]] : [];
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) return value.flatMap((item) => collectSkillFilePaths(item, seen));
  return Object.values(value).flatMap((child) => collectSkillFilePaths(child, seen));
}

function buildObservationStatus(state) {
  const loadedSkills = [...effectiveSkills(state)];
  return {
    selection: state.lastTaskContext?.intent ?? 'none',
    task_descriptor: state.lastTaskContext?.taskDescriptor ?? null,
    observed_skills: [...state.observedSkills],
    effective_skills: loadedSkills,
    claimed_skills: [...state.claimedSkills],
    completed_agents: [...state.completedAgents],
    tasks: [...state.tasks.values()],
    skill_review: state.lastSkillUsage,
    agent_review: state.lastSubagentUsage,
  };
}

function formatObservationStatus(status) {
  return [
    'Selection: ' + status.selection,
    'Observed skills: ' + (status.observed_skills.join(', ') || 'none'),
    'Effective skills: ' + (status.effective_skills.join(', ') || 'none'),
    'Claimed skills: ' + (status.claimed_skills.join(', ') || 'none'),
    'Observed completed Agents:',
    ...(status.completed_agents.length ? status.completed_agents.map((agent) => '- ' + agent) : ['- none']),
    'Observed tasks:',
    ...(status.tasks.length
      ? status.tasks.map((task) => '- ' + task.id + ': ' + task.status + (task.roles.length ? ' (' + task.roles.join(', ') + ')' : ''))
      : ['- none']),
  ].join('\n');
}

function roleName(value) {
  if (typeof value === 'string') return value;
  return value?.agent ?? value?.role ?? value?.name ?? '';
}

function resetState(state) {
  Object.assign(state, createState());
}

function restoreStateFromContext(state, ctx = {}) {
  let entries;
  try {
    entries = ctx.sessionManager?.getBranch?.();
  } catch {
    return false;
  }
  if (!Array.isArray(entries)) return false;
  const entry = entries.findLast((candidate) => (
    candidate?.customType === CORE_STATE_ENTRY
      && (candidate.type === undefined || candidate.type === 'custom')
  ));
  if (!entry?.data || typeof entry.data !== 'object') return false;
  const restored = readStateSnapshot(entry.data);
  Object.assign(state, restored);
  return true;
}

function readStateSnapshot(value = {}) {
  const state = createState();
  if (value.schemaVersion !== STATE_SCHEMA_VERSION) return state;
  state.lastPrompt = typeof value.lastPrompt === 'string' ? value.lastPrompt : '';
  state.taskStartedAt = Number.isFinite(value.taskStartedAt) ? value.taskStartedAt : 0;
  state.compatibilityReminderTaskStartedAt = Number.isFinite(value.compatibilityReminderTaskStartedAt)
    ? value.compatibilityReminderTaskStartedAt
    : 0;
  state.lastTaskContext = sanitizeTaskContext(value.lastTaskContext, state.lastPrompt);
  state.lastSkillUsage = isRecord(value.lastSkillUsage) ? value.lastSkillUsage : null;
  state.lastSubagentUsage = isRecord(value.lastSubagentUsage) ? value.lastSubagentUsage : null;

  for (const skill of arrayValue(value.observedSkills)) {
    if (typeof skill === 'string') state.observedSkills.add(normalizeSkillName(skill));
  }
  for (const skill of arrayValue(value.claimedSkills)) {
    if (typeof skill === 'string') state.claimedSkills.add(normalizeSkillName(skill));
  }
  for (const raw of arrayValue(value.tasks)) {
    const task = sanitizeTaskRecord(raw);
    if (task) state.tasks.set(task.id, task);
  }
  for (const agent of arrayValue(value.completedAgents)) {
    if (typeof agent === 'string' && agent) state.completedAgents.add(agent);
  }
  state.taskSequence = Number.isInteger(value.taskSequence) && value.taskSequence >= 0
    ? value.taskSequence
    : state.tasks.size;
  state.protocolCoach = sanitizeWorkflowProtocolCoachState(value.protocolCoach);
  return state;
}

function sanitizeTaskContext(value, prompt = '') {
  if (!isRecord(value)) return null;
  const taskDescriptor = isRecord(value.taskDescriptor)
    ? value.taskDescriptor
    : describeNaturalLanguageTask({ prompt: String(prompt ?? '') });
  return buildAgentSelectedTaskContext(taskDescriptor);
}

function sanitizeTaskRecord(value) {
  if (!isRecord(value)) return null;
  const id = String(value.id ?? value.key ?? '').trim();
  if (!id) return null;
  const status = ['running', 'completed', 'failed'].includes(value.status)
    ? value.status
    : 'completed';
  return {
    id,
    status,
    roles: Array.isArray(value.roles) ? value.roles.filter((role) => typeof role === 'string') : [],
    summary: String(value.summary ?? value.text ?? '').slice(0, 1000),
    startedAt: Number.isFinite(value.startedAt) ? value.startedAt : 0,
    updatedAt: Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
  };
}

async function persistState(pi, state) {
  if (typeof pi.appendEntry !== 'function') return;
  try {
    await pi.appendEntry(CORE_STATE_ENTRY, serializeState(state));
  } catch {
    // Advisory state is optional. Persistence failure must not affect the host
    // task or any tool result.
  }
}

function serializeState(state) {
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    lastTaskContext: state.lastTaskContext,
    lastPrompt: state.lastPrompt,
    taskStartedAt: state.taskStartedAt,
    compatibilityReminderTaskStartedAt: state.compatibilityReminderTaskStartedAt,
    lastSkillUsage: state.lastSkillUsage,
    lastSubagentUsage: state.lastSubagentUsage,
    observedSkills: [...state.observedSkills],
    claimedSkills: [...state.claimedSkills],
    tasks: [...state.tasks.values()],
    completedAgents: [...state.completedAgents],
    taskSequence: state.taskSequence,
    protocolCoach: serializeWorkflowProtocolCoachState(state.protocolCoach),
  };
}

function activeSkillInventory(pi) {
  if (typeof pi?.pi?.getActiveSkills !== 'function') return [];
  try {
    const skills = pi.pi.getActiveSkills();
    return Array.isArray(skills) ? skills.filter(isModelVisibleSkill) : [];
  } catch {
    return [];
  }
}

function hasSuppliedNativeSkillPrompt(event = {}, ctx = {}, expectedName = '') {
  let branch = [];
  try {
    const candidateBranch = ctx.sessionManager?.getBranch?.();
    if (Array.isArray(candidateBranch)) branch = currentTurnBranch(candidateBranch);
  } catch {
    branch = [];
  }
  const eventMessages = Array.isArray(event.messages)
    ? currentTurnBranch(event.messages)
    : [];
  const candidates = [
    ...eventMessages,
    event.message,
    event.skillPrompt,
    ...branch,
  ].filter(Boolean);
  return candidates.some((candidate) => nativeSkillPromptNames(candidate).some((name) => (
    skillNamesEquivalent(name, expectedName)
  )));
}

function nativeSkillPromptNames(candidate = {}) {
  const layers = [candidate, candidate.message, candidate.entry, candidate.data]
    .filter((value) => value && typeof value === 'object');
  const isNativeSkillPrompt = layers.some((value) => (
    String(value.customType ?? value.custom_type ?? '').trim() === 'skill-prompt'
  ));
  if (!isNativeSkillPrompt) return [];
  if (!layers.some((value) => extractText(value.content).trim())) return [];
  if (layers.some((value) => (
    value?.details?.provisionProvider === 'omp-enhancer-core'
  ))) return [];

  const names = [];
  for (const value of layers) {
    const details = value.details && typeof value.details === 'object'
      ? value.details
      : {};
    names.push(details.name, details.requestedSkill);
    if (Array.isArray(details.routedSkills)) names.push(...details.routedSkills);
    if (Array.isArray(details.providedSkillRecords)) {
      for (const record of details.providedSkillRecords) {
        names.push(record?.name, record?.requestedSkill);
      }
    }
  }
  return names.filter((name) => typeof name === 'string' && name.trim());
}

function currentTurnBranch(branch = []) {
  const lastAssistantIndex = branch.findLastIndex((candidate) => {
    const layers = [candidate, candidate?.message, candidate?.entry, candidate?.data]
      .filter((value) => value && typeof value === 'object');
    return layers.some((value) => value.role === 'assistant');
  });
  return lastAssistantIndex >= 0 ? branch.slice(lastAssistantIndex + 1) : branch;
}

function isModelVisibleSkill(skill = {}) {
  return skill.disableModelInvocation !== true
    && skill.hide !== true
    && skill.hidden !== true
    && skill.hideFromModel !== true
    && skill.modelInvocationDisabled !== true;
}

function effectiveSkills(state) {
  return new Set(state.observedSkills);
}

function shouldInheritContinuation(state, prompt = '') {
  if (!state.lastTaskContext || !state.lastPrompt) return false;
  const text = String(prompt ?? '')
    .trim()
    .toLowerCase()
    .replace(/[。！？.!?]+$/u, '')
    .replace(/^(?:please\s+|请\s*|麻烦\s*)/u, '');
  return /^(?:继续(?:吧|执行|实现|修复|开发)?|开始吧|开始(?:执行|实现|修复|开发)(?:吧)?|按(?:照)?(?:这个|该|上述)?计划执行|照(?:这个|该|上述)?方案做|就(?:按)?这么做|执行吧|go ahead|continue|proceed(?: with (?:the|this) plan)?|start now|do it)$/i.test(text);
}

function isPlanningImplementationTransition(state, prompt = '') {
  if (!state.lastTaskContext || !state.lastPrompt) return false;
  if (!shouldInheritContinuation(state, prompt)) return false;
  const taskContext = state.lastTaskContext;
  const planning = taskContext.taskDescriptor?.provenance?.reasons?.includes('implementation or test planning requested');
  if (!planning) return false;
  const next = describeNaturalLanguageTask({ prompt: String(prompt ?? '') });
  return ['modify', 'create'].includes(next.operation)
    && next.constraints?.workspaceWrite === 'required';
}

function isSlashCommandPrompt(prompt) {
  return /^\/[A-Za-z][A-Za-z0-9:_-]*(?:\s|$)/.test(String(prompt ?? '').trim());
}

function isSubagentSession(ctx = {}) {
  try {
    const entries = ctx.sessionManager?.getEntries?.();
    return Array.isArray(entries) && entries.some((entry) => entry?.type === 'session_init');
  } catch {
    return false;
  }
}

function isSubagentLaunchPrompt(prompt) {
  return /OMP_PARENT_ASSIGNMENT_CONTEXT:|OMP_WORKFLOW_ROLE:|OMP_REQUIRED_SUBAGENT:|Suggested skills for this role:|Required skills for this subagent:/i.test(String(prompt));
}

function taskInputItems(event = {}) {
  const input = event.input ?? event.params ?? event.arguments ?? {};
  if (Array.isArray(input.tasks)) return input.tasks.filter(isRecord);
  return isRecord(input) && ['assignment', 'prompt', 'task', 'message'].some((key) => typeof input[key] === 'string') ? [input] : [];
}

function assignmentKey(item) {
  for (const key of ['assignment', 'prompt', 'task', 'message']) {
    if (typeof item?.[key] === 'string') return key;
  }
  return 'assignment';
}

function toolEventName(event = {}) {
  return event.name ?? event.toolName ?? event.details?.toolName ?? event.tool?.name ?? '';
}

function toolEventCallId(event = {}) {
  const value = event.callId
    ?? event.call_id
    ?? event.toolCallId
    ?? event.tool_call_id
    ?? event.id
    ?? event.details?.callId
    ?? event.details?.toolCallId;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function toolEventFailed(event = {}) {
  const status = String(
    event.status
      ?? event.result?.status
      ?? event.details?.status
      ?? '',
  ).toLowerCase();
  return event.isError === true
    || event.result?.isError === true
    || event.error != null
    || ['failed', 'failure', 'error', 'aborted', 'cancelled', 'canceled'].includes(status);
}

function toolEventPending(event = {}) {
  const status = String(
    event.status
      ?? event.result?.status
      ?? event.details?.status
      ?? event.details?.async?.state
      ?? '',
  ).toLowerCase();
  return ['pending', 'running', 'started', 'in_progress', 'in-progress'].includes(status);
}

function extractPrompt(event = {}) {
  return String(event.prompt ?? event.userPrompt ?? event.message ?? event.task ?? '');
}

function visibleAssistantText(message = {}) {
  if (typeof message.content === 'string') return message.content;
  if (!Array.isArray(message.content)) return '';
  return message.content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n');
}

function assistantMessageSucceeded(message = {}) {
  if (message.errorMessage || message.error) return false;
  const stopReason = String(message.stopReason ?? message.stop_reason ?? '').trim().toLowerCase();
  return !['error', 'aborted', 'cancelled', 'canceled'].includes(stopReason);
}

function extractText(value, seen = new Set()) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || seen.has(value)) return '';
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => extractText(item, seen)).filter(Boolean).join('\n');
  return Object.values(value).map((item) => extractText(item, seen)).filter(Boolean).join('\n');
}

function firstText(values = []) {
  return values.find((value) => typeof value === 'string' && value.trim())?.trim().slice(0, 1000) ?? '';
}

function skillCoverageReview(validation, suggestedSkills = [], { claimedSkills = [] } = {}) {
  const gaps = unique([
    ...(validation.missing ?? []),
    ...(validation.invalid ?? []),
    ...(validation.denied ?? []),
  ]);
  const observed = unique(validation.loaded ?? []);
  const claimed = unique([...claimedSkills]);
  const unobservedClaims = claimed.filter((claim) => (
    !observed.some((skill) => skillNamesEquivalent(claim, skill))
  ));
  return {
    advisory: true,
    complete: gaps.length === 0,
    suggested: unique(suggestedSkills),
    observed,
    claimed,
    unobservedClaims,
    gaps,
    summary: gaps.length
      ? 'Advisory skill coverage gaps: ' + gaps.join(', ') + '. Continue with the best available method and report material limitations.'
      : 'Advisory skill coverage: the suggested skills were observed or none were suggested.',
  };
}

function roleCoverageReview(validation, suggestedRoles = []) {
  const missingSkillObservations = (validation.missingSkills ?? []).map(({ agent, skills }) => ({
    agent,
    skills: unique(skills),
  }));
  const missingRoles = unique(validation.missing ?? []);
  return {
    advisory: true,
    complete: missingRoles.length === 0 && missingSkillObservations.length === 0,
    suggested: suggestedRoles.map(roleName).filter(Boolean),
    observed: unique(validation.forked ?? []),
    gaps: {
      roles: missingRoles,
      skills: missingSkillObservations,
    },
    summary: missingRoles.length || missingSkillObservations.length
      ? 'Advisory role coverage has unobserved suggestions. Follow the selected workflow soft default and current native constraints; these observations do not control delegation or completion.'
      : 'Advisory role coverage: the suggested roles were observed or none were suggested.',
  };
}

function okResult(text, details = {}) {
  return {
    content: [{ type: 'text', text: String(text) }],
    details,
    isError: false,
  };
}

function arrayValue(...values) {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unique(values = []) {
  return [...new Set((values ?? []).filter(Boolean))];
}
