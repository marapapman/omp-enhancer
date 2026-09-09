---
name: slides-visual-repair-pipeline
description: Batch visual repair pipeline for an already-delivered one-frame-per-file Beamer deck with SVG figure sources (`images/*.svg` -> cairosvg-exported `slides/assets/*.pdf`). One independent task agent per image and per page; incremental ledger records only render-evidenced passes. Use for recurring maintenance rounds where previously fixed figures and pages must be skipped, and dependency changes (re-exported assets, shared macro edits) must re-queue affected pages. Not for drawing new diagrams (use drawio-skill), authoring or revising deck content (use latex-beamer-slides), or decks with multi-frame source files.
---

# Slides Visual Repair Pipeline (per-image / per-page task + incremental ledger)

Goal: one independent task agent per image and per page for visual check + fix; a ledger records repair history with render evidence so each round re-checks only changed items (including dependency propagation) and skips already-passed items.

## Scope and isolation (read first)

- **Lifecycle boundary.** This skill covers recurring visual **maintenance** of an already-delivered deck. Deck authoring, content revision, and the generation-time QA chain (single read-only visual precheck -> layout pass -> visioner review) belong to `latex-beamer-slides` and are unaffected. Content changes discovered here go back through `latex-beamer-slides`' Markdown content plan path; this pipeline only fixes layout/figure defects in place. `latex-beamer-slides` does not need to mention this skill.
- **Only one-frame-per-file decks** (`slides/slides/*.tex`, one frame per file, e.g. Intro2Computing weekly decks). A repair can shift pagination, so per-page physical page numbers require one frame per source file; multi-frame decks must be split first or handled by another method.
- **SVG figure sources only**: `images/*.svg` exported via cairosvg to `slides/assets/<name>.pdf`. PNG/JPG bitmap sources and non-Beamer decks are out of scope.
- **No draw.io takeover**: `.drawio` sources keep the drawio-skill flow (draw once -> one read-only visioner precheck -> at most one fix round). This pipeline neither re-prechecks nor repairs drawio artifacts.
- **Advisory, Main-owned.** The ledger is a dedup tool, not a gate: it never blocks, routes, or decides completion. OMP-native authority over permissions and completion is unchanged. Repair rounds are Main-orchestrated dispatches; there is no automatic repair loop — each round is an explicit Main decision, and unresolved findings are reported, never silently retried.

## Repair ledger visual-qa-history.json

Lives in the deck root, committed with sources, **written and read only by Main** (task agents never touch it).

```json
{
  "pipeline": 2,
  "images/03-string.svg": {
    "hash": "<SVG sha256 at pass time>", "status": "pass", "evidence": "render",
    "fixes": ["mono line Chinese switched to YaHei"], "checked": "2026-09-09"
  },
  "slides/slides/021-slice.tex": {
    "hash": "<combined sha256 at pass time>", "deps": ["slides/assets/03-string.pdf"],
    "status": "pass", "evidence": "render", "fixes": [], "checked": "2026-09-09"
  }
}
```

- **An entry records only "passed with final rendered-image evidence"**. `FIXED` is not a pass: after an agent reports FIXED, the entry is written only when render evidence exists and (for pages) Main's re-render verification passes.
- **Skip condition = current fingerprint equals the entry hash AND `evidence=="render"`**; missing either means stale and re-queued. Unresolved items get no entry -> automatically re-queued next round.
- Image entry hash = SVG source sha256; evidence = post-fix svg2png render read back.
- Page entry hash = sha256(page.tex + main.tex + all deps contents concatenated); deps = **resolved actual files** for `assets/…` references in the page (extensionless references resolve by trying `.pdf`/`.png`/`.jpg`; an unresolvable reference is reported as `UNRESOLVED` and fails closed: the page stays pending and gets no ledger entry this round).
- **Dependency change propagates as stale**: SVG edited and re-exported -> asset PDF hash changes -> referencing pages auto-stale even with unchanged .tex; a main.tex macro change stales all pages. Stale is not a stored field — recomputed every round.
- `pipeline` version: bump when the render toolchain or parameters change (cairosvg swap, xelatex flag changes, repo-local font files added — repo-local fonts must join deps; system fonts need no handling). A version mismatch clears the ledger for a full re-check.
- Failed/incomplete checks keep no entry (or the old one) -> re-checked next round.

## Task return contract (both phases; without it Main writes no ledger entry)

Every task report must contain:

```
changed: yes|no
postHash: <sha256 of the SVG or page .tex after the fix>
verdict: pass|unresolved
evidence: <post-fix render PNG confirmed via read; state the file path>
leftover: <remaining issues; none if no>
```

Main's closing verification: postHash matches disk, verdict=pass, evidence exists, (for pages) re-render verification passes -> then write the ledger. Unresolved items are listed item-by-item in the delivery report, never hidden.

## Flow (Main-orchestrated, two phases)

1. **Image precheck**: run the precheck script, collect PENDING_IMAGES.
2. **Image phase**: one independent task per pending SVG (parallel <=4 or serial). The agent fixes the SVG -> re-exports the same-name PDF via cairosvg -> renders a PNG and inspects it -> reports per the contract. Main aggregates.
3. **Page precheck**: rerun the script after images are fixed; pages referencing re-exported assets auto-stale into PENDING_PAGES even with unchanged .tex.
4. **Baseline compile**: Main compiles twice, then locates each pending page's physical page number via pdftotext (match a unique long frame title; physical page != footer frame number).
5. **Page phase**: one independent task per pending page. The agent renders its page with pdftoppm -> reads the image -> fixes only its own .tex -> reports per the contract. The agent never runs xelatex.
6. **Closing verification**: Main recompiles twice -> re-renders every page FIXED this round and confirms each by reading the image -> verifies each task contract -> writes ledger entries -> syncs artifacts (cp, pdftotext, sha256 check).

Precheck script (**the page fingerprint construction must be identical to the ledger write side**: resolve deps -> concatenate in the same order -> sha256; verified against a synthetic deck for skip/propagation/fail-closed paths):

```bash
cd <deck-root> && python3 -c "
import json,hashlib,os,re,glob
led=json.load(open('visual-qa-history.json')) if os.path.exists('visual-qa-history.json') else {}
if led.get('pipeline')!=2: led={}
h=lambda p: hashlib.sha256(open(p,'rb').read()).hexdigest()
def deps(t):
    out=[]; miss=[]
    for ref in sorted(set(re.findall(r'assets/[A-Za-z0-9._-]+', open(t).read()))):
        c='slides/'+ref
        if os.path.exists(c): out.append(c); continue
        base,ext=os.path.splitext(ref)
        hit=next(('slides/'+base+e for e in ('.pdf','.png','.jpg') if os.path.exists('slides/'+base+e)),None)
        if hit: out.append(hit)
        else: miss.append(ref)
    return out,miss
def pagefp(t):
    d,miss=deps(t)
    blob=open(t,'rb').read()+open('slides/main.tex','rb').read()+b''.join(open(x,'rb').read() for x in d)
    return hashlib.sha256(blob).hexdigest(), d, miss
print('PENDING_IMAGES', *[p for p in sorted(glob.glob('images/*.svg')) if not (led.get(p,{}).get('hash')==h(p) and led[p].get('evidence')=='render')])
for t in sorted(glob.glob('slides/slides/*.tex')):
    fp,d,miss=pagefp(t)
    e=led.get(t,{})
    if miss or not (e.get('hash')==fp and e.get('evidence')=='render'):
        print('PENDING_PAGE',t,*(f'UNRESOLVED={m}' for m in miss),('deps='+','.join(d) if d else 'deps='))
"
```

An empty ledger on the first round -> everything pending, as intended. When writing page ledger entries, Main reuses the same `deps`/`pagefp` construction (store the `deps` list for auditability).

## Image task body template

```
Target: images/<n>.svg (used on page <N>, topic <topic>)
Focus: <2-4 image-specific points> + the generic checklist
Constraints:
1. Touch only this SVG; after fixing re-export slides/assets/<n>.pdf via cairosvg;
   then svg2png(output_width=1440) render and confirm via read — never judge from the diff alone.
2. Do not touch .tex/main.tex/other SVGs/drawio sources; no xelatex; delete nothing; never touch the ledger.
3. Fonts: Chinese in a YaHei-class family; .code/.mono has no CJK glyphs; replace ✔✘ with words (→ is fine).
4. Widths: CJK ≈ font size, ASCII ≈ 0.6× font size; long anchor=middle lines keep >=10px margins on both ends;
   curve vertices stay >=8px above text baselines; text closer than 10px to a box edge counts as crowding.
5. Report per the return contract (changed/postHash/verdict/evidence/leftover);
   report unresolved honestly — never hide findings to pass.
```

Record previously fixed points in the task context ("do not touch unless a new problem appears") so agents do not revert historical fixes.

## Page task body template

```
Target: slides/slides/<page>.tex (PDF physical page <N>, frame title "…")
Check: render with pdftoppm -f N -l N -r 150 -png, then read the image.
Focus: Overfull/footer clipping; code >18 lines losing its tail (switch to in-page
Verbatim[fontsize=\scriptsize,frame=single]); codeann annotation column clipping;
figure-text layouts (dense figures use figfull 0.86 width); in-figure text readability after embedding
(SVG sharp at full size != readable embedded); text overflowing frames or pressing on figures.
Constraints:
1. Touch only this page's .tex; no xelatex; never touch other pages/main.tex/SVGs/the ledger.
2. SVG content defects: record only, never fix (the image phase is authoritative); report them in leftover.
3. Report per the return contract (changed/postHash/verdict/evidence/leftover);
   report unresolved honestly — never hide findings to pass.
```

## Ledger update rules (Main at closing)

- Recompiled, re-rendered, FIXED pages verified + contract verified -> write hash, deps, status=pass, evidence=render, fixes, checked.
- A page with unresolved dependencies (UNRESOLVED) -> forbidden to write its entry this round; list missing assets in the delivery report (fail-closed: missing figures must not hide behind a historical fingerprint).
- Verification failed or unresolved -> no entry (auto re-entry next round); list open items in the delivery report.
- SVG deleted -> drop its entry; unreferenced asset PDFs -> verify zero references with grep, then delete the file.
- The ledger records only "passed with evidence" state, never plans; each round's precheck output is that round's work order.

## Pitfalls

- Page numbering: pdftoppm uses physical page numbers; the footer `N/150` is a Beamer frame number (plain pages not counted) — the two differ.
- Page skip checks must use the same combined fingerprint (page.tex+main.tex+deps) as the write side; a single-file hash never matches and forces a full re-check every round.
- Image FIXED -> asset pdf hash changes -> referencing pages must re-check even with unchanged .tex (deps store resolved PDFs; the combined hash covers it).
- Extensionless `assets/foo` references must resolve to `slides/assets/foo.pdf`, otherwise dependency detection silently misses them and stale propagation dies; unresolvable ones fail closed: the page stays pending and gets no ledger entry.
- One frame per source file only: shared-frame-source decks shift pagination when a page is repaired and later page numbers go stale; split first, never extend this pipeline to them.
- A page agent finding an SVG defect reports it in leftover only; Main re-enters the image phase at most once per round to prevent loops.
- Parallel tasks write disjoint files; the ledger, compiles, and artifact syncing belong to Main alone.
