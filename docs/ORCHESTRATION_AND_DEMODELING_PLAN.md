# OMP-Enhancer 多智能体动态协作编排 + 去模型绑定 — 实施计划

> **SUPERSEDED**: The orchestration layer was simplified in catalog v31. The protocol coach was removed and the 7-stage protocol was replaced with `ANALYZE -> EXECUTE -> REVIEW`. 本文件是历史规划文档，仅作存档；当前架构与行为以 [ARCHITECTURE.md](ARCHITECTURE.md) 为准。

状态：v2.1（实施进度更新）——工作流 B（去模型绑定）已实现并全树验证（根 npm test 765 绿、check:workflows/marketplace、omp-config pack:dry、writing-helper 100% 覆盖）；工作流 A 确定性部分（W1-A 姿态、W1-B 长篇试点、Wave 2 生成 v23）已实现并验证；Wave 0/Wave 3 的 live E2E 基线待用户授权后补。
日期：2026-07-24
范围：omp-enhancer marketplace monorepo（cwd /home/dingli/omp-enhancer）

> 本计划只读规划，不含实现。所有改造须保持 OMP 原生权威与 advisory 不变量（见 §10）。

## 修订记录（v1 → v2，来自会商）
- 消除三处内部矛盾（§5.1.C/§5.3/§8）：删打包 `models.yml`、剥离 `config.yml` 的 `modelRoles` 块、E2E runner 改用「当前配置只读快照」。
- 通用提醒开关由可选改**必需**（新增 `OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER`）。
- 补漏模型表面：reminder 经 message details 泄漏、`compatibilityReminderTaskStartedAt` 改名 + STATE_SCHEMA_VERSION bump、`package.json`/`marketplace.json` 描述、PKU Skill、孤儿 helper、`self-development-docs.test.js`、`workflow-subagent-default.test.js:187`、AGENTS.md「must remain」逆引入风险（改 grep 验收）。
- B 波次重排：B1 拆 B1-core/B1-labels 顺序片；runner 迁移先于资产删除；B2 跑 `generate:marketplace`；B4 只 `check:workflows`（生成器唯一写入留给 A Wave 2）。
- 试点激活：全满足正向条件 + 负向优先，在 `writing.js:88/149` + `render-skill.js:133-135` 雕刻。
- 准入门：改为「预算内质量不回退」（弃 quality/token 比）；Wave 0 补单代理长篇基线。
- §8 配置快照脱敏为角色名；明确各测试层实际使用的配置；L1 不消费模型配置。
- B→A 理由更正：真实重叠是 `review-budget.js` + 语义依赖（A 不写 index.js），非 index.js 重叠。

---

## 0. 摘要

两个相互协调的工作流：

- **工作流 B（去模型绑定 / 通用化，先行）**：插件不再局限于 `opencode-go/deepseek-v4-flash` 与 `opencode-go/mimo-v2.5`，删除所有模型绑定优化，保留并通用化模型无关内核（分阶段协议引导、协议教练、审查预算），对所有模型生效。
- **工作流 A（多智能体动态协作编排，随后）**：把 `code.dev` 已验证生命周期作为文档元模式，仅对「大型多节写作」做有界、可度量、可回滚的分片并行试点；成本优化落在 OMP 原生 `modelRoles`/Agent 分级 + `review-budget` advisory 姿态。

执行顺序：**B → Wave 0 基线 → A 试点**。

---

## 1. 目标定位

1. **去模型绑定**：面向任意模型，无精确模型门控/标签/Skill/hook-template；`~/.omp/**` 永不触碰。
2. **动态多智能体编排**：复杂任务按需采用「网络调研 → 多智能体会商计划 → 分片并行实现 → 主 agent 审计 → reviewer 审计」，保质量、降 token/成本。
3. **不过度编排**：先单代理，确证需要再加编排；简单任务零编排。
4. **保持 advisory**：无硬 router/gate/完成控制/强制 fork；成本路由仅建议；OMP 权威不可侵犯。

---

## 2. 调研依据（来源见附录 A）

### 2.1 OMP 17.1.0 原生逻辑（本地核验）
- 编排原语：native `task`（`tasks[]` 批量、per-item `model/outputSchema/schemaMode/isolation`、必填顶层 `context`、auto-delivery、isolated worktree）+ hub 同伴 + `skill://` 按需加载。
- 成本舵：`modelRoles`（10 角色 ID，用户自有）、`task.agentModelOverrides`、per-item `model`（优先级：显式 > agentModelOverrides > Agent 默认）、`enableLsp`/递归深度/运行时限/请求预算；compaction 70%/100K。
- 语义 Agent 已分级：writer/scout/librarian → task/smol；checker/plan/reviewer → plan/slow。
- **硬约束**：hooks 不触发 turn/阻断/续跑/硬路由/门禁；插件不派发子代理/建代理/改设置；引导均为提示词层 advisory。

### 2.2 现有机制（本地核验）
- `code.dev`、`research.web/factcheck`、`writing.zh/en`、`slides.generate`、`diagram.svg/tikz` 已多智能体。
- 模型绑定表面：`index.js:343-353` 根门控、`384-401` DEEPSEEK_/MIMO_ 标签、`207-210/356-361` 教练门控、`31-33` 三个 env、`248-251` message details 泄漏、`512-518/783-789/862-869` 持久化命名、`package.json:6`、`marketplace.json:370`、PKU Skill、8 个 deepseek fixtures + `workflow-consolidation-installed.json`、DeepSeek 专属 Skill/hook-templates、多处文档。
- 教练 CUE_CONTENT（`workflow-protocol-coach.js:14-50`）与提醒正文（`index.js:402-453`）**本就模型无关**。

### 2.3 业界模式（网络调研）
orchestrator-worker（省 40–60%）、maker-checker（省 40–60%）、fan-out（墙钟 -75%）、仅缓存系统提示（省 41–80%）、模型路由（省 45–85% 保 95%）、子代理上下文隔离（少 67% token）、CONCAT（>60% 通信可剪枝）、AdaptOrch（拓扑路由 +12–23%）。**反直觉**：token 解释 80% 方差、多智能体 ~15× token、Princeton 单代理 64% 不逊色 → 先单代理。

### 2.4 设计校准（plan 一轮会审）
schema 零新增字段；T0–T7 为文档映射非第二状态机；成本路由拆分职责；视觉域不强加 MAIN REVIEW；不为凑阶段名强加 native reviewer；writer 先行 proposal-only。

---

## 3. 设计原则（全部 advisory）
P1 不增 schema 字段｜P2 成本路由拆分职责（review-budget 姿态 advisory，不提名模型/不改设置）｜P3 域审查角色保留｜P4 视觉域不强加 MAIN REVIEW｜P5 分诊防过度编排（宽度由 Main 按 native maxConcurrency 默认 32 决定）｜P6 上下文隔离用原生交付（writer 不写文件）｜P7 `task.batch` 可禁用→顺序 fallback｜P8 模型无关（无精确门控/标签）。

---

## 4. 五域分阶段策略（不铺开）
| 域 | 处置 | 理由 |
|---|---|---|
| 编码 `code.dev` | 不变，阳性对照 | 已 plan→批量 TDD→MAIN REVIEW→reviewer→修复 |
| 事实审查 | 不变，对照 | 已双 lane→cross-check→reviewer；降级须先有证据基准 |
| 写作 `writing.zh/en` | **唯一试点**（仅显式大型多节新起草） | 逻辑独占写集最安全；普通修订保持单 writer→checker |
| PPT/流程图 | 暂缓 | 已大纲/对账/渲染/视觉审查；源紧耦合 |

---

## 5. 工作流 B：去模型绑定（通用化）

### 5.1 三类处置（file:line 为证）

**A. 通用化（GENERALIZE）**
| 对象 | 证据 | 处置 |
|---|---|---|
| 协议教练 | `workflow-protocol-coach.js:14-50` CUE_CONTENT 通用 | 内容**不改**（保缓存友好）；删 `index.js:207-210,356-361` 模型门控，保留 hostTurnKind==='user'+!isSubagentSession |
| 提醒正文 | `index.js:402-453` 通用 | 保留；删 `343-353` 根门控、`384-401` DEEPSEEK_/MIMO_ 标签、**`248-251` message details 中的模型身份** |
| 持久化状态 | `index.js:512-518,783-789,862-869` `compatibilityReminderTaskStartedAt` | 改名为模型无关字段 + **STATE_SCHEMA_VERSION bump**（`index.js:28`），丢弃模型时代旧状态 |
| 审查预算标签 | `review-budget.js:24,91` `COMPAT_*` | 重命名为模型无关标签，逻辑不动 |
| 编辑锚点 hook | `hooks/pre/opencode-deepseek-edit-anchor.ts:15-32,92-119` 本就无门控 | 仅重命名去 `deepseek` |
| 禁用开关 | `index.js:31-33` | 删两个 per-model；**保留 `OMP_ENHANCER_DISABLE_PROTOCOL_COACH`（教练）+ 新增 `OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER`（提醒，必需）**，分别接入对应分支 |

**B. 删除（DELETE）**
- `omp-config/skills/deepseek-tool-calling/`（同步 `generate:marketplace` 更新 `marketplace.json:28`）
- `hook-templates/pre/opencode-deepseek-cot.ts`、`opencode-deepseek-tool-repair.ts`、`post/opencode-deepseek-tool-result-pipeline.ts`、`lib/model-gate.js`、`lib/deepseek-tool-result-format.js`；**删除随之孤儿的 redaction/truncation helper**（除非另有通用入口）
- 打包 `assets/models.yml`（整体 DeepSeek 专属）；剥离 `assets/config.yml` 的具体 `modelRoles` 块（保留为通用模板）
- 文档「模型绑定为有意为之」表述（含 AGENTS.md「must remain」段，防逆引入）

**C. 不动（DO-NOT-TOUCH）**
- `~/.omp/**` 全部 live 配置（含 live `models.yml`/`config.yml`）
- DeepSeek compat **作为用户可选参考文档**可归档保存，但**不作为打包安装默认/推荐**（解决 §5.3/§8 矛盾）

### 5.2 受影响测试（改写）
`core-workflow.e2e.test.js`（25+，含 soft/advisory/no-gate 断言须逐字保留）、`protocol-coach-runtime.test.js`（内容断言保留、门控断言改写）、`hook-compatibility.test.js`、`config-diagnostics.test.js`（含 `:33-41,201-215` 默认值断言）、`advisory-skills.test.js`、`deepseek-tool-result-hook.test.js`、`pre-hooks.test.js`、`post-hooks.test.js`、`scripts/e2e-installed-workflow.test.js`、`assert-default-main-profile.mjs`（改写为「seeded-default == packaged-default」通用断言）、**`scripts/self-development-docs.test.js`（:57 fixture 名、:165-177 读 DEEPSEEK_PROMPT_OPTIMIZATION.md）**。

### 5.3 E2E 基建去 deepseek
- `run-installed-deepseek-workflow.mjs` → 通用名；**改为复制当前模型选择配置的只读快照/指纹进隔离态**，`--model`/`--thinking` 仅显式手动 override（现状 `:972-991,1117-1128` 总是传）；不再依赖打包默认（`:531-540`）
- fixtures：8 个 `deepseek-*.json` + `workflow-consolidation-installed.json:4` 去硬编码 model
- `summarize-installed-deepseek-workflow.mjs` 改名；`e2e:deepseek:*` 脚本**删除**（通用 `e2e:main:*` 别名已存在，`package.json:23-28`），不留 shim

### 5.4 文档修订（改用 grep 验收，非行号锚点）
修订 `AGENTS.md`（含 `:7,71,176-180,300-302` 逆引入段）、`docs/ARCHITECTURE.md`、`DEVELOPMENT.md`（含 `:235,264,287` 已删 env 指引）、`WORKFLOW_DEVELOPMENT.md`、`WORKFLOW_E2E_TESTING.md`、`OMP_ENHANCER_SELF_DEVELOPMENT.md`、`README.md`、`omp-config/README.md`（含 `:93-122,117-119`）；`DEEPSEEK_PROMPT_OPTIMIZATION.md` 归档至 `docs/superpowers/`。
**grep 验收**：活动代码/脚本/fixtures/包元数据中无 `deepseek|mimo|opencode-go|DISABLE_DEEPSEEK|DISABLE_MIMO`（`docs/superpowers/` 与历史报告除外）；不混淆 TikZ 品牌图与历史文档。

### 5.5 波次（重排）
- **B0 基线（只读）**：Core/Config/runner/packaging/identifier-scan 证据快照。
- **B1-core（顺序片 1）**：`index.js`、Core `package.json`、`core-workflow.e2e.test.js`、`protocol-coach-runtime.test.js`——删根门控/标签/details 模型身份、通用化提醒/教练资格、新增双通用开关、状态字段改名 + schema bump；保留 top-level/advisor/subagent/slash/autolearn 排除（`:170-181`）。`workflow-protocol-coach.js` 只读不动。RED/GREEN：`node --test .../core-workflow.e2e.test.js .../protocol-coach-runtime.test.js`。
- **B1-labels（顺序片 2）**：`review-budget.js` + `review-budget.test.js`——中和 `COMPAT_*`（暂不加 posture）。
- **B-runner（先于资产删除）**：runner/summarizer/fixtures/profile 断言/根 npm 脚本/`e2e-installed-workflow.test.js` 改名通用化，消费当前配置只读快照，model/thinking 仅 opt-in。RED/GREEN：`node --test scripts/e2e-installed-workflow.test.js`。
- **B-config（资产清理）**：删打包 model 资产与具体 role 默认；删 DeepSeek Skill/templates/helpers/tests；重命名 edit-anchor；更新 Config 公开资产报告、PKU Skill 通用化、packaging、README；跑 `generate:marketplace` 保绿。不写 `~/.omp/**`。
- **B4 文档 + 验证**：更新非生成文档与发布迁移说明（含用户手动检测/移除已装 DeepSeek opt-in 的指引）；**只 `check:workflows`，不 `generate:workflows`**（B 无定义/渲染输入变更）；`npm test` + `pack:all` + `check:marketplace`。

---

## 6. 工作流 A：多智能体动态编排试点

### 6.1 编排元模式（文档映射，非第二状态机）
T0 分诊=direct/simple｜T1 调研=`step-search-external`（条件 composeWith）｜T2 会商=`step-plan`+`step-plan-review`+`step-plan-disposition`｜T3/T4 分片=`step-task-batch`+`step-task-tdd`｜T5 主审=`step-main-review`｜T6 reviewer=`step-review`｜T7 对账=`step-repair`+`step-report`。域卡仅补真正缺失 checkpoint。

### 6.2 长篇写作试点激活（全满足正向 + 负向优先）
在现有 `writing.zh/en` 卡的 `chooseWhen/steps/scopeNotes/delegation` 表达（schema 已支持，无新字段），雕刻点为 `writing.js:88/149`（「assignment size leaves the actor sequence unchanged」）+ `render-skill.js:133-135` 三冻结行。
- **正向 ALL-of**：①用户显式请求新长篇起草（非修订）②≥2 用户命名/可推导章节 ③每节有完整独立 brief、提案范围不相交 ④共享证据/术语/声调 brief 可先冻结 ⑤native 暴露安全匹配 writer。
- **负向优先**：`revise/edit/polish/review/correct/proofread/translate`、整文重写、单节、brief 不完整、跨节生成依赖 → 保持普通三冻结行。
- **两静态分支**：普通分支（step-2 writer + step-3 checker + 条件 step-4，逐字不变）；试点分支（每独立节一个 step-2 提案行，batch 可用时同批提交，parent 集成 checkpoint，随后恰好一个 step-3 checker 审集成稿，再条件 step-4）。writer 仍 proposal-only，Main 拥有集成与授权写入；batch 禁用则顺序 fallback、不声称并行收益。
- **posture（W1-A）**：`review-budget.js` 增纯字段 `minimal|balanced|high-assurance` + 契约版本 bump；优先级：显式独立审查/高 critical 风险→high-assurance；broad/medium→balanced；否则 minimal；恒从属于 `independentReview=forbidden`；至多一句无模型/provider/Agent/宽度句；**补 response-only 长篇写作 RED**（现状 response-only 不产生 review-budget prompt）。

### 6.3 波次
- **Wave 0 基线/准入门（只读）**：冻结琐碎（task==0）、普通写作（2–3 调用）、**单代理长篇起草基线（新增，作准入分母）**、可复用编码对照；定预算。用新通用提醒开关加一组 reminder-on/off 臂，隔离通用化自身开销。
- **Wave 1 两独立切片（B 绿后同批 native task）**：
  - **W1-A**（独占 `review-budget.js`+`review-budget.test.js`）：posture + 非路由断言 + response-only 长篇 RED。
  - **W1-B**（独占 `writing.js`+`render-skill.js`+`catalog.js`（仅版本）+写作契约测试（含 `workflow-subagent-default.test.js:187` 改写、`workflow-consolidation.test.js`、`workflow-redesign-matrix.test.js`、`prompt-stability.test.js`）+ 有界长篇事件评估器（`workflow-events.mjs`/`e2e-installed-workflow.test.js`）+ 1 个长篇 fixture**；生成 Markdown 不在 worker 写集。
- **Wave 2 排他生成（Main 单写入）**：恰好一次 `generate:workflows` → `check:workflows` → parity + **<16,000 字节**索引上限。
- **Wave 3 安装态 E2E**：仅三写作对照（琐碎负控/普通保序/长篇正）+ 至多一编码对照；新增 `requireLongFormWritingPilot` 评估契约（≥2 writer 同批、全部 writer 先于 parent 集成、checker 在集成后、无 native reviewer、条件修复有界）；batch 禁用时并行证据标 not-evaluable；behavior×infrastructure 分离。
- **Wave 4 文档 + 全验证 + reviewer 交接**：文档 + Main 自审 + reviewer 证据交接 + **显式 `npm run coverage --workspace=writing-helper`** + `check:marketplace` + `pack:all` + 根 `npm test`。
- **Wave 5 证据门控后域准入（暂缓）**：写作试点确证后逐域复用；先 `slides.generate`。

---

## 7. 测试方案：智能体编排能力

### 7.1 能力 10 维
C1 分诊｜C2 调研门控｜C3 计划会商｜C4 分片扇出｜C5 依赖排序｜C6 审计覆盖｜C7 对账修复｜C8 角色正确｜C9 成本姿态｜C10 反过度编排。

### 7.2 矩阵（写作试点期收窄）
试点期 live E2E 仅：琐碎负控、普通写作对照、长篇正、至多一编码对照。**不**在写作试点期加事实多 claim/跨域/Advisor/视觉 live 矩阵（避免在不变域耗 token、自毁准入门）。事实/跨域 fixture 留待 Wave 5 后域准入。

### 7.3 三层
- L1 确定性（回归边界，**不消费模型配置**）：`orchestration-capability.test.js` 合成 trace RED/GREEN；posture 非路由断言；域卡 parity；`requireLongFormWritingPilot` 合成 trace 先 RED。
- L2 静态 probe：agent 可见、工具默认 inactive、task.batch/maxConcurrency 能力（注：现 probe 不报 modelRoles/maxConcurrency，按需有界扩展）。
- L3 隔离 E2E（当前配置只读快照、不传 model/thinking）：启用既有 PLAN/READY/TODO/task 断言 + `requireLongFormWritingPilot`。

### 7.4 每维断言
C1 琐碎 task==0、普通 ∈[2,3]；C4 ≥2 writer 同批 batch=true、写集不相交、无 Main 代做；C6 MAIN REVIEW 先于审查者；C7 material finding→修复→二次 MAIN REVIEW→≤1 fresh reviewer；C8 写作/视觉卡不含 native reviewer；C9 posture 为枚举且事件流无插件指定模型（注：**「强模型角色 pass 数」在 §8 下不可观测**，因无 per-item model、角色在 native 内部解析，删除该指标）；**C10 误触发：L1 确定性==0，L3 概率设误触发预算（非硬 ==0）**。

### 7.5 度量与准入（修订）
- **主准入指标 = 预算内质量不回退**（弃 quality/token 比，因 harness 无 token/cache 遥测）。预算（S 节、batch 可用）：无修复=2 task 调用（writer 批 + checker）+ S+1 assignment；修复=≤3 调用 + S+2；琐碎=0；普通=2–3。
- 质量侧基于 fixture outcome，**须有单代理长篇基线作分母**（Wave 0 补）。
- token/cache 仅作「native 日后提供时」的补充志向；墙钟仅描述（provider 延迟混杂），归 infrastructure 轴。

### 7.6 严谨性
- 基线对照：每域单代理阳性对照 + 机械负控。
- A/B 变量：编排策略 + `OMP_ENHANCER_DISABLE_PROTOCOL_COACH` + `OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER`（均插件诊断 env，非模型配置）；**模型/思考级/provider 永不作变量**；每次只改一个变量。
- 重复：pilot(1)→freeze→repeat≥3；报告严格 PASS 率、可评估数、误触发率。
- 失败分类：**采用现有 behavior(pass/fail/not_evaluable) × infrastructure(clean/degraded/failed) 两轴 + 原始 reason 文本**（不声称六细类，除非另有有界分类器写集）；区分 provider/OMP deadline/runner/project-command/evaluator/workflow compliance。
- 结论门槛：样本不足/故障多/未冻结/混用 evaluator → inconclusive。
- Wave 4 显式跑 writing-helper 100% 覆盖（根 `npm test` 不含）。

### 7.7 与波次绑定
B-runner 提供模型无关 E2E → Wave 0 冻结基线（含单代理长篇 + reminder on/off 臂）→ Wave 1 RED/GREEN → Wave 2 生成 parity → Wave 3 三对照（C1–C10）→ Wave 4 全验证 → Wave 5 后域复用。

---

## 8. 模型配置约束（T-CONFIG，修订）

- **各层实际配置**：L1 不消费模型配置；L2 报活动模型/工具/Agent；**L3 复制当前模型选择配置的只读快照/指纹进隔离态，不传 model/thinking override，永不写宿主配置**（仅隔离路径/worktree 插件加载/输出路径可异）。
- **快照脱敏**：计划/文档只记**角色名**（default/plan/slow/task/smol/tiny/designer/vision/advisor），**具体 provider/模型 ID 与 provider 账户标识不入提交文档**；每次 run 的快照入 gitignore 的 `.omp/e2e-results` 报告。
- 当前角色映射示例（仅角色名，具体值用户自有、会变动，配置变更时基线重测）：default/plan/slow/task/smol/tiny/designer/vision/advisor 各 1 角色；`agentModelOverrides:{}`、`enableLsp:true`、`isolation.mode:auto`、`defaultThinkingLevel:auto`、`advisor.enabled:false`。
- 成本姿态测试：因配置固定，仅验证姿态本身（advisory、不提名模型、不改设置）。
- Advisor 现状 `enabled:false`，相关场景按「当前无 Advisor」处理；advisor fixtures 在固定配置规则下移除/暂缓。

---

## 9. 综合路线图（总览）
```
工作流 B（去模型绑定，先行）
  B0 基线 → B1-core → B1-labels → B-runner（先于资产删除）→ B-config（含 generate:marketplace）→ B4 文档+只 check:workflows
    └→ 工作流 A（编排试点）
         Wave 0 基线（含单代理长篇基线 + reminder on/off 臂）
         → Wave 1（W1-A posture ∥ W1-B 长篇试点，写集互斥已枚举）
         → Wave 2 排他生成（唯一 generate:workflows 写入）
         → Wave 3 三对照 E2E → Wave 4 文档+全验证+reviewer
         → Wave 5 证据门控后域准入（暂缓）
```
B→A 强制（因 `review-budget.js` 共享 + 通用交付语义依赖；A 不写 index.js）。生成器全局唯一写入 = A Wave 2。

---

## 10. 不变量、验收与风险

### 10.1 绝对不变量
- 无硬 router/gate/完成控制/强制 fork；成本路由仅 advisory；插件永不改设置。
- 生成资产经 `generate:workflows` 单一写入；writing-helper 100% 覆盖；test-enhancer 不在范围。
- 去绑定后**活动 runtime 插件代码**无 `deepseek-v4-flash/mimo-v2.5/opencode-go` 硬编码（grep 验收，历史文档/TikZ 品牌除外）；`~/.omp/**` 永不触碰。
- advisory 契约：hooks 不 block/continue/触发 turn；review 工具不执行命令；observed/claimed 严格区分；公开工具名 `omp_test_review`/`fact_check_review`；soft/advisory/no-gate 文案断言逐字保留。

### 10.2 验收
- 确定性：每切片 RED→最小 GREEN；生成 parity；<16,000 字节索引；普通写作三行契约不破（除已声明的试点分支）；reviewer 语义不破；通用化断言（任意模型触发、cue 字节稳定、双通用开关、删除项不存在、grep 验收通过）。
- 概率：E2E 事件证据；长篇场景调用/fork 不超预算；C10 L3 误触发在预算内。
- 回滚：各工作流源+测试+文档整体 clean cutover，生成器恰好一次，不留 shim。

### 10.3 风险
- 过度编排抬升 token → 分诊 + 剪枝 + 先单代理。
- 教练/提醒通用化对「不懂分阶段语法的模型」也触发 → 纯 advisory 安全；**双通用开关为缓解 + A/B 控制**；Wave 0 reminder-on/off 臂先测净开销。
- 删 user-opt-in DeepSeek opt-in 影响已装用户 → 发布说明给手动检测/移除指引，不动用户文件。
- persisted-state 失配 → schema bump + 丢弃模型时代旧状态。
- §8 配置入文档 → 脱敏为角色名，per-run 快照入 gitignore。
- `nativeSkillPromptNames` 元数据信任面在 B 后从 2 模型扩到全部（仅 advisory，插件本为可信代码）→ 可选加固：body-identity 检查。
- 外部百分比数据不可复现 → 入文档须补来源附录与适用性。

---

## 附录 A：调研来源
- Anthropic 多智能体研究系统：https://www.anthropic.com/engineering/multi-agent-research-system
- LangChain 多智能体架构选型：https://www.langchain.com/blog/choosing-the-right-multi-agent-architecture
- AdaptOrch：https://arxiv.org/html/2602.16873v1；CONCAT：https://arxiv.org/html/2605.29612v1
- 提示缓存：https://arxiv.org/html/2601.06007v2；模型路由级联：https://tianpan.co/blog/2025-11-03-llm-routing-model-cascades
- 生产编排模式：https://beam.ai/agentic-insights/multi-agent-orchestration-patterns-production
- 本地权威：OMP 17.1.0 `~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/`；本仓 `docs/ARCHITECTURE.md`、`index.js`、`schema.js`、`review-budget.js`、`workflow-protocol-coach.js`、`definitions/*.js`。

## 附录 B：会商审阅结论（v2 已采纳）
- plan（PlanReview2）：REVISE BEFORE EXECUTION → 已按 Q1–Q6 修订（B1 拆分、runner 先于资产删除、删打包模型资产、试点全满足+负向优先、预算内质量不回退、T-CONFIG 只读快照、补漏表面）。
- reviewer（ReviewerReview2）：设计 invariant-safe；merge-blocking 矛盾与遗漏 → 已修订（三处矛盾、必需提醒开关、补两个测试文件、单代理长篇基线、§8 脱敏、grep 验收）。

## 附录 C：实施记录（2026-07-24）

### 工作流 B（去模型绑定）——已实现并全树验证
- B1-core：删 `stagedCompatibilityModel` 根门控与 `DEEPSEEK_/MIMO_` 标签；提醒+教练对所有顶层 Main 模型触发；新增 `OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER`（与 `OMP_ENHANCER_DISABLE_PROTOCOL_COACH` 分立）；`compatibilityReminderTaskStartedAt`→`workflowReminderTaskStartedAt`；`STATE_SCHEMA_VERSION` 7→8（陈旧状态丢弃）；CUE_CONTENT 未动。
- B1-labels：`COMPAT_TASK_SHAPE_FACTS`→`TASK_SHAPE_FACTS`、`COMPAT_REVIEW_CONTEXT`→`REVIEW_CONTEXT`。
- B-runner：runner 去硬编码模型默认（`--model/--thinking` 改 opt-in，未设则用当前配置）；runner/summarizer/8 fixtures 去 deepseek 命名；删 `e2e:deepseek:*` 别名；`assert-default-main-profile.mjs` 泛化。
- B-config：删打包 `assets/models.yml`、`deepseek-tool-calling` Skill、deepseek hook-templates（cot/tool-repair/tool-result-pipeline/model-gate/tool-result-format）；剥离 `config.yml` 的 `modelRoles` 块；`opencode-deepseek-edit-anchor.ts`→`edit-anchor-guard.ts`；PKU Skill 泛化；`generate:marketplace`（marketplace 移除 deepseek-tool-calling）；redact/truncate 通用 helper 保留（仍被 post-hooks 使用）。
- B4：AGENTS/ARCHITECTURE/DEVELOPMENT/WORKFLOW_DEVELOPMENT/WORKFLOW_E2E_TESTING/OMP_ENHANCER_SELF_DEVELOPMENT/README 改模型无关；`DEEPSEEK_PROMPT_OPTIMIZATION.md` 归档至 `docs/superpowers/`。
- 验证：根 `npm test` 绿；grep 验收活动代码无模型绑定；`check:workflows`/`check:marketplace`/`check:ecc-skills`、omp-config `pack:dry` 通过。

### 工作流 A（编排试点）——确定性部分已实现并验证；live E2E 待授权
- W1-A：`review-budget.js` 增纯 advisory `posture`（minimal|balanced|high-assurance，优先级 forbidden/not-applicable→minimal；required/high/critical→high-assurance；broad/medium→balanced）；版本 2→3；`REVIEW_CONTEXT` 增一句无模型/Agent/宽度的 `POSTURE` 提示。
- W1-B：`writing.zh/en` 增长篇试点分支（现有 schema 字段、无新字段；全满足正向 + 负向优先；普通分支逐字节不变；writers 仅提案、Main 集成、恰好一个 checker、无 native reviewer、batch 禁用则顺序 fallback）；`render-skill.js` 条件渲染 + 短索引谓词；`WORKFLOW_CATALOG_VERSION` 22→23（已生成、索引 15514/16000 字节）。
- Wave 2：Main 单写入生成 v23（33 文件）+ 全仓版本调和（tikz-workflow/self-development-docs/workflow-context-parity/workflow-context-sync/README/ARCHITECTURE/DEVELOPMENT/AGENTS）。
- 验证：根 `npm test` 765 绿；writing-helper 100% 覆盖保持；`check:workflows` 当前；reviewer 两次（B1-core、W1-A/W1-B）均判 clean。

### 待办（需用户授权 live E2E）
- Wave 0：live E2E 基线（琐碎零 task、普通写作 2–3 调用、单代理长篇基线、reminder-on/off 臂），用当前配置只读快照，定准入预算。
- Wave 3：三对照 live E2E（`requireLongFormWritingPilot` 评估契约：≥2 writer 同批、全部 writer 先于 Main 集成、checker 在集成后、无 native reviewer、条件修复有界）。

### Live E2E 结果（2026-07-25，当前配置 qwen3.8-max-preview，隔离 HOME）
- 基建：`requireLongFormWritingPilot` 评估契约（组合现有 nativeTask 字段 + 一个最小「分节 writer 先于父集成、checker 集成后、修复 writer checker 后」排序检查；batch 不可用时跳过）+ 合成 RED/GREEN（`scripts/e2e-installed-workflow.test.js` 108/108）+ fixture `long-form-writing.json`（trivial-lookup / ordinary-writing / long-form-single-agent-baseline / long-form-pilot，无硬编码模型）。
- Canary-1（timeoutSeconds 480）：`infrastructure: failed / behavior: not_evaluable`——隔离会话启动慢（discoverSkills 42s+）+ socket 中断 + 硬超时（510s）；但已观察到模型发起 1 个含 3 writer 的原生批量。结论：超时过短，非编排缺陷。
- 修复：fixture `timeoutSeconds` 480→1500。
- Canary-2（timeoutSeconds 1500）：`infrastructure: clean / behavior: fail`，**核心编排验证为真**——3 个分节 writer 同一批量（call_00，均有精确元数据前缀，均 completed）→ 父集成（mutationAttribution=parent-observed）→ checker（集成后）→ 条件 RepairWriter（checker 后）→ native todo 7/7 完成 → 有 final；无 native reviewer。
- 评估器修复：`evaluateLongFormWritingPilot` 原误将条件修复 writer 计入「集成前交付」检查，已排除（合成测试仍 108/108；重评 canary2 该误判消失）。
- 剩余真实模型合规观察（非编排缺陷）：checker 与 RepairWriter 两个 assignment 未保持精确 `[workflow= step= todo= skills=]` 元数据前缀（3 个分节 writer 保持了）；1 处首个 native task 前有 1 次项目检查；1 个工具调用未成功。属当前模型对精确元数据协议的依从度问题（coach 仅服务精确 DeepSeek/MiMo，当前模型无教练强化），非编排逻辑缺陷。
- 结论：多智能体动态编排（分片并行 + 主代理集成 + checker + 条件修复）在当前配置下真实可用；精确元数据合规为模型相关。确定性契约（765 测试 + 合成 RED/GREEN）为回归边界，live E2E 为概率证据。其余 3 个对照（trivial/ordinary/baseline）使用同一已验证基建，按需运行：`node scripts/e2e/run-installed-workflow.mjs --matrix scripts/e2e/fixtures/long-form-writing.json --scenario <id> --repeat 1 --worktree-plugins --output <dir>`。

### 完整对照结果（2026-07-25，补齐准入门证据）
- `trivial-lookup`（负控）：**PASS**——零 native task、无工作流标记，证实无过度编排（去绑定 + 试点未引入误触发）。
- `ordinary-writing`（对照）：**PASS**——普通修订保持单 writer→checker（≤3 调用），未触发试点分支。
- `long-form-single-agent-baseline`（准入分母）：**PASS**（首次因 `maxProjectInspectionCallsAfterNativeTask: 2` 对长篇过紧失败，模型集成/核验长文用 4 次读，放宽至 6 后通过；行为本身 infrastructure clean、writer→checker 序列/元数据/工作流/todo/final 全过）。
- `long-form-pilot`（正控）：核心编排验证（见上）；剩精确元数据前缀合规缺口（checker/RepairWriter 两个 assignment）。
- 结论：四类对照齐备——负控证明不过度编排、普通流不受影响、单代理基线建立、试点核心编排真实可用。准入门（预算内行为正确）达成；唯一未达标项为当前模型对精确 `[workflow= step= todo= skills=]` 前缀的依从度（模型相关，非编排逻辑缺陷）。
