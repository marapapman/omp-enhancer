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
0. 内容阶段：先和用户逐页沟通，在 Markdown 内容计划文件（*.md）中记录每页内容；Markdown 是唯一内容源，未确认前不要写入或修改 Beamer .tex；
1. 用户确认 Markdown 内容后，才从该文件翻译并生成 Beamer 帧，再开始排版；排版阶段不直接改正文，内容变更先回到 Markdown；slides-storyline 与 latex-beamer-slides 的完整顺序见下方 reference；
2. 首轮完整渲染后：latex-beamer-slides 要求用户确认基础版式方向再进入版式精修；
3. 角色链：task 编译/渲染并绑定同一 revision 证据 → designer 版式处理 → visioner 独立复核（APPROVED | CHANGES_REQUIRED | UNREVIEWABLE）。
完整步骤顺序见 skill://omp-enhancer-workflows/references/writing.md。`,
      "warning",
    );
  });
}
