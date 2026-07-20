---
name: skill-comply
description: Design and review compliance evaluations for Skill, rule, and Agent definitions, including scenarios, behavioral sequences, classifications, and evidence reports. Use when the user asks to measure or analyze instruction-following behavior.
origin: ECC
---

# skill-comply: Automated Compliance Measurement

## Runtime and authority boundary

Treat target-specific paths, slash commands, hooks, routers, model tiers, SHIP, or auto-fix behavior in this Skill as guidance for an external target system or runtime only if the user explicitly requests that target. For the current OMP session, this Skill does not route, hook, command, gate, control, grant permission, or decide completion; inspection, planning, and read-only review authorize no mutation. Any installation, configuration, file write, command, network call, upload, publication, payment, mutation, or other external effect requires explicit user authorization for the exact target and effect plus current native permission. Preserve fail-closed safety rules inside authorized target work; target safety is not an OMP gate or completion condition.

Measures whether coding agents actually follow skills, rules, or agent definitions by:
1. Auto-generating expected behavioral sequences (specs) from any .md file
2. Auto-generating scenarios with decreasing prompt strictness (supportive → neutral → competing)
3. Running `claude -p` and capturing tool call traces via stream-json
4. Classifying tool calls against spec steps using LLM (not regex)
5. Checking temporal ordering deterministically
6. Generating self-contained reports with spec, prompts, and timelines

## Supported Targets

- **Skills** (`skills/*/SKILL.md`): Workflow skills like search-first, TDD guides
- **Rules** (`rules/common/*.md`): Mandatory rules like testing.md, security.md, git-workflow.md
- **Agent definitions** (`agents/*.md`): Whether an agent gets invoked when expected (internal workflow verification not yet supported)

## When to Activate

- User runs `/skill-comply <path>`
- User asks "is this rule actually being followed?"
- After adding new rules/skills, to verify agent compliance
- Periodically as part of quality maintenance

## Usage

```bash
# Full run
uv run python -m scripts.run ~/.claude/rules/common/testing.md

# Dry run (no cost, spec + scenarios only)
uv run python -m scripts.run --dry-run ~/.claude/skills/search-first/SKILL.md

# Custom models
uv run python -m scripts.run --gen-model haiku --model sonnet <path>
```

## Key Concept: Prompt Independence

Measures whether a skill/rule is followed even when the prompt doesn't explicitly support it.

## Report Contents

Reports are self-contained and include:
1. Expected behavioral sequence (auto-generated spec)
2. Scenario prompts (what was asked at each strictness level)
3. Compliance scores per scenario
4. Tool call timelines with LLM classification labels

### Advanced (optional)

For users familiar with hooks, reports also include hook promotion recommendations for steps with low compliance. This is informational — the main value is the compliance visibility itself.
