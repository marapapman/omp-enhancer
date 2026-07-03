# omp-enhancer

This repository is an OMP marketplace monorepo containing four plugins. `omp-enhancer-core` is the runtime router. The other plugins provide config assets, writing tools, and testing tools.

## Plugins

- `omp-enhancer-core`: routes natural-language coding, writing, testing, and config tasks without slash commands.
- `omp-config`: packages OMP config assets, agents, skills, hooks, templates, and safe diagnostics.
- `writing-helper`: provides writing QA tools, writer/checker agents, and writing skills.
- `omp-testing-enhancer`: provides test analysis, browser evidence, coverage, mutation, gates, and reports.

## Workspace

This repository uses npm workspaces for plugin packages under `plugins/`:

- `plugins/omp-enhancer-core`
- `plugins/omp-config`
- `plugins/writing-helper`
- `plugins/omp-test-enhancer`

## Marketplace

The marketplace catalog lives at `.omp-plugin/marketplace.json` and uses `metadata.pluginRoot: "plugins"`.

## Install

Add the marketplace once:

```bash
omp plugin marketplace add marapapman/omp-enhancer
```

Install all four plugins with one OMP command:

```bash
omp plugin install omp-enhancer-core@omp-enhancer omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer
```

## Automatic routing

After installing `omp-enhancer-core`, describe the task naturally. The core plugin injects routing guidance and completion gates through runtime hooks.

- Coding tasks use lightweight TDD guidance, reviewer routing, and testing evidence.
- Writing tasks route to writer/checker or zh-writer/zh-checker, require writing skills, and require writing QA evidence.
- Chinese writing requires `plain-chinese-writing`.
- Testing tasks route through `omp_test_analyze`, `omp_test_context`, `omp_test_gate`, and `omp_test_report`. Browser, coverage, and mutation tools are used when the target context provides them.
- Config tasks use `omp_config_doctor`, `omp_config_assets`, and `omp_config_plan`.

Slash commands remain compatibility helpers for older workflows. The new workflow does not require `/test`, `/writing-quality`, or any other command prefix.

Upgrade all installed marketplace plugins with the validated command:

```bash
omp plugin upgrade
```

For targeted control, upgrade each plugin individually:

```bash
omp plugin upgrade omp-enhancer-core@omp-enhancer
omp plugin upgrade omp-config@omp-enhancer
omp plugin upgrade writing-helper@omp-enhancer
omp plugin upgrade omp-testing-enhancer@omp-enhancer
```

## Validation

Check the marketplace catalog with:

```bash
npm run check:marketplace
```
