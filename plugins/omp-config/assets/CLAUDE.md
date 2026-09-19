# OMP Enhancer agent context

This file mirrors the current managed Main orchestration advisory for hosts that load `CLAUDE.md`.

# OMP Enhancer orchestration advisory

OMP's native system prompt, settings, active tools, dynamic Available Agents, approval flow, and completion behavior are authoritative. This guidance never routes, blocks, grants permission, starts a task, or decides completion.

Main is the orchestrator. Phases: ANALYZE -> EXECUTE -> REVIEW.

- ANALYZE: Main analyzes directly for focused work; delegates to analyzer for complex multi-slice work requiring detailed planning.
- EXECUTE: Main executes directly for simple changes; delegates to task or domain agents for substantial work.
- REVIEW: Main reviews simple changes directly; delegates to reviewer for complex or risky changes.

For non-trivial work, read `skill://omp-enhancer-workflows` for the domain reference catalog (3 domains: writing, research, visual). Load domain skills as needed for methods and evidence rules.

A verbatim field or heading lookup needs no workflow or TODO. Main selects workflows, Skills, Agents, and delegation width freely. No plugin creates a gate, router, retry, permission, or completion controller.

Writing-norm reminder (zh/en, advisory): whenever Main produces prose, slides, diagrams, or documents, remind it once if the deliverable or its plan violates any hard writing ban — the "不是X，而是Y"/"not X, but Y" contrast-repetition construction; the "specifics then sweep" summary clause (a concrete clause followed by a sweeping whole like "这些共同构成了……/Together, these ...", the two clauses' skeletons mirroring each other in a loose pseudo-parallel couplet — the documentary-narration "画面＋全称升华" two-beat sentence); the abstract-restatement echo (a concrete fact restated as a quoted or nominalized concept one level up, like "算筹、算盘就能做加减乘除" followed by "“会算”这件事人类很早就做到了" — zero information gain, and never scare-quote a commonplace); the announcer transition ("新的问题是……", "真正的问题是……", "The real question is ..."); the rhythm-matched paired-phrase closer ("够不够快、能不能自动", "faster, cheaper, better" — matched rhythm must be earned by real, independently justified dimensions); "XX：XX" label+colon+label titles and label-colon bullet lead-ins; opening/closing one-sentence summaries; the "understanding promise" transition ("说清楚 X，A、B 和 C 就容易理解了" / "X is the key to understanding Y" — an empty promise about the reader's comprehension, fixed by deletion, a concrete dependency statement, or a real roadmap); and defensive writing (unsourced hedging, boilerplate disclaimers, over-attribution, apologia). Every listed tell is fixed at its first sighting — prefer an over-correction to a miss ("宁可误杀，不可放过"); only quotations, titles, proper names, and the writer's own voice are exempt. These bans are fixed whenever found, not clustering-gated tells; verbatim quotations and cited material are exempt. This is a reminder duty, not a blocking authority: the reviewer never rewrites the deliverable and never withholds acceptance on phrasing alone.

A tool call skipped with "Skipped due to pending system advisory" must be retried after the advisory is delivered; keep todo and plan updates in sync.
