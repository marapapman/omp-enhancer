# writing-helper

Standalone OMP writing helper plugin with frugal-pi compatible writing skills, writer/checker agents, deterministic writing checks, and local-first citation verification.


## What it provides

### OMP tools

The plugin registers two model-callable tools:

| Tool | Purpose |
| --- | --- |
| `writing_logic_check` | Checks substantive writing logic: unsupported conclusions, data inconsistencies, terminology drift, causal leaps, and contribution/evidence mismatches. |
| `writing_quality_check` | Runs logic, style, citation authenticity, and optional semantic preservation checks. Citation findings are `VERIFIED`, `MISMATCH`, or `UNVERIFIED`. |

Both tools accept inline `text` or a UTF-8 text `path`.

For an advisory semantic-preservation comparison, pass the revised `text`, the
prior `originalText`, and either `preservation: true` or
`checks: ['preservation']`. The result reports changed qualifiers, modality,
polarity, numbers, citations, and LaTeX anchors. Drift findings never make the
tool call fail or control whether editing may continue.

### Slash commands

The plugin registers two slash commands:

```text
/writing-logic paper.md
/writing-quality paper.md
```

Supported command flags:

| Flag | Applies to | Meaning |
| --- | --- | --- |
| `--redline` | both | Use final-pass mode with fewer style-only findings. |
| `--standard` | both | Use broader standard review mode. |
| `--lang zh|en|auto` | both | Force or auto-detect language. |
| `--max N` | both | Limit returned issues. |
| `--checks logic,style,citation` | quality | Select quality-check categories. |
| `--bib path/to/refs.bib` | quality | Load BibTeX bibliography evidence. |
| `--literature path/to/literature.md` | quality | Load local literature evidence records. |
| `--allow-network` | quality | Request external citation lookup for this invocation when host and user permissions already allow it. |
| `--no-network` | quality | Explicitly keep external citation lookup disabled. |
| `--disable-network` | quality | Alias for `--no-network`. |
| `--citation-providers doi,arxiv,crossref` | quality | Select external lookup providers. |

Slash commands are path-oriented. Use the tools directly when you need inline `text` input.

## Citation verification model

`writing_quality_check` treats citations conservatively:

- `VERIFIED`: evidence confirms the citation metadata.
- `MISMATCH`: evidence contradicts the bibliography or citation metadata.
- `UNVERIFIED`: no evidence source confirms the citation.

`UNVERIFIED` does not mean fabricated. It means the checker did not have enough evidence.

The checker uses local evidence first:

1. Inline `bibliography` from tool input.
2. `bibliographyPath` / `literaturePath` from tool input.
3. Colocated evidence files for a document path:
   - `<document-base>.bib`
   - `refs.bib`
   - `references.bib`
   - `paper.bib`
   - `literature.md`
4. External DOI/arXiv/Crossref lookup only when citations remain unverified and the caller explicitly passes tool input `allowNetwork: true` or the `--allow-network` command flag.

External lookup is disabled by default. `allowNetwork: true` and `--allow-network`
express the caller's request for remote lookup; they do not grant network access
or replace OMP host and user permissions. Exposing the tool through
`/enhancer-tools` is likewise not network permission. The compatibility flags
`--no-network` and `--disable-network`, or tool input `allowNetwork: false`, keep
lookup disabled explicitly.

## Supported citation forms

The checker extracts citation targets from:

```markdown
[@radford2021clip]
```

```latex
\cite{radford2021clip}
\citep{radford2021clip,vaswani2017attention}
\citet{radford2021clip}
```

```text
DOI: 10.1145/3366423.3380124
https://doi.org/10.1145/3366423.3380124
arXiv:2103.00020
https://arxiv.org/abs/2103.00020
```

BibTeX fields used for comparison include:

- `title`
- `author`
- `year`
- `doi`
- `eprint`

## Bundled frugal-pi compatible content

### Agents

The package ships these agents:

- `writer`
- `zh-writer`
- `checker`
- `zh-checker`

Model policy:

- `writer` and `zh-writer` declare `pi/task` for drafting and bounded revision work.
- `checker` and `zh-checker` declare `pi/slow` for independent quality review.
- These agents do not set `thinkingLevel`; each inherits both the model and reasoning level from its configured role.
- `writer` and `zh-writer` expose only `read`, `grep`, and `glob` and are always
  proposal-only: even when the assignment authorizes a file change, they return
  a complete proposed replacement, SEARCH/REPLACE block, or unified diff.
  `checker` and `zh-checker` additionally expose `web_search` for evidence
  verification, subject to current host and user network permission; they have
  no `write` or `edit`, remain read-only, and return reports in-band. Main alone
  decides whether a proposed change or report may be persisted and performs the
  authorized file mutation.

Composed workflows freeze one shared Skill list for assignment metadata, so it
may include methods owned by sibling checkpoints. Each writing child treats
those bodies as context rather than a new assignment and applies only the
method needed by its byte-0 `step` and `todo`. It never executes another
checkpoint's command, delegation, revision, publication, or file effect;
checker `web_search` remains limited to its own parent-selected review mode.

`writing.en` and `writing.zh` follow the marketplace-wide subagent-driven soft
default when their matching roles are exposed. Main gives the language-matched
writer a complete bounded drafting or revision assignment and receives a
proposal, then gives the language-matched checker the source, proposal, and
exact acceptance anchors for an independent in-band review. Main validates each
finding; accepted findings may return once to the writer for one corrected
proposal. Main alone applies any authorized file change and then verifies
content anchors, format, and the resulting artifact. Writer and checker are
dependency-ordered rather than parallel. `writing.pending` delegates nothing
until the source language is known and Main composes `writing.en` or
`writing.zh`. If the user requires Main-only work, a role/capacity is
unavailable, or the artifact/assignment is incomplete or unsafe to split, Main
records the direct fallback. This remains Agent-selected soft guidance, not a
fork requirement, router, gate, or automatic repair loop.

### Skills

The package ships these writing-related skills under their original names:

- `plain-chinese-writing`
- `pku-chinese-phd-thesis-checker`
- `writing-markdown-helper`
- `writing-state-machine`
- `writing-mad-writer`
- `writing-checkers`
- `writing-review`
- `zh-writing-markdown-helper`
- `zh-writing-state-machine`
- `zh-writing-mad-writer`
- `zh-writing-checkers`
- `zh-writing-review`
- `zh-writing-logic-check`
- `zh-writing-polish`
- `zh-format-humanizer`
- `format-humanizer`
- `format-submission-precheck`
- `format-human-comment-helper`
- `format-markdown2latex`
- `format-latex2markdown`
- `format-template-latex`
- `research-storyline`
- `research-literature`
- `research-relatedwork-summarizer`
- `research-experiment`
- `research-bogus-data`
- `research-phase-navigation`
- `research-socratic`

Generic development-planning skills are intentionally not bundled as writing parity content.

## Installation

Recommended installation uses the OMP marketplace so future releases can be upgraded with `omp plugin upgrade`.

Add the root monorepo marketplace:

```bash
omp plugin marketplace add marapapman/omp-enhancer
```

Install the plugin:

```bash
omp plugin install writing-helper@omp-enhancer
```

Check the installed plugin list:

```bash
omp plugin list
```

If the plugin is disabled, enable it:

```bash
omp plugin enable writing-helper@omp-enhancer
```

Restart the OMP session after installation. Marketplace installation exposes the tools `writing_logic_check` and `writing_quality_check`, plus the namespaced commands for this plugin.

## Upgrade

Update the root marketplace catalog, then upgrade the plugin:

```bash
omp plugin marketplace update omp-enhancer
omp plugin upgrade writing-helper@omp-enhancer
```

If you are developing locally, keep using `omp plugin link` instead of the marketplace upgrade flow.

## Local validation

From the repository root:

```bash
npm test --workspace writing-helper
npm run coverage --workspace writing-helper
omp plugin link --dry-run --json /absolute/path/to/omp-enhancer/plugins/writing-helper
npm pack --dry-run --workspace plugins/writing-helper
```

## Package layout

```text
writing-helper/
  index.js              # OMP extension entrypoint
  src/                  # deterministic analyzers and report formatting
  agents/               # bundled writer/checker agents
  skills/               # bundled frugal-pi compatible writing skills
  test/                 # node:test suite and coverage cases
  package.json
  README.md
```

## Document input boundary

The plugin reads UTF-8 text files. Markdown, plain text, and LaTeX source are appropriate inputs.

It does not decode binary Word or PDF files directly. Convert `.docx` or `.pdf` content to text first, or call the tools with inline `text`.
