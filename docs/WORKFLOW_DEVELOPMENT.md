# Workflow Development Guide

本指南说明如何新增或修改 OMP Enhancer 的可选 workflow reference。当前仓库只保留写作、事实核查和视觉三类能力；Beamer/PPT 转换属于 writing 格式 overlay；目录是 advisory reference，不是 router、gate、权限或 completion controller。

## 当前架构

当前 workflow catalog version 44 只有 3 个 ID：`writing`、`research` 和 `visual`。

- `writing`：中英文 prose、翻译、Markdown、LaTeX、Beamer 和 Word；`beamer-to-powerpoint` 是可选的 PPTX 输出分支，在最终已验证的 Beamer visual revision 之后、且仅在 PowerPoint 输出进入 scope 时使用固定外部 `beamer2pptx` Skill/repository（`https://github.com/xdmlxdml/beamer2pptx/tree/main/beamer2pptx`），输入为最终已验证的 Beamer PDF，并在可用时附带对应 `.tex`、宏和字体源；
- `research`：事实核查、claim extraction、来源评估、证据 cross-check 和 verdict；
- `visual`：draw.io、UI/UX、static visual artifact 和 rendered figure review。

定义、校验和渲染位于仓库脚本：

```text
scripts/workflow-definitions.js
scripts/workflow-schema.js
scripts/workflow-render.js
scripts/generate-workflow-catalog.js
```

生成到 `omp-config` 的文件：

```text
plugins/omp-config/assets/WORKFLOW_CATALOG.md
plugins/omp-config/skills/omp-enhancer-workflows/SKILL.md
plugins/omp-config/skills/omp-enhancer-workflows/references/*.md
```

`writing-helper` 和 `omp-fact-checker` 是独立插件；它们不依赖 workflow generator 或其他插件源码。PPT/视觉 Skills 由 `omp-config` 打包，当前包括 `latex-beamer-slides`、`beamer-to-powerpoint`、`slides-storyline`、`frontend-design`、`canvas-design` 和 `docx`（Office 文档统一走 [officecli](https://github.com/iOfficeAI/OfficeCLI) 单二进制：`.docx`/`.xlsx`/`.pptx` 的创建、编辑、校验与渲染）；中文幻灯片文字使用 `writing-helper` 提供的 `plain-chinese-writing`、`zh-format-humanizer`、`zh-writing-review`，需要实际润色时再使用 `zh-writing-polish`。

## Definition 结构

每个 definition 只包含以下字段：

```js
{
  id: 'visual',
  chooseWhen: 'Diagrams (draw.io), UI/UX design, static visual artifacts, or rendered figure review.',
  skills: ['drawio-skill', 'frontend-design', 'canvas-design'],
  catalogSkills: [],
  roles: ['task'],
  suggestedFlow: ['Clarify requirements.', 'Draw once.', 'Review once.', 'Deliver.'],
  scopeNotes: ['Keep review advisory and bounded.'],
}
```

字段规则：

- `id` 全局唯一、稳定、小写；catalog v44 只有 3 个 ID（`writing`、`research`、`visual`）；
- `chooseWhen` 描述用户可观察的选择条件，不写关键词路由规则；
- `skills` 使用精确 Skill frontmatter 名；
- `catalogSkills` 保留为空数组，不产生 nested ECC URI；
- `roles` 是可选候选，不绑定步骤或强制 delegation；
- `suggestedFlow` 和 `scopeNotes` 只提供 advisory 信息，不授予权限。

Schema 会拒绝未知字段、重复 ID、重复资源名、非法标识符和不完整的必填数组。不要恢复 `steps`、`delegation`、`composeWith`、`qualityChecks` 或 `riskNotes`。

## Skill 与 Agent 选择

顶层 Skill 通过 `skill://<name>` exact URI 按需读取。当前没有 `ecc-skill-catalog` 或 nested `C` 候选。Main 根据目标语言、格式、证据要求和视觉输出选择最小 Skill 集；Skill 不自动触发其他 Skill、Agent、命令或文件写入。

`writer`/`zh-writer` 是唯一文字作者，也是专用的语言匹配文本工具（非独立通用 agent）：所有 prose/copy（起草、改写、翻译、标题、正文、caption、label、narrative 和 UI copy）按目标正文语言分别交给英文 `writer` 或中文 `zh-writer`，混合语言分别调度；不存在 Main 直接处理 minor edit 的 fallback。Main 只识别语言、调度文本工具、传递完整约束、原样机械集成返回文本并做最终验收。当前 OMP ExtensionAPI 只暴露 `registerTool`（命令类工具），无插件模型调用 API，这两个文本工具由宿主打包 Agent 文件作为兼容适配器承载，适配器元数据保持不变，也不授予文本工具代码或文件权限。`writer`/`zh-writer` 始终 proposal-only，只返回完整文本或有界 diff；Main 不得改写 proposal。`checker`/`zh-checker` 只交付 report。

### 跨 workflow 的文字边界

`task`、research Agent 和 visual Agent 只负责证据、结构重排、绘图、版式、格式转换和检查，不能替代文本工具或改变文字。PPT/Beamer/Word/PPTX 的布局、转换、OfficeCLI 应用和视觉检查可以由 Main 或 task 完成，但只能机械集成 writer 返回的文案；任何文字变化都返回对应语言的 writer/`zh-writer`。证据收集、结构重排、绘图和版式操作不等于文字起草。该边界是 Agent 协作契约，不是插件 runtime hard router、lifecycle gate、自动重试或 completion controller。

### Writing order and PPT copy boundary

Substantive drafting, logical/semantic revision, translation, and polishing start with a call to the language-matched `writer`/`zh-writer` text tool. Resolve logic and evidence before sentence polish. The tool proposal must precede the `checker`/`zh-checker` report of logic, evidence, and style findings; checker is report-only, substantive repair returns to the same language-matched text tool, and Main performs mechanical integration and final acceptance only. Main, `task`, and checker never rewrite prose. If the matching text tool cannot be safely called, record the limitation rather than silently drafting through another role.

For PPT/Beamer titles, body text, captions, labels, notes, and narrative copy, `writer`/`zh-writer` is the sole text author. `task` remains structural/layout/conversion-only for PPT text and may only place writer-proposed copy, reconcile structure, render, convert, validate, or inspect visuals; any wording change returns to the matching writer.

PPT copy must avoid announcer transitions such as `The real question is`, `A new question is`, `This raises a deeper question`, `Let us turn to`, `新的问题是`, `真正的问题是`, `这就引出了一个更深的问题`, and `接下来我们看`; facts or a concrete dependency carry the transition. It must also avoid hollow unsupported significance claims such as `this is important/significant/transformative`, `this demonstrates the power/value`, `意义重大`, `具有重要意义`, `标志着`, `彰显了`, `开创了`, and `充分说明`. Replace or remove them in favor of concrete evidence, scope, or source; significance/evaluation is allowed only as an evidence-backed exception when that support is stated.
Beamer remains a writing-format overlay, not the visual workflow. New decks use a section-sized, page-by-page text-only draft and user discussion first, persisted in a Markdown content plan that is the canonical content source; Beamer .tex files are derived layout artifacts. Content changes go to Markdown first, require user reconfirmation, and then regenerate Beamer before layout resumes; never edit .tex to settle unresolved content during layout. After the content plan is confirmed, a separate task reconciles the slide order on the plan (no overlap, coherent modules, logical order; unfixable crossings return to Markdown), and only then do visual authoring, per-page imagery, and base layout begin. After the user confirms the basic layout, the existing visual refinement path applies: a single read-only visual precheck is performed by Main or task (never both) after the task's initial render and before the task layout pass; findings are advisory only. Task then integrates and renders the final Beamer revision, which Main reviews read-only as the single review owner (a task that did not produce the revision may review instead). After the final validated Beamer visual revision, when PPTX output is in scope, `beamer-to-powerpoint` uses the fixed external `beamer2pptx` Skill/repository (`https://github.com/xdmlxdml/beamer2pptx/tree/main/beamer2pptx`) with the final validated Beamer PDF and corresponding `.tex`, macro, and font sources when available. One producing `task` converts and binds one current PPTX revision, renders it, and supplies current-revision evidence; one independent read-only reviewer (Main or a task that did not produce the revision) checks the current renders for slide count/order, editability where supported, clipping/overflow, overlap, margins/alignment, hierarchy/fonts, aspect ratio, raster/vector treatment, and fidelity. The producing task may apply at most one bounded layout-only fix to the editable PPTX, preserving visible content, formulas, slide order, and Markdown/Beamer sources, then rerenders fresh evidence for the same reviewer to confirm once. Content or page-structure findings return to the Markdown plan and Beamer regeneration path. This remains advisory and does not create a hard gate, router, permission/completion controller, automatic repair loop, or fallback converter.
The drawio pipeline remains unchanged and separate from Beamer: task draws once; a reviewer that did not draw the revision checks the export read-only; task allows one local fix round.

## 生成目录

修改 definition 或 renderer 后，从仓库根目录运行：

```bash
npm run generate:workflows
npm run check:workflows
```

### 可选真实 OMP E2E

行为矩阵用于验证 OMP 原生执行接口，不代表插件默认注入 TODO、Agent 或执行顺序。工作流 fixture 当前只加载三个 workflow 插件；`volcengine-coding-plan` 的模型 provider 通过单独的 OMP catalog smoke 验证。

```bash
node scripts/e2e/run-installed-workflow.mjs \
  --matrix scripts/e2e/fixtures/workflow-consolidation-installed.json \
  --model <user-chosen> --thinking high \
  --worktree-plugins --repeat 1 \
  --output .omp/e2e-results/workflow-run
```

一次 live run 只是随机行为样本，不能证明稳定提升。涉及外部写入的场景必须使用临时目录或明确 preview，不得为 E2E 自动发布。
生成器覆盖完整输出集合；所有 source dependencies（workflow source files）完成后，只有 Main 在 downstream exclusive integration slice 中独占 generated write set，并且只运行一次 `npm run generate:workflows`。任何 task/worker 都不得运行 generator 或直接修改生成物。证据包括 generator exit、check/parity 结果与 no-unexpected-diff。Main 检查 generated diff 后只执行 check-only parity；不得再次运行 generator，也不能把生成当作 TDD RED。

不要直接修改生成物，也不要让多个 source worker 各自运行 generator。`check:workflows` 会做完整字节比较，并在缺失或漂移时失败。

## 验证

最小验证：

```bash
npm test
npm run check:workflows
node --test scripts/workflow-context-parity.test.js
npm run check:marketplace
npm run pack:all
git diff --check
```

真实 OMP 兼容验证应使用当前四个插件：

```bash
node scripts/e2e/omp17-rpc-probe.mjs -- \
  -e plugins/omp-config/index.js --plugin-dir plugins/omp-config \
  -e plugins/writing-helper/index.js --plugin-dir plugins/writing-helper \
  -e plugins/omp-fact-checker/index.js --plugin-dir plugins/omp-fact-checker \
  -e plugins/volcengine-coding-plan/index.js --plugin-dir plugins/volcengine-coding-plan
```

Probe 使用隔离的临时 OMP home，只输出 hash、字符数和结构布尔值，不输出完整 prompt 或配置秘密。它验证当前四个插件的 entrypoint、workflow Skill、PPT/视觉 Skill、写作 Skill、事实核查 Skill，以及各 provider 插件的加载状态；不验证已经删除的代码或测试增强插件。

详细架构见 [ARCHITECTURE.md](ARCHITECTURE.md)，开发和发布见 [DEVELOPMENT.md](DEVELOPMENT.md)，历史自开发记录见 [OMP_ENHANCER_SELF_DEVELOPMENT.md](OMP_ENHANCER_SELF_DEVELOPMENT.md)，事件和隔离测试见 [WORKFLOW_E2E_TESTING.md](WORKFLOW_E2E_TESTING.md)。