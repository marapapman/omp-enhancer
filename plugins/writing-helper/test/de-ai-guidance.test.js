import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const pluginDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const configDir = join(pluginDir, '..', 'omp-config');

function read(relative) {
  return readFileSync(join(pluginDir, relative), 'utf8');
}

function readConfig(relative) {
  return readFileSync(join(configDir, relative), 'utf8');
}


describe('de-AI guidance content contracts', () => {
  it('covers the strongest structural tells in the English humanizer', () => {
    const en = read('skills/format-humanizer/SKILL.md');
    for (const phrase of [
      '§1 Not X but Y',
      '§2 One-line closers and dramatic fragments',
      '§3 Sayings that sound deep',
      '§4 Staged run-up',
      '§5 Arguing with no one',
      '§6 Forced triads',
      '§8 Dashes as the universal connector',
      '§9 Stacked qualifiers',
      '§13 Overused AI words',
      '§14 Inflated significance',
      '§15 Shallow -ing riders',
      '§16 Sales language',
      '§17 Borrowed authority',
      '§19 Copula avoidance',
      '§20 Bold as decoration',
      '§21 Decorative headings',
      '§23 Chatbot residue',
      '§24 Knowledge-limit disclaimers and guesses',
      '§25 A heading repeated in the first sentence',
      '§26 Writing about the previous version',
      'When not to act',
    ]) {
      assert.ok(en.includes(phrase), `English humanizer should cover: ${phrase}`);
    }
    assert.match(en, /Any listed tell justifies an edit on its first sighting/u);
    assert.doesNotMatch(en, /needs company from other tells/u);
    assert.match(en, /For Chinese text use `zh-format-humanizer`/u);
    assert.match(en, /Signs of AI writing/u);
    assert.match(en, /blader\/humanizer/u);
    assert.doesNotMatch(en, /needless to say|in today's rapidly evolving landscape/iu);
  });

  it('covers the strongest structural tells in the Chinese humanizer', () => {
    const zh = read('skills/zh-format-humanizer/SKILL.md');
    for (const phrase of [
      '否定式对偶',
      '单句收尾与戏剧化短句',
      '貌似深刻的说法',
      '铺垫式开场',
      '与不存在的对手辩论',
      '意义拔高',
      '三连排比',
      '重复句首',
      '叠加限定',
      '被动与主语缺失',
      '对称段落',
      '浅层评述小尾巴',
      '推销语言',
      '借用权威',
      '模糊关联',
      '系动词回避',
      '标题重复正文首句',
      '叙述旧版本',
      '黑体装饰',
      '装饰性标题',
      '聊天残留',
      '知识截止声明与臆测',
      '何时不处理',
      '语义锚点',
    ]) {
      assert.ok(zh.includes(phrase), `Chinese humanizer should cover: ${phrase}`);
    }
    assert.match(zh, /强特征（一次出现即建议修改）/u);
    assert.match(zh, /弱特征（一次出现即建议修改）/u);
    assert.match(zh, /宁可误杀，不可放过/u);
    assert.doesNotMatch(zh, /需在同段落聚集|聚集才构成修改依据/u);
    assert.match(zh, /Signs of AI writing/u);
    assert.match(zh, /blader\/humanizer/u);
    assert.match(zh, /强度分级/u);
    assert.match(zh, /五个最容易残留的结构痕迹：否定式对偶、单句收尾、三连排比、破折号、黑体标签/u);
  });

  it('keeps proposal-only boundaries in both humanizers', () => {
    const en = read('skills/format-humanizer/SKILL.md');
    assert.match(en, /writer child is always proposal-only/iu);
    assert.match(en, /Main\s+(?:retains|owns)\s+permission decisions\s+and actual file changes/iu);
    assert.doesNotMatch(
      en,
      /(?:call|use)[^\n]{0,40}`(?:write|edit)`|write the target file|append[^\n]{0,60}review log/iu,
    );

    const zh = read('skills/zh-format-humanizer/SKILL.md');
    assert.match(zh, /writer 子 Agent 始终只交付建议稿/u);
    assert.match(zh, /Main 保留权限决策\s*和实际文件修改/u);
    assert.doesNotMatch(zh, /调用 `(?:write|edit)`|写入目标文件|追加[^\n]{0,50}review log/u);
    assert.ok(
      zh.includes('用户明确要求科研成果凝练体时，论文发表列举和系统部署收尾是该体例的有意组成，不报告为机械列举或 AI 味。'),
    );
  });

  it('exposes structural de-AI families to writers and checkers in both languages', () => {
    const writer = read('agents/writer.md');
    assert.match(writer, /## Plain Prose/u);
    assert.match(writer, /Any\s+listed tell justifies an edit on its first sighting/iu);
    assert.match(writer, /prefer an over-correction\s+to a miss/iu);
    assert.doesNotMatch(writer, /a weak tell matters only when/iu);
    assert.match(writer, /assigned de-AI Skill body/u);
    assert.doesNotMatch(writer, /format-humanizer/iu);

    const zhWriter = read('agents/zh-writer.md');
    assert.match(zhWriter, /不写否定式对偶/u);
    assert.match(zhWriter, /不写「彰显了」「见证了」这类意义拔高/u);
    assert.match(zhWriter, /不写「希望这对你有帮助」这类聊天残留/u);

    const checker = read('agents/checker.md');
    assert.match(checker, /Do AI writing tells appear here\?/iu);
    assert.match(checker, /first appearance; prefer an over-correction to a miss/iu);
    for (const banned of ['format-humanizer', 'writing-review', 'zh-writing-review', 'zh-writing-polish']) {
      assert.doesNotMatch(checker, new RegExp(banned, 'iu'), `checker must not advertise ${banned}`);
    }

    const zhChecker = read('agents/zh-checker.md');
    assert.match(zhChecker, /结构性 AI 痕迹：否定式对偶、单句收尾、三连排比、破折号、黑体装饰、意义拔高、借用权威/u);
    assert.doesNotMatch(zhChecker, /zh-format-humanizer/iu);
  });

  it('wires the strength doctrine into the checker and reviewer Skills', () => {
    const checkers = read('skills/writing-checkers/SKILL.md');
    assert.match(checkers, /9\. \*\*Flag AI writing tells with evidence\.\*\*/iu);
    assert.match(checkers, /Any listed tell justifies a finding at its first sighting/u);
    assert.doesNotMatch(checkers, /need company from other tells/iu);
    assert.match(checkers, /Do AI writing tells appear \(staged "not X but Y" contrasts/iu);

    const review = read('skills/writing-review/SKILL.md');
    assert.match(review, /Treat AI writing\s+tells as fixable defects/iu);
    assert.match(review, /Any listed tell justifies an edit on its first sighting/iu);
    assert.match(review, /Report which AI-tell families the revision touched/iu);

    const zhCheckers = read('skills/zh-writing-checkers/SKILL.md');
    assert.match(zhCheckers, /#### 结构性特征/u);
    assert.match(zhCheckers, /强特征和弱特征都一次出现即报告/u);
    assert.match(zhCheckers, /否定式对偶和意义拔高是结构问题，证据明确时报告/u);
  });

  it('keeps the Chinese writing norm connected to the graded catalog', () => {
    const plain = read('skills/plain-chinese-writing/SKILL.md');
    assert.match(plain, /### 7\.6 结构性 AI 痕迹/u);
    assert.match(plain, /完整的分级特征清单见 `zh-format-humanizer` 技能/u);
    assert.match(plain, /强特征（一次出现即修改）：否定式对偶/u);
    assert.match(plain, /判断依据是证据，不是词频/u);
  });

  it('routes English de-AI through the writing workflow and Beamer language methods', async () => {
    const { workflowDefinitions } = await import(join(pluginDir, '..', '..', 'scripts', 'workflow-definitions.js'));
    const writingCard = workflowDefinitions.find(({ id }) => id === 'writing');
    assert.ok(writingCard.skills.includes('format-humanizer'), 'writing card must offer the English de-AI method');
    assert.ok(writingCard.skills.includes('zh-format-humanizer'), 'writing card must offer the Chinese de-AI method');
    const writing = read('skills/writing-review/SKILL.md');

    const beamer = readConfig('skills/latex-beamer-slides/SKILL.md');
    const quality = readConfig('skills/latex-beamer-slides/references/beamer-quality.md');
    const storyline = readConfig('skills/slides-storyline/SKILL.md');

    assert.match(
      quality,
      /For English slide text, apply format-humanizer for AI-tell removal and writing-review for page-level clarity when available\./iu,
    );
    assert.match(quality, /Slide copy has its own AI tells:/iu);
    assert.match(quality, /Any listed tell justifies a revision on its first sighting on the page/iu);
    assert.doesNotMatch(quality, /matters only when it clusters/iu);
    assert.match(
      storyline,
      /For English slide text, apply `format-humanizer` for AI-tell removal and `writing-review` for page-level review when Main has declared and supplied them\./iu,
    );
    assert.match(
      beamer,
      /For English, use `format-humanizer` for AI-tell removal and `writing-review` for page-level review\./iu,
    );
    assert.match(
      writing,
      /Treat AI writing\s+tells as fixable defects[\s\S]{0,600}chatbot residue\./iu,
    );
  });

  it('carries the de-AI standard into visual artifact copy guidance', () => {
    const canvas = readConfig('skills/canvas-design/SKILL.md');
    assert.match(canvas, /evidence-based de-AI standard/iu);
    assert.match(canvas, /one-line closers, forced triads/iu);

    const frontend = readConfig('skills/frontend-design/SKILL.md');
    assert.match(frontend, /de-AI standard/iu);
    assert.match(frontend, /generic AI styling/iu);
  });
});
