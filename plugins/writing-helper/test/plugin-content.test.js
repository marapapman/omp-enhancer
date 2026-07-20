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

  it('keeps writer agents proposal-only at both capability and prompt levels', () => {
    const contracts = new Map([
      [
        'writer',
        {
          handoff: /even when\s+the assignment authorizes file mutation[\s\S]{0,180}complete (?:proposed )?(?:replacement|text)|complete (?:proposed )?(?:replacement|text)[\s\S]{0,180}even when\s+the assignment authorizes file mutation/iu,
          owner: /Main (?:retains|owns)[\s\S]{0,140}(?:permission decision|permission)[\s\S]{0,140}(?:actual )?file (?:change|mutation)/iu,
          composedSkills: /composed workflows freeze one shared `skills` list[\s\S]*sibling checkpoints[\s\S]*context, not assignment[\s\S]*Never execute another checkpoint's command[\s\S]{0,160}file effect/iu,
        },
      ],
      [
        'zh-writer',
        {
          handoff: /即使 assignment 授权文件修改[\s\S]{0,120}(?:完整替换文本|完整建议文本|SEARCH\/REPLACE|diff)|(?:完整替换文本|完整建议文本|SEARCH\/REPLACE|diff)[\s\S]{0,120}即使 assignment 授权文件修改/u,
          owner: /Main 保留[\s\S]{0,100}权限决策[\s\S]{0,100}实际文件修改/u,
          composedSkills: /组合工作流会冻结一份共享的 `skills` 列表[\s\S]*同级\s+checkpoint[\s\S]*只提供上下文，不构成任务指派[\s\S]*不得执行其他 checkpoint 的命令[\s\S]{0,100}文件副作用/u,
        },
      ],
    ]);

    for (const [agent, contract] of contracts) {
      const source = readFileSync(join(rootDir, 'agents', `${agent}.md`), 'utf8');
      const tools = (source.match(/^tools:\s*([^\n]+)$/m)?.[1] ?? '')
        .split(',')
        .map((tool) => tool.trim())
        .filter(Boolean);
      assert.deepEqual(tools, ['read', 'grep', 'glob']);
      assert.doesNotMatch(source, /(?:^|,\s*)(?:write|edit)(?:,|$)/m);
      assert.match(source, contract.handoff);
      assert.match(source, contract.owner);
      assert.match(source, contract.composedSkills);
    }
  });

  it('declares only canonical OMP tools for writing agents', () => {
    const expectedTools = new Map([
      ['writer', ['read', 'grep', 'glob']],
      ['zh-writer', ['read', 'grep', 'glob']],
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

  it('puts complete writing proposals and reports in the terminal child delivery', () => {
    const contracts = new Map([
      [
        'writer',
        {
          complete: /complete proposal[\s\S]{0,80}terminal child delivery/iu,
          handoff: /host\s+exposes a terminal handoff[\s\S]{0,100}current handoff schema[\s\S]{0,120}ordinary\s+final response/iu,
          terminal: /not leave the complete\s+proposal only in an earlier\s+ordinary\s+message[\s\S]{0,100}status-only\s+terminal\s+sentence/iu,
        },
      ],
      [
        'checker',
        {
          complete: /complete structured report[\s\S]{0,80}terminal child delivery/iu,
          handoff: /host\s+exposes a terminal handoff[\s\S]{0,100}current handoff schema[\s\S]{0,120}ordinary\s+final response/iu,
          terminal: /not leave the complete\s+report only in an earlier\s+ordinary\s+message[\s\S]{0,100}status-only\s+terminal\s+sentence/iu,
        },
      ],
      [
        'zh-writer',
        {
          complete: /完整建议稿[\s\S]{0,60}终态 child delivery/u,
          handoff: /host 暴露终态 handoff[\s\S]{0,80}当前 schema[\s\S]{0,100}普通 final response/u,
          terminal: /不得只在较早的普通消息中给出完整建议稿[\s\S]{0,80}status-only 句/u,
        },
      ],
      [
        'zh-checker',
        {
          complete: /完整结构化报告[\s\S]{0,60}终态 child delivery/u,
          handoff: /host 暴露终态 handoff[\s\S]{0,80}当前 schema[\s\S]{0,100}普通 final response/u,
          terminal: /不得只在较早的普通消息中给出完整报告[\s\S]{0,80}status-only 句/u,
        },
      ],
    ]);

    for (const [agent, contract] of contracts) {
      const source = readFileSync(join(rootDir, 'agents', `${agent}.md`), 'utf8');
      assert.match(source, contract.complete, `${agent} should put the complete body in terminal delivery`);
      assert.match(source, contract.handoff, `${agent} should use the host handoff or ordinary final response`);
      assert.match(source, contract.terminal, `${agent} should not finish with status-only text`);
      assert.doesNotMatch(
        source,
        /\byield\b|result\.data|type\s*[:=]\s*['"`]?string|JSON schema/iu,
        `${agent} should not hard-code a host handoff payload schema`,
      );
    }

    const checker = readFileSync(join(rootDir, 'agents', 'checker.md'), 'utf8');
    assert.doesNotMatch(
      checker,
      /\bcomment embedded\b|\bembedded comment(?: artifact)?\b|\bcomment artifact\b/iu,
      'checker examples must not imply a source-embedded comment artifact',
    );
    assert.match(checker, /terminal in-band report/iu);
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

  it('keeps Agent Skill use frozen to the parent assignment', () => {
    const staleSecondarySelectors = [
      /## Suggested Skill Workflow/iu,
      /## Available Skills/iu,
      /## 建议技能工作流/u,
      /## 可用技能/u,
      /When a governance fragment recommends skills/iu,
      /Load (?:the )?skills that materially help/iu,
      /Invoke these pi skills/iu,
      /The checker agent can invoke/iu,
      /当治理片段推荐技能时/u,
      /治理片段会推荐技能/u,
      /加载对当前(?:写作任务|审查)有实际帮助的技能/u,
    ];

    for (const agent of expectedAgents) {
      const source = readFileSync(join(rootDir, 'agents', `${agent}.md`), 'utf8');

      assert.match(source, /skills=<verbatim-assignment-value>/u, `${agent} should copy frozen Skill metadata exactly`);
      assert.match(source, /skills-unavailable=<assigned-ids-or-none>/u, `${agent} should report unavailable assigned bodies`);
      assert.match(source, /(?:frozen|冻结)[\s\S]{0,220}(?:Skill|技能)/iu, `${agent} should treat assignment Skills as frozen`);
      assert.match(source, /(?:do not|不得)[\s\S]{0,220}(?:discover|发现)[\s\S]{0,220}(?:select|选择)[\s\S]{0,220}(?:load|加载)[\s\S]{0,220}(?:add|增加)[\s\S]{0,220}(?:replace|替换)[\s\S]{0,220}(?:reread|重读)/iu, `${agent} should prohibit post-READY Skill reselection`);
      assert.match(source, /(?:do\s+not\s+guess|不得猜测)[\s\S]{0,120}(?:Skill|技能)[\s\S]{0,120}(?:URI|path|路径)/iu, `${agent} should not guess unavailable Skill resources`);

      for (const pattern of staleSecondarySelectors) {
        assert.doesNotMatch(source, pattern, `${agent} should not retain a secondary Skill selector or catalog`);
      }
    }
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
    const englishReviewFrontmatter = englishReview.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? '';
    assert.match(
      englishReviewFrontmatter,
      /bounded review, correction, revision, or polish of existing English prose/iu,
    );
    assert.match(
      englishReviewFrontmatter,
      /proposed replacement[^\n]*LaTeX[^\n]*semantic-drift/iu,
    );
    assert.match(englishReview, /review-only\s+request produces findings rather than a rewritten document/i);
    assert.match(englishReview, /Do not append\s+a complete rewritten passage or document/i);
    assert.match(englishReview, /Do not probe `.pi` merely to\s+discover whether a prior report exists/i);
    assert.match(englishReview, /Do not repeat it with a different selector/i);
    assert.match(englishReview, /report at most five material\s+findings/i);
    assert.match(englishReview, /assigned English LaTeX prose polish[\s\S]*first\s+review[\s\S]*then produce/i);
    assert.match(
      englishReview,
      /writer child is always proposal-only[\s\S]*complete proposed text[\s\S]*(?:SEARCH\/REPLACE|unified diff)[\s\S]*Main (?:retains|owns)[\s\S]*actual file changes/iu,
    );
    assert.match(englishReview, /Preserve custom\s+commands and revision markup/i);
    assert.match(englishReview, /writing-checkers[\s\S]*broad whole-document or project-wide argument\s+review/i);
    assert.match(englishReview, /`writing-checkers` is a broad review Skill, not the `checker` Agent/i);
    assert.match(englishReview, /local[\s\S]*Main may independently choose a currently exposed `checker`[\s\S]*semantic drift, logic, and clarity/i);
    assert.match(englishReview, /Reading this Skill prepares a writer assignment[\s\S]*by itself it does not turn\s+Main into the executor/i);
    assert.match(englishReview, /one-pass[\s\S]*never satisfies the independent checker checkpoint/i);
    assert.match(englishReview, /The user need not\s+request delegation explicitly/i);
    assert.match(englishReview, /Target length only bounds the executor method and finding count/iu);
    assert.match(englishReview, /It is not a\s+Main direct-fallback reason/iu);
    assert.match(englishReview, /read-only delivery[\s\S]*(?:an )?integrated final\s+response[\s\S]*coordination overhead[\s\S]*not fallback reasons/iu);
    assert.match(englishReview, /^## Assigned Writer One-Pass Method$/mu);
    assert.match(
      englishReview,
      /Main-side Skill load[\s\S]*writer self-check[\s\S]*broad `writing-checkers` Skill load[\s\S]*not independent-checker execution or\s+evidence/iu,
    );
    assert.match(
      englishReview,
      /Main may declare and[\s\S]*load `writing-checkers` during PLAN[\s\S]*writer child neither loads it/iu,
    );
    assert.match(
      englishReview,
      /This finishes\s+only the writer-child pass; it neither completes the parent workflow nor\s+replaces an independent checker delivery/iu,
    );

    const chineseReview = readFileSync(join(rootDir, 'skills/zh-writing-review/SKILL.md'), 'utf8');
    assert.match(chineseReview, /仅审查任务只返回问题，不改写整篇正文/);
    assert.match(chineseReview, /不附整段或整篇改写稿/);
    assert.match(chineseReview, /不要为了判断报告是否存在而主动探测 `.pi` 目录/);
    assert.match(chineseReview, /`zh-writing-checkers` 是宽范围审查 Skill，不是 `zh-checker` Agent/);
    assert.match(chineseReview, /局部润色[\s\S]*Main 可以从当前暴露的[\s\S]*`zh-checker`[\s\S]*语义漂移、逻辑和清晰度/);
    assert.match(chineseReview, /读取本 Skill 只为准备 writer assignment[\s\S]*仅凭这次读取不会让 Main 成为执行者/);
    assert.match(chineseReview, /单轮方法[\s\S]*不能满足或替代独立 checker[\s\S]*checkpoint/);
    assert.match(chineseReview, /用户无需显式要求委派/);
    assert.match(
      chineseReview,
      /writer 子 Agent 始终只交付建议稿[\s\S]*完整建议文本[\s\S]*(?:SEARCH\/REPLACE|unified diff)[\s\S]*Main 保留[\s\S]*实际文件修改/u,
    );
    assert.match(chineseReview, /^## 受派 Writer 子 Agent 单轮方法$/mu);
    assert.match(
      chineseReview,
      /Main 侧的 Skill 加载[\s\S]*writer 局部自检[\s\S]*`zh-writing-checkers` Skill 加载[\s\S]*不构成独立 checker 的执行或证据/,
    );
    assert.match(chineseReview, /Main 可以在 PLAN 阶段[\s\S]*加载 `zh-writing-checkers`[\s\S]*writer 子 Agent 不自行加载/iu);
    assert.match(chineseReview, /assignment 已包含并加载 `plain-chinese-writing`[\s\S]*不触发额外加载/iu);
    assert.match(
      chineseReview,
      /这只完成 writer 子 Agent 的有界审查；既不完成父级工作流，也不替代独立 checker delivery/,
    );

    const englishEditor = readFileSync(join(rootDir, 'skills/writing-markdown-helper/SKILL.md'), 'utf8');
    assert.match(englishEditor, /Semantic anchors protect their meaning; they do not freeze all surrounding\s+wording/i);
    assert.match(englishEditor, /Compare the complete proposed result with the source once/i);
    assert.doesNotMatch(englishEditor, /For a `\.tex` target/iu);
    const chineseEditor = readFileSync(join(rootDir, 'skills/zh-writing-markdown-helper/SKILL.md'), 'utf8');
    assert.match(chineseEditor, /保留这些锚点不等于冻结其余措辞/);
    assert.match(chineseEditor, /完整建议文本或有界 diff[\s\S]*Main 决定是否写入/u);
  });

  it('keeps every writer-owned writing Skill aligned with proposal-only Agents', () => {
    const english = [
      'skills/writing-review/SKILL.md',
      'skills/writing-markdown-helper/SKILL.md',
      'skills/writing-mad-writer/SKILL.md',
      'skills/writing-state-machine/SKILL.md',
    ];
    const chinese = [
      'skills/zh-writing-review/SKILL.md',
      'skills/zh-writing-polish/SKILL.md',
      'skills/zh-writing-markdown-helper/SKILL.md',
      'skills/zh-writing-mad-writer/SKILL.md',
      'skills/zh-writing-state-machine/SKILL.md',
    ];

    for (const path of english) {
      const source = readFileSync(join(rootDir, path), 'utf8');
      assert.match(source, /writer child is (?:always )?proposal-only/iu, `${path} should state the capability boundary`);
      assert.match(source, /Main\s+(?:retains|owns)\s+permission decisions\s+and actual file changes/iu, `${path} should keep persistence with Main`);
      assert.doesNotMatch(source, /(?:call|use)[^\n]{0,40}`(?:write|edit)`|write the target file|append[^\n]{0,60}review log/iu, `${path} must not direct file mutation`);
    }

    for (const path of chinese) {
      const source = readFileSync(join(rootDir, path), 'utf8');
      assert.match(source, /writer 子 Agent 始终只交付建议稿/u, `${path} 应声明能力边界`);
      assert.match(source, /Main 保留权限决策\s*和实际文件修改/u, `${path} 应把落盘职责留给 Main`);
      assert.doesNotMatch(source, /调用 `(?:write|edit)`|写入目标文件|追加[^\n]{0,50}review log/u, `${path} 不得要求文件修改`);
    }
  });

  it('keeps writer-facing overlays proposal-only and checker reports in-band', () => {
    for (const path of [
      'skills/format-humanizer/SKILL.md',
      'skills/format-human-comment-helper/SKILL.md',
    ]) {
      const source = readFileSync(join(rootDir, path), 'utf8');
      assert.match(source, /writer child is always proposal-only/iu, path);
      assert.match(source, /Main\s+(?:retains|owns)\s+permission decisions\s+and actual file changes/iu, path);
    }

    for (const path of [
      'skills/zh-format-humanizer/SKILL.md',
      'skills/plain-chinese-writing/SKILL.md',
    ]) {
      const source = readFileSync(join(rootDir, path), 'utf8');
      assert.match(source, /writer 子 Agent 始终只交付建议稿/u, path);
      assert.match(source, /Main 保留权限决策\s*和实际文件修改/u, path);
    }

    for (const path of [
      'agents/checker.md',
      'agents/zh-checker.md',
      'skills/writing-checkers/SKILL.md',
      'skills/zh-writing-checkers/SKILL.md',
    ]) {
      const source = readFileSync(join(rootDir, path), 'utf8');
      assert.match(source, /(?:read-only|只读)/iu, path);
      assert.match(source, /(?:final response|最终响应)/iu, path);
      assert.match(
        source,
        /(?:Main|parent Agent|父 Agent)[^\n]*(?:persistence|persist|持久化|落盘|报告文件)/iu,
        `${path} must assign any requested persistence to the parent`,
      );
      assert.doesNotMatch(
        source,
        /(?:Write findings to|Append the finding to|use the permitted report path|写入|追加)[^\n]{0,120}(?:checker_report|报告路径|报告文件)?/iu,
        `${path} must leave report persistence to Main`,
      );
    }
  });

  it('guards generic effectful Skills when composed into a writer assignment', () => {
    const paths = [
      'skills/format-latex2markdown/SKILL.md',
      'skills/format-markdown2latex/SKILL.md',
      'skills/format-submission-precheck/SKILL.md',
      'skills/format-template-latex/SKILL.md',
      'skills/research-bogus-data/SKILL.md',
      'skills/research-experiment/SKILL.md',
      'skills/research-literature/SKILL.md',
      'skills/research-phase-navigation/SKILL.md',
      'skills/research-relatedwork-summarizer/SKILL.md',
      'skills/research-socratic/SKILL.md',
      'skills/research-storyline/SKILL.md',
    ];

    for (const path of paths) {
      const source = readFileSync(join(rootDir, path), 'utf8');
      assert.match(
        source,
        /When this Skill is part of a `writer` or `zh-writer` assignment[\s\S]*proposal-only[\s\S]*runs no command and writes no file[\s\S]*Main or an explicitly capable generic\s+`task` owns authorized effects/iu,
        path,
      );
    }
  });

  it('keeps writing actor boundaries subagent-driven while preserving a safe Main fallback', () => {
    const englishWriter = readFileSync(join(rootDir, 'agents/writer.md'), 'utf8');
    assert.match(englishWriter, /Bounded English writer[\s\S]*LaTeX passages[\s\S]*read-only proposed replacements/i);
    assert.match(englishWriter, /bounded writer-child assignment/i);
    assert.match(englishWriter, /local self-check[\s\S]{0,160}never replaces the independent checker/i);
    assert.match(
      englishWriter,
      /Main owns the parent TODO, checker dispatch, finding disposition, integration, final verification, and user-visible delivery/i,
    );
    assert.match(englishWriter, /assigned Skill body[\s\S]{0,160}never substitutes for the later independent checker Agent delivery/i);
    assert.doesNotMatch(englishWriter, /`writing-markdown-helper`[^\n]*Direct English markdown revision by default/i);
    assert.match(englishWriter, /records? that limitation[\s\S]{0,120}safe direct fallback/i);
    assert.match(englishWriter, /always proposal-only[\s\S]{0,180}complete proposed replacement[\s\S]{0,180}(?:SEARCH\/REPLACE|unified diff)/iu);
    assert.match(englishWriter, /even when\s+the assignment authorizes file mutation[\s\S]{0,180}do not modify project files/iu);
    assert.match(englishWriter, /Main retains[\s\S]{0,140}permission decisions[\s\S]{0,140}actual\s+file changes/iu);
    assert.doesNotMatch(englishWriter, /Apply a targeted edit to the target file/iu);
    assert.doesNotMatch(englishWriter, /Apply targeted edits to an existing file/iu);
    assert.doesNotMatch(englishWriter, /(?:may|can) use `?write`? or `?edit`?/iu);
    assert.match(englishWriter, /tools:\s*read, grep, glob/i);

    const chineseWriter = readFileSync(join(rootDir, 'agents/zh-writer.md'), 'utf8');
    assert.match(chineseWriter, /有界的写作子 Agent 任务/);
    assert.match(chineseWriter, /局部自检[\s\S]{0,80}不能替代由 Main 调度的独立 checker/);
    assert.match(
      chineseWriter,
      /Main 保留父级 TODO、checker 调度、finding disposition、集成、最终验证和面向用户的交付权/,
    );
    assert.match(chineseWriter, /受派 Skill 正文[\s\S]{0,100}不能替代\s*后续独立 checker Agent delivery/);
    assert.doesNotMatch(chineseWriter, /zh-writing-markdown-helper[^\n]*默认直接修改中文 Markdown/);
    assert.match(chineseWriter, /记录该限制[\s\S]{0,80}安全的直接 fallback/);
    assert.match(chineseWriter, /始终只交付建议稿[\s\S]{0,140}完整替换文本[\s\S]{0,140}(?:SEARCH\/REPLACE|unified diff)/u);
    assert.match(chineseWriter, /即使 assignment 授权文件修改[\s\S]{0,120}也不得修改项目文件/u);
    assert.match(chineseWriter, /Main 保留[\s\S]{0,100}权限决策[\s\S]{0,100}实际文件修改/u);
    assert.doesNotMatch(chineseWriter, /4\. 用 edit 写入目标文件/u);
    assert.doesNotMatch(chineseWriter, /检查格式 → 用 edit 写入/u);
    assert.doesNotMatch(chineseWriter, /(?:可以|才可)调用 `?write`? 或 `?edit`?/u);
    assert.match(chineseWriter, /tools:\s*read, grep, glob/i);

    const checkerContracts = [
      {
        path: 'agents/checker.md',
        assignment: /bounded independent checker-child assignment/i,
        readOnly: /remain source-read-only/i,
        ownership:
          /Main owns the parent TODO, finding disposition, repair dispatch, integration, final verification, and user-visible delivery/i,
        fallback: /records? that limitation[\s\S]{0,120}safe direct fallback/i,
        composedSkills: /composed workflows freeze one shared `skills` list[\s\S]*sibling checkpoints[\s\S]*context, not assignment[\s\S]*Never execute another checkpoint's command[\s\S]{0,180}file effect/iu,
      },
      {
        path: 'agents/zh-checker.md',
        assignment: /有界的独立 checker 子 Agent 任务/,
        readOnly: /始终只读源文档/,
        ownership:
          /Main 保留父级 TODO、finding disposition、修复调度、集成、最终验证和面向用户的交付权/,
        fallback: /记录该限制[\s\S]{0,80}安全的直接 fallback/,
        composedSkills: /组合工作流会冻结一份共享的 `skills` 列表[\s\S]*同级\s+checkpoint[\s\S]*只提供上下文，不构成任务指派[\s\S]*不得执行其他 checkpoint 的\s+命令[\s\S]{0,120}文件副作用/u,
      },
    ];
    const mutationOrConversionSkill =
      /(?:writing-review|zh-writing-review|zh-writing-polish|format-humanizer|zh-format-humanizer|format-human-comment-helper|format-latex2markdown|format-markdown2latex|format-template-latex)/i;
    for (const { path, assignment, readOnly, ownership, fallback, composedSkills } of checkerContracts) {
      const source = readFileSync(join(rootDir, path), 'utf8');
      assert.match(source, assignment, `${path} should identify its independent checker-child role`);
      assert.match(source, readOnly, `${path} should remain source-read-only`);
      assert.match(source, ownership, `${path} should return finding authority to Main`);
      assert.match(source, fallback, `${path} should leave unavailable-Agent fallback with Main`);
      assert.match(source, composedSkills, `${path} should scope shared Skills to its review checkpoint`);
      assert.doesNotMatch(
        source,
        mutationOrConversionSkill,
        `${path} must not advertise mutation or conversion Skills`,
      );
    }

    assert.match(englishWriter, /Skill[\s\S]*independent checker Agent delivery/i);
    const englishChecker = readFileSync(join(rootDir, 'agents/checker.md'), 'utf8');
    assert.match(englishChecker, /narrow semantic-drift, logic, and clarity check[\s\S]*broad seven-dimension audit/i);
    assert.match(englishChecker, /use only the mode requested by the parent assignment/i);
    assert.match(englishChecker, /Seven Quality Dimensions[\s\S]*broad-mode assignments only/i);

    const chineseChecker = readFileSync(join(rootDir, 'agents/zh-checker.md'), 'utf8');
    assert.match(chineseChecker, /窄范围的语义漂移、逻辑与清晰度核查[\s\S]*完整七维审查/);
    assert.match(chineseChecker, /只执行父级任务指定的模式/);
    assert.match(chineseChecker, /七个维度[\s\S]*仅用于宽范围模式/);

    const englishMutationSkills = [
      'skills/writing-review/SKILL.md',
      'skills/writing-markdown-helper/SKILL.md',
    ];
    for (const path of englishMutationSkills) {
      const source = readFileSync(join(rootDir, path), 'utf8');
      assert.match(source, /assigned writer child's bounded local method/i, `${path} should identify its executor`);
      assert.match(source, /does not select or dispatch Agents/i, `${path} should not own delegation`);
      assert.match(
        source,
        /writer's local self-check does not replace the independent checker/i,
        `${path} should preserve independent review`,
      );
      assert.match(
        source,
        /Main\s+owns the parent TODO, finding disposition,\s+integration, final verification, and user-visible delivery/i,
        `${path} should preserve Main ownership`,
      );
      assert.match(source, /records?\s+the limitation[\s\S]{0,160}safe direct\s+fallback/i, `${path} should allow safe fallback`);
    }

    const chineseMutationSkills = [
      'skills/zh-writing-review/SKILL.md',
      'skills/zh-writing-polish/SKILL.md',
      'skills/zh-writing-markdown-helper/SKILL.md',
    ];
    for (const path of chineseMutationSkills) {
      const source = readFileSync(join(rootDir, path), 'utf8');
      assert.match(source, /受派写作子 Agent 的有界局部方法/, `${path} 应标明执行者`);
      assert.match(source, /不\s*选择或调度 Agent/, `${path} 不应拥有委派权`);
      assert.match(source, /写作者的局部自检不能替代独立 checker/, `${path} 应保留独立审查`);
      assert.match(
        source,
        /Main 保留父级 TODO、finding disposition、集成、最终验证和面向用户\s*的交付权/,
        `${path} 应保留 Main 的所有权`,
      );
      assert.match(source, /记录该限制[\s\S]{0,100}安全的直接 fallback/, `${path} 应允许安全 fallback`);
    }

    assert.doesNotMatch(
      readFileSync(join(rootDir, 'skills/writing-markdown-helper/SKILL.md'), 'utf8'),
      /without subagents|Default Direct Workflow/i,
    );
    assert.doesNotMatch(
      readFileSync(join(rootDir, 'skills/zh-writing-markdown-helper/SKILL.md'), 'utf8'),
      /默认直接工作流|普通直接工作流/,
    );
  });

  it('keeps plain Chinese writing scoped to a selected writing.zh prose method', () => {
    const source = readFileSync(join(rootDir, 'skills/plain-chinese-writing/SKILL.md'), 'utf8');
    const frontmatter = source.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? '';
    const scope = source.match(/^## 0\. 适用范围\n([\s\S]*?)^---$/mu)?.[1] ?? '';

    assert.match(frontmatter, /用户请求中文 prose deliverable/u);
    assert.match(frontmatter, /Main 已选择工作流 `writing\.zh`，并加载其精确 workflow reference 和本 Skill/u);
    assert.doesNotMatch(source, /选择并加载 `writing\.zh`/u);
    assert.match(scope, /局部方法/u);
    assert.match(scope, /不选择或调度 Agent/u);
    assert.match(scope, /不能替代 writer、checker 或父级编排/u);
    assert.match(scope, /平直、自然/u);
    assert.match(scope, /语义锚点/u);
    assert.doesNotMatch(frontmatter, /所有中文输出/u);
    assert.doesNotMatch(scope, /任何时候，只要输出中文|自动生效|回复用户的中文问题|任何形式的中文内容/u);
  });
});
