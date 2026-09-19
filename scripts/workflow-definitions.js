import { defineWorkflowCatalog } from './workflow-schema.js';
export const WORKFLOW_CATALOG_VERSION = 43;
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
      'For new Beamer decks, discuss and capture each page in a Markdown content plan whose titles avoid the "XX：XX" label+colon+label pattern and read as coherent prose in deck order, confirm it with the user, reconcile the slide order with a separate task, and only then translate the plan into Beamer and begin layout.',
      'Check via checker/zh-checker for substantial work; Main checks minor edits directly.',
      'Deliver with preservation and consistency verification.',
    ],
    scopeNotes: [
      'Language selection: use zh skills for Chinese prose, en skills for English; detect from target body, not instruction language.',
      'LaTeX/Beamer/Word/Markdown are format overlays, not separate workflows; select matching format skills.',
      'Main chooses whether to delegate writing or handle it directly based on scope.',
      'For new Beamer decks, start with a text-only Markdown content plan, discuss and confirm each page with the user, then launch a separate task to reconcile the slide order on the plan (no content overlap, semantically coherent modules, logical overall progression; page titles avoid the "XX：XX" label+colon+label pattern and all titles read as coherent prose in deck order; crossings that reordering or regrouping cannot fix return to Markdown reconfirmation) before translating it into Beamer and beginning visual authoring and basic layout. The Markdown content plan is the canonical content source and the Beamer .tex files are derived layout artifacts; content changes go to Markdown first, require user reconfirmation, and then regenerate Beamer before layout resumes.',
      'Chinese slide copy uses plain-chinese-writing for natural sentences, zh-format-humanizer for AI-like phrasing, and zh-writing-review for page-level clarity; English slide copy uses format-humanizer for AI-tell removal and writing-review for page-level review; use zh-writing-polish only for actual polishing and never replace body prose with keyword or phrase lists.',
      'De-AI is one-sighting in every language: any listed tell justifies an edit on its first appearance — prefer an over-correction to a miss ("宁可误杀，不可放过"). Only quotations, titles, proper names, passages discussing a phrase rather than using it, text predating November 30, 2022, and details that carry the writer\'s voice (specific unusual details, mixed feelings, first-person choices) are exempt.',
      'Hard phrasing bans in every deliverable (prose, slides, figures, documents): no "不是X，而是Y" contrast-repetition construction or its English equivalents ("not X, but Y", "not just X") — state the claim once, directly, with no restatement in inverted or synonym form; no opening or closing one-sentence summary that restates what the text just showed; and, in structured artifacts, no "XX：XX" label+colon+label titles or label-colon bullet lead-ins. These are fixed whenever found, not clustering-gated tells. Verbatim quotations and cited material are exempt.',
      'No "specifics then sweep" summary clause: do not follow a concrete factual clause with a summarizing clause that elevates it to a sweeping whole ("……。这些共同构成了……/这一切标志着……/正是这些……成就了……"; English "Together, these ...", "All of this marked ...", "It was these ... that ..."). The tell has two faces: the second clause adds no new fact, only inflation; and its skeleton mirrors the first clause (same object, scope adverb, agent, completion verb), forming a loose pseudo-parallel couplet. This is the documentary-narration "画面＋全称升华" two-beat sentence — a stock template of AI-written popular history. Fix by keeping the concrete clause and cutting the sweep, or by replacing the sweep with a real fact.',
      'No "understanding promise" transitions ("理解了 X，Y 就好懂了", "把这个说清楚，A、B 和 C 就容易理解了", "X is the key to understanding Y"): an empty promise about the reader\'s future comprehension with no stated dependency — delete it, or state the real dependency concretely ("A、B、C 都以 X 为基础"), or, when the text really covers the listed items in order, write the roadmap instead ("先讲 X，再看 A、B 和 C"). This is fixed whenever found, not clustering-gated.',
      'No defensive writing in any deliverable: never pad a claim with hedging qualifiers that dilute it — 可能/或许/大概/某种程度上/在一定条件下/通常来说, "可能/possibly/perhaps/somewhat/relatively/fairly/quite", "it is worth noting that", "值得注意的是", "generally speaking", "to some extent" — unless the hedge is itself a sourced fact (measured variance, a cited confidence interval, a genuinely known scope limit). Never add self-protective filler: boilerplate disclaimers, "本文仅代表个人观点", over-attribution ("许多研究表明" without a citation), apologia for limitations nobody asked about, or a paragraph that argues against its own claim before making it. State the result and its actual scope; cut the armor.',
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
      'Clarify the diagram type, target language, information claims, real nodes and directed relations (including conditions and grouping meaning), output paths, physical width, and any names, math symbols, or terms that must not change. For diagram-only branches, use drawio-skill (drawio@365-skills) plus the one authoring reference for the chosen method; optional asset prep happens only when the user asks for a more vivid diagram or the confirmed plan names image assets (assetseeker icons or stock; Main pre-generated via the native generate_image tool; bl image via bash for Chinese-text or photoreal nodes) with provenance recorded before drawing.',
      'The author derives a stable node/edge ID list from the source material, then draws the diagram once with drawio-skill and exports: a preview PNG (no -e, longest side <= 2000), a cropped single-page vector PDF, and a final PNG (-e -s 2) repaired with the skill\'s repair_png.py. Ask the user only when the diagram meaning or physical size changes.',
      'Exactly one independent read-only review of the actual exports: Main when it has image input, otherwise one task that did not author the diagram. The reviewer checks node/edge semantics, edges crossing unrelated boxes, overlapping or collinear edges, arrow attribution, text clipping, font size at physical width, alignment, grouping margins, reading direction, and gray-scale distinguishability; findings name node/edge IDs, location, and one executable local fix.',
      'The author applies at most one local fix round for supported findings (keeping other node/edge IDs and positions), re-exports the same source set, and the same reviewer confirms against the fresh exports that recorded findings are resolved and no new regression was introduced; this confirmation is not a second review pass or a new design round. Remaining findings are reported as limitations.',
      'Deliver the .drawio source plus the exports the task actually needs (default for paper/report: .drawio + cropped vector PDF + clean PNG); Main retains setup authorization and final acceptance only.',
    ],
    scopeNotes: [
      'drawio-skill from the 365-skills marketplace (drawio@365-skills) is the single diagram pipeline; QA is one read-only review pass plus at most one fix round and one fresh-evidence confirmation, with no repeated iteration rounds. The review is read-only and advisory; the reviewer never edits the source or the export. This plugin\'s chain does not stack the external skill\'s own user-approval loop or its self-check-fix rounds on top; the author\'s structure validation, font/box estimation, and first render belong to authoring.',
      'Labels follow real semantics: nodes are component names or short noun phrases, flow actions may be short verb-object phrases, edges carry relation/data/branch-condition names, and explanation text only when truly needed. Keep exact terms (HTTP/REST, I/O, read/write) and math symbols verbatim; never rewrite technical meaning to dodge symbols. No padding to look complete: no invented three-layer/three-stage scaffolds, fabricated gateway/bus nodes, deleted edges, or merged distinct relations for symmetry. For AI-flavor wording (staged contrasts, one-line closers, inflated significance, chatbot residue) apply the same evidence-based de-AI standard as prose. Hard label bans, fixed whenever found: no "不是X，而是Y" contrast-repetition construction or its English equivalents ("not X, but Y") in node labels, edge labels, or explanation text — state the relation once, directly; no label-colon lead-ins ("方法：…", "Step: …") inside node or edge labels; no opening or closing summary text that restates what the diagram already shows; and no defensive writing — no unsourced hedging qualifiers (可能/或许/"possibly"/"approximately" without a measured basis), no disclaimer text, no over-attribution, no apologia in explanation text. Labels state facts and relations at their actual scope.',
      'Edges connect the actual endpoints. Add an interface node only when the system really exposes an interface/bus semantics. Multiple edges to one target get distinct ports on the same side in target order with separate corridors; trunk edges follow one reading direction and feedback edges route around the outside. Orthogonal edges use edgeStyle=orthogonalEdgeStyle with explicit exitX/exitY/entryX/entryY and Array as="points" where needed — these are controls, not a global avoidance guarantee. Align same-kind nodes; size boxes to the longest label; size corridors to port count and font height instead of a fixed node-count spacing table.',
      'When editing an existing diagram: read the user-provided .drawio first, keep its node IDs and coordinate conventions, change only what was requested or found defective, and do not destroy pre-tuned ports or correct legacy errors unrequested. Run the skill\'s edgeports.py only as a pre-draft helper for edges without hand-tuned ports and before waypoints are final (it does not avoid already-occupied slots); run validate.py for structure and known paths, noting that auto-routed edges without waypoints, collinear overlaps, label collisions, and print-size font remain visual checks.',
      'For 15+ nodes or visibly dense layouts, position with the skill\'s autolayout.py (graph JSON + Graphviz) before local adjustment: give every node a suitable width/height and an explicit neutral style (--mono only disables group color rotation; do not use --tune to override a decided reading direction). Same source/target edges are replayed on one path by that script: keep edge identity and hand-tune their ports or outer corridors; never merge them or add fake nodes. If Graphviz is missing, fall back to a fixed-grid XML; never auto-install it or revive the retired MCP/checker pipeline. If autolayout grouping produces nested containers with relative children that export as a multi-page PDF (pdfinfo Pages > 1), flatten to top-level absolute coordinates and re-export.',
      'Size labels for the real print width, not for the canvas: use the target template figure width when known; otherwise 85 mm single-column paper, 170 mm double-column, 160 mm technical report. Target all labels (including edge and group titles) at 9 pt effective, minimum 8 pt, computed as f_print_pt = f_canvas_px * W_print_mm * 72 / (25.4 * W_canvas_px) with W_canvas the final cropped extent including outside labels and margins. Raising PNG DPI does not fix small text: first shorten non-essential captions, reduce gaps, or move corridors; if it still does not fit, use clearly separated sub-figures of the same diagram keeping all relations, or report the constraint unmet rather than silently shrinking text or deleting content. This is this project\'s default, not a claimed journal-wide standard.',
      'Style follows paper/report norms over marketing decks: white or transparent background, neutral box lines, at most one or two semantically meaningful accent colors with gray-scale-distinguishable line styles or labels; no gradients, drop shadows, decorative banner titles, or a different pastel per layer by default. Layering and symmetry come from the real structure, not a fixed three-column or three-tier template. User-provided templates or house styles win over these defaults; vector primitives are the default, and raster assets stay opt-in per the asset rules below.',
      'Asset contract: every embedded raster asset is registered with id, type (icon|photo|generated|hand-drawn), file path, and provenance (stock: source URL plus license; generated: provider, model, prompt, seed); the delivery notes list the registry and missing provenance is a review finding.',
      'Node-level asset selection prefers official icons (Iconify via assetseeker), then stock photos, then generated images; raster assets are opt-in (user request or confirmed plan) and never replace hand-drawn vector nodes wholesale.',
      'Generation sources: Main may pre-generate assets with the native generate_image tool and hand task the file paths; task generates directly only via bl image (bash) when Main is not preparing assets or Chinese-text rendering is required. Paid generation is proposed with a cost note before running.',
      'Embedding mechanics: the headless drawio CLI blocks file:// image loads and silently renders `image=<path>` nodes blank while still exiting 0, so a node image must be inlined as `image=data:image/png,<base64>` with no `;base64` marker (the style string splits on `;`), and an Iconify SVG\'s `fill="currentColor"` rasterizes blank unless it is first replaced with an explicit color. For an icon inline in a label box, align=left, imagePosition=left and imageWidth/imageHeight must all be set or the centered label overlaps the image; budget roughly 40 units of the text column for the icon gutter.',
    ],
  },
];

export const workflowDefinitions = defineWorkflowCatalog([
  writingWorkflows,
  researchWorkflows,
  visualWorkflows,
]);
