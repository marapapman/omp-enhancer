import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readSkill(name) {
  const segments = name === 'svg-flowchart' ? ['skills', name] : ['skills', 'ecc', name];
  return readFileSync(join(pluginRoot, ...segments, 'SKILL.md'), 'utf8');
}

function frontmatterDescription(content) {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? '';
  const lines = frontmatter.split('\n');
  const start = lines.findIndex((line) => line.startsWith('description:'));
  if (start === -1) return '';
  const description = [lines[start].slice('description:'.length).trim()];
  for (let index = start + 1; index < lines.length && /^\s+/u.test(lines[index]); index += 1) {
    description.push(lines[index].trim());
  }
  return description.join(' ').replace(/^>-\s*/u, '');
}

function compact(content) {
  return content.replace(/\s+/gu, ' ');
}

test('remaining ECC descriptions use task-local selection instead of hard-trigger language', () => {
  for (const name of ['angular-developer', 'token-budget-advisor', 'vite-patterns', 'svg-flowchart']) {
    const description = frontmatterDescription(readSkill(name));
    assert.match(description, /\bUse (?:only )?(?:when|for)\b/iu, `${name}: positive task-local condition`);
    assert.doesNotMatch(
      description,
      /\b(?:trigger|activate)\s+when\b|\bwhenever\b|\bintercept\b/iu,
      `${name}: description must not act as a hard trigger`,
    );
  }
});

test('token budget advice never pauses an already-scoped response or takes over workflow order', () => {
  const content = compact(readSkill('token-budget-advisor'));
  assert.match(content, /only when the user explicitly asks to compare or choose depth options/iu);
  assert.match(content, /does not precede or replace the committed workflow stages/iu);
  assert.match(content, /already specifies a length or depth[^.]*apply it without another question/iu);
  assert.doesNotMatch(content, /Intercept the response flow/iu);
});

test('frontend slides exposes its packaged preset through one exact resource URI', () => {
  const content = readSkill('frontend-slides');
  const uri = 'skill://ecc-skill-catalog/frontend-slides/STYLE_PRESETS.md';
  assert.match(content, /RESOURCE EXTENSION/iu);
  assert.ok(content.includes(uri));
  assert.doesNotMatch(content, /(?:read|guide in|base from|block in) `STYLE_PRESETS\.md`/iu);
});

test('touched framework guides keep related Skills in the initial plan', () => {
  for (const name of ['angular-developer', 'vite-patterns', 'frontend-slides']) {
    const content = compact(readSkill(name));
    assert.match(content, /compatibility candidates for Main's initial `WORKFLOW PLAN` only/iu, name);
    assert.match(content, /does not select or load them after COMMIT/iu, name);
  }
});

test('remaining effectful ECC guides keep execution under user and native authority', () => {
  const effectful = [
    'angular-developer',
    'frontend-design-direction',
    'ui-to-vue',
    'windows-desktop-e2e',
    'frontend-slides',
    'video-editing',
    'uncloud',
  ];

  for (const name of effectful) {
    assert.match(
      compact(readSkill(name)),
      /explicit user authorization for the exact target and effect plus current native permission/iu,
      `${name}: external effects need exact user and native authority`,
    );
  }

  assert.match(compact(readSkill('angular-developer')), /do not fall back to `npx` automatically/iu);
  assert.match(compact(readSkill('frontend-design-direction')), /does not instruct Main to install another Skill/iu);
  assert.match(compact(readSkill('ui-to-vue')), /do not use `npx` or a global install as an automatic fallback/iu);
  assert.match(compact(readSkill('windows-desktop-e2e')), /installation examples are reference commands, not setup authorization/iu);
  assert.match(compact(readSkill('frontend-slides')), /temporary preview deletion is a separate filesystem effect/iu);
  assert.match(compact(readSkill('video-editing')), /API calls, generated assets, renders, and file writes are separate effects/iu);
  assert.match(compact(readSkill('uncloud')), /deploy, scale, push, context switch, machine or volume mutation, and removal are separate effects/iu);
});
