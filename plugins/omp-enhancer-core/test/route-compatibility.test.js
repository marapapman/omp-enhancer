import test from 'node:test';
import assert from 'node:assert/strict';

import { routedIntents, routeByIntent } from '../src/router.js';

const compatibilityCases = [
  ['agentic.simple', 'unknown', 'agentic.simple', 'answer'],
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

test('every public canonical and legacy intent round-trips through one compiler', async (t) => {
  for (const [inputIntent, expectedIntent, expectedWorkflowRoute, expectedOperation] of compatibilityCases) {
    await t.test(inputIntent, () => {
      const route = routeByIntent(inputIntent, { source: 'compatibility-test' });
      assert.equal(route.intent, expectedIntent, `${inputIntent}: wrong legacy intent projection`);
      assert.equal(route.workflowRoute, expectedWorkflowRoute, `${inputIntent}: canonical route fell back to agentic.simple`);
      assert.equal(route.taskDescriptor?.operation, expectedOperation, `${inputIntent}: missing or wrong descriptor operation`);
      assert.deepEqual(
        route.routePlan?.phases,
        route.taskDescriptor?.phases,
        `${inputIntent}: legacy and v2 paths must share the same ordered phases`,
      );
      assert.equal(route.source, 'compatibility-test');
    });
  }
});

test('testing is a first-class focused route without bug-audit resources', () => {
  const route = routeByIntent('testing', { source: 'compatibility-test', auditMode: 'focused' });
  assert.equal(route.intent, 'testing');
  assert.equal(route.workflowRoute, 'code.test');
  assert.equal(route.taskDescriptor?.operation, 'execute');
  assert.equal(route.taskDescriptor?.complexity, 'focused');
  assert.deepEqual(route.requiredSkills, []);
  assert.deepEqual(route.requiredTools, []);
  assert.deepEqual(route.routePlan?.requiredSubagents, []);
  assert.ok(route.routePlan?.gateRequirements.some(({ key }) => key === 'test-evidence'));
});

test('v2 routing preserves the existing public route shape while adding descriptor fields', () => {
  for (const [intent] of compatibilityCases) {
    const route = routeByIntent(intent, { source: 'compatibility-test' });
    assert.equal(typeof route.intent, 'string', intent);
    assert.ok('agent' in route, `${intent}: missing legacy agent field`);
    assert.ok(Array.isArray(route.requiredSkills), `${intent}: missing legacy requiredSkills`);
    assert.ok(Array.isArray(route.requiredTools), `${intent}: missing legacy requiredTools`);
    assert.ok(Array.isArray(route.requiredSubagents), `${intent}: missing legacy requiredSubagents`);
    assert.equal(typeof route.workflowRoute, 'string', `${intent}: missing legacy workflowRoute`);
    assert.equal(typeof route.gateMode, 'string', `${intent}: missing legacy gateMode`);
    assert.ok(route.taskDescriptor && typeof route.taskDescriptor === 'object', `${intent}: missing taskDescriptor`);
    assert.ok(route.routePlan && typeof route.routePlan === 'object', `${intent}: missing routePlan`);
  }
});

test('routeByIntent normalizes an externally supplied TaskDescriptor before compilation', () => {
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
  assert.deepEqual(route.taskDescriptor.phases, [{ kind: 'answer', domain: 'general' }]);
  assert.deepEqual(route.routePlan.phases, route.taskDescriptor.phases);
  assert.deepEqual(route.routePlan.requiredSubagents, []);
  assert.deepEqual(route.requiredSkills, route.routePlan.requiredSkills);
  assert.deepEqual(route.requiredTools, route.routePlan.requiredTools);
  assert.deepEqual(route.requiredSubagents, []);
  assert.equal(route.shouldForkSubagents, false);
});
