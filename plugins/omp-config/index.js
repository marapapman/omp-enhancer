import { runConfigDoctor } from './src/doctor.js';
import { listAssets } from './src/asset-index.js';
import { formatDoctorReport, formatPlanReport, formatWorkflowContextSyncReport } from './src/report.js';
import { resolvePluginRoot } from './src/plugin-root.js';
import { syncWorkflowContext } from './src/workflow-context-sync.js';
import { withToolErrorHandling } from './src/tool-error-utils.js';

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
export { syncWorkflowContext } from './src/workflow-context-sync.js';

export async function runConfigPlan(input = {}) {
  const root = typeof input.root === 'string' && input.root.trim() !== '' ? input.root : process.cwd();
  const pluginRoot = await resolvePluginRoot(root);
  const plan = [
    `Review packaged templates under ${pluginRoot}/assets.`,
    'Compare assets/config.yml, assets/mcp.json, assets/AGENTS.md, assets/WORKFLOW_CATALOG.md, and assets/WATCHDOG.yml with the target OMP home; the shared catalog installs under its OMP Enhancer namespaced filename.',
    'Compare bundled agents and skills with the target installation.',
    'Dry-run omp_config_sync_workflow_context against the intended OMP agent directory.',
    'Apply the managed workflow context only after explicit user review; preserve unrelated AGENTS.md and WATCHDOG.yml content.',
  ];
  return { ok: true, plan };
}

function optionalStringParameters(z) {
  if (typeof z.optional === 'function') {
    return z.object({ root: z.optional(z.string()).describe('Plugin or workspace root used to locate packaged assets. Defaults to the current working directory or ctx.cwd.') });
  }
  return z.object({ root: z.string().optional().describe('Plugin or workspace root used to locate packaged assets. Defaults to the current working directory or ctx.cwd.') });
}

function workflowContextSyncParameters(z) {
  const optional = (schema) => typeof z.optional === 'function' ? z.optional(schema) : schema.optional();
  return z.object({
    root: optional(z.string()).describe('Plugin or workspace root used to locate packaged assets. Defaults to the current working directory or ctx.cwd.'),
    target: optional(z.string()).describe('Target OMP agent directory path. Defaults to PI_CODING_AGENT_DIR or ~/.omp/agent.'),
    apply: optional(z.boolean()).describe('Set to true to apply changes. Defaults to false (dry-run mode).'),
  });
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
  const syncParameters = workflowContextSyncParameters(z);
  pi.setLabel?.('OMP Config');

  pi.registerTool({
    name: 'omp_config_doctor',
    label: 'OMP Config Doctor',
    description: 'Inspect packaged OMP config assets and report portability risks.',
    defaultInactive: true,
    approval: 'read',
    promptSnippet: 'Inspect packaged OMP config assets and report portability risks.',
    promptGuidelines: [
      'Reports advisory findings only; does not modify files.',
      'Pass root to locate packaged assets from a specific plugin or workspace root.',
      'Use this before applying config changes to verify safety.',
    ],
    parameters,
    execute: withToolErrorHandling('omp_config_doctor', async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const result = await runConfigDoctor(pluginRootFromParams(params, ctx));
      return {
        content: [textContent(formatDoctorReport(result))],
        details: result,
        isError: false,
      };
    }),
  });

  pi.registerTool({
    name: 'omp_config_sync_workflow_context',
    label: 'OMP Workflow Context Sync',
    description: 'Preview or explicitly apply the shared main-agent and Advisor workflow catalog to an OMP agent directory. Defaults to dry-run and preserves unrelated AGENTS.md content.',
    defaultInactive: true,
    approval: 'write',
    promptSnippet: 'Preview or apply shared workflow catalog assets to an OMP agent directory.',
    promptGuidelines: [
      'Defaults to dry-run; pass apply: true to write changes.',
      'Preserves content outside managed markers in AGENTS.md.',
      'Use target to select a specific agent directory; root locates packaged assets.',
    ],
    parameters: syncParameters,
    execute: withToolErrorHandling('omp_config_sync_workflow_context', async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const input = paramsOrEmpty(params);
      const result = await syncWorkflowContext({
        root: pluginRootFromParams(input, ctx),
        target: input.target,
        apply: input.apply === true,
      });
      return {
        content: [textContent(formatWorkflowContextSyncReport(result))],
        details: result,
        isError: false,
      };
    }),
  });

  pi.registerTool({
    name: 'omp_config_assets',
    label: 'OMP Config Assets',
    description: 'List packaged OMP config agents, skills, hooks, and templates.',
    defaultInactive: true,
    approval: 'read',
    promptSnippet: 'List packaged OMP config agents, skills, hooks, and templates.',
    promptGuidelines: [
      'Returns a JSON inventory of all packaged config assets.',
      'Pass root to locate packaged assets from a specific plugin or workspace root.',
      'This tool is read-only; it does not modify files.',
    ],
    parameters,
    execute: withToolErrorHandling('omp_config_assets', async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const result = await listAssets(pluginRootFromParams(params, ctx));
      return {
        content: [textContent(JSON.stringify(result, null, 2))],
        details: result,
        isError: false,
      };
    }),
  });

  pi.registerTool({
    name: 'omp_config_plan',
    label: 'OMP Config Plan',
    description: 'Create a safe manual review plan before applying packaged OMP config templates to a target config directory.',
    defaultInactive: true,
    approval: 'read',
    promptSnippet: 'Create a safe manual review plan before applying config templates.',
    promptGuidelines: [
      'Use this tool before omp_config_sync_workflow_context with apply: true.',
      'Reports what would change without modifying any files.',
      'Pass root to locate packaged assets from a specific plugin or workspace root.',
    ],
    parameters,
    execute: withToolErrorHandling('omp_config_plan', async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const result = await runConfigPlan({ root: pluginRootFromParams(params, ctx) });
      return {
        content: [textContent(formatPlanReport(result))],
        details: result,
        isError: false,
      };
    }),
  });

  // Session-start auto-sync: propagate workflow context assets (WATCHDOG.yml,
  // AGENTS.md, WORKFLOW_CATALOG.md) after plugin install or upgrade without
  // requiring the user to manually invoke omp_config_sync_workflow_context.
  // Idempotent: only writes when files actually differ. Preserves content
  // outside managed markers. Set OMP_ENHANCER_DISABLE_CONFIG_AUTO_SYNC=1 to skip.
  pi.on?.('session_start', async () => {
    if (process.env.OMP_ENHANCER_DISABLE_CONFIG_AUTO_SYNC) return undefined;
    try {
      await syncWorkflowContext({ apply: true });
    } catch {
      // Non-fatal: plugin lifecycle must not break on a sync failure.
    }
    return undefined;
  });

  registerCommandIfAvailable(pi, 'config-doctor', 'Inspect packaged OMP config assets without modifying ~/.omp.', (input) => runConfigDoctor(input.root));
  registerCommandIfAvailable(pi, 'config-assets', 'List packaged OMP config assets.', (input) => listAssets(input.root));

  if (typeof pi.registerCommand === 'function' && typeof pi.getActiveTools === 'function' && typeof pi.getAllTools === 'function') {
    pi.registerCommand('enhancer-tools', {
      description: 'Explicitly enable, disable, or inspect opt-in OMP Enhancer tools without changing OMP native defaults.',
      async handler(args = '', ctx = {}) {
        const [rawAction = 'status', rawGroup = 'all'] = String(args).trim().toLowerCase().split(/\s+/).filter(Boolean);
        const action = rawAction || 'status';
        const group = rawGroup || 'all';
        const groups = { config: ['omp_config_'], writing: ['writing_'], fact: ['fact_check_'] };
        const prefixes = group === 'all' ? Object.values(groups).flat() : groups[group] ?? null;
        if (!['status', 'enable', 'disable'].includes(action) || !prefixes) {
          await ctx.ui?.notify?.('Usage: /enhancer-tools status | enable <config|writing|fact|all> | disable <group>', 'warning');
          return;
        }
        const allToolNames = pi.getAllTools()
          .map((tool) => (typeof tool === 'string' ? tool : tool?.name))
          .filter((name) => typeof name === 'string' && name.length > 0);
        const available = [...new Set(allToolNames)].filter((name) => prefixes.some((prefix) => name.startsWith(prefix)));
        const active = [...new Set(pi.getActiveTools())];
        if (action === 'status') {
          const enabled = available.filter((name) => active.includes(name));
          await ctx.ui?.notify?.(
            enabled.length ? `Enabled enhancer tools: ${enabled.join(', ')}` : 'No enhancer tools are enabled.',
            'info',
          );
          return;
        }
        if (typeof pi.setActiveTools !== 'function') {
          await ctx.ui?.notify?.('This OMP runtime cannot change active tools.', 'warning');
          return;
        }
        const next = action === 'enable'
          ? [...new Set([...active, ...available])]
          : active.filter((name) => !available.includes(name));
        await pi.setActiveTools(next);
        await ctx.ui?.notify?.(
          `${action === 'enable' ? 'Enabled' : 'Disabled'} ${available.length} ${group} enhancer tool${available.length === 1 ? '' : 's'}.`,
          'info',
        );
      },
    });
  }
}
