# Documentation

Current contracts and development guides:

- [Architecture and runtime contracts](ARCHITECTURE.md)
- [Development, validation, and release](DEVELOPMENT.md)
- [OMP Enhancer self-development method](OMP_ENHANCER_SELF_DEVELOPMENT.md)
- [Workflow and Skill E2E testing](WORKFLOW_E2E_TESTING.md)
- [Workflow definitions and generation](WORKFLOW_DEVELOPMENT.md)
- [Full Skill and workflow conflict audit, 2026-07-19 to 2026-07-20](SKILL_WORKFLOW_CONFLICT_AUDIT_2026-07-19.md)

Current discovery is exact and staged: only a native `skill-prompt` body named
`omp-enhancer-workflows` counts as a supplied index; PLAN and READY begin at byte
0; selected top-level `D` and enumerated nested ECC `C` URIs load directly; and
only an unlisted long-tail need enters the `skill://ecc-skill-catalog` chain.
The index, workflow cards, and Skills guide Main's own choices and do not create
a router or gate.

Optimization and dated evaluation records:

- [Flash Main prompt optimization (archived 2026-07-24)](superpowers/DEEPSEEK_PROMPT_OPTIMIZATION.md)
- [Main model workflow evaluation, 2026-07-18](MAIN_MODEL_WORKFLOW_EVALUATION_2026-07-18.md)
- [DeepSeek Flash expanded E2E, 2026-07-18 (stopped at 84/89 sessions)](DEEPSEEK_EXPANDED_E2E_2026-07-18.md)
- [Skill resource path and compatibility-link repair record, 2026-07-19](SKILL_RESOURCE_PATH_FIX_2026-07-19.md)

The prompt-optimization note has been archived under
[`superpowers/`](superpowers/README.md); it is a historical record, not a
current contract. Other dated records preserve the test harness, observations,
and result counts from their stated snapshots. Old phase names, generated sizes,
load order, and pass counts do not define current runtime behavior. The dated
material under [`superpowers/`](superpowers/README.md) is also a historical
archive.

All workflow cards are advisory. Main orchestrates through ANALYZE -> EXECUTE -> REVIEW: it analyzes directly for focused work or delegates to the `analyzer` agent for complex multi-slice work, executes directly for simple changes or delegates to `task`/domain agents for substantial work, and reviews simple changes directly or delegates to `reviewer` for complex or risky changes. Domain Agents precede generic `task`; independent checkpoints may share a batch, dependencies run in order, and Main retains integration, final verification, permissions, and external effects. Unavailable capacity or unsafe splitting is recorded as a fallback limitation. Code guidance remains consolidated as the `code` workflow plus `code-development`; it adds reviewed vertical TDD slices and bounded reviewer reconciliation. These are soft instructions rather than a router, gate, fixed fan-out, or automatic loop. Retired phase-specific names may appear only in the historical archive.