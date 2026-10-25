import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(rootDir, path), 'utf8');
const SCOPED_EXEMPTION = '豁免只在科研成果凝练与学术正文生效，且贡献收尾必须写明具体作用对象和范围、量化成效必须有实测和比较基准；其他文体的意义拔高照常报告';

describe('Chinese writing baseline contract', () => {
  it('keeps the two-layer baseline and its scope in the zh-writer agent', () => {
    const source = read('agents/zh-writer.md');

    assert.match(source, /### 书写基线（通用基线 \+ 科研叙述体两层）/u);
    assert.match(source, /#### 通用书写基线（全部中文写作）/u);
    assert.match(source, /#### 科研叙述体（科研成果凝练与学术正文默认）/u);
    assert.match(source, /G1 写规范、自然的书面表达/u);
    assert.match(source, /G2 段首先写问题、对象或任务/u);
    assert.match(source, /G3 动词具体并带方法层级/u);
    assert.match(source, /G4 结果句带数字、量级与比较对象/u);
    assert.match(source, /G5 主语按任务和材料指定/u);
    assert.match(source, /G6 短文案按各自的格式压缩/u);
    assert.doesNotMatch(source, /这条基线默认适用于全部中文写作/u);

    for (let rule = 1; rule <= 11; rule += 1) {
      assert.match(source, new RegExp(`^R${rule} `, 'mu'), `zh-writer must keep rule R${rule}`);
    }
    assert.match(source, /R1 段首先立问题[\s\S]{0,200}针对……的问题/u);
    assert.match(source, /R5 结果句带量化与基准[\s\S]{0,200}结果显示/u);
    assert.match(source, /R6 段末贡献收尾。有证据才写/u);
    assert.match(source, /R9 多项成果连成段落。这一条只在科研文体里生效/u);
    assert.match(source, /三处豁免只在科研成果凝练与学术正文里生效，其他文体不豁免，意义拔高照常报告/u);
  });

  it('keeps six genre cards, including the slide-body card', () => {
    const writer = read('agents/zh-writer.md');
    assert.match(writer, /再从科研成果凝练（对应科研材料与成果陈述）、技术说明、教学讲解、学术正文、幻灯片正文、日常沟通六种文体/u);
    assert.match(writer, /\| 幻灯片正文 \| 每页一个任务，要点条数按内容定，至多 3 条/u);
    assert.match(writer, /科研叙述体只在科研成果凝练与学术正文两行生效/u);

    const profiles = read('skills/plain-chinese-writing/references/style-profiles.md');
    assert.match(profiles, /## 书写基线（通用基线 \+ 科研叙述体两层）/u);
    assert.match(profiles, /\*\*通用书写基线（全部中文写作）\*\*/u);
    assert.match(profiles, /\*\*科研叙述体（科研成果凝练与学术正文默认）\*\*/u);
    assert.match(profiles, /## 幻灯片正文/u);
    assert.match(profiles, /下面 11 条只在科研成果凝练与学术正文两张卡里作为默认写法/u);
    assert.match(profiles, /表格右侧逐字取自用户本人提供的科研材料，属于科研叙述体的对照/u);
  });

  it('keeps the pre-existing phrasing bans alongside the scoped exemptions', () => {
    const source = read('agents/zh-writer.md');

    assert.match(source, /不写否定式对偶/u);
    assert.match(source, /不写排比或预备排比/u);
    assert.match(source, /不写「彰显了」「见证了」这类意义拔高/u);
    assert.match(source, /不写冒号句式/u);
    assert.match(source, /不写每页结构雷同的稿子/u);
    assert.match(source, /段末贡献收尾只在科研成果凝练与学术正文里作为默认写法/u);
    assert.match(source, /标题、图注、标签、按钮按各自的格式约束写，幻灯片正文按「幻灯片正文」卡写/u);
  });

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
    assert.match(humanizer, /意义拔高的豁免只限科研成果凝练与学术正文里有具体作用对象和范围的段末贡献收尾/u);
    assert.match(humanizer, /防副作用原则：去 AI 味不改变通用书写基线/u);
    assert.match(humanizer, /基线不豁免否定式对偶、三连排比、元衔接和节奏对仗收尾/u);

    const checkers = read('skills/zh-writing-checkers/SKILL.md');
    assert.ok(checkers.includes(SCOPED_EXEMPTION), 'checkers must scope the exemption');
    assert.match(checkers, /段末贡献收尾（写明具体作用对象和范围）和带数字、比较对象的量化成效（有实测和比较基准）/u);

    const review = read('skills/zh-writing-review/SKILL.md');
    assert.match(review, /豁免只在科研成果凝练与学术正文生效/u);

    const checker = read('agents/zh-checker.md');
    assert.match(checker, /（技术说明、教学讲解、学术正文、科研成果凝练、幻灯片正文、日常沟通）/u);
    assert.match(checker, /长句只在科研成果凝练与学术正文里按科研叙述体的必要长复句保留/u);
    assert.match(checker, /科研叙述体例外：豁免只在科研成果凝练与学术正文生效/u);
  });

  it('describes the two-layer baseline in the writing workflow card', async () => {
    const { workflowDefinitions } = await import(join(rootDir, '..', '..', 'scripts', 'workflow-definitions.js'));
    const writing = workflowDefinitions.find(({ id }) => id === 'writing');
    const scope = writing.scopeNotes.join(' ');
    const flow = writing.suggestedFlow.join(' ');

    assert.match(scope, /two layers that apply to all Chinese prose and copy/iu);
    assert.match(scope, /research-narrative register that is the default only inside the 科研成果凝练 and 学术正文 cards/iu);
    assert.doesNotMatch(scope, /single research-narrative baseline applied to all Chinese prose and copy/iu);
    assert.match(scope, /contribution closers with a named object and scope, quantified effect statements carrying a measured number and a baseline/iu);
    assert.match(scope, /apply only inside the 科研成果凝练 and 学术正文 cards/iu);
    assert.match(scope, /actor that the task or material names as the grammatical subject/iu);
    assert.match(scope, /user-specified subject is never overridden/iu);
    assert.match(scope, /not required to carry all three of problem, method, and result/iu);
    assert.match(scope, /Chinese slide copy follows the 幻灯片正文 card/iu);
    assert.match(scope, /research-narrative register does not apply to slide copy/iu);
    assert.match(flow, /baseline itself is universal across Chinese writing while the research-narrative register activates only for the two research cards/iu);
    assert.doesNotMatch(scope, /standard, natural written Chinese/iu);
  });

  it('names the same baseline in the packaged summary', () => {
    const readme = read('README.md');

    assert.match(readme, /`zh-writer` 默认按通用书写基线写/u);
    assert.match(readme, /六张文体卡/u);
    assert.match(readme, /幻灯片正文卡/u);
  });

  it('does not leave a competing global narrative default in the local zh methods', () => {
    for (const path of [
      'skills/zh-writing-mad-writer/SKILL.md',
      'skills/zh-writing-state-machine/SKILL.md',
      'skills/zh-writing-markdown-helper/SKILL.md',
    ]) {
      const source = read(path);
      assert.match(source, /默认按通用书写基线/u, `${path} must default to the universal baseline`);
      assert.match(source, /只在科研成果凝练与学术正文任务里才用科研叙述体/u, `${path} must scope the register`);
      assert.match(source, /不把简洁当作独立目标/u, `${path} must not keep brevity as a default goal`);
      assert.doesNotMatch(source, /默认按科研叙述体落笔/u, `${path} must not keep the global narrative default`);
      assert.match(source, /（技术说明、教学讲解、学术正文、科研成果凝练、幻灯片正文、日常沟通）/u);
    }
    assert.doesNotMatch(
      read('skills/zh-writing-markdown-helper/SKILL.md'),
      /用平直、准确的中文。简洁。/u,
    );
  });

  it('scopes the plain-Chinese baseline text and the short prompt', () => {
    const profiles = read('skills/plain-chinese-writing/references/style-profiles.md');
    assert.match(profiles, /豁免只在科研成果凝练与学术正文生效，且贡献收尾必须写明具体作用对象和范围/u);

    const plain = read('skills/plain-chinese-writing/SKILL.md');
    assert.match(plain, /7\. 除科研叙述体规定的问题、方法、结果、贡献推进顺序外，不使用其他模板化结构。/u);
    assert.match(plain, /另有六张文体卡/u);
    assert.match(plain, /通用基线是规范、自然的书面表达，科研材料按科研叙述体/u);
    assert.match(plain, /先按任务文体选基线/u);
    assert.doesNotMatch(plain, /请把下面文字改成平直自然的科研叙述体中文/u);
  });

  it('lets the request or material set the subject, keeping 本人 as a fallback', () => {
    const writer = read('agents/zh-writer.md');
    assert.match(writer, /G5 主语按任务和材料指定[\s\S]{0,160}本人/u);

    const profiles = read('skills/plain-chinese-writing/references/style-profiles.md');
    assert.match(profiles, /用户指定了主语时按用户的指定写/u);

    const plain = read('skills/plain-chinese-writing/SKILL.md');
    assert.match(plain, /主语按任务和材料指定，用户指定就照用/u);
  });

  it('keeps the achievement counterexample out of real bullet syntax', () => {
    const source = read('agents/zh-writer.md');
    const rule = source.match(/^R9 [\s\S]*?(?=^R10 )/mu)?.[0] ?? '';

    assert.ok(rule.length > 0, 'R9 must stay in the baseline');
    assert.doesNotMatch(rule, /^- 第.项/mu);
    assert.match(rule, /反例：先把成果数量当结论报出/u);
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
});
