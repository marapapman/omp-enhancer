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
- `visual` — Diagrams (draw.io), UI/UX design, visual artifacts, slides with visual layout, or rendered figure review. D=[`skill://drawio-skill`, `skill://frontend-design`, `skill://canvas-design`]. Reference: `skill://omp-enhancer-workflows/references/visual.md`.
- `operations` — General multi-step analysis, investigation, network operations, security review, release/publish, marketing, SEO, or any non-trivial work not matching code, writing, research, or visual. D=[`skill://conventional-commits`, `skill://finishing-a-development-branch`] C=[`skill://ecc-skill-catalog/security-review/SKILL.md`, `skill://ecc-skill-catalog/security-scan/SKILL.md`, `skill://ecc-skill-catalog/network-config-validation/SKILL.md`, `skill://ecc-skill-catalog/marketing-campaign/SKILL.md`, `skill://ecc-skill-catalog/seo/SKILL.md`]. Reference: `skill://omp-enhancer-workflows/references/operations.md`.

## Agent descriptions

- `analyzer` — Read-only analysis and planning specialist; drafts detailed dependency-ordered implementation and evidence plans from Main's frozen brief.
- `checker` — Read-only English checker for a narrow semantic-drift, logic, and clarity check or a broad seven-dimension advisory audit.
- `designer` — UI/UX specialist for design implementation, review, and visual refinement.
- `ecc-network-architect` — Designs enterprise or multi-site network architecture from requirements.
- `ecc-network-config-reviewer` — Reviews router and switch configurations for security, correctness, stale references, and risky change-window commands.
- `ecc-network-troubleshooter` — Diagnoses network connectivity, routing, DNS, interface, and policy symptoms with an evidence-backed root cause summary.
- `ecc-opensource-forker` — Creates a sanitized public-release staging copy while keeping the private source tree read-only.
- `ecc-opensource-packager` — Adds approved public documentation and setup assets to an independently sanitized staging copy.
- `ecc-opensource-sanitizer` — Verifies an open-source fork is fully sanitized before release; scans for leaked secrets, PII, and internal references.
- `ecc-security-reviewer` — Read-only security vulnerability detection specialist for code, configurations, and dependencies.
- `fact-cross-checker` — Compares independent fact-check evidence lanes and identifies agreement, conflicts, stale evidence, and unresolved claims.
- `fact-planner` — Decomposes a fact-checking task into checkable claims, evidence plans, risk levels, and scope boundaries.
- `fact-researcher-a` — First independent evidence lane for fact checking; collects primary-source evidence for planned claims.
- `fact-researcher-b` — Second independent evidence lane; looks for corroboration, counter-evidence, and source conflicts.
- `fact-reviewer` — Final fact-check reviewer; reviews plan, evidence, cross-check status, and final verdicts for overclaiming.
- `librarian` — Researches external libraries and APIs by reading source code; returns definitive, source-verified answers.
- `reviewer` — Code review specialist for quality and security analysis.
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
