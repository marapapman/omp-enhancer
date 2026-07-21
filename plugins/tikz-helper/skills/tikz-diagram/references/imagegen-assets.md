# Optional image-generated node assets

Prefer a bundled OpenTikZ vector icon or a small code-native TikZ symbol. OMP's native imagegen capability is currently exposed as `generate_image`; use it only when the user benefits from custom node artwork that the vector catalog cannot supply.

## Authority and scope

- `generate_image` is optional. Main alone chooses whether to invoke it after the semantic graph is fixed and only when the tool is exposed and the host permits the effect.
- Never ask `generate_image` to choose topology, edges, arrows, labels, or text. Generate one isolated icon or pictogram at a time with no lettering, diagram background, connector, or surrounding node frame.
- Keep generated art subordinate to the node's semantic ID. The TikZ source remains authoritative for node shape, label, position, size, and connections.
- Prefer vector icons. Image generation produces raster artwork unless its actual returned format proves otherwise; raster output stays raster, and never call, claim, or describe it as vector.

## Prepare and integrate

1. Write a bounded prompt for a single icon: subject, simple silhouette, transparent or plain background, no text, no arrows, and the intended visual contrast.
2. After generation, inspect the actual output and record its provider, model, prompt, dimensions, and format.
3. Use `tikz_prepare_asset` when exposed and authorized to normalize a local PNG, JPEG, or WebP into a content-addressed PNG inside the project. Keep the returned manifest and hash as provenance.
4. Reference only the project-relative normalized asset. Keep it inside the node with adequate padding and place the TikZ label separately.
5. Render and check legibility at full size and reduced size. If the raster blurs, dominates the node, or conflicts with the graph, replace it with a vector or text-only fallback.

Tool availability never creates permission or a required generation step. Do not download a remote asset or send project content to an image service without the host's normal authorization.
