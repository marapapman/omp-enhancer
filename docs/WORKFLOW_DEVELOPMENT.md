# Workflow Development Guide

本指南说明如何在 OMP Enhancer 中新增或修改可选工作流参考。目标是让一次修改只有一个语义来源，并让生成资产、可选 Skill、Agents、marketplace 和安装态保持一致，同时不覆盖 OMP 的原生工作流。

## 架构原则

当前工作流采用“OMP 原生运行 + 可选参考”的模型：

- 默认 lifecycle 不注入或替换 `systemPrompt`，不激活工具，也不改写子 Agent assignment。Core 将任务记录为 `agent-selected`，不预选 workflow、Skill、tool 或 Agent。
- 精确 `opencode-go/deepseek-v4-flash` 与精确 `opencode-go/mimo-v2.5` 的顶层 Main 任务各保留一次 capability-gated compatibility reminder。需要分析、判断、workflow composition、协调阶段或可能委派时，Main 使用 `DISCOVER / WORKFLOW PLAN + LOAD / READY + EXECUTE` 三阶段软协议：index-only batch 返回后填写公开、完整且不含占位符的 exact `WORKFLOW PLAN` block；resource-only load 先读取声明的 owning domain Skills 或 catalogs，最后读取最小 workflow reference 集合并等待；再输出 exact `WORKFLOW READY | ...`、重写一次详细 TODO，才开始 project work。纯机械字段 lookup 无 Skill、marker 或 TODO；Agent、fork 和证据整合仍由 Main 自主决定。完整行为契约见 [`ARCHITECTURE.md`](ARCHITECTURE.md#flash-model-compatibility-reminders)。
- `task-descriptor.js` 只提取 operation、domains、约束、目标、阶段、风险、正文语言、`inspectionTargets` 和 `inspectionShape` 等 JSON-safe 事实，供状态记录和短提示使用；这些字段不能选择 workflow、Agent 或 fork。
- `omp-enhancer-workflows` Skill 提供精简选择索引和每个 workflow 一张的按需参考卡片，但不提供事实核查、写作、测试等领域方法。索引不重复候选 Skill 或完整 compose 图；acting Agent 仍根据完整条件与原生可见 Skill descriptions 自主选择、组合、简化或忽略卡片，并在需要时另读可见 domain Skill；项目不存在介入默认 Main 运行路径的 router 或 classifier。
- 普通软件工作统一使用 `code.dev` 和 `code-development`。实质 mutation 的建议角色只有插件 `plan`、native `task` 与 native `reviewer`：Main 负责搜索、细粒度 parallel-wave 计划、集成和判断，task 负责完整 vertical TDD slice，reviewer 只审 Main-reviewed supplied diff/evidence。不要重新拆分 planning、debugging、testing、implementation、review、build、performance 或 technical-research 过程卡片；`code.plan`、`code.debug`、`code.test`、`code.review`、`code.build`、`performance.optimize` 与 `research.technical` 是退役 ID，其选择条件都映射到 `code.dev`。
- Workflow definition 只描述建议步骤和资源，不授予写入、联网、测试、发布或其他权限。
- Advisor 不自动导入完整目录，也不得因目录内容形成完成门；它可以在最早可见的 exact `WORKFLOW PLAN`、resource load 或 `WORKFLOW READY | ...` checkpoint 用至多一条普通 `DECISION CHECK`，帮助 Main 校准 workflow/Skill 声明、load/TODO 一致性、独立切片或 assignment schema。Main 可以接受、调整或忽略；workflow/Skill preparation reads 保持窗口开放，Main 首次 native `task` 或实质项目操作会关闭窗口。
- Skills 是候选项，只有 acting Agent 判断有用且 OMP 当前可用时才加载。
- Agent ID 是可选候选。使用前必须以 OMP 当前动态 Agent inventory 为准；managed prompt 可以要求 Main 明确和更新自己的 TODO，但目录本身不能创建 runtime TODO gate、强制委派或预选角色。

## 文件布局

```text
plugins/omp-enhancer-core/src/workflows/
├── schema.js
├── catalog.js
├── render-shared-markdown.js
├── render-skill.js
└── definitions/
    ├── general.js
    ├── writing.js
    ├── research.js
    ├── code.js
    ├── network.js
    ├── database.js
    ├── ml.js
    ├── growth.js
    └── operations.js

plugins/omp-config/assets/WORKFLOW_CATALOG.md      # 生成物，禁止手改
plugins/omp-config/skills/omp-enhancer-workflows/ # 生成的选择索引与单 workflow references
plugins/omp-config/skills/ecc/SKILL.md             # 顶层 ecc-skill-catalog adapter，生成物
plugins/omp-config/skills/ecc/catalog.md           # 255 个嵌套 ECC guide 的按需索引，生成物
scripts/generate-workflow-catalog.js
scripts/generate-ecc-skill-catalog.js
scripts/workflow-context-parity.test.js
```

Core definitions 是唯一语义来源。Config 不在运行时依赖 Core；它只打包生成后的 Markdown 资产和 Skill 文件。`AGENTS.md` 与 `WATCHDOG.yml` 的 managed blocks 都声明 OMP 原生权威并指向可选 Skill，不自动 import `WORKFLOW_CATALOG.md`。Main block 要求非简单任务在独立 `DISCOVER` batch 中读取紧凑选择 index，再用公开、完整的 exact `WORKFLOW PLAN` block 选择负责最终交付物或请求操作的 Primary 或 none、完整条件独立匹配的 Add-ons、准确 Skills、literal per-workflow reference load order，并在 `Actions:` 下列出详细编号动作。索引行只包含 ID、完整 Primary 条件与标为 `PLAN URI:` 的单卡 URI；该标签是先复制进 `Load order` 的数据，不是 PLAN 前的工具调用；索引不重复 `composeWith` 或候选 Skills。Skill ownership 由原生可见 description 的正向条件与 `Not for` 决定。Resource-only load 先读取已声明的 domain Skills 或 catalogs；catalog 如需解析 nested Skill，必须在 workflow references 前完成；最后加载每个所选 workflow 的单卡并等待，让最终卡片直接提示 READY。单卡只给出执行步骤、可选 Agents/delegation、quality、scope 与 risk，不暴露晚期 Add-on 或 Skill 候选。随后 exact `WORKFLOW READY | ...` 把实际步骤与 Skill 指令 rebase 到一次详细 TODO，再进入 `READY + EXECUTE`。Substantive code mutation 先由 Main 检索足够的代码、caller、test 与 configuration anchors，再把 dependency waves、runnable/independent 状态、exclusive write sets、complete assignment input、integration 与 evidence return 写入 TODO；同 wave delegation 是有 capacity 和安全边界时的软方法，不是固定 fork。Advisor block 允许一次早期 `DECISION CHECK`；workflow/Skill preparation reads 保持 ordinary window，Main 首次 native `task` 或实质项目操作后关闭，同时不得用 Advisor 自己的工具 schema 推断 Main 能力、猜不可见 ID、要求 duplicate Skill read、把 workflow/plan/TODO/metadata/schema-risk 升级成 blocker，或在完整 Main final 后发送 ordinary note。这些是行为提示，不是运行时 gate。

## Definition 结构

把新卡片加入最合适的领域文件：

```js
{
  "id": "diagram.example",
  "chooseWhen": "The user wants an example diagram.",
  "composeWith": ["design.visual"],
  "steps": [
    {
      "id": "step-1",
      "text": "Establish the diagram semantics and output constraints."
    },
    {
      "id": "step-2",
      "text": "Create the diagram within the declared geometry constraints."
    },
    {
      "id": "step-3",
      "text": "Independently inspect fresh rendered evidence."
    }
  ],
  "scopeNotes": [
    "The workflow does not authorize publication."
  ],
  "skills": [
    "example-diagram-skill"
  ],
  "qualityChecks": [
    "semantic completeness and current-revision rendered evidence"
  ],
  "riskNotes": [],
  "roles": [
    "designer",
    "visioner"
  ],
  "delegation": [
    "step-2: designer owns the bounded source revision",
    "step-3: visioner independently reviews the fresh render"
  ]
}
```

字段规则：

- `id`：全局唯一、稳定、使用小写点号命名；发布后不要随意改名。
- `chooseWhen`：描述用户可观察的选择条件，不写关键词路由规则。
- `composeWith`：只列常见组合，不表示自动选择；目标 ID 必须存在且不能指向自己。
- `steps`：每一步有稳定 `step-*` ID 和一个可验收、能力中立的动作。步骤不能强制某个 Agent、未在 PLAN 选择的 workflow 或未声明的 Skill；可选 actor 只写入 `delegation`。后续插入步骤时保留既有 ID，避免让子任务元数据失效。
- `scopeNotes`：记录边界、非目标和授权分离。
- `skills`：精确 Skill frontmatter 名，只列直接支持某一步的候选项。
- `qualityChecks`：能够由文件、命令结果、渲染物、来源或独立审查证明的检查。
- `riskNotes`：只描述风险和验证要求，不复制宿主权限系统。
- `roles`：可选 Agent 候选名；可以引用 OMP 原生 Agent，也可以引用 marketplace 中唯一打包的插件 Agent。每个候选角色都必须在 `delegation` 中有职责。
- `delegation`：绑定 step ID、actor 和可选 duty。它是委派建议，不要求 acting Agent 创建子任务；没有角色时表示该卡片不提出 Agent 候选。

Schema 会拒绝未知字段、重复 ID、未知组合目标、重复资源名、未知或缺失的 delegation step ID、没有职责的角色，以及无角色却要求泛化委派的卡片。`steps-2-4` 之类的范围只适用于真实存在的连续数字 ID；自定义 ID 必须用 `step-alpha:` 形式精确引用。

## 选择与组合设计

工作流是可组合维度，不是互斥类别。通常先选择拥有最终结果或请求操作的最具体 Primary，再加入完整条件独立匹配的输出、专项验证或生命周期动作：

1. 主结果或操作：例如 `code.dev`、`research.web`、`slides.generate` 或 OMP Enhancer 自开发的 `omp.plugin`。
2. 内容语言和格式：例如 `writing.en + writing.latex`。
3. 专项验证：例如 `security.review` 或 `factcheck.document`；普通 code tests 与 diff review 已由 `code.dev` 覆盖。
4. 项目领域：只有当该领域卡片不是已经选定的主操作时才作为独立维度。
5. 生命周期动作：只有用户明确要求时才组合 `release.publish`。

不要在一个卡片中复制另一个卡片的全部流程。用 definition 的 `composeWith` 记录开发期常见关系，并在步骤或 scope 中说明组合点；Main 的紧凑索引和单卡不会暴露这张关系图。只有另一 workflow 的完整选择条件也独立匹配时才在 PLAN 中加入它，不能为 Primary 已覆盖的内部阶段再加 Add-on。涉及其他 workflow 的晚期步骤必须以“已在 PLAN 选择”为条件，不能在单卡加载后重新选 workflow。

`code.dev` 是普通代码生命周期的唯一通用 Primary。Main 先检索本地代码；若当前版本、API、失败模式或社区实践可能改变决定，再做有界的官方资料和社区经验检索。它把实现拆成 dependency-ordered waves 和 non-overlapping vertical slices；每个 slice 写明 ID、验收、依赖、exclusive write set、本地 anchors、test seam、exact command、expected RED、最小 production boundary、Skills、integration point 和 return evidence。只读 `plan` Agent 审完整 plan 与 assignments 后，同 wave runnable independent slices 在一次 native `task` `tasks[]` batch 中并行，每个 task 自己完成 test mutation、valid RED、minimum production、same-command GREEN 与 green-only refactor。Main 等待、集成并做 broader current-tree verification，公开 `MAIN REVIEW` 后才让 native `reviewer` 审 Main-reviewed bounded semantic diff 和 evidence。Supported material finding 由 task bounded repair，Main 刷新 evidence 并复审，只有 materially changed input 才最多追加一次 fresh affected review。

`omp.plugin` 是另一个有意的完整 Primary：它覆盖 OMP Enhancer 与插件特有的 generation、packaging 和 installed E2E 边界。`omp.plugin` 和 `code.dev` 不互相写入 `composeWith`，也不能把 `code.dev` 当作前者的内部阶段或 Add-on。两者都可使用 `code-development`；`omp.plugin` 再按该 Skill 的条件指示读取 `references/omp-enhancer.md`。设计理由见 [OMP_ENHANCER_SELF_DEVELOPMENT.md](OMP_ENHANCER_SELF_DEVELOPMENT.md)，行为矩阵见 [WORKFLOW_E2E_TESTING.md](WORKFLOW_E2E_TESTING.md)。

写作有额外规则：普通起草或修改根据目标正文选择 `writing.zh` 或 `writing.en`；路径存在但正文尚未观察时先使用 `writing.pending`；翻译或显式输出语言根据目标语言；格式工作流不能代替正文起草或修改所需的语言工作流。纯格式转换保持语言中立，组合源格式与目标格式工作流，只加载方向匹配的转换 Skill，不因正文语言加载起草或审阅 Skill。

## 添加或引用 Agent

先确认所需能力是否已经由 OMP 原生 Agent 提供。`designer`、`librarian` 和 `reviewer` 属于 OMP 原生 Agent，插件不得用同名 frontmatter 覆盖它们。Config 提供的通用只读 `plan` Agent 可审 supplied plan。目录可以把现有 Agent 列为可选候选，但运行时必须服从 OMP 当前动态 Available Agents 列表。

只有确实需要独立能力或权限边界时才添加插件 Agent：

1. 在拥有该角色的插件 `agents/` 下创建唯一的 `<agent-id>.md`，使用清晰的插件特定名称，并说明为什么当前原生 Agent 与 Skill 不能承担该边界。
2. Frontmatter `name` 必须与 definition 中的角色完全一致，并在整个 marketplace 中唯一，且不能碰撞 OMP 原生 Agent。
3. 把 `agents` 加入该插件的 `package.json.files`；已有插件通常已经配置。
4. 在工作流 `roles` 中登记，并在 `delegation` 中绑定明确步骤和仅负责的 checkpoint。
5. Reviewer、visioner、checker 或 auditor 应保持独立、只读，除非角色契约明确允许修改。

普通 code-mutation workflow 只列插件 `plan`、native `task` 和 native `reviewer`。`explore`、`implementation-task`、`config-librarian`、`omp-target-auditor`、`test-planner`、`test-executor` 和 `test-reviewer` 已退役；Main 负责本地检索、parallel-wave 计划、集成、broader verification、显式 `MAIN REVIEW` 和 finding disposition，native `task` 负责完整 test-and-production slice 及 supported repair。不要使用 OMP 当前 inventory 中不存在的推测名称。任何卡片都只是建议；Agent 不可用、capacity 不足、input 不完整或 write set 无法安全拆分时记录 limitation，并采用宿主允许的最安全 fallback，不得把 `roles` 变成强制 fork、fixed fan-out 或 completion gate。

### Agent 还是 Skill

新增专业领域时先判断是否产生新的权限或独立证据边界：

- 如果只是语言、框架、数据库、构建或领域知识，优先复用 OMP 当前提供的原生 Agent，并新增或复用 Skill。
- 只有职责确实需要不同能力边界时才新增 Agent。例如开源 staging writer、只读 sanitizer 和 packager 的文件权限不同，因此可以保留为不同角色。
- 一个领域 diff reviewer 不应仅因“懂数据库”或“懂 ML”而复制 canonical `reviewer`；已有 semantic diff 仍交给 native `reviewer` 并按需加载领域 Skill，未形成 diff 的 bounded target review 由 Main 直接完成。
- OMP 和 acting Agent 保留 workflow 编排所有权。插件 Agent 禁止通过 `spawns: "*"` 抢占动态调度；任何 spawn 目标都必须在当前环境真实可用，且目录本身不能触发隐藏的二次编排。
- 删除 wrapper 前先把其方法迁入 Skill，更新所有 active `SKILL.md` 中的旧 ID，并保留历史 state fixture 作为兼容证据。

当前 catalog 不提供 healthcare workflow。医疗、隐私或合规类 Skill 只能作为普通 research、fact-check、security 或 review workflow 的可选知识层，不得暗示存在未打包的医疗 Agent。

## 添加 Skill

1. 在所属插件 `skills/<skill-name>/SKILL.md` 中创建 Skill。
2. Frontmatter `name` 必须与 definition 中的候选名完全一致，并在整个 marketplace 中唯一。
3. 确认 Skill 目录包含在插件 `package.json.files` 中。
4. 将路径加入 `.omp-plugin/marketplace.json` 对应插件的 `skills` 数组，并保持整个数组按路径字典序排列。
5. 仅当该 Skill 直接支持某个工作流步骤时，才把它加入 `skills`。

Definitions 与完整人工 catalog 中的候选 Skill 不会由插件 lifecycle 预加载，也不会复制进 Main 的 runtime per-card reference。分析、判断、composition、协调阶段或可能委派任务先读取 workflow 导航索引；若当前 inventory 中的 domain Skill 拥有所需 method、evidence rule、verdict 或 format，acting Agent 在 PLAN 中声明它，并在 workflow references 前读取。纯机械字段 lookup 不读 Skill。

普通代码与 OMP Enhancer 自开发共享唯一通用过程 Skill `code-development`。它拥有本地检索、决策相关的官方与社区检索、Main 的 detailed parallel-slice plan、`plan` PLAN REVIEW、native `task`-owned vertical TDD、Main integration/broader verification/`MAIN REVIEW`、supplied semantic-diff review，以及 supported repair 后最多一次 fresh affected review。不要把这些阶段重新拆成多个顶层通用 Skill。只有目标是 OMP Enhancer、OMP plugin 或其 installed-runtime E2E 时，才继续读取该 Skill 的 `references/omp-enhancer.md`；这个条件 reference 保存 canonical/generated/package/installed truth、生成命令和隔离 E2E 方法，不是另一个 prompt-visible Skill。
`npm run check:marketplace` 会从文件系统重新推导 Skill 路径并检查顺序；Config 的 inventory 测试也从 marketplace 推导总清单，不维护容易漂移的手工计数。

OMP 17 的插件 Skill 自动发现只检查 `<plugin>/skills/` 的直接子目录，即 `<plugin>/skills/<skill>/SKILL.md`。更深的 `SKILL.md` 不会逐个注册到常驻系统提示。Config 因此把 `skills/ecc/SKILL.md` 暴露为一个顶层 `ecc-skill-catalog`：acting Agent 先检查 OMP 直接可见的 Skills；仅在没有合适项时读取 `skill://ecc-skill-catalog/catalog.md`；再按目录列出的 exact URI 读取最小匹配 guide，例如 `skill://ecc-skill-catalog/python-testing/SKILL.md`。禁止批量读取 255 个 guide，也不要猜嵌套 URI。

`.omp-plugin/marketplace.json` 的 `skills` 数组仍递归记录所有含 `SKILL.md` 的目录，包括 `./skills/ecc/<guide>`。这是供 repository validation 和显式调用的 `omp_core_install_skills` 兼容安装器使用的 filesystem inventory，不表示 OMP 17 在普通插件发现时直接注册每个嵌套 guide。

优先使用当前环境的 `skill-creator` scaffold 和 validator 创建新 Skill；删除模板 TODO，保持 frontmatter 描述包含清晰触发条件，并只创建真正需要的 scripts、references 或 assets。Skill 说明方法和证据，不应复制一套循环调度器。

## 生成目录

修改 definition 或 renderer 后运行：

```bash
npm run generate:workflows
npm run check:workflows
```

`generate:workflows` 会覆盖：

```text
plugins/omp-config/assets/WORKFLOW_CATALOG.md
plugins/omp-config/skills/omp-enhancer-workflows/SKILL.md
plugins/omp-config/skills/omp-enhancer-workflows/references/*.md
```

不要直接修改这个生成物。`check:workflows` 会做完整字节比较，并在文件缺失或漂移时失败。

因为 generator 重写整组共享输出，多个并行 definition/renderer source slices 不得各自运行它，也不得重叠声明 generated write set。Parallel plan 应让这些 source slices 先完成，再在后续 dependent wave 中安排一个 exclusive generation/integration slice；只有该 slice 的单一 owner 运行 generator、审查完整输出集合并提供 parity evidence。对 ECC catalog 或其他全量共享 generator 使用同一规则。

新增、删除 ECC guide，或修改其 frontmatter `name` / `description` 后运行：

```bash
npm run generate:ecc-skills
npm run check:ecc-skills
```

`generate:ecc-skills` 从 `plugins/omp-config/skills/ecc/*/SKILL.md` 重建顶层 `skills/ecc/SKILL.md` 和 `skills/ecc/catalog.md`；`check:ecc-skills` 对两个生成物做完整字节比较。生成器只把一个 `ecc-skill-catalog` 暴露给 OMP 17，并把 255 个 guide 的 exact URI 留在按需读取的 `catalog.md` 中。

新增、删除或改变工作流公开结构时，还要：

1. 在 `plugins/omp-enhancer-core/src/workflows/catalog.js` 增加 catalog version。
2. 检查完整 Markdown catalog 是否准确表达 scope、risk、Primary 条件、Add-on candidate 与可选 Agent 信息；检查 Skill index 只包含 exact ID、完整条件和 literal URI；检查单卡只包含 execution steps、可选 Agents/delegation、quality、scope 与 risk。完整 `skill://` URI 与三个 ID namespace 不得混淆。
3. 确认 managed `AGENTS.md` 和 `WATCHDOG.yml` 仍不 import 完整 catalog；分析、判断、composition、协调阶段或可能委派任务在 project inspection 前依次完成 index-only DISCOVER、公开完整的 exact `WORKFLOW PLAN` 与至少一条编号 Action、Skills/catalogs first 且 workflow references last 的 resource-only LOAD 并等待，以及 exact `WORKFLOW READY | ...`/TODO rebase；机械字段 lookup 无 Skill、marker 或 TODO。Event evaluator 应证明这些 marker 与 tool batch 的真实时序，而不是只匹配 final 文本。Substantive code mutation 还应观察 `plan` 完成后的 implementation wave、同 wave 独立 slices 的单次 native `task` `tasks[]` batch、host-observed completed delivery、Main broader verification 与 visible `MAIN REVIEW`、之后才发生的 native reviewer assignment，以及 supported repair 的 task delivery、第二次 Main review 和至多一次 fresh reviewer。每个 assignment 使用精确四键前缀并遵守 Agent 根 schema；child 不拥有 parent TODO。自主选择和 Advisor calibration 可以提示 TODO discipline，但不得新增 router、lifecycle gate、自动重试、fixed fan-out、强制委派、Agent、Skill candidate 或 blocker。
4. 只有用户层功能、安装方式或常用用法变化时才更新根 `README.md`；不要把完整 catalog 表复制回 README。

## 必跑验证

完整的自开发生命周期见 [OMP_ENHANCER_SELF_DEVELOPMENT.md](OMP_ENHANCER_SELF_DEVELOPMENT.md)，event-level E2E、fixture 和 failure interpretation 见 [WORKFLOW_E2E_TESTING.md](WORKFLOW_E2E_TESTING.md)。

工作流变更必须按 TDD 完成：Main 先规划独立 vertical slices；每个 native `task` 在自己的 exclusive write set 内先写会在旧实现上失败的目录、角色、Skill、权限或事件流断言并保存有效 RED，再做最小实现并用同一 focused command 得到 GREEN。仅检查标题存在不够；高风险 workflow 还要断言 `composeWith`、候选 Skills、关键 evidence、scope/risk 和 exact roles。Main 随后集成并运行生成、parity 与 broader checks。

最小工作流验证：

```bash
npm run check:workflows
npm run check:ecc-skills
node --test scripts/workflow-context-parity.test.js
npm test --workspace plugins/omp-enhancer-core
npm test --workspace plugins/omp-config
npm run check:marketplace
```

可以先做命令、隔离参数和 Matrix 结构预览；dry-run 不是 E2E 通过证据：

```bash
node scripts/e2e/run-installed-deepseek-workflow.mjs \
  --matrix scripts/e2e/fixtures/workflow-consolidation-installed.json \
  --dry-run
```

自我迭代场景的最小入口是 `npm run e2e:main:self-iteration -- --dry-run`；真实 pilot 和 repeat 参数以 E2E 指南为准。

真实 OMP 兼容验证还要实际启动 OMP，比较无扩展基线和工作树插件加载后的默认 prompt、active tools、Skills、Agents 和 managed import 状态：

```bash
node scripts/e2e/omp17-rpc-probe.mjs --
node scripts/e2e/omp17-rpc-probe.mjs -- \
  -e plugins/omp-enhancer-core/index.js --plugin-dir plugins/omp-enhancer-core \
  -e plugins/omp-config/index.js --plugin-dir plugins/omp-config \
  -e plugins/writing-helper/index.js --plugin-dir plugins/writing-helper \
  -e plugins/omp-test-enhancer/src/extension.ts --plugin-dir plugins/omp-test-enhancer \
  -e plugins/omp-fact-checker/index.js --plugin-dir plugins/omp-fact-checker
```

Probe 使用隔离的临时 OMP home，只输出 hash、字符数和结构布尔值，不输出完整 prompt 或配置秘密。不要把 `--no-extensions` 与 `-e` 或 `--plugin-dir` 组合；OMP 会同时禁用显式工作树扩展，使对照产生假阳性。默认 probe 不提交 prompt，因此它只验证静态 startup `systemPrompt`、task schema、active tools、完整 catalog import、OMP 原生 Agents，以及 `omp-enhancer-workflows` 和单个顶层 `ecc-skill-catalog` 的原生发现状态。

DeepSeek Flash 与 MiMo v2.5 的 runtime 断言由 Core hook 单测和行为矩阵负责：隐藏 custom hook 消息只进入对应 exact provider/model 的顶层 Main 任务一次；Skill discovery 仅在 OMP 暴露可见 Skills 时出现；workflow selection 仅在对应 Skill 可见时出现；原生 `task` active 且用户允许 Agent/委派时才可能出现 delegation 兼容消息。Staged evaluator 必须使用 assistant batch 与 tool result provenance，断言首个工具 batch 只有成功的 workflow index、公开完整的 exact `WORKFLOW PLAN`（四个唯一非空字段与编号 Action）位于 index result 之后且早于任何 resource/project call、资源 load 按 Skills/catalogs first 与 workflow references last 排序且不混入 project/`todo`/`task`、exact `WORKFLOW READY | ...` 位于全部资源 result 之后且早于 project call；旧单行 tuple 只保留解析兼容，不是新矩阵的目标格式；mechanical lookup 反向禁止 marker、Skill 与 TODO。Subagent-driven code evaluator 应使用双独立 slice fixture，要求 plan review completion、一次 parallel implementation batch、每个 child 的 host-observed delivery、Main 的 current-tree broader command 与 visible `MAIN REVIEW`、之后的 reviewer supplied input，以及 supported repair 后的 re-review。行为矩阵还应覆盖 owning domain Skill、Primary+Add-ons、assignment schema、失败/partial result、事实 claim tuple 和 no-delegation 边界。真实矩阵中的 slice 或 reviewer 数量是场景输入与模型行为，不是插件全局保证；消息也不得返回或替换 `systemPrompt`、改变 native task schema/active tools、提供或 autoload Skill。另用 `OMP_RPC_SETUP_COMMAND='/enhancer-tools enable core'` 验证只有显式命令才改变 active extension tools。

本地 link 或 upgrade 后，可用 `OMP_RPC_USE_HOST_INSTALLATION=1 node scripts/e2e/omp17-rpc-probe.mjs --` 只读检查实际 OMP home；该模式仍使用 `--no-session`，且只输出 hash 与结构布尔值，不调用模型。

如需继续运行 `scripts/e2e/run-installed-deepseek-workflow.mjs` 的行为矩阵，应把 TODO、task、Skill 和 Agent 事件解释为 OMP 自己的选择，而不是插件强制契约。脚本名称保留历史 DeepSeek 命名，但 `--model` 可覆盖整个矩阵。涉及外部写入的场景必须在临时目录中验证，或只做明确标为 preview 的 dry-run，不能为了 E2E 自动发布。

### 可选真实 OMP E2E

下面的行为矩阵在场景 prompt 中显式要求 TODO 和 task 元数据，用来验证 OMP 的原生执行接口；它不代表插件默认注入这些要求。工作树插件同时通过 entrypoint 和 plugin directory 加载，且不能与 `--no-extensions` 组合。DeepSeek/MiMo 比较是相同 matrix、thinking、repeat 和 evaluator 的两次独立运行，不是一次调用完成的 paired A/B wrapper，也不会自动产生模型差分结论：

```bash
node scripts/e2e/run-installed-deepseek-workflow.mjs \
  --matrix scripts/e2e/fixtures/workflow-consolidation-installed.json \
  --model opencode-go/deepseek-v4-flash --thinking high \
  --worktree-plugins --repeat 1 \
  --output .omp/e2e-results/workflow-deepseek
node scripts/e2e/run-installed-deepseek-workflow.mjs \
  --matrix scripts/e2e/fixtures/workflow-consolidation-installed.json \
  --model opencode-go/mimo-v2.5 --thinking high \
  --worktree-plugins --repeat 1 \
  --output .omp/e2e-results/workflow-mimo
```

模型 A/B 与 reminder-on/off A/B 不同；后者固定同一模型，并使用 `OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT=1` 或 `OMP_ENHANCER_DISABLE_MIMO_COMPAT=1` 抑制对应 reminder。

`--worktree-plugins` 自动使用一次性 HOME、agent state 与 session state，并只加载当前工作树插件。它以 SQLite backup API 快照活动 `agent.db`，播种当前 Config assets 的白名单运行子集，清除宿主 profile/XDG/auth-broker/path overrides，并在项目本地 registry 或 opaque extension source 可能造成重复加载时 fail closed。所有隔离 state 在 `finally` 删除；report 只暴露 `isolated: true` 和脱敏后的 `--session-dir=<isolated>`。相关 OAuth credential 在预计矩阵时长加安全余量内可能到期时，runner 会在模型调用前拒绝运行，以降低隔离副本刷新并轮换宿主 token 的风险。省略该 flag 才表示验证当前已安装插件态。

交付前全量验证：

```bash
npm test
cd plugins/omp-test-enhancer && bun run typecheck && bun run build
cd ../..
node scripts/e2e/omp17-rpc-probe.mjs --
npm run pack:all
git diff --check
```

Parity 测试负责检查：

- 生成 Markdown 与 Core renderer 完整一致；
- 普通代码目录只保留 `code.dev`，其唯一通用过程 Skill 是 `code-development`，roles 只有插件 `plan`、native `task` 与 native `reviewer`；`omp.plugin` 与 `code.dev` 不互相 compose，退役 workflow、Skill 和阶段型 Agent 不再出现在当前 inventory；
- optional Skill 的选择索引只暴露 exact ID、完整 choose 条件与 literal URI；每个单 workflow reference 只暴露分行 steps、可选 roles/delegation、quality、scope、risk 和 exact READY handoff，不再暴露 compose 图或 Skill topics；
- OMP 17 只直接发现一个 `ecc-skill-catalog` adapter；255 个嵌套 ECC guide 只能从 `catalog.md` 的 exact URI 按需读取；
- Main 与 Advisor managed blocks 都不导入共享目录；Main 提供 plan/load/TODO staged protocol 和条件式 trace，Advisor 提供至多一次、仅限首次 native `task` 或实质项目操作前的 `DECISION CHECK` 与低噪声 evidence/send-limit 指导，但不创建 gate 或 continuation；
- 所有打包 Agent/Skill 的 frontmatter 名全局唯一；插件角色在 marketplace 中恰好有一个打包所有者，OMP 原生 `designer`、`librarian`、`reviewer` 不得被插件打包；
- 根 README 保持简洁并链接当前 architecture、development 和 workflow guides；catalog 完整性由生成资产与可选 Skill 校验。

## 发布与安装态同步

通用 release transaction、版本基线、远端验证和本地升级步骤统一维护在 [`DEVELOPMENT.md`](DEVELOPMENT.md#release-transaction)。Workflow 变更只需要额外判断受影响插件：

- definition 或 renderer 变化：`omp-enhancer-core`。
- 生成的共享 Markdown 变化：`omp-config`。
- 新 Agent 或 Skill：其所属插件。
- 不要为了方便使用 `--plugin all`，除非所有插件都确实变化。

工作流 definition 或 renderer 的变更通常同时影响 Core 源码和 Config 生成物，因此这两个插件都需要独立发布。先逐个预览版本变更：

```bash
npm run release -- --plugin omp-enhancer-core --bump patch --dry-run
npm run release -- --plugin omp-config --bump patch --dry-run
```

确认计划后逐个应用，并重新执行完整验证：

```bash
npm run release -- --plugin omp-enhancer-core --bump patch --apply
npm run release -- --plugin omp-config --bump patch --apply
npm test
npm run check:ecc-skills
npm run check:marketplace
npm run pack:all
git diff --check
```

发布和升级完成后，在新 session 中确认 catalog version、可选 Skill 和动态 Agents。需要同步 Config context 时，先执行 `/enhancer-tools enable config`，以 `apply: false` 调用 `omp_config_sync_workflow_context`；审查结果后才决定是否使用 `apply: true`。单纯升级 Config 不会自动覆盖用户文件。

## 删除工作流或公开能力

删除前必须同时确认：

1. 普通运行时无引用；
2. 公开工具和状态恢复无引用；
3. 不是 OMP 通过目录约定发现的 asset、agent、skill、command、hook 或 adapter；
4. marketplace、README、生成目录和测试均已更新；
5. 全量验证通过。

已退役的 router、route policy、classifier、runtime policy、legacy adapter 和旧 review gate alias 不得重新引入。需要读取旧 session entry 时，在最窄的 state-sanitization 边界处理并丢弃旧控制字段，不能恢复旧执行语义。
