---
name: agent-sort
description: Build an evidence-backed ECC install plan for a specific repo by sorting skills, commands, rules, hooks, and extras into DAILY vs LIBRARY buckets through repo-aware review. Use when the task is to trim ECC to what a project actually needs instead of keeping the full bundle active.
origin: ECC
---

# Agent Sort

Apply this method after Main selects and loads it for a project-specific ECC inventory task.

The goal is not to guess what "feels useful." The goal is to classify ECC components with evidence from the actual codebase.

Returning a response-local plan is the default. Any persistent install plan, inventory, index, file, hook, rule, script, installation, removal, or configuration change is allowed only for the exact named target and operation with explicit user authorization plus native permission at execution time. This method does not create or recommend a secondary Skill router and does not alter the current OMP Skill inventory.

## Selected task scope

- A project only needs a subset of ECC and full installs are too noisy
- The repo stack is clear, but nobody wants to hand-curate skills one by one
- A team wants a repeatable install decision backed by grep evidence instead of opinion
- The requested inventory needs to distinguish frequently relevant surfaces from on-demand library/reference surfaces
- A repo has drifted into the wrong language, rule, or hook set and needs cleanup

## Non-Negotiable Rules

- Use the current repository as the source of truth, not generic preferences
- Every DAILY decision must cite concrete repo evidence
- LIBRARY does not mean "delete"; it means "keep accessible without loading by default"
- Do not install hooks, rules, or scripts that the current repo cannot use
- Prefer ECC-native surfaces; do not introduce a second install system

## Outputs

Produce these artifacts in order:

1. DAILY inventory
2. LIBRARY inventory
3. install plan
4. verification report
5. optional response-local searchable index

## Classification Model

Use two buckets only:

- `DAILY`
  - candidate for frequent task-local selection; it is never automatically loaded at session start
  - strongly matched to the repo's language, framework, workflow, or operator surface
- `LIBRARY`
  - useful to retain for explicit on-demand selection
  - should remain reachable through the host's existing inventory or an authorized plain index

## Evidence Sources

Use repo-local evidence before making any classification:

- file extensions
- package managers and lockfiles
- framework configs
- CI and hook configs
- build/test scripts
- imports and dependency manifests
- repo docs that explicitly describe the stack

Useful commands include:

```bash
rg --files
rg -n "typescript|react|next|supabase|django|spring|flutter|swift"
cat package.json
cat pyproject.toml
cat Cargo.toml
cat pubspec.yaml
cat go.mod
```

## Review dimensions

The six headings below are review dimensions, not a fixed assignment count or fanout. Main groups safe independent slices dynamically from current Available Agents, native capacity, dependencies, complete assignment input, and write-set overlap. It may delegate one or more bounded slices or evaluate dependent dimensions sequentially.

1. Agents
   - classify `agents/*`
2. Skills
   - classify `skills/*`
3. Commands
   - classify `commands/*`
4. Rules
   - classify `rules/*`
5. Hooks and scripts
   - classify hook surfaces, MCP health checks, helper scripts, and OS compatibility
6. Extras
   - classify contexts, examples, MCP configs, templates, and guidance docs

Do not create one task per heading merely because the list has six entries.

## Core Workflow

### 1. Read the repo

Establish the real stack before classifying anything:

- languages in use
- frameworks in use
- primary package manager
- test stack
- lint/format stack
- deployment/runtime surface
- operator integrations already present

### 2. Build the evidence table

For every candidate surface, record:

- component path
- component type
- proposed bucket
- repo evidence
- short justification

Use this format:

```text
skills/frontend-patterns | skill | DAILY | 84 .tsx files, next.config.ts present | core frontend stack
skills/django-patterns   | skill | LIBRARY | no .py files, no pyproject.toml       | not active in this repo
rules/typescript/*       | rules | DAILY | package.json + tsconfig.json            | active TS repo
rules/python/*           | rules | LIBRARY | zero Python source files             | keep accessible only
```

### 3. Decide DAILY vs LIBRARY

Promote to `DAILY` when:

- the repo clearly uses the matching stack
- the component is general enough to be a frequent task-local candidate
- the repo already depends on the corresponding runtime or workflow

Demote to `LIBRARY` when:

- the component is off-stack
- the repo might need it later, but not every day
- it adds context overhead without immediate relevance

### 4. Build the install plan

Translate the classification into action:

- DAILY skills -> install or keep in `.claude/skills/`
- DAILY commands -> keep as explicit shims only if still useful
- DAILY rules -> install only matching language sets
- DAILY hooks/scripts -> keep only compatible ones
- LIBRARY surfaces -> keep accessible through the existing inventory or an authorized plain index

If the repo already uses selective installs, update that plan instead of creating another system.

### 5. Prepare an optional searchable index

When the user requests a searchable summary, return a plain response-local index containing:

- a short explanation of DAILY vs LIBRARY
- grouped trigger keywords
- exact existing Skill identities or resource locations

Do not create another Skill, router, or trigger layer. Persist the index only under the authority boundary above.

### 6. Verify the result

After the plan is applied, verify:

- every DAILY file exists where expected
- stale language rules were not left active
- incompatible hooks were not installed
- the resulting install actually matches the repo stack

Return a compact report with:

- DAILY count
- LIBRARY count
- removed stale surfaces
- open questions

## Optional next-method candidates

These exact Skill URIs are candidates for a new `WORKFLOW PLAN` chosen by Main. Never automatically load or hand off to them from this body:

- interactive installation or repair: `skill://ecc-skill-catalog/configure-ecc/SKILL.md`
- overlap cleanup or catalog review: `skill://ecc-skill-catalog/skill-stocktake/SKILL.md`
- broader context trimming: `skill://ecc-skill-catalog/strategic-compact/SKILL.md`

If Main does not select one in a later plan, leave the recommendation as report data.

## Output Format

Return the result in this order:

```text
STACK
- language/framework/runtime summary

DAILY
- frequent task-local candidates with evidence

LIBRARY
- searchable/reference items with evidence

INSTALL PLAN
- what could be installed, removed, or indexed when authorized

VERIFICATION
- checks run and remaining gaps
```
