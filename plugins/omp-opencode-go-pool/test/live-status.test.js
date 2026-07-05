import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fetchOpenCodeGoLiveStatus,
  fetchOpenCodeGoLiveStatuses,
  OPENCODE_GO_CHAT_COMPLETIONS_URL,
} from '../src/opencode-go-live-status.js';

const KEY = {
  id: 'primary',
  label: 'primary',
  hash: 'hash-primary',
  source: 'primary',
  key: 'sk-secret-live-status-test-key',
};

test('live status treats provider validation failure as accepted auth and quota gate', async () => {
  const requests = [];
  const status = await fetchOpenCodeGoLiveStatus(KEY, {
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return jsonResponse(400, {
        error: { type: 'ProviderError', message: 'messages must be an array' },
      });
    },
  });

  assert.equal(requests[0].url, OPENCODE_GO_CHAT_COMPLETIONS_URL);
  assert.equal(requests[0].init.headers.Authorization, `Bearer ${KEY.key}`);
  assert.match(requests[0].init.body, /deepseek-v4-flash/);
  assert.equal(status.status, 'ok');
  assert.equal(status.httpStatus, 400);
  assert.equal(status.hash, KEY.hash);
  assert.equal(JSON.stringify(status).includes(KEY.key), false);
});

test('live status parses OpenCode Go usage-limit errors', async () => {
  const status = await fetchOpenCodeGoLiveStatus(KEY, {
    fetchImpl: async () => jsonResponse(429, {
      type: 'error',
      error: {
        type: 'GoUsageLimitError',
        message: 'Weekly limit reached',
      },
      metadata: {
        workspace: 'wrk_123',
        limitName: 'weekly',
      },
    }, { 'retry-after': '120' }),
  });

  assert.equal(status.status, 'limited');
  assert.equal(status.limitName, 'weekly');
  assert.equal(status.workspace, 'wrk_123');
  assert.equal(status.retryAfterSec, 120);
  assert.equal(status.httpStatus, 429);
});

test('live status reports auth failures without leaking raw keys', async () => {
  const status = await fetchOpenCodeGoLiveStatus(KEY, {
    fetchImpl: async () => jsonResponse(401, {
      error: {
        type: 'AuthError',
        message: `invalid api key ${KEY.key}`,
      },
    }),
  });

  assert.equal(status.status, 'auth_error');
  assert.match(status.reason, /\[redacted-key\]/);
  assert.equal(JSON.stringify(status).includes(KEY.key), false);
});

test('live status aggregates fetch-unavailable reports', async () => {
  const report = await fetchOpenCodeGoLiveStatuses([KEY], { fetchImpl: undefined });

  assert.equal(report.checked, false);
  assert.equal(report.keys.length, 1);
  assert.equal(report.keys[0].status, 'unknown');
  assert.equal(JSON.stringify(report).includes(KEY.key), false);
});

function jsonResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    statusText: status === 400 ? 'Bad Request' : undefined,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
  });
}
