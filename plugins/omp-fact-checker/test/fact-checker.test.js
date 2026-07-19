import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import factCheckerExtension, {
  buildFactCheckPlan,
  buildFactCheckReport,
  collectLocalEvidence,
  crossCheckEvidence,
  strictClaimVerdict,
  validateFactCheckReview,
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

const configAgent = (name) => readFileSync(
  new URL(`../../omp-config/agents/${name}.md`, import.meta.url),
  'utf8',
);

class FakeOmp {
  constructor() {
    this.tools = new Map();
    this.commands = new Map();
    this.events = new Map();
    const z = fakeZod();
    this.zod = { z };
  }

  registerTool(tool) {
    this.tools.set(tool.name, tool);
  }

  registerCommand(name, command) {
    this.commands.set(name, command);
  }

  on(name, handler) {
    this.events.set(name, handler);
  }
}

test('registers fact-check tools and command', () => {
  const omp = new FakeOmp();
  factCheckerExtension(omp);

  assert.deepEqual([...omp.tools.keys()], [
    'fact_check_analyze',
    'fact_check_evidence',
    'fact_check_report',
    'fact_check_review',
  ]);
  assert.equal(omp.commands.has('fact-check'), true);
  for (const tool of omp.tools.values()) {
    assert.equal(tool.defaultInactive, true, `${tool.name} must be opt-in`);
    assert.equal(tool.approval, 'read', `${tool.name} must remain read-only`);
  }
});

test('fact-check command accepts explicit inline text and applies maxClaims', async () => {
  const omp = new FakeOmp();
  factCheckerExtension(omp);
  const notifications = [];

  const result = await omp.commands.get('fact-check').handler(
    '--text The company was founded in 2020. Its headquarters are in Beijing. --max 1',
    { ui: { notify: (message, level) => notifications.push({ message, level }) } },
  );

  assert.equal(result.ok, true);
  assert.equal(result.details.claims.length, 1);
  assert.equal(result.details.claims[0].text, 'The company was founded in 2020.');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].level, 'info');
});

test('claim extraction splits adjacent Chinese sentences', () => {
  const plan = buildFactCheckPlan({
    text: '该公司成立于2020年。该公司总部位于北京市海淀区。',
  });

  assert.deepEqual(plan.claims.map(({ text }) => text), [
    '该公司成立于2020年。',
    '该公司总部位于北京市海淀区。',
  ]);
});

test('fact-check analyze returns a structured read error for directory paths', async () => {
  const omp = new FakeOmp();
  factCheckerExtension(omp);
  const pluginRoot = fileURLToPath(new URL('..', import.meta.url));

  const result = await omp.tools.get('fact_check_analyze').execute(
    'directory-read', { path: 'test' }, undefined, undefined, { cwd: pluginRoot },
  );

  assert.equal(result.isError, true);
  assert.match(result.details.error, /Unable to read test/);
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
  assert.doesNotMatch(researcherA, /^thinkingLevel:/m);
  assert.doesNotMatch(researcherB, /^thinkingLevel:/m);
});

test('fact agents declare canonical OMP search tools', () => {
  const expectedTools = new Map([
    ['fact-planner', ['read', 'grep', 'glob']],
    ['fact-researcher-a', ['read', 'grep', 'glob', 'web_search']],
    ['fact-researcher-b', ['read', 'grep', 'glob', 'web_search']],
    ['fact-cross-checker', ['read', 'grep', 'glob']],
    ['fact-reviewer', ['read', 'grep', 'glob']],
  ]);

  for (const [name, expected] of expectedTools) {
    const tools = (factAgent(name).match(/^tools:\s*([^\n]+)$/m)?.[1] ?? '')
      .split(',')
      .map((tool) => tool.trim())
      .filter(Boolean);
    assert.deepEqual(tools, expected);
  }
});

test('fact package excludes development tests from published files', () => {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.files.includes('test'), false);
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

test('fact-checking resources require exact claim entailment and verdict-limitation consistency', () => {
  const workflow = factSkill('fact-checking');
  const extraction = factSkill('claim-extraction');
  const sources = factSkill('source-evaluation');

  assert.match(extraction, /subject.*predicate.*object.*scope.*time.*quantifier/is);
  assert.match(workflow, /SUPPORTED.*subject.*predicate.*object.*scope.*time.*quantifier/is);
  assert.match(workflow, /CONTRADICTED.*same subject.*scope.*time.*quantifier/is);
  assert.match(workflow, /limitation.*(?:controls|constrains|determines).*verdict/is);
  assert.match(workflow, /does\s+not (?:establish|guarantee).*SUPPORTED.*CONTRADICTED/is);
  assert.match(workflow, /record.*limitation.*before.*verdict/is);
  assert.match(workflow, /### Claim <number>[\s\S]*Verdict: <SUPPORTED\|CONTRADICTED\|LOCAL_UNVERIFIED\|INSUFFICIENT>[\s\S]*Evidence:[\s\S]*Limitation:/is);
  assert.match(workflow, /Keep `Verdict:` as a plain line[\s\S]*exactly one allowed uppercase status/is);
  assert.match(workflow, /Do\s+not replace it with an arrow, a table cell, a bold standalone status/iu);
  assert.match(workflow, /catalog lists.*release has.*INSUFFICIENT/is);
  assert.match(workflow, /absence.*exhaustive.*current.*INSUFFICIENT/is);
  assert.match(workflow, /final consistency.*downgrade/is);
  assert.match(sources, /weaker|adjacent/i);
  assert.match(sources, /INSUFFICIENT|LOCAL_UNVERIFIED/);
  assert.match(sources, /absence.*exhaustive.*current/is);
});

test('fact-checking agents use an evidence ladder, bounded disconfirmation, and monotonic synthesis', () => {
  const planner = factAgent('fact-planner');
  const researchers = [factAgent('fact-researcher-a'), factAgent('fact-researcher-b')].join('\n');
  const crossChecker = factAgent('fact-cross-checker');
  const reviewer = factAgent('fact-reviewer');

  assert.match(planner, /subject.*predicate.*object.*scope.*time.*quantifier/is);
  assert.match(researchers, /PROVEN.*LIKELY.*HYPOTHESIS.*DISPROVED/is);
  assert.match(researchers, /high-impact.*(?:cheapest|lowest-cost|low-cost).*disconfirm/is);
  assert.match(researchers, /one.*(?:countercheck|counter-check|disconfirm)/is);
  assert.match(crossChecker, /subject.*predicate.*object.*scope.*time.*quantifier/is);
  assert.match(reviewer, /limitations?.*verdict/is);
  assert.match(reviewer, /(?:Main|parent).*(?:must not|cannot).*upgrade.*(?:confidence|evidence level).*new evidence/is);
  assert.match(reviewer, /zero findings.*valid/is);
  assert.doesNotMatch(researchers, /(?:at least|minimum of)\s+\d+\s+(?:issues|findings|defects)/i);
});

test('the specialized security reviewer preserves bounded evidence confidence', () => {
  const securityReviewer = configAgent('ecc-security-reviewer');

  assert.match(securityReviewer, /PROVEN.*LIKELY.*HYPOTHESIS.*DISPROVED/is);
  assert.match(securityReviewer, /zero findings.*valid/is);
  assert.match(securityReviewer, /high-impact.*(?:cheapest|lowest-cost|low-cost).*disconfirm/is);
  assert.match(securityReviewer, /path.*symbol.*(?:exact )?snippet/is);
  assert.match(securityReviewer, /line (?:number|range).*optional/i);
  assert.match(securityReviewer, /(?:Main|parent).*(?:must not|cannot).*upgrade.*(?:confidence|evidence level).*new evidence/is);
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
  const reportWithoutCrossCheck = buildFactCheckReport({
    claims,
    evidenceRecords: [...supported, ...contradicted],
  });
  assert.equal(reportWithoutCrossCheck.results[0].verdict, 'CONFLICTED');
  assert.equal(reportWithoutCrossCheck.results[0].strictVerdict, 'CONFLICTED');
  assert.equal(strictClaimVerdict({
    claim: claims[0],
    evidenceRecords: [...supported, ...contradicted],
  }), 'CONFLICTED');
});

test('explicit claim ids prevent evidence from leaking into a similar claim', () => {
  const claims = [
    { id: 'FC-001', text: 'Accuracy is 91%.' },
    { id: 'FC-002', text: 'Accuracy is 87%.' },
  ];
  const records = collectLocalEvidence({
    claims,
    evidenceRecords: [{
      claimId: 'FC-001',
      lane: 'A',
      status: 'SUPPORTED',
      quote: 'Accuracy is 91%.',
      source: 'table 1',
    }],
    lane: 'A',
  });

  assert.deepEqual(records.map(({ claimId, status }) => ({ claimId, status })), [
    { claimId: 'FC-001', status: 'SUPPORTED' },
    { claimId: 'FC-002', status: 'INSUFFICIENT' },
  ]);
});

test('evidence tool preserves supporting and contradicting records from one lane', async () => {
  const omp = new FakeOmp();
  factCheckerExtension(omp);
  const claims = buildFactCheckPlan({ text: 'The method improves accuracy by 12%.' }).claims;

  const result = await omp.tools.get('fact_check_evidence').execute(
    'multiple-evidence',
    {
      claims,
      lane: 'A',
      evidenceRecords: [
        { claimId: 'FC-001', lane: 'A', status: 'SUPPORTED', source: 'table 1', quote: '12%' },
        { claimId: 'FC-001', lane: 'A', status: 'CONTRADICTED', source: 'appendix', quote: '8%' },
      ],
    },
    undefined,
    undefined,
    { cwd: process.cwd(), sessionManager: {} },
  );

  assert.equal(result.isError, false);
  assert.deepEqual(result.details.records.map(({ status }) => status), ['SUPPORTED', 'CONTRADICTED']);

  const crossCheck = crossCheckEvidence({ claims, evidenceRecords: result.details.records });
  assert.equal(crossCheck[0].laneA, 'CONFLICTED');
  assert.equal(crossCheck[0].status, 'CONFLICTED');

  const report = buildFactCheckReport({
    claims,
    evidenceRecords: result.details.records,
    crossChecks: crossCheck,
  });
  assert.equal(report.results[0].verdict, 'CONFLICTED');
  assert.equal(report.results[0].strictVerdict, 'CONFLICTED');

  const reportWithoutCrossCheck = buildFactCheckReport({
    claims,
    evidenceRecords: result.details.records,
  });
  assert.equal(reportWithoutCrossCheck.results[0].verdict, 'CONFLICTED');
  assert.equal(reportWithoutCrossCheck.results[0].strictVerdict, 'CONFLICTED');
  assert.equal(strictClaimVerdict({
    claim: claims[0],
    evidenceRecords: result.details.records,
  }), 'CONFLICTED');
});

test('session_stop clears string-keyed workflow state without continuing', async () => {
  const omp = new FakeOmp();
  factCheckerExtension(omp);
  const ctx = { sessionManager: { getSessionId: () => 'fact-session' } };
  const analyzeTool = omp.tools.get('fact_check_analyze');
  const reviewTool = omp.tools.get('fact_check_review');

  await analyzeTool.execute('plan', { text: 'The company was founded in 2020.' }, undefined, undefined, ctx);
  const before = await reviewTool.execute('before', { finalOutput: '' }, undefined, undefined, ctx);
  assert.equal(before.details.observed.plannedClaims, 1);

  assert.equal(await omp.events.get('session_stop')({}, ctx), undefined);
  const after = await reviewTool.execute('after', { finalOutput: '' }, undefined, undefined, ctx);
  assert.equal(after.details.observed.plannedClaims, 0);
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
  const failed = validateFactCheckReview({ finalOutput: 'FACT_CHECK_PLAN\nFACT_CHECK_REPORT' });
  assert.equal(failed.ok, false);
  assert.deepEqual(failed.missing.includes('FACT_REVIEW'), true);

  const passed = validateFactCheckReview({
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

  const premature = await omp.tools.get('fact_check_review').execute(
    'premature-review', { finalOutput: completeOutput(), riskLevel: 'low' }, undefined, undefined, ctx,
  );
  assert.equal(premature.isError, false);
  assert.equal(premature.details.advisoryOnly, true);
  assert.equal(premature.details.ready, false);
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

  const passed = await omp.tools.get('fact_check_review').execute(
    'observed-review', { finalOutput: completeOutput(), riskLevel: 'low' }, undefined, undefined, ctx,
  );
  assert.equal(passed.isError, false);
  assert.equal(passed.details.ok, true);
  assert.equal(passed.details.ready, true);
  assert.equal(passed.details.strictSupportReady, false);
  assert.equal(passed.details.observed.strictSupported, 0);
  assert.deepEqual(passed.details.observed.strictUnresolvedClaimIds, ['FC-001']);
  assert.match(passed.content[0].text, /workflow ready.+strict factual support unresolved/i);
  assert.deepEqual(passed.details.missingObserved, []);

  const inconsistent = await omp.tools.get('fact_check_review').execute(
    'inconsistent-review', { finalOutput: completeOutput('CONTRADICTED'), riskLevel: 'low' }, undefined, undefined, ctx,
  );
  assert.equal(inconsistent.isError, false);
  assert.equal(inconsistent.details.ready, false);
  assert.ok(inconsistent.details.missingObserved.includes('final verdicts matching host FACT_CHECK_REPORT'));

  const conflicting = await omp.tools.get('fact_check_review').execute(
    'conflicting-review', {
      finalOutput: `${completeOutput()}\nFC-001: CONTRADICTED`,
      riskLevel: 'low',
    }, undefined, undefined, ctx,
  );
  assert.equal(conflicting.isError, false);
  assert.ok(conflicting.details.missingObserved.includes('final verdicts matching host FACT_CHECK_REPORT'));

  const duplicated = await omp.tools.get('fact_check_review').execute(
    'duplicated-review', {
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
  const review = omp.tools.get('fact_check_review');
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
  const isolated = await review.execute(
    'session-b-review', {
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
  assert.equal(isolated.details.ready, false);
  assert.ok(isolated.details.missingObserved.includes('host FACT_CHECK_PLAN'));
});

test('analyze rejects ambiguous path plus text and review ignores a lower model risk', async () => {
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
  const reviewed = await omp.tools.get('fact_check_review').execute(
    'high-risk-review', {
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
  assert.equal(reviewed.isError, false);
  assert.equal(reviewed.details.ready, false);
  assert.ok(reviewed.details.missingObserved.includes('host FACT_EVIDENCE_B'));
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
