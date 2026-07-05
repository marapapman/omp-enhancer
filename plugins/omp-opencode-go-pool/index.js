import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createBalancedStream, resolveRuntimeStreamSimple } from './src/balanced-stream.js';
import { BALANCED_API, OPENCODE_GO_PROVIDER, resolveStatePaths, okToolResult } from './src/config.js';
import { buildStatusReport, formatStatusReport } from './src/diagnostics.js';
import { KeyVault } from './src/key-vault.js';
import { KeyPool } from './src/key-pool.js';
import { runKeyCommand } from './src/key-command.js';
import { buildBalancedModelOverlay, registerOpenCodeGoPoolProvider } from './src/provider-registration.js';
import { UsageLedger } from './src/usage.js';

export default function registerOpenCodeGoPool(pi) {
  const paths = resolveStatePaths();
  void debugLog(paths, { event: 'init', version: '0.1.2' });
  const keyVault = new KeyVault({ path: paths.vaultPath });
  const usageLedger = new UsageLedger({ path: paths.usagePath });
  const keyPool = new KeyPool({ vault: keyVault, path: paths.healthPath });

  pi.setLabel?.('OpenCode Go Pool');

  const streamSimple = createBalancedStream({
    keyPool,
    usageLedger,
    resolveStreamSimple: () => resolveRuntimeStreamSimple(pi),
  });

  const providerRegistration = registerOpenCodeGoPoolProvider(pi, {
    streamSimple,
    keyPool,
  });
  void debugLog(paths, { event: 'provider_registered', ...providerRegistration });

  pi.on?.('before_agent_start', async (_event, ctx = {}) => {
    await ensureBalancedOpenCodeGoModel(pi, ctx, paths);
  });

  pi.registerCommand?.('opencode_go_pool_key', {
    description: 'Add, remove, or rename extra OpenCode Go API keys for the local key pool.',
    async handler(args = '', ctx = {}) {
      const result = await runKeyCommand({ args, ctx, keyVault });
      await notifyCommand(ctx, result.text, result.ok ? 'info' : 'error');
      return result;
    },
  });

  const statusRunner = async (ctx = {}) => {
    const primaryApiKey = await resolvePrimaryApiKeyFromContext(ctx);
    const report = await buildStatusReport({ keyPool, keyVault, usageLedger, primaryApiKey });
    return { report, text: formatStatusReport(report) };
  };

  pi.registerCommand?.('opencode_go_pool_status', {
    description: 'Show OpenCode Go key pool health, cooldowns, and plugin-observed per-key usage.',
    async handler(_args = '', ctx = {}) {
      const result = await statusRunner(ctx);
      await notifyCommand(ctx, result.text, 'info');
      return result;
    },
  });

  const z = pi.zod?.z ?? pi.z;
  pi.registerTool?.({
    name: 'opencode_go_pool_status',
    label: 'OpenCode Go Pool Status',
    description: 'Show OpenCode Go key pool health, cooldowns, and plugin-observed per-key usage.',
    parameters: z?.object ? z.object({}) : undefined,
    async execute(_toolCallId, _params = {}, _signal, _onUpdate, ctx = {}) {
      const result = await statusRunner(ctx);
      return okToolResult(result.text, result.report);
    },
  });
}

async function debugLog(paths, event) {
  if (process.env.OMP_OPENCODE_GO_POOL_DEBUG !== '1') return;
  const logPath = path.join(paths.stateDir, 'opencode-go-pool-debug.jsonl');
  await mkdir(path.dirname(logPath), { recursive: true, mode: 0o700 });
  await appendFile(logPath, `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`, { mode: 0o600 }).catch(() => {});
}

async function notifyCommand(ctx, text, type) {
  if (!text || typeof ctx?.ui?.notify !== 'function') return;
  await ctx.ui.notify(String(text), type);
}

async function ensureBalancedOpenCodeGoModel(pi, ctx, paths) {
  const current = ctx?.model;
  if (!current || current.provider !== OPENCODE_GO_PROVIDER || current.api === BALANCED_API) return;
  const replacement = buildBalancedModelOverlay(current);
  const switched = await pi.setModel?.(replacement);
  void debugLog(paths, {
    event: 'model_overlay_switch',
    provider: current.provider,
    model: current.id,
    fromApi: current.api,
    toApi: replacement.api,
    switched: Boolean(switched),
  });
}

async function resolvePrimaryApiKeyFromContext(ctx) {
  try {
    if (typeof ctx?.modelRegistry?.getApiKeyForProvider === 'function') {
      const key = await ctx.modelRegistry.getApiKeyForProvider('opencode-go');
      return typeof key === 'string' && key.trim() ? key : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export {
  createBalancedStream,
  buildStatusReport,
  formatStatusReport,
  KeyPool,
  KeyVault,
  registerOpenCodeGoPoolProvider,
  runKeyCommand,
  UsageLedger,
};
