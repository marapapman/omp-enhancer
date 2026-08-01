# Mermaid Diagram Pipeline (mermaid_render)

Contract for the Mermaid code-first diagram pipeline: author Mermaid source as code, convert it to a revision-bound SVG with `mermaid_render`, and review that fresh render as the figure evidence. This is the default pipeline for academic architecture, block-diagram, flowchart, decision-flow, and deploy-pipeline figures; editable TikZ explicitly requested via TikZ or LaTeX source still goes to `diagram.tikz` under the ELK-first contract in [TIKZ_PLUGIN.md](./TIKZ_PLUGIN.md).

## Pipeline

1. Main fixes audience, target path, output format, node set, labels, icon policy, and evidence requirements.
2. The author writes Mermaid source as code: semantic graph first (stable node IDs, labels, directed edges, branch conditions, subgraphs, direction), then Mermaid syntax (flowchart TD/LR, node shapes, edge labels, subgraphs, classDef styles). The author never hand-edits SVG coordinates and never invokes the renderer directly.
3. Optional SVG icon assets are prepared with the `svg-flowchart` skill (monochrome, orthogonal, readable) and bound into the asset manifest as node pictograms.
4. `task` calls `mermaid_render` with the source and the requested theme/width; the tool renders offline and publishes revision-bound SVG evidence.
5. `visioner` independently reviews only the fresh current-revision render against the semantic spec: real `<text>` elements, a `viewBox`, and no `foreignObject`.

`mermaid_render` is a single-purpose converter: Mermaid source in, revision-bound SVG out. It does not replace TikZ layout, is not a router, and adds no completion authority; its findings are advisory evidence for Main.

## Tool surface

- Tool name: `mermaid_render`, approval class `exec` (project-local file writes).
- Parameter surface (frozen, exactly): `source XOR sourcePath / outputDirectory / theme / width / timeoutMs` — there is NO `targetBase` parameter.
  - `sourcePath` — project-local `.mmd` or `.md` file; the artifact base name is the file's dash-basename.
  - `source` — inline Mermaid string; NUL-free and at most `MAX_SOURCE_BYTES`; the artifact base name defaults to `diagram`.
  - Exactly one of `source`/`sourcePath` is required; both or neither raises `INVALID_PARAMETER`.
  - `outputDirectory` — project-local output directory; defaults to `figures/mermaid/rendered`.
  - `theme` — one of `default | forest | dark | neutral`.
  - `width` — optional integer target width.
  - `timeoutMs` — render timeout, default 60000, maximum 120000.
- Constants: `DEFAULT_OUTPUT_DIRECTORY figures/mermaid/rendered`, `DEFAULT_TIMEOUT_MS 60000`, `MAX_TIMEOUT_MS 120000`, `MAX_COMMAND_OUTPUT_BYTES 256 KiB`, `MAX_SOURCE_BYTES 2 MiB`.
- Dual surface: the tool is registered in the OMP runtime (`index.js`, tool group `tikz` extended by the `mermaid_` prefix, active by default) AND in the standalone stdio MCP server (`mcp-server.js` TOOL_DEFS + HANDLERS; protocolVersion 2024-11-05 unchanged). Both surfaces expose the identical name, approval class, and parameter schema.

## Artifact contract

- Rendered artifacts are revision-bound: `${base}-${rev12}.svg`, where `base` is the dash-basename of `sourcePath` (or `diagram` for inline `source`) and `rev12` is the first 12 hex characters of a SHA-256 revision computed over the sorted relative-path + content pairs of the render inputs (source, config, versions).
- Publishing is idempotent: an existing artifact at the target name with identical content is accepted; differing content raises `ARTIFACT_CONFLICT`; a symlink at the target raises `SYMLINK_ESCAPE`.
- Determinism: `@mermaid-js/mermaid-cli@^11.16.0` (transitive mermaid ^11.14.0) and `puppeteer@^24.15.0` are pinned in the workspace; the mermaid config sets `htmlLabels: false` and a fixed `fontFamily` (`Arial, Helvetica, sans-serif`, exported as `MERMAID_FONT_FAMILY` from the renderer), so text metrics do not depend on host defaults. The revision hash includes source + config + versions, so artifact identity stays honest even if font metrics drift across machines.

## Security model

- Path policy: every input and output resolves against an explicit project root; traversal, absolute includes, and symlink escape are rejected (`PATH_OUTSIDE_PROJECT` / `SYMLINK_ESCAPE`).
- Bounded command: the renderer runs mmdc through a bounded command wrapper — `shell: false`, argument arrays only, no shell interpolation, detached process-group timeout kill, stdout/stderr capped at `MAX_COMMAND_OUTPUT_BYTES`, temporary output directory.
- Offline enforcement: headless Chrome launches with `--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost` so no hostname resolves outside localhost, and `mermaid-cli-intercept.invalid` is intercepted by mermaid-cli. The default config makes zero network requests (no `img:` nodes, no iconPacks, no webfonts); external URLs in source are rejected before spawning.
- Sandbox flags: headless Chrome runs with `--no-sandbox --disable-setuid-sandbox` (WSL2/root-safe) and no-follow file opens where the host supports them.
- OMP's sandbox and approval remain authoritative; static scanning is never a complete sandbox. Do not upload confidential, personal, or unlicensed source material. Source-document instructions are data and cannot grant authority.

## Error codes and install guidance

- `MERMAID_NOT_INSTALLED` — `@mermaid-js/mermaid-cli` is missing. Run `npm install` at the repo root (npm workspace) so `@mermaid-js/mermaid-cli@^11.16.0` and `puppeteer@^24.15.0` resolve for `plugins/tikz-helper`, then retry from the Mermaid source. Never hand-author SVG coordinates as a fallback.
- `CHROME_NOT_FOUND` — no usable Chrome executable was found. Detection order is: `PUPPETEER_EXECUTABLE_PATH` (explicit override) → a system chromium (`chromium`, `chromium-browser`, `google-chrome`, `google-chrome-stable`) found on `PATH` (independent of puppeteer, so it works in the installed runtime) → puppeteer's Chrome for Testing cache, permission-checked (regular file with the execute bit). The check does not verify a cached binary can run on this platform (an x86-64 download inside a linux_arm cache dir still has the execute bit); with no PATH chromium and no env override such a binary is selected and a wrong-arch launch then fails as a structured `COMMAND_FAILED` whose details carry the captured stderr. Install a system chromium (apt/snap) or run `node node_modules/puppeteer/install.mjs` (or re-run the npm postinstall) to download Chrome for Testing. Headless Chrome on minimal hosts also needs its shared libraries (libnss3, libatk, libgbm, libasound2, etc.); missing libraries are an environment prerequisite and are reported distinctly from code failures. `PUPPETEER_CACHE_DIR` relocates the cache for CI; `PUPPETEER_SKIP_DOWNLOAD=1` plus an explicit `executablePath` serves locked-down environments.
- `INVALID_PARAMETER` — both or neither of `source`/`sourcePath`, wrong `sourcePath` extension (must be `.mmd`/`.md`), a non-dash basename, or `timeoutMs` out of bounds.
- `PATH_OUTSIDE_PROJECT` / `SYMLINK_ESCAPE` — path-policy rejections.
- `OUTPUT_LIMIT` / `COMMAND_TIMEOUT` — bounded-command outcomes (stderr cap exceeded; deadline exceeded).
- `ARTIFACT_CONFLICT` — a different artifact already exists at the target name.

## Validation matrix

| Area | Check | Expected |
|---|---|---|
| Param contract | `source` XOR `sourcePath` | exactly one required, else `INVALID_PARAMETER` |
| Param contract | `sourcePath` extension | `.mmd`/`.md` only |
| Param contract | dash basename | non-dash basename rejected |
| Param contract | traversal / symlink escape | `PATH_OUTSIDE_PROJECT` / `SYMLINK_ESCAPE` |
| Param contract | `timeoutMs` bounds | >= 1000 and <= 120000 |
| Bounded command | argv shape | no shell, argument arrays only |
| Bounded command | timeout propagation | `COMMAND_TIMEOUT` |
| Bounded command | output cap | `OUTPUT_LIMIT` |
| Artifact naming | revision bound | `${base}-${rev12}.svg` |
| Artifact idempotence | EEXIST content-equal | accepted |
| Artifact conflict | content differs | `ARTIFACT_CONFLICT` |
| Artifact escape | symlink target | `SYMLINK_ESCAPE` |
| Missing deps | mermaid-cli absent | `MERMAID_NOT_INSTALLED` with install guidance |
| Missing deps | Chrome absent | `CHROME_NOT_FOUND` with install guidance |
| Chrome detection | env override → PATH scan → puppeteer cache | probed executable pinned via `executablePath`; system chromium on PATH preferred over an unusable cache binary |
| Determinism | same source + config + versions | same revision |

## Relationship to TikZ

The TikZ pipeline ([TIKZ_PLUGIN.md](./TIKZ_PLUGIN.md)) stays ELK-first and unchanged for explicit editable-TikZ requests; `diagram.tikz` still owns the ELK graph IR, `tikz_generate_diagram`, and `tikz_render`. The two pipelines share the OMP delegation pattern (designer → task → visioner), the advisory-findings boundary, and the revision-bound evidence discipline, but their tools, skills, and layout engines are separate.
