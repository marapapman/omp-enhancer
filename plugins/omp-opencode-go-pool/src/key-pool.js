import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { classifyProviderError } from './errors.js';
import { hashKey } from './key-vault.js';

const STATE_VERSION = 1;
const PRIMARY_LABEL = 'primary';

export class KeyPool {
  constructor(options = {}) {
    if (!options.vault) throw new Error('KeyPool requires a vault');
    if (!options.path) throw new Error('KeyPool requires a state path');
    this.vault = options.vault;
    this.path = options.path;
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => Date.now());
    this.inFlight = new Map();
  }

  async listKeyStates(primaryApiKey) {
    const [keys, state] = await Promise.all([
      this.getCandidateKeys(primaryApiKey),
      this.#readState(),
    ]);
    const now = this.now();
    return keys.map(key => {
      const health = state.keys[key.hash] ?? {};
      const inFlight = this.inFlight.get(key.hash) ?? 0;
      const cooldownUntil = Number(health.cooldownUntil ?? 0);
      return {
        ...withoutSecret(key),
        status: resolveStatus(health, now),
        cooldownUntil: cooldownUntil > now ? new Date(cooldownUntil).toISOString() : undefined,
        disabled: health.disabled === true,
        inFlight,
        failureCount: Number(health.failureCount ?? 0),
        recentUsageTokens: Number(health.recentUsageTokens ?? 0),
        lastError: health.lastError,
        lastErrorKind: health.lastErrorKind,
        lastUsedAt: health.lastUsedAt ? new Date(health.lastUsedAt).toISOString() : undefined,
      };
    });
  }

  async getCandidateKeys(primaryApiKey) {
    const keys = [];
    const primary = await resolvePrimaryApiKey(primaryApiKey);
    if (primary) {
      keys.push({
        id: 'primary',
        label: PRIMARY_LABEL,
        key: primary,
        hash: hashKey(primary),
        source: 'primary',
      });
    }

    for (const record of await this.vault.getKeyRecords()) {
      keys.push({
        id: record.id,
        label: record.label,
        key: record.key,
        hash: record.hash,
        source: 'vault',
      });
    }
    return dedupeKeys(keys);
  }

  async selectKey({ primaryApiKey, excludedHashes = new Set() } = {}) {
    const keys = await this.getCandidateKeys(primaryApiKey);
    const state = await this.#readState();
    const now = this.now();
    const candidates = keys.filter(key => {
      if (excludedHashes.has(key.hash)) return false;
      const health = state.keys[key.hash] ?? {};
      if (health.disabled) return false;
      if (Number(health.cooldownUntil ?? 0) > now) return false;
      return true;
    });

    if (candidates.length === 0) {
      const known = keys.map(withoutSecret);
      const error = new Error('OpenCode Go key pool exhausted.');
      error.code = 'OPENCODE_GO_POOL_EXHAUSTED';
      error.details = { known };
      throw error;
    }

    const selected = choosePowerOfTwo(candidates, state.keys, this.inFlight, this.random);
    this.#incrementInFlight(selected.hash);
    return selected;
  }

  async recordSuccess(key, usage = {}) {
    this.#decrementInFlight(key.hash);
    const state = await this.#readState();
    const health = state.keys[key.hash] ?? {};
    const tokens = Number(usage.totalTokens ?? 0);
    state.keys[key.hash] = {
      ...health,
      disabled: false,
      cooldownUntil: 0,
      failureCount: 0,
      recentUsageTokens: Math.round(Number(health.recentUsageTokens ?? 0) * 0.85 + tokens),
      lastUsedAt: this.now(),
      lastError: undefined,
      lastErrorKind: undefined,
    };
    await this.#writeState(state);
  }

  async recordFailure(key, error) {
    this.#decrementInFlight(key.hash);
    const classification = classifyProviderError(error);
    const state = await this.#readState();
    const health = state.keys[key.hash] ?? {};
    const cooldownUntil = classification.cooldownMs > 0 ? this.now() + classification.cooldownMs : Number(health.cooldownUntil ?? 0);
    state.keys[key.hash] = {
      ...health,
      disabled: classification.disable || health.disabled === true,
      cooldownUntil,
      failureCount: Number(health.failureCount ?? 0) + 1,
      lastUsedAt: this.now(),
      lastError: classification.message.slice(0, 240),
      lastErrorKind: classification.kind,
    };
    await this.#writeState(state);
    return classification;
  }

  async #readState() {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8'));
      if (!parsed || parsed.version !== STATE_VERSION || typeof parsed.keys !== 'object' || parsed.keys === null) {
        throw new Error('Unsupported OpenCode Go pool state format');
      }
      return { version: STATE_VERSION, updatedAt: parsed.updatedAt, keys: parsed.keys ?? {} };
    } catch (error) {
      if (error?.code === 'ENOENT' || error instanceof SyntaxError || /Unsupported OpenCode Go pool state format/.test(error?.message ?? '')) {
        return emptyState();
      }
      throw error;
    }
  }

  async #writeState(state) {
    const next = { version: STATE_VERSION, updatedAt: new Date().toISOString(), keys: state.keys ?? {} };
    await mkdir(path.dirname(this.path), { recursive: true, mode: 0o700 });
    await writeFile(this.path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    await chmod(this.path, 0o600).catch(() => {});
  }

  #incrementInFlight(hash) {
    this.inFlight.set(hash, (this.inFlight.get(hash) ?? 0) + 1);
  }

  #decrementInFlight(hash) {
    const next = Math.max(0, (this.inFlight.get(hash) ?? 0) - 1);
    if (next === 0) this.inFlight.delete(hash);
    else this.inFlight.set(hash, next);
  }
}

export function choosePowerOfTwo(candidates, healthByHash = {}, inFlight = new Map(), random = Math.random) {
  if (candidates.length === 1) return candidates[0];
  const first = candidates[Math.floor(random() * candidates.length)];
  let second = candidates[Math.floor(random() * candidates.length)];
  if (second.hash === first.hash && candidates.length > 1) {
    second = candidates.find(candidate => candidate.hash !== first.hash) ?? second;
  }
  return scoreKey(first, healthByHash, inFlight) <= scoreKey(second, healthByHash, inFlight) ? first : second;
}

function emptyState() {
  return { version: STATE_VERSION, updatedAt: new Date().toISOString(), keys: {} };
}

function scoreKey(key, healthByHash, inFlight) {
  const health = healthByHash[key.hash] ?? {};
  return (
    (inFlight.get(key.hash) ?? 0) * 100 +
    Number(health.failureCount ?? 0) * 20 +
    Number(health.recentUsageTokens ?? 0) / 10000
  );
}

function resolveStatus(health, now) {
  if (health.disabled) return 'disabled';
  if (Number(health.cooldownUntil ?? 0) > now) return 'cooldown';
  return 'ready';
}

async function resolvePrimaryApiKey(apiKey) {
  if (typeof apiKey === 'string') return apiKey.trim() || undefined;
  if (typeof apiKey === 'function') {
    const resolved = await apiKey({ lastChance: false, error: undefined });
    return typeof resolved === 'string' && resolved.trim() ? resolved.trim() : undefined;
  }
  return undefined;
}

function dedupeKeys(keys) {
  const seen = new Set();
  const result = [];
  for (const key of keys) {
    if (seen.has(key.hash)) continue;
    seen.add(key.hash);
    result.push(key);
  }
  return result;
}

function withoutSecret(key) {
  return {
    id: key.id,
    label: key.label,
    hash: key.hash,
    source: key.source,
  };
}
