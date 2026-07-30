const TOOL_CALL_PRIMING_SECTION = [
  'TOOL_CALL_PRIMING (soft, model-adaptive):',
  'Reasoning or planning prose alone never completes a step — only a real tool call does. Match every stated intent with an actual tool invocation in the same turn, using your normal function/tool-calling format. Do not describe the call in prose and stop; issue it.',
  'When the next step is small and concrete, pick the smallest viable tool call and emit it now instead of elaborating further. Prefer one real `read`, `bash`, `edit`, or `task` call over another round of narration.',
  'If a declared workflow step requires reading a Skill or catalog URI, issue that `read` call in the current turn rather than restating the plan. If a tool result is empty, partial, or suspicious, retry with different arguments or a different tool instead of restating the situation.',
  'Advisory only; this never blocks, routes, retries, or completes work, and it selects no workflow, Skill, Agent, or fork width. OMP owns tools, permissions, delegation, and completion.',
].join('\n');

const TOOL_CALL_REPRIME_SECTION = [
  'TOOL_ERROR_RECOVERY (soft, model-adaptive):',
  'Your last tool call failed. Read the error message carefully — it names the parameter field, the value you sent, the expected format, and a corrected example. Fix that one field and re-issue the call. Do not repeat the exact same call unchanged.',
  'If the same tool has failed 3 times, stop retrying it. Summarize the error to the user and ask for guidance, or choose a different approach.',
  'Advisory only; this never blocks, routes, retries, or completes work, and it selects no workflow, Skill, Agent, or fork width. OMP owns tools, permissions, delegation, and completion.',
].join('\n');

const TOOL_ERROR_ESCALATION_SECTION = [
  'TOOL_ERROR_ESCALATION (soft, model-adaptive):',
  'This tool has failed 3 times with parameter errors. Stop retrying this tool.',
  'Summarize the error and what you tried to the user. Ask for guidance or choose a different approach.',
  'Advisory only; this never blocks, routes, retries, or completes work.',
].join('\n');

const TOOL_CALL_PRIMING_FAMILIES = Object.freeze([
  'mimo',
  'deepseek-v4-flash',
  'kimi',
  'step-3.7-flash',
]);

export function shouldPrimeToolCalls(model = {}) {
  const { provider = '', id = '' } = isRecord(model) ? model : {};
  const token = `${String(provider ?? '')}/${String(id ?? '')}`.toLowerCase();
  if (!token.trim() || token === '/') return false;
  return TOOL_CALL_PRIMING_FAMILIES.some((family) => token.includes(family));
}

export function buildToolCallPrimingSection() {
  return TOOL_CALL_PRIMING_SECTION;
}

export function buildToolCallReprimeSection() {
  return TOOL_CALL_REPRIME_SECTION;
}

export function buildToolErrorEscalationSection() {
  return TOOL_ERROR_ESCALATION_SECTION;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}