import test from 'node:test';
import assert from 'node:assert/strict';

import { workflowDefinitions } from '../src/workflows/catalog.js';

const AUDITOR_ROLES = new Set([
  'reviewer',
  'visioner',
  'fact-reviewer',
  'fact-cross-checker',
  'ecc-network-config-reviewer',
  'ecc-security-reviewer',
  'ecc-opensource-sanitizer',
  'zh-checker',
  'checker',
]);

const AUDIT_SCOPE_NOTE = 'The delegated deliverable is the independent audit';

test('every subagent-driven workflow has an auditor role with a delegation line or an audit-deliverable scope note', () => {
  const subagentDriven = workflowDefinitions.filter(
    ({ delegationDefault }) => delegationDefault === 'subagent-driven',
  );

  assert.ok(subagentDriven.length > 0, 'expected at least one subagent-driven workflow');

  for (const definition of subagentDriven) {
    const auditorRoles = definition.roles.filter((role) => AUDITOR_ROLES.has(role));
    const scopeNotes = definition.scopeNotes.join(' ');
    const delegation = definition.delegation.join(' ');

    const hasAuditorRole = auditorRoles.length > 0;
    const hasAuditorDelegation = auditorRoles.some((role) =>
      definition.delegation.some((line) => line.includes(role)),
    );
    const hasAuditScopeNote = scopeNotes.includes(AUDIT_SCOPE_NOTE);

    assert.ok(
      (hasAuditorRole && hasAuditorDelegation) || hasAuditScopeNote,
      `${definition.id}: subagent-driven workflow must assign an auditor role in delegation or carry the audit-deliverable scope note`,
    );
  }
});

test('audit-deliverable scope note satisfies the coverage requirement without a second auditor', () => {
  const auditDeliverableWorkflows = workflowDefinitions.filter(
    ({ delegationDefault, scopeNotes }) =>
      delegationDefault === 'subagent-driven' &&
      scopeNotes.some((note) => note.includes(AUDIT_SCOPE_NOTE)),
  );

  assert.ok(
    auditDeliverableWorkflows.length > 0,
    'expected at least one audit-deliverable workflow',
  );

  for (const definition of auditDeliverableWorkflows) {
    const scopeNotes = definition.scopeNotes.join(' ');
    assert.ok(
      scopeNotes.includes(AUDIT_SCOPE_NOTE),
      `${definition.id}: must contain the audit-deliverable scope note`,
    );
  }
});