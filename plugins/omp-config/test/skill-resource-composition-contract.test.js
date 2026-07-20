import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const eccRoot = join(pluginRoot, 'skills', 'ecc');

const lateComposition = new Map([
  ['motion-patterns', ['motion-foundations', 'motion-advanced']],
  ['content-engine', ['brand-voice', 'crosspost', 'x-api']],
  ['connections-optimizer', ['x-api', 'lead-intelligence', 'social-graph-ranker', 'exa-search', 'deep-research', 'brand-voice', 'content-engine']],
  ['ito-market-intelligence', ['deep-research', 'exa-search', 'x-api', 'market-research', 'prediction-market-risk-review']],
  ['ito-trade-planner', ['prediction-market-risk-review']],
  ['social-graph-ranker', ['lead-intelligence', 'connections-optimizer', 'brand-voice', 'x-api']],
  ['x-api', ['brand-voice', 'content-engine', 'crosspost', 'connections-optimizer']],
  ['agent-introspection-debugging', ['verification-loop', 'continuous-learning-v2', 'council', 'workspace-surface-audit']],
]);

const exactResourceEntries = [
  ['ecc/angular-developer', 'skill://ecc-skill-catalog/angular-developer/SKILL.md'],
  ['ecc/remotion-video-creation', 'skill://ecc-skill-catalog/remotion-video-creation/SKILL.md'],
  ['ecc/videodb', 'skill://ecc-skill-catalog/videodb/SKILL.md'],
  ['ecc/tinystruct-patterns', 'skill://ecc-skill-catalog/tinystruct-patterns/SKILL.md'],
  ['ecc/brand-voice', 'skill://ecc-skill-catalog/brand-voice/SKILL.md'],
  ['prototype', 'skill://prototype'],
  ['grill-with-docs', 'skill://grill-with-docs'],
  ['improve-codebase-architecture', 'skill://improve-codebase-architecture'],
];

// token-budget-advisor is the twelfth relative-resource entry after the three
// React compatibility lists; these four are cross-Skill PLAN candidates rather
// than resources that the already-loaded source may traverse directly.
const crossSkillNavigationEntries = [
  'ecc/react-patterns',
  'ecc/react-performance',
  'ecc/react-testing',
  'ecc/token-budget-advisor',
];

const writingAddonEffectfulEntries = [
  'latex-beamer-slides',
  'beamer-to-powerpoint',
  'svg-flowchart',
  'docx',
  'slides-storyline',
  'ecc/brand-voice',
  'ecc/seo',
  'ecc/benchmark',
  'ecc/opensource-pipeline',
  'frontend-design',
  'canvas-design',
  'finishing-a-development-branch',
  'ecc/security-scan',
];

const writingAddonResearchEntries = [
  'ecc/research-ops',
  'ecc/deep-research',
  'ecc/market-research',
  'ecc/marketing-campaign',
];

function readSkill(relative) {
  return readFileSync(join(pluginRoot, 'skills', relative, 'SKILL.md'), 'utf8');
}

function readAgent(relative) {
  return readFileSync(join(pluginRoot, 'agents', relative), 'utf8');
}

function withoutCodeFences(content) {
  return content.replace(/```[\s\S]*?```/gu, '');
}

function exactUriPath(uri) {
  const [root, ...segments] = uri.slice('skill://'.length).split('/');
  if (root === 'ecc-skill-catalog') return join(eccRoot, ...segments);
  return join(pluginRoot, 'skills', root, ...segments);
}

test('loaded ECC methods expose exact supporting Skill URIs without becoming a second router', () => {
  for (const [name, supportingSkills] of lateComposition) {
    const content = readSkill(`ecc/${name}`);

    assert.match(content, /initial `WORKFLOW PLAN`/iu, `${name}: initial PLAN ownership`);
    assert.match(content, /does not (?:select|reroute|reselect|auto-load)[\s\S]{0,120}(?:Skill|workflow)/iu, `${name}: no secondary router`);
    assert.match(content, /RESOURCE EXTENSION/iu, `${name}: exact linked-method extension boundary`);

    for (const supportingSkill of supportingSkills) {
      const uri = `skill://ecc-skill-catalog/${supportingSkill}/SKILL.md`;
      assert.ok(content.includes(uri), `${name}: reveals ${uri}`);
      assert.ok(existsSync(join(eccRoot, supportingSkill, 'SKILL.md')), `${name}: ${uri} resolves`);
    }
  }
});

test('active linked documents use exact same-namespace Skill resource URIs', () => {
  for (const [relative, sourceUri] of exactResourceEntries) {
    const content = withoutCodeFences(readSkill(relative));

    assert.doesNotMatch(
      content,
      /\]\((?:\.\.?\/)?(?:references?|rules)\/[^)]+\.md(?:#[^)]+)?\)|\]\((?:\.\/)?(?:LOGIC|UI|LANGUAGE|HTML-REPORT|INTERFACE-DESIGN|CONTEXT-FORMAT|ADR-FORMAT)\.md\)/iu,
      `${relative}: no active relative Markdown resource`,
    );
    assert.match(content, /RESOURCE EXTENSION/iu, `${relative}: extension boundary`);
    assert.ok(content.includes(`source=${sourceUri}`), `${relative}: exact source URI`);

    const namespace = sourceUri.endsWith('/SKILL.md')
      ? sourceUri.slice(0, sourceUri.lastIndexOf('/') + 1)
      : `${sourceUri}/`;
    const resources = [...new Set(
      [...content.matchAll(/`(skill:\/\/[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9._/-]+\.md))`/gu)]
        .map(([, uri]) => uri)
        .filter((uri) => uri !== sourceUri && uri.startsWith(namespace)),
    )];
    assert.ok(resources.length > 0, `${relative}: at least one exact linked resource`);
    for (const uri of resources) {
      assert.ok(uri.startsWith(namespace), `${relative}: ${uri} remains in ${namespace}`);
      assert.ok(existsSync(exactUriPath(uri)), `${relative}: ${uri} resolves`);
    }
  }
});

test('cross-Skill document references are exact PLAN candidates, not relative late loads', () => {
  for (const relative of crossSkillNavigationEntries) {
    const content = withoutCodeFences(readSkill(relative));

    assert.doesNotMatch(content, /\]\(\.\.\/[^)]+\/SKILL\.md\)/iu, `${relative}: no relative cross-Skill load`);
    assert.match(content, /initial `WORKFLOW PLAN`/iu, `${relative}: initial PLAN selection`);
    assert.match(content, /does not (?:select|reroute|reselect|auto-load|load)[\s\S]{0,120}(?:Skill|workflow)/iu, `${relative}: navigation is non-routing`);
  }
});

test('effectful writing Add-on Skills preserve proposal-only language writers', () => {
  for (const relative of writingAddonEffectfulEntries) {
    const content = readSkill(relative);

    assert.match(
      content,
      /When this Skill is part of a `writer` or `zh-writer` assignment[\s\S]*proposal-only[\s\S]*runs no command and writes no file[\s\S]*Main or a separate explicitly capable\s+Main-selected Agent owns authorized effects/iu,
      `${relative}: writer actor guard`,
    );
  }
});

test('research Add-on Skills keep research execution out of language writers', () => {
  for (const relative of writingAddonResearchEntries) {
    const content = readSkill(relative);

    assert.match(
      content,
      /When this Skill is listed in a `writer` or `zh-writer` assignment[\s\S]*consumes evidence\s+already\s+supplied by Main[\s\S]*does not search the web, invoke\s+research tools, or issue independent research findings[\s\S]*Main or a separate\s+selected research Agent owns the research checkpoint/iu,
      `${relative}: research actor guard`,
    );
  }
});

test('network architect consumes only Main-frozen assigned Skills without becoming a child router', () => {
  const content = readAgent('ecc-network-architect.md');

  assert.match(
    content,
    /byte 0 assignment[\s\S]*freezes[\s\S]*current `step` and `todo`[\s\S]*Skill bodies supplied by Main/iu,
  );
  assert.match(
    content,
    /shared `skills` list may include methods for sibling checkpoints[\s\S]*apply only[\s\S]*current `step` and `todo`/iu,
  );
  assert.match(
    content,
    /Do not discover, select, load, reread, or catalog-route any Skill/iu,
  );
  assert.match(
    content,
    /If an assigned Skill body was not supplied[\s\S]*report it as unavailable[\s\S]*do not guess, substitute, or route to another Skill/iu,
  );
  assert.match(
    content,
    /candidate responsibilities for Main during `WORKFLOW PLAN` and `LOAD`[\s\S]*both assigned and supplied/iu,
  );
  assert.doesNotMatch(content, /route deeper analysis to/iu);
});
