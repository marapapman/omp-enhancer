---
name: build-toolchain-diagnostics
description: Diagnose compiler, linker, package-manager, bundler, code-generation, and SDK build failures from the exact command and current output. Use before repairing a failed build or upgrading a toolchain.
---

# Build Toolchain Diagnostics

Localize the first causal build failure before changing source or configuration.

## Procedure

1. Record the exact build command, working directory, exit status, target, tool versions, lockfile, and current failure output. Treat later cascade errors as secondary until proven otherwise.
2. Reproduce only when command execution is authorized. Do not install, upgrade, clean caches, or delete artifacts merely to obtain a reproduction.
3. Classify the boundary: source/type error, generated code, dependency resolution, compiler or SDK mismatch, build configuration, linker/ABI, environment, or stale artifact.
4. Compare the failing invocation with repository scripts, CI configuration, lockfiles, and a known-good target. Bind all conclusions to the observed platform and version.
5. Form one narrow hypothesis at a time and test it with the cheapest read-only evidence available. Prefer verbose or diagnostic modes that do not mutate the dependency graph.
6. If repair is authorized, route the bounded change through `code.dev`; use the relevant language pattern skill and preserve unrelated configuration.
7. Re-run the exact failing command, then the focused tests or package step affected by the repair. Report the command, revision, exit status, and remaining warnings.

## Evidence Standard

A diagnosis is complete only when it names the earliest causal error, the responsible file or configuration boundary, the version context, and evidence that distinguishes the cause from downstream noise. Never report a successful unrelated build as verification.
