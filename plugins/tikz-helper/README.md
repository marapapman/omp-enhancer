# TikZ Helper

TikZ Helper packages a pinned OpenTikZ snapshot, one `tikz-diagram` Skill, and opt-in tools for catalog discovery, generated-node-icon asset preparation, and bounded rendering.

Use the `diagram.tikz` workflow for editable TikZ or LaTeX diagrams. It builds a semantic node-and-edge specification first, copies an OpenTikZ template into the user project, keeps labels and topology in TikZ, renders the current revision, and uses independent visual evidence when a matching reviewer is available.

OMP's native `generate_image` can supply a missing node pictogram when it is currently enabled and the user and host authorize the provider and write effects. The plugin does not invoke imagegen itself. Generated files are copied out of temporary storage, normalized, hashed, and recorded in a separate project-local manifest; they are raster assets and are not OpenTikZ CC0 content or editable vectors.

## Optional tools

All tools are `defaultInactive`. Enable only this group in a session that needs the helpers:

```text
/enhancer-tools enable tikz
```

- `tikz_catalog_search` searches the bundled catalog and can return bounded source and edit-contract material for a selected item.
- `tikz_prepare_asset` runs fixed ImageMagick arguments under `exec` approval to normalize an authorized local PNG, JPEG, or WebP file into a project-local hash-named PNG and update its manifest.
- `tikz_render` validates a project-local TikZ source and runs fixed no-shell-escape compilation and conversion under OMP's normal `exec` approval.

Asset normalization requires ImageMagick on `PATH`: Windows requires `magick`, while other platforms try `magick` and then `convert`. The plugin has no npm runtime dependency. Rendering currently uses fixed `latexmk -pdf` (pdfLaTeX) mode and requires `latexmk`, `dvisvgm`, and `pdftocairo` on `PATH`. A missing executable, incompatible input/source, or TeX package is returned as a structured limitation; the plugin never substitutes a project-supplied command.

Activation exposes schemas only. It grants no filesystem, command, provider, network, or publication permission. Tool findings and visual review remain advisory.

## OpenTikZ snapshot

Runtime use is offline and deterministic. `vendor/opentikz/UPSTREAM_LOCK.json` records the exact upstream commit and file hashes. Vendored build code retains its MIT license; graphic source, metadata, and previews retain CC0-1.0. Brand icons retain their upstream trademark notice. Never edit vendored files in place; copy a selected source into the user project first.

See [the detailed architecture and E2E plan](../../docs/TIKZ_PLUGIN.md) for the semantic figure contract, imagegen boundary, security model, and validation matrix.
