import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

const reminded = new Set<string>();

export default function (pi: HookAPI): void {
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "write" && event.toolName !== "edit") return;

    const input = event.input as any;
    const path = input?.path;
    if (typeof path !== "string" || !path.endsWith(".tex")) return;

    const content = event.toolName === "write" ? input?.content : input?.input;
    if (typeof content !== "string") return;
    if (!/\\documentclass[^{]*\{beamer\}/.test(content) && !/\\begin\{frame\}/.test(content)) return;
    if (reminded.has(path) || reminded.size >= 8) return;

    reminded.add(path);
    ctx.ui.notify(
      `检测到 Beamer slides 制作（${path}）。工作流检查点提醒（warn-only，不会阻止本次调用）：
0. 内容阶段：新建 deck 时，先和用户逐页沟通，在 Markdown 内容计划文件（*.md）中记录每页内容，本次初始生成范围内 Markdown 是唯一内容源，未确认前不要写入或修改 Beamer .tex；对既有 Beamer 的独立修改不重新触发逐页内容确认与基础版式确认访谈，仍按下方 reference 的单项通路执行；
1. 用户确认 Markdown 后，由本轮机械任务从该文件生成 Beamer 帧再开始排版。后续修改按目标对象走单项通路：storyline-only 只动 Markdown，不触 .tex/PDF/PPTX，也不自动从 storyline 重新生成或重建任何 deck；Beamer-only 只动 Beamer，不回写 Markdown，仅在必要时改必要目标依赖并编译/重渲染当前 deck，但不动 Markdown 且不自动从 Beamer 转 PPTX；PPTX-only 只动既有 PPTX，不动 .tex/源 PDF/源 Markdown，也不由既有 Beamer 重新转换 PPTX 以覆盖 PPTX 端就地修改；任何内容或排版发现在当前目标对象上就地修复，不回写 Markdown、也不反向回填 source；只有用户明确要求从 storyline 重生成新 deck，或明确要求从既有 Beamer 转 PPTX 时才执行一次单向通路；任何隐式 source-to-deck 都不成立；slides-storyline 与 latex-beamer-slides 的完整顺序见下方 reference；
2. 首轮完整渲染后：仅在新建 deck/本次初始生成范围内，latex-beamer-slides 才要求用户确认基础版式方向再进入版式精修；既有 Beamer 项目的独立修改不重新触发基础版式确认访谈，仍按下方 reference 与本条中第 0 条给出的单项通路执行；
3. 角色链：task 编译/渲染、版式处理并绑定同一 revision 证据 → 单一只读 owner（Main，或未产出该 revision 的 task）复核并给出 advisory findings。
完整步骤顺序见 skill://omp-enhancer-workflows/references/writing.md。`,
      "warning",
    );
  });
}
