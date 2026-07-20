import { WORKFLOW_CATALOG_VERSION, workflowDefinitions } from './catalog.js';
import {
  DELEGATION_COMPILE_RULE,
  DELEGATED_TODO_TEMPLATE,
  DIRECT_FALLBACK_REASONS,
  NATIVE_TASK_PREFIX_TEMPLATE,
  TODO_REBASE_REASONS,
  WORKFLOW_PROJECT_START_RULE,
} from './staged-contract.js';
import {
  directSkillCandidates,
  exactNestedEccSkillCandidates,
} from './skill-discovery.js';

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
    'For a task requiring analysis, judgment, workflow composition, coordinated stages, or possible delegation, use the compact workflow index as navigation before project work and wait for it. A mechanical field lookup without analysis uses no Skill and proceeds directly. After the index and before workflow-reference, domain-Skill, or project tools, Main explicitly writes the exact `WORKFLOW PLAN` block: one Primary workflow for the main deliverable, or none, only the Add-ons whose complete selection condition independently matches another requested operation or output, exact domain Skill or catalog URIs, a NOW/THEN resource load order, and at least four detailed Actions for LOAD, COMMIT, SPLIT + EXECUTE, and VERIFY. Do not add a workflow merely for an internal phase already covered by the Primary. An Add-on enriches and never replaces the Primary. The selected combination remains Agent-owned; this catalog never routes a task or turns an isolated keyword into a selection.',
    'Use a workflow card only when it helps interpret the user request. Prefer the smallest complete combination. A small target is not by itself a reason for `agentic.simple`; prefer a specialized Primary when its domain-specific preservation, risk, or validation contract materially improves the task. The acting Agent may select, combine, simplify, or ignore cards. A `composeWith` entry is only an Add-on candidate and applies only when its own selection condition also matches. The Main Skill index maps every selected Primary and Add-on to one literal per-workflow reference URI. Follow OMP\'s native guidance for TODO usage, delegation, tools, permissions, and final delivery.',
    `The workflow index is navigation, not a domain method. The next response is the filled PLAN plus its declared resource calls and byte 0 is \`W\`. PLAN uses \`Load order: NOW=[...] THEN=[...]\`: \`Skills\` lists exact domain Skill or catalog URIs only, NOW copies only their non-supplied URIs, and THEN alone copies selected Add-on reference URIs plus the Primary once and last. An exact nested ECC URI listed on a card is already revealed and goes directly in PLAN/NOW; \`skill://ecc-skill-catalog\` remains only for unlisted niche discovery. Main reads NOW and waits; when NOW is none, it reads THEN and waits. A loaded source may expose exact needed Skill URIs through at most three visible \`RESOURCE EXTENSION\` batches (two catalog hops plus one linked method), then Main reads THEN once and waits. It never guesses, rereads, or leaves the loaded source namespace. Once resources are loaded or marked unavailable, the next response is the filled \`WORKFLOW READY |\` plus native TODO initialization and byte 0 is \`W\`. Main rebases the detailed TODO from the loaded instructions, calls only native TODO initialization when exposed and allowed, ends, and waits. ${DELEGATION_COMPILE_RULE} ${WORKFLOW_PROJECT_START_RULE} Skill candidates must exist in the current inventory; Agent candidates may be used only when currently visible.`,
    `For native delegation, Main first commits the literal TODO row \`${DELEGATED_TODO_TEMPLATE}\`. The checkpoint is complete one-line metadata-safe text without \`]\` or reserved field markers; \`Delegate Writer:\` and generic Draft/Check rows lose handoff fields. The matching task sets the native task item \`agent\` to the row Agent, then mechanically copies workflow, step, and skills unchanged and the checkpoint value verbatim into \`todo\`; each assignment text byte 0 begins \`${NATIVE_TASK_PREFIX_TEMPLATE}\`, never \`# Target\` or \`# Goal\`. The task body copies every direct user constraint verbatim and adds no examples, then carries allowed effects and acceptance items before bounded scope and non-goals; outer context, name, or label cannot substitute. The child follows its assignment and does not own the parent TODO. Use native result delivery after dispatch; do not poll with another \`task\` call or an \`agent://\` read. Missing metadata is advisory traceability evidence, never permission to block, restart, or hold completion open.`,
    '',
    'EXECUTION DEFAULTS (soft): Mechanical DIRECT bypasses the staged workflow. A selected `agentic.simple` still uses staged PLAN/READY, then follows `direct-simple` without `task`. `writing.pending` uses one bounded `defer-until-composed` transition described below. All other selected workflows use the `subagent-driven` default described on their cards. These defaults guide Main but never select an Agent or fork width.',
    `For a selected \`subagent-driven\` card, if a matching currently visible Agent named by that card or a composed selected card can own a safe, complete, bounded checkpoint, Main commits it in TODO. After all parent-owned pre-dispatch prerequisites named by the loaded card complete, that \`task\` dispatch is the next project action. Prefer the domain Agent; otherwise native \`task\` may own the complete slice. Send runnable independent checkpoints together while preserving dependency order; Main integrates and verifies deliveries. Only a ${TODO_REBASE_REASONS} may rebase that row. Direct fallback is limited to ${DIRECT_FALLBACK_REASONS}; an unresolved dependency qualifies only when it cannot remain a pending later-wave checkpoint. Target size, expected latency, read-only output, integrated final delivery, coordination overhead, or no explicit delegation request alone are not fallback reasons.`,
    '',
    'When a loaded code method applies to substantive code mutation, its soft default is subagent-driven through plugin `plan`, native `task`, and native `reviewer`. Main first performs local and decision-relevant external discovery, writes detailed dependency waves of vertical slices with non-overlapping write sets, and gives the complete plan to `plan`. In the same native `task` `tasks[]` batch, Main sends all runnable independent vertical slices for a wave; dependent slices wait for a later wave, and every task owns its complete test-mutation, valid RED, minimum-production, same-command GREEN, and refactor slice. Main then integrates and verifies the current tree and reviews the semantic diff, evidence, scope, and cross-slice interactions before `reviewer` receives the Main-reviewed bounded diff. Supported findings return to `task` as bounded repairs, followed by refreshed evidence, another Main review, and at most one fresh reviewer pass over the affected diff. Agent absence, capacity, unsafe assignment input, or overlapping writes is a reported fallback limitation, never a router, required fork, fixed fanout, gate, or automatic repair loop.',
    '',
    'Writing intent comes from the user instruction. Chinese or English writing resources come from the body of the text being modified, never from the prompt language. When the central deliverable drafts or revises prose, the language workflow is Primary and any requested format workflow is an Add-on. A format-only conversion, template application, or structure operation keeps the matching format or converter workflow Primary and adds no prose workflow. For a path-only writing request, select `writing.pending` during PLAN and do not read the target before READY. After initial READY, Main makes exactly one narrow source read for language only and no substantive review. It then emits one replacement `WORKFLOW PLAN`: replace pending with `writing.zh` or `writing.en`, retain the same format Add-ons, declare only new language Skills and the language workflow reference last, do not reread loaded companions, wait for them, and emit replacement `WORKFLOW READY`. If language remains ambiguous, ask the user; never loop or guess. For substantive language work, the language-matched writer acts first, then an independent read-only checker; the parent reconciles findings and verifies scope and semantic anchors. LaTeX, Beamer modification, Markdown, and Word are format companions and do not choose prose language or roles. For a new Beamer deck, establish output language during story discussion. For evidence-backed online research, add `factcheck.document` only when the requested output also requires claim verdicts, and add an output-language or format workflow only when its complete condition matches.',
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
    `- Direct Skill candidates: ${directSkillCandidates(definition).length ? codeList(directSkillCandidates(definition).map((skill) => `skill://${skill}`)) : 'none'}.`,
    `- Exact nested ECC Skill candidates: ${definition.catalogSkills.length ? codeList(exactNestedEccSkillCandidates(definition)) : 'none'}.`,
    `- Agent candidates: ${definition.roles.length ? codeList(definition.roles) : 'none suggested'}.`,
    `- Execution default (soft): ${workflowExecutionDefault(definition)}`,
    `- Delegated checkpoints: ${proseList(definition.delegation.map((line) => codeFirstExactIds(line, roleIds)))}.`,
    `- Quality checks: ${proseList(definition.qualityChecks)}.`,
    `- Scope notes: ${proseList(definition.scopeNotes, 'none')}.`,
    `- Risk notes: ${proseList(definition.riskNotes, 'none')}.`,
  ];
}

export function workflowExecutionDefault(definition) {
  if (definition.delegationDefault === 'direct-simple') {
    return '`direct-simple` — after staged READY, Main works directly and uses no `task` solely because this card was selected.';
  }
  if (definition.delegationDefault === 'defer-until-composed') {
    return '`defer-until-composed` — after initial READY, make one narrow language-only read, emit one replacement PLAN for `writing.zh` or `writing.en` with stable companions and only new resources, emit replacement READY, then follow the selected card; never loop or guess.';
  }
  return `\`subagent-driven\` — Main chooses a currently visible matching Agent and width for each safe complete checkpoint. After every parent-owned pre-dispatch prerequisite named by this card completes, the committed \`task\` is the next project action; runnable independent checkpoints share a batch and dependent ones wait. Main integrates and verifies deliveries. Only a ${TODO_REBASE_REASONS} may rebase a row; direct fallback is limited to ${DIRECT_FALLBACK_REASONS}. Size, latency, read-only output, integrated delivery, overhead, or no explicit delegation request alone are not fallbacks. This selects no Agent or fork width and creates no fork requirement, gate, retry, or completion condition.`;
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
