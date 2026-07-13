# Main-Agent Workflow Orchestration Redesign

## Goal

Replace route-selected execution with a workflow catalog that the main agent can reason over directly. Core will still collect safe task facts and keep the legacy router available as a diagnostic compatibility API, but it will no longer choose or preload the main agent's skills, roles, tools, or exact first call.

The runtime remains advisory-only: it never blocks a tool, holds completion open, or schedules a continuation. `autolearn.autoContinue` is outside Core and remains unchanged.

## Runtime model

1. At the start of a primary turn, Core injects the complete workflow catalog, the full model-visible skill inventory, and safely observed task facts.
2. The main agent selects or composes workflows. Writing language is selected from the text being changed, while LaTeX, Markdown, and Word are format companions rather than language decisions.
3. For a non-trivial task, the main agent initializes OMP's native `todo` before substantive project work. The TODO records the selected workflow, selected skills, every workflow step, and every user requirement.
4. The main agent loads the smallest applicable skills before the step that uses them, executes TODO items in order, and marks each item done immediately.
5. When two or more useful workstreams are independent, the main agent forks multiple subagents, preferably in one native `task.tasks[]` batch. The parent keeps integration and final verification.
6. Every subagent assignment carries a compact workflow prefix plus the exact workflow step, TODO item, selected skills, scope, non-goals, and acceptance criteria. Core passes the parent's decision through; it does not infer a role from the old route.
7. The final response is produced after the main agent reconciles the TODO, child results, and verification evidence.

If `todo`, `task`, or a selected skill is unavailable, the agent continues with a concise checklist or direct execution and reports a material limitation. Missing workflow mechanics never become a hard gate.

## Shared main/advisor context

OMP 16.4.8 does not expose a primary turn's `before_agent_start.systemPrompt` to the Advisor, and hidden custom messages are omitted from the Advisor transcript. The stable shared channel is OMP's native context-file mechanism.

The distributable config therefore includes:

- `assets/WORKFLOW_CATALOG.md`: the shared workflow and orchestration protocol.
- `assets/AGENTS.md`: a user-level context entry that imports the catalog.
- `assets/WATCHDOG.yml`: Advisor-only behavior that imports the same catalog and checks workflow/TODO/skill/delegation drift without becoming a blocker.

Core also renders the same catalog structure dynamically for the primary agent and includes the current model-visible skill inventory. A parity test prevents the runtime catalog and packaged shared catalog from silently diverging. Updating a live OMP home is an explicit config-sync operation so existing user instructions are not overwritten implicitly.

## Compatibility boundary

The following remain for one compatibility cycle:

- `task-descriptor.js` for operation, target, language, constraint, and risk observations.
- `routeNaturalLanguageTask`, route policy, classifier, and `legacy|observe|enforce` outputs for diagnostics.
- `omp_core_route_task` and classifier tools for callers that inspect legacy route projections.

Their skills, tools, roles, and route labels are legacy suggestions only. They do not feed main-agent skill preloading, TODO creation, subagent selection, tool authorization, or completion.

## Removed hot-path behavior

- Deterministic `primarySkillsFor` selection in `before_agent_start`.
- Native routed-skill autoloading.
- Exact `WORKFLOW FIRST TOOL CALL` instructions.
- Static route-role matching before decorating a `task` assignment.
- Route-derived default inspection budgets and serial-read instructions.
- Post-read writing rerouting that automatically loads a skill.

Explicit user budgets and safe writing-language observations remain useful task facts.

## Verification

Unit and integration tests must prove:

- Every catalog card has selection guidance, stable ordered steps, conditional skill candidates, quality checks, and delegation hints.
- Main guidance contains the complete catalog and complete sanitized active-skill inventory.
- Starting a turn never calls `buildSkillPromptMessage`.
- Native `todo` is named correctly and the prompt requires TODO initialization before substantive work.
- Real flat and batch `task` schemas retain `name`, `agent`, `context`, and `task`, while assignments expose workflow, step, TODO, and skills in the first 120 characters.
- Subagents receive only their parent-selected checkpoint and skills.
- Advisor context uses the same catalog and remains advisory, bounded, and silent after a final response.
- No lifecycle handler returns `block: true` or `continue: true`.
- Installed DeepSeek E2E records TODO-first behavior, skill loading, multi-fork delegation for broad tasks, child assignment metadata, completed TODOs, and zero Core continuation.

## Release sequence

1. Run targeted Core and Config tests.
2. Run the full repository suite, marketplace validation, and package dry-runs.
3. Dry-run and apply patch releases for changed plugins.
4. Commit and push the scoped changes.
5. Update the marketplace, upgrade the local plugins, and explicitly sync the shared workflow context without changing unrelated config or `autolearn.autoContinue`.
6. Run installed DeepSeek workflow and Advisor E2E scenarios, fix prompt-level failures without introducing gates, and repeat until the required scenarios pass or a concrete external limitation is documented.
