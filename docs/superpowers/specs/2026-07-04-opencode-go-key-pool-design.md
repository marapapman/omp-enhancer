# OpenCode Go Key Pool Plugin Design

## 背景

用户希望给 OMP 增加一个新插件，让 `opencode-go` 模型在不改变用户模型名和 provider 配置方式的前提下支持多个 API key。

目标体验如下。

1. 用户仍然使用 `opencode-go/mimo-v2.5`、`opencode-go/deepseek-v4-flash` 这类模型名。
2. 用户不需要配置 `opencode-go-1`、`opencode-go-2` 这类额外 provider。
3. OMP 配置里的主 OpenCode Go API key 继续可用。
4. 插件允许用户额外提供一组 OpenCode Go API key。
5. 发送 `opencode-go` 请求时，插件自动在主 key 和额外 key 之间负载均衡。
6. 某个 key 遇到速率、余额或额度上限时，插件自动规避它，并尽量切换到可用 key。
7. 插件提供 `opencode_go_pool_key` 录入额外 key，用户不需要手写配置文件。
8. 插件提供 `opencode_go_pool_status` 展示 key 健康状态和按实际选中 key 归因的本地观测用量。

插件建议命名为 `omp-opencode-go-pool`。

## 已核查事实

1. 当前仓库是 OMP marketplace 插件 monorepo，插件放在 `plugins/*`，统一目录由 `.omp-plugin/marketplace.json` 管理。
2. `plugins/omp-config/assets/config.yml` 已经把部分默认模型角色指向 `opencode-go/...`。
3. `plugins/omp-config/assets/models.yml` 已经包含 `opencode-go` 的模型覆盖，但没有多 key 调度能力。
4. OMP runtime 的 `registerProvider(name, config)` 支持在插件中注册或覆盖 provider。
5. `registerProvider` 只覆盖 provider transport 时，不会自动改写已有 model 的 `api` 字段。
6. 若要让 `opencode-go` 的模型请求进入插件自定义流式处理器，插件必须让这些模型的 `api` 变成一个自定义 API，例如 `opencode-go-balanced`。
7. 不能把自定义 API 名写进普通 `models.yml`，因为配置 schema 只接受内置 API；这件事应由运行时插件完成。
8. OMP 的 `streamSimple` 对自定义 API 可用，插件可以在里面选择 key，然后转发到 OpenAI-compatible completions 流式实现。
9. OMP auth storage 已经支持同一 provider 多个 stored `api_key` credential，但普通 `models.yml providers.opencode-go.apiKey` 优先级高，会绕过 stored key pool。
10. 当前 `opencode-go` `/usage` 是 OMP 本地观测成本，不是 OpenCode Go 后台全量账单。它基于 OMP 记录的 usage cost history 统计 5h、weekly、monthly 窗口。
11. 不修改 OMP 源码时，插件无法把“本次请求实际选中的 extra key”可靠写回内置 `/usage` 的 credential attribution 链路。

这些事实决定了第一版不能简单要求用户配置多个 provider，也不能只依赖现有 auth storage 自动轮换。

## 设计目标

1. provider 名保持 `opencode-go`。
2. 模型名保持 `opencode-go/<model-id>`。
3. `/model` 里 OpenCode Go 的显示内容保持不变，不出现 balanced、pool、extra key 等字样。
4. 用户通过 `opencode_go_pool_key` 交互式录入额外 API key，不需要手写 JSON 文件或设置环境变量。
5. 主 key 和额外 key 在同一个池里调度。
6. 调度对所有 OpenCode Go 模型生效，而不是只对固定模型生效。
7. 额度、速率和认证错误必须影响后续 key 选择。
8. 安全重试必须只发生在尚未向用户输出可见 assistant delta 前。
9. 用量统计必须由插件按实际选中的 key 归因，并通过 `opencode_go_pool_status` 展示 key pool 合计和 per-key 明细。
10. 插件必须避免打印或持久化明文 API key。
11. 没有额外 key 时，插件退化成单 key 透明代理。

## 非目标

1. 不新增 `opencode-go-1`、`opencode-go-2` provider。
2. 不修改用户已有模型选择习惯。
3. 不把 OpenCode Go 后台外部用量伪装成 OMP 已观测用量。
4. 不在第一版实现跨机器共享调度状态。
5. 不对非 `opencode-go` provider 生效。
6. 不在请求已经输出 assistant 内容后重放同一请求。
7. 不修改 OMP 源码，也不要求内置 `/usage` 精确展示插件私有 key pool 的 per-key 用量。
8. 不新增 usage、doctor、refresh 等命令；用户只需要 `opencode_go_pool_key` 和 `opencode_go_pool_status`。

## 总体架构

```text
plugins/
  omp-opencode-go-pool/
    package.json
    README.md
    index.js
    src/
      config.js
      key-pool.js
      key-command.js
      key-vault.js
      balanced-stream.js
      errors.js
      usage.js
      provider-registration.js
    test/
      config.test.js
      key-pool.test.js
      key-command.test.js
      key-vault.test.js
      errors.test.js
      balanced-stream.test.js
      usage.test.js
      provider-registration.test.js
```

插件入口只做四件事。

1. 加载配置和额外 key。
2. 注册透明接管后的 `opencode-go` provider。
3. 注册 `opencode_go_pool_key`，用于交互式录入和管理额外 key。
4. 注册 `opencode_go_pool_status`，用于展示状态、用量和基本诊断。

核心 provider 注册形态如下。

```js
pi.registerProvider('opencode-go', {
  api: 'opencode-go-balanced',
  streamSimple: createOpenCodeGoBalancedStream(keyPool),
  oauth: openCodeGoOauthCompatibilityStub,
});
```

这里的 provider 名仍然是 `opencode-go`。`api: 'opencode-go-balanced'` 只是运行时内部自定义 API id，用来把请求引到插件的 `streamSimple`。

插件不注册 `models` 或 `fetchDynamicModels`，避免 OMP 的自定义 provider 模型默认值改变 `/model` 表格。会话启动时，`before_agent_start` 读取 OMP 已经选中的原始 OpenCode Go 模型，复制该模型并只把运行时 `api` 改成 `opencode-go-balanced`，再通过 `setModel` 应用于当前会话。这样用户继续选择 `opencode-go/<model-id>`，请求会进入插件调度器，但 `/model` 仍然来自 OMP 内置 OpenCode Go catalog。

模型展示字段必须保持原样。runtime overlay 只允许修改当前会话内部路由所需的 `api` 字段；`id`、`name`、`provider`、模型描述、排序和 provider display name 都要来自原始 OpenCode Go 模型定义。`/model` 不应出现 `opencode-go-balanced`、key pool 状态、usage 状态或额外 provider。

## 配置体验

额外 key 的用户入口是 `opencode_go_pool_key`。用户不需要手写配置文件，也不需要设置 `OPENCODE_GO_EXTRA_API_KEYS`。

推荐交互如下。

```text
/opencode_go_pool_key
→ 选择 Add extra key
→ 输入 label，例如 team-a
→ 输入 OpenCode Go API key
→ 插件校验格式、去重并保存
```

命令不应接受明文 key 作为 inline 参数。下面这种用法必须拒绝，并提示用户重新运行无参数命令。

```text
/opencode_go_pool_key sk-...
```

原因是 inline 参数会进入命令历史、会话记录或日志。正确实现应通过受控输入流程读取 secret，并确保不会把明文 key 写进 session entry、custom message、工具输出或日志。

`opencode_go_pool_key` 可以在同一条命令内支持少量子操作，但不新增额外 slash command。

```text
/opencode_go_pool_key            # 打开交互式添加流程
/opencode_go_pool_key remove     # 选择并删除一个已保存 extra key
/opencode_go_pool_key rename     # 选择并重命名 label
```

移除和重命名都只处理插件额外 key，不修改 OMP 的主 OpenCode Go key。

插件内部通过 `KeyVault` 读取额外 key。

```js
{
  list(): Promise<KeySlot[]>,
  add({ label, apiKey }): Promise<KeySlot>,
  remove({ keyIdOrLabel }): Promise<void>,
  rename({ keyIdOrLabel, label }): Promise<KeySlot>
}
```

`KeyVault` 的持久化是插件内部实现细节。优先使用 OMP/plugin secret storage 或标记为 secret 的 plugin setting；如果运行时没有可写 secret API，使用插件自己的加密本地 vault。无论采用哪种后端，用户界面都必须是命令式录入，而不是要求用户手写配置文件。

不要把额外 key 直接写入 OMP provider `opencode-go` 的普通 `api_key` credential。当前 OMP 通用 auth credential store 对 provider-level `api_key` 是替换语义，不适合作为多 extra key 池的唯一存储。

主 key 来源保持 OMP 现有逻辑。

```text
models.yml provider apiKey
→ OMP auth storage / env / login
→ 插件收到的 resolved primary key
```

插件必须把 key 解析为内部 `KeySlot`，并按明文 secret 的 hash 去重。

```js
{
  id: 'primary' | 'extra:<hash>',
  label: 'primary' | 'team-a',
  secretHash: 'sha256:...',
  source: 'primary' | 'key-vault',
  apiKey: '<memory-only secret>',
  cooldownUntil: 0,
  disabledUntil: 0,
  inFlight: 0,
  lastError: null,
  observedCost: {
    fiveHourUsd: 0,
    weeklyUsd: 0,
    monthlyUsd: 0
  }
}
```

明文 key 只允许存在于请求内存和 KeyVault 的 secret 后端中。日志、状态文件、usage ledger、工具输出只展示 label 和短 hash。

## 模型接管

不能用额外 provider 解决这个需求。正确接管点是同名 provider 注册。

第一版实现优先级如下。

1. 不注册 `models` 或 `fetchDynamicModels`，避免复制或改写 OpenCode Go catalog。
2. 在 `before_agent_start` 中读取 OMP 当前已选中的 OpenCode Go 模型。
3. 复制当前模型并只修改当前会话的 runtime `api` 字段；不要修改 OMP runtime 源码，也不要内置模型列表。

模型 overlay 规则如下。

```js
{
  ...current,
  id: current.id,
  name: current.name,
  provider: 'opencode-go',
  api: 'opencode-go-balanced'
}
```

用户侧模型选择不变。

```text
opencode-go/mimo-v2.5
opencode-go/deepseek-v4-flash
opencode-go/...
```

## 请求调度

调度器输入包括当前请求模型、主 key、额外 key、key 健康状态、最近本地观测用量和并发数。

候选 key 过滤规则如下。

1. 去掉缺少 secret 的 key。
2. 去掉 `disabledUntil > now` 的 key。
3. 去掉 `cooldownUntil > now` 的 key。
4. 去掉本地观测窗口已经达到硬上限的 key。
5. 对认证失败 key 采用长冷却或禁用，直到用户通过 `opencode_go_pool_key` 移除或重新添加该 key。

第一版选择策略建议用 `power-of-two choices`。

1. 从健康候选中按权重抽两个。
2. 选择 `score` 更低的 key。
3. `score = inFlight * 10 + recentFailures * 5 + usagePressure * 20 - recentSuccesses`。
4. `usagePressure` 取 5h、weekly、monthly 三个窗口中最高使用率。

这样实现简单、抗并发倾斜，也不会因为单个 key 连续成功就长期吃满。

## 错误分类和规避

插件必须把失败分成三类。

### 可切换错误

这些错误应标记当前 key 冷却，并在没有输出可见 assistant delta 前切换到另一个 key。

1. HTTP 429。
2. `rate_limit`、`rate limit`、`too many requests`。
3. `usage limit`、`quota`、`insufficient_quota`。
4. `all accounts exhausted`。
5. 带 `retry-after` 的上限错误。

冷却时间优先级如下。

```text
Retry-After header
→ 错误体里的 reset 时间
→ 插件配置的 rateLimitMs
→ 默认 5 分钟
```

### 认证错误

HTTP 401 和大部分 HTTP 403 不应快速重试同一个 key。插件应把 key 标记为 `disabledUntil`，并在诊断中提示用户刷新或移除 key。

### 短暂服务错误

HTTP 5xx、连接重置、超时可以短冷却并切换 key。默认短冷却 30 秒。

## 安全重试边界

流式输出有一个重要边界：一旦向用户输出了 assistant 内容，就不能自动换 key 重放同一请求，否则可能生成重复或矛盾内容。

插件流式处理器应维护 `startedVisibleOutput`。

```text
请求开始
→ 选择 key
→ 调用 OpenAI-compatible stream
→ 如果错误发生在 visible output 前，分类并尝试下一个 key
→ 如果错误发生在 visible output 后，记录 key 状态并把错误交给 OMP
```

如果所有 key 都不可用，返回明确错误。

```text
OpenCode Go key pool exhausted.
3 keys checked: primary cooldown until 14:05, team-a disabled, team-b cooldown until 14:02.
Earliest retry: 14:02.
```

## 插件自维护用量和 `opencode_go_pool_status`

不修改 OMP 源码时，内置 `/usage` 不能可靠知道插件自定义 stream handler 实际选择了哪个 extra key。因此第一版把精确 per-key 用量放到插件自己的 `opencode_go_pool_status` 里。

目标展示形态如下。

```text
OpenCode Go key pool status
  source: OMP-observed plugin request costs
  window: 5h
  total: $4.20 / $36.00 weekly / $48.00 monthly

  key        state      req  fail  5h cost  weekly  monthly  in-flight  cooldown
  primary    healthy     18     0   $1.10    $8.20   $12.30          0  -
  team-a     cooldown    31     2   $2.40   $20.10   $24.90          0  14:02
  team-b     healthy      9     1   $0.70    $7.70   $10.80          1  -
```

`opencode_go_pool_status` 是唯一查看入口，应同时支持正常文本输出和可选 JSON 输出。参数建议如下。

```js
{
  window: '5h' | 'weekly' | 'monthly' | 'all',
  json: false,
  includeFailures: true,
  verbose: false
}
```

插件 stream handler 本来就知道本次请求选择了哪个 `KeySlot`，所以它可以在同一层直接记账，不需要 OMP runtime 传回 credential metadata。

成功请求记录如下。

```js
{
  id: 'req_...',
  provider: 'opencode-go',
  keyId: 'extra:abc123',
  label: 'team-a',
  secretHash: 'sha256:...',
  model: 'mimo-v2.5',
  startedAt: 1783130400000,
  finishedAt: 1783130412000,
  status: 'success',
  inputTokens: 1200,
  outputTokens: 800,
  totalTokens: 2000,
  costUsd: 0.12
}
```

失败请求记录如下。

```js
{
  id: 'req_...',
  provider: 'opencode-go',
  keyId: 'extra:abc123',
  label: 'team-a',
  secretHash: 'sha256:...',
  model: 'mimo-v2.5',
  startedAt: 1783130400000,
  finishedAt: 1783130401000,
  status: 'rate_limit',
  errorKind: 'rate_limit',
  retryAfterMs: 300000,
  costUsd: 0
}
```

记录规则如下。

1. 成功请求如果最终流式事件包含 `usage.cost.total`，记录真实 `costUsd`。
2. 成功请求如果只有 token usage，记录 token 数；`costUsd` 保持 `null`，避免伪造金额。
3. 可见输出前失败并切到另一个 key 时，每次失败 attempt 都记录一条失败记录，最终成功 key 记录成功成本。
4. 可见输出后失败不重放，记录失败 key、已有 token/cost 信息和错误种类。
5. 所有 key 都不可用时，记录一次 pool-level exhausted 事件，但不计入任何 key 成本。

插件用量文件建议使用 append-only JSONL，便于追加和后续压缩。

```text
~/.omp/agent/state/opencode-go-pool-usage.jsonl
```

聚合窗口沿用 OpenCode Go 当前本地观测窗口。

1. 5h：最近 5 小时。
2. weekly：最近 7 天。
3. monthly：最近 30 天。

`opencode_go_pool_status` 的用量合计只代表插件观察到并记录的请求，不代表 OpenCode Go 后台所有外部消费。它应在输出里明确标注 `OMP-observed plugin request costs`。

## 内置 `/usage` 的取舍

第一版不改 OMP 源码，因此不承诺内置 `/usage` 展示插件 key pool 的精确 per-key 用量。

内置 `/usage` 仍可能显示 OMP 自己能识别的 `opencode-go` 本地观测用量，但它不能替代 `opencode_go_pool_status` 里的 key pool 用量，原因如下。

1. 插件选择 extra key 发生在自定义 stream handler 内部。
2. 当前 OMP 的 `recordUsageCost` 没有公开参数让插件指定本次请求的 selected key。
3. 当前 OMP 的 usage provider 根据 auth storage credential history 统计，而插件私有配置或 env key 不一定存在于 auth storage。

后续如果 OMP runtime 增加 credential attribution 扩展点，可以把插件 ledger 同步进内置 `/usage`。这不是第一版目标。

## 诊断和命令

用户不需要用命令才能触发路由，但需要用命令录入额外 key 和查看状态。

用户可见 slash command 只保留两条。

1. `opencode_go_pool_key`：交互式添加、移除或重命名额外 key；不接受 inline 明文 key。
2. `opencode_go_pool_status`：展示 key 数量、健康状态、冷却时间、并发数、最近错误、usage ledger 可写性、key pool 合计用量和 per-key 用量。

不要新增 `opencode_go_pool_usage`、`opencode_go_pool_doctor`、`opencode_go_pool_refresh` 等 slash command。若实现内部函数或测试 helper，应保持为模块内部 API，不暴露成用户命令。

## 安全设计

1. 工具输出永远不展示明文 key。
2. 状态文件只保存 hash、label、source、cooldown 和错误摘要。
3. 明文 key 来自插件 KeyVault，只在请求内存中使用。
4. 错误摘要要过滤 `Authorization`、`apiKey`、`sk-` 前缀值。
5. `opencode_go_pool_key` 禁止 inline 明文 key；发现疑似 key 参数时，拒绝保存并提示重新用交互输入。
6. 如果当前 UI 输入无法隐藏字符，命令必须在提示中说明风险，并仍然保证 key 不进入 session entry、custom message、工具输出或日志。

## 状态持久化

插件应持久化非 secret 状态，避免重启后立即打到已知冷却 key。

建议文件。

```text
~/.omp/agent/state/opencode-go-pool.json
```

内容示例。

```json
{
  "version": 1,
  "keys": {
    "api-key:abc123": {
      "label": "team-a",
      "cooldownUntil": "2026-07-04T06:05:00.000Z",
      "disabledUntil": null,
      "lastError": {
        "kind": "rate_limit",
        "status": 429,
        "at": "2026-07-04T06:00:00.000Z"
      }
    }
  }
}
```

多进程并发下第一版可以采用 best-effort 写入。若后续要支持同一机器多个 OMP 会话高并发，需要加文件锁或把状态放进 OMP runtime 的共享 auth/session store。

## 风险审计

### 高风险：secret 输入未必真正隐藏

当前 extension UI 暴露的是通用 `ctx.ui.input(...)`，不一定提供 password/secret 输入模式。即使插件拒绝 inline key，交互输入时仍可能被终端回显或短暂留在 UI 状态里。

缓解要求如下。

1. `opencode_go_pool_key` 不注册成 LLM 可调用 tool，只注册成用户 slash command。
2. 优先使用运行时提供的 masked/secret 输入能力；若没有，必须在 UI 提示中说明当前输入可能可见。
3. 无论 UI 是否隐藏字符，明文 key 都不能写入 session entry、custom message、usage ledger、状态文件、日志或工具输出。
4. 测试必须覆盖 inline key 拒绝、输出脱敏和 key command 不作为 tool 暴露。

### 高风险：KeyVault 后端不明确

`KeyVault` 不能依赖 OMP provider `api_key` credential，因为当前通用 api_key 存储是 provider 级替换语义，不适合作为多 key 池。设计里的 secret storage / secret setting / encrypted local vault 必须在实现前收敛成一个明确后端。

缓解要求如下。

1. 实现前先探测当前 OMP 插件 API 是否有可写 secret storage。
2. 如果只能使用插件本地 vault，文件权限必须 owner-only，metadata 和 secret 必须分离。
3. 如果没有可靠加密密钥来源，第一版宁可标注“本机受权限保护的本地 secret vault”，不要声称强加密。
4. `opencode_go_pool_status` 必须报告 vault backend 和可写性，但不能展示路径中的敏感信息或 secret。

### 高风险：`/model` 显示不变可能被内部 API 泄漏破坏

虽然 overlay 只改 `api` 字段，但如果 `/model` 渲染或调试视图展示 model api，`opencode-go-balanced` 仍可能出现在用户界面，违反透明要求。

缓解要求如下。

1. provider registration 测试必须同时断言模型运行时 api 被改写、可见 model snapshot 未变。
2. 本地 smoke 必须打开 `/model` 或等效 model list，对比安装插件前后的 OpenCode Go provider/model 文本。
3. `opencode-go-balanced` 只允许出现在内部测试、日志 debug 或代码路径中，不允许出现在默认用户输出。

### 中风险：runtime overlay 未执行会导致请求绕过池子

插件不替换 OpenCode Go 的模型列表，所以 `/model` 的可用性不依赖插件。但如果 `before_agent_start` hook 没有执行，或者 `setModel` 被 OMP 拒绝，当前请求会继续走 OMP 原始 OpenCode Go provider，从而绕过 key pool。

缓解要求如下。

1. provider registration 测试必须断言插件不注册 `models` 或 `fetchDynamicModels`。
2. `before_agent_start` 测试必须断言 OpenCode Go 当前模型会被 runtime overlay 到 `opencode-go-balanced`。
3. live smoke 必须通过 usage ledger 或 debug log 证明请求进入了 key pool。

### 中风险：流式安全重试边界难判定

OpenAI-compatible stream 里可能包含 reasoning、tool-call、metadata、delta 等不同事件。错误地把可见输出判断为未开始，会导致重复输出；错误地把不可见事件判断为可见，会减少可恢复重试。

缓解要求如下。

1. `balanced-stream` 必须集中定义 `isVisibleAssistantOutput(event)`。
2. 默认保守：不确定是否可见时，视为已可见，不重放。
3. 测试要覆盖纯 metadata、reasoning、assistant text delta、tool-call delta、可见输出后错误。

### 中风险：usage ledger 并发写入可能丢失或损坏

多个 OMP 会话同时使用同一个插件时，append-only JSONL 可能出现交错写、部分写或重复写。

缓解要求如下。

1. 写入使用原子 append，并在读取时跳过损坏行、保留 warning。
2. 每条记录带 request id、attempt id 和 key id，用于去重。
3. status 输出要能显示 ledger warning，避免用户误以为用量完整。

### 中风险：用量金额不一定完整

只有当流式结果提供 `usage.cost.total` 时，插件才能记录真实成本。若只提供 token usage，金额必须保持 `null`，否则会产生错误账单感。

缓解要求如下。

1. status 中分开显示 known cost 和 unknown cost requests。
2. 不用静态单价估算 OpenCode Go 消费，除非用户显式开启估算模式。
3. 文档明确 `opencode_go_pool_status` 是插件观测值，不是 OpenCode Go 后台账单。

### 中风险：命令数量口径要保持稳定

当前设计允许两条用户命令：`opencode_go_pool_key` 和 `opencode_go_pool_status`。不要再引入独立 usage、doctor、refresh 命令，否则会回到过度暴露的命令面。

缓解要求如下。

1. key 管理只放在 `opencode_go_pool_key` 的子操作中。
2. 诊断、usage、模型 overlay 健康只放在 `opencode_go_pool_status` 中。
3. command registry 测试断言用户命令集合只有这两条。

## 测试策略

单元测试覆盖以下行为。

1. `opencode_go_pool_key` 无参数时触发交互式添加流程。
2. `opencode_go_pool_key` 遇到疑似 inline key 参数时拒绝保存。
3. `KeyVault` 按 hash 去重，状态和输出只保存 label、hash 和 source。
4. 主 key 和额外 key 去重。
5. 健康 key 选择不会选到冷却或禁用 key。
6. `power-of-two choices` 在并发升高时偏向低负载 key。
7. HTTP 429、quota、`all accounts exhausted` 被分类为可切换错误。
8. HTTP 401 和 403 被分类为认证错误。
9. `Retry-After` 优先于默认冷却时间。
10. 可见输出前失败会 retry 下一个 key。
11. 可见输出后失败不会 replay。
12. 成功请求会把 cost 记到实际选中的 key。
13. 失败 attempt 会被记录，但不会计入成功成本。
14. `opencode_go_pool_status` 能聚合 5h、weekly、monthly 窗口。
15. `opencode_go_pool_status` 不泄露明文 key。
16. `/model` 输出中的 OpenCode Go provider 和 model 显示内容保持不变。

集成测试覆盖以下行为。

1. fake OMP `registerProvider` 收到 provider 名 `opencode-go`。
2. 动态模型返回的 provider 仍是 `opencode-go`。
3. 动态模型返回的 api 是 `opencode-go-balanced`。
4. fake stream 第一个 key 429、第二个 key 成功时，最终成功且记录第一个 key 冷却。
5. `opencode_go_pool_status` 中第一个 key 有失败 attempt，第二个 key 有成功 cost。
6. fake `/model` 或 model list snapshot 不出现 `opencode-go-balanced`、pool 或 extra key 状态。
7. fake command registry 只包含 `opencode_go_pool_key` 和 `opencode_go_pool_status` 两个用户命令。

## 发布和兼容

marketplace entry 建议如下。

```json
{
  "name": "omp-opencode-go-pool",
  "description": "Transparent OpenCode Go API key pool, rate-limit avoidance, and plugin-owned per-key usage reporting for OMP.",
  "version": "0.1.0",
  "category": "development",
  "homepage": "https://github.com/marapapman/omp-enhancer/tree/main/plugins/omp-opencode-go-pool",
  "repository": "https://github.com/marapapman/omp-enhancer",
  "source": "./omp-opencode-go-pool"
}
```

兼容策略如下。

1. 内置 `/usage` 不展示插件私有 key pool 的精确 per-key 用量；用户用 `opencode_go_pool_status` 查看插件归因后的用量。
2. 若 runtime overlay 未执行，原 provider 仍可用，不应让所有 `opencode-go` 模型消失。
3. 若用户未配置额外 key，插件以单 key 代理模式工作。
4. 若用户配置了无效 extra key，插件禁用该 key，不影响主 key。

## 验收标准

1. 安装插件后，用户仍能用 `opencode-go/mimo-v2.5` 发请求。
2. 用户不需要新增任何 provider。
3. `/model` 里的 OpenCode Go 显示内容不变，不出现额外 provider 或 balanced 字样。
4. 至少两个 key 时，请求能分散到不同 key。
5. 一个 key 返回 429 时，后续请求避开它。
6. 一个 key 返回 `all accounts exhausted` 时，本次请求在安全边界内切到另一个 key。
7. 所有 key 都不可用时，错误信息列出脱敏 key 状态和最早重试时间。
8. 只暴露 `opencode_go_pool_key` 和 `opencode_go_pool_status` 两条用户命令。
9. `opencode_go_pool_key` 能添加 extra key，且拒绝 inline 明文 key。
10. `opencode_go_pool_status` 展示 key pool 状态、合计用量和 per-key 本地观测用量。
11. 日志、工具输出、状态文件不包含明文 API key。
12. marketplace checker 和插件测试通过。
