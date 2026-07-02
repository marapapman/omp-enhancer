# Marketplace Upgrade Design

## 背景

`omp-testing-enhancer` 现在通过 `package.json` 的 `omp.extensions` 声明扩展入口。用户可以用 GitHub 地址或本地 `link` 安装，但普通 GitHub 安装不能使用 `omp plugin upgrade`。OMP 当前把 `omp plugin upgrade` 绑定到 marketplace 插件，命令目标必须是 `name@marketplace`。

目标是修改本项目的安装和发布流程，让用户可以通过 marketplace 安装本插件，并用下面的命令升级。

```bash
omp plugin upgrade omp-testing-enhancer@omp-test-enhancer
```

## 已确认约束

1. marketplace 名称使用 `omp-test-enhancer`。
2. 插件名称继续使用 `omp-testing-enhancer`，保持和 `package.json` 的 `name` 一致。
3. marketplace catalog 放在 `.omp-plugin/marketplace.json`。
4. catalog 的插件来源使用 GitHub source，仓库为 `marapapman/omp-test-enhancer`。
5. catalog 的 `source.ref` 必须指向当前 release tag，例如 `v0.1.1`。
6. catalog 的插件 `version` 必须和 `package.json` 的 `version` 一致。
7. package manifest 的 `omp.extensions` 必须指向仓库里发布后可直接加载的 TypeScript 入口 `./src/extension.ts`，不能依赖 release 用户本地构建 `dist`。
8. `package.json` 的 `files` 必须包含 `src` 和 `.omp-plugin`，保证 npm 或 git pack 形式也能带上运行入口和 catalog。
9. README 默认推荐 marketplace 安装和升级流程。
10. 现有本地开发 `omp plugin link .` 流程保留。
11. 不引入运行时依赖。
12. 实现前必须先写失败测试。

## 设计

### Marketplace catalog

新增 `.omp-plugin/marketplace.json`。内容采用 OMP marketplace schema。

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "omp-test-enhancer",
  "owner": {
    "name": "marapapman"
  },
  "metadata": {
    "description": "OMP plugins published by marapapman for test workflow support.",
    "version": "1.0.0"
  },
  "plugins": [
    {
      "name": "omp-testing-enhancer",
      "description": "Help OMP agents write and check tests with target analysis, public API context, quality gates, and reports.",
      "version": "0.1.1",
      "category": "development",
      "homepage": "https://github.com/marapapman/omp-test-enhancer",
      "repository": "https://github.com/marapapman/omp-test-enhancer",
      "source": {
        "source": "github",
        "repo": "marapapman/omp-test-enhancer",
        "ref": "v0.1.1"
      }
    }
  ]
}
```

这个 catalog 让 OMP 能把本仓库作为 marketplace 加入，然后以 `omp-testing-enhancer@omp-test-enhancer` 作为插件 ID 安装和升级。

### Extension 入口

当前 manifest 指向 `./dist/extension.js`。这个入口适合构建后的 npm 包，但 marketplace 的 GitHub source 更接近按 release tag 取仓库内容。为了避免用户安装后还要本地构建，manifest 改为指向 `./src/extension.ts`。OMP 的 extension loader 支持加载 `.ts` 和 `.js` 模块，项目已有源码入口可以直接复用。

`package.json` 的 `files` 同步加入 `src` 和 `.omp-plugin`。这样 npm pack、git pack 和 marketplace source 都能拿到同一套入口和 catalog。

### Release 同步脚本

新增 `scripts/sync-marketplace-release.ts`。脚本读取 `package.json` 的 `version`，计算 release tag `v${version}`，并更新 `.omp-plugin/marketplace.json` 中的两个字段。

1. `plugins[0].version`
2. `plugins[0].source.ref`

脚本只处理当前项目的单插件 catalog。这样更简单，也避免引入不需要的抽象。

`package.json` 增加脚本。

```json
{
  "scripts": {
    "sync:marketplace": "bun scripts/sync-marketplace-release.ts"
  }
}
```

发版前运行：

```bash
bun run sync:marketplace
```

### README 安装流程

README 的默认安装流程改为：

```bash
omp plugin marketplace add marapapman/omp-test-enhancer
omp plugin install omp-testing-enhancer@omp-test-enhancer
```

升级流程改为：

```bash
omp plugin marketplace update omp-test-enhancer
omp plugin upgrade omp-testing-enhancer@omp-test-enhancer
```

README 保留本地开发安装流程。

### 测试

新增测试覆盖五件事。

1. `.omp-plugin/marketplace.json` 是有效 JSON，marketplace 名称、插件名、source repo、source ref 都正确。
2. catalog 里的插件版本和 `package.json` 版本一致，`source.ref` 等于 `v${packageJson.version}`。
3. `package.json` 的 `omp.extensions` 指向 `./src/extension.ts`，`files` 包含 `src` 和 `.omp-plugin`。
4. 同步脚本可以在版本变化时更新 catalog 的 `version` 和 `source.ref`。
5. README 包含 marketplace 安装和升级命令。

测试放在 `tests/unit/marketplace/marketplaceCatalog.test.ts`。同步脚本的核心逻辑应暴露为纯函数，测试不需要写真实项目文件。脚本入口只负责读写文件。

## 风险

OMP 文档说明 marketplace 插件不会加载 `package.json` 里的 `omp.extensions`。但 OMP 示例 marketplace 又使用了带 `omp.extensions` 的插件目录。实现阶段必须做 smoke 验证。如果 marketplace 安装后无法加载 extension，这个项目无法单独解决，需要 OMP 核心支持 marketplace extension 加载。

本设计仍然先实现 catalog 和升级流程，因为 `omp plugin upgrade` 的命令模型已经确定依赖 marketplace ID。实现后通过测试和手动 dry run 确认命令流程是否能走通。

## 验收标准

1. 仓库包含 `.omp-plugin/marketplace.json`。
2. `package.json` 的 `omp.extensions` 指向 `./src/extension.ts`。
3. `package.json` 的 `files` 包含 `src` 和 `.omp-plugin`。
4. `bun run sync:marketplace` 会把 catalog 同步到 `package.json` 当前版本。
5. README 默认安装命令为 marketplace 安装。
6. README 升级命令包含 `omp plugin upgrade omp-testing-enhancer@omp-test-enhancer`。
7. 新增测试先失败，再通过实现变绿。
8. `bun run test` 通过。
9. `bun run typecheck` 通过。
