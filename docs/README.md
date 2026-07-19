# Documentation

Current documentation:

- [Architecture and runtime contracts](ARCHITECTURE.md)
- [Development, validation, and release](DEVELOPMENT.md)
- [OMP Enhancer self-development method](OMP_ENHANCER_SELF_DEVELOPMENT.md)
- [Workflow and Skill E2E testing](WORKFLOW_E2E_TESTING.md)
- [Workflow definitions and generation](WORKFLOW_DEVELOPMENT.md)
- [Flash Main prompt optimization](DEEPSEEK_PROMPT_OPTIMIZATION.md)
- [Main model workflow evaluation, 2026-07-18](MAIN_MODEL_WORKFLOW_EVALUATION_2026-07-18.md)
- [DeepSeek Flash expanded E2E, 2026-07-18 (stopped at 84/89 sessions)](DEEPSEEK_EXPANDED_E2E_2026-07-18.md)

The dated material under [`superpowers/`](superpowers/README.md) is a historical archive. It preserves earlier plans and reports but does not define current runtime behavior.

Current code guidance is intentionally consolidated: ordinary software work uses `code.dev` plus `code-development`; OMP Enhancer self-development uses `omp.plugin` plus that Skill's conditional `references/omp-enhancer.md`. Substantive mutation is subagent-driven when the native roles are available: Main writes and integrates a reviewed parallel-slice plan, `task` owns each vertical TDD slice, Main performs `MAIN REVIEW`, and `reviewer` challenges the supplied bounded evidence before supported repairs return to `task`. This is soft guidance rather than a router, gate, fixed fan-out, or automatic loop. The retired phase-specific workflow, Skill, and Agent names may still appear in the historical archive only.
