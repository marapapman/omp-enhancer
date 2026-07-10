const ROUTER_MODES = new Set(['legacy', 'observe', 'enforce']);
const GATE_MODES = new Set(['legacy', 'observe', 'enforce']);
const LOOP_MODES = new Set(['legacy', 'observe', 'enforce', 'disabled']);

export function readRuntimePolicy(env = process.env) {
  return {
    routerMode: normalizeMode(env?.OMP_ROUTER_V2_MODE, ROUTER_MODES, 'observe'),
    gateMode: normalizeMode(env?.OMP_GATE_RECOVERY_MODE, GATE_MODES, 'observe'),
    loopMode: normalizeMode(env?.OMP_LOOP_GUARD_MODE, LOOP_MODES, 'legacy'),
    unsafeGatePrompts: env?.OMP_DEBUG_GATES_UNSAFE_PROMPTS === '1',
  };
}

export function resolveRouterMode(value, env = process.env) {
  return normalizeMode(value, ROUTER_MODES, readRuntimePolicy(env).routerMode);
}

export function resolveGateMode(value, env = process.env) {
  return normalizeMode(value, GATE_MODES, readRuntimePolicy(env).gateMode);
}

export function useEnforcedRoutePlan(route, env = process.env) {
  return Boolean(route?.routePlan)
    && resolveGateMode(route?.gateRecoveryMode, env) === 'enforce';
}

function normalizeMode(value, allowed, fallback) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}
