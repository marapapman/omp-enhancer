import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillRoot = join(pluginRoot, 'skills', 'mermaid-diagram');

function read(relativePath) {
  return readFileSync(join(pluginRoot, relativePath), 'utf8');
}

function posixRelative(root, path) {
  return relative(root, path).split(sep).join('/');
}

function resolveSkillUri(uri) {
  const prefix = 'skill://mermaid-diagram/';
  assert.ok(uri.startsWith(prefix), `unexpected Skill URI: ${uri}`);
  const target = resolve(skillRoot, uri.slice(prefix.length));
  const relativeTarget = posixRelative(skillRoot, target);
  assert.ok(!relativeTarget.startsWith('..'), `Skill URI escapes the skill root: ${uri}`);
  return target;
}

test('mermaid-diagram has concise frontmatter and all exact one-level reference URIs resolve', () => {
  const skill = read('skills/mermaid-diagram/SKILL.md');
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/u)?.[1];
  assert.ok(frontmatter, 'Skill frontmatter is required');
  const keys = [...frontmatter.matchAll(/^([A-Za-z0-9_-]+):/gmu)].map((match) => match[1]);
  assert.deepEqual(keys, ['name', 'description']);
  assert.match(frontmatter, /^name: mermaid-diagram$/mu);
  assert.match(
    frontmatter,
    /^description: Author, render, and review editable Mermaid diagrams to revision-bound SVG via mermaid_render$/mu,
  );
  assert.doesNotMatch(frontmatter, /\[TODO|TODO:/u);

  const expectedUris = [
    'skill://mermaid-diagram/references/mermaid-authoring.md',
    'skill://mermaid-diagram/references/render-review.md',
  ];
  const uris = [...skill.matchAll(/skill:\/\/mermaid-diagram\/[A-Za-z0-9._/-]+\.md/gu)].map((match) => match[0]);
  assert.deepEqual([...new Set(uris)].sort(), expectedUris.sort());
  for (const uri of expectedUris) {
    const target = resolveSkillUri(uri);
    assert.ok(existsSync(target) && lstatSync(target).isFile(), `unresolved ${uri}`);
    assert.equal(posixRelative(skillRoot, target).split('/').length, 2, `${uri} must be one level under references/`);
  }

  const ui = read('skills/mermaid-diagram/agents/openai.yaml');
  assert.match(ui, /default_prompt: "[^"]*\$mermaid-diagram[^"]*"/u);
  assert.doesNotMatch(ui, /^\s*dependencies:/mu);
});

test('linked mermaid resources use one byte-zero extension handoff before the final workflow reference', () => {
  const skill = read('skills/mermaid-diagram/SKILL.md');
  const marker = 'RESOURCE EXTENSION | source=skill://mermaid-diagram | reads=<applicable-exact-linked-URIs-in-listed-order>';

  assert.equal(skill.split(marker).length - 1, 1, 'the exact linked-resource marker template must appear once');
  assert.match(
    skill,
    /next linked-resource response.+start(?:s)? at byte 0.+RESOURCE EXTENSION \| source=skill:\/\/mermaid-diagram \| reads=<applicable-exact-linked-URIs-in-listed-order>/is,
  );
  assert.match(
    skill,
    /same response.+read exactly.+applicable.+URI.+listed order.+end and wait.+before THEN/is,
  );
  assert.match(skill, /at most one linked-method batch.+never reread/is);
  assert.match(
    skill,
    /marker.+before.+resource reads.+never.+after.+reads.+never.+final workflow reference/is,
  );
  assert.doesNotMatch(
    skill,
    /block:\s*true|continue:\s*true|retry until|repeat until|hard (?:gate|router)|completion authority/is,
  );
});

test('mermaid-diagram is a code-first pipeline to revision-bound SVG with soft review and no hand-edited coordinates', () => {
  const skill = read('skills/mermaid-diagram/SKILL.md');
  const references = readdirSync(join(skillRoot, 'references'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => readFileSync(join(skillRoot, 'references', name), 'utf8'))
    .join('\n');
  const contract = `${skill}\n${references}`;

  assert.match(skill, /`mermaid_render`/);
  assert.match(skill, /never hand-edit(?:ing)? SVG coordinates/is);
  assert.match(skill, /htmlLabels:\s*false/u);
  assert.match(skill, /fontFamily/u);
  assert.match(skill, /revision-bound/is);
  assert.match(skill, /viewBox/u);
  assert.match(skill, /<text>/u);
  assert.match(skill, /foreignObject/u);
  assert.match(skill, /semantic graph/i);
  assert.match(skill, /flowchart (?:TD|LR)|`TD` or `LR`/is);
  assert.match(contract, /Main performs a simple check.+rendered SVG/is);
  assert.match(contract, /at most once/i);
  assert.match(contract, /Main only authorizes external effects during initial setup and accepts final delivery/is);
  assert.match(contract, /no.+(?:gate|completion permission|automatic loop)/is);
  assert.doesNotMatch(contract, /visioner/i);
  assert.doesNotMatch(contract, /block:\s*true|continue:\s*true|retry until|repeat until|must delegate|mandatory fork/i);
});
