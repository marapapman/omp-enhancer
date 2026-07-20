import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const agentsUrl = new URL('../assets/AGENTS.md', import.meta.url);
const watchdogUrl = new URL('../assets/WATCHDOG.yml', import.meta.url);

test('managed prompts expose one unambiguous positive workflow state machine', async () => {
  const [agents, watchdog] = await Promise.all([
    readFile(agentsUrl, 'utf8'),
    readFile(watchdogUrl, 'utf8'),
  ]);

  assert.match(
    agents,
    /DISCOVER -> DECLARE -> LOAD -> COMMIT -> SPLIT -> EXECUTE -> VERIFY/u,
  );
  assert.match(
    agents,
    /If that exact native body was supplied, DISCOVER is complete: do not reread it; emit PLAN next/u,
  );
  assert.match(
    agents,
    /Load order: NOW=\[<chosen non-supplied Skill\/catalog URIs-or-none>\] THEN=\[<Add-on PLAN URIs; Primary PLAN URI last-or-none>\]/u,
  );
  assert.match(
    agents,
    /2\. COMMIT: After all resources, emit READY \+ detailed TODO from loaded steps only; end and wait; zero project tools\./u,
  );
  assert.match(
    agents,
    /loaded `subagent-driven` \+ complete input \+ safe checkpoint \+ visible matching Agent => Delegate row/iu,
  );
  assert.match(
    agents,
    /Project tools start only after the READY \+ TODO response ends and its results return/iu,
  );
  assert.match(
    agents,
    /After all parent-owned pre-dispatch prerequisites named by the loaded reference complete, the committed `task` is the next project action/u,
  );
  assert.match(
    watchdog,
    /With that exact body, DISCOVER is complete: no read; PLAN is next/u,
  );
  assert.doesNotMatch(
    `${agents}\n${watchdog}`,
    /after (?:optional )?hidden thinking|All resources loaded|WRONG:|CORRECT:/iu,
  );
});
