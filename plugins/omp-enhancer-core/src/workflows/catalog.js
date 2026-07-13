import { codeWorkflows } from './definitions/code.js';
import { generalWorkflows } from './definitions/general.js';
import { operationWorkflows } from './definitions/operations.js';
import { researchWorkflows } from './definitions/research.js';
import { writingWorkflows } from './definitions/writing.js';
import { defineWorkflowCatalog } from './schema.js';

export const WORKFLOW_CATALOG_VERSION = 10;

export const workflowDefinitions = defineWorkflowCatalog([
  generalWorkflows,
  writingWorkflows,
  researchWorkflows,
  codeWorkflows,
  operationWorkflows,
]);

export const workflowRouteNames = Object.freeze(workflowDefinitions.map(({ id }) => id));

export const workflowRouteCatalog = Object.freeze(Object.fromEntries(
  workflowDefinitions.map((definition) => [definition.id, Object.freeze({
    steps: Object.freeze(definition.steps.map(({ text }) => text)),
    scopeNotes: definition.scopeNotes,
    skills: definition.skills,
    qualityChecks: definition.qualityChecks,
    riskNotes: definition.riskNotes,
    roles: definition.roles,
    delegation: definition.delegation,
  })]),
));
