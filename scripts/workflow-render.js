import { WORKFLOW_CATALOG_VERSION, workflowDefinitions } from './workflow-definitions.js';
const WORKFLOW_PHASE_LINE = 'ANALYZE -> EXECUTE -> REVIEW';

const AGENT_DESCRIPTIONS = Object.freeze({
  checker: 'Read-only English checker for a narrow semantic-drift, logic, and clarity check or a broad seven-dimension advisory audit.',
  'fact-planner': 'Decomposes a fact-checking task into checkable claims, evidence plans, risk levels, and scope boundaries.',
  'fact-researcher-a': 'First independent evidence lane for fact checking; collects primary-source evidence for planned claims and lists claims the plan omitted.',
  'fact-researcher-b': 'Second independent evidence lane; looks for corroboration, counter-evidence, source conflicts, and omitted claims.',
  'fact-researcher-c': 'Third independent evidence lane; third-model corroboration plus an independent enumeration of omitted claims.',
  'fact-challenger': 'Adversarial reviewer that attacks recorded verdicts and reports claims the plan missed (AGREE / REBUT / MISSED).',
  scout: 'Fast read-only scout returning compressed context for handoff; use for exploratory codebase research and broad pattern searches.',
  task: 'General-purpose subagent with full capabilities for delegated multi-step work.',
  writer: 'Dedicated English text tool: the only author for English prose/copy (drafting, revision, translation, polishing, titles, labels, captions, notes, UI copy), including LaTeX passages; returns proposals read-only. Served by the host\'s packaged Agent adapter because the current OMP ExtensionAPI exposes model workers only as agents; this label is not a second general-purpose writer agent and grants no code or file permissions.',
  'zh-checker': '中文只读 checker，可执行窄范围的语义漂移、逻辑与清晰度核查，或完整七维审查。',
  'zh-writer': '专用中文文本工具：中文散文/文案（起草、修订、翻译、润色、标题、标签、图注、笔记、界面文案）的唯一作者，支持 LaTeX 段落，返回只读修改稿，输出自然中文。因当前 OMP ExtensionAPI 仅以 Agent 形式暴露模型 worker，由宿主打包 Agent 适配器承载；该标识不是第二个通用写作 agent，不授予代码或文件权限。',
});

function describeAgent(role) {
  const description = AGENT_DESCRIPTIONS[role];
  if (!description) throw new Error(`No agent description for workflow role ${role}.`);
  return description;
}

const SHARED_CATALOG_BLOCK_START = '<!-- OMP-ENHANCER-WORKFLOW-CATALOG:START -->';
const SHARED_CATALOG_BLOCK_END = '<!-- OMP-ENHANCER-WORKFLOW-CATALOG:END -->';

export function buildSharedWorkflowCatalogMarkdown() {
  const lines = [
    SHARED_CATALOG_BLOCK_START,
    `# OMP Enhancer Workflow Catalog v${WORKFLOW_CATALOG_VERSION}`,
    '',
    `Advisory reference. Main orchestrates freely through ${WORKFLOW_PHASE_LINE}.`,
    '',
  ];

  for (const definition of workflowDefinitions) {
    lines.push(...renderWorkflowCard(definition), '');
  }

  lines.push(SHARED_CATALOG_BLOCK_END, '');
  return lines.join('\n');
}

function renderWorkflowCard(definition) {
  return [
    `## \`${definition.id}\``,
    '',
    `- When: ${definition.chooseWhen}`,
    `- Skills: ${codeList(definition.skills)}`,
    `- Agents (host runtime adapter labels): ${definition.roles.length ? codeList(definition.roles) : 'none suggested'}`,
    '- Flow:',
    ...definition.suggestedFlow.map((text, index) => `  ${index + 1}. ${text}`),
  ];
}

export function buildWorkflowSkillIndexMarkdown() {
  const lines = [
    '---',
    'name: omp-enhancer-workflows',
    'description: Workflow reference catalog for Main orchestration.',
    '---',
    '',
    '# Workflow reference catalog',
    '',
    'Advisory reference only. Main selects workflows, Skills, Agents, and delegation width freely. OMP native instructions remain authoritative.',
    '',
    `Phases: ${WORKFLOW_PHASE_LINE}. Main chooses direct work or delegation at each phase based on task complexity.`,
    '',
    '## Domain index',
    '',
  ];
  for (const definition of workflowDefinitions) {
    lines.push(renderIndexRow(definition));
  }
  lines.push('', ...renderAgentDescriptions(), '## Usage', '');
  lines.push(
    '1. Match the task to a domain above.',
    '2. Load matching skills as needed for methods and evidence rules.',
    '3. Choose the Agents you need from the descriptions above; OMP exposes their current availability.',
    '4. Load the domain reference before starting matching work; it carries the required step order and checkpoints.',
    '',
  );
  return lines.join('\n');
}

export function buildWorkflowSkillReferences() {
  return Object.freeze(Object.fromEntries(
    workflowDefinitions.map(({ id }) => [id, buildWorkflowSkillReferenceMarkdown(id)]),
  ));
}

function renderAgentDescriptions() {
  const roles = [...new Set(workflowDefinitions.flatMap(({ roles }) => roles))].sort();
  return [
    '## Agent descriptions',
    '',
    ...roles.map((role) => `- \`${role}\` — ${describeAgent(role)}`),
    '',
    'Compatibility note: the `writer` and `zh-writer` text tools are listed above under their packaged Agent adapter names because the current OMP host exposes model workers through agents (the ExtensionAPI offers `registerTool` for command tools only). That backend label is a compatibility adapter, not a second general-purpose writer agent, and it grants no code or file permissions; `writer`/`zh-writer` remain the dedicated language-matched text capabilities, while Main/task own code and other non-text actions.',
    '',
  ];
}

function buildWorkflowSkillReferenceMarkdown(workflowId) {
  const definition = workflowDefinitions.find(({ id }) => id === workflowId);
  if (!definition) throw new Error(`Unknown workflow skill reference: ${workflowId}.`);
  const lines = [
    `# \`${workflowId}\` workflow reference`,
    '',
    'Optional advisory reference. Main orchestrates freely.',
    '',
    `- When: ${definition.chooseWhen}`,
    `- Skills: ${codeList(definition.skills)}`,
    `- Agent candidates (host runtime adapter labels): ${definition.roles.length ? definition.roles.map(code).join(', ') : 'none suggested'}.`,
    '',
    'Text capability note: `writer` and `zh-writer` are the dedicated language-matched text tools for all English/Chinese prose and copy; they appear under their packaged Agent adapter names only because the current OMP host exposes model workers that way. That backend label is not a second general-purpose writer agent and grants no code or file permissions; Main/task own code and other non-text actions.',
    '',
    '## Required step order',
    '',
    'These steps are the required execution order for this domain. The plugin provides no runtime gate, router, or completion condition — that means the runtime never blocks you, not that the steps are optional. Skipping a named step without a stated reason is a workflow violation; report it in the final delivery.',
    '',
    ...definition.suggestedFlow.map((text, index) => `${index + 1}. ${text}`),
    '',
  ];
  if (definition.scopeNotes.length > 0) {
    lines.push(
      '## Scope notes',
      '',
      ...definition.scopeNotes.map((text) => `- ${text}`),
      '',
    );
  }
  return lines.join('\n');
}
function renderIndexRow(definition) {
  return `- \`${definition.id}\` — ${definition.chooseWhen} ${renderSkillDiscovery(definition)} Reference: \`${workflowReferenceUri(definition.id)}\`.`;
}

function renderSkillDiscovery(definition) {
  const direct = definition.skills
    .filter((skill) => !definition.catalogSkills.includes(skill))
    .map((skill) => code(`skill://${skill}`));
  const catalog = definition.catalogSkills
    .map((directory) => code(`skill://ecc-skill-catalog/${directory}/SKILL.md`));
  if (!direct.length && !catalog.length) return 'S=[none].';
  return [
    ...(direct.length ? [`D=[${direct.join(', ')}]`] : []),
    ...(catalog.length ? [`C=[${catalog.join(', ')}]`] : []),
  ].join(' ') + '.';
}

export function workflowReferenceUri(workflowId) {
  return `skill://omp-enhancer-workflows/references/${workflowId}.md`;
}

function code(value) {
  return `\`${value}\``;
}

function codeList(values) {
  return values.map((value) => `\`${value}\``).join(', ');
}