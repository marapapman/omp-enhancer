import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  checkEccSkillArtifacts,
  writeEccSkillArtifacts,
} from './generate-ecc-skill-catalog.js';

test('ECC catalog generator exposes nested guides through one OMP-discoverable Skill', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'omp-ecc-skill-catalog-'));
  await writeNestedSkill(root, 'zeta-guide', 'Zeta specialist guidance.');
  await writeNestedSkill(root, 'alpha-guide', 'Alpha specialist guidance.');
  await writeNestedSkill(
    root,
    'scientific-pkg-gget',
    'Genomics lookup guidance.',
    'gget',
  );
  await writeNestedSkill(root, 'folded-guide', 'placeholder');
  await writeFile(
    path.join(root, 'folded-guide', 'SKILL.md'),
    '---\nname: folded-guide\ndescription: >-\n  Folded specialist\n  guidance.\n---\n\n# folded-guide\n',
  );

  assert.equal((await checkEccSkillArtifacts({ skillRoot: root })).ok, false);

  const written = await writeEccSkillArtifacts({ skillRoot: root });
  assert.equal(written.results.length, 2);
  assert.equal((await checkEccSkillArtifacts({ skillRoot: root })).ok, true);

  const index = await readFile(path.join(root, 'SKILL.md'), 'utf8');
  const catalog = await readFile(path.join(root, 'catalog.md'), 'utf8');
  assert.match(index, /^---\nname: ecc-skill-catalog\n/m);
  assert.match(index, /no directly visible subject-domain Skill applies/i);
  assert.match(index, /writing or output-format Skill does not replace the subject guide/i);
  assert.match(index, /Pi-hole, BGP, Ktor, Laravel, or ClickHouse/);
  assert.match(index, /skill:\/\/ecc-skill-catalog\/catalog\.md/);
  assert.match(index, /workflow reference or Agent.+not.+subject-domain Skill/iu);
  assert.match(
    index,
    /once this adapter is declared and successfully read.+next exact resource read.+skill:\/\/ecc-skill-catalog\/catalog\.md.+before.+catalog.+(?:checked|loaded)/isu,
  );
  assert.match(index, /smallest matching nested guide/i);
  assert.match(index, /mark it unavailable only after that read fails/i);
  assert.doesNotMatch(index, /Alpha specialist guidance|Zeta specialist guidance/);
  assert.equal(
    index.trimEnd().split('\n').at(-1),
    'ADAPTER HANDOFF (soft): at visible byte 0 declare `RESOURCE EXTENSION | source=skill://ecc-skill-catalog | reads=skill://ecc-skill-catalog/catalog.md`; in that response read only that exact URI, then stop and wait. This is catalog hop 1 of at most 2 and resource extension 1 of at most 3. NOT YET: nested guide, workflow reference, project tool, TODO, task, or answer.',
  );

  assert.ok(catalog.indexOf('`alpha-guide`') < catalog.indexOf('`zeta-guide`'));
  assert.match(catalog, /`alpha-guide` — Alpha specialist guidance\./);
  assert.match(catalog, /`folded-guide` — Folded specialist guidance\./);
  assert.match(catalog, /`gget` — Genomics lookup guidance\./);
  assert.match(catalog, /`skill:\/\/ecc-skill-catalog\/scientific-pkg-gget\/SKILL\.md`/);
  assert.doesNotMatch(catalog, /`skill:\/\/ecc-skill-catalog\/gget\/SKILL\.md`/);
  assert.match(catalog, /`skill:\/\/ecc-skill-catalog\/alpha-guide\/SKILL\.md`/);
  assert.match(catalog, /`zeta-guide` — Zeta specialist guidance\./);
  assert.equal(
    catalog.trimEnd().split('\n').at(-1),
    'CATALOG HANDOFF (soft): at visible byte 0 declare `RESOURCE EXTENSION | source=skill://ecc-skill-catalog/catalog.md | reads=<smallest-matching-exact-nested-skill-uri>`; in that response read only that one catalog-listed exact URI, then stop and wait. This is catalog hop 2 of at most 2 and resource extension 2 of at most 3; one final linked-method resource batch remains only when that loaded guide explicitly reveals a required exact skill:// URI. Continue declared workflow references only after the guide and any such final resource return; do not start project work yet.',
  );
});

test('ECC catalog generator is exact and detects a stale generated catalog', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'omp-ecc-skill-stale-'));
  await writeNestedSkill(root, 'one-guide', 'First description.');
  await writeEccSkillArtifacts({ skillRoot: root });
  await writeFile(path.join(root, 'catalog.md'), 'stale\n');

  const checked = await checkEccSkillArtifacts({ skillRoot: root });
  assert.equal(checked.ok, false);
  assert.deepEqual(checked.results.filter(({ ok }) => !ok).map(({ name }) => name), ['catalog']);
});

async function writeNestedSkill(root, directory, description, name = directory) {
  const dir = path.join(root, directory);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nPrivate guide body.\n`,
  );
}
