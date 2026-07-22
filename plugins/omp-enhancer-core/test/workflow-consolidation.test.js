import test from 'node:test';
import assert from 'node:assert/strict';

import {
  workflowDefinitions,
  workflowCatalog,
  workflowIds,
} from '../src/workflows/catalog.js';
import {
  buildWorkflowSkillIndexMarkdown,
  buildWorkflowSkillReferenceMarkdown,
  workflowReferenceUri,
} from '../src/workflows/render-skill.js';
import { buildSharedWorkflowCatalogMarkdown } from '../src/workflows/render-shared-markdown.js';
import { exactNestedEccSkillUri } from '../src/workflows/skill-discovery.js';
import { DIRECT_FALLBACK_REASONS } from '../src/workflows/staged-contract.js';

const REQUIRED_WORKFLOWS = [
  'code.dev',
  'network.design',
  'network.homelab',
  'network.review',
  'network.debug',
  'database.review',
  'database.change',
  'database.migration.repair',
  'ml.review',
  'ml.debug',
  'release.opensource',
  'marketing.campaign',
  'seo.audit',
];

const RETIRED_CODE_WORKFLOWS = [
  'research.technical',
  'code.plan',
  'code.debug',
  'code.test',
  'code.review',
  'code.build',
  'performance.optimize',
];

test('catalog exposes the consolidated workflows and deliberately omits healthcare', () => {
  for (const id of REQUIRED_WORKFLOWS) {
    assert.ok(workflowIds.includes(id), `missing workflow ${id}`);
  }
  assert.equal(workflowIds.includes('healthcare.review'), false);
  assert.equal(workflowIds.includes('communications.triage'), false);
  for (const id of RETIRED_CODE_WORKFLOWS) {
    assert.equal(workflowIds.includes(id), false, `retired workflow remains: ${id}`);
  }
});

test('compact workflow Skill teaches primary-plus-add-on composition with exact resource URIs', () => {
  const index = buildWorkflowSkillIndexMarkdown();

  assert.match(index, /STATE: DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY/iu);
  assert.ok(
    index.indexOf('DECLARE HANDOFF (soft):') < index.indexOf('## Staged protocol'),
    'the post-index PLAN handoff must be in the first screen, before explanatory protocol prose',
  );
  assert.ok(
    index.indexOf('DECLARE HANDOFF (soft):') < index.indexOf('Catalog version:'),
    'the post-index PLAN handoff must precede catalog and explanatory prose',
  );
  assert.match(
    index,
    /DECLARE HANDOFF \(soft\):[^\n]*Next visible response MUST start byte 0 with `WORKFLOW PLAN`[^\n]*contain only this form[^\n]*Select internally[^\n]*state stays silent[^\n]*no project path[^\n]*user text suffices/iu,
  );
  assert.match(index, /Select internally[\s\S]*state stays silent/iu);
  assert.match(index, /1\. \*\*DISCOVER\*\*[\s\S]*body is the completed DISCOVER result[\s\S]*do not read `skill:\/\/omp-enhancer-workflows` again/i);
  assert.match(index, /verbatim field lookup needs no Skill or TODO/i);
  assert.match(index, /2\. \*\*DECLARE \+ LOAD\*\*[\s\S]*operation, source, and output[\s\S]*Emit PLAN first[\s\S]*load NOW[\s\S]*load THEN[\s\S]*Project tools start only after the READY \+ TODO response ends and its results return/i);
  assert.match(index, /3\. \*\*COMMIT \+ EXECUTE\*\*[\s\S]*Emit READY first[\s\S]*commit loaded methods to detailed native TODO[\s\S]*split, execute, and verify/i);
  assert.match(index, /Main owns delegation[\s\S]*OMP owns tools, permissions, TODO, Agents, and completion/i);
  assert.match(index, /FALLBACK:[\s\S]*concrete user\/native[\s\S]*Agent\/capacity[\s\S]*input\/dependency\/write-set[\s\S]*never size, latency, read-only, overhead, or no delegation request/iu);
  assert.match(index, /PROSE:[\s\S]*English draft\/revision -> `writing\.en`[\s\S]*Chinese -> `writing\.zh`[\s\S]*unknown body -> `writing\.pending`[\s\S]*Other central operation => language Add-on/iu);
  assert.match(index, /`\.tex` target[\s\S]*LaTeX prose[\s\S]*preserve(?:d)? LaTeX commands[\s\S]*`writing\.latex` Add-on/iu);
  assert.match(
    index,
    /### writing[\s\S]*#### language[\s\S]*`writing\.pending`[\s\S]*`writing\.zh`[\s\S]*`writing\.en`[\s\S]*#### format overlays[\s\S]*`writing\.latex`[\s\S]*`writing\.markdown`[\s\S]*`doc\.convert\.word`[\s\S]*#### specialized outputs[\s\S]*`slides\.generate`[\s\S]*`slides\.modify`[\s\S]*`diagram\.svg`/iu,
  );
  assert.match(index, /`writing\.latex`[^\n]*Add-on to matching prose[^\n]*Primary only for format\/structure work/iu);
  assert.match(index, /`writing\.en` — The prose/u);
  assert.doesNotMatch(index, /— Primary:/u);
  assert.match(index, /## State handoff[\s\S]*SELECTION:[\s\S]*Primary = central deliverable/iu);
  assert.match(index, /SELECTION:[\s\S]*Primary = central deliverable[\s\S]*independent requested operations\/outputs = Add-ons/iu);
  assert.match(index, /SKILL DISCOVERY:[\s\S]*`D` and `C` are optional candidates, never load sets[\s\S]*select only a URI that matches the requested method, evidence rule, verdict, or format[\s\S]*refs stay in THEN/iu);
  assert.doesNotMatch(index, /Exclude every `Not for`|Honor `Not for`/iu);
  assert.match(index, /Format-only => format Primary/iu);
  assert.match(index, /LOAD:[\s\S]*Skills=exact domain Skill\/catalog URIs[\s\S]*NOW=non-supplied Skills\/catalogs[\s\S]*THEN=Add-on refs then Primary[\s\S]*max 2 catalog \+ 1 method extensions[\s\S]*Never guess\/reread\/re-PLAN except `writing\.pending`/i);
  assert.match(index, /DECLARE HANDOFF \(soft\):[\s\S]*Next visible response MUST start byte 0 with `WORKFLOW PLAN`[\s\S]*contain only this form[^\n]*\nWORKFLOW PLAN\nPrimary: <id-or-none>\nAdd-ons: <ids-or-none>\nSkills: <exact domain Skill\/catalog URIs-or-none>\nLoad order: NOW=\[<chosen non-supplied Skill\/catalog URIs-or-none>\] THEN=\[<Add-on PLAN URIs; Primary PLAN URI last-or-none>\]\nActions:\n1\. LOAD:[\s\S]*2\. COMMIT:[\s\S]*3\. SPLIT \+ EXECUTE:[\s\S]*4\. VERIFY:/i);
  assert.doesNotMatch(index, /assistant content\[0\]/iu);
  assert.match(index, /PLAN text alone is incomplete[\s\S]*same response calls NOW and waits[\s\S]*calls THEN if NOW=none[\s\S]*THEN is one final resource-only batch[\s\S]*Give each evidence checkpoint an Action/iu);
  assert.match(index, /AFTER NOW:[^\n]*empty revealed URI set[^\n]*no text\/marker[^\n]*call the THEN batch[^\n]*RESOURCE EXTENSION MUST list >=1 exact revealed URI[^\n]*`reads=none` is invalid/iu);
  assert.match(index, /COMMIT HANDOFF \(soft\):[\s\S]*after every declared NOW resource, revealed extension, and THEN reference has returned or been marked unavailable[\s\S]*next response begins `W`[\s\S]*bare IDs[\s\S]*initializes native TODO only[\s\S]*Project tools start only after the READY \+ TODO response ends and its results return/i);
  assert.doesNotMatch(index, /All resources loaded|WRONG:|CORRECT:|after optional hidden thinking|Thinking "/iu);
  assert.match(index, /`code\.dev` — [^\n]*no OMP plugin, database, ML, network, writing, research, design, or release card better owns the central deliverable/iu);
  assert.match(index, /VISUAL:[^\n]*non-visual Primary[^\n]*`design\.visual` Add-on[^\n]*standalone slide\/SVG\/TikZ[^\n]*specialized Primary[^\n]*separate visual-design work\/output/iu);
  assert.match(index, /Format-only => format Primary/iu);
  assert.match(index, /Converters\/templates only when requested/iu);
  assert.match(
    index,
    /`writing\.latex`[^\n]*preservation-only Add-on selects zero format Skills[^\n]*explicit conversion or template selects one matching candidate[^\n]*D=\[`skill:\/\/format-markdown2latex`, `skill:\/\/format-latex2markdown`, `skill:\/\/format-template-latex`\]/iu,
  );
  assert.match(index, /SKILL DISCOVERY:[\s\S]*PLAN\/NOW[\s\S]*refs stay in THEN/iu);
  assert.match(
    index,
    /SKILL DISCOVERY:[\s\S]*enumerated `C` URI goes directly in PLAN\/NOW[\s\S]*`skill:\/\/ecc-skill-catalog` remains only for unlisted niche discovery/iu,
  );
  assert.match(
    index,
    /`writing\.en`[^\n]*D=\[`skill:\/\/writing-review`\][^\n]*PLAN URI:/iu,
  );
  assert.match(
    index,
    /`network\.design`[^\n]*C=\[`skill:\/\/ecc-skill-catalog\/network-config-validation\/SKILL\.md`, `skill:\/\/ecc-skill-catalog\/safety-guard\/SKILL\.md`\][^\n]*PLAN URI:/iu,
  );
  const networkIndexRow = index.split('\n').find((line) => line.includes('`network.design`')) ?? '';
  assert.doesNotMatch(networkIndexRow, /C=\[`network-config-validation`/u);
  assert.doesNotMatch(networkIndexRow, /via `skill:\/\/ecc-skill-catalog`/u);
  assert.doesNotMatch(index, /\bHints:/u);
  assert.ok(Buffer.byteLength(index) < 16_000, 'workflow Skill index should stay below 16k');
  assert.doesNotMatch(index, /slices=<|assignment-input=|Composition example:|\[workflow=<ids>/i);
  assert.match(index, /PLAN URI: `skill:\/\/omp-enhancer-workflows\/references\/code\.dev\.md`/i);
  assert.doesNotMatch(index, /PLAN URI: `references\//u);
  assert.equal(workflowReferenceUri('code.dev'), 'skill://omp-enhancer-workflows/references/code.dev.md');
  assert.match(index, /Navigation only[\s\S]*never routes[\s\S]*gates[\s\S]*selects Agents[\s\S]*decides completion/iu);
  assert.doesNotMatch(index, /block:\s*true|continue:\s*true|triggerTurn\s*\(|hard router|automatic retry/i);
  assert.match(index, /DECLARE HANDOFF \(soft\):[\s\S]*Next visible response MUST start byte 0 with `WORKFLOW PLAN`[\s\S]*state stays silent/iu);
  assert.equal(
    index.trimEnd().split('\n').at(-1),
    'NEXT VISIBLE BYTES MUST BE `WORKFLOW PLAN`; no preface; no plugin enforces this format.',
  );

  const codeReference = buildWorkflowSkillReferenceMarkdown('code.dev');
  assert.ok(
    codeReference.indexOf('READY NEXT (soft): SENTINEL 1/2') < codeReference.indexOf('## `code.dev`'),
    'the post-reference READY handoff must precede the workflow card',
  );
  assert.match(codeReference, /^READY NEXT \(soft\): SENTINEL 1\/2/u);
  assert.match(
    codeReference,
    /^READY NEXT \(soft\): SENTINEL 1\/2[^\n]*no plugin enforcement[^\n]*Next assistant response byte 0 = `W` of filled `WORKFLOW READY \|[^\n]+[^\n]*no other visible text[^\n]*native TODO init only[^\n]*end\/wait/iu,
  );
  assert.match(codeReference, /RESOURCE HANDOFF \(soft\):[\s\S]*Derive TODO internally/iu);
  assert.match(codeReference, /Each delegated native TODO `items\[\]` string is the exact Delegate row[\s\S]*no role-colon shorthand/iu);
  assert.match(codeReference, /checkpoint is one metadata-safe line[\s\S]*without `\]`[\s\S]*`workflow=`[\s\S]*`step=`[\s\S]*`todo=`[\s\S]*`skills=`[\s\S]*`checkpoint=`/iu);
  assert.equal((codeReference.match(/READY NEXT \(soft\): SENTINEL [12]\/2/gu) ?? []).length, 2);
  assert.doesNotMatch(codeReference, /COMMIT PREVIEW|READY NEXT \(soft\):\n|NEXT VISIBLE BYTES MUST BE `WORKFLOW READY`/u);
  assert.equal(
    codeReference.trimEnd().split('\n').at(-1),
    'READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; native TODO init only; end/wait.',
  );
  assert.match(codeReference, /complete input \+ safe checkpoint \+ visible matching Agent => one exact Delegate row[\s\S]*otherwise `fallback=<one matched permitted limitation>`[\s\S]*Parent VERIFY rows remain separate[\s\S]*Every delegated row is exactly `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`/iu);
  assert.match(codeReference, /Primary when:/i);
  assert.doesNotMatch(codeReference, /Add-on candidates/iu);
  assert.doesNotMatch(codeReference, /Optional Skill topics|Optional Skill candidates/iu);
  assert.doesNotMatch(codeReference, /`code\.test` workflow reference/iu);
  assert.equal((codeReference.match(/\[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>\]/gu) ?? []).length, 1);
  assert.match(codeReference, /TASK COPY \(soft, later response\):[\s\S]*copy one committed Delegate row[\s\S]*do not redraft its metadata/iu);
  assert.match(codeReference, /native item `agent`[\s\S]*native item `todo`[\s\S]*Assignment body byte 0[\s\S]*\[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>\]/iu);
  assert.match(codeReference, /native `tasks\[\]\.task` itself begins at byte 0 with that complete four-key prefix[\s\S]*common `context`, name, label, or an instruction telling the child to output metadata cannot substitute/iu);
  assert.match(codeReference, /Every native `task` call sets a non-empty top-level `context`[\s\S]*shared batch purpose[\s\S]*cannot substitute for an item body or its byte-0 prefix/iu);
  assert.match(codeReference, /copy direct user constraints verbatim[\s\S]*After dispatch, end and wait for native auto-delivery[\s\S]*do not poll with `hub`/iu);
  assert.match(codeReference, /Only a new dependency, scope, permission, tool, Agent, schema, capacity, Skill-load failure, or contradictory project evidence may rebase the row/iu);
  assert.ok(codeReference.indexOf('READY NEXT (soft):') < codeReference.indexOf('TASK COPY (soft, later response):'));
  assert.doesNotMatch(codeReference, /All resources loaded|WRONG:|CORRECT:|after optional hidden thinking|Thinking "/iu);
  assert.doesNotMatch(codeReference, /block:\s*true|continue:\s*true|hard (?:gate|router)|automatic retry|must (?:fork|delegate)/iu);

  for (const [workflowId, writer, checker] of [
    ['writing.en', 'writer', 'checker'],
    ['writing.zh', 'zh-writer', 'zh-checker'],
  ]) {
    const writingReference = buildWorkflowSkillReferenceMarkdown(workflowId);
    assert.match(writingReference, new RegExp(`AFTER TODO RESULT:[^\\n]*${writer} \\x60task\\x60 is the next project action[^\\n]*no Main \\x60read\\x60 or \\x60glob\\x60`, 'iu'));
    assert.match(
      writingReference,
      new RegExp(`Initial TODO freezes three exact Delegate rows[^\\n]*step-2 ${writer}[^\\n]*step-3 ${checker}[^\\n]*conditional step-4 corrected-proposal`, 'iu'),
    );
    assert.match(writingReference, /Branch A:[^\n]*Main alone performs finding disposition[^\n]*accepts at least one checker finding[^\n]*dispatch the original frozen step-4 row[^\n]*native TODO `done`[^\n]*only after[^\n]*complete corrected-proposal terminal delivery/iu);
    assert.match(writingReference, /Branch B:[^\n]*accepts zero checker findings[^\n]*do not dispatch[^\n]*native TODO `done`[^\n]*same frozen row[^\n]*`resolved-no-repair`[^\n]*never rewrite, drop, or abandon/iu);
    assert.match(writingReference, /no-op branch[^\n]*parent TODO condition resolution[^\n]*not child delivery[^\n]*successful fork[^\n]*permission/iu);
    assert.doesNotMatch(writingReference, /Main closes? (?:the|that) conditional checkpoint/iu);
    assert.match(writingReference, /Each dispatch mechanically copies its frozen Agent, workflow, step, skills, and checkpoint metadata/iu);
  }
  for (const [workflowId, writer] of [['writing.en', 'writer'], ['writing.zh', 'zh-writer']]) {
    const workflow = workflowCatalog[workflowId];
    const step4 = workflow.delegation.find((checkpoint) => checkpoint.startsWith('step-4:')) ?? '';
    assert.equal(step4, `step-4: ${writer} returns one corrected proposal for parent-accepted findings`);
    assert.doesNotMatch(step4, /Main applies|verifies/iu);
    assert.match(workflow.scopeNotes.join(' '), /Main owns any authorized file change[\s\S]*parent-owned integration and verification/iu);
  }

  const latexWorkflow = workflowCatalog['writing.latex'];
  const latexScope = latexWorkflow.scopeNotes.join(' ');
  const latexDelegation = latexWorkflow.delegation.join(' ');
  assert.match(latexScope, /preservation-only Add-on[\s\S]*LaTeX preservation constraints only[\s\S]*zero format Skills[\s\S]*no generic `task` Delegate row/iu);
  assert.match(latexScope, /generic `task` candidate[\s\S]*only for an explicitly requested format conversion, LaTeX-structure change, or compile-evidence checkpoint/iu);
  assert.match(latexDelegation, /step-3: task owns only an explicitly requested format-only conversion or LaTeX-structure change/iu);
  assert.match(latexDelegation, /step-4: task may return only explicitly requested compile evidence/iu);
  assert.doesNotMatch(latexDelegation, /LaTeX-structure preservation slice/iu);

  const sharedCatalog = buildSharedWorkflowCatalogMarkdown();
  assert.match(
    sharedCatalog,
    /filled PLAN[^\n]*byte 0 is `W`[\s\S]*filled `WORKFLOW READY \|`[^\n]*byte 0 is `W`/iu,
  );
  assert.doesNotMatch(sharedCatalog, /first character is `W`/iu);
  assert.match(
    sharedCatalog,
    /exact nested ECC URI listed on a card[^\n]*directly in PLAN\/NOW[^\n]*`skill:\/\/ecc-skill-catalog`[^\n]*unlisted niche discovery/iu,
  );
  for (const definition of workflowDefinitions) {
    const indexRow = index.split('\n').find((line) => line.includes(`\`${definition.id}\``)) ?? '';
    const cardHeading = `### \`${definition.id}\``;
    const cardStart = sharedCatalog.indexOf(cardHeading);
    const nextCard = sharedCatalog.indexOf('\n### `', cardStart + cardHeading.length);
    const catalogEnd = sharedCatalog.indexOf('\n<!-- OMP-ENHANCER-WORKFLOW-CATALOG:END -->', cardStart);
    const cardEnd = nextCard >= 0 ? nextCard : catalogEnd;
    const card = cardStart >= 0 && cardEnd >= 0 ? sharedCatalog.slice(cardStart, cardEnd) : '';
    for (const skill of definition.catalogSkills) {
      const uri = exactNestedEccSkillUri(skill);
      assert.ok(indexRow.includes(`\`${uri}\``), `${definition.id} index is missing ${uri}`);
      assert.ok(card.includes(`\`${uri}\``), `${definition.id} shared card is missing ${uri}`);
    }
  }
  const networkCard = sharedCatalog.match(/### `network\.design`[\s\S]*?(?=\n### `|\n<!-- OMP-ENHANCER-WORKFLOW-CATALOG:END -->)/u)?.[0] ?? '';
  assert.match(
    networkCard,
    /Exact nested ECC Skill candidates: `skill:\/\/ecc-skill-catalog\/network-config-validation\/SKILL\.md`, `skill:\/\/ecc-skill-catalog\/safety-guard\/SKILL\.md`/u,
  );
  assert.doesNotMatch(networkCard, /ECC catalog query candidates|via `skill:\/\/ecc-skill-catalog`/u);

  for (const id of ['agentic.simple', 'writing.pending']) {
    assert.doesNotMatch(
      buildWorkflowSkillReferenceMarkdown(id),
      /TASK TURN|\[workflow=<copy-workflow>/iu,
      id,
    );
  }

  const pendingReference = buildWorkflowSkillReferenceMarkdown('writing.pending');
  assert.match(
    pendingReference,
    /PENDING TRANSITION:[\s\S]*after initial READY\/TODO[\s\S]*exactly one narrow body-language read[\s\S]*Next visible bytes are WORKFLOW PLAN[\s\S]*replace pending with `writing\.zh` or `writing\.en`[\s\S]*retain format Add-ons[\s\S]*only new language Skills in NOW[\s\S]*Primary reference last in THEN[\s\S]*replacement READY and TODO\/wait[\s\S]*never loop or guess/iu,
  );
  assert.doesNotMatch(pendingReference, /hard gate|required transition|automatic retry/iu);
});

test('the consolidated code lifecycle uses plan plus native task and reviewer', () => {
  assert.deepEqual(workflowCatalog['code.dev'].roles, ['plan', 'task', 'reviewer']);
  assert.deepEqual(workflowCatalog['code.dev'].skills, ['code-development']);
  assert.equal(workflowCatalog['design.visual'].roles.includes('designer'), true);
  assert.equal(workflowCatalog['design.visual'].roles.includes('visioner'), true);
});

test('workflow Skill discovery distinguishes direct URIs from exact nested ECC URIs', () => {
  assert.deepEqual(workflowCatalog['writing.en'].catalogSkills, []);
  assert.deepEqual(
    workflowCatalog['network.design'].catalogSkills,
    ['network-config-validation', 'safety-guard'],
  );
  assert.deepEqual(
    workflowCatalog['research.web'].catalogSkills,
    ['research-ops', 'deep-research'],
  );
});

test('omp.plugin owns the complete self-iteration lifecycle without adding another workflow ID', () => {
  const workflow = workflowCatalog['omp.plugin'];
  const steps = workflow.steps.join(' ');
  const delegation = workflow.delegation.join(' ');
  const quality = workflow.qualityChecks.join(' ');
  const risks = workflow.riskNotes.join(' ');

  assert.ok(workflow);
  assert.equal(workflowIds.some((id) => /self|iterat/iu.test(id)), false);
  assert.match(workflow.chooseWhen, /OMP plugin.+omp-enhancer.+self-development fixture.+workflow.+Skill.+prompt.+E2E/iu);
  assert.deepEqual(workflow.roles, ['plan', 'task', 'reviewer']);
  assert.deepEqual(workflow.skills, ['code-development']);
  assert.equal(workflow.composeWith.includes('code.dev'), false);
  assert.equal(workflowCatalog['code.dev'].composeWith.includes('omp.plugin'), false);
  assert.match(steps, /acceptance.+invariants.+dirty worktree.+installed state/iu);
  assert.match(steps, /detailed implementation and evidence plan.+parallel.+waves.+vertical slices.+non-overlapping.+write sets.+tests.+E2E/iu);
  assert.match(steps, /independently review.+parallel.+plan.+assignment.+before production changes/iu);
  assert.match(steps, /same.+tasks\[\].+batch.+independent.+vertical.+slice/iu);
  assert.match(steps, /task.+public behavior.+RED.+minimal.+implementation.+GREEN.+refactor/iu);
  assert.match(steps, /targeted.+package.+current revision/iu);
  assert.match(steps, /runtime.+isolated.+installed OMP E2E.+event.+provider.+runner/iu);
  assert.match(steps, /Main.+integrat.+current tree.+semantic diff.+test(?: and E2E)? evidence.+review/iu);
  assert.match(steps, /reviewer.+Main-reviewed.+bounded.+semantic diff.+evidence.+without.+project.+read.+command/iu);
  assert.match(steps, /supported.+finding.+task.+repair.+fresh evidence.+at most one.+fresh reviewer.+never.+automatic/iu);
  assert.match(steps, /release.+only when.+explicit/iu);
  assert.match(delegation, /plan.+complete.+parallel.+plan/iu);
  assert.match(delegation, /task.+vertical.+RED.+GREEN.+REFACTOR/iu);
  assert.match(delegation, /reviewer.+Main-reviewed.+semantic diff/iu);
  assert.match(delegation, /task.+supported.+finding.+repair/iu);
  assert.match(quality, /plan-review disposition.+task-owned.+RED-before-production.+GREEN.+Main self-review.+installed E2E.+review reconciliation/iu);
  assert.match(risks, /prompt.+installed-runtime.+drift.+isolated evidence.+stochastic.+one pass/iu);
});

test('new workflows use bounded exact roles', () => {
  const expected = {
    'code.dev': ['plan', 'task', 'reviewer'],
    'network.design': ['ecc-network-architect'],
    'network.homelab': ['ecc-network-architect'],
    'network.review': ['ecc-network-config-reviewer'],
    'network.debug': ['ecc-network-troubleshooter'],
    'database.review': ['task', 'reviewer'],
    'database.change': ['plan', 'task', 'reviewer'],
    'database.migration.repair': ['plan', 'task', 'reviewer'],
    'ml.review': ['task', 'reviewer'],
    'ml.debug': ['plan', 'task', 'reviewer'],
    'release.opensource': [
      'ecc-opensource-forker',
      'ecc-opensource-sanitizer',
      'ecc-opensource-packager',
      'reviewer',
    ],
    'marketing.campaign': ['task'],
    'seo.audit': ['task', 'reviewer'],
    'omp.plugin': ['plan', 'task', 'reviewer'],
  };

  for (const [id, roles] of Object.entries(expected)) {
    const workflow = workflowCatalog[id];
    assert.ok(workflow, `missing workflow ${id}`);
    assert.deepEqual(workflow.roles, roles, id);
  }

  const allRoles = new Set(workflowDefinitions.flatMap(({ roles }) => roles));
  for (const forbidden of [
    'quick_task',
    'ecc-code-reviewer',
    'ecc-tdd-guide',
    'ecc-e2e-runner',
    'ecc-pr-test-analyzer',
    'ecc-performance-optimizer',
    'ecc-mle-reviewer',
    'ecc-pytorch-build-resolver',
    'ecc-healthcare-reviewer',
    'explore',
    'implementation-task',
    'config-librarian',
    'omp-target-auditor',
    'test-planner',
    'test-executor',
    'test-reviewer',
  ]) {
    assert.equal(allRoles.has(forbidden), false, forbidden);
  }

  assert.equal(allRoles.has('task'), true, 'native task must own ordinary code slices');
});

test('high-risk workflows define substantive composition, skills, and evidence contracts', () => {
  const contracts = {
    'code.dev': {
      compose: ['security.review', 'release.publish'],
      skills: ['code-development'],
      evidence: ['local entry-to-caller-to-test trace', 'parallel vertical slices', 'task-owned RED-before-production', 'Main self-review', 'semantic diff'],
    },
    'database.migration.repair': {
      compose: ['database.review', 'security.review'],
      skills: ['database-migrations', 'postgres-patterns', 'code-development'],
      evidence: ['backup', 'rollback', 'migration state'],
    },
    'ml.review': {
      compose: ['security.review', 'factcheck.document'],
      skills: ['mle-workflow', 'code-development'],
      evidence: ['reproducibility', 'leakage', 'serving'],
    },
    'release.opensource': {
      compose: ['security.review', 'release.publish'],
      skills: ['opensource-pipeline', 'code-development'],
      evidence: ['staging', 'sanitization', 'publish'],
    },
    'marketing.campaign': {
      compose: ['research.web', 'factcheck.document', 'writing.zh', 'writing.en', 'design.visual'],
      skills: ['marketing-campaign', 'market-research'],
      evidence: ['fact', 'claim', 'language'],
    },
    'seo.audit': {
      compose: ['research.web', 'factcheck.document', 'design.visual'],
      skills: ['seo'],
      evidence: ['crawl', 'index', 'render', 'evidence'],
    },
  };

  for (const [id, contract] of Object.entries(contracts)) {
    const workflow = workflowCatalog[id];
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
