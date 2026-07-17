# Workflow Development Guide

本指南说明如何在 OMP Enhancer 中新增或修改可选工作流参考。目标是让一次修改只有一个语义来源，并让生成资产、可选 Skill、Agents、marketplace 和安装态保持一致，同时不覆盖 OMP 的原生工作流。

## 架构原则

当前工作流采用“OMP 原生运行 + 可选参考”的模型：

- 默认 lifecycle 不注入或替换 `systemPrompt`，不激活工具，也不改写子 Agent assignment。唯一的隐藏上下文例外只适用于精确 `opencode-go/deepseek-v4-flash` 的顶层 Main 任务，并且每个活跃任务至多发送一次 custom hook 消息。其持久化 attribution 为 `user`，但 OMP 会把普通的非 Skill custom hook 消息作为补充 developer context 提供给模型，因此消息正文明确服从用户指令与全部 OMP 原生契约。消息按 OMP 当前能力独立组合：有可见 Skills 时先提供既有 Skill discovery reminder；原生 `task` 处于 active 状态且用户没有禁止 Agent 或委派时，再提供简短 `DEEPSEEK_DELEGATION_HINT`，提醒模型真正执行 OMP 自己的 scope 和 delegation 判断，而不是只描述判断。在 native preferred mode 中，它只会在 OMP 原生 direct/mechanical、依赖、前置条件和 already-enumerated 规则都处理完毕后，把 OMP 已有的 SHOULD 级委派偏好作为并列合法选项之间的 tie-breaker，不把该偏好升级为新 gate 或 MUST。只有唯一 canonical OMP Delegation section 自己同时确认 batch `tasks[]` 和数值并发上限 $N \geq 2$ 时，Core 才追加这些当前原生能力事实：2 到 $N$ 个真正独立、可运行的 slices 对应一个 batch 中每 slice 一个 assignment。flat、歧义、未知、未给数值的 unlimited 或 cap-one 配置不会收到该事实，超过 $N$ 的宽度仍完全由 OMP 决定。该 hint 不固定全局 fan-out、检查次数或 task wire shape，也不以插件流程替换原生策略。两者都不存在时不发送。该消息不创造 Agent、工具、权限、workflow、完成门、repair turn 或 automatic continuation；OMP 的原生系统提示、task schema、并发限制、动态 Available Agents、用户范围、验证要求、权限、审批、结果交付和完成行为始终权威。其他模型、子 Agent 和 Advisor 不接收该消息。
- 需要同进程配置做 A/B 诊断时，可设置 `OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT=1`，只关闭上述 custom compatibility message；Core 和其他 OMP 能力仍正常加载。默认不开启这个禁用开关。
- `task-descriptor.js` 只提取 operation、domains、约束、目标、阶段、风险和正文语言等 JSON-safe 事实，供状态记录和显式兼容诊断使用。
- `omp-enhancer-workflows` Skill 提供完整目录索引和按领域拆分的参考卡片。acting Agent 可以选择、组合、简化或忽略；legacy router 和 classifier 只是显式兼容诊断，不得成为主运行时选择器。
- Workflow definition 只描述建议步骤和资源，不授予写入、联网、测试、发布或其他权限。
- Advisor 不自动导入完整目录，也不得因目录内容形成完成门；它可以像其他 Agent 一样在有用时参考可选 Skill。
- Skills 是候选项，只有 acting Agent 判断有用且 OMP 当前可用时才加载。
- Agent ID 是可选候选。使用前必须以 OMP 当前动态 Agent inventory 为准；目录不能强制 TODO、委派、角色或顺序。

## 文件布局

```text
plugins/omp-enhancer-core/src/workflows/
├── schema.js
├── catalog.js
├── render-main.js
├── render-shared-markdown.js
├── render-skill.js
├── legacy-adapter.js
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

plugins/omp-enhancer-core/src/workflow-routes.js  # 兼容 re-export facade
plugins/omp-config/assets/WORKFLOW_CATALOG.md      # 生成物，禁止手改
plugins/omp-config/skills/omp-enhancer-workflows/ # 生成的可选 Skill 与领域 references
plugins/omp-config/skills/ecc/SKILL.md             # 顶层 ecc-skill-catalog adapter，生成物
plugins/omp-config/skills/ecc/catalog.md           # 255 个嵌套 ECC guide 的按需索引，生成物
scripts/generate-workflow-catalog.js
scripts/generate-ecc-skill-catalog.js
scripts/workflow-context-parity.test.js
```

Core definitions 是唯一语义来源。Config 不在运行时依赖 Core；它只打包生成后的 Markdown 资产和 Skill 文件。`AGENTS.md` 与 `WATCHDOG.yml` 的 managed blocks 只声明 OMP 原生权威并指向可选 Skill，不自动 import `WORKFLOW_CATALOG.md`。

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
      "text": "Have the designer create the diagram."
    },
    {
      "id": "step-3",
      "text": "Have the visioner inspect fresh rendered evidence."
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
- `steps`：每一步有稳定 `step-*` ID 和一个可验收动作。后续插入步骤时保留既有 ID，避免让子任务元数据失效。
- `scopeNotes`：记录边界、非目标和授权分离。
- `skills`：精确 Skill frontmatter 名，只列直接支持某一步的候选项。
- `qualityChecks`：能够由文件、命令结果、渲染物、来源或独立审查证明的检查。
- `riskNotes`：只描述风险和验证要求，不复制宿主权限系统。
- `roles`：可选 Agent 候选名；可以引用 OMP 原生 Agent，也可以引用 marketplace 中唯一打包的插件 Agent。每个候选角色都必须在 `delegation` 中有职责。
- `delegation`：绑定 step ID、actor 和可选 duty。它是委派建议，不要求 acting Agent 创建子任务；没有角色时表示该卡片不提出 Agent 候选。

Schema 会拒绝未知字段、重复 ID、未知组合目标、重复资源名、未知或缺失的 delegation step ID、没有职责的角色，以及无角色却要求泛化委派的卡片。`steps-2-4` 之类的范围只适用于真实存在的连续数字 ID；自定义 ID 必须用 `step-alpha:` 形式精确引用。

## 选择与组合设计

工作流是可组合维度，不是互斥类别。通常按下面顺序设计：

1. 主结果：例如 `code.dev`、`research.web` 或 `slides.generate`。
2. 内容语言和格式：例如 `writing.en + writing.latex`。
3. 专项验证：例如 `code.test`、`security.review` 或 `factcheck.document`。
4. 项目领域：例如 `omp.plugin`。
5. 生命周期动作：只有用户明确要求时才组合 `release.publish`。

不要在一个卡片中复制另一个卡片的全部流程。用 `composeWith` 建立关系，并在步骤或 scope 中说明组合点。

写作有额外规则：普通修改根据目标正文选择 `writing.zh` 或 `writing.en`；路径存在但正文尚未观察时先使用 `writing.pending`；翻译或显式输出语言根据目标语言；格式工作流不能代替语言工作流。

## 添加或引用 Agent

先确认所需能力是否已经由 OMP 原生 Agent 提供。`designer`、`librarian` 和 `reviewer` 属于 OMP 原生 Agent，插件不得用同名 frontmatter 覆盖它们。目录可以把它们列为可选候选，但运行时必须服从 OMP 当前动态 Available Agents 列表。

只有确实需要独立能力或权限边界时才添加插件 Agent：

1. 在拥有该角色的插件 `agents/` 下创建唯一的 `<agent-id>.md`，使用清晰的插件特定名称；例如 Config 的只读目标审计角色是 `omp-target-auditor`。
2. Frontmatter `name` 必须与 definition 中的角色完全一致，并在整个 marketplace 中唯一，且不能碰撞 OMP 原生 Agent。
3. 把 `agents` 加入该插件的 `package.json.files`；已有插件通常已经配置。
4. 在工作流 `roles` 中登记，并在 `delegation` 中绑定明确步骤和仅负责的 checkpoint。
5. Reviewer、visioner、checker 或 auditor 应保持独立、只读，除非角色契约明确允许修改。

不要使用 OMP 当前 inventory 中不存在的推测名称。任何卡片都只是建议，不得因为有 `roles` 就强制 fork，也不得因为没有 `roles` 就创造隐式角色。

### Agent 还是 Skill

新增专业领域时先判断是否产生新的权限或独立证据边界：

- 如果只是语言、框架、数据库、构建或领域知识，优先复用 OMP 当前提供的原生 Agent，并新增或复用 Skill。
- 只有职责确实需要不同能力边界时才新增 Agent。例如开源 staging writer、只读 sanitizer 和 packager 的文件权限不同，因此可以保留为不同角色。
- 一个领域 reviewer 不应仅因“懂数据库”或“懂 ML”而复制 canonical `reviewer`；让同一个只读 reviewer 加载对应 Skill。
- OMP 和 acting Agent 保留 workflow 编排所有权。插件 Agent 禁止通过 `spawns: "*"` 抢占动态调度；任何 spawn 目标都必须在当前环境真实可用，且目录本身不能触发隐藏的二次编排。
- 删除 wrapper 前先把其方法迁入 Skill，更新所有 active `SKILL.md` 中的旧 ID，并保留历史 state fixture 作为兼容证据。

当前 catalog 不提供 healthcare workflow。医疗、隐私或合规类 Skill 只能作为普通 research、fact-check、security 或 review workflow 的可选知识层，不得暗示存在未打包的医疗 Agent。

## 添加 Skill

1. 在所属插件 `skills/<skill-name>/SKILL.md` 中创建 Skill。
2. Frontmatter `name` 必须与 definition 中的候选名完全一致，并在整个 marketplace 中唯一。
3. 确认 Skill 目录包含在插件 `package.json.files` 中。
4. 将路径加入 `.omp-plugin/marketplace.json` 对应插件的 `skills` 数组，并保持整个数组按路径字典序排列。
5. 仅当该 Skill 直接支持某个工作流步骤时，才把它加入 `skills`。

Workflow card 中的候选 Skill 不会由插件 lifecycle 预加载。acting Agent 通过 OMP 原生 Skill 机制检查当前 inventory，并只选用适用项。
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

新增、删除 ECC guide，或修改其 frontmatter `name` / `description` 后运行：

```bash
npm run generate:ecc-skills
npm run check:ecc-skills
```

`generate:ecc-skills` 从 `plugins/omp-config/skills/ecc/*/SKILL.md` 重建顶层 `skills/ecc/SKILL.md` 和 `skills/ecc/catalog.md`；`check:ecc-skills` 对两个生成物做完整字节比较。生成器只把一个 `ecc-skill-catalog` 暴露给 OMP 17，并把 255 个 guide 的 exact URI 留在按需读取的 `catalog.md` 中。

新增、删除或改变工作流公开结构时，还要：

1. 在 `plugins/omp-enhancer-core/src/workflows/catalog.js` 增加 catalog version。
2. 更新根 `README.md` 的 catalog version 和工作流表。
3. 检查 Markdown 资产、Skill 索引和对应领域 reference 是否都准确表达新增的 scope、risk、composition 或可选 Agent 信息。
4. 确认 managed `AGENTS.md` 和 `WATCHDOG.yml` 仍不 import 完整 catalog，且没有新增强制 TODO、委派、Agent、Skill 或执行顺序。

## 必跑验证

工作流变更必须按 TDD 完成：先写会在旧实现上失败的目录、角色、Skill、权限或事件流断言并保存 RED 证据，再做最小实现。仅检查标题存在不够；高风险 workflow 还要断言 `composeWith`、候选 Skills、关键 evidence、scope/risk 和 exact roles。

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

Probe 使用隔离的临时 OMP home，只输出 hash、字符数和结构布尔值，不输出完整 prompt 或配置秘密。不要把 `--no-extensions` 与 `-e` 或 `--plugin-dir` 组合；OMP 会同时禁用显式工作树扩展，使对照产生假阳性。默认 probe 不提交 prompt，因此它只验证静态 startup `systemPrompt`、task schema、active tools、完整 catalog import、OMP 原生 Agents，以及 `omp-enhancer-workflows` 和单个顶层 `ecc-skill-catalog` 的原生发现状态。DeepSeek Flash 的 runtime 断言由 Core hook 单测、`npm run e2e:deepseek:skills` 和 `npm run e2e:deepseek:subagents` 负责：隐藏 custom hook 消息只进入精确模型的顶层 Main 任务一次；Skill discovery 仅在 OMP 暴露可见 Skills 时出现；原生 `task` active 且用户允许 Agent/委派时才可能出现兼容消息。全局 no-delegation 同时抑制实现和审查建议；仅禁止 implementation delegation 时不提供通用 fan-out hint 或实现角色，但可以保留用户明确要求的独立审查 checkpoint 建议。动态 reviewer-width 只是一条初始、非约束性的 0–3 建议：确定性 hook 测试必须验证其任务事实、用户 no-review 约束、可信 native capacity、一次性注入和 advisory-only 文本；真实行为矩阵中的 `task`、fork 或 reviewer 数量只记录模型行为，不能作为插件保证或 correctness gate。测试还要证明消息不返回 `systemPrompt`、不改变原生 task schema 或 active tools、不提供/autoload Skill，并且不会出现在其他模型、子 Agent 或 Advisor turn；还要覆盖 flat/batch task schema 的兼容措辞与自然语言 no-delegation 边界。另用 `OMP_RPC_SETUP_COMMAND='/enhancer-tools enable core'` 验证只有显式命令才改变 active extension tools。

本地 link 或 upgrade 后，可用 `OMP_RPC_USE_HOST_INSTALLATION=1 node scripts/e2e/omp17-rpc-probe.mjs --` 只读检查实际 OMP home；该模式仍使用 `--no-session`，且只输出 hash 与结构布尔值，不调用模型。

如需继续运行 `scripts/e2e/run-installed-deepseek-workflow.mjs` 的行为矩阵，应把 TODO、task、Skill 和 Agent 事件解释为 OMP 自己的选择，而不是插件强制契约。涉及外部写入的场景必须在临时目录中验证，或只做明确标为 preview 的 dry-run，不能为了 E2E 自动发布。

### 可选真实 OMP E2E

下面的行为矩阵在场景 prompt 中显式要求 TODO 和 task 元数据，用来验证 OMP 的原生执行接口；它不代表插件默认注入这些要求。工作树插件同时通过 entrypoint 和 plugin directory 加载，且不能与 `--no-extensions` 组合：

```bash
node scripts/e2e/run-installed-deepseek-workflow.mjs \
  --matrix scripts/e2e/fixtures/workflow-consolidation-installed.json \
  --repeat 1
```

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
- optional Skill 暴露 choose、compose、steps、skills、roles、delegation、quality、scope 和 risk，并按领域拆分 references；
- OMP 17 只直接发现一个 `ecc-skill-catalog` adapter；255 个嵌套 ECC guide 只能从 `catalog.md` 的 exact URI 按需读取；
- Main 与 Advisor managed blocks 都不导入共享目录，只说明 OMP 原生权威和可选 Skill；
- 所有打包 Agent/Skill 的 frontmatter 名全局唯一；插件角色在 marketplace 中恰好有一个打包所有者，OMP 原生 `designer`、`librarian`、`reviewer` 不得被插件打包；
- README 版本和工作流清单同步。

## 发布与安装态同步

根据变更范围升级对应插件：

- definition、Main renderer 或兼容 adapter 变化：`omp-enhancer-core`。
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

只有用户明确授权发布时，才把经过验证的源文件、生成物、版本、lockfile 和 marketplace 改动放进同一组有范围的提交并推送。Marketplace 默认跟踪 GitHub `main`，所以本地 upgrade 必须发生在远端已经包含该提交之后：

```bash
git status --short
git add <reviewed-paths>
git commit -m "refactor: modularize workflow catalog"
git push origin main
git rev-parse HEAD
git ls-remote origin refs/heads/main
```

远端验证完成后，按依赖顺序刷新 marketplace 和本地插件，Core 通常最后升级。随后显式激活 Config tools，预览并按需同步工作流上下文，再新开会话验证 catalog version、可选 Skill、OMP 原生 Agents 和唯一插件 Agent，且确认完整 catalog 没有被 Main/Advisor 自动 import：

```bash
omp plugin marketplace update omp-enhancer
omp plugin upgrade <changed-plugin>@omp-enhancer
omp plugin list
```

然后在新的 OMP session 中运行 `/enhancer-tools enable config`，先以
`apply: false` 调用 `omp_config_sync_workflow_context`，审查结果后才决定
是否以 `apply: true` 应用。

`omp-config` 的 `omp_config_sync_workflow_context` 默认为 dry-run；审查结果后才使用 `apply: true`。单纯升级 Config 不会自动覆盖用户的 Main/Advisor 文件。

## 删除工作流或兼容代码

删除前必须同时确认：

1. 普通运行时无引用；
2. 公开工具、状态恢复和兼容诊断无引用；
3. 不是 OMP 通过目录约定发现的 asset、agent、skill、command、hook 或 adapter；
4. marketplace、README、生成目录和测试均已更新；
5. 全量验证通过。

Legacy router、route policy、classifier、route plan v2、agent-selected route plan v3 和 Core state schema 不是“普通 Main 不直接调用就可以删除”的死代码。它们仍承担公开诊断与状态兼容职责。
