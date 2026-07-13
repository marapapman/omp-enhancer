# OMP Enhancer 模块化与死代码清理计划

日期：2026-07-13

## 目标

本次重构在不改变 OMP 已发布工具、Hook、状态和 advisory-only 语义的前提下完成三件事：

1. 将工作流定义收敛为单一结构化数据源，消除 Core 动态目录与 Config 静态目录的双重手写维护。
2. 拆分职责过重的运行模块，使目录数据、渲染、兼容适配、配置同步和宿主证据解析具有明确边界。
3. 删除有全仓引用证据的死代码，并新增面向后续工作流开发的长期指南和自动校验。

## 不变量

- `omp-enhancer-core` 的默认扩展入口和八个 `omp_core_*` 公共工具保持不变。
- 普通 `before_agent_start` 继续只注入 `agent-selected` 任务事实；legacy router、route policy 和 classifier 只作为兼容诊断存在。
- Plugin Hook 不返回 `block: true`，`session_stop` 不返回 `continue: true`。
- Core state schema v4、agent-selected route plan v3、诊断 route plan v2 及既有兼容别名保持可恢复。
- Config 仍以独立包携带静态 `WORKFLOW_CATALOG.md`，安装后不依赖另一个 workspace 包。
- OMP 通过目录约定发现的 agents、skills、commands、hooks、assets 和 marketplace adapter 不视为死代码。

## 目标结构

```text
plugins/omp-enhancer-core/src/workflows/
├── schema.js                  # definition 校验、冻结和投影
├── catalog.js                 # 唯一 registry 与公共派生视图
├── definitions/
│   ├── general.js
│   ├── writing.js
│   ├── research.js
│   ├── code.js
│   └── operations.js
├── render-main.js             # Main 动态目录和 Skill inventory
├── render-shared-markdown.js  # Main/Advisor 共享静态目录
└── legacy-adapter.js          # 兼容 intent、route card 和别名

plugins/omp-enhancer-core/src/workflow-routes.js
└── 兼容 re-export facade

plugins/omp-config/src/
├── workflow-context-assets.js # 读取打包资产
├── workflow-managed-blocks.js # 纯字符串合并
└── workflow-target-files.js   # 目标解析、symlink 防护、原子写入

scripts/generate-workflow-catalog.js
└── --write / --check
```

## 实施阶段

### 1. Characterization 与单一数据源

- 把 21 个工作流的 ID、选择条件、组合关系、步骤、Skills、Roles、Delegation、质量检查、scope 和 risk 收进同一 definition。
- 保持原有 `workflowRouteNames`、`workflowRouteCatalog`、`WORKFLOW_CATALOG_VERSION` 和 renderer exports。
- 新增 schema 校验：ID 唯一、组合目标存在、字段非空、角色出现在职责说明中、无角色工作流不得要求泛化委派。

### 2. 生成共享目录

- 从同一 registry 生成 Config 的 `assets/WORKFLOW_CATALOG.md`。
- 静态目录补齐 `Compose with`，确保 Main 与 Advisor 获得同一选择和组合信息。
- `--check` 在生成物漂移时非零退出；根测试和打包前检查该命令。
- parity 测试以生成结果和已提交文件的完整内容一致为第一道门，再检查 marketplace 中的 Agent/Skill 所属关系。

### 3. 模块拆分

- Core 的数据、Main renderer、共享 Markdown renderer 和 legacy adapter 分开。
- Config 同步拆分为纯合并、资产加载、安全文件写入和编排。
- Testing Enhancer 将宿主测试证据解析从扩展注册与状态协调中抽离。

### 4. 死代码清理

- 删除无引用的路由词表、无调用的 phase 过滤函数、无效条件分支和未消费参数。
- 删除没有仓库引用、也不在 package export 面内的 `omp-config/src/config-normalizer.js`。
- 保留 public tool、legacy diagnostic、marketplace discovery adapter 和约定目录资产。

### 5. 开发指南与验证

- 新增 `docs/WORKFLOW_DEVELOPMENT.md`，覆盖 definition、组合、Agent/Skill、生成、测试、发布和安装态同步。
- 运行：

```bash
npm run check:workflows
npm test
cd plugins/omp-test-enhancer && bun run typecheck && bun run build
npm run check:marketplace
npm run pack:all
git diff --check
```

## 完成标准

- 新工作流只需修改一个 definition，并通过生成命令同步静态目录。
- Main 与 Advisor 的目录内容由同一 renderer 派生，完整内容无漂移。
- 公开兼容契约测试全部通过。
- 删除项均有“无生产引用 + 非约定发现资产 + 测试通过”的证据。
- 开发指南可独立指导新增、组合、打包和验证一个工作流。
