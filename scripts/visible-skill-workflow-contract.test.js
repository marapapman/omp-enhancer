import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), 'utf8');
}

test('research result placeholders never invent facts or synthetic measurements', async () => {
  const skill = await read('plugins/writing-helper/skills/research-bogus-data/SKILL.md');

  assert.match(skill, /Never invent numeric, statistical, bibliographic, or factual values/i);
  assert.match(skill, /symbolic placeholders/i);
  assert.match(skill, /current task explicitly requests an output/i);
  assert.doesNotMatch(skill, /realistic-looking|realistic placeholder values|Typical Metric Ranges/i);
  assert.doesNotMatch(skill, /\b(?:74\.2|81\.5|89\.3|92\.3|12\.1)\b/);
});

test('literature research separates evidence collection, network access, and writes', async () => {
  const skill = await read('plugins/writing-helper/skills/research-literature/SKILL.md');

  assert.match(skill, /Never fabricate/i);
  assert.match(skill, /current task requires external research/i);
  assert.match(skill, /native network permission/i);
  assert.match(skill, /Write only when the current task explicitly requests file output/i);
  assert.match(skill, /requested safe path/i);
  assert.doesNotMatch(skill, /Append to `\.pi\/research\/literature\.md`/);
});

test('experiment design preserves unknowns and does not imply a default write', async () => {
  const skill = await read('plugins/writing-helper/skills/research-experiment/SKILL.md');

  assert.match(skill, /Never invent baseline, dataset, metric, or expected-result facts/i);
  assert.match(skill, /mark it unresolved/i);
  assert.match(skill, /Write only when the current task explicitly requests file output/i);
  assert.match(skill, /native filesystem permission/i);
  assert.doesNotMatch(skill, /Write results to `\.pi\/research\/experiment_design\.md`/);
});

test('architecture review keeps HTML, CDN, browser, and documentation writes optional', async () => {
  const skill = await read('plugins/omp-config/skills/improve-codebase-architecture/SKILL.md');

  assert.match(skill, /Default to a read-only report in the response/i);
  assert.match(skill, /HTML file only when the current task explicitly requests/i);
  assert.match(skill, /CDN or other network dependency only with native network permission/i);
  assert.match(skill, /Open a browser only when the current task requests it/i);
  assert.match(skill, /Update `CONTEXT\.md` or an ADR only when the current task explicitly requests/i);
  assert.doesNotMatch(skill, /`\/grill-with-docs`|invoke(?:s|d)? \/grill-with-docs/i);
});

test('grilling does not turn read-only analysis into documentation mutation', async () => {
  const skill = await read('plugins/omp-config/skills/grill-with-docs/SKILL.md');

  assert.match(skill, /A read-only grilling or planning request does not authorize file mutation/i);
  assert.match(skill, /current task explicitly requests documentation changes/i);
  assert.match(skill, /native filesystem permission/i);
  assert.match(skill, /propose the exact glossary or ADR text in the response/i);
});

test('caveman is a task-scoped presentation style, not an unregistered command', async () => {
  const skill = await read('plugins/omp-config/skills/caveman/SKILL.md');

  assert.match(skill, /current task only/i);
  assert.match(skill, /does not persist across tasks or sessions/i);
  assert.match(skill, /Do not treat an unregistered slash name as a runtime command/i);
  assert.match(skill, /does not override workflows, Skills, native schemas, safety, or evidence/i);
  assert.doesNotMatch(skill, /invokes \/caveman|ACTIVE EVERY RESPONSE/i);
});

test('Go testing follows repository frameworks and behavioral seams first', async () => {
  const skill = await read('plugins/omp-config/skills/go-testing/SKILL.md');

  assert.match(skill, /Follow the repository's existing test framework/i);
  assert.match(skill, /Do not add or install `testify`/i);
  assert.match(skill, /test placement/i);
  assert.match(skill, /behavioral seam/i);
  assert.match(skill, /current task and native execution permission/i);
  assert.doesNotMatch(skill, /Unit tests for each Go file must be placed/i);
});

test('Docker Compose choices come from repository and deployment requirements', async () => {
  const skill = await read('plugins/omp-config/skills/docker-compose/SKILL.md');

  assert.match(skill, /repository conventions and target deployment requirements/i);
  assert.match(skill, /network mode, timezone, volume type, port exposure, and resource limits are deployment decisions/i);
  assert.match(skill, /current task and native filesystem permission/i);
  assert.match(skill, /native execution and network permission/i);
  assert.doesNotMatch(skill, /Prefer `network_mode: bridge`|Set `TZ=Asia\/Shanghai`|Always set memory limits/i);
});
