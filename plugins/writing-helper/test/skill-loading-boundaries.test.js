import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = join(rootDir, 'skills');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function skillEntrypoints() {
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: join(skillsDir, entry.name, 'SKILL.md'),
    }))
    .filter((entry) => existsSync(entry.path));
}

function selfLoadPatterns(name) {
  const ownName = escapeRegExp(name);

  return [
    new RegExp(
      `\\b(?:Main\\s+may\\s+)?load\\s+(?:\\x60)?(?:skill:\\/\\/)?${ownName}(?:\\x60)?\\s+through\\s+the\\s+runtime(?:'s)?\\s+normal\\s+Skill\\s+mechanism`,
      'iu',
    ),
    new RegExp(
      `通过运行时正常的技能加载方式(?:读取|加载)\\s+(?:\\x60)?(?:skill:\\/\\/)?${ownName}(?:\\x60)?`,
      'u',
    ),
  ];
}

describe('writing Skill loading boundaries', () => {
  it('never tells the reader of an already-loaded Skill body to load that Skill again', () => {
    const violations = [];

    for (const entry of skillEntrypoints()) {
      const source = readFileSync(entry.path, 'utf8').replace(/\s+/gu, ' ').trim();

      if (selfLoadPatterns(entry.name).some((pattern) => pattern.test(source))) {
        violations.push(entry.name);
      }
    }

    assert.deepEqual(
      violations,
      [],
      'Skill invocation guidance must describe an already-loaded precondition, not request a self-reread',
    );
  });
});
