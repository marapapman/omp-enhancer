# Mermaid Helper

Mermaid Helper packages the `mermaid-diagram` Skill and the active-by-default `mermaid_render` tool for bounded Mermaid rendering. Diagrams are authored as Mermaid source: the author encodes the semantic graph as stable node IDs, labeled edges, and branch conditions, then `mermaid_render` validates the source and converts it to a revision-bound SVG with pinned mermaid-cli. The author never hand-edits SVG coordinates. The Mermaid source is the sole source of node positions and edge geometry.

Use the consolidated `visual` workflow for editable Mermaid diagrams. Its normal chain gives the complete design/source checkpoint to `designer`, which authors the Mermaid source in one pass; `mermaid_render` renders that exact source; and Main performs a simple check of the rendered SVG before delivery. If the `designer` Agent is unavailable, the result records the unfulfilled design checkpoint instead of silently substituting Main evidence.

The plugin registers one tool that is active by default when the extension is loaded. No slash-command activation is required.

- `mermaid_render` validates Mermaid source (inline string or project `.mmd`/`.md` file) and runs the pinned mermaid-cli in an isolated temporary workspace with offline, sandboxed headless Chrome, then publishes revision-bound SVG evidence under OMP's normal `exec` approval. Mermaid diagrams are authored as code first; the tool never accepts or edits SVG coordinates.

Mermaid rendering requires the npm dependencies `@mermaid-js/mermaid-cli` and `puppeteer`; run `npm install` at the repository root once to place them and download headless Chrome. Rendering is fully offline (`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost`) with `--no-sandbox` and `--disable-setuid-sandbox` launch flags for WSL2/root environments, and the HTML label/text metrics are pinned (`htmlLabels: false`, fixed font family) so revisions are deterministic. If mermaid-cli is missing, `mermaid_render` returns `MERMAID_NOT_INSTALLED` with install instructions. The Chrome probe follows env override → PATH scan → puppeteer cache: `PUPPETEER_EXECUTABLE_PATH` wins when set to a usable executable (it is executability-checked like every candidate).

Tool visibility is active by default. The tool's approval level (exec) is enforced by the OMP host runtime. Tool findings remain advisory.

See [the Mermaid pipeline contract](../../docs/MERMAID_PIPELINE.md) for the tool surface, artifact contract, and error codes.
