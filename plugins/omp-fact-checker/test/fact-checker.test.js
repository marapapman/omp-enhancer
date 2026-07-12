import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import factCheckerExtension, {
  buildFactCheckPlan,
  collectLocalEvidence,
  crossCheckEvidence,
  validateFactCheckGate,
} from '../index.js';
import { fetchProviderEvidence } from '../src/providers.js';

const factSkill = (name) => readFileSync(
  new URL(`../skills/${name}/SKILL.md`, import.meta.url),
  'utf8',
);

class FakeOmp {
  constructor() {
    this.tools = new Map();
    this.commands = new Map();
    const z = fakeZod();
    this.zod = { z };
  }

  registerTool(tool) {
    this.tools.set(tool.name, tool);
  }

  registerCommand(name, command) {
    this.commands.set(name, command);
  }
}

test('registers fact-check tools and command', () => {
  const omp = new FakeOmp();
  factCheckerExtension(omp);

  assert.deepEqual([...omp.tools.keys()], [
    'fact_check_analyze',
    'fact_check_evidence',
    'fact_check_report',
    'fact_check_gate',
  ]);
  assert.equal(omp.commands.has('fact-check'), true);
});

test('fact-check skills prescribe one bounded local pass without automatic lane retries', () => {
  const workflow = factSkill('fact-checking');
  const claims = factSkill('claim-extraction');
  const sources = factSkill('source-evaluation');
  const citations = factSkill('citation-authenticity');

  assert.match(workflow, /one bounded pass/i);
  assert.match(workflow, /LOCAL_UNVERIFIED/);
  assert.match(workflow, /plan for no more than six calls/i);
  assert.match(workflow, /Do not repeat equivalent glob patterns/i);
  assert.match(workflow, /failed or empty\s+last lookup ends the local pass/i);
  assert.match(workflow, /do not (?:automatically )?(?:retry|start another|add another)/i);
  assert.match(workflow, /broad|high-risk|explicitly requests/i);
  assert.match(claims, /focused|bounded/i);
  assert.match(sources, /local/i);
  assert.match(sources, /INSUFFICIENT|LOCAL_UNVERIFIED/);
  assert.match(citations, /LOCAL_UNVERIFIED/);
  assert.doesNotMatch(workflow, /FACT_EVIDENCE_B or CROSS_CHECK_DEGRADED/);
});

test('buildFactCheckPlan extracts prioritized factual claims', () => {
  const plan = buildFactCheckPlan({
    text: 'The dataset was released in 2024. The method improves accuracy by 12%. This is a nice paragraph.',
  });

  assert.equal(plan.claims.length, 2);
  assert.equal(plan.claims[0].category, 'date');
  assert.equal(plan.claims[1].category, 'numeric');
  assert.deepEqual(plan.requiredStages.includes('fact-cross-checker'), true);
});

test('buildFactCheckPlan computes risk from the untruncated text', () => {
  const text = 'The stable value is 42. The medical dose is 5 mg.';
  const plan = buildFactCheckPlan({ text, maxClaims: 1 });

  assert.equal(plan.claims.length, 1);
  assert.equal(plan.riskLevel, 'high');
  assert.ok(plan.requiredStages.includes('fact-researcher-a'));
  assert.ok(plan.requiredStages.includes('fact-researcher-b'));
});

test('local evidence lanes cross-check to agreement and conflict', () => {
  const claims = buildFactCheckPlan({ text: 'The method improves accuracy by 12%.' }).claims;
  const supported = collectLocalEvidence({
    claims,
    evidenceRecords: [{ claimId: 'FC-001', lane: 'A', status: 'SUPPORTED', quote: '12%', source: 'table 1' }],
    lane: 'A',
  });
  const contradicted = collectLocalEvidence({
    claims,
    evidenceRecords: [{ claimId: 'FC-001', lane: 'B', status: 'CONTRADICTED', quote: '8%', source: 'appendix' }],
    lane: 'B',
  });

  const cross = crossCheckEvidence({ claims, evidenceRecords: [...supported, ...contradicted] });

  assert.equal(cross[0].status, 'CONFLICTED');
});

test('fact advisory review reports missing plan, evidence, cross-check, review, report, and usage', () => {
  const failed = validateFactCheckGate({ finalOutput: 'FACT_CHECK_PLAN\nFACT_CHECK_REPORT' });
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.missing.includes('FACT_REVIEW'), true);

  const passed = validateFactCheckGate({
    finalOutput: [
      'FACT_CHECK_PLAN',
      'FACT_EVIDENCE_A',
      'FACT_EVIDENCE_B',
      'FACT_CROSS_CHECK',
      'FACT_REVIEW',
      'FACT_CHECK_REPORT',
      'FACT_CHECK_USAGE',
    ].join('\n'),
  });
  assert.equal(passed.ok, true);
});

test('the registered review reports workflow inconsistencies without failing tool execution', async () => {
  const omp = new FakeOmp();
  factCheckerExtension(omp);
  const ctx = { cwd: process.cwd(), sessionManager: {} };
  const completeOutput = (verdict = 'SUPPORTED') => [
    'FACT_CHECK_PLAN',
    'FACT_EVIDENCE_A',
    '- FC-001: SUPPORTED',
    'FACT_EVIDENCE_B',
    '- FC-001: SUPPORTED',
    'FACT_CROSS_CHECK',
    '- FC-001: AGREED',
    'FACT_REVIEW',
    'FACT_CHECK_REPORT',
    `- FC-001: ${verdict}`,
    'FACT_CHECK_USAGE',
  ].join('\n');

  const premature = await omp.tools.get('fact_check_gate').execute(
    'premature-gate', { finalOutput: completeOutput(), riskLevel: 'low' }, undefined, undefined, ctx,
  );
  assert.equal(premature.isError, false);
  assert.equal(premature.details.advisoryOnly, true);
  assert.equal(premature.details.complete, false);
  assert.ok(premature.details.missingObserved.includes('host FACT_CHECK_PLAN'));

  const analyzed = await omp.tools.get('fact_check_analyze').execute(
    'observed-plan', { text: 'The stable fact is 42.' }, undefined, undefined, ctx,
  );
  const claims = analyzed.details.claims;
  const evidenceA = await omp.tools.get('fact_check_evidence').execute(
    'observed-evidence-a', {
      claims,
      lane: 'A',
      allowNetwork: false,
      evidenceRecords: [{ claimId: 'FC-001', lane: 'A', status: 'SUPPORTED', quote: '42', source: 'docs/evidence.md' }],
    }, undefined, undefined, ctx,
  );
  const evidenceB = await omp.tools.get('fact_check_evidence').execute(
    'observed-evidence-b', {
      claims,
      lane: 'B',
      allowNetwork: false,
      evidenceRecords: [{ claimId: 'FC-001', lane: 'B', status: 'SUPPORTED', quote: '42', source: 'spec.md' }],
    }, undefined, undefined, ctx,
  );
  const evidenceRecords = [...evidenceA.details.records, ...evidenceB.details.records];
  const mismatchedEvidence = await omp.tools.get('fact_check_report').execute(
    'mismatched-evidence-report', {
      claims,
      evidenceRecords: evidenceRecords.map((record, index) => (
        index === 0 ? { ...record, source: 'fabricated.md' } : record
      )),
    }, undefined, undefined, ctx,
  );
  assert.equal(mismatchedEvidence.isError, false);
  assert.ok(mismatchedEvidence.details.warnings.some((warning) => /differs from earlier session telemetry/i.test(warning)));

  const mismatchedCrossCheck = await omp.tools.get('fact_check_report').execute(
    'mismatched-cross-check-report', {
      claims,
      evidenceRecords,
      crossChecks: [{
        claimId: 'FC-001',
        status: 'CONFLICTED',
        laneA: 'SUPPORTED',
        laneB: 'CONTRADICTED',
        conflicts: [],
      }],
    }, undefined, undefined, ctx,
  );
  assert.equal(mismatchedCrossCheck.isError, false);
  assert.ok(mismatchedCrossCheck.details.warnings.some((warning) => /deterministic result/i.test(warning)));

  const report = await omp.tools.get('fact_check_report').execute(
    'observed-report', { claims, evidenceRecords }, undefined, undefined, ctx,
  );
  assert.equal(report.isError, false);

  const passed = await omp.tools.get('fact_check_gate').execute(
    'observed-gate', { finalOutput: completeOutput(), riskLevel: 'low' }, undefined, undefined, ctx,
  );
  assert.equal(passed.isError, false);
  assert.equal(passed.details.ok, true);
  assert.deepEqual(passed.details.missingObserved, []);

  const inconsistent = await omp.tools.get('fact_check_gate').execute(
    'inconsistent-gate', { finalOutput: completeOutput('CONTRADICTED'), riskLevel: 'low' }, undefined, undefined, ctx,
  );
  assert.equal(inconsistent.isError, false);
  assert.equal(inconsistent.details.complete, false);
  assert.ok(inconsistent.details.missingObserved.includes('final verdicts matching host FACT_CHECK_REPORT'));

  const conflicting = await omp.tools.get('fact_check_gate').execute(
    'conflicting-gate', {
      finalOutput: `${completeOutput()}\nFC-001: CONTRADICTED`,
      riskLevel: 'low',
    }, undefined, undefined, ctx,
  );
  assert.equal(conflicting.isError, false);
  assert.ok(conflicting.details.missingObserved.includes('final verdicts matching host FACT_CHECK_REPORT'));

  const duplicated = await omp.tools.get('fact_check_gate').execute(
    'duplicated-gate', {
      finalOutput: `${completeOutput()}\nFC-001: SUPPORTED`,
      riskLevel: 'low',
    }, undefined, undefined, ctx,
  );
  assert.equal(duplicated.isError, false);
  assert.ok(duplicated.details.missingObserved.includes('final verdicts matching host FACT_CHECK_REPORT'));
});

test('registered workflow supports stateless advisory use and isolates optional session telemetry', async () => {
  const omp = new FakeOmp();
  factCheckerExtension(omp);
  const analyze = omp.tools.get('fact_check_analyze');
  const gate = omp.tools.get('fact_check_gate');
  const noIdentity = await analyze.execute(
    'no-identity', { text: 'The stable fact is 42.' }, undefined, undefined, { cwd: process.cwd() },
  );
  assert.equal(noIdentity.isError, false);
  assert.equal(noIdentity.details.telemetry, 'stateless');

  const managerA = {};
  const managerB = {};
  const ctxA = { cwd: process.cwd(), sessionManager: managerA };
  const ctxB = { cwd: process.cwd(), sessionManager: managerB };
  await analyze.execute('session-a-plan', { text: 'The stable fact is 42.' }, undefined, undefined, ctxA);
  const isolated = await gate.execute(
    'session-b-gate', {
      finalOutput: [
        'FACT_CHECK_PLAN',
        'FACT_EVIDENCE_A',
        'FACT_CROSS_CHECK',
        'FACT_REVIEW',
        'FACT_CHECK_REPORT',
        'FC-001: SUPPORTED',
        'FACT_CHECK_USAGE',
      ].join('\n'),
      riskLevel: 'low',
    }, undefined, undefined, ctxB,
  );
  assert.equal(isolated.isError, false);
  assert.equal(isolated.details.complete, false);
  assert.ok(isolated.details.missingObserved.includes('host FACT_CHECK_PLAN'));
});

test('analyze rejects ambiguous path plus text and gate ignores a lower model risk', async () => {
  const omp = new FakeOmp();
  factCheckerExtension(omp);
  const ctx = { cwd: process.cwd(), sessionManager: {} };
  const analyze = omp.tools.get('fact_check_analyze');
  const ambiguous = await analyze.execute(
    'ambiguous-input', {
      path: 'README.md',
      text: 'The stable fact is 42.',
    }, undefined, undefined, ctx,
  );
  assert.equal(ambiguous.isError, true);
  assert.match(ambiguous.content[0].text, /exactly one of text or path/i);

  const analyzed = await analyze.execute(
    'high-risk-plan', {
      text: 'The stable value is 42. The medical dose is 5 mg.',
      maxClaims: 1,
    }, undefined, undefined, ctx,
  );
  assert.equal(analyzed.details.riskLevel, 'high');
  const claims = analyzed.details.claims;
  const evidenceA = await omp.tools.get('fact_check_evidence').execute(
    'high-risk-evidence-a', {
      claims,
      lane: 'A',
      allowNetwork: false,
      evidenceRecords: [{
        claimId: 'FC-001',
        lane: 'A',
        status: 'SUPPORTED',
        quote: '42',
        source: 'a.md',
      }],
    }, undefined, undefined, ctx,
  );
  const report = await omp.tools.get('fact_check_report').execute(
    'high-risk-report', { claims, evidenceRecords: evidenceA.details.records }, undefined, undefined, ctx,
  );
  assert.equal(report.isError, false);
  const gated = await omp.tools.get('fact_check_gate').execute(
    'high-risk-gate', {
      finalOutput: [
        'FACT_CHECK_PLAN',
        'FACT_EVIDENCE_A',
        'FACT_CROSS_CHECK',
        'FACT_REVIEW',
        'FACT_CHECK_REPORT',
        'FC-001: SUPPORTED',
        'FACT_CHECK_USAGE',
      ].join('\n'),
      riskLevel: 'low',
    }, undefined, undefined, ctx,
  );
  assert.equal(gated.isError, false);
  assert.equal(gated.details.complete, false);
  assert.ok(gated.details.missingObserved.includes('host FACT_EVIDENCE_B'));
});

test('evidence rejects non-canonical statuses and unsupported deterministic citations', async () => {
  const omp = new FakeOmp();
  factCheckerExtension(omp);
  const ctx = { cwd: process.cwd(), sessionManager: {} };
  const analyzed = await omp.tools.get('fact_check_analyze').execute(
    'evidence-plan', { text: 'The stable fact is 42.' }, undefined, undefined, ctx,
  );
  const claims = analyzed.details.claims;
  const evidence = omp.tools.get('fact_check_evidence');

  const aliasStatus = await evidence.execute(
    'alias-status', {
      claims,
      lane: 'A',
      evidenceRecords: [{
        claimId: 'FC-001',
        lane: 'A',
        status: 'VERIFIED',
        quote: '42',
        source: 'a.md',
      }],
    }, undefined, undefined, ctx,
  );
  assert.equal(aliasStatus.isError, true);

  const emptyCitation = await evidence.execute(
    'empty-citation', {
      claims,
      lane: 'A',
      evidenceRecords: [{
        claimId: 'FC-001',
        lane: 'A',
        status: 'SUPPORTED',
        quote: '',
        source: '',
      }],
    }, undefined, undefined, ctx,
  );
  assert.equal(emptyCitation.isError, true);

  const insufficient = await evidence.execute(
    'insufficient-without-citation', {
      claims,
      lane: 'A',
      evidenceRecords: [{
        claimId: 'FC-001',
        lane: 'A',
        status: 'INSUFFICIENT',
      }],
    }, undefined, undefined, ctx,
  );
  assert.equal(insufficient.isError, false);
  assert.equal(insufficient.details.records[0].status, 'INSUFFICIENT');
});

test('fact report rejects malformed model-owned claim records instead of emitting undefined claims', async () => {
  const omp = new FakeOmp();
  factCheckerExtension(omp);
  const ctx = { cwd: process.cwd(), sessionManager: {} };
  await omp.tools.get('fact_check_analyze').execute(
    'valid-plan', { text: 'The stable fact is 42.' }, undefined, undefined, ctx,
  );
  const malformed = await omp.tools.get('fact_check_report').execute(
    'malformed-report', {
      claims: [{ id: 'FC-001', claim: 'The stable fact is 42.' }],
      evidenceRecords: [],
    }, undefined, undefined, ctx,
  );

  assert.equal(malformed.isError, true);
  assert.match(malformed.content[0].text, /claims.*id.*text/i);
  assert.doesNotMatch(malformed.content[0].text, /undefined/i);
});

test('provider evidence uses Crossref DOI endpoint with mock fetch', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return {
      ok: true,
      async json() {
        return {
          message: {
            title: ['A Test Paper'],
            published: { 'date-parts': [[2024]] },
          },
        };
      },
    };
  };
  const records = await fetchProviderEvidence({
    allowNetwork: true,
    providers: ['crossref'],
    claims: [{ id: 'FC-001', text: 'See DOI: 10.1234/example.paper for details.' }],
    fetchImpl,
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].provider, 'crossref');
  assert.match(calls[0], /api\.crossref\.org\/works\/10\.1234%2Fexample\.paper/);
});

function fakeZod() {
  const chain = {
    optional: () => chain,
  };
  return {
    string: () => chain,
    number: () => chain,
    boolean: () => chain,
    any: () => chain,
    enum: () => chain,
    array: () => chain,
    object: () => chain,
  };
}
