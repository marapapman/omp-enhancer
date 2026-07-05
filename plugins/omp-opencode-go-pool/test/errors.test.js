import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyProviderError } from '../src/errors.js';

test('classifies 429 as retryable rate limit with Retry-After', () => {
  const error = new Error('too many requests');
  error.status = 429;
  error.headers = { 'retry-after': '2' };

  const result = classifyProviderError(error);
  assert.equal(result.kind, 'rate_limit');
  assert.equal(result.cooldownMs, 2000);
  assert.equal(result.retryableBeforeOutput, true);
});

test('classifies 401 as disabling auth failure', () => {
  const error = new Error('invalid api key');
  error.status = 401;

  const result = classifyProviderError(error);
  assert.equal(result.kind, 'auth');
  assert.equal(result.disable, true);
});

test('does not retry unknown errors by default', () => {
  const result = classifyProviderError(new Error('bad request payload'));
  assert.equal(result.kind, 'unknown');
  assert.equal(result.retryableBeforeOutput, false);
});

test('classifies certificate verification errors as retryable network failures', () => {
  const result = classifyProviderError(new Error('unknown certificate verification error'));
  assert.equal(result.kind, 'network');
  assert.equal(result.disable, false);
  assert.equal(result.retryableBeforeOutput, true);
});
