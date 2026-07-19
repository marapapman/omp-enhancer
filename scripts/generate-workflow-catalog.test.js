import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkWorkflowArtifacts,
  writeWorkflowArtifacts,
} from './generate-workflow-catalog.js';
import {
  WORKFLOW_CATALOG_VERSION,
  workflowDefinitions,
} from '../plugins/omp-enhancer-core/src/workflows/catalog.js';

test('workflow artifact generator writes the optional workflow skill and one reference per workflow', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'omp-workflow-artifacts-'));
  const catalogTarget = path.join(root, 'assets', 'WORKFLOW_CATALOG.md');
  const skillRoot = path.join(root, 'skills', 'omp-enhancer-workflows');
  const staleReference = path.join(skillRoot, 'references', 'removed-domain.md');

  await mkdir(path.dirname(staleReference), { recursive: true });
  await writeFile(staleReference, '# obsolete\n', 'utf8');

  const missing = await checkWorkflowArtifacts({ catalogTarget, skillRoot });
  assert.equal(missing.ok, false);
  assert.equal(missing.results.some((result) => result.target === staleReference && result.unexpected), true);
  const written = await writeWorkflowArtifacts({ catalogTarget, skillRoot });
  assert.equal(written.results.length, workflowDefinitions.length + 2);
  assert.deepEqual(written.removed, [staleReference]);
  await assert.rejects(access(staleReference), (error) => error?.code === 'ENOENT');

  const checked = await checkWorkflowArtifacts({ catalogTarget, skillRoot });
  assert.equal(checked.ok, true);
  await writeWorkflowArtifacts({ catalogTarget, skillRoot });
  assert.equal((await checkWorkflowArtifacts({ catalogTarget, skillRoot })).ok, true);
  const skill = await readFile(path.join(skillRoot, 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: omp-enhancer-workflows\n/m);
  assert.match(skill, /Delegation is Main-owned; OMP native settings, tools, permissions, TODO, dynamic Agents, and completion remain authoritative/i);
  assert.match(skill, new RegExp(`Catalog version: ${WORKFLOW_CATALOG_VERSION}\\b`, 'i'));
  assert.match(skill, /analysis, judgment, staged work, or delegation/i);
  assert.match(skill, /mechanical field lookups? without analysis.*no Skill/is);
  assert.match(skill, /1\. \*\*DISCOVER\*\*/i);
  assert.match(skill, /2\. \*\*PLAN \+ LOAD\*\*[\s\S]*requested operation, source, and output[\s\S]*## State handoff[\s\S]*LOAD ORDER:[\s\S]*exact domain Skill or catalog[\s\S]*workflow references[\s\S]*NEXT VISIBLE ASSISTANT TEXT/i);
  assert.match(skill, /project facts wait until READY/i);
  assert.match(skill, /## State handoff[\s\S]*SOFT, MAIN-OWNED TRACE[\s\S]*Only visible assistant text counts[\s\S]*thinking, tool arguments, and files do not/i);
  assert.match(skill, /SELECTION:[\s\S]*Primary is exactly one central workflow ID[\s\S]*independently matching operation or output in Add-ons[\s\S]*never joined with `\+`/iu);
  assert.match(skill, /exclude every `Not for` match[\s\S]*smallest Skill set positively owning the requested method, evidence, verdict, or format[\s\S]*never one for awareness[\s\S]*workflow reference is not a domain Skill/i);
  assert.match(skill, /Format-only conversion loads its converter[\s\S]*not a target-format prose Skill unless content editing is requested/i);
  assert.match(skill, /LOAD ORDER:[\s\S]*exact domain Skill or catalog `skill:\/\/\.\.\.` URI first[\s\S]*workflow `PLAN URI:` once and last[\s\S]*nested Skill URI[\s\S]*before the workflow references[\s\S]*do not repeat PLAN/i);
  assert.match(skill, /NEXT VISIBLE ASSISTANT TEXT[\s\S]*WORKFLOW PLAN[\s\S]*Primary: <one-workflow-id-or-none>[\s\S]*Add-ons:[\s\S]*Skills:[\s\S]*Load order:[\s\S]*Actions:[\s\S]*1\./i);
  assert.match(skill, /OUTPUT BRIDGE:[\s\S]*first visible content item is this full `WORKFLOW PLAN`[\s\S]*resource calls follow it[\s\S]*separate numbered Action for each distinct requested checkpoint or evidence phase[\s\S]*Call every Load order URI and nothing else[\s\S]*no project tool, `todo`, `task`, or final/i);
  assert.match(skill, /AFTER ALL DECLARED RESOURCES AND ANY CATALOG EXTENSION HAVE RETURNED[\s\S]*WORKFLOW READY \| primary=<id-or-none>[\s\S]*rebase the detailed TODO once before the first project action/i);
  assert.match(skill, /WORKFLOW MATCH:[\s\S]*test every whole Primary condition[\s\S]*not words like plan[\s\S]*Choose one for the central requested operation or deliverable[\s\S]*every other independently matching requested operation or output in Add-ons[\s\S]*Do not add a workflow merely for an internal phase already covered by the Primary[\s\S]*Format-conversion plans match source\/output rows[\s\S]*not `code\.dev`/iu);
  assert.match(skill, /LaTeX prose correction keeps `writing\.latex` \+ its language workflow[\s\S]*no converter\/template unless requested/iu);
  assert.match(skill, /3\. \*\*READY \+ EXECUTE\*\*[\s\S]*After resources, emit READY[\s\S]*detailed native TODO[\s\S]*AFTER ALL DECLARED RESOURCES[\s\S]*WORKFLOW READY[\s\S]*rebase the detailed TODO/i);
  assert.match(skill, /When native `todo` is exposed, the only call in this response is TODO init[\s\S]*start project work in the next response/i);
  assert.doesNotMatch(skill, /slices=<|assignment-input=|Composition example:|\[workflow=<ids>/i);
  assert.match(skill, /SELECTION TABLE ONLY:[\s\S]*choose here, emit PLAN, then read its literal PLAN URIs[\s\S]*PLAN URI is `Load order` text, not an early call/iu);
  assert.doesNotMatch(skill, /^- `[^`]+`[^\n]+\b(?:Add-ons|Skills):/gmu);
  assert.ok(Buffer.byteLength(skill) < 13_000, 'workflow Skill index should stay compact');
  assert.match(skill, /does not route tasks[\s\S]*create gates/i);
  assert.doesNotMatch(skill, /FIRST tool call|Invoke only roles|block:\s*true|continue:\s*true|hard router/i);
  const codeReference = await readFile(path.join(skillRoot, 'references', 'code.dev.md'), 'utf8');
  assert.match(codeReference, /RESOURCE HANDOFF \(soft\):[\s\S]*Do not start project work/iu);
  assert.match(codeReference, /NEXT CHECKPOINT:[\s\S]*start visible assistant text with `WORKFLOW READY \| primary=<id-or-none> \| add-ons=<ids-or-none> \| skills-loaded=<bare-ids-or-none> \| skills-unavailable=<bare-ids-or-none>`[\s\S]*response calls only TODO init and waits[\s\S]*project work starts in the next response/iu);
  assert.doesNotMatch(codeReference, /Add-on candidates|Optional Skill topics/iu);
  assert.match(codeReference, /`code\.dev`/);
  assert.match(codeReference, /Optional Agent candidates/);
});

test('workflow catalog generator rejects missing, duplicate, and unknown CLI modes', async () => {
  const script = fileURLToPath(new URL('./generate-workflow-catalog.js', import.meta.url));
  for (const args of [[], ['--check', '--write'], ['--unknown']]) {
    const result = await runNode(script, args);
    assert.equal(result.code, 1, `expected ${args.join(' ') || 'no args'} to fail`);
  }
});

function runNode(script, args) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn(process.execPath, [script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}
