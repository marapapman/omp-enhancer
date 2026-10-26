import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const packageRoot = () => join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = () => join(packageRoot(), '..', '..');

function readAsset(name) {
  return readFileSync(join(packageRoot(), 'assets', name), 'utf8');
}

function reminderLines(text) {
  return text
    .split('\n')
    .filter((line) => line.startsWith('Writing-norm reminder (zh/en, advisory):') || line.startsWith('Information-gain part of the one-shot writing-norm reminder'));
}

describe('sentence-level writing-norm reminder contracts', () => {
  it('keeps AGENTS and CLAUDE reminder paragraphs byte-identical with both new bans', () => {
    const agents = reminderLines(readAsset('AGENTS.md'));
    const claude = reminderLines(readAsset('CLAUDE.md'));
    assert.equal(agents.length, 2);
    assert.deepEqual(agents, claude);
    for (const line of agents) {
      assert.match(line, /necessary qualifier|necessary qualification/u);
    }
    assert.match(agents[0], /the sentence-level restatement ban/u);
    assert.match(agents[0], /the unscoped-absolute ban/u);
    assert.match(agents[0], /都\/只能\/任何\/一定 plus 必然\/始终\/绝不\/全部\/唯一/u);
    assert.match(agents[0], /This is a reminder duty, not a blocking authority/u);
    assert.match(agents[1], /setup → emphasis → restatement/u);
    assert.match(agents[1], /never becomes a second message/u);
    assert.match(agents[1], /Main calls writing_ai_scan with detector=ensemble and allowNetwork=true on the exact final text before checker review and delivery/u);
    assert.match(agents[1], /local-only scan as a separately labelled fallback/u);
    assert.match(agents[1], /keeps the scan advisory rather than a completion gate/u);
  });

  it('carries the same bans into the indented WATCHDOG block without a second reminder', () => {
    const watchdog = readAsset('WATCHDOG.yml');
    assert.match(watchdog, /^ {2}Writing-norm reminder \(zh\/en, advisory\):/mu);
    assert.match(watchdog, /the sentence-level restatement ban/u);
    assert.match(watchdog, /the unscoped-absolute ban/u);
    assert.match(watchdog, /^ {2}Information-gain part of the one-shot writing-norm reminder/mu);
    assert.equal(watchdog.match(/the sentence-level restatement ban/gu)?.length, 1);
    assert.equal(watchdog.match(/the unscoped-absolute ban/gu)?.length, 1);
    assert.match(watchdog, /Main calls writing_ai_scan with detector=ensemble and allowNetwork=true on the exact final text before checker review and delivery/u);
    assert.match(watchdog, /keeps the scan advisory rather than a completion gate/u);
  });

  it('keeps the repository Advisor duty advisory while naming both sentence-level bans', () => {
    const rootAgents = readFileSync(join(repoRoot(), 'AGENTS.md'), 'utf8');
    const advisor = rootAgents.split('\n').find((line) => line.startsWith('The Advisor carries a bilingual writing-norm reminder duty:'));
    assert.ok(advisor, 'root Advisor paragraph exists');
    assert.match(advisor, /the sentence-level restatement ban/u);
    assert.match(advisor, /the unscoped-absolute ban/u);
    assert.match(advisor, /The reminder is advisory: the Advisor never rewrites the deliverable and never withholds acceptance on phrasing alone/u);
  });

  it('applies sentence-level bans to canvas and frontend copy guidance', () => {
    const canvas = readFileSync(join(packageRoot(), 'skills', 'canvas-design', 'SKILL.md'), 'utf8');
    assert.match(canvas, /no sentence-level restatement/u);
    assert.match(canvas, /no unscoped absolutes \(all, any, only, always, never, every, must, exactly\)/u);
    assert.match(canvas, /never justifies dropping a fact, number, or citation/u);

    const frontend = readFileSync(join(packageRoot(), 'skills', 'frontend-design', 'SKILL.md'), 'utf8');
    assert.match(frontend, /no sentence-level restatement/u);
    assert.match(frontend, /no unscoped absolutes \(all, any, only, always, never, every, must, exactly\)/u);
    assert.match(frontend, /Keep the product's real nouns, numbers, and error details/u);
  });
});
