import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, mock } from 'node:test';

import extension from '../index.js';
import { searchCatalog } from '../src/catalog-search.js';
import { prepareAsset } from '../src/asset-prepare.js';
import { renderTikz, runBoundedCommand } from '../src/render-tikz.js';

const fixtureCatalog = fileURLToPath(new URL('./fixtures/catalog.json', import.meta.url));

function schema(kind, data = {}) {
  const value = { __ompZodSchema: true, kind, ...data };
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

async function temporaryDirectory(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

describe('tikz-helper runtime tools', () => {
  it('registers only the four opt-in tools with least-effect approvals', () => {
    const api = makeExtensionApi();
    extension(api);

    const tools = api.registerTool.mock.calls.map((call) => call.arguments[0]);
    assert.deepEqual(tools.map((tool) => tool.name), [
      'tikz_catalog_search',
      'tikz_prepare_asset',
      'tikz_render',
      'tikz_generate_diagram',
    ]);
    assert.deepEqual(tools.map((tool) => tool.approval), ['read', 'exec', 'exec', 'read']);
    assert.equal(tools.every((tool) => tool.defaultInactive === true), true);
    assert.equal(tools.every((tool) => tool.parameters?.__ompZodSchema === true), true);
    assert.equal(Object.hasOwn(tools[2].parameters.shape, 'executable'), false);
    assert.equal(Object.hasOwn(tools[2].parameters.shape, 'command'), false);
    // tikz_generate_diagram has graph (string), layoutOptions (optional string), styleOptions (optional string)
    assert.equal(Object.hasOwn(tools[3].parameters.shape, 'graph'), true);
  });

  it('returns structured tool success and parameter failures', async () => {
    const api = makeExtensionApi();
    extension(api);
    const catalogTool = api.registerTool.mock.calls[0].arguments[0];

    const success = await catalogTool.execute('catalog-1', { query: 'flow' }, undefined, undefined, {});
    assert.equal(success.isError, false);
    assert.equal(success.details.ok, true);
    assert.equal(success.content[0].type, 'text');

    const failure = await catalogTool.execute('catalog-2', { limit: -2 }, undefined, undefined, {});
    assert.equal(failure.isError, true);
    assert.equal(failure.details.ok, false);
    assert.equal(typeof failure.details.code, 'string');
  });
});

describe('catalog search', () => {
  it('normalizes filters, ranks matching items, and excludes unsafe catalog paths', async () => {
    const result = await searchCatalog(
      { query: '  DECISION flow  ', type: 'template', limit: 10 },
      { catalogPath: fixtureCatalog },
    );

    assert.equal(result.ok, true);
    assert.equal(result.query, 'decision flow');
    assert.equal(result.total, 1);
    assert.equal(result.items[0].id, 'flowchart');
    assert.equal(result.items[0].path, 'templates/flowchart');

    const unsafe = await searchCatalog({ query: 'unsafe' }, { catalogPath: fixtureCatalog });
    assert.equal(unsafe.total, 0);
    assert.equal(unsafe.excludedUnsafeEntries, 1);
  });

  it('caps result limits and rejects unsupported filters', async () => {
    const capped = await searchCatalog({ limit: 500 }, { catalogPath: fixtureCatalog });
    assert.equal(capped.limit, 50);
    await assert.rejects(
      searchCatalog({ type: 'script' }, { catalogPath: fixtureCatalog }),
      (error) => error.code === 'INVALID_PARAMETER',
    );
  });

  it('returns vendor-contained copy sources and bounded content only when requested', async () => {
    const vendorRoot = dirname(fixtureCatalog);
    const withoutContent = await searchCatalog(
      { query: 'flowchart', type: 'template' },
      { catalogPath: fixtureCatalog, vendorRoot },
    );
    assert.equal(withoutContent.items[0].sourcePath.startsWith(vendorRoot), true);
    assert.equal(withoutContent.items[0].metadataPath.startsWith(vendorRoot), true);
    assert.equal(withoutContent.items[0].previewPath.startsWith(vendorRoot), true);
    assert.equal(Object.hasOwn(withoutContent.items[0], 'sourceContent'), false);

    const withContent = await searchCatalog(
      { query: 'flowchart', type: 'template', includeSource: true },
      { catalogPath: fixtureCatalog, vendorRoot },
    );
    assert.match(withContent.items[0].sourceContent, /Flowchart fixture/);
    assert.match(withContent.items[0].metadataContent, /"id": "flowchart"/);
    assert.equal(withContent.includeSource, true);
  });
});

describe('asset preparation', () => {
  const normalizedPng = Buffer.from('normalized png fixture');
  const processor = {
    async normalize(buffer) {
      assert.equal(buffer.toString(), 'webp source fixture');
      return {
        buffer: normalizedPng,
        input: { format: 'webp', width: 1024, height: 1024 },
        output: { format: 'png', width: 512, height: 512 },
      };
    },
  };

  it('normalizes a supported image, uses a content-hash name, and merges provenance', async () => {
    const projectRoot = await temporaryDirectory('tikz-project-');
    const inputRoot = await temporaryDirectory('tikz-input-');
    const inputPath = join(inputRoot, 'generated.webp');
    await writeFile(inputPath, 'webp source fixture');

    const first = await prepareAsset({
      projectRoot,
      inputPath,
      outputDirectory: 'figures/demo/assets',
      nodeId: 'database',
      prompt: 'A database pictogram with no text',
      provider: 'openai-codex',
      model: 'image-model',
    }, { processor, now: () => '2026-07-21T00:00:00.000Z' });

    const hash = createHash('sha256').update(normalizedPng).digest('hex');
    assert.equal(first.ok, true);
    assert.equal(first.asset.relativePath, `figures/demo/assets/${hash}.png`);
    assert.equal(first.asset.sha256, hash);
    assert.equal(first.asset.inputFormat, 'webp');
    assert.equal(first.asset.outputFormat, 'png');
    assert.deepEqual(await readFile(join(projectRoot, first.asset.relativePath)), normalizedPng);

    const secondInput = join(inputRoot, 'second.webp');
    await writeFile(secondInput, 'webp source fixture');
    const second = await prepareAsset({
      projectRoot,
      inputPath: secondInput,
      outputDirectory: 'figures/demo/assets',
      nodeId: 'cache',
    }, { processor, now: () => '2026-07-22T00:00:00.000Z' });

    assert.equal(second.asset.relativePath, first.asset.relativePath);
    const manifest = JSON.parse(await readFile(join(projectRoot, 'figures/demo/assets/assets.manifest.json'), 'utf8'));
    assert.equal(manifest.version, 1);
    assert.equal(manifest.assets.length, 1);
    assert.deepEqual(manifest.assets[0].nodeIds, ['database', 'cache']);
    assert.equal(manifest.assets[0].prompt, 'A database pictogram with no text');
  });

  it('rejects traversal and an output directory that escapes through a symlink', async () => {
    const projectRoot = await temporaryDirectory('tikz-project-');
    const outside = await temporaryDirectory('tikz-outside-');
    const inputPath = join(outside, 'generated.webp');
    await writeFile(inputPath, 'webp source fixture');

    await assert.rejects(
      prepareAsset({ projectRoot, inputPath, outputDirectory: '../escape' }, { processor }),
      (error) => error.code === 'PATH_OUTSIDE_PROJECT',
    );

    await symlink(outside, join(projectRoot, 'figures'));
    await assert.rejects(
      prepareAsset({ projectRoot, inputPath, outputDirectory: 'figures' }, { processor }),
      (error) => error.code === 'SYMLINK_ESCAPE',
    );
  });

  it('only imports absolute images from the project or the system temporary directory', async () => {
    const projectRoot = await temporaryDirectory('tikz-project-');
    await assert.rejects(
      prepareAsset({ projectRoot, inputPath: fixtureCatalog }, { processor }),
      (error) => error.code === 'INPUT_OUTSIDE_ALLOWED_ROOT',
    );
  });

  it('rejects an unsupported decoded input format', async () => {
    const projectRoot = await temporaryDirectory('tikz-project-');
    const inputPath = join(projectRoot, 'source.gif');
    await writeFile(inputPath, 'gif source fixture');
    const gifProcessor = {
      async normalize() {
        const error = new Error('Only PNG, JPEG, and WebP are supported.');
        error.code = 'UNSUPPORTED_IMAGE_FORMAT';
        throw error;
      },
    };

    await assert.rejects(
      prepareAsset({ projectRoot, inputPath }, { processor: gifProcessor }),
      (error) => error.code === 'UNSUPPORTED_IMAGE_FORMAT',
    );
  });

});

describe('TikZ rendering', () => {
  it('rejects an option-like source basename before starting a compiler', async () => {
    const projectRoot = await temporaryDirectory('tikz-project-');
    await writeFile(
      join(projectRoot, '-diagram.tex'),
      String.raw`\documentclass{standalone}\begin{document}Safe\end{document}`,
    );
    const commandRunner = mock.fn();

    await assert.rejects(
      renderTikz({ projectRoot, sourcePath: '-diagram.tex' }, { commandRunner }),
      (error) => error.code === 'INVALID_PARAMETER' && /must not begin with a dash/u.test(error.message),
    );
    assert.equal(commandRunner.mock.callCount(), 0);
  });

  it('rejects traversal, shell escape primitives, remote graphics, and escaping includes before spawn', async () => {
    const projectRoot = await temporaryDirectory('tikz-project-');
    const commandRunner = mock.fn();

    await assert.rejects(
      renderTikz({ projectRoot, sourcePath: '../outside.tex' }, { commandRunner }),
      (error) => error.code === 'PATH_OUTSIDE_PROJECT',
    );

    const cases = [
      ['write18.tex', String.raw`\documentclass{standalone}\begin{document}\write18{curl bad}\end{document}`, 'UNSAFE_TEX'],
      ['remote.tex', String.raw`\documentclass{standalone}\usepackage{graphicx}\begin{document}\includegraphics{https://example.com/a.png}\end{document}`, 'REMOTE_RESOURCE'],
      ['escape.tex', String.raw`\documentclass{standalone}\begin{document}\input{../secret}\end{document}`, 'PATH_OUTSIDE_PROJECT'],
    ];
    for (const [name, source, code] of cases) {
      await writeFile(join(projectRoot, name), source);
      await assert.rejects(
        renderTikz({ projectRoot, sourcePath: name }, { commandRunner }),
        (error) => error.code === code,
      );
    }
    assert.equal(commandRunner.mock.callCount(), 0);
  });

  it('rejects input and include targets that are not TeX sources before spawn', async () => {
    const projectRoot = await temporaryDirectory('tikz-project-');
    await writeFile(
      join(projectRoot, 'diagram.tex'),
      String.raw`\documentclass{standalone}\begin{document}\input{payload.txt}\end{document}`,
    );
    await writeFile(join(projectRoot, 'payload.txt'), String.raw`\write18{curl bad}`);
    const commandRunner = mock.fn();

    await assert.rejects(
      renderTikz({ projectRoot, sourcePath: 'diagram.tex' }, { commandRunner }),
      (error) => error.code === 'UNSAFE_TEX' && /must resolve to \.tex files/u.test(error.message),
    );
    assert.equal(commandRunner.mock.callCount(), 0);
  });

  it('compiles from an isolated temporary workspace and publishes revision-bound artifacts', async () => {
    const projectRoot = await temporaryDirectory('tikz-project-');
    await mkdir(join(projectRoot, 'figures', 'assets'), { recursive: true });
    await writeFile(join(projectRoot, 'figures', 'assets', 'icon.png'), 'png fixture');
    await writeFile(
      join(projectRoot, 'figures', 'diagram.tex'),
      String.raw`\documentclass{standalone}\usepackage{graphicx}\begin{document}\includegraphics{assets/icon.png}\end{document}`,
    );

    const calls = [];
    const commandRunner = async (executable, args, options) => {
      calls.push({ executable, args, options });
      if (executable === '/fixed/latexmk') {
        const outputArgument = args.find((arg) => arg.startsWith('-outdir='));
        const outputDirectory = outputArgument.slice('-outdir='.length);
        await writeFile(join(outputDirectory, 'diagram.pdf'), 'pdf fixture');
      } else if (executable === '/fixed/dvisvgm') {
        const outputArgument = args.find((arg) => arg.startsWith('--output='));
        await writeFile(outputArgument.slice('--output='.length), '<svg>fixture</svg>');
      } else {
        const outputPrefix = args.at(-1);
        await writeFile(`${outputPrefix}.png`, args.includes('300') ? 'full png fixture' : '60 percent png fixture');
      }
      return {
        executable,
        args,
        exitCode: 0,
        durationMs: 1,
        stdout: '',
        stderr: '',
        outputTruncated: false,
      };
    };

    const result = await renderTikz({
      projectRoot,
      sourcePath: 'figures/diagram.tex',
      outputDirectory: 'figures/rendered',
      timeoutMs: 12_000,
    }, {
      commandRunner,
      executables: {
        latexmk: '/fixed/latexmk',
        dvisvgm: '/fixed/dvisvgm',
        pdftocairo: '/fixed/pdftocairo',
      },
    });

    assert.equal(result.ok, true);
    assert.match(result.revision, /^[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(result.artifacts), ['pdf', 'svg', 'fullPng', 'scale60Png']);
    assert.equal(
      Object.values(result.artifacts).every((artifact) => artifact.relativePath.includes(result.revision.slice(0, 12))),
      true,
    );
    assert.deepEqual(calls.map((call) => call.executable), [
      '/fixed/latexmk',
      '/fixed/dvisvgm',
      '/fixed/pdftocairo',
      '/fixed/pdftocairo',
    ]);
    assert.equal(calls[2].args.includes('300'), true);
    assert.equal(calls[3].args.includes('180'), true);
    assert.equal(calls[0].args.includes('-no-shell-escape'), true);
    assert.equal(calls[0].options.timeoutMs, 12_000);
    assert.notEqual(calls[0].options.cwd, dirname(join(projectRoot, 'figures', 'diagram.tex')));
    assert.equal(result.evidence.commands.length, 4);
    assert.equal(Object.hasOwn(result, 'verdict'), false);
  });

  it('rejects an output symlink escape before starting a compiler', async () => {
    const projectRoot = await temporaryDirectory('tikz-project-');
    const outside = await temporaryDirectory('tikz-outside-');
    await writeFile(join(projectRoot, 'diagram.tex'), String.raw`\documentclass{standalone}\begin{document}Safe\end{document}`);
    await symlink(outside, join(projectRoot, 'artifacts'));
    const commandRunner = mock.fn();

    await assert.rejects(
      renderTikz({ projectRoot, sourcePath: 'diagram.tex', outputDirectory: 'artifacts' }, { commandRunner }),
      (error) => error.code === 'SYMLINK_ESCAPE',
    );
    assert.equal(commandRunner.mock.callCount(), 0);
  });

  it('bounds command output and terminates oversized child output', async () => {
    await assert.rejects(
      runBoundedCommand(process.execPath, ['-e', 'process.stdout.write("x".repeat(4096))'], {
        cwd: process.cwd(),
        timeoutMs: 5_000,
        maxOutputBytes: 128,
      }),
      (error) => error.code === 'OUTPUT_LIMIT',
    );
  });

  it('terminates the bounded command process tree on output limit, abort, and timeout', async () => {
    const scenarios = [
      {
        name: 'output limit',
        code: 'OUTPUT_LIMIT',
        options: { maxOutputBytes: 8, timeoutMs: 5_000 },
        trigger: ({ child }) => queueMicrotask(() => child.stdout.emit('data', Buffer.alloc(32))),
      },
      {
        name: 'abort',
        code: 'COMMAND_ABORTED',
        options: { timeoutMs: 5_000 },
        trigger: ({ controller }) => queueMicrotask(() => controller.abort()),
      },
      {
        name: 'timeout',
        code: 'COMMAND_TIMEOUT',
        options: { timeoutMs: 5 },
        trigger: () => {},
      },
    ];

    for (let index = 0; index < scenarios.length; index += 1) {
      const scenario = scenarios[index];
      const controller = new AbortController();
      const child = new EventEmitter();
      child.pid = 41_000 + index;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = mock.fn((signal) => {
        queueMicrotask(() => child.emit('close', null, signal));
        return true;
      });
      let spawnOptions;
      const spawnImpl = mock.fn((_executable, _args, options) => {
        spawnOptions = options;
        scenario.trigger({ child, controller });
        return child;
      });
      const groupKill = mock.fn((_pid, signal) => {
        queueMicrotask(() => child.emit('close', null, signal));
      });
      const keepAlive = scenario.name === 'timeout' ? setTimeout(() => {}, 100) : undefined;

      try {
        await assert.rejects(
          runBoundedCommand('latexmk', [], {
            ...scenario.options,
            signal: controller.signal,
            spawnImpl,
            killImpl: groupKill,
          }),
          (error) => error.code === scenario.code
            && error.details.terminationScope === (process.platform === 'win32' ? 'direct-child-only' : 'process-group'),
          scenario.name,
        );
      } finally {
        if (keepAlive) clearTimeout(keepAlive);
      }

      if (process.platform === 'win32') {
        assert.equal(spawnOptions.detached, false, scenario.name);
        assert.equal(groupKill.mock.callCount(), 0, scenario.name);
        assert.equal(child.kill.mock.callCount(), 1, scenario.name);
      } else {
        assert.equal(spawnOptions.detached, true, scenario.name);
        assert.deepEqual(groupKill.mock.calls[0].arguments, [-child.pid, 'SIGKILL'], scenario.name);
        assert.equal(child.kill.mock.callCount(), 0, scenario.name);
      }
    }
  });
});
