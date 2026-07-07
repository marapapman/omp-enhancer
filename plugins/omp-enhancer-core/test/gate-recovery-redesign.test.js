import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import registerCoreEnhancer from '../index.js';
import {
  createGateRecoveryState,
  recordGateRecovery,
  serializeGateRecoveryState,
  readGateRecoveryState,
} from '../src/gate-recovery.js';
import { appendDebugLog, buildDebugRecord, debugLogPath } from '../src/debug-logger.js';

class FakePi {
  constructor(entries = []) {
    this.tools = new Map();
    this.eventHandlers = [];
    this.entries = entries;
    this.labels = [];
    const z = fakeZod();
    this.z = z;
    this.zod = { z };
  }

  setLabel(label) { this.labels.push(label); }
  registerTool(tool) { this.tools.set(tool.name, tool); }
  registerCommand() {}
  on(event, handler) { this.eventHandlers.push({ event, handler }); }
  appendEntry(customType, data) { this.entries.push({ type: 'custom', customType, data }); }
}

test('gate recovery escalates by gate key and reason code', () => {
  const state = createGateRecoveryState();
  const first = recordGateRecovery(state, {
    gateKey: 'writing.zh:prework:edit',
    reasonCode: 'missing_skill_read',
    doNext: 'read skill://plain-chinese-writing',
    doNot: 'repeat edit before the read returns',
    after: 'continue the original task',
  });
  const second = recordGateRecovery(state, {
    gateKey: 'writing.zh:prework:edit',
    reasonCode: 'missing_skill_read',
    doNext: 'read skill://plain-chinese-writing',
    doNot: 'repeat edit before the read returns',
    after: 'continue the original task',
  });
  const third = recordGateRecovery(state, {
    gateKey: 'writing.zh:prework:edit',
    reasonCode: 'missing_skill_read',
    doNext: 'read skill://plain-chinese-writing',
    doNot: 'repeat edit before the read returns',
    after: 'continue the original task',
  });

  assert.equal(first.level, 'coach');
  assert.match(first.context, /^RECOVERY\nReason: missing_skill_read/m);
  assert.equal(second.level, 'recover');
  assert.match(second.context, /^RECOVERY\nReason: missing_skill_read/m);
  assert.equal(third.level, 'loop-breaker');
  assert.match(third.context, /^LOOP_BREAKER\nReason: missing_skill_read/m);
  assert.match(third.context, /Stop: repeat edit before the read returns/);
  assert.match(third.context, /Limit: 5 lines/);

  const restored = readGateRecoveryState(serializeGateRecoveryState(state));
  assert.equal(restored.attempts[0].count, 3);
});

test('pre-work missing skills coach instead of hard-blocking the tool', async () => {
  const entries = [];
  const pi = new FakePi(entries);
  registerCoreEnhancer(pi);
  const ctx = extensionContext(entries);

  await event(pi, 'session_start')({}, ctx);
  await event(pi, 'before_agent_start')(
    { prompt: '把这句话改成朴素直接的中文：我们需要进一步推动配置层面的优化与能力沉淀。' },
    ctx,
  );

  const result = await event(pi, 'tool_call')(
    { toolName: 'edit', input: { file: 'draft.md', old: 'x', new: 'y' } },
    ctx,
  );

  assert.equal(result?.block, false);
  assert.equal(result.reasonCode, 'missing_skill_read');
  assert.match(result.additionalContext, /^RECOVERY\nReason: missing_skill_read/m);
  assert.match(result.additionalContext, /Do next: read skill:\/\/plain-chinese-writing/);
  assert.doesNotMatch(result.additionalContext, /Tiny smart-gate override/);
});

test('debug logger writes jsonl records only when OMP_DEBUG_GATES is enabled', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'omp-core-debug-'));
  try {
    const disabled = await appendDebugLog({
      cwd,
      kind: 'routes',
      record: buildDebugRecord({ kind: 'routes', prompt: 'full prompt', route: { intent: 'unknown', workflowRoute: 'agentic.simple' } }),
      env: {},
    });
    assert.equal(disabled.written, false);

    const enabled = await appendDebugLog({
      cwd,
      kind: 'routes',
      record: buildDebugRecord({ kind: 'routes', prompt: 'full prompt', route: { intent: 'unknown', workflowRoute: 'agentic.simple' } }),
      env: { OMP_DEBUG_GATES: '1' },
    });
    assert.equal(enabled.written, true);
    assert.equal(enabled.file, debugLogPath({ cwd, kind: 'routes' }));
    const [line] = (await readFile(enabled.file, 'utf8')).trim().split('\n');
    const parsed = JSON.parse(line);
    assert.equal(parsed.prompt, 'full prompt');
    assert.equal(parsed.workflowRoute, 'agentic.simple');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('OMP_DEBUG_GATES integration writes routes gates and loops jsonl files', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'omp-core-debug-integration-'));
  const previous = process.env.OMP_DEBUG_GATES;
  process.env.OMP_DEBUG_GATES = '1';
  try {
    const entries = [];
    const pi = new FakePi(entries);
    registerCoreEnhancer(pi);
    const ctx = extensionContext(entries, cwd);

    await event(pi, 'session_start')({}, ctx);
    await event(pi, 'before_agent_start')({ prompt: '把这句话改成朴素直接的中文：需要推动能力沉淀。' }, ctx);
    await event(pi, 'tool_call')({ toolName: 'edit', input: { file: 'draft.md' } }, ctx);
    await event(pi, 'message_update')(
      {
        assistantMessageEvent: {
          type: 'text_delta',
          delta: '我需要继续检查这个问题。 我需要继续检查这个问题。 我需要继续检查这个问题。',
          contentIndex: 0,
        },
      },
      ctx,
    );

    const routeLog = JSON.parse((await readFile(debugLogPath({ cwd, kind: 'routes' }), 'utf8')).trim().split('\n').at(-1));
    const gateLog = JSON.parse((await readFile(debugLogPath({ cwd, kind: 'gates' }), 'utf8')).trim().split('\n').at(-1));
    const loopLog = JSON.parse((await readFile(debugLogPath({ cwd, kind: 'loops' }), 'utf8')).trim().split('\n').at(-1));

    assert.equal(routeLog.kind, 'routes');
    assert.equal(routeLog.workflowRoute, 'writing.zh');
    assert.equal(gateLog.kind, 'gates');
    assert.equal(gateLog.reasonCode, 'missing_skill_read');
    assert.equal(gateLog.payload.level, 'coach');
    assert.equal(loopLog.kind, 'loops');
    assert.ok(loopLog.reasonCode);
    assert.match(loopLog.payload.reason, /Repeated/);
  } finally {
    if (previous === undefined) delete process.env.OMP_DEBUG_GATES;
    else process.env.OMP_DEBUG_GATES = previous;
    await rm(cwd, { recursive: true, force: true });
  }
});


function event(pi, name) {
  const found = pi.eventHandlers.find((handler) => handler.event === name);
  if (!found) throw new Error(`Missing event ${name}`);
  return found.handler;
}

function extensionContext(entries = [], cwd = process.cwd()) {
  return {
    cwd,
    sessionManager: { getBranch: () => entries },
    ui: { notify: async () => {} },
  };
}

function fakeZod() {
  const chain = () => ({ optional: chain, default: chain, array: chain });
  return {
    object: () => chain(),
    string: () => chain(),
    array: () => chain(),
    boolean: () => chain(),
  };
}
