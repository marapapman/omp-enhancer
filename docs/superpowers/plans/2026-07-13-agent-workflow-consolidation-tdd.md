# Agent 与工作流整合实施计划（TDD）

## 目标

把未接入 canonical workflow 的旧 Agent 收敛到“workflow 管流程、canonical role 管权限、skill 管专业知识”的架构中，并补齐真正缺少的领域工作流。所有行为先由失败测试定义，再做最小实现；交付前必须完成真实端到端验证。

明确不实现 `healthcare.review`，也不保留 `ecc-healthcare-reviewer` 作为孤立可选角色。现有医疗类 skills 不在本次删除范围内。

## 不变量

1. Main 只能选择所选或显式组合 workflow 中列出的 exact Agent ID。
2. Planner、reviewer、checker、visioner 和 sanitizer 等独立证据角色保持只读。
3. Workflow definition 不授予写入、命令执行、联网、发布或外部系统权限。
4. Build、数据库迁移、性能优化、ML 调试和开源发布必须分离诊断、修改、测试与独立复核。
5. `session_stop` 不自动续跑，任何失败都不会触发隐藏重试循环。
6. Skill 只承载专业知识和方法，不复制完整 workflow。
7. 生成目录、README、marketplace、源定义与安装态目录保持一致。

## 目标工作流

### 现有工作流增强

- `code.plan`：显式允许 `explore` 与 canonical `plan`，由 Main 分配两者，避免隐藏的二次编排。
- `code.review`：允许 canonical `reviewer`；不同专业审查使用同一角色的不同 skill 实例。
- `design.visual`：允许 `designer`；需要浏览器证据时组合 `code.test`。
- `code.build`：统一语言和工具链构建失败的 diagnose → repair → test → review 流程。

### 新领域工作流

- `research.technical`
- `network.design`
- `network.homelab`
- `network.review`
- `network.debug`
- `database.review`
- `database.change`
- `database.migration.repair`
- `performance.optimize`
- `ml.review`
- `ml.debug`
- `release.opensource`
- `marketing.campaign`
- `seo.audit`

`communications.triage` 只有在真实 connector 工具可发现且可测试时才进入 catalog；否则删除当前不可履约的 Agent，不发布虚假能力。

## Agent 收敛

### 保留或重写为真实角色

- Canonical：`plan`、`implementation-task`、`reviewer`、`designer` 及现有测试/写作/事实审查角色。
- 支撑角色：`explore`、`librarian`。
- 网络：`ecc-network-architect` 同时承载企业与 homelab 设计，另保留 `ecc-network-config-reviewer`、`ecc-network-troubleshooter`。
- 数据库：复用 canonical `reviewer` 并加载数据库 skills，不保留第二个 reviewer 身份。
- 开源发布：重写 `ecc-opensource-forker`、`ecc-opensource-sanitizer`、`ecc-opensource-packager` 的 OMP 协议、权限边界和交付格式。

### 删除旧 wrapper

- 删除与 plan/explore/implementation/reviewer/test/design 重复的通用 Agent。
- 删除语言、框架、build resolver Agent wrapper；把知识映射到 skills。
- 删除 GAN、loop、不可履约的 connector Agent。
- 先迁移 legacy `bugAudit`，再删除其中引用的旧 Agent ID。
- 把 `implementation-task`、`plan` 和 `reviewer` 的 spawn 收紧为空；所有 exact Agent 由 Main 选择。

## Skill 策略

1. 优先复用现有语言、框架、网络、数据库、ML、营销、SEO、开源发布、测试和安全 skills。
2. 仅为 inventory 中不存在的知识面新增精简 skills：build toolchain、代码文档、类型设计及 TypeScript/F#/Swift/HarmonyOS patterns。
3. 新 skill 使用合法 frontmatter、短触发描述和命令式正文；详细变体放 references，避免复制 Agent prompt。
4. 新增或删除 skill 后同步 marketplace 的排序清单，并运行 skill 结构校验。

## TDD 阶段

### Red 1：目录与角色契约

先新增测试并确认失败：

- catalog 必须包含所有目标工作流，且不包含 `healthcare.review`。
- `code.plan`、`code.review`、`design.visual` 暴露正确 canonical roles。
- 所有 workflow role 和 skill 都有唯一 marketplace owner。
- 被删除的 Agent ID 不再出现在 catalog、legacy route plan、skills 或 tests 中。
- 顶层 Agent 不存在 wildcard 或 dangling spawn，Main 对 workflow 的 exact role 选择不被嵌套编排绕过。
- reviewer/sanitizer 等独立证据角色不具有 edit/write。

### Green 1：最小目录实现

- 添加模块化 workflow definition 文件并接入 catalog。
- 迁移 `bugAudit` 兼容投影到 canonical roles 与 skills。
- 更新 catalog version、README 和生成的 `WORKFLOW_CATALOG.md`。

### Red 2：Skill 与 Agent 迁移

先新增 inventory 测试并确认失败：

- 目标旧 Agent 文件必须消失。
- 新/复用 skill 名必须可解析且唯一。
- 开源发布 skill 必须使用 exact `ecc-*` ID 和 OMP task 语义，不得出现 Claude `Agent(...)`、自动三轮重试或隐式 publish。
- canonical reviewer 和 sanitizer 必须只读。

### Green 2：最小迁移实现

- 删除旧 wrapper 和所有悬空引用。
- 创建缺失 skills，并用现有 skills 替代重复内容。
- 收紧保留 Agent 的 tools、spawns、模型和 prompt。
- 同步 marketplace skill 清单。

### Red/Green 3：端到端

新增端到端场景并先确认旧实现失败：

1. Core 启动后，Main prompt 暴露完整新 catalog、exact roles、skills、scope 和 risk，且不暴露 healthcare workflow。
2. 选取 `code.build`、`research.technical`、`database.migration.repair`、`release.opensource`、`marketing.campaign` 场景，验证 task assignment 中 workflow/step/TODO/skills 元数据完整传递。
3. Config 生成目录与 Core renderer 字节一致，Main 与 Advisor 同时获得新目录。
4. 打包后的 Agent/Skill inventory 与 marketplace 完整一致。
5. 在可用的已安装 OMP 环境中运行一组真实 workflow matrix；若环境阻塞，保留命令、原始失败和本地 in-process E2E 结果，不以单元测试冒充真实 E2E。

## 验证命令

```bash
npm run check:workflows
node --test scripts/workflow-context-parity.test.js
npm test --workspace plugins/omp-enhancer-core
npm test --workspace plugins/omp-config
npm run check:marketplace
npm test
cd plugins/omp-test-enhancer && bun run typecheck && bun run build && bun run test
cd ../..
npm run pack:all
git diff --check
```

真实 E2E：

```bash
node --test scripts/e2e-installed-workflow.test.js
npm run e2e:deepseek -- --matrix <new-workflow-matrix>
```

## 完成条件

- 所有新增测试经历可观察的 Red → Green。
- 所有目标工作流、角色和 skills 在 Main 与 Advisor 中可发现。
- 无 healthcare workflow。
- 无悬空 Agent/Skill ID、无 wildcard spawn、无 reviewer 写权限。
- in-process E2E、配置 parity E2E、打包检查和真实已安装 workflow E2E 均有明确结果。
- 工作树只包含本次实现范围内的源文件、测试、生成物和开发计划。
