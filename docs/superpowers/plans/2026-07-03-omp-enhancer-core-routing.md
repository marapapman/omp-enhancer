# omp-enhancer Core Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified `omp-enhancer-core` runtime plugin that routes coding, writing, testing, and config tasks without slash commands, injects required agent and skill guidance, and gates completion with observable tool evidence.

**Architecture:** Add `plugins/omp-enhancer-core` as the only new runtime governance layer. The core plugin registers route/status tools plus `before_agent_start`, `tool_result`, and `session_stop` hooks. Existing plugins keep their public tool names and remain installable, while the core plugin describes how to use their tools and agents.

**Tech Stack:** Node ESM and node:test for `omp-enhancer-core`; existing Node ESM for `omp-config` and `writing-helper`; existing TypeScript, Bun, and Vitest for `omp-test-enhancer`; npm workspaces at the root.

## Global Constraints

- Do not remove existing public tool names: `writing_logic_check`, `writing_quality_check`, `omp_config_doctor`, `omp_config_assets`, `omp_config_plan`, and all `omp_test_*` tools.
- Do not rely on slash commands for the new workflow.
- Keep legacy slash commands only as compatibility paths unless a task explicitly removes them.
- New core code must only use OMP APIs already observed in this repo: `setLabel`, `registerTool`, `on`, `appendEntry`, `sendUserMessage`, `zod.z`.
- `omp-config` must not automatically overwrite `~/.omp` files.
- Writing tasks must require writing skills and `SKILL_USAGE`.
- Chinese writing tasks must require `plain-chinese-writing`.
- Testing tasks must require `omp_test_gate` before completion.
- Coding tasks must require lightweight TDD evidence and reviewer guidance.
- Tests must be written before production code for each behavior.

---

## File Structure

Create these files.

```text
plugins/omp-enhancer-core/package.json
plugins/omp-enhancer-core/index.js
plugins/omp-enhancer-core/src/core/results.js
plugins/omp-enhancer-core/src/core/task-router.js
plugins/omp-enhancer-core/src/core/skill-profiles.js
plugins/omp-enhancer-core/src/core/skill-usage.js
plugins/omp-enhancer-core/src/core/governance-prompt.js
plugins/omp-enhancer-core/src/core/session-state.js
plugins/omp-enhancer-core/src/core/extension.js
plugins/omp-enhancer-core/test/router.test.js
plugins/omp-enhancer-core/test/skill-usage.test.js
plugins/omp-enhancer-core/test/governance.test.js
plugins/omp-enhancer-core/test/extension.test.js
```

Modify these files.

```text
package.json
.omp-plugin/marketplace.json
README.md
scripts/check-marketplace.js
scripts/pack-all.js
```

---

### Task 1: Workspace and marketplace entry

**Files:**
- Modify: `package.json`
- Modify: `.omp-plugin/marketplace.json`
- Modify: `scripts/check-marketplace.js`
- Modify: `scripts/pack-all.js`
- Test: root script checks

**Interfaces:**
- Produces workspace package `plugins/omp-enhancer-core`.
- Produces marketplace plugin name `omp-enhancer-core`.

- [ ] **Step 1: Write the failing marketplace test by running the checker**

Run: `node scripts/check-marketplace.js`

Expected before implementation: FAIL after the test is updated to expect `omp-enhancer-core`, because catalog does not include it yet.

- [ ] **Step 2: Update `scripts/check-marketplace.js` expected plugins**

Add `omp-enhancer-core` to the expected plugin list.

- [ ] **Step 3: Run checker and verify it fails**

Run: `node scripts/check-marketplace.js`

Expected: FAIL with missing `omp-enhancer-core`.

- [ ] **Step 4: Add workspace and catalog entry**

Update root `package.json` workspaces to include `plugins/omp-enhancer-core`.

Update `.omp-plugin/marketplace.json` with:

```json
{
  "name": "omp-enhancer-core",
  "description": "Unified OMP enhancer runtime router for coding, writing, testing, and config tasks.",
  "version": "0.1.0",
  "category": "development",
  "homepage": "https://github.com/marapapman/omp-enhancer/tree/main/plugins/omp-enhancer-core",
  "repository": "https://github.com/marapapman/omp-enhancer",
  "source": "./omp-enhancer-core"
}
```

- [ ] **Step 5: Update pack script**

Ensure `scripts/pack-all.js` packs every workspace dynamically or includes `plugins/omp-enhancer-core`.

- [ ] **Step 6: Verify root checks**

Run: `node scripts/check-marketplace.js`

Expected: `marketplace catalog ok`.

Run: `npm run pack:all`

Expected: output includes `omp-enhancer-core-0.1.0.tgz` and `all workspace packs ok`.

---

### Task 2: Core package skeleton and result helpers

**Files:**
- Create: `plugins/omp-enhancer-core/package.json`
- Create: `plugins/omp-enhancer-core/index.js`
- Create: `plugins/omp-enhancer-core/src/core/results.js`
- Test: `plugins/omp-enhancer-core/test/extension.test.js`

**Interfaces:**
- Produces default export `registerOmpEnhancerCore(pi)`.
- Produces `okResult(text, details)` and `errorResult(text, details)`.

- [ ] **Step 1: Write failing registration test**

Create `plugins/omp-enhancer-core/test/extension.test.js` with a fake `pi` object. Assert default export registers label `OMP Enhancer Core`, tools `omp_enhancer_route` and `omp_enhancer_status`, and hooks `before_agent_start`, `tool_result`, `session_stop`.

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -w plugins/omp-enhancer-core`

Expected: FAIL because package and implementation do not exist.

- [ ] **Step 3: Create package skeleton**

`package.json` must contain:

```json
{
  "name": "omp-enhancer-core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./index.js",
  "exports": "./index.js",
  "files": ["index.js", "src", "test", "README.md"],
  "scripts": {
    "test": "node --test test/*.test.js",
    "pack": "npm pack --dry-run"
  },
  "omp": {
    "extensions": ["./index.js"]
  }
}
```

- [ ] **Step 4: Implement minimal register function**

`index.js` exports `registerOmpEnhancerCore`. It delegates to `registerCoreExtension` from `src/core/extension.js`.

- [ ] **Step 5: Implement result helpers**

`okResult` returns `{ content:[{ type:'text', text }], details, isError:false }`.

`errorResult` returns `{ content:[{ type:'text', text }], details, isError:true }`.

- [ ] **Step 6: Run test and verify pass**

Run: `npm test -w plugins/omp-enhancer-core`

Expected: PASS.

---

### Task 3: Deterministic task router

**Files:**
- Create: `plugins/omp-enhancer-core/src/core/task-router.js`
- Test: `plugins/omp-enhancer-core/test/router.test.js`

**Interfaces:**
- Produces `routeTask(input)`.
- Return shape includes `kind`, `language`, `orderedModules`, `requiredAgents`, `requiredSkills`, `requiredTools`, `gates`, `confidence`.

- [ ] **Step 1: Write failing router tests**

Test cases:

1. `请润色这段中文论文` returns `kind: 'writing'`, `language: 'zh'`, `orderedModules: ['writing']`, required skill includes `plain-chinese-writing`.
2. `write tests for src/foo.ts` returns `kind: 'testing'`, `orderedModules: ['testing']`, required tool includes `omp_test_gate`.
3. `实现登录功能并补测试` returns `kind: 'mixed'`, `orderedModules: ['coding','testing']`.
4. `fix failing parser bug` returns `kind: 'coding'`, required skill includes `tdd`.
5. `列出 omp-config assets` returns `kind: 'config'`, required tool includes `omp_config_assets`.
6. `你好` returns `kind: 'unknown'` and no hard gates.

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -w plugins/omp-enhancer-core -- test/router.test.js`

Expected: FAIL because router does not exist.

- [ ] **Step 3: Implement router**

Implement lower-case keyword matching plus CJK detection. Do not call any model. Use deterministic arrays for coding, writing, testing, config terms. Let testing terms override writing for phrases like `write tests`.

- [ ] **Step 4: Run router tests**

Run: `npm test -w plugins/omp-enhancer-core -- test/router.test.js`

Expected: PASS.

---

### Task 4: Skill profiles and SKILL_USAGE gate

**Files:**
- Create: `plugins/omp-enhancer-core/src/core/skill-profiles.js`
- Create: `plugins/omp-enhancer-core/src/core/skill-usage.js`
- Test: `plugins/omp-enhancer-core/test/skill-usage.test.js`

**Interfaces:**
- Produces `selectSkillProfile(route)`.
- Produces `parseSkillUsage(text)`.
- Produces `validateSkillUsage(text, requiredSkills)`.

- [ ] **Step 1: Write failing skill tests**

Cover:

1. Chinese writing route requires `plain-chinese-writing`, `zh-writing-mad-writer`, `zh-writing-checkers`.
2. English writing route requires `writing-mad-writer`, `writing-checkers`.
3. Coding route requires `tdd`.
4. Testing route requires no writing skills but requires `omp-test-enhancer-workflow` as governance label.
5. Complete `SKILL_USAGE` validates.
6. Missing `SKILL_USAGE` fails.
7. Loaded placeholder fails.
8. Loaded negation fails.
9. `SKILL_USAGE` inside fenced code is ignored.

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -w plugins/omp-enhancer-core -- test/skill-usage.test.js`

Expected: FAIL because implementation does not exist.

- [ ] **Step 3: Implement skill profile and parser**

Port the minimal frugal-pi behavior needed for this repo. Keep code deterministic and small.

- [ ] **Step 4: Run skill tests**

Run: `npm test -w plugins/omp-enhancer-core -- test/skill-usage.test.js`

Expected: PASS.

---

### Task 5: Governance prompt generation

**Files:**
- Create: `plugins/omp-enhancer-core/src/core/governance-prompt.js`
- Test: `plugins/omp-enhancer-core/test/governance.test.js`

**Interfaces:**
- Produces `buildGovernanceFragment(route)`.
- Produces `buildSessionStopContext(route, state)`.

- [ ] **Step 1: Write failing governance tests**

Cover:

1. Writing fragment contains Mandatory Skill Workflow, required skills, writer/checker route, and `SKILL_USAGE` contract.
2. Chinese writing fragment contains `plain-chinese-writing`, `zh-writer`, `zh-checker`.
3. Testing fragment contains the full `omp_test_analyze -> omp_test_context -> omp_test_gate -> omp_test_report` path.
4. Coding fragment contains lightweight TDD and reviewer guidance.
5. Unknown fragment does not force gates.
6. session stop context for missing testing gate asks for `omp_test_gate`.
7. session stop context for missing writing QA asks for checker or `writing_quality_check`.

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -w plugins/omp-enhancer-core -- test/governance.test.js`

Expected: FAIL.

- [ ] **Step 3: Implement prompt generator**

Generate plain Markdown fragments. Include exact required tools and agents from route.

- [ ] **Step 4: Run governance tests**

Run: `npm test -w plugins/omp-enhancer-core -- test/governance.test.js`

Expected: PASS.

---

### Task 6: Extension hooks and session state

**Files:**
- Create: `plugins/omp-enhancer-core/src/core/session-state.js`
- Create: `plugins/omp-enhancer-core/src/core/extension.js`
- Modify: `plugins/omp-enhancer-core/test/extension.test.js`

**Interfaces:**
- `registerCoreExtension(pi)` registers tools and hooks.
- `omp_enhancer_route` returns a route report for input text.
- `omp_enhancer_status` returns session evidence.

- [ ] **Step 1: Extend failing extension tests**

Add assertions:

1. `omp_enhancer_route` classifies writing input.
2. `before_agent_start` appends a governance fragment through returned event object or `appendEntry`, matching current fake API.
3. `tool_result` for `writing_quality_check` records writing QA evidence.
4. `tool_result` for `omp_test_gate` records test gate evidence.
5. `session_stop` continues testing route when `omp_test_gate` is missing.
6. `session_stop` allows unknown route.

- [ ] **Step 2: Run test and verify failure**

Run: `npm test -w plugins/omp-enhancer-core -- test/extension.test.js`

Expected: FAIL until hooks exist.

- [ ] **Step 3: Implement session state**

Keep in-memory state per extension instance:

```js
{
  lastRoute: null,
  evidence: {
    writingQuality: false,
    writingLogic: false,
    testingGate: false,
    testingReport: false
  }
}
```

- [ ] **Step 4: Implement extension**

Register tools:

- `omp_enhancer_route`
- `omp_enhancer_status`

Register hooks:

- `before_agent_start`
- `tool_result`
- `session_stop`

- [ ] **Step 5: Run extension tests**

Run: `npm test -w plugins/omp-enhancer-core -- test/extension.test.js`

Expected: PASS.

---

### Task 7: Documentation and legacy command positioning

**Files:**
- Modify: `README.md`
- Optional: `plugins/omp-enhancer-core/README.md`
- Test: existing marketplace and package tests

**Interfaces:**
- README documents automatic routing, not slash command workflow.

- [ ] **Step 1: Add failing documentation assertion if suitable**

If existing tests already inspect README, update them to expect `omp-enhancer-core` and automatic routing. If no suitable test exists, add README assertions to `scripts/check-marketplace.js` or a root docs test only if it stays simple.

- [ ] **Step 2: Run relevant test and verify failure**

Run the specific updated test.

- [ ] **Step 3: Update README**

Document:

1. Install command including `omp-enhancer-core`.
2. Users describe tasks naturally.
3. Coding route uses lightweight TDD.
4. Writing route uses writer/checker and required skills.
5. Testing route uses `omp_test_*` tools and gate.
6. Slash commands are compatibility helpers, not the main path.

- [ ] **Step 4: Verify documentation test**

Run the specific test.

Expected: PASS.

---

### Task 8: Full verification

**Files:**
- All changed files

**Interfaces:**
- Whole repo remains testable and packageable.

- [ ] **Step 1: Run core tests**

Run: `npm test -w plugins/omp-enhancer-core`

Expected: all core tests pass.

- [ ] **Step 2: Run workspace tests**

Run: `npm test`

Expected: all workspace tests pass.

- [ ] **Step 3: Run marketplace checker**

Run: `node scripts/check-marketplace.js`

Expected: `marketplace catalog ok`.

- [ ] **Step 4: Run pack check**

Run: `npm run pack:all`

Expected: output includes all four plugin tarballs and `all workspace packs ok`.

- [ ] **Step 5: Inspect final status**

Run: `git status --short`

Expected: only intentional files changed.
