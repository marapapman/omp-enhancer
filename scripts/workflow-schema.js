const WORKFLOW_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const RESOURCE_ID = /^[a-z0-9][a-z0-9._/-]*$/;
const WORKFLOW_FIELDS = new Set([
  'id',
  'chooseWhen',
  'skills',
  'catalogSkills',
  'roles',
  'suggestedFlow',
  'scopeNotes',
]);

export function defineWorkflowCatalog(groups = []) {
  const rawDefinitions = groups.flat();
  const seen = new Set();
  return Object.freeze(rawDefinitions.map((raw) => normalizeWorkflow(raw, seen)));
}

function normalizeWorkflow(raw, seen) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Workflow definitions must be objects.');
  }
  rejectUnknownFields(raw, WORKFLOW_FIELDS, 'workflow definition');
  const id = requiredIdentifier(raw.id, 'workflow id', WORKFLOW_ID);
  if (seen.has(id)) throw new Error(`Duplicate workflow id: ${id}.`);
  seen.add(id);

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
    skills,
    catalogSkills,
    roles: frozenUniqueIdentifiers(raw.roles, `${id}.roles`, RESOURCE_ID),
    suggestedFlow: requiredStrings(raw.suggestedFlow, `${id}.suggestedFlow`),
    scopeNotes: frozenStrings(raw.scopeNotes, `${id}.scopeNotes`),
  });
}

function requiredText(value, field) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string.`);
  const text = value.trim();
  if (!text) throw new Error(`${field} must be a non-empty string.`);
  if (/[\r\n]/u.test(text)) throw new Error(`${field} must be a single-line string.`);
  if (/<!--\s*OMP-ENHANCER-(?:WORKFLOW-CATALOG|WORKFLOW-CONTEXT|ADVISOR-WORKFLOW-CONTEXT):(?:START|END)\s*-->/i.test(text)) {
    throw new Error(`${field} contains a reserved managed marker.`);
  }
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

function rejectUnknownFields(value, allowed, field) {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`${field} contains unknown field ${unknown.join(', ')}.`);
}