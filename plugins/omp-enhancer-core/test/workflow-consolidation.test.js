import test from 'node:test';
import assert from 'node:assert/strict';

import {
  workflowDefinitions,
  workflowRouteCatalog,
  workflowRouteNames,
} from '../src/workflows/catalog.js';
import { subagentPlans } from '../src/subagent-plans.js';
import { routeNaturalLanguageTask } from '../src/router.js';

const REQUIRED_WORKFLOWS = [
  'code.build',
  'research.technical',
  'network.design',
  'network.homelab',
  'network.review',
  'network.debug',
  'database.review',
  'database.change',
  'database.migration.repair',
  'performance.optimize',
  'ml.review',
  'ml.debug',
  'release.opensource',
  'marketing.campaign',
  'seo.audit',
];

test('catalog exposes the consolidated workflows and deliberately omits healthcare', () => {
  for (const id of REQUIRED_WORKFLOWS) {
    assert.ok(workflowRouteNames.includes(id), `missing workflow ${id}`);
  }
  assert.equal(workflowRouteNames.includes('healthcare.review'), false);
  assert.equal(workflowRouteNames.includes('communications.triage'), false);
});

test('existing generic workflows keep OMP native roles and namespace target-only audits', () => {
  assert.deepEqual(workflowRouteCatalog['code.plan'].roles, ['explore', 'plan']);
  assert.deepEqual(
    workflowRouteCatalog['code.dev'].roles,
    ['explore', 'plan', 'implementation-task', 'reviewer'],
  );
  assert.deepEqual(
    workflowRouteCatalog['code.review'].roles,
    ['explore', 'reviewer', 'omp-target-auditor'],
  );
  assert.deepEqual(workflowRouteCatalog['design.visual'].roles, ['designer']);
});

test('new workflows use bounded exact roles instead of legacy mini-workflow wrappers', () => {
  const expected = {
    'code.build': ['explore', 'plan', 'implementation-task', 'reviewer'],
    'research.technical': ['librarian'],
    'network.design': ['ecc-network-architect'],
    'network.homelab': ['ecc-network-architect'],
    'network.review': ['ecc-network-config-reviewer'],
    'network.debug': ['ecc-network-troubleshooter'],
    'database.review': ['omp-target-auditor'],
    'database.change': ['plan', 'implementation-task', 'reviewer'],
    'database.migration.repair': ['plan', 'implementation-task', 'reviewer'],
    'performance.optimize': ['explore', 'plan', 'implementation-task', 'reviewer'],
    'ml.review': ['omp-target-auditor'],
    'ml.debug': ['explore', 'plan', 'implementation-task', 'reviewer'],
    'release.opensource': [
      'ecc-opensource-forker',
      'ecc-opensource-sanitizer',
      'ecc-opensource-packager',
      'reviewer',
    ],
    'marketing.campaign': [],
    'seo.audit': [],
  };

  for (const [id, roles] of Object.entries(expected)) {
    const workflow = workflowRouteCatalog[id];
    assert.ok(workflow, `missing workflow ${id}`);
    assert.deepEqual(workflow.roles, roles, id);
  }

  const allRoles = new Set(workflowDefinitions.flatMap(({ roles }) => roles));
  for (const forbidden of [
    'task',
    'quick_task',
    'ecc-code-reviewer',
    'ecc-tdd-guide',
    'ecc-e2e-runner',
    'ecc-pr-test-analyzer',
    'ecc-performance-optimizer',
    'ecc-mle-reviewer',
    'ecc-pytorch-build-resolver',
    'ecc-healthcare-reviewer',
  ]) {
    assert.equal(allRoles.has(forbidden), false, forbidden);
  }
});

test('high-risk workflows define substantive composition, skills, and evidence contracts', () => {
  const contracts = {
    'code.build': {
      compose: ['code.debug', 'code.dev', 'code.test', 'code.review'],
      skills: ['build-toolchain-diagnostics', 'systematic-debugging'],
      evidence: ['exact build command', 'current failure evidence'],
    },
    'research.technical': {
      compose: ['code.plan', 'code.debug', 'research.web', 'factcheck.document'],
      skills: ['documentation-lookup'],
      evidence: ['version', 'signature', 'source'],
    },
    'database.migration.repair': {
      compose: ['code.debug', 'code.dev', 'code.test', 'security.review'],
      skills: ['database-migrations', 'postgres-patterns'],
      evidence: ['backup', 'rollback', 'migration state'],
    },
    'performance.optimize': {
      compose: ['code.plan', 'code.dev', 'code.test', 'code.review'],
      skills: ['benchmark-optimization-loop'],
      evidence: ['baseline', 'profile'],
    },
    'ml.review': {
      compose: ['code.review', 'code.test', 'security.review', 'factcheck.document'],
      skills: ['mle-workflow'],
      evidence: ['reproducibility', 'leakage', 'serving'],
    },
    'release.opensource': {
      compose: ['security.review', 'code.test', 'release.publish'],
      skills: ['opensource-pipeline'],
      evidence: ['staging', 'sanitization', 'publish'],
    },
    'marketing.campaign': {
      compose: ['research.web', 'factcheck.document', 'writing.zh', 'writing.en', 'design.visual'],
      skills: ['marketing-campaign', 'market-research'],
      evidence: ['fact', 'claim', 'language'],
    },
    'seo.audit': {
      compose: ['research.web', 'code.review', 'code.test', 'design.visual'],
      skills: ['seo'],
      evidence: ['crawl', 'index', 'render', 'evidence'],
    },
  };

  for (const [id, contract] of Object.entries(contracts)) {
    const workflow = workflowRouteCatalog[id];
    assert.ok(workflow, `missing workflow ${id}`);
    for (const field of ['composeWith', 'skills', 'evidence']) {
      const value = field === 'evidence'
        ? `${workflow.qualityChecks ?? ''} ${workflow.delegation ?? ''}`
        : workflow[field];
      const haystack = JSON.stringify(value ?? '').toLowerCase();
      const expected = field === 'composeWith' ? contract.compose : contract[field];
      for (const needle of expected) {
        assert.ok(haystack.includes(needle.toLowerCase()), `${id}.${field}: ${needle}`);
      }
    }
  }
});

test('legacy bug-audit projection uses the namespaced target auditor and test roles', () => {
  assert.deepEqual(
    subagentPlans.bugAudit.map(({ agent }) => agent),
    ['omp-target-auditor', 'test-planner', 'test-reviewer'],
  );
  const auditor = subagentPlans.bugAudit.find(({ agent }) => agent === 'omp-target-auditor');
  assert.ok(auditor.skills.includes('error-handling'));
  assert.ok(auditor.skills.includes('verification-before-completion'));
  assert.deepEqual(subagentPlans.patchReview.map(({ agent }) => agent), ['reviewer']);
});

test('an explicit no-subagent constraint also removes catalog roles from the route card', () => {
  const route = routeNaturalLanguageTask({
    prompt: '审查代码 bug，不要运行测试，不要使用 subagents，不要修改文件。',
  });

  assert.deepEqual(route.roles, []);
  assert.deepEqual(route.requiredSubagents, []);
  assert.match(route.routeCard, /Optional roles:\n- none/);
  assert.doesNotMatch(route.routeCard, /Optional roles:\n(?:- explore\n)?- reviewer/);
});
