# omp-enhancer

Monorepo marketplace for OMP enhancement plugins.

## Plugins

- `omp-config`: OMP configuration assets, agents, skills, hooks, model override templates, and config diagnostics.
- `writing-helper`: OMP writing helper with logic checks, quality checks, citation verification, writer/checker agents, and writing skills.
- `omp-testing-enhancer`: Test workflow support for OMP agents.

## Workspace

This repository uses npm workspaces for plugin packages under `plugins/`:

- `plugins/omp-config`
- `plugins/writing-helper`
- `plugins/omp-test-enhancer`

## Marketplace

The marketplace catalog lives at `.omp-plugin/marketplace.json` and uses `metadata.pluginRoot: "plugins"`.

Install all plugins from the marketplace with:

```sh
omp plugin install omp-config@omp-enhancer writing-helper@omp-enhancer omp-testing-enhancer@omp-enhancer
```

Check the marketplace catalog with:

```sh
npm run check:marketplace
```
