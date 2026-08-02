<!-- OMP-ENHANCER-WORKFLOW-CATALOG:START -->
# OMP Enhancer Workflow Catalog v31

Advisory reference. Main orchestrates freely through ANALYZE -> EXECUTE -> REVIEW.

## `code`

- When: Substantive code inspection, planning, diagnosis, implementation, refactoring, testing, build repair, performance, database, ML, OMP plugin development, or code review.
- Skills: `code-development`
- Agents: `analyzer`, `task`, `reviewer`, `scout`, `librarian`
- Flow:
  1. Establish outcome, authority, acceptance criteria, and baseline evidence.
  2. Gather local evidence via scout and external evidence via librarian when decision-relevant.
  3. For complex multi-slice work, delegate analysis and planning to analyzer; for focused work, Main plans directly.
  4. Implement via task slices with TDD (RED → GREEN → REFACTOR) or direct work for simple changes.
  5. Review: Main reviews simple changes directly; delegate complex or risky changes to reviewer.
  6. Verify against acceptance criteria and report.

## `writing`

- When: Prose drafting, revision, translation, or format conversion in any language (English, Chinese) or format (LaTeX, Markdown, Beamer, Word).
- Skills: `writing-review`, `plain-chinese-writing`, `writing-markdown-helper`, `zh-writing-markdown-helper`, `format-markdown2latex`, `format-latex2markdown`, `format-template-latex`, `latex-beamer-slides`, `slides-storyline`, `docx`
- Agents: `writer`, `zh-writer`, `checker`, `zh-checker`, `task`
- Flow:
  1. Identify target language (zh/en) and format (plain/LaTeX/Markdown/Beamer/Word).
  2. Load matching language and format skills.
  3. Draft or revise via writer/zh-writer for substantial work, or directly for minor edits.
  4. Check via checker/zh-checker for substantial work; Main checks minor edits directly.
  5. Deliver with preservation and consistency verification.

## `research`

- When: Source-backed research, web synthesis, comparison, recommendation, fact-checking, or claim-by-claim verdict.
- Skills: `fact-checking`, `claim-extraction`, `source-evaluation`, `citation-authenticity`, `research-ops`, `deep-research`
- Agents: `fact-researcher-a`, `fact-researcher-b`, `fact-reviewer`, `fact-cross-checker`, `fact-planner`, `scout`
- Flow:
  1. Decompose into checkable claims or research questions.
  2. Collect evidence from primary sources; corroborate with multiple sources.
  3. Cross-check evidence lanes for agreement, conflicts, and staleness.
  4. Synthesize findings with source links and confidence levels.
  5. Review verdicts for overclaiming; report limitations.

## `visual`

- When: Diagrams (Mermaid), UI/UX design, visual artifacts, slides with visual layout, or rendered figure review.
- Skills: `mermaid-diagram`, `svg-flowchart`, `frontend-design`, `canvas-design`
- Agents: `designer`, `task`
- Flow:
  1. Clarify diagram type, format, and rendering requirements.
  2. Design via designer for complex visuals, or directly for simple diagrams.
  3. designer authors the complete Mermaid source in one pass and renders it via mermaid_render.
  4. Main performs a simple check of the rendered SVG before delivery.
  5. Deliver with source files and rendered evidence.

## `operations`

- When: General multi-step analysis, investigation, network operations, security review, release/publish, marketing, SEO, or any non-trivial work not matching code, writing, research, or visual.
- Skills: `conventional-commits`, `finishing-a-development-branch`, `security-review`, `security-scan`, `network-config-validation`, `marketing-campaign`, `seo`
- Agents: `task`, `reviewer`, `scout`, `ecc-network-architect`, `ecc-network-config-reviewer`, `ecc-network-troubleshooter`, `ecc-security-reviewer`, `ecc-opensource-sanitizer`, `ecc-opensource-forker`, `ecc-opensource-packager`
- Flow:
  1. Clarify outcome, authority, and acceptance criteria.
  2. Gather evidence via scout or domain-specific agents.
  3. For complex analysis, delegate to analyzer; for focused work, Main analyzes directly.
  4. Execute via task or domain agents; Main handles simple operations directly.
  5. Review: Main reviews simple results; delegate complex or security-sensitive work to reviewer.
  6. Verify and report with limitations.

<!-- OMP-ENHANCER-WORKFLOW-CATALOG:END -->
