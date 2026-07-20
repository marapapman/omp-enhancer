import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const skills = [
  'automation-audit-ops',
  'ecc-tools-cost-audit',
  'email-ops',
  'finance-billing-ops',
  'messages-ops',
  'terminal-ops',
  'article-writing',
  'investor-outreach',
  'crosspost',
  'production-audit',
];

function readSkill(name) {
  return readFileSync(join(pluginRoot, 'skills', 'ecc', name, 'SKILL.md'), 'utf8');
}

test('late-loaded ECC methods remain Main-selected exact-URI extensions', () => {
  for (const name of skills) {
    const content = readSkill(name);

    assert.match(content, /Main selects supporting methods in the initial `WORKFLOW PLAN` when their Skills are visible/iu, `${name}: initial selection`);
    assert.match(content, /already loaded source explicitly reveals its exact same-namespace `skill:\/\/ecc-skill-catalog\/<skill-id>\/SKILL\.md` URI/iu, `${name}: exact revealed extension`);
    assert.match(content, /This Skill provides domain guidance; it does not reroute the task, emit a replacement `WORKFLOW PLAN`, or auto-load another Skill/iu, `${name}: no secondary router`);
    assert.doesNotMatch(content, /Pull these ECC-native skills into the workflow/iu, `${name}: bare pull instruction`);
    assert.doesNotMatch(content, /\bpull\s+`[a-z][a-z0-9-]+`/iu, `${name}: bare method pull`);
    assert.doesNotMatch(content, /\b(?:run|use)\s+`[a-z][a-z0-9-]+`\s+first\b/iu, `${name}: bare first-method instruction`);
    assert.doesNotMatch(content, /\b(?:hand off|route) to\s+`[a-z][a-z0-9-]+`/iu, `${name}: bare method reroute`);

    const revealed = [...content.matchAll(/`skill:\/\/ecc-skill-catalog\/([a-z][a-z0-9-]+)\/SKILL\.md`/gu)];
    assert.ok(revealed.length > 0, `${name}: at least one exact method URI`);
    for (const [, method] of revealed) {
      assert.ok(
        existsSync(join(pluginRoot, 'skills', 'ecc', method, 'SKILL.md')),
        `${name}: revealed method ${method} must resolve in the same namespace`,
      );
    }
  }
});
