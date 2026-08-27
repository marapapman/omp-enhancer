import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const writingAddonEffectfulEntries = [
  'latex-beamer-slides',
  'beamer-to-powerpoint',
  'docx',
  'slides-storyline',
  'frontend-design',
  'canvas-design',
];

function readSkill(relative) {
  return readFileSync(join(pluginRoot, 'skills', relative, 'SKILL.md'), 'utf8');
}

test('effectful writing Add-on Skills preserve proposal-only language writers', () => {
  for (const relative of writingAddonEffectfulEntries) {
    const content = readSkill(relative);

    assert.match(
      content,
      /When this Skill is part of a `writer` or `zh-writer` assignment[\s\S]*proposal-only[\s\S]*runs no command and writes no file[\s\S]*Main or a separate explicitly capable\s+Main-selected Agent owns authorized effects/iu,
      `${relative}: writer actor guard`,
    );
  }
});

test('packaged visual and document skills remain present', () => {
  for (const relative of writingAddonEffectfulEntries) {
    assert.ok(existsSync(join(pluginRoot, 'skills', relative, 'SKILL.md')), relative);
  }
});