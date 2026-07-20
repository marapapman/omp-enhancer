import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { workflowDefinitions } from '../plugins/omp-enhancer-core/src/workflows/catalog.js';
import { exactNestedEccSkillUri } from '../plugins/omp-enhancer-core/src/workflows/skill-discovery.js';

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pluginsRoot = path.join(repoRoot, 'plugins');
const nativeAgents = new Set(['scout', 'task', 'sonic', 'designer', 'librarian', 'reviewer']);
const packageArtifactDirectories = new Set([
  '.git',
  '.hg',
  '.pytest_cache',
  '.svn',
  'CVS',
  '__pycache__',
  'node_modules',
]);

test('every packaged Skill entry is named uniquely, portable, and every workflow candidate resolves', async () => {
  const markdownFiles = await findPackagedSkillMarkdownFiles();
  const skillFiles = markdownFiles.filter((file) => path.basename(file) === 'SKILL.md');
  const entries = await Promise.all(skillFiles.map(async (file) => {
    const content = await readFile(file, 'utf8');
    return {
      file,
      name: frontmatterName(content),
      frontmatter: frontmatterOf(content),
    };
  }));

  assert.equal(entries.length, 313, 'update the reviewed all-Skill manifest when the inventory changes');
  for (const { file, name, frontmatter } of entries) {
    assert.ok(name, `${path.relative(repoRoot, file)} has no frontmatter name`);
    assert.doesNotMatch(
      frontmatter,
      /^(?:tools|allowed-tools|permissions?|hooks?|commands?)\s*:/imu,
      `${path.relative(repoRoot, file)} must not claim a host-specific tool, permission, hook, or command surface`,
    );
  }

  const names = entries.map(({ name }) => name);
  assert.equal(new Set(names).size, names.length, 'Skill frontmatter names must be globally unique');

  const available = new Set(names);
  const candidates = new Set(workflowDefinitions.flatMap(({ skills }) => skills));
  for (const candidate of candidates) {
    assert.ok(available.has(candidate), `workflow references missing Skill ${candidate}`);
  }
});

test('every workflow Agent candidate resolves to a packaged or native Agent', async () => {
  const agentFiles = await findNamedFiles(pluginsRoot, '.md', (segments) => segments.includes('agents'));
  const packaged = new Set();
  for (const file of agentFiles) {
    const name = frontmatterName(await readFile(file, 'utf8'));
    if (name) packaged.add(name);
  }

  for (const { id, roles } of workflowDefinitions) {
    for (const role of roles) {
      assert.ok(
        packaged.has(role) || nativeAgents.has(role),
        `${id} references missing Agent ${role}`,
      );
    }
  }
});

test('workflow discovery metadata matches direct and ECC-catalog packaging', async () => {
  const skillFiles = (await findPackagedSkillMarkdownFiles())
    .filter((file) => path.basename(file) === 'SKILL.md');
  const locations = new Map();
  const directlyVisible = new Set();

  for (const file of skillFiles) {
    const name = frontmatterName(await readFile(file, 'utf8'));
    if (!name) continue;
    locations.set(name, file);
    const segments = file.split(path.sep);
    const skillsIndex = segments.lastIndexOf('skills');
    if (skillsIndex >= 0 && segments.length - skillsIndex === 3) directlyVisible.add(name);
  }

  const catalogCandidates = new Set(workflowDefinitions.flatMap(({ catalogSkills }) => catalogSkills));
  assert.equal(catalogCandidates.size, 25, 'update the reviewed enumerated ECC candidate baseline');

  for (const definition of workflowDefinitions) {
    const expectedCatalogSkills = definition.skills.filter((skill) => !directlyVisible.has(skill));
    assert.deepEqual(
      definition.catalogSkills,
      expectedCatalogSkills,
      `${definition.id} must classify every non-visible candidate as catalog-only`,
    );
    for (const skill of definition.catalogSkills) {
      assert.equal(
        path.relative(repoRoot, locations.get(skill) ?? ''),
        `plugins/omp-config/skills/ecc/${skill}/SKILL.md`,
        `${definition.id} catalog candidate ${skill} must map exactly to its packaged ECC directory`,
      );
      assert.equal(
        exactNestedEccSkillUri(skill),
        `skill://ecc-skill-catalog/${skill}/SKILL.md`,
        `${definition.id} catalog candidate ${skill} must expose its exact packaged URI`,
      );
    }
  }
});

test('every exact Skill URI in packaged Skill Markdown resolves to a real entry or resource', async () => {
  const resourceFiles = await findPackagedSkillMarkdownFiles();
  const skillFiles = resourceFiles.filter((file) => path.basename(file) === 'SKILL.md');
  const roots = new Map();

  assert.equal(resourceFiles.length, 447, 'update the reviewed packaged Skill Markdown manifest when inventory changes');

  for (const file of skillFiles) {
    const name = frontmatterName(await readFile(file, 'utf8'));
    if (name) roots.set(name, path.dirname(file));
  }

  const observed = new Set();
  for (const file of resourceFiles) {
    const content = await readFile(file, 'utf8');
    for (const match of content.matchAll(/`(skill:\/\/[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9._/-]+)?)`/gu)) {
      const uri = match[1];
      if (uri === 'skill://x') continue;
      observed.add(uri);

      const withoutScheme = uri.slice('skill://'.length);
      const slash = withoutScheme.indexOf('/');
      const rootName = slash === -1 ? withoutScheme : withoutScheme.slice(0, slash);
      const resource = slash === -1 ? '' : withoutScheme.slice(slash + 1);
      const root = roots.get(rootName);
      assert.ok(root, `${path.relative(repoRoot, file)} references missing Skill root ${uri}`);
      if (!resource) continue;

      assert.ok(!resource.split('/').includes('..'), `${uri} must not traverse outside its Skill`);
      const target = path.resolve(root, resource);
      assert.ok(target.startsWith(`${path.resolve(root)}${path.sep}`), `${uri} escapes its Skill root`);
      const targetStat = await stat(target).catch(() => null);
      assert.ok(targetStat?.isFile(), `${path.relative(repoRoot, file)} references missing Skill resource ${uri}`);
    }
  }

  assert.ok(observed.size > workflowDefinitions.length, 'expected the audit to cover nested Skill resources');
});

async function findNamedFiles(root, filename, include) {
  const found = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!packageArtifactDirectories.has(entry.name)) await visit(target);
      } else if (
        (filename === '.md' ? entry.name.endsWith(filename) : entry.name === filename)
        && include(target.split(path.sep))
      ) {
        found.push(target);
      }
    }
  }
  await visit(root);
  return found.sort();
}

async function findPackagedSkillMarkdownFiles(pluginsDirectory = pluginsRoot) {
  const files = [];
  for (const entry of await readdir(pluginsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pluginRoot = path.join(pluginsDirectory, entry.name);
    const manifest = await readFile(path.join(pluginRoot, 'package.json'), 'utf8')
      .then(JSON.parse)
      .catch(() => null);
    if (!manifest?.files?.includes('skills')) continue;

    const skillsRoot = path.join(pluginRoot, 'skills');
    const skillsStat = await stat(skillsRoot).catch(() => null);
    if (!skillsStat?.isDirectory()) continue;
    files.push(...await findNamedFiles(skillsRoot, '.md', () => true));
  }
  return files.sort();
}

function frontmatterName(content) {
  const frontmatter = frontmatterOf(content);
  return frontmatter.match(/^name:\s*['"]?([^'"\r\n]+?)['"]?\s*$/m)?.[1]?.trim() ?? '';
}

function frontmatterOf(content) {
  return content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] ?? '';
}
