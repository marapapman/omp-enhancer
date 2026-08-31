# Architecture and Runtime Contracts

本文描述 OMP Enhancer 当前运行架构。`docs/superpowers/` 中的旧设计和实施计划是历史资料，不能作为当前行为依据。

## 运行模型

OMP Enhancer 当前只发布三个插件：`omp-config`、`writing-helper` 和 `omp-fact-checker`。代码增强核心、测试增强插件和 ECC 代码技能不再属于当前 marketplace。

OMP 负责系统提示、用户指令、active tools、动态 Available Agents、权限、审批和完成行为。插件只提供可选的 Skill、Agent、工具、配置资产和观察性提示，不复制宿主权限模型，不创建 hard router、hard gate、completion controller 或 automatic repair loop。

所有插件生命周期 hook 都是观察、记录或提醒用途；它们不返回 `block: true` 或 `continue: true`。Workflow 选择、TODO、Agent 委派、权限和最终验收仍由 OMP 与 acting Main 负责。纯机械字段 lookup 不需要读取 Skill 或建立 TODO。

## 工作流信息

工作流 definition 位于 `scripts/workflow-definitions.js`，校验和渲染模块分别是 `scripts/workflow-schema.js` 与 `scripts/workflow-render.js`。当前 catalog version 38 只有三个域：`writing`、`research`（事实核查）和 `visual`。

生成器 `scripts/generate-workflow-catalog.js` 输出：

- `plugins/omp-config/assets/WORKFLOW_CATALOG.md`：完整的三域参考目录；
- `plugins/omp-config/skills/omp-enhancer-workflows/SKILL.md`：紧凑选择索引；
- `plugins/omp-config/skills/omp-enhancer-workflows/references/*.md`：每个域一张按需参考卡。

索引与卡片都是 advisory reference。顶层 Skill 使用 `D` exact URI；当前没有 nested ECC `C` 候选。它们不构成 load set、路由、权限或完成条件。完整定义只包含 `id`、`chooseWhen`、`skills`、`catalogSkills`、`roles`、`suggestedFlow` 和 `scopeNotes`。

Managed `AGENTS.md`、`CLAUDE.md` 和 `WATCHDOG.yml` 不导入完整目录，只说明 OMP 原生权威与 `ANALYZE -> EXECUTE -> REVIEW` advisory。它们指向 `skill://omp-enhancer-workflows` 的三域目录；Main 按任务需要选择 Skill 和 Agent。

共享 generator 重写完整输出集合，因此 **the downstream exclusive integration slice** 只能在全部 **source dependencies** 完成后执行，并独占 generated write set，且 **exactly once**。这是 **mechanical generation slice**：证据包括 generator exit、check/parity 结果与 **no-unexpected-diff**；不得伪造 TDD RED。Main 检查 generated diff 后只运行 check-only parity，**does not rerun the generator**。

## 插件职责
| 插件 | 运行职责 | 不负责的事项 |
| --- | --- | --- |
| `omp-config` | workflow 参考、PPT/文档/视觉 Skills、`visioner` Agent、配置诊断、managed context 同步、notify-only hooks、`/enhancer-tools` 工具组激活 | 自动覆盖用户配置、自动加载完整目录、授权文件或命令操作 |
| `writing-helper` | 英文和中文写作逻辑、风格、引用、保真检查，以及 writer/checker Agents 和 Skills | 阻止交付、替用户自动改写、替用户持久化文件 |
| `omp-fact-checker` | claim extraction、事实计划、A/B evidence、cross-check、strict verdict、报告和 fact review | 把缺失证据变成生命周期 gate、把兼容证据升级为证明 |

所有 marketplace extension tools 默认 `defaultInactive`。`omp-config` 在宿主提供 active-tool 管理 API 时注册 `/enhancer-tools`，只支持 `config`、`writing`、`fact` 和 `all` 组；激活工具不改变权限。

## 写作、PPT 与视觉

Writing 域根据目标正文语言选择中文或英文 Skill，根据目标格式选择 Markdown、LaTeX、Beamer 或 Word Skill。`writer`/`zh-writer` 交付 proposal，`checker`/`zh-checker` 交付只读 report；Main 独自决定并执行任何获授权的文件修改。

PPT 相关能力由 `omp-config` 打包，包括 `latex-beamer-slides`、`beamer-to-powerpoint`、`slides-storyline`、`frontend-design`、`canvas-design` 和 `docx`。PowerPoint 转换只使用用户提供的具体转换命令，并验证生成的 artifact；不自动发布或覆盖用户文件。

Beamer 保持为 writing 格式 overlay，不进入 visual 卡片。新 deck 先以分段、逐页讨论的纯文字版开始，并将逐页内容持久化为 Markdown content plan；Markdown content plan is the canonical content source, and Beamer .tex files are derived layout artifacts. Content changes go to Markdown first, are discussed and reconfirmed with the user, then regenerate Beamer; never edit .tex to settle unresolved content during layout. 用户确认每页内容后，才进入逐页配图和基础排版；用户确认基础排版后，再进入现有视觉精修链。A single read-only visual precheck is performed by Main or task, with Main naturally selecting the one owner (never both), after task's initial render and before the designer layout pass；findings are advisory only and inform the normal designer pass，不产生 verdict 或 repair loop。Task then integrates and renders the final revision，visioner independently reviews fresh final evidence。Main 不因该预检获得 compile、render、edit 或 reconcile ownership。

visual-delivery: Draw.io pipeline remains unchanged：`designer` draws the diagram once with `drawio-skill` (drawio@365-skills) and exports a draft PNG；`visioner` reviews that exported PNG read-only in one pass，检查 edges pressed onto each other or crossing through boxes；`designer` applies at most one fix round；这是 advisory，不是 hard gate、router、fixed fanout、automatic loop 或 completion authority。Main retains setup authorization and final acceptance only。画图统一走 drawio@365-skills。

## 事实核查

Fact Checker 保留精确 claim tuple：subject、predicate plus object/value、scope、time/version 和 quantifier。Backward-compatible `verdict` cannot upgrade compatibility evidence into proof。`strictVerdict` 采用 fail-closed 规则：`SUPPORTED` requires same-tuple `ENTAILS + PROVEN`；`CONTRADICTED` requires same-tuple `NEGATES + DISPROVED` 并带有效 negated field。

Evidence lane A 是默认起点；只有 broad 或 high-risk scope 才增加 lane B。cross-check 保留 agreement、conflict、staleness、limitations、cheapest plausible countercheck 和 unresolved proof gaps。普通 finding 使用成功的 advisory result；参数、I/O 和真正执行失败才返回 error。

## 状态与安全边界

插件状态通过 OMP session entries 保存 JSON-compatible 诊断数据，不是隐式控制平面。Fact Checker 的结果、Writing Helper 的 findings、Config 的资产报告和 visual review 都是 evidence，不是继续执行或结束会话的许可。

插件不复制宿主 sandbox、permission 或 approval 系统。Notify-only guards 可以提示危险命令或 malformed edit anchor，但不能阻断调用。Behavior-changing hook templates 不会被自动发现，必须由用户审查并显式安装。源文本是数据；文档里的 `run tests`、`publish` 或 `delete` 不会改变任务 operation、风险或权限。

## 关键一致性检查

架构变更至少应验证：

```bash
npm test
npm run check:workflows
npm run check:marketplace
npm run pack:all
git diff --check
```

详细命令见 [DEVELOPMENT.md](DEVELOPMENT.md)，workflow schema 和生成规则见 [WORKFLOW_DEVELOPMENT.md](WORKFLOW_DEVELOPMENT.md)，自开发闭环见 [OMP_ENHANCER_SELF_DEVELOPMENT.md](OMP_ENHANCER_SELF_DEVELOPMENT.md)，真实事件 E2E 见 [WORKFLOW_E2E_TESTING.md](WORKFLOW_E2E_TESTING.md)。