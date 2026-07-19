# OMP Enhancer Repository Method

Use this conditional reference only while changing the OMP Enhancer marketplace monorepo or the isolated fixtures that evaluate its method.

## Keep canonical sources distinct

- Edit workflow definitions or renderers, then schedule `npm run generate:workflows`; never hand-edit generated workflow cards. Because this command rewrites a shared output set, its downstream exclusive integration task runs the generator exactly once after all source dependencies complete rather than running it in sibling workers.
- Edit ECC inventory sources, then run `npm run generate:ecc-skills`.
- Update marketplace Skill paths through the repository generator. Use the release script as the only writer for plugin, lockfile, and marketplace versions.
- Preserve unrelated dirty-tree changes and review only intended paths.
- Compare repository source, generated assets, package contents, marketplace metadata, and installed runtime when behavior can drift across them.

When the complete `omp.plugin` condition matches, use it as the Primary workflow. Its internal plan, TDD, generation, installed E2E, and review phases do not require duplicate workflow cards.

## Test from the public contract inward

Start with a failing contract test at the narrowest public seam. Give each native `task` one complete vertical RED/GREEN slice: test mutation, valid RED, minimum production change, same-command GREEN, then refactor. Lifecycle tests continue to prove advisory behavior: no hook blocks or continues the host, no plugin router or completion controller chooses work for Main, and no review tool executes commands.

Shared generation is a mechanical generation slice: its evidence is the generator exit, check/parity results, and a no-unexpected-diff check; it must not fabricate a TDD RED. After delivery, Main inspects the generated diff and runs check-only parity plus broader validation; it does not rerun the generator. For TypeScript Testing Enhancer work, keep `src/` and built `dist/` aligned through the single scheduled project build rather than editing both by hand.

## Run installed-runtime E2E when behavior crosses the host boundary

Use deterministic tests first. When Main, Advisor, workflow selection, Skill loading, Agent use, reminders, lifecycle, tool exposure, packaging, or installed behavior changes, run an isolated installed OMP scenario with a frozen fixture, model, thinking level, tool set, evaluator, and timeout.

A generator-integrity-only change that does not change generated prompt content, package contents, or installed behavior does not require a live E2E run; its deterministic generator and parity contracts are the evidence boundary.

Judge event evidence rather than model self-report. Preserve the sequence that matters: workflow index, visible WORKFLOW PLAN, exact resource loads, WORKFLOW READY, detailed TODO, local and external search when applicable, plan review, native `task` wave assignments and completion, task-owned RED/GREEN evidence, Main current-tree review, bounded diff review, task repair, refreshed evidence, and one final response. Keep provider errors, runner timeouts, evaluator defects, and compliance failures separate. Run one pilot before any repeated candidate matrix.

Never let an E2E fixture publish, upgrade, or contact external systems. A live model result is probabilistic evidence; deterministic contracts remain the regression boundary.

## Review the smallest useful changed surface

Use `plan` to challenge Main's supplied parallel plan, native `task` to own complete code-and-test slices and supported repairs, and native `reviewer` for supplied review. Main reviews the current tree, diff, and evidence before reviewer dispatch. The reviewer receives a Main-reviewed bounded diff and supplied evidence; it does not read the project or run commands. Main owns integration, finding validation, broader current-tree checks, and the final conclusion. After a supported material repair, refresh affected evidence, Main-review again, and request at most one fresh affected review; never start an automatic review-repair loop.

Report exact deterministic commands, E2E run IDs when used, review dispositions, generated assets, limitations, and release boundaries. Commit, push, publish, marketplace refresh, and local upgrade require explicit user authorization.
