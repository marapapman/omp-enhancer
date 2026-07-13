# Workflow Development Guide

本指南说明如何在 OMP Enhancer 中新增或修改工作流。目标是让一次修改只有一个语义来源，并让 Main、Advisor、Agents、Skills、marketplace 和安装态保持一致。

## 架构原则

当前工作流运行采用“事实提取 + Main 自主选择”的模型：

- `task-descriptor.js` 只提取 operation、domains、约束、目标、阶段、风险和正文语言等事实。
- Main 从完整目录选择或组合工作流；legacy router 和 classifier 只是显式兼容诊断，不得成为主运行时选择器。
- Workflow definition 只描述建议步骤和资源，不授予写入、联网、测试、发布或其他权限。
- Advisor 使用同一目录做非阻塞审查，不接管选择，也不形成完成门。
- Skills 是候选项，必须和当前 active inventory 取交集后按需加载。
- Agent ID 必须是工作流或显式组合工作流列出的精确安装 ID。

## 文件布局

```text
plugins/omp-enhancer-core/src/workflows/
├── schema.js
├── catalog.js
├── render-main.js
├── render-shared-markdown.js
├── legacy-adapter.js
└── definitions/
    ├── general.js
    ├── writing.js
    ├── research.js
    ├── code.js
    └── operations.js

plugins/omp-enhancer-core/src/workflow-routes.js  # 兼容 re-export facade
plugins/omp-config/assets/WORKFLOW_CATALOG.md      # 生成物，禁止手改
scripts/generate-workflow-catalog.js
scripts/workflow-context-parity.test.js
```

Core definitions 是唯一语义来源。Config 不在运行时依赖 Core；它只打包生成后的 Markdown。

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
- `roles`：精确 Agent frontmatter 名；每个角色都必须在 `delegation` 中有职责。
- `delegation`：绑定 step ID、actor 和 duty。没有角色时必须明确由 Main/parent 保留，或先组合一个提供精确角色的工作流。

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

## 添加 Agent

1. 在拥有该角色的插件 `agents/` 下创建 `<agent-id>.md`。
2. Frontmatter `name` 必须与 definition 中的角色完全一致，并在整个 marketplace 中唯一。
3. 把 `agents` 加入该插件的 `package.json.files`；已有插件通常已经配置。
4. 在工作流 `roles` 中登记，并在 `delegation` 中绑定明确步骤和只负责的 checkpoint。
5. Reviewer、visioner 或 checker 应保持独立、只读，除非角色契约明确允许修改。

不要使用 `generalist`、`worker` 等未安装的推测名称，也不要让 `Agent roles: none` 的工作流隐式 fork。

## 添加 Skill

1. 在所属插件 `skills/<skill-name>/SKILL.md` 中创建 Skill。
2. Frontmatter `name` 必须与 definition 中的候选名完全一致，并在整个 marketplace 中唯一。
3. 确认 Skill 目录包含在插件 `package.json.files` 中。
4. 将路径加入 `.omp-plugin/marketplace.json` 对应插件的 `skills` 数组，并保持整个数组按路径字典序排列。
5. 仅当该 Skill 直接支持某个工作流步骤时，才把它加入 `skills`。

候选 Skill 不会被预加载。Main 在运行时检查 active inventory，并只加载最小适用集合。
`npm run check:marketplace` 会从文件系统重新推导 Skill 路径并检查顺序；Config 的 inventory 测试也从 marketplace 推导总清单，不维护容易漂移的手工计数。

## 生成目录

修改 definition 或 renderer 后运行：

```bash
npm run generate:workflows
npm run check:workflows
```

`generate:workflows` 会覆盖：

```text
plugins/omp-config/assets/WORKFLOW_CATALOG.md
```

不要直接修改这个生成物。`check:workflows` 会做完整字节比较，并在文件缺失或漂移时失败。

新增、删除或改变工作流公开结构时，还要：

1. 在 `plugins/omp-enhancer-core/src/workflows/catalog.js` 增加 catalog version。
2. 更新根 `README.md` 的 catalog version 和工作流表。
3. 检查 Main 与 Advisor 是否都需要看到新增的 scope、risk、composition 或 Agent 信息。

## 必跑验证

最小工作流验证：

```bash
npm run check:workflows
node --test scripts/workflow-context-parity.test.js
npm test --workspace plugins/omp-enhancer-core
npm test --workspace plugins/omp-config
npm run check:marketplace
```

交付前全量验证：

```bash
npm test
cd plugins/omp-test-enhancer && bun run typecheck && bun run build
cd ../..
npm run pack:all
git diff --check
```

Parity 测试负责检查：

- 生成 Markdown 与 Core renderer 完整一致；
- Main 暴露 choose、compose、steps、skills、roles、delegation、quality、scope 和 risk；
- Main 与 Advisor 各导入一次共享目录；
- 所有打包 Agent/Skill 的 frontmatter 名全局唯一，且每个工作流引用在 marketplace 中恰好有一个打包所有者；
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

远端验证完成后，按依赖顺序刷新 marketplace 和本地插件，Core 通常最后升级。随后显式同步工作流上下文，并新开 Main/Advisor 会话验证 catalog version、工作流、Agent 和 Skill：

```bash
omp plugin marketplace update omp-enhancer
omp plugin upgrade <changed-plugin>@omp-enhancer
omp plugin list
```

`omp-config` 的 `omp_config_sync_workflow_context` 默认为 dry-run；审查结果后才使用 `apply: true`。单纯升级 Config 不会自动覆盖用户的 Main/Advisor 文件。

## 删除工作流或兼容代码

删除前必须同时确认：

1. 普通运行时无引用；
2. 公开工具、状态恢复和兼容诊断无引用；
3. 不是 OMP 通过目录约定发现的 asset、agent、skill、command、hook 或 adapter；
4. marketplace、README、生成目录和测试均已更新；
5. 全量验证通过。

Legacy router、route policy、classifier、route plan v2、agent-selected route plan v3 和 Core state schema 不是“普通 Main 不直接调用就可以删除”的死代码。它们仍承担公开诊断与状态兼容职责。
