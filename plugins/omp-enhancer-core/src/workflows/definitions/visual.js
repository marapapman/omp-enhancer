export const visualWorkflows = [
  {
    id: 'visual',
    chooseWhen: 'Diagrams (draw.io), UI/UX design, visual artifacts, slides with visual layout, or rendered figure review.',
    skills: ['drawio-diagram', 'frontend-design', 'canvas-design'],
    catalogSkills: [],
    roles: ['designer', 'task', 'visioner'],
    suggestedFlow: [
      'Clarify diagram type, format, and rendering requirements.',
      'Design via designer for complex visuals, or directly for simple diagrams.',
      'designer authors the complete draw.io XML in one pass; task runs the bundled geometry checker and the drawio MCP (create_diagram, search_shapes for icons) on that exact source.',
      'visioner reviews fresh current-revision rendered evidence read-only — the MCP Apps inline render or the diagram opened in the draw.io editor — plus the checker report.',
      'Main retains setup authorization and final acceptance only; deliver with the .drawio source file and verified evidence.',
    ],
    scopeNotes: [
      'All diagrams are authored as draw.io XML and verified with the drawio MCP; the Mermaid and SVG diagram pipelines are retired.',
      'The drawio MCP (hosted app server or local @drawio/mcp tool server) is the single diagram pipeline; postLayout elk and libavoid routing keep edges out of boxes where supported.',
    ],
  },
];
