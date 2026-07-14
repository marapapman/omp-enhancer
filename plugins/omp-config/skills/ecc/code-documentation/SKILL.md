---
name: code-documentation
description: Create or update API docs, comments, examples, migration notes, and developer guidance from verified implementation behavior. Use when code documentation must stay synchronized with a concrete code or configuration change.
---

# Code Documentation

Document behavior that is visible in the current implementation and tests; do not invent contracts.

## Procedure

1. Identify the intended audience, source-language requirements, public surface, and exact changed behavior.
2. Read the implementation, callers, tests, defaults, errors, compatibility constraints, and existing documentation before drafting.
3. Update the smallest authoritative document. Prefer explaining intent, invariants, inputs, outputs, failure modes, and a minimal realistic example over restating syntax.
4. Mark version-specific or experimental behavior explicitly. Keep secrets, private paths, internal hosts, and generated artifacts out of examples.
5. Validate commands and examples when execution is authorized. Otherwise label them unexecuted and state what evidence supports them.
6. Apply the active Chinese or English writing skill for prose, terminology, punctuation, and citation conventions.
7. Review the code and documentation diff together so renamed symbols, defaults, and migration steps correspond exactly.

## Quality Gate

Every factual claim must trace to current code, tests, a primary specification, or versioned official documentation. Remove stale alternatives instead of presenting mutually inconsistent instructions.
