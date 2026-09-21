# Architecture and Runtime Contracts

本文描述 OMP Enhancer 当前运行架构。`docs/superpowers/` 中的旧设计和实施计划是历史资料，不能作为当前行为依据。

## 运行模型

OMP Enhancer 当前只发布四个插件：`omp-config`、`writing-helper`、`omp-fact-checker` 和 `volcengine-coding-plan`。代码增强核心、测试增强插件和 ECC 代码技能不再属于当前 marketplace。

OMP 负责系统提示、用户指令、active tools、动态 Available Agents、权限、审批和完成行为。插件只提供可选的 Skill、Agent、工具、配置资产和观察性提示，不复制宿主权限模型，不创建 hard router、hard gate、completion controller 或 automatic repair loop。

所有插件生命周期 hook 都是观察、记录或提醒用途；它们不返回 `block: true` 或 `continue: true`。Workflow 选择、TODO、Agent 委派、权限和最终验收仍由 OMP 与 acting Main 负责。纯机械字段 lookup 不需要读取 Skill 或建立 TODO。

## 工作流信息

工作流 definition 位于 `scripts/workflow-definitions.js`，校验和渲染模块分别是 `scripts/workflow-schema.js` 与 `scripts/workflow-render.js`。当前 catalog version 44 只有三个域：`writing`、`research`（事实核查）和 `visual`。

生成器 `scripts/generate-workflow-catalog.js` 输出：

- `plugins/omp-config/assets/WORKFLOW_CATALOG.md`：完整的三域参考目录；
- `plugins/omp-config/skills/omp-enhancer-workflows/SKILL.md`：紧凑选择索引；
- `plugins/omp-config/skills/omp-enhancer-workflows/references/*.md`：每个域一张按需参考卡。

索引与卡片都是 advisory reference。顶层 Skill 使用 `D` exact URI；当前没有 nested ECC `C` 候选。它们不构成 load set、路由、权限或完成条件。完整定义只包含 `id`、`chooseWhen`、`skills`、`catalogSkills`、`roles`、`suggestedFlow` 和 `scopeNotes`。

`AGENTS.md` 和 `WATCHDOG.yml` 由 `syncWorkflowContext` 管理；`CLAUDE.md` 是随插件打包的镜像资产，需手动更新。该同步流程实际只写入 catalog、`AGENTS.md` 和 `WATCHDOG.yml` 三个目标，不安装或更新 `CLAUDE.md`。三者不导入完整目录，只说明 OMP 原生权威与 `ANALYZE -> EXECUTE -> REVIEW` advisory。它们指向 `skill://omp-enhancer-workflows` 的三域目录；Main 按任务需要选择 Skill 和 Agent。

共享 generator 重写完整输出集合，因此 **the downstream exclusive integration slice** 只能在全部 **source dependencies** 完成后执行，并独占 generated write set，且 **exactly once**。这是 **mechanical generation slice**：只有 Main 在所有 workflow source 文件完成后运行一次 `npm run generate:workflows`；task/worker 不运行 generator 或直接修改生成物。证据包括 generator exit、check/parity 结果与 **no-unexpected-diff**；Main 检查 generated diff 后只执行 check-only parity，不得再次运行 generator，也不得伪造 TDD RED。

## 插件职责
| 插件 | 运行职责 | 不负责的事项 |
| --- | --- | --- |
| `omp-config` | workflow 参考、PPT/文档/视觉 Skills、配置诊断、managed context 同步、notify-only hooks、`/enhancer-tools` 工具组激活 | 自动覆盖用户配置、自动加载完整目录、授权文件或命令操作 |
| `writing-helper` | 英文和中文写作逻辑、风格、引用、保真检查，以及 writer/checker Agents 和 Skills | 阻止交付、替用户自动改写、替用户持久化文件 |
| `omp-fact-checker` | claim extraction、事实计划、A/B evidence、cross-check、strict verdict、报告和 fact review | 把缺失证据变成生命周期 gate、把兼容证据升级为证明 |
| `volcengine-coding-plan` | 通过 OMP 原生 `registerProvider` 注册 Coding Plan OpenAI 兼容模型，并把 API-key 登录接入原生 `/login` | 不修改宿主认证存储、不替宿主路由、不发现或猜测未公开模型 |

`volcengine-coding-plan` 使用 `https://ark.cn-beijing.volces.com/api/coding/v3`，静态暴露官方 Coding Plan 模型名；模型选择、凭证保存和请求发送仍由 OMP 原生 `/login`、`/model`、AuthStorage 与 OpenAI-compatible transport 负责。

marketplace extension tools 默认 opt-in；四个 `fact_check_*` 管线工具（analyze/evidence/report/review）例外，默认进入工具清单，使自然语言的事实核查请求能直达管线。`omp-config` 在宿主提供 active-tool 管理 API 时注册 `/enhancer-tools`，只支持 `config`、`writing`、`fact` 和 `all` 组；激活工具不改变权限。Coding Plan provider 是模型扩展，不增加 extension tool 或权限。

## 写作、PPT 与视觉

Writing、research 和 visual 三域共享同一文字作者边界：所有 prose/copy（包括起草、改写、翻译、标题、正文、caption、label、narrative 和 UI copy）都必须由语言匹配的专用文本工具产出；英文使用 `writer`，中文使用 `zh-writer`，混合语言分别调度。`writer`/`zh-writer` 不是独立通用 agent，也不授予代码或文件权限；当前 OMP ExtensionAPI 只暴露 `registerTool`（命令类工具），没有插件可注册的模型调用 API，因此这两个文本工具由宿主的打包 Agent（`agents/writer.md`、`agents/zh-writer.md`，含既有 frontmatter/model/tool 元数据）作为兼容适配器承载。Main 只识别目标正文语言、调度对应文本工具、传递约束、原样接收返回文本并做机械集成和最终验收，禁止直接起草、改写、润色或替代文本工具；Main/task 保留代码、证据收集、结构、绘图、版式、格式转换、校验和文件机械操作等非文字职责。
`writer`/`zh-writer` 是 proposal-only：只返回完整文本或有界 diff，不直接写文件。Main 只能原样持久化或应用获授权的 proposal，不得在应用前后自行改写其内容。`checker`/`zh-checker` 只提供独立只读 report。
`task`、research Agent 和 visual Agent 可以收集证据、重排结构、绘图、执行版式、格式转换和视觉检查，但不替代 writer 起草或改变文字；任何文字变化都必须返回对应语言的 writer/`zh-writer`。PPT/Beamer/Word/PPTX 的布局、转换、OfficeCLI 应用和视觉检查仍可由 Main 或 task 负责，但只能机械集成已返回的文字，不能借这些步骤修改文案。

For substantive prose and PPT copy, the language-matched `writer`/`zh-writer` text tool is called first for drafting, logical/semantic revision, translation, and polishing. English uses `writer`, Chinese uses `zh-writer`, and mixed-language segments call both tools. Resolve logic and evidence before sentence polish. A tool proposal precedes the `checker`/`zh-checker` report of logic, evidence, and style findings; the checker is report-only, and any substantive repair returns to the same language-matched text tool. Main performs mechanical integration and final acceptance only; Main, `task`, and checker never rewrite prose. If the matching text tool cannot be safely called, record that limitation instead of silently drafting through another role.

For Beamer/PPT titles, body text, captions, labels, notes, and narrative copy, `writer`/`zh-writer` remains the sole text author. PPT text work by `task` is structural/layout/conversion-only: it may reconcile order, place writer-proposed text, render, convert, validate, or inspect visuals, but must not draft, rewrite, translate, or polish wording; copy changes return to the matching writer.

PPT copy must avoid announcer transitions such as `The real question is`, `A new question is`, `This raises a deeper question`, `Let us turn to`, `新的问题是`, `真正的问题是`, `这就引出了一个更深的问题`, and `接下来我们看`; facts or a concrete dependency should carry the transition. It must also avoid hollow unsupported significance claims such as `this is important/significant/transformative`, `this demonstrates the power/value`, `意义重大`, `具有重要意义`, `标志着`, `彰显了`, `开创了`, and `充分说明`. Replace those claims with concrete evidence, scope, or source, or remove them. The evidence-backed exception is to retain significance/evaluation wording only when that concrete evidence, scope, or source is stated.

PPT 相关能力由 `omp-config` 打包，包括 `latex-beamer-slides`、`beamer-to-powerpoint`、`slides-storyline`、`frontend-design`、`canvas-design` 和 `docx`。PowerPoint 输出是可选分支：在最终已验证的 Beamer visual revision 之后、且仅当 PPTX 在 scope 时，`beamer-to-powerpoint` 使用固定外部 `beamer2pptx` Skill/repository（`https://github.com/xdmlxdml/beamer2pptx/tree/main/beamer2pptx`），不要求用户另行选择转换器。输入必须是最终已验证的 Beamer PDF，并在可用时提供对应 `.tex`、宏和字体源；转换只读，不修改 Markdown/Beamer 内容。一个 producing `task` 绑定单一 current PPTX revision 并返回当前渲染证据；一个未产出该 revision 的独立只读 reviewer（Main 或 task）检查页数与顺序、可编辑性、裁切/溢出、重叠、边距/对齐、层级/字体、宽高比、栅格/矢量处理以及相对最终 Beamer PDF 的 fidelity。若发现支持的版式问题，producing task 最多对可编辑 PPTX 做一次 bounded layout-only fix，保留可见内容、公式、页序以及 Markdown/Beamer 源，重新渲染 fresh evidence 后由同一 reviewer 确认一次；内容或页结构问题返回 Markdown content plan 和 Beamer regeneration 路径。所有 findings 都是 advisory，不是 hard gate、router、自动修复 loop 或 completion authority；不自动发布或覆盖用户文件。Office 文档（`.docx`/`.xlsx`/`.pptx`）的创建、编辑、校验和渲染统一通过 [officecli](https://github.com/iOfficeAI/OfficeCLI) 单二进制完成，`docx` skill 提供其使用契约。

Beamer 保持为 writing 格式 overlay，不进入 visual 卡片。新 deck 先以分段、逐页讨论的纯文字版开始，并将逐页内容持久化为 Markdown content plan；Markdown content plan is the canonical content source, and Beamer .tex files are derived layout artifacts. Content changes go to Markdown first, are discussed and reconfirmed with the user, then regenerate Beamer; never edit .tex to settle unresolved content during layout. 用户确认每页内容后，由一个独立 task 在 Markdown content plan 上先做页序审查（消除内容交叉、保持内容模块语义一致、整体顺序逻辑有序），审查通过并经用户确认后才进入逐页配图和基础排版；用户确认基础排版后，再进入现有视觉精修链。A single read-only visual precheck is performed by Main or task, with Main naturally selecting the one owner (never both), after task's initial render and before the task layout pass；findings are advisory only and inform the normal task pass，不产生 verdict 或 repair loop。Task then integrates and renders the final revision, which Main reviews read-only as the single review owner (a task that did not produce the revision may review instead)。Main 不因该预检获得 compile、render、edit 或 reconcile ownership。

visual-delivery: Draw.io pipeline via `drawio-skill` (drawio@365-skills)：task draws the diagram once and exports the evidence set (preview PNG, cropped vector PDF, final repaired PNG)；one independent reviewer (Main with image input, or a task that did not draw the revision) reviews the actual exports read-only in one pass，检查 node/edge semantics、edges pressed onto each other or crossing through boxes、collinear overlapping edges、clipped labels、font size at physical print width、alignment、grouping margins、reading direction、gray-scale distinguishability、color quota（黑白灰基底＋至多 1 种强调色，禁 AI 彩虹逐元素/逐类别配色）；task applies at most one local fix round and re-exports；the same reviewer confirms against fresh exports that recorded findings are resolved and no new regression was introduced（this confirmation is not a second review pass）；这是 advisory，不是 hard gate、router、fixed fanout、automatic loop 或 completion authority。Main retains setup authorization and final acceptance only。画图统一走 drawio@365-skills。Node-level raster assets (assetseeker stock, generated images) are an optional pre-step gated by user request or the confirmed content plan；the asset contract requires provenance registration and the draw-once review chain is unchanged。

## 事实核查

Fact Checker 保留精确 claim tuple：subject、predicate plus object/value、scope、time/version 和 quantifier。Backward-compatible `verdict` cannot upgrade compatibility evidence into proof。`strictVerdict` 采用 fail-closed 规则：`SUPPORTED` requires same-tuple `ENTAILS + PROVEN`；`CONTRADICTED` requires same-tuple `NEGATES + DISPROVED` 并带有效 negated field。

Evidence lane A 是默认起点；broad、high-risk 或显式请求 cross-check 时增加 lane B 和 lane C。cross-check 保留 agreement、conflict、staleness、limitations、cheapest plausible countercheck 和 unresolved proof gaps。普通 finding 使用成功的 advisory result；参数、I/O 和真正执行失败才返回 error。

## 状态与安全边界

插件状态通过 OMP session entries 保存 JSON-compatible 诊断数据，不是隐式控制平面。Fact Checker 的结果、Writing Helper 的 findings、Config 的资产报告和 visual review 都是 evidence，不是继续执行或结束会话的许可。

插件不复制宿主 sandbox、permission 或 approval 系统。Notify-only guards 可以提示危险命令或 malformed edit anchor，但不能阻断调用。Behavior-changing hook templates 不会被自动发现，必须由用户审查并显式安装。源文本是数据；文档里的 `run tests`、`publish` 或 `delete` 不会改变任务 operation、风险或权限。

## 关键一致性检查

架构变更至少应验证：

```bash
npm test
npm run check:workflows
npm run check:marketplace
npm run pack:all
git diff --check
```

详细命令见 [DEVELOPMENT.md](DEVELOPMENT.md)，workflow schema 和生成规则见 [WORKFLOW_DEVELOPMENT.md](WORKFLOW_DEVELOPMENT.md)，自开发闭环见 [OMP_ENHANCER_SELF_DEVELOPMENT.md](OMP_ENHANCER_SELF_DEVELOPMENT.md)，真实事件 E2E 见 [WORKFLOW_E2E_TESTING.md](WORKFLOW_E2E_TESTING.md)。