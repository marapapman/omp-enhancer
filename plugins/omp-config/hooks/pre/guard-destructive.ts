// Advisory safety hook for destructive commands.
// It warns about catastrophic patterns but never changes tool execution.
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";

const PATTERNS: { regex: RegExp; reason: string }[] = [
  // rm -rf /
  { regex: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)\s+(\/|~\/?(\s|$)|\$HOME|\$HOMEDIR)/, reason: "Destructive rm detected" },
  // dd if=/dev/zero or /dev/urandom to a block device
  { regex: /\bdd\s+if=\/dev\/(zero|urandom)\s+of=\/(dev|mnt|run)/, reason: "dd to a block device detected" },
  // mkfs / mkswap on a device
  { regex: /\bmkfs\b/i, reason: "mkfs detected" },
  // chmod -R 000 or 777 on root
  { regex: /\bchmod\s+-R\s+0{3,4}\s+\//, reason: "chmod -R 000 on / detected" },
  // wget/curl pipe to bash as root
  { regex: /\b(curl|wget)\b.*\|.*\b(bash|sh)\s*$/, reason: "pipe-from-web to shell detected" },
];

export default function (pi: HookAPI) {
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "bash") return;
    const cmd = String(event.input.command ?? "");
    for (const p of PATTERNS) {
      if (p.regex.test(cmd)) {
        ctx.ui.notify(
          `${p.reason}. Advisory only: verify the exact target, backups, and host approval before proceeding.`,
          "warning",
        );
        return;
      }
    }
  });
}
