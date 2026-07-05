import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const VAULT_VERSION = 1;
const STORAGE_KIND = 'local-protected-file';
const KEY_LIKE_RE = /\b(?:sk-[A-Za-z0-9_-]{12,}|opencode[_-]?[A-Za-z0-9_-]{12,}|[A-Za-z0-9_-]{32,})\b/;

export class KeyVault {
  constructor(options = {}) {
    if (!options.path) throw new Error('KeyVault requires a path');
    this.path = options.path;
  }

  async listKeys() {
    const vault = await this.#readVault();
    return vault.keys.map(toMetadata);
  }

  async getKeyRecords() {
    const vault = await this.#readVault();
    return vault.keys.map(record => ({ ...record }));
  }

  async addKey({ label, key }) {
    const normalizedLabel = normalizeLabel(label);
    const normalizedKey = normalizeApiKey(key);
    const hash = hashKey(normalizedKey);
    const now = new Date().toISOString();
    const vault = await this.#readVault();

    const existingByHash = vault.keys.find(record => record.hash === hash);
    if (existingByHash) {
      const duplicateLabel = vault.keys.find(record => record.id !== existingByHash.id && record.label === normalizedLabel);
      if (duplicateLabel) {
        throw new Error(`Extra key label already exists: ${normalizedLabel}`);
      }
      existingByHash.label = normalizedLabel;
      existingByHash.updatedAt = now;
      await this.#writeVault(vault);
      return { action: 'updated', key: toMetadata(existingByHash) };
    }

    const duplicateLabel = vault.keys.find(record => record.label === normalizedLabel);
    if (duplicateLabel) {
      throw new Error(`Extra key label already exists: ${normalizedLabel}`);
    }

    const record = {
      id: randomUUID(),
      label: normalizedLabel,
      key: normalizedKey,
      hash,
      createdAt: now,
      updatedAt: now,
    };
    vault.keys.push(record);
    await this.#writeVault(vault);
    return { action: 'added', key: toMetadata(record) };
  }

  async removeKey(selector) {
    const normalized = normalizeSelector(selector);
    const vault = await this.#readVault();
    const index = vault.keys.findIndex(record => matchesSelector(record, normalized));
    if (index === -1) return { removed: false, selector: normalized };
    const [removed] = vault.keys.splice(index, 1);
    await this.#writeVault(vault);
    return { removed: true, key: toMetadata(removed) };
  }

  async renameKey(selector, newLabel) {
    const normalized = normalizeSelector(selector);
    const label = normalizeLabel(newLabel);
    const vault = await this.#readVault();
    const record = vault.keys.find(candidate => matchesSelector(candidate, normalized));
    if (!record) return { renamed: false, selector: normalized };
    const duplicate = vault.keys.find(candidate => candidate.id !== record.id && candidate.label === label);
    if (duplicate) throw new Error(`Extra key label already exists: ${label}`);
    record.label = label;
    record.updatedAt = new Date().toISOString();
    await this.#writeVault(vault);
    return { renamed: true, key: toMetadata(record) };
  }

  async #readVault() {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8'));
      if (!parsed || parsed.version !== VAULT_VERSION || !Array.isArray(parsed.keys)) {
        throw new Error('Unsupported OpenCode Go key vault format');
      }
      return {
        version: VAULT_VERSION,
        storage: parsed.storage ?? STORAGE_KIND,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
        keys: parsed.keys
          .filter(record => record && typeof record.key === 'string')
          .map(record => ({
            id: String(record.id || randomUUID()),
            label: normalizeLabel(record.label || 'extra'),
            key: normalizeApiKey(record.key),
            hash: record.hash || hashKey(record.key),
            createdAt: record.createdAt || new Date().toISOString(),
            updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
          })),
      };
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const now = new Date().toISOString();
      return {
        version: VAULT_VERSION,
        storage: STORAGE_KIND,
        createdAt: now,
        updatedAt: now,
        keys: [],
      };
    }
  }

  async #writeVault(vault) {
    const next = {
      version: VAULT_VERSION,
      storage: STORAGE_KIND,
      createdAt: vault.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      keys: vault.keys,
    };
    await mkdir(path.dirname(this.path), { recursive: true, mode: 0o700 });
    await writeFile(this.path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    await chmod(this.path, 0o600).catch(() => {});
  }
}

export function hashKey(key) {
  return createHash('sha256').update(String(key)).digest('hex').slice(0, 16);
}

export function normalizeLabel(label) {
  const value = String(label ?? '').trim().replace(/\s+/g, '-').slice(0, 64);
  if (!value) throw new Error('Key label is required');
  if (KEY_LIKE_RE.test(value)) throw new Error('Key label must not contain API-key-looking text');
  return value;
}

export function normalizeApiKey(key) {
  const value = String(key ?? '').trim();
  if (!value) throw new Error('API key is required');
  if (value.length < 16) throw new Error('API key is too short');
  return value;
}

export function hasKeyLikeText(text) {
  return KEY_LIKE_RE.test(String(text ?? ''));
}

function normalizeSelector(selector) {
  const value = String(selector ?? '').trim();
  if (!value) throw new Error('Key label, id, or hash is required');
  return value;
}

function matchesSelector(record, selector) {
  return record.id === selector || record.hash === selector || record.label === selector;
}

function toMetadata(record) {
  return {
    id: record.id,
    label: record.label,
    hash: record.hash,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    source: 'vault',
    storage: STORAGE_KIND,
  };
}
