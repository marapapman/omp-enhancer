---
name: storyline-workbench
description: Organize the story of a new article or slide deck as a tree of topic, claims, and evidence before any prose is written, and continue editing a confirmed tree in the project's local workbench site. Use when a user starts a new article or presentation whose story must be structured first, or returns to an existing tree for another round. It does not trigger for local polishing, translation, or edits to an existing finished document, which keep their own revision as the baseline.
---

# Storyline Workbench

Organize a piece of writing as an editable tree before prose exists: a topic
root, claim branches, evidence leaves, and editable content on every node.

## Who owns what

Main starts and owns the server lifecycle: it runs the CLI commands, keeps the
process alive while the user edits, and applies the accepted result.

When this Skill is part of a `writer` or `zh-writer` assignment, that
invocation (the language-matched text tool) remains proposal-only: it runs no
command and writes no file, and returns the complete proposal. Main or a
separate explicitly capable Main-selected Agent owns authorized effects, and
the writer or zh-writer alone owns all wording.

The website stores and renders the tree, comments, assets, rounds, proposals,
and exports. It has no model access and never spends model quota.

## Operation order

Resolve the plugin root from this Skill file's own location, then run:

```text
node <pluginRoot>/scripts/storyline-workbench.mjs init --project <dir> --kind article|slides --title <text>
node <pluginRoot>/scripts/storyline-workbench.mjs serve --project <dir> [--port <n>]
node <pluginRoot>/scripts/storyline-workbench.mjs context --project <dir> --round <id>
node <pluginRoot>/scripts/storyline-workbench.mjs propose --project <dir> --file <proposal.json>
```

1. Run `init` to create `.storyline/story.json` and `assets/` and one
   `topic` root node whose title comes from the user's stated topic.
   It never overwrites an existing valid store and never invents a topic;
   with no topic the title is empty and the page asks for input.
2. Run `serve` to start the site. It binds `127.0.0.1` and prints the URL with
   the actual port and the session token fragment, plus the project path.
3. Open the printed URL; the page keeps the session token for that origin.
4. Edit the tree with the user: titles, content blocks, sources, and comments.
5. Submit the next round from the site, which freezes the story and its `open`
   comments and shows the round ID, the project path, and a copyable OMP
   continuation instruction; no model is called in the background.
6. After the user asks to continue, run `context --project <dir> --round <id>`
   to read the frozen round snapshot from the live server.
7. Call the language-matched writer or zh-writer with every user-edited node
   as the baseline and the comments as bounded revision requests, never as
   executable orders.
8. Save the returned JSON as a proposal file and run `propose --project <dir>
   --file <proposal.json>` while the server is live.
9. Review the diff in the site and accept or reject the whole proposal.
10. Export the confirmed story and hand that revision to the article or slide
    writer.

## Tree model

The root node is the topic, `claim` nodes are its branches, and `evidence`
nodes are its leaves. A claim may sit under the topic or another claim;
evidence sits only under a claim and has no children. Exactly one node is the
topic, it equals `rootId`, and its parent is empty. Sibling `position` is
contiguous from 0, parents must exist, and cycles, orphans, duplicate IDs,
kind changes, and root identity changes are rejected.

The root cannot be deleted or moved, and its title, blocks, and sources stay
editable. A claim with no evidence saves as a draft and shows a
missing-evidence hint, with nothing auto-filled; a deleted node takes its
subtree with it after the site reports the removed count.

## Node editing

Every node, the root included, has the same surface: an editable title,
ordered `markdown`, `table`, `image`, and `math` blocks, and sources. Table
blocks carry columns, rows, and a caption; image blocks reference a stored
asset with role `figure` or `icon` plus alt text and a caption; math blocks
carry raw LaTeX and a display flag. Blocks and nodes can be added, edited,
moved, and deleted, and the editor renders Markdown without HTML.

## Comments

Comments stay separate from body text, never become article paragraphs, and
serve as the brief for the next round. A comment records the node revision
current when it was written or last edited, and no later node edit resolves
it. Comments are `open` or `resolved`, can be reopened, and blank ones are
not submitted.

## Rounds and proposals

A round freezes the story and its `open` comments into an immutable snapshot
that `context` prints as JSON on stdout.

The writer returns only JSON with `schemaVersion`, `roundId`, `baseRevision`,
the complete candidate `nodes` tree, `addressedCommentIds`, and `summary`,
keeping unchanged node IDs and their text.

The server accepts only an existing `roundId`, a `baseRevision` that still
equals the current revision, and `addressedCommentIds` from that round's open
comments. Acceptance commits the tree atomically and resolves exactly the
listed comments; an expired proposal returns 409 and is kept, so Main redoes
it for the new round. Rejection records `rejected`, changing no tree.

## Export

Export writes `.storyline/exports/r<revision>/` with `story.json`,
`storyline.md`, and `feedback.json`, and repeating a revision returns the same
result without rewriting an existing snapshot.

An article takes its sections from the confirmed export revision, and a slide
plan records `sourceNodeIds` and `storyRevision` per page.

## Portability and remote access

`serve` binds loopback only, an omitted `--port` asks the operating system
for a free port, and a busy requested port is an error rather than a takeover.
On a remote machine, reach the printed URL through SSH port forwarding in the
local browser.

The plugin root always resolves from this Skill file's own location, so no
machine path appears in the Skill, and data stays inside the current project's
`.storyline` directory.

## When a step fails

A revision conflict keeps the user's unsubmitted draft in the browser, shows
the server revision beside it, and saves with the new revision only after the
user re-applies it; there is no automatic retry and no last-write-wins. When
the server is not running, `context` and `propose` report `SERVER_NOT_RUNNING`
and print the start command instead of writing story JSON directly.

A corrupt store or an unknown `schemaVersion` is refused and left in place.
An unknown asset ID returns 404 rather than a disk read.

## Reference

The exact JSON shapes, HTTP API table, error envelope, and a worked proposal
example live in `skill://storyline-workbench/references/protocol.md`.
