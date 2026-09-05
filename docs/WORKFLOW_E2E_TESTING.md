# Workflow and Skill E2E Testing
> **部分已被取代。** 本文件保留旧代码/测试增强矩阵的历史证据；当前验证 `omp-config`、`writing-helper`、`omp-fact-checker`，并单独验证 `volcengine-coding-plan` 的 provider smoke，不用于恢复已删除插件。

本文是 workflow、Skill、TODO、delegation、TDD 和 reviewer 行为测试的当前方法来源。它验证 OMP Main 在真实运行中的自主选择和执行，不把 E2E 变成 runtime gate，也不让 final 自述替代事件证据。

## 证据分层

按成本从低到高使用三层主证据：deterministic contract tests、static OMP probe、isolated model E2E。必要时再增加明确针对当前 installed marketplace 的只读 smoke。

1. **Deterministic contract**：纯函数、schema、hook、prompt parity、generated asset 和 synthetic event evaluator tests。
2. **Static OMP probe**：隔离启动 OMP，比较 prompt hash、active tools、Skills、Agents、task schema 和 plugin discovery，不提交模型 prompt。
3. **Isolated model E2E**：在一次性 HOME、session、credential snapshot 和临时 fixture 中运行真实 Main，保存 NDJSON 事件和脱敏 summary。
4. **Installed-state smoke**：只有确实要验证当前用户安装态时使用；它与 `--worktree-plugins` 的当前源码语义分开报告。

下层失败时先修复下层，不用昂贵模型 run 猜测 deterministic defect。Dry-run 只验证参数、fixture 与 matrix 结构，不是 E2E PASS。

## Bootstrap 与生成目录契约

Deterministic tests 先验证所有顶层 Main 模型的 capability-gated、top-level、
one-shot orchestration advisory（`OMP_ORCHESTRATION`）。它根据当前可见 workflow
Skill、其他 Skills 与原生 `task` 能力选择最小提示；advisor、subagent、
重复 task reminder 或 diagnostic disable 分支都应保持无注入。Advisory 只复述
`ANALYZE -> EXECUTE -> REVIEW`、Main 的编排者身份与可选的域目录指引，
不包含 marker 协议，也不随 provider retry 重复。

Generated-asset tests 再验证紧凑目录：当前 v39 索引包含 3 个域（`writing`、
`research`、`visual`），每行给出 exact ID、chooseWhen 条件、
候选 Skill URI（`D` 顶层 exact URI、`C` nested ECC exact URI）与单卡 reference
URI；索引顶部声明 `ANALYZE -> EXECUTE -> REVIEW` 与 usage 规则。单卡只包含
When、Skills、Agent candidates、Suggested flow 与 Scope notes，没有步骤 ID、
delegation 行或任何 sentinel。Index 大小由生成与预算 contract tests 针对
当前 artifact 动态校验；文档不固化易过期的 byte snapshot。

Reference tests 还要求每次 native `task` call 都带非空顶层 `context`，
每个 assignment 携带完整 bounded input 与冻结的 assignment Skills。Batch
`context`、name、label 或让 child 在输出中补 metadata 都不能替代 item body。
这些检查验证可观察协议，不会变成 runtime dispatch 或 completion gate。

Reminder 先用 deterministic synthetic events 验证 one-shot 行为：只进入顶层
Main 任务一次、Advisor/subagent/disable 分支无注入、context 输入不被原地修改，
以及 `tool_call`、`tool_result`、`session_stop` 的 advisory 返回契约不变。
`OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER=1` 只用于 reminder 对照；这些
deterministic context tests 证明注入机制，绝不把它升级成 block、router、gate、
retry 或 completion control。

Writing Helper 的 deterministic content tests 与 static probe 另外验证
`writer`/`zh-writer` 只暴露 `read`、`grep`、`glob` 并始终只返回完整
proposal 或 bounded diff。`checker`/`zh-checker` 没有 `write`/`edit`，保留
`web_search` 仅用于宿主与用户网络权限允许的证据核查，并始终只返回
in-band report。完整 proposal/report 必须进入 terminal child delivery；若
宿主没有专用 terminal handoff，ordinary final response 就是该 host-neutral
delivery。文件授权不改变 child capability；Main 独自做 finding disposition
并实施获授权的持久化。这一边界不能只依靠 live child 自述，
因为 parent event stream 看不到未暴露的 child 内部 tool history。

## 自我迭代 fixture

`scripts/e2e/fixtures/self-iteration.json` 定义 positive `omp-self-iteration-tdd` 和 mechanical negative control `omp-self-iteration-mechanical-control`。Runner 在临时目录创建一个初始 GREEN 的真实 Node project，其中有两个互不重叠的 vertical slices：
```text
AGENTS.md
package.json
src/normalize.js
test/normalize.test.js
src/enabled.js
test/enabled.test.js
```

任务只允许修改这两组 source/test 文件。Main 必须先检索本地锚点并写完整 wave/slice 计划；复杂计划由只读 `analyzer` 审阅后，用一次 native `task` call 的同一个 `tasks[]` batch 提交两个 independent slices。每个 task child 自己完成 test mutation、valid RED、minimal production mutation、same-command GREEN 和 refactor，并通过 host-observed completed delivery 返回 command exit、changed paths 与 bounded diff。Parent 不使用 `edit` 或 `write` 实现 slice，也不冒充 child 的 RED/GREEN；两项 delivery 完成后，Main 在 parent event stream 中运行一次 exact `npm test` 作为 broader current-tree verification，随后公开 `MAIN REVIEW`，再把 Main-reviewed bounded diff/evidence 交给 native `reviewer`。

Synthetic evaluator traces 和 live conditional branch 还覆盖 supported-finding repair path：Main 验证 finding 后把 bounded repair 交回 native `task`，接收 host-observed repair delivery，刷新受影响 evidence 并写第二次 `MAIN REVIEW`，之后最多一次 fresh reviewer。它观察 `code` workflow、`code-development` 及其 OMP Enhancer 条件 reference，而不是已退役的普通代码卡片或过程 Skills。这个固定 fixture 的决策完全由本地证据决定，因此禁止 network，也禁止 publish、release、upgrade 和 package/AGENTS 修改。网络禁用是该场景的负向边界，不否定 `code-development` 在实际决策相关任务中先查官方资料再查社区经验。

常用入口：

```bash
npm run e2e:main:self-iteration -- --dry-run
npm run e2e:main:self-iteration -- \
  --worktree-plugins --repeat 1 \
  --output .omp/e2e-results/self-iteration-pilot
```

不传 `--scenario` 时同一入口运行 positive 与 mechanical control；单独 pilot 可传对应 scenario ID。默认 matrix 不绑定具体模型；比较不同模型时显式覆盖 `--model` 与 `--thinking`，并使用新的 output 目录。

## Beamer/PPT staged content and visual refinement fixture

`scripts/e2e/fixtures/subagent-willingness.json` 的
`beamer-single-visual-precheck` 使用临时 Beamer fixture，先覆盖 section-sized、逐页讨论的 Markdown 内容计划和用户确认，再覆盖从已确认 Markdown 翻译出的 Beamer 帧、逐页配图与基础排版。Markdown content plan is the canonical content source; Beamer .tex files are derived layout artifacts. Content changes go to Markdown first, are discussed and reconfirmed with the user, then regenerate Beamer; 内容变化不能在排版阶段直接改 `.tex` 正文。随后它覆盖 task 的 initial
render、exactly one read-only self-check（owner 只能是 Main 或 task）以及它在
task final layout pass 之前的顺序；用户确认基础排版后，task 绑定并渲染 current revision，visioner 对该
revision 做最终独立 review。该 `single read-only visual precheck` marker 只携带
advisory findings（page、region、criterion、evidence、impact、limitations），不
产生 review verdict；现有视觉精修链的 bounded fix round 约束仍适用。同时，draw.io pipeline
remains unchanged：task、visioner 和 at most one fix round 的一次性链路保持
原样。

Evaluator 只使用 parent event stream 的 native task assignment、completed
delivery 和 event order：bounded assignment-text count/order 检查 marker 与
initial render，native Agent sequence 检查 task → task(layout) → task → visioner，
delivery text 检查 final render 与 current revision identifier 是否一致，并以
`maxNativeTaskAssignmentAttempts` 保持 one-fix 上界。当前 runner 不能看到 task
child 内部的 visual read（例如 child 内部通过 `read <image>?q=<question>` 提出图像问题）；报告该 evidence
limitation，不用 child 自述伪造 read proof。没有具体的用户转换命令时不运行
PowerPoint conversion；`beamer-to-powerpoint` 只在用户给出 exact command 且
PPT output 已在 scope 时适用。

该 fixture 的 deterministic shape test 不要求本机 LaTeX toolchain；fixture
目录由 runner 创建并在每次 run 的 cleanup 中删除。不要为 precheck 增加
parallel task scheduling、双路自检、findings merge 或专用 fallback 场景。

## 场景设计原则

一个可归因的 E2E 场景应满足：

- fixture 在任务前真实可运行且基线 GREEN；
- 每个 slice 只要求一个垂直、可观察的行为变化；需要测试 parallel batching 时，使用至少两个真实独立且 write set 不重叠的 slices；
- prompt、model、thinking、tools、Advisor、task mode、timeout、evaluator 和 repeat 可冻结；
- `fixtureExpectations` 明确 allowed/required changed files、required/forbidden patterns、无 symlink 和 realpath containment；
- 不依赖网络或外部发布作为 correctness evidence；
- positive scenario 旁有 mechanical lookup、user-forbidden delegation 或 unchanged-read 等 negative control；
- reviewer 数量只表达该场景的具体未回答问题，不成为全局配额。

Self-iteration matrix 的 assignments 分别覆盖计划审阅（复杂时委派 `analyzer`）、两个 parallel native-task slices、reviewer 和条件式 repair；它们来自 fixture 的真实独立性与 supported-finding branch，不表示每个 OMP 任务需要固定 fork 数或 reviewer 数。

## Event stream 是真值

Evaluator 从 parent event stream 恢复：

- workflow/Skill 读取（含域索引 `skill://omp-enhancer-workflows`），或场景明确记录的 exact native `skill-prompt` body named `omp-enhancer-workflows`；managed context、Available Skills 描述或其他 Skill body 都不算 supplied body；
- `D`/`C` 只是 optional candidates、绝不是 load sets；Main 只读取与 requested method、evidence rule、verdict 或 format 匹配的最小 URI 集；
- native TODO init、transition 与 completion；
- parent `write`/`edit` mutation target、call ID 和事件位置；
- parent `bash` command、exit code、timeout 与完成位置；
- native task assignment、Agent、每次 task call 的非空顶层 `context`、job ID、completion 与 host-observed terminal child delivery text；
- visible `MAIN REVIEW` text 与 event order；
- hub/async result 与 final response。

Thinking、final 声明、history text 或未完成 child preview 不能补造缺失事件。Host-observed delivery 可以证明 OMP 把 child output 交回 parent，并允许校验它报告的 slice paths、RED/GREEN exits 和 bounded diff；它不能证明未暴露在 parent stream 中的 child 内部 tool-call sequence。Child 只消费冻结 assignment Skills、不得二次 discovery/selection/load 的边界应由 Agent prompt 与 assignment contract test 证明；parent E2E 只验证可观察的冻结元数据，不对不可见内部历史作结论。真实文件 outcome 由 fixture snapshot 验证，但 snapshot 只说明“发生了变化”，不说明“谁修改了文件”。Runner 对每个 changed file 记录 `mutationAttribution.files[]`：存在匹配 target 的 parent mutation call 时标为 `parent-observed` 并保存 `parentMutationCallIds`；没有匹配 call 时标为 `unattributed-shared-workspace`。汇总 classification 只能是 `none`、`parent-observed`、`unattributed-shared-workspace` 或 `mixed`。共享工作区中的变化即使出现在 child assignment 与 delivery 之间，也不能仅凭 parent event stream 断言为 child write。Broader integration 仍由 Main 的 parent command 验证。Capture malformed、truncated、oversized 或 capacity-dropped 时，严格 run 失败。

对要求持久化的写作 fixture，严格正向证据顺序是 writer proposal delivery、
checker in-band report delivery、Main finding disposition，以及之后匹配 target
的 parent mutation call 和 fixture outcome。没有 parent call 的变化保留为
`unattributed-shared-workspace`，不能计作 Main-owned apply，也不能反向计作
writer 越权；writer 无 mutation capability 的结论来自 deterministic/static
contract。只读写作 fixture 则反向要求没有 target mutation。

`writing` 域的写作场景要求 writer/zh-writer 的 proposal 与 checker/zh-checker 的
in-band report 都完整进入 terminal child delivery，不能只留在更早消息后以
status-only 或 artifact-reference-only 句子结束；这个断言不绑定特定 host
handoff schema。Main 独自做 finding disposition，任何获授权的文件修改都来自
disposition 之后可观察的 Main call。

`edit` 可能以 basename snapshot anchor 发起，但成功结果会返回 canonical `[absolute/path#tag]`。Evaluator 必须用隔离 project root 把结果路径还原为 `test/...` 或 `src/...` 后再匹配 mutation pattern；只保留 basename 会把真实 TDD 误判为“没有修改”。Fixture snapshot 还要保存 baseline root 的 realpath 与 filesystem identity，在验证前后拒绝 root replacement 和任何 symlink，并在读取 semantic sentinel 前确认文件 realpath 仍在原真实 project root 内；lexical `src/...` 或 `test/...` 名称本身不是 containment evidence。

需要验证公开 checkpoint 时，fixture 通过 `fixtureExpectations` 声明 required/
forbidden patterns。若 fixture 通过 exact native `skill-prompt` 提供域索引或
domain Skill 正文，应把该 provenance 写进 scenario expectation，并断言 Main
不重读已提供 URI；其他 prompt text 不算 supplied body。这些都是离线 trace
expectations，不是插件 runtime gate、router、dispatch authority 或 completion
condition。

## Task-owned TDD 与 parent verification 断言

`requireSubagentDrivenCode` 检查每个 implementation assignment 是否由 native `task` 接收完整 bounded input，并检查 host-observed child delivery 是否按同一 slice 报告：

```text
test mutation
< same command non-zero exit as valid RED
< minimal production mutation
< same command zero exit as GREEN
< refactor while green
```

每个 assignment 必须包含 target/acceptance、exclusive write set、test seam、valid RED、minimal production、same-command GREEN、refactor 和 evidence return。Syntax error、fixture 缺失、provider failure、permission failure 或无关 baseline failure 不能被 delivery 当作 valid RED。Evaluator 要求至少两个 implementation assignments 位于同一个 batch call 且 `batch=true`，plan completion 早于它们，所有 child completion 都早于 Main integration。

Parent trace 禁止 Main 使用 `edit`/`write` 代替 child 实现。所有 task deliveries 完成后且 `MAIN REVIEW` 前，Main 必须恰好运行一次 matching broader command 并得到 exit 0；这证明 integrated current tree，而不是替代每个 child 的 focused RED/GREEN。旧 `requireTddCycle` 仍可用于 parent-owned evaluator fixture，但 self-iteration positive scenario 使用 `requireSubagentDrivenCode`，不要求 child tool events 出现在 parent trace。

## Main review、reviewer 与 repair 时序

`requireSubagentDrivenCode` 要求 parent TODO 先初始化；复杂计划的审阅（如委派 `analyzer`）在任何 implementation task 前完成并收到 Main 提供的完整计划。每次 native `task` call 都必须有非空顶层 `context`。Patterns 只匹配每个 job 自己的 native `tasks[].task` text；batch outer `context`、name 或 label 不能替单个 assignment 冒充完整约束。Child 只消费 assignment 冻结的 `skills` 集合，不重新发现、选择或加载 Skill；若集合不足，delivery 返回 limitation，由 Main disposition。这些都是离线 trace expectations，不是插件 runtime gate、dispatch authority 或 completion condition。

Main broader verification GREEN 后必须出现 visible `MAIN REVIEW`。它至少覆盖 current tree containment、bounded semantic diff、task-returned RED/GREEN evidence、broader verification 与 cross-slice interaction。Native `reviewer` 的 assignment 必须晚于该 marker，并携带 Main review、bounded diff 和 evidence；reviewer 不读取项目或运行命令。其 completed delivery 是 host-observed evidence，不是 completion permission。

若 delivery 命中 supported material finding，evaluator 要求 Main 之后向 native `task` 提交含 exact finding、bounded repair 和 affected-evidence 要求的 assignment。Repair delivery 完成后必须有第二次 `MAIN REVIEW`；fresh reviewer 若存在，必须在第二次 Main review 后，且最多一次。没有 material repair 或输入未变化时，重复 review 是 churn。这是离线 trace expectation，不是 runtime hard gate、fixed fan-out 或 automatic repair loop。

## Fixture 和 matrix 检查表

新增场景时依次确定：

1. `fixture` 如何创建可执行基线，以及 `cleanup` 是否在任何退出路径执行。
2. `prompt` 是否给出足够 assignment input，又没有替模型选择无关 workflow 或 Skill。
3. `tools` 是否只包含场景需要的原生接口。
4. workflow/Skill expectations 是否验证 observed successful reads，而不是 final claim。
5. TODO/task expectations 是否检查 init、metadata、parallel batch、submission、host-observed delivery、completion 和必要时序。
6. Child delivery、parent mutation prohibition、broader command 与 fixture outcome 是否共同排除 Main 代做、production-first 和假 RED；写作场景是否相反地要求 proposal/report 后由 Main apply。
7. `fixtureExpectations` 是否拒绝 lexical traversal、symlink/realpath 越界与缺失 semantic outcome。
8. 每个 changed file 是否记录 parent call ID 或 `unattributed-shared-workspace`，且没有把共享工作区变化误归因给 child。
9. timeout 是否足够覆盖模型、task jobs 和 cleanup，同时仍有 runner hard limit。

先用 synthetic trace 为 evaluator 写 RED/GREEN 单测。Evaluator 不能只在真实模型失败后靠猜测修改。

## 执行顺序

1. 运行 deterministic contract、生成与 parity suite。
2. 对 matrix 执行 `--dry-run`，检查模型、tools、prompt、fixture、expectations 与 output。
3. 运行 repeat=1 pilot，人工确认事件可观测且 evaluator 没有误分类。
4. Freeze prompt、fixture、model、thinking、tools、evaluator 和 timeout。
5. 运行 repeated positive matrix。
6. 运行 negative controls，测量 workflow/Skill/TODO/reviewer 误触发。
7. 需要 A/B 时只改变一个变量，再独立运行相同 repeat。
8. 综合严格 PASS、behavior compliance、infrastructure health 与 limitation。

模型 A/B 与 reminder on/off A/B 是两种实验。前者只换 model；reminder 对照固定 model 并使用 `OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER=1`（reminder off）。Protocol coach 已删除，不存在 coach 对照。不要在同一 run 同时换 prompt、model、thinking 和 evaluator 后宣称因果。One-shot advisory 不一定出现在 parent event stream，所以 live E2E 不能用 Main 自述补造“已注入”；deterministic context test 负责证明该机制。单次 live canary 只是行为样本，不能证明稳定性提升。

## 故障分类

每个 run 都保留严格 overall verdict，同时报告两个解释维度：

- `behavior`: `pass | fail | not_evaluable`；
- `infrastructure`: `clean | degraded | failed`。

每个 live result 的 `outcome` 保存这两个值，顶层 report 的 `outcomes` 汇总计数。严格 `evaluation.pass` 仍保留，不能用分类字段掩盖失败。

至少区分：

| 类别 | 解释 |
| --- | --- |
| provider 5xx recovered | 最终行为可评估，但基础设施 degraded，不能隐藏错误 |
| provider 5xx exhausted | 没有形成有效 assistant trace，behavior 通常 `not_evaluable` |
| OMP deadline | OMP task deadline 到达；与 runner timeout 分开 |
| runner hard timeout | harness 主进程硬上限到达 |
| project command timeout | `bash.details.timedOut=true`；是项目命令问题，不是 runner hard timeout |
| evaluator defect | event 存在但 parser、provenance 或 expectation 逻辑误判 |
| workflow compliance | 可评估 trace 漏掉或错序执行 ANALYZE、EXECUTE、REVIEW 阶段、TODO、TDD 或 review |

零 token、无成功 assistant batch、无工具调用且全是 provider error 的 run 保持严格失败，但不应被解释成模型主动拒绝 workflow。Recovered transport error 也不能从报告中删除。

## 重复、负向控制与结论

Pilot 通过后 freeze candidate，再 repeat。至少同时报告：

- 总 run 数与严格 PASS 数；
- 可评估 run 数及其中的 workflow/TDD/review compliance；
- provider、OMP deadline、runner 和 project-command failure 数；
- negative-control 误触发率；
- plan/task/reviewer assignment、host-observed delivery、Main broader verification 与 `MAIN REVIEW` evidence；
- 每个 run ID 与 evaluator failure。

一次 successful run 只证明 harness 和一个样本有效。可评估样本不足、基础设施故障过多、candidate 条件未冻结或不同 evaluator 混用时，结论必须标为 inconclusive。

## 维护边界

- Runner 和 evaluator：`scripts/e2e/run-installed-workflow.mjs`、`scripts/e2e/workflow-events.mjs`。
- Deterministic evaluator tests：`scripts/e2e-installed-workflow.test.js`。
- Self-iteration matrix：`scripts/e2e/fixtures/self-iteration.json`。
- 自开发设计与 reviewer 方法：[OMP_ENHANCER_SELF_DEVELOPMENT.md](OMP_ENHANCER_SELF_DEVELOPMENT.md)。
- 通用验证、打包和 release：[DEVELOPMENT.md](DEVELOPMENT.md)。

E2E output 放在 `.omp/e2e-results/`，不得作为发布内容或提交凭据快照。Commit、push、publish、release 和 upgrade 仍要求独立显式授权。
