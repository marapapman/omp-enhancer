import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildSkillAliasMapFromRoots,
  parseLoadedSkillEvidence,
  skillNamesEquivalent,
  skillReadNameCandidates,
  validateSkillUsage,
} from '../src/skill-usage.js';

const suggestedWritingSkills = ['plain-chinese-writing', 'zh-writing-polish'];

test('accepts a SKILL_USAGE block that lists every suggested skill as loaded', () => {
  const result = validateSkillUsage({
    suggestedSkills: suggestedWritingSkills,
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
  assert.deepEqual(result.suggested, suggestedWritingSkills);
  assert.deepEqual(result.loaded, suggestedWritingSkills);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.invalid, []);
});

test('reports a suggestion that is absent from Loaded', () => {
  const result = validateSkillUsage({
    suggestedSkills: ['test-driven-development', 'verification-before-completion'],
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
    suggestedSkills: ['plain-chinese-writing'],
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

test('reports explicit denial of suggested skill loading', () => {
  const result = validateSkillUsage({
    suggestedSkills: ['plain-chinese-writing'],
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
  assert.match(result.message, /declined suggested skill loading/i);
});

test('accepts read skill evidence when no SKILL_USAGE block is present', () => {
  const result = validateSkillUsage({
    suggestedSkills: ['plain-chinese-writing', 'zh-writing-polish'],
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
    suggestedSkills: ['plain-chinese-writing'],
    output: 'I did not load plain-chinese-writing.',
    loadedSkills: ['plain-chinese-writing'],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.denied, ['plain-chinese-writing']);
});

test('merges SKILL_USAGE block entries with read skill evidence', () => {
  const result = validateSkillUsage({
    suggestedSkills: ['plain-chinese-writing', 'zh-writing-polish', 'zh-writing-checkers'],
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
    suggestedSkills: ['security-review', 'security-scan'],
    output: 'Security review complete.',
    loadedSkills: ['skill://ecc-security-review', 'skill://ecc-security-scan'],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.loaded, ['security-review', 'security-scan']);
  assert.deepEqual(result.missing, []);
});

test('accepts legacy ECC security skill aliases in SKILL_USAGE blocks', () => {
  const result = validateSkillUsage({
    suggestedSkills: ['security-review', 'security-scan'],
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

test('accepts subagent skills_loaded evidence without a SKILL_USAGE block', () => {
  const result = validateSkillUsage({
    suggestedSkills: ['security-review', 'security-scan'],
    output: [
      '## SUBAGENT_USAGE',
      '```json',
      '{',
      '  "subagent_id": "GateSecurity",',
      '  "skills_loaded": ["ecc-security-review", "ecc-security-scan"],',
      '  "verdict": "complete"',
      '}',
      '```',
    ].join('\n'),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.loaded, ['security-review', 'security-scan']);
  assert.deepEqual(result.missing, []);
});

test('accepts YAML skills_loaded evidence', () => {
  const text = [
    'SUBAGENT_USAGE:',
    '  agent: ecc-security-reviewer',
    '  status: complete',
    '  skills_loaded:',
    '    - ecc-security-review',
    '    - ecc-security-scan',
  ].join('\n');

  assert.deepEqual(parseLoadedSkillEvidence(text), ['ecc-security-review', 'ecc-security-scan']);

  const result = validateSkillUsage({
    suggestedSkills: ['security-review', 'security-scan'],
    output: text,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.loaded, ['security-review', 'security-scan']);
  assert.deepEqual(result.missing, []);
});

test('does not treat missing loaded skills diagnostics as loaded evidence', () => {
  const result = validateSkillUsage({
    suggestedSkills: ['security-review'],
    output: 'Missing loaded skills: security-review',
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.loaded, []);
  assert.deepEqual(result.missing, ['security-review']);
});

test('does not let loose loaded evidence override explicit denial', () => {
  const result = validateSkillUsage({
    suggestedSkills: ['security-review'],
    output: [
      'I did not load security-review.',
      'skills_loaded: [security-review]',
    ].join('\n'),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.loaded, ['security-review']);
  assert.deepEqual(result.denied, ['security-review']);
});

test('accepts generic namespaced aliases without per-skill hardcoding', () => {
  const result = validateSkillUsage({
    suggestedSkills: ['security-review', 'verification-before-completion'],
    output: 'Done.',
    loadedSkills: ['skill://vendor-security-review', 'skill://vendor/verification-before-completion'],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.loaded, ['security-review', 'verification-before-completion']);
  assert.deepEqual(result.missing, []);
});

test('matches canonical and namespaced skills symmetrically', () => {
  assert.equal(skillNamesEquivalent('security-review', 'ecc-security-review'), true);
  assert.equal(skillNamesEquivalent('ecc-security-review', 'security-review'), true);
});

test('does not collapse language-specific writing skills into English skills', () => {
  assert.equal(skillNamesEquivalent('writing-review', 'zh-writing-review'), false);
  assert.equal(skillNamesEquivalent('zh-writing-review', 'writing-review'), false);
  assert.equal(skillNamesEquivalent('writing-markdown-helper', 'zh-writing-markdown-helper'), false);
});

test('suggests installed namespaced read aliases for canonical skills', () => {
  const reviewCandidates = skillReadNameCandidates('security-review');
  const scanCandidates = skillReadNameCandidates('security-scan');

  assert.equal(reviewCandidates[0], 'security-review');
  assert.equal(scanCandidates[0], 'security-scan');
  assert.ok(reviewCandidates.includes('security-review'));
  assert.ok(scanCandidates.includes('security-scan'));
});

test('prefers a packaged exact name over a managed alias', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'omp-skill-priority-'));
  try {
    const packagedRoot = path.join(root, 'packaged');
    const managedRoot = path.join(root, '.omp', 'agent', 'managed-skills');
    writeFixtureSkill(packagedRoot, 'exact-review', 'exact-review');
    writeFixtureSkill(managedRoot, 'vendor-exact-review', 'vendor-exact-review');

    const candidates = skillReadNameCandidates('exact-review', {
      limit: 4,
      roots: [managedRoot, packagedRoot],
    });
    assert.equal(candidates[0], 'exact-review');
    assert.ok(candidates.includes('vendor-exact-review'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejects explicit denial written with a namespaced skill alias', () => {
  const result = validateSkillUsage({
    suggestedSkills: ['security-review'],
    output: [
      'I did not load vendor-security-review because I already know the checklist.',
      '',
      'SKILL_USAGE',
      'Required:',
      '- security-review',
      'Loaded:',
      '- security-review',
    ].join('\n'),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.denied, ['security-review']);
  assert.match(result.message, /declined suggested skill loading/i);
});

test('accepts marketplace skill path aliases discovered from frontmatter', () => {
  const result = validateSkillUsage({
    suggestedSkills: ['gget', 'literature-review', 'pubmed-database'],
    output: 'Done.',
    loadedSkills: [
      'skill://ecc/scientific-pkg-gget',
      'skill://ecc-scientific-thinking-literature-review',
      'skill://ecc/scientific-db-pubmed-database',
    ],
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.loaded, ['gget', 'literature-review', 'pubmed-database']);
  assert.deepEqual(result.missing, []);
});

test('builds unambiguous aliases from every marketplace skill path', async () => {
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const catalog = JSON.parse(await readFile(path.join(repoRoot, '.omp-plugin', 'marketplace.json'), 'utf8'));
  const pluginRoot = catalog.metadata?.pluginRoot ?? '';
  const roots = (catalog.plugins ?? [])
    .filter((plugin) => Array.isArray(plugin.skills) && plugin.skills.length)
    .map((plugin) => path.join(repoRoot, pluginRoot, String(plugin.source ?? plugin.name ?? '').replace(/^\.\//, ''), 'skills'));

  const aliases = buildSkillAliasMapFromRoots(roots);
  const checked = [];

  for (const plugin of catalog.plugins ?? []) {
    const source = String(plugin.source ?? plugin.name ?? '').replace(/^\.\//, '');
    for (const skillPath of plugin.skills ?? []) {
      const skillDir = String(skillPath).replace(/^\.\//, '').replace(/^skills\//, '');
      const skillFile = path.join(repoRoot, pluginRoot, source, 'skills', skillDir, 'SKILL.md');
      const name = skillFrontmatterName(await readFile(skillFile, 'utf8'));
      if (!name) continue;

      checked.push(name);
      assert.equal(skillNamesEquivalent(name, skillDir), true, `${name} should accept ${skillDir}`);
      assert.equal(skillNamesEquivalent(name, skillDir.replace(/\//g, '-')), true, `${name} should accept ${skillDir.replace(/\//g, '-')}`);
      assert.equal(aliases.get(skillDir), name, `${skillDir} should map to ${name}`);
      assert.equal(aliases.get(skillDir.replace(/\//g, '-')), name, `${skillDir.replace(/\//g, '-')} should map to ${name}`);
    }
  }

  assert.ok(checked.length > 250, 'marketplace skill alias coverage should include omp-config and writing-helper skills');
});

test('ignores fenced code blocks when finding the authoritative SKILL_USAGE block', () => {
  const result = validateSkillUsage({
    suggestedSkills: ['plain-chinese-writing'],
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

function skillFrontmatterName(text) {
  const match = String(text).match(/^name:\s*['"]?([^'"\r\n]+)['"]?\s*$/m);
  return match?.[1]?.trim() ?? '';
}

function writeFixtureSkill(root, directory, name) {
  const target = path.join(root, directory);
  mkdirSync(target, { recursive: true });
  writeFileSync(
    path.join(target, 'SKILL.md'),
    `---\nname: ${name}\ndescription: fixture\n---\n`,
    'utf8',
  );
}

test('accepts common model formatting variants for SKILL_USAGE evidence', () => {
  const result = validateSkillUsage({
    suggestedSkills: ['plain-chinese-writing', 'zh-writing-polish'],
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
    suggestedSkills: ['writing-markdown-helper', 'writing-checkers'],
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
    suggestedSkills: ['test-driven-development', 'verification-before-completion'],
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

test('accepts single-line JSON SKILL_USAGE string evidence from plugin agents', () => {
  const result = validateSkillUsage({
    suggestedSkills: ['diagnose'],
    output: JSON.stringify({
      SKILL_USAGE: 'diagnose',
      SUBAGENT_USAGE: 'ecc-silent-failure-hunter',
      assignment: 'Audit silent failure paths.',
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.loaded, ['diagnose']);
  assert.deepEqual(result.missing, []);
});

test('accepts JSON SKILL_USAGE arrays and loaded objects from plugin agents', () => {
  const arrayResult = validateSkillUsage({
    suggestedSkills: ['test-driven-development', 'search-first', 'ai-regression-testing'],
    output: JSON.stringify({
      agent: 'ecc-tdd-guide',
      role: 'TDD Audit',
      SKILL_USAGE: ['test-driven-development', 'search-first', 'ai-regression-testing'],
    }),
  });

  assert.equal(arrayResult.ok, true);
  assert.deepEqual(arrayResult.loaded, ['test-driven-development', 'search-first', 'ai-regression-testing']);

  const objectResult = validateSkillUsage({
    suggestedSkills: ['verification-before-completion'],
    output: JSON.stringify({
      review: 'Bug audit code review',
      SKILL_USAGE: {
        Required: ['verification-before-completion'],
        Loaded: ['verification-before-completion'],
      },
    }),
  });

  assert.equal(objectResult.ok, true);
  assert.deepEqual(objectResult.loaded, ['verification-before-completion']);
});

test('does not treat dispatch assignment suggestedSkills metadata as loaded evidence', () => {
  const result = validateSkillUsage({
    suggestedSkills: ['test-driven-development', 'search-first', 'ai-regression-testing'],
    output: JSON.stringify({
      agent: 'ecc-tdd-guide',
      role: 'TDD Audit',
      assignment: 'Bug audit test coverage guidance.',
      suggestedSkills: ['test-driven-development', 'search-first', 'ai-regression-testing'],
    }),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.loaded, []);
  assert.deepEqual(result.missing, ['test-driven-development', 'search-first', 'ai-regression-testing']);
  assert.match(result.message, /task assignment JSON/);
});

test('accepts SKILL_USAGE blocks nested inside JSON string output envelopes', () => {
  const result = validateSkillUsage({
    suggestedSkills: ['verification-before-completion'],
    output: JSON.stringify({
      agent: 'ecc-code-reviewer',
      result: {
        output: [
          'Review complete.',
          '',
          'SKILL_USAGE',
          'Required:',
          '- verification-before-completion',
          'Loaded:',
          '- verification-before-completion',
        ].join('\n'),
      },
    }),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.loaded, ['verification-before-completion']);
  assert.deepEqual(result.missing, []);
});

test('does not accept SKILL_USAGE examples nested only in assignment JSON fields', () => {
  const result = validateSkillUsage({
    suggestedSkills: ['verification-before-completion'],
    output: JSON.stringify({
      agent: 'ecc-code-reviewer',
      assignment: [
        'Final output must include:',
        'SKILL_USAGE',
        'Required:',
        '- verification-before-completion',
        'Loaded:',
        '- verification-before-completion',
      ].join('\n'),
    }),
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.loaded, []);
  assert.deepEqual(result.missing, ['verification-before-completion']);
});
