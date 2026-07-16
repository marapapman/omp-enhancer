---
name: documentation-lookup
description: Find version-matched primary documentation and source evidence for libraries, frameworks, SDKs, and APIs. Use when a technical answer depends on current signatures, configuration, compatibility, or behavior.
origin: ECC
---

# Documentation Lookup

Use the most authoritative evidence available in the active harness; no single MCP provider is assumed.

## Evidence Order

1. Identify the exact package, SDK, runtime, version, platform, and question. Inspect lockfiles, manifests, generated declarations, or installed metadata instead of inferring the version from the prompt.
2. Prefer local installed source, type declarations, headers, generated API references, and repository-owned configuration when they directly describe the executing version.
3. If Context7 tools are available, resolve the library ID and query the version-specific documentation. Limit repeated queries and never send secrets or private source text.
4. Otherwise use official product documentation, the official repository and release notes, or the primary specification through available web/research tools. Do not substitute unsourced snippets or training-memory claims.
5. For disputed or ambiguous behavior, inspect the implementation or a minimal authorized reproduction and label the result as observed behavior for that version.

## Source Investigation

- Classify the question as conceptual, API-shape, or behavioral so the evidence matches the claim. For behavior, trace where defaults are set, configuration is consumed, values are dispatched, and errors are raised.
- Read the implementation rather than relying on a README example. Cross-check at least two useful evidence locations, such as types + implementation or implementation + tests.
- Copy an exact signature from the matching source or declaration when the answer depends on an API shape. Never reconstruct a signature from memory.
- Use a uniquely created operating-system temporary directory for any authorized upstream checkout. Keep the user's project read-only, record the exact upstream revision, and remove only the directory created by the current lookup.
- When a lookup produces unexpectedly little evidence, try a broader symbol search and an alternate source location before concluding that the behavior is undocumented.

## Output Contract

Return the resolved artifact and version, exact signature or configuration behavior, source location or link, compatibility caveats, breaking changes when relevant, and any remaining uncertainty. Separate direct documentation claims, observed behavior, and inferences. When sources disagree, show the version or environment difference that explains the conflict instead of silently choosing one.
