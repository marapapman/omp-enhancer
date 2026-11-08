---
name: omp-enhancer-workflows
description: Workflow reference catalog for Main orchestration.
---

# Workflow reference catalog

Advisory reference only. Main selects workflows, Skills, Agents, and delegation width freely. OMP native instructions remain authoritative.

Phases: ANALYZE -> EXECUTE -> REVIEW. Main chooses direct work or delegation at each phase based on task complexity.

## Domain index

- `writing` — Prose and copy in any language (English, Chinese) or format (LaTeX, Markdown, Beamer, Word, PowerPoint/PPTX): Main drafts every wording surface itself and passes each passage through the polisher tool, while Main/task handle code, evidence, structure, layout, conversion, and validation. D=[`skill://writing-review`, `skill://format-humanizer`, `skill://plain-chinese-writing`, `skill://zh-research-achievement-writing`, `skill://zh-format-humanizer`, `skill://zh-writing-review`, `skill://zh-writing-polish`, `skill://writing-markdown-helper`, `skill://zh-writing-markdown-helper`, `skill://format-markdown2latex`, `skill://format-latex2markdown`, `skill://format-template-latex`, `skill://latex-beamer-slides`, `skill://beamer-to-powerpoint`, `skill://slides-storyline`, `skill://storyline-workbench`, `skill://docx`]. Reference: `skill://omp-enhancer-workflows/references/writing.md`.
- `research` — Source-backed research, web synthesis, comparison, recommendation, fact-checking, or claim-by-claim verdict. D=[`skill://fact-checking`, `skill://claim-extraction`, `skill://source-evaluation`, `skill://citation-authenticity`]. Reference: `skill://omp-enhancer-workflows/references/research.md`.
- `visual` — Diagrams (draw.io), UI/UX design, static visual artifacts, or rendered figure review. D=[`skill://drawio-skill`, `skill://assetseeker`, `skill://frontend-design`, `skill://canvas-design`, `skill://format-humanizer`, `skill://zh-format-humanizer`]. Reference: `skill://omp-enhancer-workflows/references/visual.md`.

## Agent descriptions

- `fact-challenger` — Adversarial reviewer that attacks recorded verdicts and reports claims the plan missed (AGREE / REBUT / MISSED).
- `fact-planner` — Decomposes a fact-checking task into checkable claims, evidence plans, risk levels, and scope boundaries.
- `fact-researcher-a` — First independent evidence lane for fact checking; collects primary-source evidence for planned claims and lists claims the plan omitted.
- `fact-researcher-b` — Second independent evidence lane; looks for corroboration, counter-evidence, source conflicts, and omitted claims.
- `fact-researcher-c` — Third independent evidence lane; third-model corroboration plus an independent enumeration of omitted claims.
- `scout` — Fast read-only scout returning compressed context for handoff; use for exploratory codebase research and broad pattern searches.
- `task` — General-purpose subagent with full capabilities for delegated multi-step work.

Text capability note: `polisher` is a writing-helper tool, not an Agent. It is a stateless language pass: Main drafts every prose and copy surface, sends one bounded passage to `polisher`, and inserts the returned text verbatim. The polisher model role may be older or smaller because the tool has no tools, no file access, and no agentic work; planning, evidence, structure, layout, conversion, and validation stay with Main/task.

## Usage

1. Match the task to a domain above.
2. Load matching skills as needed for methods and evidence rules.
3. Choose the Agents you need from the descriptions above; OMP exposes their current availability.
4. Load the domain reference before starting matching work; it carries the required step order and checkpoints.
