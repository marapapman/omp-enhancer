#!/usr/bin/env python3
"""Standalone deterministic regression smoke suite for A1/R3/R4/R5/C1/C2/S1/F1/V1 layout checks.

Synthetic fixture tests run unconditionally; optional real-artifact tests are gated
behind --golden (currently conformant .drawio with measured crop pixel width),
--cycle5 (negative-control .drawio + preview, crop width noted), and
--cycle7 (negative-control .drawio + cropped preview, crop width noted).
No historical Cycle4 artifact is assumed passing; no CI wiring is asserted.
"""
import argparse
import os
import re
import subprocess
import struct
import sys
import tempfile

CHECKER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "check-drawio-layout.py")


def vertex(cell_id, x, y, width=20, height=16):
    return ('<mxCell id="%s" value="" style="fontSize=16;strokeWidth=3;" vertex="1" parent="1">'
            '<mxGeometry x="%s" y="%s" width="%s" height="%s" as="geometry"/>'
            '</mxCell>') % (cell_id, x, y, width, height)

def rhombus_vertex(cell_id, x, y, width=100, height=100):
    return ('<mxCell id="%s" value="" style="rhombus;whiteSpace=wrap;html=1;fontSize=16;strokeWidth=3;" '
            'vertex="1" parent="1"><mxGeometry x="%s" y="%s" width="%s" height="%s" '
            'as="geometry"/></mxCell>') % (cell_id, x, y, width, height)


def edge(cell_id, source, target, exit_y="0.5", entry_y="0.5", exit_x="1", entry_x="0"):
    style = ("edgeStyle=none;html=1;exitX=%s;exitY=%s;entryX=%s;entryY=%s;"
             % (exit_x, exit_y, entry_x, entry_y))
    return ('<mxCell id="%s" value="" style="%s" edge="1" parent="1" '
            'source="%s" target="%s"><mxGeometry relative="1" as="geometry"/>'
            '</mxCell>') % (cell_id, style, source, target)


def styled_vertex(cell_id, x, y, style, width=20, height=16):
    return ('<mxCell id="%s" value="" style="%s" vertex="1" parent="1">'
            '<mxGeometry x="%s" y="%s" width="%s" height="%s" as="geometry"/>'
            '</mxCell>') % (cell_id, style, x, y, width, height)


def styled_edge(cell_id, source, target, extra_style, exit_y="0.5", entry_y="0.5",
                exit_x="1", entry_x="0"):
    style = ("edgeStyle=none;html=1;%sexitX=%s;exitY=%s;entryX=%s;entryY=%s;"
             % (extra_style, exit_x, exit_y, entry_x, entry_y))
    return ('<mxCell id="%s" value="" style="%s" edge="1" parent="1" '
            'source="%s" target="%s"><mxGeometry relative="1" as="geometry"/>'
            '</mxCell>') % (cell_id, style, source, target)


def diagram(vertices, edges, include_frame=True):
    frame = ('<mxCell id="frame" value="" style="fillColor=#FFFFFF;strokeColor=#000000;" '
             'vertex="1" parent="1"><mxGeometry x="0" y="0" width="848" height="477" '
             'as="geometry"/></mxCell>') if include_frame else ""
    return ('<mxfile><diagram><mxGraphModel><root><mxCell id="0"/>'
            '<mxCell id="1" parent="0"/>%s%s%s</root></mxGraphModel>'
            '</diagram></mxfile>') % (frame, "".join(vertices), "".join(edges))


def run_checker(xml, crop_px="852"):
    with tempfile.TemporaryDirectory(prefix="drawio-r3-") as temp_dir:
        fixture_path = os.path.join(temp_dir, "fixture.drawio")
        with open(fixture_path, "w", encoding="utf-8") as fixture:
            fixture.write(xml)
        return subprocess.run(
            [sys.executable, CHECKER, fixture_path, "--crop-px", crop_px],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            universal_newlines=True)

def run_path_checker(path, crop_px, preview=None):
    command = [sys.executable, CHECKER, path, "--crop-px", str(crop_px)]
    if preview:
        command.extend(["--preview", preview])
    return subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                          universal_newlines=True)


def write_png_header(path, width, height):
    with open(path, "wb") as preview:
        preview.write(b"\x89PNG\r\n\x1a\n")
        preview.write(struct.pack(">I", 13))
        preview.write(b"IHDR")
        preview.write(struct.pack(">II", width, height))


def diagram_with_frame(width, height):
    frame = ('<mxCell id="frame" value="" style="fillColor=#FFFFFF;strokeColor=#000000;" vertex="1" parent="1">'
             '<mxGeometry x="0" y="0" width="%s" height="%s" as="geometry"/>'
             '</mxCell>') % (width, height)
    return diagram([frame], [], False)

def diagram_with_zero_width_stroke_frame():
    frame = ('<mxCell id="frame" value="" '
             'style="fillColor=none;strokeColor=#000000;strokeWidth=0;" '
             'vertex="1" parent="1"><mxGeometry x="0" y="0" width="16" '
             'height="9" as="geometry"/></mxCell>')
    return diagram([frame], [], False)


def run_synthetic_preview(xml, width, height):
    with tempfile.TemporaryDirectory(prefix="drawio-preview-") as temp_dir:
        fixture_path = os.path.join(temp_dir, "fixture.drawio")
        preview_path = os.path.join(temp_dir, "preview.png")
        with open(fixture_path, "w", encoding="utf-8") as fixture:
            fixture.write(xml)
        write_png_header(preview_path, width, height)
        return run_path_checker(fixture_path, 100, preview_path)


def assert_v1_passed(result, label):
    if "[PASS] V1:" not in result.stdout or "[FAIL] V1:" in result.stdout:
        raise AssertionError("%s: expected V1 to pass\n%s" % (label, result.stdout))


def assert_v1_only_failure(result, label):
    fail_lines = [line for line in result.stdout.splitlines() if "[FAIL]" in line]
    if result.returncode != 1:
        raise AssertionError("%s: expected checker exit 1, got %d\n%s"
                             % (label, result.returncode, result.stdout))
    if len(fail_lines) != 1 or "[FAIL] V1:" not in fail_lines[0]:
        raise AssertionError("%s: expected a V1-only failure, got %r\n%s"
                             % (label, fail_lines, result.stdout))

def assert_cycle7_failures(result, label):
    fail_lines = [line for line in result.stdout.splitlines() if "[FAIL]" in line]
    failure_rules = set(match.group(1) for line in fail_lines
                        for match in [re.search(r"\[FAIL\] ([A-Z0-9]+):", line)]
                        if match)
    if result.returncode != 1:
        raise AssertionError("%s: expected checker exit 1, got %d\n%s"
                             % (label, result.returncode, result.stdout))
    if failure_rules != set(["A1", "F1", "V1"]):
        raise AssertionError("%s: expected A1/F1/V1 failures only, got %r\n%s"
                             % (label, sorted(failure_rules), result.stdout))


def assert_frame_preview_passed(result, label):
    if "[PASS] F1:" not in result.stdout:
        raise AssertionError("%s: expected F1 to pass\n%s" % (label, result.stdout))
    assert_v1_passed(result, label)


def assert_r3_only_failure(result, label):
    fail_lines = [line for line in result.stdout.splitlines() if "[FAIL]" in line]
    if result.returncode != 1:
        raise AssertionError("%s: expected checker exit 1, got %d\n%s"
                             % (label, result.returncode, result.stdout))
    if not fail_lines or any("[FAIL] R3:" not in line for line in fail_lines):
        raise AssertionError("%s: expected an R3-only failure, got %r\n%s"
                             % (label, fail_lines, result.stdout))


def check_close_parallel_corridors():
    # Horizontal lanes at y=100 and y=120: 20u apart, below 2 * fontSize (32u).
    vertices = [
        vertex("s1", 20, 92), vertex("t1", 120, 92),
        vertex("s2", 20, 112), vertex("t2", 120, 112),
    ]
    edges = [edge("e1", "s1", "t1"), edge("e2", "s2", "t2")]
    result = run_checker(diagram(vertices, edges))
    assert_r3_only_failure(result, "close parallel corridors")
    if "< 2×" not in result.stdout or "analyzed lanes=2" not in result.stdout:
        raise AssertionError("close parallel corridors: missing spacing/count evidence\n%s"
                             % result.stdout)
    print("PASS: close parallel corridors fail R3 specifically")
    print(result.stdout.rstrip())


def check_diagonal_only_drawable_edge():
    # A drawable diagonal is allowed under R4 and has no corridor spacing to compare.
    vertices = [vertex("s", 20, 20), vertex("t", 120, 80)]
    edges = [edge("diagonal", "s", "t", exit_y="0.5", entry_y="0.5")]
    result = run_checker(diagram(vertices, edges))
    if result.returncode != 0:
        raise AssertionError("diagonal-only fixture expected exit 0, got %d\n%s"
                             % (result.returncode, result.stdout))
    expected = "analyzed lanes=0 (horizontal 0 / vertical 0)"
    if "[PASS] R3:" not in result.stdout or "[FAIL] R3:" in result.stdout:
        raise AssertionError("diagonal-only fixture expected R3 to pass\n%s"
                             % result.stdout)
    if (expected not in result.stdout or "non-axis-aligned excluded=1" not in result.stdout
            or "no horizontal/vertical corridors to compare" not in result.stdout
            or "diagonal edges excluded" not in result.stdout):
        raise AssertionError("diagonal-only fixture: missing no-corridor/exclusion evidence\n%s"
                             % result.stdout)
    print("PASS: diagonal-only drawable edge passes R3 with no corridors to compare")
    print(result.stdout.rstrip())


def check_rhombus_perimeter_ports():
    # Both endpoints are exact lower-right perimeter ports: |dx/rx| + |dy/ry| = 1.
    vertices = [
        rhombus_vertex("source-diamond", 20, 20),
        rhombus_vertex("target-diamond", 220, 20),
    ]
    edges = [edge("lower-side", "source-diamond", "target-diamond",
                  exit_x="0.7", exit_y="0.8", entry_x="0.7", entry_y="0.8")]
    result = run_checker(diagram(vertices, edges))
    if result.returncode != 0 or "[FAIL] R4:" in result.stdout:
        raise AssertionError("exact lower-side rhombus ports expected to pass R4\n%s"
                             % result.stdout)
    for endpoint in (
            "lower-side source endpoint: source rhombus source-diamond",
            "lower-side target endpoint: target rhombus target-diamond"):
        if "[PASS] R4: %s" % endpoint not in result.stdout:
            raise AssertionError("missing rhombus endpoint PASS evidence for %s\n%s"
                                 % (endpoint, result.stdout))
    if "normalized perimeter=1.000000" not in result.stdout:
        raise AssertionError("exact perimeter evidence missing\n%s" % result.stdout)
    print("PASS: exact lower-side rhombus ports pass R4")
    print(result.stdout.rstrip())


def check_rhombus_interior_bbox_port():
    # This horizontal edge ends at the diamond's right bounding-box port, inside its sloped side.
    vertices = [vertex("source", 220, 92, 40, 16),
                rhombus_vertex("diamond", 20, 20)]
    edges = [edge("interior-bbox", "source", "diamond",
                  exit_x="1", exit_y="0.5", entry_x="1", entry_y="0.8")]
    result = run_checker(diagram(vertices, edges))
    fail_lines = [line for line in result.stdout.splitlines() if "[FAIL]" in line]
    if result.returncode != 1 or len(fail_lines) != 1 or "[FAIL] R4:" not in fail_lines[0]:
        raise AssertionError("interior rhombus bounding-box port expected to fail R4 only\n%s"
                             % result.stdout)
    if ("interior-bbox target endpoint: target rhombus diamond" not in fail_lines[0]
            or "normalized perimeter=1.600000" not in fail_lines[0]):
        raise AssertionError("R4 failure lacks rhombus interior-port diagnostic\n%s"
                             % result.stdout)
    if "[PASS] R4: interior-bbox 单段直线无 curved 标记" not in result.stdout:
        raise AssertionError("ordinary single-segment R4 evidence was not retained\n%s"
                             % result.stdout)
    print("PASS: interior rhombus bounding-box port fails R4")
    print(result.stdout.rstrip())


def check_rhombus_nonnumeric_port_fails_cleanly():
    vertices = [vertex("source", 220, 92, 40, 16),
                rhombus_vertex("diamond", 20, 20)]
    edges = [edge("nonnumeric-port", "source", "diamond",
                  exit_x="1", exit_y="0.5", entry_x="not-a-number", entry_y="0.8")]
    result = run_checker(diagram(vertices, edges))
    if result.returncode != 1 or "Traceback" in result.stdout:
        raise AssertionError("nonnumeric rhombus port expected a clean R4 failure\n%s"
                             % result.stdout)
    expected = ("[FAIL] R4: nonnumeric-port target endpoint: target rhombus diamond "
                "has non-numeric declared entryX/entryY")
    if expected not in result.stdout:
        raise AssertionError("nonnumeric rhombus failure lacks endpoint diagnostic\n%s"
                             % result.stdout)
    print("PASS: nonnumeric rhombus port fails R4 without traceback")
    print(result.stdout.rstrip())


def image_vertex(cell_id, x, y, width=20, height=16, parent="1"):
    return ('<mxCell id="%s" value="" style="shape=image;image=icon.png;" '
            'vertex="1" parent="%s"><mxGeometry x="%s" y="%s" width="%s" '
            'height="%s" as="geometry"/></mxCell>') % (
                cell_id, parent, x, y, width, height)


def check_a1_image_intersections():
    unrelated = vertex("unrelated", 30, 30, 100, 100)
    contained_icon = image_vertex("icon", 50, 50)
    result = run_checker(diagram([unrelated, contained_icon], []))
    fail_lines = [line for line in result.stdout.splitlines() if "[FAIL]" in line]
    if (result.returncode != 1 or len(fail_lines) != 1
            or "[FAIL] A1:" not in fail_lines[0]
            or "icon" not in fail_lines[0] or "unrelated" not in fail_lines[0]):
        raise AssertionError("unrelated containing node must trigger A1, got %r\n%s"
                             % (fail_lines, result.stdout))

    owner = vertex("owner", 30, 30, 100, 100)
    separate = vertex("separate", 200, 200, 100, 100)
    owned_icon = image_vertex("owned_icon", 50, 50, parent="owner")
    result = run_checker(diagram([owner, separate, owned_icon], []))
    if (result.returncode != 0 or "[FAIL] A1:" in result.stdout
            or "[PASS] A1: 图标 owned_icon 不与节点 separate 相交" not in result.stdout):
        raise AssertionError("owned icon must skip parent and remain clear of other nodes\n%s"
                             % result.stdout)
    print("PASS: A1 rejects unrelated containing nodes and exempts the XML parent")
    print(result.stdout.rstrip())


def check_r5_arrow_geometry():
    vertices = [vertex("s", 20, 40), vertex("t", 140, 40)]
    result = run_checker(diagram(vertices, [
        styled_edge("ok", "s", "t", "endArrow=block;endFill=1;endSize=6;")]))
    if result.returncode != 0 or "[PASS] R5: ok" not in result.stdout:
        raise AssertionError("R5 expected pass for a small head on a long run\n%s"
                             % result.stdout)
    print("PASS: R5 accepts endSize=6 on a long run")
    print(result.stdout.rstrip())

    result = run_checker(diagram(vertices, [
        styled_edge("big", "s", "t", "endArrow=block;endFill=1;endSize=9;")]))
    if (result.returncode != 1 or "[FAIL] R5: big" not in result.stdout
            or "endSize=9" not in result.stdout):
        raise AssertionError("R5 expected an oversized-head failure\n%s" % result.stdout)
    print("PASS: R5 rejects endSize above the cap")
    print(result.stdout.rstrip())

    close = [vertex("s", 20, 40), vertex("t", 52, 40)]
    result = run_checker(diagram(close, [
        styled_edge("stub", "s", "t", "endArrow=block;endFill=1;endSize=5;")]))
    if (result.returncode != 1 or "[FAIL] R5: stub" not in result.stdout
            or "末段 run=" not in result.stdout):
        raise AssertionError("R5 expected a short-run failure\n%s" % result.stdout)
    print("PASS: R5 rejects a run below the floor")
    print(result.stdout.rstrip())

    bare_edge = ('<mxCell id="na" value="" style="edgeStyle=none;html=1;'
                 'endArrow=block;endFill=1;" edge="1" parent="1" source="s" '
                 'target="t"><mxGeometry relative="1" as="geometry"/></mxCell>')
    result = run_checker(diagram(vertices, [bare_edge]))
    if result.returncode != 0 or "[NOT-APPLICABLE] R5: na" not in result.stdout:
        raise AssertionError("R5 expected NOT-APPLICABLE without declared ports\n%s"
                             % result.stdout)
    print("PASS: R5 reports NOT-APPLICABLE without declared ports")

    # Auto-routed orthogonal edge without waypoints: the rendered last leg is the
    # entry-side axis leg (|dx|), not the Euclidean distance.
    orth_edge = ('<mxCell id="orth" value="" style="edgeStyle=orthogonalEdgeStyle;html=1;'
                 'endArrow=block;endFill=1;endSize=5;exitX=1;exitY=0.5;entryX=0;entryY=0.5;" '
                 'edge="1" parent="1" source="s" target="t">'
                 '<mxGeometry relative="1" as="geometry"/></mxCell>')
    tall = [vertex("s", 20, 40), vertex("t", 52, 140)]
    result = run_checker(diagram(tall, [orth_edge]))
    if (result.returncode != 1 or "[FAIL] R5: orth" not in result.stdout
            or "末段 run=12.0u" not in result.stdout
            or "正交入口轴向水平腿" not in result.stdout):
        raise AssertionError("R5 expected the orthogonal entry-axis leg to fail\n%s"
                             % result.stdout)
    print("PASS: R5 estimates orthogonal entry-axis legs")
    print(result.stdout.rstrip())


def check_c1_fill_palette():
    accent = styled_vertex("accent", 30, 30, "fillColor=#1668B5;strokeColor=#000000;fontSize=16;")
    result = run_checker(diagram([accent], []))
    if result.returncode != 0 or "[PASS] C1: accent" not in result.stdout:
        raise AssertionError("C1 expected a palette accent fill to pass\n%s" % result.stdout)
    print("PASS: C1 accepts palette accent fills")
    print(result.stdout.rstrip())

    gray = styled_vertex("wash", 30, 30, "fillColor=#F5F5F5;strokeColor=#000000;fontSize=16;")
    result = run_checker(diagram([gray], []))
    fail_lines = [line for line in result.stdout.splitlines() if "[FAIL]" in line]
    if (result.returncode != 1 or len(fail_lines) != 1 or "[FAIL] C1: wash" not in fail_lines[0]
            or "灰底" not in fail_lines[0]):
        raise AssertionError("C1 expected a gray fill to fail alone, got %r\n%s"
                             % (fail_lines, result.stdout))
    print("PASS: C1 rejects gray fills")
    print(result.stdout.rstrip())

    off = styled_vertex("off", 30, 30, "fillColor=#00FF00;strokeColor=#000000;fontSize=16;")
    result = run_checker(diagram([off], []))
    if result.returncode != 1 or "[FAIL] C1: off" not in result.stdout:
        raise AssertionError("C1 expected an off-palette hue to fail\n%s" % result.stdout)
    print("PASS: C1 rejects off-palette hues")
    print(result.stdout.rstrip())

    grad = styled_vertex("grad", 30, 30,
                         "fillColor=#FFFFFF;gradientColor=#D5171A;strokeColor=#000000;fontSize=16;")
    result = run_checker(diagram([grad], []))
    if result.returncode != 1 or "[FAIL] C1: grad" not in result.stdout:
        raise AssertionError("C1 expected a gradient fill to fail\n%s" % result.stdout)
    print("PASS: C1 rejects gradient fills")
    print(result.stdout.rstrip())

    named = [
        styled_vertex("named-white", 30, 30, "fillColor=white;strokeColor=black;strokeWidth=3;fontSize=16;"),
        styled_vertex("short-hex", 80, 30, "fillColor=#fff;strokeColor=#000;strokeWidth=3;fontSize=16;"),
        styled_vertex("named-black", 130, 30, "fillColor=black;strokeColor=white;fontSize=16;"),
    ]
    result = run_checker(diagram(named, []))
    if result.returncode != 0 or "[FAIL] C1:" in result.stdout:
        raise AssertionError("C1 expected white/black names and short hex to pass\n%s"
                             % result.stdout)
    print("PASS: C1 accepts white/black names and short hex")
    print(result.stdout.rstrip())


def check_c2_ink_palette():
    inked = [
        styled_vertex("gray-ink", 30, 30, "fillColor=none;strokeColor=#6B6B6B;fontColor=#000000;fontSize=16;"),
        styled_vertex("teal-ink", 80, 30, "fillColor=none;strokeColor=#037870;fontColor=#D5171A;fontSize=16;"),
    ]
    result = run_checker(diagram(inked, []))
    if result.returncode != 0 or "[FAIL] C2:" in result.stdout:
        raise AssertionError("C2 expected gray-scale and palette ink to pass\n%s" % result.stdout)
    print("PASS: C2 accepts gray-scale and palette strokes/fonts")

    tinted = styled_vertex("tinted", 30, 30, "fillColor=none;strokeColor=#AEB8BD;strokeWidth=3;fontSize=16;")
    result = run_checker(diagram([tinted], []))
    fail_lines = [line for line in result.stdout.splitlines() if "[FAIL]" in line]
    if result.returncode != 1 or len(fail_lines) != 1 or "[FAIL] C2: tinted" not in fail_lines[0]:
        raise AssertionError("C2 expected a tinted gray stroke to fail alone, got %r\n%s"
                             % (fail_lines, result.stdout))
    print("PASS: C2 rejects tinted gray strokes")

    vertices = [vertex("s", 20, 40), vertex("t", 140, 40)]
    neon = styled_edge("neon", "s", "t", "strokeColor=#FF0000;endArrow=block;endSize=6;")
    result = run_checker(diagram(vertices, [neon]))
    if result.returncode != 1 or "[FAIL] C2: neon" not in result.stdout:
        raise AssertionError("C2 expected an off-palette edge stroke to fail\n%s" % result.stdout)
    print("PASS: C2 rejects off-palette edge strokes")


def check_s1_outline_weight():
    thin = styled_vertex("thin", 30, 30, "fillColor=#FFFFFF;strokeColor=#000000;strokeWidth=1.5;fontSize=16;")
    implicit = styled_vertex("implicit", 80, 30, "rounded=1;fontSize=16;")
    result = run_checker(diagram([thin, implicit], []))
    fail_lines = [line for line in result.stdout.splitlines() if "[FAIL]" in line]
    if (result.returncode != 1 or len(fail_lines) != 2
            or not any("[FAIL] S1: thin" in line for line in fail_lines)
            or not any("[FAIL] S1: implicit" in line for line in fail_lines)):
        raise AssertionError("S1 expected thin and default-width outlines to fail, got %r\n%s"
                             % (fail_lines, result.stdout))
    print("PASS: S1 rejects thin and default-width black outlines")

    exempt = [
        styled_vertex("chip", 30, 30, "fillColor=#E08A1E;strokeColor=#000000;fontSize=16;"),
        styled_vertex("group", 80, 30, "fillColor=none;strokeColor=#808080;dashed=1;fontSize=16;"),
        styled_vertex("label", 130, 30, "text;fontSize=16;"),
        styled_vertex("card", 180, 30, "fillColor=none;strokeColor=#000000;strokeWidth=3;fontSize=16;"),
    ]
    result = run_checker(diagram(exempt, []))
    if result.returncode != 0 or "[FAIL] S1:" in result.stdout or "[PASS] S1: card" not in result.stdout:
        raise AssertionError("S1 expected chips, gray groups, text, and thick cards to pass\n%s"
                             % result.stdout)
    print("PASS: S1 exempts palette chips, gray groups, and text; accepts 3-unit cards")

def check_golden(path, crop_px):
    result = run_path_checker(path, crop_px)
    if result.returncode != 0:
        raise AssertionError("golden artifact checker run failed with exit %d\n%s"
                             % (result.returncode, result.stdout))
    if not re.search(r"\[PASS\] R3:.*analyzed lanes=[1-9]\d*", result.stdout):
        raise AssertionError("golden artifact run did not report nonzero analyzed lanes\n%s"
                             % result.stdout)
    if "[PASS] A1:" not in result.stdout or "[FAIL] A1:" in result.stdout:
        raise AssertionError("golden artifact did not pass A1\n%s" % result.stdout)
    print("PASS: golden artifact invocation (R3 analyzed nonzero lanes)")
    print(result.stdout.rstrip())


def check_cycle5(path, crop_px):
    result = run_path_checker(path, crop_px)
    if result.returncode != 1:
        raise AssertionError("Cycle5 negative control expected exit 1, got %d\n%s"
                             % (result.returncode, result.stdout))
    failure_lines = [line for line in result.stdout.splitlines() if "[FAIL]" in line]
    a1_failures = [line for line in failure_lines if "[FAIL] A1:" in line]
    if not a1_failures or len(a1_failures) != len(failure_lines):
        raise AssertionError("Cycle5 negative control must fail A1 specifically, got %r\n%s"
                             % (failure_lines, result.stdout))
    if not any("field_icon" in line and "log" in line for line in a1_failures):
        raise AssertionError("Cycle5 negative control did not report A1 field_icon/log collision\n%s"
                             % result.stdout)
    print("PASS: Cycle5 fails A1 for inline field_icon/log overlap")
    print(result.stdout.rstrip())

def check_golden_preview(path, crop_px, preview):
    result = run_path_checker(path, crop_px, preview)
    if result.returncode != 0:
        raise AssertionError("golden preview run failed with exit %d\n%s"
                             % (result.returncode, result.stdout))
    assert_frame_preview_passed(result, "golden preview")
    print("PASS: golden preview passes F1 and V1")


def check_cycle5_preview(path, crop_px, preview):
    result = run_path_checker(path, crop_px, preview)
    failure_lines = [line for line in result.stdout.splitlines() if "[FAIL]" in line]
    if result.returncode != 1 or not failure_lines:
        raise AssertionError("Cycle5 preview run must retain its A1 failure\n%s" % result.stdout)
    if any("[FAIL] A1:" not in line for line in failure_lines):
        raise AssertionError("Cycle5 preview run must fail A1 only, got %r\n%s"
                             % (failure_lines, result.stdout))
    assert_frame_preview_passed(result, "Cycle5 preview")
    print("PASS: Cycle5 preview passes F1 and V1")


def check_cycle7(path, preview):
    result = run_path_checker(path, 127, preview)
    assert_cycle7_failures(result, "Cycle7 cropped preview")
    if "preview=127x93 px" not in result.stdout:
        raise AssertionError("Cycle7 V1 failure did not report actual 127x93 preview dimensions\n%s"
                             % result.stdout)
    if "expected_frame_aspect=1.777778" not in result.stdout:
        raise AssertionError("Cycle7 V1 failure did not report the expected 16:9 frame ratio\n%s"
                             % result.stdout)
    if "fillColor=none strokeColor=none" not in result.stdout:
        raise AssertionError("Cycle7 F1 failure did not report its invisible frame style\n%s"
                             % result.stdout)
    print("PASS: Cycle7 cropped preview fails A1, F1, and V1")


def check_synthetic_preview_mismatch():
    result = run_synthetic_preview(diagram_with_frame(16, 9), 100, 100)
    assert_v1_only_failure(result, "synthetic square preview")
    if "preview=100x100 px" not in result.stdout:
        raise AssertionError("synthetic V1 failure did not report preview dimensions\n%s"
                             % result.stdout)
    print("PASS: synthetic square preview fails V1 against 16:9 frame")


def check_preview_without_frame():
    result = run_synthetic_preview(diagram([], [], False), 100, 100)
    fail_lines = [line for line in result.stdout.splitlines() if "[FAIL]" in line]
    if (result.returncode != 1 or len(fail_lines) != 1
            or "[FAIL] F1:" not in fail_lines[0]
            or "[NOT-APPLICABLE] V1:" not in result.stdout):
        raise AssertionError("missing frame must fail F1 and report V1 NOT-APPLICABLE\n%s"
                             % result.stdout)
    print("PASS: missing frame fails F1 while V1 is NOT-APPLICABLE")

def check_zero_width_frame_stroke():
    result = run_synthetic_preview(diagram_with_zero_width_stroke_frame(), 1600, 900)
    fail_lines = [line for line in result.stdout.splitlines() if "[FAIL]" in line]
    if (result.returncode != 1 or len(fail_lines) != 1
            or "[FAIL] F1:" not in fail_lines[0]
            or "[PASS] V1:" not in result.stdout):
        raise AssertionError("zero-width frame stroke must fail only F1\n%s"
                             % result.stdout)
    if "strokeWidth=0.0" not in result.stdout:
        raise AssertionError("F1 failure did not report zero stroke width\n%s"
                             % result.stdout)
    print("PASS: zero-width frame stroke fails F1 while matching V1")



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--golden", help="optional known-good Cycle4 .drawio file")
    parser.add_argument("--golden-crop-px", default="852",
                        help="measured crop width for --golden (default: 852)")
    parser.add_argument("--cycle5", help="optional Cycle5 negative-control .drawio file")
    parser.add_argument("--cycle5-crop-px", default="1156",
                        help="measured crop width for --cycle5 (default: 1156)")
    parser.add_argument("--golden-preview", help="Cycle4 PNG preview for V1 ratio validation")
    parser.add_argument("--cycle5-preview", help="Cycle5 PNG preview for V1 ratio validation")
    parser.add_argument("--cycle7", help="Cycle7 negative-control .drawio file")
    parser.add_argument("--cycle7-preview", help="cropped Cycle7 PNG preview; expected V1 failure")
    args = parser.parse_args()

    if args.golden_preview and not args.golden:
        parser.error("--golden-preview requires --golden")
    if args.cycle5_preview and not args.cycle5:
        parser.error("--cycle5-preview requires --cycle5")
    if bool(args.cycle7) != bool(args.cycle7_preview):
        parser.error("--cycle7 and --cycle7-preview must be supplied together")

    check_close_parallel_corridors()
    check_diagonal_only_drawable_edge()
    check_rhombus_perimeter_ports()
    check_rhombus_interior_bbox_port()
    check_rhombus_nonnumeric_port_fails_cleanly()
    check_a1_image_intersections()
    check_r5_arrow_geometry()
    check_c1_fill_palette()
    check_c2_ink_palette()
    check_s1_outline_weight()
    check_synthetic_preview_mismatch()
    check_preview_without_frame()
    check_zero_width_frame_stroke()
    if args.cycle5:
        check_cycle5(args.cycle5, args.cycle5_crop_px)
        if args.cycle5_preview:
            check_cycle5_preview(args.cycle5, args.cycle5_crop_px, args.cycle5_preview)
    if args.golden:
        check_golden(args.golden, args.golden_crop_px)
        if args.golden_preview:
            check_golden_preview(args.golden, args.golden_crop_px, args.golden_preview)
    if args.cycle7:
        check_cycle7(args.cycle7, args.cycle7_preview)
    print("Checker negative controls passed")


if __name__ == "__main__":
    main()
