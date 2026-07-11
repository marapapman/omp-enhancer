import test from 'node:test';
import assert from 'node:assert/strict';

import { readRuntimePolicy, resolveGateMode, resolveRouterMode, useEnforcedRoutePlan } from '../src/runtime-policy.js';
import { routeNaturalLanguageTask } from '../src/router.js';

test('runtime policy defaults to observe-first routing and gate semantics', () => {
  assert.deepEqual(readRuntimePolicy({}), {
    routerMode: 'observe',
    gateMode: 'observe',
    loopMode: 'legacy',
    unsafeGatePrompts: false,
  });
});

test('observe and enforce align canonical security remediation with the descriptor policy', () => {
  const prompt = '修复登录接口的权限绕过风险并补测试。';
  const observed = routeNaturalLanguageTask({ prompt, routerMode: 'observe' });
  const enforced = routeNaturalLanguageTask({ prompt, routerMode: 'enforce' });

  assert.equal(observed.intent, 'security-review');
  assert.equal(observed.routeObservation.intentDisagrees, false);
  assert.equal(observed.routeObservation.resourceDisagrees, true);
  assert.equal(observed.routeObservation.disagrees, true);
  assert.equal(observed.routeObservation.effectiveResourceSource, 'descriptor-policy');
  assert.equal(observed.routePlan.legacyIntent, 'security-review');
  assert.equal(enforced.intent, 'security-review');
  assert.equal(enforced.routeObservation, null);
  assert.ok(enforced.routePlan.gateRequirements.some((gate) => gate.key === 'security-evidence'));
});

test('runtime policy reads every documented rollout switch and rejects invalid values', () => {
  assert.deepEqual(readRuntimePolicy({
    OMP_ROUTER_V2_MODE: 'enforce',
    OMP_GATE_RECOVERY_MODE: 'legacy',
    OMP_LOOP_GUARD_MODE: 'disabled',
    OMP_DEBUG_GATES_UNSAFE_PROMPTS: '1',
  }), {
    routerMode: 'enforce',
    gateMode: 'legacy',
    loopMode: 'disabled',
    unsafeGatePrompts: true,
  });
  assert.equal(resolveRouterMode('invalid', {}), 'observe');
  assert.equal(resolveGateMode('invalid', {}), 'observe');
  assert.equal(useEnforcedRoutePlan({ routePlan: {} }, { OMP_GATE_RECOVERY_MODE: 'enforce' }), true);
  assert.equal(useEnforcedRoutePlan({ routePlan: {} }, { OMP_GATE_RECOVERY_MODE: 'observe' }), false);
});
