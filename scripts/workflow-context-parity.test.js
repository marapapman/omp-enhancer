import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WORKFLOW_CATALOG_VERSION,
  workflowDefinitions,
} from './workflow-definitions.js';
import { defineWorkflowCatalog } from './workflow-schema.js';
import {
  buildSharedWorkflowCatalogMarkdown,
  buildWorkflowSkillReferences,
  workflowReferenceUri,
} from './workflow-render.js';

const workflowCatalog = Object.fromEntries(workflowDefinitions.map((d) => [d.id, d]));
const workflowIds = Object.freeze(workflowDefinitions.map(({ id }) => id));

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OMP_NATIVE_ROLE_IDS = new Set(['plan', 'scout', 'task', 'sonic', 'designer', 'librarian', 'reviewer']);
test('catalog v35 defines exactly the three advisory workflows (writing, research, visual)', () => {
  assert.equal(WORKFLOW_CATALOG_VERSION, 35);
  assert.equal(workflowDefinitions.length, 3);
  assert.deepEqual(workflowIds, ['writing', 'research', 'visual']);
  for (const definition of workflowDefinitions) {
    assert.equal(typeof definition.chooseWhen, 'string');
    assert.ok(definition.chooseWhen.length > 0, `${definition.id} chooseWhen`);
    assert.ok(Array.isArray(definition.skills) && definition.skills.length > 0, `${definition.id} skills`);
    assert.ok(Array.isArray(definition.catalogSkills), `${definition.id} catalogSkills`);
    for (const skill of definition.catalogSkills) {
      assert.ok(definition.skills.includes(skill), `${definition.id} catalogSkills must be a subset of skills`);
    }
    assert.ok(Array.isArray(definition.roles) && definition.roles.length > 0, `${definition.id} roles`);
    assert.ok(Array.isArray(definition.suggestedFlow) && definition.suggestedFlow.length > 0, `${definition.id} suggestedFlow`);
    for (const line of definition.suggestedFlow) assert.equal(typeof line, 'string', `${definition.id} suggestedFlow line`);
    assert.ok(Array.isArray(definition.scopeNotes), `${definition.id} scopeNotes`);
    for (const retired of ['steps', 'delegation', 'delegationDefault', 'composeWith', 'qualityChecks', 'riskNotes']) {
      assert.equal(Object.hasOwn(definition, retired), false, `${definition.id} must not carry ${retired}`);
    }
  }
  assert.deepEqual(Object.keys(workflowCatalog), workflowIds);
  assert.equal(new Set(workflowDefinitions.flatMap(({ catalogSkills }) => catalogSkills)).size, 0, 'no ECC catalog candidates remain');
});

test('writing card keeps Beamer conversion direct and command-conditional', () => {
  const writing = workflowCatalog['writing'];

  assert.ok(writing, 'workflowCatalog must expose the writing workflow');
  assert.ok(writing.skills.includes('beamer-to-powerpoint'));
  assert.deepEqual(writing.catalogSkills, []);
  const scope = writing.scopeNotes.join(' ');
  assert.match(
    scope,
    /`?beamer-to-powerpoint`? is conditional on an explicit user-supplied conversion command/iu,
  );
  const flow = [...writing.suggestedFlow, ...writing.scopeNotes].join(' ');
  assert.match(
    flow,
    /single read-only visual precheck.+Main or task.+(?:initial render|initial revision).+before designer layout/iu,
  );
});

test('packaged catalog, index, and all references expose catalog v35 advisory content', async () => {
  const catalog = await readFile(new URL('../plugins/omp-config/assets/WORKFLOW_CATALOG.md', import.meta.url), 'utf8');
  const skillIndex = await readFile(new URL('../plugins/omp-config/skills/omp-enhancer-workflows/SKILL.md', import.meta.url), 'utf8');
  const referencesDir = new URL('../plugins/omp-config/skills/omp-enhancer-workflows/references/', import.meta.url);
  const referenceNames = (await readdir(referencesDir)).filter((name) => name.endsWith('.md')).sort();
  const references = await Promise.all(referenceNames.map((name) => readFile(new URL(name, referencesDir), 'utf8')));
  const referenceText = references.join('\n');

  assert.match(catalog, /# OMP Enhancer Workflow Catalog v35/);
  assert.match(skillIndex, /Phases: ANALYZE -> EXECUTE -> REVIEW/iu);
  assert.match(skillIndex, /Advisory reference only/i);
  assert.equal(referenceNames.length, 3);
  assert.deepEqual(referenceNames, workflowIds.map((id) => `${id}.md`).sort());
  assert.doesNotMatch(
    `${catalog}\n${skillIndex}\n${referenceText}`,
    /EXECUTION DEFAULT|WORKFLOW PLAN|WORKFLOW READY|SENTINEL|byte 0|block:\s*true|continue:\s*true|triggerTurn|systemPrompt\s*=/i,
  );
});

test('shared catalog and Skill index expose the five domains while references carry advisory cards', async () => {
  const catalog = await readFile(new URL('../plugins/omp-config/assets/WORKFLOW_CATALOG.md', import.meta.url), 'utf8');
  const skillIndex = await readFile(new URL('../plugins/omp-config/skills/omp-enhancer-workflows/SKILL.md', import.meta.url), 'utf8');
  const agents = await readFile(new URL('../plugins/omp-config/assets/AGENTS.md', import.meta.url), 'utf8');
  const claude = await readFile(new URL('../plugins/omp-config/assets/CLAUDE.md', import.meta.url), 'utf8');
  const watchdog = await readFile(new URL('../plugins/omp-config/assets/WATCHDOG.yml', import.meta.url), 'utf8');
  const referencesByWorkflow = buildWorkflowSkillReferences();
  const skillReferences = Object.values(referencesByWorkflow).join('\n');

  assert.equal(catalog, buildSharedWorkflowCatalogMarkdown());
  assert.equal(Number(catalog.match(/# OMP Enhancer Workflow Catalog v(\d+)/)?.[1]), WORKFLOW_CATALOG_VERSION);
  assert.deepEqual([...catalog.matchAll(/^## `([^`]+)`$/gm)].map((match) => match[1]), workflowIds);
  const indexedWorkflowIds = [...skillIndex.split('## Agent descriptions')[0].matchAll(/^- `([^`]+)` —/gm)].map((match) => match[1]);
  assert.deepEqual(indexedWorkflowIds, workflowIds);
  assert.match(skillIndex, /^## Domain index$/mu);
  assert.match(skillIndex, /^## Usage$/mu);
  assert.match(skillIndex, /1\. Match the task to a domain above\./u);
  assert.ok(Buffer.byteLength(skillIndex) < 17_000, 'Main workflow index should stay below 17k');
  assert.doesNotMatch(skillIndex, /DECLARE HANDOFF|WORKFLOW PLAN|WORKFLOW READY|SENTINEL|byte 0|NOW=|THEN=|RESOURCE EXTENSION|Delegate Agent=|EXECUTION DEFAULT/i);
  assert.doesNotMatch(skillIndex, /block:\s*true|continue:\s*true|hard router|automatic retry/iu);

  assert.deepEqual(Object.keys(referencesByWorkflow), workflowIds);

  for (const definition of workflowDefinitions) {
    const section = referenceSection(skillReferences, definition.id);
    const catalogSection = catalogSectionOf(catalog, definition.id);
    assert.ok(
      skillIndex.includes(`Reference: \`${workflowReferenceUri(definition.id)}\`.`),
      `${definition.id} is missing its literal reference URI`,
    );
    assert.ok(section.includes(`- When: ${definition.chooseWhen}`), `${definition.id} chooseWhen is hidden from Main`);
    assert.ok(section.includes('- Agent candidates:'), `${definition.id} reference must render agent candidates`);
    assert.doesNotMatch(section, /- Suggested flow:|- Scope notes:/u, `${definition.id} reference must not render execution or constraint specs`);
    for (const skill of definition.skills) {
      assert.ok(section.includes(`\`${skill}\``), `${definition.id} reference is missing skill ${skill}`);
      assert.ok(catalogSection.includes(`\`${skill}\``), `${definition.id} catalog card is missing skill ${skill}`);
    }
    for (const role of definition.roles) {
      assert.ok(section.includes(`\`${role}\``), `${definition.id} is missing role ${role}`);
      assert.ok(catalogSection.includes(`\`${role}\``), `${definition.id} catalog card is missing role ${role}`);
    }
    assert.doesNotMatch(section, /EXECUTION DEFAULT|READY NEXT|TASK COPY|AFTER TODO RESULT|Delegate Agent=|SENTINEL|byte 0|WORKFLOW READY/i, definition.id);
  }

  assert.equal(countSharedCatalogImports(agents), 0, 'Main should use the compact prompt and on-demand workflow Skill');
  assert.equal(countSharedCatalogImports(watchdog), 0, 'Advisor should coach Main through the on-demand workflow Skill without a full catalog import');
  assert.match(agents, /OMP's native system prompt, settings, active tools, dynamic Available Agents, approval flow, and completion behavior are authoritative/);
  assert.match(agents, /ANALYZE -> EXECUTE -> REVIEW/u);
  assert.match(agents, /never routes, blocks, grants permission, starts a task, or decides completion/iu);
  assert.match(agents, /A verbatim field or heading lookup needs no workflow or TODO/iu);
  assert.match(agents, /No plugin creates a gate, router, retry, permission, or completion controller/iu);
  assert.doesNotMatch(agents, /WORKFLOW PLAN|WORKFLOW READY|SENTINEL|byte 0|RESOURCE EXTENSION|Delegate Agent=|writing\.pending/i);
  assert.match(claude, /ANALYZE -> EXECUTE -> REVIEW/u);
  assert.match(claude, /never routes, blocks, grants permission, starts a task, or decides completion/iu);
  assert.match(watchdog, /Main is the orchestrator\. Phases: ANALYZE -> EXECUTE -> REVIEW/u);
  assert.match(watchdog, /No plugin creates a gate, router, retry, permission, or completion controller/iu);
  assert.doesNotMatch(`${catalog}\n${skillIndex}\n${skillReferences}\n${agents}\n${watchdog}`, /block:\s*true|continue:\s*true|triggerTurn|systemPrompt\s*=/i);
});

test('workflow schema rejects drift-prone definitions', () => {
  const valid = (overrides = {}) => ({
    id: 'example.base',
    chooseWhen: 'An example is needed.',
    skills: ['example-skill'],
    catalogSkills: [],
    roles: ['task'],
    suggestedFlow: ['Perform the example.'],
    scopeNotes: [],
    ...overrides,
  });

  assert.throws(() => defineWorkflowCatalog([[valid(), valid()]]), /Duplicate workflow id/);
  assert.throws(() => defineWorkflowCatalog([[valid({ id: 'Example Base' })]]), /invalid identifier/);
  assert.throws(() => defineWorkflowCatalog([[valid({ steps: [] })]]), /unknown field steps/);
  assert.throws(() => defineWorkflowCatalog([[valid({ delegation: [] })]]), /unknown field delegation/);
  assert.throws(() => defineWorkflowCatalog([[valid({ delegationDefault: 'subagent-driven' })]]), /unknown field delegationDefault/);
  assert.throws(() => defineWorkflowCatalog([[valid({ composeWith: [] })]]), /unknown field composeWith/);
  assert.throws(() => defineWorkflowCatalog([[valid({ qualityChecks: [] })]]), /unknown field qualityChecks/);
  assert.throws(() => defineWorkflowCatalog([[valid({ riskNotes: [] })]]), /unknown field riskNotes/);
  assert.throws(() => defineWorkflowCatalog([[valid({ chooseWhen: 42 })]]), /chooseWhen must be a string/);
  assert.throws(() => defineWorkflowCatalog([[valid({ suggestedFlow: [{}] })]]), /suggestedFlow\[0\] must be a string/);
  assert.throws(() => defineWorkflowCatalog([[valid({ suggestedFlow: [] })]]), /must contain at least one entry/);
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
    () => defineWorkflowCatalog([[valid({ catalogSkills: ['unlisted-candidate'] })]]),
    /non-candidate/,
  );
  assert.throws(
    () => defineWorkflowCatalog([[valid({ skills: ['example-skill', 'example-skill'] })]]),
    /duplicate/,
  );
  assert.throws(
    () => defineWorkflowCatalog([[valid({ roles: ['Bad Role'] })]]),
    /invalid identifier/,
  );
  assert.doesNotThrow(() => defineWorkflowCatalog([[valid()]]));
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

  // Skills provided by external marketplaces (installed OMP plugins, not
  // packaged in this repo) that workflow cards may reference as candidates.
  const externalWorkflowSkills = new Set(['drawio-skill']);

  for (const skill of referencedSkills) {
    if (externalWorkflowSkills.has(skill)) continue;
    const owners = skillEntries.filter(({ name }) => name === skill);
    assert.equal(owners.length, 1, ownerError('workflow skill candidate', skill, owners));
    assert.ok(owners[0].packageFiles.has('skills'), `${owners[0].plugin} does not include skills in package files`);
  }
});

test('no retired or ECC agent roles remain in workflow cards', () => {
  const allRoles = new Set(Object.values(workflowCatalog).flatMap(({ roles }) => roles));
  for (const retired of [
    'explore',
    'implementation-task',
    'config-librarian',
    'omp-target-auditor',
    'analyzer',
    'code-reviewer',
    'ecc-network-architect',
    'ecc-network-config-reviewer',
    'ecc-network-troubleshooter',
    'ecc-security-reviewer',
    'ecc-opensource-sanitizer',
    'ecc-opensource-forker',
    'ecc-opensource-packager',
  ]) {
    assert.equal(allRoles.has(retired), false, retired);
  }
});

test('README stays user-focused and links the detailed current documentation', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.ok(readme.split('\n').length <= 110, 'root README should remain a concise user guide');
  assert.ok(Buffer.byteLength(readme) <= 6500, 'development detail belongs under docs');
  assert.match(readme, /OMP exposes available Skills and Agents; Main chooses under native permissions/i);
  assert.match(readme, /covers 3 domains: writing, research \(fact-checking\), and visual/i);
  assert.match(readme, /Main orchestrates through ANALYZE -> EXECUTE -> REVIEW/i);
  assert.match(readme, /`D` is a top-level Skill exact URI/i);
  assert.match(readme, /there is no separate pending workflow/i);
  assert.match(readme, /extension tools are inactive by default so they do not enlarge the normal prompt/i);
  assert.match(readme, /\/enhancer-tools enable/i);
  assert.match(readme, /docs\/ARCHITECTURE\.md/);
  assert.match(readme, /docs\/DEVELOPMENT\.md/);
  assert.match(readme, /docs\/WORKFLOW_DEVELOPMENT\.md/);
  assert.doesNotMatch(readme, /TODO-first|full workflow-catalog injection|omp_core_route_task|omp_test_gate|fact_check_gate/i);
});

function referenceSection(references, id) {
  const start = references.indexOf(`# \`${id}\` workflow reference`);
  const next = references.indexOf('\n# `', start + 1);
  assert.ok(start >= 0, `missing workflow reference section ${id}`);
  return references.slice(start, next < 0 ? references.length : next);
}

function catalogSectionOf(catalog, id) {
  const start = catalog.indexOf(`## \`${id}\``);
  const next = catalog.indexOf('\n## `', start + 1);
  assert.ok(start >= 0, `missing shared catalog section ${id}`);
  return catalog.slice(start, next < 0 ? catalog.length : next);
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
