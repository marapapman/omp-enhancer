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

// Advisory plan-mode reminder section. delegationAvailable gates the review
// wording the same way buildWorkflowEntryReminder does.
export function buildPlanModeReminderSection({ delegationAvailable = false } = {}) {
  const reviewLine = delegationAvailable
    ? 'proactively dispatch the read-only `plan` Agent in PLAN REVIEW mode on the completed plan file when it is visible, disposition its advisory findings, revise the plan, then write the plan slug to xd://propose. If `plan` is not visible, record that limitation; never fabricate a review.'
    : 'record the concrete permitted fallback for the plan review when native delegation is unavailable or forbidden, then write the plan slug to xd://propose. Never fabricate a review.';
  return [
    'OMP_PLAN_MODE (soft one-shot; host read-only state; selects no workflow/Agent/gate):',
    'HOST CONTRACT: OMP plan mode is active. The working tree is read-only: never create, edit, delete, or rename working-tree files and never run state-changing commands. The deliverable is the canonical plan written to local://<slug>-plan.md (local:// planning artifacts only).',
    'AUTHOR THE PLAN WITH THE STAGED WORKFLOW: plan mode does not skip workflow, Skill, or TODO preparation. Follow DISCOVER -> DECLARE -> LOAD -> COMMIT to choose one Primary and load its method, then write the decision-complete plan file from the loaded steps.',
    `REVIEW THE PLAN BEFORE PROPOSING: ${reviewLine}`,
    'EXIT: leaving plan mode and any implementation happens ONLY through the user\'s approval via xd://propose. This reminder grants no write permission, starts no execution, and creates no gate, router, or completion control.',
  ].join('\n');
}
