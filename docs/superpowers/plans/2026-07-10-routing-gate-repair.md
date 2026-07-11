# OMP Enhancer 路由与门禁修复实施计划

日期：2026-07-10
状态：实现与核心工作树验证完成；发布闭环进行中
范围：`omp-enhancer-core` 路由、classifier、completion gate、loop guard，以及 `omp-test-enhancer` 的门禁所有权
实施原则：TDD、兼容迁移、observe-first、分批提交、可独立回滚

实施快照（2026-07-11）：Phase 0 至 Phase 8 的代码与回归测试已完成，Core 全量测试 985/985 通过；根工作区 `npm test` 共 1257 项测试通过。路由、动作门禁、证明边界与发布范围的最终独立复审均为 READY；版本与 catalog/lockfile 同步、远端推送、本机已安装插件升级和真实模型 E2E 作为 Phase 9 顺序执行，最终证据写入独立发布报告。

## 2026-07-10 实施结果

- 路由已统一为受保护约束优先的 `TaskDescriptor -> RoutePlan`，classifier 只做一次单调提示合并；模型可调用的 router/classifier/governance 工具不能替代 `before_agent_start` 的用户授权。
- 完成门禁已统一为 route-scoped GateController v2；一次汇总缺失证据，预算固定为 2 次 repair 加 1 次 terminal-only，关键风险耗尽后明确 blocked，低风险才允许 degraded。
- Core 与 Testing Enhancer 已建立唯一续跑所有权；Testing standalone 仍可独立工作，但只消费宿主实际观察到的测试结果，不执行配置中的命令。
- 测试证据会在失败重跑、源文件写入、重定向、formatter、生成脚本和复合写命令后失效；命令掩码、空套件、全跳过套件和弱 `PASS` 伪证据不能关门禁。
- 普通可逆 connector 与 release 分离，并绑定精确 provider/action/target；缺失或冲突目标只询问一次，多动作请求要求拆分，不允许模型通过试探工具补齐权限。
- release 绑定 prompt、action、result、verifier 四段证据；不可逆操作需要可信、同 route、一次性批准，发布前后目标不一致时 fail closed。
- 用户已显式授权本轮提交、版本升级、发布、本机插件升级和 E2E；这些动作仍保持为行为提交之后的独立 release 步骤，并要求远端与已安装运行时的独立验证。

> 本计划承接 `docs/superpowers/specs/2026-07-07-omp-enhancer-workflow-gate-redesign.md`，但修正其中三个已经被当前实现和对抗测试证明不足的决定：单一 primary route、按单 gate 分别重试、debug 默认记录完整 prompt。其余已经落地且验证有效的 route card、skill coach、低成本 classifier 等设计继续保留。

## 目标

修复以下已确认问题。

1. 只读检查被“优化”“门禁”“测试”等关键词误判成代码实现。
2. 复合请求只能保留一个 route，导致实现、测试、安全审查、润色、发布等阶段丢失。
3. `shouldUseClassifier` 与实际 classifier preflight 使用两套判断，classifier 不能稳定纠错。
4. classifier 可以低置信提升权限，也可以用 `unknown` 降低 release/security 风险。
5. 门禁在 classifier preflight 处过硬，在非空 final、release/security 等关键位置又过软。
6. core 与 Testing Enhancer 都拥有 `session_stop` 续跑权，可能重复或无界续跑。
7. 当前工作树按 gate 加 3 次重试后静默结束，同时删除 loop guard，不能直接发布。
8. gate recovery 没有完整按 route/turn 隔离，旧任务状态可能影响新任务。

最终行为应满足：路由不越权、复合任务不丢阶段、风险只能单调增加、门禁一次汇总、同一失败不重复撞、所有续跑有全任务上限、耗尽后给出明确终态。

## 非目标

- 不删除现有 `omp_core_*`、`omp_test_*`、writing、fact-check、config 公共工具名称。
- 不在本轮重写各插件内部的 QA 或事实核查算法。
- 不依赖真实模型作为确定性单元测试的前置条件；本次发布仍要求在本机升级后完成真实主模型 E2E。
- 不在同一发布中删除 legacy route 字段或旧 loop detector。
- 不顺带处理 marketplace/release 工具的全部历史问题；本次只发布发生行为变更的 `omp-enhancer-core` 补丁版本，Testing Enhancer 作为兼容消费者参与验证但不升版。

## 不可违反的行为不变量

### 路由不变量

1. 用户显式 `不要修改/只检查/read-only/do not modify` 时，不得产生 write、modify、release 能力。
2. 用户显式 `不要执行测试` 时，不得产生 test execution 能力。
3. 用户显式 `不要推送/不要发布` 时，classifier 不得加入 external-write/release phase。
4. 单文件、单函数、单命令默认是 focused，不得自动升级为四子代理全面审计。
5. `modify + verify + release`、`fact-check + polish`、`security fix + tests` 必须保留全部阶段。
6. 中文和英文同义请求必须得到等价的 operation、risk 和 phases。
7. classifier 只能补充信息，不能放宽显式约束、删除规则阶段或降低 protected risk。

### 门禁不变量

1. core 安装时，只有 core 可以决定 `session_stop` 是否返回 `continue:true`。
2. 一次 route 的所有缺失证据同时汇总，不能按 subagent、workflow、skill 串行各自消耗预算。
3. 同一个 failure fingerprint 且没有新证据时，最多要求执行一次相同修复动作。
4. 全任务最多 2 个修复续跑，另加最多 1 个只输出终态、不调用工具的续跑。
5. 非空 final 仍然接受门禁检查，不能因为“有文字”自动放行。
6. 低风险门禁耗尽进入 `degraded`；release/security/不可逆操作耗尽进入 `blocked`。
7. 耗尽时必须输出明确终态和缺失证据，不能静默 `undefined`。
8. LLM classifier/smart gate 在无法证明 Tiny 来源时只能提供 advisory，不能 bypass deterministic protected gate。

## 目标架构

```text
user prompt
  -> protected constraints extractor
  -> deterministic TaskDescriptor
  -> optional classifier hints (only when ambiguous)
  -> monotonic merge
  -> ordered RoutePlan phases
  -> skills/tools/subagents/gate requirements compiler
  -> one GateController
  -> satisfied | repair | degraded | blocked
```

### TaskDescriptor v1

```js
{
  version: 1,
  operation: 'answer' | 'inspect' | 'diagnose' | 'plan'
    | 'create' | 'modify' | 'execute' | 'release',
  domains: [
    'general', 'code', 'tests', 'writing', 'facts',
    'security', 'config', 'visual', 'document', 'plugin'
  ],
  constraints: {
    workspaceWrite: 'forbidden' | 'unspecified' | 'required',
    testExecution: 'forbidden' | 'unspecified' | 'required',
    networkAccess: 'forbidden' | 'unspecified' | 'required',
    externalWrite: 'forbidden' | 'unspecified' | 'required',
    subagents: 'forbidden' | 'unspecified' | 'required'
  },
  capabilities: [
    'fs.read', 'fs.write', 'shell.execute', 'tests.execute',
    'network.read', 'browser', 'subagents', 'external.write', 'credentials'
  ],
  phases: [
    { kind: 'inspect', domain: 'code' },
    { kind: 'modify', domain: 'code' },
    { kind: 'verify', domain: 'tests' },
    { kind: 'review', domain: 'code' },
    { kind: 'release', domain: 'plugin' }
  ],
  risk: {
    level: 'low' | 'medium' | 'high' | 'critical',
    flags: []
  },
  complexity: 'simple' | 'focused' | 'broad',
  language: 'zh' | 'en' | 'mixed' | 'unknown',
  provenance: {
    ruleConfidence: 0,
    reasons: []
  }
}
```

旧的 `intent`、`workflowRoute`、`gateMode` 暂时保留为 TaskDescriptor/RoutePlan 的兼容投影，不再作为第二套真相。

### GateController v2

```js
{
  schemaVersion: 2,
  routeId: '...',
  phase: 'pending' | 'collecting' | 'satisfied' | 'degraded' | 'blocked',
  evidenceRevision: 0,
  budget: {
    repairUsed: 0,
    repairMax: 2,
    terminalUsed: 0,
    terminalMax: 1
  },
  openGates: {},
  failures: {},
  terminalReason: null
}
```

failure fingerprint 只包含稳定、非敏感字段：

```text
routeId + gateKey + reasonCode + sorted missingEvidenceCodes
+ actionKind + normalizedResultCode + evidenceDigest
```

时间戳、完整 prompt、自然语言错误全文、密钥和工具敏感参数不得进入 fingerprint 或默认日志。

## Phase 0：保护当前工作树并冻结兼容基线

**涉及文件：**

- 当前已修改的 `plugins/omp-enhancer-core/index.js`
- 当前已修改的 `plugins/omp-enhancer-core/src/governance.js`
- 当前已删除的 `plugins/omp-enhancer-core/src/loop-guard.js`
- 当前已修改/删除的 core tests
- 新增 `plugins/omp-enhancer-core/test/public-tool-contract.test.js`
- 新增 `plugins/omp-enhancer-core/test/state-migration.test.js`
- 新增 `plugins/omp-enhancer-core/test/fixtures/state-v0.1.74.json`

- [x] 记录当前 dirty diff、Git HEAD、已安装 core 版本和入口哈希；禁止执行 `git reset`、`git checkout --` 或覆盖用户改动。
- [x] 将当前 diff 分成三组理解：bounded retry、loop-guard 删除、测试语义变化；不得把三者作为一个提交发布。
- [x] 从 HEAD 内容基线用 patch 重建 loop detector 和原有回归测试；本阶段只恢复安全保护，不恢复无界自动续跑。
- [x] 为所有 `omp_core_*` 工具冻结名称、参数 schema、必填项和 `{content, details, isError}` 返回契约。
- [x] 保存一个真实 v0.1.74 序列化 state fixture，覆盖 `loopGuard`、pending smart gate、subagent、skill 和 testing evidence。
- [x] 将“3 次空输出后返回 undefined”的现有测试改成 RED：预算耗尽必须进入显式 degraded/blocked 终态。
- [x] 逐文件运行 core tests，定位当前完整 `extension.test.js` 约 91 秒后失败/挂起的具体测试；不得用增大全局 timeout 掩盖。

**验收：**

- 公共工具 contract snapshot 全绿。
- v0.1.74 state 可读取，未知字段被忽略，缺失字段使用安全默认值。
- loop detector 的句子、block、跨 chunk、代码块/evidence 豁免和进展重置测试恢复。
- 当前用户改动仍可追踪，没有被 destructive Git 操作覆盖。

## Phase 1：先写路由安全不变量和对抗矩阵

**新增文件：**

- `plugins/omp-enhancer-core/test/fixtures/routing-adversarial.json`
- `plugins/omp-enhancer-core/test/task-descriptor.test.js`
- `plugins/omp-enhancer-core/test/router-adversarial.test.js`
- `plugins/omp-enhancer-core/test/route-compatibility.test.js`

- [x] 为当前用户原句写 RED：应为 `inspect + code/plugin + code.review + focused + workspaceWrite: forbidden`，不得要求 implementation subagents。
- [x] 覆盖“检查并给出优化建议，不修改”“分析 router.js 是否合理，不改代码”。
- [x] 覆盖“只运行 npm test 并报告”“给测试命令但不要执行”，区分 execute 与 answer。
- [x] 覆盖“修复、测试并推送”“更新 README 并推送”“事实核查并润色”“修安全漏洞、补测试并发布”。
- [x] 为上述 prompts 增加中英文同义变体、否定词前置/后置、文件名/函数名干扰和短提示变体。
- [x] 断言 exact phases、constraints、capabilities、gate requirements、skills 和 subagent 数量；不能只断言“包含 expected”。
- [x] 为所有公开 `routedIntents` 增加 `routeByIntent()` round-trip；canonical route 不得落到 unknown。

**验收：**

- 新测试在当前实现上按预期失败，并且每个失败对应一个已确认设计问题。
- 现有 workload matrix 仍作为兼容基线，不直接改 expected 来迁就当前误路由。

## Phase 2：实现 TaskDescriptor 和兼容 route compiler

**新增文件：**

- `plugins/omp-enhancer-core/src/task-descriptor.js`
- `plugins/omp-enhancer-core/src/route-policy.js`

**修改文件：**

- `plugins/omp-enhancer-core/src/router.js`
- `plugins/omp-enhancer-core/src/workflow-routes.js`
- Phase 1 新增 tests

- [x] 将 router 拆成“收集信号”而不是巨型 `if` 链直接 return route。
- [x] 第一优先级解析显式授权和否定约束，再解析 operation/domain/phase/risk。
- [x] 在 `task-descriptor.js` 中集中做 normalize、去重、稳定排序、权限上限和安全不变量校验。
- [x] 在 `route-policy.js` 中把 descriptor 编译为 skills、tools、subagents、gate requirements 和兼容 route。
- [x] 让 `routeNaturalLanguageTask()` 走 `describe -> compile`；返回结构只新增 `taskDescriptor` 和 `routePlan`。
- [x] 让 `routeByIntent()` 通过 `descriptorFromLegacyIntent()` 进入同一个 compiler。
- [x] 建立唯一 alias map，消除 `factcheck.document/code.dev/code.review/security.review` 列在 routedIntents 中却无法直接路由的问题。
- [x] route card 保持原五段格式，但内容来自 ordered phases，而不是单一 legacy intent。
- [x] 根据 complexity 决定资源：simple/focused 默认 main agent；broad 才自动要求完整 reviewer/subagent 组合。
- [x] 增加 `OMP_ROUTER_V2_MODE=legacy|observe|enforce`，首个发布默认 `observe`；该变量必须有真实读取点和行为测试。

**推荐编译语义：**

- 只读代码检查：`code.review`，无写能力，无默认 implementation subagents。
- 只做 root cause：`code.debug`。
- 创建/修改代码：`code.dev`。
- 单纯运行测试：focused verify phase，不升级全面 bug audit。
- security fix：以 code.dev 为执行主线，叠加 security review/risk/gate。
- facts + writing：先 fact-check，后 writing QA。
- modify + release：保留 implement/verify/review/release 全部阶段。
- docx/LaTeX/design 是 capability，不应抢占 facts、security 或 modify operation。

**验收：**

- Phase 1 对抗矩阵全绿。
- legacy route 关键字段兼容。
- 现有 router/workflow tests 在 legacy/observe 模式全绿。
- observe 记录 v1/v2 intent 与 resource 差异；默认保留 legacy intent，但对确定性 canonical correction 和 descriptor 权限上限使用编译结果，避免已知误路由或资源越权继续进入运行时。

## Phase 3：将 classifier 改成单调、安全的 descriptor hints

**修改文件：**

- `plugins/omp-enhancer-core/src/classifier.js`
- `plugins/omp-enhancer-core/index.js`
- `plugins/omp-enhancer-core/test/classifier.test.js`
- `plugins/omp-enhancer-core/test/classifier-load.test.js`

**新增文件：**

- `plugins/omp-enhancer-core/test/classifier-monotonicity.test.js`

- [x] classifier 新 schema 只允许输出 `operationHint/domains/phaseHints/riskFlags/language/confidence/reason`。
- [x] classifier 不得输出或授予 constraints、capabilities、skills、tools、agents、gates。
- [x] legacy classifier JSON 保留一个小版本兼容，进入同一个 normalize hints 路径。
- [x] 使用唯一的 `descriptor.needsClassifier`；删除 router 与 index 两套歧义判断。
- [x] `risk.level=max(rule,classifier)`；risk flags/domains 用并集；rule phases 不得删除。
- [x] 显式 forbidden 永远优先；classifier 新 phase 不得超过 deterministic capability ceiling。
- [x] 对 unknown fallback 同样应用最小置信度，禁止 `0.01` 直接切换工作流。
- [x] classifier `unknown` 不得删除 release/security/irreversible 风险。
- [x] `omp_core_resolve_classification` 只有 `result.ok === true` 时才清除 preflight；invalid JSON 保留 deterministic fallback，但不得继续硬挡正常工作。
- [x] 每任务 classifier 最多一次；失败后使用 deterministic route，不再次进入 classifier loop。
- [x] 若当前 OMP runtime 无法证明 Tiny 调用来源，classifier 只作 advisory；不得把调用者提交的 JSON 当成授权证明。

**必须通过的安全测试：**

- read-only rule + implementation hint：仍无 write 能力。
- release rule + unknown hint：release phase/risk 保留。
- no-release rule + release hint：hint 被拒绝。
- security rule + writing hint：security risk 保留。
- unknown fallback + confidence 0.01：不接受副作用 route。
- invalid JSON：`ok:false`，preflight 不被伪装成 resolved，也不产生无界重试。

## Phase 4：先实现纯 GateController 和 state migration

**新增文件：**

- `plugins/omp-enhancer-core/src/gate-controller.js`
- `plugins/omp-enhancer-core/src/runtime-policy.js`
- `plugins/omp-enhancer-core/test/gate-controller.test.js`

**修改文件：**

- `plugins/omp-enhancer-core/src/gate-recovery.js`
- `plugins/omp-enhancer-core/test/gate-recovery-redesign.test.js`
- `plugins/omp-enhancer-core/test/state-migration.test.js`

- [x] 先用 pure tests 固定 GateController v2 状态转换。
- [x] 一次输入全部 open gates，一次返回完整 missing evidence codes，不按 gate 逐个续跑。
- [x] 用 `routeId + gateKey + reasonCode + missing codes + action + result + evidenceDigest` 生成稳定 fingerprint。
- [x] 同 fingerprint 且 evidenceDigest 不变时，第二次直接选择不同动作或终态，不再要求重复工具。
- [x] 全 route 共用 `repairMax=2`；stream、classifier、smart gate、completion gate 不得各自拥有独立自动续跑预算。
- [x] 预工作 skill/subagent 元数据只 coach，不消耗 completion budget。
- [x] soft gate 耗尽为 degraded；protected gate 耗尽为 blocked；终态最多一次只读输出续跑。
- [x] 新 route/user turn 重置 controller、gateRecovery、failure fingerprints 和过期 evidence。
- [x] 成功证据到达时递增 evidenceRevision，并关闭对应 gate。
- [x] 引入 `schemaVersion` 和逐版本 migration；旧 `gateRetryCount` 截断到新全局预算，旧 pending smart gate 和 loop state 安全迁移。
- [x] 添加真实读取的运行模式：`OMP_GATE_RECOVERY_MODE=legacy|observe|enforce`；首个发布默认 `observe`。
- [x] `legacy/observe/enforce` 只决定采用哪套 route/gate 语义；所有模式都必须经过同一个全局 continuation circuit breaker，不能用 legacy 模式恢复无界续跑。

**门禁风险策略：**

| 门禁 | 修复策略 | 预算耗尽 |
|---|---|---|
| skill/subagent 元数据 | 0 到 1 次 coach | degraded |
| writing QA | 最多 1 次 repair | degraded，并声明未完成 QA |
| code/test verification | 使用全局预算 | degraded，禁止声称测试通过 |
| fact check | 使用全局预算 | blocked 或明确“未验证” |
| security/release/不可逆操作 | 最多 1 次 repair | blocked，禁止 LLM bypass |
| repeated generation | 最多 1 次不同策略 recovery | terminal loop-breaker |

## Phase 5：接入 core 生命周期并修复 fail-open/fail-loop

**修改文件：**

- `plugins/omp-enhancer-core/index.js`
- `plugins/omp-enhancer-core/src/governance.js`
- `plugins/omp-enhancer-core/src/smart-gate.js`
- `plugins/omp-enhancer-core/test/extension.test.js`
- `plugins/omp-enhancer-core/test/gate-stress.test.js`
- `plugins/omp-enhancer-core/test/smart-gate.test.js`
- `plugins/omp-enhancer-core/test/core-workflow.e2e.test.js`
- `plugins/omp-config/hooks/lib/deepseek-tool-result-format.js`
- `plugins/omp-config/test/deepseek-tool-result-hook.test.js`

- [x] `session_stop` 固定走：采集 final evidence -> 计算全部 open gates -> controller 决策 -> release/repair/terminal。
- [x] 删除只有 `!finalOutput` 才检查门禁的语义；非空 `Done.` 不能自动清 pending gate。
- [x] `buildCompletionRuleGateBlocks()` 的全部结果交给 controller，不再 `.find()` 第一个。
- [x] 删除按 gate 独立 `MAX_GATE_RETRIES=3`；统一使用 route budget。
- [x] 预算耗尽返回明确 terminal context；不得静默 `undefined`。
- [x] `setRouteState()` 同时重置 gateRecovery；成功 evidence 清理对应 failure。
- [x] 失败识别至少覆盖 `status=error|failed|failure|blocked`、`ok:false`、`passed:false`、`isError:true`。
- [x] tool-result formatter 只能压缩展示用 `content`，必须保留原始 `details/isError/status/ok/passed`，避免成功格式化钩子删除 gate 证据。
- [x] 不再仅依赖可能被其他 hook 格式化掉的 `tool_result.details`；优先读取插件版本化 evidence entry。
- [x] classifier preflight 不再冻结所有非 exempt 工具；无法可信分类时继续使用 deterministic constraint ceiling，只在真正产生副作用的工具边界检查 protected constraints。
- [x] 将 release、security、不可逆文件操作和外部写入的 hard block 落到对应 action/tool boundary；用户原请求已明确授权时记录 authorization evidence，但仍需完成相应验证 gate。
- [x] smart gate 仅处理低风险 false positive/等价证据；release/security/irreversible gate 不允许纯 LLM override。
- [x] 若 host 无法提供可信 model/task completion provenance，主模型提交的 pass JSON 只能产生 advisory，不能释放 deterministic gate。
- [x] 若 host 能提供 provenance，再新增 reviewId、routeId、gateInstanceId、promptDigest、producerCallId 和 outputDigest attestation；旧 route 不得重放。

**验收：**

- 空/非空 final 行为一致。
- 三个 open gates 只触发一个合并 recovery。
- 同一失败动作无进展最多执行一次。
- 最多 2 个修复续跑和 1 个 terminal-only 续跑。
- 异步 subagent 仍 running 时不提前声称完成，也不重复 fork。

## Phase 6：让 core 成为唯一 gate owner

**修改文件：**

- `plugins/omp-test-enhancer/src/extension.ts`
- `plugins/omp-test-enhancer/src/session/testingState.ts`
- `plugins/omp-test-enhancer/tests/unit/extensionSession.test.ts`
- `plugins/omp-test-enhancer/tests/unit/session/testingState.test.ts`

**新增文件：**

- `plugins/omp-test-enhancer/tests/e2e/coreGateOwnership.e2e.test.ts`

- [x] core 注册版本化 gate-owner marker；Testing Enhancer 在 `session_stop` 执行时读取，而不是依赖加载顺序。
- [x] 将 owner detection 封装成小接口并先验证真实 OMP 是否共享同一个 `pi` identity；若 wrapper 不同，只在该接口内改用 `Symbol.for(...)` registry。
- [x] Testing Enhancer 写 versioned evidence：routeId、runId、pending/passed/failed、blockers、evidenceDigest、updatedAt。
- [x] core 存在时，Testing Enhancer 的 `session_stop` 永远不返回 `continue:true`，只负责证据。
- [x] core 不存在时保留 standalone owner，但同样使用有界预算，不能无限重复 failed gate。
- [x] 把 Testing Enhancer 的模块级 `currentState/currentPi` 移到注册闭包，防止并发实例串状态。
- [x] 用两种插件注册顺序运行 E2E；每次 stop 最多一个 handler 返回 continuation。
- [x] 旧 testing state 只有在当前 route 已观察到对应 runId/tool event 时才能采用，避免前一任务 PASS 泄漏。

## Phase 7：保留 loop detector，并把续跑权交给 GateController

**修改/恢复文件：**

- `plugins/omp-enhancer-core/src/loop-guard.js`
- `plugins/omp-enhancer-core/test/loop-guard.test.js`
- `plugins/omp-enhancer-core/index.js`
- `plugins/omp-enhancer-core/src/debug-logger.js`

- [x] loop guard 只负责纯检测和 fingerprint，不自行 `sendMessage`，不自行决定续跑。
- [x] core 遇到重复 stream 时 abort 当前重复输出，把 failure 交给统一 controller。
- [x] 相同 fingerprint 且没有 tool/evidence progress 时直接 terminal loop-breaker。
- [x] 保留 sentence/phrase/block/ngram、跨 chunk、Markdown evidence、代码块、表格、工具进展和持久化 parity tests。
- [x] 增加真实读取模式 `OMP_LOOP_GUARD_MODE=legacy|observe|enforce|disabled`；首个发布保留 legacy/observe，不直接删除实现。
- [x] 默认 debug 只记录 route id、gate key、reason code、fingerprint、budget decision 和新旧决策差异。
- [x] 完整 prompt 只有在单独显式设置 `OMP_DEBUG_GATES_UNSAFE_PROMPTS=1` 时记录，并输出一次敏感信息警告。

## Phase 8：observe 灰度、执行模式和文档同步

**本次补丁发布的实际文件范围：**

- `README.md`
- `plugins/omp-enhancer-core/index.js`、`src/`、`test/` 与相关 fixtures
- 本实施计划和发布 E2E 报告
- release commit 中的 `plugins/omp-enhancer-core/package.json`
- `.omp-plugin/marketplace.json`
- `package-lock.json`

`omp-test-enhancer` 与 `omp-config` 只参与兼容性、marketplace 和打包验证，本次不修改也不升版。

- [x] Release A 默认 `router v2=observe`、`gate semantics=observe`：默认保留 legacy intent，但应用确定性 canonical correction，并把 descriptor 权限与资源上限投影到有效 route；同时记录 intent/resource 差异并启用 protected action boundary、protected security/release/irreversible completion gate、统一 gate owner、全局 circuit breaker、状态隔离和显式终态。`legacy` 保留严格兼容回滚；observe 不得保留已知无界续跑。
- [ ] observe 至少统计：route disagreement、gate disagreement、每 route block/release、retry exhaustion、重复 session_stop、state migration error。
- [x] 不记录默认用户正文；使用 prompt hash 和结构化 reasons。
- [x] 用对抗 fixture 检查误路由、过度子代理、continuation 上限和 false release；本次发布在本机升级后执行真实模型 evaluation。
- [ ] 达到灰度门槛后，Release B 将 router/gate 切为 enforce；legacy 模式至少保留一个 patch 作为回滚开关。
- [x] 文档明确 route phases、gate 终态、standalone Testing Enhancer 行为和所有真实生效的环境变量。
- [x] 不发布没有 runtime 读取点的模板配置；恢复次数和 fallback role 已从模板移除。

**建议灰度门槛：**

- adversarial fixture 100% 通过。
- read-only/external-write 风险单调性 100% 通过。
- 新旧 route disagreement 均已人工归类，无未知高风险降级。
- 每任务 continuation P99 不超过 2 个 repair + 1 个 terminal-only。
- core + Testing Enhancer 重复 gate-owner 为 0。
- state migration error 为 0。

## 提交边界

严格显式 staging，不使用 `git add .`。本次将采用以下提交顺序：

1. 原子行为提交 `fix(core): align constrained route evidence`：包含相互依赖的 descriptor、route projection、action boundary、completion evidence、回归测试和对应 README/计划说明。路由与门禁共享同一授权和证据不变量，拆开会产生中间不可发布状态，因此作为一个可整体 revert 的行为修复提交。
2. 独立 release commit `chore(core): release v0.1.83`：只包含 core package、catalog metadata/entry 和 lockfile 版本同步，并创建同名 release tag。
3. 本机升级和真实模型 E2E 完成后，独立文档提交记录发布证据，不回写运行时代码。

版本 bump 不进入行为提交；E2E 报告不进入 release commit。三个边界分别支持行为回滚、版本追踪和证据审计。

## 验证顺序

### 低成本定向测试

```bash
node --test \
  plugins/omp-enhancer-core/test/task-descriptor.test.js \
  plugins/omp-enhancer-core/test/router-adversarial.test.js \
  plugins/omp-enhancer-core/test/route-compatibility.test.js \
  plugins/omp-enhancer-core/test/classifier-monotonicity.test.js

node --test \
  plugins/omp-enhancer-core/test/gate-controller.test.js \
  plugins/omp-enhancer-core/test/gate-recovery-redesign.test.js \
  plugins/omp-enhancer-core/test/loop-guard.test.js \
  plugins/omp-enhancer-core/test/smart-gate.test.js
```

### Core 集成和压力测试

```bash
node --test \
  plugins/omp-enhancer-core/test/router.test.js \
  plugins/omp-enhancer-core/test/router-stress.test.js \
  plugins/omp-enhancer-core/test/workflow-matrix.test.js \
  plugins/omp-enhancer-core/test/workflow-redesign-matrix.test.js \
  plugins/omp-enhancer-core/test/classifier.test.js \
  plugins/omp-enhancer-core/test/classifier-load.test.js \
  plugins/omp-enhancer-core/test/extension.test.js \
  plugins/omp-enhancer-core/test/gate-stress.test.js \
  plugins/omp-enhancer-core/test/core-workflow.e2e.test.js
```

### Testing Enhancer

```bash
npm run typecheck --workspace plugins/omp-test-enhancer
npm test --workspace plugins/omp-test-enhancer
```

### 全仓和发布前验证

```bash
npm test --workspace plugins/omp-enhancer-core
npm test
npm run check:marketplace
npm run pack:all
git diff --check
```

## 本次发布的安装运行时验证

不得只验证 checkout 或当前本地 marketplace。本次补丁发布顺序完成：

1. 将 core 从已安装的 v0.1.82 通过远端 marketplace 升级到 v0.1.83。
2. 检查 plugin list、package、catalog、package-lock 和 installed cache 版本一致。
3. 比较 installed core 的 `index.js` 与 `src/` 和发布 commit 内容，排除 checkout 热加载。
4. 用已安装运行时运行 read-only、focused code change、exact test、writing/fact、security、route/status 诊断，以及 observe 中英文 canonical correction 场景。
5. 核对真实模型是否遵守禁止写入/测试/联网/子代理约束，工具调用是否与 route resources 一致，并确认没有跨方法重复试探。
6. 将 prompt、预期 route、实际 route、工具调用与终态写入发布 E2E 报告。

## 最终验收标准

### 路由

- focused read-only `code.review` 请求不派发 implementation subagents；后续显式“开始实现/继续修复”可以继承可信修改权限。
- 所有显式 no-write/no-test/no-release 约束不可被规则或 classifier 放宽。
- 复合任务 phases 完整、有序、去重。
- 单命令验证不进入 broad bug audit。
- 中英文同义请求 operation/risk/phases 等价。
- 所有公开 intent/canonical alias round-trip 成功。

### Classifier

- 清晰请求不调用 classifier；模糊请求每任务最多一次。
- invalid output 不会伪装成 resolved，也不会造成 preflight loop。
- classifier 不能降低风险、删除阶段、授予副作用或越过 explicit forbidden。
- 无可信 Tiny provenance 时不允许 classifier/smart gate 释放 protected gate。

### 门禁

- 空/非空 final 使用同一决策路径。
- 所有 open gates 一次汇总。
- 相同 failure 无进展时相同动作最多一次。
- 全任务最多 2 个 repair continuation 和 1 个 terminal-only continuation。
- core 与 Testing Enhancer 同时安装时，每次 stop 只有一个 owner。
- route/turn 切换后 retry/recovery/evidence 不泄漏。
- 耗尽后输出明确 degraded/blocked，不静默放行，不虚假声称 PASS。

### 兼容与发布

- v0.1.74 core/testing state 可恢复。
- 公共工具名称、参数和结构化返回保持兼容。
- loop detector 在新 controller 稳定前不删除。
- core/testing 定向、全量、typecheck、marketplace、pack、diff check 全绿。
- 干净远端安装、升级、旧会话恢复和 installed runtime smoke 全绿。

## 回滚策略

- Release A/B 均保留 `legacy` 开关；出现误路由、state migration、loader 或 gate churn 回归时先切回 legacy。
- 保留 v0.1.74 tag 和安装 cache；同时准备可独立 revert 的行为提交。
- 生产回滚优先 revert 行为提交并发布更高 patch，不依赖不可靠的降级安装。
- 回滚后重新执行旧 state 恢复、远端安装和 gate-owner smoke。
- loop guard 的最终删除必须是后续独立设计、独立测试、独立发布，不能混入本次修复。
