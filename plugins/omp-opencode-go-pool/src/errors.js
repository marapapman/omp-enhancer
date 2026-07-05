const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000;
const DEFAULT_AUTH_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SERVER_COOLDOWN_MS = 30 * 1000;
const DEFAULT_NETWORK_COOLDOWN_MS = 60 * 1000;

const RATE_LIMIT_RE = /\b(rate.?limit|quota|usage.?limit|too many requests|exhausted|insufficient_quota)\b/i;
const AUTH_RE = /\b(unauthorized|invalid api key|invalid_api_key|forbidden|permission denied)\b/i;
const NETWORK_RE = /\b(ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|network|socket|timeout)\b/i;

export function classifyProviderError(error) {
  const status = extractStatus(error);
  const message = extractErrorMessage(error);
  const retryAfterMs = extractRetryAfterMs(error);

  if (status === 401 || status === 403 || AUTH_RE.test(message)) {
    return {
      kind: 'auth',
      status,
      message,
      cooldownMs: DEFAULT_AUTH_COOLDOWN_MS,
      disable: true,
      retryableBeforeOutput: true,
    };
  }

  if (status === 429 || RATE_LIMIT_RE.test(message)) {
    return {
      kind: 'rate_limit',
      status,
      message,
      cooldownMs: retryAfterMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS,
      disable: false,
      retryableBeforeOutput: true,
    };
  }

  if (status !== undefined && status >= 500) {
    return {
      kind: 'server',
      status,
      message,
      cooldownMs: retryAfterMs ?? DEFAULT_SERVER_COOLDOWN_MS,
      disable: false,
      retryableBeforeOutput: true,
    };
  }

  if (NETWORK_RE.test(message)) {
    return {
      kind: 'network',
      status,
      message,
      cooldownMs: DEFAULT_NETWORK_COOLDOWN_MS,
      disable: false,
      retryableBeforeOutput: true,
    };
  }

  return {
    kind: 'unknown',
    status,
    message,
    cooldownMs: 0,
    disable: false,
    retryableBeforeOutput: false,
  };
}

export function extractStatus(error) {
  if (!error || typeof error !== 'object') return undefined;
  for (const key of ['status', 'statusCode', 'errorStatus']) {
    const value = error[key];
    if (Number.isInteger(value)) return value;
  }
  const responseStatus = error.response?.status;
  if (Number.isInteger(responseStatus)) return responseStatus;
  const causeStatus = error.cause?.status ?? error.cause?.statusCode ?? error.cause?.errorStatus;
  if (Number.isInteger(causeStatus)) return causeStatus;
  return undefined;
}

export function extractErrorMessage(error) {
  if (error === undefined || error === null) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object') {
    return String(error.errorMessage ?? error.message ?? error.error?.message ?? JSON.stringify(error));
  }
  return String(error);
}

export function extractRetryAfterMs(error) {
  const raw = getHeader(error, 'retry-after') ?? getHeader(error, 'Retry-After');
  if (!raw) return undefined;
  const seconds = Number.parseFloat(String(raw));
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(String(raw));
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return undefined;
}

function getHeader(error, name) {
  const headers = error?.headers ?? error?.response?.headers ?? error?.cause?.headers;
  if (!headers) return undefined;
  if (typeof headers.get === 'function') return headers.get(name);
  if (typeof headers === 'object') return headers[name] ?? headers[name.toLowerCase()];
  return undefined;
}
