# Optional image-generated node assets

Prefer a bundled OpenTikZ vector icon or a small code-native TikZ symbol. OMP's native imagegen capability is currently exposed as `generate_image`; use it only when the user benefits from custom node artwork that the vector catalog cannot supply.

## Authority and scope

- `generate_image` is optional. Main authorizes this optional external effect during initial setup after the semantic graph is fixed; `task` invokes `generate_image` only when the tool is exposed and the host permits the effect.
- Never ask `generate_image` to choose topology, edges, arrows, labels, or text. Generate one isolated icon or pictogram at a time with no lettering, diagram background, connector, or surrounding node frame.
- Keep generated art subordinate to the node's semantic ID. The TikZ source remains authoritative for node shape, label, position, size, and connections.
- Prefer vector icons. Image generation produces raster artwork unless its actual returned format proves otherwise; raster output stays raster, and never call, claim, or describe it as vector.

## Prepare and integrate

`task` runs `tikz_prepare_asset`, records the returned manifest entry, and gives it to `designer` for the next complete source revision; after that revision returns, `task` renders it and binds fresh evidence.

1. `task` writes a bounded prompt for a single icon: subject, simple silhouette, transparent or plain background, no text, no arrows, and the intended visual contrast.
2. After generation, `task` inspects the actual output and records its provider, model, prompt, dimensions, and format.
3. `task` uses `tikz_prepare_asset` when exposed and authorized to normalize a local PNG, JPEG, or WebP into a content-addressed PNG inside the project. It keeps the returned manifest and hash as provenance.
4. `designer` references only the project-relative normalized asset in the next source revision. It keeps the asset inside the node with adequate padding and places the TikZ label separately.
5. `task` renders that complete revision and checks legibility at full size and reduced size. If the raster blurs, dominates the node, or conflicts with the graph, `designer` replaces it with a vector or text-only fallback in a bounded revision.

Tool availability never creates permission or a required generation step. Do not download a remote asset or send project content to an image service without the host's normal authorization.
