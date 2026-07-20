---
name: prototype
description: Build a throwaway prototype to flesh out a design before committing to it. Routes between two branches — a runnable terminal app for state/business-logic questions, or several radically different UI variations toggleable from one route. Use when the user wants to prototype, sanity-check a data model or state machine, mock up a UI, explore design options, or says "prototype this", "let me play with it", "try a few designs".
---

# Prototype

A prototype is **throwaway code that answers a question**. The question decides the shape.

## Linked resource boundary

This loaded Skill reveals the two branch resources below. After choosing the
branch, read only its exact same-namespace URI through the remaining linked
resource batch and wait before building the scratch artifact:

- `RESOURCE EXTENSION | source=skill://prototype | reads=skill://prototype/LOGIC.md`
- `RESOURCE EXTENSION | source=skill://prototype | reads=skill://prototype/UI.md`

The unchosen branch is not loaded. This Skill does not traverse relative paths
or select another Skill.

## Pick a branch

Identify which question is being answered — from the user's prompt, the surrounding code, or by asking if the user is around:

- **"Does this logic / state model feel right?"** → `skill://prototype/LOGIC.md`. Build a tiny interactive terminal app that pushes the state machine through cases that are hard to reason about on paper.
- **"What should this look like?"** → `skill://prototype/UI.md`. Generate several radically different UI variations on a single route, switchable via a URL search param and a floating bottom bar.

The two branches produce very different artifacts — getting this wrong wastes the whole prototype. If the question is genuinely ambiguous and the user isn't reachable, default to whichever branch better matches the surrounding code (a backend module → logic; a page or component → UI) and state the assumption at the top of the prototype.

## Effect boundary

Skipping production TDD is allowed only for a user-authorized, isolated scratch or non-production exploration. Before writing, declare the scratch write set and confirm that the user's allowed effects cover creating and running it. Keep production modules, routes, configuration, fixtures, and tests outside that write set.

Never automatically absorb, fold, extend, or promote prototype code into production. To formally adopt a validated result, create a new `code-development` vertical TDD slice with its own public-behavior RED, minimal production change, and GREEN evidence; use the prototype only as evidence.

Delete prototype artifacts only inside the declared scratch write set and with explicit deletion authorization. Never automatically delete or commit them. Return the paths and cleanup recommendation when that authority is absent.

## Rules that apply to both

1. **Define and timebox the question.** State the exact problem and a short timebox before writing. Stop or narrow the question when the timebox expires.
2. **Throwaway from day one.** Put the artifact only in the authorized scratch location and mark it clearly as a prototype. For a UI question, mimic the project's routing conventions inside the scratch artifact without registering a production route.
3. **One runnable prototype, one command.** Use the project's already-available runtime when allowed, such as `python <scratch-path>` or `bun <scratch-path>`. Do not install or download dependencies without separate authority.
4. **No persistence by default.** Keep state in memory. If persistence is the question, use only an authorized scratch database or a clearly named local scratch file.
5. **Skip production polish.** Add only the handling needed to make the experiment runnable; production TDD resumes if the conclusion is adopted.
6. **Surface and collect evidence.** After every action or variant switch, show the relevant state. Record inputs, observed outputs, limitations, and the cheapest countercheck.

## When done

Return the question, timebox, run command, evidence, limitations, conclusion, and recommended next decision. Persist that conclusion in an ADR, issue, notes file, or commit message only when the user authorizes that additional write or commit effect.
