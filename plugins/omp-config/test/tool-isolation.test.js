import test from 'node:test';
import assert from 'node:assert/strict';

import registerOmpConfig from '../index.js';

test('config tools are opt-in and declare their real approval tier', () => {
  const tools = [];
  const optional = (schema) => ({ type: 'optional', schema });
  const pi = {
    zod: {
      z: {
        string: () => ({ type: 'string', optional() { return optional(this); } }),
        boolean: () => ({ type: 'boolean', optional() { return optional(this); } }),
        optional,
        object: (shape) => ({ type: 'object', shape }),
      },
    },
    setLabel() {},
    registerTool(tool) { tools.push(tool); },
  };

  registerOmpConfig(pi);

  assert.deepEqual(
    Object.fromEntries(tools.map((tool) => [tool.name, {
      defaultInactive: tool.defaultInactive,
      approval: tool.approval,
    }])),
    {
      omp_config_doctor: { defaultInactive: true, approval: 'read' },
      omp_config_sync_workflow_context: { defaultInactive: true, approval: 'write' },
      omp_config_assets: { defaultInactive: true, approval: 'read' },
      omp_config_plan: { defaultInactive: true, approval: 'read' },
    },
  );
});
