---
name: research-bogus-data
description: Design clearly incomplete experiment-result scaffolds with symbolic placeholders and an evidence-acquisition plan, without inventing measurements or facts.
---

# Research Result Placeholders

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or an explicitly capable generic
`task` owns authorized effects.

Prepare an empty result structure only when the current task explicitly requests an output scaffold before real evidence exists. This Skill does not generate synthetic experiment data.

## Evidence boundary

- Never invent numeric, statistical, bibliographic, or factual values.
- Never write a trend, comparison, significance claim, or conclusion without supporting evidence.
- Use symbolic placeholders such as `[MEASURED_ACCURACY]`, `[COMPUTED_P_VALUE]`, `[VERIFIED_CITATION]`, and `[FIGURE_AFTER_RUN]`; do not substitute plausible-looking values.
- Mark the whole scaffold `INCOMPLETE — replace every symbolic placeholder with observed and verified evidence before review or submission`.
- Keep every unresolved field visible. Do not turn a missing measurement into an estimate.

## Workflow

1. Identify the requested claims, tables, figures, metrics, and ablations.
2. Build a schema containing labels and symbolic placeholders only.
3. Map each placeholder to the experiment, source artifact, computation, or verification needed to fill it.
4. Name an executable command only when that command is confirmed in the current repository. Otherwise describe the required procedure without inventing a script path or CLI.
5. Return the scaffold in the response by default. Write a file only when the current task explicitly requests file output, gives or establishes a safe target, and native filesystem permission allows it.
6. Run no experiment or command unless the current task requests execution and native execution permission allows it.

## Safe formats

### Table

```markdown
> **INCOMPLETE — SYMBOLIC PLACEHOLDERS, NOT RESULTS**
| Method | Accuracy | F1 score |
|---|---:|---:|
| Baseline | [MEASURED_BASELINE_ACCURACY] | [MEASURED_BASELINE_F1] |
| Proposed method | [MEASURED_PROPOSED_ACCURACY] | [MEASURED_PROPOSED_F1] |

Evidence needed: run [CONFIRMED_EVALUATION_PROCEDURE] on [VERIFIED_DATASET_AND_SPLIT].
```

### Figure

```markdown
> **INCOMPLETE — FIGURE DOES NOT EXIST YET**
![Result figure generated after the experiment]([FIGURE_AFTER_RUN])

Evidence needed: use [CONFIRMED_RESULT_ARTIFACTS] with [CONFIRMED_PLOTTING_PROCEDURE].
```

### Claim slot

```markdown
[METHOD] achieves [MEASURED_VALUE] on [VERIFIED_DATASET_AND_SPLIT].

Status: unresolved until the referenced run artifact and calculation are verified.
```

The scaffold remains non-evidence and must not enter a fact-checking chain as support for any claim.
