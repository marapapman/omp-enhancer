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

  it('makes conversion and template Skill exclusions visible during Skill selection', () => {
    for (const skill of [
      'format-latex2markdown',
      'format-markdown2latex',
      'format-template-latex',
    ]) {
      const source = readFileSync(join(rootDir, 'skills', skill, 'SKILL.md'), 'utf8');
      const frontmatter = source.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? '';
      assert.match(frontmatter, /description:[\s\S]*Use only when/iu, `${skill} should state its positive trigger`);
      assert.match(frontmatter, /Not for/iu, `${skill} should state its negative boundary`);
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

  it('pins writers to the task role and checkers to the slow role', () => {
    const expectedRoles = new Map([
      ['writer', 'task'],
      ['zh-writer', 'task'],
      ['checker', 'slow'],
      ['zh-checker', 'slow'],
    ]);

    for (const [agent, role] of expectedRoles) {
      const source = readFileSync(join(rootDir, 'agents', `${agent}.md`), 'utf8');
      assert.match(source, new RegExp(`model:\\s*\\n\\s*-\\s*pi/${role}(?:\\s|$)`));
      assert.doesNotMatch(source, /^thinkingLevel:/m, `${agent} must inherit reasoning from pi/${role}`);
      if (role === 'task') assert.doesNotMatch(source, /max reasoning|最大推理力度/i);
    }
  });

  it('keeps each writer tool list consistent with its permission text', () => {
    for (const agent of ['writer', 'zh-writer']) {
      const source = readFileSync(join(rootDir, 'agents', `${agent}.md`), 'utf8');
      const tools = source.match(/^tools:\s*([^\n]+)$/m)?.[1] ?? '';
      assert.match(tools, /(?:^|,\s*)write(?:,|$)/);
      assert.match(source, /read[、`,\s]+write[、`,\s]+edit[、`,\s]+grep[、`,\s]+glob/u);
    }
  });

  it('declares only canonical OMP tools for writing agents', () => {
    const expectedTools = new Map([
      ['writer', ['read', 'write', 'edit', 'grep', 'glob']],
      ['zh-writer', ['read', 'write', 'edit', 'grep', 'glob']],
      ['checker', ['read', 'grep', 'glob', 'web_search']],
      ['zh-checker', ['read', 'grep', 'glob', 'web_search']],
    ]);

    for (const [agent, expected] of expectedTools) {
      const source = readFileSync(join(rootDir, 'agents', `${agent}.md`), 'utf8');
      const tools = (source.match(/^tools:\s*([^\n]+)$/m)?.[1] ?? '')
        .split(',')
        .map((tool) => tool.trim())
        .filter(Boolean);
      assert.deepEqual(tools, expected, `${agent} must not rely on ignored or legacy aliases`);
    }
  });

  it('keeps bundled writing instructions on canonical OMP tool names', () => {
    const paths = [
      ...expectedAgents.map((name) => `agents/${name}.md`),
      ...expectedSkills.map((name) => `skills/${name}/SKILL.md`),
    ];

    for (const path of paths) {
      const source = readFileSync(join(rootDir, path), 'utf8');
      assert.doesNotMatch(source, /\b(?:web_search_exa|web_fetch_exa)\b/, `${path} names an internal provider tool`);
      assert.doesNotMatch(source, /`(?:find|ls)`/, `${path} names a legacy or unavailable file tool`);
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

  it('preserves semantic anchors and supports read-only review output across English and Chinese workflows', () => {
    const sources = [
      'agents/writer.md',
      'agents/checker.md',
      'agents/zh-writer.md',
      'agents/zh-checker.md',
      'skills/writing-markdown-helper/SKILL.md',
      'skills/writing-review/SKILL.md',
      'skills/writing-checkers/SKILL.md',
      'skills/plain-chinese-writing/SKILL.md',
      'skills/zh-writing-polish/SKILL.md',
      'skills/zh-writing-review/SKILL.md',
      'skills/zh-writing-checkers/SKILL.md',
    ].map((path) => ({ path, source: readFileSync(join(rootDir, path), 'utf8') }));

    for (const { path, source } of sources) {
      assert.match(source, /semantic anchor|语义锚点/i, `${path} should preserve semantic anchors`);
    }

    for (const path of [
      'agents/checker.md',
      'agents/zh-checker.md',
      'skills/writing-checkers/SKILL.md',
      'skills/zh-writing-checkers/SKILL.md',
    ]) {
      const source = readFileSync(join(rootDir, path), 'utf8');
      assert.match(source, /read-only|只读/i, `${path} should support read-only review`);
      assert.match(source, /final response|最终响应/i, `${path} should return an in-band report`);
    }

    for (const path of ['agents/checker.md', 'agents/zh-checker.md']) {
      const source = readFileSync(join(rootDir, path), 'utf8');
      const tools = source.match(/^tools:\s*([^\n]+)$/m)?.[1] ?? '';
      assert.doesNotMatch(tools, /(?:^|,\s*)write(?:,|$)/, `${path} checker must not have write capability`);
    }

    const englishReview = readFileSync(join(rootDir, 'skills/writing-review/SKILL.md'), 'utf8');
    assert.match(englishReview, /review-only\s+request produces findings rather than a rewritten document/i);
    assert.match(englishReview, /Do not append\s+a complete rewritten passage or document/i);
    assert.match(englishReview, /Do not probe `.pi` merely to\s+discover whether a prior report exists/i);
    assert.match(englishReview, /Do not repeat it with a different selector/i);
    assert.match(englishReview, /report at most five material\s+findings/i);
    assert.match(englishReview, /direct English LaTeX prose polish[\s\S]*first\s+review[\s\S]*then apply/i);
    assert.match(englishReview, /Preserve custom\s+commands and revision markup/i);
    assert.match(englishReview, /writing-checkers[\s\S]*only for a broad whole-document or\s+project-wide argument review/i);

    const chineseReview = readFileSync(join(rootDir, 'skills/zh-writing-review/SKILL.md'), 'utf8');
    assert.match(chineseReview, /仅审查任务只返回问题，不改写整篇正文/);
    assert.match(chineseReview, /不附整段或整篇改写稿/);
    assert.match(chineseReview, /不要为了判断报告是否存在而主动探测 `.pi` 目录/);

    const englishEditor = readFileSync(join(rootDir, 'skills/writing-markdown-helper/SKILL.md'), 'utf8');
    assert.match(englishEditor, /Semantic anchors protect their meaning; they do not freeze all surrounding\s+wording/i);
    assert.match(englishEditor, /Run the single\s+verification read only after a successful edit result/i);
    const chineseEditor = readFileSync(join(rootDir, 'skills/zh-writing-markdown-helper/SKILL.md'), 'utf8');
    assert.match(chineseEditor, /保留这些锚点不等于冻结其余措辞/);
  });
});
