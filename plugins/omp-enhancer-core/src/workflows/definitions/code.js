export const codeWorkflows = [
  {
    id: 'code',
    chooseWhen: 'Substantive code inspection, planning, diagnosis, implementation, refactoring, testing, build repair, performance, database, ML, OMP plugin development, or code review.',
    skills: ['code-development'],
    catalogSkills: [],
    roles: ['analyzer', 'task', 'reviewer', 'scout', 'librarian'],
    suggestedFlow: [
      'Establish outcome, authority, acceptance criteria, and baseline evidence.',
      'Gather local evidence via scout and external evidence via librarian when decision-relevant.',
      'For complex multi-slice work, delegate analysis and planning to analyzer; for focused work, Main plans directly.',
      'Implement via task slices with TDD (RED → GREEN → REFACTOR) or direct work for simple changes.',
      'Review: Main reviews simple changes directly; delegate complex or risky changes to reviewer.',
      'Verify against acceptance criteria and report.',
    ],
    scopeNotes: [
      'Read-only or plan-only requests do not authorize production mutation.',
      'When no test seam exists, use the strongest available evidence without fabricating a RED.',
      'Main chooses delegation width based on complexity; no fixed fanout or fork mandate.',
    ],
  },
];
