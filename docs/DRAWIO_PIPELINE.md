# Draw.io Diagram Pipeline (drawio MCP)

Contract for the draw.io XML diagram pipeline: author the complete draw.io XML in one pass, verify geometry with the bundled `check-drawio-layout.mjs` checker, call the drawio MCP (`create_diagram` on the hosted app server or `open_drawio_xml` on the local `@drawio/mcp` tool server) for server-side validation and render evidence, and have `visioner` review fresh current-revision rendered evidence read-only. This is the default and only pipeline for architecture, block-diagram, flowchart, decision-flow, and deploy-pipeline figures. The Mermaid and SVG diagram pipelines are retired: never hand-edit SVG or Mermaid for these figures.

## Pipeline

1. Main fixes audience, target path (`.drawio`), page size, node set, labels, icon policy, and evidence requirements.
2. `designer` authors the complete draw.io XML in one pass: semantic graph first (stable node IDs, roles, exact labels, directed edges, branch conditions, groups, flow direction), then one `<mxfile>` document with `<mxGraphModel>` → `<root>`, the two sentinel cells (`<mxCell id="0"/>` and `<mxCell id="1" parent="0"/>`), one `<mxCell vertex="1" parent="1">` per node and one `<mxCell edge="1" parent="1">` per edge. Stable IDs survive revisions so findings map to exact elements. The author never hand-edits rendered output.
3. `task` runs the bundled static geometry checker before opening the diagram:

```bash
node <skill-directory>/scripts/check-drawio-layout.mjs path/to/figure.drawio
```

   Fix every ERROR (box overlap, edge crossing a box, edge-edge overlap, font below 14, text-overflow estimate, non-perpendicular attachment) before rendering; treat WARNINGs (tight gutter, parallel edges too close, small arrowhead) as review items.
4. `task` calls the drawio MCP with that exact XML for server-side validation and render evidence (see Tool surface). The tool response is an acceptance echo, not a layout verdict.
5. `visioner` reviews fresh current-revision rendered evidence read-only — the MCP Apps inline render or the diagram opened in the draw.io editor — plus the checker report. Visioner does not edit the XML.
6. Main retains setup authorization and final acceptance only. Layout findings are advisory evidence for Main.

## Layout contract

Non-negotiable geometry rules (the checker maps one-to-one to these):

- **Grid and gutter**: every coordinate snapped to the 10 px grid; at least 24 px between any two boxes and between every box and every edge corridor (parallel edges keep ≥ 12 px separation).
- **Text fit**: `fontSize=14` minimum (16 for emphasis, 18+ for titles), `fontFamily=Helvetica`; boxes sized as `width ≈ maxLineChars × fontSize × 0.62 + 16`, `height ≈ lineCount × fontSize × 1.4 + 12`; labels at most 2 lines with `whiteSpace=wrap;html=1;align=center;verticalAlign=middle`. Never rely on the drawio default of 12.
- **Orthogonal edges**: `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1` so every segment is horizontal or vertical; `strokeWidth=1.5`.
- **Fixed side-midpoint attachment**: `exitX/exitY` and `entryX/entryY` use exactly one coordinate 0/1 (the side) and the other 0.5 (the midpoint) — e.g. `exitX=1;exitY=0.5` (right), `exitX=0;exitY=0.5` (left), `exitY=0;exitX=0.5` (top), `exitY=1;exitX=0.5` (bottom). Never attach at fractional points along a side; the first and last segments must leave and enter perpendicular to the box edge.
- **Arrowheads**: `endArrow=classic;endFill=1;endSize=10` (plus `startArrow=classic;startFill=1` for bidirectional edges), size 8–12; the filled triangle's base is perpendicular to the line by construction.
- **Deterministic routing**: route edges along clear corridors — never through a third box, never on top of another edge, never along a box border. When a corridor is blocked, add explicit waypoints (`<Array as="points">` with grid-snapped `mxPoint`s): consecutive points differ in exactly one coordinate (axis-aligned segments), the first segment points along the exit side normal and the last along the entry side normal.
- **Edge labels**: avoid when possible; when needed, ≤ 12 characters with `labelBackgroundColor=#FFFFFF`, clear of boxes and other edges.
- **Containers**: children use `relative="1"` geometry, fully inside the container with ≥ 12 px margin.
- **Auto-layout**: `postLayout: "elk"` on the hosted server only when the server should re-arrange nodes (vertex positions are replaced; only edge topology survives); `routing: "libavoid"` on the local tool server only where that server supports it. Authored waypoints keep routing deterministic where auto-layout is not used.

## Tool surface

The drawio MCP is the single diagram pipeline (hosted app server at mcp.draw.io, or the local `@drawio/mcp` tool server):

- Hosted `create_diagram` — parameters: `xml` (the full `<mxfile>` document as a plain string), `mermaid` (accepted only for one-off conversion of user-provided Mermaid text; the delivered artifact is still the draw.io XML the server produces), `postLayout` (`"elk"` only when the server should re-arrange nodes automatically), `direction` (`"vertical"` default or `"horizontal"` — the ELK flow direction).
- Local `open_drawio_xml` — parameters: `content` (the XML), `routing: "libavoid"` (reroutes connectors orthogonally around shapes), `dark` / `lightbox`.
- `search_shapes` — icon lookup for industry-specific or branded shapes; copy the returned `style` and dimensions into the vertex and set `fontSize=14` on it. Plain flowcharts, UML, and ERD do not need icons.

## Evidence rules

| Evidence | Proves |
|---|---|
| `create_diagram` response (hosted server, terminal host) | the server accepted the XML (syntax/parse validation) — an acceptance echo, **not** a layout verdict |
| `create_diagram` with `postLayout: "elk"` in an MCP Apps host | the rendered viewer applied ELK layered layout; in an Apps host the inline diagram is real render evidence |
| `open_drawio_xml` with `routing: "libavoid"` (local tool server) | the local server reroutes connectors before opening; the diagram opened in the draw.io editor is real render evidence |
| Opening the `.drawio` file in the draw.io editor | the authoritative visual check: overlaps, crossings, perpendicularity, font legibility, text fit |

In a terminal host, do not claim "no crossing" from the tool response alone — state that the geometry checker passed, the server accepted the XML, and the `.drawio` file is ready for the editor QA. The checker plus the accepted round-trip are the machine-checkable evidence; the editor or MCP Apps render is the visual evidence.

## Retired pipelines

The Mermaid pipeline (`mermaid_render`, revision-bound SVG) and the SVG icon pipeline (`svg-flowchart`) are retired. `mermaid` remains a `create_diagram` input only for one-off conversion of user-provided Mermaid text; the delivered artifact is draw.io XML, and the geometry contract above still applies to whatever the server produces.
