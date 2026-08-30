# `writing` workflow reference

Optional advisory reference. Main orchestrates freely.

- When: Prose drafting, revision, translation, or format conversion in any language (English, Chinese) or format (LaTeX, Markdown, Beamer, Word).
- Skills: `writing-review`, `plain-chinese-writing`, `zh-format-humanizer`, `zh-writing-review`, `zh-writing-polish`, `writing-markdown-helper`, `zh-writing-markdown-helper`, `format-markdown2latex`, `format-latex2markdown`, `format-template-latex`, `latex-beamer-slides`, `beamer-to-powerpoint`, `slides-storyline`, `docx`
- Agent candidates: `writer`, `zh-writer`, `checker`, `zh-checker`, `task`.

## Required step order

These steps are the required execution order for this domain. The plugin provides no runtime gate, router, or completion condition — that means the runtime never blocks you, not that the steps are optional. Skipping a named step without a stated reason is a workflow violation; report it in the final delivery.

1. Identify target language (zh/en) and format (plain/LaTeX/Markdown/Beamer/Word).
2. Load matching language and format skills.
3. Draft or revise via writer/zh-writer for substantial work, or directly for minor edits.
4. For new Beamer decks, discuss and capture each page in a Markdown content plan, confirm it with the user, and only then translate the plan into Beamer and begin layout.
5. Check via checker/zh-checker for substantial work; Main checks minor edits directly.
6. Deliver with preservation and consistency verification.

## Scope notes

- Language selection: use zh skills for Chinese prose, en skills for English; detect from target body, not instruction language.
- LaTeX/Beamer/Word/Markdown are format overlays, not separate workflows; select matching format skills.
- Main chooses whether to delegate writing or handle it directly based on scope.
- For new Beamer decks, start with a text-only Markdown content plan, discuss and confirm each page with the user, then translate it into Beamer and begin visual authoring and basic layout. The Markdown content plan is the canonical content source and the Beamer .tex files are derived layout artifacts; content changes go to Markdown first, require user reconfirmation, and then regenerate Beamer before layout resumes.
- Chinese slide copy uses plain-chinese-writing for natural sentences, zh-format-humanizer for AI-like phrasing, and zh-writing-review for page-level clarity; use zh-writing-polish only for actual polishing and never replace body prose with keyword or phrase lists.
- For Beamer, a single read-only visual precheck is performed by Main or task, with Main naturally selecting the one owner (never both), after task's initial render and before designer layout; findings are advisory input to the normal designer pass, then task integrates and renders the final revision for independent visioner review.
- beamer-to-powerpoint is conditional on an explicit user-supplied conversion command; use it only when PowerPoint output is in scope and never choose or invent a converter.
