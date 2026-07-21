import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WORKFLOW_CATALOG_VERSION,
  workflowCatalog,
  workflowDefinitions,
  workflowIds,
} from '../plugins/omp-enhancer-core/src/workflows/catalog.js';
import { buildSharedWorkflowCatalogMarkdown } from '../plugins/omp-enhancer-core/src/workflows/render-shared-markdown.js';
import {
  buildWorkflowSkillReferences,
  workflowReferenceUri,
} from '../plugins/omp-enhancer-core/src/workflows/render-skill.js';
import { defineWorkflowCatalog } from '../plugins/omp-enhancer-core/src/workflows/schema.js';
import { exactNestedEccSkillUri } from '../plugins/omp-enhancer-core/src/workflows/skill-discovery.js';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OMP_NATIVE_ROLE_IDS = new Set(['scout', 'task', 'sonic', 'designer', 'librarian', 'reviewer']);

test('catalog v21 assigns exactly one direct, one deferred, and 28 subagent-driven defaults', () => {
  assert.equal(WORKFLOW_CATALOG_VERSION, 21);
  assert.equal(workflowDefinitions.length, 30);
  assert.deepEqual(
    [...new Set(workflowDefinitions.map(({ delegationDefault }) => delegationDefault))].sort(),
    ['defer-until-composed', 'direct-simple', 'subagent-driven'],
  );
  assert.deepEqual(
    workflowDefinitions.filter(({ delegationDefault }) => delegationDefault === 'direct-simple').map(({ id }) => id),
    ['agentic.simple'],
  );
  assert.deepEqual(
    workflowDefinitions.filter(({ delegationDefault }) => delegationDefault === 'defer-until-composed').map(({ id }) => id),
    ['writing.pending'],
  );
  assert.equal(
    workflowDefinitions.filter(({ delegationDefault }) => delegationDefault === 'subagent-driven').length,
    28,
  );
  assert.deepEqual(
    Object.entries(workflowCatalog).map(([id, { delegationDefault }]) => [id, delegationDefault]),
    workflowDefinitions.map(({ id, delegationDefault }) => [id, delegationDefault]),
  );
});

test('packaged catalog, index, and all references expose catalog v21 execution defaults', async () => {
  const catalog = await readFile(new URL('../plugins/omp-config/assets/WORKFLOW_CATALOG.md', import.meta.url), 'utf8');
  const skillIndex = await readFile(new URL('../plugins/omp-config/skills/omp-enhancer-workflows/SKILL.md', import.meta.url), 'utf8');
  const referencesDir = new URL('../plugins/omp-config/skills/omp-enhancer-workflows/references/', import.meta.url);
  const referenceNames = (await readdir(referencesDir)).filter((name) => name.endsWith('.md')).sort();
  const references = await Promise.all(referenceNames.map((name) => readFile(new URL(name, referencesDir), 'utf8')));
  const referenceText = references.join('\n');

  assert.match(catalog, /OMP_WORKFLOW_CATALOG_VERSION: 21/);
  assert.match(skillIndex, /Catalog version: 21/);
  assert.equal(referenceNames.length, 30);
  assert.equal((catalog.match(/^- Execution default \(soft\): `subagent-driven`/gm) ?? []).length, 28);
  assert.equal((catalog.match(/^- Execution default \(soft\): `direct-simple`/gm) ?? []).length, 1);
  assert.equal((catalog.match(/^- Execution default \(soft\): `defer-until-composed`/gm) ?? []).length, 1);
  assert.equal((referenceText.match(/^EXECUTION DEFAULT \(soft\): `subagent-driven`/gm) ?? []).length, 28);
  assert.equal((referenceText.match(/^EXECUTION DEFAULT \(soft\): `direct-simple`/gm) ?? []).length, 1);
  assert.equal((referenceText.match(/^EXECUTION DEFAULT \(soft\): `defer-until-composed`/gm) ?? []).length, 1);
  assert.match(skillIndex, /EXECUTION:[\s\S]*DIRECT skips[\s\S]*`agentic\.simple` has no `task`[\s\S]*`writing\.pending` composes once[\s\S]*(?:every )?other (?:loaded )?cards? uses? the compiler(?: below)?/iu);
  assert.match(skillIndex, /PLAN text alone is incomplete[\s\S]*same response calls NOW[\s\S]*calls THEN if NOW=none/iu);
  assert.match(skillIndex, /Navigation only[\s\S]*never routes[\s\S]*gates[\s\S]*selects Agents[\s\S]*decides completion/iu);
  assert.doesNotMatch(`${catalog}\n${skillIndex}\n${referenceText}`, /block:\s*true|continue:\s*true|triggerTurn|systemPrompt\s*=/i);
});

test('shared catalog exposes exact Skill URIs while references omit late Skill candidates', async () => {
  const catalog = await readFile(new URL('../plugins/omp-config/assets/WORKFLOW_CATALOG.md', import.meta.url), 'utf8');
  const skillIndex = await readFile(new URL('../plugins/omp-config/skills/omp-enhancer-workflows/SKILL.md', import.meta.url), 'utf8');
  const agents = await readFile(new URL('../plugins/omp-config/assets/AGENTS.md', import.meta.url), 'utf8');
  const claude = await readFile(new URL('../plugins/omp-config/assets/CLAUDE.md', import.meta.url), 'utf8');
  const watchdog = await readFile(new URL('../plugins/omp-config/assets/WATCHDOG.yml', import.meta.url), 'utf8');
  const referencesByWorkflow = buildWorkflowSkillReferences();
  const skillReferences = Object.values(referencesByWorkflow).join('\n');

  assert.equal(catalog, buildSharedWorkflowCatalogMarkdown());
  assert.equal(WORKFLOW_CATALOG_VERSION, 21);
  assert.equal(Number(catalog.match(/OMP_WORKFLOW_CATALOG_VERSION:\s*(\d+)/)?.[1]), WORKFLOW_CATALOG_VERSION);
  assert.deepEqual([...catalog.matchAll(/^### `([^`]+)`$/gm)].map((match) => match[1]), workflowIds);
  const indexedWorkflowIds = [...skillIndex.matchAll(/^- `([^`]+)` —/gm)].map((match) => match[1]);
  assert.equal(new Set(indexedWorkflowIds).size, workflowIds.length);
  assert.deepEqual([...indexedWorkflowIds].sort(), [...workflowIds].sort());
  assert.match(skillIndex, /staged project work/i);
  assert.match(skillIndex, /verbatim field lookup needs no Skill or TODO/is);
  assert.match(skillIndex, /STATE: DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY/iu);
  assert.match(skillIndex, /1\. \*\*DISCOVER\*\*[\s\S]*completed DISCOVER result[\s\S]*do not read `skill:\/\/omp-enhancer-workflows` again/i);
  assert.match(skillIndex, /2\. \*\*DECLARE \+ LOAD\*\*[\s\S]*operation, source, and output[\s\S]*Emit PLAN first[\s\S]*load NOW[\s\S]*load THEN[\s\S]*Project tools start only after the READY \+ TODO response ends and its results return/i);
  assert.match(skillIndex, /## State handoff[\s\S]*SELECTION:[\s\S]*Primary = central deliverable/iu);
  assert.match(skillIndex, /SELECTION:[\s\S]*Primary = central deliverable[\s\S]*independent requested operations\/outputs = Add-ons/iu);
  assert.match(skillIndex, /SKILL DISCOVERY:[\s\S]*`D` and `C` are optional candidates, never load sets[\s\S]*matches the requested method, evidence rule, verdict, or format[\s\S]*refs stay in THEN/iu);
  assert.doesNotMatch(skillIndex, /Exclude every `Not for`|Honor `Not for`/iu);
  assert.match(skillIndex, /Format-only => format Primary/i);
  assert.match(skillIndex, /LOAD:[\s\S]*Skills=exact domain Skill\/catalog URIs[\s\S]*NOW=non-supplied Skills\/catalogs[\s\S]*THEN=Add-on refs then Primary[\s\S]*max 2 catalog \+ 1 method extensions[\s\S]*Never guess\/reread\/re-PLAN/i);
  assert.match(skillIndex, /DECLARE HANDOFF \(soft\):[\s\S]*Next visible response MUST start byte 0 with `WORKFLOW PLAN`[\s\S]*contain only this form[^\n]*\nWORKFLOW PLAN\nPrimary: <id-or-none>\nAdd-ons: <ids-or-none>\nSkills: <exact domain Skill\/catalog URIs-or-none>\nLoad order: NOW=\[<chosen non-supplied Skill\/catalog URIs-or-none>\] THEN=\[<Add-on PLAN URIs; Primary PLAN URI last-or-none>\]\nActions:\n1\. LOAD:[\s\S]*2\. COMMIT:[\s\S]*3\. SPLIT \+ EXECUTE:[\s\S]*4\. VERIFY:/i);
  assert.doesNotMatch(skillIndex, /assistant content\[0\]/iu);
  assert.match(skillIndex, /PLAN text alone is incomplete[\s\S]*same response calls NOW and waits[\s\S]*calls THEN if NOW=none[\s\S]*THEN is one final resource-only batch[\s\S]*Give each evidence checkpoint an Action/iu);
  assert.match(skillIndex, /AFTER NOW:[^\n]*empty revealed URI set[^\n]*no text\/marker[^\n]*call the THEN batch[^\n]*RESOURCE EXTENSION MUST list >=1 exact revealed URI[^\n]*`reads=none` is invalid/iu);
  assert.match(skillIndex, /COMMIT HANDOFF \(soft\):[\s\S]*after every declared NOW resource, revealed extension, and THEN reference has returned or been marked unavailable[\s\S]*next response begins `W`[\s\S]*initializes native TODO only[\s\S]*Project tools start only after the READY \+ TODO response ends and its results return/iu);
  assert.match(skillIndex, /SELECTION:[\s\S]*Primary = central deliverable[\s\S]*independent requested operations\/outputs = Add-ons/iu);
  assert.match(skillIndex, /PROSE:[\s\S]*English draft\/revision -> `writing\.en`[\s\S]*Other central operation => language Add-on[\s\S]*`\.tex` target[\s\S]*`writing\.latex` Add-on/iu);
  assert.match(skillIndex, /3\. \*\*COMMIT \+ EXECUTE\*\*[\s\S]*Emit READY first[\s\S]*commit loaded methods to detailed native TODO[\s\S]*split, execute, and verify/i);
  assert.doesNotMatch(skillIndex, /slices=<|assignment-input=|Composition example:|\[workflow=<ids>/i);
  assert.doesNotMatch(skillIndex, /^- `[^`]+`[^\n]+\b(?:Add-ons|Skills):/gmu);
  assert.match(skillIndex, /SKILL DISCOVERY:[\s\S]*enumerated `C` URI goes directly in PLAN\/NOW[\s\S]*`skill:\/\/ecc-skill-catalog` remains only for unlisted niche discovery/iu);
  assert.match(skillIndex, /`network\.design`[^\n]*C=\[`skill:\/\/ecc-skill-catalog\/network-config-validation\/SKILL\.md`, `skill:\/\/ecc-skill-catalog\/safety-guard\/SKILL\.md`\][^\n]*PLAN URI:/iu);
  assert.ok(Buffer.byteLength(skillIndex) < 15_000, 'Main workflow index should stay below 15k');
  assert.match(skillIndex, /Navigation only[\s\S]*never routes[\s\S]*gates[\s\S]*decides completion/i);
  assert.doesNotMatch(skillIndex, /block:\s*true|continue:\s*true|hard router|automatic retry/iu);
  assert.doesNotMatch(skillIndex, /All resources loaded|WRONG:|CORRECT:|after optional hidden thinking|Thinking "/iu);

  assert.deepEqual(Object.keys(referencesByWorkflow), workflowIds);

  for (const definition of workflowDefinitions) {
    assert.ok(
      skillIndex.includes(`PLAN URI: \`${workflowReferenceUri(definition.id)}\`.`),
      `${definition.id} is missing its literal reference URI`,
    );
    assert.equal((referencesByWorkflow[definition.id].match(/^## `/gm) ?? []).length, 1, `${definition.id} reference must contain one card`);
    const section = workflowSkillSection(skillReferences, definition.id);
    const catalogSection = workflowCatalogSection(catalog, definition.id);
    assert.ok(section.includes(`- Primary when: ${definition.chooseWhen}`), `${definition.id} chooseWhen is hidden from Main`);
    assert.doesNotMatch(section, /Add-on candidates/iu, `${definition.id} reference should not reopen composition after PLAN`);
    for (const [index, step] of definition.steps.entries()) {
      assert.ok(section.includes(`${index + 1}. [${step.id}] ${step.text}`), `${definition.id} is missing ${step.id}`);
    }
    for (const skill of definition.skills) {
      const uri = definition.catalogSkills.includes(skill)
        ? exactNestedEccSkillUri(skill)
        : `skill://${skill}`;
      assert.ok(catalogSection.includes(`\`${uri}\``), `${definition.id} catalog is missing exact Skill URI ${uri}`);
    }
    assert.doesNotMatch(section, /Optional Skill topics|Skill candidates/iu, `${definition.id} reference should not reopen Skill selection after PLAN`);
    for (const role of definition.roles) {
      assert.ok(section.includes(`\`${role}\``), `${definition.id} is missing optional role ${role}`);
    }
    for (const line of definition.delegation) assert.ok(section.includes(withoutTerminalPunctuation(line)));
    for (const line of definition.qualityChecks) assert.ok(section.includes(withoutTerminalPunctuation(line)));
    for (const line of definition.scopeNotes) assert.ok(section.includes(withoutTerminalPunctuation(line)));
    for (const line of definition.riskNotes) assert.ok(section.includes(withoutTerminalPunctuation(line)));
    assert.ok(
      section.includes(`EXECUTION DEFAULT (soft): ${executionDefaultLabel(definition.delegationDefault)}`),
      `${definition.id} reference is missing ${definition.delegationDefault}`,
    );
    assert.ok(
      catalogSection.includes(`- Execution default (soft): ${executionDefaultLabel(definition.delegationDefault)}`),
      `${definition.id} catalog card is missing ${definition.delegationDefault}`,
    );
  }

  assert.match(catalog, /filled PLAN[^\n]*byte 0 is `W`[\s\S]*filled `WORKFLOW READY \|`[^\n]*byte 0 is `W`/iu);
  assert.match(catalog, /exact nested ECC URI listed on a card[^\n]*directly in PLAN\/NOW[^\n]*`skill:\/\/ecc-skill-catalog`[^\n]*unlisted niche discovery/iu);

  assert.equal(countSharedCatalogImports(agents), 0, 'Main should use the compact prompt and on-demand workflow Skill');
  assert.equal(countSharedCatalogImports(watchdog), 0, 'Advisor should coach Main through the on-demand workflow Skill without a full catalog import');
  assert.match(agents, /OMP's native system prompt, settings, active tools, dynamic Available Agents, approval flow, and completion behavior are authoritative/);
  assert.match(agents, /DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY/u);
  assert.match(agents, /verbatim field or heading lookup without analysis[\s\S]*use no workflow Skill or TODO/is);
  assert.match(agents, /Only a native `skill-prompt` body named `omp-enhancer-workflows` counts as the supplied index[\s\S]*AGENTS\.md[\s\S]*Available Skills list[\s\S]*do not count[\s\S]*Otherwise the first PROJECT tool batch reads only `skill:\/\/omp-enhancer-workflows`[\s\S]*wait/iu);
  assert.match(agents, /next response puts the filled PLAN in visible assistant text before any resource call[\s\S]*byte 0 is `W`:\n\nWORKFLOW PLAN\nPrimary: <id-or-none>\nAdd-ons: <ids-or-none>\nSkills: <exact domain Skill\/catalog URIs-or-none>\nLoad order: NOW=\[<chosen non-supplied Skill\/catalog URIs-or-none>\] THEN=\[<Add-on PLAN URIs; Primary PLAN URI last-or-none>\]\nActions:\n1\. LOAD:[\s\S]*2\. COMMIT:[\s\S]*3\. SPLIT \+ EXECUTE:[\s\S]*4\. VERIFY:/i);
  assert.match(agents, /Primary and Add-ons are workflow IDs copied verbatim from the loaded index[\s\S]*Skill names are never workflow IDs/iu);
  assert.match(agents, /visible assistant text before any resource call[\s\S]*resource call without that visible PLAN/iu);
  assert.doesNotMatch(agents, /assistant content\[0\]/iu);
  assert.match(agents, /`Skills` lists exact domain Skill\/catalog URIs only[\s\S]*workflow references appear only in `THEN`[\s\S]*`NOW` copies the chosen Skill\/catalog URIs[\s\S]*`THEN` copies selected Add-on `PLAN URI` values in order and the Primary `PLAN URI` once and last/iu);
  assert.match(agents, /Index `D` entries are top-level exact URIs[\s\S]*`C` entries are enumerated nested ECC exact URIs[\s\S]*selected D\/C entries copy directly into `Skills` and `NOW`[\s\S]*unlisted niche discovery/iu);
  assert.match(agents, /PLAN response reads exactly `NOW` once and waits[\s\S]*When `NOW=\[none\]`, it reads exactly `THEN` once and waits[\s\S]*no project tool, `todo`, or `task`/iu);
  assert.match(agents, /RESOURCE EXTENSION \| source=<loaded-exact-skill-uri> \| reads=<revealed-exact-skill-uris>/u);
  assert.match(agents, /at most three extension batches[\s\S]*two catalog hops plus one linked-method batch[\s\S]*source must already be loaded[\s\S]*never guess[\s\S]*reread/iu);
  assert.match(agents, /After extensions, read `THEN` once in a final reference-only batch and wait/iu);
  assert.match(agents, /Copy a visible Skill name `x` to literal `skill:\/\/x`[\s\S]*Bare `x` is a project path[\s\S]*not the complete runtime inventory[\s\S]*exact declared `skill:\/\/\.\.\.` resolver call fails/iu);
  assert.match(agents, /native `skill-prompt` body is already loaded[\s\S]*keep its exact URI in PLAN `Skills`[\s\S]*omit it from `NOW`[\s\S]*never reread it/iu);
  assert.match(claude, /native `skill-prompt` body is already loaded[\s\S]*keep its exact URI in PLAN `Skills`[\s\S]*omit it from `NOW`[\s\S]*never reread it/iu);
  assert.match(agents, /Project tools start only after the READY \+ TODO response ends and its results return[\s\S]*user's explicit source-language description is sufficient[\s\S]*select only the visible `writing\.pending` option/iu);
  assert.match(agents, /After its initial READY\/TODO wait[\s\S]*replacement PLAN[\s\S]*only new language Skills in NOW[\s\S]*language Primary reference last in THEN[\s\S]*replacement READY\/TODO/iu);
  assert.match(agents, /After all declared resources return or are marked unavailable, the next response is the filled READY plus native TODO init[\s\S]*byte 0 is `W`[\s\S]*WORKFLOW READY \| primary=<id-or-none>[\s\S]*Rebase a detailed TODO/iu);
  assert.match(agents, /Preserve every named plan review, RED, GREEN, E2E, independent review, and parent verification checkpoint/iu);
  assert.match(agents, /next response is the filled READY plus native TODO init[\s\S]*byte 0 is `W`[\s\S]*Apply the loaded-card soft compiler:[\s\S]*one exact Delegate row for that checkpoint[\s\S]*Parent VERIFY rows remain separate[\s\S]*Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>/iu);
  assert.match(agents, /COMPILE \(soft\): loaded `subagent-driven` \+ complete input \+ safe checkpoint \+ visible matching Agent => Delegate row[\s\S]*fallback=<one matched permitted limitation>/iu);
  assert.match(agents, /Main chooses direct work, Agent, and fork width from the committed TODO[\s\S]*Every non-simple loaded card is soft `subagent-driven`[\s\S]*`agentic\.simple` uses zero `task` calls/iu);
  assert.match(agents, /After all parent-owned pre-dispatch prerequisites[\s\S]*committed `task` is the next project action/iu);
  assert.match(agents, /\[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>\]/i);
  assert.match(agents, /copy the TODO Agent exactly to native `agent`[\s\S]*Copy workflow, step, skills, and the checkpoint verbatim[\s\S]*assignment byte 0/iu);
  assert.match(agents, /Copy every direct user constraint verbatim into the job body[\s\S]*Fill every required native field[\s\S]*child follows its assignment and does not own the parent TODO/iu);
  assert.match(claude, /copy the TODO Agent exactly to native `agent`[\s\S]*assignment byte 0[\s\S]*Copy every direct user constraint verbatim/iu);
  assert.match(claude, /RESOURCE EXTENSION \| source=<loaded-exact-skill-uri> \| reads=<revealed-exact-skill-uris>/u);
  assert.match(agents, /substantive code mutation[\s\S]*plugin `plan` review[\s\S]*native `task` slice owns test mutation, valid RED, minimum production, the same-command GREEN[\s\S]*writes `MAIN REVIEW` before native `reviewer`/iu);
  assert.match(claude, /substantive code mutation[\s\S]*plugin `plan` review[\s\S]*valid RED[\s\S]*same-command GREEN[\s\S]*`MAIN REVIEW` before native `reviewer`/iu);
  assert.doesNotMatch(`${agents}\n${claude}`, /All resources loaded|WRONG:|CORRECT:|after optional hidden thinking|Thinking "/iu);
  assert.doesNotMatch(`${agents}\n${claude}`, /block:\s*true|continue:\s*true|systemPrompt\s*=|triggerTurn\s*\(/iu);
  assert.match(watchdog, /OMP's native Advisor instructions and runtime settings are authoritative/);
  assert.match(watchdog, /Use at most one ordinary `advise` per primary user task[\s\S]*complete user-visible Main final sets the budget to zero/i);
  assert.match(watchdog, /workflow window is Main's `DISCOVER -> DECLARE -> LOAD -> COMMIT`[\s\S]*before its first native `task` or substantive project action[\s\S]*resource reads keep the window open/i);
  assert.match(watchdog, /native `skill-prompt` body named `omp-enhancer-workflows`[\s\S]*AGENTS\.md[\s\S]*do not count[\s\S]*DISCOVER is complete: no read; PLAN is next/iu);
  assert.match(watchdog, /next response puts filled PLAN in visible assistant text before declared resource calls[\s\S]*byte 0 is `W`[\s\S]*`NOW`[\s\S]*`THEN`[\s\S]*PLAN reads NOW only and waits[\s\S]*with NOW none it reads THEN and waits/iu);
  assert.match(watchdog, /Index D is top-level exact and C is enumerated nested ECC exact[\s\S]*selected D\/C goes directly to Skills\/NOW[\s\S]*unlisted niche discovery/iu);
  assert.match(watchdog, /RESOURCE EXTENSION \| source=<loaded-exact-skill-uri> \| reads=<revealed-exact-skill-uris>[\s\S]*Limit three batches[\s\S]*Final references use THEN once and wait/iu);
  assert.match(watchdog, /next response after resource loading is filled READY plus native TODO init[\s\S]*byte 0 is `W`[\s\S]*Apply this soft compiler:[\s\S]*one `Delegate Agent=\.\.\. workflow=\.\.\. step=\.\.\. skills=\.\.\. checkpoint=\.\.\.` row[\s\S]*fallback=<one matched permitted limitation>/iu);
  assert.match(watchdog, /writing\.pending[\s\S]*language-only read keeps it open through replacement PLAN\/LOAD\/READY/iu);
  assert.doesNotMatch(watchdog, /assistant content\[0\]/iu);
  assert.match(watchdog, /DECISION CHECK \(optional\) \| drift=<one-material-drift> \| evidence=<one-visible-fact> \| next=<one-smallest-safe-action>/i);
  assert.match(watchdog, /Eligible drift includes an absent visible marker, undeclared resource, NOW\/THEN mismatch[\s\S]*task metadata mismatch/iu);
  assert.match(watchdog, /Only exact declared `skill:\/\/\.\.\.` resolver failure supports Skill unavailability[\s\S]*supplied native `skill-prompt` body is loaded and omitted from NOW/iu);
  assert.match(watchdog, /Never guess unseen workflow, Skill, or Agent IDs[\s\S]*choose resources[\s\S]*demand duplicate reads[\s\S]*choose a fork or reviewer count[\s\S]*Workflow\/Skill\/TODO\/schema drift alone is never a blocker/iu);
  assert.doesNotMatch(watchdog, /block:\s*true|continue:\s*true|hard router|automatic retry|triggerTurn\s*\(/iu);
  assert.match(catalog, /optional reference material/i);
  assert.match(catalog, /staged sequence below is model guidance, not a runtime-enforced precondition or completion gate/i);
  assert.match(catalog, /analysis, judgment, workflow composition, coordinated stages, or possible delegation/i);
  assert.match(catalog, /mechanical field lookup without analysis[\s\S]*uses no Skill/is);
  assert.match(catalog, /Main explicitly writes the exact `WORKFLOW PLAN` block[\s\S]*exact domain Skill or catalog URIs[\s\S]*NOW\/THEN resource load order[\s\S]*at least four detailed Actions/i);
  assert.match(catalog, /PLAN uses `Load order: NOW=\[\.\.\.\] THEN=\[\.\.\.\]`[\s\S]*`Skills` lists exact domain Skill or catalog URIs only[\s\S]*THEN alone copies selected Add-on reference URIs plus the Primary once and last[\s\S]*Main reads NOW and waits[\s\S]*at most three visible `RESOURCE EXTENSION` batches[\s\S]*reads THEN once and waits/i);
  assert.match(catalog, /Once resources are loaded or marked unavailable[\s\S]*next response is the filled `WORKFLOW READY \|` plus native TODO initialization[\s\S]*rebases the detailed TODO[\s\S]*calls only native TODO initialization[\s\S]*waits/iu);
  assert.match(catalog, /Add-on enriches and never replaces the Primary/i);
  assert.match(catalog, /selected combination remains Agent-owned/i);
  assert.match(catalog, /small target is not by itself a reason for `agentic\.simple`/i);
  assert.match(catalog, /literal TODO row `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`/i);
  assert.match(catalog, /sets the native task item `agent` to the row Agent[\s\S]*mechanically copies workflow, step, and skills unchanged and the checkpoint value verbatim into `todo`/i);
  assert.match(catalog, /task body copies every direct user constraint verbatim and adds no examples[\s\S]*carries allowed effects and acceptance items[\s\S]*outer context, name, or label cannot substitute/iu);
  assert.match(catalog, /assignment text byte 0 begins `\[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>\]`/i);
  assert.match(catalog, /EXECUTION DEFAULTS \(soft\):[\s\S]*All other selected workflows use the `subagent-driven` default/iu);
  assert.match(catalog, /defaults guide Main but never select an Agent or fork width/iu);
  assert.match(catalog, /substantive code.+subagent-driven.+plugin `plan`.+native `task`.+native `reviewer`/isu);
  assert.match(catalog, /same native `task` `tasks\[\]` batch.+runnable independent.+vertical slices.+dependent.+later wave/isu);
  assert.match(catalog, /Main.+integrat.+current tree.+diff.+evidence.+review.+before.+reviewer/isu);
  assert.match(catalog, /body of the text being modified/i);
  assert.match(catalog, /`writing\.pending`[\s\S]*initial READY[\s\S]*one narrow source read[\s\S]*language only[\s\S]*one replacement `WORKFLOW PLAN`[\s\S]*same format Add-ons[\s\S]*new language Skills[\s\S]*language workflow reference last[\s\S]*do not reread loaded companions[\s\S]*replacement `WORKFLOW READY`/iu);
  assert.match(catalog, /language remains ambiguous[\s\S]*ask the user[\s\S]*never loop or guess/iu);
  assert.doesNotMatch(catalog, /block:\s*true|continue:\s*true|hard gate/i);
});

test('workflow schema rejects drift-prone definitions', () => {
  const valid = (overrides = {}) => ({
    id: 'example.base',
    chooseWhen: 'An example is needed.',
    composeWith: [],
    steps: [{ id: 'step-1', text: 'Perform the example.' }],
    scopeNotes: [],
    skills: [],
    qualityChecks: ['example is correct'],
    riskNotes: [],
    roles: [],
    delegation: ['step-1: keep this workflow with the main agent'],
    delegationDefault: 'direct-simple',
    ...overrides,
  });

  assert.throws(() => defineWorkflowCatalog([[valid(), valid()]]), /Duplicate workflow id/);
  assert.throws(() => defineWorkflowCatalog([[valid({ composeWith: ['missing.workflow'] })]]), /unknown workflow/);
  assert.throws(() => defineWorkflowCatalog([[valid({ delegation: ['step-2: keep this workflow with the main agent'] })]]), /unknown delegation step/);
  assert.throws(() => defineWorkflowCatalog([[valid({ roles: ['reviewer'] })]]), /does not assign role reviewer/);
  assert.throws(() => defineWorkflowCatalog([[valid({ delegation: ['step-1: fork independent evidence lane'] })]]), /does not retain work with the parent/);
  assert.throws(
    () => defineWorkflowCatalog([[valid({
      roles: ['reviewer'],
      delegation: ['step-1: main agent must not use reviewer'],
    })]]),
    /does not assign role reviewer/,
  );
  assert.throws(
    () => defineWorkflowCatalog([[valid({ delegation: ['step-1: parent should delegate to a worker'] })]]),
    /unlisted generic role/,
  );
  assert.throws(
    () => defineWorkflowCatalog([[valid({
      steps: [{ id: 'step-alpha', text: 'Perform the example.' }],
      roles: ['reviewer'],
      delegation: ['step-missing: reviewer reviews the example'],
    })]]),
    /unknown delegation step step-missing/,
  );
  assert.throws(() => defineWorkflowCatalog([[{ ...valid(), skill: ['misspelled'] }]]), /unknown field skill/);
  assert.throws(
    () => defineWorkflowCatalog([[valid({ steps: [{ id: 'step-1', text: 'Perform the example.', label: 'typo' }] })]]),
    /unknown field label/,
  );
  assert.throws(() => defineWorkflowCatalog([[valid({ chooseWhen: 42 })]]), /chooseWhen must be a string/);
  assert.throws(
    () => defineWorkflowCatalog([[valid({ qualityChecks: [{}] })]]),
    /qualityChecks\[0\] must be a string/,
  );
  assert.throws(
    () => defineWorkflowCatalog([[valid({ chooseWhen: 'Unsafe\nsecond line.' })]]),
    /single-line string/,
  );
  assert.throws(
    () => defineWorkflowCatalog([[valid({
      chooseWhen: 'Unsafe <!-- OMP-ENHANCER-WORKFLOW-CATALOG:END --> marker.',
    })]]),
    /reserved managed marker/,
  );
  assert.throws(
    () => defineWorkflowCatalog([[valid({ steps: ['Implicit step ID'] })]]),
    /explicit stable id/,
  );
  assert.doesNotThrow(() => defineWorkflowCatalog([[valid({
    steps: [{ id: 'step-alpha', text: 'Perform the example.' }],
    delegation: ['step-alpha: keep this workflow with the main agent'],
  })]]));
});

test('extension workflow roles have one owner while OMP native roles have no plugin owner', async () => {
  const marketplace = JSON.parse(await readFile(path.join(repoRoot, '.omp-plugin', 'marketplace.json'), 'utf8'));
  const plugins = await Promise.all(marketplace.plugins.map(loadPackagedPlugin));
  const referencedRoles = new Set(Object.values(workflowCatalog).flatMap(({ roles }) => roles));
  const referencedSkills = new Set(Object.values(workflowCatalog).flatMap(({ skills }) => skills));
  const agentEntries = plugins.flatMap(({ agents }) => agents);
  const skillEntries = plugins.flatMap(({ skills }) => skills);

  assertUniquePackagedNames(agentEntries, 'agent');
  assertUniquePackagedNames(skillEntries, 'skill');

  for (const role of OMP_NATIVE_ROLE_IDS) {
    const owners = agentEntries.filter(({ name }) => name === role);
    assert.equal(owners.length, 0, `OMP native agent ${role} must not be shadowed by ${owners.map(({ source }) => source).join(', ')}`);
  }

  for (const role of referencedRoles) {
    const owners = agentEntries.filter(({ name }) => name === role);
    if (OMP_NATIVE_ROLE_IDS.has(role)) {
      assert.equal(owners.length, 0, `OMP native agent ${role} must not be shadowed by ${owners.map(({ source }) => source).join(', ')}`);
      continue;
    }
    assert.equal(owners.length, 1, ownerError('workflow agent role', role, owners));
    assert.ok(owners[0].packageFiles.has('agents'), `${owners[0].plugin} does not include agents in package files`);
  }

  for (const skill of referencedSkills) {
    const owners = skillEntries.filter(({ name }) => name === skill);
    assert.equal(owners.length, 1, ownerError('workflow skill candidate', skill, owners));
    assert.ok(owners[0].packageFiles.has('skills'), `${owners[0].plugin} does not include skills in package files`);
  }
});

test('ordinary code work uses plan plus native task and reviewer without plugin wrappers', () => {
  assert.deepEqual(workflowCatalog['code.dev'].roles, ['plan', 'task', 'reviewer']);
  assert.deepEqual(workflowCatalog['database.change'].roles, ['plan', 'task', 'reviewer']);
  assert.deepEqual(workflowCatalog['database.migration.repair'].roles, ['plan', 'task', 'reviewer']);
  assert.deepEqual(workflowCatalog['ml.debug'].roles, ['plan', 'task', 'reviewer']);
  assert.deepEqual(workflowCatalog['omp.plugin'].roles, ['plan', 'task', 'reviewer']);
  assert.deepEqual(workflowCatalog['database.review'].roles, ['task']);
  assert.deepEqual(workflowCatalog['ml.review'].roles, ['task']);
  assert.deepEqual(workflowCatalog['security.review'].roles, ['ecc-security-reviewer']);
  assert.deepEqual(workflowCatalog['release.publish'].roles, ['task']);

  const allRoles = new Set(Object.values(workflowCatalog).flatMap(({ roles }) => roles));
  for (const retired of [
    'explore',
    'implementation-task',
    'config-librarian',
    'omp-target-auditor',
    'test-planner',
    'test-executor',
    'test-reviewer',
  ]) {
    assert.equal(allRoles.has(retired), false, retired);
  }

  for (const workflow of Object.values(workflowCatalog)) {
    if (workflow.roles.includes('task') && workflow.roles.includes('reviewer')) {
      assert.match(workflow.delegation.join(' '), /Main-reviewed.+(?:diff|patch).+evidence/i, 'OMP reviewer must only receive Main-reviewed evidence');
      assert.match(
        workflow.delegation.join(' '),
        /(?:does not read.+project.+run(?: a)? commands?|without project reads?, commands?)/i,
        'OMP reviewer must not inspect the project or run commands',
      );
    }
  }
});

test('README stays user-focused and links the detailed current documentation', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(readme.split('\n').length <= 110, 'root README should remain a concise user guide');
  assert.ok(Buffer.byteLength(readme) <= 6500, 'development detail belongs under docs');
  assert.match(readme, /OMP exposes available Skills and Agents; Main chooses under native permissions/i);
  assert.match(readme, /Only the exact native `skill-prompt` body named `omp-enhancer-workflows` counts as supplied/i);
  assert.match(readme, /`D` is a top-level Skill exact URI[\s\S]*`C` is an enumerated nested ECC exact URI[\s\S]*selected `D` or `C` URI goes directly into `WORKFLOW PLAN` and `NOW`[\s\S]*unenumerated long-tail ECC method requires `skill:\/\/ecc-skill-catalog`/i);
  assert.match(readme, /Writing choices are grouped as language, format overlays, and specialized outputs[\s\S]*`writing\.en` or `writing\.zh` is Primary[\s\S]*LaTeX is an Add-on[\s\S]*format workflow is Primary only for format- or structure-only work/i);
  assert.match(readme, /mechanical field lookups? without analysis.*no Skill or TODO/is);
  assert.match(readme, /PLAN response starts at byte 0 with `WORKFLOW PLAN`[\s\S]*READY response starts at byte 0 with `WORKFLOW READY \| \.\.\.`[\s\S]*rebases the detailed TODO/i);
  assert.match(readme, /Non-simple workflows softly default to subagent-driven execution[\s\S]*Main owns integration, verification, permissions, and effects/i);
  assert.match(readme, /all extension tools are inactive by default/i);
  assert.match(readme, /\/enhancer-tools enable/i);
  assert.match(readme, /there is no plugin `\/test` command/i);
  assert.match(readme, /docs\/ARCHITECTURE\.md/);
  assert.match(readme, /docs\/DEVELOPMENT\.md/);
  assert.match(readme, /docs\/WORKFLOW_DEVELOPMENT\.md/);
  assert.doesNotMatch(readme, /TODO-first|full workflow-catalog injection|omp_core_route_task|omp_test_gate|fact_check_gate/i);
});

function workflowSkillSection(catalog, id) {
  const start = catalog.indexOf(`## \`${id}\`\n`);
  const next = catalog.indexOf('\n## `', start + 1);
  assert.ok(start >= 0, `missing workflow Skill section ${id}`);
  return catalog.slice(start, next < 0 ? catalog.length : next);
}

function workflowCatalogSection(catalog, id) {
  const start = catalog.indexOf(`### \`${id}\`\n`);
  const next = catalog.indexOf('\n### `', start + 1);
  assert.ok(start >= 0, `missing shared catalog section ${id}`);
  return catalog.slice(start, next < 0 ? catalog.length : next);
}

function withoutTerminalPunctuation(value) {
  return value.replace(/[.!?]+$/u, '');
}

function executionDefaultLabel(delegationDefault) {
  return `\`${delegationDefault}\``;
}

function countSharedCatalogImports(value) {
  return (value.match(/^\s*@\.\/OMP_ENHANCER_WORKFLOW_CATALOG\.md\s*$/gm) ?? []).length;
}

async function loadPackagedPlugin(plugin) {
  const pluginRoot = path.join(repoRoot, 'plugins', plugin.source.replace(/^\.\//, ''));
  const packageJson = JSON.parse(await readFile(path.join(pluginRoot, 'package.json'), 'utf8'));
  const packageFiles = new Set((packageJson.files ?? []).map((entry) => entry.replace(/^\.\//, '').split('/')[0]));
  const skills = [];
  const agents = [];

  for (const skillPath of plugin.skills ?? []) {
    const skillDoc = await readFile(path.join(pluginRoot, skillPath, 'SKILL.md'), 'utf8');
    skills.push({
      name: frontmatterName(skillDoc, `${plugin.name}:${skillPath}`),
      plugin: plugin.name,
      source: `${plugin.name}:${skillPath}`,
      packageFiles,
    });
  }

  if (packageFiles.has('agents')) {
    for (const entry of await readdir(path.join(pluginRoot, 'agents'), { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const agentDoc = await readFile(path.join(pluginRoot, 'agents', entry.name), 'utf8');
      const source = `${plugin.name}:agents/${entry.name}`;
      agents.push({ name: frontmatterName(agentDoc, source), plugin: plugin.name, source, packageFiles });
    }
  }

  return { name: plugin.name, packageFiles, skills, agents };
}

function assertUniquePackagedNames(entries, kind) {
  const sourcesByName = new Map();
  for (const entry of entries) {
    const sources = sourcesByName.get(entry.name) ?? [];
    sources.push(entry.source);
    sourcesByName.set(entry.name, sources);
  }
  for (const [name, sources] of sourcesByName) {
    assert.equal(sources.length, 1, `duplicate packaged ${kind} name ${name}: ${sources.join(', ')}`);
  }
}

function ownerError(kind, name, owners) {
  const sources = owners.map(({ source }) => source).join(', ') || 'none';
  return `${kind} ${name} must have exactly one marketplace owner; found ${sources}`;
}

function frontmatterName(markdown, source) {
  const name = markdown.match(/^---\s*$[\s\S]*?^name:\s*([^\n]+)$/m)?.[1]?.trim();
  assert.ok(name, `${source} is missing a frontmatter name`);
  return name;
}
