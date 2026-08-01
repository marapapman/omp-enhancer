import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildWorkflowSkillIndexMarkdown,
  buildWorkflowSkillReferenceMarkdown,
} from '../src/workflows/render-skill.js';
import {
  DIRECT_FALLBACK_REASONS,
  ORCHESTRATOR_IDENTITY,
  WORKFLOW_PHASE_LINE,
} from '../src/workflows/staged-contract.js';

const LEGACY_MARKERS = [
  'DECLARE HANDOFF',
  'WORKFLOW PLAN',
  'WORKFLOW READY',
  'SENTINEL',
  'byte 0',
  'NOW=',
  'THEN=',
  'RESOURCE EXTENSION',
  'Delegate Agent=',
  'TASK COPY',
  'DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY',
];

test('workflow prompts use the compact three-phase advisory with all five domain rows', () => {
  const index = buildWorkflowSkillIndexMarkdown();
  const reference = buildWorkflowSkillReferenceMarkdown('code');

  assert.equal(WORKFLOW_PHASE_LINE, 'ANALYZE -> EXECUTE -> REVIEW');
  assert.match(index, new RegExp(WORKFLOW_PHASE_LINE.replaceAll(' -> ', String.raw`\s*->\s*`), 'u'));
  assert.match(index, /# Workflow reference catalog/u);
  assert.match(index, /Advisory reference only\. Main selects workflows, Skills, Agents, and delegation width freely\./u);
  assert.match(index, /## Domain index/u);

  for (const id of ['code', 'writing', 'research', 'visual', 'operations']) {
    const row = index.split('\n').find((line) => line.includes(`\`${id}\``));
    assert.ok(row, `index must contain a row for ${id}`);
    assert.match(row, /— [^`\n]+/u, `${id} row must carry chooseWhen text`);
    assert.match(row, /D=\[`skill:\/\/[^`\n]+`(?:, `skill:\/\/[^`\n]+`)*\]/u, `${id} row must expose direct skill candidates`);
  }

  assert.match(index, /1\. Match the task to a domain above\./u);
  assert.match(index, /2\. Load matching skills as needed for methods and evidence rules\./u);
  assert.match(index, /3\. ANALYZE: Main analyzes directly or delegates to analyzer for complex multi-slice work\./u);
  assert.match(index, /4\. EXECUTE: Main executes directly or delegates to task\/domain agents\./u);
  assert.match(index, /5\. REVIEW: Main reviews directly or delegates to reviewer for complex\/risky changes\./u);

  for (const marker of LEGACY_MARKERS) {
    assert.doesNotMatch(index, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu'), `index must not contain ${marker}`);
  }

  assert.match(reference, /^# `code` workflow reference$/um);
  assert.match(reference, /Optional advisory reference\. Main orchestrates freely\./u);
  assert.match(reference, /- When: Substantive code inspection/u);
  assert.match(reference, /- Skills: `code-development`/u);
  assert.match(reference, /- Agent candidates: `analyzer`, `task`, `reviewer`, `scout`, `librarian`\./u);
  assert.match(reference, /- Suggested flow:\n  1\. Establish outcome/u);
  assert.match(reference, /- Scope notes:\n  - Read-only or plan-only requests do not authorize production mutation\./u);
  for (const marker of LEGACY_MARKERS) {
    assert.doesNotMatch(reference, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'iu'), `reference must not contain ${marker}`);
  }
});

test('orchestrator identity and fallback-reason constants are non-empty single-line strings', () => {
  assert.equal(typeof ORCHESTRATOR_IDENTITY, 'string');
  assert.ok(ORCHESTRATOR_IDENTITY.length > 0);
  assert.match(ORCHESTRATOR_IDENTITY, /Main is the orchestrator/u);
  assert.doesNotMatch(ORCHESTRATOR_IDENTITY, /[\r\n]/u);

  assert.equal(typeof DIRECT_FALLBACK_REASONS, 'string');
  assert.ok(DIRECT_FALLBACK_REASONS.length > 0);
  assert.doesNotMatch(DIRECT_FALLBACK_REASONS, /[\r\n]/u);
});

test('the generated code reference file matches the advisory card contract', async () => {
  const codeRef = await readFile(new URL('../../omp-config/skills/omp-enhancer-workflows/references/code.md', import.meta.url), 'utf8');
  assert.match(codeRef, /# `code` workflow reference/u);
  assert.match(codeRef, /- When: Substantive code inspection/u);
  assert.match(codeRef, /- Agent candidates: `analyzer`, `task`, `reviewer`, `scout`, `librarian`\./u);
  assert.match(codeRef, /- Suggested flow:/u);
  assert.doesNotMatch(codeRef, /DECLARE HANDOFF|SENTINEL|byte 0|WORKFLOW PLAN|WORKFLOW READY/u);
});
