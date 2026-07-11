import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

export const name = "truncate-output";
export const event = "tool_result";
export const MAX_LENGTH = 50000;

const TRUNCATION_MARKER = `\n\n[... truncated to ${MAX_LENGTH} chars]`;

export function truncateToolResultContent(content: any[] = []) {
  const totalLength = content.reduce((total, block) => (
    total + (block?.type === "text" && typeof block.text === "string" ? block.text.length : 0)
  ), 0);
  if (totalLength <= MAX_LENGTH) return null;

  let remaining = MAX_LENGTH;
  let markerAdded = false;
  const truncated = [];
  for (const block of content) {
    if (block?.type !== "text" || typeof block.text !== "string") {
      truncated.push(block);
      continue;
    }
    if (remaining > 0) {
      const text = block.text.slice(0, remaining);
      remaining -= text.length;
      const overflowed = text.length < block.text.length;
      truncated.push({
        ...block,
        text: overflowed ? `${text}${TRUNCATION_MARKER}` : text,
      });
      if (overflowed) markerAdded = true;
      continue;
    }
    if (!markerAdded) {
      truncated.push({ ...block, text: TRUNCATION_MARKER });
      markerAdded = true;
    }
  }
  return truncated;
}

export function execute(toolResult: any) {
  if (typeof toolResult?.result !== "string") return;
  if (toolResult.result.length > MAX_LENGTH) {
    toolResult.result = toolResult.result.slice(0, MAX_LENGTH) +
      TRUNCATION_MARKER;
  }
}

export default function (pi: HookAPI): void {
  pi.on("tool_result", (toolResult) => {
    const content = truncateToolResultContent(toolResult.content);
    return content ? { content } : undefined;
  });
}
