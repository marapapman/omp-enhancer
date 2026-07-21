import { WORKFLOW_CATALOG_VERSION, workflowDefinitions } from './catalog.js';
import { workflowExecutionDefault } from './render-shared-markdown.js';
import {
  ECC_CATALOG_SKILL_URI,
  directSkillCandidates,
  exactNestedEccSkillCandidates,
} from './skill-discovery.js';
import {
  DELEGATED_TODO_TEMPLATE,
  DIRECT_FALLBACK_REASONS,
  NATIVE_TASK_PREFIX_TEMPLATE,
  TODO_REBASE_REASONS,
  WORKFLOW_PLAN_TEMPLATE,
  WORKFLOW_PROJECT_START_RULE,
  WORKFLOW_READY_TEMPLATE,
  WORKFLOW_STATE_LINE,
} from './staged-contract.js';

export const WORKFLOW_SKILL_NAME = 'omp-enhancer-workflows';

const DOMAIN_ORDER = Object.freeze([
  'general',
  'writing',
  'research',
  'code',
  'network',
  'database',
  'ml',
  'growth',
  'operations',
]);
const WRITING_INDEX_GROUPS = Object.freeze([
  Object.freeze(['language', Object.freeze(['writing.pending', 'writing.zh', 'writing.en'])]),
  Object.freeze(['format overlays', Object.freeze(['writing.latex', 'writing.markdown', 'doc.convert.word'])]),
  Object.freeze(['specialized outputs', Object.freeze(['slides.generate', 'slides.modify', 'diagram.svg', 'diagram.tikz'])]),
]);

export function buildWorkflowSkillIndexMarkdown() {
  const grouped = groupDefinitions();
  const lines = [
    '---',
    `name: ${WORKFLOW_SKILL_NAME}`,
    'description: Workflow index for staged project work.',
    '---',
    '',
    'DECLARE HANDOFF (soft): Next visible response MUST start byte 0 with `WORKFLOW PLAN` and contain only this form plus resource calls. Select internally; state stays silent; no project path; user text suffices:',
    WORKFLOW_PLAN_TEMPLATE,
    'PLAN text alone is incomplete: same response calls NOW and waits, or calls THEN if NOW=none. THEN is one final resource-only batch. Give each evidence checkpoint an Action.',
    'AFTER NOW: empty revealed URI set => no text/marker; call the THEN batch. Otherwise RESOURCE EXTENSION MUST list >=1 exact revealed URI; `reads=none` is invalid.',
    '',
    `Catalog version: ${WORKFLOW_CATALOG_VERSION}.`,
    '',
    'Navigation only: never routes, gates, grants permission, selects Agents, or decides completion.',
    '',
    '## Staged protocol',
    '',
    `STATE: ${WORKFLOW_STATE_LINE}.`,
    '',
    '1. **DISCOVER** — This body is the completed DISCOVER result; do not read `skill://omp-enhancer-workflows` again. A verbatim field lookup needs no Skill or TODO.',
    '',
    `2. **DECLARE + LOAD** — Choose by operation, source, and output. Emit PLAN first; load NOW, wait, then load THEN and wait. ${WORKFLOW_PROJECT_START_RULE}`,
    '',
    '3. **COMMIT + EXECUTE** — Emit READY first; commit loaded methods to detailed native TODO, wait, then split, execute, and verify.',
    '',
    'Main owns delegation; OMP owns tools, permissions, TODO, Agents, and completion.',
    '',
    'PROSE: English draft/revision -> `writing.en`; Chinese -> `writing.zh`; unknown body -> `writing.pending`. Other central operation => language Add-on. Language Primary + `.tex` target/LaTeX prose/preserved LaTeX commands => `writing.latex` Add-on. Direct standalone SVG -> `diagram.svg`; editable TikZ `.tex`/PDF/SVG/PNG -> `diagram.tikz`; TikZ source alone does not add `writing.latex`. Format-only => format Primary. Converters/templates only when requested. Loaded language card + target/constraints/roles => writer -> checker -> parent VERIFY after READY; Main does not pre-read.',
    'VISUAL: Non-visual Primary + independently requested UI/layout/static-visual deliverable => `design.visual` Add-on. Standalone slide/SVG/TikZ stays specialized Primary; add `design.visual` only for separate visual-design work/output.',
    '',
    '## Domain index',
    '',
    'SKILL DISCOVERY: `D` and `C` are optional candidates, never load sets. Select only a URI that matches the requested method, evidence rule, verdict, or format. An enumerated `C` URI goes directly in PLAN/NOW. `'
      + ECC_CATALOG_SKILL_URI
      + '` remains only for unlisted niche discovery; refs stay in THEN.',
    '',
  ];

  for (const domain of DOMAIN_ORDER) {
    const definitions = grouped.get(domain) ?? [];
    lines.push(`### ${domain}`, '');
    if (domain === 'writing') lines.push(...renderWritingIndex(definitions));
    else lines.push(...definitions.map(renderIndexRow), '');
  }

  lines.push(
    '## State handoff',
    '',
    'SELECTION: Primary = central deliverable; independent requested operations/outputs = Add-ons. Skills own methods/evidence/format; refs do not.',
    '',
    'EXECUTION: DIRECT skips; `agentic.simple` has no `task`; `writing.pending` composes once; other cards use the compiler.',
    '',
    'FALLBACK: concrete user/native, Agent/capacity, input/dependency/write-set, safety, or parent ownership only; never size, latency, read-only, overhead, or no delegation request.',
    '',
    'SKILL URI: D=direct; C=exact nested; others need a loaded source. Supplied bodies stay in PLAN/READY, not NOW; only exact failure marks unavailable.',
    '',
    'LOAD: Skills=exact domain Skill/catalog URIs; NOW=non-supplied Skills/catalogs; THEN=Add-on refs then Primary. Load/wait each; max 2 catalog + 1 method extensions. NOW none loads THEN with PLAN. Never guess/reread/re-PLAN except `writing.pending`.',
    '',
    `COMMIT HANDOFF (soft): after every declared NOW resource, revealed extension, and THEN reference has returned or been marked unavailable, next response begins \`W\`, fills \`${WORKFLOW_READY_TEMPLATE}\` with bare IDs, initializes native TODO only, and ends/waits. Freeze W/S. COMPILE (soft): loaded \`subagent-driven\` + complete input + safe checkpoint + visible matching Agent => Delegate row; otherwise \`fallback=<one matched permitted limitation>\`. ${WORKFLOW_PROJECT_START_RULE}`,
    '',
    'NEXT VISIBLE BYTES MUST BE `WORKFLOW PLAN`; no preface; no plugin enforces this format.',
    '',
  );

  return lines.join('\n');
}

export function buildWorkflowSkillReferenceMarkdown(workflowId) {
  const definition = workflowDefinitions.find(({ id }) => id === workflowId);
  if (!definition) throw new Error(`Unknown workflow skill reference: ${workflowId}.`);
  const lines = [
    `READY NEXT (soft): SENTINEL 1/2 — no plugin enforcement. Next assistant response byte 0 = \`W\` of filled \`${WORKFLOW_READY_TEMPLATE}\`; no other visible text; the same response calls native TODO init only. Rebase TODO from loaded resources; end/wait.`,
    `# \`${workflowId}\` workflow reference`,
    '',
    'Optional reference only. OMP native runtime instructions and settings remain authoritative.',
    'RESOURCE HANDOFF (soft): load only remaining declared resources and wait. Do not start project work in a resource-result response.',
    `Derive TODO internally.${definition.delegationDefault === 'subagent-driven' ? ' Each delegated native TODO `items[]` string is the exact Delegate row; use no role-colon shorthand. Its checkpoint is one metadata-safe line without `]`, `workflow=`, `step=`, `todo=`, `skills=`, or `checkpoint=`.' : ''}`,
    '',
    ...renderCard(definition),
    '',
    `EXECUTION DEFAULT (soft): ${workflowExecutionDefault(definition)}`,
    '',
    `TODO COMPILE (soft): Rebase TODO from this card. For a subagent-driven card, complete input + safe checkpoint + visible matching Agent => one exact Delegate row; otherwise \`fallback=<one matched permitted limitation>\`. Parent VERIFY rows remain separate. Every delegated row is exactly \`${DELEGATED_TODO_TEMPLATE}\`; workflow and skills copy frozen W=<Primary,Add-ons> and S=<bare loaded Skill IDs>.`,
    ...(definition.delegationDefault === 'defer-until-composed' ? [
      'PENDING TRANSITION: after initial READY/TODO, make exactly one narrow body-language read with no substantive review. Next visible bytes are WORKFLOW PLAN: replace pending with `writing.zh` or `writing.en`, retain format Add-ons, put only new language Skills in NOW and its Primary reference last in THEN, load/wait, then emit replacement READY and TODO/wait. If ambiguous, ask; never loop or guess.',
    ] : []),
    ...(definition.delegationDefault === 'subagent-driven' ? [
      'TASK COPY (soft, later response): copy one committed Delegate row; do not redraft its metadata.',
      '- Set native item `agent` to the row Agent and native item `todo` to the row checkpoint verbatim.',
      `- Assignment body byte 0 = \`${NATIVE_TASK_PREFIX_TEMPLATE}\`. Never begin \`# Target\` or \`# Goal\`.`,
      '- The native `tasks[].task` itself begins at byte 0 with that complete four-key prefix. Every native `task` call sets a non-empty top-level `context` summarizing the shared batch purpose. That common `context`, name, label, or an instruction telling the child to output metadata cannot substitute for an item body or its byte-0 prefix.',
      `- Keep later-wave metadata stable and put delivery material in the body. Fill required native fields, copy direct user constraints verbatim, and add bounded scope and acceptance evidence. After dispatch, end and wait for native auto-delivery; do not poll with \`hub\`. Only a ${TODO_REBASE_REASONS} may rebase the row; otherwise use ${DIRECT_FALLBACK_REASONS}.`,
    ] : []),
    ...(/^writing\.(?:en|zh)$/u.test(definition.id) ? [
      `AFTER TODO RESULT: the ${definition.id === 'writing.zh' ? 'zh-writer' : 'writer'} \`task\` is the next project action; use the committed row; no Main \`read\` or \`glob\` to confirm or enrich its complete input. Initial TODO freezes three exact Delegate rows: step-2 ${definition.id === 'writing.zh' ? 'zh-writer' : 'writer'}, step-3 ${definition.id === 'writing.zh' ? 'zh-checker' : 'checker'}, and conditional step-4 corrected-proposal. Keep the later rows unchanged and put delivery text after the prefix. Branch A: Main alone performs finding disposition and accepts at least one checker finding; dispatch the original frozen step-4 row and use native TODO \`done\` for that same row only after a complete corrected-proposal terminal delivery. Branch B: Main accepts zero checker findings; do not dispatch; use native TODO \`done\` on the same frozen row with \`resolved-no-repair\`; never rewrite, drop, or abandon it. This no-op branch is parent TODO condition resolution, not child delivery, a successful fork, or permission. Each dispatch mechanically copies its frozen Agent, workflow, step, skills, and checkpoint metadata.`,
    ] : []),
    '',
    `READY NEXT (soft): SENTINEL 2/2 — no plugin enforcement. Next assistant response byte 0 = \`W\` of filled \`${WORKFLOW_READY_TEMPLATE}\`; no other visible text; native TODO init only; end/wait.`,
  ];
  return lines.join('\n');
}

export function buildWorkflowSkillReferences() {
  return Object.freeze(Object.fromEntries(
    workflowDefinitions.map(({ id }) => [id, buildWorkflowSkillReferenceMarkdown(id)]),
  ));
}

export function workflowReferenceUri(workflowId) {
  return `skill://${WORKFLOW_SKILL_NAME}/references/${workflowId}.md`;
}

function groupDefinitions() {
  const grouped = new Map(DOMAIN_ORDER.map((domain) => [domain, []]));
  for (const definition of workflowDefinitions) {
    grouped.get(domainForWorkflow(definition.id)).push(definition);
  }
  return grouped;
}

function domainForWorkflow(id) {
  if (id === 'agentic.simple') return 'general';
  if (/^(?:writing\.|slides\.|diagram\.|doc\.)/.test(id)) return 'writing';
  if (/^(?:research\.|factcheck\.)/.test(id)) return 'research';
  if (/^(?:code\.|performance\.)/.test(id)) return 'code';
  if (id.startsWith('network.')) return 'network';
  if (id.startsWith('database.')) return 'database';
  if (id.startsWith('ml.')) return 'ml';
  if (/^(?:marketing\.|seo\.)/.test(id)) return 'growth';
  return 'operations';
}

function renderCard(definition) {
  return [
    `## \`${definition.id}\``,
    '',
    `- Primary when: ${definition.chooseWhen}`,
    '- Reference steps:',
    ...definition.steps.map(({ id, text }, index) => `  ${index + 1}. [${id}] ${text}`),
    `- Agent candidates: ${definition.roles.length ? definition.roles.map(code).join(', ') : 'none suggested'}.`,
    ...renderSublist('Delegated checkpoints', definition.delegation),
    ...renderSublist('Quality checks', definition.qualityChecks),
    ...renderSublist('Scope notes', definition.scopeNotes, 'none'),
    ...renderSublist('Risk notes', definition.riskNotes, 'none'),
  ];
}

function code(value) {
  return `\`${value}\``;
}

function renderIndexRow(definition) {
  return `- \`${definition.id}\` — ${definition.chooseWhen} ${renderSkillDiscovery(definition)} PLAN URI: \`${workflowReferenceUri(definition.id)}\`.`;
}

function renderWritingIndex(definitions) {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const expectedIds = WRITING_INDEX_GROUPS.flatMap(([, ids]) => ids);
  if (definitions.length !== expectedIds.length || expectedIds.some((id) => !byId.has(id))) {
    throw new Error('Writing workflow index groups must cover every writing workflow exactly once.');
  }
  return WRITING_INDEX_GROUPS.flatMap(([label, ids]) => [
    `#### ${label}`,
    '',
    ...ids.map((id) => renderIndexRow(byId.get(id))),
    '',
  ]);
}

function renderSkillDiscovery(definition) {
  const direct = directSkillCandidates(definition)
    .map((skill) => code(`skill://${skill}`));
  const catalog = exactNestedEccSkillCandidates(definition).map(code);
  if (!direct.length && !catalog.length) return 'S=[none].';
  return [
    ...(direct.length ? [`D=[${direct.join(', ')}]`] : []),
    ...(catalog.length ? [`C=[${catalog.join(', ')}]`] : []),
  ].join(' ') + '.';
}

function renderSublist(label, values, fallback = '') {
  const items = values.length ? values : [fallback];
  return [
    `- ${label}:`,
    ...items.map((value) => `  - ${value || 'none'}`),
  ];
}
