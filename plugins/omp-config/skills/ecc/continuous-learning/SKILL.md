---
name: continuous-learning
description: "[DEPRECATED - use continuous-learning-v2] Legacy v1 Stop-hook extraction guidance. Use only when the user explicitly requests compatibility work for an existing v1 Stop-hook setup; new continuous-learning design uses the separately available v2 method."
origin: ECC
---

# Continuous Learning Skill - DEPRECATED

## Runtime and authority boundary

Treat target-specific paths, slash commands, hooks, routers, model tiers, SHIP, or auto-fix behavior in this Skill as guidance for an external target system or runtime only if the user explicitly requests that target. For the current OMP session, this Skill does not route, hook, command, gate, control, grant permission, or decide completion; inspection, planning, and read-only review authorize no mutation. Any installation, configuration, file write, command, network call, upload, publication, payment, mutation, or other external effect requires explicit user authorization for the exact target and effect plus current native permission. Preserve fail-closed safety rules inside authorized target work; target safety is not an OMP gate or completion condition.

> **DEPRECATED 2026-04-28.** Use `continuous-learning-v2` instead. v2 is a strict superset: stop-hook observation becomes PreToolUse/PostToolUse observation, full skills become atomic instincts with confidence scoring, and global-only storage becomes project-scoped plus global promotion.
>
> This file is kept only for archival reference and explicit legacy Stop-hook compatibility.

---

## Original v1 Documentation (archival)

Automatically evaluates Claude Code sessions on end to extract reusable patterns that can be saved as learned skills.

## Legacy Compatibility Only

Do not select v1 for new continuous-learning work. Use this v1 Skill only for explicit legacy Stop-hook compatibility, such as preserving an existing Stop-hook installation or an older learned-skill workflow.

## Status

For new continuous-learning work, read `skill://ecc-skill-catalog/continuous-learning-v2/SKILL.md` and use v2.

## How It Works

This skill runs as a **Stop hook** at the end of each session:

1. **Session Evaluation**: Checks if session has enough messages (default: 10+)
2. **Pattern Detection**: Identifies extractable patterns from the session
3. **Skill Extraction**: Saves useful patterns to `~/.claude/skills/learned/`

## Configuration

Edit `config.json` to customize:

```json
{
  "min_session_length": 10,
  "extraction_threshold": "medium",
  "auto_approve": false,
  "learned_skills_path": "~/.claude/skills/learned/",
  "patterns_to_detect": [
    "error_resolution",
    "user_corrections",
    "workarounds",
    "debugging_techniques",
    "project_specific"
  ],
  "ignore_patterns": [
    "simple_typos",
    "one_time_fixes",
    "external_api_issues"
  ]
}
```

## Pattern Types

| Pattern | Description |
|---------|-------------|
| `error_resolution` | How specific errors were resolved |
| `user_corrections` | Patterns from user corrections |
| `workarounds` | Solutions to framework/library quirks |
| `debugging_techniques` | Effective debugging approaches |
| `project_specific` | Project-specific conventions |

## Hook Setup

Add to your `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "~/.claude/skills/continuous-learning/evaluate-session.sh"
      }]
    }]
  }
}
```

## Why Stop Hook?

- **Lightweight**: Runs once at session end
- **Non-blocking**: Doesn't add latency to every message
- **Complete context**: Has access to full session transcript

## Related

- [The Longform Guide](https://x.com/affaanmustafa/status/2014040193557471352) - Section on continuous learning
- `/learn` command - Manual pattern extraction mid-session

---

## Comparison Notes (Research: Jan 2025)

### vs Homunculus

Homunculus v2 takes a more sophisticated approach:

| Feature | Our Approach | Homunculus v2 |
|---------|--------------|---------------|
| Observation | Stop hook (end of session) | PreToolUse/PostToolUse hooks (100% reliable) |
| Analysis | Main context | Background agent (Haiku) |
| Granularity | Full skills | Atomic "instincts" |
| Confidence | None | 0.3-0.9 weighted |
| Evolution | Direct to skill | Instincts → cluster → skill/command/agent |
| Sharing | None | Export/import instincts |

**Key insight from homunculus:**
> "v1 relied on skills to observe. Skills are probabilistic—they fire ~50-80% of the time. v2 uses hooks for observation (100% reliable) and instincts as the atomic unit of learned behavior."

### Potential v2 Enhancements

1. **Instinct-based learning** - Smaller, atomic behaviors with confidence scoring
2. **Background observer** - Haiku agent analyzing in parallel
3. **Confidence decay** - Instincts lose confidence if contradicted
4. **Domain tagging** - code-style, testing, git, debugging, etc.
5. **Evolution path** - Cluster related instincts into skills/commands

See `skill://ecc-skill-catalog/continuous-learning-v2/SKILL.md` for the packaged v2 guide.
