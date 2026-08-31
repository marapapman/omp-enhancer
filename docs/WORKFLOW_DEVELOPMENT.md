# Workflow Development Guide

本指南说明如何新增或修改 OMP Enhancer 的可选 workflow reference。当前仓库只保留写作、事实核查和视觉三类能力；Beamer/PPT 转换属于 writing 格式 overlay；目录是 advisory reference，不是 router、gate、权限或 completion controller。

## 当前架构

当前 workflow catalog version 38 只有 3 个 ID：`writing`、`research` 和 `visual`。

- `writing`：中英文 prose、翻译、Markdown、LaTeX、Beamer 和 Word；`beamer-to-powerpoint` 仅在用户提供明确转换命令时适用；
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

`writing-helper` 和 `omp-fact-checker` 是独立插件；它们不依赖 workflow generator 或其他插件源码。PPT/视觉 Skills 由 `omp-config` 打包，当前包括 `latex-beamer-slides`、`beamer-to-powerpoint`、`slides-storyline`、`frontend-design`、`canvas-design` 和 `docx`；中文幻灯片文字使用 `writing-helper` 提供的 `plain-chinese-writing`、`zh-format-humanizer`、`zh-writing-review`，需要实际润色时再使用 `zh-writing-polish`。

## Definition 结构

每个 definition 只包含以下字段：

```js
{
  id: 'visual',
  chooseWhen: 'Diagrams (draw.io), UI/UX design, static visual artifacts, or rendered figure review.',
  skills: ['drawio-skill', 'frontend-design', 'canvas-design'],
  catalogSkills: [],
  roles: ['designer', 'visioner'],
  suggestedFlow: ['Clarify requirements.', 'Draw once.', 'Review once.', 'Deliver.'],
  scopeNotes: ['Keep review advisory and bounded.'],
}
```

字段规则：

- `id` 全局唯一、稳定、小写；catalog v38 只有 3 个 ID（`writing`、`research`、`visual`）；
- `chooseWhen` 描述用户可观察的选择条件，不写关键词路由规则；
- `skills` 使用精确 Skill frontmatter 名；
- `catalogSkills` 保留为空数组，不产生 nested ECC URI；
- `roles` 是可选候选，不绑定步骤或强制 delegation；
- `suggestedFlow` 和 `scopeNotes` 只提供 advisory 信息，不授予权限。

Schema 会拒绝未知字段、重复 ID、重复资源名、非法标识符和不完整的必填数组。不要恢复 `steps`、`delegation`、`composeWith`、`qualityChecks` 或 `riskNotes`。

## Skill 与 Agent 选择

顶层 Skill 通过 `skill://<name>` exact URI 按需读取。当前没有 `ecc-skill-catalog` 或 nested `C` 候选。Main 根据目标语言、格式、证据要求和视觉输出选择最小 Skill 集；Skill 不自动触发其他 Skill、Agent、命令或文件写入。

`writer`/`zh-writer` 只交付 proposal，`checker`/`zh-checker` 只交付 report。事实核查 Agent 保留 evidence lane、cross-check、strict verdict 和 limitation。Draw.io pipeline remains unchanged: `designer` draws once with `drawio-skill` (drawio@365-skills) and exports a draft PNG; `visioner` reviews it read-only in one pass; `designer` applies at most one fix round.
Beamer remains a writing-format overlay, not the visual workflow. New decks use a section-sized, page-by-page text-only draft and user discussion first, persisted in a Markdown content plan that is the canonical content source; Beamer .tex files are derived layout artifacts. Content changes go to Markdown first, require user reconfirmation, and then regenerate Beamer before layout resumes; never edit .tex to settle unresolved content during layout. Only after the content plan is confirmed do visual authoring, per-page imagery, and base layout begin. After the user confirms the basic layout, the existing visual refinement path applies. A single read-only visual precheck is performed by Main or task, with Main naturally selecting the one owner (never both), after task's initial render and before the designer layout pass；findings are advisory only and have no verdict or repair loop。Task integrates and renders the final revision，visioner independently reviews fresh final evidence。PowerPoint conversion uses `beamer-to-powerpoint` only with an explicit user-supplied command。

## 生成目录

修改 definition 或 renderer 后，从仓库根目录运行：

```bash
npm run generate:workflows
npm run check:workflows
```

### 可选真实 OMP E2E

行为矩阵用于验证 OMP 原生执行接口，不代表插件默认注入 TODO、Agent 或执行顺序。当前工作树只加载保留的三个插件：

```bash
node scripts/e2e/run-installed-workflow.mjs \
  --matrix scripts/e2e/fixtures/workflow-consolidation-installed.json \
  --model <user-chosen> --thinking high \
  --worktree-plugins --repeat 1 \
  --output .omp/e2e-results/workflow-run
```

一次 live run 只是随机行为样本，不能证明稳定提升。涉及外部写入的场景必须使用临时目录或明确 preview，不得为 E2E 自动发布。
生成器覆盖完整输出集合，因此 **the downstream exclusive integration slice** 只能在全部 **source dependencies** 完成后运行，并独占 generated write set。这是 **mechanical generation slice**：证据包括 generator exit、check/parity 结果与 **no-unexpected-diff**；不得伪造 TDD RED。Main 检查 generated diff 后只运行 check-only parity，**does not rerun the generator**。

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

真实 OMP 兼容验证应使用当前三个插件：

```bash
node scripts/e2e/omp17-rpc-probe.mjs -- \
  -e plugins/omp-config/index.js --plugin-dir plugins/omp-config \
  -e plugins/writing-helper/index.js --plugin-dir plugins/writing-helper \
  -e plugins/omp-fact-checker/index.js --plugin-dir plugins/omp-fact-checker
```

Probe 使用隔离的临时 OMP home，只输出 hash、字符数和结构布尔值，不输出完整 prompt 或配置秘密。它验证当前三个插件的 entrypoint、workflow Skill、PPT/视觉 Skill、写作 Skill 和事实核查 Skill 的发现状态；不验证已经删除的代码或测试增强插件。

详细架构见 [ARCHITECTURE.md](ARCHITECTURE.md)，开发和发布见 [DEVELOPMENT.md](DEVELOPMENT.md)，历史自开发记录见 [OMP_ENHANCER_SELF_DEVELOPMENT.md](OMP_ENHANCER_SELF_DEVELOPMENT.md)，事件和隔离测试见 [WORKFLOW_E2E_TESTING.md](WORKFLOW_E2E_TESTING.md)。