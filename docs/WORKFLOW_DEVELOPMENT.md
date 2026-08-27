# Workflow Development Guide

本指南说明如何在 OMP Enhancer 中新增或修改可选工作流参考。目标是让一次修改只有一个语义来源，并让生成资产、可选 Skill、Agents、marketplace 和安装态保持一致，同时不覆盖 OMP 的原生工作流。

## 架构原则

当前工作流采用“OMP 原生运行 + 可选参考”的模型：

- 默认 lifecycle 不注入或替换 `systemPrompt`，不激活工具，也不改写子 Agent assignment。任务记录为 `agent-selected`，不预选 workflow、Skill、tool 或 Agent。
- 所有顶层 Main 模型的任务各保留一次 capability-gated one-shot orchestration advisory（`OMP_ORCHESTRATION`）。Main 使用 `ANALYZE -> EXECUTE -> REVIEW` 三阶段 advisory：EXECUTE 直接做或委派 `task`/领域 Agent，REVIEW 直接做或委派 `reviewer`。没有插件强制 delegation 宽度、Agent 选择或阶段顺序；非平凡任务可以读取 `skill://omp-enhancer-workflows` 的 3 域参考目录（writing、research、visual），纯机械字段 lookup 不读 Skill 或建立 TODO。
- `omp-enhancer-workflows` Skill 提供精简选择索引和每个域一张的按需参考卡。索引按域行暴露最小 Skill 发现信息：`D` 是顶层 exact URI；它们只是 optional candidates、绝不是 load sets。Acting Agent 仍根据完整条件自主选择、组合、简化或忽略卡片与候选方法；项目不存在介入默认 Main 运行路径的 router 或 classifier。
- Workflow definition 只描述建议步骤和资源，不授予写入、联网、测试、发布或其他权限。
- Advisor 不自动导入完整目录，也不得因目录内容形成完成门；它的 managed block 与 Main block 一样只声明 `ANALYZE -> EXECUTE -> REVIEW` advisory。
- Skills 是候选项，只有 acting Agent 判断有用且 OMP 当前可用时才加载。
- Agent ID 是可选候选。使用前必须以 OMP 当前动态 Agent inventory 为准；managed prompt 可以要求 Main 明确和更新自己的 TODO，但目录本身不能创建 runtime TODO gate、强制委派或预选角色。

## 文件布局
```text
scripts/workflow-definitions.js   # 语义来源：writing、research、visual 三域定义
scripts/workflow-schema.js        # definition 校验
scripts/workflow-render.js        # Markdown 渲染
scripts/generate-workflow-catalog.js

plugins/omp-config/assets/WORKFLOW_CATALOG.md      # 生成物，禁止手改
plugins/omp-config/skills/omp-enhancer-workflows/ # 生成的选择索引与每域一张 reference
scripts/workflow-context-parity.test.js
```

definitions 是唯一语义来源。Config 不在运行时依赖生成器；它只打包生成后的 Markdown 资产和 Skill 文件。`AGENTS.md` 与 `WATCHDOG.yml` 的 managed blocks 都声明 OMP 原生权威并指向可选 Skill，不自动 import `WORKFLOW_CATALOG.md`。

## Definition 结构

Catalog version 34 只有 3 张域卡（`writing`、`research`、`visual`）。新增域需要会商后再增加 catalog version。示例：

```js
{
  "id": "visual",
  "chooseWhen": "Diagrams (draw.io), UI/UX design, visual artifacts, slides with visual layout, or rendered figure review.",
  "skills": ["drawio-skill", "frontend-design", "canvas-design"],
  "catalogSkills": [],
  "roles": ["designer", "visioner"],
  "suggestedFlow": [
    "Clarify diagram type, format, and rendering requirements.",
    "designer draws the diagram once with drawio-skill and exports a draft PNG.",
    "visioner reviews that exported PNG read-only in one pass.",
    "designer applies at most one fix round and re-exports.",
    "Verify and report with limitations."
  ],
  "scopeNotes": [
    "drawio-skill from the 365-skills marketplace is the single diagram pipeline.",
    "QA is one visioner pass plus at most one fix round; no repeated iteration rounds."
  ]
}
```

字段规则：

- `id`：全局唯一、稳定、小写；catalog v34 只有 3 个 ID（`writing`、`research`、`visual`），发布后不要随意改名。
- `chooseWhen`：描述用户可观察的选择条件，不写关键词路由规则。
- `skills`：精确 Skill frontmatter 名，只列直接支持该域方法的候选项。
- `catalogSkills`：保留字段，当前恒为空数组。
- `roles`：可选 Agent 候选名；可以引用 OMP 原生 Agent，也可以引用 marketplace 中唯一打包的插件 Agent。角色不绑定步骤；Main 按复杂度决定是否以及何时委派。
- `suggestedFlow`：建议执行顺序的自由文本数组，不包含 step ID、强制 actor 或强制顺序。
- `scopeNotes`：记录边界、非目标和授权分离。

Schema 会拒绝未知字段、重复 ID、重复资源名、不是 `skills` 子集的 `catalogSkills`，以及要求为数组却缺失或为空的情况。旧 schema 的 `steps`、`delegation`、`composeWith`、`qualityChecks`、`riskNotes` 等字段不是合法字段，不得重新引入。

## 选择与组合设计

工作流是 3 个可选域，一次任务通常匹配一个域：

1. 主结果或操作：正文起草、修订、翻译或格式转换选 `writing`；事实核查、调研、对比或建议选 `research`；图表、UI/UX、视觉 artifact 或带视觉布局的 slides 选 `visual`。

不要在一个卡片中复制另一个卡片的全部流程；3 个域互不包含对方的方法。Main 的紧凑索引只暴露每域的候选 Skill 与单卡 reference，不暴露组合图。

写作有额外规则：`writing` 域不区分语言 workflow——根据目标正文语言加载对应语言 Skill，并按请求格式加载格式 Skill。`writer` 和 `zh-writer` 始终 proposal-only，只用 `read`、`grep`、`glob` 读取证据并返回完整 proposed replacement、SEARCH/REPLACE 或 unified diff；`checker` 和 `zh-checker` 没有 `write` 或 `edit`，除本地只读工具外可使用受 host/user 网络权限约束的 `web_search` 做证据核查，并只返回 in-band report。Main 独自完成 finding disposition：接受至少一个 finding 时 dispatch writer/zh-writer 做 corrected proposal，接受零个 finding 时不 dispatch，记录 `resolved-no-repair`，绝不 rewrite、drop 或 abandon。完整 proposal/report 放入 terminal child delivery；若宿主没有专用 terminal handoff，ordinary final response 就是该 host-neutral delivery。Main 独自决定和执行任何获授权的文件持久化。Writer 和 checker 只消费 committed assignment 中冻结的 Skills，不在 child 内再次发现、选择或加载 Skill。

## 添加或引用 Agent

先确认所需能力是否已经由 OMP 原生 Agent 提供。`designer`、`librarian` 和 `reviewer` 属于 OMP 原生 Agent，插件不得用同名 frontmatter 覆盖它们。Config 提供的通用只读 `analyzer` Agent（绑定 plan 模型）可审 supplied plan 并返回 challenge findings；它不编辑文件、不运行有状态命令、不执行自己产出的计划。目录可以把现有 Agent 列为可选候选，但运行时必须服从 OMP 当前动态 Available Agents 列表。

只有确实需要独立能力或权限边界时才添加插件 Agent：

1. 在拥有该角色的插件 `agents/` 下创建唯一的 `<agent-id>.md`，使用清晰的插件特定名称，并说明为什么当前原生 Agent 与 Skill 不能承担该边界。
2. Frontmatter `name` 必须与 definition 中的角色完全一致，并在整个 marketplace 中唯一，且不能碰撞 OMP 原生 Agent。
3. 把 `agents` 加入该插件的 `package.json.files`；已有插件通常已经配置。
4. 在工作流 `roles` 中登记；角色不绑定步骤，Main 按复杂度决定委派时机。
5. Reviewer、visioner、checker 或 auditor 应保持独立、只读，除非角色契约明确允许修改。Writing Helper 的 `writer` 和 `zh-writer` 固定为 `read`、`grep`、`glob` 且只能交付 proposal；`checker` 和 `zh-checker` 无 `write`/`edit`，可在宿主许可下用 `web_search` 核查证据且只能交付 report。文件修改始终由 Main 执行。

普通 code-mutation workflow 只列只读 `analyzer`、native `task` 和 native `reviewer`。`explore`、`implementation-task`、`config-librarian`、`omp-target-auditor`、`test-planner`、`test-executor` 和 `test-reviewer` 已退役；Main 负责本地检索、parallel-wave 计划、集成、broader verification、显式 `MAIN REVIEW` 和 finding disposition，native `task` 负责完整 test-and-production slice 及 supported repair。不要使用 OMP 当前 inventory 中不存在的推测名称。任何卡片都只是建议；Agent 不可用、capacity 不足、input 不完整或 write set 无法安全拆分时记录 limitation，并采用宿主允许的最安全 fallback，不得把 `roles` 变成强制 fork、fixed fan-out 或 completion gate。

### Agent 还是 Skill

新增专业领域时先判断是否产生新的权限或独立证据边界：

- 如果只是语言、框架、数据库、构建或领域知识，优先复用 OMP 当前提供的原生 Agent，并新增或复用 Skill。
- 只有职责确实需要不同能力边界时才新增 Agent。例如开源 staging writer、只读 sanitizer 和 packager 的文件权限不同，因此可以保留为不同角色。
- 一个领域 diff reviewer 不应仅因“懂数据库”或“懂 ML”而复制 canonical `reviewer`；已有 semantic diff 仍交给 native `reviewer` 并按需加载领域 Skill，未形成 diff 的 bounded target review 由 Main 直接完成。
- OMP 和 acting Agent 保留 workflow 编排所有权。插件 Agent 禁止通过 `spawns: "*"` 抢占动态调度；任何 spawn 目标都必须在当前环境真实可用，且目录本身不能触发隐藏的二次编排。
- 每个 child 只消费 assignment 冻结的 Skill 集合和完整 bounded input，不重新运行 workflow/Skill discovery，不自行选择或加载另一套 Skill。每次 native `task` call 都必须提供非空顶层 `context`，但 outer context、name 或 label 不能替代每个 item body。缺少方法或输入时返回具体 limitation，由 Main 决定是否 rebase。
- 删除 wrapper 前先把其方法迁入 Skill，更新所有 active `SKILL.md` 中的旧 ID，并保留历史 state fixture 作为兼容证据。

当前 catalog 不提供 healthcare workflow。医疗、隐私或合规类 Skill 只能作为普通 research、fact-check、security 或 review workflow 的可选知识层，不得暗示存在未打包的医疗 Agent。

## 添加 Skill

1. 在所属插件 `skills/<skill-name>/SKILL.md` 中创建 Skill。
2. Frontmatter `name` 必须与 definition 中的候选名完全一致，并在整个 marketplace 中唯一。
3. 确认 Skill 目录包含在插件 `package.json.files` 中。
4. 将路径加入 `.omp-plugin/marketplace.json` 对应插件的 `skills` 数组，并保持整个数组按路径字典序排列。


OMP 17 的插件 Skill 自动发现只检查 `<plugin>/skills/` 的直接子目录，即 `<plugin>/skills/<skill>/SKILL.md`。`D` 候选都是这类直接可见 Skill，按需读取 exact URI 即可。


`.omp-plugin/marketplace.json` 的 `skills` 数组递归记录所有含 `SKILL.md` 的目录，供 repository validation 使用的 filesystem inventory。

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

新增、删除或改变工作流公开结构时，还要：

1. 在 `scripts/workflow-definitions.js` 增加 catalog version。
2. 检查完整 Markdown catalog 是否准确表达每个域的 chooseWhen、Skills、Agent candidates、Suggested flow 与 Scope notes；检查 Skill index 包含 exact ID、完整 chooseWhen 条件、`D`/`C` exact URI、单卡 reference URI 与各 Agent 的一行描述，顶部声明 `ANALYZE -> EXECUTE -> REVIEW`；检查单卡只包含 When、Skills、Agent candidates（不含 Suggested flow 与 Scope notes）。完整 `skill://` URI 与三个 ID namespace 不得混淆。
3. 确认 managed `AGENTS.md` 和 `WATCHDOG.yml` 仍不 import 完整 catalog；非平凡任务遵循 `ANALYZE -> EXECUTE -> REVIEW`，需要方法细节时读取 `skill://omp-enhancer-workflows` 并加载匹配 Skill；机械字段 lookup 无 Skill 或 TODO。Event evaluator 应证明这些读取与 tool batch 的真实时序，而不是只匹配 final 文本。Substantive code mutation 还应观察 analyzer（如委派）完成后的 implementation wave、同 wave 独立 slices 的单次 native `task` `tasks[]` batch、host-observed completed delivery、Main broader verification 与 visible `MAIN REVIEW`、之后才发生的 native reviewer assignment，以及 supported repair 的 task delivery、第二次 Main review 和至多一次 fresh reviewer。每个 assignment 携带完整 bounded input 与非空顶层 `context`；child 不拥有 parent TODO，只消费冻结 Skills，不进行二次 discovery/selection/load。自主选择和 Advisor calibration 可以提示 TODO discipline，但不得新增 router、lifecycle gate、自动重试、fixed fan-out、强制委派、Agent、Skill candidate 或 blocker。
4. 只有用户层功能、安装方式或常用用法变化时才更新根 `README.md`；不要把完整 catalog 表复制回 README。

## 必跑验证

完整的自开发生命周期见 [OMP_ENHANCER_SELF_DEVELOPMENT.md](OMP_ENHANCER_SELF_DEVELOPMENT.md)，event-level E2E、fixture 和 failure interpretation 见 [WORKFLOW_E2E_TESTING.md](WORKFLOW_E2E_TESTING.md)。

工作流变更必须按 TDD 完成：Main 先规划独立 vertical slices；每个 native `task` 在自己的 exclusive write set 内先写会在旧实现上失败的目录、角色、Skill、权限或事件流断言并保存有效 RED，再做最小实现并用同一 focused command 得到 GREEN。仅检查标题存在不够；高风险 workflow 还要断言 chooseWhen、候选 Skills、关键 evidence、scopeNotes 和 exact roles。Main 随后集成并运行生成、parity 与 broader checks。

最小工作流验证：

```bash
npm run check:workflows
node --test scripts/workflow-context-parity.test.js
npm test --workspace plugins/omp-config
npm run check:marketplace
```

可以先做命令、隔离参数和 Matrix 结构预览；dry-run 不是 E2E 通过证据：

```bash
node scripts/e2e/run-installed-workflow.mjs \
  --matrix scripts/e2e/fixtures/workflow-consolidation-installed.json \
  --dry-run
```

自我迭代场景的最小入口是 `npm run e2e:main:self-iteration -- --dry-run`；真实 pilot 和 repeat 参数以 E2E 指南为准。

真实 OMP 兼容验证还要实际启动 OMP，比较无扩展基线和工作树插件加载后的默认 prompt、active tools、Skills、Agents 和 managed import 状态：

```bash
node scripts/e2e/omp17-rpc-probe.mjs -- \
  -e plugins/omp-config/index.js --plugin-dir plugins/omp-config \
  -e plugins/writing-helper/index.js --plugin-dir plugins/writing-helper \
  -e plugins/omp-fact-checker/index.js --plugin-dir plugins/omp-fact-checker
```

Probe 使用隔离的临时 OMP home，只输出 hash、字符数和结构布尔值，不输出完整 prompt 或配置秘密。不要把 `--no-extensions` 与 `-e` 或 `--plugin-dir` 组合；OMP 会同时禁用显式工作树扩展，使对照产生假阳性。默认 probe 不提交 prompt，因此它只验证静态 startup `systemPrompt`、task schema、active tools、OMP 原生 Agents，以及 `omp-enhancer-workflows` 的原生发现状态。


本地 link 或 upgrade 后，可用 `OMP_RPC_USE_HOST_INSTALLATION=1 node scripts/e2e/omp17-rpc-probe.mjs --` 只读检查实际 OMP home；该模式仍使用 `--no-session`，且只输出 hash 与结构布尔值，不调用模型。

如需继续运行 `scripts/e2e/run-installed-workflow.mjs` 的行为矩阵，应把 TODO、task、Skill 和 Agent 事件解释为 OMP 自己的选择，而不是插件强制契约。`--model` 可覆盖整个矩阵。涉及外部写入的场景必须在临时目录中验证，或只做明确标为 preview 的 dry-run，不能为了 E2E 自动发布。

### 可选真实 OMP E2E

下面的行为矩阵在场景 prompt 中显式要求 TODO 和 task 元数据，用来验证 OMP 的原生执行接口；它不代表插件默认注入这些要求。工作树插件同时通过 entrypoint 和 plugin directory 加载，且不能与 `--no-extensions` 组合。不同模型的比较是相同 matrix、thinking、repeat 和 evaluator 的两次独立运行，不是一次调用完成的 paired A/B wrapper，也不会自动产生模型差分结论：

```bash
node scripts/e2e/run-installed-workflow.mjs \
  --matrix scripts/e2e/fixtures/workflow-consolidation-installed.json \
  --model <user-chosen> --thinking high \
  --worktree-plugins --repeat 1 \
  --output .omp/e2e-results/workflow-run
```

模型 A/B 与 reminder-on/off A/B 不同；后者固定同一模型，并使用 `OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER=1` 抑制 reminder。Protocol coach 已删除，不存在 coach 对照。

`--worktree-plugins` 自动使用一次性 HOME、agent state 与 session state，并只加载当前工作树插件。它以 SQLite backup API 快照活动 `agent.db`，播种当前 Config assets 的白名单运行子集，清除宿主 profile/XDG/auth-broker/path overrides，并在项目本地 registry 或 opaque extension source 可能造成重复加载时 fail closed。所有隔离 state 在 `finally` 删除；report 只暴露 `isolated: true` 和脱敏后的 `--session-dir=<isolated>`。相关 OAuth credential 在预计矩阵时长加安全余量内可能到期时，runner 会在模型调用前拒绝运行，以降低隔离副本刷新并轮换宿主 token 的风险。省略该 flag 才表示验证当前已安装插件态。

交付前全量验证：

```bash
npm test
node scripts/e2e/omp17-rpc-probe.mjs --
npm run pack:all
git diff --check
```

Parity 测试负责检查：

- 生成 Markdown 与 renderer 完整一致；
- definitions、catalog、index 和单卡保持 7 字段 schema parity（`id`、`chooseWhen`、`skills`、`catalogSkills`、`roles`、`suggestedFlow`、`scopeNotes`），没有任何 steps/delegation/composeWith 字段；
- Main 与 Advisor managed blocks 都不导入共享目录；Main 提供 `ANALYZE -> EXECUTE -> REVIEW` orchestration advisory 与非平凡任务的域目录指引，Advisor 提供同一 advisory 的 advisor 版本，但不创建 gate 或 continuation；
- 所有打包 Agent/Skill 的 frontmatter 名全局唯一；插件角色在 marketplace 中恰好有一个打包所有者，OMP 原生 `designer`、`librarian`、`reviewer` 不得被插件打包；
- 根 README 保持简洁并链接当前 architecture、development 和 workflow guides；catalog 完整性由生成资产与可选 Skill 校验。

## 发布与安装态同步

通用 release transaction、版本基线、远端验证和本地升级步骤统一维护在 [`DEVELOPMENT.md`](DEVELOPMENT.md#release-transaction)。Workflow 变更只需要额外判断受影响插件：

- definition 或 renderer 变化：`scripts/workflow-definitions.js` 属于仓库级脚本，不随插件发布。
- 生成的共享 Markdown 变化：`omp-config`。
- 新 Agent 或 Skill：其所属插件。
- 不要为了方便使用 `--plugin all`，除非所有插件都确实变化。

先逐个预览版本变更：

```bash
npm run release -- --plugin omp-config --bump patch --dry-run
```

确认计划后逐个应用，并重新执行完整验证：

```bash
npm run release -- --plugin omp-config --bump patch --apply
npm test
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
