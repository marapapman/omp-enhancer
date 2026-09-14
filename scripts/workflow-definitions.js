import { defineWorkflowCatalog } from './workflow-schema.js';
export const WORKFLOW_CATALOG_VERSION = 41;
const writingWorkflows = [
  {
    id: 'writing',
    chooseWhen: 'Prose drafting, revision, translation, or format conversion in any language (English, Chinese) or format (LaTeX, Markdown, Beamer, Word).',
    skills: [
      'writing-review',
      'format-humanizer',
      'plain-chinese-writing',
      'zh-research-achievement-writing',
      'zh-format-humanizer',
      'zh-writing-review',
      'zh-writing-polish',
      'writing-markdown-helper',
      'zh-writing-markdown-helper',
      'format-markdown2latex',
      'format-latex2markdown',
      'format-template-latex',
      'latex-beamer-slides',
      'beamer-to-powerpoint',
      'slides-storyline',
      'docx',
    ],
    catalogSkills: [],
    roles: ['writer', 'zh-writer', 'checker', 'zh-checker', 'task'],
    suggestedFlow: [
      'Identify target language (zh/en) and format (plain/LaTeX/Markdown/Beamer/Word).',
      'Load matching language and format skills.',
      'Draft or revise via writer/zh-writer for substantial work, or directly for minor edits.',
      'For new Beamer decks, discuss and capture each page in a Markdown content plan, confirm it with the user, and only then translate the plan into Beamer and begin layout.',
      'Check via checker/zh-checker for substantial work; Main checks minor edits directly.',
      'Deliver with preservation and consistency verification.',
    ],
    scopeNotes: [
      'Language selection: use zh skills for Chinese prose, en skills for English; detect from target body, not instruction language.',
      'LaTeX/Beamer/Word/Markdown are format overlays, not separate workflows; select matching format skills.',
      'Main chooses whether to delegate writing or handle it directly based on scope.',
      'For new Beamer decks, start with a text-only Markdown content plan, discuss and confirm each page with the user, then translate it into Beamer and begin visual authoring and basic layout. The Markdown content plan is the canonical content source and the Beamer .tex files are derived layout artifacts; content changes go to Markdown first, require user reconfirmation, and then regenerate Beamer before layout resumes.',
      'Chinese slide copy uses plain-chinese-writing for natural sentences, zh-format-humanizer for AI-like phrasing, and zh-writing-review for page-level clarity; English slide copy uses format-humanizer for AI-tell removal and writing-review for page-level review; use zh-writing-polish only for actual polishing and never replace body prose with keyword or phrase lists.',
      'De-AI is evidence-based in every language: strongest tells justify an edit on one sighting, weak tells need company from other tells in the same passage, and specific details that carry the writer voice stay.',
      'For Beamer, a single read-only visual precheck is performed by Main or task, with Main naturally selecting the one owner (never both), after task\'s initial render and before task layout; findings are advisory input to the normal task pass, then task integrates and renders the final revision, which Main reviews read-only as the single review owner (a task that did not produce the revision may review instead).',
      'beamer-to-powerpoint is conditional on an explicit user-supplied conversion command; use it only when PowerPoint output is in scope and never choose or invent a converter.',
      'Beamer Phase 2 visual assets follow the visual workflow asset contract: official icons and assetseeker stock first, generated images opt-in with provenance recorded in the content plan; operational detail lives in latex-beamer-slides.',
    ],
  },
];

const researchWorkflows = [
  {
    id: 'research',
    chooseWhen: 'Source-backed research, web synthesis, comparison, recommendation, fact-checking, or claim-by-claim verdict.',
    skills: [
      'fact-checking',
      'claim-extraction',
      'source-evaluation',
      'citation-authenticity',
    ],
    catalogSkills: [],
    roles: [
      'fact-researcher-a',
      'fact-researcher-b',
      'fact-researcher-c',
      'fact-challenger',
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
      'The deterministic pipeline for a document-level check is fact_check_analyze -> fact_check_evidence (lane A, lane B and C only when warranted) -> fact_check_report -> fact_check_review; these four tools ship in the default tool inventory, so a natural-language check request needs no activation step.',
      'Omission defence is layered: every researcher lane also enumerates the document and returns FACT_CLAIM_CANDIDATES, fact_check_merge takes the union of those candidates (a claim only one observer lists is kept and flagged single-lane rather than dropped), and fact_check_challenge appends MISSED claims back into the plan for a fresh evidence pass.',
      'Evidence lanes get different models from the OMP agents hub (/agents), not from /model: /model sets the session model, so unbound lanes would all follow it and cross-checking would compare a model with itself.',
    ],
  },
];

const visualWorkflows = [
  {
    id: 'visual',
    chooseWhen: 'Diagrams (draw.io), UI/UX design, static visual artifacts, or rendered figure review.',
    skills: ['drawio-skill', 'assetseeker', 'frontend-design', 'canvas-design', 'format-humanizer', 'zh-format-humanizer'],
    catalogSkills: [],
    roles: ['task'],
    suggestedFlow: [
      'Clarify diagram type, format, and rendering requirements.',
      'Optional asset prep, only when the user asks for a more vivid diagram or the confirmed plan names image assets: gather node-level raster assets (assetseeker icons or stock; Main pre-generated via the native generate_image tool; bl image via bash for Chinese-text or photoreal nodes) and record provenance before drawing; the draw-once QA chain below is unchanged.',
      'task draws the diagram once with drawio-skill from drawio@365-skills and exports a draft PNG.',
      'Review that exported PNG read-only with exactly one owner—Main or a task that did not draw the revision—flagging edges pressed onto each other or crossing through boxes.',
      'task applies at most one fix round for supported findings and re-exports; deliver the .drawio source with the exported image.',
      'Main retains setup authorization and final acceptance only; remaining findings are reported as limitations.',
    ],
    scopeNotes: [
      'drawio-skill from the 365-skills marketplace (drawio@365-skills) is the single diagram pipeline.',
      'QA is one read-only review pass plus at most one fix round; no repeated iteration rounds.',
      'The visual review is read-only and advisory; the reviewer never edits the source or the export.',
      'Diagram text follows the same evidence-based de-AI standard as prose: box labels, titles, legends, and captions state facts directly and avoid staged contrasts, one-line closers, forced triads, inflated significance, and chatbot residue. Strongest tells justify an edit on one sighting; weak tells need company from other tells in the same passage.',
      'Asset contract: every embedded raster asset is registered with id, type (icon|photo|generated|hand-drawn), file path, and provenance (stock: source URL plus license; generated: provider, model, prompt, seed); the delivery notes list the registry and missing provenance is a review finding.',
      'Node-level asset selection prefers official icons (Iconify via assetseeker), then stock photos, then generated images; raster assets are opt-in (user request or confirmed plan) and never replace hand-drawn vector nodes wholesale.',
      'Generation sources: Main may pre-generate assets with the native generate_image tool and hand task the file paths; task generates directly only via bl image (bash) when Main is not preparing assets or Chinese-text rendering is required. Paid generation is proposed with a cost note before running.',
    ],
  },
];

export const workflowDefinitions = defineWorkflowCatalog([
  writingWorkflows,
  researchWorkflows,
  visualWorkflows,
]);
