---
name: omp-enhancer-workflows
description: Workflow reference catalog for Main orchestration.
---

# Workflow reference catalog

Advisory reference only. Main selects workflows, Skills, Agents, and delegation width freely. OMP native instructions remain authoritative.

Phases: ANALYZE -> EXECUTE -> REVIEW. Main chooses direct work or delegation at each phase based on task complexity.

## Domain index

- `code` — Substantive code inspection, planning, diagnosis, implementation, refactoring, testing, build repair, performance, database, ML, OMP plugin development, or code review. D=[`skill://code-development`]. Reference: `skill://omp-enhancer-workflows/references/code.md`.
- `writing` — Prose drafting, revision, translation, or format conversion in any language (English, Chinese) or format (LaTeX, Markdown, Beamer, Word). D=[`skill://writing-review`, `skill://plain-chinese-writing`, `skill://writing-markdown-helper`, `skill://zh-writing-markdown-helper`, `skill://format-markdown2latex`, `skill://format-latex2markdown`, `skill://format-template-latex`, `skill://latex-beamer-slides`, `skill://slides-storyline`, `skill://docx`]. Reference: `skill://omp-enhancer-workflows/references/writing.md`.
- `research` — Source-backed research, web synthesis, comparison, recommendation, fact-checking, or claim-by-claim verdict. D=[`skill://fact-checking`, `skill://claim-extraction`, `skill://source-evaluation`, `skill://citation-authenticity`] C=[`skill://ecc-skill-catalog/research-ops/SKILL.md`, `skill://ecc-skill-catalog/deep-research/SKILL.md`]. Reference: `skill://omp-enhancer-workflows/references/research.md`.
- `visual` — Diagrams (draw.io), UI/UX design, visual artifacts, slides with visual layout, or rendered figure review. D=[`skill://drawio-diagram`, `skill://frontend-design`, `skill://canvas-design`]. Reference: `skill://omp-enhancer-workflows/references/visual.md`.
- `operations` — General multi-step analysis, investigation, network operations, security review, release/publish, marketing, SEO, or any non-trivial work not matching code, writing, research, or visual. D=[`skill://conventional-commits`, `skill://finishing-a-development-branch`] C=[`skill://ecc-skill-catalog/security-review/SKILL.md`, `skill://ecc-skill-catalog/security-scan/SKILL.md`, `skill://ecc-skill-catalog/network-config-validation/SKILL.md`, `skill://ecc-skill-catalog/marketing-campaign/SKILL.md`, `skill://ecc-skill-catalog/seo/SKILL.md`]. Reference: `skill://omp-enhancer-workflows/references/operations.md`.

## Usage

1. Match the task to a domain above.
2. Load matching skills as needed for methods and evidence rules.
3. ANALYZE: Main analyzes directly or delegates to analyzer for complex multi-slice work.
4. EXECUTE: Main executes directly or delegates to task/domain agents.
5. REVIEW: Main reviews directly or delegates to reviewer for complex/risky changes.
