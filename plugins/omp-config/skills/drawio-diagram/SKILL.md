---
name: drawio-diagram
description: Author draw.io XML diagrams (architecture, block, flowchart) and verify layout geometry with the drawio MCP and a static checker. Use when a diagram must be delivered as editable draw.io XML with no overlapping boxes, no edge crossing a box, perpendicular arrows, and fonts sized for PPT or print.
---

# draw.io diagram (drawio-diagram)

Author architecture diagrams, block diagrams, and flowcharts as draw.io XML and verify them with the drawio MCP (`create_diagram` / `search_shapes` on the hosted app server at mcp.draw.io, or `open_drawio_*` / `search_shapes` on the local `@drawio/mcp` tool server). The draw.io XML is the single source of node positions, edge geometry, and labels. The Mermaid and SVG diagram pipelines are retired: never hand-edit SVG or Mermaid for these figures.

## Load the method

For any figure with 6+ nodes, an edge that could cross another box, or a strict layout requirement, read `skill://drawio-diagram/references/drawio-authoring.md` before authoring XML, then `skill://drawio-diagram/references/geometry-review.md` before final delivery. For simple two- or three-node figures, the rules in this page suffice.

## Author the semantic graph first

1. Capture audience, output path (`.drawio`), page size, labels, topology, icon needs, and acceptance evidence. Ask only when an ambiguity changes meaning; state reversible visual defaults.
2. Write the semantic graph before syntax: stable node IDs, roles, exact labels, directed edges, branch conditions, groups, and flow direction. The graph owns meaning; decoration never changes it.

## Author the complete draw.io XML in one pass

3. Emit one complete `<mxfile>` document: `<diagram>` → `<mxGraphModel>` → `<root>` with the two sentinel cells (`<mxCell id="0"/>` and `<mxCell id="1" parent="0"/>`), then one `<mxCell vertex="1" parent="1">` per node and one `<mxCell edge="1" parent="1">` per edge. Use stable IDs and keep them across revisions so findings map to exact elements.
4. Geometry discipline (non-negotiable):
   - Snap every coordinate to the 10 px grid. Leave a gutter of at least 24 px between any two boxes and between every box and every edge corridor.
   - Size each box to fit its label: width ≈ max-line-chars × fontSize × 0.62 + 16, height ≈ line-count × fontSize × 1.4 + 12. Keep labels short (at most 2 lines) and wrap with `whiteSpace=wrap;html=1;align=center;verticalAlign=middle`.
   - Fonts: `fontSize=14` minimum (16 for emphasis, 18+ for titles) with `fontFamily=Helvetica` — readable in PPT and print. Never rely on the drawio default of 12.
5. Edges (non-negotiable):
   - Use `edgeStyle=orthogonalEdgeStyle;rounded=0;html=1` so every segment is horizontal or vertical.
   - Attach at fixed side midpoints: `exitX=1;exitY=0.5` (right side), `exitX=0;exitY=0.5` (left), `exitY=0;exitX=0.5` (top), `exitY=1;exitX=0.5` (bottom) — and the matching `entryX/entryY`. The first and last segments then leave and enter perpendicular to the box edge. Never attach at fractional points along a side.
   - Arrowheads: `endArrow=classic;endFill=1;endSize=10` (plus `startArrow=classic;startFill=1` for bidirectional edges). The filled triangle's base is perpendicular to the line by construction. Use `strokeWidth=1.5`.
   - Route edges along clear corridors: never through a third box, never on top of another edge, never along a box border. When two edges share a corridor, keep them at least 12 px apart.
   - Edge labels: avoid them when possible; when needed, keep them at most 12 characters and set `labelBackgroundColor=#FFFFFF` so text never sits on the line unreadably.
6. Groups and pages: a group box is a vertex with `container=1`; children use geometry relative to the group and must stay inside it with at least 12 px margin. One diagram = one page unless the user asks for multiple pages.
7. Icons: for industry-specific or branded shapes, call `search_shapes`, then copy the returned `style` and dimensions into the vertex and set `fontSize=14` on it. Do not invent icon styles. Plain flowcharts, UML, and ERD do not need icons.

## Verify with the checker and the drawio MCP

8. Run the bundled static checker before opening the diagram:

```bash
node <skill-directory>/scripts/check-drawio-layout.mjs path/to/figure.drawio
```

Fix every ERROR (box overlap, edge crossing a box, edge-edge overlap, font below 14, text-overflow estimate) before rendering.
9. Call the drawio MCP with the authored XML. Hosted app server: `create_diagram` with the `xml` argument; pass `postLayout: "elk"` only when the server should re-arrange nodes automatically (vertex positions are replaced; only edge topology survives), and `direction` for the ELK flow direction. Local tool server: `open_drawio_xml` additionally accepts `routing: "libavoid"` to reroute connectors orthogonally around shapes.
10. The tool response is server-side validation evidence. In a terminal host without MCP Apps rendering, the response returns the XML as text — that is an acceptance echo, not a visual layout verdict. Final visual QA happens by opening the `.drawio` file in the draw.io editor; the checker plus the accepted round-trip are the machine-checkable evidence.

## Deliver

Deliver the `.drawio` file, the checker output (or the fixed findings), the drawio MCP response, assumptions, and unresolved limitations. Layout findings are advisory evidence for Main; Main accepts final delivery.
