import { TikzRuntimeError } from './runtime-error.js';
const SERVER_DEFAULT_LAYOUT_OPTIONS = Object.freeze({
  'elk.spacing.nodeNode': 50,
  'elk.layered.spacing.nodeNodeBetweenLayers': 50,
  'elk.spacing.edgeNode': 25,
  'elk.layered.spacing.edgeNodeBetweenLayers': 25,
  'elk.spacing.edgeEdge': 15,
  'elk.spacing.portPort': 15,
  'elk.spacing.labelNode': 10,
  'elk.spacing.edgeLabel': 12,
  'elk.spacing.componentComponent': 40,
  'elk.padding': '[top=20,left=20,bottom=20,right=20]',
  'elk.nodeSize.constraints': 'NODE_LABELS, PORTS, PORT_LABELS, MINIMUM_SIZE',
  'elk.nodeSize.minimum': '(80, 40)',
  'elk.layered.unnecessaryBendpoints': true,
  'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
  'elk.layered.compaction.connectedComponents': true,
});


function countNodes(node) {
  let count = 1;
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

const VALID_LAYOUT_ALGORITHMS = new Set([
  'layered', 'stress', 'mrtree', 'radial', 'force', 'disco', 'box', 'fixed', 'random',
]);

function asError(error, fallbackCode = 'ELK_LAYOUT_ERROR') {
  if (error instanceof TikzRuntimeError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new TikzRuntimeError(fallbackCode, message);
}

function validateGraph(graph) {
  if (!graph || typeof graph !== 'object') {
    throw new TikzRuntimeError('INVALID_GRAPH_IR', 'Graph must be a non-null object.');
  }
  if (typeof graph.id !== 'string' || graph.id.trim() === '') {
    throw new TikzRuntimeError('INVALID_GRAPH_IR', 'Graph must have a non-empty string id.');
  }
  if (!Array.isArray(graph.children) || graph.children.length === 0) {
    throw new TikzRuntimeError('INVALID_GRAPH_IR', 'Graph must have at least one child node.');
  }

  function validateNode(node) {
    if (typeof node.id !== 'string' || node.id.trim() === '') {
      throw new TikzRuntimeError('INVALID_GRAPH_IR', 'Every node must have a non-empty string id.');
    }
    const isGroup = Array.isArray(node.children) && node.children.length > 0;
    // Groups may omit width/height (ELK computes from children), but if provided they must be valid
    if (node.width !== undefined) {
      if (typeof node.width !== 'number' || node.width <= 0) {
        throw new TikzRuntimeError('INVALID_GRAPH_IR', `Node "${node.id}" width must be a positive number.`);
      }
    } else if (!isGroup) {
      throw new TikzRuntimeError('INVALID_GRAPH_IR', `Node "${node.id}" must specify a width.`);
    }
    if (node.height !== undefined) {
      if (typeof node.height !== 'number' || node.height <= 0) {
        throw new TikzRuntimeError('INVALID_GRAPH_IR', `Node "${node.id}" height must be a positive number.`);
      }
    } else if (!isGroup) {
      throw new TikzRuntimeError('INVALID_GRAPH_IR', `Node "${node.id}" must specify a height.`);
    }

    // Recurse into group children
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        validateNode(child);
      }
    }

    // Validate edges defined on this node (for groups)
    if (Array.isArray(node.edges)) {
      for (let index = 0; index < node.edges.length; index += 1) {
        const edge = node.edges[index];
        if (typeof edge.id !== 'string' || edge.id.trim() === '') {
          throw new TikzRuntimeError('INVALID_GRAPH_IR', `Edge in node "${node.id}" at index ${index} must have a non-empty string id.`);
        }
        if (!Array.isArray(edge.sources) || edge.sources.length === 0) {
          throw new TikzRuntimeError('INVALID_GRAPH_IR', `Edge "${edge.id}" in node "${node.id}" must have at least one source.`);
        }
        if (edge.sources.length > 1) {
          throw new TikzRuntimeError('INVALID_GRAPH_IR', `Edge "${edge.id}" in node "${node.id}" has ${edge.sources.length} sources. Only single-source edges are supported.`);
        }
        if (!Array.isArray(edge.targets) || edge.targets.length === 0) {
          throw new TikzRuntimeError('INVALID_GRAPH_IR', `Edge "${edge.id}" in node "${node.id}" must have at least one target.`);
        }
        if (edge.targets.length > 1) {
          throw new TikzRuntimeError('INVALID_GRAPH_IR', `Edge "${edge.id}" in node "${node.id}" has ${edge.targets.length} targets. Only single-target edges are supported.`);
        }
      }
    }
  }

  // Validate all root children recursively
  for (const child of graph.children) {
    validateNode(child);
  }

  // Validate root-level edges
  if (Array.isArray(graph.edges)) {
    for (const edge of graph.edges) {
      if (typeof edge.id !== 'string' || edge.id.trim() === '') {
        throw new TikzRuntimeError('INVALID_GRAPH_IR', `A root-level edge must have a non-empty string id.`);
      }
      if (!Array.isArray(edge.sources) || edge.sources.length === 0) {
        throw new TikzRuntimeError('INVALID_GRAPH_IR', `Edge "${edge.id}" must have at least one source.`);
      }
      if (edge.sources.length > 1) {
        throw new TikzRuntimeError('INVALID_GRAPH_IR', `Edge "${edge.id}" has ${edge.sources.length} sources. Only single-source edges are supported.`);
      }
      if (!Array.isArray(edge.targets) || edge.targets.length === 0) {
        throw new TikzRuntimeError('INVALID_GRAPH_IR', `Edge "${edge.id}" must have at least one target.`);
      }
      if (edge.targets.length > 1) {
        throw new TikzRuntimeError('INVALID_GRAPH_IR', `Edge "${edge.id}" has ${edge.targets.length} targets. Only single-target edges are supported.`);
      }
    }
  }
}

function normalizeAlgorithm(graph) {
  const options = graph.layoutOptions ?? {};
  const algorithm = options['elk.algorithm'] ?? options.algorithm ?? 'layered';
  if (!VALID_LAYOUT_ALGORITHMS.has(algorithm)) {
    throw new TikzRuntimeError('INVALID_GRAPH_IR', `Unknown layout algorithm "${algorithm}". Valid: ${[...VALID_LAYOUT_ALGORITHMS].join(', ')}`);
  }
  return algorithm;
}

const DEFAULT_IMPORT_ELK = () => import('elkjs/lib/main.js');

export const ELK_INSTALL_GUIDANCE = Object.freeze({
  code: 'ELK_NOT_INSTALLED',
  install: Object.freeze({
    command: 'npm run install:deps',
    tool: 'omp_core_install_deps',
    package: 'elkjs',
  }),
  directive: 'ELK (elkjs) is required to compute diagram layout. Install it, then call tikz_generate_diagram again. Never fall back to hand-authored TikZ coordinates: the ELK graph IR is the sole source of node positions and edge geometry.',
});

export async function checkElkEnvironment({ importElk = DEFAULT_IMPORT_ELK } = {}) {
  try {
    await importElk();
    return { available: true, code: 'ELK_AVAILABLE' };
  } catch (error) {
    return {
      available: false,
      code: ELK_INSTALL_GUIDANCE.code,
      error: error instanceof Error ? error.message : String(error),
      install: ELK_INSTALL_GUIDANCE.install,
      directive: ELK_INSTALL_GUIDANCE.directive,
    };
  }
}

let elkModule = null;

async function loadElk(importElk) {
  const useDefault = importElk === undefined;
  const importer = useDefault ? DEFAULT_IMPORT_ELK : importElk;
  if (useDefault && elkModule) return elkModule;
  let mod;
  try {
    mod = await importer();
  } catch (error) {
    throw new TikzRuntimeError(
      ELK_INSTALL_GUIDANCE.code,
      `The ELK layout engine (elkjs) is not installed: ${error instanceof Error ? error.message : String(error)}. ${ELK_INSTALL_GUIDANCE.directive}`,
      { install: ELK_INSTALL_GUIDANCE.install, directive: ELK_INSTALL_GUIDANCE.directive },
    );
  }
  const ELK = mod?.default ?? mod;
  if (useDefault) elkModule = ELK;
  return ELK;
}

export function createElk(options = {}) {
  return { options };
}

export async function computeLayout(graph, options = {}) {
  if (!graph || typeof graph !== 'object') {
    throw new TikzRuntimeError('INVALID_GRAPH_IR', 'Graph must be a non-null object.');
  }

  validateGraph(graph);
  const nodeCount = countNodes(graph);
  const edgeCount = (graph.edges ?? []).length;
  if (nodeCount > 500 || edgeCount > 1000) {
    throw new TikzRuntimeError('GRAPH_TOO_LARGE', `Graph has ${nodeCount} nodes and ${edgeCount} edges; maximum is 500 nodes and 1000 edges.`);
  }

  const algorithm = normalizeAlgorithm(graph);
  const ELK = await loadElk(options.importElk);
  const elk = new ELK();

  const graphClone = structuredClone(graph);
  if (!graphClone.layoutOptions) {
    graphClone.layoutOptions = {};
  }
  if (!graphClone.layoutOptions['elk.algorithm'] && !graphClone.layoutOptions.algorithm) {
    graphClone.layoutOptions['elk.algorithm'] = algorithm;
  }

  const rootIrLayoutOptions = graphClone.layoutOptions ?? {};
  const layoutOptions = {};
  Object.assign(layoutOptions, SERVER_DEFAULT_LAYOUT_OPTIONS, options.layoutOptions ?? {}, rootIrLayoutOptions);

  // Backend assumes container-relative (PARENT) coordinates — force PARENT
  if (layoutOptions['json.edgeCoords'] && layoutOptions['json.edgeCoords'] !== 'PARENT') {
    throw new TikzRuntimeError('INVALID_GRAPH_IR', `json.edgeCoords="${layoutOptions['json.edgeCoords']}" is not supported. Only PARENT mode is supported.`);
  }
  if (layoutOptions['json.shapeCoords'] && layoutOptions['json.shapeCoords'] !== 'PARENT') {
    throw new TikzRuntimeError('INVALID_GRAPH_IR', `json.shapeCoords="${layoutOptions['json.shapeCoords']}" is not supported. Only PARENT mode is supported.`);
  }
  layoutOptions['json.edgeCoords'] = 'PARENT';
  layoutOptions['json.shapeCoords'] = 'PARENT';

  const measureExecutionTime = options.measureExecutionTime ?? true;

  let result;
  try {
    result = await elk.layout(graphClone, {
      layoutOptions,
      measureExecutionTime,
      logging: false,
    });
  } catch (error) {
    throw new TikzRuntimeError(
      'ELK_LAYOUT_ERROR',
      `Layout computation failed: ${error instanceof Error ? error.message : String(error)}`,
      { algorithm },
    );
  }

  const executionTime = result?.logging?.executionTime;
  const positioned = { ...result };

  return {
    graph: positioned,
    metadata: {
      algorithm,
      nodeCount: (positioned.children ?? []).length,
      edgeCount: (positioned.edges ?? []).length,
      executionTime: typeof executionTime === 'number' ? executionTime : null,
    },
  };
}

export { loadElk };
