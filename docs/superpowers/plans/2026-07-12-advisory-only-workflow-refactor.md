# OMP Enhancer advisory-only 工作流重构计划

日期：2026-07-12

本方案取代 `docs/superpowers/` 中此前关于 OMP runtime completion gate、hard gate、GateController、action boundary 和自动修复续跑的设计。旧文档仅保留为历史记录，不再描述当前运行时合同。

## 目标

把 OMP Enhancer 全栈从运行时门禁系统改为建议型工作流编排系统。

插件继续负责：

- 识别任务类型、阶段和复杂度；
- 推荐 skills、tools 和可选角色；
- 注入可执行的工作流步骤、风险提醒和质量检查建议；
- 记录 route、skill、subagent 和质量工具的诊断状态；
- 为写作任务根据被修改正文而不是提示词语言选择中文或英文写作资源。

插件不再负责：

- 返回 `block: true` 阻止任何工具调用；
- 返回 `continue: true` 阻止会话结束或自动生成修复轮次；
- 通过插件状态复刻 host 的授权、sandbox 或审批系统；
- 因缺少 skill、subagent、测试、review、release 或 QA 证据而阻止 agent 继续；
- 自动重试质量工具、测试工具或写作检查。

Host 自身的 sandbox、权限审批和系统安全边界不在本次范围内，也不会被绕过或替代。

## 统一合同

所有运行时插件遵守以下不变量：

1. `tool_call` hook 永远不返回 `block: true`。
2. `session_stop` hook 永远不返回 `continue: true`。
3. 缺失 workflow evidence 只生成 advisory findings，不触发自动续跑。
4. route constraints 是工作流提示，不是插件级授权令牌。
5. `requiredSkills`、`requiredTools` 和 `requiredSubagents` 迁移为推荐资源；兼容字段如果暂时保留，也不参与阻塞或完成判定。
6. gate/review 工具可以报告 critical findings，但 findings 本身不控制 host 生命周期。
7. Core 不注册重复输出控制器；重复处理交给 host 和当前 agent，不调度 continuation。
8. 旧 session 中的 terminal、blocked、exclusive budget 和 GateController 状态不会在新版恢复成执行限制。

## 写作语言路由

写作工作流采用两阶段语言解析：

1. 操作识别阶段只从可信指令识别“润色、改写、翻译、起草”等意图；正文内容不能授予额外工具或副作用。
2. 语言选择阶段只看被修改正文：
   - inline 正文直接做确定性语言检测；
   - 明确翻译目的语或输出语言时，以目的语为准；
   - 只有文件路径时，纯路由先进入 `writing.pending`；runtime 在 `before_agent_start` 安全读取 workspace 内普通目标文件并二次路由，无法读取时继续 pending；
   - 中文指令加英文正文选择英文 skills；
   - 英文指令加中文正文选择中文 skills；
   - 无正文时不以 UI/提示词语言回退为中文或英文；
   - mixed 或多目标混合语言按目标分别处理，不强行选择单一语言资源。

正文只参与 `writingLanguage`、语言置信度和必要的复杂度判断。正文中出现 `run tests`、`publish`、`delete` 等文字不会改变 operation、domain、risk 或授权提示。

## 实施分块

### 1. Core runtime

- 保留 `before_agent_start` 路由和工作流指导注入。
- `tool_call` 记录 task/subagent 进度，并可向已发起的 task assignment 注入 advisory context；它不拒绝或延迟调用。
- `tool_result` 只记录诊断证据。
- `session_stop` 只持久化 advisory assessment，然后返回 `undefined`。
- 移除注册工具自身的 exclusive-tool 拒绝路径。
- 退出 GateController、gate recovery、smart gate、action boundary、exclusive-tool budget 和 plugin approval state 的运行时使用。
- 删除 core 的 generated-output loop guard 和 continuation 状态。

### 2. Route 与 guidance

- RoutePlan 输出推荐 steps、skills、tools、roles、quality checks 和 risk notes。
- 删除 `hardBlock`、`hardBlockReasons` 和 completion gate 语义。
- Route card 的 `Gate` 改为 `Recommended checks`。
- `Mandatory Skill Workflow` 改为建议型 skill workflow。
- skill 不可用时允许 best effort，并要求说明 limitation；不再要求 `SKILL_USAGE`/`SUBAGENT_USAGE` 才能完成。

### 3. Testing Enhancer

- 不再注册阻塞型 `tool_call` 和 `session_stop` handlers。
- 保留测试分析、上下文、browser evidence、coverage、mutation、review 和报告能力。
- `omp_test_gate` 作为兼容名称返回 advisory review；它不执行命令，也不控制会话生命周期。
- blocker 只表示 critical finding，不表示 runtime block。

### 4. Config、Fact Checker 与 Writing Helper

- config 的 destructive-command 和 edit-anchor hooks 改为 warning，不返回 block。
- bundled agents 删除 `blocking: true`。
- fact-check workflow 缺项返回 incomplete/warnings，而不是 `isError: true`；真实参数和 I/O 错误仍保留错误语义。
- writing skills 的默认流程改为单轮建议；多轮修复只在用户显式要求时进行。

### 5. 文档与兼容性

- README 明确 advisory-only 边界和 host 权限边界。
- 保留现有公共工具名作为兼容入口，但更新 label、description 和 details。
- marketplace 描述去掉 completion gate/hard gate 宣称。
- 旧 gate 设计文档保留为历史记录，并在新计划中声明已被本方案取代。

## 验收

必须同时满足：

1. Core workload matrix 中任意 tool call 都不会得到插件级 `block: true`。
2. Core 和 Testing Enhancer 对任意 route、旧持久化状态和缺失 evidence 都不会返回 `continue: true`。
3. bundled hooks 和 agents 中不存在会生效的 `block: true`、`continue: true` 或 `blocking: true`。
4. `before_agent_start` 仍能给出 route、推荐 skills、步骤和风险提醒。
5. 中文指令加英文正文选择英文写作资源；英文指令加中文正文选择中文写作资源。
6. 只有 `.tex` 路径且没有正文时，返回 pending language guidance，不选择中文或英文专用 skill。
7. 写作正文中的工具或发布词不改变任务权限与操作路由。
8. 各插件测试、TypeScript typecheck/build、marketplace check、pack-all 和 `git diff --check` 全部通过。

## 实施结果

2026-07-12 已完成本方案：

- Core runtime 不再拥有 completion、approval、action boundary、loop repair 或 continuation 控制器。
- Config 的 guard hooks 只告警；兼容 guard skills 已改为建议型检查表。
- Testing Enhancer 只保存 route-scoped review diagnostics，兼容工具名不控制 host 生命周期。
- Fact Checker 和 Writing Helper 的普通 findings 不再作为执行许可。
- 写作语言按 inline 正文、明确输出语言或安全读取到的 workspace 目标内容解析。换行正文也按数据隔离；提示中的语言标签不能绕过现有文件读取；混合目标按 target/section 给出语言指导。
- 默认写作、review、humanizer 和验证技能采用一次有界处理，不自动开启下一轮，也不尝试旧式斜杠技能命令。
- Bundled reviewer 在 CI、lint、测试、范围或安全检查失败时记录限制并继续独立审查，不再自停或强制调度其他 reviewer。
- 通信、loop、GAN、TDD、构建修复等 bundled agent 只给出 host 授权范围内的建议和有界尝试；不再隐式发送、归档、commit/push、自动恢复循环或迭代到阈值。各语言 build resolver 保留最多三次修复后的有界退出，用于防止重试风暴。

最终验证结果：

- 根 `npm test`：694 项通过，其中 Core 414、Config 27、Writing 86、Testing 149、Fact Checker 11、release scripts 7。
- Writing coverage：lines、branches、functions 均为 100%。
- Testing Enhancer：TypeScript typecheck、build、26 个文件中的 149 项 Vitest 全部通过。
- `skill-comply`：33 项 pytest 全部通过。
- `npm run check:marketplace`、`npm run pack:all`、`git diff --check` 全部通过。
- 静态扫描没有发现生效的 `block: true`、`continue: true`、`blocking: true` 或 `autoContinue: true`，也没有发现 bundled agent 的强制调度、hook completion block、无界 build loop 或隐式全工具授权措辞。

## 发布与安装态 E2E

后续发布流程已完成全量 patch 升级、提交、推送、marketplace 刷新和本机安装同步：

- `omp-config` 0.1.20；
- `writing-helper` 0.2.5；
- `omp-testing-enhancer` 0.1.13；
- `omp-fact-checker` 0.1.4；
- `omp-enhancer-core` 0.1.96。

安装态 OMP E2E 已验证：

- 中文指令加英文正文选择 `writing.en/advisory`；
- 英文指令加中文正文选择 `writing.zh/advisory`；
- 中文单目标文件按文件正文选择 `writing.zh/advisory`；
- 中英多目标保持 `writing.pending/advisory`；
- 隔离目录中的真实 `edit` 在 host `yolo` 审批模式下成功执行，Core 没有阻塞或自动续跑，也没有创建额外文件；
- 任务矩阵发现“检查代码 bug 并给出证据”曾被 legacy 路由误判为 `fact-check`。修复通过提示边界说明和 advisory 路由优先级完成，没有增加硬门禁；现在所有兼容模式均返回 `bug-audit`。
- 多样本路由工具 E2E 曾因引号内的写作样例污染外层任务而注入额外写作指导。现在外层诊断提示按 `diagnosis/advisory` 处理，样例只作为工具输入；如果同类命令文字本身位于明确的待润色正文中，仍保持 `writing.*` 路由。该修复只收紧提示边界，不阻断工具，也不自动续跑。
- 0.1.94 安装后复审发现，带礼貌语、投稿前言或 README 措辞的真实写作请求仍可能被多样本诊断规则误认。0.1.95 统一遮蔽 quoted、fenced、A/B probe 和写作正文中的工具术语，并让 source-driven writing 在 `legacy|observe|enforce` 下保持一致；显式“验证润色提示如何路由”的多种中英文表达仍返回诊断。测试、发布、联网、代码修改或安全审计等 companion action 不再被写作正文或纯诊断 shortcut 吞掉。生命周期回归确认工具调用不被阻断、`session_stop` 不续跑、状态中没有 gate/loop controller。
- 0.1.96 进一步修复了短正文同时包含多个 snake-case 工具标识符与正文负句时的语言退化：工具标识符不再压倒正文语言，英文选择 `writing.en`，中文选择 `writing.zh`；正文里的“不要写文件/不要运行测试”仍作为待润色数据，不会变成执行权限。
