---
name: improve-codebase-architecture
description: Find deepening opportunities in a codebase, informed by the domain language in CONTEXT.md and the decisions in docs/adr/. Use when the user wants to improve architecture, find refactoring opportunities, consolidate tightly-coupled modules, or make a codebase more testable and AI-navigable.
tags: [refactoring, architecture, design]
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities** — refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

## Linked resource boundary

This loaded Skill may reveal only its own exact linked resources. Read the
smallest task-relevant set through one remaining linked-resource batch and wait:

`RESOURCE EXTENSION | source=skill://improve-codebase-architecture | reads=<only-needed-exact-URIs-listed-below>`

- `skill://improve-codebase-architecture/LANGUAGE.md`
- `skill://improve-codebase-architecture/HTML-REPORT.md`
- `skill://improve-codebase-architecture/INTERFACE-DESIGN.md`

The `grill-with-docs` formats are a separate initial `WORKFLOW PLAN` candidate,
not relative resources of this Skill. This Skill does not select or load that
Skill after COMMIT.

## Glossary

Use these terms exactly in every suggestion. Consistent language is the point — don't drift into "component," "service," "API," or "boundary." Full definitions are in `skill://improve-codebase-architecture/LANGUAGE.md`.

- **Module** — anything with an interface and an implementation (function, class, package, slice).
- **Interface** — everything a caller must know to use the module: types, invariants, error modes, ordering, config. Not just the type signature.
- **Implementation** — the code inside.
- **Depth** — leverage at the interface: a lot of behaviour behind a small interface. **Deep** = high leverage. **Shallow** = interface nearly as complex as the implementation.
- **Seam** — where an interface lives; a place behaviour can be altered without editing in place. (Use this, not "boundary.")
- **Adapter** — a concrete thing satisfying an interface at a seam.
- **Leverage** — what callers get from depth.
- **Locality** — what maintainers get from depth: change, bugs, knowledge concentrated in one place.

Key principles (see `skill://improve-codebase-architecture/LANGUAGE.md` for the full list):

- **Deletion test**: imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **The interface is the test surface.**
- **One adapter = hypothetical seam. Two adapters = real seam.**

This skill is _informed_ by the project's domain model. The domain language gives names to good seams; ADRs record decisions the skill should not re-litigate.

## Authority and output

Default to a read-only report in the response. Create an HTML file only when the current task explicitly requests an artifact and native filesystem permission allows the write. Use a CDN or other network dependency only with native network permission and only when the requested artifact needs it; otherwise keep the artifact self-contained. Open a browser only when the current task requests it and a native browser or host-open action is available and allowed. These output choices do not follow merely from loading this Skill.

Update `CONTEXT.md` or an ADR only when the current task explicitly requests documentation changes and native filesystem permission allows them. Otherwise show the proposed term or decision record in the response.

## Process

### 1. Explore

Read the project's domain glossary and any ADRs in the area you're touching first.

Use Main's local search tools to walk entry points, callers, consumers, tests, and ADR-linked modules. For current architecture or library practice that could change a recommendation, make the bounded official-and-community evidence pass from `code-development`. Do not add a separate exploration Agent merely to repeat this search. Explore organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow** — interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

### 2. Present candidates in the requested format

Present a concise Markdown report in the response by default. When an authorized HTML artifact was explicitly requested, resolve the OS temp directory and use a fresh `<tmpdir>/architecture-review-<timestamp>.html` path unless the user supplied another safe target. Tell the user the absolute path after a successful write; do not open it automatically.

For an authorized HTML artifact, prefer embedded CSS and SVG so it remains self-contained. Use Tailwind, Mermaid, or another CDN only under the network boundary above. Use a graph only where relationships materially benefit from one; each candidate may include a compact before/after visual when useful.

For each candidate, use these fields; render them as cards only in an authorized HTML artifact:

- **Files** — which files/modules are involved
- **Problem** — why the current architecture is causing friction
- **Solution** — plain English description of what would change
- **Benefits** — explained in terms of locality and leverage, and how tests would improve
- **Before / After diagram** — side-by-side, custom-drawn, illustrating the shallowness and the deepening
- **Recommendation strength** — one of `Strong`, `Worth exploring`, `Speculative`, rendered as a badge

End the report with a **Top recommendation** section: which candidate you'd tackle first and why.

**Use CONTEXT.md vocabulary for the domain, and `skill://improve-codebase-architecture/LANGUAGE.md` vocabulary for the architecture.** If `CONTEXT.md` defines "Order," talk about "the Order intake module" — not "the FooBarHandler," and not "the Order service."

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Mark it clearly in the card (e.g. a warning callout: _"contradicts ADR-0007 — but worth reopening because…"_). Don't list every theoretical refactor an ADR forbids.

For an explicitly requested HTML artifact, see `skill://improve-codebase-architecture/HTML-REPORT.md` for optional scaffold and diagram patterns, subject to the same effect boundaries.

Do NOT propose interfaces yet. After presenting the report, ask the user: "Which of these would you like to explore?"

### 3. Grilling loop

Once the user picks a candidate, drop into a grilling conversation. Walk the design tree with them — constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

Documentation proposals happen as decisions crystallize; file effects remain conditional:

- **Naming a deepened module after a concept not in `CONTEXT.md`?** If `skill://grill-with-docs` was selected in the initial PLAN and loaded, propose the term using its returned CONTEXT format. Otherwise return the proposed term inline. Apply it only under the documentation-write boundary above.
- **Sharpening a fuzzy term during the conversation?** Show the exact `CONTEXT.md` change, then apply it only when requested and allowed.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR, framed as: _"Want me to record this as an ADR so future architecture reviews don't re-suggest it?"_ Only offer when the reason would actually be needed by a future explorer to avoid re-suggesting the same thing — skip ephemeral reasons ("not worth it right now") and self-evident ones. If `skill://grill-with-docs` was selected and loaded, use its returned ADR format; otherwise keep the proposal inline.
- **Want to explore alternative interfaces for the deepened module?** See `skill://improve-codebase-architecture/INTERFACE-DESIGN.md`.
