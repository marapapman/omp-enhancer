# TikZ Helper

TikZ Helper packages a pinned OpenTikZ snapshot, one `tikz-diagram` Skill, and opt-in tools for catalog discovery, ELK-driven diagram generation, generated-node-icon asset preparation, and bounded rendering. Figures are drawn from an ELK graph IR: the author encodes the semantic graph as sized nodes, edges, and graph-level `layoutOptions`, then `tikz_generate_diagram` computes every node position and edge geometry via elkjs and emits the TikZ source. The author never authors, infers, or hand-edits TikZ coordinates.
The ELK graph IR is the sole source of node positions and edge geometry. Author the semantic graph as an ELK IR and call tikz_generate_diagram to compute the layout with ELK. OpenTikZ is an icon and semantic reference source only. Its template geometry is never copied into a figure. Fix overlap, clipping, or crossings by changing ELK layout options or node sizes and regenerating, never by editing coordinates.

Use the `diagram.tikz` workflow for editable TikZ or LaTeX diagrams. Its normal available-Agent chain gives the complete design/source checkpoint to `designer`, lets `task` integrate and render that exact revision, and then gives fresh full-size and 60% renders to read-only `visioner`. If either matching Agent is unavailable, the result preserves the unfulfilled checkpoint or independent-review evidence gap instead of silently substituting Main evidence.

OMP's native `generate_image` can supply a missing node pictogram when it is currently enabled and the user and host authorize the provider and write effects. The plugin does not invoke imagegen itself. Generated files are copied out of temporary storage, normalized, hashed, and recorded in a separate project-local manifest; they are raster assets and are not OpenTikZ CC0 content or editable vectors.

## Optional tools

All tools are `defaultInactive`. Enable only this group in a session that needs the helpers:

```text
/enhancer-tools enable tikz
```

- `tikz_catalog_search` searches the bundled catalog and can return bounded source and edit-contract material for a selected item.
- `tikz_prepare_asset` runs fixed ImageMagick arguments under `exec` approval to normalize an authorized local PNG, JPEG, or WebP file into a project-local hash-named PNG and update its manifest.
- `tikz_render` validates a project-local TikZ source and runs fixed no-shell-escape compilation and conversion under OMP's normal `exec` approval.
- `tikz_generate_diagram` accepts an ELK graph IR, computes node positions and edge geometry via elkjs, and emits a compilable standalone TikZ source. Input nodes omit `x`/`y` and input edges omit `sections`/`bendPoints`; the layout engine computes them. It is the sole tool that produces figure geometry.

The plugin declares one npm runtime dependency, `elkjs` (the ELK layout engine behind `tikz_generate_diagram`). Because `omp plugin install` does not fetch dependencies, run `npm run install:deps` (or call `omp_core_install_deps`) once after install or upgrade to place `elkjs` in the plugin cache. Asset normalization requires ImageMagick on `PATH`: Windows requires `magick`, while other platforms try `magick` and then `convert`. Rendering currently uses fixed `latexmk -pdf` (pdfLaTeX) mode and requires `latexmk`, `dvisvgm`, and `pdftocairo` on `PATH`. A missing executable, incompatible input/source, TeX package, or uninstalled `elkjs` is returned as a structured limitation; the plugin never substitutes a project-supplied command.

Activation exposes schemas only. It grants no filesystem, command, provider, network, or publication permission. Tool findings and visual review remain advisory.

## OpenTikZ snapshot

Runtime use is offline and deterministic. `vendor/opentikz/UPSTREAM_LOCK.json` records the exact upstream commit and file hashes. Vendored build code retains its MIT license; graphic source, metadata, and previews retain CC0-1.0. Brand icons retain their upstream trademark notice. The snapshot supplies icons and semantic examples only; figure geometry is drawn from an ELK graph IR via `tikz_generate_diagram`, never copied from an OpenTikZ template. Never edit vendored files in place; copy a selected icon source into the user project first when you reuse it as an icon or semantic reference.

See [the detailed architecture and E2E plan](../../docs/TIKZ_PLUGIN.md) for the semantic figure contract, imagegen boundary, security model, and validation matrix.
