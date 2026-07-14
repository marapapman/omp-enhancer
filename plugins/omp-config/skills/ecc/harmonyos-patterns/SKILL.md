---
name: harmonyos-patterns
description: Review HarmonyOS ArkTS, ArkUI, ability lifecycle, permission, and build changes against the repository's declared SDK. Use for `.ets`, `module.json5`, `build-profile.json5`, or HarmonyOS application work.
---

# HarmonyOS Patterns

Use the SDK level, device class, module type, and APIs declared by the project. Verify version-sensitive guidance against installed SDK sources or official HarmonyOS documentation.

## Review Order

1. Trace the UIAbility, page, service, or extension lifecycle and ensure subscriptions, timers, tasks, and resources are released at the matching boundary.
2. Keep ArkUI state ownership explicit. Avoid duplicated sources of truth, render-time side effects, unstable list keys, and high-frequency work inside reactive updates.
3. Validate ArkTS types at platform and network boundaries. Parse external data, handle nullable values, and preserve structured errors rather than weakening types.
4. Check `module.json5`, permissions, capabilities, signing, products, and build profiles together. Request only permissions required by the exercised feature and handle denial paths.
5. Keep network, storage, account, and device APIs behind testable adapters. Never embed credentials, signing material, private endpoints, or user identifiers.
6. Check task concurrency, cancellation, background execution limits, and UI-thread affinity for the declared SDK.
7. Build the exact product/flavor and run focused unit or device tests when the environment and host authorization permit it. State simulator or device limitations explicitly.

Do not migrate SDK APIs or application architecture unless the user requested that scope.
