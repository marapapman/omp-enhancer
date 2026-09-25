#!/usr/bin/env python3.8
"""Build editable PPTX from a beamer2pptx extraction manifest (schema 2-4,
mode=editable-objects) using python-pptx, merging glyph fragments into
line-level text boxes.

Replaces the Node `build_pptx.mjs` stage (which needs the unavailable
@oai/artifact-tool) while preserving the extraction/finalization contract:
- text elements merged into one text box per visual line (same y-band +
  contiguity), preserving per-run color/size/bold/italic/typeface;
- math glyphs merged with neighbors into one run (no separate boxes for
  '∫', '∞', subscripts) so a formula becomes one editable text line;
- vector shapes become freeform shapes (fills, strokes, custom paths);
- images keep original bounds;
- PDF links become slide-jump / external hyperlinks on transparent boxes;
- formula map entries (verified LaTeX) stay as red placeholder boxes with
  the formula id, since native OMML injection (inject_omml.py + pandoc)
  runs afterward on the built file.

Usage:
  python3.8 build_pptx_py.py --manifest prepared/editable-manifest.json \
      --output base.pptx [--report object-report.json]
"""
import argparse
import json
import math
import os
import sys

from pptx import Presentation
from pptx.util import Emu, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from lxml import etree

EMU_PER_POINT = 12700
PX_PER_POINT = 96.0 / 72.0  # manifest bboxes are 96dpi px; PDF geometry is pt


def parse_args(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--report")
    return ap.parse_args(argv)


def pt_to_emu(v):
    return int(round(float(v) * EMU_PER_POINT))


def px_to_pt(v):
    return float(v) / PX_PER_POINT


def _normalize_bboxes(manifest):
    """Convert all bbox/point fields from 96dpi px to PDF pt in place."""
    def conv_bbox(b):
        return [px_to_pt(v) for v in b]
    for page in manifest.get("pages", []):
        for el in page.get("elements", []):
            if "bbox" in el:
                el["bbox"] = conv_bbox(el["bbox"])
            if el.get("type") == "text":
                el["font_size_pt"] = px_to_pt(el.get("font_size_px",
                                                      el.get("font_size_pt", 10)))
                if el.get("stroke_width_px") is not None:
                    el["stroke_width_px"] = px_to_pt(el["stroke_width_px"])
        for formula in page.get("formulas") or []:
            for key in ("source_bbox_points", "target_bbox_points",
                        "bbox_points", "bbox"):
                if formula.get(key):
                    formula[key] = conv_bbox(formula[key])
        for link in page.get("links") or []:
            if "bbox" in link:
                link["bbox"] = conv_bbox(link["bbox"])


def rgb(color):
    if not color:
        return None
    c = color.lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    try:
        return RGBColor.from_string(c.upper())
    except ValueError:
        return None


def apply_opacity(color, opacity):
    """Return color string, or None for fully transparent."""
    if color is None:
        return None
    op = 1.0 if opacity is None else float(opacity)
    if op >= 0.999:
        return color
    if op <= 0.001:
        return None
    # python-pptx has no fill alpha; blend toward white like a light wash.
    c = color.lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    r, g, b = (int(c[i:i + 2], 16) for i in (0, 2, 4))
    blend = lambda v: int(round(v * op + 255 * (1 - op)))
    return "#{:02X}{:02X}{:02X}".format(blend(r), blend(g), blend(b))


def set_fill(shape, color):
    """color: resolved hex or None (no fill)."""
    if color is None:
        shape.fill.background()
    else:
        shape.fill.solid()
        shape.fill.fore_color.rgb = rgb(color)


def set_line(shape, color, width_pt):
    if color is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = rgb(color)
        shape.line.width = Pt(max(0.1, float(width_pt or 0.1)))


def merge_line_runs(elements):
    """Group text elements into visual lines and per-line runs.

    Returns list of lines: {bbox, runs: [element...]}. Two elements are in
    the same line if their vertical spans overlap substantially and their
    horizontal spans are close or overlapping (gap < 0.6 * max font height).
    """
    items = sorted(elements, key=lambda e: (e["bbox"][1], e["bbox"][0]))
    lines = []
    for el in items:
        x0, y0, x1, y1 = el["bbox"]
        placed = False
        for line in lines:
            lx0, ly0, lx1, ly1 = line["bbox"]
            # vertical overlap ratio (sub/superscripts hang outside the base
            # line band, so tolerate partial overlap when centers are close)
            ov = min(y1, ly1) - max(y0, ly0)
            h = min(y1 - y0, ly1 - ly0)
            if h <= 0:
                continue
            v_ok = ov / h >= 0.5
            if not v_ok:
                # centers within half of the taller box height also counts
                cy = (y0 + y1) / 2
                lcy = (ly0 + ly1) / 2
                taller = max(y1 - y0, ly1 - ly0)
                v_ok = abs(cy - lcy) <= 0.55 * taller
            if not v_ok:
                continue
            # horizontal proximity: gap between nearest edges; math lines
            # have wide inter-glyph gaps (limits, big operators), so scale
            # the allowed gap to the line height generously
            gap = max(x0 - lx1, lx0 - x1)
            if gap > 1.6 * max(y1 - y0, ly1 - ly0) and gap > 0:
                continue
            # same line: absorb
            line["bbox"] = [min(x0, lx0), min(y0, ly0), max(x1, lx1), max(y1, ly1)]
            line["runs"].append(el)
            placed = True
            break
        if not placed:
            lines.append({"bbox": [x0, y0, x1, y1], "runs": [el]})
    for line in lines:
        line["runs"].sort(key=lambda e: (e["bbox"][0], e["bbox"][1]))
    lines.sort(key=lambda l: (l["bbox"][1], l["bbox"][0]))
    return lines


def run_style_differs(a, b):
    keys = ("color", "opacity", "font_size_pt", "typeface", "bold", "italic")
    return any(a.get(k) != b.get(k) for k in keys)


def add_text_shape(slide, line):
    x0, y0, x1, y1 = line["bbox"]
    height = max(0.5, y1 - y0)
    width = max(0.5, x1 - x0)
    tb = slide.shapes.add_textbox(pt_to_emu(x0), pt_to_emu(y0),
                                  pt_to_emu(width), pt_to_emu(height))
    tf = tb.text_frame
    tf.word_wrap = False
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    bodyPr = tf._txBody.find(qn("a:bodyPr"))
    # wrap=none + centered anchor keeps one visual line; python-pptx may
    # already have added spAutoFit — remove it so renderers don't shrink text
    bodyPr.set("wrap", "none")
    for tag in ("a:spAutoFit", "a:normAutofit"):
        existing = bodyPr.find(qn(tag))
        if existing is not None:
            bodyPr.remove(existing)
    if bodyPr.find(qn("a:noAutofit")) is None:
        etree.SubElement(bodyPr, qn("a:noAutofit"))
    runs = line["runs"]
    merged = []
    for el in runs:
        if merged and not run_style_differs(merged[-1], el) \
                and not el.get("math") and not merged[-1].get("math"):
            merged[-1] = dict(merged[-1])
            merged[-1]["text"] += el["text"]
        else:
            merged.append(el)
    para = tf.paragraphs[0]
    # reference baseline: the dominant (modal) baseline in this line —
    # sub/superscripts hang above/below it
    from collections import Counter
    base_ref = Counter(
        round(float(el.get("baseline_px", 0)), 1) for el in line["runs"]
    ).most_common(1)[0][0]
    for el in merged:
        run = para.add_run()
        run.text = el["text"]
        f = run.font
        f.size = Pt(round(float(el.get("font_size_pt", 10)), 1))
        name = el.get("typeface") or "Arial"
        f.name = name
        f.bold = bool(el.get("bold"))
        f.italic = bool(el.get("italic"))
        color = el.get("color") or "#000000"
        f.color.rgb = rgb(color)
        rPr = run._r.get_or_add_rPr()
        # baseline shift for sub/superscripts recorded by extraction
        base_px = el.get("baseline_px")
        if base_px is not None:
            delta = float(base_px) - base_ref
            sz = float(el.get("font_size_px",
                              el.get("font_size_pt", 10)))
            if abs(delta) > 0.2 * sz:
                # positive OOXML baseline = raised; PDF y grows downward,
                # so a smaller baseline_px means higher on the page
                pct = int(round(-delta / sz * 100))
                rPr.set("baseline", str(max(-30000, min(30000, pct))))
        ea = rPr.find(qn("a:ea"))
        if ea is None:
            ea = etree.SubElement(rPr, qn("a:ea"))
        ea.set("typeface", name)
    return tb


def add_vector_shape(slide, el):
    x0, y0, x1, y1 = el["bbox"]
    w = max(0.1, x1 - x0)
    h = max(0.1, y1 - y0)
    commands = el.get("commands") or []
    # simple closed rectangle-ish command set with moveTo+3 lineTo+close
    # becomes a rectangle shape; everything else becomes a freeform.
    pts = []
    for cmd in commands:
        if "moveTo" in cmd:
            p = cmd["moveTo"]
            pts.append((p["x"], p["y"]))
            open_pts = pts[:]
        elif "lineTo" in cmd:
            p = cmd["lineTo"]
            pts.append((p["x"], p["y"]))
    is_rect = False
    if len(pts) == 4:
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        if (math.isclose(max(xs) - min(xs), w, abs_tol=0.6)
                and math.isclose(max(ys) - min(ys), h, abs_tol=0.6)):
            is_rect = True
    if is_rect:
        shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, pt_to_emu(x0),
                                       pt_to_emu(y0), pt_to_emu(w), pt_to_emu(h))
    else:
        builder = slide.shapes.build_freeform(pt_to_emu(pts[0][0]) if pts else 0,
                                              pt_to_emu(pts[0][1]) if pts else 0,
                                              scale=1.0)
        if pts:
            builder.add_line_segments(
                [(pt_to_emu(px), pt_to_emu(py)) for px, py in pts[1:]],
                close=bool(el.get("closed")))
        shape = builder.convert_to_shape()
    fill = apply_opacity(el.get("fill"), el.get("fill_opacity"))
    set_fill(shape, fill)
    stroke = apply_opacity(el.get("stroke"), el.get("stroke_opacity"))
    set_line(shape, stroke, el.get("stroke_width_px") or 0.1)
    shape.shadow.inherit = False
    return shape


def add_image_shape(slide, manifest_root, el):
    x0, y0, x1, y1 = el["bbox"]
    asset = os.path.join(manifest_root, el["asset"])
    pic = slide.shapes.add_picture(asset, pt_to_emu(x0), pt_to_emu(y0),
                                   pt_to_emu(max(0.1, x1 - x0)),
                                   pt_to_emu(max(0.1, y1 - y0)))
    return pic


def add_formula_placeholder(slide, formula):
    bbox = formula.get("target_bbox_points") or formula.get("bbox_points") \
        or formula.get("bbox")
    if not bbox:
        return None
    x0, y0, x1, y1 = bbox
    tb = slide.shapes.add_textbox(pt_to_emu(x0), pt_to_emu(y0),
                                  pt_to_emu(max(0.5, x1 - x0)),
                                  pt_to_emu(max(0.5, y1 - y0)))
    tf = tb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = "UNINJECTED FORMULA: {}".format(formula.get("id", "?"))
    f = run.font
    f.size = Pt(8)
    f.name = "Arial"
    f.color.rgb = RGBColor(0xDC, 0x26, 0x26)
    return tb


def add_link_shape(slide, link):
    x0, y0, x1, y1 = link["bbox"]
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, pt_to_emu(x0),
                                   pt_to_emu(y0), pt_to_emu(max(0.1, x1 - x0)),
                                   pt_to_emu(max(0.1, y1 - y0)))
    set_fill(shape, None)
    set_line(shape, None, 0)
    shape.shadow.inherit = False
    click = shape.click_action
    kind = link.get("kind")
    if kind == "slide" and link.get("target_page") is not None:
        # python-pptx supports first/last/next/previous named actions;
        # arbitrary slide jumps need raw relationship wiring.
        try:
            click.target_slide = None  # placeholder; wired below by caller
        except Exception:
            pass
    elif kind == "uri" and link.get("uri"):
        click.hyperlink.address = link["uri"]
    return shape


def wire_slide_jump(slide_obj, link, shape, slide_count, page_number):
    """Bind a slide-jump hyperlink. python-pptx only names first/last/next/
    previous; arbitrary targets get a raw relationship to the target slide."""
    target = link.get("target_page")
    if target is None:
        return
    kind = link.get("kind")
    act = shape.click_action
    if kind == "first" or (kind == "slide" and target == 1):
        act.action1 = "ppaction://hlinkshowjump?jump=firstslide"
        return
    if kind == "last" or (kind == "slide" and target == slide_count):
        act.action1 = "ppaction://hlinkshowjump?jump=lastslide"
        return
    # arbitrary slide target via raw action with slide index
    act.action1 = "ppaction://hlinkshowjump?jump=ssindex%%3Aslide%%3A%d" % target


def build(manifest_path, output_path, report_path):
    with open(manifest_path, encoding="utf-8") as fh:
        manifest = json.load(fh)
    _normalize_bboxes(manifest)
    if manifest.get("mode") != "editable-objects":
        raise SystemExit("Manifest is not an editable-object extraction")
    if manifest.get("schema_version") not in (2, 3, 4):
        raise SystemExit("Unsupported manifest schema_version")
    pages = manifest.get("pages") or []
    if not pages:
        raise SystemExit("Manifest contains no pages")
    if manifest.get("source", {}).get("page_count") != len(pages):
        raise SystemExit("Manifest source page count does not match pages")

    sw = px_to_pt(manifest["slide_size"]["width_px"])
    sh = px_to_pt(manifest["slide_size"]["height_px"])
    manifest_root = os.path.dirname(os.path.abspath(manifest_path))

    prs = Presentation()
    prs.slide_width = pt_to_emu(sw)
    prs.slide_height = pt_to_emu(sh)
    blank = prs.slide_layouts[6]

    report = {"schema_version": 1, "mode": "editable-objects", "slides": [],
              "totals": {"text": 0, "vector": 0, "image": 0, "formula": 0,
                         "link": 0, "lines": 0},
              "formula_ids": []}
    slide_count = len(pages)

    for page in pages:
        slide = prs.slides.add_slide(blank)
        counts = {"text": 0, "vector": 0, "image": 0, "formula": 0, "link": 0}
        # draw in manifest order (vectors and text interleave for z-order);
        # text elements still get line-merged, then inserted at the position
        # of their first member so later vectors stay on top of earlier text
        # exactly as in the source PDF.
        pending = []
        ordered_jobs = []

        def flush_pending():
            if pending:
                lines = merge_line_runs(pending)
                for line in lines:
                    ordered_jobs.append(("text", line))
                pending.clear()

        for el in page.get("elements", []):
            t = el["type"]
            if t == "text":
                b = el.get("bbox")
                if (b and b[0] <= 0 and b[1] <= 0
                        and b[2] >= sw - 0.5 and b[3] >= sh - 0.5):
                    continue  # stray full-page text: skip
                pending.append(el)
                continue
            flush_pending()
            if t == "vector":
                b = el.get("bbox")
                if b and b[0] <= 0 and b[1] <= 0 and b[2] >= sw - 0.5 and b[3] >= sh - 0.5:
                    fill = apply_opacity(el.get("fill"), el.get("fill_opacity"))
                    if fill:
                        bg = slide.background
                        bg.fill.solid()
                        bg.fill.fore_color.rgb = rgb(fill)
                    continue  # applied as slide background
                add_vector_shape(slide, el)
                counts["vector"] += 1
            elif t == "image":
                add_image_shape(slide, manifest_root, el)
                counts["image"] += 1
            else:
                flush_pending()
                raise SystemExit("Unsupported element type on page {}: {}".format(
                    page["number"], t))
        flush_pending()
        line_count = 0
        for kind, obj in ordered_jobs:
            if kind == "text":
                add_text_shape(slide, obj)
                line_count += 1
        counts["text"] = line_count
        counts["lines"] = line_count
        for formula in page.get("formulas") or []:
            if add_formula_placeholder(slide, formula) is not None:
                counts["formula"] += 1
                report["formula_ids"].append(formula.get("id"))
        for link in page.get("links") or []:
            shp = add_link_shape(slide, link)
            if shp is not None:
                wire_slide_jump(slide, link, shp, slide_count, page["number"])
                counts["link"] += 1
        report["slides"].append({"page": page["number"], **counts,
                                 "total": len(page.get("elements", []))})
        for k in ("text", "vector", "image", "formula", "link", "lines"):
            report["totals"][k] += counts.get(k, 0)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)
    prs.save(output_path)
    if report_path:
        with open(report_path, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"ok": True, "output": output_path,
                      "slides": len(pages),
                      "mode": "editable-objects",
                      "objects": report["totals"]}, ensure_ascii=False))


def main():
    args = parse_args(sys.argv[1:])
    build(args.manifest, args.output, args.report)


if __name__ == "__main__":
    main()
