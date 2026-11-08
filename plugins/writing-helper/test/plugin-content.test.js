import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const expectedSkills = [
  'plain-chinese-writing',
  'zh-research-achievement-writing',
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

const removedAgents = ['writer', 'zh-writer', 'checker', 'zh-checker'];

const effectfulSkills = [
  'format-latex2markdown',
  'format-markdown2latex',
  'format-submission-precheck',
  'format-template-latex',
  'research-bogus-data',
  'research-experiment',
  'research-literature',
  'research-phase-navigation',
  'research-relatedwork-summarizer',
  'research-socratic',
  'research-storyline',
];

const proseEnglishSkills = [
  'writing-mad-writer',
  'writing-state-machine',
  'writing-markdown-helper',
  'writing-review',
  'format-humanizer',
  'format-human-comment-helper',
];

const proseChineseSkills = [
  'zh-writing-mad-writer',
  'zh-writing-state-machine',
  'zh-writing-markdown-helper',
  'zh-writing-review',
  'zh-writing-polish',
  'zh-format-humanizer',
  'plain-chinese-writing',
  'zh-research-achievement-writing',
];

function read(relative) {
  return readFileSync(join(rootDir, relative), 'utf8');
}

function frontmatterName(markdown) {
  const match = markdown.match(/^---\n(?:.|\n)*?^name:\s*['"]?([^'"\n]+)['"]?\s*$/m);
  return match?.[1]?.trim();
}

function prose(source) {
  return source.replace(/\s+/gu, ' ').trim();
}

// Any skill that produces prose must keep the new actor chain: Main drafts a
// passage, the `polisher` tool rewrites that one passage, and Main inserts the
// returned text verbatim. Removing the polisher tool or the Main-drafts rule
// breaks these assertions.
function assertPolisherOwnership(source, name) {
  const text = prose(source);

  assert.match(text, /`?polisher`?/iu, `${name} must name the polisher tool`);
  assert.match(
    text,
    /(?:Main[\s\S]{0,120}(?:drafts?|writes?|authors?)|drafted by Main|Main's own draft|Main[\s\S]{0,60}(?:起草|撰写))/iu,
    `${name} must make Main the drafter`,
  );
  assert.match(text, /verbatim|原样/iu, `${name} must require verbatim integration`);
}

// Active routing language only. The "former agents are removed" sentences and
// author-voice mentions legitimately contain the old role words.
function assertNoRemovedRoleRouting(source, name) {
  assert.doesNotMatch(
    source,
    /(?:dispatch(?:es)?|delegat(?:e|es)|rout(?:e|es)|hand(?:s)? off)[^.\n]{0,80}`?(?:writer|zh-writer|checker|zh-checker)`?/iu,
    `${name} must not dispatch or route work to a removed role`,
  );
  assert.doesNotMatch(
    source,
    /`?(?:writer|zh-writer|checker|zh-checker)`?[ ]+(?:text[- ]tool|sub-?task)/iu,
    `${name} must not describe a removed role as a text tool or sub-task`,
  );
  assert.doesNotMatch(source, /\bwriter\/zh-writer\b/iu, `${name} must not keep the removed writer pair`);
}

describe('bundled writing content under the polisher architecture', () => {
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
      const source = read(join('skills', skill, 'SKILL.md'));
      const frontmatter = source.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? '';
      assert.match(frontmatter, /description:[\s\S]*Use only when/iu, `${skill} should state its positive trigger`);
      assert.match(frontmatter, /Not for/iu, `${skill} should state its negative boundary`);
    }
  });

  it('ships the polisher prompts and implementation instead of writing agents', () => {
    assert.equal(existsSync(join(rootDir, 'polisher', 'prompt-en.md')), true, 'polisher/prompt-en.md should ship');
    assert.equal(existsSync(join(rootDir, 'polisher', 'prompt-zh.md')), true, 'polisher/prompt-zh.md should ship');
    assert.equal(existsSync(join(rootDir, 'src', 'polisher.js')), true, 'src/polisher.js should ship');

    assert.equal(existsSync(join(rootDir, 'agents')), false, 'the removed agents directory must not ship');
    for (const agent of removedAgents) {
      assert.equal(existsSync(join(rootDir, 'agents', `${agent}.md`)), false, `agents/${agent}.md must be gone`);
    }

    const manifest = JSON.parse(read('package.json'));
    assert.ok(manifest.files.includes('polisher'), 'package files should include the polisher prompts');
    assert.ok(manifest.files.includes('src'), 'package files should include the polisher implementation');
    assert.equal(manifest.files.includes('agents'), false, 'package files must not include agents');
    assert.deepEqual(manifest.pi?.skills, ['./skills']);
    assert.ok(manifest.keywords.includes('polisher'));
  });

  it('keeps the polisher prompts stateless, tool-free, and file-free', () => {
    const en = read('polisher/prompt-en.md');
    assert.match(en, /You have no tools, no files,/iu);
    assert.match(en, /no way to ask questions/iu);
    assert.match(en, /Do not plan work, call anything, or explain what you did/iu);
    assert.doesNotMatch(en, /readFileSync|tool_call|read the (?:file|document)|use the \w+ tool/iu);

    const zh = read('polisher/prompt-zh.md');
    assert.match(zh, /你没有工具、没有文件、没有历史对话/u);
    assert.match(zh, /不要规划工作，不要调用任何东西，不要解释你做了什么/u);
    assert.doesNotMatch(zh, /readFileSync|tool_call|读取文件|调用工具/iu);
  });

  it('keeps the mandatory English prose baseline and preservation rules in the polisher prompt', () => {
    const en = read('polisher/prompt-en.md');

    assert.match(en, /## Preservation/u);
    assert.match(en, /## Information gain/u);
    assert.match(en, /## De-AI rewrite/u);
    assert.match(
      en,
      /Software systems have become more complex, distributed, and increasingly reliant on third-party functionality\./u,
    );
    assert.match(en, /Style target, patterns only\.[\s\S]{0,160}never copy its content, citations, numbers, examples, or claims\./u);
    assert.match(en, /Treat these as fixed anchors and copy them exactly/u);
    assert.match(en, /numbers, units, percentages, dates, versions, and measured conditions/u);
    assert.match(en, /citation markers, reference keys, URLs, file paths, identifiers, and email addresses/u);
    assert.match(en, /Do not add a fact, example, number, citation, name, claim, or conclusion\./u);
    assert.match(en, /Do not soften or strengthen a claim\./u);
    assert.match(en, /Each sentence carries one expressive focus and only what adds a new fact/u);
    assert.match(en, /Keep unique facts, numbers, qualifiers, scope, modality, negation, citations, safety instructions, and reproducibility steps when deleting redundancy\./u);
  });

  it('keeps the mandatory Chinese writing baseline and preservation rules in the polisher prompt', () => {
    const zh = read('polisher/prompt-zh.md');

    assert.match(zh, /## 语义保真/u);
    assert.match(zh, /## 中文书写基线/u);
    assert.match(zh, /## 信息增量/u);
    assert.match(zh, /## 去 AI 味/u);
    for (const rule of ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']) {
      assert.match(zh, new RegExp(`^${rule} `, 'mu'), `the Chinese prompt must keep baseline rule ${rule}`);
    }
    assert.match(zh, /G1 写规范、自然的书面表达/u);
    assert.match(zh, /G4 结果句带数字、量级与比较对象/u);
    assert.match(zh, /不要新增事实、例子、数字、引用、名称、主张或结论/u);
    assert.match(zh, /不要削弱或加强论断/u);
    assert.match(zh, /每句话围绕一个表达重点/u);
  });

  it('carries the full de-AI tell families in both polisher prompts', () => {
    const en = read('polisher/prompt-en.md');
    for (const phrase of [
      'contrast-repetition construction',
      'sentence, clause, or paragraph closer that only restates what came before',
      'abstract restatement echo',
      'announcer transitions',
      'rhythm-matched paired-phrase closer',
      'didactic cognition directives',
      'defensive hedging',
      'absolute quantifier',
      'colon that splices a label or short claim onto a title, bullet, or caption',
      'forced triads',
      'anaphoric passive rider',
      'anaphoric callback clause',
      'Do not give every paragraph or page the same bullet count or sentence shape',
      'Do not repeat one claim or a phrase of six or more words across three or more paragraphs or pages',
      'caption restate its title',
    ]) {
      assert.equal(en.includes(phrase), true, `the English prompt should keep the tell: ${phrase}`);
    }

    const zh = read('polisher/prompt-zh.md');
    for (const phrase of [
      '删否定式对偶',
      '删只作重申的句尾、段尾和段落收束',
      '删抽象复述回声',
      '删宣布式过渡',
      '删节奏对齐的成对短语收尾',
      '删说教认知句',
      '删防御性写作',
      '范围词只在原文写明且与依据相符时保留',
      '删把标签或短判断用冒号拼到标题、要点、图注上的写法',
      '删为凑数凑出的三连排比',
      '删回指被动尾句',
      '删回指回扣小句',
      '不让每段或每页都是同样的要点条数和句式',
      '同一主张或六个字以上的同一说法不在三段或三页以上逐字重复',
      '图注不重复本页标题或要点',
    ]) {
      assert.equal(zh.includes(phrase), true, `the Chinese prompt should keep the tell: ${phrase}`);
    }
  });

  it('wires the polisher implementation to the model role and input bounds', () => {
    const source = read('src/polisher.js');

    assert.match(source, /export const POLISHER_MODEL_ROLE = 'polisher'/u);
    assert.match(source, /export const POLISHER_MAX_INPUT_CHARS = 120_000/u);
    assert.match(source, /new URL\('\.\.\/polisher\/prompt-en\.md', import\.meta\.url\)/u);
    assert.match(source, /new URL\('\.\.\/polisher\/prompt-zh\.md', import\.meta\.url\)/u);
    assert.match(source, /export function loadPolisherPrompt/u);
    assert.match(source, /export function checkPolisherInput/u);
    assert.match(source, /export async function runPolisher/u);
    assert.doesNotMatch(source, /registerTool|readFileSync\([^)]*ctx|agent\b.*dispatch/iu);
  });

  it('keeps every prose-producing Skill on the polisher ownership contract', () => {
    for (const skill of [...proseEnglishSkills, ...proseChineseSkills]) {
      assertPolisherOwnership(read(join('skills', skill, 'SKILL.md')), skill);
    }
  });

  it('guards effectful Skills with Main drafting and polisher rewriting', () => {
    for (const skill of effectfulSkills) {
      const source = read(join('skills', skill, 'SKILL.md'));
      const text = prose(source);

      assert.match(text, /`?polisher`?/iu, `${skill} should name the polisher tool`);
      assert.match(
        text,
        /(?:prose[\s\S]{0,80}(?:drafted by Main|Main drafts?)|Main drafts?[\s\S]{0,120}prose)/iu,
        `${skill} should keep the Main-drafts rule`,
      );
      assert.match(text, /verbatim/iu, `${skill} should require verbatim integration`);
      assert.match(
        text,
        /(?:(?:effects?|file writes?|commands?)[\s\S]{0,100}(?:belong to|are owned by|stay with)[\s\S]{0,60}(?:Main|`?task`?)|(?:Main|`?task`?)[\s\S]{0,100}(?:owns?|retains?|belongs? to|stays? with)[\s\S]{0,60}(?:effects?|files?|writes?|commands?))/iu,
        `${skill} should keep authorized effects with Main or task`,
      );
    }
  });

  it('keeps bundled writing instructions free of removed role routing', () => {
    for (const skill of expectedSkills) {
      assertNoRemovedRoleRouting(read(join('skills', skill, 'SKILL.md')), skill);
    }
  });

  it('keeps bundled writing instructions on canonical OMP tool names', () => {
    for (const skill of expectedSkills) {
      const path = join('skills', skill, 'SKILL.md');
      const source = read(path);
      assert.doesNotMatch(source, /\b(?:web_search_exa|web_fetch_exa)\b/, `${path} names an internal provider tool`);
      assert.doesNotMatch(source, /`(?:find|ls)`/, `${path} names a legacy or unavailable file tool`);
    }
  });

  it('does not bundle generic documentation or development-planning skills as writing parity', () => {
    assert.equal(existsSync(join(rootDir, 'skills', 'guided-doc-writing')), false);
    assert.equal(existsSync(join(rootDir, 'skills', 'superpowers-writing-plans')), false);
  });

  it('preserves semantic anchors and keeps review advisory across English and Chinese workflows', () => {
    for (const skill of [
      'writing-markdown-helper',
      'writing-review',
      'writing-checkers',
      'plain-chinese-writing',
      'zh-research-achievement-writing',
      'zh-writing-polish',
      'zh-writing-review',
      'zh-writing-checkers',
    ]) {
      const source = read(join('skills', skill, 'SKILL.md'));
      assert.match(source, /semantic anchor|语义锚点/i, `${skill} should preserve semantic anchors`);
    }

    for (const skill of ['writing-checkers', 'zh-writing-checkers', 'writing-review', 'zh-writing-review']) {
      const source = read(join('skills', skill, 'SKILL.md'));
      assert.match(source, /read-only|只读/i, `${skill} should support read-only review`);
    }

    const englishReview = read('skills/writing-review/SKILL.md');
    assert.match(englishReview, /review-only request produces findings rather\s+than rewritten prose/i);
    assert.match(englishReview, /Do not append\s+a complete rewritten passage or document/i);
    assert.match(englishReview, /report at most five material\s+findings/i);
    assert.match(englishReview, /Preserve custom\s+commands and revision markup/i);
    assert.match(englishReview, /claims and evidence[\s\S]{0,120}logic and\s+structure second[\s\S]{0,120}sentence and style polish last/iu);
    assert.match(englishReview, /every wording repair goes back through `polisher`/iu);
    assertNoRemovedRoleRouting(englishReview, 'writing-review');

    const chineseReview = read('skills/zh-writing-review/SKILL.md');
    assert.match(chineseReview, /仅审查任务只返回问题，不改写整篇正文/);
    assert.match(chineseReview, /不附整段或整篇改写稿/);
    assertNoRemovedRoleRouting(chineseReview, 'zh-writing-review');

    const englishEditor = read('skills/writing-markdown-helper/SKILL.md');
    assert.match(englishEditor, /Semantic anchors protect their meaning; they do not freeze all surrounding\s+wording/i);
    assert.match(englishEditor, /Compare the complete proposed result with the source once/i);
    assert.doesNotMatch(englishEditor, /For a `\.tex` target/iu);
    const chineseEditor = read('skills/zh-writing-markdown-helper/SKILL.md');
    assert.match(chineseEditor, /保留这些锚点不等于冻结其余措辞/);
  });

  it('keeps the research-achievement skeleton in its dedicated Skill', () => {
    const contract = [
      '通过引入 X，克服了 Y 的 Z 缺点，提出一种融合 A 与 B 的方法，应用于 C、D 任务。',
      '该方法克服了 Y 的 Z 缺点，降低了 C 和 D 算法的误差。',
      '相关工作发表于 VENUE’YY、VENUE’YY。',
      '基于所研究的 X 算法，开发并部署一种基于 Y 的系统，支持……判断，已部署地点 N 座楼宇。',
    ];
    const dedicated = read('skills/zh-research-achievement-writing/SKILL.md');

    assert.match(dedicated, /科研成果凝练体/u);
    for (const phrase of contract) {
      assert.equal(dedicated.includes(phrase), true, 'dedicated Skill should preserve contract phrase: ' + phrase);
    }
    assert.match(dedicated, /没有发表场所或部署证据时，不要补写/u);
    assertPolisherOwnership(dedicated, 'zh-research-achievement-writing');
    assert.doesNotMatch(
      dedicated,
      /记录该限制[\s\S]{0,100}安全的直接 fallback/u,
    );

    for (const skill of ['zh-format-humanizer', 'zh-writing-checkers']) {
      const source = read(join('skills', skill, 'SKILL.md'));
      assert.match(
        source,
        /用户明确要求科研成果凝练体时，论文发表列举和系统部署收尾是该体例的有意组成，不报告为机械列举或 AI 味。/u,
        skill + ' should exempt the requested achievement-summary format',
      );
    }

    assert.doesNotMatch(
      read('skills/plain-chinese-writing/SKILL.md'),
      /通过引入 X，克服了 Y 的 Z 缺点/u,
      'plain-chinese-writing should not own the specialized skeleton',
    );
  });

  it('keeps plain Chinese writing scoped to a selected writing prose method', () => {
    const source = read('skills/plain-chinese-writing/SKILL.md');
    const frontmatter = source.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? '';
    const scope = source.match(/^## 0\. 适用范围\n([\s\S]*?)^---$/mu)?.[1] ?? '';

    assert.match(frontmatter, /用户请求中文 prose deliverable/u);
    assert.match(frontmatter, /Main 已选择工作流 `writing`/u);
    assert.doesNotMatch(source, /选择并加载 `writing`/u);
    assert.match(scope, /局部方法/u);
    assert.match(scope, /平直、自然/u);
    assert.match(scope, /语义锚点/u);
    assert.doesNotMatch(frontmatter, /所有中文输出/u);
    assert.doesNotMatch(scope, /任何时候，只要输出中文|自动生效|回复用户的中文问题|任何形式的中文内容/u);
  });
});
