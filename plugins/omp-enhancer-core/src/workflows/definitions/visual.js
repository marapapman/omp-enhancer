export const visualWorkflows = [
  {
    id: 'visual',
    chooseWhen: 'Diagrams (Mermaid, TikZ), UI/UX design, visual artifacts, slides with visual layout, or rendered figure review.',
    skills: ['mermaid-diagram', 'tikz-diagram', 'svg-flowchart', 'frontend-design', 'canvas-design'],
    catalogSkills: [],
    roles: ['designer', 'task', 'visioner'],
    suggestedFlow: [
      'Clarify diagram type, format, and rendering requirements.',
      'Design via designer for complex visuals, or directly for simple diagrams.',
      'Render and verify output via task; review via visioner for quality.',
      'Deliver with source files and rendered evidence.',
    ],
    scopeNotes: [
      'Default to Mermaid for academic diagrams unless explicit TikZ/LaTeX request.',
      'TikZ rendering uses the tikz-helper plugin pipeline.',
    ],
  },
];
