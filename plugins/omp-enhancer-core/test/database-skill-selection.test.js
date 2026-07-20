import test from 'node:test';
import assert from 'node:assert/strict';

import { databaseWorkflows } from '../src/workflows/definitions/database.js';

test('database workflows expose both relational engines but select only the confirmed engine Skill', () => {
  for (const workflow of databaseWorkflows) {
    assert.ok(workflow.skills.includes('postgres-patterns'), `${workflow.id}: PostgreSQL candidate`);
    assert.ok(workflow.skills.includes('mysql-patterns'), `${workflow.id}: MySQL candidate`);

    const scope = workflow.scopeNotes.join(' ');
    assert.match(
      scope,
      /confirm.+engine.+select.+only.+matching.+engine-specific.+Skill.+postgres-patterns.+mysql-patterns.+do not load both by default/isu,
      `${workflow.id}: conditional engine selection`,
    );
  }
});
