import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readSkill(name) {
  return readFileSync(join(pluginRoot, 'skills', 'ecc', name, 'SKILL.md'), 'utf8');
}

function frontmatterOf(skill) {
  return skill.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? '';
}

function descriptionOf(skill) {
  return frontmatterOf(skill).match(/^description:\s*(.+)$/mu)?.[1] ?? '';
}

function compactSkill(name) {
  return readSkill(name).replace(/\s+/gu, ' ');
}

const claudeToolMetadataSkills = [
  'agent-eval',
  'eval-harness',
  'skill-comply',
  'benchmark-optimization-loop',
  'data-throughput-accelerator',
  'latency-critical-systems',
  'recursive-decision-ledger',
  'blender-motion-state-inspection',
  'parallel-execution-optimizer',
];

test('ECC Skill entrypoints do not claim Claude tool permissions', () => {
  for (const name of claudeToolMetadataSkills) {
    assert.doesNotMatch(
      frontmatterOf(readSkill(name)),
      /^tools\s*:/imu,
      `${name}: Skill metadata must not grant or imply a Claude tool surface`,
    );
  }
});

const conditionalDescriptionSkills = [
  'continuous-learning',
  'remotion-video-creation',
  'recsys-pipeline-architect',
  'java-coding-standards',
];

test('ECC Skill descriptions use positive task-local selection conditions', () => {
  for (const name of conditionalDescriptionSkills) {
    const description = descriptionOf(readSkill(name));
    assert.match(description, /\bUse (?:only )?(?:when|for)\b/iu, `${name}: description needs a task-local use condition`);
    assert.doesNotMatch(
      description,
      /\b(?:always|whenever|automatically)\b|route\s+all/iu,
      `${name}: description must not hard-trigger or route requests`,
    );
  }

  assert.doesNotMatch(
    readSkill('remotion-video-creation'),
    /Use this skills whenever/iu,
    'remotion-video-creation: loaded method must stay task-local',
  );
});

const effectBoundarySkills = [
  'agent-eval',
  'recsys-pipeline-architect',
  'codebase-onboarding',
  'exa-search',
  'fal-ai-media',
  'laravel-plugin-discovery',
  'configure-ecc',
];

test('effectful ECC guides preserve exact user and native authority', () => {
  for (const name of effectBoundarySkills) {
    assert.match(
      readSkill(name),
      /explicit\s+user\s+authorization\s+for\s+the\s+exact\s+target\s+and\s+effect\s+plus\s+current\s+native\s+permission/iu,
      `${name}: every external effect needs exact user authorization and native permission`,
    );
  }

  const agentEval = compactSkill('agent-eval');
  assert.match(
    agentEval,
    /installation, task-definition writes, worktree creation, agent or judge commands, and API spend.+distinct effects/isu,
  );

  const recsys = compactSkill('recsys-pipeline-architect');
  assert.match(
    recsys,
    /scaffold writes.+runtime cache, event, counter, or analytics side effects.+target-design examples.+not current-session actions/isu,
  );

  const onboarding = compactSkill('codebase-onboarding');
  assert.match(onboarding, /read-only onboarding.+returns.+in the response.+CLAUDE\.md.+file write/isu);

  for (const name of ['exa-search', 'laravel-plugin-discovery']) {
    const skill = compactSkill(name);
    assert.match(skill, /host MCP configuration.+network (?:query|request|search)/isu, name);
    assert.match(skill, /configuration snippet.+reference.+does not authorize.+host config/isu, name);
  }

  const fal = compactSkill('fal-ai-media');
  assert.match(fal, /host MCP configuration.+cost-bearing generation.+local-file upload/isu);
  assert.match(fal, /named local file.+does not authorize.+upload/isu);

  const configure = compactSkill('configure-ecc');
  assert.match(
    configure,
    /network clone.+installation target.+host configuration.+copied or edited file set.+cleanup deletion.+distinct effects/isu,
  );
  assert.match(configure, /cleanup is never automatic/iu);
});
