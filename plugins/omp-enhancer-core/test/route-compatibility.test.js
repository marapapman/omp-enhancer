import test from 'node:test';
import assert from 'node:assert/strict';

import { routedIntents, routeByIntent } from '../src/router.js';

const compatibilityCases = [
  ['agentic.simple', 'unknown', 'agentic.simple', 'answer'],
  ['writing.pending', 'writing.pending', 'writing.pending', 'modify'],
  ['writing.zh', 'writing.zh', 'writing.zh', 'modify'],
  ['writing.en', 'writing.en', 'writing.en', 'modify'],
  ['writing.latex', 'writing.latex', 'writing.latex', 'modify'],
  ['writing.markdown', 'writing.markdown', 'writing.markdown', 'modify'],
  ['doc.convert.word', 'doc.convert.word', 'doc.convert.word', 'modify'],
  ['factcheck.document', 'fact-check', 'factcheck.document', 'inspect'],
  ['code.dev', 'implementation-with-tests', 'code.dev', 'modify'],
  ['code.debug', 'diagnosis', 'code.debug', 'diagnose'],
  ['code.test', 'testing', 'code.test', 'execute'],
  ['code.review', 'bug-audit', 'code.review', 'inspect'],
  ['omp.plugin', 'config-assets', 'omp.plugin', 'inspect'],
  ['security.review', 'security-review', 'security.review', 'inspect'],
  ['design.visual', 'design.visual', 'design.visual', 'create'],
  ['config-assets', 'config-assets', 'omp.plugin', 'inspect'],
  ['fact-check', 'fact-check', 'factcheck.document', 'inspect'],
  ['bug-audit', 'bug-audit', 'code.review', 'inspect'],
  ['diagnosis', 'diagnosis', 'code.debug', 'diagnose'],
  ['release', 'release', 'agentic.simple', 'release'],
  ['security-review', 'security-review', 'security.review', 'inspect'],
  ['implementation-with-tests', 'implementation-with-tests', 'code.dev', 'modify'],
  ['testing', 'testing', 'code.test', 'execute'],
  ['unknown', 'unknown', 'agentic.simple', 'answer'],
];

test('the compatibility matrix covers every advertised routed intent exactly once', () => {
  const covered = compatibilityCases.map(([intent]) => intent);
  assert.deepEqual([...covered].sort(), [...routedIntents].sort());
  assert.equal(new Set(covered).size, covered.length, 'compatibility matrix contains duplicate intents');
});

test('every public canonical and legacy intent compiles one advisory plan', async (t) => {
  for (const [inputIntent, expectedIntent, expectedWorkflowRoute, expectedOperation] of compatibilityCases) {
    await t.test(inputIntent, () => {
      const route = routeByIntent(inputIntent, { source: 'compatibility-test' });
      const label = inputIntent + ': ';
      assert.equal(route.intent, expectedIntent, label + 'wrong intent projection');
      assert.equal(route.workflowRoute, expectedWorkflowRoute, label + 'wrong workflow projection');
      assert.equal(route.taskDescriptor?.operation, expectedOperation, label + 'wrong descriptor operation');
      assert.deepEqual(route.routePlan?.steps, route.taskDescriptor?.phases, label + 'steps diverged from descriptor');
      assert.equal(route.routePlan?.mode, 'advisory', label + 'wrong mode');
      assert.equal(route.routePlan?.autoContinue, false, label + 'unexpected auto continuation');
      assert.equal(Object.hasOwn(route.routePlan, 'gateRequirements'), false, label + 'legacy gate field survived');
      assert.equal(route.source, 'compatibility-test');
    });
  }
});

test('testing is a focused advisory route without audit roles', () => {
  const route = routeByIntent('testing', { source: 'compatibility-test', auditMode: 'focused' });
  assert.equal(route.intent, 'testing');
  assert.equal(route.workflowRoute, 'code.test');
  assert.equal(route.taskDescriptor?.operation, 'execute');
  assert.equal(route.taskDescriptor?.complexity, 'focused');
  assert.deepEqual(route.routePlan.skills, ['verification-before-completion']);
  assert.deepEqual(route.routePlan.tools, ['omp_test_report']);
  assert.deepEqual(route.routePlan.roles, []);
  assert.ok(route.routePlan.qualityChecks.includes('test-evidence'));
  assert.equal(Object.hasOwn(route.routePlan, 'gateRequirements'), false);
});

test('advisory routing preserves compatibility aliases without enforcement fields', () => {
  for (const [intent] of compatibilityCases) {
    const route = routeByIntent(intent, { source: 'compatibility-test' });
    assert.equal(typeof route.intent, 'string', intent);
    assert.ok('agent' in route, intent + ': missing agent field');
    assert.ok(Array.isArray(route.requiredSkills), intent + ': missing deprecated skill alias');
    assert.ok(Array.isArray(route.requiredTools), intent + ': missing deprecated tool alias');
    assert.ok(Array.isArray(route.requiredSubagents), intent + ': missing deprecated role alias');
    assert.equal(typeof route.workflowRoute, 'string', intent + ': missing workflowRoute');
    assert.equal(route.workflowMode, 'advisory', intent + ': wrong workflowMode');
    assert.equal(route.advisoryOnly, true, intent + ': advisoryOnly must be true');
    assert.equal(route.autoContinue, false, intent + ': autoContinue must be false');
    assert.equal(Object.hasOwn(route, 'gateMode'), false, intent + ': legacy gateMode survived');
    assert.ok(route.taskDescriptor && typeof route.taskDescriptor === 'object', intent + ': missing descriptor');
    assert.ok(route.routePlan && typeof route.routePlan === 'object', intent + ': missing plan');
    assert.deepEqual(route.requiredSkills, route.routePlan.skills, intent + ': skill alias mismatch');
    assert.deepEqual(route.requiredTools, route.routePlan.tools, intent + ': tool alias mismatch');
  }
});

test('routeByIntent normalizes external descriptors into advisory metadata', () => {
  const untrusted = {
    version: 99,
    operation: 'answer',
    domains: ['general', 'not-a-domain'],
    constraints: {
      workspaceWrite: 'forbidden',
      testExecution: 'forbidden',
      networkAccess: 'forbidden',
      externalWrite: 'forbidden',
      subagents: 'forbidden',
    },
    capabilities: ['fs.write', 'tests.execute', 'external.write', 'subagents'],
    phases: [
      { kind: 'modify', domain: 'code' },
      { kind: 'verify', domain: 'tests' },
      { kind: 'release', domain: 'plugin' },
    ],
  };

  const route = routeByIntent('bug-audit', { taskDescriptor: untrusted });
  assert.notEqual(route.taskDescriptor, untrusted);
  assert.equal(route.taskDescriptor.version, 1);
  assert.deepEqual(route.taskDescriptor.domains, ['general']);
  assert.deepEqual(route.taskDescriptor.capabilities, []);
  assert.deepEqual(route.taskDescriptor.phases, untrusted.phases);
  assert.deepEqual(route.routePlan.steps, route.taskDescriptor.phases);
  assert.deepEqual(route.routePlan.roles, []);
  assert.deepEqual(route.requiredSkills, route.routePlan.skills);
  assert.deepEqual(route.requiredTools, route.routePlan.tools);
  assert.deepEqual(route.requiredSubagents, []);
  assert.equal(route.routePlan.roles.length, 0);
  assert.equal(route.routePlan.mode, 'advisory');
  assert.equal(route.routePlan.autoContinue, false);
});
