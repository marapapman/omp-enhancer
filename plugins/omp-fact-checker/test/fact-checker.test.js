import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import factCheckerExtension, {
  buildFactCheckPlan,
  buildFactCheckReport,
  collectLocalEvidence,
  crossCheckEvidence,
  strictClaimVerdict,
  validateFactCheckGate,
} from '../index.js';
import { fetchProviderEvidence } from '../src/providers.js';

const factSkill = (name) => readFileSync(
  new URL(`../skills/${name}/SKILL.md`, import.meta.url),
  'utf8',
);

const factAgent = (name) => readFileSync(
  new URL(`../agents/${name}.md`, import.meta.url),
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
  for (const tool of omp.tools.values()) {
    assert.equal(tool.defaultInactive, true, `${tool.name} must be opt-in`);
    assert.equal(tool.approval, 'read', `${tool.name} must remain read-only`);
  }
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

test('fact researchers treat scholarly metadata as discovery rather than claim support', () => {
  for (const name of ['fact-researcher-a', 'fact-researcher-b']) {
    const agent = factAgent(name);
    assert.match(agent, /DOI.*Crossref.*DataCite.*OpenAlex.*Google Scholar/is);
    assert.match(agent, /metadata.*(?:discovery|identity)/is);
    assert.match(agent, /passage.*table.*dataset/is);
    assert.match(agent, /must not.*SUPPORTED|not sufficient.*SUPPORTED/is);
    assert.match(agent, /evidence-type.*freshness.*evidence-plan.*source-lineage/is);
  }
});

test('fact researcher A uses slow while researcher B uses plan', () => {
  const researcherA = factAgent('fact-researcher-a');
  const researcherB = factAgent('fact-researcher-b');

  assert.match(researcherA, /model:\s*\n\s*-\s*pi\/slow/);
  assert.match(researcherB, /model:\s*\n\s*-\s*pi\/plan/);
});

test('fact planner assigns claim-specific freshness and evidence requirements', () => {
  const agent = factAgent('fact-planner');

  assert.match(agent, /freshness.+CURRENT.*NOT_APPLICABLE/is);
  assert.match(agent, /independence and source-lineage requirements/i);
});

test('fact reviewer rejects unresolved or metadata-only claims from strict factual conclusions', () => {
  const agent = factAgent('fact-reviewer');

  assert.match(agent, /exact final wording/i);
  assert.match(agent, /metadata-only/i);
  assert.match(agent, /PARTIAL.*CONFLICTED.*temporal-staleness/is);
  assert.match(agent, /strict `SUPPORTED`/i);
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

test('buildFactCheckPlan records claim-specific freshness requirements', () => {
  const plan = buildFactCheckPlan({
    text: 'The company currently has 42 offices. The archive recorded 12 offices in 1998.',
  });

  assert.equal(plan.claims[0].freshnessRequirement, 'CURRENT');
  assert.equal(plan.claims[1].freshnessRequirement, 'NOT_APPLICABLE');
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

test('cross-check uses claim fields for real conflicts and ignores distinct source URLs', () => {
  const numericClaim = { id: 'FC-001', text: 'The result is 12%.', category: 'numeric' };
  const distinctSources = [
    { claimId: numericClaim.id, lane: 'A', status: 'SUPPORTED', source: 'https://a.test', quote: '12%', observed: { value: 12, unit: '%' } },
    { claimId: numericClaim.id, lane: 'B', status: 'SUPPORTED', source: 'https://b.test', quote: '12%', observed: { value: 12, unit: '%' } },
  ];
  const agreed = crossCheckEvidence({ claims: [numericClaim], evidenceRecords: distinctSources });
  assert.equal(agreed[0].status, 'AGREED');
  assert.deepEqual(agreed[0].conflicts, []);

  const valueConflict = crossCheckEvidence({
    claims: [numericClaim],
    evidenceRecords: [distinctSources[0], { ...distinctSources[1], quote: '8%', observed: { value: 8, unit: '%' } }],
  });
  assert.equal(valueConflict[0].status, 'CONFLICTED');
  assert.deepEqual(valueConflict[0].conflicts, ['value']);

  const citationClaim = { id: 'FC-002', text: 'DOI: 10.1234/example was published in 2024.', category: 'citation' };
  const citationConflict = crossCheckEvidence({
    claims: [citationClaim],
    evidenceRecords: [
      { claimId: citationClaim.id, lane: 'A', status: 'SUPPORTED', source: 'https://a.test', quote: '2024', observed: { doi: '10.1234/example', year: 2024 } },
      { claimId: citationClaim.id, lane: 'B', status: 'SUPPORTED', source: 'https://b.test', quote: '2025', observed: { doi: '10.1234/example', year: 2025 } },
    ],
  });
  assert.equal(citationConflict[0].status, 'CONFLICTED');
  assert.deepEqual(citationConflict[0].conflicts, ['year']);
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
  assert.equal(report.details.results[0].verdict, 'SUPPORTED');
  assert.equal(report.details.results[0].strictVerdict, 'INSUFFICIENT');
  assert.match(report.content[0].text, /Strict supported: 0/);

  const passed = await omp.tools.get('fact_check_gate').execute(
    'observed-gate', { finalOutput: completeOutput(), riskLevel: 'low' }, undefined, undefined, ctx,
  );
  assert.equal(passed.isError, false);
  assert.equal(passed.details.ok, true);
  assert.equal(passed.details.complete, true);
  assert.equal(passed.details.factualSupportComplete, false);
  assert.equal(passed.details.observed.strictSupported, 0);
  assert.deepEqual(passed.details.observed.strictUnresolvedClaimIds, ['FC-001']);
  assert.match(passed.content[0].text, /workflow ready.+strict factual support unresolved/i);
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

test('provider metadata is discovery evidence and never directly SUPPORTED', async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (String(url).includes('export.arxiv.org')) {
      return {
        ok: true,
        async text() {
          return '<feed><entry><title>A Test Paper</title></entry></feed>';
        },
      };
    }
    return {
      ok: true,
      async json() {
        if (String(url).includes('api.openalex.org')) {
          return {
            results: [{
              id: 'https://openalex.org/W1',
              display_name: 'A Test Paper',
              publication_year: 2024,
              doi: 'https://doi.org/10.1234/example.paper',
            }],
          };
        }
        if (String(url).includes('api.datacite.org')) {
          return {
            data: {
              attributes: {
                titles: [{ title: 'A Test Paper' }],
                publicationYear: 2024,
              },
            },
          };
        }
        if (String(url).includes('factchecktools.googleapis.com')) {
          return {
            claims: [{
              text: 'A claim about the paper',
              claimReview: [{
                url: 'https://example.test/review',
                textualRating: 'Accurate',
                publisher: { name: 'Example reviewer' },
              }],
            }],
          };
        }
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
    providers: ['crossref', 'arxiv', 'openalex', 'datacite', 'google-fact-check'],
    claims: [{
      id: 'FC-001',
      text: 'See DOI: 10.1234/example.paper and arXiv: 2401.12345 for details.',
    }],
    fetchImpl,
    googleApiKey: 'test-key',
  });

  assert.equal(records.length, 5);
  assert.deepEqual(new Set(records.map((record) => record.provider)), new Set([
    'crossref',
    'arxiv',
    'openalex',
    'datacite',
    'google-fact-check',
  ]));
  assert.ok(records.every((record) => record.status === 'INSUFFICIENT'));
  assert.ok(records.every((record) => record.evidenceType === 'metadata'));
  assert.ok(records.every((record) => /passage|table|dataset/i.test(record.reason)));
  assert.ok(calls.some((url) => /api\.crossref\.org\/works\/10\.1234%2Fexample\.paper/.test(url)));
});

test('provider outage remains unresolved and cannot become strict support', async () => {
  const claim = {
    id: 'FC-001',
    text: 'See DOI: 10.1234/example.paper for details.',
    evidencePlan: ['primary source'],
  };
  const records = await fetchProviderEvidence({
    allowNetwork: true,
    providers: ['crossref'],
    claims: [claim],
    fetchImpl: async () => {
      throw new Error('network unavailable');
    },
  });

  assert.deepEqual(records, []);
  assert.equal(strictClaimVerdict({
    claim,
    evidenceRecords: records,
    crossCheck: { status: 'INSUFFICIENT' },
  }), 'INSUFFICIENT');
});

test('strict claim verdict fails closed without changing compatibility verdicts', () => {
  const claim = {
    id: 'FC-001',
    text: 'The method improves accuracy by 12%.',
    evidencePlan: ['primary source', 'independent secondary source'],
  };
  const currentPassages = [
    {
      claimId: claim.id,
      lane: 'A',
      provider: 'primary-study',
      status: 'SUPPORTED',
      source: 'https://example.test/study',
      quote: 'Accuracy improved by 12%.',
      evidenceType: 'table',
      freshness: 'CURRENT',
      requirementsMet: true,
    },
    {
      claimId: claim.id,
      lane: 'B',
      provider: 'independent-review',
      status: 'SUPPORTED',
      source: 'https://independent.test/review',
      quote: 'The reported gain is 12%.',
      evidenceType: 'passage',
      freshness: 'CURRENT',
      requirementsMet: true,
    },
  ];

  assert.equal(strictClaimVerdict({
    claim,
    evidenceRecords: currentPassages,
    crossCheck: { status: 'AGREED' },
  }), 'SUPPORTED');
  assert.equal(strictClaimVerdict({
    claim,
    evidenceRecords: currentPassages.slice(0, 1),
    crossCheck: { status: 'PARTIAL' },
  }), 'INSUFFICIENT');
  assert.equal(strictClaimVerdict({
    claim,
    evidenceRecords: currentPassages,
    crossCheck: { status: 'CONFLICTED' },
  }), 'CONFLICTED');
  assert.equal(strictClaimVerdict({
    claim,
    evidenceRecords: currentPassages.map((record, index) => (
      index === 0 ? { ...record, freshness: 'STALE' } : record
    )),
    crossCheck: { status: 'AGREED', findings: ['STALE_EVIDENCE'] },
  }), 'INSUFFICIENT');
  assert.equal(strictClaimVerdict({
    claim,
    evidenceRecords: currentPassages.map((record) => ({ ...record, requirementsMet: false })),
    crossCheck: { status: 'AGREED' },
  }), 'INSUFFICIENT');
  assert.equal(strictClaimVerdict({
    claim,
    evidenceRecords: currentPassages.map((record) => ({
      ...record,
      provider: 'crossref',
      evidenceType: 'metadata',
    })),
    crossCheck: { status: 'AGREED' },
  }), 'INSUFFICIENT');
  assert.equal(strictClaimVerdict({
    claim: { ...claim, evidencePlan: ['primary source'] },
    evidenceRecords: [
      currentPassages[0],
      {
        ...currentPassages[1],
        provider: 'crossref',
        evidenceType: 'metadata',
      },
    ],
    crossCheck: { status: 'AGREED' },
  }), 'INSUFFICIENT');

  const currentClaim = {
    ...claim,
    text: 'The method currently improves accuracy by 12%.',
    freshnessRequirement: 'CURRENT',
  };
  assert.equal(strictClaimVerdict({
    claim: currentClaim,
    evidenceRecords: currentPassages.map((record) => ({ ...record, freshness: 'UNKNOWN' })),
    crossCheck: { status: 'AGREED' },
  }), 'INSUFFICIENT');
  assert.equal(strictClaimVerdict({
    claim: currentClaim,
    evidenceRecords: currentPassages,
    crossCheck: { status: 'AGREED' },
  }), 'SUPPORTED');

  const staleCrossCheck = crossCheckEvidence({
    claims: [claim],
    evidenceRecords: currentPassages.map((record, index) => (
      index === 0 ? { ...record, freshness: 'STALE' } : record
    )),
  });
  assert.equal(staleCrossCheck[0].status, 'AGREED');
  assert.deepEqual(staleCrossCheck[0].findings, ['STALE_EVIDENCE']);

  const compatibilityReport = buildFactCheckReport({
    claims: [claim],
    evidenceRecords: currentPassages.slice(0, 1),
    crossChecks: [{
      claimId: claim.id,
      status: 'PARTIAL',
      laneA: 'SUPPORTED',
      laneB: 'INSUFFICIENT',
      conflicts: [],
    }],
  });
  assert.equal(compatibilityReport.results[0].verdict, 'SUPPORTED');
  assert.equal(compatibilityReport.results[0].strictVerdict, 'INSUFFICIENT');
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
