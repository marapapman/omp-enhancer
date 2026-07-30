import { prepareAsset, registerAssetSource } from './src/asset-prepare.js';
import { searchCatalog } from './src/catalog-search.js';
import { renderTikz, runBoundedCommand } from './src/render-tikz.js';
import { generateTikz, computeLayout, elkToTikz } from './src/generate-tikz.js';
import { asRuntimeError } from './src/runtime-error.js';
import { TikzRuntimeError } from './src/runtime-error.js';
import { requireString, parseJsonParam } from './src/tool-error-utils.js';
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
    query: optional(z, z.string()).describe('Semantic search term for OpenTikZ icons, templates, or examples.'),
    type: optional(z, z.enum(['icon', 'template', 'example'])).describe('Filter by catalog entry type: icon, template, or example.'),
    domain: optional(z, z.string()).describe('Filter by domain or category within the catalog.'),
    limit: optional(z, z.number()).describe('Maximum number of results to return.'),
    includeSource: optional(z, z.boolean()).describe('If true, include the full source content in results.'),
  });
}

function assetParameters(z) {
  return z.object({
    inputPath: z.string().describe('Path to the PNG, JPEG, or WebP image file to normalize.'),
    outputDirectory: optional(z, z.string()).describe('Output directory for the normalized asset. Defaults to figures/tikz/assets/.'),
    nodeId: optional(z, z.string()).describe('Node ID to associate with this asset in the manifest.'),
    prompt: optional(z, z.string()).describe('The generation prompt used if the image was AI-generated.'),
    provider: optional(z, z.string()).describe('The image provider used (e.g., openai, replicate).'),
    model: optional(z, z.string()).describe('The model name used for generation.'),
  });
}

function renderParameters(z) {
  return z.object({
    sourcePath: z.string().describe('Path to the TikZ .tex source file to compile and render.'),
    outputDirectory: optional(z, z.string()).describe('Directory for output files. Defaults to the same directory as the source file.'),
    timeoutMs: optional(z, z.number()).describe('Timeout in milliseconds for the render process.'),
  });
}
function generateParameters(z) {
  return z.object({
        graph: z.string().describe('A JSON string of the ELK graph IR. Use JSON.stringify() to convert your graph object. Must include id, children, width, height. Input nodes must omit x and y (the layout engine computes positions). Size each node width and height to fit its exact label plus padding (2pt inner padding applied). Example: \'{"id":"root","children":[{"id":"n1","width":40,"height":20}]}\''),
        layoutOptions: optional(z, z.string()).describe('Optional JSON string of ELK layout options. Use JSON.stringify() to convert your options object. Place elk.algorithm and layout options here. Choose elk.algorithm: layered (flows), mrtree (trees), radial (mind-map), stress, or force. Set elk.direction to RIGHT or DOWN. Fix overlaps by changing layout options or node sizes and regenerating. Example: {"elk.algorithm":"layered","elk.direction":"RIGHT"}'),
        styleOptions: optional(z, z.string()).describe('Optional JSON string of TikZ style options. Use JSON.stringify() to convert your style object. Use - for no arrow, dashed or dotted for line style. Set arrow type with properties.arrow: ->, <-, or <->.'),
    preset: optional(z, z.enum(['paper-column', 'paper-full', 'slide-16-9', 'slide-4-3'])).describe('Target medium preset: paper-column (double-column paper, ~240pt), paper-full (full text width, ~504pt), slide-16-9, or slide-4-3.'),
    density: optional(z, z.enum(['compact', 'balanced', 'airy'])).describe('Density tuning: compact (tight), balanced (default), or airy (spacious).'),
    targetWidthPt: optional(z, z.number()).describe('Optional target width in points for scaling the diagram.'),
  });
}

function previewAssetsParameters(z) {
  return z.object({
    manifestPath: optional(z, z.string()).describe('Path to the asset manifest JSON file. Defaults to figures/tikz/assets/assets.manifest.json.'),
    nodeIds: optional(z, z.array(z.string())).describe('Optional array of node IDs to filter which assets to preview.'),
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
      'The graph parameter must be a JSON string. Use JSON.stringify() to convert your graph object before passing it.',
      'Size each node width and height to fit its exact label plus padding before calling the layout engine.',
      'Set elk.algorithm: layered (flows), mrtree (trees), radial (mind-map), stress, or force.',
      'Set elk.direction to RIGHT or DOWN.',
      'Choose preset for target medium: paper-column (double-column paper), paper-full (full text width), slide-16-9, or slide-4-3.',
      'Write the returned .tex to the project and compile it with tikz_render.',
      'If ELK_NOT_INSTALLED, run npm run install:deps and call tikz_generate_diagram again.',
    ],
    parameters: generateParameters(z),
    async execute(_toolCallId, params) {
      try {
        const graphResult = parseJsonParam('tikz_generate_diagram', 'graph', params.graph);
        if (!graphResult.ok) return errorResponse(new Error(graphResult.error));
        const layoutResult = parseJsonParam('tikz_generate_diagram', 'layoutOptions', params.layoutOptions);
        if (!layoutResult.ok) return errorResponse(new Error(layoutResult.error));
        const styleResult = parseJsonParam('tikz_generate_diagram', 'styleOptions', params.styleOptions);
        if (!styleResult.ok) return errorResponse(new Error(styleResult.error));
        const parsed = { graph: graphResult.value };
        if (layoutResult.value !== undefined) parsed.layoutOptions = layoutResult.value;
        if (styleResult.value !== undefined) parsed.tikzOptions = styleResult.value;
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
