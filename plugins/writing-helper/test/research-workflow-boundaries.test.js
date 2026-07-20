import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function readSkill(name) {
  return readFileSync(join(rootDir, 'skills', name, 'SKILL.md'), 'utf8');
}

function prose(source) {
  return source.replace(/\s+/gu, ' ').trim();
}

describe('research Skills preserve workflow and host authority boundaries', () => {
  it('keeps phase navigation a Main-selected reference instead of a Skill router', () => {
    const source = readSkill('research-phase-navigation');

    const text = prose(source);

    assert.match(text, /reference checklist/iu);
    assert.match(text, /only after Main has selected and loaded/iu);
    assert.match(text, /does not select, route, or automatically continue/iu);
    assert.match(text, /current(?:ly)? visible Skill inventory/iu);
    assert.match(text, /new `WORKFLOW PLAN`/u);
    assert.match(text, /exact `skill:\/\/research-(?:storyline|literature|socratic|experiment)` URI/iu);
    assert.match(text, /read it and wait/iu);
    assert.doesNotMatch(source, /`skills\/[^`]+\/SKILL\.md`/u);
    assert.match(text, /missing project state path does not mean that a Skill is unavailable/iu);
  });

  it('keeps research methods child-local without taking Main orchestration ownership', () => {
    for (const name of [
      'research-storyline',
      'research-relatedwork-summarizer',
      'research-socratic',
    ]) {
      const source = prose(readSkill(name));

      assert.match(source, /assigned child-local method/iu, `${name} should declare child-local scope`);
      assert.match(source, /does not require Main to execute the method directly/iu, `${name} should remain delegable`);
      assert.match(source, /do not recursively (?:fork|spawn|delegate)/iu, `${name} children must not recurse`);
      assert.match(source, /Main retains the parent TODO, user interaction, and integration/iu, `${name} should preserve Main ownership`);
      assert.match(source, /Return (?:an interactive question|interactive questions|any interactive question) to Main/iu, `${name} should return questions to Main`);
      assert.match(source, /Main decides whether to ask the user/iu, `${name} should leave user interaction to Main`);
    }
  });

  it('makes every research artifact write conditional on explicit authority', () => {
    for (const name of [
      'research-phase-navigation',
      'research-storyline',
      'research-relatedwork-summarizer',
      'research-socratic',
    ]) {
      const source = prose(readSkill(name));

      assert.match(source, /write to `\.pi\/research\/.+` only when the user requested persistent output and the host authorizes that safe path/iu, `${name} should guard .pi writes`);
      assert.match(source, /Otherwise, return the complete result in the conversation/iu, `${name} should provide an in-band result`);
    }
  });

  it('uses pdftotext only through an exposed and authorized shell', () => {
    const source = prose(readSkill('research-relatedwork-summarizer'));

    assert.match(source, /Use `pdftotext` only when a live shell is exposed and the user or host has authorized that command/iu);
    assert.match(source, /Otherwise, use an available document reader or report the extraction limitation/iu);
    assert.doesNotMatch(source, /For PDF files, use bash: pdftotext/iu);
    assert.doesNotMatch(source, /No subagent spawning, no CLI/iu);
  });

  it('retains each Skill\'s concrete research method', () => {
    const navigation = readSkill('research-phase-navigation');
    const storyline = readSkill('research-storyline');
    const relatedWork = readSkill('research-relatedwork-summarizer');
    const socratic = readSkill('research-socratic');

    assert.match(navigation, /storyline → literature → discussion → experiments → writing/u);
    assert.match(storyline, /The 20 Sections/u);
    assert.match(storyline, /Research Problem[\s\S]*Conclusion/u);
    assert.match(relatedWork, /Contribution:[\s\S]*Method:[\s\S]*Relevance:/u);
    assert.match(socratic, /Layer 1 — Clarification[\s\S]*Layer 5 — Implication/u);
  });
});
