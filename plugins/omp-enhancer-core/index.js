import { buildGovernancePromptFragment, buildMissingGateContext, buildSubagentPromptFragment } from './src/governance.js';
import { routeNaturalLanguageTask } from './src/router.js';
import { validateSkillUsage } from './src/skill-usage.js';
import { collectSubagentTaskRecords, validateSubagentUsage } from './src/subagent-usage.js';
import { buildClassifierPrompt, resolveClassificationRoute } from './src/classifier.js';
import { runClassifierCommand } from './src/classifier-config.js';

const CORE_STATE_ENTRY = 'omp-enhancer-core.state';

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
      setRouteState(state, route);
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
      setRouteState(state, result.route);
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
      const validation = validateSkillUsage({ requiredSkills, output: params.output ?? '' });
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
      await persistState(pi, state);
      return okResult(validation.message, { validation });
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
      const fragment = buildGovernancePromptFragment({ route });
      if (params.prompt && route) {
        setRouteState(state, route);
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

  pi.on?.('before_agent_start', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    const prompt = extractPrompt(event);
    if (isInternalCoreContinuation(prompt)) return undefined;
    if (isSubagentLaunchPrompt(prompt)) {
      const fragment = buildSubagentPromptFragment({ prompt });
      if (event.systemPrompt) event.systemPrompt = `${event.systemPrompt}\n\n${fragment}`;
      else event.additionalContext = [event.additionalContext, fragment].filter(Boolean).join('\n\n');
      return { additionalContext: fragment, route: { intent: 'subagent', agent: null, requiredSkills: [], requiredTools: [], requiredSubagents: [] } };
    }
    const route = routeNaturalLanguageTask({ prompt });
    setRouteState(state, route);
    await persistState(pi, state);
    const fragment = buildGovernancePromptFragment({ route });
    if (event.systemPrompt) event.systemPrompt = `${event.systemPrompt}\n\n${fragment}`;
    else event.additionalContext = [event.additionalContext, fragment].filter(Boolean).join('\n\n');
    return { additionalContext: fragment, route };
  });

  pi.on?.('tool_call', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    const name = event.name ?? event.toolName;
    if (name === 'task') recordSubagentEvidence(state, event);
    await persistState(pi, state);
    return undefined;
  });

  pi.on?.('tool_result', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    const name = event.name ?? event.toolName;
    if (name === 'writing_quality_check' || name === 'writing_logic_check') state.evidence.writingQuality = true;
    if (name === 'omp_test_gate') state.evidence.testingGate = true;
    if (name === 'omp_test_report') state.evidence.testingReport = true;
    if (name === 'task') recordSubagentEvidence(state, event);
    await persistState(pi, state);
    return undefined;
  });

  pi.on?.('session_stop', async (event = {}, ctx = {}) => {
    restoreStateFromContext(state, ctx);
    recordFinalOutputEvidence(state, event);
    await persistState(pi, state);

    const missingSubagentContext = buildMissingSubagentUsageContext(state);
    if (missingSubagentContext) return { continue: true, additionalContext: missingSubagentContext };

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
    lastSkillUsage: null,
    lastSubagentUsage: null,
    evidence: emptyEvidence(),
  };
}

function emptyEvidence() {
  return {
    writingQuality: false,
    writingLogic: false,
    testingGate: false,
    testingReport: false,
    taskToolCalls: 0,
    forkedSubagents: new Set(),
    subagentSkills: new Map(),
    unexpectedSubagentSkills: new Map(),
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

function setRouteState(state, route) {
  state.lastRoute = route;
  state.lastSkillUsage = null;
  state.lastSubagentUsage = null;
  state.evidence = emptyEvidence();
}

function resetState(state) {
  state.lastRoute = null;
  state.lastSkillUsage = null;
  state.lastSubagentUsage = null;
  state.evidence = emptyEvidence();
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
  replaceState(state, restored);
  return true;
}

function restoreStateFromEntries(entries) {
  let restored = null;
  for (const entry of entries) {
    if (!isCoreStateEntry(entry)) continue;
    const snapshot = readStateSnapshot(entry.data);
    if (snapshot) restored = snapshot;
  }
  return restored;
}

function isCoreStateEntry(entry) {
  return entry?.customType === CORE_STATE_ENTRY
    && (entry.type === undefined || entry.type === 'custom');
}

function replaceState(target, source) {
  target.lastRoute = source.lastRoute;
  target.lastSkillUsage = source.lastSkillUsage;
  target.lastSubagentUsage = source.lastSubagentUsage;
  target.evidence = source.evidence;
}

function serializeState(state) {
  return {
    lastRoute: state.lastRoute,
    lastSkillUsage: state.lastSkillUsage,
    lastSubagentUsage: state.lastSubagentUsage,
    evidence: {
      writingQuality: state.evidence.writingQuality,
      writingLogic: state.evidence.writingLogic,
      testingGate: state.evidence.testingGate,
      testingReport: state.evidence.testingReport,
      taskToolCalls: state.evidence.taskToolCalls,
      forkedSubagents: [...state.evidence.forkedSubagents],
      subagentSkills: [...state.evidence.subagentSkills.entries()].map(([agent, skills]) => ({
        agent,
        skills: [...skills],
      })),
      unexpectedSubagentSkills: [...state.evidence.unexpectedSubagentSkills.entries()].map(([agent, skills]) => ({
        agent,
        skills: [...skills],
      })),
    },
  };
}

function readStateSnapshot(value) {
  if (!isRecord(value)) return null;
  const evidence = readEvidenceSnapshot(value.evidence);
  if (!evidence) return null;
  return {
    lastRoute: isRecord(value.lastRoute) ? value.lastRoute : null,
    lastSkillUsage: isRecord(value.lastSkillUsage) ? value.lastSkillUsage : null,
    lastSubagentUsage: isRecord(value.lastSubagentUsage) ? value.lastSubagentUsage : null,
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
    forkedSubagents: new Set(Array.isArray(value.forkedSubagents) ? value.forkedSubagents.filter(isString) : []),
    subagentSkills: readSubagentSkills(value.subagentSkills),
    unexpectedSubagentSkills: readSubagentSkills(value.unexpectedSubagentSkills),
  };
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

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value) {
  return typeof value === 'string';
}

function extractPrompt(event) {
  return String(event.prompt ?? event.userPrompt ?? event.message ?? event.task ?? '');
}

function isInternalCoreContinuation(prompt) {
  return prompt.includes('OMP Enhancer Core')
    && prompt.includes('gate is still open');
}

function isSubagentLaunchPrompt(prompt) {
  return /OMP_REQUIRED_SUBAGENT:/i.test(prompt)
    || /Required skills for this subagent:/i.test(prompt);
}

function buildMissingSkillUsageContext(state) {
  const requiredSkills = state.lastRoute?.requiredSkills ?? [];
  if (!requiredSkills.length) return null;
  if (state.lastSkillUsage?.ok) return null;

  return [
    'OMP Enhancer Core skill gate is still open.',
    `Validate SKILL_USAGE before finishing. Required skills: ${requiredSkills.join(', ')}.`,
    'If your previous final response already included SKILL_USAGE, call omp_core_validate_skill_usage with output set to that full response text. Do not only say the evidence was already provided.',
    state.lastSkillUsage?.message ? `Last validation: ${state.lastSkillUsage.message}` : 'No successful SKILL_USAGE validation has been recorded.',
  ].join('\n');
}

function recordFinalOutputEvidence(state, event = {}) {
  const output = extractFinalOutputText(event);
  if (!output) return;

  const requiredSkills = state.lastRoute?.requiredSkills ?? [];
  if (requiredSkills.length && !state.lastSkillUsage?.ok && /\bSKILL_USAGE\b/i.test(output)) {
    state.lastSkillUsage = validateSkillUsage({ requiredSkills, output });
  }

  const requiredSubagents = subagentRequirements(state.lastRoute?.requiredSubagents);
  if (requiredSubagents.length && !state.lastSubagentUsage?.ok && /\bSUBAGENT_USAGE\b/i.test(output)) {
    state.lastSubagentUsage = validateSubagentUsage({ requiredSubagents, output });
  }
}

function extractFinalOutputText(event = {}) {
  const candidates = [
    event.output,
    event.response,
    event.text,
    event.message,
    event.assistantMessage,
    event.assistantResponse,
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
  if (state.lastSubagentUsage?.ok) return null;

  const forked = state.evidence.forkedSubagents;
  const missing = requiredSubagents.map(({ agent }) => agent).filter((agent) => !forked.has(agent));
  const missingSkillAssignments = requiredSubagents.flatMap(({ agent, requiredSkills }) => {
    const recorded = state.evidence.subagentSkills.get(agent) ?? new Set();
    const missingSkills = requiredSkills.filter((skill) => !recorded.has(skill));
    return missingSkills.length ? [{ agent, skills: missingSkills }] : [];
  });
  const unexpectedSkillAssignments = requiredSubagents.flatMap(({ agent }) => {
    const unexpected = [...(state.evidence.unexpectedSubagentSkills.get(agent) ?? new Set())];
    return unexpected.length ? [{ agent, skills: unexpected }] : [];
  });

  if (!missing.length && !missingSkillAssignments.length && !unexpectedSkillAssignments.length) return null;

  return [
    'OMP Enhancer Core subagent gate is still open.',
    'Fork the required roles with the task tool before doing or finishing routed work, and include each role-specific skill list in the task prompt.',
    `Required subagents: ${formatRequiredSubagents(requiredSubagents)}.`,
    missing.length ? `Missing subagents: ${missing.join(', ')}.` : null,
    missingSkillAssignments.length ? `Missing subagent skill assignments: ${formatMissingSkillAssignments(missingSkillAssignments)}.` : null,
    unexpectedSkillAssignments.length ? `Unexpected subagent skill assignments: ${formatMissingSkillAssignments(unexpectedSkillAssignments)}.` : null,
    state.lastSubagentUsage?.message
      ? `Last validation: ${state.lastSubagentUsage.message}`
      : 'No successful SUBAGENT_USAGE validation or task-tool role evidence has been recorded.',
  ].filter(Boolean).join('\n');
}

function recordSubagentEvidence(state, event) {
  state.evidence.taskToolCalls += 1;
  const requiredByAgent = new Map(subagentRequirements(state.lastRoute?.requiredSubagents).map((item) => [item.agent, item.requiredSkills]));

  for (const { agent, text, skills = [] } of collectSubagentTaskRecords(event)) {
    state.evidence.forkedSubagents.add(agent);
    const requiredSkills = requiredByAgent.get(agent) ?? [];
    const unexpectedSkills = skills.filter((skill) => !requiredSkills.includes(skill));
    if (unexpectedSkills.length) {
      const recordedUnexpected = state.evidence.unexpectedSubagentSkills.get(agent) ?? new Set();
      for (const skill of unexpectedSkills) recordedUnexpected.add(skill);
      state.evidence.unexpectedSubagentSkills.set(agent, recordedUnexpected);
    }
    if (!requiredSkills.length) continue;

    const recorded = state.evidence.subagentSkills.get(agent) ?? new Set();
    for (const skill of requiredSkills) {
      if (text.includes(skill)) recorded.add(skill);
    }
    state.evidence.subagentSkills.set(agent, recorded);
  }
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
