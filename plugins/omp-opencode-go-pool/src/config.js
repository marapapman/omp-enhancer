import os from 'node:os';
import path from 'node:path';

export const PLUGIN_ID = 'omp-opencode-go-pool';
export const OPENCODE_GO_PROVIDER = 'opencode-go';
export const BALANCED_API = 'opencode-go-balanced';
export const DEFAULT_OPENAI_COMPAT_API = 'openai-completions';

export function resolveStateDir(options = {}) {
  if (options.stateDir) return path.resolve(options.stateDir);
  const env = options.env ?? process.env;
  if (env.OMP_OPENCODE_GO_POOL_STATE_DIR) {
    return path.resolve(env.OMP_OPENCODE_GO_POOL_STATE_DIR);
  }
  const home = options.home ?? os.homedir();
  return path.join(home, '.omp', 'agent', 'state');
}

export function resolveStatePaths(options = {}) {
  const stateDir = resolveStateDir(options);
  return {
    stateDir,
    vaultPath: path.join(stateDir, 'opencode-go-pool-vault.json'),
    healthPath: path.join(stateDir, 'opencode-go-pool.json'),
    usagePath: path.join(stateDir, 'opencode-go-pool-usage.jsonl'),
  };
}

export function textContent(text) {
  return { type: 'text', text };
}

export function okToolResult(text, details = {}) {
  return {
    content: [textContent(text)],
    details,
    isError: false,
  };
}
