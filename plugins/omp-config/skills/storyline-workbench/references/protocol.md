# Storyline workbench protocol

Frozen contracts: CLI, project layout, story JSON, HTTP API, export files.

## CLI

```text
node <pluginRoot>/scripts/storyline-workbench.mjs init --project <dir> --kind article|slides --title <text>
node <pluginRoot>/scripts/storyline-workbench.mjs serve --project <dir> [--port <n>]
node <pluginRoot>/scripts/storyline-workbench.mjs context --project <dir> --round <id>
node <pluginRoot>/scripts/storyline-workbench.mjs propose --project <dir> --file <proposal.json>
```

`init` creates `<project>/.storyline/story.json` and `assets/` with a `topic`
root node titled from the user's topic, or an empty title while the page
asks for input. An existing valid store is returned as-is and never reset;
a different `kind` or corrupt JSON errors and leaves that file untouched.

`serve` binds `127.0.0.1` only; an omitted port means 0, and a busy requested
port is an error rather than a takeover. stdout prints the URL with the actual
port and the session token fragment plus the project path.

`context --project <dir> --round <id>` prints the frozen round snapshot as
JSON on stdout, and `propose --project <dir> --file <proposal.json>` sends a
proposal to the live server. Both need a live server and report
`SERVER_NOT_RUNNING` without one, and neither writes story JSON directly.

## Project layout

Workbench data lives in `<project>/.storyline/`: `story.json`, `assets/`, and
`exports/r<revision>/`.

## Story JSON

Top-level fields are `schemaVersion` (only 1 is accepted), `projectId` (UUID),
`kind` (`article` or `slides`), `revision` (starts at 0), `rootId` (the single
topic node), `nodes`, `comments`, `assets`, `rounds`, and `proposals`.

The global `revision` increases only on effective tree or comment changes;
uploading an unreferenced asset, creating a round, and importing a pending
proposal do not change it. All updates go through one write queue, and each
commit renames a temp file over `story.json`; an unknown `schemaVersion` is
refused.

## Nodes

```js
{ id, parentId, kind, position, title, blocks, sources, revision }
// kind: "topic" | "claim" | "evidence"
// sources: [{ label: string, url: string }]
```

- Exactly one node has `kind: "topic"`; it equals `rootId` and has no parent.
- A `claim` may nest under a `topic` or another `claim`, while `evidence` sits
  only under a `claim` and has no children.
- The `topic` root is the whole topic, `claim` nodes are the chapters and
  sections that group the leaves, and each `evidence` leaf is one paragraph of
  the article or one page of the deck, titled with its topic sentence.
- Parents must exist; cycles, orphans, duplicate IDs, kind changes, and root
  identity changes are rejected, and sibling `position` is contiguous from 0.
- A chapter or section whose whole subtree holds no leaf saves as a draft and
  the site marks it empty, with nothing auto-filled; a chapter that holds only
  sections that do have leaves is not empty.
- The root cannot be deleted or moved; its `title`, `blocks`, and `sources`
  stay editable, and deleting another node deletes its subtree after the site
  reports the removed count.

A node revision starts at 1 and increases only when the node's own `blocks`,
`title`, `parentId`, `position`, or direct child ID sequence changes; other
nodes keep their revisions.

## Blocks

```js
// ids are unique within the node, and four shapes exist
{ id, type: "markdown", text }
{ id, type: "table", columns: string[], rows: string[][], caption }
{ id, type: "image", assetId, role: "figure" | "icon", alt, caption }
{ id, type: "math", latex, display: boolean }
```

## Comments

`{ id, nodeId, nodeRevision, body, status, createdAt, updatedAt }`

`status` is `open` or `resolved`, and blank comments are not submitted. A
comment records the node revision current when it was written or last edited,
so a later node edit marks it as written against an earlier revision without
resolving it; comment text never becomes article prose.

## Assets

`{ id, filename, mime, size, storedName }`

The file is stored at `assets/<uuid>.<extension>`, and the original `filename`
is for display only. PNG, JPEG, WebP, GIF, and SVG are accepted; an icon uses
the same image block with `role: "icon"`. An upload is rejected when its
bytes do not match an accepted image type or when its declared `Content-Type`
disagrees with the detected type. SVG loads only as an `img` source, never
inline, object, or iframe, and Markdown never enables HTML.

## HTTP API

All `/api/*` requests carry `Authorization: Bearer <token>`, and public static
GET exposes only a fixed allowlist of plugin assets. The browser moves the
token from the URL fragment into `sessionStorage`, and images load through an
authenticated fetch into a Blob object URL. Only the current bound Host is
accepted, browser mutations require `Origin` equal to the site, and CLI
requests without `Origin` still need the bearer token, with no CORS. Directory
traversal, encoded traversal, and symlink escape are rejected, and ordinary
JSON bodies are capped at 10 MiB while one asset is capped at 25 MiB. Nothing
in stored content executes as shell, LaTeX command, or web instruction.

|Method and path|Request and result|
|---|---|
|`GET /api/story`|the full current story JSON, `Cache-Control: no-store`|
|`PUT /api/tree`|`{expectedRevision,nodes}`, the whole candidate tree without any client-supplied server revision; validates structure, computes the diff and versions, atomically replaces the tree, returns the newest story|
|`POST /api/comments`|`{expectedRevision,nodeId,body}`; the server generates ID, node revision, and timestamps|
|`PATCH /api/comments/:id`|`{expectedRevision,body?,status?}` with at least one changed field; unknown ID is 404|
|`POST /api/assets?filename=<encoded>`|raw file body with the correct Content-Type, verified type, returns the asset record; no disk path or remote URL, and the server never fetches a URL|
|`GET /api/assets/:id`|the project file behind authentication, 404 when unknown|
|`POST /api/rounds`|`{expectedRevision}` creates `{id,baseRevision,createdAt,projectId,kind,rootId,nodes,comments,assets}` with only `open` comments; immutable snapshot, returns that round|
|`GET /api/rounds/:id`|the exact context for the next writer round|
|`POST /api/proposals`|import a proposal; returns the pending proposal, changes no body text|
|`POST /api/proposals/:id/decision`|`{expectedRevision,decision:"accept"|"reject"}`; accept re-validates the base revision first, reject changes no tree|
|`POST /api/exports`|`{expectedRevision}`; confirms the current story and writes an immutable export snapshot, returns the path and revision|

## Response envelopes

`GET /api/story` returns the story JSON object itself, and
`GET /api/rounds/:id` returns the round snapshot object itself.

Every mutation response carries the newest complete story in its `story`
field, plus the fields the call itself produces.

|Request|Response body|
|---|---|
|`PUT /api/tree`|`{story}`|
|`POST /api/comments`|`{story,comment}`|
|`PATCH /api/comments/:id`|`{story}`|
|`POST /api/assets`|`{story,asset}`|
|`POST /api/rounds`|`{story,round,projectDir}`|
|`POST /api/proposals`|`{story,proposal,comparison,stale}`|
|`POST /api/proposals/:id/decision`|`{story,proposal,comparison}`|
|`POST /api/exports`|`{story,projectDir,export}`|

`projectDir` is the absolute project directory the server is bound to, and the
site shows it with the round ID so the user can copy the CLI continuation
instruction. `export` carries `revision`, `directory`, `relativeDirectory`,
`files`, and `reused`. `comparison` lists per-node `{nodeId, change, title}`
entries; `change` is `added|changed|removed`, and a `changed` entry also
carries a `fields` array drawn from `title|parentId|position|blocks|sources`.
`stale` is computed from `baseRevision` against the current revision.

## Errors

Failures use `{error:{code,message},revision?}`.

|Status|Meaning|
|---|---|
|400|validation failure, including a JSON syntax error or an unknown field|
|403|unauthorized, including a missing or wrong bearer token, Host, or Origin|
|404|unknown resource, including an unknown comment, round, proposal, or asset ID|
|409|revision conflict, including an expired proposal|
|413|request or asset over the size limit, with no partial file|
|500|I/O failure, reported without a project-external path or token|

`REVISION_CONFLICT` carries the current revision; the client keeps its
unsubmitted draft, shows the server value, and saves only after an explicit
re-apply. There is no automatic retry and no last-write-wins.

## Rounds and proposals

`POST /api/rounds` takes `{expectedRevision}` and creates an immutable
snapshot holding only `open` comments with `id`, `baseRevision`, `createdAt`,
`projectId`, `kind`, `rootId`, `nodes`, `comments`, and `assets`. Creating a
round leaves the story `revision` unchanged, and `GET /api/rounds/:id`
returns the snapshot as the exact context for the next writer round.

`POST /api/proposals` imports the writer's JSON and changes no body text. The
input fields are `schemaVersion` (1), `roundId` (an existing round),
`baseRevision` (equal to the origin snapshot and the current revision),
`nodes` (the complete candidate tree, unchanged IDs and text, no server
revision fields), `addressedCommentIds`, and `summary`.

The server persists those fields plus generated `id`, `createdAt`, and
`status`, where `status` is `pending`, `accepted`, or `rejected` and a
caller-supplied status is refused; staleness is computed from `baseRevision`.
Import keeps the candidate tree and the origin snapshot, and the site shows
per-node additions, deletions, moves, title, block, and source changes.

The whole proposal is accepted or rejected, with no field-level automatic
merge. Acceptance re-checks the current revision, commits the tree atomically
and resolves the listed comments; an expired proposal returns 409 and is kept,
so Main redoes the new round's proposal. Rejection records `rejected`.

## Export

`POST /api/exports` writes `.storyline/exports/r<revision>/`.

The export holds `story.json` with only `schemaVersion`, `projectId`, `kind`,
`revision`, `rootId`, `nodes`, and `assets`, plus `storyline.md` and
`feedback.json`.

Files are staged in a temp directory and renamed into place, so repeating the
same revision returns the same result and never rewrites an existing snapshot.

`storyline.md` is a depth-first traversal by `position`, carrying the root
topic, each node's stable ID, `parentId`, and `kind` as metadata, its full
title, every block's content, the sources, and relative media paths. Depth
beyond Markdown's six heading levels uses a fixed level-six heading plus the
explicit parent ID, so no node is dropped. Table cells escape pipes and
newlines, math keeps its raw LaTeX, and images reference the persisted asset
file by relative path; comments live only in `feedback.json`, and export never
modifies the article, the slide plan, or any PPTX.

## Worked proposal example

```json
{
  "schemaVersion": 1,
  "roundId": "c6f9d0b2-3a41-4f7e-9f2a-1b8c5d6e7f80",
  "baseRevision": 12,
  "nodes": [
    { "id": "0f4a1c62", "parentId": null, "kind": "topic", "position": 0,
      "title": "Cache policy and latency", "blocks": [], "sources": [] },
    { "id": "9d2e8b", "parentId": "0f4a1c62", "kind": "claim", "position": 0,
      "title": "Hit ratio dominates tail latency", "blocks": [],
      "sources": [{ "label": "trace", "url": "https://example.com/t" }] }
  ],
  "addressedCommentIds": ["c41"],
  "summary": "Changed the response-time unit to milliseconds."
}
```
