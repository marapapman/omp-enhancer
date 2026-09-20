---
name: omp-enhancer-workflows
description: Workflow reference catalog for Main orchestration.
---

# Workflow reference catalog

Advisory reference only. Main selects workflows, Skills, Agents, and delegation width freely. OMP native instructions remain authoritative.

Phases: ANALYZE -> EXECUTE -> REVIEW. Main chooses direct work or delegation at each phase based on task complexity.

## Domain index

- `writing` — Prose and copy in any language (English, Chinese) or format (LaTeX, Markdown, Beamer, Word, PowerPoint/PPTX): the dedicated text tools writer/zh-writer author every wording surface, while Main/task handle code, evidence, structure, layout, conversion, and validation. D=[`skill://writing-review`, `skill://format-humanizer`, `skill://plain-chinese-writing`, `skill://zh-research-achievement-writing`, `skill://zh-format-humanizer`, `skill://zh-writing-review`, `skill://zh-writing-polish`, `skill://writing-markdown-helper`, `skill://zh-writing-markdown-helper`, `skill://format-markdown2latex`, `skill://format-latex2markdown`, `skill://format-template-latex`, `skill://latex-beamer-slides`, `skill://beamer-to-powerpoint`, `skill://slides-storyline`, `skill://docx`]. Reference: `skill://omp-enhancer-workflows/references/writing.md`.
- `research` — Source-backed research, web synthesis, comparison, recommendation, fact-checking, or claim-by-claim verdict. D=[`skill://fact-checking`, `skill://claim-extraction`, `skill://source-evaluation`, `skill://citation-authenticity`]. Reference: `skill://omp-enhancer-workflows/references/research.md`.
- `visual` — Diagrams (draw.io), UI/UX design, static visual artifacts, or rendered figure review. D=[`skill://drawio-skill`, `skill://assetseeker`, `skill://frontend-design`, `skill://canvas-design`, `skill://format-humanizer`, `skill://zh-format-humanizer`]. Reference: `skill://omp-enhancer-workflows/references/visual.md`.

## Agent descriptions

- `checker` — Read-only English checker for a narrow semantic-drift, logic, and clarity check or a broad seven-dimension advisory audit.
- `fact-challenger` — Adversarial reviewer that attacks recorded verdicts and reports claims the plan missed (AGREE / REBUT / MISSED).
- `fact-planner` — Decomposes a fact-checking task into checkable claims, evidence plans, risk levels, and scope boundaries.
- `fact-researcher-a` — First independent evidence lane for fact checking; collects primary-source evidence for planned claims and lists claims the plan omitted.
- `fact-researcher-b` — Second independent evidence lane; looks for corroboration, counter-evidence, source conflicts, and omitted claims.
- `fact-researcher-c` — Third independent evidence lane; third-model corroboration plus an independent enumeration of omitted claims.
- `scout` — Fast read-only scout returning compressed context for handoff; use for exploratory codebase research and broad pattern searches.
- `task` — General-purpose subagent with full capabilities for delegated multi-step work.
- `writer` — Dedicated English text tool: the only author for English prose/copy (drafting, revision, translation, polishing, titles, labels, captions, notes, UI copy), including LaTeX passages; returns proposals read-only. Served by the host's packaged Agent adapter because the current OMP ExtensionAPI exposes model workers only as agents; this label is not a second general-purpose writer agent and grants no code or file permissions.
- `zh-checker` — 中文只读 checker，可执行窄范围的语义漂移、逻辑与清晰度核查，或完整七维审查。
- `zh-writer` — 专用中文文本工具：中文散文/文案（起草、修订、翻译、润色、标题、标签、图注、笔记、界面文案）的唯一作者，支持 LaTeX 段落，返回只读修改稿，输出自然中文。因当前 OMP ExtensionAPI 仅以 Agent 形式暴露模型 worker，由宿主打包 Agent 适配器承载；该标识不是第二个通用写作 agent，不授予代码或文件权限。

Compatibility note: the `writer` and `zh-writer` text tools are listed above under their packaged Agent adapter names because the current OMP host exposes model workers through agents (the ExtensionAPI offers `registerTool` for command tools only). That backend label is a compatibility adapter, not a second general-purpose writer agent, and it grants no code or file permissions; `writer`/`zh-writer` remain the dedicated language-matched text capabilities, while Main/task own code and other non-text actions.

## Usage

1. Match the task to a domain above.
2. Load matching skills as needed for methods and evidence rules.
3. Choose the Agents you need from the descriptions above; OMP exposes their current availability.
4. Load the domain reference before starting matching work; it carries the required step order and checkpoints.
