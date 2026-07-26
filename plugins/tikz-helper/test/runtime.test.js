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
import { computeLayout } from '../src/elk-layout.js';

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
  it('registers the five opt-in tools with least-effect approvals', () => {
    const api = makeExtensionApi();
    extension(api);

    const tools = api.registerTool.mock.calls.map((call) => call.arguments[0]);
    assert.deepEqual(tools.map((tool) => tool.name), [
      'tikz_catalog_search',
      'tikz_prepare_asset',
      'tikz_render',
      'tikz_generate_diagram',
      'tikz_preview_assets',
    ]);
    assert.deepEqual(tools.map((tool) => tool.approval), ['read', 'exec', 'exec', 'read', 'exec']);
    assert.equal(tools.every((tool) => tool.defaultInactive === true), true);
    assert.equal(tools.every((tool) => tool.parameters?.__ompZodSchema === true), true);
    assert.equal(Object.hasOwn(tools[2].parameters.shape, 'executable'), false);
    assert.equal(Object.hasOwn(tools[2].parameters.shape, 'command'), false);
    // tikz_generate_diagram has graph (string), layoutOptions (optional string), styleOptions (optional string)
    assert.equal(Object.hasOwn(tools[3].parameters.shape, 'graph'), true);
    // S5: preset, density, targetWidthPt optional params
    assert.equal(Object.hasOwn(tools[3].parameters.shape, 'preset'), true, 'must have preset param');
    assert.equal(Object.hasOwn(tools[3].parameters.shape, 'density'), true, 'must have density param');
    assert.equal(Object.hasOwn(tools[3].parameters.shape, 'targetWidthPt'), true, 'must have targetWidthPt param');
    // tikz_preview_assets registered with approval 'exec' and optional manifestPath/nodeIds
    const preview = tools.find((tool) => tool.name === 'tikz_preview_assets');
    assert.ok(preview, 'tikz_preview_assets must be registered');
    assert.equal(preview.approval, 'exec', 'tikz_preview_assets must have approval exec');
    assert.equal(preview.defaultInactive, true, 'tikz_preview_assets must default to inactive');
    assert.equal(Object.hasOwn(preview.parameters.shape, 'manifestPath'), true);
    assert.equal(Object.hasOwn(preview.parameters.shape, 'nodeIds'), true);
  });

  it('tikz_generate_diagram promptGuidelines teach ELK-first coordinate-free authoring', () => {
    const api = makeExtensionApi();
    extension(api);

    const tools = api.registerTool.mock.calls.map((call) => call.arguments[0]);
    const generate = tools.find((tool) => tool.name === 'tikz_generate_diagram');
    assert.ok(generate, 'tikz_generate_diagram must be registered');
    assert.ok(Array.isArray(generate.promptGuidelines), 'tikz_generate_diagram must expose promptGuidelines');
    const guidelines = generate.promptGuidelines.join('\n');

    // P3: input must omit x/y/sections/bendPoints
    assert.match(
      guidelines,
      /Input nodes must omit x and y and input edges must omit sections and bendPoints; the layout engine computes them\./,
      'promptGuidelines must embed P3 (coordinate-free input)',
    );
    // P7: size nodes for their exact label plus padding
    assert.match(
      guidelines,
      /Size each node to fit its exact label plus padding before calling the layout engine\./,
      'promptGuidelines must embed P7 (size for label plus padding)',
    );
    // P8: fix overlap by changing options/sizes and regenerating, never editing coordinates
    assert.match(
      guidelines,
      /Fix overlap, clipping, or crossings by changing ELK layout options or node sizes and regenerating, never by editing coordinates\./,
      'promptGuidelines must embed P8 (regenerate, never edit coordinates)',
    );
    // P9: graph-level layoutOptions is the algorithm channel
    assert.match(
      guidelines,
      /Place elk\.algorithm and every authored layout option in the graph-level layoutOptions; the separate tool layoutOptions parameter is not the reliable algorithm channel\./,
      'promptGuidelines must embed P9 (graph-level layoutOptions)',
    );
    // engine default spacing (replaces old "Set generous spacing with elk.spacing" guidance)
    assert.match(
      guidelines,
      /engine applies generous default spacing/i,
      'promptGuidelines must state engine applies generous default spacing',
    );
    assert.doesNotMatch(
      guidelines,
      /Set generous spacing with elk\.spacing/,
      'promptGuidelines must not instruct manual spacing',
    );
    // P10: arrows and line styles
    assert.match(
      guidelines,
      /Use - for no arrow and dashed or dotted for line style\./,
      'promptGuidelines must embed P10 (arrow/line-style vocabulary)',
    );
    // P11: never recommend fixed or random
    assert.match(
      guidelines,
      /Never recommend the fixed or random algorithms for a coordinate-free figure\./,
      'promptGuidelines must embed P11 (no fixed/random)',
    );
    // coordinate prohibition: never author/hand-edit TikZ coordinates
    assert.match(
      guidelines,
      /never (?:author|infer|hand-edit) TikZ coordinates/i,
      'promptGuidelines must prohibit authoring/hand-editing TikZ coordinates',
    );
    // supported algorithm set includes layered/mrtree/radial/stress/force but excludes fixed/random
    assert.match(guidelines, /layered/i, 'promptGuidelines must name layered');
    assert.match(guidelines, /mrtree/i, 'promptGuidelines must name mrtree');
    assert.match(guidelines, /radial/i, 'promptGuidelines must name radial');
    assert.match(guidelines, /stress/i, 'promptGuidelines must name stress');
    assert.match(guidelines, /force/i, 'promptGuidelines must name force');
    // P11 already asserts fixed/random are never recommended; confirm the exclusion is explicit
    assert.match(
      guidelines,
      /Never recommend the fixed or random algorithms/,
      'promptGuidelines must explicitly exclude fixed and random',
    );
    // regeneration rule (P8 restated as the repair loop)
    assert.match(
      guidelines,
      /regenerating, never by editing coordinates/,
      'promptGuidelines must state the regeneration repair rule',
    );
    // P3 honesty caveat: declared node dimensions are estimates
    assert.match(
      guidelines,
      /Declared node width and height are estimates because the backend ignores ELK label positions and does not emit them as TikZ minimum sizes, so size generously and verify with a render\./,
      'promptGuidelines must embed the sizing-caveat (declared dimensions are estimates)',
    );
    // ELK environment check + install-before-draw guidance (no hand-draw fallback)
    assert.match(guidelines, /ELK_NOT_INSTALLED/);
    assert.match(guidelines, /npm run install:deps/);
    assert.match(guidelines, /Never fall back to hand-authored TikZ coordinates when ELK is missing/);
    // IR export round-trip guidance (visual-editor editing)
    assert.match(guidelines, /standard ELK JSON in the `ir` field/);
    assert.match(guidelines, /<figure>\.elk\.json/);
    assert.match(guidelines, /feed the edited IR back as the `graph` input to tikz_generate_diagram to regenerate/);
    assert.match(guidelines, /re-importing recomputes layout via ELK/i);
    assert.match(guidelines, /node positions are recomputed/);
    // S5: preset and density guidance
    assert.match(guidelines, /paper-column \(double-column paper/);
    assert.match(guidelines, /Export the tool sizing metadata/);
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

describe('layout defaults', () => {
  function makeNode(id, width = 120, height = 50) {
    return { id, width, height };
  }

  function makeEdge(id, source, target) {
    return { id, sources: [source], targets: [target] };
  }

  function boundingBox(node) {
    return { x: node.x, y: node.y, w: node.width, h: node.height };
  }

  function overlaps(a, b) {
    return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  }

  it('5a: server defaults produce non-overlapping layout with minimum node sizes', async () => {
    const graph = {
      id: 'test-5a',
      children: [
        makeNode('A', 120, 50),
        makeNode('B', 120, 50),
        makeNode('C', 120, 50),
      ],
      edges: [
        makeEdge('e1', 'A', 'B'),
        makeEdge('e2', 'B', 'C'),
      ],
    };

    const result = await computeLayout(graph);
    const nodes = result.graph.children;

    // All nodes have finite coordinates
    for (const node of nodes) {
      assert.equal(typeof node.x, 'number');
      assert.equal(typeof node.y, 'number');
      assert.ok(Number.isFinite(node.x));
      assert.ok(Number.isFinite(node.y));
    }

    // No pair of bounding boxes overlaps
    const boxes = nodes.map(boundingBox);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        assert.equal(overlaps(boxes[i], boxes[j]), false, `nodes ${nodes[i].id} and ${nodes[j].id} overlap`);
      }
    }

    // Each node width >= 80 and height >= 40 (minimum size enforced)
    for (const node of nodes) {
      assert.ok(node.width >= 80, `node ${node.id} width ${node.width} < 80`);
      assert.ok(node.height >= 40, `node ${node.id} height ${node.height} < 40`);
    }

    // Default algorithm is layered
    assert.equal(result.metadata.algorithm, 'layered');
  });

  it('5b: root-level IR layoutOptions override server defaults', async () => {
    const graph = {
      id: 'test-5b',
      layoutOptions: {
        'elk.algorithm': 'stress',
        'elk.layered.spacing.nodeNodeBetweenLayers': 200,
      },
      children: [
        makeNode('A', 120, 50),
        makeNode('B', 120, 50),
        makeNode('C', 120, 50),
      ],
      edges: [
        makeEdge('e1', 'A', 'B'),
        makeEdge('e2', 'B', 'C'),
      ],
    };

    const result = await computeLayout(graph);
    assert.equal(result.metadata.algorithm, 'stress', 'IR algorithm must override default');

    // Under stress, the gap is governed by elk.spacing.nodeNode (not between-layer keys)
    const nodes = result.graph.children;
    const boxes = nodes.map(boundingBox);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        assert.equal(overlaps(boxes[i], boxes[j]), false, `nodes ${nodes[i].id} and ${nodes[j].id} overlap`);
      }
    }
  });
  
  it('5c: disconnected components are compacted without overlap', async () => {
    const graph = {
      id: 'test-5c',
      children: [
        makeNode('A', 120, 50),
        makeNode('B', 120, 50),
        makeNode('C', 120, 50),
        makeNode('D', 120, 50),
      ],
      edges: [
        makeEdge('e1', 'A', 'B'),
        makeEdge('e2', 'C', 'D'),
      ],
    };

    const result = await computeLayout(graph);
    const nodes = result.graph.children;

    // All nodes have finite coordinates
    for (const node of nodes) {
      assert.ok(Number.isFinite(node.x), `node ${node.id} x is not finite`);
      assert.ok(Number.isFinite(node.y), `node ${node.id} y is not finite`);
    }

    // No pair of bounding boxes overlaps
    const boxes = nodes.map(boundingBox);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        assert.equal(overlaps(boxes[i], boxes[j]), false, `nodes ${nodes[i].id} and ${nodes[j].id} overlap`);
      }
    }

    // Edges have sections (routed, not empty)
    for (const edge of result.graph.edges) {
      assert.ok(Array.isArray(edge.sections), `edge ${edge.id} has no sections`);
      assert.ok(edge.sections.length > 0, `edge ${edge.id} has empty sections`);
    }
  });

  it('5d: defaults survive across calls (no mutation leak)', async () => {
    const graph1 = {
      id: 'test-5d-1',
      layoutOptions: { 'elk.spacing.nodeNode': 999 },
      children: [makeNode('A', 120, 50), makeNode('B', 120, 50)],
      edges: [makeEdge('e1', 'A', 'B')],
    };

    const graph2 = {
      id: 'test-5d-2',
      children: [makeNode('C', 120, 50), makeNode('D', 120, 50)],
      edges: [makeEdge('e2', 'C', 'D')],
    };

    await computeLayout(graph1);
    const result2 = await computeLayout(graph2);

    const nodes2 = result2.graph.children;
    // Measure actual gap: distance from right edge of first node to left edge of second
    const firstRight = nodes2[0].x + nodes2[0].width;
    const secondLeft = nodes2[1].x;
    const gap = secondLeft - firstRight;
    // Default nodeNode is 50; if leaked from call 1 (999), gap would be ~999
    // Allow tolerance: gap should be far below 999 if no mutation leak
    assert.ok(gap < 200, `gap ${gap} >= 200, may have leaked large spacing from call 1`);
    assert.ok(gap > 0, `gap ${gap} <= 0, nodes overlap`);
  });
  
  it('5e: compound nodes with ports get adequate sizing', async () => {
    const graph = {
      id: 'test-5e',
      children: [
        {
          id: 'parent',
          width: 100,
          height: 100,
          children: [
            { id: 'child1', width: 60, height: 30 },
            { id: 'child2', width: 60, height: 30 },
          ],
          ports: [
            { id: 'port1', width: 10, height: 10 },
          ],
        },
      ],
    };

    const result = await computeLayout(graph);
    const parent = result.graph.children[0];

    // Parent node dimensions are large enough to contain children + port
    assert.ok(parent.width >= 60, `parent width ${parent.width} < 60`);
    assert.ok(parent.height >= 30, `parent height ${parent.height} < 30`);
    assert.ok(Number.isFinite(parent.x));
    assert.ok(Number.isFinite(parent.y));
  });

  it('5f: node size respects MINIMUM_SIZE constraint when labels are present', async () => {
    // ELK in elkjs does not measure label text dimensions, so NODE_LABELS
    // alone does not expand nodes based on content. However, the server
    // defaults include MINIMUM_SIZE (80,40) which floors all nodes.
    // This test verifies that nodes with labels never collapse below the minimum.
    const graph = {
      id: 'test-5f',
      children: [
        { id: 'A', width: 5, height: 5, labels: [{ text: 'A label' }] },
        { id: 'B', width: 5, height: 5, labels: [{ text: 'Another label' }] },
      ],
      edges: [
        { id: 'e1', sources: ['A'], targets: ['B'] },
      ],
    };

    const result = await computeLayout(graph);
    const nodes = result.graph.children;

    // All nodes have finite coordinates
    for (const node of nodes) {
      assert.ok(Number.isFinite(node.x), `node ${node.id} x is not finite`);
      assert.ok(Number.isFinite(node.y), `node ${node.id} y is not finite`);
    }

    // NODE_LABELS alone doesn't expand in elkjs, but MINIMUM_SIZE floors to 80x40
    for (const node of nodes) {
      assert.ok(node.width >= 80, `node ${node.id} width ${node.width} < 80 (MINIMUM_SIZE not enforced)`);
      assert.ok(node.height >= 40, `node ${node.id} height ${node.height} < 40 (MINIMUM_SIZE not enforced)`);
    }

    // No overlap
    const boxes = nodes.map(boundingBox);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        assert.equal(overlaps(boxes[i], boxes[j]), false, `nodes ${nodes[i].id} and ${nodes[j].id} overlap`);
      }
    }
  });
describe('tikz_preview_assets output contract', () => {
  it('returns previewPath, sourcePath, nodeIds, and limitations for each manifest asset', async () => {
    const projectRoot = await temporaryDirectory('tikz-preview-project-');
    const assetsDir = join(projectRoot, 'figures', 'tikz', 'assets');
    await mkdir(assetsDir, { recursive: true });

    // Write a raster PNG asset matching the asset-prepare.js manifest schema.
    const pngBytes = Buffer.from('preview png fixture');
    const sha256 = createHash('sha256').update(pngBytes).digest('hex');
    const assetRel = `figures/tikz/assets/${sha256}.png`;
    await writeFile(join(projectRoot, assetRel), pngBytes);

    const manifest = {
      version: 1,
      assets: [
        {
          sha256,
          relativePath: assetRel,
          bytes: pngBytes.length,
          inputFormat: 'webp',
          inputWidth: 1024,
          inputHeight: 1024,
          outputFormat: 'png',
          outputWidth: 512,
          outputHeight: 512,
          nodeIds: ['database', 'cache'],
          prompt: 'A database pictogram with no text',
          provenance: [{ kind: 'generated-image', importedAt: '2026-07-21T00:00:00.000Z' }],
        },
      ],
    };
    const manifestRel = 'figures/tikz/assets/assets.manifest.json';
    await writeFile(join(projectRoot, manifestRel), JSON.stringify(manifest, null, 2));

    const api = makeExtensionApi();
    extension(api);
    const previewTool = api.registerTool.mock.calls[4].arguments[0];
    assert.equal(previewTool.name, 'tikz_preview_assets');

    const response = await previewTool.execute(
      'preview-1',
      { manifestPath: manifestRel, nodeIds: ['database'] },
      undefined,
      undefined,
      { cwd: projectRoot },
    );

    assert.equal(response.isError, false);
    assert.equal(response.details.ok, true);
    assert.equal(response.details.matchedCount, 1);
    assert.equal(response.details.previews.length, 1);
    assert.equal(response.details.manifestPath, manifestRel);

    const preview = response.details.previews[0];
    assert.equal(Object.hasOwn(preview, 'previewPath'), true, 'must expose previewPath');
    assert.equal(Object.hasOwn(preview, 'sourcePath'), true, 'must expose sourcePath');
    assert.equal(Object.hasOwn(preview, 'nodeIds'), true, 'must expose nodeIds');
    assert.equal(Object.hasOwn(preview, 'limitations'), true, 'must expose limitations');

    // Raster assets preview in place; previewPath points at the source file.
    assert.equal(preview.sourcePath, join(projectRoot, assetRel));
    assert.equal(preview.previewPath, preview.sourcePath);
    assert.deepEqual(preview.nodeIds, ['database', 'cache']);
    assert.ok(Array.isArray(preview.limitations), 'limitations must be an array');
    assert.ok(preview.limitations.length > 0, 'limitations must list preview constraints');
    assert.match(preview.limitations.join(' '), /raster asset previewed in place/i);

    // Previews are written to a temp directory, never to project files.
    assert.ok(
      response.details.tempDirectory.startsWith(tmpdir()),
      'temp directory must live under the OS temp root, not the project',
    );
  });

  it('returns an error response when the manifest is missing', async () => {
    const projectRoot = await temporaryDirectory('tikz-preview-missing-');
    const api = makeExtensionApi();
    extension(api);
    const previewTool = api.registerTool.mock.calls[4].arguments[0];

    const response = await previewTool.execute(
      'preview-2',
      { manifestPath: 'figures/tikz/assets/assets.manifest.json' },
      undefined,
      undefined,
      { cwd: projectRoot },
    );

    assert.equal(response.isError, true);
    assert.equal(response.details.ok, false);
    assert.equal(response.details.code, 'FILE_NOT_FOUND');
  });
});
});
