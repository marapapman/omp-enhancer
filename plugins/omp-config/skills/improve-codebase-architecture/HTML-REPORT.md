# HTML Report Format

The architectural review is rendered as a single self-contained HTML file in the OS temp directory. Tailwind comes from a CDN under the network boundary. Graphs are hand-built as inline SVG (divs and `<svg>` boxes-and-arrows) — Mermaid is retired. For a complex graph that needs real layout, author it as a `.drawio` file with drawio-skill (drawio@365-skills) and reference it from the report.

## Scaffold

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Architecture review — {{repo name}}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      .seam { stroke-dasharray: 4 4; }
      .leak { stroke: #dc2626; }
      .deep { background: linear-gradient(135deg, #0f172a, #1e293b); }
    </style>
  </head>
  <body class="bg-stone-50 text-slate-900 font-sans">
    <main class="max-w-5xl mx-auto px-6 py-12 space-y-12">
      <header>...</header>
      <section id="candidates" class="space-y-10">...</section>
      <section id="top-recommendation">...</section>
    </main>
  </body>
</html>
```

## Candidate card

The diagrams carry the weight. Prose is sparse, plain, and uses the glossary terms ([LANGUAGE.md](skill://improve-codebase-architecture/LANGUAGE.md)) without ceremony.

Each candidate is one `<article>`:

- **Title** — short, names the deepening (e.g. "Collapse the Order intake pipeline").
- **Badge row** — recommendation strength + dependency category tag
- **Files** — monospaced list
- **Before / After diagram** — the centrepiece
- **Problem** — one sentence
- **Solution** — one sentence
- **Wins** — bullets, ≤6 words each
- **ADR callout** (if applicable)

## Diagram patterns

Pick the pattern that fits the candidate. Mix them.

### Hand-built SVG graph (the workhorse for dependencies / call flow)

Use hand-built inline SVG `boxes-and-arrows` (modules as `<rect>` + `<text>`, leakage edges red with `stroke: #dc2626`, the deep module dark) when the point is "X calls Y calls Z, and look at the mess." Mermaid is retired; for a graph that needs automatic layout, author it as a `.drawio` file with drawio-skill (drawio@365-skills) instead.

### Hand-built boxes-and-arrows (for small editorial diagrams)

Modules as `<div>`s with borders and labels. Arrows as inline SVG `<line>` or `<path>` elements.

### Cross-section (good for layered shallowness)

Stack horizontal bands to show layers a call passes through. Before: 6 thin layers each doing nothing. After: 1 thick band.

### Mass diagram (good for "interface as wide as implementation")

Two rectangles per module — one for interface surface area, one for implementation.

### Call-graph collapse

Before: a tree of function calls rendered as nested boxes. After: the same tree collapsed into one box.

## Style guidance

- Lean editorial, not corporate-dashboard.
- Colour sparingly: one accent (emerald or indigo) plus red for leakage and amber for warnings.
- Keep diagrams ~320px tall so before/after sits comfortably side by side.
- Use `text-xs uppercase tracking-wider` for module labels.

## Tone

Plain English, concise — but the architectural nouns and verbs come straight from [LANGUAGE.md](skill://improve-codebase-architecture/LANGUAGE.md). Use exactly: module, interface, implementation, depth, deep, shallow, seam, adapter, leverage, locality. Never substitute: component, service, unit, API, signature, boundary, layer, wrapper.
