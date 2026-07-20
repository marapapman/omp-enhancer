---
name: benchmark
description: Use this skill to measure performance baselines, detect regressions before/after PRs, and compare stack alternatives.
origin: ECC
---

# Benchmark

When this Skill is part of a `writer` or `zh-writer` assignment, that child
remains proposal-only: it runs no command and writes no file, and returns the
complete proposed artifact or diff. Main or a separate explicitly capable
Main-selected Agent owns authorized effects.

Measure the requested target with a reproducible workload and make the evidence,
comparison, and limitations visible. Do not turn a measurement request into an
implicit install, mutation, or publication workflow.

## Capability and effect boundary

Use only capabilities currently exposed by the host. Browser automation, an MCP,
and a benchmark command or runner are optional examples of live capabilities,
not prerequisites or names to invent. If no suitable live capability exists,
design the benchmark or analyze supplied and existing artifacts, then report the
missing observation rather than simulating a result.

A read-only `seo.audit` or benchmark request does not authorize a
`.ecc/benchmarks/` write, repository edit, baseline commit, or publication.
Installing a runner, command execution, a filesystem write, and a network request
each require explicit user authorization for the named target and effect plus
permission from the host. The request itself may provide that authorization for
the specifically requested measurement; it does not widen the target or effects.

## Method

### 1. Baseline

Identify the exact target, revision, environment, dataset or URL set, workload,
warm-up policy, cache state, and comparison question. Prefer an existing trusted
baseline when it corresponds to the same tuple. Otherwise collect a fresh
authorized baseline or label the comparison as unavailable.

### 2. Metrics

Choose metrics that answer the question:

- Page: LCP, CLS, INP, FCP, TTFB, resource size, request count, and blocking work.
- API: latency, throughput, status distribution, response size, and error rate.
- Build: cold build, warm rebuild or HMR, tests, typecheck, lint, and image build.
- Resource or cost: CPU, memory, I/O, network transfer, and measured cost where
  corresponding evidence is available.

Treat targets and thresholds as task-specific or source-backed. Do not silently
promote an illustrative value into the user's SLA.

### 3. Statistics

Choose the sample count, concurrency, measurement budget, target capacity, and
load risk together. Do not use a fixed request count or concurrency for every
system. Record warm-up and outlier handling, then report the useful distribution
such as median, p95, p99, spread or confidence interval, failures, and sample size.
Avoid destructive or production load unless the exact load is separately
authorized and the host permits it.

### 4. Comparison

Keep baseline and candidate conditions corresponding. Show absolute values,
delta, direction, practical significance, and whether noise or environment drift
could explain the result.

| Metric | Baseline | Candidate | Delta | Interpretation |
|---|---:|---:|---:|---|
| `<metric>` | `<value>` | `<value>` | `<value>` | better, worse, or inconclusive |

Do not call a change a regression solely because one unreplicated sample moved.

### 5. Limitations

Report unavailable capabilities, missing baseline correspondence, sample size,
environment drift, caching effects, external-service variance, load constraints,
and the cheapest safe next measurement. Distinguish observed values from
inference and never fabricate measurements.

## Output and optional persistence

Return the benchmark inline by default with the target tuple, method, raw or
summarized evidence, statistics, comparison, verdict, and limitations. Persist a
JSON or table artifact only when the user authorizes that write and supplies or
accepts a safe path. Treat committing or sharing that artifact as another
separately authorized effect.
