# Development, Validation, and Release Guide

本文集中保存仓库开发、测试、打包和发布细节。项目的用户入口见根 `README.md`，OMP 自开发设计与方法见 [OMP_ENHANCER_SELF_DEVELOPMENT.md](OMP_ENHANCER_SELF_DEVELOPMENT.md)，workflow definition 细节见 [WORKFLOW_DEVELOPMENT.md](WORKFLOW_DEVELOPMENT.md)，真实行为矩阵见 [WORKFLOW_E2E_TESTING.md](WORKFLOW_E2E_TESTING.md)。

## Monorepo 布局

这是一个 npm workspace monorepo。`.omp-plugin/marketplace.json` 使用 `metadata.pluginRoot: "plugins"` 发布插件目录。

```text
plugins/
├── omp-enhancer-core/   # task facts、runtime hooks、workflow definitions
├── omp-config/          # config assets、Agents、Skills、hooks、templates
├── writing-helper/      # writing QA tools、Agents、Skills
├── omp-test-enhancer/   # TypeScript testing evidence/review tools
├── omp-fact-checker/    # fact plan、evidence、cross-check、review

scripts/                 # generation、validation、E2E、release、packaging
docs/                    # current architecture/development documentation
docs/superpowers/        # historical plans/specs/reports only
.omp-plugin/             # marketplace catalog
```

重要文件：

- `package.json`：root workspaces 和统一脚本；
- `package-lock.json`：唯一提交的 npm lockfile；
- `.omp-plugin/marketplace.json`：插件版本、source 和 Skill inventory；
- `plugins/omp-enhancer-core/index.js`：Core runtime entrypoint；
- `plugins/omp-enhancer-core/src/task-descriptor.js`：确定性 task facts；
- `plugins/omp-enhancer-core/src/workflows/definitions/`：workflow 唯一语义来源；
- `plugins/omp-test-enhancer/src/extension.ts`：Testing Enhancer source implementation；
- `plugins/omp-test-enhancer/dist/extension.js`：Testing Enhancer marketplace/runtime entrypoint 与 OMP probe target；
- `scripts/release.js`：版本与 marketplace release 的唯一写入入口。

## Runtime invariants

实现变更不得破坏以下契约：

- 默认 Main task context 是 `agent-selected`，且不预选 workflow、Skill、tool 或 Agent。
- `omp-enhancer-workflows` 是紧凑选择索引与按需单卡 references，不是 router。索引行保留每个域的 exact ID、chooseWhen 条件、候选 Skill URI 和单卡 reference URI：`D` 是顶层 exact URI，`C` 是索引显式暴露的 nested ECC exact URI；二者只是 optional candidates、绝不是 load sets，只选择与请求的方法、证据规则、verdict 或格式匹配的 URI。选中的 `C` 直接读取，不先读取完整 catalog，`skill://ecc-skill-catalog` 仅用于未枚举长尾。索引顶部声明 `ANALYZE -> EXECUTE -> REVIEW` 与 usage 规则；单卡只包含 When、Skills、Agent candidates、Suggested flow 与 Scope notes，没有步骤 ID、delegation 行或任何 sentinel marker。需要分析、判断、workflow composition、协调阶段或可能委派的任务使用 `ANALYZE -> EXECUTE -> REVIEW` 三阶段 advisory：Main 按复杂度决定直接工作或委派 analyzer/task/领域 Agent/reviewer，没有强制阶段顺序或 marker 协议。纯机械字段 lookup 无 Skill 或 TODO。
- Catalog version 31 只有 5 张域卡：`code`、`writing`、`research`、`visual`、`operations`。定义字段只有 `id`、`chooseWhen`、`skills`、`catalogSkills`、`roles`、`suggestedFlow` 与 `scopeNotes`；旧 schema 的委派默认、步骤、组合、质量检查或风险字段已全部移除。委派是按复杂度的软选择，不是卡片默认值：Main 聚焦时直接做、substantial 工作时委派 task/领域 Agent、复杂多 slice 工作先委派 analyzer 再委派实现。用户要求 Main-only、Agent/capacity 缺失、input 不完整或 dependency/write overlap 使拆分不安全时记录具体 fallback limitation，不得伪造委派。机械 lookup 任务不读 Skill、不建立 TODO。
- `D`/`C` Skill pointers are optional candidates, never load sets. Main 只选择与请求的方法、证据规则、verdict 或格式匹配的最小 URI 集；显式 conversion 或 template 请求才加载对应方向匹配的格式 Skill。
- Writing Helper 的 `writer` 和 `zh-writer` 只暴露 `read`、`grep`、`glob`。Writer 无论 assignment 是否授权文件修改都只返回完整 proposed replacement、SEARCH/REPLACE 或 unified diff；`checker` 和 `zh-checker` 没有 `write`/`edit`，除本地只读工具外可在当前 host/user 网络权限下使用 `web_search` 核查证据，并始终返回 in-band report。Main 独自验证 findings、决定是否持久化，并执行获授权的文件修改。Writer proposal 与 checker report 必须作为可直接使用的 artifact/evidence 完整出现在 terminal child delivery；status-only 或 artifact-reference-only handoff 不完整。若宿主没有专用 terminal handoff，则普通 final response 就是该 host-neutral delivery。Writer 和 checker 只消费 assignment 冻结的 Skills；这是 soft Agent-selected lifecycle，不是强制 fork、gate 或自动 repair loop。
- 普通软件工作只保留 `code` workflow 和 `code-development` 通用过程 Skill。实质 mutation 在相关 Agents 可用时采用只读 `analyzer`、native `task` 与 native `reviewer`：Main 先做本地检索及必要的有界官方/社区检索，写 dependency-ordered parallel waves 和 non-overlapping vertical slices；复杂多 slice 工作先由 `analyzer` 审完整计划并返回 challenge findings；同 wave 独立 slice 用一次 `task` `tasks[]` batch，每个 task 完整拥有 test mutation、有效 RED、最小 production、同一命令 GREEN 与 refactor；Main 集成、运行 broader verification 并公开 `MAIN REVIEW` 后，`reviewer` 才审 supplied bounded diff/evidence。Supported repair 回到 `task`，刷新证据并由 Main 复审，最多一次 fresh affected reviewer。不得恢复阶段型 code/testing Agent、fixed fan-out、自动 review-repair loop、硬 router 或 gate。
- Core 为所有顶层 Main 模型保留一次 capability-gated、top-level、one-shot orchestration advisory。它根据当前可见 workflow Skill、其他 Skills 与原生 `task` 能力选择最小提示，复述 `ANALYZE -> EXECUTE -> REVIEW` 与 Main 的编排者身份，并可以要求模型明确计划、按需加载所选 Skill、更新自己的 TODO；但不得独立选择 workflow、Skill、Agent、fork，增加权限，或因遗漏形成 plugin-owned completion gate、自动 retry/continuation。唯一关闭开关是 `OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER=1`（受控诊断）；protocol coach 及其专用关闭开关已随 coach 删除。
- 打包的 Config template 不绑定具体 Main/Advisor 模型；模型选择由用户配置，reminder 与 orchestration advisory 对所有顶层 Main 模型通用。
- 多目标 task facts 只用于记录，不得从中编译 route 或静态角色映射。实质 mutation 的 Main 应先检索足够的代码、caller、test 与 configuration anchors，再建立 dependency waves、exclusive write sets 和 complete per-slice assignment input；同 wave batching 是基于真实独立性的软方法，不是固定 fork 或 completion contract。每个 delegated assignment 都携带完整 bounded input 与冻结的 Skills，每次 native `task` call 都有非空顶层 `context`；child 只消费 committed assignment 中冻结的 Skills，不再发现、选择或加载另一套 Skill；缺口作为 limitation 返回 Main。Assignment、host-observed delivery、Main integration/review 和 fallback limitation 都要有 prompt parity 或 event-stream 回归。
- Plugin `tool_call` hook 不返回 `block: true`；`session_stop` hook 不返回 `continue: true`。
- Plugin 不安排自动 repair turn，不拥有 host session completion。
- 所有 extension tools 都是 `defaultInactive`，只能由用户通过 `/enhancer-tools` 显式激活。
- Testing 和 fact review 的公开名称是 `omp_test_review` 与 `fact_check_review`；不得恢复旧的 `*_gate` alias。
- Testing Enhancer 不注册 `/test` command，也不执行调用参数或项目配置中的测试命令。
- Review finding、缺失阶段或缺失证据是 advisory data，不是 tool error；真实参数或 I/O 错误仍返回 error。
- OMP 的 sandbox、permission、approval、active tools 和 dynamic Agents 始终权威。

详细解释见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 代码约定

- 全仓库使用 ES modules，使用 `import`/`export`。
- Core、Config、Fact Checker 和 Writing Helper 是直接由 Node 执行的 JavaScript；不要无必要增加 build step。
- Testing Enhancer 使用 TypeScript、`module: NodeNext`、`target: ES2022`、`strict: true`，源码在 `src/`，产物在 `dist/`。
- JavaScript 文件保持现有分号风格；Testing Enhancer TypeScript 通常不写分号。
- Public tool names 使用 snake_case；内部函数使用 camelCase。
- 优先写小型纯函数和 plain objects，state 必须 JSON-serializable。
- 注册工具前规范化参数；tool result 应同时提供文本 `content` 和可测试的结构化 `details`。
- Lifecycle diagnostics 必须低噪声，不能让 host session 失败或续跑。
- 测试使用 dependency injection、fake OMP/PI API 和临时目录，避免提交大型 fixture tree。
- 不增加依赖，除非它显著降低实现或安全风险。

## 常用命令

从仓库根目录执行：

```bash
npm test
npm run generate:workflows
npm run check:workflows
npm run generate:ecc-skills
npm run check:ecc-skills
npm run check:marketplace
npm run pack:all
npm run release -- --plugin all --bump patch --dry-run
```

Plugin-specific validation：

```bash
npm test --workspace plugins/omp-enhancer-core
npm test --workspace plugins/omp-config
npm run pack:dry --workspace plugins/omp-config
npm test --workspace plugins/writing-helper
npm run coverage --workspace plugins/writing-helper
npm test --workspace plugins/omp-fact-checker
cd plugins/omp-test-enhancer && bun run typecheck && bun run build && bun run test
```

Config 的 ECC `skill-comply` 目录还包含独立 pytest suite：

```bash
cd plugins/omp-config/skills/ecc/skill-comply
pytest
```

项目没有 root lint/format 配置。遵循邻近代码风格，并始终运行 `git diff --check`。

## Generated assets

修改 workflow definition 或 renderer 后运行：

```bash
npm run generate:workflows
npm run check:workflows
```

生成器覆盖：

```text
plugins/omp-config/assets/WORKFLOW_CATALOG.md
plugins/omp-config/skills/omp-enhancer-workflows/SKILL.md
plugins/omp-config/skills/omp-enhancer-workflows/references/*.md
```

紧凑索引的当前大小与 budget 由 focused generation test 动态校验。不要把
某次生成的 byte snapshot 写成长期 artifact 或 acceptance baseline。

不要手改这些文件。Config 在运行时不依赖 Core 源码，只打包生成结果，所以 definition/renderer 变更通常同时影响 Core 和 Config release。

`generate:workflows` 会重写整组 workflow assets，因此并行 source workers 不能分别运行它或共同声明这些输出。它的 downstream exclusive integration task 在全部 source dependencies 完成后恰好运行 generator 一次（exactly once），并独占完整 generated write set。这是 mechanical generation slice：证据是 generator exit、check/parity 结果与 no-unexpected-diff 检查，不得伪造 TDD RED。Delivery 后，Main 检查 generated diff，运行 check-only parity 与 broader validation，但不得再次运行 generator。任何其他会全量重写共享输出的 generator 采用同一 single-writer、single-run 规则。

新增、删除或修改 ECC guide frontmatter 后运行：

```bash
npm run generate:ecc-skills
npm run check:ecc-skills
```

OMP 17 只直接发现 `<plugin>/skills/<skill>/SKILL.md` 形状的直接子目录。Config 因此只原生暴露一个顶层 `ecc-skill-catalog` adapter。Workflow index 可以把已枚举候选作为 `C` 直接暴露为 exact `skill://ecc-skill-catalog/<id>/SKILL.md`；这类 `C` URI 不先读取完整 catalog。未枚举长尾才通过 adapter 与 catalog 中的 exact URI 按需发现。Marketplace 的递归 Skill 数组仍用于 filesystem inventory、校验和显式兼容安装，不表示所有嵌套 guide 都常驻 prompt。

## Marketplace validation

`.omp-plugin/marketplace.json` 是发布 catalog。修改插件 Skill inventory 后运行：

```bash
npm run generate:marketplace
npm run check:marketplace
```

`generate:marketplace` 只同步可推导的 Skill paths；版本必须由 release 脚本更新。Plugin package 不应包含独立的 marketplace sync 脚本。

`npm run pack:all` 对每个 workspace 做 dry-run package validation，检查 manifest、entrypoint、必要文件和禁止泄漏的文件。Marketplace 永久跟踪 GitHub `main`，catalog 不支持 `ref` pins。

## Legacy installation cleanup

旧 OMP home 可能仍包含六个描述已退役硬门禁流程的 managed Skills。先预览 ignored-Skill 合并：

```bash
npm run migrate:legacy-gate-skills
```

审查 JSON 后再显式应用：

```bash
npm run migrate:legacy-gate-skills -- --apply
```

迁移只把以下 exact names 加入 `skills.ignoredSkills`：

- `gate-aware-interaction`
- `omp-factcheck-gate-satisfy`
- `omp-gate-satisfaction`
- `omp-gate-unblock`
- `omp-subagent-gate-satisfaction`
- `omp-testing-gate-report`

Apply mode 会备份 `config.yml`，验证持久化后的 ignored list，并确认 `autolearn.enabled` 和 `autolearn.autoContinue` 未变化。它不删除或覆盖旧 Skill 目录。

## 测试策略

Test stacks：

- Core、Config、Writing Helper、Fact Checker：Node `node:test`；
- Testing Enhancer：Vitest；
- `skill-comply`：pytest。

目录和命名：

- JavaScript tests 位于各插件 `test/`，使用 `*.test.js`；
- Testing Enhancer tests 位于 `tests/`，使用 `*.test.ts`；
- Python tests 使用 `test_*.py`；
- 文件 fixture 优先使用 `mkdtemp`/`mkdtempSync`。

每个 lifecycle extension 都需要回归测试，证明 hooks 不阻断工具、不续跑 session。Review 工具测试还必须覆盖：

- advisory finding 使用 `isError: false`；
- 参数错误保持正常 error；
- review 不执行命令；
- host-observed evidence 与当前 task context/revision 绑定；
- workspace mutation 使过期证据失效；
- 旧 `*_gate` tool 名不存在；
- `/test` command 不注册。

Writing Helper 的 coverage 命令要求 lines、branches、functions 都达到 100%。

实质 OMP Enhancer 变更遵循 `code` workflow、`code-development` 及其条件 reference `references/omp-enhancer.md` 的本地/外部 evidence、reviewed parallel plan（复杂计划由只读 `analyzer` 审阅）、task-owned vertical TDD、Main integration/`MAIN REVIEW`、生成 parity、isolated E2E 和 bounded reviewer reconciliation。不要在本指南重复该完整闭环；以 [OMP_ENHANCER_SELF_DEVELOPMENT.md](OMP_ENHANCER_SELF_DEVELOPMENT.md) 为方法真值。

## Context parity 与 OMP probe

Event evaluator、临时 fixture、repeat、negative control、A/B freeze 和 provider/runner failure classification 的完整规范见 [WORKFLOW_E2E_TESTING.md](WORKFLOW_E2E_TESTING.md)。本节只保留常用验证入口。

Workflow/context 相关变更至少运行：

```bash
npm run check:workflows
npm run check:ecc-skills
node --test scripts/workflow-context-parity.test.js
npm test --workspace plugins/omp-enhancer-core
npm test --workspace plugins/omp-config
npm run check:marketplace
```

Parity tests 应证明：

- generated Markdown 和 Skill references 与 definitions 一致；
- ordinary code surface 只暴露 `code` workflow、`code-development` Skill、只读 `analyzer`、native `task` 和 native `reviewer`；退役 workflow、过程 Skill 和阶段型 Agent 文件保持缺失；
- managed Main/Advisor blocks 不 import 完整 catalog；Main 的 `ANALYZE -> EXECUTE -> REVIEW` orchestration advisory、非平凡任务可读取 `skill://omp-enhancer-workflows` 域参考目录、机械 lookup 无 Skill 或 TODO，都保持提示词级 advisory；Advisor 不提供 `DECISION CHECK` 或任何 checkpoint 模板；
- one-shot orchestration advisory 是 capability-gated、top-level、只发一次，并只复述阶段、编排者身份与能力事实；索引行暴露 exact ID、完整 chooseWhen 条件、`D`/`C` exact URI 与单卡 reference URI；单卡只暴露 When、Skills、Agent candidates、Suggested flow 与 Scope notes；
- definitions 和 generated cards 保持 7 字段 schema parity（`id`、`chooseWhen`、`skills`、`catalogSkills`、`roles`、`suggestedFlow`、`scopeNotes`），没有任何 delegation/steps/composeWith/qualityChecks/riskNotes 字段；
- 每个 delegated assignment 都携带完整 bounded input 与冻结的 Skills；每次 native `task` call 都有非空顶层 `context`；outer `context`、name、label 或 child metadata 自述不能满足 item-body parity；
- Agent 和 Skill frontmatter names 全局唯一；
- current docs 只把已退役的 router、gate 和测试命令描述为不存在或历史内容，不得把它们写成当前能力。
- 行为评估区分 event-stream 证据和模型自述。行为场景检查：非平凡任务 Main 读取域索引或直接使用可见 Skill；substantive code mutation 观察 analyzer（如委派）后的 implementation wave、同 wave 独立 slices 的单次 native `task` `tasks[]` batch、host-observed completed delivery、Main broader verification 与 visible `MAIN REVIEW`、之后才发生的 native reviewer assignment，以及 supported repair 的 task delivery、第二次 Main review 和至多一次 fresh reviewer。Evaluator 验证 assignment input 完整、checkpoint 安全且 matching Agent 当前可见时建立 task assignment，否则记录具体 fallback limitation 而不伪造 dispatch。
- 自然语言 willingness 场景使用 `code` 域与 `operations` 域的自然 prompt 对照，并保留 trivial lookup 的 direct 反例；它还覆盖 `writing` 域的 writer→checker delivery 顺序，以及完整网络设计 brief 的领域 Agent 选择和 exact nested `C` Skill 读取，prompt 不直接要求 delegation。写作场景还要求完整 writer proposal 与 checker in-band report 进入 terminal child delivery，获授权的文件修改才由 Main 的可观察 call 执行。`requiredNativeTaskAgentSequence` 只在场景显式声明时验证前序 completed、非空 host-observed delivery 早于后序 Agent 的首次 assignment；它不是全局 gate。

静态 OMP 17 probe：

```bash
node scripts/e2e/omp17-rpc-probe.mjs --
node scripts/e2e/omp17-rpc-probe.mjs -- \
  -e plugins/omp-enhancer-core/index.js --plugin-dir plugins/omp-enhancer-core \
  -e plugins/omp-config/index.js --plugin-dir plugins/omp-config \
  -e plugins/writing-helper/index.js --plugin-dir plugins/writing-helper \
  -e plugins/omp-test-enhancer/dist/extension.js --plugin-dir plugins/omp-test-enhancer \
  -e plugins/omp-fact-checker/index.js --plugin-dir plugins/omp-fact-checker
```

Probe 使用隔离临时 OMP home，只输出 hash、字符数和结构布尔值。不要把 `--no-extensions` 与显式 `-e`/`--plugin-dir` 混用，否则工作树插件也会被禁用。

Reminder 行为由确定性 hook tests 和可选行为矩阵验证。Runner 的 `--model` 是单次全矩阵 override，接受任意用户配置的模型；下面是同一矩阵、相同 thinking/repeat 的一次独立运行示例，不是一次调用完成的 paired A/B wrapper，也不自动生成模型差分结论：

```bash
npm run e2e:main:skills -- \
  --model <user-chosen> --thinking high --repeat 3 \
  --worktree-plugins --output .omp/e2e-results/skills-run
```

同样的 `--model` override 可用于 `e2e:main:subagents` 与 `e2e:main:advisor`。比较时必须保持 matrix、scenario、thinking、repeat、插件态和 evaluator 一致，并分别保留输出目录。模型 A/B 与 reminder-on/off A/B 是不同实验；Reminder 对照在同一模型下使用 `OMP_ENHANCER_DISABLE_WORKFLOW_REMINDER=1`（reminder off）。Protocol coach 已删除，不存在 coach 对照。一次 live run 只是样本，不能证明稳定提升。

`--worktree-plugins` 会自动建立一次性 OMP home，而不是继承宿主已安装的同名插件。Runner 从当前工作树播种 `AGENTS.md`、`WATCHDOG.yml`、workflow catalog、`models.yml` 和白名单化 `config.yml`；live run 通过 Node SQLite backup API 对活动 `agent.db` 做 WAL 一致快照，不直接复制数据库文件。子进程与 `omp config get` 都显式使用隔离 env；宿主 profile、XDG、auth-broker 及 OMP/PI path override 不会传入。项目本地 registry、extension directory 或 `extensions:` 设置可能重复加载工作树插件时，preflight 会 fail closed。

隔离 session 与 credential snapshot 在 `finally` 中删除，JSON report 只记录 `isolated: true`，不记录临时 home、agent 或 session 路径。为避免 OAuth refresh token rotation 反向影响宿主，runner 会检查相关 OAuth access expiry；若其有效期不足以覆盖矩阵预算和安全余量，会在启动模型前拒绝运行。该检查无法证明第三方 provider 永远不会提前刷新，因此 Advisor/OAuth E2E 仍应使用有效期充足、可重新登录的测试凭据。没有 `--worktree-plugins` 时，runner 保持已安装态验证语义。

真实矩阵中的 TODO、task、Skill、workflow 或 Agent 数量及重复通过率是随机模型行为观测，不是插件保证。涉及外部写入的场景必须使用临时目录或明确 preview，不得为 E2E 自动发布。

## 安装插件依赖（一键）

`omp plugin install` / `upgrade` 不会为插件拉取 npm 运行时依赖（已安装缓存里没有 `node_modules`）。安装或升级后运行一次 `npm run install:deps`，它会为每个已安装插件在其缓存目录执行 `npm install --omit=dev` 并验证依赖可解析：

```bash
npm run install:deps                              # 所有已安装插件
npm run install:deps -- --dry-run                 # 预览不安装
```

也可在启用 Core tools 后调用 `omp_core_install_deps`（接受 `dryRun` 与 `plugin`）。`omp-testing-enhancer` 借此获得 `playwright`/`pixelmatch`/`pngjs`。playwright 浏览器二进制仍需其自身的 `npx playwright install`。

## Release transaction

根 `scripts/release.js` 是 plugin manifest、root lockfile 和 marketplace version 的唯一写入入口。先做 dry-run：

```bash
npm run release -- --plugin <name> --bump patch --dry-run
```

确认后才应用：

```bash
npm run release -- --plugin <name> --bump patch --apply
```

当一个 scoped plugin release 同时改变公开 marketplace inventory 或 metadata 时，用同一事务显式增加 catalog 版本：

```bash
npm run release -- --plugin <name> --bump patch --catalog-bump patch --apply
```

不要为了方便使用 `--plugin all`，除非所有插件确实发生了需要发布的变化。版本基线取 plugin manifest、marketplace 和 lockfile 中的最高语义版本；只有显式 `--allow-downgrade` 才允许降级。

Release 写入先在目标目录创建已 fsync 的临时文件和备份，再以单文件 `rename` 替换。Prepare 或 commit 发生可捕获异常时，脚本逆序恢复已替换文件并清理事务文件。如果所有目标已提交、仅 cleanup 失败，脚本报告 committed 状态并保留无法清理的备份，不伪装成 rollback。该设计处理可捕获 I/O 错误，但不是 SIGKILL 或掉电下的跨文件内核原子事务。

应用 release 后运行：

```bash
npm test
npm run check:marketplace
npm run pack:all
git diff --check
```

只有用户明确授权时才 commit、push 或升级本地安装。Marketplace 跟踪 `main`，所以本地 upgrade 必须在远端已包含目标提交之后执行：

```bash
git status --short
git add <reviewed-paths>
git commit -m "<scoped message>"
git push origin main
git rev-parse HEAD
git ls-remote origin refs/heads/main

omp plugin marketplace update omp-enhancer
omp plugin upgrade <changed-plugin>@omp-enhancer
omp plugin list
```

Config context 需要显式同步时，在新 session 中启用 Config tools，先调用 `omp_config_sync_workflow_context` 的 `apply=false`，审查后再决定是否使用 `apply=true`。

## 文档维护

- 根 `README.md` 只保留用户功能、工作流概念、安装、常用用法、升级和文档入口。
- 当前架构和 runtime contracts 写入 `ARCHITECTURE.md`。
- 开发、测试、生成、打包和发布写入本文件。
- Workflow schema 与 catalog generation 写入 `WORKFLOW_DEVELOPMENT.md`。
- OMP Enhancer 自我迭代的设计原则、计划、TDD 和 reviewer reconciliation 写入 `OMP_ENHANCER_SELF_DEVELOPMENT.md`。
- Fixture、event evaluator、真实 matrix、重复实验与故障分类写入 `WORKFLOW_E2E_TESTING.md`。
- `docs/superpowers/` 只保存带日期的历史设计、计划和报告。它们可以包含已退役的 gate/router 设计，但必须被明确标记为 archive，不能从当前 README 或指南中当作现状引用。
- 删除公开 API 时同步检查源码、tests、Agents、Skills、generated assets、marketplace、plugin README 和 current docs；历史 archive 不做追溯改写。
