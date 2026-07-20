import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkWorkflowArtifacts,
  writeWorkflowArtifacts,
} from './generate-workflow-catalog.js';
import {
  WORKFLOW_CATALOG_VERSION,
  workflowDefinitions,
} from '../plugins/omp-enhancer-core/src/workflows/catalog.js';

test('workflow artifact generator writes the optional workflow skill and one reference per workflow', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'omp-workflow-artifacts-'));
  const catalogTarget = path.join(root, 'assets', 'WORKFLOW_CATALOG.md');
  const skillRoot = path.join(root, 'skills', 'omp-enhancer-workflows');
  const staleReference = path.join(skillRoot, 'references', 'removed-domain.md');

  await mkdir(path.dirname(staleReference), { recursive: true });
  await writeFile(staleReference, '# obsolete\n', 'utf8');

  const missing = await checkWorkflowArtifacts({ catalogTarget, skillRoot });
  assert.equal(missing.ok, false);
  assert.equal(missing.results.some((result) => result.target === staleReference && result.unexpected), true);
  const written = await writeWorkflowArtifacts({ catalogTarget, skillRoot });
  assert.equal(written.results.length, workflowDefinitions.length + 2);
  assert.deepEqual(written.removed, [staleReference]);
  await assert.rejects(access(staleReference), (error) => error?.code === 'ENOENT');

  const checked = await checkWorkflowArtifacts({ catalogTarget, skillRoot });
  assert.equal(checked.ok, true);
  await writeWorkflowArtifacts({ catalogTarget, skillRoot });
  assert.equal((await checkWorkflowArtifacts({ catalogTarget, skillRoot })).ok, true);
  const skill = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');
  const sharedCatalog = await readFile(catalogTarget, 'utf8');
  assert.match(skill, /^---\nname: omp-enhancer-workflows\n/m);
  assert.match(skill, /Main owns delegation; OMP owns tools, permissions, TODO, Agents, and completion/i);
  assert.match(skill, new RegExp(`Catalog version: ${WORKFLOW_CATALOG_VERSION}\\b`, 'i'));
  assert.match(skill, /staged project work/i);
  assert.match(skill, /verbatim field lookup needs no Skill or TODO/is);
  assert.match(skill, /STATE: DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY/iu);
  assert.ok(
    skill.indexOf('DECLARE HANDOFF (soft):') < skill.indexOf('## Staged protocol'),
    'generated Skill must front-load the post-index PLAN handoff',
  );
  assert.ok(
    skill.indexOf('DECLARE HANDOFF (soft):') < skill.indexOf('Catalog version:'),
    'generated Skill must place the PLAN handoff before catalog prose',
  );
  assert.match(skill, /Next visible response MUST start byte 0 with `WORKFLOW PLAN`[\s\S]*contain only this form[\s\S]*Select internally[\s\S]*state stays silent/iu);
  assert.match(skill, /EXECUTION:[\s\S]*DIRECT skips[\s\S]*`agentic\.simple` has no `task`[\s\S]*`writing\.pending` composes once[\s\S]*every other loaded card uses the compiler below/iu);
  assert.match(skill, /1\. \*\*DISCOVER\*\*[\s\S]*completed DISCOVER result[\s\S]*do not read `skill:\/\/omp-enhancer-workflows` again/i);
  assert.match(skill, /2\. \*\*DECLARE \+ LOAD\*\*[\s\S]*operation, source, and output[\s\S]*Emit PLAN first[\s\S]*load NOW[\s\S]*load THEN[\s\S]*Project tools start only after the READY \+ TODO response ends and its results return/i);
  assert.match(skill, /3\. \*\*COMMIT \+ EXECUTE\*\*[\s\S]*Emit READY first[\s\S]*detailed native TODO[\s\S]*split, execute, and verify/iu);
  assert.match(skill, /## State handoff[\s\S]*SELECTION:[\s\S]*Primary = central deliverable/iu);
  assert.match(skill, /SELECTION:[\s\S]*Primary = central deliverable[\s\S]*independent requested operations\/outputs = Add-ons/iu);
  assert.match(skill, /SKILL DISCOVERY:[\s\S]*`D` and `C` are optional candidates, never load sets[\s\S]*select only a URI that matches the requested method, evidence rule, verdict, or format[\s\S]*refs stay in THEN/iu);
  assert.doesNotMatch(skill, /Exclude every `Not for`|Honor `Not for`/iu);
  assert.match(skill, /Format-only => format Primary/i);
  assert.match(skill, /LOAD:[\s\S]*Skills=exact domain Skill\/catalog URIs[\s\S]*NOW=non-supplied Skills\/catalogs[\s\S]*THEN=Add-on refs then Primary[\s\S]*max 2 catalog \+ 1 method extensions[\s\S]*Never guess\/reread\/re-PLAN/iu);
  assert.match(skill, /SKILL URI:[\s\S]*D is direct[\s\S]*C is exact nested and revealed here[\s\S]*Other nested URIs need a loaded source[\s\S]*Supplied bodies stay in PLAN\/READY, not NOW[\s\S]*only exact failure means unavailable/iu);
  assert.match(skill, /DECLARE HANDOFF \(soft\):[\s\S]*Next visible response MUST start byte 0 with `WORKFLOW PLAN`[\s\S]*contain only this form[^\n]*\nWORKFLOW PLAN\nPrimary: <id-or-none>\nAdd-ons: <ids-or-none>\nSkills: <exact domain Skill\/catalog URIs-or-none>\nLoad order: NOW=\[<chosen non-supplied Skill\/catalog URIs-or-none>\] THEN=\[<Add-on PLAN URIs; Primary PLAN URI last-or-none>\]\nActions:\n1\. LOAD:[\s\S]*2\. COMMIT:[\s\S]*3\. SPLIT \+ EXECUTE:[\s\S]*4\. VERIFY:/i);
  assert.doesNotMatch(skill, /assistant content\[0\]/iu);
  assert.match(skill, /PLAN reads NOW\/waits[\s\S]*THEN is one final unsplit resource-only batch\/wait[\s\S]*NOW=none[\s\S]*Give each evidence checkpoint an Action/iu);
  assert.match(skill, /AFTER NOW:[^\n]*empty revealed URI set[^\n]*no text\/marker[^\n]*call the THEN batch[^\n]*RESOURCE EXTENSION MUST list >=1 exact revealed URI[^\n]*`reads=none` is invalid/iu);
  assert.match(skill, /COMMIT HANDOFF \(soft\):[\s\S]*after every declared NOW resource, revealed extension, and THEN reference has returned or been marked unavailable[\s\S]*next response begins `W`[\s\S]*bare IDs[\s\S]*initializes native TODO only[\s\S]*Project tools start only after the READY \+ TODO response ends and its results return/i);
  assert.match(skill, /SELECTION:[\s\S]*Primary = central deliverable[\s\S]*independent requested operations\/outputs = Add-ons/iu);
  assert.match(skill, /PROSE:[\s\S]*English draft\/revision[\s\S]*Other central operation => language Add-on[\s\S]*`\.tex` target[\s\S]*LaTeX prose[\s\S]*`writing\.latex` Add-on[\s\S]*Format-only => format Primary/iu);
  assert.match(skill, /`writing\.latex`[^\n]*preservation-only Add-on selects zero format Skills[^\n]*explicit conversion or template selects one matching candidate[^\n]*D=\[`skill:\/\/format-markdown2latex`, `skill:\/\/format-latex2markdown`, `skill:\/\/format-template-latex`\]/iu);
  assert.doesNotMatch(skill, /slices=<|assignment-input=|Composition example:|\[workflow=<ids>/i);
  assert.match(skill, /SKILL DISCOVERY:[\s\S]*enumerated `C` URI goes directly in PLAN\/NOW[\s\S]*skip the full catalog[\s\S]*`skill:\/\/ecc-skill-catalog` remains only for unlisted niche discovery/iu);
  assert.match(skill, /`writing\.en`[^\n]*D=\[`skill:\/\/writing-review`\][^\n]*PLAN URI:/iu);
  assert.match(skill, /`network\.design`[^\n]*C=\[`skill:\/\/ecc-skill-catalog\/network-config-validation\/SKILL\.md`, `skill:\/\/ecc-skill-catalog\/safety-guard\/SKILL\.md`\][^\n]*PLAN URI:/iu);
  assert.ok(Buffer.byteLength(skill) < 15_000, 'workflow Skill index should stay below 15k');
  assert.match(skill, /Navigation only[\s\S]*never routes[\s\S]*gates[\s\S]*decides completion/i);
  assert.doesNotMatch(skill, /FIRST tool call|Invoke only roles|block:\s*true|continue:\s*true|hard router/i);
  assert.equal(
    skill.trimEnd().split('\n').at(-1),
    'NEXT VISIBLE BYTES MUST BE `WORKFLOW PLAN`; no preface; no plugin enforces this format.',
  );
  const codeReference = await readFile(path.join(skillRoot, 'references', 'code.dev.md'), 'utf8');
  assert.ok(
    codeReference.indexOf('READY NEXT (soft): SENTINEL 1/2') < codeReference.indexOf('## `code.dev`'),
    'generated reference must front-load the post-resource READY handoff',
  );
  assert.match(codeReference, /^READY NEXT \(soft\): SENTINEL 1\/2/u);
  assert.match(codeReference, /^READY NEXT \(soft\): SENTINEL 1\/2[^\n]*no plugin enforcement[^\n]*Next assistant response byte 0 = `W` of filled `WORKFLOW READY \|[^\n]+[^\n]*no other visible text[^\n]*native TODO init only[^\n]*end\/wait/iu);
  assert.match(codeReference, /delegated native TODO `items\[\]` string[\s\S]*exact Delegate row[\s\S]*no role-colon shorthand/iu);
  assert.match(codeReference, /checkpoint is one metadata-safe line[\s\S]*without `\]`[\s\S]*`workflow=`[\s\S]*`step=`[\s\S]*`todo=`[\s\S]*`skills=`[\s\S]*`checkpoint=`/iu);
  assert.match(codeReference, /native `tasks\[\]\.task` itself begins at byte 0[\s\S]*complete four-key prefix[\s\S]*common `context`[\s\S]*cannot substitute/iu);
  assert.match(codeReference, /Every native `task` call sets a non-empty top-level `context`[\s\S]*shared batch purpose[\s\S]*cannot substitute for an item body or its byte-0 prefix/iu);
  assert.match(codeReference, /After dispatch, end and wait for native auto-delivery[\s\S]*do not poll with `hub`/iu);
  assert.match(codeReference, /TASK COPY \(soft, later response\):[\s\S]*copy one committed Delegate row[\s\S]*native item `agent`[\s\S]*native item `todo`[\s\S]*assignment body byte 0[\s\S]*Never begin `# Target` or `# Goal`/iu);
  assert.equal((codeReference.match(/READY NEXT \(soft\): SENTINEL [12]\/2/gu) ?? []).length, 2);
  assert.doesNotMatch(codeReference, /COMMIT PREVIEW|READY NEXT \(soft\):\n|NEXT VISIBLE BYTES MUST BE `WORKFLOW READY`/u);
  assert.equal(
    codeReference.trimEnd().split('\n').at(-1),
    'READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = `W` of filled `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`; no other visible text; native TODO init only; end/wait.',
  );
  for (const [workflowId, writer, checker] of [
    ['writing.en', 'writer', 'checker'],
    ['writing.zh', 'zh-writer', 'zh-checker'],
  ]) {
    const writingReference = await readFile(path.join(skillRoot, 'references', `${workflowId}.md`), 'utf8');
    assert.match(writingReference, new RegExp(`AFTER TODO RESULT:[^\\n]*${writer} \\x60task\\x60 is the next project action[^\\n]*no Main \\x60read\\x60 or \\x60glob\\x60`, 'iu'));
    assert.match(writingReference, new RegExp(`Initial TODO freezes three exact Delegate rows[^\\n]*step-2 ${writer}[^\\n]*step-3 ${checker}[^\\n]*conditional step-4 corrected-proposal`, 'iu'));
    assert.match(writingReference, /Branch A:[^\n]*Main alone performs finding disposition[^\n]*accepts at least one checker finding[^\n]*dispatch the original frozen step-4 row[^\n]*native TODO `done`[^\n]*only after[^\n]*complete corrected-proposal terminal delivery/iu);
    assert.match(writingReference, /Branch B:[^\n]*accepts zero checker findings[^\n]*do not dispatch[^\n]*native TODO `done`[^\n]*same frozen row[^\n]*`resolved-no-repair`[^\n]*never rewrite, drop, or abandon/iu);
    assert.match(writingReference, /no-op branch[^\n]*parent TODO condition resolution[^\n]*not child delivery[^\n]*successful fork[^\n]*permission/iu);
    assert.doesNotMatch(writingReference, /Main closes? (?:the|that) conditional checkpoint/iu);
    assert.match(writingReference, new RegExp(`Delegated checkpoints:[\\s\\S]*step-4: ${writer} returns one corrected proposal for parent-accepted findings(?:\\n|$)`, 'iu'));
    assert.doesNotMatch(writingReference, new RegExp(`step-4: ${writer}[^\\n]*(?:Main applies|verifies)`, 'iu'));
    assert.match(writingReference, /Scope notes:[\s\S]*Main owns any authorized file change[\s\S]*parent-owned integration and verification/iu);
  }
  const latexReference = await readFile(path.join(skillRoot, 'references', 'writing.latex.md'), 'utf8');
  assert.match(latexReference, /preservation-only Add-on[\s\S]*LaTeX preservation constraints only[\s\S]*zero format Skills[\s\S]*no generic `task` Delegate row/iu);
  assert.match(latexReference, /generic `task` candidate[\s\S]*only for an explicitly requested format conversion, LaTeX-structure change, or compile-evidence checkpoint/iu);
  assert.match(latexReference, /step-3: task owns only an explicitly requested format-only conversion or LaTeX-structure change/iu);
  assert.match(latexReference, /step-4: task may return only explicitly requested compile evidence/iu);
  assert.doesNotMatch(latexReference, /LaTeX-structure preservation slice/iu);
  assert.doesNotMatch(codeReference, /Add-on candidates|Optional Skill topics/iu);
  assert.match(codeReference, /`code\.dev`/);
  assert.match(codeReference, /Agent candidates/);
  assert.doesNotMatch(codeReference, /Optional Agent candidates|Optional delegation ideas/iu);

  for (const definition of workflowDefinitions) {
    const reference = await readFile(path.join(skillRoot, 'references', `${definition.id}.md`), 'utf8');
    assert.ok(
      reference.includes(`EXECUTION DEFAULT (soft): \`${definition.delegationDefault}\``),
      definition.id,
    );
    assert.match(reference, /Agent candidates:/u, definition.id);
    assert.doesNotMatch(reference, /Optional Agent candidates|Optional delegation ideas/iu, definition.id);
    assert.ok(
      reference.indexOf('READY NEXT (soft): SENTINEL 1/2') < reference.indexOf(`# \`${definition.id}\``)
        && reference.indexOf('EXECUTION DEFAULT (soft):') < reference.lastIndexOf('READY NEXT (soft): SENTINEL 2/2'),
      `${definition.id}: READY sentinels must bracket the reference`,
    );
    assert.equal((reference.match(/READY NEXT \(soft\): SENTINEL [12]\/2/gu) ?? []).length, 2, definition.id);
    const assignmentPrefixes = reference.match(/\[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>\]/gu) ?? [];
    assert.equal(
      assignmentPrefixes.length,
      definition.delegationDefault === 'subagent-driven' ? 1 : 0,
      `${definition.id}: assignment handoff count`,
    );
    if (definition.delegationDefault === 'subagent-driven') {
      assert.match(
        reference,
        /READY NEXT \(soft\): SENTINEL 1\/2[^\n]*assistant response byte 0 = `W` of filled `WORKFLOW READY \|[^\n]+[^\n]*native TODO init only[\s\S]*TASK COPY \(soft, later response\):[\s\S]*copy one committed Delegate row[\s\S]*Assignment body byte 0[\s\S]*wait for native auto-delivery/iu,
      );
      assert.match(
        reference,
        /complete input \+ safe checkpoint \+ visible matching Agent => one exact Delegate row[\s\S]*otherwise `fallback=<one matched permitted limitation>`[\s\S]*Parent VERIFY rows remain separate[\s\S]*Every delegated row is exactly `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`/iu,
      );
      assert.match(
        reference,
        /TASK COPY \(soft, later response\):[\s\S]*native item `agent`[\s\S]*native item `todo`[\s\S]*Assignment body byte 0 = `\[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>\]`[\s\S]*copy direct user constraints verbatim/iu,
      );
      assert.match(
        reference,
        /Keep later-wave metadata stable[\s\S]*put delivery material in the body[\s\S]*Fill required native fields/iu,
      );
      assert.match(
        reference,
        /Only a new dependency[\s\S]*scope[\s\S]*permission[\s\S]*tool[\s\S]*Agent[\s\S]*schema[\s\S]*capacity[\s\S]*Skill-load failure[\s\S]*contradictory project evidence[\s\S]*may rebase/iu,
      );
      assert.match(reference, /parent-owned pre-dispatch prerequisite[\s\S]*committed `task` is the next project action/iu);
      assert.match(reference, /direct fallback is limited to one concrete user or native constraint[\s\S]*Agent availability or capacity[\s\S]*incomplete assignment input[\s\S]*unresolved dependency or write-set overlap[\s\S]*safety risk[\s\S]*native parent-owned action/iu);
      assert.doesNotMatch(reference, /All resources loaded|WRONG:|CORRECT:|after optional hidden thinking|Thinking "/iu);
      assert.doesNotMatch(reference, /block:\s*true|continue:\s*true|hard (?:gate|router)|automatic retry|must (?:fork|delegate)/iu);
    }
  }

  const simpleReference = await readFile(path.join(skillRoot, 'references', 'agentic.simple.md'), 'utf8');
  assert.match(simpleReference, /`direct-simple`.+after staged READY.+Main works directly.+no `task`/iu);

  const pendingReference = await readFile(path.join(skillRoot, 'references', 'writing.pending.md'), 'utf8');
  assert.match(pendingReference, /`defer-until-composed`[\s\S]*after initial READY[\s\S]*narrow language-only read[\s\S]*replacement PLAN for `writing\.zh` or `writing\.en`[\s\S]*replacement READY[\s\S]*follow the selected card[\s\S]*never loop or guess/iu);

  assert.match(skill, /DECLARE HANDOFF \(soft\):[\s\S]*start byte 0 with `WORKFLOW PLAN`[\s\S]*Load order: NOW=\[[^\n]+\] THEN=\[[^\n]+\]/iu);
  assert.doesNotMatch(skill, /All resources loaded|WRONG:|CORRECT:|after optional hidden thinking|Thinking "/iu);

  const zhReference = await readFile(path.join(skillRoot, 'references', 'writing.zh.md'), 'utf8');
  const subagentDefault = executionDefaultLine(zhReference);
  assert.match(subagentDefault, /`subagent-driven`/u);
  assert.match(subagentDefault, /currently visible matching Agent[\s\S]*safe complete checkpoint/iu);
  assert.match(subagentDefault, /runnable independent checkpoints share a batch[\s\S]*dependent ones wait/iu);
  assert.match(subagentDefault, /Main integrates and verifies/iu);
  assert.match(subagentDefault, /direct fallback is limited to one concrete user or native constraint/iu);
  assert.match(
    subagentDefault,
    /Size, latency, read-only output, integrated delivery, overhead, or no explicit delegation request alone are not fallbacks/iu,
  );
  assert.match(subagentDefault, /selects no Agent or fork width/iu);
  assert.doesNotMatch(subagentDefault, /TDD|test-first|RED|GREEN/iu);
  assert.match(
    zhReference,
    /zh-writer.+zh-checker.+corrected(?:-| )proposal.+Main then applies any authorized file change.+verifies/isu,
  );

  assert.match(sharedCatalog, /Mechanical DIRECT.+bypasses the staged workflow/iu);
  assert.match(sharedCatalog, /`agentic\.simple`.+`direct-simple`/iu);
  assert.match(sharedCatalog, /`writing\.pending`.+`defer-until-composed`/iu);
  assert.match(sharedCatalog, /all other selected workflows.+`subagent-driven`/iu);
  assert.equal(
    (sharedCatalog.match(/^- Execution default \(soft\):/gmu) ?? []).length,
    workflowDefinitions.length,
  );
  assert.doesNotMatch(sharedCatalog, /path-only writing request[^.]*read the target first/iu);
  assert.match(sharedCatalog, /path-only writing request.+do not read the target before READY.+after initial READY.+narrow source read.+replacement `WORKFLOW PLAN`.+replace pending with `writing\.zh` or `writing\.en`/isu);
  assert.match(sharedCatalog, /substantive language work.+language-matched writer acts first.+independent read-only checker.+parent reconciles findings.+verifies scope and semantic anchors/isu);
  assert.match(sharedCatalog, /drafts or revises prose.+language workflow is Primary.+format workflow is an Add-on/isu);
  assert.match(sharedCatalog, /format-only conversion, template application, or structure operation.+format or converter workflow Primary.+no prose workflow/isu);
  assert.match(sharedCatalog, /filled PLAN[^\n]*byte 0 is `W`[\s\S]*filled `WORKFLOW READY \|`[^\n]*byte 0 is `W`/iu);
  assert.match(sharedCatalog, /exact nested ECC URI listed on a card[^\n]*directly in PLAN\/NOW[^\n]*`skill:\/\/ecc-skill-catalog`[^\n]*unlisted niche discovery/iu);
  assert.match(sharedCatalog, /### `network\.design`[\s\S]*Exact nested ECC Skill candidates: `skill:\/\/ecc-skill-catalog\/network-config-validation\/SKILL\.md`, `skill:\/\/ecc-skill-catalog\/safety-guard\/SKILL\.md`/iu);
  assert.doesNotMatch(sharedCatalog, /(?:requires?|mandates?) (?:a )?fork|must delegate|fixed fanout of \d|automatically retr(?:y|ies)|controls completion/iu);
  assert.doesNotMatch(`${skill}\n${sharedCatalog}`, /block:\s*true|continue:\s*true|hard router|automatic retry/iu);
});

test('workflow catalog generator rejects missing, duplicate, and unknown CLI modes', async () => {
  const script = fileURLToPath(new URL('./generate-workflow-catalog.js', import.meta.url));
  for (const args of [[], ['--check', '--write'], ['--unknown']]) {
    const result = await runNode(script, args);
    assert.equal(result.code, 1, `expected ${args.join(' ') || 'no args'} to fail`);
  }
});

function runNode(script, args) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, [script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function executionDefaultLine(markdown) {
  return markdown.split('\n').find((line) => line.startsWith('EXECUTION DEFAULT (soft):')) ?? '';
}
