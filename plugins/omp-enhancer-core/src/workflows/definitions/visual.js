export const visualWorkflows = [
  {
    id: 'visual',
    chooseWhen: 'Diagrams (draw.io), UI/UX design, visual artifacts, slides with visual layout, or rendered figure review.',
    skills: ['drawio-skill', 'frontend-design', 'canvas-design'],
    catalogSkills: [],
    roles: ['designer', 'visioner'],
    suggestedFlow: [
      'Clarify diagram type, format, and rendering requirements.',
      'designer draws the diagram once with drawio-skill from drawio@365-skills and exports a draft PNG.',
      'visioner reviews that exported PNG read-only in one pass, flagging edges pressed onto each other or crossing through boxes.',
      'designer applies at most one fix round for supported findings and re-exports; deliver the .drawio source with the exported image.',
      'Main retains setup authorization and final acceptance only; remaining findings are reported as limitations.',
    ],
    scopeNotes: [
      'drawio-skill from the 365-skills marketplace (drawio@365-skills) is the single diagram pipeline; the retired drawio-diagram skill, its layout checker script, and the MCP route are not used.',
      'QA is one visioner pass plus at most one fix round; no repeated iteration rounds.',
    ],
  },
];
