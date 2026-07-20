---
name: writing-skills
description: Use when creating, revising, or validating a reusable Skill and deciding its triggers, contents, resources, or evaluation evidence.
---

# Writing Skills

Create a compact guide for non-obvious knowledge or a repeatable method. Keep it advisory; it does not create runtime permissions, routing, lifecycle gates, or completion authority.

Personal Skill directories such as `~/.claude/skills` and `~/.agents/skills/` are authoring or installation destinations, not the exhaustive OMP runtime Skill inventory. Use the Skill inventory and resource identities exposed by the current host when loading a Skill.

## Define the contract

1. Collect concrete positive and negative trigger examples.
2. Choose only the reusable knowledge, procedure, or resource they need.
3. Keep project-only conventions in project guidance.
4. Match instruction freedom to operational risk.

## Keep the package small

Keep essential procedure in `SKILL.md`. Add only resources the Skill uses:

- `agents/openai.yaml` for optional interface metadata;
- `scripts/` for deterministic repeated operations;
- `references/` for detailed material loaded on demand;
- `assets/` for files copied into outputs.

Keep references one level deep and state when to read them. Do not add auxiliary README, changelog, or process-history files.

Write frontmatter for discovery:

- Make `name` match the folder and use lowercase letters, digits, and hyphens.
- Make `description` state both the capability and concrete triggering contexts.
- Follow the target runtime's accepted metadata schema; do not copy extension fields into a runtime that does not expose them.

Write the body in imperative language. Prefer concise examples over repeated explanations, avoid deep reference chains, and remove guidance an Agent can infer reliably without the Skill.

## Iterate with focused evidence

Apply a bounded RED-GREEN-REFACTOR loop when behavior can be exercised:

1. **RED:** Add or run one representative scenario or structural contract that exposes the observed gap. Capture the exact failure before changing the Skill.
2. **GREEN:** Make the smallest instruction or resource change that addresses that failure, then rerun the same check.
3. **REFACTOR:** Remove redundancy and close only observed loopholes while keeping the focused check green.

For a complex behavioral Skill, forward-test with a fresh subagent and a realistic request. Give it the Skill and raw artifacts, not the expected answer. If a baseline run is impractical, preserve valid work, record the limitation, and use the strongest available regression seam. Missing evidence is a limitation, not a plugin-owned block.

## Validate before handoff

- Confirm every mentioned bundled resource exists and every relative link resolves.
- Validate frontmatter, folder naming, and optional interface metadata with the repository's own checks.
- Reuse the same focused command for RED and GREEN, then run proportionate broader validation.
- Report what was exercised, what was not, and any behavior that remains stochastic.
- Treat commit and push as separate external effects requiring explicit user authorization; they are not Skill-authoring defaults.

Use the current host's planning or TODO surface only when it is exposed and useful. Never depend on a legacy tool name or make planning metadata a completion gate.
