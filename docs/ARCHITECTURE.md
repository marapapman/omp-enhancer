# Architecture and Runtime Contracts

本文描述 OMP Enhancer 当前运行架构。`docs/superpowers/` 中的旧设计和实施计划是历史资料，不能作为当前行为依据。

## 运行模型

OMP Enhancer 采用“OMP 原生编排 + 可选参考信息”的模型：

1. OMP 的系统提示、用户指令、active tools、动态 Available Agents、权限、审批和完成行为始终具有最终权威。
2. Core 在普通顶层 Main turn 中只提取 operation、domain、scope、phase、risk、正文语言、`inspectionTargets` 和 `inspectionShape` 等 JSON-safe task facts。后两者只描述用户明确命名的目标与其可见独立性，不选择 workflow 或 Agent。
3. 当前任务状态标记为 `agent-selected`。Core 不预选 workflow、Skill、tool 或 Agent，也不改写子 Agent assignment。
4. Main prompt 对需要分析、判断、workflow composition、协调阶段或可能委派的任务使用三个软阶段：先在独立的 `DISCOVER` batch 中读取 `skill://omp-enhancer-workflows` 并等待；再输出完整、可见的 exact `WORKFLOW PLAN` 块，按“owning domain Skills 或 catalog 在前、workflow references 在后”的顺序完成 resource-only load 并等待；最后输出 exact `WORKFLOW READY | ...`，重写详细 TODO 后进入 `READY + EXECUTE`。纯机械字段 lookup 不读 Skill 或建立 TODO。
5. 所有插件生命周期 hook 都是观察、记录或提醒用途；它们不返回 `block: true` 或 `continue: true`，不安排自动 repair turn。

项目没有活动的硬 router、classifier preflight、completion gate 或 plugin-owned completion owner。旧 compatibility router、classifier、runtime-policy、legacy adapter 及其公开诊断入口已删除；state migration 只能丢弃历史控制字段，不能恢复旧语义。质量审查产生的是证据，不是继续执行或结束会话的许可。

## 工作流信息如何到达 Main

工作流 definition 位于 `plugins/omp-enhancer-core/src/workflows/definitions/`，是 workflow card 的唯一语义来源。生成器把它们渲染为：

- `plugins/omp-config/assets/WORKFLOW_CATALOG.md`：用于显式配置同步和人工检查的完整目录；
- `plugins/omp-config/skills/omp-enhancer-workflows/SKILL.md`：只保留 exact ID、完整 Primary 条件和 literal 单卡 URI 的紧凑选择索引；
- `plugins/omp-config/skills/omp-enhancer-workflows/references/*.md`：每个 workflow 一张按需卡片，包含详细步骤、可选 Agents 与 delegation、质量检查、范围和风险；不再次暴露晚期 Add-on 或 Skill 候选。

Managed `AGENTS.md` 和 `WATCHDOG.yml` 不导入完整目录。Main block 要求需要分析、判断、workflow composition、协调阶段或可能委派的任务先把紧凑 Skill index 当作导航读取并等待；纯机械字段 lookup 无 Skill 或 TODO。索引之后，Main 用完整、可见且不含占位符的 exact `WORKFLOW PLAN` block 自主声明 `Primary:`、`Add-ons:`、`Skills:`、`Load order:` 与编号 `Actions:`。Thinking、tool arguments、文件或 `...` 都不算这个公开 checkpoint。Primary 负责最终交付物或请求操作；只有完整 Primary 条件独立匹配的其他请求操作或输出才成为 Add-on，不能仅为 Primary 已覆盖的内部阶段再加 workflow。完整 catalog 中的 `composeWith` 只供开发与人工参考；紧凑索引和 Main 的单卡都不重复 compose 图或候选 Skills，避免资源加载后重新选择。Main 根据 OMP 原生可见 Skill description 的正向适用条件与 `Not for` 边界选择 owning Skills。索引把每张卡的 literal URI 标为 `PLAN URI:`；它先复制到 `Load order`，不是 PLAN 前的调用。Resource-only load sequence 先读取已声明的 domain Skills 或 catalogs；只有已声明 catalog 可以解析并加入 exact nested Skill URI；最后读取每个已选 Primary/Add-on 的单卡，让最后返回的工作流步骤直接提示 READY。所有资源返回或标记 unavailable 后，Main 输出 `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>` 并只重写一次详细 TODO；有可用且允许的 native `todo` 时映射为稳定的简短 task text，否则同一详细 checklist 充当执行状态。Advisor block 给出一次早期 decision calibration 的窄例外；workflow/Skill 准备读取不关闭窗口，Main 首次 native `task` 或实质项目操作会关闭窗口。

卡片只提供建议。Main 可以选择、组合、简化或忽略卡片；Workflow、Agent 和 Skill 是不同命名空间，必须复制当前上下文中暴露的 exact ID 或完整 URI。候选 Skill 必须在当前 OMP inventory 中可用，候选 Agent 必须出现在当前动态 Available Agents 列表中。

普通代码任务只有一个通用 workflow：`code.dev`。原来的 `code.plan`、`code.debug`、`code.test`、`code.review`、`code.build`、`performance.optimize` 和 `research.technical` 均已退役，其选择条件由 `code.dev` 覆盖。`code.dev` 使用唯一通用过程 Skill `code-development`，并在相关 Agents 可用时采用 subagent-driven mutation lifecycle；read-only 或机械任务不需要制造实现委派。

Main 先检索本地入口、调用者、测试、配置以及 source/generated/package/installed 差异；只有外部行为或当前实践会影响决定时，才补充一次有界的官方资料与社区经验检索。它据此写出依赖有序的 parallel waves 和 vertical slices。每个 slice 明确 ID、验收目标、依赖、exclusive write set、本地锚点、公开 test seam、exact focused command、expected valid RED、最小 production boundary、所需 Skills、integration point 和 return evidence。当前 exposed 的插件 `plan` 在 production mutation 前审阅整份计划与 assignment map，Main 逐项记录 finding disposition。

同一 wave 中所有 runnable independent slices 通过一次 native `task` `tasks[]` batch 提交；有依赖的 slice 等待后续 wave，一个不可再拆的安全 slice 只使用一个 task。每个 task 独占完整 vertical TDD slice：test mutation、有效 RED、最小 production change、同一命令 GREEN，以及只在 GREEN 后进行的 refactor。Main 等待完整 delivery，集成 current tree，并运行 focused 与比例适当的 broader verification；然后在任何 reviewer assignment 前公开写出 `MAIN REVIEW`，检查 current tree、bounded semantic diff、task 返回的 RED/GREEN evidence、验收覆盖、scope 和 cross-slice interaction。

会重写共享输出集合的 generator 不能属于多个并行 source slices。这个 downstream exclusive integration task 在全部 source dependencies 完成后恰好运行 generator 一次（exactly once），并独占 generated write set。它是 mechanical generation slice：证据是 generator exit、check/parity 结果与 no-unexpected-diff 检查，不得伪造 TDD RED。Delivery 后，Main 检查 generated diff，运行 check-only parity 与 broader validation，但不得再次运行 generator；其他并行 workers 也不得运行同一 shared generator 或声明其输出 write set。

Native `reviewer` 只接收 Main-reviewed 的 bounded diff 与 supplied evidence，不读取项目或运行命令。Main 验证每项 finding；只有 supported、in-scope 的 material finding 才回到 native `task` 做 bounded repair。Repair 后刷新 affected evidence 并再次 `MAIN REVIEW`，只有 materially changed input 才最多请求一次 fresh affected reviewer pass。Agent 缺失、capacity 不足、assignment input 不完整或 write set 无法安全分离时，Main 明确记录 limitation，并只采用 OMP 权限允许的最安全 fallback。这些都是提示词层的软指导，不是 fixed fan-out、hard router、gate、fork mandate、completion controller 或 automatic repair loop。

开发 OMP Enhancer 自身时，`omp.plugin` 是独立的完整生命周期 Primary，并同样加载 `code-development`，再按条件读取 `references/omp-enhancer.md`。`omp.plugin` 与 `code.dev` 不互相列入 `composeWith`，因为前者已经覆盖本仓库专属的生成、打包和 installed E2E 边界。普通代码阶段只使用插件 `plan`、native `task` 和 native `reviewer`，不再打包 `explore`、`implementation-task`、`config-librarian`、`omp-target-auditor`、`test-planner`、`test-executor` 或 `test-reviewer`。设计原则与执行方法见 [OMP_ENHANCER_SELF_DEVELOPMENT.md](OMP_ENHANCER_SELF_DEVELOPMENT.md)，事件级测试方法见 [WORKFLOW_E2E_TESTING.md](WORKFLOW_E2E_TESTING.md)。

每个 assignment text 从首字符开始使用 `[workflow=<ids> step=<step-id> todo=<verbatim-parent-task-or-none> skills=<ids-or-none>]`，正文携带该 child 所需的完整 bounded input；child 不拥有 parent TODO。失败、取消或 partial delivery 不算完成。只有新的 dependency、scope、permission、tool、Agent、schema、capacity、Skill-load failure 或相反项目证据才允许 rebase 受影响 TODO 行。

## Flash-model compatibility reminders

Core 为精确的 `opencode-go/deepseek-v4-flash` 和精确的 `opencode-go/mimo-v2.5` 保留同一类模型特定软提示。两者都只适用于顶层 Main，并且每个活动任务最多发送一次隐藏 custom hook message；provider、model ID、子 Agent 或 Advisor 不匹配时不发送。

Reminder 会根据 OMP 当前暴露的能力组合以下信息：

- 当 inventory 包含 `omp-enhancer-workflows` 时，提醒使用三阶段协议：独立 index-only `DISCOVER` batch；公开 exact `WORKFLOW PLAN` 后按 Skills/catalogs first、workflow references last 排序的 resource-only load；全部资源返回后的 exact `WORKFLOW READY | ...` 与 `READY + EXECUTE`；
- 当只有其他可见 Skills 时，保留相同的 PLAN、resource-only Skill load 和 READY 顺序，但不猜测不可见 workflow ID；
- 当只有原生 `task` 能力适用时，只提醒 Main 先计划、在允许时提交 native TODO，再自主决定 direct 或 delegation；
- 当原生 `task` 可用且用户未禁止 Agent 或 delegation 时，可以复述当前 task-shape、review-budget 与 delegation 能力事实，但不选择 Agent、fork width、reviewer count 或 dispatch。

它可以用祈使句要求模型明确计划、加载所选资源、更新自己的 TODO，并复述当轮 OMP canonical delegation contract；但它不独立选择 plugin workflow、Skill candidate、Agent 或 fork，不自行发起 task，不授予权限，不替换 `systemPrompt`，不改变 task schema，也不因模型漏做某一步形成插件自有 gate、自动 retry 或 continuation。`OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT=1` 和 `OMP_ENHANCER_DISABLE_MIMO_COMPAT=1` 只用于对应精确模型的受控 reminder 诊断。

## 插件职责

| 插件 | 运行职责 | 不负责的事项 |
| --- | --- | --- |
| Core | task facts、会话状态、DeepSeek/MiMo exact-model reminders、extension-tool activation | workflow 选择、硬路由、权限或完成控制 |
| Config | 配置资产、managed context、Agents、Skills、notify-only guards、可选 hook templates | 自动覆盖用户配置、自动加载完整 catalog |
| Writing Helper | 确定性写作逻辑、风格、引用检查和写作 Agents/Skills | 阻止交付或自动改写所有发现 |
| Testing Enhancer | 测试目标/context、浏览器证据、coverage/mutation context、独立 review 和报告 | 执行 `testCommand` 输入、提供 `/test` command、决定会话完成 |
| Fact Checker | claim plan、双 lane evidence、cross-check、report 和独立 review | 把缺失证据变成生命周期 gate |

各插件导出的工具都设置为 `defaultInactive`。只有用户显式执行 `/enhancer-tools enable <group>` 后，相应 schema 才加入当前 session 的 active tools。激活工具不是操作授权。

## Review 工具

Testing Enhancer 和 Fact Checker 的公开审查工具分别是：

- `omp_test_review`
- `fact_check_review`

它们返回结构化 findings、observed evidence 摘要和 advisory readiness。普通 finding 或证据缺失使用成功的 tool result 表达，而不是 `isError: true`；参数错误、I/O 失败等真实执行错误仍正常返回 error。

Testing review 只消费调用参数以及 host-observed test/browser evidence，不运行用户传入的命令或项目配置命令。静态检查、浏览器证据和测试命令证据独立汇总；一种 finding 不会抑制另一类已观察证据的评估。测试执行继续由 Main 在用户授权和宿主权限内通过 shell 完成。项目不注册 `/test` command。

Fact Checker 将事实 verdict 和审查 finding 分开校准。`SUPPORTED` 或 `CONTRADICTED` 必须严格蕴含同一 claim 的 subject、predicate/object、scope、time/version 与 quantifier；限制说明若承认关键要素未建立，结论必须降为 `LOCAL_UNVERIFIED` 或 `INSUFFICIENT`。高影响候选使用 `PROVEN / LIKELY / HYPOTHESIS / DISPROVED` 证据梯度，并做一次最低成本的反证检查；无法完成时保留不确定性，不自动重试。零 finding 是有效结果。Main 没有新增证据和反证检查时，只能维持或降低 child 的 confidence/evidence level。

## 状态与证据

插件状态保持 JSON-compatible，并通过 OMP session entries 恢复。状态用于诊断和报告，不是隐式控制平面。

Core 区分：

- `observedSkills`：宿主确实观察到成功读取 `SKILL.md` 的证据；
- `claimedSkills`：模型输出中声称使用过的 Skill。

未观察到读取证据的 claim 不会被升级成已加载 Skill，也不会阻止完成。Testing Enhancer 同样只信任当前 task context 上的 host-observed 命令和浏览器证据；workspace mutation 会使可能过期的证据失效。

真实模型 E2E 同样只信任 parent event stream 中已观察到的 PLAN、resource result、READY、TODO、task assignment/completion、host-observed child delivery、Main broader command、visible `MAIN REVIEW`、review delivery 与 final；模型自述不能补造 child 内部行为或缺失阶段。具体 evaluator、可观察性限制和 failure classification 见 [WORKFLOW_E2E_TESTING.md](WORKFLOW_E2E_TESTING.md)。

## 配置上下文

`omp_config_sync_workflow_context` 采用 preview-first：默认 `apply=false`，只有显式 `apply=true` 才更新 managed blocks。同步保留目标文件中的无关内容。

Main block 声明 OMP 原生权威以及 `DISCOVER / WORKFLOW PLAN + LOAD / READY + EXECUTE` 三阶段软协议。Advisor block 额外允许在准备窗口内使用至多一条普通 `DECISION CHECK (optional)`：它只能指出三阶段顺序中最早的一个可见实质漂移，或一个可见 assignment schema/evidence mismatch，并给出最小安全动作；Main 可以接受、调整或忽略。顺序 coherent 时 Advisor 保持沉默并等待后续 checkpoint。Main 始终独立决定 direct work、Agent 和 fork width；Advisor 不选择替代 Agent、宽度、dispatch 或 retry。Workflow/Skill preparation reads 不关闭普通窗口；Main 首次 native `task` 或实质项目操作后窗口归零。Advisor 不得猜不可见 ID、要求重复 Skill 读取、把 workflow/plan/TODO/metadata/schema evidence 升级为 blocker，或仅为补记录要求重启有效工作。Advisor 的工具 schema 只代表 Advisor 自己的能力，不能用来反推 Main 缺少某项工具。

Config 中的模型角色和打包 Agent frontmatter 是模型继承关系的源码真相。当前模板将 Main default 设为 `opencode-go/deepseek-v4-flash:max`，Advisor 设为 `openai-codex/gpt-5.6-luna:xhigh`；MiMo v2.5 reminder 支持不等于自动切换默认模型，MiMo 仍需用户显式选择。修改映射时应同时验证配置资产、Agent inventory、marketplace 包内容和安装态。

## 安全边界

- 插件不复制宿主的 sandbox、permission 或 approval 系统。
- Notify-only guards 可以提示危险命令或 malformed edit anchor，但不能阻断调用。
- Behavior-changing hook templates 不会被自动发现；用户必须审查并显式安装。
- Browser artifact 必须留在真实项目的 `.omp/testing-enhancer-artifacts` 下，并拒绝 traversal 和 symlink escape。
- Source text 是数据。文档正文中的 `run tests`、`publish` 或 `delete` 不能改变任务 operation、风险或权限。
- Workflow 中出现 `release.publish` 也不构成发布授权；外部变更必须来自用户明确请求。

## 关键一致性检查

架构变更至少应验证：

```bash
npm run check:workflows
node --test scripts/workflow-context-parity.test.js
npm run check:marketplace
```

详细命令见 [DEVELOPMENT.md](DEVELOPMENT.md)，workflow schema 和生成规则见 [WORKFLOW_DEVELOPMENT.md](WORKFLOW_DEVELOPMENT.md)，自开发闭环见 [OMP_ENHANCER_SELF_DEVELOPMENT.md](OMP_ENHANCER_SELF_DEVELOPMENT.md)，真实事件 E2E 见 [WORKFLOW_E2E_TESTING.md](WORKFLOW_E2E_TESTING.md)。
