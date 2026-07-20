import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function readEccSkill(name) {
  return readFile(path.join(packageRoot, 'skills', 'ecc', name, 'SKILL.md'), 'utf8');
}

test('database examples never imply live connection or mutation authority', async () => {
  for (const name of [
    'database-migrations',
    'mysql-patterns',
    'postgres-patterns',
    'redis-patterns',
  ]) {
    const skill = await readEccSkill(name);
    assert.match(skill, /examples?.+patterns?.+not.+authoriz.+connect.+mutat.+live database/isu, name);
    assert.match(
      skill,
      /authoriz.+edit.+repository.+migration.+configuration.+does not authoriz.+apply.+open.+live connection.+run.+live command/isu,
      name,
    );
    assert.match(skill, /database side effect.+explicit user scope.+native permission/isu, name);
  }
});

test('open-source pipeline selects only currently visible matching Agents with a bounded fallback', async () => {
  const skill = await readEccSkill('opensource-pipeline');

  assert.match(
    skill,
    /named specialist.+only when.+dynamic Available Agents.+exact name.+visible.+matching.+complete safe assignment/isu,
  );
  assert.match(
    skill,
    /otherwise Main chooses.+native `task`.+direct fallback.+concrete.+availability.+capacity.+safety.+reason/isu,
  );
  assert.match(skill, /no fixed Agent identity.+router.+gate/isu);

  for (const name of [
    'ecc-opensource-forker',
    'ecc-opensource-sanitizer',
    'ecc-opensource-packager',
    'reviewer',
  ]) {
    assert.match(skill, new RegExp(`(?:when|if)[^\\n]{0,180}${name}[^\\n]{0,180}(?:visible|exposed)`, 'iu'), name);
  }
});
