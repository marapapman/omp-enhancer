---
name: deepseek-tool-calling
description: Use when a DeepSeek V4 model is preparing a tool call or recovering from a JSON argument or tool-schema validation error.
hide: true
tags: [deepseek, tool-calling, compatibility]
---

# DeepSeek Tool Calling Guide

## 当前工具契约优先

当前会话实际暴露的工具名称、描述和 JSON Schema 是唯一参数契约。本文的字段名、调用形状和示例仅提供兼容性诊断线索，不授权调用工具，也不替代 host/provider 的实时契约。若示例与实际暴露的 schema 冲突，以实际暴露的 schema 优先；不要补猜字段、沿用旧工具名或混合不同 schema 的形状。

## 为什么需要这个 skill

DeepSeek 系列模型（尤其是 Flash 版本）在工具调用时有一些已知的模式差异。与其他模型（如 Claude、GPT）不同，DeepSeek 更容易出现特定的参数格式问题。这个 skill 帮助你在调用工具时避免这些常见错误。

## 工具调用格式规则

### 1. 数组字段（Arrays）

DeepSeek 容易把数组字段写成单个字符串或空对象。正确的格式：

✅ **正确格式 —— JSON 数组**
```json
{
  "paths": ["src/main.ts", "src/utils.ts"]
}
```

❌ **错误格式 —— 单个字符串**
```json
{
  "paths": "src/main.ts"
}
```

❌ **错误格式 —— JSON 字符串**
```json
{
  "paths": "[\"src/main.ts\", \"src/utils.ts\"]"
}
```

❌ **错误格式 —— 空对象**
```json
{
  "paths": {}
}
```

**常见数组字段：**
- `paths` — 文件路径列表（find, search, ast_grep, ast_edit）
- `ops` — AST 编辑操作列表（ast_edit）
- `tasks` — 批量子任务列表（task 的 batch schema）
- `list`, `items` — 原生 todo 的阶段和任务列表
- `args` — 参数列表
- `questions` — 问题列表（ask）
- `cells` — eval 单元的代码列表

### 2. 可选字段（Optional Fields）

DeepSeek 容易把未使用的可选字段传为 `null`。这可能触发 schema 校验错误。

✅ **正确格式 —— 省略不需要的字段**
```json
{
  "path": "src/main.ts"
}
```

❌ **错误格式 —— 传 null**
```json
{
  "path": "src/main.ts",
  "_i": null,
  "query": null,
  "reason": null
}
```

**常见可选字段：**
- `_i` — 工具调用意图描述（大部分工具都有）
- `query` — 搜索查询（lsp, search）
- `reason` — 原因描述（resolve）
- `cwd` — 工作目录（bash）
- `env` — 环境变量（bash）
- `description` — 描述
- `timeout` — 超时秒数（bash）
- `symbol` — LSP 符号名
- `schema` — 子任务输出 schema

### 3. 数值字段（Number Fields）

DeepSeek 偶尔把数字写成字符串。

✅ **正确格式 —— 纯数字**
```json
{
  "limit": 10,
  "timeout": 30
}
```

❌ **错误格式 —— 字符串数字**
```json
{
  "limit": "10",
  "timeout": "30"
}
```

❌ **错误格式 —— 带单位字符串**
```json
{
  "timeout": "30seconds"
}
```

### 4. 顶层参数（Top-level Arguments）

DeepSeek 偶尔把整个参数对象包装成 JSON 字符串。

✅ **正确格式 —— 直接传对象**
```json
{
  "path": "src/main.ts",
  "pattern": "TODO"
}
```

❌ **错误格式 —— 字符串包裹**
```json
"{\"path\": \"src/main.ts\", \"pattern\": \"TODO\"}"
```

### 5. Enum 字段

传递枚举值时使用小写，大小写会被自动匹配。

✅ **正确格式**
```json
{
  "action": "apply"
}
```

✅ **会被自动修复**
```json
{
  "action": "APPly"
}
```

### 6. JSON 截断

DeepSeek 在流式生成时可能产生截断的 JSON。如果看到类似以下错误，说明工具调用在流输出中被截断了：

```
Unexpected end of JSON input
```

如果是这种情况，需要等待完整输出再发送工具调用请求，或者使用更短的参数值。

## 历史工具参数速查（非契约）

下表只帮助识别常见类型错误。构造调用前先读取当前暴露的工具说明和 schema；不要仅凭此表决定工具是否存在或参数形状。

| 工具 | 必需字段 | 数组字段 | 数字字段 | 可选字段 |
|---|---|---|---|---|
| `read` | path | - | - | _i |
| `write` | path, content | - | - | _i |
| `edit` | input | - | - | _i |
| `search` | pattern, paths | paths | skip | _i, i, gitignore |
| `find` | paths | paths | limit | _i, hidden |
| `bash` | command | - | timeout | _i, env, cwd, pty |
| `ast_grep` | pat, paths | paths | skip | _i |
| `ast_edit` | ops, paths | ops, paths | - | _i |
| `lsp` | action | - | line | file, symbol, query, timeout |
| `eval` | cells | cells | timeout | - |
| `task` | task（flat）或 context, tasks（batch） | tasks | - | name, agent, isolated |
| `ask` | questions | questions | - | - |
| `resolve` | action, reason | - | - | - |
| `browser` | action | - | timeout | name, url, viewport, code, etc. |
| `todo` | op | list, items | - | task, phase |

## 工具参数格式注意事项

### read 工具
- `path` 必须是字符串，**不要**传数组
- 如果查看文件需要指定行号范围，使用 `path: "file.ts:10-30"` 格式
- 不要将 search 的参数（`paths`, `pattern`）传给 read

### edit 工具
- `input` 必须是字符串（DSL 格式），**不要**传对象
- 锚点格式：`行号+2位hash`（如 `42ab`），不要只写行号
- 必须先 read 获取精确锚点，再构造 edit 调用

### write 工具
- `content` 必须是字符串，**不要**传对象
- 如果是 JSON 内容，直接用多行字符串传递

### browser 工具
- `code` 必须是字符串，**不要**传对象
- `viewport` 必须是对象 `{width, height}`，不要传字符串

### lsp 工具
- `line` 必须是数字，不要传字符串
- `symbol` 可选，不要传 null

### todo 工具
- OMP 17 的原生工具名是 `todo`，不是 `todo_write`
- 每次只传一个操作：`op` 可为 `init`, `start`, `done`, `drop`, `rm`, `append`, `view`
- 对已选择的非简单工作流，委派项保留 canonical 行：`{"op":"init","list":[{"phase":"Delegated work","items":["Delegate Agent=<current-exposed-agent> workflow=<selected-ids> step=<step-id> skills=<loaded-ids-or-none> checkpoint=<complete-one-line-task>"]}]}`
- 完成任务时，`task` 必须逐字复用初始化时的完整任务文本；不存在 `task-1` 一类自动 ID

### task 工具
- 先遵循当前暴露的 schema，不要把 flat 和 batch 形状混用
- 将 TODO 行的 Agent 原样复制到 native task item 的 `agent` 字段，再把 workflow、step、skills 与 checkpoint 复制到 assignment byte 0：`[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]`
- flat 形状：`{"name":"<stable-name>","agent":"<copy-TODO-Agent>","task":"[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]\n# Target\n<bounded target>\n# Constraints\n<direct constraints and allowed effects>\n# Acceptance\n<evidence>"}`
- batch 形状：`{"context":"共享背景，不替代逐项约束","tasks":[{"name":"<stable-name>","agent":"<copy-TODO-Agent>","task":"[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]\n# Target\n<bounded target>\n# Constraints\n<direct constraints and allowed effects>\n# Acceptance\n<evidence>"}]}`
- 每个 task 正文逐字复制全部直接用户约束且不添加约束示例，再携带允许效果与验收证据；outer context、name 或 label 不能替代逐项内容
- `name` 是稳定子进程标识，`agent` 是运行类型，`task` 是完整 assignment；不要使用旧的 `role` 或 `assignment` 字段

## 思考模式 + 工具调用

### reasoning_content 回传规则

DeepSeek 思考模式下，当模型进行了工具调用时，`reasoning_content` **必须**在后续所有轮次中完整回传给 API。否则 API 返回 400 错误。

OMP 的原生 provider/runtime 行为始终优先。`omp-config` 不会自动改写上下文；只有用户显式安装 `hook-templates/pre/opencode-deepseek-cot.ts` 后，该可选模板才会为匹配的模型补全缺失字段。手动构造消息时仍需注意：

✅ **正确 — 保留 reasoning_content**
```json
{
  "role": "assistant",
  "content": null,
  "reasoning_content": "我需要调用工具来...",
  "tool_calls": [...]
}
```

❌ **错误 — 丢失 reasoning_content**
```json
{
  "role": "assistant",
  "content": null,
  "tool_calls": [...]
}
```

### 无工具调用的轮次

如果 assistant 没有进行工具调用，其 `reasoning_content` 不需要回传，API 会自动忽略。

### tool_choice 限制

DeepSeek V4 在启用思考模式时**不支持** `tool_choice` 参数。如果强制指定 `tool_choice`（如 `{type:"function", function:{name:"..."}}`），API 返回 400 错误。OMP 已通过 `supportsToolChoice: false` 配置自动处理。

## 工具返回结果格式

DeepSeek 处理工具返回结果时（OpenAI 格式），`content` 字段必须是**非空字符串**。

✅ **tool result 正确格式**
```json
{
  "role": "tool",
  "tool_call_id": "call_xxx",
  "content": "文件内容或工具输出..."
}
```

❌ **避免空 content**
```json
{
  "role": "tool",
  "tool_call_id": "call_xxx",
  "content": ""
}
```

`omp-config` 不会自动改写工具结果。用户可以在审查后显式安装
`hook-templates/post/opencode-deepseek-tool-result-pipeline.ts` 及其引用的
`lib/` helpers。这个可选模板按固定顺序完成兼容格式化、敏感信息脱敏
和过长文本截断，同时保留非文本 content blocks、`details` 与 `isError`；
纯图片结果不会被替换为空文本。

## 优化栈概述

本插件提供的 DeepSeek V4 兼容材料分 5 层；Skill 是否呈现或加载由 OMP 的原生 Skill 机制决定，配置和行为型 hook 则需要用户显式选择，不能视为 OMP 默认行为：

1. **models.yml 模板** — 可选模型元数据覆盖（reasoning/compat/thinking 等字段）
2. **COT hook template** — 可选 `reasoning_content` 补全
3. **工具修复 hook template** — 可选工具调用参数清洗（JSON 解析、类型转换、字段修正）
4. **工具调用 Skill** — Agent 按需读取的最佳实践（本文档）
5. **结果 pipeline template** — 可选格式化、脱敏和截断流水线

所有行为型模板都位于 `hook-templates/`，不在自动发现的 `hooks/` 目录。
它们仅在 provider 为 `opencode-go` 且模型 ID 为
`deepseek-v4-flash` 或 `deepseek-v4-pro` 时运行。自动发现的 hooks 只做
notify-only 风险提醒，不修改工具参数、上下文或结果。

## 模型版本

- **deepseek-v4-pro**: 1M 上下文，384K 最大输出，默认思考模式
- **deepseek-v4-flash**: 1M 上下文，384K 最大输出，支持思考/非思考模式
- `deepseek-chat` / `deepseek-reasoner` 将于 2026/07/24 弃用

## API 格式选择

- **OpenAI 格式** (`openai-completions`): 完整功能支持，推荐使用
- **Anthropic 格式** (`anthropic-messages`): 通过 `https://api.deepseek.com/anthropic`，不支持 image/document
