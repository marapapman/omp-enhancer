// Stable host-injected prose markers observed in the OMP plan-mode <critical> block.
// Both must appear in the combined prompt + messages text for detection.
export const PLAN_MODE_MARKERS = Object.freeze([
  'Plan mode is active',
  'xd://propose',
]);

// High-precision detection: BOTH host markers must appear in the combined text
// (prompt + message contents). Mirrors matchesOfficialAutolearnProtocol's
// every-marker conjunction so a user merely discussing plan mode never matches.
export function detectPlanMode({ prompt = '', messages = [] } = {}) {
  const parts = [String(prompt)];
  for (const entry of messages) {
    if (entry && typeof entry === 'object') {
      const content = entry.content;
      if (typeof content === 'string') {
        parts.push(content);
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block.text === 'string') parts.push(block.text);
        }
      }
    }
  }
  const haystack = parts.join('\n');
  return PLAN_MODE_MARKERS.every((m) => haystack.includes(m));
}

// Secondary signal: the user typed the /plan slash command.
// Matches /plan, /plan:foo, /plan optimize x; does NOT match /plan-like.
const PLAN_SLASH_RE = /^\/plan(?::[A-Za-z0-9_-]+)?(?:\s|$)/i;

export function isPlanSlashCommand(prompt = '') {
  return PLAN_SLASH_RE.test(String(prompt).trim());
}

// Strip a leading /plan (or /plan:suffix) command token + following whitespace,
// returning the bare user request for task description / continuation checks.
// Returns the original string unchanged when no leading /plan token is present.
export function stripPlanCommand(prompt = '') {
  const text = String(prompt).trim();
  const match = text.match(PLAN_SLASH_RE);
  if (!match) return text;
  return text.slice(match[0].length).trim();
}

// Advisory plan-mode reminder section.
export function buildPlanModeReminderSection() {
  return [
    'OMP_PLAN_MODE (soft advisory):',
    'Plan mode is active. The working tree is read-only. The deliverable is the plan written to local://<slug>-plan.md.',
    'Use ANALYZE -> EXECUTE -> REVIEW: analyze the task, write the plan, review it before proposing.',
    'Exit happens only through user approval via xd://propose.',
  ].join('\n');
}
