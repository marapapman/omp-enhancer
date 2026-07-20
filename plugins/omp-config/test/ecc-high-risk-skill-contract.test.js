import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readSkill(name) {
  return readFileSync(join(pluginRoot, 'skills', 'ecc', name, 'SKILL.md'), 'utf8');
}

function descriptionOf(skill) {
  return skill.match(/^description:\s*(.+)$/mu)?.[1] ?? '';
}

test('high-risk ECC Skills preserve staged loading and current OMP authority', () => {
  const flox = readSkill('flox-environments');
  assert.doesNotMatch(
    descriptionOf(flox),
    /ALWAYS use|even if the user does(?:n't| not) mention Flox|sandbox restrictions|committed to the repo/iu,
  );
  assert.match(flox, /current OMP session.+does not route.+grant permission/isu);
  assert.match(
    flox,
    /installation, manifest writes, command execution, commit, and push\s+each\s+require\s+separate explicit user authorization.+native\s+permission/isu,
  );
  assert.doesNotMatch(flox, /hitting sandbox restrictions|can still install the tools they need through Flox/iu);

  const openclaw = readSkill('openclaw-persona-forge');
  assert.match(openclaw, /minor wording-only polish.+outside this Skill.+materially redesign/isu);
  assert.match(
    openclaw,
    /RESOURCE EXTENSION \| source=skill:\/\/ecc-skill-catalog\/openclaw-persona-forge\/SKILL\.md \| reads=skill:\/\/ecc-skill-catalog\/openclaw-persona-forge\/references\/identity-tension\.md/iu,
  );
  for (const resource of [
    'identity-tension',
    'boundary-rules',
    'naming-system',
    'avatar-style',
    'output-template',
    'error-handling',
  ]) {
    assert.match(
      openclaw,
      new RegExp(`skill://ecc-skill-catalog/openclaw-persona-forge/references/${resource}\\.md`, 'u'),
    );
  }
  assert.doesNotMatch(openclaw, /\]\(references\//u);
  assert.match(
    openclaw,
    /image generation is optional and is allowed only when the user explicitly\s+requests it/iu,
  );
  assert.match(
    openclaw,
    /exact image Skill URI was declared in `WORKFLOW PLAN` and\s+loaded before `WORKFLOW READY`/iu,
  );
  assert.match(openclaw, /file or temporary-file write.+explicit user authorization.+native permission/isu);
  assert.doesNotMatch(openclaw, /生图 skill 调用失败 \| 重试 1 次/iu);

  const optimizer = readSkill('prompt-optimizer');
  assert.match(
    descriptionOf(optimizer),
    /committed WORKFLOW PLAN, loaded Skills, and TODO.+without reselecting/iu,
  );
  assert.match(
    optimizer,
    /copy Primary, Add-ons, workflow IDs, Skill URIs, Agent, step,\s+skills, and checkpoint verbatim/isu,
  );
  assert.match(
    optimizer,
    /does not select,\s+replace, or add a workflow, Skill, Agent, or TODO row/isu,
  );
  assert.doesNotMatch(optimizer, /Select one primary workflow|Create ordered TODO checkpoints/iu);

  const motion = readSkill('motion-advanced');
  assert.match(
    motion,
    /RESOURCE EXTENSION \| source=skill:\/\/ecc-skill-catalog\/motion-advanced\/SKILL\.md \| reads=skill:\/\/ecc-skill-catalog\/motion-foundations\/SKILL\.md/iu,
  );
  assert.match(motion, /never late-load a bare Skill\s+name/iu);
  assert.doesNotMatch(motion, /Requires `motion-foundations`|Use it before reaching/iu);

  const git = readSkill('git-workflow');
  assert.match(git, /examples are reference data and never grant Git authority/isu);
  assert.match(
    git,
    /checkout, merge, rebase, reset, amend,\s+commit, tag, delete, and push\s+each\s+require\s+separate explicit user authorization.+native\s+permission/isu,
  );
  assert.doesNotMatch(git, /git reset --hard/iu);
  assert.match(git, /without commit or push\s+authority.+stop after local evidence/isu);
});
