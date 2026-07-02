# omp-enhancer

This repository is an OMP marketplace monorepo containing three independent plugins.

## Plugins

- `omp-config`
- `writing-helper`
- `omp-testing-enhancer`

## Workspace

This repository uses npm workspaces for plugin packages under `plugins/`:

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

Install all three plugins with one OMP command:

```bash
omp plugin install omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer
```

Upgrade all installed marketplace plugins with the validated command:

```bash
omp plugin upgrade
```

For targeted control, upgrade each plugin individually:

```bash
omp plugin upgrade omp-config@omp-enhancer
omp plugin upgrade writing-helper@omp-enhancer
omp plugin upgrade omp-testing-enhancer@omp-enhancer
```

## Validation

Check the marketplace catalog with:

```bash
npm run check:marketplace
```
