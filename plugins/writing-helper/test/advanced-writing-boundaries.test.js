import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function readSkill(name) {
  return readFileSync(join(rootDir, 'skills', name, 'SKILL.md'), 'utf8');
}

function prose(source) {
  return source.replace(/\s+/gu, ' ').trim();
}

const englishSkills = ['writing-mad-writer', 'writing-state-machine'];
const chineseSkills = ['zh-writing-mad-writer', 'zh-writing-state-machine', 'zh-research-achievement-writing'];
const proseContractEnglishSkills = ['writing-review', 'format-humanizer'];
const proseContractChineseSkills = ['zh-writing-review', 'zh-format-humanizer'];

function assertNoAgentAuthoring(source, name) {
  assert.doesNotMatch(
    source,
    /(?:dispatch(?:es)?|delegat(?:e|es)|rout(?:e|es)|hand(?:s)? off)[^.\n]{0,80}`?(?:writer|zh-writer|checker|zh-checker)`?/iu,
    `${name} must not dispatch or route work to a removed role`,
  );
  assert.doesNotMatch(
    source,
    /`?(?:writer|zh-writer|checker|zh-checker)`?[ ]+(?:text[- ]tool|sub-?task)/iu,
    `${name} must not name a removed role as a text tool or sub-task`,
  );
  assert.doesNotMatch(source, /\bwriter\/zh-writer\b/iu, `${name} must not keep the removed writer pair`);
  assert.doesNotMatch(source, /language-matched `?writer`?/iu, `${name} must not route to a language-matched writer role`);
}

describe('advanced writing Skills preserve workflow and effect boundaries', () => {
  it('keeps each writing method with Main drafting and polisher rewriting', () => {
    for (const name of englishSkills) {
      const source = prose(readSkill(name));

      assert.match(source, /`polisher`/u, `${name} should name the polisher tool`);
      assert.match(source, /Main (?:writes|drafts|authors)|Main's[\s\S]{0,20}(?:local method|own draft)/iu, `${name} should make Main the drafter`);
      assert.match(source, /verbatim/iu, `${name} should require verbatim integration`);
      assert.match(
        source,
        /(?:does not|never|nothing here)[^.]{0,80}(?:select|dispatch)[^.]{0,40}(?:agent|another agent)/iu,
        `${name} should keep agent selection out of the method`,
      );
      assert.match(source, /Main retains the parent TODO, integration, final verification, and user-visible delivery/iu, `${name} should preserve Main ownership`);
      assertNoAgentAuthoring(readSkill(name), name);
    }

    for (const name of chineseSkills) {
      const source = prose(readSkill(name));

      assert.match(source, /`polisher`/u, `${name} 应点名 polisher 工具`);
      assert.match(source, /Main[\s\S]{0,60}(?:起草|撰写)/u, `${name} 应由 Main 起草`);
      assert.match(source, /原样/u, `${name} 应要求原样使用返回文本`);
      assert.match(source, /(?:不选择或调度|不调度)[^。]{0,30}(?:Agent|其他 Agent)/u, `${name} 不应接管 Agent 调度`);
      assert.match(source, /Main 保留父级 TODO[、,][\s\S]{0,40}集成[\s\S]{0,20}最终验证[\s\S]{0,20}面向用户的\s*交付权/u, `${name} 应保留 Main 的所有权`);
      assertNoAgentAuthoring(readSkill(name), name);
    }
  });

  it('keeps multidimensional checks local and advisory with a separate read-only review', () => {
    for (const name of englishSkills) {
      const source = prose(readSkill(name));

      assert.match(source, /Main's (?:local )?self-check/iu, `${name} should identify local checking`);
      assert.match(source, /(?:advisory|read-only)/iu, `${name} should keep local checks advisory`);
      assert.match(source, /writing_quality_check/iu, `${name} should name the read-only quality tool`);
      assert.match(source, /writing_logic_check/iu, `${name} should name the read-only logic tool`);
      assert.match(source, /never starts an automatic repair loop or creates a completion gate/iu, `${name} should remain bounded`);
    }

    for (const name of ['zh-writing-mad-writer', 'zh-writing-state-machine']) {
      const source = prose(readSkill(name));

      assert.match(source, /Main 的局部自检/u, `${name} 应标明局部自检`);
      assert.match(source, /建议性|advisory|只读/iu, `${name} 应保持建议性或只读`);
      assert.match(source, /writing_quality_check/u, `${name} 应点名只读核查工具`);
      assert.match(source, /writing_logic_check/u, `${name} 应点名只读核查工具`);
      assert.match(source, /不启动自动修复循环，也不创建完成门禁/u, `${name} 应保持有界性`);
    }

    const achievement = prose(readSkill('zh-research-achievement-writing'));
    assert.match(achievement, /Main 的局部自检/u);
    assert.match(achievement, /不启动自动修复循环，也不创建完成门禁/u);
  });

  it('returns evidence gaps instead of inventing facts or placeholder numbers', () => {
    for (const name of englishSkills) {
      const source = prose(readSkill(name));

      assert.match(source, /Never invent placeholder or fake facts, citations, measurements, or numbers/iu, `${name} should prohibit fabricated evidence`);
      assert.match(source, /When evidence is insufficient, omit or mark the unsupported claim and (?:return the exact evidence gap to Main|record the exact evidence gap as a limitation)/iu, `${name} should return evidence gaps`);
      assert.doesNotMatch(source, /Placeholder Data|BOGUS DATA/iu, `${name} should not prescribe placeholder evidence`);
    }

    for (const name of chineseSkills) {
      const source = prose(readSkill(name));

      assert.match(source, /不得生成占位或虚假的事实、引用、测量结果或数字/u, `${name} 不应伪造证据`);
      assert.match(source, /证据不足时，省略或标明不受支持的主张，并把准确的证据缺口(?:返回给 Main|写入局限说明)/u, `${name} 应返回证据缺口`);
      assert.doesNotMatch(source, /占位数据/u, `${name} 不应规定生成占位证据`);
    }
  });

  it('settles claims and evidence before polishing and bans the strongest tells', () => {
    for (const name of proseContractEnglishSkills) {
      const source = prose(readSkill(name));

      assert.match(source, /claims and evidence(?:\s+plus\s+semantic anchors)? first[\s\S]{0,120}(?:logic and\s+structure second)[\s\S]{0,120}(?:sentence and style polish|style polish)/iu, `${name} should settle logic before style`);
      assert.match(source, /`polisher`/u, `${name} should name the polisher tool`);
      assert.match(source, /(?:Main drafts|drafted by Main|Main's own draft)/iu, `${name} should make Main the drafter`);
      assert.match(source, /verbatim/iu, `${name} should integrate the returned text verbatim`);
      assert.match(source, /review-only request produces findings|findings are advisory|advisory/iu, `${name} should keep review advisory`);

      for (const phrase of [
        'The real question is',
        'A new question is',
        'This raises a deeper question',
        'this is important/significant/transformative',
        'this demonstrates the power/value',
      ]) {
        assert.match(source, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'iu'), `${name} should name ${phrase}`);
      }
      assert.match(
        source,
        /replace(?: them)? with concrete facts|concrete result, scope, or source|stated limitation/iu,
        `${name} should replace hollow claims with evidence or a limitation`,
      );
    }

    for (const name of proseContractChineseSkills) {
      const source = prose(readSkill(name));

      assert.match(source, /先(?:核对|处理)?主张、证据(?:与|和)语义锚点[\s\S]{0,120}(?:再处理(?:论证)?逻辑|逻辑\s*与结构)[\s\S]{0,120}最后进行\s*句子和风格[\s\S]{0,30}润色/u, `${name} 应先处理逻辑再润色`);
      assert.match(source, /`polisher`/u, `${name} 应点名 polisher 工具`);
      assert.match(source, /Main[\s\S]{0,60}(?:起草|撰写)/u, `${name} 应由 Main 起草`);
      assert.match(source, /原样/u, `${name} 应要求原样使用返回文本`);

      for (const phrase of [
        '新的问题是',
        '真正的问题是',
        '这就引出了一个更深的问题',
        '意义重大',
        '具有重要意义',
        '标志着',
        '彰显了',
        '开创了',
      ]) {
        assert.match(source, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'), `${name} 应明确列出 ${phrase}`);
      }
      assert.match(
        source,
        /具体事实、证据、范围或局限[\s\S]{0,180}(?:直接删除|无依据|写明支撑)/u,
        `${name} 应用具体证据替换空洞宣称`,
      );
    }
  });

  it('keeps network use host-authorized and resulting text in Main', () => {
    for (const name of englishSkills) {
      const source = prose(readSkill(name));

      assert.match(source, /Use network access only when the user or host authorizes it and a live network capability is exposed/iu, `${name} should guard network use`);
      assert.match(source, /`polisher`/u, `${name} should keep the polisher step`);
      assert.match(source, /verbatim/iu, `${name} should keep verbatim integration`);
      assert.doesNotMatch(source, /(?:call|use)[^\n]{0,40}`(?:write|edit)`|write the target file|append[^\n]{0,60}review log/iu, `${name} must not instruct file mutation`);
    }

    for (const name of chineseSkills) {
      const source = prose(readSkill(name));

      assert.match(source, /只有用户或 host 授权网络访问且存在实时网络能力时，才使用网络/u, `${name} 应限制网络访问`);
      assert.match(source, /`polisher`/u, `${name} 应保留 polisher 步骤`);
      assert.match(source, /原样/u, `${name} 应要求原样使用返回文本`);
      assert.doesNotMatch(source, /调用 `(?:write|edit)`|写入目标文件|追加[^\n]{0,50}review log/u, `${name} 不得要求文件修改`);
    }
  });

  it('retains the concrete MAD and state-machine writing methods', () => {
    const englishMad = readSkill('writing-mad-writer');
    const chineseMad = readSkill('zh-writing-mad-writer');
    const englishState = readSkill('writing-state-machine');
    const chineseState = readSkill('zh-writing-state-machine');

    assert.match(englishMad, /problem[\s\S]*novelty[\s\S]*depth[\s\S]*logic[\s\S]*clarity[\s\S]*eval[\s\S]*data/iu);
    assert.match(chineseMad, /问题[\s\S]*新颖性[\s\S]*深度[\s\S]*逻辑[\s\S]*清晰度[\s\S]*评估[\s\S]*数据/u);
    assert.match(englishState, /Read[\s\S]*Draft[\s\S]*Self-check[\s\S]*Handoff/iu);
    assert.match(chineseState, /读取[\s\S]*拟稿[\s\S]*自检[\s\S]*交接/u);
  });
});
