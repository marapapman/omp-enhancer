import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function readSkill(name) {
  return readFile(path.join(packageRoot, 'skills', 'ecc', name, 'SKILL.md'), 'utf8');
}

async function readAllSkillEntrypoints(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) skills.push(...await readAllSkillEntrypoints(target));
    if (entry.isFile() && entry.name === 'SKILL.md') {
      skills.push([target, await readFile(target, 'utf8')]);
    }
  }
  return skills;
}

async function readAllMarkdownResources(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const resources = [];
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) resources.push(...await readAllMarkdownResources(target));
    if (entry.isFile() && entry.name.endsWith('.md')) {
      resources.push([target, await readFile(target, 'utf8')]);
    }
  }
  return resources;
}

function withoutFencedCode(markdown) {
  let fence = null;
  return String(markdown).split(/\r?\n/u).map((line) => {
    const marker = /^ {0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
    if (!fence && marker) {
      fence = { character: marker[0], length: marker.length };
      return '';
    }
    if (fence) {
      const closing = new RegExp(`^ {0,3}${fence.character}{${fence.length},}[ \\t]*$`, 'u');
      if (closing.test(line)) fence = null;
      return '';
    }
    return line;
  }).join('\n');
}

const delegatedSkills = [
  'deep-research',
  'santa-method',
  'council',
  'click-path-audit',
  'team-builder',
  'skill-stocktake',
  'rules-distill',
  'search-first',
];

test('ECC orchestration methods use dynamic native delegation without fixed fanout or host-specific tools', async () => {
  const skills = await Promise.all(delegatedSkills.map(async (name) => [name, await readSkill(name)]));

  for (const [name, skill] of skills) {
    assert.match(skill, /dynamic Available Agents/i, `${name} must use the live Agent inventory`);
    assert.match(skill, /native `task`/i, `${name} must name the portable fallback Agent`);
    assert.match(skill, /Main (?:chooses|owns)/i, `${name} must leave orchestration with Main`);
  }

  const combined = skills.map(([, skill]) => skill).join('\n');
  for (const forbidden of [
    /subagent_type\s*=/i,
    /\bAgent\s*\(/,
    /Claude Code(?:'s)? `?Task`? tool/i,
    /\bclaude agents\b/i,
    /~\/\.claude\/(?:agents|skills)/i,
    /spawn two review agents/i,
    /launch 3 research agents/i,
    /both (?:reviewers )?must pass/i,
    /fix until nice/i,
    /loop until convergence/i,
    /launch parallel agents per page/i,
    /all agents run simultaneously/i,
    /\b(?:researcher|planner|architect) agent\b/i,
  ]) {
    assert.doesNotMatch(combined, forbidden, `forbidden fixed or host-specific orchestration: ${forbidden}`);
  }
});

test('Santa review is advisory evidence rather than a ship gate or automatic repair loop', async () => {
  const skill = await readSkill('santa-method');

  assert.match(skill, /advisory review evidence/i);
  assert.match(skill, /finding disposition/i);
  assert.match(skill, /no review verdict grants permission to publish, deploy, or complete/i);
  assert.match(skill, /repair is a new bounded TODO checkpoint/i);
  assert.doesNotMatch(skill, /verdict gate|return ship\(|re-run both reviewers|MAX_ITERATIONS/i);
});

test('code-oriented ECC methods preserve task-owned vertical TDD and Main review', async () => {
  const [gan, mle] = await Promise.all([readSkill('gan-style-harness'), readSkill('mle-workflow')]);

  for (const [name, skill] of [
    ['gan-style-harness', gan],
    ['mle-workflow', mle],
  ]) {
    assert.match(skill, /native `task` owns (?:each|the) complete vertical RED-GREEN-REFACTOR slice/i, name);
    assert.match(skill, /Main (?:integrates|waits)/i, name);
    assert.match(skill, /MAIN REVIEW/, name);
    assert.match(skill, /bounded diff and evidence/i, name);
    assert.doesNotMatch(skill, /Main .{0,80}(?:owns authorized vertical TDD changes|execute each authorized vertical .+ directly)/i);
  }

  assert.match(mle, /review.+`ml\.review`.+failure or fix.+`ml\.debug`.+new build or implementation.+`code\.dev`/isu);
  assert.match(mle, /initial `WORKFLOW PLAN`[\s\S]*exact same-namespace[\s\S]*`skill:\/\/ecc-skill-catalog\/<skill-id>\/SKILL\.md`/iu);
});

test('ML, research, and brand methods consume the declared workflow without becoming routers', async () => {
  const [mle, research, brand] = await Promise.all([
    readSkill('mle-workflow'),
    readSkill('research-ops'),
    readSkill('brand-voice'),
  ]);

  assert.match(
    mle,
    /substantive mutation.+`ml\.debug` or `code\.dev`.+plugin `plan`.+native `task`.+RED-GREEN-REFACTOR.+`MAIN REVIEW`.+native `reviewer`/isu,
  );
  assert.match(
    mle,
    /`ml\.review`.+bounded read-only native `task`.+inspect and report.+does not mutate/isu,
  );
  assert.match(mle, /native `reviewer`.+only.+existing semantic diff or patch/isu);

  assert.match(
    research,
    /only after Main.+`WORKFLOW PLAN`.+exact Skill URI.+loads it before `WORKFLOW READY`/isu,
  );
  assert.match(
    research,
    /research method.+does not select, load, or dispatch.+other Skill or Agent.+second router/isu,
  );

  assert.match(
    brand,
    /`x-api` and downstream Skills.+only when.+`WORKFLOW PLAN`.+currently visible.+loaded before `WORKFLOW READY`/isu,
  );
  assert.match(brand, /does not select or load another Skill or Agent/isu);
});

test('deep research uses only exposed web methods and never invents config or file authority', async () => {
  const skill = await readSkill('deep-research');

  assert.match(skill, /currently exposed.+web search.+page-reading/isu);
  assert.match(skill, /Firecrawl.+Exa.+examples.+only when exposed/isu);
  assert.match(skill, /do not configure.+active task/isu);
  assert.match(skill, /Save.+only when the user requests.+safe path/isu);
  assert.match(skill, /otherwise.+chat/isu);
  assert.doesNotMatch(skill, /At least one of:|Configure in `~\/\.claude\.json`|~\/\.codex\/config\.toml/iu);
});

test('updated ECC methods retain their domain evidence instead of becoming generic delegation wrappers', async () => {
  const entries = await Promise.all([
    ['deep-research', /source matrix|cross-reference/i],
    ['santa-method', /factual accuracy|hallucination/i],
    ['council', /tradeoff|ambiguity/i],
    ['click-path-audit', /state stores|event handler/i],
    ['team-builder', /selection|synthesi[sz]e/i],
    ['skill-stocktake', /inventory|freshness/i],
    ['rules-distill', /2\+ skills|cross-read/i],
    ['search-first', /npm|PyPI|GitHub/i],
  ].map(async ([name, anchor]) => [name, anchor, await readSkill(name)]));

  for (const [name, anchor, skill] of entries) {
    assert.match(skill, anchor, `${name} lost its domain method`);
  }

  const [gan, clickPath, rules] = await Promise.all([
    readSkill('gan-style-harness'),
    readSkill('click-path-audit'),
    readSkill('rules-distill'),
  ]);
  assert.doesNotMatch(`${gan}\n${clickPath}`, /`code-development`/);
  assert.doesNotMatch(
    rules,
    /parallel-subagent-batch-merge|llm-memory-trust-boundary|llm-social-agent-anti-pattern/,
  );
});

test('ECC guides use the live native TODO contract instead of a host-specific tool name', async () => {
  const skills = await readAllSkillEntrypoints(path.join(packageRoot, 'skills', 'ecc'));
  for (const [target, skill] of skills) {
    assert.doesNotMatch(skill, /\bTodoWrite\b/, target);
  }
});

test('database pattern guides defer read-only audits to the workflow task role', async () => {
  for (const name of ['postgres-patterns', 'mysql-patterns', 'redis-patterns']) {
    const skill = await readSkill(name);
    assert.match(skill, /database\.review.+bounded `task`.+read-only audit/isu, name);
    assert.match(skill, /native `reviewer`.+existing semantic diff or patch/isu, name);
    assert.doesNotMatch(skill, /database\.review.+canonical `reviewer`/isu, name);
  }
});

test('security review examples preserve read-only and external-effect authority', async () => {
  const skill = await readSkill('security-review');

  assert.match(skill, /examples.+patterns.+not permission/isu);
  assert.match(skill, /read-only `security\.review`.+inspect and report.+do not.+edit.+install.+update.+commit/isu);
  assert.match(skill, /mutating command.+only.+explicit user authorization.+native permission.+exact effect/isu);
  assert.doesNotMatch(skill, /# ALWAYS commit lock files/iu);
});

test('delegation guides copy direct constraints verbatim without adding examples', async () => {
  const [code, opensource] = await Promise.all([
    readFile(path.join(packageRoot, 'skills', 'code-development', 'SKILL.md'), 'utf8'),
    readSkill('opensource-pipeline'),
  ]);

  for (const [name, skill] of [['code-development', code], ['opensource-pipeline', opensource]]) {
    assert.match(skill, /task body cop(?:y|ies) all direct user constraints verbatim and add(?:s)? no examples/isu, name);
    assert.match(skill, /outer context, name, or label.+not a substitute/isu, name);
  }
});

test('marketplace Skill Markdown filesystem links resolve recursively', async () => {
  const pluginRoots = (await readdir(path.dirname(packageRoot), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(path.dirname(packageRoot), entry.name, 'skills'));
  const skills = (await Promise.all(pluginRoots.map(readAllMarkdownResources))).flat();
  const missing = [];

  for (const [target, skill] of skills) {
    const markdown = withoutFencedCode(skill);
    for (const match of markdown.matchAll(/!?\[[^\]\r\n]*\]\((?:<([^>\r\n]+)>|([^\s)]+))(?:\s+["'][^)]+["'])?\)/gu)) {
      const href = (match[1] ?? match[2] ?? '').trim();
      if (!href
        || /^(?:https?:\/\/|mailto:|skill:\/\/|#)/iu.test(href)
        || /^url(?:[/?#].*)?$/iu.test(href)
        || /^(?:path|\.{3})$/iu.test(href)
        || path.isAbsolute(href)) continue;
      const relativeTarget = href.split(/[?#]/u, 1)[0];
      if (!relativeTarget) continue;
      try {
        await access(path.resolve(path.dirname(target), relativeTarget));
      } catch {
        missing.push(`${path.relative(packageRoot, target)} -> ${href}`);
      }
    }
  }

  assert.deepEqual(missing.sort(), []);
});

test('knowledge and compaction guides preserve live-host and external-effect boundaries', async () => {
  const [knowledge, compact] = await Promise.all([
    readSkill('knowledge-ops'),
    readSkill('strategic-compact'),
  ]);

  assert.match(knowledge, /explicit user authorization/i);
  assert.doesNotMatch(knowledge, /^-(?: Write status summary,)? commit and push$/im);
  assert.match(knowledge, /findings, not completion permission/i);
  assert.match(compact, /only when the current host exposes/i);
  assert.match(compact, /does not authorize/i);
});

test('nested code methods defer to the task-owned code lifecycle and explicit Git authority', async () => {
  const tdd = await readSkill('tdd-workflow');

  assert.match(tdd, /`code-development` owns the parent lifecycle/i);
  assert.match(tdd, /native `task` owns the complete vertical RED-GREEN-REFACTOR slice/i);
  assert.match(tdd, /explicit user authorization/i);
  assert.doesNotMatch(tdd, /minimum 80%|create a checkpoint commit immediately|must describe the stage/i);
});

test('RFC decomposition remains a Main-owned planning method rather than a second orchestrator', async () => {
  const rfc = await readSkill('ralphinho-rfc-pipeline');

  assert.match(rfc, /Main owns the parent plan/i);
  assert.match(rfc, /dynamic Available Agents/i);
  assert.match(rfc, /native `task`/i);
  assert.match(rfc, /explicit user authorization/i);
  assert.doesNotMatch(rfc, /always rebase|retry with updated constraints|merge queue rules/i);
});

test('product and video guides use Skill identities and live host contracts', async () => {
  const [product, video] = await Promise.all([
    readSkill('product-lens'),
    readSkill('videodb'),
  ]);

  assert.doesNotMatch(product, /(?:^|[\s(])\/(?:browser-qa|design-system|canary-watch)\b/mu);
  assert.match(product, /skill:\/\/ecc-skill-catalog\/(?:browser-qa|design-system|canary-watch)\/SKILL\.md/u);
  assert.match(product, /default.+chat.+report/isu);
  assert.match(product, /write.+PRODUCT-BRIEF\.md.+only when the user requests.+safe path/isu);
  assert.match(product, /clone or install.+only.+explicit.+authoriz.+isolated target/isu);
  assert.doesNotMatch(product, /Output: a `PRODUCT-BRIEF\.md`|1\. Clone\/install the product as a new user/iu);
  assert.doesNotMatch(video, /^allowed-tools:|\bGlob tool\b/im);
  assert.match(video, /explicitly authorizes/i);
  assert.match(video, /current host/i);
});

test('external orchestrator guides are explicit opt-in targets and never replace native task', async () => {
  const [devfleet, dmux] = await Promise.all([
    readSkill('claude-devfleet'),
    readSkill('dmux-workflows'),
  ]);

  for (const [name, skill] of [
    ['claude-devfleet', devfleet],
    ['dmux-workflows', dmux],
  ]) {
    assert.match(skill, /explicitly requests/i, name);
    assert.match(skill, /native `task` remains the default/i, name);
    assert.match(skill, /Main owns/i, name);
    assert.match(skill, /explicit user authorization/i, name);
  }

  assert.doesNotMatch(devfleet, /up to 3 concurrent agents by default|auto-dispatch|auto-merge|claude mcp add/i);
  assert.doesNotMatch(dmux, /Pane [123]:|git worktree add|git merge feat|brew install|apt install|under 5-6/i);
});

test('marketing campaign is a selected domain method without its own gates or orchestration', async () => {
  const skill = await readSkill('marketing-campaign');
  const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/u)?.[1] ?? '';

  assert.match(frontmatter, /Use after Main selects a marketing workflow/i);
  assert.match(skill, /domain method/i);
  assert.match(skill, /Main owns workflow selection, orchestration, delegation, integration, and completion/i);
  assert.match(skill, /only the deliverables the user explicitly requests or authorizes/i);
  assert.match(skill, /no fixed full-campaign bundle or minimum deliverable count/i);
  assert.match(skill, /review findings are advisory/i);
  assert.match(skill, /external effect.+explicit user authorization/is);
  assert.match(skill, /does not auto-dispatch, retry, publish, or create a parallel orchestration layer/i);
  assert.match(skill, /audience research/i);
  assert.match(skill, /channel/i);
  assert.match(skill, /claim/i);
  assert.match(skill, /calendar/i);
  assert.match(skill, /measurement/i);
  assert.doesNotMatch(skill, /Use as (?:an?|the) orchestration layer|No copy ships without passing|Do not write any copy until.+approved|^## Quality Gate$/im);
});
