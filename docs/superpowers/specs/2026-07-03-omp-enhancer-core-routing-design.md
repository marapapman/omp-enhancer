# omp-enhancer 统一基座设计

## 背景

当前 monorepo 有三个插件。

- `omp-config` 提供配置资产、agents、skills、hooks、模板和只读诊断。
- `writing-helper` 提供 `writing_logic_check`、`writing_quality_check`、写作 agents 和写作 skills。
- `omp-testing-enhancer` 提供测试分析、测试上下文、浏览器证据、coverage、mutation、测试门禁和报告。

用户现在要求把项目重构成统一插件基座。基座负责识别用户任务，自动路由到编码、写作、测试三类能力，不依赖 slash command。编码采用轻量 TDD。写作沿用现有写作流程。测试走高强度测试流程。基座必须促进正确使用 subagent 和 skill。

## 已核查事实

1. `plugins/omp-config/index.js` 是轻量插件入口，注册工具和可选命令。
2. `plugins/omp-config/src/plugin-root.js`、`src/asset-index.js`、`test/config-diagnostics.test.js` 适合作为统一基座的 root 解析、资产枚举和 fake pi 测试样板。
3. `plugins/writing-helper/index.js` 只注册写作 QA 工具和命令，没有自动路由、agent prompt 注入或 `SKILL_USAGE` 校验。
4. `plugins/writing-helper/agents/*.md` 已经要求治理片段提供 required skills，但当前插件没有提供这个片段。
5. `plugins/omp-test-enhancer/src/extension.ts` 已经有 `session_start`、`tool_result`、`session_stop` hook，并能在测试 gate 未完成时继续会话。
6. `/tmp/frugal-pi/extensions/agent-fleet` 提供可迁移的治理模型，包括 `before_agent_start` 注入、skill profile 选择、`SKILL_USAGE` 解析和 compliance gate。

## 设计目标

1. 新增统一运行时基座，负责任务识别、prompt 注入、agent 路由、skill 选择、gate 管理。
2. 基座下挂三个能力模块，分别是 coding、writing、testing。
3. 任务入口是自然语言识别，不依赖 slash command。
4. 写作任务必须加载写作 skill，并经过写作审查或质量工具。
5. 中文写作必须加载 `plain-chinese-writing`。
6. 编码任务必须走轻量 TDD 和 review 约束。
7. 测试任务必须走 `omp_test_*` 工具链和 `omp_test_gate`。
8. 保留现有公开工具名，避免破坏已有用户。
9. 旧 slash command 可以保留为兼容入口，但不是主流程。
10. marketplace 仍可安装原来的三个插件，同时新增 core 插件。

## 非目标

1. 不自动覆盖 `~/.omp`。
2. 不删除现有写作和测试工具。
3. 不把 coverage 或 mutation 分析改成硬门禁。它们仍是补测建议来源。
4. 不假设未在仓库中出现的 OMP API。
5. 不把模型强制行为伪装成绝对保证。基座通过 prompt 注入、session gate 和校验尽量让不合规流程继续修复。

## 总体结构

```text
plugins/
  omp-enhancer-core/
    package.json
    index.js
    src/
      core/
        extension.js
        module-registry.js
        task-router.js
        governance-prompt.js
        skill-profiles.js
        skill-usage.js
        compliance-gate.js
        session-state.js
        results.js
      modules/
        coding/
          index.js
          prompts.js
          gates.js
        writing/
          index.js
          prompts.js
          gates.js
        testing/
          index.js
          prompts.js
          gates.js
    test/
      router.test.js
      governance.test.js
      compliance.test.js
      extension.test.js
  omp-config/
  writing-helper/
  omp-test-enhancer/
```

`omp-enhancer-core` 是新基座。三个旧插件继续存在。第一版先让 core 注册治理 hook 和 core 工具，不强制旧插件 import core。这样可以降低打包和循环依赖风险。后续可以逐步把旧插件改成兼容壳。

## 基座职责

基座只负责治理，不直接实现写作 QA 或测试 gate。

1. 注册 OMP extension。
2. 在 `before_agent_start` 里注入路由治理片段。
3. 根据用户输入识别任务类型。
4. 为任务选择 agent、skill、tools 和 gates。
5. 记录工具调用证据。
6. 在 `session_stop` 时检查必要 gate 是否完成。
7. 暴露 `omp_enhancer_route` 和 `omp_enhancer_status` 工具，便于测试和调试。

## 任务识别

`task-router.js` 输出统一对象。

```js
{
  kind: 'coding' | 'writing' | 'testing' | 'mixed' | 'config' | 'unknown',
  language: 'zh' | 'en' | 'auto',
  orderedModules: ['coding', 'testing'],
  requiredAgents: ['plan', 'task', 'reviewer'],
  requiredSkills: ['tdd'],
  requiredTools: ['omp_test_gate'],
  gates: ['skill-usage', 'test-gate']
}
```

写作识别关键词包括 write、draft、revise、polish、paper、report、manuscript、abstract、introduction、related work、写、改写、润色、论文、报告、文档、摘要、引言、相关工作、审稿。

测试识别关键词包括 test、coverage、mutation、browser、e2e、playwright、regression、测试、覆盖率、变异测试、浏览器测试、回归测试、门禁。

编码识别关键词包括 implement、refactor、fix、bug、build、modify、code、API、component、实现、重构、修复、报错、接口、组件、代码。

混合任务按顺序执行。实现并测试走 coding 后 testing。重构整个项目并测试走 coding 后 testing。写论文并检查走 writing。写测试走 testing。

## 编码模块

编码模块采用轻量 TDD。

默认流程如下。

```text
识别 coding
→ 多文件或架构任务先使用 plan agent
→ task agent 按轻量 TDD 修改
→ reviewer agent 审查
→ testing 模块补强验证
```

必选规则如下。

1. 行为变更必须有测试。
2. bugfix 必须先定位原因。
3. 交付前必须有测试命令或明确豁免。
4. 多文件改动必须有 reviewer 约束。
5. coding 任务不应走 writer agent。

## 写作模块

写作模块复用 `writing-helper` 的 agents、skills 和工具。

英文写作流程如下。

```text
writer
→ checker
→ writing_quality_check
→ 必要时 writing-review 或 format-humanizer
```

中文写作流程如下。

```text
zh-writer
→ zh-checker
→ writing_quality_check 或 zh-writing-logic-check
→ 必要时 zh-writing-review、zh-writing-polish、zh-format-humanizer
```

必选规则如下。

1. 中文输出必须加载 `plain-chinese-writing`。
2. writer 必须加载一个写作模式 skill。
3. checker 必须加载 checker skill。
4. 写作任务最终必须有 `SKILL_USAGE`。
5. 写作任务必须经过 checker 或质量工具。
6. `writing_logic_check` 和 `writing_quality_check` 是确定性 QA 工具，不替代写作 skill。

## 测试模块

测试模块复用 `omp-test-enhancer` 的工具链。

标准流程如下。

```text
omp_test_analyze
→ omp_test_context
→ 有 browserPlan 时 omp_test_browser_check
→ 有 coverage 报告时 omp_test_coverage_analyze
→ 有 mutation 报告时 omp_test_mutation_context
→ 修改测试
→ omp_test_gate
→ omp_test_report
```

硬门禁如下。

1. `omp_test_gate` 是测试模块硬门禁。
2. `test-file-scope`、`indirect-test`、`test-command` blocker 会阻止完成。
3. `browser-interaction` 和 `browser-visual` blocker 会阻止完成。
4. coverage 和 mutation 只产生补测建议，不直接阻塞。

## Skill 强制机制

基座迁移 frugal-pi 的三段机制。

1. `skill-profiles.js` 根据任务和 agent 选 required skills。
2. `governance-prompt.js` 把 required skills 写进 Mandatory Skill Workflow。
3. `skill-usage.js` 和 `compliance-gate.js` 校验 `SKILL_USAGE`。

校验规则如下。

1. 缺少 `SKILL_USAGE` 失败。
2. Required 和 Loaded 不一致失败。
3. Loaded 使用占位符失败。
4. Loaded 否认加载 skill 失败。
5. fenced code 中的 `SKILL_USAGE` 不计入。

## Agent 使用机制

基座不自己替模型执行所有 subagent。它通过治理片段强制主 agent 使用正确 subagent，并在输出缺少证据时让会话继续。

默认 agent 路由如下。

| 任务 | 默认 agent 链 |
|---|---|
| 编码 | plan → task → reviewer |
| bugfix | explore 或 task → reviewer → testing |
| 英文写作 | writer → checker |
| 中文写作 | zh-writer → zh-checker |
| 测试 | Tester 或 task → testing tools |
| 配置诊断 | omp_config_doctor 或 omp_config_assets |

## Hook 设计

### before_agent_start

注入当前任务的治理片段。片段包含任务类型、模块顺序、required agents、required skills、required tools、final gates。

### tool_result

记录工具调用证据。第一版只记录 core 工具、`writing_quality_check`、`writing_logic_check`、`omp_test_gate`、`omp_test_report`。

### session_stop

检查会话能否结束。

1. 写作任务缺少质量工具证据时继续。
2. 测试任务缺少 `omp_test_gate` 时继续。
3. coding 或 mixed 任务缺少测试证据时继续。
4. unknown、config 和纯问答不强制测试。

## 文档策略

1. README 改为说明自动路由。
2. 旧 slash command 标为兼容入口。
3. 新流程不要求用户输入 `/test`、`/writing-quality` 或其他命令。
4. 工具名仍保留，便于模型自动调用和用户调试。

## 测试策略

1. router 单元测试覆盖 coding、writing、testing、mixed、config、unknown。
2. governance 测试覆盖 prompt 注入和 required skills。
3. skill usage 测试覆盖缺失、占位、否认、完整通过。
4. extension 测试覆盖 tool 注册、hook 注册、session_stop 继续逻辑。
5. workspace 测试必须继续通过。
6. marketplace checker 必须继续通过。
7. pack 脚本必须能打包所有插件。

## 兼容策略

1. `writing_logic_check` 和 `writing_quality_check` 名称不变。
2. `omp_test_*` 工具名不变。
3. `omp-config` 工具名不变。
4. marketplace 保留旧三个插件，并新增 `omp-enhancer-core`。
5. 旧 command 可以保留，但不作为主入口。
