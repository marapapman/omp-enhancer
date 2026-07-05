export const OPENCODE_GO_CHAT_COMPLETIONS_URL = 'https://opencode.ai/zen/go/v1/chat/completions';
export const DEFAULT_LIVE_PROBE_MODEL = 'deepseek-v4-flash';
export const DEFAULT_LIVE_PROBE_TIMEOUT_MS = 8000;

const USER_AGENT = 'omp-opencode-go-pool';

export async function fetchOpenCodeGoLiveStatuses(keys = [], options = {}) {
  const endpoint = options.endpoint ?? OPENCODE_GO_CHAT_COMPLETIONS_URL;
  const checkedAt = new Date().toISOString();
  const fetchImpl = resolveFetchImpl(options);

  if (typeof fetchImpl !== 'function') {
    return {
      checked: false,
      endpoint,
      checkedAt,
      reason: 'fetch is not available in this runtime',
      keys: keys.map(key => publicKeyStatus(key, { status: 'unknown', reason: 'fetch unavailable' })),
    };
  }

  const statuses = await Promise.all(keys.map(key => fetchOpenCodeGoLiveStatus(key, {
    ...options,
    endpoint,
    fetchImpl,
  })));

  return {
    checked: true,
    endpoint,
    checkedAt,
    keys: statuses,
  };
}

export async function fetchOpenCodeGoLiveStatus(key, options = {}) {
  const endpoint = options.endpoint ?? OPENCODE_GO_CHAT_COMPLETIONS_URL;
  const fetchImpl = resolveFetchImpl(options);
  const timeoutMs = Number(options.timeoutMs ?? DEFAULT_LIVE_PROBE_TIMEOUT_MS);
  const model = options.model ?? process.env.OMP_OPENCODE_GO_POOL_PROBE_MODEL ?? DEFAULT_LIVE_PROBE_MODEL;

  if (!key?.key) {
    return publicKeyStatus(key, { status: 'unknown', reason: 'missing API key material' });
  }

  const controller = new AbortController();
  const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? setTimeout(() => controller.abort(), timeoutMs)
    : undefined;

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key.key}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        'X-Opencode-Client': 'omp-opencode-go-pool-status',
      },
      body: JSON.stringify(buildProbeBody(model)),
      signal: controller.signal,
    });
    return publicKeyStatus(key, await classifyProbeResponse(response, key.key));
  } catch (error) {
    return publicKeyStatus(key, {
      status: 'unavailable',
      reason: sanitizeMessage(error?.message ?? String(error), key.key),
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function resolveFetchImpl(options) {
  if (Object.prototype.hasOwnProperty.call(options, 'fetchImpl')) return options.fetchImpl;
  return globalThis.fetch;
}

function buildProbeBody(model) {
  return {
    model,
    stream: false,
    max_tokens: 1,
    // The malformed messages value lets OpenCode validate auth and Go quota
    // before the upstream provider rejects the body without returning usage.
    messages: '__omp_opencode_go_pool_status_probe__',
  };
}

async function classifyProbeResponse(response, rawKey) {
  const statusCode = Number(response?.status);
  const payload = await readJsonResponse(response);
  const retryAfterSec = parseRetryAfterSeconds(response?.headers);
  const message = sanitizeMessage(payload?.error?.message ?? payload?.message ?? response?.statusText ?? '', rawKey);
  const errorType = String(payload?.error?.type ?? payload?.type ?? '');
  const metadata = payload?.metadata && typeof payload.metadata === 'object' ? payload.metadata : {};

  if (statusCode === 400) {
    return {
      status: 'ok',
      httpStatus: statusCode,
      reason: 'OpenCode accepted the key and quota gate; probe stopped at provider validation',
    };
  }

  if (statusCode === 200) {
    return {
      status: 'ok',
      httpStatus: statusCode,
      reason: 'OpenCode accepted the key and probe request',
    };
  }

  if (statusCode === 401 || statusCode === 403 || /\b(AuthError|Unauthorized|Forbidden)\b/i.test(errorType)) {
    return {
      status: 'auth_error',
      httpStatus: statusCode,
      reason: message || 'OpenCode rejected the API key',
    };
  }

  if (statusCode === 429) {
    return {
      status: errorType === 'GoUsageLimitError' || metadata.limitName ? 'limited' : 'rate_limited',
      httpStatus: statusCode,
      limitName: metadata.limitName,
      workspace: metadata.workspace,
      retryAfterSec,
      reason: message || 'OpenCode returned a rate limit',
    };
  }

  if (statusCode >= 500) {
    return {
      status: 'unavailable',
      httpStatus: statusCode,
      retryAfterSec,
      reason: message || `OpenCode returned HTTP ${statusCode}`,
    };
  }

  return {
    status: 'unknown',
    httpStatus: statusCode,
    retryAfterSec,
    reason: message || `Unexpected OpenCode response HTTP ${statusCode}`,
  };
}

async function readJsonResponse(response) {
  try {
    const text = await response.text();
    if (!text) return undefined;
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function parseRetryAfterSeconds(headers) {
  const raw = typeof headers?.get === 'function' ? headers.get('retry-after') : undefined;
  if (!raw) return undefined;
  const seconds = Number.parseFloat(raw);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const dateMs = Date.parse(raw);
  if (!Number.isNaN(dateMs)) return Math.max(0, Math.ceil((dateMs - Date.now()) / 1000));
  return undefined;
}

function publicKeyStatus(key, status) {
  return {
    id: key?.id,
    label: key?.label,
    hash: key?.hash,
    source: key?.source,
    ...status,
  };
}

function sanitizeMessage(message, rawKey) {
  let text = String(message ?? '');
  if (rawKey) text = text.split(rawKey).join('[redacted-key]');
  return text.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted-key]').slice(0, 260);
}
