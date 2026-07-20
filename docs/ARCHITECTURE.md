# Architecture and Runtime Contracts

本文描述 OMP Enhancer 当前运行架构。`docs/superpowers/` 中的旧设计和实施计划是历史资料，不能作为当前行为依据。

## 运行模型

OMP Enhancer 采用“OMP 原生编排 + 可选参考信息”的模型：

1. OMP 的系统提示、用户指令、active tools、动态 Available Agents、权限、审批和完成行为始终具有最终权威。
2. Core 在普通顶层 Main turn 中只提取 operation、domain、scope、phase、risk、正文语言、`inspectionTargets` 和 `inspectionShape` 等 JSON-safe task facts。后两者只描述用户明确命名的目标与其可见独立性，不选择 workflow 或 Agent。
3. 当前任务状态标记为 `agent-selected`。Core 不预选 workflow、Skill、tool 或 Agent，也不改写子 Agent assignment。
4. Main prompt 对需要分析、判断、workflow composition、协调阶段或可能委派的任务使用 `DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY` 七阶段软协议。`DISCOVER` 在独立 batch 中只读取 `skill://omp-enhancer-workflows` 并等待；只有 exact native `skill-prompt` body named `omp-enhancer-workflows` 才算宿主已提供索引，managed context、Available Skills 列表或其他 Skill body 都不算。Main 随后的 response 在 byte 0 从 `W` 开始输出完整、可见的 exact `WORKFLOW PLAN`：`Skills` 只列 selected `D`/`C` exact Skill URI 或未枚举长尾 catalog URI，`Load order: NOW=[...] THEN=[...]` 把未由宿主提供的这些 URI 与 workflow reference URI 分开，并至少详列 `LOAD`、`COMMIT`、`SPLIT + EXECUTE` 和 `VERIFY` 四个 Actions。加载完声明资源后，下一个 response 同样在 byte 0 从 `W` 开始输出 exact `WORKFLOW READY | ...`，根据真实卡片和 Skill 指令初始化详细 TODO，然后结束并等待；项目工具只能从后续 response 开始。纯机械字段 lookup 不读 Skill 或建立 TODO。
5. 所有插件生命周期 hook 都是观察、记录或提醒用途；它们不返回 `block: true` 或 `continue: true`，不安排自动 repair turn。

项目没有活动的硬 router、classifier preflight、completion gate 或 plugin-owned completion owner。旧 compatibility router、classifier、runtime-policy、legacy adapter 及其公开诊断入口已删除；state migration 只能丢弃历史控制字段，不能恢复旧语义。质量审查产生的是证据，不是继续执行或结束会话的许可。

## 工作流信息如何到达 Main

工作流 definition 位于 `plugins/omp-enhancer-core/src/workflows/definitions/`，是 workflow card 的唯一语义来源。生成器把它们渲染为：

- `plugins/omp-config/assets/WORKFLOW_CATALOG.md`：用于显式配置同步和人工检查的完整目录；
- `plugins/omp-config/skills/omp-enhancer-workflows/SKILL.md`：保留 exact ID、完整 Primary 条件、literal 单卡 URI，以及最小 Skill 发现指针的紧凑选择索引；`D` 是顶层 exact URI，`C` 是索引显式暴露的 nested ECC exact URI。二者只是 optional candidates，绝不是 load sets；Main 只选择与请求的方法、证据规则、verdict 或格式匹配的 URI。文件把 `DECLARE HANDOFF (soft)` 放在 domain rows 前面，使 index result 先给出 byte-0 PLAN handoff，再提供选择表；
- `plugins/omp-config/skills/omp-enhancer-workflows/references/*.md`：每个 workflow 一张按需卡片，包含详细步骤、可选 Agents 与 delegation、质量检查、范围和风险；不再次暴露晚期 Add-on 或 Skill 候选。每张卡在详细 body 前后各放一个 `READY NEXT (soft)` sentinel；两者都提示下一 assistant response 在 byte 0 输出 filled `WORKFLOW READY | ...`、不含其他 visible text、只初始化 native TODO，然后结束等待。它们是冗余的软提示，不是插件 enforcement。

紧凑索引的当前大小由生成与 focused budget test 动态校验；文档不固化会随
workflow rows 和 handoff wording 再生成而变化的 byte snapshot。

Managed `AGENTS.md` 和 `WATCHDOG.yml` 不导入完整目录。Main block 要求需要分析、判断、workflow composition、协调阶段或可能委派的任务遵循 `DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY`；纯机械字段 lookup 无 Skill 或 TODO。`DISCOVER` 把紧凑 Skill index 当作导航，在独立 batch 中读取并等待；只有 exact native `skill-prompt` body named `omp-enhancer-workflows` 算 supplied index，其他 prompt、inventory 描述或 managed block 都不能替代它。之后 Main 的 response 在 byte 0 从 `W` 开始，用完整、可见且不含占位符的 exact `WORKFLOW PLAN` block 自主声明 `Primary:`、`Add-ons:`、仅含 selected `D`/`C` exact Skill URI 或未枚举长尾 catalog URI 的 `Skills:`、结构化 `Load order: NOW=[...] THEN=[...]`，以及至少四个详细编号 `Actions:`：`LOAD`、`COMMIT`、`SPLIT + EXECUTE`、`VERIFY`。Primary 负责最终交付物或请求操作；只有完整 Primary 条件独立匹配的其他请求操作或输出才成为 Add-on，不能仅为 Primary 已覆盖的内部阶段再加 workflow。完整 catalog 中的 `composeWith` 只供开发与人工参考；紧凑索引按行暴露 `D` 顶层 exact URI 与 `C` nested ECC exact URI，单 workflow card 则不重新打开晚期 Skill 选择。Main 从索引和 OMP 当前可见 Skill descriptions 中选择最小 owning Skill 集；索引把每张卡的 literal URI 标为 `PLAN URI:`，只复制到 `THEN`，不是 PLAN 前的调用。

PLAN 中的 `Skills` 只列选中的 exact domain Skill URI；只有未由索引枚举的长尾发现才列 `skill://ecc-skill-catalog`。`D` 直接复制顶层 `skill://<id>`，`C` 直接复制索引已显式给出的 `skill://ecc-skill-catalog/<id>/SKILL.md`；选中的 `C` 不先读取完整 catalog。Workflow references 只出现在 `THEN`。`NOW` 按相同顺序只复制尚未由宿主提供的 Skill/catalog URI，`THEN` 只复制所选 Add-on `PLAN URI`，并把 Primary `PLAN URI` 放在最后且只出现一次。PLAN response 读取 `NOW` 一次并等待；若 `NOW=[none]`，则改为读取 `THEN` 一次并等待。未枚举长尾或已加载方法可通过每批 `RESOURCE EXTENSION | source=<loaded-exact-skill-uri> | reads=<revealed-exact-skill-uris>` 暴露 exact URI；source 必须实际返回并可见披露该同 namespace URI，总计最多三批，且最多两次 catalog hop 加一次 linked-method resource batch。扩展结束后只读取 `THEN` 一次；若它已在 `NOW=[none]` 的 PLAN response 中加载，则不得重读。原生 `skill-prompt` 已提供的 domain Skill 仍列入 PLAN/READY，但从 `NOW` 中省略。所有资源返回或标记 unavailable 后，Main 的下一 response 在 byte 0 从 `W` 开始输出 `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>`，将实际资源步骤 rebase 为详细 TODO，并在只初始化 TODO 后结束等待。Loaded-card soft compiler 只有在 `subagent-driven`、input 完整、checkpoint 安全且 matching Agent 可见时才产生 exact `Delegate` row；否则写入一个匹配的许可 fallback，parent-owned `VERIFY` rows 保持独立。项目工具从 READY/TODO response 结束且结果返回后的下一 response 开始。有可用且允许的 native `todo` 时映射这些稳定行，否则同一 checklist 充当执行状态。Advisor block 给出一次早期 decision calibration 的窄例外；resource preparation 与 `writing.pending` 的一次语言解析保持窗口，其他首次 native `task` 或实质项目操作关闭窗口。

`D`/`C` 只是一组 optional candidates，绝不是整组加载指令；PLAN/NOW 只复制与请求的方法、证据规则、verdict 或格式匹配的最小 URI 集。特别是 `writing.latex` 仅承担 LaTeX preservation 的 Add-on 时选择零个 format Skills；只有显式 conversion 或 template 请求才选择一个方向匹配的候选。

卡片只提供建议。Main 可以选择、组合、简化或忽略卡片；Workflow、Agent 和 Skill 是不同命名空间，必须复制当前上下文中暴露的 exact ID 或完整 URI。顶层候选 Skill 必须在当前 OMP inventory 中可见；nested 候选必须由索引或已加载 source 显式暴露并由 exact resolver 成功读取；候选 Agent 必须出现在当前动态 Available Agents 列表中。

每张 definition 都会规范化为一个 `delegationDefault`。Catalog version 20 的 29 张卡片中，27 张非简单工作流是 `subagent-driven`；`agentic.simple` 是 `direct-simple`；`writing.pending` 是 `defer-until-composed`。选中 `subagent-driven` 卡片且 matching Agent 已暴露时，Main 默认把至少一个安全、完整、有界的 checkpoint 交给 subagent：优先使用卡片或已选组合卡片上的领域 Agent，没有合适领域角色时才用 generic native `task`。同一 wave 的 runnable independent checkpoints 进入一次 `tasks[]` batch；有依赖的 checkpoint 等待前序成功 delivery。Main 始终拥有 parent TODO、跨 delivery 集成、最终验证、finding disposition，以及权限、发布、外部写入等 host-authorized effects。

这仍是软默认而非强制 fork。纯机械任务完全跳过 staged workflow；显式选中的 `agentic.simple` 完成 PLAN/READY/TODO 后由 Main 直接执行，不仅因为选卡就调用 `task`。Writing 索引分为 `language`、`format overlays` 和 `specialized outputs`；正文起草或修改以语言 workflow 为 Primary、请求的格式 workflow 为 Add-on，只有纯格式转换、模板或结构任务才以格式 workflow 为 Primary。`writing.pending` 是唯一一次性 transition：初始 READY 后只做一次语言读取，不做实质审阅；随后公开 replacement PLAN，把 pending 换成 `writing.zh` 或 `writing.en`、保留格式 Add-ons，只加载新的语言资源，再公开 replacement READY。语言仍不明确时询问用户，不循环或猜测。用户要求 Main-only、matching Agent 或 capacity 不可用、assignment input 不完整、dependency 或 write overlap 使拆分不安全时，Main 记录具体 limitation 并直接 fallback，而不是伪造委派。对 `writing.en`/`writing.zh`，初始 READY TODO 冻结三个 exact Delegate rows：step-2 writer、step-3 checker 和 conditional step-4 corrected-proposal。Main 独自完成 checker finding disposition 后，step-4 只有两个完成分支：接受至少一个 finding 时 dispatch 原 frozen writer row，并且只有完整 corrected-proposal terminal delivery 后才对同一行执行 native TODO `done`；接受零个 finding 时不 dispatch，而是对同一 frozen row 执行 native TODO `done` 并记录 `resolved-no-repair`，绝不 rewrite、drop 或 abandon。后一个 no-op 分支只是 parent TODO condition resolution，不是 child delivery、成功 fork 或权限。Proposal-only writer 在 terminal child delivery 返回可直接使用的完整建议文本或 bounded patch，read-only checker 同样返回可直接使用的完整 in-band report；status-only 或 artifact-reference-only handoff 不完整。这里的 terminal delivery 是 host-neutral handoff，不要求特定宿主 schema。Main 独自决定并执行获授权的文件修改，再验证实际 artifact。`writer` 与 `zh-writer` 只暴露 `read`、`grep` 和 `glob`；`checker` 与 `zh-checker` 另有受 host/user 网络权限约束的 `web_search` 用于证据核查，但没有 `write` 或 `edit`。Writer 与 checker 都只消费 assignment 中冻结的 Skills，不再发现、选择或加载另一套 Skill。

普通代码任务只有一个通用 workflow：`code.dev`。原来的 `code.plan`、`code.debug`、`code.test`、`code.review`、`code.build`、`performance.optimize` 和 `research.technical` 均已退役，其选择条件由 `code.dev` 覆盖。`code.dev` 使用唯一通用过程 Skill `code-development`，并把全局 subagent-driven 默认具体化为下面的 plan、vertical TDD、Main review 和 bounded reviewer lifecycle。

Main 先检索本地入口、调用者、测试、配置以及 source/generated/package/installed 差异；只有外部行为或当前实践会影响决定时，才补充一次有界的官方资料与社区经验检索。它据此写出依赖有序的 parallel waves 和 vertical slices。每个 slice 明确 ID、验收目标、依赖、exclusive write set、本地锚点、公开 test seam、exact focused command、expected valid RED、最小 production boundary、所需 Skills、integration point 和 return evidence。当前 exposed 的插件 `plan` 在 production mutation 前审阅整份计划与 assignment map，Main 逐项记录 finding disposition。

同一 wave 中所有 runnable independent slices 通过一次 native `task` `tasks[]` batch 提交；有依赖的 slice 等待后续 wave，一个不可再拆的安全 slice 只使用一个 task。每个 task 独占完整 vertical TDD slice：test mutation、有效 RED、最小 production change、同一命令 GREEN，以及只在 GREEN 后进行的 refactor。Main 等待完整 delivery，集成 current tree，并运行 focused 与比例适当的 broader verification；然后在任何 reviewer assignment 前公开写出 `MAIN REVIEW`，检查 current tree、bounded semantic diff、task 返回的 RED/GREEN evidence、验收覆盖、scope 和 cross-slice interaction。

会重写共享输出集合的 generator 不能属于多个并行 source slices。这个 downstream exclusive integration task 在全部 source dependencies 完成后恰好运行 generator 一次（exactly once），并独占 generated write set。它是 mechanical generation slice：证据是 generator exit、check/parity 结果与 no-unexpected-diff 检查，不得伪造 TDD RED。Delivery 后，Main 检查 generated diff，运行 check-only parity 与 broader validation，但不得再次运行 generator；其他并行 workers 也不得运行同一 shared generator 或声明其输出 write set。

Native `reviewer` 只接收 Main-reviewed 的 bounded diff 与 supplied evidence，不读取项目或运行命令。Main 验证每项 finding；只有 supported、in-scope 的 material finding 才回到 native `task` 做 bounded repair。Repair 后刷新 affected evidence 并再次 `MAIN REVIEW`，只有 materially changed input 才最多请求一次 fresh affected reviewer pass。Agent 缺失、capacity 不足、assignment input 不完整或 write set 无法安全分离时，Main 明确记录 limitation，并只采用 OMP 权限允许的最安全 fallback。这些都是提示词层的软指导，不是 fixed fan-out、hard router、gate、fork mandate、completion controller 或 automatic repair loop。

开发 OMP Enhancer 自身时，`omp.plugin` 是独立的完整生命周期 Primary，并同样加载 `code-development`，再按条件读取 `references/omp-enhancer.md`。`omp.plugin` 与 `code.dev` 不互相列入 `composeWith`，因为前者已经覆盖本仓库专属的生成、打包和 installed E2E 边界。普通代码阶段只使用插件 `plan`、native `task` 和 native `reviewer`，不再打包 `explore`、`implementation-task`、`config-librarian`、`omp-target-auditor`、`test-planner`、`test-executor` 或 `test-reviewer`。设计原则与执行方法见 [OMP_ENHANCER_SELF_DEVELOPMENT.md](OMP_ENHANCER_SELF_DEVELOPMENT.md)，事件级测试方法见 [WORKFLOW_E2E_TESTING.md](WORKFLOW_E2E_TESTING.md)。

每个 delegated native TODO `items[]` string 必须完整等于 `Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>`；不能缩写成 role-colon、Draft 或 Check 行。Checkpoint 是完整、单行且 metadata-safe 的任务标签。Dispatch 时把该行的 Agent 原样复制到 native `tasks[].agent`，把 workflow、step、skills 原样复制，并把 checkpoint 原样复制到 `todo`。Native `tasks[].task` 本体自身的 byte 0 必须是 `[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]`，不能先写 `# Target` 或 `# Goal`；每次 native `task` call 都必须提供非空顶层 `context`。共同的 batch `context`、name、label，或让 child 自己输出 metadata 的说明都不能替代 item body 或其 byte-0 前缀。正文再携带该 child 所需的完整 bounded input；child 不拥有 parent TODO，只消费冻结的 assignment Skills，不重新执行 workflow/Skill discovery、选择或加载。完整 proposal/report 属于 terminal child delivery，不应只留在较早 ordinary message 后以 status-only 句子结束。若冻结集合不足，child 返回具体 limitation，由 Main 判断是否 rebase。失败、取消或 partial delivery 不算完成。只有新的 dependency、scope、permission、tool、Agent、schema、capacity、Skill-load failure 或相反项目证据才允许 rebase 受影响 TODO 行。

## Flash-model compatibility reminders and phase-local coaching

Core 为精确的 `opencode-go/deepseek-v4-flash` 和精确的 `opencode-go/mimo-v2.5` 保留 compact、state-aware 的模型特定 bootstrap。两者都只适用于顶层 Main，并且每个活动任务最多发送一次隐藏 custom hook message；provider、model ID、子 Agent 或 Advisor 不匹配时不发送。Bootstrap 不复制完整 workflow catalog，而是根据当前可见 workflow Skill、其他 Skills、native `task`、delegation 许可，以及 exact native supplied-index provenance 选择最小入口提示。

当 workflow index 可见时，bootstrap 的第一响应决策只有三种：机械 DIRECT；`INDEX STATUS=SUPPLIED BY EXACT NATIVE skill-prompt`，随后直接由该正文进入 byte-0 PLAN；或 `INDEX STATUS=NOT SUPPLIED`，仅调用 `read(path=skill://omp-enhancer-workflows)` 后结束等待。Available Skills metadata、managed prompt 和 reminder 自身永远不能伪装成 supplied body。索引返回后，front-loaded `DECLARE HANDOFF (soft)` 接管 PLAN；workflow reference 前后的两个 `READY NEXT (soft)` sentinels 都提示同一个 byte-0 READY、no-other-visible-text、TODO-init-only、end/wait 边界。这样 bootstrap 只稳定状态转换，不替 Main 选择 workflow、Skill、Agent 或 fork width。

同一 exact-model、top-level Main 范围内，Core 还使用一个 bounded phase-local protocol coach：成功验证 workflow index result 或 exact native supplied index 后排队 `PRE_PLAN`；Main 的完整 byte-0 PLAN 所声明的 NOW、可见 `RESOURCE EXTENSION` 与 THEN 全部返回或明确 unavailable 后排队 `PRE_READY`；最终非 `writing.pending` generation 的 byte-0 READY 后，成功 native TODO result 才排队 `PRE_DISPATCH`。每个 cue 只作为隐藏 ephemeral custom message 附加到下一次自然 provider request 的 copied context；provider retry 或无效的 corresponding marker 只保留同一个 pending phase-generation cue，不创建新 cue 或新 turn，有效 marker 或已观察到的下一阶段动作才消费它。

普通 task 最多各有一次 `PRE_PLAN`、`PRE_READY`、`PRE_DISPATCH`；`writing.pending` 只有在合法 replacement PLAN 切换到 `writing.en` 或 `writing.zh` 后，才允许 second-generation `PRE_READY` 和后续 dispatch cue。Malformed、prefaced 或 contradictory PLAN/extension 只留下诊断，不猜 URI、workflow 语义或下一步。Cue 只复述 byte-0 marker、resource wait、TODO/task schema、committed assignment 的 exact key order、`tasks[]` batch 的非空 top-level `context`、可直接使用的 terminal delivery，以及 no-op conditional checkpoint 的 completed 而非 abandoned 状态；它不使用 `sendMessage` 或 `triggerTurn`，不改写 `systemPrompt`、既有 message、tool input/result，也不形成 block、router、gate、retry 或 completion control。`OMP_ENHANCER_DISABLE_PROTOCOL_COACH=1` 单独关闭该 coach。

Reminder 会根据 OMP 当前暴露的能力组合以下信息：

- 当 inventory 包含 `omp-enhancer-workflows` 时，提醒使用 `DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY`：索引未由 exact native `skill-prompt` body named `omp-enhancer-workflows` supplied 时执行独立 index-only `DISCOVER` batch，已提供时不重读；在 byte 0 公开 exact `WORKFLOW PLAN`，用 `NOW=[selected D/C exact Skill URIs or long-tail catalog URI]` 与 `THEN=[Add-on references; Primary reference last]` 执行 resource-only load；全部资源返回后在 byte 0 输出 exact `WORKFLOW READY | ...`，把 exact Delegate strings 写入 native TODO `items[]`，再按 TODO 拆分、执行和验证；
- 当只有其他可见 Skills 时，保留相同的 PLAN、resource-only Skill load 和 READY 顺序，但不猜测不可见 workflow ID；
- 当只有原生 `task` 能力适用时，只提醒 Main 先计划、在允许时提交 native TODO，再自主决定 direct 或 delegation；
- 当原生 `task` 可用且用户未禁止 Agent 或 delegation 时，可以复述当前 task-shape、review-budget 与 delegation 能力事实，但不选择 Agent、fork width、reviewer count 或 dispatch。

它可以用祈使句要求模型明确计划、加载所选资源、更新自己的 TODO，并复述当轮 OMP canonical delegation contract；但它不独立选择 plugin workflow、Skill candidate、Agent 或 fork，不自行发起 task，不授予权限，不替换 `systemPrompt`，不改变 task schema，也不因模型漏做某一步形成插件自有 gate、自动 retry 或 continuation。`OMP_ENHANCER_DISABLE_DEEPSEEK_COMPAT=1` 和 `OMP_ENHANCER_DISABLE_MIMO_COMPAT=1` 只用于对应精确模型的受控 reminder 诊断。

## 插件职责

| 插件 | 运行职责 | 不负责的事项 |
| --- | --- | --- |
| Core | task facts、会话状态、DeepSeek/MiMo exact-model reminders、bounded phase-local context cues、extension-tool activation | workflow 选择、硬路由、权限或完成控制 |
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

真实模型 E2E 只把 parent event stream 用作其中可见的 PLAN、resource result、READY、TODO、task assignment/completion、host-observed child delivery、Main tool call、visible `MAIN REVIEW`、review delivery 与 final 的证据；模型自述不能补造 child 内部行为或缺失阶段。Fixture snapshot 独立证明最终文件 outcome，但共享工作区中的变化若没有匹配的 parent mutation call，只能标为 `unattributed-shared-workspace`，不能仅按变化发生在 child assignment 与 delivery 之间就断言为 child write。`requiredNativeTaskAgentSequence` 是场景显式 opt-in 的观察断言：后序 Agent 的首次 assignment 必须晚于前序 Agent 的成功、非空、host-observed delivery；它从不成为所有场景的全局 gate。真实模型中的 workflow、Skill、TODO 和 fork 数量仍是有随机性的行为样本，不是插件保证。具体 evaluator、mutation attribution、可观察性限制和 failure classification 见 [WORKFLOW_E2E_TESTING.md](WORKFLOW_E2E_TESTING.md)。

## 配置上下文

`omp_config_sync_workflow_context` 采用 preview-first：默认 `apply=false`，只有显式 `apply=true` 才更新 managed blocks。同步保留目标文件中的无关内容。

Main block 声明 OMP 原生权威以及 `DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY` 七阶段软协议，包括只有 exact native `skill-prompt` body named `omp-enhancer-workflows` 才算 supplied index、PLAN/READY 位于 byte 0，以及 `Load order: NOW=[...] THEN=[...]` 的分层资源顺序。Advisor block 额外允许在准备窗口内使用至多一条普通 `DECISION CHECK (optional)`：它只能指出该顺序中最早的一个可见实质漂移、选中 subagent-driven 卡片后缺少 delegation-or-fallback disposition，或一个可见 assignment schema/evidence mismatch，并给出最小安全动作；Main 可以接受、调整或忽略。顺序 coherent 时 Advisor 保持沉默并等待后续 checkpoint。Main 始终独立决定 direct work、Agent 和 fork width；Advisor 不选择替代 Agent、宽度、dispatch 或 retry。Workflow/Skill preparation reads 不关闭普通窗口；Main 首次 native `task` 或实质项目操作后窗口归零。Advisor 不得猜不可见 ID、要求重复 Skill 读取、把 workflow/plan/TODO/metadata/schema evidence 升级为 blocker，或仅为补记录要求重启有效工作。Advisor 的工具 schema 只代表 Advisor 自己的能力，不能用来反推 Main 缺少某项工具。

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
