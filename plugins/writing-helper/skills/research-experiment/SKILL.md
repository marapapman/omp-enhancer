---
name: research-experiment
description: Experiment design — define RQs, select baselines with justification, choose metrics, design ablation studies
---

# Research Experiment Design

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or an explicitly capable generic
`task` owns authorized effects.

## Purpose

Design experimental evaluations that validate research claims in a project. This skill helps you structure an evaluation plan that is rigorous, reproducible, and directly tied to the project's research questions. Every choice — baseline, metric, dataset, ablation — requires explicit justification.

## Workflow

### 1. Read Project Context

Read source code, configuration files, and any existing documentation in the project to understand:
- What the project implements (architecture, components, algorithms)
- What claims the project makes (performance, correctness, efficiency)
- What related work or baselines are referenced

Use `read`, `grep`, and `glob` to gather context from the codebase.

### 2. Define Research Questions (2–4)

For each Research Question (RQ):
- State the question clearly
- Map it to a specific design component or claim in the project
- Example: *"RQ1: Does the attention pruning mechanism reduce inference latency without significant accuracy loss?" → Maps to `attention_prune()` in `model/optimize.py`*

### 3. Select Baselines

For each baseline, document:
- **Name** — the algorithm/system being compared against
- **Evidence** — the project source or retrieved literature that establishes the baseline and its relevant behavior
- **Why representative** — why this baseline is a fair and meaningful comparison
- **Known strength** — what the baseline does well in this setting
- **Hypothesis** — any expected weakness, explicitly labeled as a hypothesis rather than a result

Prefer baselines already implemented or cited by the project. Add an external baseline only when the current task includes literature research and the evidence supports the choice. Do not force a nominal "state-of-the-art" baseline without current evidence.

### 4. Choose Metrics

For each metric, document:
- **What it measures** — the operational definition
- **Validity** — why this metric captures the capability or property of interest
- **Interpretation** — how to read the numbers (higher is better? what range is meaningful?)

Do not recommend metrics whose behavior or edge cases you cannot explain.

### 5. Select Datasets

For each dataset, document:
- **Size** — number of samples
- **Domain** — what kind of data (text, image, logs, etc.)
- **What it tests** — which RQ or capability this dataset evaluates
- **Known biases** — artifacts, imbalances, or distributions that could skew results

Treat each of these as an evidence-backed field. If a value is not established by project data or a retrieved source, mark it unresolved.

### 6. Design Ablation Studies

For each ablated component:
- **Component Removed** — what module, layer, or feature is disabled
- **Hypothesized Effect** — how metrics might change if the component matters, labeled as a hypothesis
- **Conclusion if Degraded** — what result would confirm the component's importance

## Output

Return the design in the response by default. Write only when the current task explicitly requests file output and native filesystem permission allows it. Use the requested safe path; use `.pi/research/experiment_design.md` only when the user requests that path or the current project establishes it as the intended artifact. Do not create a directory merely because this Skill was loaded.

Use this template:

```
# Experiment Design: [Project Name]

## Research Questions
1. RQ1: [question] → Maps to [component/claim]
2. RQ2: [question] → Maps to [component/claim]
3. RQ3: [question] → Maps to [component/claim]
4. RQ4: [question] → Maps to [component/claim]

## Baselines
- **[Name]**: evidence [source]. Representative because [reason]. Strength: [X]. Hypothesis: [Y].

## Metrics
- **[Metric]**: measures [aspect]. Valid because [reason]. Interpret as [guideline].
- **[Metric]**: measures [aspect]. Valid because [reason]. Interpret as [guideline].

## Datasets
- **[Name]**: [verified size or unresolved], [verified domain or unresolved]. Tests [capability]. Bias: [supported issue or unresolved].

## Ablation Plan
| Component Removed | Hypothesized Effect | Conclusion if Observed |
|---|---|---|
| [component] | [expected change] | [interpretation] |
```

## Rules

1. **Every choice must be justified.** Unsubstantiated baselines, metrics, or datasets are not acceptable.
2. **Never recommend a metric whose behavior you cannot explain.** If you cannot describe its computation, edge cases, and interpretation, omit it.
3. **Use the project code/data as source of truth.** Read files to determine what components exist and what claims are made.
4. **Keep the output actionable.** Each section should directly inform implementation of the evaluation pipeline.
5. **Never invent baseline, dataset, metric, or expected-result facts.** If evidence is missing, mark it unresolved; keep expected effects explicitly hypothetical.
6. **Do not execute experiments implicitly.** Execution requires the current task to request it and native execution permission to allow it.

## Trigger

When this body is present, use it as the bounded experiment-design method; do
not read `research-experiment` again.
