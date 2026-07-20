import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readSkill(name) {
  return readFileSync(join(pluginRoot, 'skills', 'ecc', name, 'SKILL.md'), 'utf8');
}

test('regulated overlays expose exact nested resources without late routing', () => {
  const oracle = readSkill('prediction-market-oracle-research');
  assert.match(
    oracle,
    /skill:\/\/ecc-skill-catalog\/llm-trading-agent-security\/SKILL\.md/iu,
  );
  assert.match(oracle, /PLAN.+declare.+exact URI|exact URI.+RESOURCE EXTENSION/isu);
  assert.doesNotMatch(oracle, /run `llm-trading-agent-security`/iu);

  const hipaa = readSkill('hipaa-compliance');
  assert.match(
    hipaa,
    /skill:\/\/ecc-skill-catalog\/healthcare-phi-compliance\/SKILL\.md/iu,
  );
  assert.match(hipaa, /PLAN.+select.+exact URI/isu);
  assert.match(hipaa, /does not reselect.+workflow|does not change.+committed PLAN/isu);
  assert.doesNotMatch(hipaa, /Use `healthcare-phi-compliance`/iu);
});
