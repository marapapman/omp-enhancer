import { appendFile, mkdir, readFile, chmod } from 'node:fs/promises';
import path from 'node:path';

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export class UsageLedger {
  constructor(options = {}) {
    if (!options.path) throw new Error('UsageLedger requires a path');
    this.path = options.path;
  }

  async appendAttempt(attempt) {
    const entry = sanitizeAttempt(attempt);
    await mkdir(path.dirname(this.path), { recursive: true, mode: 0o700 });
    await appendFile(this.path, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    await chmod(this.path, 0o600).catch(() => {});
    return entry;
  }

  async readEntries() {
    let raw = '';
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (error) {
      if (error?.code === 'ENOENT') return { entries: [], corruptLines: 0 };
      throw error;
    }

    const entries = [];
    let corruptLines = 0;
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        corruptLines += 1;
      }
    }
    return { entries, corruptLines };
  }

  async aggregate(now = Date.now()) {
    const { entries, corruptLines } = await this.readEntries();
    return aggregateUsage(entries, { now, corruptLines });
  }
}

export function sanitizeAttempt(attempt = {}) {
  const usage = normalizeUsage(attempt.usage);
  return {
    version: 1,
    timestamp: Number(attempt.timestamp ?? Date.now()),
    provider: String(attempt.provider ?? 'opencode-go'),
    model: String(attempt.model ?? attempt.modelId ?? ''),
    key: {
      label: String(attempt.key?.label ?? attempt.keyLabel ?? ''),
      hash: String(attempt.key?.hash ?? attempt.keyHash ?? ''),
      source: String(attempt.key?.source ?? attempt.keySource ?? ''),
    },
    success: Boolean(attempt.success),
    durationMs: numberOrNull(attempt.durationMs),
    usage,
    cost: {
      known: usage.costTotal !== null,
      total: usage.costTotal,
    },
    error: attempt.error
      ? {
          kind: String(attempt.error.kind ?? 'unknown'),
          status: numberOrNull(attempt.error.status),
          message: String(attempt.error.message ?? '').slice(0, 240),
        }
      : undefined,
  };
}

export function normalizeUsage(usage = {}) {
  const source = usage && typeof usage === 'object' ? usage : {};
  const input = numberOrZero(source.input ?? source.inputTokens ?? source.promptTokens);
  const output = numberOrZero(source.output ?? source.outputTokens ?? source.completionTokens);
  const cacheRead = numberOrZero(source.cacheRead);
  const cacheWrite = numberOrZero(source.cacheWrite);
  const totalTokens = numberOrZero(source.totalTokens) || input + output + cacheRead + cacheWrite;
  const costTotal = numberOrNull(source.cost?.total ?? source.costTotal ?? source.totalCost);
  return { input, output, cacheRead, cacheWrite, totalTokens, costTotal };
}

export function usageFromAssistantMessage(message) {
  return normalizeUsage(message?.usage ?? {});
}

export function aggregateUsage(entries, options = {}) {
  const now = Number(options.now ?? Date.now());
  const windows = {
    '5h': emptyWindow('5h', now - FIVE_HOURS_MS, now),
    weekly: emptyWindow('weekly', now - WEEK_MS, now),
    monthly: emptyWindow('monthly', now - MONTH_MS, now),
  };
  const allTime = emptyWindow('allTime', 0, now);

  for (const entry of entries) {
    addEntry(allTime, entry);
    for (const window of Object.values(windows)) {
      if (Number(entry.timestamp ?? 0) >= window.startMs && Number(entry.timestamp ?? 0) <= window.endMs) {
        addEntry(window, entry);
      }
    }
  }

  return {
    generatedAt: new Date(now).toISOString(),
    corruptLines: Number(options.corruptLines ?? 0),
    windows,
    allTime,
  };
}

function addEntry(window, entry) {
  const keyHash = entry.key?.hash || 'unknown';
  const label = entry.key?.label || 'unknown';
  const source = entry.key?.source || 'unknown';
  const target = window.byKey[keyHash] ?? {
    label,
    hash: keyHash,
    source,
    requests: 0,
    successes: 0,
    failures: 0,
    tokens: 0,
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    knownCost: 0,
    unknownCostRequests: 0,
  };

  const usage = normalizeUsage(entry.usage);
  target.requests += 1;
  target.successes += entry.success ? 1 : 0;
  target.failures += entry.success ? 0 : 1;
  target.tokens += usage.totalTokens;
  target.input += usage.input;
  target.output += usage.output;
  target.cacheRead += usage.cacheRead;
  target.cacheWrite += usage.cacheWrite;
  if (usage.costTotal === null) target.unknownCostRequests += 1;
  else target.knownCost += usage.costTotal;
  window.byKey[keyHash] = target;

  window.total.requests += 1;
  window.total.successes += entry.success ? 1 : 0;
  window.total.failures += entry.success ? 0 : 1;
  window.total.tokens += usage.totalTokens;
  window.total.input += usage.input;
  window.total.output += usage.output;
  window.total.cacheRead += usage.cacheRead;
  window.total.cacheWrite += usage.cacheWrite;
  if (usage.costTotal === null) window.total.unknownCostRequests += 1;
  else window.total.knownCost += usage.costTotal;
}

function emptyWindow(name, startMs, endMs) {
  return {
    name,
    startMs,
    endMs,
    total: {
      requests: 0,
      successes: 0,
      failures: 0,
      tokens: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      knownCost: 0,
      unknownCostRequests: 0,
    },
    byKey: {},
  };
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
