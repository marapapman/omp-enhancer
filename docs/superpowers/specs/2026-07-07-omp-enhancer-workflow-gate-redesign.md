# OMP Enhancer 工作流和门禁重构方案

日期：2026-07-07
状态：已冻结，待下次执行

## 目标

本方案用于重构 omp-enhancer-core 的路由、route card、门禁恢复、重复检测和调试日志。目标是让 mimo v2.5、DeepSeek V4 Flash 等较小模型先按正确工作流执行，而不是依赖硬门禁反复阻挡。

## 背景

当前问题集中在三类情况。

1. 路由容易被局部关键词带偏。例如“写功能”误进写作，“权限”误进安全审查。
2. 门禁过硬。模型缺少 skill evidence 或 assignment 格式不完全符合要求时，容易被反复阻挡。
3. mimo v2.5 有时会自我重复，重复可能是一句话，也可能是一段文字。需要在重复早期给出短恢复提示，并跳出循环。

用户要求 harness 对用户尽量透明。内部门禁、恢复提示和调试信息默认不应大段出现在用户界面。

## 已冻结决策

### 1. 顶层工作流拆细

不再只分写作、事实检查、代码三类。顶层 route 按真实工作负载细分。

### 2. Route 列表

固定 13 个 route。

```text
agentic.simple
writing.zh
writing.en
writing.latex
writing.markdown
doc.convert.word
factcheck.document
code.dev
code.debug
code.review
omp.plugin
security.review
design.visual
```

说明如下。

- `agentic.simple` 处理简单代理式任务，只用 main 和 advisor。
- `writing.zh`、`writing.en` 处理普通中英文写作。
- `writing.latex`、`writing.markdown` 处理 LaTeX 和 Markdown 写作。
- `doc.convert.word` 处理 LaTeX 或 Markdown 到 Word 的转换。
- `factcheck.document` 处理文档事实检查。
- `code.dev` 处理代码开发和修复。
- `code.debug` 处理诊断和调试。
- `code.review` 处理代码审查。
- `omp.plugin` 处理 OMP 插件、路由、门禁、模型配置和提示词配置。
- `security.review` 只处理明确的安全审查和安全风险。
- `design.visual` 处理视觉、设计和图片相关任务。

### 3. 模型角色

按 OMP 自带角色走，不新增 classifier 角色。

```text
main：mimo v2.5
advisor：DeepSeek V4 Flash
plan：GLM 5.2
review：DeepSeek V4 Pro
task：mimo v2.5
tiny：DeepSeek V4 Flash
classifier：复用 tiny，不单独配置
vision：Kimi K2.7
designer：Kimi K2.7
```

本机配置已经删除独立 classifier 角色和 `modelTags.classifier`。后续代码和文档也不应引导用户创建 classifier 专用角色。

### 4. Hard block 范围

硬阻挡只用于 6 类情况。

```text
外部凭证缺失
不可逆文件操作
发布或部署
真实安全高风险
网络或服务不可访问
用户明确要求审批
```

skill 缺失、subagent evidence 缺失、格式不完全符合要求，不默认 hard block。

### 5. Skill 缺失处理

skill 缺失默认 coach。

```text
缺 skill 不硬挡。
门禁给 main 注入短恢复提示。
只有触发 hard block 范围时才阻挡。
```

### 6. Route card 替代长规则

main 模型只看短 route card。长规则只用于 debug、review、测试和文档，不直接注入 main。

### 7. Classifier 使用范围

classifier 只在模糊任务使用。

```text
默认不用 LLM classifier。
只有确定性路由低置信，或多个 route 冲突时，才调用 tiny 做 classifier。
classifier 只给 route hint，不直接开启门禁。
classifier 结果不能直接生成 skill、subagent 或 gate 格式。
```

### 8. Route card 固定格式

所有 route card 固定 5 段。

```text
WORKFLOW_CARD
Task type: <route>

Do:
1. ...
2. ...
3. ...

Do not:
1. ...
2. ...

Skills:
- ...

Gate:
...
```

测试应断言这 5 段存在。

### 9. 门禁恢复次数

每个 gate 最多两次恢复。

```text
第 1 次：coach，不阻挡，只注入短提示。
第 2 次：recover，阻挡当前动作一次，给出可执行修复动作。
第 3 次：不再重复阻挡，触发 loop breaker，让 agent 换策略或总结当前状态。
```

### 10. mimo 重复检测阈值

采用保守阈值。

```text
同一句话重复 3 次：触发文本 loop warning。
同一段超过 80 字重复 2 次：触发文本 loop warning。
同一工具和同一参数重复 3 次：触发工具 loop breaker。
两个工具来回切换 3 轮：触发 ping-pong loop breaker。
同一 gate reason 出现 3 次：触发 gate loop breaker。
```

### 11. Debug 日志

debug 模式通过环境变量开启。

```text
OMP_DEBUG_GATES=1
```

开启后写 3 个 JSONL 文件。

```text
.omp/logs/routes.jsonl
.omp/logs/gates.jsonl
.omp/logs/loops.jsonl
```

默认不向用户显示这些内部信息。

### 12. 第一批评估集

第一批评估集覆盖三类主要工作流和门禁问题，约 60 个用例。

初始分配如下。

```text
agentic.simple：8 个
writing.zh / writing.en：8 个
writing.latex / writing.markdown：8 个
doc.convert.word：4 个
factcheck.document：8 个
code.dev / code.debug：10 个
omp.plugin：6 个
security.review：4 个
design.visual：4 个
```

### 13. 默认测试和真实模型评估

默认测试只用 fixture 和 fake model。CI 不调用真实模型。

可选评估命令可以调用 mimo、DeepSeek、GLM、Kimi，用于发现真实模型行为问题。

### 14. Fixtures 文件

60 个评估用例使用 JSON fixtures 管理。

建议路径如下。

```text
plugins/omp-enhancer-core/test/fixtures/workload-matrix.json
```

### 15. Fixtures 同时覆盖正例和负例

同一个 JSON fixtures 文件里同时放正例和负例。

示例。

```json
{
  "id": "writing-negative-001",
  "prompt": "写一个登录功能。",
  "expectedRoute": "code.dev",
  "notRoute": ["writing.zh"]
}
```

### 16. 每个评估用例检查完整字段

基础字段固定如下。

```json
{
  "id": "...",
  "prompt": "...",
  "expectedRoute": "...",
  "notRoute": [],
  "expectedSkills": [],
  "expectedGateMode": "...",
  "shouldUseClassifier": false,
  "shouldForkSubagents": false,
  "expectedRouteCardSections": ["Do", "Do not", "Skills", "Gate"],
  "expectedHardBlockReason": null,
  "expectedLoopAction": null,
  "expectedDebugLog": false
}
```

### 17. 门禁恢复提示默认隐藏

门禁恢复提示默认只给 main，不给用户看。

```text
coach：只给 main 隐藏提示，不给用户看。
recover：只给 main 隐藏提示，不给用户看，除非当前动作已经失败并需要解释。
hard block：给用户看一行短原因。
```

### 18. 门禁恢复提示固定格式

coach 和 recover 都使用固定 4 行 RECOVERY。

```text
RECOVERY
Reason: missing_skill_read
Do next: read(skill://search-first)
Do not: repeat the blocked tool call
After: continue the original task
```

### 19. 门禁状态计数

门禁状态按 `gateKey + reasonCode` 记录次数。

示例。

```json
{
  "gateKey": "skill-prework:code.dev",
  "reasonCode": "missing_skill_read",
  "attempt": 1
}
```

触发逻辑如下。

```text
同一个 gateKey + reasonCode 第 1 次：coach。
同一个 gateKey + reasonCode 第 2 次：recover。
同一个 gateKey + reasonCode 第 3 次：loop breaker。
```

### 20. 重复检测类型

重复检测分成三类。

```text
text loop：模型输出文本复读。
tool loop：同一工具或工具组合反复调用。
gate loop：同一个 gate 因同一个原因反复阻挡。
```

### 21. Loop breaker 输出

loop breaker 触发后强制短恢复输出。

```text
LOOP_BREAKER
Reason: repeated_tool_call
Stop: do not call the same tool again
Do next: summarize current state and choose a different next action
Limit: 5 lines
```

规则如下。

```text
不继续执行原动作。
不再调用同一个工具。
已有足够信息时输出最终答案。
信息不足时只说明缺什么。
输出最多 5 行。
```

### 22. Debug 记录完整 prompt

`OMP_DEBUG_GATES=1` 开启时，日志记录完整 prompt。

默认 debug 关闭。

### 23. Debug 不自动脱敏

debug 记录完整 prompt，不自动脱敏。

风险边界如下。

```text
debug 日志可能包含用户内容、文件片段、密钥、token、内部提示词。
只有显式开启 OMP_DEBUG_GATES=1 时才写这些日志。
```

### 24. Debug 日志轮转

debug 日志开启简单轮转。

```text
单个日志文件超过 10 MB 就轮转。
最多保留 10 个历史文件。
不自动删除当天日志。
```

示例。

```text
.omp/logs/gates.jsonl
.omp/logs/gates.1.jsonl
.omp/logs/gates.2.jsonl
```

## 本轮范围

本轮重构只包含以下内容。

```text
1. 新增 agentic.simple route。
2. 细化 13 个 route。
3. classifier 只在模糊任务使用 tiny。
4. 删除 classifier 独立角色相关引导。
5. route card 替代长规则注入 main。
6. skill 缺失默认 coach。
7. hard block 只保留 6 类。
8. gate 恢复使用固定 4 行 RECOVERY。
9. gate attempt 按 gateKey + reasonCode 计数。
10. text/tool/gate 三类 loop breaker。
11. LOOP_BREAKER 固定短格式。
12. debug 三类 JSONL，记录完整 prompt，不脱敏，10 MB 轮转。
13. workload-matrix.json 覆盖约 60 个完整字段用例。
14. 默认 fixture 测试，可选真实模型评估。
```

不纳入本轮。

```text
自动优化 prompt。
自动改 skill 文件。
默认调用真实模型。
复杂 UI 面板。
数据库存储 gate 日志。
把所有旧测试一次性重写。
```

## 下次执行建议

下次开始执行时，先按以下顺序推进。

1. 检查当前工作区是否有旧的半途修改，先整理或回退不属于本方案的变更。
2. 新建 `plugins/omp-enhancer-core/test/fixtures/workload-matrix.json`。
3. 写 workload matrix 读取测试，先只断言 route、skills、classifier 使用、subagent 使用和 gate mode。
4. 实现 route card 生成器。
5. 调整 router，让 `agentic.simple`、写作、事实检查、代码开发、OMP 插件、安全审查和设计 route 按本方案分流。
6. 实现 skill 缺失 coach 和 recover。
7. 实现 gate attempt 计数。
8. 实现 text/tool/gate loop breaker。
9. 实现 debug JSONL 和轮转。
10. 运行针对性测试。
11. 再跑全量测试。

## 验收标准

下次执行完成后，至少需要满足以下条件。

1. 60 个 workload fixtures 全部通过。
2. 缺 skill 不再默认 hard block。
3. hard block 只出现在 6 类范围内。
4. classifier 只在模糊任务使用 tiny。
5. main 收到的是短 route card，不是长规则。
6. 同一个 gate 第 3 次同原因阻挡时触发 loop breaker。
7. mimo 文本复读和工具复读都能被检测。
8. 开启 `OMP_DEBUG_GATES=1` 后写入 routes、gates、loops 三类 JSONL。
9. debug 日志记录完整 prompt，不脱敏，并按 10 MB 轮转。
10. 用户默认看不到大段内部门禁错误。
