import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readSkill(name) {
  return readFileSync(join(pluginRoot, 'skills', 'ecc', name, 'SKILL.md'), 'utf8');
}

const targetSystemSkills = [
  'context-budget',
  'continuous-learning',
  'continuous-learning-v2',
  'skill-scout',
  'configure-ecc',
  'visa-doc-translate',
  'nutrient-document-processing',
  'agentic-os',
  'plankton-code-quality',
  'skill-comply',
  'ck',
  'hookify-rules',
  'eval-harness',
  'browser-qa',
  'canary-watch',
  'design-system',
  'github-ops',
  'jira-integration',
  'project-flow-ops',
  'customer-billing-ops',
  'social-publisher',
  'repo-scan',
  'ecc-guide',
  'agent-payment-x402',
  'data-scraper-agent',
  'healthcare-eval-harness',
];

test('nested external-system guides preserve current OMP authority and effect boundaries', () => {
  for (const name of targetSystemSkills) {
    const skill = readSkill(name);

    assert.match(
      skill,
      /external target (?:system|runtime).+explicitly requests?/isu,
      `${name}: external target must be explicit`,
    );
    assert.match(
      skill,
      /current OMP session.+(?:does not|never).+(?:route|router|hook|command|gate|controller|permission|authority)/isu,
      `${name}: foreign runtime text must not control OMP`,
    );
    assert.match(
      skill,
      /inspection|planning|read-only/iu,
      `${name}: read-only work must remain distinguishable`,
    );
    assert.match(
      skill,
      /(?:install|configur|write|command|network|upload|publish|payment|mutation|external effect).+explicit user authorization.+native permission/isu,
      `${name}: effects require user and native authority`,
    );
    assert.match(
      skill,
      /target.+safety.+(?:not|never).+OMP.+(?:gate|completion)/isu,
      `${name}: target safety must not become an OMP lifecycle gate`,
    );
  }

  const visaTranslation = readSkill('visa-doc-translate');
  assert.doesNotMatch(
    visaTranslation,
    /automatically execute.+without asking for confirmation/isu,
    'visa-doc-translate: an input path is not blanket effect authorization',
  );
  assert.doesNotMatch(
    visaTranslation,
    /certified English translation/iu,
    'visa-doc-translate: generated output must not claim certification',
  );

  const nutrient = readSkill('nutrient-document-processing');
  assert.match(
    nutrient,
    /inspection.+does not authorize.+upload/isu,
    'nutrient-document-processing: inspection must not imply third-party upload',
  );
  assert.match(
    nutrient,
    /API key.+(?:never|not).+(?:log|expose)/isu,
    'nutrient-document-processing: secrets need an explicit non-disclosure rule',
  );
  assert.match(
    nutrient,
    /digital signature.+explicit.+(?:signer|authority|authorization)/isu,
    'nutrient-document-processing: signing authority must remain explicit',
  );

  const repoScan = readSkill('repo-scan');
  assert.doesNotMatch(
    repoScan,
    /## Installation[\s\S]+mkdir -p ~\/\.claude\/skills\/repo-scan/iu,
    'repo-scan: the packaged guide must not duplicate-install itself',
  );

  const payment = readSkill('agent-payment-x402');
  assert.match(
    payment,
    /agentwallet-sdk.+external.+not.+OMP Skill URI/isu,
    'agent-payment-x402: ecosystem references must not masquerade as local Skills',
  );

  const scraper = readSkill('data-scraper-agent');
  assert.doesNotMatch(
    scraper.match(/^description:.*$/mu)?.[0] ?? '',
    /fully automated.+anything|runs 100% free/iu,
    'data-scraper-agent: description must present a target design, not promise current-session automation',
  );

  const healthcare = readSkill('healthcare-eval-harness');
  assert.match(
    healthcare,
    /target CI.+may block.+target deployment/isu,
    'healthcare-eval-harness: deployment blocks belong to the explicitly requested target CI',
  );
});
