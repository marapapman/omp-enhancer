---
name: spike
description: "Throwaway experiments to validate an idea before build"
---

# Spike — Throwaway Experiments

**When to use:**
- Validating an approach before committing to it
- Exploring unfamiliar APIs, libraries, or patterns
- Testing performance characteristics
- Confirming whether a design works

## Effect boundary

Skipping production TDD is allowed only for a user-authorized, isolated scratch or non-production exploration. Declare the scratch write set before writing and keep production code, tests, configuration, and fixtures outside it.

Never automatically absorb, extend, or promote spike code into production. To formally adopt the conclusion, create a new `code-development` vertical TDD slice with a public-behavior RED, minimal production change, and GREEN evidence.

Delete spike artifacts only inside the declared scratch write set and with explicit deletion authorization. Never automatically delete or commit them; otherwise return their paths and a cleanup recommendation.

## Procedure

### 1. Define the Question
Write down exactly what you need to learn:
- "Does library X support feature Y?"
- "Will approach Z achieve acceptable performance?"
- "Is pattern W feasible in this codebase?"

State a 30–60 minute timebox and the evidence that would answer the question.

### 2. Build Minimal Experiment
- Create one runnable experiment inside the authorized isolated scratch write set
- Minimal code to answer the question — nothing else
- Hardcode inputs and add only the handling needed to run it
- Use already-available tools; dependency installation or network access needs its own authorization

### 3. Run and Learn
- Execute the experiment
- Collect evidence: inputs, outputs, timings, limitations, and the cheapest countercheck
- Record the answer to the question

### 4. Decide
- **Proceed:** Approach validated → propose a separate `code-development` vertical TDD slice
- **Pivot:** Approach doesn't work → try alternative
- **Abandon:** Feature not feasible → return the evidence and conclusion

## Rules
- **Spike code is throwaway.** Never evolve it into production code.
- **Timebox.** Set a timer (30-60 min). If not answered, simplify question.
- **Keep effects bounded.** Do not modify, delete, or commit outside explicit user authorization.
- **Return the decision.** Report the question, command, evidence, limitations, conclusion, artifact paths, and recommended next step.
