# DeepSeek Flash 路由与工作流遵循修复计划

日期：2026-07-12
状态：已完成（代码、发布、本机同步、mandatory E2E 与 advisor stress 均已验证）

## 1. 计划定位

本计划是 `2026-07-12-advisory-only-workflow-refactor.md` 的后续加固，不推翻已经完成的 advisory-only 架构。此前重构已经移除了插件硬门禁、完成门禁和插件自动修复续跑。本轮只解决安装态测试暴露出的路由遗漏、skill 使用不稳定、工具调用不收敛、写作语义漂移、旧 managed skill 干扰，以及 Core 对宿主 autolearn 隐藏轮次的兼容问题。

本轮修复采用两类手段：

1. 对提示无法补偿的确定性信息丢失和错误路由，修正 descriptor 与 route projection。
2. 对 DeepSeek Flash 的 skill 选择、工具纠错、预算收敛和 advisor 消化方式，优先优化 governance、agent 和 skill 提示。

所有质量检查仍然只产生建议或诊断，不得成为工具许可、完成许可或自动续跑条件。

## 2. 已确认基线

当前工作树基线为 `b504438`，计划编写前工作树干净。安装态主要版本为：

- OMP `16.4.6`
- `omp-enhancer-core` `0.1.96`
- `omp-config` `0.1.20`
- `writing-helper` `0.2.5`
- `omp-testing-enhancer` `0.1.13`
- `omp-fact-checker` `0.1.4`
- 主模型 `opencode-go/deepseek-v4-flash`

真实模型测试已经确认：

- 自然英文写作请求 8 个样本中，实际 skill 读取为 0。
- 自然中文写作请求 6 个样本中，实际中文写作 skill 读取为 0。
- 7 个非平凡编程、计划或审计工况没有一次在时限内正常完成。
- 显式要求“调用路由并实际读取 skill”时可以成功，说明 skill 机制可用，主要问题是路由资源和提示强度。
- 两个隔离写入样本均只修改了目标文件，但英文样本删除了 `typically` 和 `significantly`，形成语义强化。
- 中文样本在正确读取 skill 后仍受到 advisor 重复建议影响，出现多轮重复读取和重复最终稿。
- Core 没有返回 `block: true` 或 `continue: true`，也没有观察到 protected action boundary、GateController 或插件 continuation。

稳定复现的确定性问题包括：

| 工况 | 当前行为 | 目标行为 |
|---|---|---|
| 只读审查 `第5章-合并正文.md` | observe 为 `unknown`，正文目标丢失 | 安全读取目标正文，按正文选择 `writing.zh` |
| 路径、实体和数字混合的事实核查 | `unknown` 或 writing | `fact-check/factcheck.document` |
| `Do not browse.` | 仍为 `networkAccess=required` | `networkAccess=forbidden` |
| 普通 `.tex` review | 混入三项格式转换 skill | review skill，无 converter |
| 实现与测试计划 | observe 保留 `writing.zh` | `planning/code.plan` |
| 测试策略且禁止执行 | `bug-audit` | planning，测试设计建议但无执行工具 |
| autolearn capture prompt | Core 当普通 unknown 轮次注入 guidance 并重置 route | Core 完全让路，宿主 capture 正常运行 |

## 3. 不可变约束

以下条件在每个提交、每次发布和最终安装态 E2E 中都必须成立。

### 3.1 保留宿主 autolearn

- 保留 `autolearn.enabled: true`。
- 保留 `autolearn.autoContinue: true`。
- 不修改 `autolearn.minToolCalls`，除非用户另行要求。
- 允许宿主在满足阈值后生成一次隐藏的 `customType: autolearn-nudge` capture turn。
- Core 的 `routePlan.autoContinue: false` 只表示“Core 自己不发 continuation”，不能把它解释成关闭宿主 autolearn。
- 面向用户的状态文本把模糊的 `Auto-continue: false` 改为 `Core continuation: none`；兼容 JSON 字段暂时保留一个版本。

### 3.2 不恢复硬门禁

- 任意插件 `tool_call` handler 都不得返回 `block: true`。
- 任意插件 `session_stop` handler 都不得返回 `continue: true`。
- 不增加 GateController、completion gate、action boundary、exclusive completion budget、loop controller、自动 repair turn 或工具重放器。
- 缺少 skill、subagent、测试、写作 QA 或事实证据时，只能报告 limitation 或 advisory finding。
- host sandbox、审批、凭据和网络能力仍由 OMP 本体负责；插件既不绕过，也不复刻。
- 参数错误、真实 I/O 错误和工具自身执行失败可以继续使用 `isError: true`；普通质量问题不得伪装成执行错误。

### 3.3 保持权限语义清晰

- 正文读取目标不是写入授权目标。
- route constraint 是用户范围描述，不是插件授权令牌。
- classifier 只能提供单调的 workflow hint，不能增加副作用或删除用户限制。
- advisor 不能授予写入、联网、发布或继续执行的权限。

## 4. 总体设计

本轮采用以下数据流：

```text
用户提示
  -> TaskDescriptor
       -> writingSourceTargets  只表示正文来源
       -> workspaceWriteTargets 只表示写入范围
       -> planning/fact/review/no-network 确定性信号
  -> compiled advisory RoutePlan
       -> 最小主 skill
       -> 有界步骤、工具和质量建议
  -> before_agent_start
       -> 普通用户轮次：注入 guidance
       -> autolearn capture：不注入、不改 route、不记业务证据
  -> tool_result
       -> 只把成功的真实 skill read 记为 observed
  -> session_stop
       -> 只持久化诊断并返回 undefined
```

实施遵循测试优先：每组先提交可复现的 RED 用例，再完成最小实现；不提交长期失败状态。

## 5. 阶段 0：冻结基线并建立可重复测试资产

### 5.1 新增确定性 fixture

新增：

- `plugins/omp-enhancer-core/test/fixtures/deepseek-compliance-matrix.json`

每条 fixture 至少包含：

- `id`
- `prompt`
- `routerModes`
- `expectedIntent`
- `expectedWorkflow`
- `expectedOperation`
- `expectedDomains`
- `expectedSourceTargets`
- `expectedConstraints`
- `requiredSkills`
- `forbiddenSkills`
- `forbiddenPhases`

首批 fixture 直接使用真实失败提示，避免只覆盖人工构造的短句：

1. `只读检查第5章-合并正文.md的中文逻辑和行文，不要修改文件。`
2. `Review "papers/Main Draft/abstract.tex" for academic English logic and clarity; do not modify files.`
3. `核查 sections/5.7.md 中 Claude Mythos Preview、CyberGym 83.1% 和钓鱼盈利约50倍三个事实是否有本地引文支持。`
4. `Fact-check claims in chapters/intro.tex. Do not browse.`
5. `为修复 agent fleet 路由问题制定实现和测试计划，不要修改文件。`
6. `为 agent-fleet 的路由逻辑设计测试策略，不运行测试也不修改文件。`
7. `检查 agent-fleet 的路由 bug 并给出文件证据，不修改文件。`
8. `.tex`、`.md`、`.docx` 的 review、polish、convert 正反对照。

### 5.2 新增安装态 E2E harness

新增：

- `scripts/e2e/run-installed-deepseek-workflow.mjs`
- `scripts/e2e/summarize-installed-deepseek-workflow.mjs`
- `scripts/e2e/fixtures/deepseek-installed-matrix.json`

runner 使用真实安装态命令和 NDJSON 事件流：

```bash
omp \
  --mode json \
  --model opencode-go/deepseek-v4-flash \
  --thinking minimal \
  --approval-mode=yolo \
  --session-dir <isolated-session-dir> \
  --no-title \
  --max-time <scenario-timeout> \
  -p '<prompt>'
```

普通只读场景只开放必要的 `read,grep,glob`。隔离编辑场景只增加 `edit`。autolearn 专项不能使用 `--no-session`，因为需要观察 synthetic custom message；其他场景使用独立 session 目录，防止上下文串场。

summary 必须从事件流判定，而不是相信模型自述：

- 实际 `read(skill://...)` 或 `SKILL.md` 读取；
- route tool 结果；
- 工具名、参数、成功与失败次数；
- 相同失败调用是否原样重试；
- advisor custom message；
- `autolearn-nudge` hidden turn；
- primary user-visible final 数量；
- Core continuation 数量；
- exit code、stop reason 和耗时。

原始 transcript 保存到 `/tmp` 或未跟踪的 `.omp/e2e-results/<run-id>/`。提交内容只包括脱敏汇总，不提交论文正文或用户项目路径下的生成物。

### 5.3 基线命令

修复前后记录：

```bash
git rev-parse HEAD
git status --short
omp --version
omp plugin list --json
omp models --json
omp config get autolearn.enabled
omp config get autolearn.autoContinue
omp config get autolearn.minToolCalls
```

## 6. 阶段 1：拆分正文读取目标与写入目标

这是 P0 确定性修复。提示词无法恢复已经在 descriptor 规范化阶段丢失的路径。

### 6.1 先写 RED 测试

修改：

- `plugins/omp-enhancer-core/test/task-descriptor.test.js`
- `plugins/omp-enhancer-core/test/advisory-runtime.test.js`
- `plugins/omp-enhancer-core/test/router-adversarial.test.js`

新增用例：

1. `normalization keeps writing source targets independent from write authorization`
   - `operation=inspect`
   - `workspaceWrite=forbidden`
   - `writingSourceTargets=['章节/第一章/引言.tex']`
   - 断言 source target 保留，write target 为空，没有 `fs.write` 和 workspace-write risk。
2. 只读 review 提取 Unicode、空格、引号和嵌套路径。
3. 中文指令加英文 `.tex` 正文选择 `writing.en`。
4. 英文指令加中文正文选择 `writing.zh`。
5. 多目标中英混合继续保持 pending 或逐目标观察，不强行选择单一语言。
6. 不存在、超大、二进制、`../`、绝对路径、symlink escape 均不得被读取。
7. 读取失败只保持 `writing.pending`，不返回 error，不影响工具执行和会话结束。

### 6.2 最小实现

修改 `plugins/omp-enhancer-core/src/task-descriptor.js`：

- 增加 `writingSourceTargetsFor(prompt)`，提取 review、inspect、polish、rewrite、translate 等写作任务中的文档来源。
- 支持 Unicode、空格、引号、嵌套路径和多个目标。
- `describeNaturalLanguageTask()` 写入 `writingSourceTargets`。
- `normalizeTaskDescriptor()` 始终规范化 `writingSourceTargets`，不受 `constraints.workspaceWrite` 影响。
- `workspaceWriteTargets` 继续只在实际写入被请求时保留。
- 旧 descriptor 只在明确写作上下文中使用 `writingSourceTargets ?? workspaceWriteTargets` 兼容一个版本。

修改 `plugins/omp-enhancer-core/index.js`：

- `resolveAdvisoryRoute()` 和 `readWritingTargets()` 改读 `writingSourceTargets`。
- 继续使用 realpath、regular-file、size、NUL、symlink 和 workspace containment 检查。
- observation details 明确标记为 `writing-source`，不得暗示写权限。

修改 `plugins/omp-enhancer-core/src/governance.js`：

- pending guidance 展示 `writingSourceTargets`。
- 文本改为“source to inspect”，不再称为可写目标。

### 6.3 验收

- 只读 path review 可以在 `before_agent_start` 完成正文语言二次路由。
- `workspaceWrite=forbidden`、capabilities 和 risk 不因 source target 改变。
- 现有 inline source、translation target、mixed source 和安全路径测试保持通过。

## 7. 阶段 2：修正 route intent、资源映射和默认投影

### 7.1 新增 planning advisory route

新增 public intent `planning`，workflow 为 `code.plan`。它只提供计划方法，不授予写入或测试执行能力。

修改：

- `plugins/omp-enhancer-core/src/task-descriptor.js`
- `plugins/omp-enhancer-core/src/route-policy.js`
- `plugins/omp-enhancer-core/src/router.js`
- `plugins/omp-enhancer-core/src/workflow-routes.js`
- `plugins/omp-enhancer-core/src/classifier.js`

设计：

- 增加 `planningWork` 信号和 provenance reason。
- descriptor 仍使用 `inspect -> answer` phases，避免让 `plan` 被误解成副作用 operation。
- classifier 的 `operationHint: plan` 显式映射为 planning hint，不直接写入 capability-bearing operation。
- 涉及测试策略时保留 `tests` domain，但 `testExecution=forbidden` 时不推荐执行工具。
- planning 主 skill 为 `brainstorming` 和 `writing-plans`；AI 路由回归可以建议 `ai-regression-testing`，但不能因为禁止运行测试而错误删除测试设计 skill。
- 项目 `AGENTS.md` 明确指定 `superpowers-*` skill 时，后续 governance 要求精确项目名称优先。

RED 用例：

- 实现与测试计划，禁止修改。
- 测试策略，禁止修改和运行测试。
- 英文 test strategy。
- 负向控制：写一份测试策略文档仍是写作 artifact；运行测试仍是 testing；补测试并修代码仍是 implementation；检查 bug 仍是 bug-audit。

### 7.2 修正 writing review 与 converter 映射

增加可选的 `writingTaskKind`：`review | polish | draft | translate | convert | unknown`。它只影响 workflow 资源，不影响授权。

资源映射：

| 任务 | 首要 skills | 禁止默认加入 |
|---|---|---|
| 英文 polish | `writing-markdown-helper` | review/checker/converter |
| 英文只读 review | `writing-review` | `writing-markdown-helper`、converter |
| 英文 broad review | `writing-review`、`writing-checkers` | converter |
| 中文 polish | `plain-chinese-writing`、`zh-writing-polish` | review/converter |
| 中文只读 review | `plain-chinese-writing`、`zh-writing-review` | `zh-writing-polish`、converter |
| 中文 broad review | `plain-chinese-writing`、`zh-writing-review`、`zh-writing-checkers` | converter |
| 明确 Markdown -> LaTeX | `format-markdown2latex` | 反向 converter |
| 明确 LaTeX -> Markdown | `format-latex2markdown` | 正向 converter |
| 明确套模板 | `format-template-latex` | 无关 converter |

`.tex`、`.md` 和 `.docx` 扩展名只表示 source format，不再自动表示转换意图。`.docx` review 可以先建议 `docx` 作为读取适配 skill，但不能把 review 投影成 Word conversion。

### 7.3 修正 fact-check 与 no-network

在 `task-descriptor.js` 提取共享的 `isFactCheckDirective()`，由 descriptor 和 legacy router 共同使用，避免两套正则漂移。

覆盖：

- 核查动词与“事实、陈述、主张、数字、年份、引用、来源、出处、支持”可以被路径、实体、百分比和小数隔开。
- 英文 `fact-check`、`cited source supports`、`source support`。
- Unicode 文档路径。
- `Do not browse`、`Don't browse`、`No browsing`、`Without browsing` 和中文等价表达。

负向控制：

- `Do not skip browsing` 不是禁止网络。
- `Do not browse the repository; inspect it with read` 是本地浏览限制，不应错误改变网络约束。
- grammar review 中出现数字或 source code 不能变成 fact-check。

fact-check 的 workflow 固定为 `factcheck.document`。文档是 `.tex` 也不能继承 `writing.latex`，route plan 不得出现任何 `format-*` skill。

本地只读事实核查仍应推荐最小事实 skill，不得因为 `networkAccess=forbidden` 把所有 fact skills 清空。网络工具、外部证据角色和并行 research 可以省略。

### 7.4 让默认 observe 采用 compiled effective route

保留 `OMP_ROUTER_V2_MODE=observe` 作为默认值，但调整语义：

- effective route 使用已支持的 compiled descriptor policy。
- `routeObservation` 继续记录 legacy intent、planned intent、资源差异和 effective source。
- `enforce` 与 observe 的 effective route 一致，只是不保留 comparison observation。
- `OMP_ROUTER_V2_MODE=legacy` 保留一个发布周期作为精确回滚开关。

这只是 route metadata projection，不执行、不拒绝、不续跑。README 必须明确 `observe/enforce` 均不是权限或门禁模式。

RED 用例：

- 实现计划在 observe/enforce 都为 planning；observe 仍记录旧的 `writing.zh`。
- read-only writing、fact-check、planning、test strategy 在 observe/enforce 除 observation 字段外深度一致。
- specialized Word conversion、明确 LaTeX conversion、视觉设计保持兼容。
- legacy 模式仍能复现旧投影，作为临时回滚证明。

## 8. 阶段 3：强化 governance 与真实 skill evidence

### 8.1 最小、先行、真实读取 skill

修改 `plugins/omp-enhancer-core/src/governance.js` 中的主 agent 和 subagent guidance，删除 `Skill use is flexible`。核心提示改为：

> Before substantive work, read exactly the smallest directly applicable primary skill once. Prefer an exact project-specified skill, then the exact routed URI, then one inventory-confirmed equivalent. A skill counts as loaded only after a successful read of its SKILL.md. If resolution fails, make one targeted correction, continue without the skill, and report the limitation briefly. Do not invent aliases, create replacement skills, or retry unchanged calls.

补充规则：

- 普通 focused 任务通常先读一个主 skill；中文写作允许“中文基础规范 + 一个 task-specific skill”。
- `writing.pending` 是例外：先取得正文并识别语言，再读语言 skill。
- 主 skill 没有明确引用 companion 时，不扩散读取整个 skill 列表。
- route 描述、advisor 建议、记忆和名称相似都不等于 skill 已加载。
- 项目指令明确命名 skill 时，不得用相似通用别名替代。

### 8.2 只接受 host-observed read evidence

当前 `session_stop` 会从最终自述文本解析 skill 并加入 `loadedSkills`。这使“声称已加载”可以冒充真实 read。

修改：

- `state.loadedSkills` 迁移为 `observedSkills`，只由成功的 `read` tool result 更新。
- `session_stop` 不再把自然语言自述合并为 observed evidence。
- 可选记录 `claimedSkills`，但只用于 advisory diagnostic。
- `omp_core_validate_skill_usage` 输出 `suggested`、`observed`、`claimed` 和 `unobservedClaims`。
- 缺少 observed skill 只报告 coverage finding，不触发修复轮次。
- state schema 升级并为旧 session 增加单向、无门禁迁移测试。

测试：

- 最终文本说“已加载 writing-review”，无 read 时 observed 仍为空。
- 成功读取 URI 或对应 `SKILL.md` 后才计入。
- 失败 read 不计入。
- route 列出 skill 不计入。
- capture turn 中的 skill read 不污染上一个用户任务。

### 8.3 收紧 skill resolution

修改 `plugins/omp-enhancer-core/src/skill-usage.js`：

- 精确 requested name 优先于任何 alias。
- packaged exact name 优先于 managed alias。
- 只有 exact 不可用时才返回一个 inventory-confirmed equivalent。
- 不把旧 `gate-satisfy` 或 `gate-unblock` skill 当作当前 route 的替代项。
- route 推荐资源增加 inventory test，确保 marketplace 安装后 100% 可解析。

项目级 exact skill 由 OMP 原生项目 skill inventory 和项目 `AGENTS.md` 决定，Core 不复制一套新的项目 skill 扫描器。

### 8.4 有界工具使用与交付

在 governance、writer/checker agents 和通用 config agents 中加入软性执行启发：

- 读取前先确认路径存在，不猜测 `BUG-AUDIT-REPORT.md` 等文件。
- schema 或路径错误只做一次有依据的定向修正；仍失败就继续已有证据。
- focused 任务把 6 至 8 次读取/搜索作为收敛检查点，到达后优先综合结论。
- broad audit 在前 6 至 8 次调用内先形成至少一个有文件证据的发现，防止超时后零交付。
- 时间不足时交付明确标注范围的部分结果，不用继续搜索换取“完整感”。
- 异步 task 只派发一次；使用已有 job/IRC 等待，不再派第二个 task 轮询，不用未授权文件作为 rendezvous。

这些数字是模型启发和 E2E 指标，不是运行时拒绝条件。

## 9. 阶段 4：写作语义保真和只读 checker 行为

### 9.1 提示词语义不变量

修改：

- `plugins/omp-enhancer-core/src/governance.js`
- `plugins/writing-helper/agents/writer.md`
- `plugins/writing-helper/agents/checker.md`
- `plugins/writing-helper/skills/writing-markdown-helper/SKILL.md`
- `plugins/writing-helper/skills/writing-review/SKILL.md`
- `plugins/writing-helper/skills/writing-checkers/SKILL.md`
- `plugins/writing-helper/skills/plain-chinese-writing/SKILL.md`
- `plugins/writing-helper/skills/zh-writing-polish/SKILL.md`
- `plugins/writing-helper/skills/zh-writing-review/SKILL.md`
- `plugins/writing-helper/skills/zh-writing-checkers/SKILL.md`

明确以下内容属于事实语义，不是可以为了文风任意删除的填充词：

- 频率与限定：`typically`、`often`、`usually`、`通常`、`一般`。
- 强度：`significantly`、`substantially`、`显著`。
- 模态与不确定性：`may`、`might`、`can`、`could`、`可能`、`可以`。
- 范围：`only`、`at least`、`up to`、`仅`、`至少`、`不高于`。
- 否定、比较方向、因果方向。
- 数值、百分比、倍数、范围和单位。
- 引用、DOI、LaTeX 数学、交叉引用、命令和文档结构。

默认流程为：修改前提取语义锚点，修改后检查一次。不得因为检查发现问题自动开启第二轮润色。

### 9.2 只读 checker fallback

当前 `writing-checkers` 指定写入 `.pi/research/checker_report.md`，与只读 review 冲突。修改中英文 checker skill：

- 用户允许写报告文件时才写指定路径。
- 用户要求只读、只报告或禁止修改时，直接在最终响应返回结构化 review。
- 不创建 `.pi` 目录来满足 skill 自身模板。
- 不因无法写报告而失败或请求新授权。

### 9.3 非阻塞 semantic comparator

增加低成本 advisory comparator：

- `plugins/writing-helper/src/preservation.js`
- 作为 `writing_quality_check` 的可选 `originalText`/`preservation` 检查，或提供等价的纯函数入口。

它只比较可稳定抽取的锚点：限定词、模态、否定、数字、单位、引用和 LaTeX 标识。输出 `driftDetected` 和 findings，但普通 drift 始终 `isError: false`，不得控制写入或会话结束。

测试包含英文和中文正反例，并维持 `writing-helper` lines、branches、functions 100% coverage。

## 10. 阶段 5：fact workflow 与旧 managed gate skills

### 10.1 收敛 fact-check 提示

修改：

- `plugins/omp-fact-checker/skills/fact-checking/SKILL.md`
- `plugins/omp-fact-checker/skills/claim-extraction/SKILL.md`
- `plugins/omp-fact-checker/skills/source-evaluation/SKILL.md`
- `plugins/omp-fact-checker/skills/citation-authenticity/SKILL.md`

默认 focused workflow 采用一个有界 pass：原子 claim、可用证据、精确 verdict、limitation。只有 broad、高风险或用户明确要求时才增加独立证据 lane。网络被禁止且本地只有 bibliography metadata、没有 source text 时，直接返回 `LOCAL_UNVERIFIED` 或 `INSUFFICIENT`，不扩散搜索，不自动重试。

### 10.2 诊断旧 gate skills，不自动删除

当前真实 managed skill 目录不会被 `install-skills.js` 覆盖。精确识别以下历史资源：

- `gate-aware-interaction`
- `omp-factcheck-gate-satisfy`
- `omp-gate-satisfaction`
- `omp-gate-unblock`
- `omp-subagent-gate-satisfaction`
- `omp-testing-gate-report`

修改 `plugins/omp-enhancer-core/src/install-skills.js`：

- 增加 `inspectManagedSkillCompatibility()`。
- `omp_core_install_skills` details 增加 `legacyFindings` 和 `recommendedIgnoredSkills`。
- dry-run 只报告，不写配置。
- 不使用 `*gate*` 通配符，避免误伤合法 skill。
- 不删除或覆盖真实 managed 目录。

governance 增加一句：除非用户正在审计历史 gate 行为，否则只使用当前 route 或项目指令列出的 skill，不读取 `gate-satisfy`、`gate-unblock` 兼容资源。

### 10.3 本机一次性可逆迁移

发布并升级本机后：

1. 备份 `~/.omp/agent/config.yml`。
2. 只把上面六个精确名称幂等合并到 `skills.ignoredSkills`。
3. 不删除 managed skill 目录，autolearn 仍可创建和增强其他 managed skills。
4. 验证其他配置键没有变化。
5. 再次确认 `autolearn.enabled=true`、`autolearn.autoContinue=true`。

配置迁移脚本必须支持 dry-run，并用临时配置测试幂等、精确匹配和字段保留。归档或删除历史目录不在本轮范围内。

## 11. 阶段 6：兼容 autolearn capture，软化 advisor 重复

### 11.1 识别宿主维护轮次

新增：

- `plugins/omp-enhancer-core/src/host-turn-context.js`
- `plugins/omp-enhancer-core/test/host-turn-context.test.js`

OMP 当前 `BeforeAgentStartEvent` 只暴露 `prompt` 和 `images`，不会直接暴露 custom type。因此 `classifyHostTurn(event, ctx)` 按以下顺序识别：

1. 未来 host 若暴露 `event.customType` 或 details，优先使用。
2. 检查 `ctx.sessionManager.getBranch()` 最近且与当前 prompt 对应的 custom message，要求 `customType === 'autolearn-nudge'`、`display === false`、user attribution。
3. 仅在 branch metadata 尚未可见时，完整匹配官方 capture 协议的规范化特征；普通用户讨论或引用 `autolearn` 不得被误判。

识别 capture 后，Core：

- 直接从 `before_agent_start` 返回 `undefined`。
- 不调用 `resolveAdvisoryRoute()`。
- 不注入 route card、skills、tools、roles 或 advisor guidance。
- 不覆盖 `lastRoute`、`lastPrompt`。
- 不清空或增加上一个用户任务的 observed skill/task/role。
- 不写业务 route debug record。
- 不阻止 `manage_skill`、`learn` 或 capture 自身停止。
- `session_stop` 仍返回 `undefined`，并清理 runtime-only turn kind。

turn kind 只作为进程内诊断状态，不参与授权、路由或完成判断，也不作为可能跨重启残留的门禁状态持久化。

测试覆盖：

- branch metadata 正常路径。
- 官方 prompt 兼容路径。
- 普通用户询问 autolearn 不误判。
- capture 前后 active route 不变。
- capture 后下一条真实用户提示正常建立新 route。
- capture skill read 不污染业务 evidence。
- capture `session_stop` 返回 `undefined`。

### 11.2 Advisor guidance 只吸收新增证据

不修改 host `advisor.enabled`，不 monkeypatch OMP advisor runtime。只修改 Core 提示：

> Treat advisor notes as evidence deltas. Incorporate each distinct material point once. A repeated note or a note without new file, location, error, or observed result does not justify rereading skills, rerunning unchanged tools, reopening completed work, or emitting a second final answer. If the deliverable is already complete, apply only a concrete newly evidenced correction; otherwise stop.

补充：

- advisor 不能授予权限。
- 不因 advisor 重读已经成功读取的 skill。
- 不为格式偏好单独生成第二份 final。
- advisor 与 repository/tool evidence 冲突时，以用户请求和实际结果为准。
- 如果重复输出最终证明来自 host advisor 自身，记录为 host 边界，不在插件中增加 loop controller。

## 12. 阶段 7：自动化与安装态 E2E

### 12.1 确定性测试

至少执行：

```bash
cd /home/dingli/omp-enhancer/plugins/omp-enhancer-core
node --test test/task-descriptor.test.js test/router.test.js test/router-adversarial.test.js
node --test test/route-plan-resources.test.js test/governance.test.js test/advisory-runtime.test.js
node --test test/host-turn-context.test.js test/core-workflow.e2e.test.js
```

并增加跨插件生命周期测试，fake-register Core、Config hooks、Testing Enhancer、Fact Checker 和 Writing Helper，遍历正常状态、缺 evidence、工具失败、旧 state 和 autolearn capture：

- 0 次 `block: true`。
- 0 次 `continue: true`。
- 普通 finding 不变成 execution error。
- 所有推荐 skill 100% 可解析。
- capture 不注入普通 workflow。

### 12.2 英文写作 E2E

只读使用：

- `/home/dingli/leihanwen_TOSEM/tex/abstract.tex`
- `/home/dingli/anzhida_ATC2026/tex/abstract.tex`
- `/home/dingli/anzhida_ATC2026/tex/introduction.tex`

覆盖：

- 中文指令加英文正文。
- 英文指令加英文正文。
- review 与 polish。
- `.tex` review 不加载 converter。
- 自然提示与显式 route/read 正对照。

验收：连续 3 次自然任务均在实质工作前真实读取正确首要 skill，中文 skill 为 0，没有空 final，没有 skill 虚假声明。

### 12.3 中文写作与本地 fact E2E

只读使用：

- `/home/dingli/ChenkaiBook/第5章-合并正文.md`
- `/home/dingli/ChenkaiBook/sections/5.7.md`

覆盖：

- 中文指令。
- 英文指令加中文正文。
- 只读逻辑检查。
- 保守润色。
- 指定实体、百分比和倍数的本地事实核查。
- 禁止网络时的 `LOCAL_UNVERIFIED` 收敛。

验收：连续 3 次写作任务均读取正确中文主 skill，英文写作 skill 为 0；fact 场景不调用 web、不加载 converter 或历史 gate skill。

### 12.4 编程、计划与 audit E2E

只读使用 `/home/dingli/frugal-pi`：

1. 制定 agent-fleet 路由修复与测试计划，不修改文件。
2. 诊断一个具体路由问题，给出文件和行级证据。
3. 设计测试策略，不运行测试。
4. focused code review。
5. broad bug audit，在时限内先交付已确认发现。
6. 故意给出一个不存在目标，验证一次定向纠错后停止猜测。
7. 项目 `AGENTS.md` 的 exact skill 名优先，不使用臆造 alias。

验收：plan、diagnosis 和 test strategy 各连续 3 次在 120 秒内正常完成；focused task 除 autolearn capture 外不超过 8 次 source/search 调用；broad audit 在 150 秒内给出完整结果或明确标注范围的 evidence-backed partial result。

### 12.5 隔离写入与语义哨兵

四个真实评估仓库保持只读。runner 把代表性段落复制到临时 git 仓库，加入：

- `typically`、`significantly`
- `may`、`can`、`only`
- 否定句和比较方向
- 百分比、倍数、数值范围、单位
- `\cite{}`、DOI、公式和交叉引用
- 中文“通常、可能、仅、不高于”

验收：

- 只修改目标文件。
- 不创建额外文件。
- 所有语义哨兵保留。
- 不把不确定性提升为确定事实。
- 修改前后 git diff 可机器检查，临时目录在汇总后清理。

### 12.6 autolearn 专项 E2E

准备一个只有五个小型只读文件的临时仓库，提示 DeepSeek 逐一读取并总结，使工具调用达到当前 `minToolCalls`。

必须证明：

- host 产生恰好一次隐藏 `customType: autolearn-nudge` capture turn。
- capture 没有用户可见回复。
- capture 不调用 Core route、writing、testing 或 fact 工具。
- capture 不改写 Core active route。
- capture 结束后不再次触发 autolearn。
- 低于阈值的控制场景没有 capture。
- `pluginContinuation=0`。
- 测试前后两个 autolearn 配置仍为 true。

### 12.7 安装态强制阈值

- 单元、集成和静态合同 100% 通过。
- lifecycle 中 0 个 block、0 个 Core continue。
- route skill 100% 可解析。
- 自然中英文写作分别 3/3 正确真实读取主 skill。
- code plan、diagnosis、test strategy 分别 3/3 正常交付。
- 0 个“声称加载但无 read event”。
- 相同失败工具调用最多修正一次。
- 隔离编辑语义哨兵保留率 100%。
- primary task 每次只有一个非空用户可见 final；advisor custom message 和隐藏 autolearn turn 单独统计。
- mandatory matrix 每一类都通过，不能用总体百分比掩盖某一类别连续失败。

发生随机失败时，先分析事件流；完成针对性提示修复后重跑该类别 3 次，再跑一次完整 mandatory matrix。禁止对同一失败原样盲目重试。

## 13. 阶段 8：全量验证、提交、发布和本机同步

### 13.1 全量验证

```bash
cd /home/dingli/omp-enhancer
npm test

cd plugins/writing-helper
npm run coverage

cd ../omp-test-enhancer
bun run typecheck
bun run build
bun run test

cd ../omp-config/skills/ecc/skill-comply
pytest

cd /home/dingli/omp-enhancer
npm run check:marketplace
npm run pack:all
git diff --check
```

### 13.2 提交边界

建议拆为五个可独立验证的提交：

1. `core: preserve read-only writing source targets`
2. `core: correct planning fact and review routes`
3. `core: make workflow guidance minimal and observed-read based`
4. `writing: preserve semantics and bound fact review workflows`
5. `config: diagnose legacy gate skills and add installed e2e coverage`

版本和 marketplace 元数据单独提交，避免实现 diff 与版本噪声混合。每个提交创建时都应通过对应 targeted tests，不提交长期 RED 中间态。

### 13.3 版本升级

只 bump 实际变更的插件。只有所有插件都发生实质变化时才使用 `--plugin all`。

对每个变更插件：

```bash
npm run release -- --plugin <plugin-name> --bump patch --dry-run
npm run release -- --plugin <plugin-name> --bump patch --apply
```

验证三处版本一致：

- `plugins/<dir>/package.json`
- `package-lock.json` 对应 workspace entry
- `.omp-plugin/marketplace.json`

apply 后再次运行全量测试、marketplace check、pack-all 和 diff check。

### 13.4 推送、marketplace 和本机升级

```bash
git push origin main
git ls-remote origin refs/heads/main

omp plugin marketplace update omp-enhancer
omp plugin upgrade <changed-plugin>@omp-enhancer
omp plugin list --json
omp plugin doctor --json
```

必须确认：

- 远端 main SHA 等于本地 HEAD。
- catalog、package、lockfile 和安装版本一致。
- 本机来源是 marketplace cache，不是遗留本地 link。
- 变更 runtime 文件的工作树与安装目录 SHA-256 一致。
- 旧 OMP 进程全部退出，使用全新进程和全新 session 重跑 mandatory E2E。
- autolearn 两个配置前后不变。

## 14. 回滚策略

### 14.1 实现回滚

- 发布前失败：留在本地修复，不推送、不升级本机。
- 推送或安装态失败：对问题提交使用正常 `git revert`，再发布更高的 patch 版本。
- 不使用 `git reset --hard`，不手工改 marketplace cache，不降低 catalog semver。
- `OMP_ROUTER_V2_MODE=legacy` 在一个发布周期内提供 route projection 回滚，但不恢复任何 gate。

### 14.2 配置迁移回滚

- 保留迁移前备份。
- 只移除本轮新加入的六个 exact ignored skill 名称。
- 不删除 managed skill 目录。
- 无论回滚与否，都保持 `autolearn.enabled=true` 和 `autolearn.autoContinue=true`。

### 14.3 记录

最终报告列出：

- 修复前后 git SHA。
- 远端 SHA。
- 各变更插件版本。
- marketplace catalog 版本。
- 本机安装来源与版本。
- autolearn 配置前后值。
- E2E run id、各类别结果和仍属 host 边界的问题。

## 15. 风险与边界

- `.docx` 是二进制，Core 安全读取不能直接判断正文语言。正确行为是保持 pending，先建议 `docx` 读取 skill，再由 agent 根据提取正文选语言 skill。
- host `BeforeAgentStartEvent` 当前不含 customType，autolearn fallback 需要随 OMP 升级做兼容测试。branch metadata 仍是首选可信来源。
- advisor 的中断和重复消息属于 host runtime。Core 只能减少主 agent 对重复建议的响应；若 host 仍制造重复 final，不得用插件 loop controller 掩盖。
- DeepSeek Flash 有随机性，因此发布要求连续样本和完整 event evidence，而不是单次成功截图。
- source target 提取只用于普通工作区文件的安全只读语言观察，不能扩展成任意文件读取器。

## 16. 完成定义

只有同时满足以下条件，本计划才算完成：

1. 所有确定性 RED 用例转绿，旧测试不回退。
2. read-only writing 能按正文语言选择 skill，提示语言不再决定正文语言。
3. planning、test strategy、fact-check、no-browse、review/conversion 路由正确。
4. DeepSeek Flash 在自然请求中真实读取最小正确 skill，并能有界交付。
5. 写作编辑保留限定词、模态、否定、数值和引用。
6. 旧 gate skills 被精确诊断并在本机可逆忽略，不删除 autolearn 产物。
7. 合法 autolearn capture 仍工作，Core 不污染、不阻止、不重复续跑。
8. advisor 重复不再引起插件侧重复工具链；剩余 host 问题被明确记录。
9. 全量测试、coverage、typecheck/build、marketplace、pack 和安装态 mandatory E2E 全部通过。
10. commit、push、marketplace、本机安装和远端 SHA 全部一致。
11. 运行时仍为 advisory-only：0 个 block、0 个 Core continue、0 个自动 repair turn。

## 17. 实际实施与最终证据

### 17.1 最终安装版本

- OMP `16.4.6`
- `omp-enhancer-core` `0.1.114`
- `omp-config` `0.1.22`
- `writing-helper` `0.2.9`
- `omp-testing-enhancer` `0.1.13`
- `omp-fact-checker` `0.1.7`
- marketplace catalog `1.0.21`，全部插件继续使用 `track-main`

本机安装均来自 `omp-enhancer` marketplace cache。Core、config、writing 和 fact-checker 的关键运行文件已逐一比较 SHA-256，工作树与安装缓存一致。旧的 `omp-writing-logic-plugin` 功能已经并入 `writing-helper`，本机孤儿锁项已通过 OMP 卸载命令清理；最终 `omp plugin doctor --json` 全部为 `ok`。

### 17.2 主要实现结果

1. Core 通过 OMP 原生 `skill-prompt` 以 developer attribution 提供活动 inventory 中的 routed skill 正文。状态把 `providedSkills` 与真实成功 read 形成的 `observedSkills` 分开记录；E2E 不再把仅表示路由期望的 `routedSkills` 当作加载证据。
2. 项目 exact skill 必须 realpath 精确匹配。它不在宿主活动 inventory 时，Core 回退为普通 advisory guidance，由模型真实读取项目 `SKILL.md`，不会拿打包 alias 冒充。
3. 写作路由按被审查或修改的正文语言选择中英文 skill。中文提示加英文正文、英文提示加中文正文各连续 3 次通过。
4. review-only skill 只返回有文本证据的问题和必要的局部建议；明确修改任务才直接改正文。短摘要最多五个实质问题，不探测无关 checker report、宏定义或仓库上下文。
5. advisor 识别宿主隐藏的原生 skill context，默认每个主任务最多一次建议；完整 final 后保持静默。一个不安全候选只淘汰该候选，不再冻结整个编辑任务。
6. focused fact-check 使用局部证据优先级和六次目标，不重复等价 glob、整库 bibliography/PDF 搜索；证据不足直接返回 `LOCAL_UNVERIFIED` 或 `INSUFFICIENT`。
7. inspection budget 始终是软提示。每个 tool result 后统一提示下一条消息最多一个 read/search，并等待结果；最后槽位失败也直接收束。代码没有增加工具拦截、修复续跑或完成门禁。
8. E2E 事件汇总新增真实 host-provided skill 证据、provision mode、重复 skill read 和 post-final advisor 计数。英文语义编辑夹具加入明确可安全删除的重复词，避免把合理 no-op 错判为不服从。

### 17.3 最终 mandatory E2E

报告：`.omp/e2e-results/mandatory-final-0.1.114/report.json`

- 28/28 PASS，主模型均为 `opencode-go/deepseek-v4-flash`。
- 28 个 primary final，0 abort，0 web call，0 plugin continuation。
- 0 个重复失败调用，0 个未观测 skill 声明，0 个重复 skill read。
- provision mode：17 次 native、10 次 project workflow fallback、1 次 none。`none` 是无业务 skill 的 autolearn fixture。
- host-provided skill 包括 `fact-checking`、`writing-review`、`writing-markdown-helper`、`plain-chinese-writing`、`zh-writing-review` 和 `zh-writing-polish`。
- project exact skill 的真实 read 证据包括 `superpowers-writing-plans` 和 `superpowers-debugging`。
- 英文审查、英文润色、中文审查、中文润色、focused fact-check、code plan、code diagnosis 和 test strategy 的重复样本全部通过；broad audit 也通过。
- 英文与中文隔离编辑均只修改指定临时文件，各使用一次初始 read、一次 edit、一次验证 read，所有限定、模态、否定、数值、百分比、引用和 LaTeX 哨兵通过。
- 四个真实评估仓库保持只读；写入只发生在 runner 创建的临时 fixture。

autolearn 专项结果：

- 5 个业务 read，恰好 1 个 hidden capture。
- capture tool call 为 0，Core continuation 为 0。
- 测试前后均为 `autolearn.enabled=true`、`autolearn.autoContinue=true`、`autolearn.minToolCalls=5`。

### 17.4 最终 advisor stress

报告：`.omp/e2e-results/advisor-final-0.1.114/report.json`

- 2/2 PASS。
- 两个场景各 1 个 primary final、1 条 pre-final advisor、0 条 post-final advisor。
- 0 abort、0 Core continuation。
- 英文只读审查不改文件；英文编辑只改 `paper.tex`，语义和 LaTeX 哨兵全部通过。

### 17.5 本地回归与无门禁审计

- `npm test`：root scripts 与全部 workspace 测试通过。
- Core：474/474。
- Testing Enhancer：149/149。
- Writing Helper：95/95，lines、branches、functions 均为 100%。
- Fact Checker：12/12。
- ECC skill-comply：33/33。
- `npm run check:marketplace` 与 `npm run pack:all` 通过。
- 生产源码静态扫描未发现 `block: true`、`continue: true`、`triggerTurn`、protected action boundary 或 GateController。唯一 `session_stop` handler 只记录观测状态并返回 `undefined`。
- Core 的所有预算、scope、review 和证据规则均明确标记为 model guidance/advisory，不决定工具许可或完成许可。
