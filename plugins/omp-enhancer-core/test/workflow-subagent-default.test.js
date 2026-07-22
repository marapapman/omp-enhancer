import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WORKFLOW_CATALOG_VERSION,
  workflowCatalog,
  workflowDefinitions,
} from '../src/workflows/catalog.js';
import { generalWorkflows } from '../src/workflows/definitions/general.js';
import { writingWorkflows } from '../src/workflows/definitions/writing.js';
import { defineWorkflowCatalog } from '../src/workflows/schema.js';

const NON_SUBSTANTIVE_DEFAULTS = new Map([
  ['agentic.simple', 'direct-simple'],
  ['writing.pending', 'defer-until-composed'],
]);

const NEW_TASK_WORKFLOWS = [
  'writing.latex',
  'writing.markdown',
  'doc.convert.word',
  'marketing.campaign',
  'release.publish',
];

test('schema defaults arbitrary omitted delegation policy to subagent-driven without workflow-id inference', () => {
  const [definition] = defineWorkflowCatalog([
    [workflowFixture({ id: 'arbitrary.simple-looking-name' })],
  ]);

  assert.equal(definition.delegationDefault, 'subagent-driven');
});

test('schema accepts only the three delegation defaults and requires roles only for subagent-driven workflows', () => {
  for (const delegationDefault of ['subagent-driven', 'direct-simple', 'defer-until-composed']) {
    const roles = delegationDefault === 'subagent-driven' ? ['task'] : [];
    const delegation = delegationDefault === 'subagent-driven'
      ? ['step-1: task owns the bounded assignment']
      : ['step-1: the parent retains the bounded assignment before delegating'];
    const [definition] = defineWorkflowCatalog([
      [workflowFixture({ delegationDefault, roles, delegation })],
    ]);
    assert.equal(definition.delegationDefault, delegationDefault);
  }

  assert.throws(
    () => defineWorkflowCatalog([[workflowFixture({ delegationDefault: 'always-fork' })]]),
    /delegationDefault.+always-fork|invalid delegation default/iu,
  );
  assert.throws(
    () => defineWorkflowCatalog([[
      workflowFixture({
        roles: [],
        delegation: ['step-1: the parent retains the bounded assignment before delegating'],
      }),
    ]]),
    /subagent-driven.+role/iu,
  );
});

test('catalog v22 projects explicit exception defaults and 29 substantive subagent-driven contracts', () => {
  assert.equal(WORKFLOW_CATALOG_VERSION, 22);
  assert.equal(workflowDefinitions.length, 31);

  const rawSimple = generalWorkflows.find(({ id }) => id === 'agentic.simple');
  const rawPending = writingWorkflows.find(({ id }) => id === 'writing.pending');
  assert.equal(rawSimple?.delegationDefault, 'direct-simple');
  assert.equal(rawPending?.delegationDefault, 'defer-until-composed');

  for (const [id, delegationDefault] of NON_SUBSTANTIVE_DEFAULTS) {
    assert.equal(workflowCatalog[id].delegationDefault, delegationDefault, id);
  }

  const substantive = workflowDefinitions.filter(({ id }) => !NON_SUBSTANTIVE_DEFAULTS.has(id));
  assert.equal(substantive.length, 29);
  for (const workflow of substantive) {
    assert.equal(workflow.delegationDefault, 'subagent-driven', workflow.id);
    assert.equal(workflowCatalog[workflow.id].delegationDefault, 'subagent-driven', workflow.id);
    assert.ok(workflow.roles.length > 0, `${workflow.id} must expose at least one bounded role`);
  }
});

test('general.subagent is a generic task-owned checkpoint with no code lifecycle', () => {
  const general = generalWorkflows.find(({ id }) => id === 'general.subagent');
  assert.ok(general);
  assert.equal(general.delegationDefault, 'subagent-driven');
  assert.deepEqual(general.skills, []);
  assert.deepEqual(general.roles, ['task']);

  const contract = [
    general.chooseWhen,
    ...general.steps.map(({ text }) => text),
    ...general.scopeNotes,
    ...general.qualityChecks,
    ...general.riskNotes,
    ...general.delegation,
  ].join(' ');
  assert.match(
    contract,
    /complete user-named inputs[\s\S]*task is the first project actor[\s\S]*reads the exact (?:user-)?named sources itself/iu,
  );
  assert.match(
    contract,
    /task[\s\S]*owns one complete bounded[\s\S]*analysis[\s\S]*investigation[\s\S]*multi-step modification[\s\S]*creation[\s\S]*returns directly usable (?:evidence|artifact)/iu,
  );
  assert.match(
    contract,
    /read-only[\s\S]*size[\s\S]*overhead[\s\S]*no explicit delegation request[\s\S]*not fallback/iu,
  );
  assert.match(
    contract,
    /Main owns integration[\s\S]*final verification[\s\S]*permission[\s\S]*external-effect/iu,
  );
  assert.doesNotMatch(
    contract,
    /code-development|code\.dev|code-specific|repository|local code|\bTDD\b|\bRED\b|\bGREEN\b|test coverage|plan review|reviewer|semantic diff|production changes|vertical slices/iu,
  );
});

test('writing.pending owns one bounded language-resolution transition before the language subagent workflow', () => {
  const pending = writingWorkflows.find(({ id }) => id === 'writing.pending');
  const contract = [
    pending.chooseWhen,
    ...pending.steps.map(({ text }) => text),
    ...pending.scopeNotes,
    ...pending.delegation,
  ].join(' ');

  assert.match(contract, /after (?:the )?initial READY[\s\S]*exactly one narrow (?:source )?read[\s\S]*language only/iu);
  assert.match(contract, /one replacement `?WORKFLOW PLAN`?[\s\S]*`writing\.zh` or `writing\.en`/iu);
  assert.match(contract, /same format Add-ons[\s\S]*new(?:ly required)? language Skills[\s\S]*language workflow reference last/iu);
  assert.match(contract, /do not reread[\s\S]*(?:loaded )?(?:format )?(?:companions|resources)/iu);
  assert.match(contract, /no substantive review or revision[\s\S]*replacement READY/iu);
  assert.match(contract, /cannot determine[\s\S]*ask the user[\s\S]*never repeat|never repeat[\s\S]*cannot determine[\s\S]*ask the user/iu);
  assert.deepEqual(pending.roles, []);
  assert.deepEqual(pending.skills, []);
});

test('previously roleless substantive workflows use native task with bounded domain duties', () => {
  for (const id of NEW_TASK_WORKFLOWS) {
    assert.deepEqual(workflowCatalog[id].roles, ['task'], id);
  }

  for (const id of ['writing.latex', 'writing.markdown', 'doc.convert.word']) {
    const delegation = workflowCatalog[id].delegation.join(' ');
    assert.match(delegation, /task.+(?:format|conversion|structure)/iu, id);
    assert.match(delegation, /prose.+compos.+(?:writer|checker)|compos.+(?:writer|checker).+prose/iu, id);
  }

  for (const id of ['database.review', 'ml.review']) {
    const delegation = workflowCatalog[id].delegation.join(' ');
    assert.match(delegation, /task.+read-only.+audit/iu, id);
    assert.match(delegation, /without.+(?:edit|mutat|appl)/iu, id);
  }

  const marketing = workflowCatalog['marketing.campaign'].delegation.join(' ');
  assert.match(marketing, /task.+complete.+channel.+evidence.+slice/iu);
  assert.match(marketing, /compos.+domain.+agent.+prefer/iu);

  const seo = workflowCatalog['seo.audit'].delegation.join(' ');
  assert.match(seo, /task.+complete.+URL.+evidence.+slice/iu);
  assert.match(seo, /compos.+domain.+agent.+prefer/iu);

  const release = workflowCatalog['release.publish'].delegation.join(' ');
  assert.match(release, /task.+read-only.+preflight/iu);
  assert.match(release, /task.+read-only.+post.+verif/iu);
  assert.match(release, /Main|parent.+exclusive.+authoriz.+mutation/iu);
});

test('language writing workflows keep routine Skill hints narrow and make the writer the first project actor', () => {
  const english = writingWorkflows.find(({ id }) => id === 'writing.en');
  const chinese = writingWorkflows.find(({ id }) => id === 'writing.zh');

  assert.deepEqual(english?.skills, ['writing-review']);
  assert.deepEqual(chinese?.skills, ['plain-chinese-writing', 'zh-writing-review']);

  for (const workflow of [english, chinese]) {
    const contract = [
      ...workflow.steps.map(({ text }) => text),
      ...workflow.scopeNotes,
      ...workflow.delegation,
    ].join(' ');
    assert.match(contract, /user-named target[\s\S]*without Main `read` or `glob`/iu, workflow.id);
    assert.match(contract, /complete assignment input/iu, workflow.id);
    assert.match(contract, /writer[\s\S]*first project actor[\s\S]*reads? the (?:exact )?target/iu, workflow.id);
    assert.match(contract, /checker[\s\S]*after (?:the )?writer delivery/iu, workflow.id);
    assert.match(contract, /writer is proposal-only[\s\S]*complete proposed revision or bounded patch[\s\S]*Main owns any authorized file change[\s\S]*assignment size leaves the actor sequence unchanged/iu, workflow.id);
    assert.match(contract, /direct(?:ly)? address(?:ed)? to Main[\s\S]*integrated final (?:response|delivery)[\s\S]*no explicit delegation request[\s\S]*writer[\s\S]*checker sequence unchanged/iu, workflow.id);
    assert.match(contract, /READY TODO contains dependency-ordered exact rows for step-2[\s\S]*writer[\s\S]*step-3[\s\S]*checker[\s\S]*parent-owned integration and verification[\s\S]*pending until complete writer delivery/iu, workflow.id);
    assert.match(contract, /later-wave checker checkpoint[\s\S]*stable[\s\S]*writer delivery[\s\S]*assignment body/iu, workflow.id);
    assert.match(contract, /do not invent[\s\S]*artifact:\/\//iu, workflow.id);
    assert.match(contract, /normal writer delivery[\s\S]*does not rebase[\s\S]*new dependency[\s\S]*scope[\s\S]*permission[\s\S]*tool[\s\S]*Agent[\s\S]*schema[\s\S]*capacity[\s\S]*Skill-load failure[\s\S]*contradictory project evidence/iu, workflow.id);
    assert.match(contract, /Branch A:[\s\S]*Main alone performs finding disposition[\s\S]*accepts at least one checker finding[\s\S]*dispatch the original frozen step-4[\s\S]*native TODO `done`[\s\S]*only after[\s\S]*complete corrected-proposal terminal delivery/iu, workflow.id);
    assert.match(contract, /Branch B:[\s\S]*accepts zero checker findings[\s\S]*do not dispatch[\s\S]*native TODO `done`[\s\S]*same frozen[\s\S]*`resolved-no-repair`[\s\S]*never rewrite, drop, or abandon/iu, workflow.id);
    assert.match(contract, /no-op branch[\s\S]*parent TODO condition resolution[\s\S]*not child delivery[\s\S]*successful fork[\s\S]*permission/iu, workflow.id);
    assert.doesNotMatch(contract, /Main closes? (?:the|that) conditional checkpoint/iu, workflow.id);
  }

  assert.deepEqual(english?.delegation, [
    'step-2: writer is the first project actor and reads the exact target before owning the requested English drafting or prose revision',
    'step-3: checker independently reviews source and revision after the writer delivery without editing the source',
    'step-4: writer returns one corrected proposal for parent-accepted findings',
  ]);
  assert.deepEqual(chinese?.delegation, [
    'step-2: zh-writer is the first project actor and reads the exact target before owning the requested Chinese drafting or prose revision',
    'step-3: zh-checker independently reviews source and revision after the writer delivery without editing the source',
    'step-4: zh-writer returns one corrected proposal for parent-accepted findings',
  ]);
});

test('composed LaTeX prose checkpoints preserve Main-selected domain Agent identity', () => {
  const english = writingWorkflows.find(({ id }) => id === 'writing.en');
  const chinese = writingWorkflows.find(({ id }) => id === 'writing.zh');
  const latex = writingWorkflows.find(({ id }) => id === 'writing.latex');

  for (const [workflow, writer, checker] of [
    [english, 'writer', 'checker'],
    [chinese, 'zh-writer', 'zh-checker'],
  ]) {
    const contract = [...workflow.scopeNotes, ...workflow.delegation].join(' ');
    assert.match(
      contract,
      new RegExp(`prose-revision item uses visible ${writer}`, 'iu'),
      `${workflow.id} should carry Main's selected writer into the native task item`,
    );
    assert.match(
      contract,
      new RegExp(`dependent semantic-check item uses ${checker}`, 'iu'),
      `${workflow.id} should carry the matching checker into the later task item`,
    );
    assert.match(
      contract,
      /writing\.(?:en|zh) plus writing\.latex composition[\s\S]*both rows keep workflow metadata exactly writing\.(?:en|zh),writing\.latex/iu,
      `${workflow.id} should carry the complete selected composition into both native assignments`,
    );
  }

  const latexContract = [
    ...latex.steps.map(({ text }) => text),
    ...latex.scopeNotes,
    ...latex.delegation,
  ].join(' ');
  assert.match(latexContract, /owning workflow checkpoint actor reads the relevant source and local macros/iu);
  assert.match(latexContract, /composed with a language workflow[\s\S]*language writer owns the prose target read/iu);
  assert.match(latexContract, /`?task`?.+only.+format-only.+compile/iu);
  assert.match(latexContract, /not (?:a )?candidate.+prose revision.+semantic check/iu);
});

function workflowFixture(overrides = {}) {
  return {
    id: 'arbitrary.workflow',
    chooseWhen: 'A test fixture needs schema normalization.',
    composeWith: [],
    steps: [{ id: 'step-1', text: 'Perform the bounded fixture step.' }],
    scopeNotes: [],
    skills: [],
    qualityChecks: ['bounded fixture evidence'],
    riskNotes: [],
    roles: ['task'],
    delegation: ['step-1: task owns the bounded assignment'],
    ...overrides,
  };
}
