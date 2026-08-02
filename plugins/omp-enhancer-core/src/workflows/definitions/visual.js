export const visualWorkflows = [
  {
    id: 'visual',
    chooseWhen: 'Diagrams (Mermaid), UI/UX design, visual artifacts, slides with visual layout, or rendered figure review.',
    skills: ['mermaid-diagram', 'svg-flowchart', 'frontend-design', 'canvas-design'],
    catalogSkills: [],
    roles: ['designer', 'task'],
    suggestedFlow: [
      'Clarify diagram type, format, and rendering requirements.',
      'Design via designer for complex visuals, or directly for simple diagrams.',
      'designer authors the complete Mermaid source in one pass and renders it via mermaid_render.',
      'Main performs a simple check of the rendered SVG before delivery.',
      'Deliver with source files and rendered evidence.',
    ],
    scopeNotes: [
      'All diagrams are authored as Mermaid source and rendered with mermaid_render.',
      'Mermaid rendering uses the mermaid-helper plugin pipeline.',
    ],
  },
];
