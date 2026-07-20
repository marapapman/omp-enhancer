const WORKFLOW_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const RESOURCE_ID = /^[a-z0-9][a-z0-9._/-]*$/;
const STEP_ID = /^step-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DELEGATION_DEFAULTS = new Set([
  'subagent-driven',
  'direct-simple',
  'defer-until-composed',
]);
const RESERVED_MANAGED_MARKER = /<!--\s*OMP-ENHANCER-(?:WORKFLOW-CATALOG|WORKFLOW-CONTEXT|ADVISOR-WORKFLOW-CONTEXT):(?:START|END)\s*-->/i;
const WORKFLOW_FIELDS = new Set([
  'id',
  'chooseWhen',
  'composeWith',
  'steps',
  'scopeNotes',
  'skills',
  'catalogSkills',
  'qualityChecks',
  'riskNotes',
  'roles',
  'delegation',
  'delegationDefault',
]);
const STEP_FIELDS = new Set(['id', 'text']);

export function defineWorkflowCatalog(groups = []) {
  const rawDefinitions = groups.flat();
  const seen = new Set();
  const definitions = rawDefinitions.map((raw) => normalizeWorkflow(raw, seen));
  const knownIds = new Set(definitions.map(({ id }) => id));

  for (const definition of definitions) {
    for (const target of definition.composeWith) {
      if (!knownIds.has(target)) {
        throw new Error(`Workflow ${definition.id} composes unknown workflow ${target}.`);
      }
      if (target === definition.id) {
        throw new Error(`Workflow ${definition.id} cannot compose itself.`);
      }
    }
    validateDelegation(definition);
  }

  return Object.freeze(definitions);
}

function normalizeWorkflow(raw, seen) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Workflow definitions must be objects.');
  }
  rejectUnknownFields(raw, WORKFLOW_FIELDS, 'workflow definition');
  const id = requiredIdentifier(raw.id, 'workflow id', WORKFLOW_ID);
  if (seen.has(id)) throw new Error(`Duplicate workflow id: ${id}.`);
  seen.add(id);

  const steps = normalizeSteps(raw.steps, id);
  const skills = frozenUniqueIdentifiers(raw.skills, `${id}.skills`, RESOURCE_ID);
  const catalogSkills = frozenUniqueIdentifiers(
    raw.catalogSkills,
    `${id}.catalogSkills`,
    RESOURCE_ID,
  );
  for (const skill of catalogSkills) {
    if (!skills.includes(skill)) {
      throw new Error(`${id}.catalogSkills contains non-candidate ${skill}.`);
    }
  }

  return Object.freeze({
    id,
    chooseWhen: requiredText(raw.chooseWhen, `${id}.chooseWhen`),
    composeWith: frozenUniqueIdentifiers(raw.composeWith, `${id}.composeWith`, WORKFLOW_ID),
    steps: Object.freeze(steps),
    scopeNotes: frozenStrings(raw.scopeNotes, `${id}.scopeNotes`),
    skills,
    catalogSkills,
    qualityChecks: requiredStrings(raw.qualityChecks, `${id}.qualityChecks`),
    riskNotes: frozenStrings(raw.riskNotes, `${id}.riskNotes`),
    roles: frozenUniqueIdentifiers(raw.roles, `${id}.roles`, RESOURCE_ID),
    delegation: requiredStrings(raw.delegation, `${id}.delegation`),
    delegationDefault: normalizeDelegationDefault(raw.delegationDefault, `${id}.delegationDefault`),
  });
}

function normalizeSteps(values, workflowId) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${workflowId}.steps must contain at least one entry.`);
  }
  const seen = new Set();
  const steps = values.map((value, index) => {
    const raw = value;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new TypeError(`${workflowId}.steps[${index}] must be a step object with an explicit stable id.`);
    }
    rejectUnknownFields(raw, STEP_FIELDS, `${workflowId}.steps[${index}]`);
    const id = requiredIdentifier(raw.id, `${workflowId}.steps[${index}].id`, STEP_ID);
    if (seen.has(id)) throw new Error(`${workflowId}.steps contains duplicate ${id}.`);
    seen.add(id);
    return Object.freeze({
      id,
      text: requiredText(raw.text, `${workflowId}.steps[${index}].text`),
    });
  });
  return Object.freeze(steps);
}

function validateDelegation(definition) {
  const text = definition.delegation.join(' ');
  const stepIds = new Set(definition.steps.map(({ id }) => id));
  if (definition.delegationDefault === 'subagent-driven' && definition.roles.length === 0) {
    throw new Error(`Workflow ${definition.id} is subagent-driven but has no bounded role.`);
  }
  for (const role of definition.roles) {
    if (!definition.delegation.some((line) => containsActorId(line, role))) {
      throw new Error(`Workflow ${definition.id} does not assign role ${role} in delegation.`);
    }
  }

  if (definition.roles.length === 0) {
    if (!/main agent|parent|compos(?:e|ed)/i.test(text)) {
      throw new Error(`Workflow ${definition.id} has no roles but does not retain work with the parent.`);
    }
    for (const line of definition.delegation) {
      if (/\b(?:delegate|delegating|fork)\b/i.test(line)
        && !/\b(?:compos(?:e|ed|ing)|do not delegate|before delegating)\b/i.test(line)) {
        throw new Error(`Workflow ${definition.id} delegates to an unlisted generic role.`);
      }
    }
  }

  for (const line of definition.delegation) validateDelegationStepReference(definition.id, line, stepIds);
}

function normalizeDelegationDefault(value, field) {
  if (value === undefined) return 'subagent-driven';
  const delegationDefault = requiredText(value, field);
  if (!DELEGATION_DEFAULTS.has(delegationDefault)) {
    throw new Error(`${field} contains invalid delegation default ${delegationDefault}.`);
  }
  return delegationDefault;
}

function validateDelegationStepReference(workflowId, line, stepIds) {
  const range = line.match(/^steps-(\d+)-(\d+):(?:\s|$)/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (start < 1 || end < start) {
      throw new Error(`Workflow ${workflowId} has invalid delegation step range steps-${start}-${end}.`);
    }
    for (let index = start; index <= end; index += 1) {
      const stepId = `step-${index}`;
      if (!stepIds.has(stepId)) {
        throw new Error(`Workflow ${workflowId} references unknown delegation step ${stepId}.`);
      }
    }
    return;
  }

  const direct = line.match(/^(step-[a-z0-9]+(?:-[a-z0-9]+)*):(?:\s|$)/);
  if (!direct) {
    throw new Error(`Workflow ${workflowId} delegation must start with a step ID or numeric step range: ${line}.`);
  }
  if (!stepIds.has(direct[1])) {
    throw new Error(`Workflow ${workflowId} references unknown delegation step ${direct[1]}.`);
  }
}

function requiredText(value, field) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string.`);
  const text = value.trim();
  if (!text) throw new Error(`${field} must be a non-empty string.`);
  if (/[\r\n]/u.test(text)) throw new Error(`${field} must be a single-line string.`);
  if (RESERVED_MANAGED_MARKER.test(text)) throw new Error(`${field} contains a reserved managed marker.`);
  return text;
}

function requiredStrings(values, field) {
  const result = frozenStrings(values, field);
  if (result.length === 0) throw new Error(`${field} must contain at least one entry.`);
  return result;
}

function frozenStrings(values, field) {
  if (values === undefined) return Object.freeze([]);
  if (!Array.isArray(values)) throw new TypeError(`${field} must be an array.`);
  return Object.freeze(values.map((value, index) => requiredText(value, `${field}[${index}]`)));
}

function frozenUniqueIdentifiers(values, field, pattern) {
  const result = frozenStrings(values, field);
  const seen = new Set();
  for (const value of result) {
    requiredIdentifier(value, field, pattern);
    if (seen.has(value)) throw new Error(`${field} contains duplicate ${value}.`);
    seen.add(value);
  }
  return result;
}

function requiredIdentifier(value, field, pattern) {
  const identifier = requiredText(value, field);
  if (!pattern.test(identifier)) throw new Error(`${field} contains invalid identifier ${identifier}.`);
  return identifier;
}

function containsActorId(value, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const actor = new RegExp(`(?:^|:\\s*|;\\s*|,\\s*(?:and\\s+)?|\\band\\s+)(?:the\\s+)?${escaped}(?=\\s)`, 'i');
  const match = actor.exec(value);
  if (!match) return false;
  const duty = value.slice(match.index + match[0].length);
  return !/^\s*(?:(?:must|should)\s+not|do\s+not|never)\b/i.test(duty);
}

function rejectUnknownFields(value, allowed, field) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`${field} contains unknown field ${unknown.join(', ')}.`);
}
