---
name: svg-flowchart
description: Create and revise standalone monochrome SVG workflow diagrams with simple geometry, straight, dashed, or orthogonal connectors, deterministic source checks, and bounded designer and visioner render-review iteration. Use when the task is to create or revise an SVG flowchart, workflow box diagram, process diagram, block diagram, or similar black-and-white schematic.
---

# SVG flowchart

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or a separate explicitly capable
Main-selected Agent owns authorized effects.

Create a semantically correct, spacious, readable SVG. Within a selected diagram workflow, prefer a currently exposed `designer` as the SVG editor and a currently exposed `visioner` for independent review of fresh raster renders.

Agent availability and capacity remain Main decisions. Use `designer` and `visioner` only when currently exposed and a safe complete assignment can be formed; otherwise Main records the limitation and uses the workflow's direct fallback. Static and visual findings are evidence, not a plugin-owned repair or completion controller.

## Establish the flow model

1. Read project instructions, the diagram brief, existing style, output path, intended display size, and renderer.
2. Record the primary flow direction, node list, edge list, node labels, decision branches, edge directions, and the meaning of dashed lines before drawing.
3. Give every logical node, label, and connector a stable SVG `id`. Put a node ID on its shape or enclosing group so review findings can identify exact elements.
4. Resolve only ambiguities that materially change the process semantics or layout. Do not invent missing steps, decisions, or relationships.

## Author with designer

When Main selects an exposed `designer`, give that Agent ownership of SVG creation and revision with all of the following task-local constraints:

- Produce a valid standalone SVG with `xmlns`, a positive `viewBox`, `<title>`, and `<desc>`. Do not embed scripts, remote fonts, raster images, gradients, filters, masks, patterns, or external assets.
- Use only black (`#000` or `#000000`), white (`#fff` or `#ffffff`), and `fill="none"`.
- Use simple node shapes: rectangles, diamonds, circles, ellipses, and plain polygons. Avoid decorative or compound illustrations.
- Use `<line>` for a single straight connector and `<polyline>` for a multi-segment connector. Make every polyline segment horizontal or vertical.
- Use a consistent `stroke-dasharray` only when dashed lines carry a defined meaning. Use simple monochrome triangles for arrowheads.
- Use no Bézier curves, arcs, splines, curved connectors, or `<path>` elements.
- Use butt or square connector caps and miter joins; do not use rounded caps or rounded connector corners.
- Preserve every required node, label, branch, connector, direction, and dashed-line meaning from the flow model.

## Apply the layout baseline

- Keep at least a 32 px outer margin, 24 px between nodes, 16 px between a connector and an unrelated node or label, and 12 px internal text padding.
- Use 16 px minimum effective body text at the declared output size. Increase node size, wrap with explicit `<tspan>` rows, or simplify wording instead of shrinking text.
- Declare `font-size` directly on every `<text>` element, keep any `<tspan>` override at 16 px or larger, and use explicit coordinates instead of transforms.
- Keep text fully inside its owning shape and visually centered or deliberately aligned. Prevent text from touching borders or adjacent text.
- Terminate connectors visibly on the correct node boundary and confirm arrowheads are visible in the raster, not merely present in source. Route connectors around unrelated nodes and labels, and remove avoidable crossings.
- Keep sibling nodes aligned and spacing rhythm consistent. Prefer a larger `viewBox` over compressing a crowded diagram.

## Validate source and renders

Run the bundled checker before each visual review:

```bash
node <skill-directory>/scripts/check-svg-flowchart.mjs path/to/diagram.svg
```

The checker validates the basic SVG contract, palette, allowed elements, orthogonal polylines, and minimum declared text size. Fix its findings before rendering.

Render the current SVG revision at its full declared size and at 60% scale using the intended delivery renderer when known, otherwise an available local browser. Record the renderer with the evidence. If renderers disagree, verify the actual target and report the portability difference; prefer explicit triangle geometry when arrow markers must survive multiple renderers. Give both fresh raster renders, the SVG path, the flow model, and the revision identifier to `visioner`. Do not claim visual approval from source inspection or the static checker alone.

## Iterate with visioner

1. When exposed, have `designer` self-check the first render against the flow model and layout baseline.
2. When exposed, have `visioner` independently inspect the latest full-size and 60% renders for missing or incorrect flow, wrong arrow direction, overlap, text clipping, connector-node or connector-label collision, avoidable crossings, small text, cramped spacing, and unclear hierarchy.
3. Require `visioner` to return `APPROVED`, `CHANGES_REQUIRED`, or `UNREVIEWABLE`. Each finding must include severity, element IDs, visible region, violated criterion, impact, and requested correction.
4. Return `CHANGES_REQUIRED` to Main as advisory evidence. A supported finding selected for repair becomes a new bounded TODO checkpoint; Main may assign the affected geometry slice to an exposed `designer`, rerun the checker and renderer, and request at most one fresh affected review. Do not redispatch automatically. Do not review an unchanged artifact again.
5. If a material geometry issue remains, report its exact element IDs, impact, and limitation instead of claiming visual approval.

Report the static-check result and any visioner evidence tied to the final revision. No review verdict grants permission to publish or complete. Preserve review renders only when project convention or the user requires them.
