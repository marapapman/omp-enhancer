---
name: fsharp-patterns
description: Review and implement idiomatic F# with explicit domain types, total pattern handling, controlled effects, and testable module boundaries. Use for `.fs`, `.fsx`, or F# project changes and reviews.
---

# F# Patterns

Bind advice to the target .NET SDK, F# language version, project file, and framework APIs in the repository.

## Review Order

1. Model domain states with records, discriminated unions, and constrained constructors so invalid combinations are difficult to represent.
2. Check every match for deliberate exhaustiveness. Avoid wildcard branches that silently absorb future union cases unless forward compatibility requires one.
3. Keep pure transformations separate from I/O, clocks, randomness, environment access, and mutable state. Inject effects at module boundaries.
4. Use `option` for expected absence and `Result` for recoverable domain failure. Preserve error context instead of throwing or discarding failures in pipelines.
5. Check sequence and async code for repeated enumeration, unbounded concurrency, cancellation loss, and blocking waits.
6. Preserve public signatures and serialization shapes unless the task authorizes a migration. Inspect C# interoperability where `[<CLIMutable>]`, null, tasks, or attributes cross boundaries.
7. Add focused tests for union cases, boundary values, errors, and effect adapters; run the repository's real `dotnet` commands when authorized.

Report concrete findings with the triggering input and impact. Do not impose stylistic rewrites without a correctness, maintainability, or compatibility benefit.
