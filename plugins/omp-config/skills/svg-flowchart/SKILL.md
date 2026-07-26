---
name: svg-flowchart
description: Produce black-and-white, readable, reviewable SVG assets as node icons for diagram.tikz. Use when a diagram.tikz figure needs a simple monochrome SVG icon asset, an orthogonal flowchart pictogram, or a static SVG preview for compatibility. Final layout and whole-figure output belong to diagram.tikz.
---

# SVG flowchart (icon asset method)

This Skill is an **asset method** under `diagram.tikz`. It produces black-and-white, readable, reviewable SVG assets that become node icons in a TikZ figure. It does not author standalone diagrams, own figure layout, or replace the TikZ main figure. Final layout, whole-figure geometry, and the compiled/printed output belong to `diagram.tikz` and its ELK-driven `tikz_generate_diagram` tool.

When this Skill is part of a `writer` or `zh-writer` assignment, that child remains proposal-only: it runs no command and writes no file, and returns the complete proposed artifact or diff. Main or a separate explicitly capable Main-selected Agent owns authorized effects.

SVG is one of three acceptable roles here, never a replacement for the TikZ primary:

1. **Icon asset** — a small monochrome SVG pictogram embedded as a node icon in the TikZ figure.
2. **Preview** — a static SVG render used as compatibility or review evidence for a TikZ figure.
3. **Compatibility supplement** — an SVG export that mirrors the TikZ figure for tools that cannot consume PDF/PNG.

SVG (or any other non-TikZ format) is never used to replace the TikZ main figure, own node positions, or carry the figure topology. Topology, labels, connectors, and geometry remain TikZ.

Within a selected `diagram.tikz` workflow, prefer a currently exposed `designer` as the SVG icon editor and a currently exposed `visioner` for independent review of fresh raster renders of the icon asset.

Agent availability and capacity remain Main decisions. Use `designer` and `visioner` only when currently exposed and a safe complete assignment can be formed; otherwise Main records the limitation and uses the workflow's direct fallback. Static and visual findings are evidence, not a plugin-owned repair or completion controller.

## Establish the icon asset model

1. Read project instructions, the diagram brief, the owning TikZ figure's node list, the intended display size of the icon, the renderer, and the output path inside the user project.
2. Record the target node ID, the icon's role in the figure, the pictogram meaning, the required square aspect ratio, and the intended embedding size before drawing.
3. Give the icon's shape or enclosing group a stable SVG `id` derived from the owning node ID so review findings can identify the exact element.
4. Resolve only ambiguities that materially change the icon semantics. Do not invent missing nodes, edges, or figure topology — those belong to `diagram.tikz`.

## Author with designer

When Main selects an exposed `designer`, that `designer` owns one complete SVG icon asset revision and every bounded repair revision, with all of the following task-local constraints:

- Produce a valid standalone SVG with `xmlns`, a positive square `viewBox`, `<title>`, and `<desc>`. Do not embed scripts, remote fonts, raster images, gradients, filters, masks, patterns, or external assets.
- Use only black (`#000` or `#000000`), white (`#fff` or `#ffffff`), and `fill="none"`.
- Use simple node shapes: rectangles, diamonds, circles, ellipses, and plain polygons. Avoid decorative or compound illustrations.
- Use `<line>` for a single straight connector and `<polyline>` for a multi-segment connector. Make every polyline segment horizontal or vertical.
- Use a consistent `stroke-dasharray` only when dashed lines carry a defined meaning. Use simple monochrome triangles for arrowheads.
- Use no Bézier curves, arcs, splines, curved connectors, or `<path>` elements.
- Use butt or square connector caps and miter joins; do not use rounded caps or rounded connector corners.
- Preserve the icon's semantic meaning and the node ID binding from the icon asset model.

## Apply the layout baseline

- Keep at least a 32 px outer margin, 24 px between internal elements, 16 px between a connector and an unrelated element or label, and 12 px internal text padding.
- Use 16 px minimum effective body text at the declared output size. Increase the icon size, wrap with explicit `<tspan>` rows, or simplify wording instead of shrinking text.
- Declare `font-size` directly on every `<text>` element, keep any `<tspan>` override at 16 px or larger, and use explicit coordinates instead of transforms.
- Keep text fully inside its owning shape and visually centered or deliberately aligned. Prevent text from touching borders or adjacent text.
- Terminate connectors visibly on the correct element boundary and confirm arrowheads are visible in the raster, not merely present in source.
- Keep the icon balanced inside its square `viewBox` with consistent spacing rhythm. Prefer a larger `viewBox` over compressing a crowded icon.

## Validate source and renders

`task` runs the bundled checker before each visual review. The checker is for **SVG icon asset static validation only** — it does not validate figure layout, topology, or whole-figure semantics, which belong to `diagram.tikz`.

```bash
node <skill-directory>/scripts/check-svg-flowchart.mjs path/to/icon.svg
```

The checker validates the basic SVG contract, palette, allowed elements, orthogonal polylines, and minimum declared text size. `designer` fixes its source findings before rendering.

`task` renders the current SVG icon revision using the intended delivery renderer when known, otherwise an available local browser. Task binds the SVG path, icon asset model, and revision identifier to both the full declared size and 60% raster outputs as one fresh evidence set. If renderers disagree, verify the actual target and report the portability difference; prefer explicit triangle geometry when arrow markers must survive multiple renderers. Give that fresh evidence set to `visioner`. Do not claim visual approval from source inspection or the static checker alone.

## Iterate with visioner

1. When exposed, have `designer` self-check the first render against the icon asset model and layout baseline.
2. When exposed, have `visioner` independently inspect only the fresh latest full-size and 60% renders for missing or incorrect icon semantics, wrong arrow direction, overlap, text clipping, connector-element collision, avoidable crossings, small text, cramped spacing, and unclear hierarchy.
3. Require `visioner` to return `APPROVED`, `CHANGES_REQUIRED`, or `UNREVIEWABLE`. Each finding must include severity, element IDs, visible region, violated criterion, impact, and requested correction.
4. Treat `CHANGES_REQUIRED` as advisory evidence. For a supported finding, `designer` applies a bounded source revision, `task` reruns the checker and rerenders it, and `visioner` reviews only fresh rerendered evidence, at most once for that changed revision. Do not redispatch automatically. Do not review an unchanged artifact again.
5. If a material geometry issue remains, report its exact element IDs, impact, and limitation instead of claiming visual approval.

Report the static-check result and any visioner evidence tied to the final icon revision. No review verdict grants permission to publish or complete. Preserve review renders only when project convention or the user requires them.

Main only authorizes external effects during initial setup and accepts final delivery; it does not check, render, modify, reconcile, or mediate the visual loop. Final figure layout, node positions, edge geometry, and whole-figure output remain the responsibility of `diagram.tikz`.