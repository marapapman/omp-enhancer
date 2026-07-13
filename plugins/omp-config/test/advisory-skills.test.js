import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('global guidance selects workflow and skills before substantive work without creating a gate', () => {
  const files = [
    'assets/CLAUDE.md',
    'skills/using-superpowers/SKILL.md',
  ];

  for (const relative of files) {
    const content = readFileSync(join(pluginRoot, relative), 'utf8');
    const workflow = content.indexOf('1. Determine the applicable workflow');
    const inventory = content.indexOf('2. Inspect the active skill inventory');
    const todo = content.indexOf('3. Initialize the native `todo`');
    const load = content.indexOf('4. Load each selected skill');
    const fork = content.indexOf('5. Fork multiple independent workstreams');
    const work = content.indexOf('6. Execute and update the TODO');

    assert.ok(workflow >= 0, `${relative} should start with workflow selection`);
    assert.ok(
      workflow < inventory && inventory < todo && todo < load && load < fork && fork < work,
      `${relative} should preserve workflow-first TODO and delegation ordering`,
    );
    assert.match(content, /native `skill-prompt`/i, relative);
    assert.match(content, /do not read the same (?:`SKILL\.md`|skill) again/i, relative);
    assert.match(content, /`writing\.pending`[\s\S]{0,240}(?:continue skill selection|skill selection)/i, relative);
    assert.match(content, /Memory, `recall`, `learn`, general model ability, and `manage_skill`/i, relative);
    assert.match(content, /autolearn-nudge[\s\S]{0,220}do not resume the primary task/i, relative);
    assert.match(content, /continue\s+with\s+the\s+best\s+available\s+method/i, relative);
    assert.doesNotMatch(content, /block:\s*true|continue:\s*true|triggerTurn\s*\(/i, relative);
  }
});

test('workflow skills do not instruct the agent to self-block or repeat unchanged work', () => {
  const files = [
    'skills/test-driven-development/SKILL.md',
    'skills/systematic-debugging/SKILL.md',
    'skills/brainstorming/SKILL.md',
    'skills/executing-plans/SKILL.md',
    'skills/ecc/ai-regression-testing/SKILL.md',
    'skills/ecc/security-scan/SKILL.md',
    'skills/ecc/gateguard/SKILL.md',
    'skills/ecc/safety-guard/SKILL.md',
    'skills/ecc/verification-loop/SKILL.md',
  ];
  const prohibited = /NO (?:PRODUCTION CODE|FIXES)|MANDATORY\.|re-?run until|retry until|repeat until|STOP and fix|block the first|DENY\s+—|must be installed|stop and ask|offer MUST be its own message/i;

  for (const relative of files) {
    const content = readFileSync(join(pluginRoot, relative), 'utf8');
    assert.doesNotMatch(content, prohibited, relative);
  }
});

test('compatibility guard skills explicitly remain advisory', () => {
  for (const relative of [
    'skills/ecc/gateguard/SKILL.md',
    'skills/ecc/safety-guard/SKILL.md',
    'skills/ecc/verification-loop/SKILL.md',
  ]) {
    const content = readFileSync(join(pluginRoot, relative), 'utf8');
    assert.match(content, /advisory/i, relative);
    assert.match(content, /does not|doesn't/i, relative);
  }
});

test('bundled reviewers report limitations without self-stopping or mandatory dispatch', () => {
  const agentsDir = join(pluginRoot, 'agents');
  const files = readdirSync(agentsDir)
    .filter((name) => name.endsWith('reviewer.md'))
    .sort();
  const prohibited = /MUST\s+BE\s+USED|Use\s+PROACTIVELY|stop\s+(?:and|the\s+review)|\band\s+stop\b|halt\s+review|review\s+should\s+wait|confirm\s+green\s+before\s+proceeding|Verdict:\s*BLOCK|\*\*Block\*\*|\|\s*block\s*\|/i;
  const unchangedLoop = /(?:re-?run|retry|repeat)[^\n]{0,40}\buntil\b|\buntil\b[^\n]{0,40}(?:re-?run|retry|repeat)/i;

  assert.ok(files.length > 0);
  for (const file of files) {
    const content = readFileSync(join(agentsDir, file), 'utf8');
    assert.doesNotMatch(content, prohibited, file);
    assert.doesNotMatch(content, unchangedLoop, file);
  }
});

test('bundled agent guidance stays advisory, bounded, and host-authorized', () => {
  const agentsDir = join(pluginRoot, 'agents');
  const files = readdirSync(agentsDir)
    .filter((name) => name.endsWith('.md'))
    .sort();
  const prohibited = /MUST\s+BE\s+USED|Use\s+PROACTIVELY|FULL\s+access\s+to\s+all\s+tools|blocks\s+completion\s+until|physically\s+cannot\s+skip|action:\s*block|Resume\s+only\s+after\s+verification\s+passes|Iterate\s+until\s+build\s+passes|MUST\s+keep\s+going\s+until|Gate\s+every\s+output|iterates?\s+until\s+quality\s+threshold|feedback\s+items\s+are\s+not\s+suggestions/i;

  assert.ok(files.length > 0);
  for (const file of files) {
    const content = readFileSync(join(agentsDir, file), 'utf8');
    assert.doesNotMatch(content, prohibited, file);
  }
});

test('build resolvers use bounded exit guidance instead of workflow gates', () => {
  const agentsDir = join(pluginRoot, 'agents');
  const files = readdirSync(agentsDir)
    .filter((name) => /build.*resolver\.md$/i.test(name))
    .sort();
  const prohibited = /##\s+Stop\s+Conditions|Stop\s+and\s+report\s+if:|MUST\s+BE\s+USED|Use\s+PROACTIVELY/i;

  assert.ok(files.length > 0);
  for (const file of files) {
    const content = readFileSync(join(agentsDir, file), 'utf8');
    assert.doesNotMatch(content, prohibited, file);
    assert.match(content, /bounded|after\s+3\s+fix\s+attempts|at\s+most\s+one/i, file);
  }
});
