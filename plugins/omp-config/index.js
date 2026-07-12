import { runConfigDoctor } from './src/doctor.js';
import { listAssets } from './src/asset-index.js';
import { formatDoctorReport, formatPlanReport } from './src/report.js';
import { resolvePluginRoot } from './src/plugin-root.js';

function textContent(text) {
  return { type: 'text', text };
}

function paramsOrEmpty(params) {
  if (params && typeof params === 'object') return params;
  return {};
}

function pluginRootFromParams(params, ctx) {
  const input = paramsOrEmpty(params);
  if (typeof input.root === 'string' && input.root.trim() !== '') return input.root;
  if (typeof ctx?.cwd === 'string' && ctx.cwd.trim() !== '') return ctx.cwd;
  return process.cwd();
}

export { runConfigDoctor } from './src/doctor.js';
export { listAssets } from './src/asset-index.js';

export async function runConfigPlan(input = {}) {
  const root = typeof input.root === 'string' && input.root.trim() !== '' ? input.root : process.cwd();
  const pluginRoot = await resolvePluginRoot(root);
  const plan = [
    `Review packaged templates under ${pluginRoot}/assets.`,
    'Compare assets/config.yml, assets/models.yml, assets/mcp.json, and assets/WATCHDOG.yml with the target OMP home.',
    'Compare bundled agents and skills with the target installation.',
    'Prepare a patch for explicit user review before copying or overwriting any live config files.',
  ];
  return { ok: true, plan };
}

function optionalStringParameters(z) {
  if (typeof z.optional === 'function') {
    return z.object({ root: z.optional(z.string()) });
  }
  return z.object({ root: z.string().optional() });
}

function registerCommandIfAvailable(omp, name, description, runner) {
  if (typeof omp.registerCommand !== 'function') return;
  omp.registerCommand(name, {
    description,
    async handler(args) {
      const root = typeof args === 'string' && args.trim() !== '' ? args.trim() : undefined;
      return runner(root ? { root } : {});
    },
  });
}

export default function registerOmpConfig(pi) {
  const z = pi.zod.z;
  const parameters = optionalStringParameters(z);
  pi.setLabel?.('OMP Config');

  pi.registerTool({
    name: 'omp_config_doctor',
    label: 'OMP Config Doctor',
    description: 'Inspect packaged OMP config assets and report portability risks.',
    parameters,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await runConfigDoctor(pluginRootFromParams(params, ctx));
      return {
        content: [textContent(formatDoctorReport(result))],
        details: result,
        isError: false,
      };
    },
  });

  pi.registerTool({
    name: 'omp_config_assets',
    label: 'OMP Config Assets',
    description: 'List packaged OMP config agents, skills, hooks, and templates.',
    parameters,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await listAssets(pluginRootFromParams(params, ctx));
      return {
        content: [textContent(JSON.stringify(result, null, 2))],
        details: result,
        isError: false,
      };
    },
  });

  pi.registerTool({
    name: 'omp_config_plan',
    label: 'OMP Config Plan',
    description: 'Create a safe manual review plan before applying packaged OMP config templates to a target config directory.',
    parameters,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const result = await runConfigPlan({ root: pluginRootFromParams(params, ctx) });
      return {
        content: [textContent(formatPlanReport(result))],
        details: result,
        isError: false,
      };
    },
  });

  registerCommandIfAvailable(pi, 'config-doctor', 'Inspect packaged OMP config assets without modifying ~/.omp.', (input) => runConfigDoctor(input.root));
  registerCommandIfAvailable(pi, 'config-assets', 'List packaged OMP config assets.', (input) => listAssets(input.root));
}
