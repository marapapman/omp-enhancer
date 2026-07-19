import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import registerOmpConfig, { syncWorkflowContext } from '../index.js';
import {
  ADVISOR_BLOCK_END,
  ADVISOR_BLOCK_START,
  AGENTS_BLOCK_END,
  AGENTS_BLOCK_START,
  CATALOG_BLOCK_END,
  CATALOG_BLOCK_START,
  mergeWatchdogManagedBlock,
} from '../src/workflow-context-sync.js';
import { loadWorkflowContextAssets } from '../src/workflow-context-assets.js';
import * as managedBlocks from '../src/workflow-managed-blocks.js';
import {
  applyWorkflowContextChanges,
  readWorkflowContextTargetFiles,
  resolveWorkflowContextTarget,
} from '../src/workflow-target-files.js';

function packageRoot() {
  return path.dirname(path.dirname(fileURLToPath(import.meta.url)));
}

const LEGACY_ADVISOR_GUIDANCE_BLOCK = [
  "  Review the main agent as an advisory peer. Stay silent when the work is already correct or complete.",
  '',
  "  Skill and workflow selection belong to the main agent. Absence of a visible skill-read call is not evidence that a skill is missing when the transcript shows the skill body or another host-provided load. Raise a skill issue only when the main agent skipped active-inventory discovery for a non-trivial workflow, reports a concrete load failure, or applies instructions that conflict with the visible task. Do not ask for `omp_core_route_task`; its route is a compatibility diagnostic, not an execution decision.",
  '',
  "  Request another source read only when the transcript contains concrete truncation evidence, such as an explicit truncation marker or an incomplete requested range. A successful short-file read that reaches the file end is not clipped merely because it has few lines.",
  '',
  "  Deliver advice before the main agent's user-visible final. Once the main agent has emitted a complete final response, do not call `advise`, even if a late improvement is available. Stay silent rather than requesting a shorter restatement, another verification call, or a replacement final. Formatting taste, concision preference, and already-reported facts are not material post-final corrections.",
  '',
  "  ADVICE BUDGET: give at most one `advise` call for a primary task by default. Count prior advisor notes in this advisor session. After one note, stay silent unless later evidence reveals a new, materially different authorization, security, or irreversible-data-loss risk. A complete main-agent final sets this budget to zero unconditionally. Do not split one concern into follow-up notes, restate it after verification, or advise merely to refine how the final describes an already-correct outcome.",
  '',
  "  For an authorized edit, judge the concrete candidate rather than freezing the whole task. If one candidate would move a qualifier, change scope, or otherwise violate a semantic anchor, advise rejecting that candidate only. Preservation constraints do not make every other word immutable. When a safe lexical or structural improvement outside the protected anchors is visible, point to that alternative; do not conclude that no safe edit exists merely because one candidate is unsafe.",
  '',
  "  Use `concern`, not `blocker`, for a reversible wording candidate. Reserve `blocker` for an imminent authorization violation, security risk, or irreversible data loss.",
  '',
  "  Advisor notes are suggestions, not execution or completion gates. Never ask for repeated unchanged calls, a second skill load, or work outside the user's stated tool, write, test, network, and time scope.",
].join('\n');

const LEGACY_PRE_MARKER_ADVISOR_GUIDANCE_BLOCK = [
  "  Review the main agent as an advisory peer. Stay silent when the work is already correct or complete.",
  '',
  "  OMP workflow context may provide a skill without a read tool call. A hidden `skill-prompt`, a skill body followed by `Skill: <path>`, or system text saying `Routed workflow skills already loaded` means the host has already loaded that skill. Skill routing and loading are the main agent and Core's responsibility: absence of a visible skill-read call is not evidence that a skill is missing. Do not advise a skill read or `omp_core_route_task` merely because the rendered advisor transcript omits hidden host context. Raise a skill issue only when the main agent reports a concrete load failure or applies instructions that conflict with the visible task.",
  '',
  "  Request another source read only when the transcript contains concrete truncation evidence, such as an explicit truncation marker or an incomplete requested range. A successful short-file read that reaches the file end is not clipped merely because it has few lines.",
  '',
  "  Deliver advice before the main agent's user-visible final. Once the main agent has emitted a complete final response, do not call `advise`, even if a late improvement is available. Stay silent rather than requesting a shorter restatement, another verification call, or a replacement final. Formatting taste, concision preference, and already-reported facts are not material post-final corrections.",
  '',
  "  ADVICE BUDGET: give at most one `advise` call for a primary task by default. Count prior advisor notes in this advisor session. After one note, stay silent unless later evidence reveals a new, materially different authorization, security, or irreversible-data-loss risk. A complete main-agent final sets this budget to zero unconditionally. Do not split one concern into follow-up notes, restate it after verification, or advise merely to refine how the final describes an already-correct outcome.",
  '',
  "  For an authorized edit, judge the concrete candidate rather than freezing the whole task. If one candidate would move a qualifier, change scope, or otherwise violate a semantic anchor, advise rejecting that candidate only. Preservation constraints do not make every other word immutable. When a safe lexical or structural improvement outside the protected anchors is visible, point to that alternative; do not conclude that no safe edit exists merely because one candidate is unsafe.",
  '',
  "  Use `concern`, not `blocker`, for a reversible wording candidate. Reserve `blocker` for an imminent authorization violation, security risk, or irreversible data loss.",
  '',
  "  Advisor notes are suggestions, not execution or completion gates. Never ask for repeated unchanged calls, a second skill load, or work outside the user's stated tool, write, test, network, and time scope.",
].join('\n');

function legacyWatchdog(guidance = LEGACY_ADVISOR_GUIDANCE_BLOCK) {
  return [
    'instructions: |',
    `  ${ADVISOR_BLOCK_START}`,
    '  legacy managed instructions',
    `  ${ADVISOR_BLOCK_END}`,
    '',
    guidance,
    '',
    'advisors:',
    '  - name: User reviewer',
    '    tools: []',
    '',
  ].join('\n');
}

function preMarkerLegacyWatchdog(guidance = LEGACY_PRE_MARKER_ADVISOR_GUIDANCE_BLOCK) {
  return [
    'instructions: |',
    guidance,
    '',
    `  ${ADVISOR_BLOCK_START}`,
    '  legacy managed instructions',
    `  ${ADVISOR_BLOCK_END}`,
    '',
    'advisors:',
    '  - name: User reviewer',
    '    tools: []',
    '',
  ].join('\n');
}

function registrationHarness() {
  const tools = [];
  const pi = {
    zod: {
      z: {
        string: () => ({ optional: () => ({ type: 'optional-string' }) }),
        boolean: () => ({ optional: () => ({ type: 'optional-boolean' }) }),
        optional: (schema) => ({ type: 'optional', schema }),
        object: (shape) => ({ type: 'object', shape }),
      },
    },
    registerTool(tool) {
      tools.push(tool);
    },
  };
  registerOmpConfig(pi);
  return tools;
}

test('workflow context facade preserves the managed-block API after modularization', async () => {
  const facade = await import('../src/workflow-context-sync.js');

  for (const name of [
    'ADVISOR_BLOCK_END',
    'ADVISOR_BLOCK_START',
    'AGENTS_BLOCK_END',
    'AGENTS_BLOCK_START',
    'CATALOG_BLOCK_END',
    'CATALOG_BLOCK_START',
    'mergeManagedCatalog',
    'mergeMarkdownManagedBlock',
    'mergeWatchdogManagedBlock',
  ]) {
    assert.equal(facade[name], managedBlocks[name], name);
  }
});

test('workflow context asset loader reads packaged files and extracts pure managed blocks', async () => {
  const assets = await loadWorkflowContextAssets(packageRoot());

  assert.match(assets.catalog, new RegExp(CATALOG_BLOCK_START));
  assert.match(assets.agentsManagedBlock, new RegExp(`^${AGENTS_BLOCK_START}`));
  assert.match(assets.agentsManagedBlock, new RegExp(`${AGENTS_BLOCK_END}$`));
  assert.match(assets.advisorManagedBlock, new RegExp(`^${ADVISOR_BLOCK_START}`));
  assert.match(assets.advisorManagedBlock, new RegExp(`${ADVISOR_BLOCK_END}$`));
  assert.match(assets.watchdogAsset, /^instructions: \|$/m);
});

test('workflow context asset loader preserves malformed managed-block errors', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'omp-config-context-assets-'));
  const assetsDir = path.join(root, 'assets');
  await mkdir(assetsDir);
  await Promise.all([
    writeFile(path.join(assetsDir, 'WORKFLOW_CATALOG.md'), 'catalog\n'),
    writeFile(path.join(assetsDir, 'AGENTS.md'), 'missing managed markers\n'),
    writeFile(
      path.join(assetsDir, 'WATCHDOG.yml'),
      `instructions: |\n  ${ADVISOR_BLOCK_START}\n  managed\n  ${ADVISOR_BLOCK_END}\n`,
    ),
  ]);

  await assert.rejects(
    loadWorkflowContextAssets(root),
    new RegExp(`Packaged asset has an invalid managed block: ${AGENTS_BLOCK_START}`),
  );
});

test('workflow target file module preserves WATCHDOG.yaml fallback and changed-only writes', async () => {
  const target = await mkdtemp(path.join(tmpdir(), 'omp-config-target-files-'));
  const yamlPath = path.join(target, 'WATCHDOG.yaml');
  const unchangedPath = path.join(target, 'AGENTS.md');
  const createdPath = path.join(target, 'created.md');
  await writeFile(yamlPath, 'instructions: |\n  Existing\n');
  await writeFile(unchangedPath, 'keep\n');

  const targetDir = await resolveWorkflowContextTarget(target);
  const files = await readWorkflowContextTargetFiles(targetDir);

  assert.equal(files.watchdogPath, yamlPath);
  assert.equal(files.existingWatchdog, 'instructions: |\n  Existing\n');
  assert.equal(files.existingAgents, 'keep\n');
  assert.equal(files.existingCatalog, null);

  await applyWorkflowContextChanges(targetDir, [
    { path: unchangedPath, changed: false, content: 'replace\n' },
    { path: createdPath, changed: true, content: 'created\n' },
  ]);
  assert.equal(await readFile(unchangedPath, 'utf8'), 'keep\n');
  assert.equal(await readFile(createdPath, 'utf8'), 'created\n');
});

test('shared assets keep the catalog managed while exposing only neutral optional references', async () => {
  const assets = path.join(packageRoot(), 'assets');
  const [catalog, agents, watchdog] = await Promise.all([
    readFile(path.join(assets, 'WORKFLOW_CATALOG.md'), 'utf8'),
    readFile(path.join(assets, 'AGENTS.md'), 'utf8'),
    readFile(path.join(assets, 'WATCHDOG.yml'), 'utf8'),
  ]);
  const workflowIds = [
    'agentic.simple',
    'writing.pending',
    'writing.zh',
    'writing.en',
    'writing.latex',
    'slides.generate',
    'slides.modify',
    'diagram.svg',
    'writing.markdown',
    'doc.convert.word',
    'research.web',
    'factcheck.document',
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
    'marketing.campaign',
    'seo.audit',
    'omp.plugin',
    'security.review',
    'design.visual',
    'release.opensource',
    'release.publish',
  ];

  assert.equal((catalog.match(/^### `/gm) ?? []).length, workflowIds.length);
  for (const workflowId of workflowIds) {
    assert.ok(catalog.includes(`### \`${workflowId}\``), `${workflowId} should have a workflow card`);
  }
  for (const heading of [
    'Primary when:',
    'Add-on candidates',
    'Steps:',
    'Skill candidates:',
    'Optional agent candidates:',
    'Quality checks:',
    'Optional delegation ideas:',
  ]) {
    assert.equal((catalog.match(new RegExp(`^- ${heading}`, 'gm')) ?? []).length, workflowIds.length);
  }
  assert.match(catalog, /This is optional reference material/);
  assert.match(catalog, /OMP's native system prompt, settings, active tools, dynamic Agent list, approval flow, and completion behavior remain authoritative/);
  assert.match(catalog, /never selects a workflow or grants permission[\s\S]*staged sequence below is model guidance, not a runtime-enforced precondition or completion gate/i);
  assert.match(catalog, /Main explicitly writes the exact `WORKFLOW PLAN` block[\s\S]*exact Skill URIs[\s\S]*resource load order[\s\S]*numbered actions/i);
  assert.match(catalog, /Load every declared visible domain Skill or catalog[\s\S]*first[\s\S]*load the selected workflow references last[\s\S]*wait before project work/i);
  assert.match(catalog, /Once resources are loaded or marked unavailable[\s\S]*`WORKFLOW READY \|`[\s\S]*rebases a detailed TODO once from the actual workflow steps and Skill instructions/i);
  assert.match(catalog, /updates native `todo` when exposed and allowed[\s\S]*If native TODO is unavailable, the same detailed checklist remains the execution state/i);
  assert.match(catalog, /substantive code.+subagent-driven.+plugin `plan`.+native `task`.+native `reviewer`/isu);
  assert.match(catalog, /same native `task` `tasks\[\]` batch.+runnable independent.+vertical slices.+dependent.+later wave/isu);
  assert.match(catalog, /body of the text being modified, never from the prompt language/);
  assert.match(catalog, /OMP_WORKFLOW_CATALOG_VERSION: 18/);
  assert.doesNotMatch(catalog, /healthcare\.review|ecc-healthcare-reviewer/i);
  assert.match(catalog, /`zh-writer` owns the requested Chinese drafting or prose revision.+`zh-checker` independently reviews/i);
  assert.match(catalog, /`writer` owns the requested English drafting or prose revision.+`checker` independently reviews/i);
  assert.match(catalog, /before the body language is observed, do not delegate to writer, checker, zh-writer, or zh-checker/i);
  assert.match(catalog, /### `code\.dev`[\s\S]*`code-development`/i);
  assert.match(catalog, /Optional agent candidates:[^\n]*`plan`[^\n]*`task`[^\n]*`reviewer`/i);
  assert.match(catalog, /`plan` independently challenges Main's supplied complete parallel plan/i);
  assert.match(catalog, /`task`.+same.+tasks\[\].+batch.+vertical.+RED.+GREEN.+REFACTOR/i);
  assert.match(catalog, /Main.+integrat.+current tree.+diff.+evidence.+review.+before.+reviewer/isu);
  assert.match(catalog, /`reviewer` independently reviews the Main-reviewed.+semantic diff.+does not read.+project.+run commands/i);
  assert.match(catalog, /supported.+finding.+`task`.+repair.+at most one.+fresh reviewer/i);
  assert.doesNotMatch(catalog, /### `(?:research\.technical|code\.(?:plan|debug|test|review|build)|performance\.optimize)`/i);
  assert.doesNotMatch(catalog, /`(?:test-planner|test-executor|test-reviewer|omp-target-auditor|implementation-task|config-librarian)`/i);
  assert.doesNotMatch(catalog, /evidence `plan`|verification `plan`/i);
  assert.match(catalog, /### `research\.web`[\s\S]*live web search[\s\S]*`factcheck\.document`/i);
  assert.match(catalog, /Absolute correctness cannot be guaranteed/i);
  assert.match(catalog, /`fact-researcher-a` and `fact-researcher-b` search independent source lanes/i);
  assert.match(catalog, /staleness as a temporal-validity finding rather than a verdict/i);
  assert.match(catalog, /fixed source count and a blanket recency window are not completion targets/i);
  assert.match(catalog, /`fact-cross-checker` classifies agreement, conflicts, temporal-staleness findings, and insufficient evidence without inventing resolution/i);
  assert.match(catalog, /`designer` owns the final layout pass.+`visioner` independently reviews the latest rendered pages/i);
  assert.match(catalog, /Do not widen scope to unrelated pre-existing layout defects/i);
  assert.match(catalog, /`designer` creates the SVG and owns every source revision.+`visioner` independently reviews the fresh full-size and 60% raster renders/i);
  assert.match(catalog, new RegExp(CATALOG_BLOCK_START));
  assert.match(catalog, new RegExp(CATALOG_BLOCK_END));
  assert.doesNotMatch(agents, /@\.\/OMP_ENHANCER_WORKFLOW_CATALOG\.md/);
  assert.match(agents, /OMP's native system prompt, settings, active tools, dynamic Available Agents list, approval flow, and completion behavior are authoritative/);
  assert.match(agents, /analysis, judgment, workflow composition, coordinated stages, or possible delegation/i);
  assert.match(agents, /mechanical field lookup without analysis.*no Skill or TODO/is);
  assert.match(agents, /DISCOVER BATCH:[\s\S]*first assistant tool-call batch reads only `skill:\/\/omp-enhancer-workflows`/i);
  assert.match(agents, /Do not include another Skill, workflow reference, project tool, `todo`, or `task`[\s\S]*wait for the index result/i);
  assert.match(agents, /WORKFLOW PLAN \+ LOAD BATCH:[\s\S]*start the next response with this visible block before any tool call[\s\S]*WORKFLOW PLAN\nPrimary: <id-or-none>\nAdd-ons: <ids-or-none>\nSkills: <exact-skill-uris-or-none>\nLoad order: <ordered-skill-then-reference-uris-or-none>\nActions:\n1\./i);
  assert.match(agents, /thinking, tool arguments, and files do not count[\s\S]*first visible content item is the complete filled `WORKFLOW PLAN`[\s\S]*thinking, narration without the block, or `\.\.\.` does not count/i);
  assert.match(agents, /separate numbered Action for each distinct requested checkpoint or evidence phase[\s\S]*do not collapse them into one catch-all line/iu);
  assert.match(agents, /Call declared domain Skills or catalogs first and workflow references last[\s\S]*no project tool, `todo`, or `task`[\s\S]*wait for every resource result/i);
  assert.match(agents, /READY \+ EXECUTE:[\s\S]*WORKFLOW READY \| primary=<id-or-none> \| add-ons=<ids-or-none> \| skills-loaded=<ids-or-none> \| skills-unavailable=<ids-or-none>/i);
  assert.match(agents, /Rebase the detailed TODO from the actual workflow steps and Skill instructions[\s\S]*native `todo` when exposed and allowed/i);
  assert.match(agents, /resource read batched with a project action did not wait/i);
  assert.match(agents, /WORKFLOW PLAN` block or `WORKFLOW READY \|` first written after project action is late/i);
  assert.match(agents, /Main decides direct work, Agent choice, and fork width/i);
  assert.match(agents, /No workflow card or reminder selects a fork, reviewer count, or Agent/i);
  assert.match(agents, /substantive code.+subagent-driven.+plugin `plan`.+native `task`.+native `reviewer`/isu);
  assert.match(agents, /Main.+detailed.+parallel waves.+vertical slices.+non-overlapping write sets/isu);
  assert.match(agents, /same `tasks\[\]` batch.+runnable independent slices.+dependent.+later wave/isu);
  assert.match(agents, /Main.+integrat.+current tree.+diff.+evidence.+review.+before.+reviewer/isu);
  assert.match(agents, /reviewer.+Main-reviewed.+bounded.+diff.+evidence.+does not read.+project.+run commands/isu);
  assert.match(agents, /supported.+finding.+native `task`.+repair.+at most one.+fresh reviewer/isu);
  assert.match(agents, /child follows its assignment and does not own the parent TODO/i);
  assert.match(agents, /failed or partial job is not complete/i);
  assert.match(agents, /\[workflow=<ids> step=<step-id> todo=<verbatim-task-content-or-none> skills=<skill-ids-or-none>\]/i);
  assert.doesNotMatch(watchdog, /@\.\/OMP_ENHANCER_WORKFLOW_CATALOG\.md/);
  assert.match(watchdog, /OMP's native Advisor instructions and runtime settings are authoritative/);
  assert.match(watchdog, /DECISION CALIBRATION:/);
  assert.match(watchdog, /DECISION CHECK \(optional\) \| drift=<one-material-drift> \| evidence=<one-visible-fact> \| next=<one-smallest-safe-action>/i);
  assert.match(watchdog, /DISCOVER, WORKFLOW PLAN \+ LOAD, and READY preparation/i);
  assert.match(watchdog, /index has its own assistant tool-call batch and result wait[\s\S]*WORKFLOW PLAN[\s\S]*resource-only load batch[\s\S]*WORKFLOW READY[\s\S]*rebased TODO/i);
  assert.match(watchdog, /resource read batched with project action did not wait/i);
  assert.match(watchdog, /plan or ready marker first written after project action is late/i);
  assert.match(watchdog, /workflow and Skill resource reads do not close this window/i);
  assert.match(watchdog, /Omitted or intentionally private context is unknown/i);
  assert.match(watchdog, /never guess an unseen workflow, Skill, or Agent ID/i);
  assert.match(watchdog, /demand a duplicate read, select a fork or reviewer count/i);
  assert.match(watchdog, /REFERENCE RESOLUTION:[\s\S]*map each selected workflow only to its literal `PLAN URI:` visibly shown in the loaded index[\s\S]*copy data for Main's `Load order`/i);
  assert.match(watchdog, /Each selected workflow has one card URI[\s\S]*one successful read covers only the workflow visibly mapped to it/i);
  assert.match(watchdog, /If a mapping is not visible, stay silent[\s\S]*never invent a same-named `skill:\/\/\.\.\.` URI or request a duplicate reference read/i);
  assert.match(watchdog, /soft advisory evidence for the single optional note only[\s\S]*never routing, permission, blocking, retry, continuation, or completion-gate authority/i);
  assert.match(watchdog, /Main alone decides direct work, Agent choice, and fork width/i);
  assert.match(watchdog, /Advisor's tool schema describes Advisor capability only, never Main's tools, Skills, Agents, or permissions/);
  assert.match(watchdog, /at most one ordinary `advise` call per primary user task/);
  assert.match(watchdog, /A complete user-visible Main final sets the ordinary send limit to zero/);
  assert.match(watchdog, /child follows its assignment and does not own the parent TODO/i);
  assert.match(watchdog, /failed or partial result is diagnostic evidence, not completion/i);
  assert.match(watchdog, /A decision note requires one concrete visible fact/i);
  assert.match(watchdog, /Workflow, Skill-plan, TODO, metadata, or schema evidence alone is never a blocker/i);
  assert.match(watchdog, /never grants authority or creates a gate, retry, continuation, or completion condition/i);
  assert.doesNotMatch(`${catalog}\n${agents}\n${watchdog}`, /block:\s*true|continue:\s*true|triggerTurn|hard router/i);
});

test('workflow context sync defaults to dry-run and writes nothing', async () => {
  const target = path.join(await mkdtemp(path.join(tmpdir(), 'omp-config-sync-preview-')), 'agent');

  const result = await syncWorkflowContext({ root: packageRoot(), target });

  assert.equal(result.mode, 'dry-run');
  assert.equal(result.changed, 3);
  assert.deepEqual(result.files.map(({ action }) => action), ['create', 'create', 'create']);
  await assert.rejects(access(path.join(target, 'AGENTS.md')), { code: 'ENOENT' });
});

test('workflow context sync applies managed files while preserving unrelated main and Advisor content', async () => {
  const target = await mkdtemp(path.join(tmpdir(), 'omp-config-sync-apply-'));
  await writeFile(path.join(target, 'AGENTS.md'), '# Personal instructions\n\nKeep this exact sentence.\n');
  await writeFile(
    path.join(target, 'WATCHDOG.yml'),
    'instructions: |\n  Existing advisor instruction.\n\nadvisors:\n  - name: Existing reviewer\n    tools: []\n',
  );

  const applied = await syncWorkflowContext({ root: packageRoot(), target, apply: true });
  const [catalog, agents, watchdog] = await Promise.all([
    readFile(path.join(target, 'OMP_ENHANCER_WORKFLOW_CATALOG.md'), 'utf8'),
    readFile(path.join(target, 'AGENTS.md'), 'utf8'),
    readFile(path.join(target, 'WATCHDOG.yml'), 'utf8'),
  ]);

  assert.equal(applied.mode, 'apply');
  assert.equal(applied.changed, 3);
  assert.match(catalog, /# OMP Enhancer Workflow Catalog/);
  assert.match(agents, /# Personal instructions/);
  assert.match(agents, /Keep this exact sentence\./);
  assert.equal(agents.split(AGENTS_BLOCK_START).length - 1, 1);
  assert.equal(agents.split(AGENTS_BLOCK_END).length - 1, 1);
  assert.match(watchdog, /Existing advisor instruction\./);
  assert.match(watchdog, /name: Existing reviewer/);
  assert.equal(watchdog.split(ADVISOR_BLOCK_START).length - 1, 1);
  assert.equal(watchdog.split(ADVISOR_BLOCK_END).length - 1, 1);
  assert.doesNotMatch(agents, /@\.\/OMP_ENHANCER_WORKFLOW_CATALOG\.md/);
  assert.match(agents, /WORKFLOW PLAN[\s\S]*WORKFLOW READY[\s\S]*detailed TODO/i);
  assert.doesNotMatch(watchdog, /@\.\/OMP_ENHANCER_WORKFLOW_CATALOG\.md/);
  assert.match(watchdog, /OMP's native Advisor instructions and runtime settings are authoritative/);
  assert.match(watchdog, /DECISION CALIBRATION:/);
  assert.match(watchdog, /at most one ordinary `advise` call per primary user task/);
  assert.match(watchdog, /A complete user-visible Main final sets the ordinary send limit to zero/);

  const repeated = await syncWorkflowContext({ root: packageRoot(), target, apply: true });
  assert.equal(repeated.changed, 0);
});

test('workflow context sync updates only stale managed blocks', async () => {
  const target = await mkdtemp(path.join(tmpdir(), 'omp-config-sync-update-'));
  await writeFile(
    path.join(target, 'AGENTS.md'),
    `before\n\n${AGENTS_BLOCK_START}\nstale\n${AGENTS_BLOCK_END}\n\nafter\n`,
  );
  await writeFile(
    path.join(target, 'WATCHDOG.yml'),
    `instructions: |\n  before advisor\n\n  ${ADVISOR_BLOCK_START}\n  stale\n  ${ADVISOR_BLOCK_END}\n\n  after advisor\n`,
  );

  await syncWorkflowContext({ root: packageRoot(), target, apply: true });
  const [agents, watchdog] = await Promise.all([
    readFile(path.join(target, 'AGENTS.md'), 'utf8'),
    readFile(path.join(target, 'WATCHDOG.yml'), 'utf8'),
  ]);

  assert.match(agents, /^before$/m);
  assert.match(agents, /^after$/m);
  assert.doesNotMatch(agents, /^stale$/m);
  assert.match(watchdog, /^  before advisor$/m);
  assert.match(watchdog, /^  after advisor$/m);
  assert.doesNotMatch(watchdog, /^  stale$/m);
});

test('watchdog merge removes the complete legacy guidance suffix and preserves the user roster', () => {
  const managed = `${ADVISOR_BLOCK_START}\nOMP native authority remains unchanged.\n${ADVISOR_BLOCK_END}`;
  const merged = mergeWatchdogManagedBlock(legacyWatchdog(), managed);

  assert.doesNotMatch(merged, /Review the main agent as an advisory peer/);
  assert.doesNotMatch(merged, /ADVICE BUDGET/);
  assert.match(merged, /^  OMP native authority remains unchanged\.$/m);
  assert.match(merged, /^advisors:$/m);
  assert.match(merged, /^  - name: User reviewer$/m);
  assert.match(merged, /^    tools: \[\]$/m);
});

test('watchdog merge preserves edited or non-adjacent legacy-like guidance as user content', () => {
  const managed = `${ADVISOR_BLOCK_START}\nOMP native authority remains unchanged.\n${ADVISOR_BLOCK_END}`;
  const editedGuidance = LEGACY_ADVISOR_GUIDANCE_BLOCK.replace(
    'Stay silent when the work is already correct or complete.',
    'Remain silent when the work is already correct or complete.',
  );
  const edited = mergeWatchdogManagedBlock(legacyWatchdog(editedGuidance), managed);
  const nonAdjacent = mergeWatchdogManagedBlock(
    legacyWatchdog().replace(
      `${ADVISOR_BLOCK_END}\n\n`,
      `${ADVISOR_BLOCK_END}\n\n  User-authored preface.\n\n`,
    ),
    managed,
  );

  assert.match(edited, /Remain silent when the work is already correct or complete/);
  assert.match(edited, /ADVICE BUDGET/);
  assert.match(nonAdjacent, /User-authored preface/);
  assert.match(nonAdjacent, /Review the main agent as an advisory peer/);
  assert.match(nonAdjacent, /ADVICE BUDGET/);
});

test('watchdog merge removes the exact a846175 parent guidance immediately before the managed marker', () => {
  const managed = `${ADVISOR_BLOCK_START}\nOMP native authority remains unchanged.\n${ADVISOR_BLOCK_END}`;
  const merged = mergeWatchdogManagedBlock(preMarkerLegacyWatchdog(), managed);
  const mergedDirectlyFromHistoricalAsset = mergeWatchdogManagedBlock(
    `instructions: |\n${LEGACY_PRE_MARKER_ADVISOR_GUIDANCE_BLOCK}\n`,
    managed,
  );

  assert.doesNotMatch(merged, /OMP workflow context may provide a skill without a read tool call/);
  assert.doesNotMatch(merged, /ADVICE BUDGET/);
  assert.match(merged, /^instructions: \|$/m);
  assert.match(merged, /^  OMP native authority remains unchanged\.$/m);
  assert.match(merged, /^advisors:$/m);
  assert.match(merged, /^  - name: User reviewer$/m);
  assert.match(merged, /^    tools: \[\]$/m);
  assert.doesNotMatch(mergedDirectlyFromHistoricalAsset, /OMP workflow context may provide a skill/);
  assert.match(mergedDirectlyFromHistoricalAsset, /^  OMP native authority remains unchanged\.$/m);
});

test('watchdog merge preserves edited, partial, or non-adjacent a846175 parent guidance', () => {
  const managed = `${ADVISOR_BLOCK_START}\nOMP native authority remains unchanged.\n${ADVISOR_BLOCK_END}`;
  const editedGuidance = LEGACY_PRE_MARKER_ADVISOR_GUIDANCE_BLOCK.replace(
    'OMP workflow context may provide a skill',
    'OMP workflow context can provide a skill',
  );
  const partialGuidance = LEGACY_PRE_MARKER_ADVISOR_GUIDANCE_BLOCK
    .split('\n\n')
    .slice(1)
    .join('\n\n');
  const edited = mergeWatchdogManagedBlock(preMarkerLegacyWatchdog(editedGuidance), managed);
  const partial = mergeWatchdogManagedBlock(preMarkerLegacyWatchdog(partialGuidance), managed);
  const nonAdjacent = mergeWatchdogManagedBlock(
    preMarkerLegacyWatchdog().replace(
      `\n\n  ${ADVISOR_BLOCK_START}`,
      `\n\n  User-authored preface.\n\n  ${ADVISOR_BLOCK_START}`,
    ),
    managed,
  );

  assert.match(edited, /OMP workflow context can provide a skill/);
  assert.match(edited, /ADVICE BUDGET/);
  assert.match(partial, /OMP workflow context may provide a skill/);
  assert.match(partial, /ADVICE BUDGET/);
  assert.match(nonAdjacent, /User-authored preface/);
  assert.match(nonAdjacent, /OMP workflow context may provide a skill/);
  assert.match(nonAdjacent, /ADVICE BUDGET/);
});

test('watchdog merge preserves a roster when shared instructions are initially absent', () => {
  const managed = `${ADVISOR_BLOCK_START}\nOMP native authority remains unchanged.\n${ADVISOR_BLOCK_END}`;
  const merged = mergeWatchdogManagedBlock('advisors:\n  - name: Existing\n', managed);

  assert.match(merged, /^instructions: \|$/m);
  assert.match(merged, /^  OMP native authority remains unchanged\.$/m);
  assert.match(merged, /^advisors:$/m);
  assert.match(merged, /^  - name: Existing$/m);
});

test('workflow context sync refuses partial markers and symlinked managed files', async () => {
  const partialTarget = await mkdtemp(path.join(tmpdir(), 'omp-config-sync-partial-'));
  await writeFile(path.join(partialTarget, 'AGENTS.md'), `${AGENTS_BLOCK_START}\nincomplete\n`);
  await assert.rejects(
    syncWorkflowContext({ root: packageRoot(), target: partialTarget, apply: true }),
    /Managed block markers are incomplete or duplicated/,
  );

  const symlinkTarget = await mkdtemp(path.join(tmpdir(), 'omp-config-sync-symlink-'));
  const outside = path.join(await mkdtemp(path.join(tmpdir(), 'omp-config-sync-outside-')), 'outside.md');
  await writeFile(outside, 'outside\n');
  await symlink(outside, path.join(symlinkTarget, 'AGENTS.md'));
  await assert.rejects(
    syncWorkflowContext({ root: packageRoot(), target: symlinkTarget }),
    /Refusing to replace a symlinked config file/,
  );
  assert.equal(await readFile(outside, 'utf8'), 'outside\n');

  const collisionTarget = await mkdtemp(path.join(tmpdir(), 'omp-config-sync-collision-'));
  const collisionPath = path.join(collisionTarget, 'OMP_ENHANCER_WORKFLOW_CATALOG.md');
  await writeFile(collisionPath, '# User-owned workflow catalog\n');
  await assert.rejects(
    syncWorkflowContext({ root: packageRoot(), target: collisionTarget, apply: true }),
    /Refusing to replace existing workflow catalog without one complete OMP Enhancer managed marker pair/,
  );
  assert.equal(await readFile(collisionPath, 'utf8'), '# User-owned workflow catalog\n');
});

test('registered workflow context sync tool previews by default and reports explicit apply', async () => {
  const tool = registrationHarness().find(({ name }) => name === 'omp_config_sync_workflow_context');
  const target = path.join(await mkdtemp(path.join(tmpdir(), 'omp-config-sync-tool-')), 'agent');

  const preview = await tool.execute('sync-1', { target }, undefined, undefined, { cwd: packageRoot() });
  assert.equal(preview.isError, false);
  assert.equal(preview.details.mode, 'dry-run');
  assert.match(preview.content[0].text, /No files were written/);

  const applied = await tool.execute('sync-2', { target, apply: true }, undefined, undefined, { cwd: packageRoot() });
  assert.equal(applied.isError, false);
  assert.equal(applied.details.mode, 'apply');
  await mkdir(target, { recursive: true });
  const agents = await readFile(path.join(target, 'AGENTS.md'), 'utf8');
  assert.doesNotMatch(agents, /@\.\/OMP_ENHANCER_WORKFLOW_CATALOG\.md/);
  assert.match(agents, /WORKFLOW PLAN[\s\S]*WORKFLOW READY[\s\S]*detailed TODO/i);
});
