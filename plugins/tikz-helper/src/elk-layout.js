import { TikzRuntimeError } from './runtime-error.js';

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

let elkModule = null;

async function loadElk() {
  if (elkModule) return elkModule;
  try {
    const { default: ELK } = await import('elkjs/lib/main.js');
    elkModule = ELK;
    return ELK;
  } catch (error) {
    throw new TikzRuntimeError('ELK_LAYOUT_ERROR', `Failed to load elkjs: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function createElk(options = {}) {
  return { options };
}

export async function computeLayout(graph, options = {}) {
  if (!graph || typeof graph !== 'object') {
    throw new TikzRuntimeError('INVALID_GRAPH_IR', 'Graph must be a non-null object.');
  }

  validateGraph(graph);

  const algorithm = normalizeAlgorithm(graph);
  const ELK = await loadElk();
  const elk = new ELK();

  const graphClone = structuredClone(graph);
  if (!graphClone.layoutOptions) {
    graphClone.layoutOptions = {};
  }
  if (!graphClone.layoutOptions['elk.algorithm'] && !graphClone.layoutOptions.algorithm) {
    graphClone.layoutOptions['elk.algorithm'] = algorithm;
  }

  const layoutOptions = { ...(options.layoutOptions ?? {}) };

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
