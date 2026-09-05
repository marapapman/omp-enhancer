# Development, Validation, and Release Guide

本文集中保存当前仓库的开发、测试、打包和发布细节。用户入口见根 `README.md`，运行架构见 [ARCHITECTURE.md](ARCHITECTURE.md)，workflow definition 见 [WORKFLOW_DEVELOPMENT.md](WORKFLOW_DEVELOPMENT.md)。旧的代码增强自开发记录和历史行为矩阵仅保留作迁移参考，不能作为当前插件清单。

## Monorepo 布局

当前 marketplace 只有四个插件：

```text
plugins/
├── omp-config/              # workflow references、PPT/文档 Skills、visioner、诊断和 hooks
├── writing-helper/          # 中英文写作、逻辑、风格、引用和保真检查
├── omp-fact-checker/        # claim plan、evidence、cross-check、strict verdict 和 review
└── volcengine-coding-plan/  # 方舟 Coding Plan provider、/login 和 /model 接入

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
- workflow catalog v39 只有 `writing`、`research` 和 `visual` 三个 advisory 域；目录不是 router、gate 或 completion controller；
- `D` 是顶层 Skill exact URI，当前没有 nested ECC `C` 候选；候选 Skill 和 Agent 只按任务需要选择，不是 load set；
- Main 可用 `ANALYZE -> EXECUTE -> REVIEW` 组织复杂任务，但插件不强制 delegation、fixed fan-out、retry 或 completion；
- 所有 extension tools 默认 `defaultInactive`。`omp-config` 提供 `/enhancer-tools status|enable|disable`，组为 `config`、`writing`、`fact` 和 `all`；激活不授予权限；
- `writer`/`zh-writer` 只交付 proposal，`checker`/`zh-checker` 只交付 report；Main 独自执行获授权的文件修改；
- Draw.io pipeline remains unchanged: task draws once with drawio-skill (drawio@365-skills) and exports a draft PNG；visioner read-only reviews it once；task applies at most one fix round。
- Beamer remains a writing-format overlay. New decks first use a section-sized, page-by-page text-only draft and user discussion, persisted in a Markdown content plan that is the canonical content source; Beamer .tex files are derived layout artifacts. Content changes go to Markdown first, are discussed and reconfirmed with the user, then regenerate Beamer; never edit .tex to settle unresolved content during layout. Visual authoring, per-page imagery, and base layout begin only after the user confirms the page content. After the user confirms the basic layout, the existing visual refinement path applies. A single read-only visual precheck is performed by Main or task, with Main naturally selecting the one owner (never both), after task's initial render and before the task layout pass；findings are advisory only and have no verdict or repair loop。Task integrates and renders the final revision；visioner independently reviews fresh final evidence。PowerPoint conversion uses `beamer-to-powerpoint` only with an explicit user-supplied command。
- Fact Checker 保留精确 claim tuple，`strictVerdict` 对 `SUPPORTED` 和 `CONTRADICTED` 采用 fail-closed 证据规则；
- hook 可以观察或提醒，但不返回 `block: true` 或 `continue: true`。

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

Plugin-specific validation：

```bash
npm test --workspace plugins/omp-config
npm run pack:dry --workspace plugins/omp-config
npm test --workspace plugins/writing-helper
npm run coverage --workspace plugins/writing-helper
npm test --workspace plugins/omp-fact-checker
npm test --workspace plugins/volcengine-coding-plan
npm run pack:dry --workspace plugins/volcengine-coding-plan
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

生成器重写完整输出集合，因此 **the downstream exclusive integration slice** 只能在全部 **source dependencies** 完成后运行，并独占 generated write set，且 **exactly once**。它是 **mechanical generation slice**：证据包括 generator exit、check/parity 结果与 **no-unexpected-diff**；不得伪造 TDD RED。Main 检查 generated diff 后只运行 check-only parity，**does not rerun the generator**。

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

cp .omp-plugin/marketplace.json ~/.omp/plugins/cache/marketplaces/omp-enhancer/marketplace.json
cp .omp-plugin/marketplace.json ~/.omp/plugins/cache/marketplaces/omp-enhancer/.omp-plugin/marketplace.json
omp plugin discover
omp plugin upgrade <changed-plugin>@omp-enhancer
omp plugin list
```

Config context 需要显式同步时，在新 session 中启用 Config tools，先调用 `omp_config_sync_workflow_context` 的 `apply=false`，审查后再决定是否使用 `apply=true`。

## 文档维护

- 根 `README.md` 只保留用户功能、安装、常用用法、升级和文档入口；
- 当前架构和 runtime contracts 写入 `ARCHITECTURE.md`；
- 开发、测试、生成、打包和发布写入本文件；
- Workflow schema 与 catalog generation 写入 `WORKFLOW_DEVELOPMENT.md`；
- `docs/superpowers/` 只保存带日期的历史设计、计划和报告，不做追溯改写；
- 删除公开 API 时同步检查源码、tests、Agents、Skills、generated assets、marketplace、plugin README 和 current docs。