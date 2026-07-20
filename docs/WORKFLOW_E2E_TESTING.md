# Workflow and Skill E2E Testing

本文是 workflow、Skill、TODO、delegation、TDD 和 reviewer 行为测试的当前方法来源。它验证 OMP Main 在真实运行中的自主选择和执行，不把 E2E 变成 runtime gate，也不让 final 自述替代事件证据。

## 证据分层

按成本从低到高使用三层主证据：deterministic contract tests、static OMP probe、isolated model E2E。必要时再增加明确针对当前 installed marketplace 的只读 smoke。

1. **Deterministic contract**：纯函数、schema、hook、prompt parity、generated asset 和 synthetic event evaluator tests。
2. **Static OMP probe**：隔离启动 OMP，比较 prompt hash、active tools、Skills、Agents、task schema 和 plugin discovery，不提交模型 prompt。
3. **Isolated model E2E**：在一次性 HOME、session、credential snapshot 和临时 fixture 中运行真实 Main，保存 NDJSON 事件和脱敏 summary。
4. **Installed-state smoke**：只有确实要验证当前用户安装态时使用；它与 `--worktree-plugins` 的当前源码语义分开报告。

下层失败时先修复下层，不用昂贵模型 run 猜测 deterministic defect。Dry-run 只验证参数、fixture 与 matrix 结构，不是 E2E PASS。

## Bootstrap 与生成 handoff 契约

Deterministic tests 先验证精确 `opencode-go/deepseek-v4-flash` 和精确
`opencode-go/mimo-v2.5` 的 compact、state-aware、top-level one-shot
bootstrap。它根据当前 workflow Skill、其他 Skills、native `task`、
delegation 许可与 exact native supplied-index provenance 选择最小提示；
workflow index 可见时，第一响应只允许 DIRECT、exact-native supplied 后
直接 PLAN，或 not-supplied 后只读 index 并等待。其他 model、Advisor、
subagent、重复 task reminder 或 diagnostic disable 分支都应保持无注入。

Generated-asset tests 再验证 front-loaded handoff：紧凑 index 的
`DECLARE HANDOFF (soft)` 位于任何 domain row 前，先提示 next response byte 0 的
`WORKFLOW PLAN`；每张 workflow reference 在详细 card body 前后各有一个
`READY NEXT (soft)` sentinel。两者都提示 next response byte 0 的
`WORKFLOW READY`、no other visible text、native TODO init only 与 end/wait，
且没有 plugin enforcement。Index 大小由生成与预算 contract tests 针对
当前 artifact 动态校验；文档不固化易过期的 byte snapshot。

Reference tests 还要求每个 delegated native TODO `items[]` string 完整等于
exact Delegate row，并要求 native `tasks[].task` 本体自身在 byte 0 以机械
复制所得的 `[workflow=... step=... todo=... skills=...]` 四键 prefix 开始；
每次 native `task` call 都必须带非空顶层 `context`。Batch `context`、name、
label 或让 child 在输出中补 metadata 都不能替代 item body 或该 prefix。
这些检查验证可观察协议，不会变成 runtime dispatch 或 completion gate。

Protocol coach 先用 deterministic synthetic events 重放机械链路：`index result -> PRE_PLAN -> visible PLAN -> declared NOW/extensions/THEN results -> PRE_READY -> final non-pending READY + TODO result -> PRE_DISPATCH`。每个 phase-generation 只有一个逻辑 cue，并且只附加到下一次自然 provider request；provider retry 或无效的 corresponding marker 可再次看到同一个 pending cue，但不会生成新 key、请求或 turn，有效对应 response 后不再重发。Tests 还覆盖 exact-model/top-level Main gating、Advisor/subagent/其他模型/disable 分支无 cue、`writing.pending` 初始 TODO 不产生 dispatch cue、context 输入不被原地修改，以及 `tool_call`、`tool_result`、`session_stop` 的 advisory 返回契约不变。`OMP_ENHANCER_DISABLE_PROTOCOL_COACH=1` 只用于 coach 对照；这些 deterministic context tests 证明注入机制，绝不把它升级成 block、router、gate、retry 或 completion control。

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

`scripts/e2e/fixtures/deepseek-self-iteration.json` 定义 positive `omp-self-iteration-tdd` 和 mechanical negative control `omp-self-iteration-mechanical-control`。Runner 在临时目录创建一个初始 GREEN 的真实 Node project，其中有两个互不重叠的 vertical slices：

```text
AGENTS.md
package.json
src/normalize.js
test/normalize.test.js
src/enabled.js
test/enabled.test.js
```

任务只允许修改这两组 source/test 文件。Main 必须先检索本地锚点并写完整 wave/slice 计划，插件 `plan` 完成 PLAN REVIEW 后，用一次 native `task` call 的同一个 `tasks[]` batch 提交两个 independent slices。每个 task child 自己完成 test mutation、valid RED、minimal production mutation、same-command GREEN 和 refactor，并通过 host-observed completed delivery 返回 command exit、changed paths 与 bounded diff。Parent 不使用 `edit` 或 `write` 实现 slice，也不冒充 child 的 RED/GREEN；两项 delivery 完成后，Main 在 parent event stream 中运行一次 exact `npm test` 作为 broader current-tree verification，随后公开 `MAIN REVIEW`，再把 Main-reviewed bounded diff/evidence 交给 native `reviewer`。

Synthetic evaluator traces 和 live conditional branch 还覆盖 supported-finding repair path：Main 验证 finding 后把 bounded repair 交回 native `task`，接收 host-observed repair delivery，刷新受影响 evidence 并写第二次 `MAIN REVIEW`，之后最多一次 fresh reviewer。它观察 `omp.plugin`、`code-development` 及其 OMP Enhancer 条件 reference，而不是已退役的普通代码卡片或过程 Skills。这个固定 fixture 的决策完全由本地证据决定，因此禁止 network，也禁止 publish、release、upgrade 和 package/AGENTS 修改。网络禁用是该场景的负向边界，不否定 `code-development` 在实际决策相关任务中先查官方资料再查社区经验。

常用入口：

```bash
npm run e2e:main:self-iteration -- --dry-run
npm run e2e:main:self-iteration -- \
  --worktree-plugins --repeat 1 \
  --output .omp/e2e-results/self-iteration-pilot
```

脚本的兼容别名是 `npm run e2e:deepseek:self-iteration`。不传 `--scenario` 时同一入口运行 positive 与 mechanical control；单独 pilot 可传对应 scenario ID。默认 matrix 固定 `opencode-go/deepseek-v4-flash:max`；比较其他模型时显式覆盖 `--model` 与 `--thinking`，并使用新的 output 目录。

## 场景设计原则

一个可归因的 E2E 场景应满足：

- fixture 在任务前真实可运行且基线 GREEN；
- 每个 slice 只要求一个垂直、可观察的行为变化；需要测试 parallel batching 时，使用至少两个真实独立且 write set 不重叠的 slices；
- prompt、model、thinking、tools、Advisor、task mode、timeout、evaluator 和 repeat 可冻结；
- `fixtureExpectations` 明确 allowed/required changed files、required/forbidden patterns、无 symlink 和 realpath containment；
- 不依赖网络或外部发布作为 correctness evidence；
- positive scenario 旁有 mechanical lookup、user-forbidden delegation 或 unchanged-read 等 negative control；
- reviewer 数量只表达该场景的具体未回答问题，不成为全局配额。

Self-iteration matrix 的 assignments 分别覆盖 PLAN REVIEW、两个 parallel native-task slices、reviewer 和条件式 repair；它们来自 fixture 的真实独立性与 supported-finding branch，不表示每个 OMP 任务需要固定 fork 数或 reviewer 数。

## Event stream 是真值

Evaluator 从 parent event stream 恢复：

- `DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY` 的可观察边界；
- workflow index resolver read，或 scenario 明确记录的 exact native `skill-prompt` body named `omp-enhancer-workflows`；只有后者算 exact-native supplied index，managed context、Available Skills 描述或其他 Skill body 都不算，且不得再出现 index resolver read；
- byte 0 为 `W` 的 visible `WORKFLOW PLAN` response；`D`/`C` 只是 optional candidates、绝不是 load sets，其 Skills 只含与 requested method、evidence rule、verdict 或 format 匹配的 selected `D` 顶层 exact URI、`C` nested ECC exact URI 或未枚举长尾 catalog URI，workflow references 只在 `THEN`，且至少有 `LOAD`、`COMMIT`、`SPLIT + EXECUTE` 和 `VERIFY` 四个详细 Actions；
- 与 `NOW` 完全一致的 successful Skill/catalog reads；`NOW` 不包含已由宿主提供的 Skill，枚举 `C` URI 直接出现且不先读取 catalog；
- 0 到 3 个带 `RESOURCE EXTENSION` marker 的 exact linked-resource batches，其中最多两次未枚举长尾 catalog hop 加一次方法资源；source 必须已成功加载，目标 URI 必须出现在 source 完整结果中、保持同 Skill namespace 且未读过；
- 与 `THEN` 完全一致的 workflow reference reads，Add-ons 在前、Primary 一次且最后；`NOW=[none]` 时该批可以跟随 PLAN 立即发生，其他情况在 resource extension 之后发生且只发生一次；
- byte 0 为 `W` 的 visible `WORKFLOW READY |` response；该 response 只初始化 TODO、结束并等待。Loaded-card soft compiler 在 `subagent-driven`、input 完整、checkpoint 安全且 matching Agent 可见时，把完整 exact `Delegate Agent=... workflow=... step=... skills=... checkpoint=...` string 写入一个 native TODO `items[]` entry；否则记录一个匹配的许可 fallback；parent-owned `VERIFY` rows 保持独立；
- `writing.pending` 的 initial READY、一次 narrow language read、replacement PLAN/loads/READY，且不重复 transition；
- writing index 的 `language`、`format overlays`、`specialized outputs` 三组，以及正文任务中 language Primary + requested format Add-on、纯格式任务中 format Primary 的正反场景；其中 preservation-only `writing.latex` Add-on 读取零个 format Skills，显式 conversion/template 只读取一个方向匹配候选；
- native TODO init、transition 与 completion；
- parent `write`/`edit` mutation target、call ID 和事件位置；
- parent `bash` command、exit code、timeout 与完成位置；
- native task assignment、Agent、每次 task call 的非空顶层 `context`、`tasks[].task` 本体 byte-0 四键 metadata、job ID、completion 与 host-observed terminal child delivery text；
- visible `MAIN REVIEW` text 与 event order；
- hub/async result 与 final response。

Thinking、final 声明、history text 或未完成 child preview 不能补造缺失事件。Host-observed delivery 可以证明 OMP 把 child output 交回 parent，并允许校验它报告的 slice paths、RED/GREEN exits 和 bounded diff；它不能证明未暴露在 parent stream 中的 child 内部 tool-call sequence。Child 只消费冻结 assignment Skills、不得二次 discovery/selection/load 的边界应由 Agent prompt 与 assignment contract test 证明；parent E2E 只验证可观察的冻结元数据，不对不可见内部历史作结论。真实文件 outcome 由 fixture snapshot 验证，但 snapshot 只说明“发生了变化”，不说明“谁修改了文件”。Runner 对每个 changed file 记录 `mutationAttribution.files[]`：存在匹配 target 的 parent mutation call 时标为 `parent-observed` 并保存 `parentMutationCallIds`；没有匹配 call 时标为 `unattributed-shared-workspace`。汇总 classification 只能是 `none`、`parent-observed`、`unattributed-shared-workspace` 或 `mixed`。共享工作区中的变化即使出现在 child assignment 与 delivery 之间，也不能仅凭 parent event stream 断言为 child write。Broader integration 仍由 Main 的 parent command 验证。Capture malformed、truncated、oversized 或 capacity-dropped 时，严格 run 失败。

对要求持久化的写作 fixture，严格正向证据顺序是 writer proposal delivery、
checker in-band report delivery、Main finding disposition，以及之后匹配 target
的 parent mutation call 和 fixture outcome。没有 parent call 的变化保留为
`unattributed-shared-workspace`，不能计作 Main-owned apply，也不能反向计作
writer 越权；writer 无 mutation capability 的结论来自 deterministic/static
contract。只读写作 fixture 则反向要求没有 target mutation。

`writing.en`/`writing.zh` 的 initial TODO 还必须一次冻结三个 exact Delegate
rows：step-2 writer、step-3 checker 与 conditional step-4 corrected-proposal。
Step-3 等待完整 writer terminal delivery；step-4 只有在 Main 接受至少一个
checker finding 后才 dispatch，否则 Main 把该 no-op conditional checkpoint
标为 resolved/completed，而不是 drop/abandon。完整且可直接使用的 proposal/report
必须位于 terminal child delivery，不能只留在更早消息后以 status-only 或
artifact-reference-only 句子结束；这个断言不绑定特定 host handoff schema。

`edit` 可能以 basename snapshot anchor 发起，但成功结果会返回 canonical `[absolute/path#tag]`。Evaluator 必须用隔离 project root 把结果路径还原为 `test/...` 或 `src/...` 后再匹配 mutation pattern；只保留 basename 会把真实 TDD 误判为“没有修改”。Fixture snapshot 还要保存 baseline root 的 realpath 与 filesystem identity，在验证前后拒绝 root replacement 和任何 symlink，并在读取 semantic sentinel 前确认文件 realpath 仍在原真实 project root 内；lexical `src/...` 或 `test/...` 名称本身不是 containment evidence。

需要验证公开 checkpoint 时，启用 `requireWorkflowPlanFirstVisibleContent`，正向断言 PLAN response byte 0 为 `W`；启用 `requireStructuredWorkflowLoadPhases`，要求 PLAN `Skills` 只含 selected D/C exact Skill URI 或未枚举长尾 catalog URI、至少包含四个命名 Actions、使用 `NOW/THEN` 语法、PLAN resource call 精确匹配 `NOW`、枚举 `C` 不先读取 catalog、workflow references 仅在 `THEN` 且按 Add-ons 后 Primary 排序，所有非 extension reference reads 也精确匹配 `THEN`。启用 `requireWorkflowReadyTodoOnlyBatch` 时，READY response byte 0 同样为 `W` 并只完成一次成功的 native TODO init，随后结束等待；subagent-driven scenario 按 loaded-card compiler 断言 matching checkpoint 的 native TODO `items[]` string 是 exact `Delegate` row，或存在一个许可 fallback，并保留 parent-owned `VERIFY` rows，再到下一 response 开始项目工具。若 fixture 通过 exact native `skill-prompt` 提供 index 或 domain Skill 正文，应把该 provenance 写进 scenario expectation，并断言 Main 不重读已提供 URI；其他 prompt text 不算 supplied body。这些都是离线 trace expectations，不是插件 runtime gate、router、dispatch authority 或 completion condition。

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

`requireSubagentDrivenCode` 要求 parent TODO 先初始化，插件 `plan` job 在任何 implementation task 前完成并收到 Main 提供的完整 plan。每次 native `task` call 都必须有非空顶层 `context`。Patterns 只匹配每个 job 自己的 native `tasks[].task` text；batch outer `context`、name 或 label 不能替单个 assignment 冒充完整约束。Exact metadata 从 native TODO `items[]` 中的完整 delegated row 机械复制：把该 row 的 `Agent` 原样复制到 native `tasks[].agent`，把 `workflow`、`step`、`skills` 和 `checkpoint` 分别原样复制到 `tasks[].task` 本体 byte 0 的 `[workflow=... step=... todo=<checkpoint> skills=...]` 前缀。前缀必须已存在于 job body 自身，不能靠 outer metadata 或让 child 输出 metadata 补造。Child 只消费这个 frozen `skills` 集合，不重新发现、选择或加载 Skill；若集合不足，delivery 返回 limitation，由 Main disposition。`requireExactNativeTaskMetadataPrefix` 检查 byte-0 前缀，`requireNativeTaskMetadataMatchesDelegatedTodoRows` 检查上述 row-to-job 字段对应；二者都是离线 trace expectations，不是插件 runtime gate、dispatch authority 或 completion condition。

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

模型 A/B、reminder on/off A/B 与 protocol coach on/off A/B 是三种实验。前者只换 model；reminder 对照固定 model 并使用对应 `OMP_ENHANCER_DISABLE_*_COMPAT=1`；coach 对照只切换 `OMP_ENHANCER_DISABLE_PROTOCOL_COACH=1`。不要在同一 run 同时换 prompt、model、thinking 和 evaluator 后宣称因果。Phase cue 不一定出现在 parent event stream，所以 live E2E 不能用 Main 自述补造“已注入”；deterministic context test 负责证明该机制。单次 live canary 只是行为样本，不能证明稳定性提升。

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
| workflow compliance | 可评估 trace 漏掉或错序执行 PLAN、LOAD、READY、TODO、TDD 或 review |

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

- Runner 和 evaluator：`scripts/e2e/run-installed-deepseek-workflow.mjs`、`scripts/e2e/workflow-events.mjs`。
- Deterministic evaluator tests：`scripts/e2e-installed-workflow.test.js`。
- Self-iteration matrix：`scripts/e2e/fixtures/deepseek-self-iteration.json`。
- 自开发设计与 reviewer 方法：[OMP_ENHANCER_SELF_DEVELOPMENT.md](OMP_ENHANCER_SELF_DEVELOPMENT.md)。
- 通用验证、打包和 release：[DEVELOPMENT.md](DEVELOPMENT.md)。

E2E output 放在 `.omp/e2e-results/`，不得作为发布内容或提交凭据快照。Commit、push、publish、release 和 upgrade 仍要求独立显式授权。
