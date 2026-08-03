# draw.io XML authoring reference

The draw.io XML is the single source of node positions, edge geometry, and labels. This reference covers the exact XML surface and the layout discipline that keeps diagrams clean: no overlapping boxes, no edge crossing a box, perpendicular arrow attachment, arrowheads perpendicular to the line, fonts sized for PPT or print, and text that never overflows its box or sits on a line.

## Document skeleton

```xml
<mxfile host="app.diagrams.net" version="24.0.0">
  <diagram id="page-1" name="Page-1">
    <mxGraphModel dx="900" dy="640" grid="1" gridSize="10" guides="1"
        tooltips="1" connect="1" arrows="1" fold="1" page="1"
        pageScale="1" pageWidth="1169" pageHeight="826" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <!-- vertices: one mxCell per node -->
        <!-- edges: one mxCell per connector -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

- `id="0"` and `id="1" parent="0"` are the two mandatory sentinel cells. All content cells use `parent="1"`.
- `pageWidth`/`pageHeight` default to 1169×826 (A4 landscape); adjust only when the user specifies a target size.
- XML-escape all text values: `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`, `"` → `&quot;`.

## Vertices (boxes)

```xml
<mxCell id="auth" value="Auth Service" style="rounded=0;whiteSpace=wrap;html=1;align=center;verticalAlign=middle;fontSize=14;fontFamily=Helvetica;fillColor=#DAE8FC;strokeColor=#6C8EBF;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="150" height="48" as="geometry" />
</mxCell>
```

Mandatory style keys for every text box:

| Key | Value | Why |
|---|---|---|
| `fontSize` | `14` or larger | PPT/print legibility; drawio's default 12 is too small |
| `fontFamily` | `Helvetica` (or `Arial`) | predictable metrics |
| `whiteSpace` | `wrap` | text wraps instead of overflowing |
| `html` | `1` | HTML labels, required for wrapping |
| `align` / `verticalAlign` | `center` / `middle` | centered text |
| `rounded` | `0` | square corners; `1` for pill/rounded groups only |

Sizing boxes to text (estimation with Helvetica): average char width ≈ `fontSize × 0.62`, line height ≈ `fontSize × 1.4`.

```
width  = maxLineChars × fontSize × 0.62 + 16
height = lineCount × fontSize × 1.4 + 12
```

Examples: `fontSize=14`, 12 chars on one line → 12×8.7+16 ≈ 120×32; two lines → height 51. When in doubt, round up to the next grid step. If a label needs more than two lines, split the node or shorten the label.

Groups/containers:

```xml
<mxCell id="vpc" value="VPC" style="rounded=0;whiteSpace=wrap;html=1;fontSize=16;verticalAlign=top;container=1;collapsible=0;fillColor=none;strokeColor=#333333;dashed=0;" vertex="1" parent="1">
  <mxGeometry x="20" y="20" width="640" height="420" as="geometry" />
</mxCell>
<mxCell id="subnet" value="Subnet A" style="rounded=0;whiteSpace=wrap;html=1;fontSize=14;align=center;verticalAlign=middle;" vertex="1" parent="1">
  <mxGeometry x="60" y="80" width="150" height="48" relative="1" as="geometry" />
</mxCell>
```

Children of a container use `relative="1"` geometry: `x`/`y` are offsets from the container's top-left corner and must keep the child fully inside the container with at least 12 px margin. Only one level of nesting is allowed unless the user explicitly asks for deeper groups.

## Edges (connectors)

```xml
<mxCell id="e-auth-api" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=1;exitY=0.5;entryX=0;entryY=0.5;endArrow=classic;endFill=1;endSize=10;startArrow=none;strokeWidth=1.5;" edge="1" parent="1" source="auth" target="api">
  <mxGeometry relative="1" as="geometry" />
</mxCell>
```

Mandatory style keys:

| Key | Value | Why |
|---|---|---|
| `edgeStyle` | `orthogonalEdgeStyle` | all segments horizontal or vertical |
| `exitX`/`exitY` | fixed side point, e.g. `1`/`0.5` | first segment leaves perpendicular to the source box edge |
| `entryX`/`entryY` | fixed side point, e.g. `0`/`0.5` | last segment enters perpendicular to the target box edge |
| `endArrow` / `startArrow` | `classic` | triangular head whose base is perpendicular to the line |
| `endFill` / `startFill` | `1` | solid filled arrowhead |
| `endSize` / `startSize` | `10` (8–12) | arrowhead size |
| `rounded` | `0` | sharp orthogonal corners |
| `html` | `1` | consistent label rendering |

Attachment points: exactly one coordinate must be 0 or 1 (the side) and the other must be 0.5 (the midpoint). Valid combos: `exitX=1;exitY=0.5` (right), `exitX=0;exitY=0.5` (left), `exitY=0;exitX=0.5` (top), `exitY=1;exitX=0.5` (bottom). Do not use fractional side positions (`exitX=0.3`) — the arrow then enters at an angle that is not perpendicular to the edge.

### Routing corridors and waypoints

Author so that the default orthogonal path is clear: from the exit side, straight along the exit row/column, then straight into the entry side. Before adding an edge, confirm its corridor (the row or column band it travels) does not pass through a third box, does not run along a box border, and stays at least 12 px from every parallel edge.

When a corridor is blocked and moving boxes is worse, add explicit waypoints so the routing is deterministic and checkable:

```xml
<mxCell id="e-a-b" style="edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;exitX=1;exitY=0.5;entryX=0;entryY=0.5;endArrow=classic;endFill=1;endSize=10;strokeWidth=1.5;" edge="1" parent="1" source="a" target="b">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="260" y="64" as="sourcePoint" />
    <mxPoint x="420" y="240" as="targetPoint" />
    <Array as="points">
      <mxPoint x="260" y="240" />
    </Array>
  </mxGeometry>
</mxCell>
```

Rules for waypoints: every point must sit on the grid; consecutive points must differ in exactly one coordinate (axis-aligned segments); no segment may cross a box interior; no segment may lie on a box border; the first segment must point in the direction of the exit side normal (right for `exitX=1`, left for `exitX=0`, up for `exitY=0`, down for `exitY=1`), and the last segment must point in the direction of the entry side normal.

### Edge labels

Prefer no edge labels — put branch conditions in the target box or as a small separate note box. When an edge label is required: text ≤ 12 characters, and set `labelBackgroundColor=#FFFFFF` so the label masks the line instead of sitting on it. Never place an edge label where it would overlap a box or another edge.

## Icons via search_shapes

Call `search_shapes` (e.g. `query: "aws lambda"`) before authoring icon cells. Copy the returned `style` verbatim into the vertex and add `fontSize=14` (icon labels default to 12, too small for PPT/print). Use the returned `w`/`h` as the box dimensions (keep `aspect=fixed` shapes at their returned size; the label sits below the icon). Only use icons when the diagram needs industry-specific, branded, or pictorial shapes — plain flowcharts, UML, ERD, and org charts do not.

## Layout discipline checklist

- [ ] Every coordinate snapped to the 10 px grid.
- [ ] No two boxes overlap; gutter between boxes ≥ 24 px.
- [ ] No edge corridor passes through a box, lies on a border, or overlaps another edge (parallel edges ≥ 12 px apart).
- [ ] Every edge uses `orthogonalEdgeStyle` with fixed side-midpoint `exit/entry` (0/1 + 0.5).
- [ ] Every arrowhead is `classic` with `fill=1` and size 8–12.
- [ ] Every text cell declares `fontSize ≥ 14`; boxes sized by the width/height formulas; text ≤ 2 lines.
- [ ] Edge labels, if any, ≤ 12 chars with `labelBackgroundColor=#FFFFFF`, clear of boxes and other edges.
- [ ] Containers: children fully inside with ≥ 12 px margin, `relative="1"` geometry.

## Invoking the drawio MCP

Hosted app server (`create_diagram`):

| Param | Value |
|---|---|
| `xml` | the full `<mxfile>` document as a plain string |
| `postLayout` | `"elk"` only when the server should re-arrange nodes (vertex positions are replaced; topology survives) |
| `direction` | `"vertical"` (default) or `"horizontal"` — ELK flow direction for XML |

`mermaid` input exists for one-off conversions of user-provided Mermaid text; the delivered artifact is still the draw.io XML the server produces. Local tool server (`@drawio/mcp`): `open_drawio_xml` with `content` (the XML) and optionally `routing: "libavoid"` (reroutes connectors orthogonally around shapes) and `dark`/`lightbox`.

The hosted server's response in a terminal host returns the XML as text: treat it as an acceptance echo and server-side validation, not as proof of a clean layout. The static checker (see geometry-review.md) plus opening the `.drawio` file in the draw.io editor are the layout evidence.
