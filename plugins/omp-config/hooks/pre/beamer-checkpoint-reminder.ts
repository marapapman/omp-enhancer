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
1. 视觉制作前：slides-storyline 要求先产出逐页文字稿并获得用户确认；
2. 首轮完整渲染后：latex-beamer-slides 要求用户确认基础版式方向再进入版式精修；
3. 角色链：task 编译/渲染并绑定同一 revision 证据 → designer 版式处理 → visioner 独立复核（APPROVED | CHANGES_REQUIRED | UNREVIEWABLE）。
完整步骤顺序见 skill://omp-enhancer-workflows/references/writing.md。`,
      "warning",
    );
  });
}
