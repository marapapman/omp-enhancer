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
  assert.match(index, /no directly visible OMP Skill adequately matches/i);
  assert.match(index, /Pi-hole, BGP, Ktor, Laravel, or ClickHouse/);
  assert.match(index, /skill:\/\/ecc-skill-catalog\/catalog\.md/);
  assert.match(index, /smallest matching nested guide/i);
  assert.doesNotMatch(index, /Alpha specialist guidance|Zeta specialist guidance/);

  assert.ok(catalog.indexOf('`alpha-guide`') < catalog.indexOf('`zeta-guide`'));
  assert.match(catalog, /`alpha-guide` — Alpha specialist guidance\./);
  assert.match(catalog, /`folded-guide` — Folded specialist guidance\./);
  assert.match(catalog, /`skill:\/\/ecc-skill-catalog\/alpha-guide\/SKILL\.md`/);
  assert.match(catalog, /`zeta-guide` — Zeta specialist guidance\./);
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

async function writeNestedSkill(root, name, description) {
  const dir = path.join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nPrivate guide body.\n`,
  );
}
