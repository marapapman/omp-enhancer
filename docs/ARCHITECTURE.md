# Architecture and Runtime Contracts

本文描述 OMP Enhancer 当前运行架构。`docs/superpowers/` 中的旧设计和实施计划是历史资料，不能作为当前行为依据。

## 运行模型

OMP Enhancer 采用“OMP 原生编排 + 可选参考信息”的模型：

1. OMP 的系统提示、用户指令、active tools、动态 Available Agents、权限、审批和完成行为始终具有最终权威。
2. Core 在普通顶层 Main turn 中只提取 operation、domain、scope、phase、risk、正文语言、`inspectionTargets` 和 `inspectionShape` 等 JSON-safe task facts。后两者只描述用户明确命名的目标与其可见独立性，不选择 workflow 或 Agent。
3. 当前任务状态标记为 `agent-selected`。Core 不预选 workflow、Skill、tool 或 Agent，也不改写子 Agent assignment。
4. Main 是编排者。Workflow 参考是 3 阶段 advisory：`ANALYZE -> EXECUTE -> REVIEW`。ANALYZE：聚焦任务由 Main 直接分析，复杂多 slice 工作委派给只读 `analyzer` Agent；EXECUTE：简单变更由 Main 直接执行，substantial 工作委派给 `task` 或领域 Agent；REVIEW：简单变更由 Main 直接复查，复杂或高风险变更委派给 `reviewer`。没有插件强制 delegation 宽度、Agent 选择或阶段顺序；卡片只提供 `suggestedFlow` 建议。纯机械字段 lookup 不读 Skill 或建立 TODO。
5. 所有插件生命周期 hook 都是观察、记录或提醒用途；它们不返回 `block: true` 或 `continue: true`，不安排自动 repair turn。

项目没有活动的硬 router、classifier preflight、completion gate 或 plugin-owned completion owner。旧 compatibility router、classifier、runtime-policy、legacy adapter 及其公开诊断入口已删除；state migration 只能丢弃历史控制字段，不能恢复旧语义。质量审查产生的是证据，不是继续执行或结束会话的许可。

## 工作流信息如何到达 Main

工作流 definition 位于 `plugins/omp-enhancer-core/src/workflows/definitions/`，是 workflow card 的唯一语义来源。Catalog version 31 把原来的 31 张卡片合并为 5 个域：`code`、`writing`、`research`、`visual`、`operations`。生成器把它们渲染为：

- `plugins/omp-config/assets/WORKFLOW_CATALOG.md`：用于显式配置同步和人工检查的完整目录（5 张卡片）；
- `plugins/omp-config/skills/omp-enhancer-workflows/SKILL.md`：紧凑选择索引——每个域一行，列出 chooseWhen 条件、候选 Skill URI 与单卡 reference URI，顶部声明 `ANALYZE -> EXECUTE -> REVIEW` 和 usage 规则。`D` 是顶层 exact URI，`C` 是索引显式暴露的 nested ECC exact URI；二者只是 optional candidates，绝不是 load sets。Main 只选择与请求的方法、证据规则、verdict 或格式匹配的 URI；选中的 `C` 直接读取，不先读取完整 catalog；`skill://ecc-skill-catalog` 仅用于未枚举长尾；
- `plugins/omp-config/skills/omp-enhancer-workflows/references/*.md`：每个域一张按需参考卡，包含 When、Skills、Agent candidates、Suggested flow 和 Scope notes；没有步骤 ID、delegation 行或任何 sentinel marker。

紧凑索引的当前大小由生成与 focused budget test 动态校验；文档不固化会随 workflow rows 和 wording 再生成而变化的 byte snapshot。

Managed `AGENTS.md` 和 `WATCHDOG.yml` 不导入完整目录。Main block 声明 OMP 原生权威与简化 orchestration advisory：`ANALYZE -> EXECUTE -> REVIEW`，Main 是编排者，非平凡任务可读取 `skill://omp-enhancer-workflows` 的 5 域参考目录，机械 lookup 无需 workflow 或 TODO。Advisor block 是同一 advisory 的 advisor 版本（不含读 Skill 的指引）。两者都不包含 marker 协议、load 顺序或 checkpoint 模板。

`D`/`C` 只是一组 optional candidates，绝不是整组加载指令；Main 只选择与请求的方法、证据规则、verdict 或格式匹配的最小 URI 集。卡片只提供建议。Main 可以选择、组合、简化或忽略卡片；Workflow、Agent 和 Skill 是不同命名空间，必须复制当前上下文中暴露的 exact ID 或完整 URI。顶层候选 Skill 必须在当前 OMP inventory 中可见；nested 候选必须由索引显式暴露并由 exact resolver 成功读取；候选 Agent 必须出现在当前动态 Available Agents 列表中。

每张 definition 只包含 `id`、`chooseWhen`、`skills`、`catalogSkills`、`roles`、`suggestedFlow` 和 `scopeNotes`。旧 schema 的委派默认、步骤、组合、质量检查或风险字段已全部移除；Main 按任务复杂度选择 direct work 或 delegation，而不是被卡片默认值指派。用户要求 Main-only、matching Agent 或 capacity 不可用、assignment input 不完整、dependency 或 write overlap 使拆分不安全时，Main 记录具体 limitation 并直接 fallback，而不是伪造委派。Writing 域的语言规则：目标正文为中文时选择中文写作 Skill（如 `plain-chinese-writing`、`zh-writing-markdown-helper`），英文时选择英文写作 Skill（如 `writing-review`、`writing-markdown-helper`）；LaTeX、Beamer、Markdown、Word 是格式叠加层，按目标格式加载对应 Skill，不构成独立 workflow。语言仍不明确时询问用户，不循环或猜测。

当前 visual-delivery 建议：`designer` owns the design or source revision；`task` owns rendering, compilation, export, and optional imagegen execution；`visioner` reviews fresh current-revision evidence in a read-only checkpoint。`visual` 域覆盖 Mermaid、TikZ 图表、UI/UX artifact 与带视觉布局的 slides。TikZ 图表使用两阶段链：asset chain（`designer` icon plan -> `task` prepare/preview assets -> `visioner` per-asset review）先于 figure chain（`designer` ELK graph IR and `tikz_generate_diagram` layout -> `task` `tikz_render` -> `visioner` whole-figure review）；只有 `visioner`-approved assets 进入 manifest，`tikz_generate_diagram` 只在 asset review 之后调用。SVG 是 icon asset 与 compatibility supplement，不是并行 primary；topology、labels、connectors、node positions 与 edge geometry 仍属 TikZ。Main retains setup authorization and final acceptance only and does not mediate the visual loop。Agent 缺失时保留具体 checkpoint 或 evidence limitation；这只是 advisory guidance，不是 hard gate、router、fixed fanout、automatic loop 或 completion authority。

普通代码任务使用唯一通用 workflow：`code`。原来的 `code.plan`、`code.debug`、`code.test`、`code.review`、`code.build`、`performance.optimize`、`research.technical` 与 `omp.plugin` 均已退役，其选择条件由 `code` 覆盖。`code` 使用唯一通用过程 Skill `code-development`，并把复杂度选择模型具体化为下面的 analyzer、vertical TDD、Main review 和 bounded reviewer lifecycle。

Main 先检索本地入口、调用者、测试、配置以及 source/generated/package/installed 差异；只有外部行为或当前实践会影响决定时，才补充一次有界的官方资料与社区经验检索。它据此写出依赖有序的 parallel waves 和 vertical slices。每个 slice 明确 ID、验收目标、依赖、exclusive write set、本地锚点、公开 test seam、exact focused command、expected valid RED、最小 production boundary、所需 Skills、integration point 和 return evidence。复杂多 slice 工作先委派给只读 `analyzer`：它从 Main 的 frozen brief 产出依赖有序的实现与证据计划，并返回自己的 challenge findings；Main 逐项记录 finding disposition。聚焦工作由 Main 直接计划，不强制 analyzer 参与。

同一 wave 中所有 runnable independent slices 通过一次 native `task` `tasks[]` batch 提交；有依赖的 slice 等待后续 wave，一个不可再拆的安全 slice 只使用一个 task。每个 task 独占完整 vertical TDD slice：test mutation、有效 RED、最小 production change、同一命令 GREEN，以及只在 GREEN 后进行的 refactor。Main 等待完整 delivery，集成 current tree，并运行 focused 与比例适当的 broader verification；然后在任何 reviewer assignment 前公开写出 `MAIN REVIEW`，检查 current tree、bounded semantic diff、task 返回的 RED/GREEN evidence、验收覆盖、scope 和 cross-slice interaction。

会重写共享输出集合的 generator 不能属于多个并行 source slices。这个 downstream exclusive integration task 在全部 source dependencies 完成后恰好运行 generator 一次（exactly once），并独占 generated write set。它是 mechanical generation slice：证据是 generator exit、check/parity 结果与 no-unexpected-diff 检查，不得伪造 TDD RED。Delivery 后，Main 检查 generated diff，运行 check-only parity 与 broader validation，但不得再次运行 generator；其他并行 workers 也不得运行同一 shared generator 或声明其输出 write set。

Native `reviewer` 只接收 Main-reviewed 的 bounded diff 与 supplied evidence，不读取项目或运行命令。Main 验证每项 finding；只有 supported、in-scope 的 material finding 才回到 native `task` 做 bounded repair。Repair 后刷新 affected evidence 并再次 `MAIN REVIEW`，只有 materially changed input 才最多请求一次 fresh affected reviewer pass。Agent 缺失、capacity 不足、assignment input 不完整或 write set 无法安全分离时，Main 明确记录 limitation，并只采用 OMP 权限允许的最安全 fallback。这些都是提示词层的软指导，不是 fixed fan-out、hard router、gate、fork mandate、completion controller 或 automatic repair loop。

每个 delegated assignment 都携带 child 所需的完整 bounded input 与冻结的 assignment Skills；每次 native `task` call 都提供非空顶层 `context`。Child 不拥有 parent TODO，只消费冻结的 Skills，不重新执行 workflow/Skill discovery、选择或加载。完整 proposal/report 属于 terminal child delivery，不应只留在较早 ordinary message 后以 status-only 句子结束。若冻结集合不足，child 返回具体 limitation，由 Main 判断是否 rebase。失败、取消或 partial delivery 不算完成。只有新的 dependency、scope、permission、tool、Agent、schema、capacity、Skill-load failure 或相反项目证据才允许 rebase 受影响 TODO 行。

## Workflow reminder and orchestration advisory

Core 为所有顶层 Main 任务保留一次 capability-gated one-shot orchestration advisory（`OMP_ORCHESTRATION`）。它只适用于顶层 Main，每个活动任务最多发送一次；不随 provider retry 或 continuation 重复。Advisory 不复制完整 workflow catalog，而是根据当前可见 workflow Skill、其他 Skills 与原生 `task` 能力选择最小提示。

当 workflow index 可见时，advisory 提醒非平凡任务读取 `skill://omp-enhancer-workflows` 域参考目录，并复述 `ANALYZE -> EXECUTE -> REVIEW` 与 Main 的编排者身份：ANALYZE 由 Main 直接做或委派 `analyzer`，EXECUTE 直接做或委派 `task`/领域 Agent，REVIEW 直接做或委派 `reviewer`。当只有其他可见 Skills 时，只提醒按需加载匹配方法，不猜测不可见 workflow ID。当只有原生 `task` 能力适用时，只提醒 Main 先计划、在允许时提交 native TODO，再自主决定 direct 或 delegation。它还可以复述当前 task-shape 与 workflow candidate 事实，但不选择 Agent、fork width、reviewer count 或 dispatch。

它可以用祈使句要求模型明确计划、按需加载所选 Skill、更新自己的 TODO；但它不独立选择 plugin workflow、Skill candidate、Agent 或 fork，不自行发起 task，不授予权限，不替换 `systemPrompt`，不改变 task schema，也不因模型漏做某一步形成插件自有 gate、自动 retry 或 continuation。`OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER=1` 关闭 reminder，是唯一的诊断开关。Protocol coach 及其专用关闭开关已随 coach 删除；不存在阶段 cue 注入。

## 插件职责

| 插件 | 运行职责 | 不负责的事项 |
| --- | --- | --- |
| Core | task facts、会话状态、one-shot orchestration advisory (ANALYZE -> EXECUTE -> REVIEW)、extension-tool activation | workflow 选择、硬路由、权限或完成控制 |
| Config | 配置资产、managed context、Agents、Skills、notify-only guards、可选 hook templates | 自动覆盖用户配置、自动加载完整 catalog |
| Writing Helper | 确定性写作逻辑、风格、引用检查和写作 Agents/Skills | 阻止交付或自动改写所有发现 |
| Testing Enhancer | 测试目标/context、浏览器证据、coverage/mutation context、独立 review 和报告 | 执行 `testCommand` 输入、提供 `/test` command、决定会话完成 |
| Fact Checker | claim plan、双 lane evidence、cross-check、report 和独立 review | 把缺失证据变成生命周期 gate |
| TikZ Helper | 固定 OpenTikZ catalog/模板/图标、语义图契约、imagegen 资产整理和受限渲染 | 运行时拉取上游、替 imagegen 选权、把审查 verdict 变成完成门 |

除 tikz-helper 外，各插件导出的工具都设置为 `defaultInactive`。tikz-helper 的工具在插件加载时默认激活。只有用户显式执行 `/enhancer-tools enable <group>` 后，相应 schema 才加入当前 session 的 active tools。激活工具不是操作授权。

## Review 工具

Testing Enhancer 和 Fact Checker 的公开审查工具分别是：

- `omp_test_review`
- `fact_check_review`

它们返回结构化 findings、observed evidence 摘要和 advisory readiness。普通 finding 或证据缺失使用成功的 tool result 表达，而不是 `isError: true`；参数错误、I/O 失败等真实执行错误仍正常返回 error。

Testing review 只消费调用参数以及 host-observed test/browser evidence，不运行用户传入的命令或项目配置命令。静态检查、浏览器证据和测试命令证据独立汇总；一种 finding 不会抑制另一类已观察证据的评估。测试执行继续由 Main 在用户授权和宿主权限内通过 shell 完成。项目不注册 `/test` command。

Fact Checker 将事实 verdict 和审查 finding 分开校准。Backward-compatible `verdict` cannot upgrade compatibility evidence into proof；事实结论读取 fail-closed `strictVerdict`。其中 `SUPPORTED` requires same-tuple `ENTAILS + PROVEN`，`CONTRADICTED` requires same-tuple `NEGATES + DISPROVED` 并标识有效的 negated predicate 或 object/value；缺失或不匹配的 tuple、material limitation、未完成的必要 countercheck 或 freshness 缺口保持为 unresolved strict result。高影响候选使用 `PROVEN / LIKELY / HYPOTHESIS / DISPROVED` 证据梯度，并做一次最低成本的反证检查；无法完成时保留不确定性，不自动重试。零 finding 是有效结果。Main 没有新增证据和反证检查时，只能维持或降低 child 的 confidence/evidence level。

## 状态与证据

插件状态保持 JSON-compatible，并通过 OMP session entries 恢复。状态用于诊断和报告，不是隐式控制平面。

Core 区分：

- `observedSkills`：宿主确实观察到成功读取 `SKILL.md` 的证据；
- `claimedSkills`：模型输出中声称使用过的 Skill。

未观察到读取证据的 claim 不会被升级成已加载 Skill，也不会阻止完成。Testing Enhancer 同样只信任当前 task context 上的 host-observed 命令和浏览器证据；workspace mutation 会使可能过期的证据失效。

真实模型 E2E 只把 parent event stream 用作其中可见的 workflow/Skill reads、TODO、task assignment/completion、host-observed child delivery、Main tool call、visible `MAIN REVIEW`、review delivery 与 final 的证据；模型自述不能补造 child 内部行为或缺失阶段。Fixture snapshot 独立证明最终文件 outcome，但共享工作区中的变化若没有匹配的 parent mutation call，只能标为 `unattributed-shared-workspace`，不能仅按变化发生在 child assignment 与 delivery 之间就断言为 child write。`requiredNativeTaskAgentSequence` 是场景显式 opt-in 的观察断言：后序 Agent 的首次 assignment 必须晚于前序 Agent 的成功、非空、host-observed delivery；它从不成为所有场景的全局 gate。真实模型中的 workflow、Skill、TODO 和 fork 数量仍是有随机性的行为样本，不是插件保证。具体 evaluator、mutation attribution、可观察性限制和 failure classification 见 [WORKFLOW_E2E_TESTING.md](WORKFLOW_E2E_TESTING.md)。

## 配置上下文

`omp_config_sync_workflow_context` 采用 preview-first：默认 `apply=false`，只有显式 `apply=true` 才更新 managed blocks。同步保留目标文件中的无关内容。

Main block 声明 OMP 原生权威与简化 orchestration advisory：`ANALYZE -> EXECUTE -> REVIEW`，Main 是编排者；非平凡任务可读取 `skill://omp-enhancer-workflows` 的 5 域参考目录，机械 lookup 无需 workflow 或 TODO。它不包含 DISCOVER/DECLARE 阶段、PLAN/READY marker、分层资源加载顺序或 `DECISION CHECK`。Advisor block 是同一 advisory 的 advisor 版本（不含读 Skill 的指引）。Main 始终独立决定 direct work、Agent 和 fork width；Advisor 不选择替代 Agent、宽度、dispatch 或 retry。Advisor 不得猜不可见 ID、要求重复 Skill 读取、把 workflow/plan/TODO/metadata/schema evidence 升级为 blocker，或仅为补记录要求重启有效工作。Advisor 的工具 schema 只代表 Advisor 自己的能力，不能用来反推 Main 缺少某项工具。

Config 中的模型角色和打包 Agent frontmatter 是模型继承关系的源码真相。当前模板不绑定具体 Main/Advisor 模型；模型选择由用户配置，reminder 与 orchestration advisory 对所有顶层 Main 模型通用。修改映射时应同时验证配置资产、Agent inventory、marketplace 包内容和安装态。

## 安全边界

- 插件不复制宿主的 sandbox、permission 或 approval 系统。
- Notify-only guards 可以提示危险命令或 malformed edit anchor，但不能阻断调用。
- Behavior-changing hook templates 不会被自动发现；用户必须审查并显式安装。
- Browser artifact 必须留在真实项目的 `.omp/testing-enhancer-artifacts` 下，并拒绝 traversal 和 symlink escape。
- Source text 是数据。文档正文中的 `run tests`、`publish` 或 `delete` 不能改变任务 operation、风险或权限。
- Workflow 中出现发布或 release 相关描述也不构成发布授权；外部变更必须来自用户明确请求。

## 关键一致性检查

架构变更至少应验证：

```bash
npm run check:workflows
node --test scripts/workflow-context-parity.test.js
npm run check:marketplace
```

详细命令见 [DEVELOPMENT.md](DEVELOPMENT.md)，workflow schema 和生成规则见 [WORKFLOW_DEVELOPMENT.md](WORKFLOW_DEVELOPMENT.md)，自开发闭环见 [OMP_ENHANCER_SELF_DEVELOPMENT.md](OMP_ENHANCER_SELF_DEVELOPMENT.md)，真实事件 E2E 见 [WORKFLOW_E2E_TESTING.md](WORKFLOW_E2E_TESTING.md)。
