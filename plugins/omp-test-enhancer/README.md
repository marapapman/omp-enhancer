# OMP Testing Enhancer

OMP Testing Enhancer 是一个 OMP plugin，用来帮助 agent 写测试、检查测试是否只改测试文件、阻止测试依赖内部实现，并生成测试报告。前端目标可以使用 `omp_test_browser_check` 采集浏览器交互、console、pageerror、network 和视觉证据。纯函数和 API 目标会收到 `propertyPlan`、`apiPlan`。已有 coverage 或 mutation 报告时，agent 可以用专门工具读取未覆盖代码和 surviving mutants。

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

然后按这个顺序调用工具：

1. `omp_test_analyze`
2. `omp_test_context`
3. 如果返回 `browserPlan`，调用 `omp_test_browser_check` 采集浏览器证据
4. 如果已有 coverage 报告，调用 `omp_test_coverage_analyze`
5. 如果已有 mutation 报告，调用 `omp_test_mutation_context`
6. 更新或新增测试
7. `omp_test_gate`
8. `omp_test_report`

如果需要再次确认命令和工具说明，也可以重新运行 `/omp-testing-enhancer:test`。

## 本地开发安装

如果你要改插件源码，建议用 `link`。下面的 `/test init`、`/test`、`/test check`、`/test report` 只适用于本地 `omp plugin link .` 或显式 extension 路径加载后的会话。

```bash
git clone git@github.com:marapapman/omp-test-enhancer.git
cd omp-test-enhancer
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

前端或 React 组件目标会收到 `browserPlan`。如果存在 `browserPlan`，调用 `omp_test_browser_check` 执行用户事件、采集浏览器证据，然后再运行门禁。没有 `browserPlan` 时可以跳过浏览器检查。纯函数、parser、formatter、validator 目标会收到 `propertyPlan`。API 目标会收到 `apiPlan`。如果项目已经生成 coverage 或 mutation 报告，调用 `omp_test_coverage_analyze` 或 `omp_test_mutation_context` 把缺口转成补测建议。

只处理指定文件：

```text
/test src/user/UserService.ts
```

写完测试后只跑门禁：

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

## 门禁规则

`omp_test_gate` 会按顺序运行静态门禁、可选浏览器证据门禁和测试命令门禁。

1. `test-file-scope`

   候选改动只能出现在测试文件或测试目录里。比如：

   ```text
   src/foo.test.ts
   src/foo.spec.ts
   src/__tests__/foo.test.ts
   tests/src/foo.test.ts
   ```

   如果候选改动包含生产代码，门禁会返回 blocker。

2. `indirect-test`

   对 service、repository、api、React component 等目标，测试应通过公开行为验证结果。测试导入 `internal` 或 `private` 实现细节时，门禁会返回 blocker。

3. `browser-interaction` 和 `browser-visual`

   前端目标可以调用 `omp_test_browser_check` 采集浏览器证据，再把证据传给 `omp_test_gate`。门禁会分类用户交互失败、console error、pageerror、network failure 和 visual diff。

`omp_test_coverage_analyze` 和 `omp_test_mutation_context` 不直接作为 blocker。它们把未覆盖行、未覆盖分支、未覆盖函数和 survived mutants 转成补测建议，由 agent 据此补测试，再交给 `omp_test_gate` 检查。

4. `test-command`

   如果 `.omp/testing-enhancer.yml` 配了 `test.command`，插件会运行这个命令。命令失败时，门禁会返回 blocker。没有配置测试命令时，插件会返回 warning。

   插件优先使用 OMP 提供的 `ctx.exec` 执行测试命令。如果当前运行环境没有提供 `ctx.exec`，插件会回退到 Node.js 子进程执行。这样在没有扩展执行器的环境里，`test-command` 仍然能真实运行配置的测试命令。

如果前两个静态门禁已经失败，插件不会继续运行测试命令。

## 会话结束提醒

如果已经运行 `/test` 或 `omp_test_analyze`，但还没有运行 `omp_test_gate`，插件会在会话结束前提醒继续检查。

跑完 `omp_test_gate` 后，这个提醒会消失。

## 本次发布 v0.1.3

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

如果 `omp_test_gate` 的 `test-command` 门禁失败，先直接运行配置里的测试命令。例如：

```bash
bunx vitest run
```

如果直接运行能通过，但门禁仍失败，请确认使用的是最新构建。新版本在没有 `ctx.exec` 的环境里会使用 Node.js 子进程执行测试命令。
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
