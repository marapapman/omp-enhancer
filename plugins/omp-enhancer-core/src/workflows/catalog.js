import { codeWorkflows } from './definitions/code.js';
import { writingWorkflows } from './definitions/writing.js';
import { researchWorkflows } from './definitions/research.js';
import { visualWorkflows } from './definitions/visual.js';
import { operationsWorkflows } from './definitions/operations.js';
import { defineWorkflowCatalog } from './schema.js';

export const WORKFLOW_CATALOG_VERSION = 33;

export const workflowDefinitions = defineWorkflowCatalog([
  codeWorkflows,
  writingWorkflows,
  researchWorkflows,
  visualWorkflows,
  operationsWorkflows,
]);

export const workflowIds = Object.freeze(workflowDefinitions.map(({ id }) => id));

export const workflowCatalog = Object.freeze(Object.fromEntries(
  workflowDefinitions.map((definition) => [definition.id, Object.freeze({
    chooseWhen: definition.chooseWhen,
    scopeNotes: definition.scopeNotes,
    skills: definition.skills,
    catalogSkills: definition.catalogSkills,
    roles: definition.roles,
    suggestedFlow: definition.suggestedFlow,
  })]),
));
