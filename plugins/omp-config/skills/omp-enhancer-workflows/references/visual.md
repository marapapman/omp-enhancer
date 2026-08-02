# `visual` workflow reference

Optional advisory reference. Main orchestrates freely.

- When: Diagrams (Mermaid), UI/UX design, visual artifacts, slides with visual layout, or rendered figure review.
- Skills: `mermaid-diagram`, `svg-flowchart`, `frontend-design`, `canvas-design`
- Agent candidates: `designer`, `task`.
- Suggested flow:
  1. Clarify diagram type, format, and rendering requirements.
  2. Design via designer for complex visuals, or directly for simple diagrams.
  3. designer authors the complete Mermaid source in one pass and renders it via mermaid_render.
  4. Main performs a simple check of the rendered SVG before delivery.
  5. Deliver with source files and rendered evidence.
- Scope notes:
  - All diagrams are authored as Mermaid source and rendered with mermaid_render.
  - Mermaid rendering uses the mermaid-helper plugin pipeline.