import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function readSkill(name) {
  return readFileSync(join(pluginRoot, 'skills', name, 'SKILL.md'), 'utf8');
}

test('prototype and spike keep throwaway work inside an authorized scratch effect boundary', () => {
  for (const name of ['prototype', 'spike']) {
    const content = readSkill(name);

    assert.match(
      content,
      /skip(?:ping)? production TDD.+only.+user-authorized.+isolated.+(?:scratch|non-production)/isu,
      `${name}: TDD exception must be scratch-only`,
    );
    assert.match(
      content,
      /(?:never|do not).+automatically.+(?:absorb|fold|extend|promote).+production/isu,
      `${name}: scratch output must not silently become production code`,
    );
    assert.match(
      content,
      /formal(?:ly)? adopt.+new.+code-development.+vertical TDD slice/isu,
      `${name}: production adoption must re-enter code-development TDD`,
    );
    assert.match(
      content,
      /delete.+only.+declared scratch write set.+explicit.+authoriz/isu,
      `${name}: deletion authority must be explicit and bounded`,
    );
    assert.match(
      content,
      /(?:never|do not).+automatically.+(?:delete|commit)/isu,
      `${name}: cleanup and commit must not be automatic`,
    );
    assert.match(content, /(?:define|state|write down).+(?:question|problem)/isu, `${name}: define the question`);
    assert.match(content, /timebox/iu, `${name}: retain a timebox`);
    assert.match(content, /(?:one command|runnable).+(?:experiment|prototype)/isu, `${name}: retain a runnable experiment`);
    assert.match(content, /(?:collect|capture|record|return).+evidence/isu, `${name}: retain evidence`);
    assert.match(content, /(?:conclusion|decision|verdict|answer)/iu, `${name}: retain a conclusion method`);
  }
});

test('git worktree isolation never expands repository, install, network, or cleanup authority', () => {
  const content = readSkill('using-git-worktrees');

  assert.match(content, /prefer.+native worktree tools/isu);
  assert.match(content, /submodule guard/iu);
  assert.match(content, /dirty (?:tree|worktree).+(?:record|report|evidence)/isu);
  assert.match(content, /baseline.+evidence/isu);
  assert.match(
    content,
    /worktree consent.+does not authorize.+(?:modify|commit).+\.gitignore.+dependency install.+download.+network.+branch cleanup/isu,
  );
  assert.match(
    content,
    /project-local.+not ignored.+(?:safe location outside|outside the repository).+or.+single-effect authorization/isu,
  );
  assert.match(
    content,
    /setup command.+only.+current host.+tool.+permission.+user.+effect boundary.+otherwise.+report.+not run/isu,
  );
  assert.doesNotMatch(content, /If NOT ignored:\s*Add to \.gitignore, commit the change/iu);
  assert.doesNotMatch(content, /if \[ -f package\.json \]; then npm install; fi/iu);
  assert.doesNotMatch(content, /Then run setup and baseline tests in place/iu);
  assert.doesNotMatch(content, /Follow priority: existing > global legacy > instruction file > default/iu);
  assert.doesNotMatch(content, /git branch -[dD]|git worktree remove/iu);
});
