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

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OMP_NATIVE_ROLE_IDS = new Set(['scout', 'task', 'sonic', 'designer', 'librarian', 'reviewer']);

test('shared catalog exposes full definitions while Main references omit late Skill candidates', async () => {
  const catalog = await readFile(new URL('../plugins/omp-config/assets/WORKFLOW_CATALOG.md', import.meta.url), 'utf8');
  const skillIndex = await readFile(new URL('../plugins/omp-config/skills/omp-enhancer-workflows/SKILL.md', import.meta.url), 'utf8');
  const agents = await readFile(new URL('../plugins/omp-config/assets/AGENTS.md', import.meta.url), 'utf8');
  const claude = await readFile(new URL('../plugins/omp-config/assets/CLAUDE.md', import.meta.url), 'utf8');
  const watchdog = await readFile(new URL('../plugins/omp-config/assets/WATCHDOG.yml', import.meta.url), 'utf8');
  const referencesByWorkflow = buildWorkflowSkillReferences();
  const skillReferences = Object.values(referencesByWorkflow).join('\n');

  assert.equal(catalog, buildSharedWorkflowCatalogMarkdown());
  assert.equal(WORKFLOW_CATALOG_VERSION, 18);
  assert.equal(Number(catalog.match(/OMP_WORKFLOW_CATALOG_VERSION:\s*(\d+)/)?.[1]), WORKFLOW_CATALOG_VERSION);
  assert.deepEqual([...catalog.matchAll(/^### `([^`]+)`$/gm)].map((match) => match[1]), workflowIds);
  assert.deepEqual([...skillIndex.matchAll(/^- `([^`]+)` —/gm)].map((match) => match[1]), workflowIds);
  assert.match(skillIndex, /analysis, judgment, staged work, or delegation/i);
  assert.match(skillIndex, /mechanical field lookup without analysis uses no Skill or TODO/is);
  assert.match(skillIndex, /1\. \*\*DISCOVER\*\*/i);
  assert.match(skillIndex, /2\. \*\*PLAN \+ LOAD\*\*[\s\S]*requested operation, source, and output[\s\S]*emit the exact block[\s\S]*load only its resources[\s\S]*project facts wait until READY/i);
  assert.match(skillIndex, /## State handoff[\s\S]*SOFT, MAIN-OWNED TRACE[\s\S]*Only visible assistant text counts[\s\S]*thinking, tool arguments, and files do not/i);
  assert.match(skillIndex, /SELECTION:[\s\S]*Primary is exactly one central workflow ID[\s\S]*independently matching operation or output in Add-ons[\s\S]*never joined with `\+`/iu);
  assert.match(skillIndex, /exclude every `Not for` match[\s\S]*smallest Skill set positively owning the requested method, evidence, verdict, or format[\s\S]*never one for awareness[\s\S]*workflow reference is not a domain Skill/i);
  assert.match(skillIndex, /Format-only conversion loads its converter[\s\S]*not a target-format prose Skill unless content editing is requested/i);
  assert.match(skillIndex, /LOAD ORDER:[\s\S]*exact domain Skill or catalog `skill:\/\/\.\.\.` URI first[\s\S]*workflow `PLAN URI:` once and last[\s\S]*nested Skill URI[\s\S]*before the workflow references[\s\S]*do not repeat PLAN/i);
  assert.match(skillIndex, /NEXT VISIBLE ASSISTANT TEXT[\s\S]*WORKFLOW PLAN[\s\S]*Primary: <one-workflow-id-or-none>[\s\S]*Add-ons:[\s\S]*Skills:[\s\S]*Load order:[\s\S]*Actions:[\s\S]*1\./i);
  assert.match(skillIndex, /separate numbered Action for each distinct requested checkpoint or evidence phase[\s\S]*do not collapse them into one catch-all line/iu);
  assert.match(skillIndex, /OUTPUT BRIDGE:[\s\S]*first visible content item is this full `WORKFLOW PLAN`[\s\S]*thinking, narration without the block, or `\.\.\.` does not count[\s\S]*call every Load order URI and nothing else[\s\S]*no project tool, `todo`, `task`, or final/i);
  assert.match(skillIndex, /first visible content item.+WORKFLOW PLAN.+resource calls follow/iu);
  assert.match(skillIndex, /AFTER ALL DECLARED RESOURCES AND ANY CATALOG EXTENSION HAVE RETURNED[\s\S]*WORKFLOW READY \| primary=<id-or-none>[\s\S]*rebase the detailed TODO once before the first project action/i);
  assert.match(skillIndex, /native `todo` is exposed.+only call.+TODO init.+end and wait.+next response/iu);
  assert.match(skillIndex, /WORKFLOW MATCH:[\s\S]*test every whole Primary condition[\s\S]*not words like plan[\s\S]*Choose one for the central requested operation or deliverable[\s\S]*every other independently matching requested operation or output in Add-ons[\s\S]*Do not add a workflow merely for an internal phase already covered by the Primary[\s\S]*Format-conversion plans match source\/output rows[\s\S]*not `code\.dev`/iu);
  assert.match(skillIndex, /LaTeX prose correction keeps `writing\.latex` \+ its language workflow[\s\S]*no converter\/template unless requested/iu);
  assert.match(skillIndex, /3\. \*\*READY \+ EXECUTE\*\*[\s\S]*after resources[\s\S]*commit the loaded method to detailed native TODO when exposed[\s\S]*wait[\s\S]*execute it/i);
  assert.doesNotMatch(skillIndex, /slices=<|assignment-input=|Composition example:|\[workflow=<ids>/i);
  assert.match(skillIndex, /SELECTION TABLE ONLY:[\s\S]*choose here, emit PLAN, then read its literal PLAN URIs[\s\S]*`Load order` text, not an early call/iu);
  assert.doesNotMatch(skillIndex, /^- `[^`]+`[^\n]+\b(?:Add-ons|Skills):/gmu);
  assert.ok(Buffer.byteLength(skillIndex) < 13_000, 'Main workflow index should stay compact');
  assert.match(skillIndex, /does not route tasks[\s\S]*create gates/i);

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
      assert.ok(catalogSection.includes(`\`${skill}\``), `${definition.id} catalog is missing skill ${skill}`);
    }
    assert.doesNotMatch(section, /Optional Skill topics|Skill candidates/iu, `${definition.id} reference should not reopen Skill selection after PLAN`);
    for (const role of definition.roles) {
      assert.ok(section.includes(`\`${role}\``), `${definition.id} is missing optional role ${role}`);
    }
    for (const line of definition.delegation) assert.ok(section.includes(withoutTerminalPunctuation(line)));
    for (const line of definition.qualityChecks) assert.ok(section.includes(withoutTerminalPunctuation(line)));
    for (const line of definition.scopeNotes) assert.ok(section.includes(withoutTerminalPunctuation(line)));
    for (const line of definition.riskNotes) assert.ok(section.includes(withoutTerminalPunctuation(line)));
  }

  assert.equal(countSharedCatalogImports(agents), 0, 'Main should use the compact prompt and on-demand workflow Skill');
  assert.equal(countSharedCatalogImports(watchdog), 0, 'Advisor should coach Main through the on-demand workflow Skill without a full catalog import');
  assert.match(agents, /OMP's native system prompt, settings, active tools, dynamic Available Agents list, approval flow, and completion behavior are authoritative/);
  assert.match(agents, /analysis, judgment, workflow composition, coordinated stages, or possible delegation[\s\S]*DISCOVER BATCH:[\s\S]*reads only `skill:\/\/omp-enhancer-workflows`[\s\S]*wait for the index result/is);
  assert.match(agents, /mechanical field lookup without analysis.*no Skill or TODO/is);
  assert.match(agents, /DISCOVER BATCH:[\s\S]*reads only `skill:\/\/omp-enhancer-workflows`[\s\S]*wait for the index result/i);
  assert.match(agents, /WORKFLOW PLAN \+ LOAD BATCH:[\s\S]*start the next response with this visible block before any tool call[\s\S]*WORKFLOW PLAN\nPrimary: <id-or-none>\nAdd-ons: <ids-or-none>\nSkills: <exact-skill-uris-or-none>\nLoad order: <ordered-skill-then-reference-uris-or-none>\nActions:\n1\./i);
  assert.match(agents, /separate numbered Action for each distinct requested checkpoint or evidence phase[\s\S]*do not collapse them into one catch-all line/iu);
  assert.match(agents, /thinking, tool arguments, and files do not count[\s\S]*first visible content item is the complete filled `WORKFLOW PLAN`[\s\S]*thinking, narration without the block, or `\.\.\.` does not count/i);
  assert.match(agents, /Call declared domain Skills or catalogs first and workflow references last[\s\S]*wait for every resource result/i);
  assert.match(agents, /READY \+ EXECUTE:[\s\S]*WORKFLOW READY[\s\S]*Rebase the detailed TODO from the actual workflow steps and Skill instructions/i);
  assert.match(agents, /preserve every selected card's named checkpoint and evidence boundary[\s\S]*plan review, RED, GREEN, E2E, or independent review/i);
  assert.match(agents, /review decisions as explicit TODO rows[\s\S]*distinct unanswered question[\s\S]*currently exposed matching Agent/i);
  assert.match(agents, /first visible content item.+WORKFLOW PLAN.+resource calls follow/iu);
  assert.match(agents, /native `todo` is exposed[\s\S]*READY response contains only its init call[\s\S]*ends and waits[\s\S]*project reads, edits, commands, or delegation start in the next response/iu);
  assert.match(agents, /mapping it to native `todo` when exposed and allowed[\s\S]*project reads, edits, commands, or delegation start in the next response/i);
  assert.match(agents, /an Add-on enriches and never replaces the Primary/i);
  assert.match(agents, /keep workflow, Agent, and Skill namespaces separate/i);
  assert.match(agents, /resource read batched with a project action did not wait/i);
  assert.match(agents, /never reasons for a plugin to block, retry, continue, or restart work/i);
  assert.match(agents, /Main decides direct work, Agent choice, and fork width[\s\S]*No workflow card or reminder selects/i);
  assert.match(agents, /substantive code.+subagent-driven.+plugin `plan`.+native `task`.+native `reviewer`/isu);
  assert.match(agents, /Main.+local and external discovery.+detailed.+parallel waves.+vertical slices.+non-overlapping write sets/isu);
  assert.match(agents, /same `tasks\[\]` batch.+runnable independent slices.+dependent.+later wave/isu);
  assert.match(agents, /Main.+integrat.+current tree.+diff.+evidence.+review.+before.+reviewer/isu);
  assert.match(agents, /reviewer.+Main-reviewed.+bounded.+diff.+evidence.+does not read.+project.+run commands/isu);
  assert.match(agents, /supported.+finding.+native `task`.+repair.+at most one.+fresh reviewer/isu);
  assert.match(agents, /\[workflow=<ids> step=<step-id> todo=<verbatim-task-content-or-none> skills=<skill-ids-or-none>\]/i);
  assert.match(agents, /assignment text begins exactly with[\s\S]*\[workflow=<ids>/iu);
  assert.match(claude, /assignment text begins exactly with[\s\S]*\[workflow=<ids>/iu);
  assert.doesNotMatch(`${agents}\n${claude}`, /optional prefix/iu);
  assert.match(agents, /child follows its assignment and does not own the parent TODO/i);
  assert.match(agents, /failed or partial job is not complete/i);
  assert.match(watchdog, /OMP's native Advisor instructions and runtime settings are authoritative/);
  assert.match(watchdog, /SEND DECISION FIRST:[\s\S]*at most one ordinary `advise` call/i);
  assert.match(watchdog, /valid only during Main's DISCOVER, WORKFLOW PLAN \+ LOAD, and READY preparation/i);
  assert.match(watchdog, /Workflow and Skill resource reads do not close this window/i);
  assert.match(watchdog, /DECISION CALIBRATION:[\s\S]*earliest material drift in the three-phase sequence/i);
  assert.match(watchdog, /`WORKFLOW PLAN` block precedes a resource-only load batch[\s\S]*`WORKFLOW READY \|` and the rebased TODO/i);
  assert.match(watchdog, /loaded card names a plan-review, RED, GREEN, E2E, or independent-review checkpoint[\s\S]*TODO silently collapses it/i);
  assert.match(watchdog, /DECISION CHECK \(optional\) \| drift=<one-material-drift> \| evidence=<one-visible-fact> \| next=<one-smallest-safe-action>/i);
  assert.match(watchdog, /never guess an unseen workflow, Skill, or Agent ID/i);
  assert.match(watchdog, /REFERENCE RESOLUTION:[\s\S]*map each selected workflow only to its literal `PLAN URI:` visibly shown in the loaded index[\s\S]*copy data for Main's `Load order`/i);
  assert.match(watchdog, /Each selected workflow has one card URI[\s\S]*one successful read covers only the workflow visibly mapped to it/i);
  assert.match(watchdog, /If a mapping is not visible, stay silent[\s\S]*never invent a same-named `skill:\/\/\.\.\.` URI or request a duplicate reference read/i);
  assert.match(watchdog, /soft advisory evidence for the single optional note only[\s\S]*never routing, permission, blocking, retry, continuation, or completion-gate authority/i);
  assert.match(watchdog, /Main alone decides direct work, Agent choice, and fork width/i);
  assert.match(watchdog, /failed or partial result is diagnostic evidence, not completion/i);
  assert.match(watchdog, /Advisor's tool schema describes Advisor capability only, never Main's tools, Skills, Agents, or permissions/i);
  assert.match(watchdog, /Omitted or intentionally private context is unknown[\s\S]*Never request duplicate reads/i);
  assert.match(watchdog, /Workflow, Skill-plan, TODO, metadata, or schema evidence alone is never a blocker/);
  assert.match(watchdog, /Advisor's tool schema describes Advisor capability only, never Main's tools, Skills, Agents, or permissions/);
  assert.match(watchdog, /at most one ordinary `advise` call per primary user task/);
  assert.match(watchdog, /ordinary send budget becomes zero even when unused/i);
  assert.match(watchdog, /A complete user-visible Main final sets the ordinary send limit to zero/);
  assert.match(watchdog, /earlier Advisor note is visible[\s\S]*materially new evidence independently meets OMP's native `blocker` standard/i);
  assert.match(catalog, /optional reference material/i);
  assert.match(catalog, /staged sequence below is model guidance, not a runtime-enforced precondition or completion gate/i);
  assert.match(catalog, /analysis, judgment, workflow composition, coordinated stages, or possible delegation/i);
  assert.match(catalog, /mechanical field lookup without analysis.*no Skill/is);
  assert.match(catalog, /Main explicitly writes the exact `WORKFLOW PLAN` block[\s\S]*exact Skill URIs[\s\S]*resource load order[\s\S]*numbered actions/i);
  assert.match(catalog, /Load every declared visible domain Skill or catalog[\s\S]*first[\s\S]*load the selected workflow references last[\s\S]*wait before project work/i);
  assert.match(catalog, /Once resources are loaded or marked unavailable[\s\S]*`WORKFLOW READY \|`[\s\S]*rebases a detailed TODO/i);
  assert.match(catalog, /updates native `todo` when exposed and allowed[\s\S]*same detailed checklist remains the execution state/i);
  assert.match(catalog, /Add-on enriches and never replaces the Primary/i);
  assert.match(catalog, /selected combination remains Agent-owned/i);
  assert.match(catalog, /small target is not by itself a reason for `agentic\.simple`/i);
  assert.match(catalog, /begin each per-job assignment text itself/i);
  assert.match(catalog, /todo=<verbatim-task-content-or-none>/i);
  assert.match(catalog, /Main independently decides native delegation is useful/i);
  assert.match(catalog, /substantive code.+subagent-driven.+plugin `plan`.+native `task`.+native `reviewer`/isu);
  assert.match(catalog, /same native `task` `tasks\[\]` batch.+runnable independent.+vertical slices.+dependent.+later wave/isu);
  assert.match(catalog, /Main.+integrat.+current tree.+diff.+evidence.+review.+before.+reviewer/isu);
  assert.match(catalog, /body of the text being modified/i);
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
  assert.deepEqual(workflowCatalog['database.review'].roles, []);
  assert.deepEqual(workflowCatalog['ml.review'].roles, []);
  assert.deepEqual(workflowCatalog['security.review'].roles, ['ecc-security-reviewer']);
  assert.deepEqual(workflowCatalog['release.publish'].roles, []);

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
  assert.match(readme, /Main receives the available Skills and Agents through OMP and chooses how to work/i);
  assert.match(readme, /analysis, judgment, workflow composition, coordinated stages, or possible delegation.*reads the compact workflow index first/is);
  assert.match(readme, /mechanical field lookups? without analysis.*no Skill or TODO/is);
  assert.match(readme, /emits the exact `WORKFLOW PLAN` block before a resource-only load sequence/i);
  assert.match(readme, /domain Skills or catalogs first and workflow references last/i);
  assert.match(readme, /emits `WORKFLOW READY \| \.\.\.`[\s\S]*rebases the detailed TODO/i);
  assert.match(readme, /Native TODO is used when exposed and allowed[\s\S]*same checklist remains the execution state/i);
  assert.match(readme, /full catalog is not automatically injected into Main or Advisor context/i);
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
