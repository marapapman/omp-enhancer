---
name: skill-stocktake
description: Audit a current Skill inventory for trigger quality, scope, overlap, freshness, references, and maintenance cost. Use for a changed-only quick scan or a complete stocktake of an explicitly identified inventory.
origin: ECC
---

# Skill Stocktake

Audit the inventory visible in the active host plus any explicit repository or
catalog paths supplied by the user. One conventional directory is never proof
that a Skill is unavailable.

## Modes

- **Quick scan:** compare the changed Skill files with a prior result whose
  revision and inventory source are known.
- **Full stocktake:** enumerate every Skill in the declared inventory and review
  the complete set.

If no trustworthy prior result exists, use a full stocktake. Do not create or
update a results file unless that write is in scope.

## 1. Inventory deterministically

For every Skill, record:

- exact name and source URI or path;
- description and trigger boundary;
- frontmatter validity;
- file size and referenced resources;
- revision, digest, or mtime used for change detection;
- inbound references from workflows, rules, Agents, or documentation.

Validate exact `skill://` URIs through the active resolver. For repository
files, enumerate the explicitly scoped roots with fast local search. Keep native
inventory, packaged catalog entries, and external repositories distinct.

## 2. Evaluate complete slices

Group related Skills only when cross-reading them is necessary to judge overlap.
Consult the current dynamic Available Agents and prefer a matching audit Agent;
otherwise native `task` may own one complete bounded group. Main chooses group
size and fork width from context size, overlap, dependencies, current capacity,
and cost. Batch independent groups and delay any group that depends on a shared
inventory or reference map.

Each assignment receives the inventory rows, exact Skill bodies, common
checklist, and current rules relevant to that group. It returns structured
evidence for every Skill. Main owns coverage accounting, cross-group merge,
verification, fallback when delegation is unavailable or unsafe, and final
recommendations.

## Checklist

- **Trigger fit:** description says what the Skill does and when to use it.
- **Actionability:** instructions add non-obvious reusable method.
- **Scope:** no hidden router, permission expansion, or completion controller.
- **Overlap:** duplication is evidenced against named current Skills.
- **Freshness:** drift-prone tool names, APIs, flags, and claims are verified
  against current authoritative sources when network access is in scope.
- **References:** every local Skill, Agent, command, URI, and bundled resource
  resolves or is explicitly labeled external.
- **Context cost:** long material justifies its loading cost or moves to a
  directly linked reference.
- **Validation:** examples and scripts have proportionate current evidence.

## Verdicts

Use `Keep`, `Improve`, `Update`, `Retire`, or `Merge into <name>`. Every reason
must cite the concrete defect or unique value. A Retire or Merge recommendation
names what covers the need and checks inbound references. Never use “unchanged”
or “superseded” without evidence.

## Consolidate and report

Merge duplicate findings across groups and recheck every proposed target against
the current inventory. Report total coverage, changed coverage, unresolved
reads, verdict counts, precise findings, and recommended next steps.

Archive, delete, merge, rewrite, install, or publish only with the user's
corresponding authorization. The stocktake itself is advisory and grants no
mutation or completion permission.
