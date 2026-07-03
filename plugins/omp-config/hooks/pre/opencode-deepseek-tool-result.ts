import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";
import { formatToolResultEvent } from "../lib/deepseek-tool-result-format.js";

export default function (pi: HookAPI): void {
  pi.on("tool_result", async (event) => {
    return formatToolResultEvent(event);
  });
}
