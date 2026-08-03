# `visual` workflow reference

Optional advisory reference. Main orchestrates freely.

- When: Diagrams (draw.io), UI/UX design, visual artifacts, slides with visual layout, or rendered figure review.
- Skills: `drawio-diagram`, `frontend-design`, `canvas-design`
- Agent candidates: `designer`, `task`, `visioner`.
- Suggested flow:
  1. Clarify diagram type, format, and rendering requirements.
  2. Design via designer for complex visuals, or directly for simple diagrams.
  3. designer authors the complete draw.io XML in one pass; task runs the bundled geometry checker and the drawio MCP (create_diagram, search_shapes for icons) on that exact source.
  4. visioner reviews fresh current-revision rendered evidence read-only — the MCP Apps inline render or the diagram opened in the draw.io editor — plus the checker report.
  5. Main retains setup authorization and final acceptance only; deliver with the .drawio source file and verified evidence.
- Scope notes:
  - All diagrams are authored as draw.io XML and verified with the drawio MCP; the Mermaid and SVG diagram pipelines are retired.
  - The drawio MCP (hosted app server or local @drawio/mcp tool server) is the single diagram pipeline; postLayout elk and libavoid routing keep edges out of boxes where supported.