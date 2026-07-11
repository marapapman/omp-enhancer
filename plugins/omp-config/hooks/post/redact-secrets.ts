import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

export const name = "redact-secrets";
export const event = "tool_result";

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /(?:ghp|gho|ghu|ghs)_[a-zA-Z0-9]{36,}/g,
  /api[_-]?key['"]?\s*[:=]\s*['"][a-zA-Z0-9_\-]{16,}['"]/gi,
  /(?:eyJ|R0VU)[a-zA-Z0-9_\-]{10,}(?:\.(?:[a-zA-Z0-9_\-]{10,})){1,}/g,
];

function redactText(value: string): string {
  let redacted = value;
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, "[REDACTED]");
  }
  return redacted;
}

export function redactToolResultContent(content: any[] = []) {
  let changed = false;
  const redacted = content.map((block) => {
    if (block?.type !== "text" || typeof block.text !== "string") return block;
    const text = redactText(block.text);
    if (text === block.text) return block;
    changed = true;
    return { ...block, text };
  });
  return changed ? redacted : null;
}

export function execute(toolResult: any) {
  if (typeof toolResult?.result !== "string") return;
  toolResult.result = redactText(toolResult.result);
}

export default function (pi: HookAPI): void {
  pi.on("tool_result", (toolResult) => {
    const content = redactToolResultContent(toolResult.content);
    return content ? { content } : undefined;
  });
}
