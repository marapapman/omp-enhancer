export const writingWorkflows = [
  {
    id: 'writing',
    chooseWhen: 'Prose drafting, revision, translation, or format conversion in any language (English, Chinese) or format (LaTeX, Markdown, Beamer, Word).',
    skills: [
      'writing-review',
      'plain-chinese-writing',
      'writing-markdown-helper',
      'zh-writing-markdown-helper',
      'format-markdown2latex',
      'format-latex2markdown',
      'format-template-latex',
      'latex-beamer-slides',
      'slides-storyline',
      'docx',
    ],
    catalogSkills: [],
    roles: ['writer', 'zh-writer', 'checker', 'zh-checker', 'task'],
    suggestedFlow: [
      'Identify target language (zh/en) and format (plain/LaTeX/Markdown/Beamer/Word).',
      'Load matching language and format skills.',
      'Draft or revise via writer/zh-writer for substantial work, or directly for minor edits.',
      'Check via checker/zh-checker for substantial work; Main checks minor edits directly.',
      'Deliver with preservation and consistency verification.',
    ],
    scopeNotes: [
      'Language selection: use zh skills for Chinese prose, en skills for English; detect from target body, not instruction language.',
      'LaTeX/Beamer/Word/Markdown are format overlays, not separate workflows; select matching format skills.',
      'Main chooses whether to delegate writing or handle it directly based on scope.',
    ],
  },
];
