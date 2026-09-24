#!/usr/bin/env python3
"""check_drawio_layout.py — .drawio 科学示意图排版硬约束断言套件（可复用）

用法:
  python3 check_drawio_layout.py diagram.drawio --crop-px 852 [--print-width-mm 170]
      [--preview preview.png] [--json report.json]

全部几何从 .drawio XML 派生（节点矩形、边端口、标签盒），无图专属常量。
断言的规则（与 repo visual workflow scopeNotes 同口径）:
  X1  写盘文件 ElementTree 重解析通过（well-formed）；id 无重复
  X2  ';base64' 0 处；image=data:image/png, 计数打印
  F1  frame cell exists and is visible (opacity > 0 and fill or positive-width stroke)
  V1  --preview PNG aspect matches frame geometry within 2%; missing frame skips V1
  R2  标签盒不与任何节点矩形相交（豁免：XML parent 即该节点的容器标题/父属标签），
      也不与任何边段相交（含其自身标注的边）
  R3  同向走廊（水平/垂直分别聚类）间距 ≥ 2×最大字号
  R4  只允许直线（单段）或正交折线；曲线样式 = 失败
  R6  边段不得穿越无关节点矩形（剔除自身 source/target 与背景框）
  R10 f_print_pt = fs × (W_print_mm/25.4×72) / 实际裁剪像素宽 ≥ f_min（全部 fontSize）
  W1  CJK 行宽公式: n_cjk×fs + 0.6×n_ascii×fs + 0.5×n_sep×fs ≤ 盒内宽 − padding
      覆盖文本顶点（inner = w − 2×padding）与含 value 的节点/容器
      （inner = w − spacingLeft(icon gutter) − 2×padding）

兼容 Python 3.6（不使用 str.isascii / 海象运算符）。
Exit code: 0 = 全部通过; 1 = 有 FAIL（逐条打印）。
"""
import argparse, json, math, re, struct, sys
import xml.etree.ElementTree as ET

# ---------------- CJK 宽度公式 ----------------
SEP_CHARS = set(u"·→")
FULLWIDTH = lambda ch: ord(ch) > 0x2E7F  # CJK/全角区粗判：汉字、全角标点

def cjk_w(line, fs):
    nc = sum(1 for ch in line if FULLWIDTH(ch))
    na = sum(1 for ch in line if ord(ch) < 128 and (ch.isalnum() or ch in ' .'))
    ns = sum(1 for ch in line if ch in SEP_CHARS)
    return nc * fs + 0.6 * na * fs + 0.5 * ns * fs

# ---------------- 几何 ----------------
def inters_rect(a, b):
    ax, ay, aw, ah = a; bx, by, bw, bh = b
    return ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah

def rect_inside(inner, outer):
    ix, iy, iw, ih = inner; ox, oy, ow, oh = outer
    return (ix >= ox and iy >= oy and ix + iw <= ox + ow and iy + ih <= oy + oh)

def orient(P, Q, R):
    v = (Q[0]-P[0])*(R[1]-P[1]) - (Q[1]-P[1])*(R[0]-P[0])
    return 0 if abs(v) < 1e-9 else (1 if v > 0 else -1)

def on_seg(P, Q, R):
    return (min(P[0],Q[0]) <= R[0] <= max(P[0],Q[0])
            and min(P[1],Q[1]) <= R[1] <= max(P[1],Q[1]) and orient(P,Q,R) == 0)

def seg_seg(P, Q, R, S):
    o1, o2 = orient(P,Q,R), orient(P,Q,S)
    o3, o4 = orient(R,S,P), orient(R,S,Q)
    if o1 != o2 and o3 != o4: return True
    if o1 == 0 and on_seg(P,Q,R): return True
    if o2 == 0 and on_seg(P,Q,S): return True
    if o3 == 0 and on_seg(R,S,P): return True
    if o4 == 0 and on_seg(R,S,Q): return True
    return False

def seg_in_rect(P, Q, r):
    x, y, w, h = r
    if x <= P[0] <= x+w and y <= P[1] <= y+h: return True
    if x <= Q[0] <= x+w and y <= Q[1] <= y+h: return True
    c = [(x,y),(x+w,y),(x+w,y+h),(x,y+h)]
    return any(seg_seg(P, Q, c[i], c[(i+1) % 4]) for i in range(4))

# ---------------- .drawio 解析 ----------------
def style_dict(cell):
    return dict(kv.split("=", 1) for kv in cell.get("style", "").split(";") if "=" in kv)

def frame_visibility(by_id):
    frame = by_id.get("frame")
    if frame is None:
        return False, "no mxCell with id='frame'"
    style = style_dict(frame)
    fill = style.get("fillColor", "none")
    stroke = style.get("strokeColor", "none")
    try:
        opacity = float(style.get("opacity", "100"))
        stroke_width = float(style.get("strokeWidth", "1"))
    except ValueError:
        return False, "frame opacity/strokeWidth is not numeric"
    visible_fill = fill.lower() != "none"
    visible_stroke = stroke.lower() != "none" and math.isfinite(stroke_width) and stroke_width > 0
    visible = math.isfinite(opacity) and opacity > 0 and (visible_fill or visible_stroke)
    return visible, "frame opacity=%s fillColor=%s strokeColor=%s strokeWidth=%s" % (opacity, fill, stroke, stroke_width)

def parse(path):
    tree = ET.parse(path)          # X1: not well-formed 在此抛出
    root = tree.getroot()
    cells = [c for c in root.iter("mxCell")]
    by_id = {c.get("id"): c for c in cells}
    if len(by_id) != len(cells):
        sys.exit("X1 FAIL: duplicate mxCell ids")
    # verts: id -> (x, y, w, h, parent_id, cell)；父容器相对坐标展开一层
    verts, edges = {}, {}
    for c in cells:
        geo = c.find("mxGeometry")
        if c.get("vertex") == "1" and geo is not None and geo.get("x") is not None:
            parent = c.get("parent")
            x, y = float(geo.get("x")), float(geo.get("y"))
            if parent in verts:      # 一层容器：加上父原点（多层嵌套不展开）
                x += verts[parent][0]; y += verts[parent][1]
            verts[c.get("id")] = (x, y, float(geo.get("width")), float(geo.get("height")), parent, c)
        if c.get("edge") == "1":
            edges[c.get("id")] = c
    return tree, root, verts, edges, by_id

def frame_aspect(by_id):
    frame = by_id.get("frame")
    if frame is None:
        return None
    geo = frame.find("mxGeometry")
    if geo is None:
        raise ValueError("frame mxCell has no mxGeometry")
    try:
        width, height = float(geo.get("width")), float(geo.get("height"))
    except (TypeError, ValueError):
        raise ValueError("frame mxCell geometry needs numeric width and height")
    if not math.isfinite(width) or not math.isfinite(height) or width <= 0 or height <= 0:
        raise ValueError("frame mxCell geometry width and height must be finite and positive")
    return width / height

def png_dimensions(path):
    with open(path, "rb") as preview:
        header = preview.read(24)
    if len(header) < 24:
        raise ValueError("preview is shorter than the 24-byte PNG IHDR header")
    if header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("preview does not have a PNG signature")
    if header[12:16] != b"IHDR":
        raise ValueError("preview PNG does not begin with an IHDR chunk")
    width, height = struct.unpack(">II", header[16:24])
    if width == 0 or height == 0:
        raise ValueError("preview PNG dimensions must be positive")
    return width, height

def absolute_ports(cell, verts, side):
    """exit 分数相对 source 节点，entry 分数相对 target 节点；无固定端口返回 None。"""
    st = style_dict(cell)
    key = "exit" if side == "exit" else "entry"
    fx, fy = st.get(key + "X"), st.get(key + "Y")
    if fx is None or fy is None: return None
    node = cell.get("source" if side == "exit" else "target")
    rect = verts.get(node)
    if rect is None: return None
    return (rect[0] + float(fx)*rect[2], rect[1] + float(fy)*rect[3])

RHOMBUS_PORT_TOL = 1e-5

def rhombus_endpoint_check(cell, verts, by_id, side):
    node_id = cell.get("source" if side == "exit" else "target")
    node = by_id.get(node_id)
    if node is None:
        return None
    node_style = style_dict(node)
    if (node_style.get("shape") != "rhombus"
            and "rhombus" not in node.get("style", "").split(";")):
        return None

    endpoint = "source" if side == "exit" else "target"
    rect_info = verts.get(node_id)
    if rect_info is None:
        return False, "%s rhombus %s has no linked geometry" % (endpoint, node_id)
    edge_style = style_dict(cell)
    x_key, y_key = side + "X", side + "Y"
    if x_key not in edge_style or y_key not in edge_style:
        return False, "%s rhombus %s is missing declared %s/%s" % (
            endpoint, node_id, x_key, y_key)
    try:
        point = absolute_ports(cell, verts, side)
    except (TypeError, ValueError, OverflowError):
        return False, "%s rhombus %s has non-numeric declared %s/%s" % (
            endpoint, node_id, x_key, y_key)
    x, y, width, height = rect_info[:4]
    half_width, half_height = width / 2.0, height / 2.0
    if (not all(math.isfinite(value) for value in (x, y, width, height, half_width, half_height))
            or half_width <= 0 or half_height <= 0):
        return False, "%s rhombus %s has invalid bounds" % (endpoint, node_id)
    normalized = (abs(point[0] - (x + half_width)) / half_width
                  + abs(point[1] - (y + half_height)) / half_height)
    error = abs(normalized - 1.0)
    ok = math.isfinite(normalized) and error <= RHOMBUS_PORT_TOL
    return ok, ("%s rhombus %s declared port=(%.3f,%.3f), normalized perimeter=%.6f "
                "(|sum-1|=%.6g; tolerance=%.1g)"
                % (endpoint, node_id, point[0], point[1], normalized, error,
                   RHOMBUS_PORT_TOL))

def edge_segment(cell, verts):
    P = absolute_ports(cell, verts, "exit")
    Q = absolute_ports(cell, verts, "entry")
    if P is None or Q is None: return None
    if cell.find(".//Array") is not None: return None   # 带 waypoints：非单段
    return P, Q

def strip_html(v):
    v = re.sub(r"<br\s*/?>", "\n", v or "")
    v = re.sub(r"<[^>]+>", "", v)
    v = v.replace("&#xa;", "\n").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    return [l for l in v.split("\n") if l.strip()]

# ---------------- 主检查 ----------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("drawio")
    ap.add_argument("--crop-px", type=float, required=True,
                    help="导出后实测裁剪像素宽（pdfinfo/PNG），非 frame 单位宽")
    ap.add_argument("--preview", help="导出后的 PNG 预览，用于 V1 实测宽高比校验")
    ap.add_argument("--print-width-mm", type=float, default=170.0)
    ap.add_argument("--f-min", type=float, default=8.0)
    ap.add_argument("--width-padding", type=float, default=8.0,
                    help="每侧内边距（u）；总扣减 2×padding。规则要求内宽 ≥ 最长行 + 16u，缺省 8×2=16")
    ap.add_argument("--icon-gutter", type=float, default=40.0,
                    help="含图标节点的 spacingLeft 缺省值（style 显式值优先）")
    args = ap.parse_args()

    fails = []
    def check(rid, ok, msg):
        print("  [%s] %s: %s" % ("PASS" if ok else "FAIL", rid, msg))
        if not ok: fails.append((rid, msg))

    tree, root, verts, edges, by_id = parse(args.drawio)

    frame_ok, frame_detail = frame_visibility(by_id)
    check("F1", frame_ok, frame_detail)

    if args.preview:
        if by_id.get("frame") is None:
            print("  [NOT-APPLICABLE] V1: no mxCell with id='frame'; preview aspect not checked")
        else:
            try:
                expected_aspect = frame_aspect(by_id)
                preview_width, preview_height = png_dimensions(args.preview)
            except (IOError, ValueError, struct.error) as exc:
                check("V1", False, "preview/frame geometry cannot be validated: %s" % exc)
            else:
                actual_aspect = float(preview_width) / preview_height
                relative_difference = abs(actual_aspect - expected_aspect) / expected_aspect
                check("V1", relative_difference <= 0.02,
                      "preview=%dx%d px, actual_aspect=%.6f, expected_frame_aspect=%.6f "
                      "(relative difference %.2f%%; limit 2%%)"
                      % (preview_width, preview_height, actual_aspect, expected_aspect,
                         relative_difference * 100))
    print("== X1 ElementTree 重解析 == OK: %d mxCell" % len(by_id))

    # X2: base64 内联健全性
    raw = open(args.drawio).read()
    n_img = len(re.findall(r"image=data:image/png,", raw))
    check("X2", ";base64" not in raw,
          "';base64' 0 处（image=data:image/png, %d 处）" % n_img)

    # 分类：text 顶点 / 形状节点（含容器）；XML 父子关系记录
    text_verts = {i: r for i, r in verts.items()
                  if r[5].get("style", "").startswith("text;")}
    node_rects = {i: r[:4] for i, r in verts.items()
                  if i not in text_verts and style_dict(r[5]).get("shape") != "image"}
    # A1: 独立 image cell 不得压到无关节点；仅其 XML 父节点与 frame 豁免。
    # R2 只检查文字盒，无法发现 Cycle5 中 field 图标压住 log 子盒的像素重叠。
    image_verts = {i: r for i, r in verts.items() if style_dict(r[5]).get("shape") == "image"}
    for iid, ir in image_verts.items():
        ib = ir[:4]
        for nid, nr in node_rects.items():
            if nid == "frame" or nid == ir[4]:
                continue
            check("A1", not inters_rect(ib, nr), "图标 %s 不与节点 %s 相交" % (iid, nid))
    # Inline image= styles have no separate image-cell geometry. Fail closed if their
    # node contains child nodes, where the rendered bitmap could overlap those children.
    for cid, cr in node_rects.items():
        style = style_dict(verts[cid][5])
        if style.get("container") != "1" or not style.get("image"):
            continue
        child_ids = [child_id for child_id, child_rect in node_rects.items()
                     if child_id != cid and rect_inside(child_rect, cr)]
        for child_id in sorted(child_ids):
            check("A1", False,
                  "内嵌图标 %s_icon（容器 %s）渲染范围未单独界定，可能与子节点 %s 相交"
                  % (cid, cid, child_id))

    # R10: 字号折算（style fontSize + value 内联 font-size）
    f_pt = lambda fs: fs * (args.print_width_mm / 25.4 * 72) / args.crop_px
    for cid, r in verts.items():
        st = style_dict(r[5])
        fs_list = [st["fontSize"]] if st.get("fontSize") else []
        fs_list += re.findall(r"font-size:(\d+(?:\.\d+)?)px", r[5].get("value", "") or "")
        for fs_s in fs_list:
            fs = float(fs_s)
            check("R10", f_pt(fs) >= args.f_min,
                  "%s fs=%su → %.3fpt ≥ %spt (%spx/%smm)" % (cid, fs, f_pt(fs), args.f_min, args.crop_px, args.print_width_mm))

    # R4 + R6: 边形态与穿越
    segs = {}
    for eid, c in edges.items():
        for side in ("exit", "entry"):
            endpoint_result = rhombus_endpoint_check(c, verts, by_id, side)
            if endpoint_result is not None:
                check("R4", endpoint_result[0],
                      "%s %s endpoint: %s" % (
                          eid, "source" if side == "exit" else "target",
                          endpoint_result[1]))
        try:
            seg = edge_segment(c, verts)
        except (TypeError, ValueError, OverflowError):
            check("R4", False, "%s declared edge port fractions are not numeric" % eid)
            continue
        if seg is None:
            st = style_dict(c)
            ok = ("edgeStyle=none" in c.get("style", "")
                  or "orthogonalEdgeStyle" in c.get("style", ""))
            check("R4", ok, "%s 边形态为直线/正交（无曲线）" % eid)
            continue
        segs[eid] = seg
        check("R4", "curved=1" not in c.get("style", ""),
              "%s 单段直线无 curved 标记 (%.1f,%.1f)->(%.1f,%.1f)" % (eid, seg[0][0], seg[0][1], seg[1][0], seg[1][1]))
        src, dst = c.get("source"), c.get("target")
        for nid, nr in node_rects.items():
            if nid in (src, dst, "frame"): continue
            check("R6", not seg_in_rect(seg[0], seg[1], nr), "%s 不穿越 %s" % (eid, nid))

    # R2: 标签盒 vs 节点（豁免：XML parent 即该节点，或完全落在该节点顶部标题带内）
    #     vs 边段（含自身边，无豁免）
    TITLE_BAND_U = 48.0   # 容器标题带高度约定（top strip）
    for lid, r in text_verts.items():
        lb = r[:4]
        parent = r[4]
        for nid, nr in node_rects.items():
            if nid == "frame": continue
            if parent == nid: continue
            in_title_band = (rect_inside(lb, nr)
                             and lb[1] - nr[1] < TITLE_BAND_U)
            if in_title_band: continue
            check("R2", not inters_rect(lb, nr), "标签 %s 不与节点 %s 相交" % (lid, nid))
        for eid, seg in segs.items():
            check("R2", not seg_in_rect(seg[0], seg[1], lb),
                  "标签 %s 不与边 %s 相交（含自身边）" % (lid, eid))

    # R3: 同向走廊间距（水平/垂直分别聚类）。
    # 容差 1e-3：drawio 端口分数常以 6 位小数序列化，×300u 节点宽后端点 dx 可达 ~2e-4；
    # 1e-6 会让 R3 因序列化舍入而空转（泳道聚类失败）。
    LANE_TOL = 1e-3
    hrows, vcols = {}, {}
    for eid, (P, Q) in segs.items():
        if abs(P[1]-Q[1]) < LANE_TOL: hrows.setdefault(round(P[1], 2), []).append(eid)
        elif abs(P[0]-Q[0]) < LANE_TOL: vcols.setdefault(round(P[0], 2), []).append(eid)
    max_fs = max([float(style_dict(r[5])["fontSize"]) for r in verts.values()
                  if style_dict(r[5]).get("fontSize")] or [16])
    r3_ok, r3_detail = True, []
    for lanes in (hrows, vcols):
        keys = sorted(lanes)
        for a, b in zip(keys, keys[1:]):
            if b - a < max_fs * 2:
                r3_ok = False
                r3_detail.append("走廊 %s 与 %s 间距 %.1fu < 2×%s（%s）"
                                 % (a, b, b-a, max_fs, "/".join(lanes[a]+lanes[b])))
    analyzed_lanes = len(hrows) + len(vcols)
    non_axis_aligned = sum(
        1 for P, Q in segs.values()
        if abs(P[1] - Q[1]) >= LANE_TOL and abs(P[0] - Q[0]) >= LANE_TOL)
    r3_counts = ("edges=%d drawable=%d analyzed lanes=%d (horizontal %d / vertical %d) "
                 "non-axis-aligned excluded=%d"
                 % (len(edges), len(segs), analyzed_lanes, len(hrows), len(vcols),
                    non_axis_aligned))
    if analyzed_lanes == 0:
        r3_detail.append("no horizontal/vertical corridors to compare; "
                         "diagonal edges excluded from corridor-spacing analysis")
    check("R3", r3_ok, "%s; %s" %
          (r3_counts, "; ".join(r3_detail) if r3_detail else
           "same-direction corridor spacing ≥ 2×font size"))

    # W1: CJK 宽度 —— 文本顶点 + 含 value 的节点；逐行取各自字号（<font style="font-size:..px"> 优先）
    FS_LINE = re.compile(r'font-size:\s*(\d+(?:\.\d+)?)px')
    def line_fs(line_html, default_fs):
        m = FS_LINE.search(line_html)
        return float(m.group(1)) if m else default_fs
    for cid, r in list(text_verts.items()) + [(i, r) for i, r in verts.items()
                                               if i in node_rects and i != "frame"
                                               and strip_html(r[5].get("value", ""))]:
        st = style_dict(r[5])
        default_fs = float(st.get("fontSize", 16))
        raw_lines = (r[5].get("value", "") or "").replace("&#xa;", "\n").split("\n")
        # 保留原始 HTML 片段以便提取每行的 font-size；<br> 亦是换行
        raw_lines = [seg for seg in re.split(r"<br\s*/?>|&#xa;|\n", r[5].get("value", "") or "")]
        lines = []
        for seg in raw_lines:
            txt = re.sub(r"<[^>]+>", "", seg).replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&#183;", "·")
            if txt.strip():
                lines.append((txt.strip(), line_fs(seg, default_fs)))
        if not lines: continue
        spacing_left = float(st.get("spacingLeft", args.icon_gutter if "image=" in r[5].get("style", "") else 0))
        inner = r[2] - spacing_left - 2 * args.width_padding
        longest, lfs = max(((cjk_w(t, f), f) for t, f in lines), key=lambda p: p[0])
        check("W1", longest <= inner + 1e-6,
              "%s 最长行 %.1fu (fs=%s) ≤ 内宽 %.1fu（扣 spacingLeft %su + padding %su×2，%d 行）"
              % (cid, longest, lfs, inner, spacing_left, args.width_padding, len(lines)))

    print("\n%s" % ("ALL CHECKS PASS" if not fails else "%d FAILURES" % len(fails)))
    sys.exit(1 if fails else 0)

if __name__ == "__main__":
    main()
