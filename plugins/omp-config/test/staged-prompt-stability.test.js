import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const agentsUrl = new URL('../assets/AGENTS.md', import.meta.url);
const watchdogUrl = new URL('../assets/WATCHDOG.yml', import.meta.url);

test('managed prompts expose one unambiguous positive orchestration advisory', async () => {
  const [agents, watchdog] = await Promise.all([
    readFile(agentsUrl, 'utf8'),
    readFile(watchdogUrl, 'utf8'),
  ]);

  assert.match(agents, /Main is the orchestrator\. Phases: ANALYZE -> EXECUTE -> REVIEW/u);
  assert.match(agents, /ANALYZE: Main analyzes directly for focused work; delegates to analyzer for complex multi-slice work requiring detailed planning/u);
  assert.match(agents, /EXECUTE: Main executes directly for simple changes; delegates to task or domain agents for substantial work/u);
  assert.match(agents, /REVIEW: Main reviews simple changes directly; delegates to reviewer for complex or risky changes/u);
  assert.match(agents, /A verbatim field or heading lookup needs no workflow or TODO/u);
  assert.match(agents, /Main selects workflows, Skills, Agents, and delegation width freely/u);
  assert.match(agents, /No plugin creates a gate, router, retry, permission, or completion controller/u);
  assert.match(agents, /never routes, blocks, grants permission, starts a task, or decides completion/u);
  assert.match(watchdog, /Main is the orchestrator\. Phases: ANALYZE -> EXECUTE -> REVIEW/u);
  assert.match(watchdog, /Main selects workflows, Skills, Agents, and delegation width freely/u);
  assert.match(watchdog, /No plugin creates a gate, router, retry, permission, or completion controller/u);
  assert.doesNotMatch(
    `${agents}\n${watchdog}`,
    /DISCOVER -> DECLARE -> LOAD|WORKFLOW PLAN|WORKFLOW READY|RESOURCE EXTENSION|Delegate Agent=|NOW=|THEN=|after (?:optional )?hidden thinking|All resources loaded|WRONG:|CORRECT:/iu,
  );
});
