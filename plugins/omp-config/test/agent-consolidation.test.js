import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const PLUGIN_ROOT = path.resolve(import.meta.dirname, '..');
const AGENT_ROOT = path.join(PLUGIN_ROOT, 'agents');
const SKILL_ROOT = path.join(PLUGIN_ROOT, 'skills');

const REMOVED_AGENT_FILES = [
  'config-librarian.md',
  'explore.md',
  'implementation-task.md',
  'plan.md',
  'omp-target-auditor.md',
  'task.md',
  'quick_task.md',
  'designer.md',
  'librarian.md',
  'reviewer.md',
  'ecc-a11y-architect.md',
  'analyzer.md',
  'ecc-network-architect.md',
  'ecc-security-reviewer.md',
  'ecc-opensource-forker.md',
  'ecc-opensource-packager.md',
  'ecc-network-config-reviewer.md',
  'ecc-opensource-sanitizer.md',
  'ecc-network-troubleshooter.md',
];

test('legacy agent wrappers are removed after their knowledge moves to workflows and skills', async () => {
  const present = new Set(await readdir(AGENT_ROOT));
  for (const file of REMOVED_AGENT_FILES) {
    assert.equal(present.has(file), false, `legacy wrapper still packaged: ${file}`);
  }
});

test('OMP native agent identities are not packaged by omp-config', async () => {
  const present = new Set(await readdir(AGENT_ROOT));
  for (const file of ['scout.md', 'task.md', 'sonic.md', 'plan.md', 'designer.md', 'librarian.md', 'reviewer.md']) {
    assert.equal(present.has(file), false, `OMP native agent is shadowed by plugin asset: ${file}`);
  }
});

test('task implementation is native and never reintroduced as a plugin wrapper', async () => {
  const present = new Set(await readdir(AGENT_ROOT));
  assert.equal(present.has('task.md'), false);
  assert.equal(present.has('implementation-task.md'), false);
  assert.equal(present.has('quick_task.md'), false);
});


test('packaged top-level agents never use wildcard or dangling spawn targets', async () => {
  const files = (await readdir(AGENT_ROOT)).filter((file) => file.endsWith('.md'));
  const names = new Set(files.map((file) => path.basename(file, '.md')));
  for (const file of files) {
    const source = await readFile(path.join(AGENT_ROOT, file), 'utf8');
    assert.doesNotMatch(source, /^spawns:\s*["']?\*["']?\s*$/m, file);
    for (const target of frontmatterList(source, 'spawns')) {
      assert.ok(names.has(target), `${file} spawns missing agent ${target}`);
    }
  }
});



test('active skills do not instruct Main to call deleted agent identities', async () => {
  const forbidden = REMOVED_AGENT_FILES
    .map((file) => path.basename(file, '.md'))
    .filter((id) => id.startsWith('ecc-'));
  const staleBareIds = [
    'code-reviewer',
    'doc-updater',
    'fastapi-reviewer',
    'healthcare-reviewer',
    'mle-reviewer',
    'network-troubleshooter',
    'performance-optimizer',
    'pr-test-analyzer',
    'pytorch-build-resolver',
    'react-build-resolver',
    'react-reviewer',
    'seo-specialist',
    'silent-failure-hunter',
    'tdd-guide',
  ];

  for (const file of await findSkillFiles(SKILL_ROOT)) {
    const source = await readFile(file, 'utf8');
    for (const id of forbidden) {
      assert.equal(source.includes(id), false, `${path.relative(SKILL_ROOT, file)} references ${id}`);
    }
    for (const id of staleBareIds) {
      const pattern = new RegExp(`(?<![a-z0-9-])${id}(?![a-z0-9-])`, 'i');
      assert.doesNotMatch(source, pattern, `${path.relative(SKILL_ROOT, file)} references ${id}`);
    }
  }
});

function frontmatterList(source, key) {
  const frontmatter = source.match(/^---\s*$([\s\S]*?)^---\s*$/m)?.[1] ?? '';
  const block = frontmatter.match(new RegExp(`^${key}:\\s*$([\\s\\S]*?)(?=^[a-zA-Z][\\w-]*:|\\Z)`, 'm'))?.[1] ?? '';
  return [...block.matchAll(/^\s*-\s+([^\s#]+)\s*$/gm)].map((match) => match[1]);
}

async function findSkillFiles(root) {
  const results = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) results.push(...await findSkillFiles(target));
    else if (entry.name === 'SKILL.md') results.push(target);
  }
  return results;
}
