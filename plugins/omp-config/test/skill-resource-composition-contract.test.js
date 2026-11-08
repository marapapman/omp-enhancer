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

function prose(source) {
  return source.replace(/\s+/gu, ' ').trim();
}

test('effectful writing Add-on Skills route every passage through the polisher tool', () => {
  for (const relative of writingAddonEffectfulEntries) {
    const content = prose(readSkill(relative));

    assert.match(content, /`polisher`/iu, `${relative}: names the polisher tool`);
    assert.match(
      content,
      /Main drafts[\s\S]{0,200}`polisher`[\s\S]{0,160}verbatim/iu,
      `${relative}: Main drafts the text and inserts the polished result verbatim`,
    );
    assert.match(
      content,
      /(?:stateless|reads? no file|calls? no tool)/iu,
      `${relative}: the polisher is a stateless text tool`,
    );
    assert.match(
      content,
      /`task`[\s\S]{0,220}(?:never|must not|does not)[\s\S]{0,100}(?:reword|rewrite|draft|polish|translate|invent|alter)[\s\S]{0,60}(?:copy|text|prose|wording)/iu,
      `${relative}: task never authors or rewords copy`,
    );
    assert.match(
      content,
      /(?:text findings|copy findings|wording findings?|text defects?|copy defects?|text is wrong|text change)[\s\S]{0,200}(?:go(?:es)? back (?:to Main|through)|returns? to|Main drafts)[\s\S]{0,120}`polisher`/iu,
      `${relative}: text findings go back to Main and the polisher`,
    );
  }
});

test('effectful writing Add-on Skills keep their effects with Main or task', () => {
  for (const relative of writingAddonEffectfulEntries) {
    const content = prose(readSkill(relative));

    assert.match(
      content,
      /(?:stay with|belong to|are owned by)[\s\S]{0,60}(?:Main and `?task`?|Main or (?:an )?(?:explicitly capable )?(?:generic )?`?task`?)/iu,
      `${relative}: authorized effects stay with Main or task`,
    );
    assert.match(content, /advisory/iu, `${relative}: review stays advisory`);
    assert.doesNotMatch(
      content,
      /(?:dispatch(?:es)?|delegat(?:e|es)|rout(?:e|es))[^.\n]{0,80}`?(?:writer|zh-writer|checker|zh-checker)`?/iu,
      `${relative}: no routing to a removed role`,
    );
  }
});

test('packaged visual and document skills remain present', () => {
  for (const relative of writingAddonEffectfulEntries) {
    assert.ok(existsSync(join(pluginRoot, 'skills', relative, 'SKILL.md')), relative);
  }
});
