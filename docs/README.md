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

- [Flash Main prompt optimization](DEEPSEEK_PROMPT_OPTIMIZATION.md)
- [Main model workflow evaluation, 2026-07-18](MAIN_MODEL_WORKFLOW_EVALUATION_2026-07-18.md)
- [DeepSeek Flash expanded E2E, 2026-07-18 (stopped at 84/89 sessions)](DEEPSEEK_EXPANDED_E2E_2026-07-18.md)
- [Skill resource path and compatibility-link repair record, 2026-07-19](SKILL_RESOURCE_PATH_FIX_2026-07-19.md)

The prompt-optimization note labels its current contract separately from its
historical prompt snapshots. Other dated records preserve the test harness,
observations, and result counts from their stated snapshots. Old phase names,
generated sizes, load order, and pass counts do not define current runtime
behavior. The dated material under
[`superpowers/`](superpowers/README.md) is also a historical archive.

All non-simple workflows use a subagent-driven soft default when matching Agents are exposed: domain Agents precede generic `task`, independent checkpoints may share a batch, dependencies run in order, and Main retains integration, final verification, permissions, and external effects. Mechanical/direct-simple work and unresolved `writing.pending` input are explicit exceptions; unavailable capacity or unsafe splitting is recorded as a fallback limitation. Code guidance remains consolidated as `code.dev` plus `code-development`, or `omp.plugin` plus its conditional `references/omp-enhancer.md`; it adds reviewed vertical TDD slices, `MAIN REVIEW`, and bounded reviewer reconciliation. These are soft instructions rather than a router, gate, fixed fan-out, or automatic loop. Retired phase-specific names may appear only in the historical archive.
