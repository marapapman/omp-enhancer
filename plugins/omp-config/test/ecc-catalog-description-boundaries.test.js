import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function descriptionOf(name) {
  const skill = readFileSync(join(pluginRoot, 'skills', 'ecc', name, 'SKILL.md'), 'utf8');
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? '';
  return frontmatter.match(/^description:\s*["']?(.+?)["']?$/mu)?.[1] ?? '';
}

const catalogVisibleSkills = [
  'ck',
  'plankton-code-quality',
  'architecture-decision-records',
  'skill-comply',
];

test('catalog-visible ECC descriptions select task-local capabilities without claiming runtime control', () => {
  for (const name of catalogVisibleSkills) {
    const description = descriptionOf(name);

    assert.match(description, /\bUse when\b/iu, `${name}: description needs an explicit task-local use condition`);
    assert.doesNotMatch(
      description,
      /\bauto(?:matic(?:ally)?|[- ]?(?:loads?|detects?|formats?|generates?|runs?|writes?|fixes?))\b|\b(?:hooks?|sessions?|permissions?|authority|lifecycle)\b|\bruns?\s+agents?\b/iu,
      `${name}: catalog metadata must not imply automatic behavior, lifecycle control, or authority`,
    );
  }
});

test('catalog-visible ECC descriptions retain their useful target capabilities', () => {
  assert.match(descriptionOf('ck'), /Context Keeper.+project memory/iu);
  assert.match(descriptionOf('plankton-code-quality'), /Plankton.+formatting.+linting/iu);
  assert.match(descriptionOf('architecture-decision-records'), /architecture decision records?.+alternatives/iu);
  assert.match(descriptionOf('skill-comply'), /compliance evaluations?.+(?:Skill|rule).+Agent/iu);
});
