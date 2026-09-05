---
name: omp-enhancer-workflows
description: Workflow reference catalog for Main orchestration.
---

# Workflow reference catalog

Advisory reference only. Main selects workflows, Skills, Agents, and delegation width freely. OMP native instructions remain authoritative.

Phases: ANALYZE -> EXECUTE -> REVIEW. Main chooses direct work or delegation at each phase based on task complexity.

## Domain index

- `writing` — Prose drafting, revision, translation, or format conversion in any language (English, Chinese) or format (LaTeX, Markdown, Beamer, Word). D=[`skill://writing-review`, `skill://plain-chinese-writing`, `skill://zh-research-achievement-writing`, `skill://zh-format-humanizer`, `skill://zh-writing-review`, `skill://zh-writing-polish`, `skill://writing-markdown-helper`, `skill://zh-writing-markdown-helper`, `skill://format-markdown2latex`, `skill://format-latex2markdown`, `skill://format-template-latex`, `skill://latex-beamer-slides`, `skill://beamer-to-powerpoint`, `skill://slides-storyline`, `skill://docx`]. Reference: `skill://omp-enhancer-workflows/references/writing.md`.
- `research` — Source-backed research, web synthesis, comparison, recommendation, fact-checking, or claim-by-claim verdict. D=[`skill://fact-checking`, `skill://claim-extraction`, `skill://source-evaluation`, `skill://citation-authenticity`]. Reference: `skill://omp-enhancer-workflows/references/research.md`.
- `visual` — Diagrams (draw.io), UI/UX design, static visual artifacts, or rendered figure review. D=[`skill://drawio-skill`, `skill://frontend-design`, `skill://canvas-design`]. Reference: `skill://omp-enhancer-workflows/references/visual.md`.

## Agent descriptions

- `checker` — Read-only English checker for a narrow semantic-drift, logic, and clarity check or a broad seven-dimension advisory audit.
- `fact-planner` — Decomposes a fact-checking task into checkable claims, evidence plans, risk levels, and scope boundaries.
- `fact-researcher-a` — First independent evidence lane for fact checking; collects primary-source evidence for planned claims.
- `fact-researcher-b` — Second independent evidence lane; looks for corroboration, counter-evidence, and source conflicts.
- `scout` — Fast read-only scout returning compressed context for handoff; use for exploratory codebase research and broad pattern searches.
- `task` — General-purpose subagent with full capabilities for delegated multi-step work.
- `visioner` — Read-only visual QA specialist for slide decks, UI/web screenshots and interaction states, and static canvas/export artifacts.
- `writer` — Bounded English writer for drafting or revision, including LaTeX passages and read-only proposed replacements.
- `zh-checker` — 中文只读 checker，可执行窄范围的语义漂移、逻辑与清晰度核查，或完整七维审查。
- `zh-writer` — 有界中文写作与修改 agent，支持 LaTeX 段落和只读修改稿，输出自然中文。

## Usage

1. Match the task to a domain above.
2. Load matching skills as needed for methods and evidence rules.
3. Choose the Agents you need from the descriptions above; OMP exposes their current availability.
4. Load the domain reference before starting matching work; it carries the required step order and checkpoints.
