import { buildGovernancePromptFragment, buildMissingGateContext } from './src/governance.js';
import { routeNaturalLanguageTask } from './src/router.js';
import { validateSkillUsage } from './src/skill-usage.js';
import { collectSubagentTaskRecords, validateSubagentUsage } from './src/subagent-usage.js';

export default function registerCoreEnhancer(pi) {
  const state = createState();
  const z = pi.zod?.z ?? pi.z;

  pi.setLabel?.('OMP Enhancer Core');

  pi.registerTool({
    name: 'omp_core_route_task',
    label: 'Route OMP task',
    description: 'Classify a natural-language task and return the required OMP enhancer route, skills, tools, and agent.',
    parameters: z?.object ? z.object({ prompt: z.string() }) : undefined,
    execute: async (_callId, params = {}) => {
      const route = routeNaturalLanguageTask({ prompt: params.prompt });
      setRouteState(state, route);
      return okResult(formatRoute(route), { route });
    },
  });

  pi.registerTool({
    name: 'omp_core_validate_skill_usage',
    label: 'Validate routed skill usage',
    description: 'Validate that a routed agent output includes SKILL_USAGE with all required skills loaded.',
    parameters: z?.object ? z.object({ output: z.string(), requiredSkills: z.array(z.string()).optional() }) : undefined,
    execute: async (_callId, params = {}) => {
      const requiredSkills = params.requiredSkills ?? state.lastRoute?.requiredSkills ?? [];
      const validation = validateSkillUsage({ requiredSkills, output: params.output ?? '' });
      state.lastSkillUsage = validation;
      return okResult(validation.message, { validation });
    },
  });

  pi.registerTool({
    name: 'omp_core_validate_subagent_usage',
    label: 'Validate routed subagent usage',
    description: 'Validate that a routed agent output includes SUBAGENT_USAGE with all required subagents forked.',
    parameters: z?.object ? z.object({ output: z.string(), requiredSubagents: z.array(z.string()).optional() }) : undefined,
    execute: async (_callId, params = {}) => {
      const requiredSubagents = params.requiredSubagents ?? state.lastRoute?.requiredSubagents ?? [];
      const validation = validateSubagentUsage({ requiredSubagents, output: params.output ?? '' });
      state.lastSubagentUsage = validation;
      return okResult(validation.message, { validation });
    },
  });

  pi.registerTool({
    name: 'omp_core_governance_prompt',
    label: 'Build governance prompt',
    description: 'Build the governance prompt fragment for a natural-language OMP enhancer route.',
    parameters: z?.object ? z.object({ prompt: z.string().optional() }) : undefined,
    execute: async (_callId, params = {}) => {
      const route = params.prompt ? routeNaturalLanguageTask({ prompt: params.prompt }) : state.lastRoute;
      const fragment = buildGovernancePromptFragment({ route });
      if (params.prompt && route) setRouteState(state, route);
      return okResult(fragment, { route, fragment });
    },
  });

  pi.on?.('session_start', async () => {
    state.lastRoute = null;
    state.lastSkillUsage = null;
    state.lastSubagentUsage = null;
    state.evidence = emptyEvidence();
    return undefined;
  });

  pi.on?.('before_agent_start', async (event = {}) => {
    const prompt = extractPrompt(event);
    if (isInternalCoreContinuation(prompt)) return undefined;
    const route = routeNaturalLanguageTask({ prompt });
    setRouteState(state, route);
    const fragment = buildGovernancePromptFragment({ route });
    if (event.systemPrompt) event.systemPrompt = `${event.systemPrompt}\n\n${fragment}`;
    else event.additionalContext = [event.additionalContext, fragment].filter(Boolean).join('\n\n');
    return { additionalContext: fragment, route };
  });

  pi.on?.('tool_call', async (event = {}) => {
    const name = event.name ?? event.toolName;
    if (name === 'task') recordSubagentEvidence(state, event);
    return undefined;
  });

  pi.on?.('tool_result', async (event = {}) => {
    const name = event.name ?? event.toolName;
    if (name === 'writing_quality_check' || name === 'writing_logic_check') state.evidence.writingQuality = true;
    if (name === 'omp_test_gate') state.evidence.testingGate = true;
    if (name === 'omp_test_report') state.evidence.testingReport = true;
    if (name === 'task') recordSubagentEvidence(state, event);
    return undefined;
  });

  pi.on?.('session_stop', async () => {
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

function extractPrompt(event) {
  return String(event.prompt ?? event.userPrompt ?? event.message ?? event.task ?? '');
}

function isInternalCoreContinuation(prompt) {
  return prompt.includes('OMP Enhancer Core')
    && prompt.includes('gate is still open');
}

function buildMissingSkillUsageContext(state) {
  const requiredSkills = state.lastRoute?.requiredSkills ?? [];
  if (!requiredSkills.length) return null;
  if (state.lastSkillUsage?.ok) return null;

  return [
    'OMP Enhancer Core skill gate is still open.',
    `Validate SKILL_USAGE before finishing. Required skills: ${requiredSkills.join(', ')}.`,
    state.lastSkillUsage?.message ? `Last validation: ${state.lastSkillUsage.message}` : 'No successful SKILL_USAGE validation has been recorded.',
  ].join('\n');
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

  if (!missing.length && !missingSkillAssignments.length) return null;

  return [
    'OMP Enhancer Core subagent gate is still open.',
    'Fork the required roles with the task tool before doing or finishing routed work, and include each role-specific skill list in the task prompt.',
    `Required subagents: ${formatRequiredSubagents(requiredSubagents)}.`,
    missing.length ? `Missing subagents: ${missing.join(', ')}.` : null,
    missingSkillAssignments.length ? `Missing subagent skill assignments: ${formatMissingSkillAssignments(missingSkillAssignments)}.` : null,
    state.lastSubagentUsage?.message
      ? `Last validation: ${state.lastSubagentUsage.message}`
      : 'No successful SUBAGENT_USAGE validation or task-tool role evidence has been recorded.',
  ].filter(Boolean).join('\n');
}

function recordSubagentEvidence(state, event) {
  state.evidence.taskToolCalls += 1;
  const requiredByAgent = new Map(subagentRequirements(state.lastRoute?.requiredSubagents).map((item) => [item.agent, item.requiredSkills]));

  for (const { agent, text } of collectSubagentTaskRecords(event)) {
    state.evidence.forkedSubagents.add(agent);
    const requiredSkills = requiredByAgent.get(agent) ?? [];
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
