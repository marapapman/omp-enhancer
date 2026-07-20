# Code cleanup plan, 2026-07-19

## Objective and boundaries

Refactor only code that has concrete reference, runtime, or contract evidence of
being dead, duplicated, or contradictory. Preserve public plugin names, tool
names, advisory lifecycle behavior, the DeepSeek Flash reminder, the
agent-selected workflow contract, and all historical material under
`docs/superpowers/`.

This change does not add a router, gate, classifier, completion controller, or
automatic retry. It does not release, commit, push, refresh the marketplace, or
upgrade an installed plugin. Generated workflow assets are outside the write
set because no workflow definition or renderer changes.

## Baseline evidence

- The worktree started clean at `26993c0`, equal to `origin/main`.
- Root and workspace suites passed before the refactor: Core 175 tests, Config
  82, Writing 99 with 100% coverage, Testing 168, and Fact Checker 31.
- Testing Enhancer passes TypeScript checks with `noUnusedLocals` and
  `noUnusedParameters` enabled.
- An exact-clone scan over active JS and TS found one substantial clone: the
  balanced JSON candidate scanner in `skill-usage.js` and
  `subagent-usage.js`.
- Active-source searches found no hard router, hard gate, `/test` command, or
  plugin-owned continuation loop. Compatibility aliases and historical
  snapshots are not dead merely because they mention retired behavior.

## Wave 1: parallel vertical slices

### S1: Core mechanical cleanup

Assignment input: complete. Runnable: yes. Independent: yes. Agent match:
general code task. Direct constraints: preserve behavior and compatibility
facades; do not touch generated workflow assets. Action: delegate or implement
as one exclusive slice.

Exclusive write set:

- `plugins/omp-enhancer-core/index.js`
- `plugins/omp-enhancer-core/src/skill-usage.js`
- `plugins/omp-enhancer-core/src/subagent-usage.js`
- one new internal Core JSON-candidate helper under
  `plugins/omp-enhancer-core/src/`
- focused Core tests only if a characterization gap is found

Actions and acceptance:

1. Delete `roleSkills()`, whose only repository occurrence is its definition.
2. Extract the identical fenced/balanced JSON candidate scanner once and make
   both usage parsers consume it. Keep the candidate count and size bounds and
   malformed-fragment behavior unchanged.
3. This is a behavior-preserving refactor and private dead-code deletion, so
   the existing passing tests are the characterization baseline; do not invent
   a fake behavioral RED. Prove deletion with reference search.

Focused verification:

```bash
node --check plugins/omp-enhancer-core/index.js
npm test --workspace plugins/omp-enhancer-core
rg '\broleSkills\b' plugins/omp-enhancer-core
```

### S2: Writing Helper explicit network authority and dead fixture

Assignment input: complete. Runnable: yes. Independent: yes. Agent match:
general code task. Direct constraints: retain local-first citation behavior and
100% coverage. Action: delegate as one TDD slice.

Exclusive write set:

- `plugins/writing-helper/index.js`
- `plugins/writing-helper/README.md`
- `plugins/writing-helper/test/index.test.js`
- `plugins/writing-helper/test/branch-coverage.test.js` only if coverage needs it
- `plugins/writing-helper/test/marketplace.test.js`
- delete `plugins/writing-helper/docs/previous-marketplace.json`

RED:

1. Add a public-runner test proving that omitted `allowNetwork` performs no
   fetch and leaves missing citation evidence unresolved. It fails because the
   current predicate is `allowNetwork !== false`.
2. Keep a separate explicit `allowNetwork: true` case proving the opt-in path.

GREEN and refactor:

1. Change the fallback predicate to exact opt-in and update CLI/user docs to
   require `--allow-network` for remote lookup. Explicit `allowNetwork: true`
   records the caller's opt-in request; it does not replace OMP host approval or
   permission. Tool activation alone never supplies either condition.
2. Delete the unshipped standalone marketplace snapshot and its test-only
   assertion. Git history remains the provenance source.
3. Preserve tool activation as distinct from network authority.

Focused verification:

```bash
node --test plugins/writing-helper/test/index.test.js plugins/writing-helper/test/branch-coverage.test.js plugins/writing-helper/test/marketplace.test.js
npm run coverage --workspace plugins/writing-helper
npm pack --workspace plugins/writing-helper --dry-run
```

### S3: Fact Checker exact-tuple runtime contract

Assignment input: complete. Runnable: yes. Independent: yes. Agent match:
general code task. Direct constraints: retain compatibility `verdict`, make
only `strictVerdict` fail closed, keep all data JSON-safe and advisory. Action:
delegate as one TDD slice.

Exclusive write set:

- `plugins/omp-fact-checker/index.js`
- `plugins/omp-fact-checker/src/fact-check.js`
- `plugins/omp-fact-checker/test/fact-checker.test.js`
- `plugins/omp-fact-checker/README.md`
- `plugins/omp-fact-checker/skills/fact-checking/SKILL.md`
- `plugins/omp-fact-checker/agents/fact-planner.md`
- `plugins/omp-fact-checker/agents/fact-researcher-a.md`
- `plugins/omp-fact-checker/agents/fact-researcher-b.md`
- `plugins/omp-fact-checker/agents/fact-cross-checker.md`
- `plugins/omp-fact-checker/agents/fact-reviewer.md`

RED:

1. Add a regression proving that two lanes containing direct but unrelated
   passages cannot yield strict `SUPPORTED` merely because callers label both
   records `SUPPORTED` and the cross-check agrees.
2. Add schema/runtime round-trip evidence for exact tuple alignment, evidence
   strength, material limitation, and cheapest countercheck. The current schema
   and normalizer drop those fields.

GREEN and refactor:

1. Add a normalized claim tuple covering subject, predicate, object/value,
   scope, time/version, and quantifier. Each field contains its normalized value
   and `MATERIAL` or `NOT_APPLICABLE`; every material field requires a value.
2. Represent predicate identity as a normalized base predicate, separate from
   proposition polarity. Add a normalized evidence tuple with the same fields
   plus proposition relation `ENTAILS`, `NEGATES`, `ADJACENT`, or `UNKNOWN`.
   A `NEGATES` record identifies whether the base predicate or object/value is
   directly negated; the canonical value of that field still names the exact
   proposition being negated. Runtime computes tuple equality from normalized
   values instead of accepting a bare caller-supplied `aligned` flag. Support
   requires every material canonical field to match. Contradiction requires
   every material canonical field, including base predicate and object/value,
   to match, plus `NEGATES` and a valid negated-field marker. A different
   predicate or value without this same-proposition representation is
   `ADJACENT` or `UNKNOWN`, not a proved contradiction.
3. Preserve the claim/evidence tuples, computed assessment, evidence strength,
   limitation, and countercheck through tool schema, telemetry equality, report
   details, and human-readable evidence/report output. Limitation is structured
   as `NONE`, `NON_MATERIAL`, or `MATERIAL`. Countercheck is structured as
   `NOT_REQUIRED`, `COMPLETED`, `INCONCLUSIVE`, or `UNAVAILABLE`, with outcome
   `NOT_APPLICABLE`, `NO_DISCONFIRMING_EVIDENCE`,
   `DISCONFIRMING_EVIDENCE`, or `NO_RESULT`. `COMPLETED` is valid only with one
   of the two evidence outcomes; all other statuses require the corresponding
   non-evidence outcome. It is required only for a high-priority claim.
4. Apply an explicit strict truth table: `SUPPORTED` requires same-tuple
   `ENTAILS` plus `PROVEN`; `CONTRADICTED` requires same-identity `NEGATES` plus
   `DISPROVED`; `LIKELY` and `HYPOTHESIS` are never definitive. A material
   limitation, an incomplete tuple, `ADJACENT`/`UNKNOWN`, a high-priority
   countercheck that is not `COMPLETED` degrades only the strict result to
   `INSUFFICIENT`. Countercheck outcome is relative to the original claim:
   `DISCONFIRMING_EVIDENCE` prevents strict `SUPPORTED` and may corroborate a
   separately proved same-tuple contradiction. Strict `SUPPORTED` for a
   high-priority claim therefore also requires
   `COMPLETED + NO_DISCONFIRMING_EVIDENCE`. Compatibility `verdict` remains
   unchanged.
5. RED and GREEN cover missing tuple, unknown relation, adjacent evidence,
   mismatched identity, genuine `ENTAILS`, and genuine `NEGATES`, while proving
   compatibility verdicts do not change.
6. Keep metadata-only, freshness, evidence-plan, and source-independence checks
   intact and avoid converting a finding into a completion gate.

Focused verification:

```bash
node --test plugins/omp-fact-checker/test/fact-checker.test.js
npm test --workspace plugins/omp-fact-checker
```

### S4: Testing Enhancer single runtime path and dead API/config cleanup

Assignment input: complete. Runnable: yes. Independent: yes. Agent match:
general code task. Direct constraints: source only in the parallel wave; Main
does not build or edit `dist`; S5 owns the single downstream `dist` build.
Action: delegate as one TDD slice.

Exclusive source write set:

- `plugins/omp-test-enhancer/package.json`
- `plugins/omp-test-enhancer/src/config/testingConfig.ts`
- `plugins/omp-test-enhancer/src/tools/testingTools.ts`
- delete `plugins/omp-test-enhancer/tools/testing-tools.ts`
- delete `plugins/omp-test-enhancer/docs/previous-marketplace.json`
- `plugins/omp-test-enhancer/README.md`
- Testing Enhancer tests needed for the changed contracts
- no `plugins/omp-test-enhancer/dist/**` edits in this wave

RED:

1. Change the marketplace/package contract test to require the built
   `./dist/extension.js` runtime entry and one canonical registration path. The
   current manifest points OMP at `./src/extension.ts`; in a marketplace cache,
   that import fails on `.js` specifiers resolving to absent source-side JS.
2. Rewrite helper-level tests to call the public tools. The old helper APIs
   expose simplified behavior that the runtime cannot reach, including caller-
   supplied browser evidence.
3. Assert the accepted config/report schema contains only fields consumed by
   runtime behavior.

GREEN and refactor:

1. Point `omp.extensions` to `dist/extension.js`, publish the built runtime, and
   delete the unreferenced marketplace wrapper instead of maintaining two
   registration paths.
2. Delete `analyzeTestTargets`, `buildTestContext`, and `runTestReview`; move
   tests to `createTestingEnhancerTools(...).execute` and keep shared pure
   evaluators only where the runtime itself consumes them.
3. Delete the retired config renderer and unused `coverage` and `browser`
   config fields. Keep `version`, `test.command`, and `review.*`; old extra YAML
   keys remain safely ignored. Delete unused report input `runId`.
4. Delete the unreferenced previous-marketplace snapshot and align README with
   the actual per-call browser/coverage inputs.

Focused source verification:

```bash
cd plugins/omp-test-enhancer
bun run typecheck
bunx vitest run tests/unit/config/testingConfig.test.ts tests/unit/tools/testingTools.test.ts tests/unit/marketplace/marketplaceCatalog.test.ts tests/e2e/toolWorkflow.e2e.test.ts
```

### S6: Config Skill-reference integrity and legacy contract cleanup

This slice was added after the independent Skill inventory found contradictory
project evidence. Assignment input: complete. Runnable: yes. Independent: yes.
Agent match: documentation and contract test task. Direct constraints: preserve
the legacy v1 resource for explicit compatibility; do not hand-edit generated
ECC index/catalog assets. Action: delegate as one TDD slice.

Exclusive source write set:

- `plugins/omp-config/skills/ecc/continuous-learning/SKILL.md`
- `plugins/omp-config/skills/ecc/continuous-learning-v2/SKILL.md` only if an
  exact cross-reference anchor is needed
- `plugins/omp-config/skills/ecc/iterative-retrieval/SKILL.md`
- `plugins/omp-config/skills/ecc/strategic-compact/SKILL.md`
- `plugins/omp-config/skills/ecc/configure-ecc/SKILL.md`
- `plugins/omp-config/skills/ecc/agent-architecture-audit/SKILL.md`
- `plugins/omp-config/skills/ecc/remotion-video-creation/rules/calculate-metadata.md`
- `plugins/omp-config/skills/ecc/react-patterns/SKILL.md`
- focused Config/generator tests only
- no generated `plugins/omp-config/skills/ecc/SKILL.md` or `catalog.md`

RED:

1. Add a contract regression that rejects the nonexistent
   `docs/continuous-learning-v2-spec.md`, nonexistent `mediabunny/metadata`
   Skill, nonexistent `security-review/scan` name, and the explicit suggestion
   to use the not-packaged `react-native-patterns` Skill in packaged current
   resources.
2. Add a generator fixture whose directory and frontmatter name differ, proving
   the catalog displays the frontmatter name while its exact URI retains the
   real directory.

GREEN and refactor:

1. Keep `continuous-learning` only as an explicit legacy Stop-hook compatibility
   resource. Route every default recommendation to `continuous-learning-v2`,
   align the Config installer wording, and replace the missing spec with the
   packaged v2 exact URI.
2. Replace the invented Remotion metadata Skill with links to the packaged
   duration and dimension rules and state that the project implements its own
   helper from those APIs.
3. Replace `security-review/scan` with the two real alternatives,
   `security-review` and `security-scan`.
4. Replace the nonexistent React Native Skill suggestion with current official
   React Native documentation or a matching Skill only when the host actually
   exposes one.
5. Leave explicit external OKX resources and host-optional brainstorming
   guidance classified as external/optional; do not manufacture local Skills.

Focused verification:

```bash
node --test scripts/generate-ecc-skill-catalog.test.js plugins/omp-config/test/config-diagnostics.test.js
npm test --workspace plugins/omp-config
```

## Wave 2: generated-output integration tasks

S5-testing depends on accepted S4 source delivery. It is a separate mechanical task
with exclusive ownership of `plugins/omp-test-enhancer/dist/**`; Main does not
run the generator. S5-testing runs exactly one Testing Enhancer build:

```bash
cd plugins/omp-test-enhancer
bun run build
```

S5 returns the build command, changed generated paths, and source-to-output diff
summary. It does not modify source. Main then checks that every changed `dist`
file is explained by the TypeScript source diff and runs the complete Testing
Enhancer suite. No Agent hand-edits `dist`, and Main does not rerun the build.

S5-ecc depends on accepted S6 source delivery. It is a separate mechanical task
with exclusive ownership of generated
`plugins/omp-config/skills/ecc/SKILL.md` and `catalog.md`; Main does not run the
generator. It runs `npm run generate:ecc-skills` exactly once, reports both
generated diffs, and changes no source. S5-testing and S5-ecc are independent
and may run in parallel.

An installed-shape smoke links the candidate into an isolated temporary OMP
home, runs `/enhancer-tools enable test`, and verifies the active set contains
exactly the seven `omp_test_*` tools. It must not mutate the user's installed
marketplace state. This smoke is evidence, not a plugin-owned completion gate.

## Wave 3: Main review and independent review

Main reviews the combined diff for:

- no new lifecycle block/continue behavior;
- no hard routing or workflow selection;
- no network action without an explicit input;
- Fact strict verdicts matching the exact tuple while compatibility verdicts
  remain stable;
- one Testing Enhancer registration path and no caller-spoofed host evidence;
- deletion of only proven dead artifacts and APIs;
- every active local Skill reference resolves to a packaged Skill or an exact
  generated resource; host-native and explicitly optional external candidates
  are classified separately instead of being treated as broken local links;
- docs matching the implemented public contracts.

Root verification:

```bash
npm test
npm run check:marketplace
npm run pack:all
git diff --check
```

Writing coverage and Testing typecheck/build/test remain mandatory in addition
to root verification. Main supplies the final diff summary, RED/GREEN evidence,
and command results to an independent reviewer. Only supported findings are
repaired; any repair reruns its focused test and the affected root check.
