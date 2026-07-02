import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const expectedSkills = [
  'plain-chinese-writing',
  'pku-chinese-phd-thesis-checker',
  'writing-markdown-helper',
  'writing-state-machine',
  'writing-mad-writer',
  'writing-checkers',
  'writing-review',
  'zh-writing-markdown-helper',
  'zh-writing-state-machine',
  'zh-writing-mad-writer',
  'zh-writing-checkers',
  'zh-writing-review',
  'zh-writing-logic-check',
  'zh-writing-polish',
  'zh-format-humanizer',
  'format-humanizer',
  'format-submission-precheck',
  'format-human-comment-helper',
  'format-markdown2latex',
  'format-latex2markdown',
  'format-template-latex',
  'research-storyline',
  'research-literature',
  'research-relatedwork-summarizer',
  'research-experiment',
  'research-bogus-data',
  'research-phase-navigation',
  'research-socratic',
];

const expectedAgents = ['writer', 'zh-writer', 'checker', 'zh-checker'];

function frontmatterName(markdown) {
  const match = markdown.match(/^---\n(?:.|\n)*?^name:\s*['"]?([^'"\n]+)['"]?\s*$/m);
  return match?.[1]?.trim();
}

describe('bundled frugal-pi writing content', () => {
  it('ships writing skills under their original compatibility names', () => {
    for (const skill of expectedSkills) {
      const skillPath = join(rootDir, 'skills', skill, 'SKILL.md');
      assert.equal(existsSync(skillPath), true, `${skill} should ship as skills/${skill}/SKILL.md`);
      const source = readFileSync(skillPath, 'utf8');
      assert.equal(frontmatterName(source), skill, `${skill} frontmatter name should remain compatible`);
    }
  });

  it('ships writer and checker agents under their original compatibility names', () => {
    for (const agent of expectedAgents) {
      const agentPath = join(rootDir, 'agents', `${agent}.md`);
      assert.equal(existsSync(agentPath), true, `${agent} should ship as agents/${agent}.md`);
      const source = readFileSync(agentPath, 'utf8');
      assert.equal(frontmatterName(source), agent, `${agent} frontmatter name should remain compatible`);
    }
  });

  it('keeps agent skill references compatible with the bundled skill names', () => {
    const writer = readFileSync(join(rootDir, 'agents', 'writer.md'), 'utf8');
    const zhWriter = readFileSync(join(rootDir, 'agents', 'zh-writer.md'), 'utf8');

    assert.match(writer, /`writing-checkers`/);
    assert.match(writer, /`plain-chinese-writing`/);
    assert.match(writer, /Do not use `\/skill` invocations/);
    assert.match(zhWriter, /zh-writing-checkers/);
    assert.match(zhWriter, /zh-writing-polish/);
  });

  it('does not bundle generic documentation or development-planning skills as writing parity', () => {
    assert.equal(existsSync(join(rootDir, 'skills', 'guided-doc-writing')), false);
    assert.equal(existsSync(join(rootDir, 'skills', 'superpowers-writing-plans')), false);
  });
});
