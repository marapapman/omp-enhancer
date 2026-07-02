# omp-enhancer monorepo 设计

## 背景

目标是把三个相关仓库放进一个 monorepo，但保持三个插件互不干扰。

- `sakuradairong/omp-config` 是 OMP 配置合集，包含配置模板、模型覆盖、MCP、hooks、agents、skills 和全局行为指令。
- `marapapman/omp-writing-helper` 是 OMP 写作辅助插件，包含 `writing_logic_check`、`writing_quality_check`、写作命令、writer/checker agents 和写作 skills。
- `marapapman/omp-test-enhancer` 是 OMP 测试增强插件，包含测试目标分析、测试上下文、浏览器证据、覆盖率缺口、mutation survivor、测试门禁和测试报告。

用户要求仓库本身可以作为 OMP marketplace，一条 `omp plugin install` 命令安装这些插件，并支持 `omp plugin upgrade`。

## 设计目标

1. 根仓库是 monorepo 和 marketplace，不提供总插件。
2. `plugins/omp-config` 是配置插件。
3. `plugins/writing-helper` 是写作插件。
4. `plugins/omp-test-enhancer` 是测试插件，marketplace 插件名保留 `omp-testing-enhancer`。
5. 三个插件可以单独安装、禁用、测试和升级。
6. 三个插件不互相 import，不共享 runtime 代码。
7. 一条安装命令可以安装三个插件。
8. 后续升级走 marketplace upgrade。
9. `omp-config` 不默认覆盖 `~/.omp`。
10. `writing-helper` 不读取 OMP 全局配置。
11. `omp-test-enhancer` 不依赖写作插件或配置插件。

## 根目录结构

```text
omp-enhancer/
  .omp-plugin/
    marketplace.json
  package.json
  README.md
  scripts/
    check-marketplace.js
    pack-all.js

  plugins/
    omp-config/
      package.json
      README.md
      index.js
      commands/
      agents/
      skills/
      hooks/
      assets/
      src/
      test/

    writing-helper/
      package.json
      README.md
      index.js
      src/
      agents/
      skills/
      test/

    omp-test-enhancer/
      package.json
      README.md
      src/
      dist/
      commands/
      tools/
      tests/
      docs/
      examples/
      scripts/
      tsconfig.json
      vitest.config.ts
      bun.lock
```

根目录只负责 workspace、marketplace catalog 和批量检查。根目录不注册 OMP extension。

## 根 package.json

```json
{
  "name": "omp-enhancer-monorepo",
  "private": true,
  "type": "module",
  "workspaces": [
    "plugins/omp-config",
    "plugins/writing-helper",
    "plugins/omp-test-enhancer"
  ],
  "scripts": {
    "test": "npm test --workspaces --if-present",
    "pack:all": "node scripts/pack-all.js",
    "check:marketplace": "node scripts/check-marketplace.js"
  }
}
```

说明：`omp-test-enhancer` 内部继续使用 Bun、TypeScript 和 Vitest。根目录的 `npm test --workspaces --if-present` 只是批量调度各插件自己的 test script。实际环境必须安装 Bun 才能跑测试插件的测试。

## marketplace catalog

OMP marketplace 文档说明，catalog 放在 `.omp-plugin/marketplace.json`。同一个 marketplace 可以列多个插件。catalog 在 monorepo 根目录时，建议使用 `metadata.pluginRoot` 和相对 `source`。

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "omp-enhancer",
  "owner": {
    "name": "marapapman"
  },
  "metadata": {
    "description": "OMP enhancement plugins for config assets, writing support, and test workflow support.",
    "version": "1.0.0",
    "pluginRoot": "plugins"
  },
  "plugins": [
    {
      "name": "omp-config",
      "description": "Pluginized OMP configuration assets, agents, skills, hooks, model override templates, and config diagnostics.",
      "version": "0.1.0",
      "category": "development",
      "homepage": "https://github.com/marapapman/omp-enhancer/tree/main/plugins/omp-config",
      "repository": "https://github.com/marapapman/omp-enhancer",
      "source": "./omp-config"
    },
    {
      "name": "writing-helper",
      "description": "Standalone OMP writing helper with logic checks, quality checks, citation verification, writer/checker agents, and writing skills.",
      "version": "0.2.1",
      "category": "writing",
      "homepage": "https://github.com/marapapman/omp-enhancer/tree/main/plugins/writing-helper",
      "repository": "https://github.com/marapapman/omp-enhancer",
      "source": "./writing-helper"
    },
    {
      "name": "omp-testing-enhancer",
      "description": "Help OMP agents write and check tests with target analysis, public API context, browser evidence, coverage and mutation analyzers, quality gates, and reports.",
      "version": "0.1.3",
      "category": "development",
      "homepage": "https://github.com/marapapman/omp-enhancer/tree/main/plugins/omp-test-enhancer",
      "repository": "https://github.com/marapapman/omp-enhancer",
      "source": "./omp-test-enhancer"
    }
  ]
}
```

如果以后 marketplace catalog 不在同一个仓库，也可以使用 `git-subdir`。

```json
{
  "source": {
    "source": "git-subdir",
    "url": "https://github.com/marapapman/omp-enhancer.git",
    "path": "plugins/omp-test-enhancer",
    "ref": "main"
  }
}
```

需要注意，OMP 文档说明 marketplace 安装主要加载插件内容，例如 skills、commands、agents、hooks、tools、MCP 和 LSP。`package.json` 的 `omp.extensions` 入口只对 npm 安装或 `omp plugin link` 加载。因此，如果插件依赖 `index.js` 或 `dist/extension.js` 注册 runtime tools，需要单独验证 marketplace 安装路径。README 必须区分 marketplace 安装和 link 安装。

## 一条命令安装三个插件

OMP CLI 的 `plugin install` 支持多个 `<source>` 参数。源码中 `handleInstall` 接收 `packages: string[]`，然后逐个安装。因此，用户添加 marketplace 之后，可以用一条 OMP 命令安装三个插件。

```bash
omp plugin install omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer
```

这不是 bundle 插件。安装结果仍然是三个独立插件：

```text
omp-config@omp-enhancer
writing-helper@omp-enhancer
omp-testing-enhancer@omp-enhancer
```

验证过的升级全部已安装 marketplace 插件命令：

```bash
omp plugin upgrade
```

如果用户需要更精确的控制，可以逐个升级：

```bash
omp plugin upgrade omp-config@omp-enhancer
omp plugin upgrade writing-helper@omp-enhancer
omp plugin upgrade omp-testing-enhancer@omp-enhancer
```

前提是用户已经添加过 marketplace：

```bash
omp plugin marketplace add marapapman/omp-enhancer
```

如果要求第一次使用也只有一条命令，当前 OMP marketplace 机制不支持在 `plugin install` 里自动添加未知 marketplace。那种需求需要 shell one-liner 或上游 OMP 增加“install from marketplace repo and install selected plugins”的新命令。当前设计不依赖未实现的 CLI 行为。

## 插件一：omp-config

### 定位

`omp-config` 是配置插件。它把 `sakuradairong/omp-config` 中可复用的 OMP 配置资产打包成插件内容，同时提供只读配置检查和迁移建议。

### 目录结构

```text
plugins/omp-config/
  package.json
  README.md
  index.js

  commands/
    config.md
    config-doctor.md
    config-assets.md

  agents/
    task.md
    explore.md
    plan.md
    reviewer.md
    designer.md
    librarian.md
    quick_task.md
    ecc-*.md

  skills/
    deepseek-tool-calling/
      SKILL.md
    conventional-commits/
      SKILL.md
    docker-compose/
      SKILL.md
    go-testing/
      SKILL.md
    caveman/
      SKILL.md
    diagnose/
      SKILL.md
    grill-with-docs/
      SKILL.md
    handoff/
      SKILL.md
    improve-codebase-architecture/
      SKILL.md
    prototype/
      SKILL.md
    tdd/
      SKILL.md
    zoom-out/
      SKILL.md

  hooks/
    pre/
      guard-destructive.ts
      opencode-deepseek-cot.ts
      opencode-deepseek-tool-repair.ts
      opencode-deepseek-edit-anchor.ts
      opencode-deepseek-tool-result.ts
    post/
      redact-secrets.ts
      truncate-output.ts

  assets/
    CLAUDE.md
    config.yml
    models.yml
    mcp.json
    env.example
    gitignore.root
    gitignore.agent

  src/
    doctor.js
    asset-index.js
    config-normalizer.js
    path-policy.js
    report.js

  test/
    doctor.test.js
    asset-index.test.js
    config-normalizer.test.js
    package-content.test.js
```

### 能力

`omp-config` 可以提供：

1. agents。
2. skills。
3. hooks。
4. commands。
5. MCP 配置模板。
6. 模型配置模板。
7. 配置检查。
8. 迁移建议。

`omp-config` 不提供：

1. 写作检查。
2. 引用核验。
3. 测试生成。
4. 测试门禁。
5. 浏览器证据采集。
6. 论文内容读取。

### 命令

```text
/omp-config:config
/omp-config:config-doctor
/omp-config:config-assets
/omp-config:config-plan
```

### 工具

如果通过 `omp plugin link plugins/omp-config` 或 npm 加载 extension，可以注册：

```text
omp_config_doctor
omp_config_assets
omp_config_plan
```

第一版只读检查，不写 `~/.omp`。

### 资产迁移规则

| 原路径 | 新路径 |
|---|---|
| `CLAUDE.md` | `plugins/omp-config/assets/CLAUDE.md` |
| `.gitignore` | `plugins/omp-config/assets/gitignore.root` |
| `agent/config.yml` | `plugins/omp-config/assets/config.yml` |
| `agent/models.yml` | `plugins/omp-config/assets/models.yml` |
| `agent/mcp.json` | `plugins/omp-config/assets/mcp.json` |
| `agent/.env.example` | `plugins/omp-config/assets/env.example` |
| `agent/.gitignore` | `plugins/omp-config/assets/gitignore.agent` |
| `agent/agents/*.md` | `plugins/omp-config/agents/*.md` |
| `agent/skills/*/SKILL.md` | `plugins/omp-config/skills/*/SKILL.md` |
| `agent/hooks/*/*.ts` | `plugins/omp-config/hooks/*/*.ts` |

不要把 `config.yml`、`models.yml`、`mcp.json` 自动写入 `~/.omp/agent`。它们只是模板资产。

## 插件二：writing-helper

### 定位

`writing-helper` 保持现有写作插件定位。它不关心 OMP 配置，不读取 `omp-config` 资产，也不依赖测试插件。

### 目录结构

```text
plugins/writing-helper/
  package.json
  README.md
  index.js

  src/
    analyzer.js
    citations.js
    document-loader.js
    language.js
    marketplace-release.js
    quality.js
    report.js
    style.js

  agents/
    writer.md
    checker.md
    zh-writer.md
    zh-checker.md

  skills/
    plain-chinese-writing/
    pku-chinese-phd-thesis-checker/
    writing-markdown-helper/
    writing-state-machine/
    writing-mad-writer/
    writing-checkers/
    writing-review/
    zh-writing-markdown-helper/
    zh-writing-state-machine/
    zh-writing-mad-writer/
    zh-writing-checkers/
    zh-writing-review/
    zh-writing-logic-check/
    zh-writing-polish/
    zh-format-humanizer/
    format-humanizer/
    format-submission-precheck/
    format-human-comment-helper/
    format-markdown2latex/
    format-latex2markdown/
    format-template-latex/
    research-storyline/
    research-literature/
    research-relatedwork-summarizer/
    research-experiment/
    research-bogus-data/
    research-phase-navigation/
    research-socratic/

  test/
    *.test.js
```

### 保留能力

继续保留：

```text
writing_logic_check
writing_quality_check
/writing-logic
/writing-quality
```

继续保留输入边界：

- inline text。
- UTF-8 text path。
- Markdown。
- LaTeX source。
- plain text。

继续不做：

- `.docx` 解析。
- `.pdf` 解析。
- 自动改写文档。
- 自动确认引用真实。
- 把 `UNVERIFIED` 当成造假。

## 插件三：omp-test-enhancer

### 定位

`omp-test-enhancer` 保持现有测试插件定位。目录名采用原仓库名，marketplace 插件名和 package name 保留现状：

```text
omp-testing-enhancer
```

它不读取 `omp-config` 资产，也不依赖 `writing-helper`。

### 目录结构

```text
plugins/omp-test-enhancer/
  package.json
  README.md
  bun.lock
  tsconfig.json
  vitest.config.ts

  src/
    extension.ts
    ompApi.ts
    types.ts
    commands/
      testCommand.ts
    config/
      testingConfig.ts
    gates/
      browserEvidenceGate.ts
      indirectTestGate.ts
      testCommandGate.ts
      testFileScopeGate.ts
    repo/
      repoScanner.ts
    session/
      testingState.ts
    tools/
      browserCheck.ts
      imageDiff.ts
      testingTools.ts
    marketplace/
      marketplaceRelease.ts

  dist/
    extension.js
    ...

  commands/
    test.md

  tools/
    testing-tools.ts

  tests/
    unit/
    smoke/

  docs/
  examples/
  scripts/
```

### 保留能力

继续保留命令：

```text
/test
```

marketplace 命名空间命令：

```text
/omp-testing-enhancer:test
```

继续保留工具：

```text
omp_test_analyze
omp_test_context
omp_test_browser_check
omp_test_coverage_analyze
omp_test_mutation_context
omp_test_gate
omp_test_report
```

继续保留配置文件：

```text
.omp/testing-enhancer.yml
```

继续保留工作流：

1. 分析测试目标。
2. 构造测试上下文。
3. 对前端目标采集浏览器证据。
4. 读取 coverage 缺口。
5. 读取 mutation survivors。
6. 写测试。
7. 运行测试门禁。
8. 生成报告。

### package.json

保留现状，移动目录后只确认 `files`、`main`、`exports` 和 `omp.extensions` 仍然有效。

```json
{
  "name": "omp-testing-enhancer",
  "version": "0.1.3",
  "description": "OMP plugin for test generation guidance, quality gates, and reports.",
  "type": "module",
  "main": "./dist/extension.js",
  "exports": {
    ".": "./dist/extension.js"
  },
  "files": [
    "dist",
    "src",
    "tools",
    "commands",
    "package.json",
    "README.md"
  ],
  "scripts": {
    "build": "bunx tsc -p tsconfig.json",
    "typecheck": "bunx tsc --noEmit -p tsconfig.json",
    "test": "bunx vitest run",
    "prepack": "bun run build"
  },
  "omp": {
    "extensions": [
      "./src/extension.ts"
    ]
  }
}
```

说明：原仓库的 `.omp-plugin/marketplace.json` 不再作为插件内 catalog 使用，统一由根 `.omp-plugin/marketplace.json` 管理。

## 隔离规则

### 安装隔离

一条命令安装三个插件：

```bash
omp plugin install omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer
```

禁用也分开：

```bash
omp plugin disable omp-config@omp-enhancer
omp plugin disable writing-helper@omp-enhancer
omp plugin disable omp-testing-enhancer@omp-enhancer
```

### 命名隔离

配置插件命令：

```text
/omp-config:config
/omp-config:config-doctor
/omp-config:config-assets
```

写作插件命令：

```text
/writing-helper:writing-logic
/writing-helper:writing-quality
```

测试插件命令：

```text
/omp-testing-enhancer:test
```

配置插件工具：

```text
omp_config_doctor
omp_config_assets
omp_config_plan
```

写作插件工具：

```text
writing_logic_check
writing_quality_check
```

测试插件工具：

```text
omp_test_analyze
omp_test_context
omp_test_browser_check
omp_test_coverage_analyze
omp_test_mutation_context
omp_test_gate
omp_test_report
```

### 代码隔离

禁止：

- `plugins/omp-config` import `plugins/writing-helper`。
- `plugins/omp-config` import `plugins/omp-test-enhancer`。
- `plugins/writing-helper` import `plugins/omp-config`。
- `plugins/writing-helper` import `plugins/omp-test-enhancer`。
- `plugins/omp-test-enhancer` import `plugins/omp-config`。
- `plugins/omp-test-enhancer` import `plugins/writing-helper`。
- 三个插件共享 `src/shared` runtime 代码。

允许：

- 根目录脚本批量测试。
- 根目录脚本检查 marketplace。
- 根目录 README 引导安装。

## 迁移步骤

1. 在 `omp-enhancer` 根目录创建 monorepo 结构。
2. 把 `omp-writing-helper` 内容移动到 `plugins/writing-helper`。
3. 把 `omp-test-enhancer` 内容移动到 `plugins/omp-test-enhancer`。
4. 删除或停用两个子插件自己的 `.omp-plugin/marketplace.json`，改由根 catalog 管理。
5. 按映射表把 `omp-config` 拆入 `plugins/omp-config`。
6. 为 `plugins/omp-config` 新增 `package.json`、`index.js`、`src/doctor.js` 和测试。
7. 创建根 `.omp-plugin/marketplace.json`，列出三个插件。
8. 创建根 `package.json` workspace。
9. 跑写作插件测试。
10. 跑测试插件测试。
11. 跑配置插件测试。
12. 跑根目录 marketplace 检查。
13. 用本地 marketplace 一条命令安装三个插件并验证可单独启用。

## 验证命令

```bash
npm test -w plugins/writing-helper
npm test -w plugins/omp-config
npm test -w plugins/omp-test-enhancer
npm test
npm pack --dry-run -w plugins/writing-helper
npm pack --dry-run -w plugins/omp-config
npm pack --dry-run -w plugins/omp-test-enhancer
omp plugin marketplace add ./omp-enhancer
omp plugin install omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer
omp plugin upgrade
omp plugin list
```

已验证的现状：

- `omp-writing-helper` 在迁移前运行 `npm test`，82 个测试全部通过。
- `omp-test-enhancer` 已核对 README、package.json、marketplace.json 和 `src/extension.ts`，确认它注册一个命令和七个工具。

## 发布策略

三个插件版本独立。

第一版建议：

```text
omp-config 0.1.0
writing-helper 0.2.1
omp-testing-enhancer 0.1.3
```

根仓库可以使用统一 tag：

```text
v0.1.0
```

后续也可以使用插件名前缀 tag：

```text
omp-config-v0.1.0
writing-helper-v0.2.1
omp-testing-enhancer-v0.1.3
```

第一版建议先用统一 tag，减少 marketplace ref 管理成本。

## 不做事项

1. 不做总插件。
2. 不把三个插件合并为一个 extension。
3. 不让三个插件共享 runtime 代码。
4. 不让 `omp-config` 自动覆盖 `~/.omp`。
5. 不让 `writing-helper` 读取 OMP 全局配置。
6. 不让 `omp-test-enhancer` 读取写作插件或配置插件状态。
7. 不把 `omp-config` 的全局配置文件当成自动安装文件。
8. 不改变 `writing-helper` 的 citation 语义。
9. 不改变 `omp-test-enhancer` 的测试门禁语义。

## 结论

采用 monorepo 加三插件结构。

```text
plugins/omp-config
plugins/writing-helper
plugins/omp-test-enhancer
```

`omp-config` 做配置资产和配置检查。`writing-helper` 保持写作插件。`omp-test-enhancer` 保持测试插件。根目录只做 marketplace 和工作区管理。这个结构满足三个要求：放在一个仓库里维护，一条 OMP 安装命令安装所有插件，后续通过 marketplace upgrade 升级，同时三个插件互不干扰。
