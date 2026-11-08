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
      '§3b Neat metaphor that tidies a complex concept',
      '§4 Staged run-up',
      '§5 Arguing with no one',
      '§6 Forced triads',
      '§6b Parallelism and parallelism setup',
      '§8 Dashes as the universal connector',
      '§9 Stacked qualifiers',
      '§13 Overused AI words',
      '§14 Inflated significance',
      '§15 Abstract-restatement echo',
      '§16 Announcer transitions',
      '§17 Rhythm-matched paired-phrase closer',
      '§18 Shallow -ing riders',
      '§19 Sales language',
      '§20 Borrowed authority',
      '§22 Copula avoidance',
      '§23 Bold as decoration',
      '§24 Decorative headings',
      '§26 Chatbot residue',
      '§27 Knowledge-limit disclaimers and guesses',
      '§28 A heading repeated in the first sentence',
      '§29 Writing about the previous version',
      '§30 Didactic cognition directives',
      '§31 Claim-colon skeleton',
      '§32 Slide-scale uniformity',
      '§33 Cross-slide refrain',
      '§34 Caption echo',
      '§38 Anaphoric passive riders',
      '§39 Anaphoric callback clauses',
      'When not to act',
    ]) {
      assert.ok(en.includes(phrase), `English humanizer should cover: ${phrase}`);
    }
    assert.match(en, /a colon is allowed only before an enumeration of three or more items, a definition, a formula, or code/iu);
    assert.match(en, /never a fixed three, and no page is padded to three/iu);
    assert.match(en, /any listed tell justifies an edit on its first sighting/iu);
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
      '顺口比喻',
      '铺垫式开场',
      '与不存在的对手辩论',
      '意义拔高',
      '理解承诺句',
      '抽象复述回声',
      '宣布式过渡',
      '节奏对仗收尾',
      '说教式认知指令',
      '三连排比',
      '排比与预备排比',
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
      '定死',
      '冒号句式',
      '全稿层面',
      '每页结构雷同',
      '跨页重复',
      '图注和标题复述',
      '何时不处理',
      '回指被动尾句',
      '回指回扣小句',
      '语义锚点',
    ]) {
      assert.ok(zh.includes(phrase), `Chinese humanizer should cover: ${phrase}`);
    }
    assert.match(zh, /### S12\. 冒号句式/u);
    assert.match(zh, /### S15\. 回指被动尾句/u);
    assert.match(zh, /清单还要定位句级特征 S13 与 S14 的命中，S15 回指被动尾句同样在这一层定位/u);
    assert.match(zh, /纯重复归 S13，本族只处理带动作或新对象的尾句/u);
    assert.match(zh, /### S16\. 回指回扣小句/u);
    assert.match(zh, /S16 回指回扣小句也在这里定位/u);
    assert.match(zh, /本族只管以「这」「那」「此」起头、只对前面作一次命名或定性的回扣小句/u);
    assert.match(zh, /### G1\. /u);
    assert.match(zh, /### G2\. /u);
    assert.match(zh, /### G3\. /u);
    assert.match(zh, /### G4\. /u);
    assert.match(zh, /冒号只留给三项以上的列举、定义、公式和代码/u);
    assert.match(zh, /条数按内容定，至多 3 条/u);
    assert.match(zh, /deck-census\.mjs/u);
    assert.match(zh, /强特征（一次出现即建议修改）/u);
    assert.match(zh, /弱特征（一次出现即建议修改）/u);
    assert.match(zh, /宁可误杀，不可放过/u);
    assert.doesNotMatch(zh, /需在同段落聚集|聚集才构成修改依据/u);
    assert.match(zh, /Signs of AI writing/u);
    assert.match(zh, /blader\/humanizer/u);
    assert.match(zh, /强度分级/u);
    assert.match(zh, /五个最容易残留的结构痕迹：否定式对偶、单句收尾、三连排比、破折号、黑体标签/u);
  });

  it('keeps the polisher handoff in both humanizers', () => {
    const en = read('skills/format-humanizer/SKILL.md');
    assert.match(en, /`polisher`/u);
    assert.match(en, /(?:Main drafts|drafted by Main|Main's own draft)/iu);
    assert.match(en, /verbatim/iu);
    assert.doesNotMatch(
      en,
      /(?:call|use)[^\n]{0,40}`(?:write|edit)`|write the target file|append[^\n]{0,60}review log/iu,
    );

    const zh = read('skills/zh-format-humanizer/SKILL.md');
    assert.match(zh, /`polisher`/u);
    assert.match(zh, /Main[\s\S]{0,40}(?:起草|撰写)/u);
    assert.match(zh, /原样/u);
    assert.doesNotMatch(zh, /调用 `(?:write|edit)`|写入目标文件|追加[^\n]{0,50}review log/u);
    assert.ok(
      zh.includes('用户明确要求科研成果凝练体时，论文发表列举和系统部署收尾是该体例的有意组成，不报告为机械列举或 AI 味。'),
    );
  });

  it('exposes structural de-AI families to the polisher and the writing methods', () => {
    const enPrompt = read('polisher/prompt-en.md');
    for (const phrase of [
      'contrast-repetition construction',
      'abstract restatement echo',
      'announcer transitions',
      'rhythm-matched paired-phrase closer',
      'didactic cognition directives',
      'forced triads',
      'stacked qualifiers',
      'absolute quantifier',
      'anaphoric passive rider',
      'anaphoric callback clause',
      'colon that splices a label or short claim',
      'caption restate its title',
    ]) {
      assert.ok(enPrompt.includes(phrase), `the polisher prompt should expose: ${phrase}`);
    }

    const zhPrompt = read('polisher/prompt-zh.md');
    for (const phrase of [
      '否定式对偶',
      '顺口比喻',
      '三连排比',
      '回指被动尾句',
      '回指回扣小句',
      '范围词只在原文写明且与依据相符时保留',
      '图注不重复本页标题或要点',
    ]) {
      assert.ok(zhPrompt.includes(phrase), `the polisher prompt should expose: ${phrase}`);
    }

    const enHumanizer = read('skills/format-humanizer/SKILL.md');
    assert.match(enHumanizer, /One task owns one tell family/iu);
    assert.match(enHumanizer, /Scan task/iu);
    assert.match(enHumanizer, /strictly sequential/iu);
    assert.match(enHumanizer, /semantic-anchor check/iu);
    assert.match(enHumanizer, /exactly one tell family/iu);
    assert.doesNotMatch(enHumanizer, /one focused pass/iu);

    const zhHumanizer = read('skills/zh-format-humanizer/SKILL.md');
    assert.match(zhHumanizer, /一类特征一个独立任务/u);
    assert.match(zhHumanizer, /扫描任务/u);
    assert.match(zhHumanizer, /严格串行/u);
    assert.match(zhHumanizer, /语义锚点核查/u);
    assert.match(zhHumanizer, /仅命中一个特征家族/u);
    assert.doesNotMatch(zhHumanizer, /一次聚焦处理/u);
  });

  it('wires the strength doctrine into the review Skills', () => {
    const checkers = read('skills/writing-checkers/SKILL.md');
    assert.match(checkers, /9\. \*\*Flag AI writing tells with evidence\.\*\*/iu);
    assert.match(checkers, /Any listed tell justifies a finding at its first sighting/u);
    assert.match(checkers, /Four sentence-level families carry the same first-sighting rule/u);
    assert.doesNotMatch(checkers, /need company from other tells/iu);
    assert.match(checkers, /Do AI writing tells appear \(staged "not X but Y" contrasts/iu);

    const review = read('skills/writing-review/SKILL.md');
    assert.match(review, /Treat AI writing\s+tells as fixable defects/iu);
    assert.match(review, /Any listed tell justifies\s+an edit\s+on its first sighting/iu);
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
    assert.match(plain, /冒号只留给三项以上的列举、定义、公式、代码/u);
    assert.match(plain, /判断依据是证据，不是词频/u);

    const zhCheckers = read('skills/zh-writing-checkers/SKILL.md');
    assert.match(zhCheckers, /每页结构雷同（要点条数和句式一页接一页不变）/u);
  });

  it('routes English de-AI through the writing workflow and Beamer language methods', async () => {
    const { workflowDefinitions } = await import(join(pluginDir, '..', '..', 'scripts', 'workflow-definitions.js'));
    const writingCard = workflowDefinitions.find(({ id }) => id === 'writing');
    assert.ok(writingCard.skills.includes('format-humanizer'), 'writing card must offer the English de-AI method');
    assert.ok(writingCard.skills.includes('zh-format-humanizer'), 'writing card must offer the Chinese de-AI method');
    const deAiFlowStepIndex = writingCard.suggestedFlow.findIndex((step) => /de-AI/.test(step));
    const scanFlowStepIndex = writingCard.suggestedFlow.findIndex((step) => /writing_ai_scan/.test(step));
    assert.ok(deAiFlowStepIndex !== -1, 'writing card flow must carry an explicit per-rule de-AI step');
    assert.ok(scanFlowStepIndex !== -1, 'writing card flow must call writing_ai_scan after every writing task');
    assert.ok(deAiFlowStepIndex < scanFlowStepIndex, 'de-AI per-family chain must run before the final scan');

    const scanFlowStep = writingCard.suggestedFlow[scanFlowStepIndex];
    assert.match(scanFlowStep, /every completed writing task/iu);
    assert.match(scanFlowStep, /detector=ensemble/iu);
    assert.match(scanFlowStep, /allowNetwork=true/iu);
    assert.match(scanFlowStep, /rerun the scan on the revised text/iu);
    assert.match(scanFlowStep, /before delivery/iu);
    assert.doesNotMatch(scanFlowStep, /before checker review/iu);
    assert.match(scanFlowStep, /`?polisher`?/iu);
    assert.match(
      writingCard.scopeNotes.join(' '),
      /the scan is advisory evidence rather than a gate/iu,
    );
    assert.match(
      writingCard.scopeNotes.join(' '),
      /Every writing task ends with a writing_ai_scan check/iu,
    );

    const deAiFlowStep = writingCard.suggestedFlow[deAiFlowStepIndex];
    assert.match(deAiFlowStep, /one polisher pass per found family/iu);
    assert.match(deAiFlowStep, /strictly sequentially/iu);
    assert.match(deAiFlowStep, /semantic-anchor check/iu);
    assert.match(deAiFlowStep, /All rewriting stays with the polisher and no pass mixes families/u);
    assert.match(deAiFlowStep, /bounded chunks/iu);
    assert.doesNotMatch(deAiFlowStep, /writer|zh-writer|checker/iu);

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
      /Treat AI writing\s+tells as fixable defects[\s\S]{0,900}rhythm-matched paired-phrase closers/iu,
    );
    assert.match(writing, /anaphoric passive riders \(a complete main clause plus a\s+comma and a with \+ object \+ past participle \+ by \+ anaphoric actor adjunct\)/iu);
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
