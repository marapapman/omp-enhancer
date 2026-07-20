export const WORKFLOW_STATE_LINE = 'DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY';

export const WORKFLOW_PROJECT_START_RULE = 'Project tools start only after the READY + TODO response ends and its results return.';

export const DELEGATION_COMPILE_RULE = 'COMPILE (soft): loaded `subagent-driven` + complete input + safe checkpoint + visible matching Agent => Delegate row; otherwise `fallback=<one matched permitted limitation>`. PLAN defers this final disposition until the card loads; no plugin enforces it.';

export const WORKFLOW_PLAN_TEMPLATE = [
  'WORKFLOW PLAN',
  'Primary: <id-or-none>',
  'Add-ons: <ids-or-none>',
  'Skills: <exact domain Skill/catalog URIs-or-none>',
  'Load order: NOW=[<chosen non-supplied Skill/catalog URIs-or-none>] THEN=[<Add-on PLAN URIs; Primary PLAN URI last-or-none>]',
  'Actions:',
  '1. LOAD: <NOW, revealed extensions, THEN, and waits>',
  '2. COMMIT: After all resources, emit READY + detailed TODO from loaded steps only; end and wait; zero project tools.',
  '3. SPLIT + EXECUTE: After READY wait, apply loaded defaults/checkpoints to current Agents and dependency order; Delegate or record one permitted fallback.',
  '4. VERIFY: <requested acceptance evidence and parent delivery integration>',
].join('\n');

export const RUNTIME_WORKFLOW_PLAN_TEMPLATE = [
  'WORKFLOW PLAN',
  'Primary: <index-id-or-none>',
  'Add-ons: <index-ids-or-none>',
  'Skills: <exact-Skill/catalog-URIs-or-none>',
  'Load order: NOW=[<non-supplied-Skill/catalog-URIs-or-none>] THEN=[<Add-on-refs;Primary-last-or-none>]',
  'Actions:',
  '1. LOAD: <NOW/extensions/THEN; wait each>',
  '2. COMMIT: <READY + loaded-step TODO only; end/wait>',
  '3. SPLIT + EXECUTE: <loaded checkpoints; Agents/dependencies/fallback>',
  '4. VERIFY: <acceptance evidence + parent integration>',
].join('\n');

export const WORKFLOW_READY_TEMPLATE = 'WORKFLOW READY | primary=<id-or-none> | add-ons=<ids-or-none> | skills-loaded=<ids-or-none> | skills-unavailable=<ids-or-none>';

export const DELEGATED_TODO_TEMPLATE = 'Delegate Agent=<Main-chosen-current-Agent> workflow=<comma-selected-ids> step=<step-id> skills=<comma-loaded-ids-or-none> checkpoint=<verbatim-task-content>';

export const NATIVE_TASK_PREFIX_TEMPLATE = '[workflow=<copy-workflow> step=<copy-step> todo=<copy-checkpoint-verbatim> skills=<copy-skills>]';

const TODO_REBASE_REASON_LIST = Object.freeze([
  'new dependency',
  'scope',
  'permission',
  'tool',
  'Agent',
  'schema',
  'capacity',
  'Skill-load failure',
  'contradictory project evidence',
]);

export const TODO_REBASE_REASONS = `${TODO_REBASE_REASON_LIST.slice(0, -1).join(', ')}, or ${TODO_REBASE_REASON_LIST.at(-1)}`;

export const TODO_REBASE_REASONS_COMPACT = TODO_REBASE_REASON_LIST.join('/');

export const DIRECT_FALLBACK_REASONS = 'one concrete user or native constraint, Agent availability or capacity, incomplete assignment input, unresolved dependency or write-set overlap, safety risk, or native parent-owned action';
