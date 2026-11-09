import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(rootDir, path), 'utf8');
const SCOPED_EXEMPTION = '豁免只在科研成果凝练与学术正文生效，且贡献收尾必须写明具体作用对象和范围、量化成效必须有实测和比较基准；其他文体的意义拔高照常报告';

describe('Chinese writing baseline contract', () => {

  it('keeps the achievement skeleton ordered from problem to contribution', () => {
    const source = read('skills/zh-research-achievement-writing/SKILL.md');

    assert.match(source, /问题或挑战 → 做事者的动作 → 机制 → 结果显示 → 贡献收尾 → 论文成果与部署。/u);
    assert.match(source, /主语落在做事的人或课题上，具体用哪个由任务和材料指定[\s\S]{0,120}个人材料用「本人」/u);
    assert.match(source, /### 2\.5 贡献收尾/u);
    for (const skeleton of [
      '通过引入 X，克服了 Y 的 Z 缺点，提出一种融合 A 与 B 的方法，应用于 C、D 任务。',
      '该方法克服了 Y 的 Z 缺点，降低了 C 和 D 算法的误差。',
      '相关工作发表于 VENUE’YY、VENUE’YY。',
      '基于所研究的 X 算法，开发并部署一种基于 Y 的系统，支持……判断，已部署地点 N 座楼宇。',
    ]) {
      assert.equal(source.includes(skeleton), true, 'achievement skeleton must stay verbatim: ' + skeleton);
    }
  });

  it('scopes the exemptions with evidence in every reviewer surface', () => {
    const humanizer = read('skills/zh-format-humanizer/SKILL.md');
    assert.ok(humanizer.includes(SCOPED_EXEMPTION), 'humanizer must scope the exemption');
    assert.match(humanizer, /基线不豁免否定式对偶、三连排比、元衔接和节奏对仗收尾/u);

    const checkers = read('skills/zh-writing-checkers/SKILL.md');
    assert.ok(checkers.includes(SCOPED_EXEMPTION), 'checkers must scope the exemption');
    assert.match(checkers, /段末贡献收尾（写明具体作用对象和范围）和带数字、比较对象的量化成效（有实测和比较基准）/u);

    const review = read('skills/zh-writing-review/SKILL.md');
    assert.match(review, /豁免只在科研成果凝练与学术正文生效/u);
  });


  it('names the polisher handoff and the removed agents in the packaged summary', () => {
    const readme = read('README.md');

    assert.match(readme, /`polisher` is a tool, not an agent/u);
    assert.match(readme, /Main calls it for every drafted passage and inserts the returned/u);
    assert.match(readme, /the former `writer`, `zh-writer`, `checker`, and `zh-checker` agents are removed/u);
    assert.doesNotMatch(readme, /agents\/(?:writer|zh-writer|checker|zh-checker)\.md/u);
  });



  it('keeps the slide-body figure, table, code, and citation rules', () => {
    const profiles = read('skills/plain-chinese-writing/references/style-profiles.md');
    const card = profiles.match(/## 幻灯片正文[\s\S]*?(?=^## 日常沟通)/mu)?.[0] ?? '';

    assert.ok(card.length > 0, 'the slide-body card must exist');
    assert.match(card, /\*\*图、表、代码与引用\*\*/u);
    assert.match(card, /图内只保留读图必需的信息/u);
    assert.match(card, /解释、过程描述和评价写进正文/u);
    assert.match(card, /表格不写「注：」式补充说明/u);
    assert.match(card, /代码注释只写意图、边界条件和易错点，不复述语句行为/u);
    assert.match(card, /没有非说不可的内容就不写注释/u);
    assert.match(card, /引用只在材料给出确切来源时使用/u);
    assert.match(card, /图、表或代码下补一行来源标注，材料里并没有给出这个出处/u);
  });

  it('pins the bundled paper anchor, its provenance, and every execution rule', () => {
    const prompt = read('polisher/prompt-zh.md');
    const profiles = read('skills/plain-chinese-writing/references/style-profiles.md');
    const excerpts = [
      '摘要(summary)是可复用的程序模块分析结果,能够简要地刻画模块的外部行为.创建摘要和利用摘要开展分析的过程称为摘要分析.',
      '这个摘要本身只是省掉了语法分析的时间.',
    ];

    assert.equal(excerpts.reduce((total, text) => total + [...text].length, 0), 82);

    for (const source of [prompt, profiles]) {
      assert.match(source, /张健、张超、玄跻峰、熊英飞、王千祥、梁彬、李炼、窦文生、陈振邦、陈立前、蔡彦/u);
      assert.match(source, /《程序分析研究进展》/u);
      assert.match(source, /《软件学报》2019，30\(1\)，80–109/u);
      assert.match(source, /DOI 10\.13328\/j\.cnki\.jos\.005651/u);
      assert.match(source, /两处短引文共 82 字符/u);
      assert.match(source, /第 85 页“基于摘要的过程间分析”/u);
      assert.match(source, /第 86 页“自动生成摘要”/u);
      for (const excerpt of excerpts) {
        assert.ok(source.includes(excerpt), 'excerpt must stay verbatim: ' + excerpt);
      }
    }

    for (const source of [prompt, profiles]) {
      for (let rule = 1; rule <= 10; rule += 1) {
        assert.match(source, new RegExp(`^G${rule} \\S`, 'mu'), `G${rule} must exist`);
      }
      assert.doesNotMatch(source, /^G11 /mu);
    }

    const rules = prompt.match(/^G\d+ .+$/gmu) ?? [];
    assert.equal(rules.length, 10);
    for (const rule of rules) assert.ok(profiles.includes(rule), 'Main and polisher must agree on: ' + rule);
    assert.doesNotMatch(prompt, /63 字符|63-character/u);
  });

  it('separates compact contrast from extended examples and keeps the content guard', () => {
    const prompt = read('polisher/prompt-zh.md');
    const profiles = read('skills/plain-chinese-writing/references/style-profiles.md');

    assert.match(prompt, /### 生成与润色对照/u);
    assert.match(prompt, /以下对照由本插件自行编写，不是论文原文/u);
    assert.match(prompt, /本工具仅带压缩对照，不要求每次输出复述例子/u);
    assert.match(prompt, /^\*\*反例\*\*/mu);
    assert.match(prompt, /^\*\*示范\*\*/mu);

    assert.match(profiles, /## 原创风格对照样段/u);
    assert.match(profiles, /本节是插件自行编写的风格练习/u);
    assert.match(profiles, /不冒充论文事实/u);
    for (const section of ['### 概念定义', '### 方法机制', '### 适用边界与比较']) {
      assert.ok(profiles.includes(section), 'extended example must exist: ' + section);
    }
    assert.match(profiles, /\*\*事实设定\*\*/u);
    assert.match(profiles, /\*\*示范样段\*\*/u);
    assert.match(profiles, /\*\*不采用的写法\*\*/u);
    assert.match(profiles, /\*\*参照要点\*\*/u);

    assert.ok(!prompt.includes('结果缓存保存已完成的计算结果，供后续请求复用。'), 'extended examples must stay out of the per-call prompt');
    assert.ok(!prompt.includes('分组过程通过比较记录的键'), 'extended examples must stay out of the per-call prompt');

    for (const source of [prompt, profiles]) {
      assert.match(source, /摘录仅示范定义、句法与说明次序|不冒充论文事实/u);
      assert.match(source, /不将论文的研究对象、事实、人物、工具、数字、引文、编号或判断带入无关任务|不迁移论文中的事实/u);
      assert.match(source, /用户在当前任务明确指定的其他风格优先/u);
      assert.match(source, /局部 Skill 的语言偏好与本基线冲突时以本基线为准|局部文体卡的语言偏好与论文风格冲突时按论文风格执行/u);
    }

    assert.match(prompt, /G6 短文案按各自格式压缩/u);
    assert.match(prompt, /通知保留称呼、时间和需对方做的动作/u);
    assert.match(prompt, /风格锚点不豁免这些禁令，也不授权新增事实/u);
  });

  it('keeps six genre cards and scopes the exemption inside the profile', () => {
    const profiles = read('skills/plain-chinese-writing/references/style-profiles.md');

    assert.match(profiles, /六张文体卡/u);
    for (const card of ['技术说明', '教学讲解', '学术正文', '科研成果凝练', '幻灯片正文', '日常沟通']) {
      assert.match(profiles, new RegExp(`^## ${card}$`, 'mu'), `genre card must exist: ${card}`);
    }
    assert.ok(profiles.includes(SCOPED_EXEMPTION), 'profile must scope the exemption');
    assert.match(profiles, /既有禁令继续有效，否定式对偶、破折号、三连排比、元衔接和节奏对仗/u);
    assert.match(profiles, /标题、图注、标签、按钮和幻灯片保留其篇幅与格式/u);
  });

  it('makes every local Chinese method inherit the paper baseline', () => {
    const methods = [
      'skills/zh-writing-mad-writer/SKILL.md',
      'skills/zh-writing-state-machine/SKILL.md',
      'skills/zh-writing-markdown-helper/SKILL.md',
    ];

    for (const path of methods) {
      const source = read(path);
      assert.match(source, /统一遵循张健等《程序分析研究进展》的风格/u, `${path} must inherit the baseline`);
      assert.match(source, /局部语言偏好不覆盖论文风格/u, `${path} must rank the baseline over the local list`);
      assert.match(source, /用户在当前任务明确指定的其他风格优先/u, `${path} must keep user style first`);
      assert.doesNotMatch(source, /默认按通用书写基线/u, `${path} must not keep the retired universal default`);
      assert.doesNotMatch(source, /只在科研成果凝练与学术正文任务里才用科研叙述体/u);
    }

    const plain = read('skills/plain-chinese-writing/SKILL.md');
    assert.match(plain, /本技能采用张健等《程序分析研究进展》的中文书面风格/u);
    assert.match(plain, /六张文体卡中选择当前用途所需的一张/u);
    assert.match(plain, /请按|按《程序分析研究进展》的中文书面风格处理文字/u);
    assert.doesNotMatch(plain, /请把下面文字改成平直自然的科研叙述体中文/u);
  });

  it('keeps the paper baseline consistent across the packaged surfaces', () => {
    const summary = read('README.md');
    const generated = readFileSync(join(rootDir, '..', 'omp-config', 'skills', 'omp-enhancer-workflows', 'references', 'writing.md'), 'utf8');

    for (const source of [summary, generated]) {
      assert.match(source, /10\.13328\/j\.cnki\.jos\.005651/u, 'DOI must travel with the baseline');
      assert.match(source, /张健等《程序分析研究进展》|Zhang et al\., Recent Progress in Program Analysis/u);
      assert.match(source, /82/u, 'excerpt size must stay in sync');
      assert.doesNotMatch(source, /63 字符|63-character/u);
    }

    assert.match(summary, /原创示范标明为插件自行编写，不冒充论文摘录/u);
    assert.match(summary, /较长的原创样段放在 skills\/plain-chinese-writing\/references\/style-profiles\.md/u);
    assert.match(summary, /不增加每次 polisher 调用的长样段输入/u);
  });
});
