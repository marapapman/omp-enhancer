export const researchWorkflows = [
  {
    id: 'research',
    chooseWhen: 'Source-backed research, web synthesis, comparison, recommendation, fact-checking, or claim-by-claim verdict.',
    skills: [
      'fact-checking',
      'claim-extraction',
      'source-evaluation',
      'citation-authenticity',
      'research-ops',
      'deep-research',
    ],
    catalogSkills: ['research-ops', 'deep-research'],
    roles: [
      'fact-researcher-a',
      'fact-researcher-b',
      'fact-reviewer',
      'fact-cross-checker',
      'fact-planner',
      'scout',
    ],
    suggestedFlow: [
      'Decompose into checkable claims or research questions.',
      'Collect evidence from primary sources; corroborate with multiple sources.',
      'Cross-check evidence lanes for agreement, conflicts, and staleness.',
      'Synthesize findings with source links and confidence levels.',
      'Review verdicts for overclaiming; report limitations.',
    ],
    scopeNotes: [
      'Prefer primary sources; corroborate key claims with multiple independent sources.',
      'Verdicts preserve exact claim tuples; compatibility evidence is not proof.',
    ],
  },
];
