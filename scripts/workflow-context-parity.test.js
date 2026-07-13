import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  WORKFLOW_CATALOG_VERSION,
  buildWorkflowCatalogPrompt,
  workflowRouteCatalog,
  workflowRouteNames,
} from '../plugins/omp-enhancer-core/src/workflow-routes.js';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('shared main and advisor catalog stays aligned with the Core runtime catalog', async () => {
  const catalog = await readFile(new URL('../plugins/omp-config/assets/WORKFLOW_CATALOG.md', import.meta.url), 'utf8');
  const agents = await readFile(new URL('../plugins/omp-config/assets/AGENTS.md', import.meta.url), 'utf8');
  const watchdog = await readFile(new URL('../plugins/omp-config/assets/WATCHDOG.yml', import.meta.url), 'utf8');
  const mainPrompt = buildWorkflowCatalogPrompt({ audience: 'main' });
  const version = Number(catalog.match(/OMP_WORKFLOW_CATALOG_VERSION:\s*(\d+)/)?.[1]);
  const ids = [...catalog.matchAll(/^### `([^`]+)`$/gm)].map((match) => match[1]);

  assert.equal(version, WORKFLOW_CATALOG_VERSION);
  assert.deepEqual(ids, workflowRouteNames);
  for (const id of workflowRouteNames) {
    const section = workflowSection(catalog, id);
    const dynamicSection = dynamicWorkflowSection(mainPrompt, id);
    const staticSteps = parseNumberedField(section, 'Steps');
    const staticSkills = parseBacktickField(section, 'Skill candidates');
    const staticRoles = parseExactRoles(section);
    const staticQuality = parseTextField(section, 'Quality checks');
    const runtime = workflowRouteCatalog[id];

    assert.deepEqual(staticSteps, runtime.steps.map(normalizeProse), `${id} steps drifted from the runtime catalog`);
    assert.deepEqual(staticSkills, runtime.skills, `${id} skill candidates drifted from the runtime catalog`);
    assert.deepEqual(staticRoles, runtime.roles, `${id} agent roles drifted from the runtime catalog`);
    assert.equal(staticQuality, normalizeProse(runtime.qualityChecks.join(', ')), `${id} quality checks drifted from the runtime catalog`);

    assert.deepEqual(parseDynamicSteps(dynamicSection), runtime.steps.map(normalizeProse), `${id} steps are not fully exposed to Main`);
    assert.deepEqual(parseDynamicSkills(dynamicSection), runtime.skills, `${id} skills are not fully exposed to Main`);
    assert.deepEqual(parseDynamicRoles(dynamicSection), runtime.roles, `${id} agent roles are not fully exposed to Main`);

    const staticDelegationRoles = parseBacktickField(section, 'Delegation');
    for (const role of runtime.roles) {
      assert.ok(staticDelegationRoles.includes(role), `${id} static delegation does not name role ${role}`);
      assert.ok(
        runtime.delegation.some((line) => containsExactId(line, role)),
        `${id} runtime delegation does not assign role ${role}`,
      );
    }
    if (runtime.roles.length === 0) {
      const staticDelegation = fieldValue(section, 'Delegation');
      const runtimeDelegation = runtime.delegation.join(' ');
      assert.match(staticDelegation, /main agent|parent|compos(?:e|ed)/i, `${id} static no-role delegation is ambiguous`);
      assert.match(runtimeDelegation, /main agent|parent|compos(?:e|ed)/i, `${id} runtime no-role delegation is ambiguous`);
      assert.doesNotMatch(staticDelegation, /fork independent|delegate an independent|separate .+ lane/i, `${id} static delegation requests an unlisted role`);
      assert.doesNotMatch(runtimeDelegation, /fork independent|delegate an independent|separate .+ lane/i, `${id} runtime delegation requests an unlisted role`);
    }
  }
  assert.ok(workflowRouteCatalog['writing.en'].skills.includes('writing-review'));
  assert.ok(workflowRouteCatalog['writing.en'].skills.includes('writing-checkers'));
  assert.equal(countSharedCatalogImports(agents), 1, 'Main must import the shared workflow catalog exactly once');
  assert.equal(countSharedCatalogImports(watchdog), 1, 'Advisor must import the shared workflow catalog exactly once');
  assert.match(catalog, /initialize the native `todo` before substantive project work/i);
  assert.match(catalog, /fork multiple subagents/i);
  assert.match(catalog, /body of the text being modified/i);
  assert.doesNotMatch(catalog, /block:\s*true|continue:\s*true|hard gate/i);
});

test('every workflow role and skill candidate is packaged by a marketplace plugin', async () => {
  const marketplace = JSON.parse(await readFile(path.join(repoRoot, '.omp-plugin', 'marketplace.json'), 'utf8'));
  const plugins = await Promise.all(marketplace.plugins.map(loadPackagedPlugin));
  const referencedRoles = new Set(Object.values(workflowRouteCatalog).flatMap(({ roles }) => roles));
  const referencedSkills = new Set(Object.values(workflowRouteCatalog).flatMap(({ skills }) => skills));

  for (const role of referencedRoles) {
    const owners = plugins.filter(({ agentNames }) => agentNames.has(role));
    assert.ok(owners.length > 0, `workflow agent role ${role} is not packaged by any marketplace plugin`);
    for (const owner of owners) {
      assert.ok(owner.packageFiles.has('agents'), `${owner.name} does not include agents in package files`);
    }
  }

  for (const skill of referencedSkills) {
    const owners = plugins.filter(({ skillNames }) => skillNames.has(skill));
    assert.ok(owners.length > 0, `workflow skill candidate ${skill} is not packaged by any marketplace plugin`);
    for (const owner of owners) {
      assert.ok(owner.packageFiles.has('skills'), `${owner.name} does not include skills in package files`);
    }
  }
});

test('README documents every current workflow and the autonomous selection trigger', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const section = markdownSection(readme, 'Available workflow catalog');
  const documentedVersion = Number(section.match(/Catalog version:\s*\*\*(\d+)\*\*/)?.[1]);

  assert.equal(documentedVersion, WORKFLOW_CATALOG_VERSION);
  for (const id of workflowRouteNames) {
    assert.ok(section.includes(`| \`${id}\` |`), `README is missing workflow ${id}`);
  }
  assert.match(readme, /There is no workflow slash command and no keyword-to-route switch/i);
  assert.match(readme, /main agent uses those facts to select one workflow or compose several workflows/i);
  assert.match(readme, /English instruction does not select English-writing skills when the target text is Chinese/i);
  assert.match(readme, /Naming a workflow is guidance to the main agent; it is not permission/i);
});

function workflowSection(catalog, id) {
  const start = catalog.indexOf(`### \`${id}\``);
  const next = catalog.indexOf('\n### `', start + 1);
  assert.ok(start >= 0, `missing workflow section ${id}`);
  return catalog.slice(start, next < 0 ? catalog.length : next);
}

function dynamicWorkflowSection(catalog, id) {
  const start = catalog.indexOf(`### ${id}\n`);
  const next = catalog.indexOf('\n### ', start + 1);
  assert.ok(start >= 0, `missing Main workflow section ${id}`);
  return catalog.slice(start, next < 0 ? catalog.length : next);
}

function parseNumberedField(section, label) {
  const value = fieldValue(section, label);
  return value
    .replace(/^\(1\)\s*/, '')
    .split(/;\s*\(\d+\)\s*/)
    .map(normalizeProse);
}

function parseBacktickField(section, label) {
  const value = fieldValue(section, label);
  return [...value.matchAll(/`([a-z0-9][a-z0-9._/-]*)`/gi)].map((match) => match[1]);
}

function parseExactRoles(section) {
  const value = fieldValue(section, 'Agent roles');
  if (normalizeProse(value) === 'none') return [];
  const roles = [...value.matchAll(/`([a-z0-9][a-z0-9._/-]*)`/gi)].map((match) => match[1]);
  assert.ok(roles.length > 0, 'non-empty Agent roles must use backticked exact IDs');
  return roles;
}

function parseDynamicSteps(section) {
  return [...section.matchAll(/^- \d+\. \[step-\d+\] (.+)$/gm)].map((match) => normalizeProse(match[1]));
}

function parseDynamicSkills(section) {
  return [...section.matchAll(/^- skill:\/\/([a-z0-9][a-z0-9._/-]*)\b/gim)].map((match) => match[1]);
}

function parseDynamicRoles(section) {
  const value = blockValue(section, 'Agent roles', 'Delegation');
  if (/^- none$/m.test(value)) return [];
  return [...value.matchAll(/^- `([a-z0-9][a-z0-9._/-]*)`\s+— exact installed agent ID$/gim)].map((match) => match[1]);
}

function parseTextField(section, label) {
  return normalizeProse(fieldValue(section, label));
}

function fieldValue(section, label) {
  const match = section.match(new RegExp(`^- ${label}: (.+)$`, 'm'));
  assert.ok(match, `missing ${label} in workflow section`);
  return match[1];
}

function blockValue(section, label, nextLabel) {
  const match = section.match(new RegExp(`^${label}:\\n([\\s\\S]*?)^${nextLabel}:$`, 'm'));
  assert.ok(match, `missing ${label} block in Main workflow section`);
  return match[1];
}

function containsExactId(value, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9-])${escaped}([^a-z0-9-]|$)`, 'i').test(value);
}

function countSharedCatalogImports(value) {
  return (value.match(/^\s*@\.\/OMP_ENHANCER_WORKFLOW_CATALOG\.md\s*$/gm) ?? []).length;
}

async function loadPackagedPlugin(plugin) {
  const pluginRoot = path.join(repoRoot, 'plugins', plugin.source.replace(/^\.\//, ''));
  const packageJson = JSON.parse(await readFile(path.join(pluginRoot, 'package.json'), 'utf8'));
  const packageFiles = new Set((packageJson.files ?? []).map((entry) => entry.replace(/^\.\//, '').split('/')[0]));
  const skillNames = new Set();
  const agentNames = new Set();

  for (const skillPath of plugin.skills ?? []) {
    const skillDoc = await readFile(path.join(pluginRoot, skillPath, 'SKILL.md'), 'utf8');
    const skillName = frontmatterName(skillDoc, `${plugin.name}:${skillPath}`);
    skillNames.add(skillName);
  }

  if (packageFiles.has('agents')) {
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(path.join(pluginRoot, 'agents'), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      const agentDoc = await readFile(path.join(pluginRoot, 'agents', entry.name), 'utf8');
      agentNames.add(frontmatterName(agentDoc, `${plugin.name}:agents/${entry.name}`));
    }
  }

  return { name: plugin.name, packageFiles, skillNames, agentNames };
}

function frontmatterName(markdown, source) {
  const name = markdown.match(/^---\s*$[\s\S]*?^name:\s*([^\n]+)$/m)?.[1]?.trim();
  assert.ok(name, `${source} is missing a frontmatter name`);
  return name;
}

function normalizeProse(value) {
  return String(value)
    .replace(/`/g, '')
    .replace(/[.]$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function markdownSection(markdown, heading) {
  const start = markdown.indexOf(`### ${heading}`);
  const next = markdown.indexOf('\n### ', start + 1);
  assert.ok(start >= 0, `missing README section ${heading}`);
  return markdown.slice(start, next < 0 ? markdown.length : next);
}
