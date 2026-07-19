import { WORKFLOW_CATALOG_VERSION, workflowDefinitions } from './catalog.js';

const SHARED_CATALOG_BLOCK_START = '<!-- OMP-ENHANCER-WORKFLOW-CATALOG:START -->';
const SHARED_CATALOG_BLOCK_END = '<!-- OMP-ENHANCER-WORKFLOW-CATALOG:END -->';

export function buildSharedWorkflowCatalogMarkdown() {
  const lines = [
    SHARED_CATALOG_BLOCK_START,
    '# OMP Enhancer Workflow Catalog',
    '',
    `OMP_WORKFLOW_CATALOG_VERSION: ${WORKFLOW_CATALOG_VERSION}`,
    '',
    'This is optional reference material. OMP\'s native system prompt, settings, active tools, dynamic Agent list, approval flow, and completion behavior remain authoritative. The catalog never selects a workflow or grants permission; the staged sequence below is model guidance, not a runtime-enforced precondition or completion gate.',
    '',
    '## Using this reference',
    '',
    'For a task requiring analysis, judgment, workflow composition, coordinated stages, or possible delegation, use the compact workflow index as navigation before project work and wait for it. A mechanical field lookup without analysis uses no Skill and proceeds directly. After the index and before workflow-reference, domain-Skill, or project tools, Main explicitly writes the exact `WORKFLOW PLAN` block: one Primary workflow for the main deliverable, or none, only the Add-ons whose complete selection condition independently matches another requested operation or output, exact Skill URIs, resource load order, and numbered actions explaining how each workflow and Skill will be applied. Do not add a workflow merely for an internal phase already covered by the Primary. An Add-on enriches and never replaces the Primary. The selected combination remains Agent-owned; this catalog never routes a task or turns an isolated keyword into a selection.',
    'Use a workflow card only when it helps interpret the user request. Prefer the smallest complete combination. A small target is not by itself a reason for `agentic.simple`; prefer a specialized Primary when its domain-specific preservation, risk, or validation contract materially improves the task. The acting Agent may select, combine, simplify, or ignore cards. A `composeWith` entry is only an Add-on candidate and applies only when its own selection condition also matches. The Main Skill index maps every selected Primary and Add-on to one literal per-workflow reference URI. Follow OMP\'s native guidance for TODO usage, delegation, tools, permissions, and final delivery.',
    'The workflow index is navigation, not a domain method. Load every declared visible domain Skill or catalog that owns the requested method, evidence rule, verdict, or format first; resolve only exact nested Skill URIs revealed by a declared catalog; then load the selected workflow references last and wait before project work. Supplied native Skill bodies are already loaded and must not be reread. Once resources are loaded or marked unavailable, Main explicitly writes `WORKFLOW READY |`, rebases a detailed TODO once from the actual workflow steps and Skill instructions, updates native `todo` when exposed and allowed, and then executes its committed phases step by step. If native TODO is unavailable, the same detailed checklist remains the execution state. Independent sibling items may still run in one batch. Skill candidates must exist in the current OMP inventory; Agent candidates may be used only when present in the current dynamic Available Agents list.',
    'When Main independently decides native delegation is useful while using a selected workflow, begin each per-job assignment text itself with `[workflow=<ids> step=<step-id> todo=<verbatim-task-content-or-none> skills=<skill-ids-or-none>]`, using comma-separated workflow IDs for a composition, then include bounded scope, non-goals, and acceptance evidence; outer context and task names are not substitutes. The child follows its assignment and does not own the parent TODO. Use the native `hub` result-delivery or wait path after dispatch; do not poll with another `task` call or an `agent://` read. Do not emit a user-facing draft result before required child results are delivered and integrated. Missing plan, TODO, or metadata is an advisory traceability issue, never permission to block a tool, restart useful work, or hold completion open.',
    '',
    'When a loaded code method applies to substantive code mutation, its soft default is subagent-driven through plugin `plan`, native `task`, and native `reviewer`. Main first performs local and decision-relevant external discovery, writes detailed dependency waves of vertical slices with non-overlapping write sets, and gives the complete plan to `plan`. In the same native `task` `tasks[]` batch, Main sends all runnable independent vertical slices for a wave; dependent slices wait for a later wave, and every task owns its complete test-mutation, valid RED, minimum-production, same-command GREEN, and refactor slice. Main then integrates and verifies the current tree and reviews the semantic diff, evidence, scope, and cross-slice interactions before `reviewer` receives the Main-reviewed bounded diff. Supported findings return to `task` as bounded repairs, followed by refreshed evidence, another Main review, and at most one fresh reviewer pass over the affected diff. Agent absence, capacity, unsafe assignment input, or overlapping writes is a reported fallback limitation, never a router, required fork, fixed fanout, gate, or automatic repair loop.',
    '',
    'Writing intent comes from the user instruction. Chinese or English writing resources come from the body of the text being modified, never from the prompt language. For a path-only writing request, read the target first and use `writing.pending` until the body language is observed. Once language is known, Main may prefer currently exposed language-matched writer and independent checker candidates when delegation is useful; their availability does not require a fork. LaTeX, Beamer modification, Markdown, and Word are format companions and do not choose the prose language or language roles. For a new Beamer deck, establish the output language explicitly during story discussion. For evidence-backed online research, add `factcheck.document` only when the requested output also requires claim verdicts, and add the selected output-language or format workflow only when its complete condition matches.',
    '',
    '## Workflow cards',
    '',
  ];

  for (const definition of workflowDefinitions) {
    lines.push(...renderWorkflowCard(definition), '');
  }

  lines.push(SHARED_CATALOG_BLOCK_END, '');
  return lines.join('\n');
}

function renderWorkflowCard(definition) {
  const roleIds = definition.roles;
  return [
    `### \`${definition.id}\``,
    '',
    `- Primary when: ${definition.chooseWhen}`,
    `- Add-on candidates (only when their own Primary condition applies; they never replace the Primary): ${definition.composeWith.length ? codeList(definition.composeWith) : 'none normally'}.`,
    `- Steps: ${definition.steps.map(({ id, text }, index) => `(${index + 1}) [${id}] ${text}`).join(' ')}`,
    `- Skill candidates: ${definition.skills.length ? codeList(definition.skills) : 'none by default; inspect the active inventory for an exact match'}.`,
    `- Optional agent candidates: ${definition.roles.length ? codeList(definition.roles) : 'none suggested'}.`,
    `- Optional delegation ideas: ${proseList(definition.delegation.map((line) => codeFirstExactIds(line, roleIds)))}.`,
    `- Quality checks: ${proseList(definition.qualityChecks)}.`,
    `- Scope notes: ${proseList(definition.scopeNotes, 'none')}.`,
    `- Risk notes: ${proseList(definition.riskNotes, 'none')}.`,
  ];
}

function codeList(values) {
  return values.map((value) => `\`${value}\``).join(', ');
}

function codeFirstExactIds(value, identifiers) {
  return [...identifiers]
    .sort((left, right) => right.length - left.length)
    .reduce((text, identifier) => {
      const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return text.replace(new RegExp(`(^|[^a-z0-9-])(${escaped})(?=$|[^a-z0-9-])`, 'i'), '$1`$2`');
    }, value);
}

function proseList(values, fallback = '') {
  if (!values.length) return fallback;
  return values.map((value) => value.replace(/[.!?]+$/u, '')).join('; ');
}
