import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  ensembleConfiguration,
  fetchAigcProbability,
  fetchJevProbability,
  fetchSlowLabel,
} from '../src/ai-detectors.js';

function response(payload, { ok = true, status = 200, text } = {}) {
  const raw = text !== undefined ? text : JSON.stringify(payload);
  return {
    ok,
    status,
    async text() {
      return raw;
    },
  };
}

describe('AIGC detector adapter', () => {
  it('requires a configured endpoint and accepts probability aliases', async () => {
    const missing = await fetchAigcProbability({ text: 'x', language: 'en', env: {} });
    assert.equal(missing.ok, false);
    assert.equal(missing.code, 'aigc_not_configured');
    assert.equal((await fetchAigcProbability({ text: 'x', language: 'en', env: { AIGC_DETECTOR_URL: 5 } })).code, 'aigc_not_configured');

    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return response({ aiProbability: 0.91 });
    };
    const output = await fetchAigcProbability({
      text: 'hello',
      language: 'en',
      env: { AIGC_DETECTOR_URL: 'http://aigc' },
      fetchImpl,
    });
    assert.equal(output.ok, true);
    assert.equal(output.probability, 0.91);
    assert.equal(calls[0].url, 'http://aigc');
    assert.equal(calls[0].init.headers.authorization, undefined);
    assert.deepEqual(JSON.parse(calls[0].init.body), { text: 'hello', language: 'en' });
  });

  it('accepts probability and score fields and sends an optional token', async () => {
    const fetchImpl = async (_url, init) => {
      assert.equal(init.headers.authorization, 'Bearer token');
      return response({ probability: 0.4 });
    };
    const output = await fetchAigcProbability({
      text: 'x',
      language: 'zh',
      env: { AIGC_DETECTOR_URL: 'http://aigc', AIGC_DETECTOR_TOKEN: 'token' },
      fetchImpl,
    });
    assert.equal(output.probability, 0.4);

    const scored = await fetchAigcProbability({
      text: 'x',
      language: 'zh',
      env: { AIGC_DETECTOR_URL: 'http://aigc' },
      fetchImpl: async () => response({ score: 0.2 }),
    });
    assert.equal(scored.probability, 0.2);
  });

  it('reports malformed responses, HTTP failures, network failures, and non-JSON content', async () => {
    const env = { AIGC_DETECTOR_URL: 'http://aigc' };
    const invalid = await fetchAigcProbability({
      text: 'x',
      language: 'en',
      env,
      fetchImpl: async () => response({ probability: 'high' }),
    });
    assert.equal(invalid.code, 'aigc_invalid_response');

    const http = await fetchAigcProbability({
      text: 'x',
      language: 'en',
      env,
      fetchImpl: async () => response({ error: 'down' }, { ok: false, status: 503 }),
    });
    assert.match(http.error, /HTTP 503/u);

    const network = await fetchAigcProbability({
      text: 'x',
      language: 'en',
      env,
      fetchImpl: async () => {
        throw new Error('connection refused');
      },
    });
    assert.match(network.error, /connection refused/u);

    const nonJson = await fetchAigcProbability({
      text: 'x',
      language: 'en',
      env,
      fetchImpl: async () => response(null, { text: '<html>' }),
    });
    assert.match(nonJson.error, /non-JSON/u);

    const empty = await fetchAigcProbability({
      text: 'x',
      language: 'en',
      env,
      fetchImpl: async () => response(null, { text: '' }),
    });
    assert.equal(empty.code, 'aigc_invalid_response');

    const nonError = await fetchAigcProbability({
      text: 'x',
      language: 'en',
      env,
      fetchImpl: async () => {
        throw 'boom';
      },
    });
    assert.match(nonError.error, /boom/u);
  });
});

describe('Jev detector adapter', () => {
  it('requires a TypeSafe key and calls the System One endpoint', async () => {
    const missing = await fetchJevProbability({ text: 'x', env: {} });
    assert.equal(missing.code, 'jev_not_configured');

    let captured;
    const output = await fetchJevProbability({
      text: 'hello',
      env: { TYPESAFE_API_KEY: 'key' },
      fetchImpl: async (url, init) => {
        captured = { url, init };
        return response({
          model: 'jev-test',
          answers: {
            authorship: {
              type: 'choice',
              choice: 'human',
              probabilities: { human: 0.93, ai: 0.07 },
              confidence: 0.86,
            },
          },
        });
      },
    });
    assert.equal(output.probability, 0.07);
    assert.equal(output.confidence, 0.86);
    assert.equal(output.model, 'jev-test');
    assert.equal(captured.url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(captured.init.headers.authorization, 'Bearer key');
    const body = JSON.parse(captured.init.body);
    assert.equal(body.model, 'jev-latest');
    assert.equal(body.state, 'hello');
    assert.equal(body.questions.authorship.type, 'choice');
    assert.deepEqual(Object.keys(body.questions.authorship.criteria), ['human', 'ai']);
  });

  it('supports custom base URL/model and choice-only answers', async () => {
    let captured;
    const output = await fetchJevProbability({
      text: 'x',
      env: {
        TYPESAFE_API_KEY: 'key',
        TYPESAFE_BASE_URL: 'http://typesafe/',
        TYPESAFE_MODEL: 'jev-custom',
      },
      fetchImpl: async (url, init) => {
        captured = { url, init };
        return response({ answers: { authorship: { type: 'choice', choice: 'ai' } } });
      },
    });
    assert.equal(output.probability, 1);
    assert.equal(output.model, 'jev-custom');
    assert.equal(captured.url, 'http://typesafe/v1/systemone');
    assert.equal(JSON.parse(captured.init.body).model, 'jev-custom');
  });

  it('supports a human choice and rejects malformed answers and failed requests', async () => {
    const human = await fetchJevProbability({
      text: 'x',
      env: { TYPESAFE_API_KEY: 'key' },
      fetchImpl: async () => response({ answers: { authorship: { type: 'choice', choice: 'human' } } }),
    });
    assert.equal(human.probability, 0);
    assert.equal(human.model, 'jev-latest');

    const invalid = await fetchJevProbability({
      text: 'x',
      env: { TYPESAFE_API_KEY: 'key' },
      fetchImpl: async () => response({ answers: { authorship: { type: 'choice', choice: 'maybe' } } }),
    });
    assert.equal(invalid.code, 'jev_invalid_response');

    const missingAnswer = await fetchJevProbability({
      text: 'x',
      env: { TYPESAFE_API_KEY: 'key' },
      fetchImpl: async () => response({}),
    });
    assert.equal(missingAnswer.code, 'jev_invalid_response');

    const failed = await fetchJevProbability({
      text: 'x',
      env: { TYPESAFE_API_KEY: 'key' },
      fetchImpl: async () => response({ error: 'bad' }, { ok: false, status: 401 }),
    });
    assert.match(failed.error, /HTTP 401/u);
  });
});

describe('slow detector adapter and ensemble configuration', () => {
  it('requires a slow endpoint and accepts label or prediction', async () => {
    assert.equal((await fetchSlowLabel({ text: 'x', env: {} })).code, 'slow_not_configured');

    const label = await fetchSlowLabel({
      text: 'x',
      language: 'en',
      env: { SLOW_DETECTOR_URL: 'http://slow', SLOW_DETECTOR_TOKEN: 'token' },
      fetchImpl: async (_url, init) => {
        assert.equal(init.headers.authorization, 'Bearer token');
        return response({ label: 'ai' });
      },
    });
    assert.equal(label.label, 'ai');

    const prediction = await fetchSlowLabel({
      text: 'x',
      language: 'zh',
      env: { SLOW_DETECTOR_URL: 'http://slow' },
      fetchImpl: async () => response({ prediction: 'human' }),
    });
    assert.equal(prediction.label, 'human');
  });

  it('reports malformed slow responses and HTTP failures', async () => {
    const invalid = await fetchSlowLabel({
      text: 'x',
      env: { SLOW_DETECTOR_URL: 'http://slow' },
      fetchImpl: async () => response({ label: 'uncertain' }),
    });
    assert.equal(invalid.code, 'slow_invalid_response');

    const failed = await fetchSlowLabel({
      text: 'x',
      env: { SLOW_DETECTOR_URL: 'http://slow' },
      fetchImpl: async () => response({ error: 'down' }, { ok: false, status: 500 }),
    });
    assert.equal(failed.code, 'slow_request_failed');
    assert.match(failed.error, /HTTP 500/u);
  });

  it('reports which ensemble variables are missing', () => {
    assert.deepEqual(ensembleConfiguration({ AIGC_DETECTOR_URL: 'x', TYPESAFE_API_KEY: 'k' }), { ready: true, missing: [] });
    assert.deepEqual(ensembleConfiguration({ AIGC_DETECTOR_URL: 'x' }), { ready: false, missing: ['TYPESAFE_API_KEY'] });
    assert.deepEqual(ensembleConfiguration({ TYPESAFE_API_KEY: 'k' }), { ready: false, missing: ['AIGC_DETECTOR_URL'] });
    assert.deepEqual(ensembleConfiguration({}), { ready: false, missing: ['AIGC_DETECTOR_URL', 'TYPESAFE_API_KEY'] });
  });
});
