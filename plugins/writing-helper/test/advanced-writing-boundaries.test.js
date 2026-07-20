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
const chineseSkills = ['zh-writing-mad-writer', 'zh-writing-state-machine'];

describe('advanced writing Skills preserve workflow and effect boundaries', () => {
  it('keeps each method inside the assigned writer child', () => {
    for (const name of englishSkills) {
      const source = prose(readSkill(name));

      assert.match(source, /after Main selects workflow `writing\.en`, loads its exact workflow reference and this Skill, and dispatches a `writer` child/iu, `${name} should distinguish workflow selection from Skill loading`);
      assert.doesNotMatch(source, /selects and loads `writing\.en`/iu, `${name} must not describe a workflow ID as a Skill load`);
      assert.match(source, /assigned writer child's bounded local method/iu, `${name} should identify its child-local scope`);
      assert.match(source, /does not select or dispatch Agents/iu, `${name} should not take over routing`);
      assert.match(source, /do not recursively (?:fork|spawn|delegate)/iu, `${name} children must not recurse`);
      assert.match(source, /Main retains the parent TODO, integration, final verification, and user-visible delivery/iu, `${name} should preserve Main ownership`);
    }

    for (const name of chineseSkills) {
      const source = prose(readSkill(name));

      assert.match(source, /Main 选择工作流 `writing\.zh`、加载其精确 workflow reference 和本 Skill，再把任务派给 `zh-writer` 子 Agent 后/u, `${name} 应区分工作流选择与 Skill 加载`);
      assert.doesNotMatch(source, /选择并加载 `writing\.zh`/u, `${name} 不应把 workflow ID 写成 Skill load`);
      assert.match(source, /受派 writer 子 Agent 的有界局部方法/u, `${name} 应标明 child-local 范围`);
      assert.match(source, /不选择或调度 Agent/u, `${name} 不应接管路由`);
      assert.match(source, /不要递归 (?:fork|spawn|delegate)/u, `${name} 子 Agent 不应递归委派`);
      assert.match(source, /Main 保留父级 TODO、集成、最终验证和面向用户的交付权/u, `${name} 应保留 Main 的所有权`);
    }
  });

  it('keeps multidimensional checks local and preserves an independent checker delivery', () => {
    for (const name of englishSkills) {
      const source = prose(readSkill(name));

      assert.match(source, /writer-local self-check/iu, `${name} should identify local checking`);
      assert.match(source, /does not satisfy or replace an independent `checker` delivery/iu, `${name} should preserve independent review`);
      assert.match(source, /one bounded local pass; it never starts an automatic repair loop or creates a completion gate/iu, `${name} should remain advisory and bounded`);
    }

    for (const name of chineseSkills) {
      const source = prose(readSkill(name));

      assert.match(source, /writer 局部自检/u, `${name} 应标明局部自检`);
      assert.match(source, /不能满足或替代独立 `zh-checker` delivery/u, `${name} 应保留独立审查`);
      assert.match(source, /一次有界局部处理；不启动自动修复循环，也不创建完成门禁/u, `${name} 应保持建议性和有界性`);
    }
  });

  it('returns evidence gaps instead of inventing facts or placeholder numbers', () => {
    for (const name of englishSkills) {
      const source = prose(readSkill(name));

      assert.match(source, /Never invent placeholder or fake facts, citations, measurements, or numbers/iu, `${name} should prohibit fabricated evidence`);
      assert.match(source, /When evidence is insufficient, omit or mark the unsupported claim and return the exact evidence gap to Main/iu, `${name} should return evidence gaps`);
      assert.doesNotMatch(source, /Placeholder Data|BOGUS DATA/iu, `${name} should not prescribe placeholder evidence`);
    }

    for (const name of chineseSkills) {
      const source = prose(readSkill(name));

      assert.match(source, /不得生成占位或虚假的事实、引用、测量结果或数字/u, `${name} 不应伪造证据`);
      assert.match(source, /证据不足时，省略或标明不受支持的主张，并把准确的证据缺口返回给 Main/u, `${name} 应返回证据缺口`);
      assert.doesNotMatch(source, /占位数据/u, `${name} 不应规定生成占位证据`);
    }
  });

  it('keeps network use host-authorized and every writer method proposal-only', () => {
    for (const name of englishSkills) {
      const source = prose(readSkill(name));

      assert.match(source, /Use network access only when the user or host authorizes it and a live network capability is exposed/iu, `${name} should guard network use`);
      assert.match(source, /writer child is proposal-only.*complete proposed text.*(?:SEARCH\/REPLACE|unified diff)/isu, `${name} should keep effects in-band`);
      assert.match(source, /Main (?:retains|owns).*permission decisions.*actual file changes/isu, `${name} should leave persistence with Main`);
      assert.doesNotMatch(source, /(?:call|use)[^\n]{0,40}`(?:write|edit)`|write the target file|append[^\n]{0,60}review log/iu, `${name} must not instruct the writer to mutate files`);
    }

    for (const name of chineseSkills) {
      const source = prose(readSkill(name));

      assert.match(source, /只有用户或 host 授权网络访问且存在实时网络能力时，才使用网络/u, `${name} 应限制网络访问`);
      assert.match(source, /writer 子 Agent 始终只交付建议稿.*完整建议文本.*(?:SEARCH\/REPLACE|unified diff)/su, `${name} 应只在会话内交付`);
      assert.match(source, /Main 保留.*权限决策.*实际文件修改/su, `${name} 应把落盘职责留给 Main`);
      assert.doesNotMatch(source, /调用 `(?:write|edit)`|写入目标文件|追加[^\n]{0,50}review log/u, `${name} 不得要求 writer 修改文件`);
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
