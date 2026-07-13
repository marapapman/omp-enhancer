# OMP Testing Enhancer

OMP Testing Enhancer 是一个 advisory-only OMP plugin，用来帮助 agent 写测试、检查测试是否只改测试文件、提示测试对内部实现的依赖，并生成测试报告。前端目标可以使用 `omp_test_browser_check` 采集浏览器交互、console、pageerror、network 和视觉证据。纯函数和 API 目标会收到 `propertyPlan`、`apiPlan`。已有 coverage 或 mutation 报告时，agent 可以用专门工具读取未覆盖代码和 surviving mutants。

`omp_test_gate` 保留为兼容工具名，实际行为是建议型测试审查。插件只监听 `session_start` 和 `tool_result` 来维护诊断状态，所有结果使用 `critical` 或 `warning` 严重级别，由 agent 根据当前任务自行决定下一步。宿主自己的 sandbox、权限审批和安全边界不受影响。

插件会注册一个命令和七个工具，其中 `omp_test_browser_check` 只用于前端浏览器检查。没有 `browserPlan` 时可以跳过这个工具。没有 coverage 或 mutation 报告时，也可以跳过对应分析工具。

命令：

```text
/test
```

工具：

```text
omp_test_analyze
omp_test_context
omp_test_browser_check
omp_test_coverage_analyze
omp_test_mutation_context
omp_test_gate
omp_test_report
```

## 测试子代理

插件随包提供三个明确分工的 subagent roles。父级工作流负责分配任务、传递范围并汇总结果。插件本身不会自动调度子代理，也不拥有完成权限。

- `test-planner` 是只读规划角色。它先把目标映射到公开行为、测试层级和证据需求，不改文件，也不运行命令。
- `test-executor` 是测试执行角色。它只在授权范围内修改测试文件和 fixtures，通过宿主运行已授权的真实测试命令，并采集当前浏览器、coverage 或 mutation 证据。
- `test-reviewer` 是独立只读审查角色。它不重跑测试，也不修改文件，只审查计划、测试 diff、公开行为覆盖和当前证据，最后返回建议型 verdict。

标准委派顺序如下。

1. `test-planner` 生成 target-to-behavior 与 evidence plan。
2. 父级工作流确认范围后，把计划交给 `test-executor`。
3. `test-executor` 修改测试和 fixtures，并通过宿主采集真实执行证据。
4. `test-reviewer` 独立复核计划、diff 和证据。
5. 父级工作流根据 review 决定是否需要新的用户授权或后续任务。

`omp_test_gate` 只消费宿主已经观察到的证据。它不会执行命令，不会阻断或继续会话，也不会触发修复循环。

## 安装

推荐通过 OMP marketplace 安装。这样后续可以直接使用 `omp plugin upgrade` 升级。

先添加 monorepo 根目录的 `omp-enhancer` 作为 marketplace。

```bash
omp plugin marketplace add marapapman/omp-enhancer
```

然后通过共享 marketplace 名称安装插件。

```bash
omp plugin install omp-testing-enhancer@omp-enhancer
```

安装后检查插件列表。

```bash
omp plugin list
```

如果插件被禁用，可以重新启用。

```bash
omp plugin enable omp-testing-enhancer@omp-enhancer
```

然后重启 OMP 会话。marketplace 安装会提供七个工具，其中 `omp_test_browser_check` 只用于前端浏览器检查：`omp_test_analyze`、`omp_test_context`、`omp_test_browser_check`、`omp_test_coverage_analyze`、`omp_test_mutation_context`、`omp_test_gate`、`omp_test_report`，以及带命名空间的命令 `/omp-testing-enhancer:test`。

可以先输入：

```text
/omp-testing-enhancer:test
```

如果能看到这份流程说明，说明 marketplace 内容已经加载成功。
## 升级

先更新共享 marketplace catalog。

```bash
omp plugin marketplace update omp-enhancer
```

然后升级插件。

```bash
omp plugin upgrade omp-testing-enhancer@omp-enhancer
```

如果你是本地开发安装，继续使用 `omp plugin link .`，不用走 marketplace 升级流程。

## Marketplace 常用流程

marketplace 安装后的默认流程是工具工作流，不是 `/test` 命令。

先输入：

```text
/omp-testing-enhancer:test
```

然后按规划、执行、独立审查的顺序委派。

1. `test-planner` 调用 `omp_test_analyze` 和 `omp_test_context`，形成 target-to-behavior plan。
2. 如果已有 coverage 或 mutation 报告，`test-planner` 调用 `omp_test_coverage_analyze` 或 `omp_test_mutation_context`，把缺口纳入计划。
3. 父级确认范围后，`test-executor` 更新必要的测试和 fixtures。
4. 如果计划包含 `browserPlan`，`test-executor` 调用 `omp_test_browser_check` 采集浏览器证据。
5. `test-executor` 通过宿主 shell 显式运行配置中的期望测试命令，记录真实输出和 exit status。
6. `test-reviewer` 独立只读审查计划、测试 diff、公开行为覆盖和当前证据。它可以调用一次 `omp_test_gate` 并按需调用 `omp_test_report`。这些工具不执行命令，也不控制会话。
7. 父级汇总审查结果。插件不会自动调度修复。

如果需要再次确认命令和工具说明，也可以重新运行 `/omp-testing-enhancer:test`。

## 本地开发安装

如果你要改插件源码，建议用 `link`。下面的 `/test init`、`/test`、`/test check`、`/test report` 只适用于本地 `omp plugin link .` 或显式 extension 路径加载后的会话。

```bash
git clone https://github.com/marapapman/omp-enhancer.git
cd omp-enhancer/plugins/omp-test-enhancer
bun install
bun run build
omp plugin link .
```

改完源码后重新构建，再重启 OMP 会话。

```bash
bun run build
```

这个仓库也可以通过显式 extension 路径加载。一般只在调试时这样做。

```yaml
extensions:
  - /absolute/path/to/omp-test-enhancer/dist/extension.js
```

## 初始化插件配置

在目标项目的 OMP 会话里运行：

```text
/test init
```

插件会生成：

```text
.omp/testing-enhancer.yml
```

如果项目里有 `bun.lock`，默认测试命令是：

```yaml
test:
  command: bunx vitest run
```

如果项目里有 `pnpm-lock.yaml`、`package-lock.json` 或 `yarn.lock`，插件会分别使用 `pnpm test`、`npm test` 或 `yarn test`。

`/test init` 还会写入浏览器默认值。`browser.baseUrl` 默认留空，等目标项目有 dev server 或 preview URL 后再填写。

配置文件已经存在时，插件不会覆盖。

## 常用命令

分析当前改动并指导 agent 补测试：

```text
/test
```

`/test` 会等待当前 agent 空闲，然后把测试增强指令作为新的用户消息发送给 agent。它不会只显示提示，也不会把工作挂到无法触发的 follow-up 队列里。

前端或 React 组件目标会收到 `browserPlan`。如果存在 `browserPlan`，可以调用 `omp_test_browser_check` 执行用户事件、采集浏览器证据，然后运行建议型审查。没有 `browserPlan` 时可以跳过浏览器检查。纯函数、parser、formatter、validator 目标会收到 `propertyPlan`。API 目标会收到 `apiPlan`。如果项目已经生成 coverage 或 mutation 报告，调用 `omp_test_coverage_analyze` 或 `omp_test_mutation_context` 把缺口转成补测建议。

只处理指定文件：

```text
/test src/user/UserService.ts
```

写完测试后只运行建议型审查：

```text
/test check
```

查看最近一次报告：

```text
/test report
```

查看帮助：

```text
/test help
```

## 建议型审查

`omp_test_gate` 是保留的兼容名称。它会按顺序检查静态 findings、可选浏览器证据和宿主已经观察到的测试命令证据，并返回 `advisory: true` 以及 `ready` 或 `findings` 状态。它不会执行参数或配置文件里的命令。

1. `test-file-scope`

   候选改动只能出现在测试文件或测试目录里。比如：

   ```text
   src/foo.test.ts
   src/foo.spec.ts
   src/__tests__/foo.test.ts
   tests/src/foo.test.ts
   ```

   如果候选改动包含生产代码，审查会返回 severity 为 `critical` 的 finding。

2. `indirect-test`

   对 service、repository、api、React component 等目标，测试应通过公开行为验证结果。测试导入 `internal` 或 `private` 实现细节时，审查会返回 critical finding。

3. `browser-interaction` 和 `browser-visual`

   前端目标可以调用 `omp_test_browser_check` 采集浏览器证据，再把证据传给 `omp_test_gate`。审查会分类用户交互失败、console error、pageerror、network failure 和 visual diff。

   浏览器产物只能写入项目真实路径下的 `.omp/testing-enhancer-artifacts`；路径穿越和符号链接逃逸会被拒绝。可选的 `serverCommand` 只接受 `npm`、`pnpm`、`yarn` 或 `bun` 的 `start`、`dev`、`serve`、`preview` 脚本。其他命令应由宿主在受保护的普通工具调用中显式启动。

`omp_test_coverage_analyze` 和 `omp_test_mutation_context` 只提供建议。它们把未覆盖行、未覆盖分支、未覆盖函数和 survived mutants 转成补测线索，由 agent 按当前任务决定是否补测试，再交给 `omp_test_gate` 汇总。

4. `test-command`

   先通过宿主 shell 工具显式运行测试。插件从成功的 `tool_result` 记录 route-scoped 命令摘要和退出码；`omp_test_gate` 只消费这份证据，不会执行 `testCommand` 参数或 `.omp/testing-enhancer.yml` 里的 `test.command`。

   `test.command` 是期望命令提示。传给 review 的 `testCommand` 与配置命令会和宿主观察到的命令摘要比较；不一致、失败、旧 route 或没有观察证据时返回 critical finding 或 warning，具体严重级别由配置决定。命令原文和输出不会写入持久状态。

如果前两个静态检查已经发现问题，插件仍不会产生任何隐藏命令执行。

## 会话生命周期

插件只记录 route-scoped 测试证据和 `idle`、`collecting`、`ready`、`findings` review 状态。Core schema v2 存在时，插件从 `routeStartedAt` 和 `lastRoute` 派生诊断 identity；独立运行时使用本地 analysis run identity。状态不包含执行控制或恢复预算。

## 功能概览

这个版本把剩余的 TS/JS 测试生成反馈接入了工作流。

- `omp_test_context` 现在会为纯函数、parser、formatter、validator 返回 `propertyPlan`，指导 agent 补不变量和边界测试。
- `omp_test_context` 现在会为 API 目标返回 `apiPlan`，指导 agent 补状态码、响应体、契约字段和错误分支测试。
- 新增 `omp_test_coverage_analyze`，读取 coverage JSON，提取未覆盖 statement、branch 和 function。
- 新增 `omp_test_mutation_context`，读取 mutation JSON，提取 survived mutants 和补测建议。
- API 目标会自动查找 OpenAPI、Swagger、MSW handlers、Pact 和 contract 测试线索。
- `/test` 和 `/omp-testing-enhancer:test` 的流程说明已经更新为七个工具。

## 故障排查

如果是 marketplace 安装，先确认 `/omp-testing-enhancer:test` 能显示流程说明，或者工具列表里能看到 `omp_test_analyze`、`omp_test_context`、`omp_test_browser_check`、`omp_test_coverage_analyze`、`omp_test_mutation_context`、`omp_test_gate`、`omp_test_report`。

如果是本地开发安装，输入 `/test` 后没有看到 agent 开始补测试，先确认插件已经加载：

```text
/test help
```

如果帮助能显示，但 `/test` 没有继续执行测试工作流，请更新到最新版本。新版本会等待当前回合空闲后直接发送测试引导。

如果 `omp_test_gate` 报告 `test-command` finding，可以先通过宿主 shell 工具直接运行配置里的测试命令。例如：

```bash
bunx vitest run
```

如果直接运行能通过，但 review 仍报告 finding，请确认运行命令和配置完全一致，并且测试结果与 `omp_test_gate` 属于同一条当前 route。review 不会回退到 Node.js 子进程执行命令，也不会触发自动重试。
## 开发

运行测试：

```bash
bun run test
```

类型检查：

```bash
bun run typecheck
```

构建：

```bash
bun run build
```

检查 npm 包内容：

```bash
npm pack --dry-run
```
