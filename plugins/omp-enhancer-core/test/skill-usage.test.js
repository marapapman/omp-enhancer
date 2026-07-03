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
