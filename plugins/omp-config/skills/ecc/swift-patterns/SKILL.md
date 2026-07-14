---
name: swift-patterns
description: Review and implement Swift with explicit ownership, error handling, concurrency isolation, API compatibility, and testable boundaries. Use for Swift packages, Apple platform apps, server Swift, or migration reviews.
---

# Swift Patterns

First establish the Swift language mode, deployment target, package or Xcode configuration, and enabled strict-concurrency checks.

## Review Order

1. Make ownership and lifetime clear. Inspect escaping closures, delegate cycles, task captures, and long-lived subscriptions for leaks or premature release.
2. Preserve actor isolation. Treat `Sendable`, `@MainActor`, cancellation, task groups, and detached tasks according to the configured compiler mode; do not silence warnings with unchecked conformance without proof.
3. Model recoverable failure with typed errors or meaningful context. Avoid `try!`, force unwraps, and swallowed errors unless a checked invariant makes the operation impossible to fail.
4. Keep value semantics where copying is intended; use reference identity deliberately. Protect collection indices and mutation across suspension points.
5. Maintain source, ABI, Codable, and platform availability compatibility required by the package. Gate newer APIs with the correct availability checks.
6. Separate platform I/O, clocks, networking, persistence, and UI from pure logic so tests can control them.
7. Run the repository's exact `swift test`, build, or Xcode test command when authorized, and include concurrency or sanitizer evidence when relevant.

Prioritize behavioral defects and compatibility risks over subjective formatting preferences.
