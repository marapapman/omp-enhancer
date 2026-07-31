import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  buildWorkflowSkillIndexMarkdown,
  buildWorkflowSkillReferenceMarkdown,
} from '../src/workflows/render-skill.js';
import {
  ORCHESTRATOR_IDENTITY,
  SELF_INDUCED_FALLBACK_GUARD,
  WORKFLOW_PLAN_TEMPLATE,
  WORKFLOW_STATE_LINE,
} from '../src/workflows/staged-contract.js';

test('workflow prompts use one positive staged handoff with explicit load phases', () => {
  const index = buildWorkflowSkillIndexMarkdown();
  const reference = buildWorkflowSkillReferenceMarkdown('writing.en');

  assert.equal(
    WORKFLOW_STATE_LINE,
    'DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY',
  );
  assert.match(index, new RegExp(WORKFLOW_STATE_LINE.replaceAll(' -> ', String.raw`\s*->\s*`), 'u'));
  assert.match(
    WORKFLOW_PLAN_TEMPLATE,
    /Load order: NOW=\[<chosen non-supplied Skill\/catalog URIs-or-none>\] THEN=\[<Add-on PLAN URIs; Primary PLAN URI last-or-none>\]/u,
  );
  assert.match(
    WORKFLOW_PLAN_TEMPLATE,
    /Skills: <exact domain Skill\/catalog URIs-or-none>[\s\S]*1\. LOAD:[\s\S]*2\. COMMIT:[\s\S]*3\. SPLIT \+ EXECUTE:[\s\S]*4\. VERIFY:/u,
  );
  assert.match(
    WORKFLOW_PLAN_TEMPLATE,
    /2\. COMMIT: After all resources, emit READY \+ detailed TODO from loaded steps only; end and wait; zero project tools\./u,
  );
  assert.match(
    WORKFLOW_PLAN_TEMPLATE,
    /3\. SPLIT \+ EXECUTE: After READY wait, apply loaded defaults\/checkpoints to current Agents and dependency order; Delegate or record one permitted fallback\./u,
  );
  assert.match(
    index,
    /This body is the completed DISCOVER result; do not read `skill:\/\/omp-enhancer-workflows` again/u,
  );
  assert.match(
    index,
    /LOAD:[\s\S]*Skills=exact domain Skill\/catalog URIs[\s\S]*NOW=non-supplied Skills\/catalogs[\s\S]*THEN=Add-on refs then Primary/iu,
  );
  assert.match(
    index,
    /Language Primary \+ `\.tex` target[\s\S]*LaTeX prose[\s\S]*`writing\.latex` Add-on[\s\S]*Converters\/templates only when requested/iu,
  );
  assert.match(
    index,
    /COMPILE \(soft\): loaded `subagent-driven` \+ complete input.*safe checkpoint.*visible matching Agent => Delegate row; otherwise `fallback=<one matched permitted limitation>`/iu,
  );
  assert.match(
    index,
    /Loaded language card \+ target\/constraints\/roles => writer -> checker -> parent VERIFY after READY; Main does not pre-read/iu,
  );
  assert.match(
    reference,
    /READY NEXT \(soft\):[\s\S]*response byte 0 = `W`[\s\S]*native TODO init only[\s\S]*Rebase TODO[\s\S]*End\/wait/iu,
  );
  assert.match(
    reference,
    /complete input.*safe checkpoint.*visible matching Agent => one exact Delegate row/iu,
  );
  assert.match(
    index,
    /DECLARE HANDOFF \(soft\):[\s\S]*Next visible response MUST start byte 0 with `WORKFLOW PLAN`[\s\S]*contain only this form[\s\S]*state stays silent/iu,
  );
  assert.match(
    reference,
    /Next assistant response byte 0 = `W` of filled `WORKFLOW READY \|[\s\S]*same response calls native TODO init only/iu,
  );
  assert.doesNotMatch(
    `${index}\n${reference}`,
    /after optional hidden thinking|Thinking "(?:Let me emit WORKFLOW PLAN|emit READY)"|All resources loaded|WRONG:|CORRECT:/iu,
  );
});

test('orchestrator identity and fallback guard constants are non-empty single-line strings', () => {
  assert.equal(typeof ORCHESTRATOR_IDENTITY, 'string');
  assert.ok(ORCHESTRATOR_IDENTITY.length > 0);
  assert.equal(typeof SELF_INDUCED_FALLBACK_GUARD, 'string');
  assert.ok(SELF_INDUCED_FALLBACK_GUARD.length > 0);
  assert.match(SELF_INDUCED_FALLBACK_GUARD, /fallback=/u);
  assert.match(SELF_INDUCED_FALLBACK_GUARD, /exactly one enumerated reason/u);
});

test('mutation cards carry author-neutral review coverage and unavailability-only audit fallback', async () => {
  const codeRef = await readFile(new URL('../../omp-config/skills/omp-enhancer-workflows/references/code.dev.md', import.meta.url), 'utf8');
  const pluginRef = await readFile(new URL('../../omp-config/skills/omp-enhancer-workflows/references/omp.plugin.md', import.meta.url), 'utf8');
  const netDebugRef = await readFile(new URL('../../omp-config/skills/omp-enhancer-workflows/references/network.debug.md', import.meta.url), 'utf8');
  for (const ref of [codeRef, pluginRef]) {
    assert.match(ref, /Main-authored/u);
    assert.match(ref, /fall[s]? back only when the named Agent is unavailable/u);
  }
  assert.match(netDebugRef, /step-audit/u);
  assert.match(netDebugRef, /falls back only when native reviewer is unavailable/u);
});
