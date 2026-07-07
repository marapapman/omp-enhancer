import test from 'node:test';
import assert from 'node:assert/strict';

import factCheckerExtension, {
  buildFactCheckPlan,
  collectLocalEvidence,
  crossCheckEvidence,
  validateFactCheckGate,
} from '../index.js';
import { fetchProviderEvidence } from '../src/providers.js';

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

test('buildFactCheckPlan extracts prioritized factual claims', () => {
  const plan = buildFactCheckPlan({
    text: 'The dataset was released in 2024. The method improves accuracy by 12%. This is a nice paragraph.',
  });

  assert.equal(plan.claims.length, 2);
  assert.equal(plan.claims[0].category, 'date');
  assert.equal(plan.claims[1].category, 'numeric');
  assert.deepEqual(plan.requiredStages.includes('fact-cross-checker'), true);
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

test('fact gate requires plan, evidence, cross-check, review, report, and usage', () => {
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
