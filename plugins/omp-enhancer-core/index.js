import { buildGovernancePromptFragment, buildMissingGateContext } from './src/governance.js';
import { routeNaturalLanguageTask } from './src/router.js';
import { validateSkillUsage } from './src/skill-usage.js';

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

  pi.on?.('tool_result', async (event = {}) => {
    const name = event.name ?? event.toolName;
    if (name === 'writing_quality_check' || name === 'writing_logic_check') state.evidence.writingQuality = true;
    if (name === 'omp_test_gate') state.evidence.testingGate = true;
    if (name === 'omp_test_report') state.evidence.testingReport = true;
    return undefined;
  });

  pi.on?.('session_stop', async () => {
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
    evidence: emptyEvidence(),
  };
}

function emptyEvidence() {
  return {
    writingQuality: false,
    writingLogic: false,
    testingGate: false,
    testingReport: false,
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
  ].join('\n');
}

function setRouteState(state, route) {
  state.lastRoute = route;
  state.lastSkillUsage = null;
  state.evidence = emptyEvidence();
}

function extractPrompt(event) {
  return String(event.prompt ?? event.userPrompt ?? event.message ?? event.task ?? '');
}

function isInternalCoreContinuation(prompt) {
  return prompt.includes('OMP Enhancer Core gate is still open')
    || prompt.includes('OMP Enhancer Core skill gate is still open');
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
