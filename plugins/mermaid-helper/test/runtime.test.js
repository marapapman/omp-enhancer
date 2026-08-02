import { strict as assert } from 'node:assert';
import { describe, it, mock } from 'node:test';

import extension from '../index.js';

function schema(kind, data = {}) {
  const value = { __ompZodSchema: true, kind, ...data };
  value.describe = () => value;
  value.optional = () => ({ ...value, optional: true });
  return value;
}

function makeExtensionApi() {
  return {
    registerTool: mock.fn(),
    setLabel: mock.fn(),
    zod: {
      z: {
        object: (shape) => schema('object', { shape }),
        string: () => schema('string'),
        number: () => schema('number'),
        boolean: () => schema('boolean'),
        array: (item) => schema('array', { item }),
        enum: (values) => schema('enum', { values }),
        optional: (value) => ({ ...value, optional: true }),
      },
    },
  };
}

describe('mermaid-helper runtime tools', () => {
  it('registers mermaid_render as the single active-by-default tool with exec approval', () => {
    const api = makeExtensionApi();
    extension(api);

    const tools = api.registerTool.mock.calls.map((call) => call.arguments[0]);
    assert.deepEqual(tools.map((tool) => tool.name), ['mermaid_render']);
    assert.deepEqual(tools.map((tool) => tool.approval), ['exec']);
    assert.equal(tools[0].defaultInactive !== true, true, 'mermaid_render should not start inactive');
    assert.equal(tools[0].parameters?.__ompZodSchema === true, true);
    // No executable/command parameters on the render tool
    assert.equal(Object.hasOwn(tools[0].parameters.shape, 'executable'), false);
    assert.equal(Object.hasOwn(tools[0].parameters.shape, 'command'), false);
    assert.equal(Object.hasOwn(tools[0].parameters.shape, 'source'), true);
    assert.equal(Object.hasOwn(tools[0].parameters.shape, 'sourcePath'), true);
    assert.equal(Object.hasOwn(tools[0].parameters.shape, 'outputDirectory'), true);
    assert.equal(Object.hasOwn(tools[0].parameters.shape, 'theme'), true);
    assert.equal(Object.hasOwn(tools[0].parameters.shape, 'width'), true);
    assert.equal(Object.hasOwn(tools[0].parameters.shape, 'timeoutMs'), true);
    assert.equal(Object.hasOwn(tools[0].parameters.shape, 'targetBase'), false);
  });

  it('returns structured tool success and parameter failures', async () => {
    const api = makeExtensionApi();
    extension(api);
    const renderTool = api.registerTool.mock.calls[0].arguments[0];

    const failure = await renderTool.execute('render-1', {}, undefined, undefined, {});
    assert.equal(failure.isError, true);
    assert.equal(failure.details.ok, false);
    assert.equal(typeof failure.details.code, 'string');
    assert.equal(failure.content[0].type, 'text');
  });

  it('sets the plugin label to Mermaid Helper', () => {
    const api = makeExtensionApi();
    extension(api);
    assert.ok(api.setLabel.mock.calls.length >= 1);
    assert.equal(api.setLabel.mock.calls[0].arguments[0], 'Mermaid Helper');
  });
});
