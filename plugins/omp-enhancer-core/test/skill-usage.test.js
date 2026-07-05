import test from 'node:test';
import assert from 'node:assert/strict';

import { validateSkillUsage } from '../src/skill-usage.js';

const requiredWritingSkills = ['plain-chinese-writing', 'zh-writing-polish'];

test('accepts a SKILL_USAGE block that lists every required skill as required and loaded', () => {
  const result = validateSkillUsage({
    requiredSkills: requiredWritingSkills,
    output: [
      '完成。',
      '',
      'SKILL_USAGE',
      'Required:',
      '- plain-chinese-writing',
      '- zh-writing-polish',
      'Loaded:',
      '- plain-chinese-writing',
      '- zh-writing-polish',
    ].join('\n'),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.required, requiredWritingSkills);
  assert.deepEqual(result.loaded, requiredWritingSkills);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.invalid, []);
});

test('rejects output when a required skill is absent from Loaded', () => {
  const result = validateSkillUsage({
    requiredSkills: ['test-driven-development', 'verification-before-completion'],
    output: [
      'SKILL_USAGE',
      'Required:',
      '- test-driven-development',
      '- verification-before-completion',
      'Loaded:',
      '- test-driven-development',
    ].join('\n'),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['verification-before-completion']);
  assert.match(result.message, /verification-before-completion/);
});

test('rejects placeholder skill names instead of treating them as evidence', () => {
  const result = validateSkillUsage({
    requiredSkills: ['plain-chinese-writing'],
    output: [
      'SKILL_USAGE',
      'Required:',
      '- plain-chinese-writing',
      'Loaded:',
      '- <required skill>',
      '- TODO',
    ].join('\n'),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['plain-chinese-writing']);
  assert.deepEqual(result.invalid, ['<required skill>', 'TODO']);
});

test('rejects explicit denial of required skill loading', () => {
  const result = validateSkillUsage({
    requiredSkills: ['plain-chinese-writing'],
    output: [
      'I did not load plain-chinese-writing because the rule is obvious.',
      '',
      'SKILL_USAGE',
      'Required:',
      '- plain-chinese-writing',
      'Loaded:',
      '- plain-chinese-writing',
    ].join('\n'),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.denied, ['plain-chinese-writing']);
  assert.match(result.message, /denied/i);
});

test('accepts read skill evidence when no SKILL_USAGE block is present', () => {
  const result = validateSkillUsage({
    requiredSkills: ['plain-chinese-writing', 'zh-writing-polish'],
    output: '任务完成。',
    loadedSkills: ['skill://plain-chinese-writing', 'zh-writing-polish'],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.loaded, ['plain-chinese-writing', 'zh-writing-polish']);
  assert.deepEqual(result.missing, []);
  assert.match(result.message, /read skill evidence/);
});

test('does not let read skill evidence override explicit denial', () => {
  const result = validateSkillUsage({
    requiredSkills: ['plain-chinese-writing'],
    output: 'I did not load plain-chinese-writing.',
    loadedSkills: ['plain-chinese-writing'],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.denied, ['plain-chinese-writing']);
});

test('merges SKILL_USAGE block entries with read skill evidence', () => {
  const result = validateSkillUsage({
    requiredSkills: ['plain-chinese-writing', 'zh-writing-polish', 'zh-writing-checkers'],
    output: [
      'SKILL_USAGE',
      'Required:',
      '- plain-chinese-writing',
      '- zh-writing-polish',
      '- zh-writing-checkers',
      'Loaded:',
      '- plain-chinese-writing',
    ].join('\n'),
    loadedSkills: ['zh-writing-polish', 'skill://zh-writing-checkers'],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.loaded, ['plain-chinese-writing', 'zh-writing-polish', 'zh-writing-checkers']);
  assert.deepEqual(result.missing, []);
});

test('accepts legacy ECC security skill aliases from read evidence', () => {
  const result = validateSkillUsage({
    requiredSkills: ['security-review', 'security-scan'],
    output: 'Security review complete.',
    loadedSkills: ['skill://ecc-security-review', 'skill://ecc-security-scan'],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.loaded, ['security-review', 'security-scan']);
  assert.deepEqual(result.missing, []);
});

test('accepts legacy ECC security skill aliases in SKILL_USAGE blocks', () => {
  const result = validateSkillUsage({
    requiredSkills: ['security-review', 'security-scan'],
    output: [
      'SKILL_USAGE',
      'Required:',
      '- security-review',
      '- security-scan',
      'Loaded:',
      '- ecc-security-review',
      '- ecc-security-scan',
    ].join('\n'),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.loaded, ['security-review', 'security-scan']);
  assert.deepEqual(result.missing, []);
});

test('ignores fenced code blocks when finding the authoritative SKILL_USAGE block', () => {
  const result = validateSkillUsage({
    requiredSkills: ['plain-chinese-writing'],
    output: [
      'Example only:',
      '```text',
      'SKILL_USAGE',
      'Required:',
      '- plain-chinese-writing',
      'Loaded:',
      '- TODO',
      '```',
      '',
      'SKILL_USAGE',
      'Required:',
      '- plain-chinese-writing',
      'Loaded:',
      '- plain-chinese-writing',
    ].join('\n'),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.loaded, ['plain-chinese-writing']);
  assert.deepEqual(result.invalid, []);
});

test('accepts common model formatting variants for SKILL_USAGE evidence', () => {
  const result = validateSkillUsage({
    requiredSkills: ['plain-chinese-writing', 'zh-writing-polish'],
    output: [
      '最终校验如下：',
      '',
      '### SKILL_USAGE:',
      '**Required Skills:** `skill://plain-chinese-writing`, `skill://zh-writing-polish`',
      '**Loaded Skills:** `skill://plain-chinese-writing`, `skill://zh-writing-polish`',
    ].join('\n'),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.loaded, ['plain-chinese-writing', 'zh-writing-polish']);
  assert.deepEqual(result.missing, []);
});

test('falls back to a fenced final SKILL_USAGE block when no plain-text block exists', () => {
  const result = validateSkillUsage({
    requiredSkills: ['writing-markdown-helper', 'writing-checkers'],
    output: [
      'Final evidence:',
      '```text',
      'SKILL_USAGE:',
      'Required:',
      '- writing-markdown-helper',
      '- writing-checkers',
      'Loaded:',
      '- writing-markdown-helper',
      '- writing-checkers',
      '```',
    ].join('\n'),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.loaded, ['writing-markdown-helper', 'writing-checkers']);
});

test('accepts unbulleted skill lines after section labels', () => {
  const result = validateSkillUsage({
    requiredSkills: ['test-driven-development', 'verification-before-completion'],
    output: [
      'SKILL_USAGE:',
      'Required:',
      'test-driven-development',
      'verification-before-completion',
      'Loaded:',
      'test-driven-development',
      'verification-before-completion',
    ].join('\n'),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.loaded, ['test-driven-development', 'verification-before-completion']);
});
