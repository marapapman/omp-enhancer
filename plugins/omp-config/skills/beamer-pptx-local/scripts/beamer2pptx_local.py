#!/usr/bin/env python3.8
"""beamer2pptx-local: convert a compiled Beamer PDF into an editable PPTX
using LibreOffice's PDF import, locally and without external services.

Pipeline: Beamer (.tex) --[xelatex/pdflatex]--> PDF --[soffice pdfimport]--> PPTX
Optionally merge a beamer2pptx extraction manifest to re-lay text into
line-level boxes (merge-manifest mode, requires --manifest from
extract_editable.py).

QA gates after build: page count must equal the PDF's, and no slide may
contain a full-slide picture (editability requirement).

Usage:
  # plain LibreOffice conversion
  python3.8 beamer2pptx_local.py deck.pdf -o deck.pptx

  # compile .tex first, then convert
  python3.8 beamer2pptx_local.py deck.tex -o deck.pptx --xelatex

  # line-merged text layer from an extraction manifest (python-pptx path)
  python3.8 beamer2pptx_local.py deck.pdf -o deck.pptx \
      --manifest prepared/editable-manifest.json
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

from pptx import Presentation

EMU_PER_PT = 12700
PDFIMPORT_FILTER = "impress_pdf_import"


def fail(msg):
    print("ERROR: {}".format(msg), file=sys.stderr)
    sys.exit(1)


def compile_tex(tex_path, engine):
    runner = "xelatex" if engine == "xelatex" else "pdflatex"
    tex_path = os.path.abspath(tex_path)
    tex_dir = os.path.dirname(tex_path)
    outdir = tempfile.mkdtemp(prefix="b2p-tex-")
    env = dict(os.environ)
    # TEXINPUTS trailing // means "also search this tree recursively";
    # include the tex dir so \input/\includegraphics with relative paths work.
    env["TEXINPUTS"] = tex_dir + os.pathsep + env.get("TEXINPUTS", "") + os.pathsep
    env["BSTINPUTS"] = tex_dir + os.pathsep + env.get("BSTINPUTS", "") + os.pathsep
    for _ in range(2):  # two passes for cross references
        proc = subprocess.run(
            [runner, "-interaction=nonstopmode", "-output-directory", outdir,
             tex_path],
            capture_output=True, text=True, cwd=tex_dir, env=env)
        if proc.returncode != 0:
            fail("{} failed:\n{}".format(runner, proc.stdout[-2000:]))
    pdf = os.path.join(outdir, os.path.splitext(os.path.basename(tex_path))[0] + ".pdf")
    if not os.path.exists(pdf):
        fail("LaTeX did not produce " + pdf)
    return pdf


def convert_with_libreoffice(pdf_path, out_dir):
    if not shutil.which("soffice"):
        fail("soffice not found; install LibreOffice")
    proc = subprocess.run(
        ["soffice", "--headless", "--infilter={}".format(PDFIMPORT_FILTER),
         "--convert-to", "pptx", "--outdir", out_dir, pdf_path],
        capture_output=True, text=True, timeout=600)
    pptx = os.path.join(
        out_dir, os.path.splitext(os.path.basename(pdf_path))[0] + ".pptx")
    if proc.returncode != 0 or not os.path.exists(pptx):
        fail("LibreOffice conversion failed: {} {}".format(
            proc.stdout, proc.stderr))
    return pptx


def pdf_page_count(pdf_path):
    try:
        import fitz
    except ImportError:
        fail("PyMuPDF (fitz) required for QA; pip install pymupdf")
    return len(fitz.open(pdf_path))


def qa_check(pptx_path, expect_slides):
    prs = Presentation(pptx_path)
    slides = len(prs.slides)
    problems = []
    if slides != expect_slides:
        problems.append("slide count {} != PDF pages {}".format(slides, expect_slides))
    sw, sh = prs.slide_width, prs.slide_height
    for i, slide in enumerate(prs.slides, 1):
        for shape in slide.shapes:
            if shape.shape_type == 13:  # PICTURE
                if (shape.width >= sw * 0.98 and shape.height >= sh * 0.98):
                    problems.append(
                        "slide {}: full-slide picture (editability violation)".format(i))
    return slides, problems


def summarize(pptx_path):
    prs = Presentation(pptx_path)
    out = []
    for i, slide in enumerate(prs.slides, 1):
        texts = sum(1 for sh in slide.shapes
                    if sh.has_text_frame and sh.text_frame.text.strip())
        out.append({"slide": i, "shapes": len(slide.shapes), "text_boxes": texts})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("input", help="compiled Beamer PDF (or .tex with --xelatex/--pdflatex)")
    ap.add_argument("-o", "--output", required=True, help="output .pptx path")
    ap.add_argument("--xelatex", action="store_true", help="input is .tex, compile with xelatex")
    ap.add_argument("--pdflatex", action="store_true", help="input is .tex, compile with pdflatex")
    ap.add_argument("--manifest", help="optional beamer2pptx editable-manifest.json; "
                    "rebuilds text layer as merged line boxes via python-pptx")
    ap.add_argument("--builder-path", help="path to build_pptx_py.py for --manifest mode "
                    "(default: bundled copies next to this script or /tmp/b2p)")
    ap.add_argument("--report", help="optional JSON QA report path")
    args = ap.parse_args()

    if args.xelatex or args.pdflatex:
        if not args.input.endswith(".tex"):
            fail("--xelatex/--pdflatex require a .tex input")
        pdf_path = compile_tex(args.input, "xelatex" if args.xelatex else "pdflatex")
    else:
        pdf_path = args.input
        if not os.path.exists(pdf_path):
            fail("input PDF not found: " + pdf_path)

    expect_slides = pdf_page_count(pdf_path)

    if args.manifest:
        here = os.path.dirname(os.path.abspath(__file__))
        candidates = []
        if args.builder_path:
            candidates.append(args.builder_path)
        candidates += [
            os.path.join(here, "build_pptx_py.py"),
            os.path.join(here, "beamer2pptx", "scripts", "build_pptx_py.py"),
        ]
        builder = next((c for c in candidates if os.path.exists(c)), None)
        if builder is None:
            fail("manifest mode needs build_pptx_py.py; pass --builder-path")
        sys.path.insert(0, os.path.dirname(builder))
        from build_pptx_py import build as manifest_build
        manifest_build(args.manifest, args.output, args.report)
    else:
        out_dir = os.path.dirname(os.path.abspath(args.output)) or "."
        os.makedirs(out_dir, exist_ok=True)
        built = convert_with_libreoffice(pdf_path, out_dir)
        if os.path.abspath(built) != os.path.abspath(args.output):
            shutil.move(built, args.output)

    slides, problems = qa_check(args.output, expect_slides)
    report = {
        "input_pdf": os.path.abspath(pdf_path),
        "output_pptx": os.path.abspath(args.output),
        "expected_slides": expect_slides,
        "observed_slides": slides,
        "per_slide": summarize(args.output),
        "problems": problems,
        "qa_pass": not problems,
    }
    if args.report:
        with open(args.report, "w", encoding="utf-8") as fh:
            json.dump(report, fh, indent=2, ensure_ascii=False)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if problems:
        sys.exit(2)


if __name__ == "__main__":
    main()
