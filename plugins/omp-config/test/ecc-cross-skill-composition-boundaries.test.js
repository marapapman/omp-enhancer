import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const eccRoot = join(pluginRoot, 'skills', 'ecc');

const candidatesBySkill = new Map([
  ['agent-architecture-audit', [
    'skill://ecc-skill-catalog/agent-introspection-debugging/SKILL.md',
    'skill://ecc-skill-catalog/security-review/SKILL.md',
    'skill://ecc-skill-catalog/security-scan/SKILL.md',
    'skill://ecc-skill-catalog/agent-eval/SKILL.md',
    'skill://ecc-skill-catalog/autonomous-agent-harness/SKILL.md',
    'skill://ecc-skill-catalog/agent-harness-construction/SKILL.md',
  ]],
  ['backend-patterns', [
    'skill://ecc-skill-catalog/api-design/SKILL.md',
    'skill://ecc-skill-catalog/security-review/SKILL.md',
  ]],
  ['coding-standards', [
    'skill://ecc-skill-catalog/frontend-patterns/SKILL.md',
    'skill://ecc-skill-catalog/backend-patterns/SKILL.md',
    'skill://ecc-skill-catalog/api-design/SKILL.md',
  ]],
  ['investor-materials', [
    'skill://ecc-skill-catalog/frontend-slides/SKILL.md',
  ]],
  ['ito-data-atlas-agent', [
    'skill://ecc-skill-catalog/deep-research/SKILL.md',
    'skill://ecc-skill-catalog/x-api/SKILL.md',
    'skill://ecc-skill-catalog/ito-market-intelligence/SKILL.md',
    'skill://ecc-skill-catalog/ito-basket-compare/SKILL.md',
    'skill://ecc-skill-catalog/prediction-market-risk-review/SKILL.md',
  ]],
  ['mle-workflow', [
    'skill://ecc-skill-catalog/code-documentation/SKILL.md',
  ]],
  ['product-lens', [
    'skill://ecc-skill-catalog/product-capability/SKILL.md',
    'skill://ecc-skill-catalog/browser-qa/SKILL.md',
    'skill://ecc-skill-catalog/design-system/SKILL.md',
    'skill://ecc-skill-catalog/canary-watch/SKILL.md',
  ]],
  ['video-editing', [
    'skill://ecc-skill-catalog/fal-ai-media/SKILL.md',
    'skill://ecc-skill-catalog/videodb/SKILL.md',
    'skill://ecc-skill-catalog/content-engine/SKILL.md',
  ]],
  ['windows-desktop-e2e', [
    'skill://ecc-skill-catalog/e2e-testing/SKILL.md',
    'skill://ecc-skill-catalog/cpp-testing/SKILL.md',
    'skill://ecc-skill-catalog/cpp-coding-standards/SKILL.md',
  ]],
  ['fastapi-patterns', [
    'skill://code-development',
    'skill://ecc-skill-catalog/python-patterns/SKILL.md',
    'skill://ecc-skill-catalog/python-testing/SKILL.md',
    'skill://ecc-skill-catalog/api-design/SKILL.md',
  ]],
  ['strategic-compact', [
    'skill://ecc-skill-catalog/tdd-workflow/SKILL.md',
    'skill://ecc-skill-catalog/security-review/SKILL.md',
    'skill://ecc-skill-catalog/deployment-patterns/SKILL.md',
    'skill://ecc-skill-catalog/continuous-learning-v2/SKILL.md',
  ]],
]);

function readSkill(name) {
  return readFileSync(join(eccRoot, name, 'SKILL.md'), 'utf8');
}

function withoutCodeFences(content) {
  return content.replace(/```[\s\S]*?```/gu, '');
}

function uriPath(uri) {
  if (uri === 'skill://code-development') {
    return join(pluginRoot, 'skills', 'code-development', 'SKILL.md');
  }
  const prefix = 'skill://ecc-skill-catalog/';
  assert.ok(uri.startsWith(prefix), `unsupported URI in fixture: ${uri}`);
  return join(eccRoot, uri.slice(prefix.length));
}

test('cross-Skill ECC guides preserve Main-owned initial composition', () => {
  for (const [name, candidates] of candidatesBySkill) {
    const content = withoutCodeFences(readSkill(name));

    assert.match(content, /Main owns cross-Skill composition/iu, `${name}: Main composition ownership`);
    assert.match(content, /initial `WORKFLOW PLAN`[\s\S]{0,240}before\s+`WORKFLOW READY`/iu, `${name}: initial PLAN and pre-READY load`);
    assert.match(content, /loaded Skill does not reselect, reroute,\s+auto-load, or hand off to another Skill/iu, `${name}: no second router`);
    assert.match(content, /does not replace the parent TODO or\s+Main's Agent choice/iu, `${name}: no TODO or Agent takeover`);
    assert.match(content, /exact same-namespace[\s\S]{0,180}`RESOURCE EXTENSION`[\s\S]{0,180}before `COMMIT`/iu, `${name}: bounded exact-URI extension`);

    assert.doesNotMatch(content, /\bpair this skill with\b|\bhand off to\s+`|\bthe next lane is\s+`|\bSkills load only when triggered\b/iu, `${name}: no late composition imperative`);

    for (const uri of candidates) {
      assert.ok(content.includes(`\`${uri}\``), `${name}: exposes ${uri}`);
      assert.ok(existsSync(uriPath(uri)), `${name}: ${uri} resolves`);
    }
  }
});

test('ML workflow mappings are planning hints rather than a post-load router', () => {
  const content = withoutCodeFences(readSkill('mle-workflow'));

  assert.match(content, /Main chooses the Primary and Add-ons in the initial `WORKFLOW PLAN`/iu);
  assert.match(content, /`ml\.review`[\s\S]*`ml\.debug`[\s\S]*`code\.dev`[\s\S]*non-routing fit hints/iu);
  assert.doesNotMatch(content, /route a[\s\S]{0,100}through `ml\.(?:review|debug)`/iu);
});

test('strategic compaction trigger table is external design data, not a current router', () => {
  const content = withoutCodeFences(readSkill('strategic-compact'));

  assert.match(content, /external target-runtime design example/iu);
  assert.match(content, /does not trigger or load a current OMP Skill/iu);
  assert.doesNotMatch(content, /Skills load only when triggered/iu);
});
