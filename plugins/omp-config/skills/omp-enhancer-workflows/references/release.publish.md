# `release.publish` workflow reference

Optional reference only. OMP native runtime instructions and settings remain authoritative.
RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.

## `release.publish`

- Primary when: The user explicitly asks to commit, push, publish, deploy, version, upgrade, or synchronize an installed artifact.
- Reference steps:
  1. [step-1] Confirm the requested target and release scope.
  2. [step-2] Run relevant preflight checks.
  3. [step-3] Perform the requested mutation once.
  4. [step-4] Independently verify the remote or installed result.
  5. [step-5] Report the exact released state.
- Optional Agent candidates: none suggested.
- Optional delegation ideas:
  - steps-3-4: the parent alone owns the authorized release mutation and independently verifies the exact bounded remote, marketplace, deployed, or installed state
  - step-5: the parent reconciles the verified target and reports the exact final state
- Quality checks:
  - target and version correspondence, successful preflight, independent post-mutation verification, and exact final state
- Scope notes:
  - A plan or dry run is not a completed release.
  - Do not infer a different repository, package, ref, environment, or install target.
- Risk notes:
  - Use host approval and the user-authorized target for irreversible or externally visible actions.

NEXT CHECKPOINT: after all declared resources and any catalog extension have returned or were marked unavailable, start visible assistant text with `WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<bare-ids-or-none> | skills-unavailable=<bare-ids-or-none>`. When native `todo` is exposed, this response calls only TODO init and waits; project work starts in the next response.
