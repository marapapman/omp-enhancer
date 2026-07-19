# OMP Testing Enhancer

OMP Testing Enhancer 提供按需启用的测试规划、执行辅助、浏览器取证和独立审查能力。除用户授权后显式调用的浏览器检查外，插件只分析、记录并汇总宿主证据；它不选择工作流、不自动激活工具、不调度修复，也不阻断或继续会话。

## 功能与工具

插件注册七个默认关闭的工具，由 Main agent 根据当前任务按需启用：

```text
omp_test_analyze
omp_test_context
omp_test_browser_check
omp_test_coverage_analyze
omp_test_mutation_context
omp_test_review
omp_test_report
```

- `omp_test_analyze` 从显式文件或当前 workspace diff 识别测试目标。
- `omp_test_context` 提供公开入口、相关测试，以及可选的 `propertyPlan`、`apiPlan` 和 `browserPlan`。
- `omp_test_browser_check` 执行已授权的前端场景并记录交互、console、pageerror、network 和视觉证据。
- coverage 与 mutation 工具只读取现有报告并给出补测线索。
- `omp_test_review` 只读审查测试文件范围、公开行为覆盖、浏览器证据和宿主已观察到的测试结果。
- 各类证据独立汇总；一种 finding 不会抑制另一类已观察证据的评估。
- `omp_test_report` 汇总最近的审查结果。

除浏览器工具需要 `exec` 权限外，其余工具均为只读。所有工具都标记为 `defaultInactive`。

## 工作流

Testing Enhancer 不再打包 `test-planner`、`test-executor` 或 `test-reviewer`。普通 testing/code 工作统一由 `code.dev` 和 `code-development` 组织，并在相关 Agents 可用时采用插件 `plan`、native `task` 与 native `reviewer`，避免把一个 vertical TDD slice 的 test 和 production 拆给不同 workers：

1. Main 先检索本地入口、公开行为和相关测试；决策相关时再查当前官方资料与社区经验。
2. Main 可用 `omp_test_analyze` 和 `omp_test_context` 补充 target-to-behavior evidence，并把计划写成 dependency-ordered waves。每个 vertical slice 明确 acceptance、依赖、exclusive write set、test seam、exact focused command、expected RED、production boundary、integration point 和 return evidence。
3. 当前 exposed 的只读 `plan` Agent 审 Main 已提供的完整计划与 assignment map；Main 逐项处理 finding。
4. 同 wave 的 runnable independent slices 通过一次 native `task` `tasks[]` batch 提交。每个 task 自己完成公开行为 test mutation、valid RED、minimal production change、same-command GREEN 和 green-only refactor，并返回 bounded diff 与 exact evidence。
5. Main 等待并集成 task deliveries，在授权范围内调用浏览器工具或宿主 shell 做 broader current-tree verification，然后公开写出 `MAIN REVIEW`，检查 semantic diff、RED/GREEN evidence、scope 与 cross-slice interaction。
6. Native `reviewer` 只在 Main review 后收到 Main-reviewed bounded diff/evidence，不读取项目或运行命令。Main 验证 findings；supported material repair 回到 native `task`，刷新 affected evidence 并再次 Main-review，最多一次 fresh affected reviewer。`omp_test_review` 和 `omp_test_report` 继续提供 advisory tool evidence。

Agent 不可用、capacity 不足或 write set 无法安全拆分时，Main 明确记录 limitation 并采用宿主允许的最安全 fallback。插件不拥有 dispatch 或完成权限；review 的 `ready` 或 `findings` 只是建议，流程不是 fixed fan-out、hard gate 或 automatic repair loop。

## 安装与升级

```bash
omp plugin marketplace add marapapman/omp-enhancer
omp plugin install omp-testing-enhancer@omp-enhancer
omp plugin list
```

升级：

```bash
omp plugin marketplace update omp-enhancer
omp plugin upgrade omp-testing-enhancer@omp-enhancer
```

本地开发可以在插件目录运行：

```bash
bun install
bun run build
omp plugin link .
```

插件不注册命令或 Agent；请从 Main 或原生 workflow/Skill 上下文中按需选择工具。

## 可选配置

需要固定预期测试命令或调整证据严重级别时，可手动创建 `.omp/testing-enhancer.yml`：

```yaml
version: 2
test:
  command: npm test
coverage:
  command:
browser:
  baseUrl:
  headless: true
  trace: retain-on-failure
  screenshot: only-on-failure
  serviceWorkers: block
review:
  indirectTest: critical
  productionEdits: critical
  testCommand: critical
  browserEvidence: critical
```

`test.command` 只是与宿主观测证据比较的预期值。`omp_test_review` 不会执行配置或参数中的命令。

## 证据与安全边界

- 测试命令必须由宿主工具显式执行；插件仅保存 task-context-scoped 摘要和退出状态，不保存命令原文或输出。
- 前端审查只接受同一 session 中 `omp_test_browser_check` 实际产生的证据。
- workspace 修改、task context 切换或 `session_stop` 会使相应浏览器证据失效。
- 浏览器产物只能写入项目真实路径下的 `.omp/testing-enhancer-artifacts`。
- 可选 `serverCommand` 只接受 `npm`、`pnpm`、`yarn` 或 `bun` 的 `start`、`dev`、`serve`、`preview` 脚本。
- lifecycle hooks 只观察和持久化状态，从不返回 `block: true` 或 `continue: true`。

## 开发

```bash
bun run typecheck
bun run build
bun run test
npm pack --dry-run
```
