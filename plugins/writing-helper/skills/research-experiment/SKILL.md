---
name: research-experiment
description: Experiment design — define RQs, select baselines with justification, choose metrics, design ablation studies
---

# Research Experiment Design

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
- **Why representative** — why this baseline is a fair and meaningful comparison
- **Known strength** — what the baseline does well in this setting
- **Expected weakness** — where you expect your approach to outperform it

Select at minimum one naive baseline (e.g., no optimization) and one state-of-the-art baseline.

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

### 6. Design Ablation Studies

For each ablated component:
- **Component Removed** — what module, layer, or feature is disabled
- **Expected Degradation** — how metrics should change if the component matters
- **Conclusion if Degraded** — what result would confirm the component's importance

## Output

Write results to `.pi/research/experiment_design.md` (create the directory and file if absent). Use this template:

```
# Experiment Design: [Project Name]

## Research Questions
1. RQ1: [question] → Maps to [component/claim]
2. RQ2: [question] → Maps to [component/claim]
3. RQ3: [question] → Maps to [component/claim]
4. RQ4: [question] → Maps to [component/claim]

## Baselines
- **[Name]**: representative because [reason]. Strength: [X]. Expected weakness: [Y].
- **[Name]**: representative because [reason]. Strength: [X]. Expected weakness: [Y].

## Metrics
- **[Metric]**: measures [aspect]. Valid because [reason]. Interpret as [guideline].
- **[Metric]**: measures [aspect]. Valid because [reason]. Interpret as [guideline].

## Datasets
- **[Name]**: [N] samples, [domain]. Tests [capability]. Bias: [known issue or none].
- **[Name]**: [N] samples, [domain]. Tests [capability]. Bias: [known issue or none].

## Ablation Plan
| Component Removed | Expected Degradation | Conclusion if Degraded |
|---|---|---|
| [component] | [expected change] | [interpretation] |
| [component] | [expected change] | [interpretation] |
```

## Rules

1. **Every choice must be justified.** Unsubstantiated baselines, metrics, or datasets are not acceptable.
2. **Never recommend a metric whose behavior you cannot explain.** If you cannot describe its computation, edge cases, and interpretation, omit it.
3. **Use the project code/data as source of truth.** Read files to determine what components exist and what claims are made.
4. **Keep the output actionable.** Each section should directly inform implementation of the evaluation pipeline.

## Trigger

Load `research-experiment` through the runtime's normal skill mechanism.
