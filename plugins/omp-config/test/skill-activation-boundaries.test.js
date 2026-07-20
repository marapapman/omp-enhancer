import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readSkill(...parts) {
  return readFileSync(join(pluginRoot, 'skills', ...parts, 'SKILL.md'), 'utf8');
}

function descriptionOf(skill) {
  return skill.match(/^description:\s*(.+)$/mu)?.[1] ?? '';
}

test('svg-flowchart metadata uses a positive task-local trigger instead of a hard activation rule', () => {
  const skill = readSkill('svg-flowchart');
  const description = descriptionOf(skill);

  assert.match(description, /Use when the task is to create or revise/iu);
  assert.doesNotMatch(description, /\b(?:whenever|always|must)\b/iu);
  assert.doesNotMatch(skill, /## When to Activate/iu);
});

test('motion-foundations participates only through the staged Skill plan and never selects itself', () => {
  const skill = readSkill('ecc', 'motion-foundations');
  const description = descriptionOf(skill);

  assert.match(description, /Use when.+shared React.+motion foundation/iu);
  assert.doesNotMatch(description, /all other motion skills depend|\b(?:always|must)\b.+(?:load|use)/iu);
  assert.match(skill, /current(?:ly)? visible OMP.+initial\s+`WORKFLOW PLAN`/isu);
  assert.match(skill, /already-loaded motion Skill.+`RESOURCE EXTENSION`/isu);
  assert.match(skill, /native `skill-prompt`.+already loaded/isu);
  assert.match(skill, /does not select itself.+does not automatically reselect.+workflow.+Skill/isu);
  assert.doesNotMatch(skill, /Load this skill before any animation work begins|## When to Activate/iu);
});

test('Claude-centric knowledge and harness guides are external-host examples, not OMP routers', () => {
  for (const name of ['knowledge-ops', 'autonomous-agent-harness']) {
    const skill = readSkill('ecc', name);
    const description = descriptionOf(skill);

    assert.doesNotMatch(
      description,
      /\b(?:whenever|always|automatically)\b|fully autonomous|replaces standalone/iu,
      `${name}: frontmatter must not claim automatic activation or current-host replacement`,
    );
    assert.match(
      skill,
      /external Claude Code host example.+may.+load.+session start.+current OMP.+does not assume/isu,
      `${name}: Claude startup loading must be explicitly external and conditional`,
    );
    assert.match(skill, /schedule.+persistent memory.+dispatch/isu, `${name}: effects named`);
    assert.match(
      skill,
      /(?:exact named target and operation.+explicit user authorization|explicit user authorization.+exact named target and operation)/isu,
      `${name}: authority must identify the exact target and operation`,
    );
    assert.match(skill, /native permission/iu, `${name}: native permission remains authoritative`);
    assert.match(
      skill,
      /does not.+(?:choose|reselect).+workflow.+Skill/isu,
      `${name}: body must not become a second Skill router`,
    );
    assert.doesNotMatch(skill, /## When to Activate|\*\*Automatically loaded at session start\*\*/iu);
  }
});
