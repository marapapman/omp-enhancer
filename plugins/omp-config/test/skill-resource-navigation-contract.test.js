import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const configRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pluginsRoot = join(configRoot, '..');
const packageArtifactDirectories = new Set([
  '.git',
  '.hg',
  '.pytest_cache',
  '.svn',
  'CVS',
  '__pycache__',
  'node_modules',
]);

function markdownFilesUnder(root, { excludePackageArtifacts = false } = {}) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!excludePackageArtifacts || !packageArtifactDirectories.has(entry.name)) visit(path);
      }
      else if (entry.isFile() && entry.name.endsWith('.md')) files.push(path);
    }
  };
  visit(root);
  return files;
}

function packagedSkillRoots(pluginsDirectory = pluginsRoot) {
  return readdirSync(pluginsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(pluginsDirectory, entry.name))
    .filter((pluginRoot) => {
      const manifestPath = join(pluginRoot, 'package.json');
      if (!existsSync(manifestPath)) return false;
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      return Array.isArray(manifest.files) && manifest.files.includes('skills');
    })
    .map((pluginRoot) => join(pluginRoot, 'skills'))
    .filter((path) => existsSync(path));
}

function packagedSkillMarkdownFiles(pluginsDirectory = pluginsRoot) {
  return packagedSkillRoots(pluginsDirectory)
    .flatMap((root) => markdownFilesUnder(root, { excludePackageArtifacts: true }))
    .sort();
}

function withoutFencedCode(content) {
  let fence = null;
  return content
    .split('\n')
    .map((line) => {
      const marker = line.match(/^\s*(`{3,}|~{3,})/u)?.[1];
      if (marker) {
        if (fence === null) fence = marker[0];
        else if (fence === marker[0]) fence = null;
        return '';
      }
      return fence === null ? line : '';
    })
    .join('\n');
}

function nearestSkillRoot(markdownPath, skillsRoot, packagedFiles) {
  let candidate = dirname(markdownPath);
  while (candidate !== skillsRoot && candidate.startsWith(`${skillsRoot}/`)) {
    if (packagedFiles.has(join(candidate, 'SKILL.md'))) return candidate;
    candidate = dirname(candidate);
  }
  return packagedFiles.has(join(skillsRoot, 'SKILL.md')) ? skillsRoot : null;
}

function relativeMarkdownDestinations(content) {
  const destinations = [];
  for (const match of content.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/gu)) {
    const raw = match[1].trim();
    const destination = raw.startsWith('<')
      ? raw.slice(1, raw.indexOf('>'))
      : raw.split(/\s+/u)[0];
    if (!destination || /^(?:[a-z][a-z0-9+.-]*:|#)/iu.test(destination)) continue;
    const path = destination.split('#', 1)[0];
    if (path.toLowerCase().endsWith('.md')) destinations.push({ destination, path });
  }
  return destinations;
}

function isWithin(root, path) {
  const offset = relative(root, path);
  return offset === '' || (!offset.startsWith('..') && !isAbsolute(offset));
}

function skillUriRegistry(roots, packagedFiles) {
  const registry = new Map();
  for (const skillsRoot of roots) {
    for (const entry of readdirSync(skillsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const root = join(skillsRoot, entry.name);
      const entrypoint = join(root, 'SKILL.md');
      if (!packagedFiles.has(entrypoint)) continue;
      const frontmatter = readFileSync(entrypoint, 'utf8').match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? '';
      const name = frontmatter.match(/^name:\s*([^\n]+)$/mu)?.[1].trim();
      if (name) registry.set(name, root);
    }
  }
  return registry;
}

test('packaged Skill Markdown uses exact URIs for same-package Markdown navigation', () => {
  const violations = [];
  const roots = packagedSkillRoots();
  const markdownFiles = packagedSkillMarkdownFiles();
  const packagedFiles = new Set(markdownFiles);

  for (const markdownPath of markdownFiles) {
    const skillsRoot = roots.find((root) => isWithin(root, markdownPath));
    const packageRoot = nearestSkillRoot(markdownPath, skillsRoot, packagedFiles);
    if (!packageRoot) continue;

    const content = withoutFencedCode(readFileSync(markdownPath, 'utf8'));
    for (const { destination, path } of relativeMarkdownDestinations(content)) {
      const target = resolve(dirname(markdownPath), path);
      if (isWithin(packageRoot, target) && packagedFiles.has(target)) {
        violations.push(`${relative(pluginsRoot, markdownPath)} -> ${destination}`);
      }
    }
  }

  assert.equal(markdownFiles.length, 447, 'update the reviewed packaged Skill Markdown manifest when inventory changes');
  assert.deepEqual(
    violations,
    [],
    `replace relative links to packaged Skill resources with exact skill:// URIs:\n${violations.join('\n')}`,
  );
});

test('package-declared inventory is unchanged by an ignored cache artifact', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'omp-skill-inventory-'));
  try {
    const pluginRoot = join(fixtureRoot, 'plugins', 'fixture-plugin');
    const skillRoot = join(pluginRoot, 'skills', 'fixture-skill');
    mkdirSync(skillRoot, { recursive: true });
    writeFileSync(join(pluginRoot, 'package.json'), JSON.stringify({ files: ['skills'] }));
    writeFileSync(join(skillRoot, '.gitignore'), '.pytest_cache/\n');
    writeFileSync(join(skillRoot, 'SKILL.md'), '---\nname: fixture-skill\ndescription: Fixture.\n---\n');
    writeFileSync(join(skillRoot, 'reference.md'), '# Reference\n');

    const fixturePluginsRoot = join(fixtureRoot, 'plugins');
    const cleanInventory = packagedSkillMarkdownFiles(fixturePluginsRoot);

    const cacheRoot = join(skillRoot, '.pytest_cache');
    mkdirSync(cacheRoot);
    writeFileSync(join(cacheRoot, 'README.md'), '# Incidental cache metadata\n');
    const cachedInventory = packagedSkillMarkdownFiles(fixturePluginsRoot);

    assert.equal(markdownFilesUnder(join(pluginRoot, 'skills')).length, 3, 'physical recursion sees the cache README');
    assert.deepEqual(cachedInventory, cleanInventory, 'package inventory is independent of cache presence');
    assert.deepEqual(
      cleanInventory.map((path) => relative(fixtureRoot, path)),
      [
        'plugins/fixture-plugin/skills/fixture-skill/SKILL.md',
        'plugins/fixture-plugin/skills/fixture-skill/reference.md',
      ],
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('exact Skill Markdown resource URIs resolve to packaged files', () => {
  const roots = packagedSkillRoots();
  const markdownFiles = packagedSkillMarkdownFiles();
  const packagedFiles = new Set(markdownFiles);
  const registry = skillUriRegistry(roots, packagedFiles);
  const unresolved = [];
  const uris = new Set();

  for (const markdownPath of markdownFiles) {
    const content = withoutFencedCode(readFileSync(markdownPath, 'utf8'));
    for (const match of content.matchAll(/skill:\/\/[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9._/-]+\.md(?:#[A-Za-z0-9._-]+)?/gu)) {
      uris.add(match[0]);
    }
  }

  for (const uri of uris) {
    const [rootName, ...resourceSegments] = uri
      .slice('skill://'.length)
      .split('#', 1)[0]
      .split('/');
    const root = registry.get(rootName);
    const target = root && resolve(root, ...resourceSegments);
    if (!root || !isWithin(root, target) || !packagedFiles.has(target)) {
      unresolved.push(uri);
    }
  }

  assert.ok(uris.size > 300, 'the contract resolves the full concrete Skill resource inventory');
  assert.deepEqual(unresolved, [], `unresolved exact Skill resource URIs:\n${unresolved.join('\n')}`);
});
