---
name: go-testing
description: Handle Go testing tasks by following the repository's current test framework, package layout, assertion conventions, and focused verification commands.
---

# Go Testing

Follow the repository's existing test framework, helpers, package style, fixtures, and commands before introducing a new pattern. Inspect nearby tests and module configuration first.

## Testing method

- Test observable behavior at the narrowest useful behavioral seam, not private implementation details.
- Choose internal or external test packages from the behavior that needs access and the repository's convention.
- Keep error handling explicit and avoid exporting production symbols solely for tests.
- Use table-driven tests with `t.Run` when cases share setup and assertions; use separate tests when that makes failures clearer.
- Separate I/O from business logic only when the production design benefits, not solely to satisfy a test style.
- Consider concurrency when the target behavior is concurrent. Run `-race` only when relevant, affordable, and supported by the focused environment.

## Framework and dependency boundary

Use the standard library when that is the repository's convention. If the repository already uses `testify`, follow its local `require` and `assert` conventions. Do not add or install `testify`, another assertion library, a mock generator, or any dependency unless the current task explicitly requests or requires that change and native package-install permission allows it.

## Placement and commands

Follow existing test placement rather than requiring one test file per source file. Put a test where the repository's package structure and behavioral seam make ownership clearest; preserve established benchmark and integration-test locations.

Prefer the smallest command that proves the changed behavior, such as a package-focused `go test` invocation. Expand to broader package, module, or race verification in proportion to risk. Run any command only when it is within the current task and native execution permission allows it; examples are not authorization to execute.

When fixing a failure, preserve valid RED evidence, make the smallest production change, rerun the same focused command for GREEN, and then run the justified broader check from the loaded code workflow.
