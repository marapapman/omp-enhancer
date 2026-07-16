// Explicit opt-in template. One pipeline composes every tool-result rewrite so
// OMP never has to resolve competing hook return values.
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";
import { formatToolResultEvent } from "../lib/deepseek-tool-result-format.js";
import { isOpenCodeDeepSeekV4Model } from "../lib/model-gate.js";
import { redactToolResultContent } from "../lib/redact-secrets.ts";
import { truncateToolResultContent } from "../lib/truncate-output.ts";

export default function (pi: HookAPI): void {
  pi.on("tool_result", async (event, ctx) => {
    if (!isOpenCodeDeepSeekV4Model(ctx.model)) return;

    const formatted = formatToolResultEvent(event);
    let content = formatted?.content ?? event.content;
    let changed = formatted !== undefined;

    const redacted = redactToolResultContent(content);
    if (redacted) {
      content = redacted;
      changed = true;
    }

    const truncated = truncateToolResultContent(content);
    if (truncated) {
      content = truncated;
      changed = true;
    }

    if (!changed) return;
    return {
      content,
      details: event.details,
      isError: event.isError,
    };
  });
}
