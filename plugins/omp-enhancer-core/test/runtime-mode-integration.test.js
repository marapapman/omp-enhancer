import test from 'node:test';
import assert from 'node:assert/strict';

import registerCoreEnhancer from '../index.js';

test('enforce gate mode consumes RoutePlan resources for focused read-only review', async () => {
  await withEnv({ OMP_GATE_RECOVERY_MODE: 'enforce', OMP_ROUTER_V2_MODE: 'enforce' }, async () => {
    const { pi, ctx } = await startRuntime(
      '检查路由和门禁逻辑是否合理，只报告问题和优化建议，不要修改文件。',
    );
    const stopped = await event(pi, 'session_stop')({ output: '只读审查完成。' }, ctx);
    const state = latestState(pi);

    assert.equal(stopped, undefined);
    assert.equal(state.lastRoute.taskDescriptor.constraints.workspaceWrite, 'forbidden');
    assert.deepEqual(state.lastRoute.routePlan.requiredSubagents, []);
    assert.equal(state.gateController.phase, 'satisfied');
  });
});

test('loop modes have live disabled, observe, and enforce behavior', async () => {
  const repeated = [
    'The model is repeating the same validation request.',
    'The model is repeating the same validation request.',
    'The model is repeating the same validation request.',
  ].join('\n');

  await withEnv({ OMP_LOOP_GUARD_MODE: 'disabled' }, async () => {
    const { pi, ctx } = await startRuntime('Diagnose this issue only.');
    assert.equal(await event(pi, 'assistant_delta')({ delta: repeated }, ctx), undefined);
  });

  await withEnv({ OMP_LOOP_GUARD_MODE: 'observe' }, async () => {
    const { pi, ctx } = await startRuntime('Diagnose this issue only.');
    assert.equal(await event(pi, 'assistant_delta')({ delta: repeated }, ctx), undefined);
    assert.equal(latestState(pi).loopGuard.recoveryPending, false);
  });

  await withEnv({ OMP_LOOP_GUARD_MODE: 'enforce' }, async () => {
    const { pi, ctx } = await startRuntime('Diagnose this issue only.');
    const result = await event(pi, 'assistant_delta')({ delta: repeated }, ctx);
    assert.equal(result?.abort, true);
    assert.equal(result?.autoContinue, false);
  });
});

test('observe mode applies explicit no-test and no-subagent ceilings without impossible completion gates', async () => {
  await withEnv({ OMP_GATE_RECOVERY_MODE: 'observe', OMP_ROUTER_V2_MODE: 'observe' }, async () => {
    for (const prompt of [
      '修复路由逻辑，不要使用子代理。',
      'Fix the parser but do not run tests.',
      '润色这段文章，不要使用子代理。',
    ]) {
      const { pi, ctx } = await startRuntime(prompt);
      const state = latestState(pi);
      const requiredSkills = state.lastRoute.routePlan.requiredSkills;
      for (const skill of requiredSkills) {
        await event(pi, 'tool_result')({
          type: 'tool_result',
          toolCallId: `read-${skill}`,
          toolName: 'read',
          input: { path: `skill://${skill}` },
          content: [{ type: 'text', text: `${skill} instructions` }],
          isError: false,
        }, ctx);
      }
      const output = [
        'SKILL_USAGE',
        'Required:',
        ...requiredSkills.map((skill) => `- ${skill}`),
        'Loaded:',
        ...requiredSkills.map((skill) => `- ${skill}`),
        'REVIEW_EVIDENCE',
        'Scope: requested focused work',
        'Findings: no unresolved blockers',
        'Verdict: PASS',
      ].join('\n');
      const stopped = await event(pi, 'session_stop')({ output }, ctx);

      assert.equal(stopped, undefined, prompt);
      assert.equal(latestState(pi).gateController.phase, 'satisfied', prompt);
    }
  });
});

async function withEnv(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function startRuntime(prompt) {
  const pi = new FakePi();
  registerCoreEnhancer(pi);
  const ctx = {
    sessionManager: { getBranch: () => pi.entries },
    ui: { notify: () => undefined },
    hasUI: false,
  };
  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')({ prompt }, ctx);
  return { pi, ctx };
}

function latestState(pi) {
  return pi.entries.findLast((entry) => entry.customType === 'omp-enhancer-core.state')?.data;
}

function event(pi, name) {
  const found = pi.handlers.find((item) => item.name === name);
  assert.ok(found, `missing ${name} handler`);
  return found.handler;
}

class FakePi {
  constructor() {
    this.entries = [];
    this.handlers = [];
    const z = fakeZod();
    this.z = z;
    this.zod = { z };
  }
  setLabel() {}
  registerTool() {}
  on(name, handler) { this.handlers.push({ name, handler }); }
  appendEntry(customType, data) { this.entries.push({ type: 'custom', customType, data }); }
}

function fakeZod() {
  const optional = (schema) => ({ ...schema, optional: () => ({ type: 'optional', schema }) });
  return {
    object: (shape) => optional({ type: 'object', shape }),
    string: () => optional({ type: 'string' }),
    boolean: () => optional({ type: 'boolean' }),
    array: (schema) => optional({ type: 'array', schema }),
    enum: (values) => optional({ type: 'enum', values }),
    optional: (schema) => ({ type: 'optional', schema }),
  };
}
