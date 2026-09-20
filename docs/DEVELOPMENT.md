# Development, Validation, and Release Guide

本文集中保存当前仓库的开发、测试、打包和发布细节。用户入口见根 `README.md`，运行架构见 [ARCHITECTURE.md](ARCHITECTURE.md)，workflow definition 见 [WORKFLOW_DEVELOPMENT.md](WORKFLOW_DEVELOPMENT.md)。旧的代码增强自开发记录和历史行为矩阵仅保留作迁移参考，不能作为当前插件清单。

## Monorepo 布局

当前 marketplace 有四个插件：

```text
plugins/
├── omp-config/              # workflow references、PPT/文档 Skills、诊断和 hooks
├── writing-helper/          # 中英文写作、逻辑、风格、引用和保真检查
├── omp-fact-checker/        # claim plan、evidence、cross-check、strict verdict 和 review
└── volcengine-coding-plan/ # 方舟 Coding Plan provider、/login 和 /model 接入

scripts/                     # workflow generation、validation、E2E、release、packaging
docs/                        # 当前架构与开发文档
docs/superpowers/            # 历史 plans/specs/reports，仅作 archive
.omp-plugin/                 # marketplace catalog
```

重要文件：
- `package.json`：四个 npm workspace 和统一脚本；
- `package-lock.json`：唯一提交的 npm lockfile；
- `.omp-plugin/marketplace.json`：插件版本、source 和 Skill inventory；
- `scripts/workflow-definitions.js`：writing、research、visual 三域的 workflow 唯一语义来源；
- `scripts/workflow-schema.js`、`scripts/workflow-render.js`：definition 校验与 Markdown 渲染；
- `scripts/generate-workflow-catalog.js`：生成共享 workflow 资产；
- `plugins/volcengine-coding-plan/index.js`：Coding Plan provider 和原生 `/login` 接入；
- `plugins/omp-fact-checker/src/fact-check.js`：事实核查 pipeline；
- `scripts/release.js`：版本与 marketplace release 的唯一写入入口。

## Runtime invariants

实现变更不得破坏以下契约：

- OMP 的系统提示、用户指令、active tools、动态 Available Agents、权限、审批和完成行为始终具有最终权威；
- workflow catalog v44 只有 `writing`、`research` 和 `visual` 三个 advisory 域；目录不是 router、gate 或 completion controller；
- `D` 是顶层 Skill exact URI，当前没有 nested ECC `C` 候选；候选 Skill 和 Agent 只按任务需要选择，不是 load set；
- Main 可用 `ANALYZE -> EXECUTE -> REVIEW` 组织复杂任务，但插件不强制 delegation、fixed fan-out、retry 或 completion；
- marketplace extension tools 默认 opt-in；`omp-config` 提供 `/enhancer-tools status|enable|disable`，组为 `config`、`writing`、`fact` 和 `all`；激活不授予权限。四个 `fact_check_*` 管线工具例外，默认进入工具清单，让自然语言的事实核查请求直达管线；
- `writer`/`zh-writer` 是唯一的文字作者，也是专用的语言匹配文本工具（非独立通用 agent）：所有 prose/copy（起草、改写、翻译、标题、正文、caption、label、narrative 和 UI copy）按正文语言分别交给英文 `writer` 或中文 `zh-writer`；Main 只负责识别语言、调度、传递结果、原样机械集成和最终验收，禁止直接起草、改写、润色或替代 writer。Main/task 保留代码与非文字动作。当前 OMP ExtensionAPI 只暴露 `registerTool`（命令类工具），无插件模型调用 API，故这两个文本工具由宿主打包 Agent 文件作为兼容适配器承载，适配器元数据保持不变。
- Draw.io pipeline remains unchanged: task draws once with drawio-skill (drawio@365-skills) and exports a draft PNG；Main (or a task that did not draw the revision) reviews it read-only once；task applies at most one fix round。
- Beamer remains a writing-format overlay. New decks first use a section-sized, page-by-page text-only draft and user discussion, persisted in a Markdown content plan that is the canonical content source; Beamer .tex files are derived layout artifacts. Content changes go to Markdown first, are discussed and reconfirmed with the user, then regenerate Beamer; never edit .tex to settle unresolved content during layout. After the content plan is confirmed and before visual authoring, a separate task reconciles the slide order (no content overlap, semantically coherent modules, logical overall progression) on the Markdown plan; visual authoring, per-page imagery, and base layout begin only after that reconciliation and page-content confirmation. After the user confirms the basic layout, the existing visual refinement path applies: a single read-only visual precheck is performed by Main or task (never both), after task's initial render and before the task layout pass; findings are advisory only. Task then integrates and renders the final Beamer revision, which Main reviews read-only as the single review owner (a task that did not produce the revision may review instead). After that final validated Beamer visual revision, when PPTX output is in scope, the optional `beamer-to-powerpoint` branch uses the fixed external `beamer2pptx` Skill/repository (`https://github.com/xdmlxdml/beamer2pptx/tree/main/beamer2pptx`) with the final validated Beamer PDF and corresponding `.tex`, macro, and font sources when available. One producing `task` converts and binds one current PPTX revision, renders that revision, and supplies the render evidence; one independent read-only reviewer (Main or a task that did not produce it) checks slide count/order, editability where supported, clipping/overflow, overlap, margins/alignment, hierarchy/fonts, aspect ratio, raster/vector treatment, and fidelity. The producing task may apply at most one bounded layout-only fix to the editable PPTX, preserving visible content, formulas, slide order, and Markdown/Beamer sources, then rerenders fresh evidence for the same reviewer to confirm once. A content or page-structure finding returns to the Markdown plan and Beamer regeneration path. This evidence is advisory only: it does not create a hard gate, router, permission/completion controller, automatic repair loop, or fallback converter.
- Fact Checker 保留精确 claim tuple，`strictVerdict` 对 `SUPPORTED` 和 `CONTRADICTED` 采用 fail-closed 证据规则；
- hook 可以观察或提醒，但不返回 `block: true` 或 `continue: true`。

## 全局文字作者边界

Writing、research 和 visual workflow 共享同一作者契约。任何文字内容都必须由语言匹配的专用文本工具 `writer`/`zh-writer` 产出（非独立通用 agent）；混合语言分别调度。当前 OMP ExtensionAPI 只暴露 `registerTool`（命令类工具），无插件模型调用 API，这两个文本工具因此由宿主的打包 Agent 文件（保留原 frontmatter/model/tool 元数据）作为兼容适配器承载；适配器形态不授予文本工具代码或文件权限。Research/visual Agent 和 `task` 可以收集证据、重排结构、绘图、做版式、转换格式和执行视觉检查，以及代码与文件机械操作，但不能替代文本工具或改变 prose/copy。证据收集、结构重排、绘图和版式操作不等于文字起草；一旦需要文字变化，必须回到对应语言的 writer。

`writer`/`zh-writer` 保持 proposal-only，只返回完整文本或有界 diff，不直接写文件。Main 只能把获授权的 proposal 原样持久化或应用，不得在应用前后自行改写；PPT/Beamer/Word/PPTX 的布局、转换、OfficeCLI 应用和视觉检查可以由 Main 或 task 完成，但只能机械集成已返回的文案。Workflow cards、Agents 和 review findings 仍是 advisory，不增加 hard router、lifecycle gate、自动重试或 completion controller。

For substantive writing, the sequence is language-matched `writer`/`zh-writer` proposal for drafting, logical/semantic revision, translation, or polishing; logic and evidence are settled before sentence polish. The proposal precedes a `checker`/`zh-checker` report of logic, evidence, and style findings. The checker is report-only, substantive repairs return to the same language-matched writer, and Main performs mechanical integration and final acceptance only. Main, `task`, and checker never rewrite prose; if a matching writer cannot be safely dispatched, record the limitation rather than silently drafting through another role.

For PPT/Beamer titles, body text, captions, labels, notes, and narrative copy, `writer`/`zh-writer` remains the sole text author. `task` is structural/layout/conversion-only for PPT text: it may place writer-proposed copy, reconcile order, render, convert, validate, or inspect visuals, but must not draft, rewrite, translate, or polish wording. Any copy change returns to the matching writer.

PPT copy avoids announcer transitions such as `The real question is`, `A new question is`, `This raises a deeper question`, `Let us turn to`, `新的问题是`, `真正的问题是`, `这就引出了一个更深的问题`, and `接下来我们看`; facts or a concrete dependency carry the transition. It also avoids hollow unsupported significance claims such as `this is important/significant/transformative`, `this demonstrates the power/value`, `意义重大`, `具有重要意义`, `标志着`, `彰显了`, `开创了`, and `充分说明`. Replace them with concrete evidence, scope, or source, or remove them; retain significance/evaluation only as an evidence-backed exception when that support is stated.

## 常用命令

从仓库根目录执行：

```bash
npm test
npm run generate:workflows
npm run check:workflows
npm run check:marketplace
npm run pack:all
npm run release -- --plugin omp-config --bump patch --dry-run
```

Plugin-specific validation（打包检查统一用根 `npm run pack:all`，或对单个插件用 `npm pack --dry-run -w plugins/<name>`）：

```bash
npm test --workspace plugins/omp-config
npm test --workspace plugins/writing-helper
npm run coverage --workspace plugins/writing-helper
npm test --workspace plugins/omp-fact-checker
npm test --workspace plugins/volcengine-coding-plan
git diff --check
```

## Generated assets

修改 workflow definition 或 renderer 后运行：

```bash
npm run generate:workflows
npm run check:workflows
```

生成器覆盖：

```text
plugins/omp-config/assets/WORKFLOW_CATALOG.md
plugins/omp-config/skills/omp-enhancer-workflows/SKILL.md
plugins/omp-config/skills/omp-enhancer-workflows/references/*.md
```

生成器重写完整输出集合；只有 Main 在 downstream exclusive integration slice 中独占 generated write set，并且在所有 source dependencies（workflow source files）完成后只运行一次 `npm run generate:workflows`（exactly once）。这是一个 mechanical generation slice：任何 task/worker 都不得运行 generator 或直接修改生成物。证据包括 generator exit、check/parity 结果与 no-unexpected-diff。Main 检查 generated diff 后只执行 check-only parity；不得再次运行 generator，也不得伪造 TDD RED。

不要直接修改生成物，也不要为同一输出集合运行多个 generator。`check:workflows` 会做完整字节比较，并在文件缺失或漂移时失败。

## Marketplace validation

`.omp-plugin/marketplace.json` 是发布 catalog。修改插件 Skill inventory 后运行：

```bash
npm run generate:marketplace
npm run check:marketplace
npm run pack:all
```

`generate:marketplace` 只同步可推导的 Skill paths；版本必须由 `scripts/release.js` 更新。Marketplace 永久跟踪 GitHub `main`，catalog 不支持 `ref` pins。

## E2E 与文档

`docs/WORKFLOW_E2E_TESTING.md` 保存事件证据、静态 probe、隔离运行、failure classification 和重复实验方法；一次 live run 只是样本，不能证明稳定提升。`docs/OMP_ENHANCER_SELF_DEVELOPMENT.md` 是历史自开发记录，包含已删除代码增强生命周期，仅用于理解旧迁移背景。

需要检查 OMP 兼容性时，使用当前四个插件：

```bash
node scripts/e2e/omp17-rpc-probe.mjs -- \
  -e plugins/omp-config/index.js --plugin-dir plugins/omp-config \
  -e plugins/writing-helper/index.js --plugin-dir plugins/writing-helper \
  -e plugins/omp-fact-checker/index.js --plugin-dir plugins/omp-fact-checker \
  -e plugins/volcengine-coding-plan/index.js --plugin-dir plugins/volcengine-coding-plan
```

## Release transaction

根 `scripts/release.js` 是 plugin manifest、root lockfile 和 marketplace version 的唯一写入入口。先做 dry-run：

```bash
npm run release -- --plugin omp-config --bump patch --catalog-bump patch --dry-run
```

确认后才应用：

```bash
npm run release -- --plugin omp-config --bump patch --catalog-bump patch --apply
```

不要使用 `--plugin all`，除非所有保留插件都确实发生了需要发布的变化。版本基线取 plugin manifest、marketplace 和 lockfile 中的最高语义版本。

应用 release 后运行：

```bash
npm test
npm run check:marketplace
npm run pack:all
git diff --check
```

只有用户明确授权时才 commit、push 或升级本地安装。Marketplace 跟踪 `main`，所以本地 upgrade 必须在远端已包含目标提交之后执行：

```bash
git status --short
git add <reviewed-paths>
git commit -m "<scoped message>"
git push origin main
git rev-parse HEAD
git ls-remote origin refs/heads/main

omp plugin marketplace update omp-enhancer
git -C ~/.omp/plugins/cache/marketplaces/omp-enhancer log --oneline -1   # 必须显示刚 push 的 release 提交
omp plugin upgrade <changed-plugin>@omp-enhancer
omp plugin list
diff -q plugins/<changed-plugin>/<changed-asset> \
  ~/.omp/plugins/cache/plugins/*___<changed-plugin>___<new-version>/<changed-asset>
```

`omp plugin marketplace update` 会 fetch 并 reset 缓存的 marketplace clone 到远端默认分支，使缓存里的插件源码树（不只是 manifest）与远端一致。不要只手工拷贝 `.omp-plugin/marketplace.json` 到缓存：那只会同步目录里的版本号，缓存中的插件源码树仍是旧的，`omp plugin upgrade` 会从旧源码树安装却报新版本号。升级后必须 diff 校验安装产物，而不是只看 `omp plugin list` 的版本号。

Config context 需要显式同步时，在新 session 中启用 Config tools，先调用 `omp_config_sync_workflow_context` 的 `apply=false`，审查后再决定是否使用 `apply=true`。

## 文档维护

- 根 `README.md` 只保留用户功能、安装、常用用法、升级和文档入口；
- 当前架构和 runtime contracts 写入 `ARCHITECTURE.md`；
- 开发、测试、生成、打包和发布写入本文件；
- Workflow schema 与 catalog generation 写入 `WORKFLOW_DEVELOPMENT.md`；
- `docs/superpowers/` 只保存带日期的历史设计、计划和报告，不做追溯改写；
- 删除公开 API 时同步检查源码、tests、Agents、Skills、generated assets、marketplace、plugin README 和 current docs。