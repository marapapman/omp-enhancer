import { strict as assert } from 'node:assert';
import { existsSync } from 'node:fs';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, mock } from 'node:test';

import extension from '../index.js';
import { defaultProbeChrome, renderMermaid, resolveMermaidCliPath } from '../src/mermaid-render.js';
import { MermaidRuntimeError } from '../src/runtime-error.js';

const SIMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text>ok</text></svg>';

function schema(kind, data = {}) {
  const value = { __ompZodSchema: true, kind, ...data };
  value.describe = () => value;
  value.optional = () => ({ ...value, optional: true });
  return value;
}

function makeExtensionApi() {
  return {
    registerTool: mock.fn(),
    setLabel: mock.fn(),
    zod: {
      z: {
        object: (shape) => schema('object', { shape }),
        string: () => schema('string'),
        number: () => schema('number'),
        boolean: () => schema('boolean'),
        array: (item) => schema('array', { item }),
        enum: (values) => schema('enum', { values }),
        optional: (value) => ({ ...value, optional: true }),
      },
    },
  };
}

async function tempProject() {
  return mkdtemp(join(tmpdir(), 'omp-mermaid-test-'));
}

/** Write a fake executable at dir/name (mode 0755) and return its path. */
async function writeExecutable(dir, name) {
  await mkdir(dir, { recursive: true });
  const file = join(dir, name);
  await writeFile(file, '#!/bin/sh\nexit 0\n', 'utf8');
  await chmod(file, 0o755);
  return file;
}

/** Write a plain file at dir/name (mode 0644, no exec bit) and return its path. */
async function writePlainFile(dir, name) {
  await mkdir(dir, { recursive: true });
  const file = join(dir, name);
  await writeFile(file, 'not an executable\n', 'utf8');
  return file;
}

/** Mock command runner that writes an SVG at the -o path and reports success. */
function svgCommandRunner(svgContent = SIMPLE_SVG) {
  return mock.fn(async (_executable, args) => {
    const outIndex = args.indexOf('-o');
    assert.ok(outIndex !== -1, 'argv must include -o');
    await writeFile(args[outIndex + 1], svgContent, 'utf8');
    return { exitCode: 0, signal: null, stdout: '', stderr: '', shell: false };
  });
}

const mockOptions = {
  mermaidCliPath: '/fake/mmdc',
  probeChrome: async () => '/fake/chrome',
};

describe('mermaid_render registration', () => {
  it('registers mermaid_render as the only tool with approval exec and the frozen param surface', () => {
    const api = makeExtensionApi();
    extension(api);

    const tools = api.registerTool.mock.calls.map((call) => call.arguments[0]);
    assert.equal(tools.length, 1, 'must register exactly 1 tool');
    const render = tools.find((tool) => tool.name === 'mermaid_render');
    assert.ok(render, 'mermaid_render must be registered');
    assert.equal(render.approval, 'exec', 'mermaid_render must use exec approval');
    assert.equal(render.defaultInactive !== true, true, 'mermaid_render should not default to inactive');

    const shape = render.parameters.shape;
    // Frozen param surface: source XOR sourcePath / outputDirectory / theme / width / timeoutMs
    assert.equal(Object.hasOwn(shape, 'source'), true);
    assert.equal(Object.hasOwn(shape, 'sourcePath'), true);
    assert.equal(Object.hasOwn(shape, 'outputDirectory'), true);
    assert.equal(Object.hasOwn(shape, 'theme'), true);
    assert.equal(Object.hasOwn(shape, 'width'), true);
    assert.equal(Object.hasOwn(shape, 'timeoutMs'), true);
    // NO targetBase, NO executable/command params
    assert.equal(Object.hasOwn(shape, 'targetBase'), false, 'targetBase must not exist');
    assert.equal(Object.hasOwn(shape, 'executable'), false, 'no executable param');
    assert.equal(Object.hasOwn(shape, 'command'), false, 'no command param');
    assert.deepEqual(shape.theme.values, ['default', 'forest', 'dark', 'neutral']);

    // Only mermaid_render remains registered
    assert.deepEqual(tools.map((tool) => tool.name), ['mermaid_render']);
  });
});

describe('mermaid_render parameter validation', () => {
  it('rejects both or neither of source / sourcePath', async () => {
    const root = await tempProject();
    await assert.rejects(
      renderMermaid({ projectRoot: root }),
      (error) => error instanceof MermaidRuntimeError && error.code === 'INVALID_PARAMETER',
    );
    await assert.rejects(
      renderMermaid({ projectRoot: root, source: 'graph TD; A-->B;', sourcePath: 'flow.mmd' }),
      (error) => error instanceof MermaidRuntimeError && error.code === 'INVALID_PARAMETER',
    );
  });

  it('rejects an empty inline source', async () => {
    const root = await tempProject();
    await assert.rejects(
      renderMermaid({ projectRoot: root, source: '' }),
      (error) => error instanceof MermaidRuntimeError && error.code === 'INVALID_PARAMETER',
    );
  });

  it('rejects a sourcePath with the wrong extension', async () => {
    const root = await tempProject();
    await writeFile(join(root, 'bad.tex'), '\\documentclass{article}');
    await assert.rejects(
      renderMermaid({ projectRoot: root, sourcePath: 'bad.tex' }),
      (error) => error instanceof MermaidRuntimeError && error.code === 'INVALID_PARAMETER',
    );
  });

  it('rejects a sourcePath whose basename begins with a dash', async () => {
    const root = await tempProject();
    await writeFile(join(root, '-flow.mmd'), 'graph TD; A-->B;');
    await assert.rejects(
      renderMermaid({ projectRoot: root, sourcePath: '-flow.mmd' }),
      (error) => error instanceof MermaidRuntimeError && error.code === 'INVALID_PARAMETER',
    );
  });

  it('rejects sourcePath traversal with PATH_OUTSIDE_PROJECT', async () => {
    const root = await tempProject();
    await assert.rejects(
      renderMermaid({ projectRoot: root, sourcePath: '../escape.mmd' }),
      (error) => error instanceof MermaidRuntimeError && error.code === 'PATH_OUTSIDE_PROJECT',
    );
  });

  it('rejects timeoutMs below 1000', async () => {
    const root = await tempProject();
    await assert.rejects(
      renderMermaid({ projectRoot: root, source: 'graph TD; A-->B;', timeoutMs: 999 }),
      (error) => error instanceof MermaidRuntimeError && error.code === 'INVALID_PARAMETER',
    );
  });

  it('rejects an invalid theme and a non-positive width', async () => {
    const root = await tempProject();
    await assert.rejects(
      renderMermaid({ projectRoot: root, source: 'graph TD; A-->B;', theme: 'ocean' }),
      (error) => error instanceof MermaidRuntimeError && error.code === 'INVALID_PARAMETER',
    );
    await assert.rejects(
      renderMermaid({ projectRoot: root, source: 'graph TD; A-->B;', width: 0 }),
      (error) => error instanceof MermaidRuntimeError && error.code === 'INVALID_PARAMETER',
    );
  });
});

describe('mermaid_render bounded command', () => {
  it('invokes the frozen argv shape with timeout propagation and writes the mermaid/puppeteer configs', async () => {
    const root = await tempProject();
    let captured;
    const commandRunner = mock.fn(async (executable, args, options) => {
      captured = { executable, args, options };
      // Read the configs while the isolated workspace still exists.
      captured.mermaidConfig = JSON.parse(await readFile(args[args.indexOf('-c') + 1], 'utf8'));
      captured.puppeteerConfig = JSON.parse(await readFile(args[args.indexOf('-p') + 1], 'utf8'));
      const outIndex = args.indexOf('-o');
      await writeFile(args[outIndex + 1], SIMPLE_SVG, 'utf8');
      return { exitCode: 0, signal: null, stdout: '', stderr: '', shell: false };
    });

    const result = await renderMermaid({
      projectRoot: root,
      source: 'graph TD;\n  A-->B;\n',
      theme: 'forest',
      width: 800,
      outputDirectory: 'figures/mermaid/rendered',
      timeoutMs: 5000,
    }, { ...mockOptions, commandRunner });

    assert.equal(captured.executable, process.execPath, 'must spawn via the current node executable');
    const args = captured.args;
    assert.equal(args[0], '/fake/mmdc', 'first argv is the resolved mmdc CLI path');
    assert.equal(args[1], '-i');
    assert.equal(args[args.indexOf('-e') + 1], 'svg');
    assert.equal(args[args.indexOf('-t') + 1], 'forest');
    assert.equal(args[args.indexOf('-w') + 1], '800');
    assert.equal(captured.options.timeoutMs, 5000, 'timeoutMs must propagate to the bounded runner');
    assert.equal(captured.options.maxOutputBytes, 256 * 1024);
    assert.equal(captured.options.cwd.endsWith('workspace'), true);

    // mermaid config written with theme, htmlLabels:false, pinned fontFamily
    assert.equal(captured.mermaidConfig.theme, 'forest');
    assert.equal(captured.mermaidConfig.htmlLabels, false);
    assert.equal(typeof captured.mermaidConfig.fontFamily, 'string');
    assert.ok(captured.mermaidConfig.fontFamily.length > 0);
    assert.deepEqual(captured.mermaidConfig.flowchart, {});

    // puppeteer config pins the probed browser plus sandbox + offline flags
    assert.deepEqual(captured.puppeteerConfig, {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',
      ],
      executablePath: '/fake/chrome',
    });

    assert.equal(result.ok, true);
    assert.equal(result.sourcePath, 'diagram.mmd');
    assert.equal(result.revision.length, 64);
    assert.equal(result.evidence.isolatedWorkspace, true);
    assert.equal(result.evidence.offline, true);
    assert.equal(result.evidence.sandboxFlags, true);
    assert.equal(result.evidence.commands.length, 1);
    assert.match(
      result.artifacts.svg.relativePath,
      /^figures\/mermaid\/rendered\/diagram-[0-9a-f]{12}\.svg$/,
    );
    const published = await readFile(join(root, result.artifacts.svg.relativePath), 'utf8');
    assert.match(published, /viewBox/);
  });

  it('renders a project sourcePath and derives the artifact base from its basename', async () => {
    const root = await tempProject();
    await writeFile(join(root, 'deploy-flow.mmd'), 'graph LR;\n  plan-->build;\n');
    const commandRunner = svgCommandRunner();
    const result = await renderMermaid({
      projectRoot: root,
      sourcePath: 'deploy-flow.mmd',
    }, { ...mockOptions, commandRunner });

    assert.equal(result.sourcePath, 'deploy-flow.mmd');
    assert.match(result.artifacts.svg.relativePath, /^figures\/mermaid\/rendered\/deploy-flow-[0-9a-f]{12}\.svg$/);
  });

  it('surfaces OUTPUT_LIMIT and COMMAND_TIMEOUT from the bounded runner', async () => {
    const root = await tempProject();
    const outputLimitRunner = async () => {
      throw new MermaidRuntimeError('OUTPUT_LIMIT', 'Command output exceeded 262144 bytes.');
    };
    await assert.rejects(
      renderMermaid({ projectRoot: root, source: 'graph TD; A-->B;' }, { ...mockOptions, commandRunner: outputLimitRunner }),
      (error) => error instanceof MermaidRuntimeError && error.code === 'OUTPUT_LIMIT',
    );

    const timeoutRunner = async () => {
      throw new MermaidRuntimeError('COMMAND_TIMEOUT', '/fake/mmdc exceeded the 60000 ms timeout.');
    };
    await assert.rejects(
      renderMermaid({ projectRoot: root, source: 'graph TD; A-->B;' }, { ...mockOptions, commandRunner: timeoutRunner }),
      (error) => error instanceof MermaidRuntimeError && error.code === 'COMMAND_TIMEOUT',
    );
  });

  it('surfaces the captured stderr when an injected runner reports a nonzero exit', async () => {
    const root = await tempProject();
    const failingRunner = async () => ({
      exitCode: 1,
      signal: null,
      stdout: '',
      stderr: 'Failed to launch the browser process: /fake/chrome: ELF: not found\n',
      shell: false,
    });
    await assert.rejects(
      renderMermaid({ projectRoot: root, source: 'graph TD; A-->B;' }, { ...mockOptions, commandRunner: failingRunner }),
      (error) => error instanceof MermaidRuntimeError
        && error.code === 'COMMAND_FAILED'
        && /ELF: not found/u.test(error.details?.stderr ?? ''),
    );
  });
});

describe('mermaid_render artifact naming', () => {
  it('is idempotent for identical content and conflicts when published content differs', async () => {
    const root = await tempProject();
    const first = await renderMermaid(
      { projectRoot: root, source: 'graph TD;\n  A-->B;\n' },
      { ...mockOptions, commandRunner: svgCommandRunner() },
    );
    const second = await renderMermaid(
      { projectRoot: root, source: 'graph TD;\n  A-->B;\n' },
      { ...mockOptions, commandRunner: svgCommandRunner() },
    );
    assert.equal(first.artifacts.svg.relativePath, second.artifacts.svg.relativePath);
    assert.equal(first.revision, second.revision);

    // Corrupt the published artifact: next identical render must conflict.
    await writeFile(join(root, first.artifacts.svg.relativePath), '<svg>different</svg>', 'utf8');
    await assert.rejects(
      renderMermaid(
        { projectRoot: root, source: 'graph TD;\n  A-->B;\n' },
        { ...mockOptions, commandRunner: svgCommandRunner() },
      ),
      (error) => error instanceof MermaidRuntimeError && error.code === 'ARTIFACT_CONFLICT',
    );
  });

  it('rejects a symlinked artifact target with SYMLINK_ESCAPE', async () => {
    const root = await tempProject();
    const first = await renderMermaid(
      { projectRoot: root, source: 'graph TD; A-->B;' },
      { ...mockOptions, commandRunner: svgCommandRunner() },
    );
    const target = join(root, first.artifacts.svg.relativePath);
    await rm(target);
    await symlink(root, target);
    await assert.rejects(
      renderMermaid(
        { projectRoot: root, source: 'graph TD; A-->B;' },
        { ...mockOptions, commandRunner: svgCommandRunner() },
      ),
      (error) => error instanceof MermaidRuntimeError && error.code === 'SYMLINK_ESCAPE',
    );
  });
});

describe('defaultProbeChrome browser detection', () => {
  it('finds a system chromium on PATH', async () => {
    const root = await tempProject();
    const chrome = await writeExecutable(join(root, 'bin'), 'chromium');
    const found = await defaultProbeChrome({
      env: { PATH: join(root, 'bin') },
      resolvePuppeteer: async () => null,
    });
    assert.equal(found, chrome);
  });

  it('also recognizes chromium-browser on PATH', async () => {
    const root = await tempProject();
    const chrome = await writeExecutable(join(root, 'bin'), 'chromium-browser');
    const found = await defaultProbeChrome({
      env: { PATH: join(root, 'bin') },
      resolvePuppeteer: async () => null,
    });
    assert.equal(found, chrome);
  });

  it('skips PATH binaries without the exec bit and picks the next candidate', async () => {
    const root = await tempProject();
    const dir1 = join(root, 'bin1');
    const dir2 = join(root, 'bin2');
    await writePlainFile(dir1, 'chromium');
    const chrome = await writeExecutable(dir2, 'chromium');
    const found = await defaultProbeChrome({
      env: { PATH: `${dir1}${delimiter}${dir2}` },
      resolvePuppeteer: async () => null,
    });
    assert.equal(found, chrome);
  });

  it('prefers a PATH chromium over an executable puppeteer-cache binary', async () => {
    const root = await tempProject();
    const cacheChrome = await writeExecutable(join(root, 'cache'), 'chrome');
    const pathChrome = await writeExecutable(join(root, 'bin'), 'chromium');
    const found = await defaultProbeChrome({
      env: { PATH: join(root, 'bin') },
      resolvePuppeteer: async () => ({ executablePath: () => cacheChrome }),
    });
    assert.equal(found, pathChrome);
  });

  it('rejects a non-executable puppeteer-cache binary in favor of a PATH chromium', async () => {
    const root = await tempProject();
    const cacheChrome = await writePlainFile(join(root, 'cache'), 'chrome');
    const pathChrome = await writeExecutable(join(root, 'bin'), 'chromium');
    const found = await defaultProbeChrome({
      env: { PATH: join(root, 'bin') },
      resolvePuppeteer: async () => ({ executablePath: () => cacheChrome }),
    });
    assert.equal(found, pathChrome);
  });

  it('returns null when the only cache binary is not executable', async () => {
    const root = await tempProject();
    const cacheChrome = await writePlainFile(join(root, 'cache'), 'chrome');
    const found = await defaultProbeChrome({
      env: { PATH: '' },
      resolvePuppeteer: async () => ({ executablePath: () => cacheChrome }),
    });
    assert.equal(found, null);
  });

  it('falls back to an executable puppeteer-cache binary when PATH has no chromium', async () => {
    const root = await tempProject();
    const cacheChrome = await writeExecutable(join(root, 'cache'), 'chrome');
    const found = await defaultProbeChrome({
      env: { PATH: '' },
      resolvePuppeteer: async () => ({ executablePath: () => cacheChrome }),
    });
    assert.equal(found, cacheChrome);
  });

  it('lets PUPPETEER_EXECUTABLE_PATH override the PATH scan', async () => {
    const root = await tempProject();
    const envChrome = await writeExecutable(join(root, 'env'), 'chrome');
    await writeExecutable(join(root, 'bin'), 'chromium');
    const found = await defaultProbeChrome({
      env: { PUPPETEER_EXECUTABLE_PATH: envChrome, PATH: join(root, 'bin') },
      resolvePuppeteer: async () => null,
    });
    assert.equal(found, envChrome);
  });

  it('reads the real PUPPETEER_EXECUTABLE_PATH and PATH when called with no arguments', async () => {
    const root = await tempProject();
    const envChrome = await writeExecutable(join(root, 'env'), 'chrome');
    const previous = process.env.PUPPETEER_EXECUTABLE_PATH;
    process.env.PUPPETEER_EXECUTABLE_PATH = envChrome;
    try {
      const found = await defaultProbeChrome();
      assert.equal(found, envChrome);
    } finally {
      if (previous === undefined) {
        delete process.env.PUPPETEER_EXECUTABLE_PATH;
      } else {
        process.env.PUPPETEER_EXECUTABLE_PATH = previous;
      }
    }
  });
});

describe('mermaid_render environment preflight', () => {
  it('returns MERMAID_NOT_INSTALLED with actionable guidance when mermaid-cli is missing', async () => {
    const root = await tempProject();
    await assert.rejects(
      renderMermaid(
        { projectRoot: root, source: 'graph TD; A-->B;' },
        { mermaidCliPath: null },
      ),
      (error) => error instanceof MermaidRuntimeError
        && error.code === 'MERMAID_NOT_INSTALLED'
        && /install/i.test(error.message),
    );
  });

  it('returns CHROME_NOT_FOUND with guidance when the Chrome probe finds no executable', async () => {
    const root = await tempProject();
    await assert.rejects(
      renderMermaid(
        { projectRoot: root, source: 'graph TD; A-->B;' },
        { mermaidCliPath: '/fake/mmdc', probeChrome: async () => null },
      ),
      (error) => error instanceof MermaidRuntimeError
        && error.code === 'CHROME_NOT_FOUND'
        && /chrome|puppeteer/i.test(error.message)
        && /system chromium/i.test(error.message),
    );
  });
});

describe('mermaid_render revision determinism', () => {
  it('produces identical revisions for identical source/config and different revisions for changed source or theme', async () => {
    const root = await tempProject();
    const source = 'graph TD;\n  A-->B;\n';

    const first = await renderMermaid(
      { projectRoot: root, source, theme: 'dark' },
      { ...mockOptions, commandRunner: svgCommandRunner() },
    );
    const second = await renderMermaid(
      { projectRoot: root, source, theme: 'dark' },
      { ...mockOptions, commandRunner: svgCommandRunner() },
    );
    assert.equal(first.revision, second.revision, 'same source + config must hash identically');

    const changedSource = await renderMermaid(
      { projectRoot: root, source: 'graph TD;\n  A-->C;\n', theme: 'dark' },
      { ...mockOptions, commandRunner: svgCommandRunner() },
    );
    assert.notEqual(first.revision, changedSource.revision, 'changed source must change the revision');

    const changedTheme = await renderMermaid(
      { projectRoot: root, source, theme: 'forest' },
      { ...mockOptions, commandRunner: svgCommandRunner() },
    );
    assert.notEqual(first.revision, changedTheme.revision, 'changed theme must change the revision');
  });
});

describe('mermaid-cli resolution', () => {
  it('resolveMermaidCliPath returns an existing file matching the discovered bin.mmdc', async () => {
    const cliPath = await resolveMermaidCliPath();
    assert.ok(cliPath, 'mermaid-cli must be resolvable after npm install');
    assert.equal(existsSync(cliPath), true, `resolved CLI must exist: ${cliPath}`);

    // Independently rediscover the package root via the ancestor walk.
    const entryPath = fileURLToPath(import.meta.resolve('@mermaid-js/mermaid-cli'));
    let current = dirname(entryPath);
    let pkg = null;
    for (let depth = 0; depth < 64; depth += 1) {
      try {
        const candidate = JSON.parse(await readFile(join(current, 'package.json'), 'utf8'));
        if (candidate.name === '@mermaid-js/mermaid-cli') {
          pkg = candidate;
          break;
        }
      } catch {
        // keep walking
      }
      const parent = dirname(current);
      if (parent === current) break;
      current = parent;
    }
    assert.ok(pkg, 'must discover the @mermaid-js/mermaid-cli package.json');
    assert.equal(cliPath, resolve(current, pkg.bin.mmdc));
  });
});
