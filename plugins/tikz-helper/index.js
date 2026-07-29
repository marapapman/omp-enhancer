import { prepareAsset, registerAssetSource } from './src/asset-prepare.js';
import { searchCatalog } from './src/catalog-search.js';
import { renderTikz, runBoundedCommand } from './src/render-tikz.js';
import { generateTikz, computeLayout, elkToTikz } from './src/generate-tikz.js';
import { asRuntimeError } from './src/runtime-error.js';
import { TikzRuntimeError } from './src/runtime-error.js';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, isAbsolute, resolve, sep } from 'node:path';

function optional(z, schema) {
  return typeof z.optional === 'function' ? z.optional(schema) : schema.optional();
}

function objectParams(params) {
  return params && typeof params === 'object' && !Array.isArray(params) ? params : {};
}

function projectRoot(ctx) {
  return typeof ctx?.cwd === 'string' && ctx.cwd.trim() !== '' ? ctx.cwd : process.cwd();
}

function textContent(value) {
  return { type: 'text', text: JSON.stringify(value, null, 2) };
}

function successResponse(details) {
  return {
    content: [textContent(details)],
    details,
    isError: false,
  };
}

function errorResponse(error) {
  const runtimeError = asRuntimeError(error);
  const details = {
    ok: false,
    code: runtimeError.code,
    error: runtimeError.message,
    ...(Object.keys(runtimeError.details).length > 0 ? { context: runtimeError.details } : {}),
  };
  return {
    content: [textContent(details)],
    details,
    isError: true,
  };
}

function catalogParameters(z) {
  return z.object({
    query: optional(z, z.string()),
    type: optional(z, z.enum(['icon', 'template', 'example'])),
    domain: optional(z, z.string()),
    limit: optional(z, z.number()),
    includeSource: optional(z, z.boolean()),
  });
}

function assetParameters(z) {
  return z.object({
    inputPath: z.string(),
    outputDirectory: optional(z, z.string()),
    nodeId: optional(z, z.string()),
    prompt: optional(z, z.string()),
    provider: optional(z, z.string()),
    model: optional(z, z.string()),
  });
}

function renderParameters(z) {
  return z.object({
    sourcePath: z.string(),
    outputDirectory: optional(z, z.string()),
    timeoutMs: optional(z, z.number()),
  });
}
function generateParameters(z) {
  return z.object({
    graph: z.string(),
    layoutOptions: optional(z, z.string()),
    styleOptions: optional(z, z.string()),
    preset: optional(z, z.enum(['paper-column', 'paper-full', 'slide-16-9', 'slide-4-3'])),
    density: optional(z, z.enum(['compact', 'balanced', 'airy'])),
    targetWidthPt: optional(z, z.number()),
  });
}

function previewAssetsParameters(z) {
  return z.object({
    manifestPath: optional(z, z.string()),
    nodeIds: optional(z, z.array(z.string())),
  });
}


export { generateTikz, computeLayout, elkToTikz };
export { prepareAsset, registerAssetSource } from './src/asset-prepare.js';
export { searchCatalog } from './src/catalog-search.js';
export { renderTikz, runBoundedCommand } from './src/render-tikz.js';
export { checkElkEnvironment, ELK_INSTALL_GUIDANCE } from './src/elk-layout.js';
export { GEOMETRY_DEPS_GUIDANCE } from './src/geometry-check.js';
export { previewAssetPreviews };

export default function registerTikzHelper(omp) {
  const z = omp.zod.z;
  omp.setLabel?.('TikZ Helper');

  omp.registerTool({
    name: 'tikz_catalog_search',
    label: 'OpenTikZ Catalog Search',
    description: 'Search the packaged, version-pinned OpenTikZ catalog and return safe copy sources without modifying the vendor snapshot.',
    approval: 'read',
    promptSnippet: 'Search packaged OpenTikZ icons, templates, and examples by semantic terms.',
    promptGuidelines: [
      'Use includeSource only for the small set of selected entries that Main intends to copy before editing.',
      'Treat the returned vendor paths and content as read-only source material.',
    ],
    parameters: catalogParameters(z),
    async execute(_toolCallId, params) {
      try {
        return successResponse(await searchCatalog(objectParams(params)));
      } catch (error) {
        return errorResponse(error);
      }
    },
  });

  omp.registerTool({
    name: 'tikz_prepare_asset',
    label: 'Prepare TikZ Node Asset',
    description: 'Normalize an existing PNG, JPEG, or WebP as a metadata-free, content-addressed PNG inside the project and merge its provenance manifest. This tool never generates an image or uses the network.',
    approval: 'exec',
    promptSnippet: 'Import and normalize an already-produced node icon for a TikZ figure.',
    promptGuidelines: [
      'Call image generation separately only when the current native tool is available and the user has authorized it.',
      'Pass the resulting local image path here; never reference an image-generation temporary path from final TeX.',
      'Keep labels in TikZ rather than baking text into the raster asset.',
    ],
    parameters: assetParameters(z),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      try {
        return successResponse(await prepareAsset({
          ...objectParams(params),
          projectRoot: projectRoot(ctx),
        }, { signal }));
      } catch (error) {
        return errorResponse(error);
      }
    },
  });

  omp.registerTool({
    name: 'tikz_render',
    label: 'Render TikZ Figure',
    description: 'Validate and compile a project-local standalone TikZ source with fixed commands in an isolated temporary workspace, then publish revision-bound PDF, SVG, full PNG, and 60%-scale PNG evidence.',
    approval: 'exec',
    promptSnippet: 'Compile and render a safe project-local TikZ source for current-revision review.',
    promptGuidelines: [
      'This tool accepts no command or executable parameter and always disables shell escape.',
      'Use both returned raster artifacts for independent full-size and reduced-scale visual review.',
      'The structured evidence reports execution facts only and does not decide completion.',
    ],
    parameters: renderParameters(z),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      try {
        return successResponse(await renderTikz({
          ...objectParams(params),
          projectRoot: projectRoot(ctx),
        }, { signal }));
      } catch (error) {
        return errorResponse(error);
      }
    },
  });

  omp.registerTool({
    name: 'tikz_generate_diagram',
    label: 'Generate TikZ Diagram from Layout IR',
    description: 'Accept a diagram IR in ELK JSON format (graph with nodes, edges, ports, and layout options), compute automatic layout via Eclipse Layout Kernel, and generate compilable TikZ source code. The output .tex can be rendered with tikz_render. Supports paper-column, paper-full, and slide presets with density tuning and sizing metadata.',
    approval: 'read',
    promptSnippet: 'Generate a TikZ figure by describing the graph structure and letting ELK compute the layout automatically.',
    promptGuidelines: [
      'Author the diagram as an ELK graph IR: a root with graph-level layoutOptions, a children array of nodes, and an edges array. Each node has id, width, height sized for its exact label plus padding, and optional properties (shape, fill, textColor). Each edge has id, a single sources entry, a single targets entry, and optional properties (arrow, label, color). Size each node to fit its exact label plus padding before calling the layout engine.',
      'Use properties.shape on nodes: rectangle (default), rounded, diamond, ellipse, circle, terminal, parallelogram, cylinder. Use properties.arrow on edges: -> (default), <-, <->, and - for no arrow. Add labels with properties.label; use dashed or dotted for line style. Use - for no arrow and dashed or dotted for line style.',
      'Input nodes must omit x and y and input edges must omit sections and bendPoints; the layout engine computes them. The author never authors, infers, or hand-edits TikZ coordinates; never hand-edit TikZ coordinates and never author TikZ coordinates manually — the ELK graph IR is the sole source of node positions and edge geometry.',
      'Choose elk.algorithm from layered (flows, pipelines, architecture), mrtree (trees), radial (hub or mind-map), stress, or force (general association). Never recommend the fixed or random algorithms for a coordinate-free figure.',
      'Set elk.direction to RIGHT or DOWN. The engine applies generous default spacing (nodeNode, edgeNode, padding, etc.) automatically; do not set spacing options yourself unless you have a specific reason. Set elk.edgeRouting to ORTHOGONAL for layered graphs; stress and force use POLYLINE or SPLINES.',
      'Model groups as parent nodes with children. For edges that cross parent boundaries, use layered with elk.hierarchyHandling set to INCLUDE_CHILDREN; mixed algorithms do not support cross-parent edges.',
      'Place elk.algorithm and every authored layout option in the graph-level layoutOptions; the separate tool layoutOptions parameter is not the reliable algorithm channel. Node sizing, spacing, and compaction are handled by engine defaults; do not author spacing or padding options. The backend emits ELK-computed dimensions as TikZ minimum width and height with 2pt inner padding. Declare node width and height sized for the exact label plus padding; ELK may enlarge nodes when its label measurement exceeds declared dimensions. Verify with a render. Declare width and height for each node based on label text length and font size. ELK may enlarge nodes when its internal label measurement exceeds declared dimensions. The backend emits ELK dimensions as TikZ minimum sizes with 2pt inner padding.',
      'Fix overlap, clipping, or crossings by changing ELK layout options or node sizes and regenerating, never by editing coordinates. The tool returns the generated TikZ source and the positioned graph metadata; write the returned .tex to the project path and compile it with tikz_render. Export the tool metadata: algorithm used, node count, edge count.',
      'Before generating, confirm the ELK layout engine (elkjs) is installed; if the tool returns ELK_NOT_INSTALLED, install it with `npm run install:deps` (or the `omp_core_install_deps` tool) and call tikz_generate_diagram again. Never fall back to hand-authored TikZ coordinates when ELK is missing: install ELK first, then regenerate from the ELK graph IR.',
      'The tool also returns the positioned ELK graph IR as standard ELK JSON in the `ir` field (and the structured `graph`). Write it to a project-local `<figure>.elk.json` to edit in an ELK-compatible visual editor, then feed the edited IR back as the `graph` input to tikz_generate_diagram to regenerate the TikZ; re-importing recomputes layout via ELK (structural, label, and size edits survive, but node positions are recomputed), so the IR is a round-trip artifact, not a hand-coordinate surface.',
      'Choose the preset parameter for the target medium: paper-column (double-column paper, about 240pt wide, vertical flow), paper-full (full text width, about 504pt), slide-16-9, or slide-4-3 (airy spacing and larger font for projected figures). Presets tune ELK direction, spacing, minimum node size, padding, and font automatically; density=compact|balanced|airy scales spacing further. Do not hand-tune spacing to fix density — choose a preset or density instead.',
      'Export the tool sizing metadata: target width, intrinsic width and height, applied scale, effective font size, density relayouts, and the embedding hint. Warnings (for example effective font below 6pt) are advisory evidence: split the graph, shorten labels, or choose a wider preset — never edit coordinates.',
      'This is a regular OMP tool — invoke it as a standard tool call, not via write to xd://. The native `generate_image` tool is an xd:// device (`write xd://generate_image`) with a different purpose (image generation for node icons).',
    ],
    parameters: generateParameters(z),
    async execute(_toolCallId, params) {
      try {
        const graph = JSON.parse(params.graph);
        const parsed = { graph };
        if (params.layoutOptions) parsed.layoutOptions = JSON.parse(params.layoutOptions);
        if (params.styleOptions) parsed.tikzOptions = JSON.parse(params.styleOptions);
        if (params.preset) parsed.preset = params.preset;
        if (params.density) parsed.density = params.density;
        if (typeof params.targetWidthPt === 'number') parsed.targetWidthPt = params.targetWidthPt;
        return successResponse(await generateTikz(parsed));
      } catch (error) {
        return errorResponse(error);
      }
    },
  });

  omp.registerTool({
    name: 'tikz_preview_assets',
    label: 'Preview TikZ Icon Assets',
    description: 'Preview icon assets from an asset manifest for visioner review. Writes previews to temporary directory only, never to project files.',
    approval: 'exec',
    promptSnippet: 'Render icon asset previews to a temporary directory for visioner visual review.',
    promptGuidelines: [
      'Previews are written to a temporary directory only; project files are never modified.',
      'Pass manifestPath to choose the manifest; omit it to use the default figures/tikz/assets/assets.manifest.json.',
      'Pass nodeIds to preview only assets attached to those nodes.',
    ],
    parameters: previewAssetsParameters(z),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      try {
        return successResponse(await previewAssetPreviews({
          ...objectParams(params),
          projectRoot: projectRoot(ctx),
        }, { signal }));
      } catch (error) {
        return errorResponse(error);
      }
    },
  });
}

async function previewAssetPreviews(input = {}, options = {}) {
  const root = typeof input.projectRoot === 'string' && input.projectRoot.trim() !== ''
    ? input.projectRoot : process.cwd();
  const manifestRel = input.manifestPath && input.manifestPath.trim() !== ''
    ? input.manifestPath
    : 'figures/tikz/assets/assets.manifest.json';
  const manifestPath = isAbsolute(manifestRel) ? manifestRel : resolve(root, manifestRel.split('/').join(sep));
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      throw new TikzRuntimeError('FILE_NOT_FOUND', `Asset manifest not found: ${manifestRel}`, { path: manifestRel });
    }
    throw asRuntimeError(error);
  }
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
  const wantedNodeIds = Array.isArray(input.nodeIds)
    ? input.nodeIds.filter((n) => typeof n === 'string' && n.trim() !== '')
    : null;
  const matching = assets.filter((a) => a && typeof a === 'object' && (
    !wantedNodeIds || (Array.isArray(a.nodeIds) && a.nodeIds.some((n) => wantedNodeIds.includes(n)))
  ));
  const tempDir = await mkdtemp(join(tmpdir(), 'omp-tikz-preview-'));
  const previews = [];
  for (const asset of matching) {
    const sourcePath = isAbsolute(asset.relativePath) ? asset.relativePath : resolve(root, String(asset.relativePath).split('/').join(sep));
    const st = asset.sourceType ?? (asset.outputFormat === 'png' ? 'raster' : null);
    let previewPath = null;
    let limitations = [];
    if (st === 'raster' || asset.outputFormat === 'png') {
      previewPath = sourcePath;
      limitations.push('raster asset previewed in place; no temporary copy generated');
    } else if (st === 'svg-source' || asset.inputFormat === 'svg') {
      try {
        const content = await readFile(sourcePath, 'utf8');
        const previewRel = join(tempDir, `preview-${asset.sha256 ?? 'svg'}.svg`);
        const wrapped = content.trim().startsWith('<svg') || content.trim().startsWith('<?xml')
          ? content
          : `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${asset.outputWidth ?? 200}" height="${asset.outputHeight ?? 200}"><g>${content}</g></svg>`;
        await writeFile(previewRel, wrapped);
        previewPath = previewRel;
        limitations.push('svg preview written to temp directory; converter not invoked');
      } catch (error) {
        limitations.push(`svg preview unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (st === 'opentikz-tex' || asset.inputFormat === 'tex') {
      try {
        const content = await readFile(sourcePath, 'utf8');
        const wrapperDir = join(tempDir, `tex-${asset.sha256 ?? 'tex'}`);
        await mkdir(wrapperDir, { recursive: true });
        const texPath = join(wrapperDir, 'preview.tex');
        const wrapper = `\\documentclass[convert={density=150,outext=.png}]{standalone}\n\\usepackage{tikz}\n\\usepackage{graphicx}\n\\begin{document}\n\\begin{tikzpicture}\n${content}\n\\end{tikzpicture}\n\\end{document}\n`;
        await writeFile(texPath, wrapper);
        previewPath = texPath;
        limitations.push('tex preview wrapper written to temp directory; compilation requires tikz_render');
      } catch (error) {
        limitations.push(`tex preview unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      limitations.push(`unknown source type "${String(st)}"; no preview generated`);
    }
    previews.push({
      previewPath,
      sourcePath,
      nodeIds: Array.isArray(asset.nodeIds) ? asset.nodeIds : [],
      limitations,
    });
  }
  return {
    ok: true,
    previews,
    tempDirectory: tempDir,
    manifestPath: manifestRel,
    matchedCount: matching.length,
  };
}
