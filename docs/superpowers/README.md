# Historical Design Archive

The dated files under `plans/`, `specs/`, and `reports/` preserve earlier design discussions, implementation plans, and point-in-time verification reports.

They are historical evidence, not current runtime documentation. In particular, some files describe retired hard routing, workflow gates, completion ownership, automatic repair turns, classifier preflight, or old `*_gate` tool names. Those designs must not be inferred to exist in the current code.

Use the current documentation instead:

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) for runtime behavior and authority boundaries;
- [`../DEVELOPMENT.md`](../DEVELOPMENT.md) for development, testing, packaging, and release;
- [`../WORKFLOW_DEVELOPMENT.md`](../WORKFLOW_DEVELOPMENT.md) for workflow definitions and generated references;
- [`../../README.md`](../../README.md) for installation and normal use.

Do not rewrite dated archive files merely to match the current implementation. Add a new dated record when historical traceability is useful, and update the current guides whenever behavior changes.
