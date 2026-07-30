import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  actionableParamError,
  requireString,
  parseJsonParam,
  withToolErrorHandling,
  describeValue,
} from '../src/small-model-hardening.js';

describe('actionableParamError', () => {
  it('includes field name, bad value, expected format, and example', () => {
    const msg = actionableParamError({
      toolName: 'tikz_generate_diagram',
      field: 'graph',
      badValue: { id: 'root' },
      expected: 'a JSON string (use JSON.stringify())',
      example: '"graph": "{\\"id\\":\\"root\\"}"',
    });
    assert.ok(msg.includes('tikz_generate_diagram'));
    assert.ok(msg.includes('graph'));
    assert.ok(msg.includes('object'));
    assert.ok(msg.includes('JSON string'));
    assert.ok(msg.includes('"graph"'));
  });

  it('omits example line when not provided', () => {
    const msg = actionableParamError({
      toolName: 'test', field: 'x', badValue: null, expected: 'a string',
    });
    assert.ok(!msg.includes('Correct example'));
  });
});

describe('requireString', () => {
  it('returns ok:true for valid string', () => {
    const r = requireString('tool', 'param', 'hello');
    assert.equal(r.ok, true);
    assert.equal(r.value, 'hello');
  });

  it('rejects null', () => {
    const r = requireString('tool', 'param', null);
    assert.equal(r.ok, false);
    assert.ok(r.error.includes('param'));
    assert.ok(r.error.includes('non-empty string'));
  });

  it('rejects undefined', () => {
    const r = requireString('tool', 'param', undefined);
    assert.equal(r.ok, false);
  });

  it('rejects empty string', () => {
    const r = requireString('tool', 'param', '');
    assert.equal(r.ok, false);
  });

  it('rejects number', () => {
    const r = requireString('tool', 'param', 42);
    assert.equal(r.ok, false);
    assert.ok(r.error.includes('string'));
  });

  it('rejects object', () => {
    const r = requireString('tool', 'param', { a: 1 });
    assert.equal(r.ok, false);
  });
});

describe('parseJsonParam', () => {
  it('returns undefined for null/undefined', () => {
    assert.deepEqual(parseJsonParam('tool', 'f', null), { ok: true, value: undefined });
    assert.deepEqual(parseJsonParam('tool', 'f', undefined), { ok: true, value: undefined });
  });

  it('rejects object (not string)', () => {
    const r = parseJsonParam('tool', 'f', { id: 'root' });
    assert.equal(r.ok, false);
    assert.ok(r.error.includes('JSON.stringify'));
  });

  it('rejects invalid JSON string', () => {
    const r = parseJsonParam('tool', 'f', '{bad');
    assert.equal(r.ok, false);
    assert.ok(r.error.includes('valid JSON'));
  });

  it('rejects empty string', () => {
    const r = parseJsonParam('tool', 'f', '');
    assert.equal(r.ok, false);
    assert.ok(r.error.includes('non-empty'));
  });

  it('parses valid JSON string', () => {
    const r = parseJsonParam('tool', 'f', '{"id":"root"}');
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, { id: 'root' });
  });

  it('allows empty string when opt-in', () => {
    const r = parseJsonParam('tool', 'f', '', { allowEmptyString: true });
    assert.equal(r.ok, true);
    assert.equal(r.value, '');
  });
});

describe('withToolErrorHandling', () => {
  it('wraps successful handler', async () => {
    const handler = async () => ({ content: [], isError: false });
    const wrapped = withToolErrorHandling('my_tool', handler);
    const result = await wrapped('1', {}, undefined, undefined, {});
    assert.equal(result.isError, false);
  });

  it('catches throw and returns actionable error', async () => {
    const handler = async () => { throw new Error('bad input'); };
    const wrapped = withToolErrorHandling('my_tool', handler);
    const result = await wrapped('1', {}, undefined, undefined, {});
    assert.equal(result.isError, true);
    assert.ok(result.content[0].text.includes('my_tool'));
    assert.ok(result.content[0].text.includes('bad input'));
  });

  it('preserves code and details from TikzRuntimeError', async () => {
    const handler = async () => {
      const err = new Error('invalid graph');
      err.code = 'INVALID_GRAPH_IR';
      err.details = { nodeCount: 5 };
      throw err;
    };
    const wrapped = withToolErrorHandling('tikz', handler);
    const result = await wrapped('1', {}, undefined, undefined, {});
    assert.equal(result.isError, true);
    assert.equal(result.details.code, 'INVALID_GRAPH_IR');
    assert.deepEqual(result.details.context, { nodeCount: 5 });
  });
});

describe('describeValue', () => {
  it('describes null', () => assert.equal(describeValue(null), 'null'));
  it('describes undefined', () => assert.equal(describeValue(undefined), 'undefined'));
  it('describes string', () => assert.ok(describeValue('hello').includes('string')));
  it('describes number', () => assert.ok(describeValue(42).includes('number')));
  it('describes array', () => assert.ok(describeValue([1, 2]).includes('array')));
  it('describes object', () => assert.ok(describeValue({ a: 1 }).includes('object')));
});
