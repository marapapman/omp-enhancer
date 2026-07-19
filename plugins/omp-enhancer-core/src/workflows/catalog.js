import { codeWorkflows } from './definitions/code.js';
import { databaseWorkflows } from './definitions/database.js';
import { generalWorkflows } from './definitions/general.js';
import { growthWorkflows } from './definitions/growth.js';
import { mlWorkflows } from './definitions/ml.js';
import { networkWorkflows } from './definitions/network.js';
import { operationWorkflows } from './definitions/operations.js';
import { researchWorkflows } from './definitions/research.js';
import { writingWorkflows } from './definitions/writing.js';
import { defineWorkflowCatalog } from './schema.js';

export const WORKFLOW_CATALOG_VERSION = 18;

export const workflowDefinitions = defineWorkflowCatalog([
  generalWorkflows,
  writingWorkflows,
  researchWorkflows,
  codeWorkflows,
  networkWorkflows,
  databaseWorkflows,
  mlWorkflows,
  growthWorkflows,
  operationWorkflows,
]);

export const workflowIds = Object.freeze(workflowDefinitions.map(({ id }) => id));

export const workflowCatalog = Object.freeze(Object.fromEntries(
  workflowDefinitions.map((definition) => [definition.id, Object.freeze({
    chooseWhen: definition.chooseWhen,
    composeWith: definition.composeWith,
    steps: Object.freeze(definition.steps.map(({ text }) => text)),
    scopeNotes: definition.scopeNotes,
    skills: definition.skills,
    qualityChecks: definition.qualityChecks,
    riskNotes: definition.riskNotes,
    roles: definition.roles,
    delegation: definition.delegation,
  })]),
));
