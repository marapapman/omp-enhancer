import { createHash } from 'node:crypto';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const separator = process.argv.indexOf('--');
const ompArgs = separator >= 0 ? process.argv.slice(separator + 1) : process.argv.slice(2);
const hasExplicitExtension = ompArgs.some((arg) => (
  ['-e', '--extension', '--plugin-dir'].includes(arg)
  || arg.startsWith('--extension=')
  || arg.startsWith('--plugin-dir=')
));
if (ompArgs.includes('--no-extensions') && hasExplicitExtension) {
  process.stderr.write('--no-extensions disables explicitly supplied extensions; use an isolated probe without that flag for the worktree comparison.\n');
  process.exit(2);
}
const cwd = path.resolve(process.env.OMP_RPC_CWD || process.cwd());
const useHostInstallation = process.env.OMP_RPC_USE_HOST_INSTALLATION === '1';
const stateRoot = process.env.OMP_RPC_STATE_ROOT
  ? path.resolve(process.env.OMP_RPC_STATE_ROOT)
  : await mkdtemp(path.join(tmpdir(), 'omp-enhancer-rpc-'));
const agentDir = path.join(stateRoot, 'agent');
const sessionDir = path.join(stateRoot, 'sessions');
await Promise.all([mkdir(agentDir, { recursive: true }), mkdir(sessionDir, { recursive: true })]);

const ompBin = process.env.OMP_BIN || 'omp';
const ompVersion = readOmpVersion(ompBin);
const child = spawn(ompBin, [
  '--mode', 'rpc',
  '--no-session',
  '--no-title',
  '--cwd', cwd,
  ...ompArgs,
], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: useHostInstallation
    ? { ...process.env }
    : {
      ...process.env,
      HOME: stateRoot,
      PI_CODING_AGENT_DIR: agentDir,
      PI_CODING_AGENT_SESSION_DIR: sessionDir,
      OMP_PROFILE: '',
      PI_PROFILE: '',
    },
});

let stdout = '';
let stderr = '';
let settled = false;
const setupCommand = String(process.env.OMP_RPC_SETUP_COMMAND || '').trim();
let availableCommands = [];
let setupAgentInvoked = null;
let ready = false;
let setupSent = false;

child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stderr.on('data', (chunk) => { stderr += chunk; });
child.stdout.on('data', (chunk) => {
  stdout += chunk;
  drainLines();
});
child.on('error', (error) => finish(1, { error: error.message }));
child.on('exit', (code) => {
  if (!settled) finish(code || 1, { error: `OMP exited before get_state (${code})`, stderr: tail(stderr) });
});
setTimeout(() => finish(1, { error: 'OMP RPC probe timed out', stderr: tail(stderr) }), 20_000).unref();

function drainLines() {
  while (stdout.includes('\n')) {
    const newline = stdout.indexOf('\n');
    const line = stdout.slice(0, newline).trim();
    stdout = stdout.slice(newline + 1);
    if (!line) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'ready') {
      ready = true;
      startProbeWhenReady();
      continue;
    }
    if (event.type === 'available_commands_update') {
      availableCommands = Array.isArray(event.commands) ? event.commands.map((command) => command?.name).filter(Boolean) : [];
      startProbeWhenReady();
      continue;
    }
    if (event.type === 'response' && event.command === 'prompt' && event.id === 'setup') {
      if (event.success === false) {
        finish(1, { error: `OMP setup command failed: ${event.error ?? 'unknown error'}`, stderr: tail(stderr) });
      } else {
        setupAgentInvoked = event.data?.agentInvoked ?? null;
        requestState();
      }
      continue;
    }
    if (event.type !== 'response' || event.command !== 'get_state') continue;
    finish(0, summarizeState(event.data ?? {}));
  }
}

function requestState() {
  child.stdin.write(`${JSON.stringify({ id: 'state', type: 'get_state' })}\n`);
}

function startProbeWhenReady() {
  if (!ready || setupSent) return;
  if (!setupCommand) {
    setupSent = true;
    requestState();
    return;
  }
  const slashName = setupCommand.match(/^\/([^\s]+)/u)?.[1];
  if (slashName && !availableCommands.includes(slashName)) return;
  setupSent = true;
  child.stdin.write(`${JSON.stringify({ id: 'setup', type: 'prompt', message: setupCommand })}\n`);
}

function summarizeState(state) {
  const prompts = Array.isArray(state.systemPrompt) ? state.systemPrompt : [];
  const tools = Array.isArray(state.dumpTools) ? state.dumpTools : [];
  const task = tools.find((tool) => tool?.name === 'task');
  const joined = prompts.join('\n');
  const skillNames = availableCommands
    .filter((name) => name.startsWith('skill:'))
    .map((name) => name.slice('skill:'.length))
    .sort();
  const promptSkillNames = Array.from(new Set(
    [...joined.matchAll(/<skills>([\s\S]*?)<\/skills>/gu)].flatMap((match) => {
      const block = match[1];
      const xmlNames = [...block.matchAll(/<skill name="([^"]+)">/gu)].map((entry) => entry[1]);
      const listNames = [...block.matchAll(/^\s*-\s+([^:\n]+):/gmu)].map((entry) => entry[1].trim());
      return [...xmlNames, ...listNames];
    }),
  )).sort();
  const promptSkillNameSet = new Set(promptSkillNames);
  const skillDiscoveryReminder = 'Before acting, inspect the available OMP Skill list already present in context';
  return {
    ompVersion: state.version ?? ompVersion,
    hostInstallation: useHostInstallation,
    setupAgentInvoked,
    promptBlocks: prompts.map((block, index) => ({
      index,
      chars: String(block).length,
      sha256: hash(String(block)),
    })),
    promptChars: prompts.reduce((sum, block) => sum + String(block).length, 0),
    activeToolNames: tools.map((tool) => tool?.name).filter(Boolean).sort(),
    taskToolSha256: task ? hash(JSON.stringify(task)) : null,
    taskHasNativeAgents: Object.fromEntries(
      ['scout', 'task', 'sonic', 'reviewer', 'designer', 'librarian']
        .map((name) => [name, JSON.stringify(task ?? {}).includes(name)]),
    ),
    taskHasOmpTargetAuditor: JSON.stringify(task ?? {}).includes('omp-target-auditor'),
    forbiddenAutomaticGuidance: {
      firstToolTodo: /FIRST tool call|first tool call must initialize/i.test(joined),
      exactRoleWhitelist: /Invoke only roles|exact installed agent IDs for that workflow/i.test(joined),
      completeCatalog: /Complete workflow catalog/i.test(joined),
      hiddenReminder: /OMP autonomous workflow reminder/i.test(joined),
    },
    workflowSkillVisible: /omp-enhancer-workflows/i.test(joined),
    workflowCatalogImports: count(joined, 'OMP_ENHANCER_WORKFLOW_CATALOG.md'),
    skillDiscovery: {
      commandCount: skillNames.length,
      promptNameCount: promptSkillNames.length,
      namesSha256: hash(JSON.stringify(skillNames)),
      promptNamesSha256: hash(JSON.stringify(promptSkillNames)),
      commandOnlyNames: skillNames.filter((name) => !promptSkillNameSet.has(name)),
      systemPromptReminderCount: count(joined, skillDiscoveryReminder),
      reminderInTaskSchema: JSON.stringify(task ?? {}).includes(skillDiscoveryReminder),
      eccCatalogVisible: promptSkillNameSet.has('ecc-skill-catalog'),
      nestedEccExampleDirectlyVisible: promptSkillNameSet.has('angular-developer'),
      representativeVisibility: Object.fromEntries([
        'writing-review',
        'plain-chinese-writing',
        'fact-checking',
        'docker-compose',
        'systematic-debugging',
        'test-driven-development',
        'omp-enhancer-workflows',
        'xlsx',
        'pdf',
        'frontend-design',
        'webapp-testing',
      ].map((name) => [name, promptSkillNameSet.has(name)])),
    },
    enhancerCommands: availableCommands.filter((name) => /enhancer|config|writing|fact|test/i.test(name)).sort(),
  };
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function count(value, needle) {
  return value.split(needle).length - 1;
}

function tail(value) {
  return value.trim().split('\n').slice(-20).join('\n');
}

function readOmpVersion(binary) {
  const result = spawnSync(binary, ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  return String(result.stdout || result.stderr || '').trim() || null;
}

function finish(code, value) {
  if (settled) return;
  settled = true;
  let outputFlushed = false;
  let childClosed = child.exitCode !== null || child.signalCode !== null;
  const exitWhenReady = () => {
    if (outputFlushed && childClosed) process.exit(code);
  };
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`, () => {
    outputFlushed = true;
    exitWhenReady();
  });
  if (!childClosed) child.once('close', () => {
    childClosed = true;
    exitWhenReady();
  });
  child.kill('SIGTERM');
  setTimeout(() => {
    if (!childClosed) child.kill('SIGKILL');
  }, 1_000).unref();
}
