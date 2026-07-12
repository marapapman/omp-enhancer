const ROUTER_MODES = new Set(['legacy', 'observe', 'enforce']);

// Kept for route-projection compatibility during the advisory migration.
// These values choose which route metadata is projected; none of them can
// block a tool call or continue a stopped session.
export function readRuntimePolicy(env = process.env) {
  return {
    routerMode: normalizeMode(env?.OMP_ROUTER_V2_MODE, ROUTER_MODES, 'observe'),
  };
}

export function resolveRouterMode(value, env = process.env) {
  return normalizeMode(value, ROUTER_MODES, readRuntimePolicy(env).routerMode);
}

function normalizeMode(value, allowed, fallback) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}
