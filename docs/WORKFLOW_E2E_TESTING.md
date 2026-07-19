# Workflow and Skill E2E Testing

本文是 workflow、Skill、TODO、delegation、TDD 和 reviewer 行为测试的当前方法来源。它验证 OMP Main 在真实运行中的自主选择和执行，不把 E2E 变成 runtime gate，也不让 final 自述替代事件证据。

## 证据分层

按成本从低到高使用三层主证据：deterministic contract tests、static OMP probe、isolated model E2E。必要时再增加明确针对当前 installed marketplace 的只读 smoke。

1. **Deterministic contract**：纯函数、schema、hook、prompt parity、generated asset 和 synthetic event evaluator tests。
2. **Static OMP probe**：隔离启动 OMP，比较 prompt hash、active tools、Skills、Agents、task schema 和 plugin discovery，不提交模型 prompt。
3. **Isolated model E2E**：在一次性 HOME、session、credential snapshot 和临时 fixture 中运行真实 Main，保存 NDJSON 事件和脱敏 summary。
4. **Installed-state smoke**：只有确实要验证当前用户安装态时使用；它与 `--worktree-plugins` 的当前源码语义分开报告。

下层失败时先修复下层，不用昂贵模型 run 猜测 deterministic defect。Dry-run 只验证参数、fixture 与 matrix 结构，不是 E2E PASS。

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

- workflow index read；
- visible `WORKFLOW PLAN` 及其 Primary、Add-ons、Skills、Load order 和 Actions；
- successful domain Skill 与 workflow reference reads；
- visible `WORKFLOW READY |`；
- native TODO init、transition 与 completion；
- parent `write`/`edit` mutation target 和事件位置；
- parent `bash` command、exit code、timeout 与完成位置；
- native task assignment、Agent、metadata、job ID、completion 与 host-observed child delivery text；
- visible `MAIN REVIEW` text 与 event order；
- hub/async result 与 final response。

Thinking、final 声明、history text 或未完成 child preview 不能补造缺失事件。Host-observed delivery 可以证明 OMP 把 child output 交回 parent，并允许校验它报告的 slice paths、RED/GREEN exits 和 bounded diff；它不能证明宿主没有暴露在 parent stream 中的 child 内部 tool-call sequence。真实文件 outcome 仍由 fixture snapshot 验证，broader integration 仍由 Main 的 parent command 验证。Capture malformed、truncated、oversized 或 capacity-dropped 时，严格 run 失败。

`edit` 可能以 basename snapshot anchor 发起，但成功结果会返回 canonical `[absolute/path#tag]`。Evaluator 必须用隔离 project root 把结果路径还原为 `test/...` 或 `src/...` 后再匹配 mutation pattern；只保留 basename 会把真实 TDD 误判为“没有修改”。Fixture snapshot 还要保存 baseline root 的 realpath 与 filesystem identity，在验证前后拒绝 root replacement 和任何 symlink，并在读取 semantic sentinel 前确认文件 realpath 仍在原真实 project root 内；lexical `src/...` 或 `test/...` 名称本身不是 containment evidence。

需要验证公开 checkpoint 时，启用 `requireWorkflowPlanFirstVisibleContent`，拒绝 PLAN 前的前言；启用 `requireWorkflowReadyTodoOnlyBatch`，要求 READY response 只完成一次成功的 native TODO init，再到下一响应开始项目工具。这些都是离线 trace expectations，不是插件 runtime gate。

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

`requireSubagentDrivenCode` 要求 parent TODO 先初始化，插件 `plan` job 在任何 implementation task 前完成并收到 Main 提供的完整 plan。Patterns 只匹配每个 job 自己的 `task` text；batch outer context 不能替 assignment 冒充完整输入。Exact metadata 必须从 assignment 首字符开始，并精确携带 workflow、step、parent TODO content 和 loaded Skills。

Main broader verification GREEN 后必须出现 visible `MAIN REVIEW`。它至少覆盖 current tree containment、bounded semantic diff、task-returned RED/GREEN evidence、broader verification 与 cross-slice interaction。Native `reviewer` 的 assignment 必须晚于该 marker，并携带 Main review、bounded diff 和 evidence；reviewer 不读取项目或运行命令。其 completed delivery 是 host-observed evidence，不是 completion permission。

若 delivery 命中 supported material finding，evaluator 要求 Main 之后向 native `task` 提交含 exact finding、bounded repair 和 affected-evidence 要求的 assignment。Repair delivery 完成后必须有第二次 `MAIN REVIEW`；fresh reviewer 若存在，必须在第二次 Main review 后，且最多一次。没有 material repair 或输入未变化时，重复 review 是 churn。这是离线 trace expectation，不是 runtime hard gate、fixed fan-out 或 automatic repair loop。

## Fixture 和 matrix 检查表

新增场景时依次确定：

1. `fixture` 如何创建可执行基线，以及 `cleanup` 是否在任何退出路径执行。
2. `prompt` 是否给出足够 assignment input，又没有替模型选择无关 workflow 或 Skill。
3. `tools` 是否只包含场景需要的原生接口。
4. workflow/Skill expectations 是否验证 observed successful reads，而不是 final claim。
5. TODO/task expectations 是否检查 init、metadata、parallel batch、submission、host-observed delivery、completion 和必要时序。
6. Child delivery、parent mutation prohibition、broader command 与 fixture outcome 是否共同排除 Main 代做、production-first 和假 RED。
7. `fixtureExpectations` 是否拒绝 lexical traversal、symlink/realpath 越界与缺失 semantic outcome。
8. timeout 是否足够覆盖模型、task jobs 和 cleanup，同时仍有 runner hard limit。

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

模型 A/B 与 reminder on/off A/B 是两种实验。前者只换 model；后者固定 model，并使用对应 `OMP_ENHANCER_DISABLE_*_COMPAT=1`。不要在同一 run 同时换 prompt、model、thinking 和 evaluator后宣称因果。

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
