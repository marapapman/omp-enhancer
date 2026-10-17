// Pure validation and transition logic for the storyline workbench.
// No filesystem or network access lives here; store.js persists what this
// module produces and server.js exposes it over HTTP.

import { randomUUID } from 'node:crypto';

export const SCHEMA_VERSION = 1;
const STORY_KINDS = Object.freeze(['article', 'slides']);
const NODE_KINDS = Object.freeze(['topic', 'claim', 'evidence']);
const BLOCK_TYPES = Object.freeze(['markdown', 'table', 'image', 'math']);
const IMAGE_ROLES = Object.freeze(['figure', 'icon']);
const COMMENT_STATUSES = Object.freeze(['open', 'resolved']);
const PROPOSAL_STATUSES = Object.freeze(['pending', 'accepted', 'rejected']);
const PROPOSAL_DECISIONS = Object.freeze(['accept', 'reject']);
export const MAX_JSON_BYTES = 10 * 1024 * 1024;
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;

export const ASSET_TYPES = Object.freeze({
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
});

const STORY_KEYS = Object.freeze([
  'schemaVersion',
  'projectId',
  'kind',
  'revision',
  'rootId',
  'nodes',
  'comments',
  'assets',
  'rounds',
  'proposals',
]);
const NODE_KEYS = Object.freeze([
  'id',
  'parentId',
  'kind',
  'position',
  'title',
  'blocks',
  'sources',
  'revision',
]);
const BLOCK_KEYS = Object.freeze({
  markdown: ['id', 'type', 'text'],
  table: ['id', 'type', 'columns', 'rows', 'caption'],
  image: ['id', 'type', 'assetId', 'role', 'alt', 'caption'],
  math: ['id', 'type', 'latex', 'display'],
});
const SOURCE_KEYS = Object.freeze(['label', 'url']);
const COMMENT_KEYS = Object.freeze([
  'id',
  'nodeId',
  'nodeRevision',
  'body',
  'status',
  'createdAt',
  'updatedAt',
]);
const ASSET_KEYS = Object.freeze(['id', 'filename', 'mime', 'size', 'storedName']);
const ROUND_KEYS = Object.freeze([
  'id',
  'baseRevision',
  'createdAt',
  'projectId',
  'kind',
  'rootId',
  'nodes',
  'comments',
  'assets',
]);
const PROPOSAL_INPUT_KEYS = Object.freeze([
  'schemaVersion',
  'roundId',
  'baseRevision',
  'nodes',
  'addressedCommentIds',
  'summary',
]);
const PROPOSAL_STORED_KEYS = Object.freeze([
  'id',
  'roundId',
  'baseRevision',
  'nodes',
  'addressedCommentIds',
  'summary',
  'createdAt',
  'status',
]);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const EXTENSION_PATTERN = /^[a-z0-9]{1,8}$/;

export class StorylineError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'StorylineError';
    this.code = code;
    this.details = details;
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isString(value) {
  return typeof value === 'string';
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value >= 1;
}

function unknownKeys(value, allowed) {
  return Object.keys(value).filter((key) => !allowed.includes(key));
}

class Validator {
  constructor() {
    this.errors = [];
  }

  push(path, code, message) {
    this.errors.push({ path, code, message });
    return false;
  }

  get ok() {
    return this.errors.length === 0;
  }
}

function isHttpUrl(value) {
  if (!isString(value)) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

function validateSource(validator, source, path) {
  if (!isPlainObject(source)) return;
  const unknown = unknownKeys(source, SOURCE_KEYS);
  if (unknown.length > 0) validator.push(path, 'UNKNOWN_FIELD', `source has unknown fields: ${unknown.join(', ')}`);
  if (source.label !== undefined && !isString(source.label)) validator.push(`${path}.label`, 'INVALID_TYPE', 'label must be a string');
  if (!isString(source.url)) {
    validator.push(`${path}.url`, 'INVALID_TYPE', 'url must be a string');
    return;
  }
  if (source.url !== '' && !isHttpUrl(source.url)) {
    validator.push(`${path}.url`, 'INVALID_SOURCE_URL', 'url must be empty or an http(s) URL');
  }
}

function validateBlock(validator, block, path, assetIds) {
  if (!isPlainObject(block)) {
    validator.push(path, 'INVALID_TYPE', 'block must be an object');
    return;
  }
  if (!BLOCK_TYPES.includes(block.type)) {
    validator.push(`${path}.type`, 'INVALID_BLOCK_TYPE', `block type must be one of ${BLOCK_TYPES.join(', ')}`);
    return;
  }
  const unknown = unknownKeys(block, BLOCK_KEYS[block.type]);
  if (unknown.length > 0) {
    validator.push(path, 'UNKNOWN_FIELD', `${block.type} block has unknown fields: ${unknown.join(', ')}`);
  }
  if (!ID_PATTERN.test(String(block.id ?? ''))) {
    validator.push(`${path}.id`, 'INVALID_ID', 'block id must be 1-64 chars of [A-Za-z0-9_-]');
  }
  switch (block.type) {
    case 'markdown':
      if (!isString(block.text)) validator.push(`${path}.text`, 'INVALID_TYPE', 'text must be a string');
      break;
    case 'table': {
      if (!Array.isArray(block.columns) || block.columns.length < 1) {
        validator.push(`${path}.columns`, 'INVALID_TABLE', 'columns must be an array with at least one entry');
        break;
      }
      if (!block.columns.every(isString)) {
        validator.push(`${path}.columns`, 'INVALID_TABLE', 'every column header must be a string');
        break;
      }
      if (!Array.isArray(block.rows)) {
        validator.push(`${path}.rows`, 'INVALID_TABLE', 'rows must be an array');
        break;
      }
      block.rows.forEach((row, index) => {
        if (!Array.isArray(row)) {
          validator.push(`${path}.rows[${index}]`, 'INVALID_TABLE', 'row must be an array');
          return;
        }
        if (row.length !== block.columns.length) {
          validator.push(`${path}.rows[${index}]`, 'INVALID_TABLE', 'row length must equal the column count');
        }
        if (!row.every(isString)) {
          validator.push(`${path}.rows[${index}]`, 'INVALID_TABLE', 'every cell must be a string');
        }
      });
      if (!isString(block.caption)) validator.push(`${path}.caption`, 'INVALID_TYPE', 'caption must be a string');
      break;
    }
    case 'image':
      if (!isString(block.assetId) || !assetIds.has(block.assetId)) {
        validator.push(`${path}.assetId`, 'UNKNOWN_ASSET', 'image block must reference an existing asset');
      }
      if (!IMAGE_ROLES.includes(block.role)) {
        validator.push(`${path}.role`, 'INVALID_ROLE', `role must be one of ${IMAGE_ROLES.join(', ')}`);
      }
      if (!isString(block.alt)) validator.push(`${path}.alt`, 'INVALID_TYPE', 'alt must be a string');
      if (!isString(block.caption)) validator.push(`${path}.caption`, 'INVALID_TYPE', 'caption must be a string');
      break;
    case 'math':
      if (!isString(block.latex)) validator.push(`${path}.latex`, 'INVALID_TYPE', 'latex must be a string');
      if (typeof block.display !== 'boolean') validator.push(`${path}.display`, 'INVALID_TYPE', 'display must be a boolean');
      break;
    default:
      break;
  }
}

function validateNode(validator, node, path, assetIds) {
  if (!isPlainObject(node)) {
    validator.push(path, 'INVALID_TYPE', 'node must be an object');
    return;
  }
  const unknown = unknownKeys(node, NODE_KEYS);
  if (unknown.length > 0) {
    validator.push(path, 'UNKNOWN_FIELD', `node has unknown fields: ${unknown.join(', ')}`);
  }
  if (!ID_PATTERN.test(String(node.id ?? ''))) {
    validator.push(`${path}.id`, 'INVALID_ID', 'node id must be 1-64 chars of [A-Za-z0-9_-]');
  }
  if (node.parentId !== null && !ID_PATTERN.test(String(node.parentId ?? ''))) {
    validator.push(`${path}.parentId`, 'INVALID_ID', 'parentId must be null or a node id');
  }
  if (!NODE_KINDS.includes(node.kind)) {
    validator.push(`${path}.kind`, 'INVALID_NODE_KIND', `kind must be one of ${NODE_KINDS.join(', ')}`);
  }
  if (!isNonNegativeInteger(node.position)) {
    validator.push(`${path}.position`, 'INVALID_POSITION', 'position must be an integer >= 0');
  }
  if (!isString(node.title)) validator.push(`${path}.title`, 'INVALID_TYPE', 'title must be a string');
  if (node.revision !== undefined && !isPositiveInteger(node.revision)) {
    validator.push(`${path}.revision`, 'INVALID_TYPE', 'revision must be an integer >= 1');
  }
  if (!Array.isArray(node.blocks)) {
    validator.push(`${path}.blocks`, 'INVALID_TYPE', 'blocks must be an array');
  } else {
    const blockIds = new Set();
    node.blocks.forEach((block, index) => {
      validateBlock(validator, block, `${path}.blocks[${index}]`, assetIds);
      const blockId = isPlainObject(block) ? block.id : undefined;
      if (typeof blockId === 'string') {
        if (blockIds.has(blockId)) {
          validator.push(`${path}.blocks[${index}].id`, 'DUPLICATE_ID', 'block id must be unique within its node');
        }
        blockIds.add(blockId);
      }
    });
  }
  if (!Array.isArray(node.sources)) {
    validator.push(`${path}.sources`, 'INVALID_TYPE', 'sources must be an array');
  } else {
    node.sources.forEach((source, index) => validateSource(validator, source, `${path}.sources[${index}]`));
  }
}

function validateAssets(assets) {
  const validator = new Validator();
  const assetIds = new Set();
  assets.forEach((asset, index) => {
    const path = `assets[${index}]`;
    if (!isPlainObject(asset)) {
      validator.push(path, 'INVALID_TYPE', 'asset must be an object');
      return;
    }
    const unknown = unknownKeys(asset, ASSET_KEYS);
    if (unknown.length > 0) validator.push(path, 'UNKNOWN_FIELD', `asset has unknown fields: ${unknown.join(', ')}`);
    if (!ID_PATTERN.test(String(asset.id ?? ''))) {
      validator.push(`${path}.id`, 'INVALID_ID', 'asset id must be 1-64 chars of [A-Za-z0-9_-]');
    } else if (assetIds.has(asset.id)) {
      validator.push(`${path}.id`, 'DUPLICATE_ID', 'asset id must be unique');
    } else {
      assetIds.add(asset.id);
    }
    if (!isString(asset.filename)) validator.push(`${path}.filename`, 'INVALID_TYPE', 'filename must be a string');
    if (!Object.values(ASSET_TYPES).includes(String(asset.mime).split('/')[1] ?? '') && !Object.keys(ASSET_TYPES).includes(asset.mime)) {
      validator.push(`${path}.mime`, 'INVALID_ASSET_TYPE', 'mime must be an accepted image type');
    }
    if (!isNonNegativeInteger(asset.size)) validator.push(`${path}.size`, 'INVALID_TYPE', 'size must be an integer >= 0');
    if (!isString(asset.storedName) || !isStoredAssetName(asset.storedName, asset.id)) {
      validator.push(`${path}.storedName`, 'INVALID_STORED_NAME', 'storedName must be the asset id plus an extension');
    }
  });
  return { ok: validator.ok, errors: validator.errors, assetIds };
}

function isStoredAssetName(storedName, assetId) {
  if (!isString(storedName)) return false;
  if (storedName.includes('/') || storedName.includes('\\') || storedName.includes('..')) return false;
  const dot = storedName.lastIndexOf('.');
  if (dot <= 0) return false;
  const base = storedName.slice(0, dot);
  const extension = storedName.slice(dot + 1);
  if (!EXTENSION_PATTERN.test(extension)) return false;
  return isString(assetId) ? base === assetId : ID_PATTERN.test(base);
}

function validateNodes(validator, nodes, assetIds, { rootId }) {
  const byId = new Map();
  nodes.forEach((node, index) => {
    const path = `nodes[${index}]`;
    validateNode(validator, node, path, assetIds);
    if (!isPlainObject(node) || !isString(node.id)) return;
    if (byId.has(node.id)) {
      validator.push(`${path}.id`, 'DUPLICATE_ID', `duplicate node id ${node.id}`);
      return;
    }
    byId.set(node.id, node);
  });
  if (validator.errors.length > 0) return byId;

  const topics = nodes.filter((node) => node.kind === 'topic');
  if (topics.length !== 1) {
    validator.push('nodes', 'INVALID_TREE', 'exactly one topic node is required');
  }
  const root = byId.get(rootId);
  if (!root) {
    validator.push('rootId', 'INVALID_TREE', 'rootId must reference a node in the tree');
    return byId;
  }
  if (root.kind !== 'topic' || root.parentId !== null) {
    validator.push('nodes', 'INVALID_TREE', 'the root node must be the topic node with a null parentId');
  }
  const childrenOf = new Map();
  for (const node of nodes) childrenOf.set(node.id, []);
  for (const node of nodes) {
    if (node.parentId === null) {
      if (node.id !== rootId) {
        validator.push(`nodes[${node.id}]`, 'INVALID_TREE', 'only the root node may have a null parentId');
      }
      continue;
    }
    const parent = byId.get(node.parentId);
    if (!parent) {
      validator.push(`nodes[${node.id}].parentId`, 'INVALID_TREE', `parent ${node.parentId} is not in the tree`);
      continue;
    }
    if (node.kind === 'topic') {
      validator.push(`nodes[${node.id}].kind`, 'INVALID_TREE', 'only one topic node may exist');
    }
    if (node.kind === 'evidence' && parent.kind !== 'claim') {
      validator.push(`nodes[${node.id}].parentId`, 'INVALID_TREE', 'an evidence node must sit directly under a claim');
    }
    childrenOf.get(node.parentId).push(node);
  }

  for (const node of nodes) {
    if (node.kind !== 'evidence') continue;
    if ((childrenOf.get(node.id) ?? []).length > 0) {
      validator.push(`nodes[${node.id}]`, 'INVALID_TREE', 'an evidence node cannot have children');
    }
  }

  for (const [parentId, children] of childrenOf) {
    const positions = children.map((child) => child.position).sort((left, right) => left - right);
    positions.forEach((position, index) => {
      if (position !== index) {
        validator.push(`nodes[${parentId}]`, 'INVALID_POSITION', 'sibling positions must be contiguous from 0');
        return;
      }
    });
  }

  for (const node of nodes) {
    const seen = new Set([node.id]);
    let current = node;
    while (current.parentId !== null) {
      if (seen.has(current.parentId)) {
        validator.push(`nodes[${node.id}]`, 'INVALID_TREE', 'a parent cycle exists');
        break;
      }
      seen.add(current.parentId);
      const parent = byId.get(current.parentId);
      if (!parent) break;
      current = parent;
    }
  }
  return byId;
}

function validateComments(validator, comments) {
  const ids = new Set();
  comments.forEach((comment, index) => {
    const path = `comments[${index}]`;
    if (!isPlainObject(comment)) {
      validator.push(path, 'INVALID_TYPE', 'comment must be an object');
      return;
    }
    const unknown = unknownKeys(comment, COMMENT_KEYS);
    if (unknown.length > 0) validator.push(path, 'UNKNOWN_FIELD', `comment has unknown fields: ${unknown.join(', ')}`);
    if (!ID_PATTERN.test(String(comment.id ?? ''))) {
      validator.push(`${path}.id`, 'INVALID_ID', 'comment id must be 1-64 chars of [A-Za-z0-9_-]');
    } else if (ids.has(comment.id)) {
      validator.push(`${path}.id`, 'DUPLICATE_ID', 'comment id must be unique');
    } else {
      ids.add(comment.id);
    }
    if (!isString(comment.nodeId) || comment.nodeId === '') {
      validator.push(`${path}.nodeId`, 'INVALID_TYPE', 'nodeId must be a non-empty string');
    }
    if (!isPositiveInteger(comment.nodeRevision)) {
      validator.push(`${path}.nodeRevision`, 'INVALID_TYPE', 'nodeRevision must be an integer >= 1');
    }
    if (!isNonEmptyString(comment.body)) {
      validator.push(`${path}.body`, 'INVALID_COMMENT_BODY', 'comment body must not be empty');
    }
    if (!COMMENT_STATUSES.includes(comment.status)) {
      validator.push(`${path}.status`, 'INVALID_STATUS', `status must be one of ${COMMENT_STATUSES.join(', ')}`);
    }
    for (const key of ['createdAt', 'updatedAt']) {
      if (!isString(comment[key]) || Number.isNaN(Date.parse(comment[key]))) {
        validator.push(`${path}.${key}`, 'INVALID_TYPE', `${key} must be an ISO timestamp`);
      }
    }
  });
  return ids;
}

function validateRounds(validator, rounds) {
  const ids = new Set();
  rounds.forEach((round, index) => {
    const path = `rounds[${index}]`;
    if (!isPlainObject(round)) {
      validator.push(path, 'INVALID_TYPE', 'round must be an object');
      return;
    }
    const unknown = unknownKeys(round, ROUND_KEYS);
    if (unknown.length > 0) validator.push(path, 'UNKNOWN_FIELD', `round has unknown fields: ${unknown.join(', ')}`);
    if (!ID_PATTERN.test(String(round.id ?? ''))) {
      validator.push(`${path}.id`, 'INVALID_ID', 'round id must be 1-64 chars of [A-Za-z0-9_-]');
    } else if (ids.has(round.id)) {
      validator.push(`${path}.id`, 'DUPLICATE_ID', 'round id must be unique');
    } else {
      ids.add(round.id);
    }
    if (!isPositiveInteger(round.baseRevision)) {
      validator.push(`${path}.baseRevision`, 'INVALID_TYPE', 'baseRevision must be an integer >= 1');
    }
    if (!isString(round.createdAt) || Number.isNaN(Date.parse(round.createdAt))) {
      validator.push(`${path}.createdAt`, 'INVALID_TYPE', 'createdAt must be an ISO timestamp');
    }
    if (!isString(round.projectId) || !STORY_KINDS.includes(round.kind) || !isString(round.rootId)) {
      validator.push(path, 'INVALID_ROUND', 'round must carry projectId, kind, and rootId');
    }
    if (!Array.isArray(round.nodes) || !Array.isArray(round.comments) || !Array.isArray(round.assets)) {
      validator.push(path, 'INVALID_ROUND', 'round must carry nodes, comments, and assets arrays');
      return;
    }
    const assetIds = new Set(round.assets.filter(isPlainObject).map((asset) => asset.id));
    const nested = new Validator();
    validateNodes(nested, round.nodes, assetIds, { rootId: round.rootId });
    validateComments(nested, round.comments);
    nested.errors.forEach((error) => validator.push(`${path}.${error.path}`, error.code, error.message));
    if (round.comments.some((comment) => comment?.status !== 'open')) {
      validator.push(`${path}.comments`, 'INVALID_ROUND', 'a round snapshot keeps only open comments');
    }
  });
  return ids;
}

function validateProposals(validator, proposals, { roundIds }) {
  const ids = new Set();
  proposals.forEach((proposal, index) => {
    const path = `proposals[${index}]`;
    if (!isPlainObject(proposal)) {
      validator.push(path, 'INVALID_TYPE', 'proposal must be an object');
      return;
    }
    const unknown = unknownKeys(proposal, PROPOSAL_STORED_KEYS);
    if (unknown.length > 0) validator.push(path, 'UNKNOWN_FIELD', `proposal has unknown fields: ${unknown.join(', ')}`);
    if (!ID_PATTERN.test(String(proposal.id ?? ''))) {
      validator.push(`${path}.id`, 'INVALID_ID', 'proposal id must be 1-64 chars of [A-Za-z0-9_-]');
    } else if (ids.has(proposal.id)) {
      validator.push(`${path}.id`, 'DUPLICATE_ID', 'proposal id must be unique');
    } else {
      ids.add(proposal.id);
    }
    if (!isString(proposal.roundId) || !roundIds.has(proposal.roundId)) {
      validator.push(`${path}.roundId`, 'INVALID_ROUND', 'proposal must reference an existing round');
    }
    if (!isPositiveInteger(proposal.baseRevision)) {
      validator.push(`${path}.baseRevision`, 'INVALID_TYPE', 'baseRevision must be an integer >= 1');
    }
    if (!PROPOSAL_STATUSES.includes(proposal.status)) {
      validator.push(`${path}.status`, 'INVALID_STATUS', `status must be one of ${PROPOSAL_STATUSES.join(', ')}`);
    }
    if (!isString(proposal.createdAt) || Number.isNaN(Date.parse(proposal.createdAt))) {
      validator.push(`${path}.createdAt`, 'INVALID_TYPE', 'createdAt must be an ISO timestamp');
    }
    if (!isString(proposal.summary)) validator.push(`${path}.summary`, 'INVALID_TYPE', 'summary must be a string');
    if (!Array.isArray(proposal.nodes)) {
      validator.push(`${path}.nodes`, 'INVALID_TYPE', 'nodes must be an array');
      return;
    }
    if (!Array.isArray(proposal.addressedCommentIds)) {
      validator.push(`${path}.addressedCommentIds`, 'INVALID_TYPE', 'addressedCommentIds must be an array');
    }
  });
  return ids;
}

export function validateStory(story) {
  const validator = new Validator();
  if (!isPlainObject(story)) {
    return { ok: false, errors: [{ path: '', code: 'INVALID_TYPE', message: 'story must be an object' }], story: null };
  }
  const unknown = unknownKeys(story, STORY_KEYS);
  if (unknown.length > 0) {
    validator.push('', 'UNKNOWN_FIELD', `story has unknown fields: ${unknown.join(', ')}`);
  }
  if (story.schemaVersion !== SCHEMA_VERSION) {
    validator.push('schemaVersion', 'UNSUPPORTED_SCHEMA', `schemaVersion must be ${SCHEMA_VERSION}`);
  }
  if (!isString(story.projectId) || story.projectId === '') {
    validator.push('projectId', 'INVALID_TYPE', 'projectId must be a non-empty string');
  }
  if (!STORY_KINDS.includes(story.kind)) {
    validator.push('kind', 'INVALID_KIND', `kind must be one of ${STORY_KINDS.join(', ')}`);
  }
  if (!isNonNegativeInteger(story.revision)) {
    validator.push('revision', 'INVALID_TYPE', 'revision must be an integer >= 0');
  }
  const arrays = ['nodes', 'comments', 'assets', 'rounds', 'proposals'];
  for (const key of arrays) {
    if (!Array.isArray(story[key])) {
      validator.push(key, 'INVALID_TYPE', `${key} must be an array`);
    }
  }
  if (!validator.ok) return { ok: false, errors: validator.errors, story: null };

  const assets = validateAssets(story.assets);
  if (!assets.ok) validator.errors.push(...assets.errors);
  validateNodes(validator, story.nodes, assets.assetIds, { rootId: story.rootId });
  validateComments(validator, story.comments);
  const roundIds = validateRounds(validator, story.rounds);
  validateProposals(validator, story.proposals, { roundIds });

  if (!validator.ok) return { ok: false, errors: validator.errors, story: null };
  return { ok: true, errors: [], story: canonicalStory(story) };
}

export function canonicalNode(node) {
  return {
    id: node.id,
    parentId: node.parentId,
    kind: node.kind,
    position: node.position,
    title: node.title,
    blocks: node.blocks.map((block) => canonicalBlock(block)),
    sources: node.sources.map((source) => ({ label: source.label ?? '', url: source.url })),
    revision: node.revision,
  };
}

function canonicalBlock(block) {
  switch (block.type) {
    case 'markdown':
      return { id: block.id, type: 'markdown', text: block.text };
    case 'table':
      return {
        id: block.id,
        type: 'table',
        columns: [...block.columns],
        rows: block.rows.map((row) => [...row]),
        caption: block.caption,
      };
    case 'image':
      return {
        id: block.id,
        type: 'image',
        assetId: block.assetId,
        role: block.role,
        alt: block.alt,
        caption: block.caption,
      };
    default:
      return { id: block.id, type: 'math', latex: block.latex, display: block.display };
  }
}

function canonicalComment(comment) {
  return {
    id: comment.id,
    nodeId: comment.nodeId,
    nodeRevision: comment.nodeRevision,
    body: comment.body,
    status: comment.status,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

function canonicalAsset(asset) {
  return {
    id: asset.id,
    filename: asset.filename,
    mime: asset.mime,
    size: asset.size,
    storedName: asset.storedName,
  };
}

function canonicalRound(round) {
  return {
    id: round.id,
    baseRevision: round.baseRevision,
    createdAt: round.createdAt,
    projectId: round.projectId,
    kind: round.kind,
    rootId: round.rootId,
    nodes: round.nodes.map(canonicalNode),
    comments: round.comments.map(canonicalComment),
    assets: round.assets.map(canonicalAsset),
  };
}

function canonicalProposal(proposal) {
  return {
    id: proposal.id,
    roundId: proposal.roundId,
    baseRevision: proposal.baseRevision,
    nodes: proposal.nodes.map(canonicalNode),
    addressedCommentIds: [...proposal.addressedCommentIds],
    summary: proposal.summary,
    createdAt: proposal.createdAt,
    status: proposal.status,
  };
}

export function canonicalStory(story) {
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: story.projectId,
    kind: story.kind,
    revision: story.revision,
    rootId: story.rootId,
    nodes: [...story.nodes]
      .sort((left, right) => left.position - right.position)
      .map(canonicalNode),
    comments: story.comments.map(canonicalComment),
    assets: story.assets.map(canonicalAsset),
    rounds: story.rounds.map(canonicalRound),
    proposals: story.proposals.map(canonicalProposal),
  };
}

export function createStory({ projectId, kind, title = '', now = new Date().toISOString() }) {
  const rootId = randomUUID();
  return canonicalStory({
    schemaVersion: SCHEMA_VERSION,
    projectId,
    kind,
    revision: 0,
    rootId,
    nodes: [
      {
        id: rootId,
        parentId: null,
        kind: 'topic',
        position: 0,
        title,
        blocks: [],
        sources: [],
        revision: 1,
      },
    ],
    comments: [],
    assets: [],
    rounds: [],
    proposals: [],
  });
}

function nodePayload(node, children) {
  return JSON.stringify({
    title: node.title,
    blocks: node.blocks,
    sources: node.sources,
    parentId: node.parentId,
    position: node.position,
    children: children.map((child) => child.id),
  });
}

function nodesAndComments(story) {
  return JSON.stringify([story.rootId, story.nodes.map(canonicalNode), story.comments.map(canonicalComment)]);
}

function treeChanged(previous, next) {
  return nodesAndComments(previous) !== nodesAndComments(next);
}

function stripServerFields(node) {
  return {
    id: node.id,
    parentId: node.parentId,
    kind: node.kind,
    position: node.position,
    title: node.title,
    blocks: node.blocks,
    sources: node.sources,
  };
}

export function applyTreeUpdate({ story, nodes }) {
  // A candidate node may name its revision, which the server recomputes, but
  // any other unknown field is a caller error rather than silently dropped.
  const unknownFields = [];
  nodes.forEach((node, index) => {
    if (!isPlainObject(node)) return;
    const extra = Object.keys(node).filter((key) => !NODE_KEYS.includes(key));
    if (extra.length > 0) {
      unknownFields.push({
        path: `nodes[${index}]`,
        code: 'UNKNOWN_FIELD',
        message: `node has unknown fields: ${extra.join(', ')}`,
      });
    }
  });
  if (unknownFields.length > 0) return { ok: false, errors: unknownFields };
  const candidate = nodes.map(stripServerFields);
  const probe = { ...story, nodes: candidate };
  const validated = validateStory(probe);
  if (!validated.ok) {
    return { ok: false, errors: validated.errors };
  }
  const previousById = new Map(story.nodes.map((node) => [node.id, node]));
  for (const node of candidate) {
    const previous = previousById.get(node.id);
    if (previous && previous.kind !== node.kind) {
      return {
        ok: false,
        errors: [{ path: `nodes[${node.id}].kind`, code: 'NODE_KIND_IMMUTABLE', message: 'an existing node cannot change kind' }],
      };
    }
  }
  const childrenByParent = (nodes) => {
    const map = new Map();
    for (const node of nodes) map.set(node.id, []);
    for (const node of nodes) {
      if (node.parentId === null) continue;
      map.get(node.parentId)?.push(node);
    }
    for (const children of map.values()) {
      children.sort((left, right) => left.position - right.position);
    }
    return map;
  };
  const childrenOf = childrenByParent(candidate);
  const previousChildren = childrenByParent(story.nodes);
  const nextNodes = candidate.map((node) => {
    const previous = previousById.get(node.id);
    const payload = nodePayload(node, childrenOf.get(node.id) ?? []);
    if (!previous) {
      return { ...node, revision: 1 };
    }
    const unchanged = payload === nodePayload(previous, previousChildren.get(previous.id) ?? []) &&
      previous.parentId === node.parentId &&
      previous.position === node.position;
    return { ...node, revision: unchanged ? previous.revision : previous.revision + 1 };
  });
  const nextStory = { ...story, nodes: nextNodes };
  if (!treeChanged(story, nextStory)) {
    return { ok: true, story, changed: false };
  }
  return {
    ok: true,
    changed: true,
    story: canonicalStory({ ...nextStory, revision: story.revision + 1 }),
  };
}

export function createComment({ story, nodeId, body, now = new Date().toISOString() }) {
  if (!isNonEmptyString(body)) {
    return { ok: false, errors: [{ path: 'body', code: 'INVALID_COMMENT_BODY', message: 'comment body must not be empty' }] };
  }
  const node = story.nodes.find((entry) => entry.id === nodeId);
  if (!node) {
    return { ok: false, errors: [{ path: 'nodeId', code: 'UNKNOWN_NODE', message: 'comment nodeId must reference an existing node' }] };
  }
  const comment = {
    id: randomUUID(),
    nodeId,
    nodeRevision: node.revision,
    body,
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };
  return {
    ok: true,
    changed: true,
    comment,
    story: canonicalStory({ ...story, revision: story.revision + 1, comments: [...story.comments, comment] }),
  };
}

export function updateComment({ story, commentId, body, status, now = new Date().toISOString() }) {
  const index = story.comments.findIndex((comment) => comment.id === commentId);
  if (index === -1) {
    return { ok: false, errors: [{ path: 'id', code: 'UNKNOWN_COMMENT', message: 'comment not found' }] };
  }
  if (body === undefined && status === undefined) {
    return { ok: false, errors: [{ path: '', code: 'NO_CHANGES', message: 'at least one of body or status must be provided' }] };
  }
  if (body !== undefined && !isNonEmptyString(body)) {
    return { ok: false, errors: [{ path: 'body', code: 'INVALID_COMMENT_BODY', message: 'comment body must not be empty' }] };
  }
  if (status !== undefined && !COMMENT_STATUSES.includes(status)) {
    return { ok: false, errors: [{ path: 'status', code: 'INVALID_STATUS', message: `status must be one of ${COMMENT_STATUSES.join(', ')}` }] };
  }
  const previous = story.comments[index];
  const next = {
    ...previous,
    body: body === undefined ? previous.body : body,
    status: status === undefined ? previous.status : status,
    updatedAt: now,
  };
  if (next.body === previous.body && next.status === previous.status) {
    return { ok: true, changed: false, story };
  }
  const comments = [...story.comments];
  comments[index] = next;
  return { ok: true, changed: true, story: canonicalStory({ ...story, revision: story.revision + 1, comments }) };
}

export function createRound({ story, now = new Date().toISOString() }) {
  const round = {
    id: `round-${randomUUID()}`,
    baseRevision: story.revision,
    createdAt: now,
    projectId: story.projectId,
    kind: story.kind,
    rootId: story.rootId,
    nodes: story.nodes.map(canonicalNode),
    comments: story.comments.filter((comment) => comment.status === 'open').map(canonicalComment),
    assets: story.assets.map(canonicalAsset),
  };
  return { ok: true, changed: false, round, story: canonicalStory({ ...story, rounds: [...story.rounds, round] }) };
}

function validateProposalInput({ story, proposal }) {
  const validator = new Validator();
  if (!isPlainObject(proposal)) {
    return { ok: false, errors: [{ path: '', code: 'INVALID_TYPE', message: 'proposal must be an object' }] };
  }
  const unknown = unknownKeys(proposal, PROPOSAL_INPUT_KEYS);
  if (unknown.length > 0) {
    validator.push('', 'UNKNOWN_FIELD', `proposal has unknown fields: ${unknown.join(', ')}`);
  }
  if (proposal.schemaVersion !== SCHEMA_VERSION) {
    validator.push('schemaVersion', 'UNSUPPORTED_SCHEMA', `schemaVersion must be ${SCHEMA_VERSION}`);
  }
  const round = story.rounds.find((entry) => entry.id === proposal.roundId);
  if (!round) {
    validator.push('roundId', 'UNKNOWN_ROUND', 'proposal must reference an existing round');
    return { ok: false, errors: validator.errors };
  }
  if (!isPositiveInteger(proposal.baseRevision) || proposal.baseRevision !== round.baseRevision) {
    validator.push('baseRevision', 'PROPOSAL_STALE', 'proposal baseRevision must equal the round snapshot revision');
  } else if (round.baseRevision !== story.revision) {
    validator.push('baseRevision', 'PROPOSAL_STALE', 'the story changed after this round was frozen; redo the proposal for a new round');
  }
  if (!validator.ok) return { ok: false, errors: validator.errors };

  if (!Array.isArray(proposal.nodes)) {
    return { ok: false, errors: [{ path: 'nodes', code: 'INVALID_TYPE', message: 'nodes must be an array' }] };
  }
  const assetIds = new Set(story.assets.map((asset) => asset.id));
  const probe = { ...story, nodes: proposal.nodes.map(stripServerFields) };
  const validated = validateStory(probe);
  if (!validated.ok) return { ok: false, errors: validated.errors };
  if (!Array.isArray(proposal.addressedCommentIds)) {
    return { ok: false, errors: [{ path: 'addressedCommentIds', code: 'INVALID_TYPE', message: 'addressedCommentIds must be an array' }] };
  }
  if (!isString(proposal.summary)) {
    return { ok: false, errors: [{ path: 'summary', code: 'INVALID_TYPE', message: 'summary must be a string' }] };
  }
  const openIds = new Set(round.comments.filter((comment) => comment.status === 'open').map((comment) => comment.id));
  const addressed = [];
  proposal.addressedCommentIds.forEach((commentId, index) => {
    if (!openIds.has(commentId)) {
      validator.push(`addressedCommentIds[${index}]`, 'UNKNOWN_COMMENT', 'addressed comment must be open in this round');
      return;
    }
    if (addressed.includes(commentId)) {
      validator.push(`addressedCommentIds[${index}]`, 'DUPLICATE_ID', 'addressed comment listed twice');
      return;
    }
    addressed.push(commentId);
  });
  if (!validator.ok) return { ok: false, errors: validator.errors };
  if (proposal.nodes.some((node) => isPlainObject(node) && node.revision !== undefined && !isPositiveInteger(node.revision))) {
    return { ok: false, errors: [{ path: 'nodes', code: 'INVALID_TYPE', message: 'node revision must be an integer >= 1 when present' }] };
  }
  return { ok: true, errors: [], round, addressed, assetIds };
}

export function importProposal({ story, proposal, now = new Date().toISOString() }) {
  const validation = validateProposalInput({ story, proposal });
  if (!validation.ok) return { ok: false, errors: validation.errors, stale: isStale(story, proposal) };
  const stored = {
    id: `prop-${randomUUID()}`,
    roundId: proposal.roundId,
    baseRevision: proposal.baseRevision,
    nodes: proposal.nodes.map((node) => ({ ...stripServerFields(node), revision: node.revision })),
    addressedCommentIds: validation.addressed,
    summary: proposal.summary,
    createdAt: now,
    status: 'pending',
  };
  return {
    ok: true,
    changed: false,
    proposal: stored,
    story: canonicalStory({ ...story, proposals: [...story.proposals, stored] }),
  };
}

function isStale(story, proposal) {
  if (!isPlainObject(proposal)) return false;
  const round = story.rounds.find((entry) => entry.id === proposal.roundId);
  if (!round) return false;
  return proposal.baseRevision !== round.baseRevision || round.baseRevision !== story.revision;
}

export function proposalIsStale({ story, proposal }) {
  const round = story.rounds.find((entry) => entry.id === proposal.roundId);
  if (!round) return true;
  return proposal.baseRevision !== story.revision || round.baseRevision !== story.revision;
}

export function decideProposal({ story, proposalId, decision, now = new Date().toISOString() }) {
  const index = story.proposals.findIndex((proposal) => proposal.id === proposalId);
  if (index === -1) {
    return { ok: false, errors: [{ path: 'id', code: 'UNKNOWN_PROPOSAL', message: 'proposal not found' }] };
  }
  const proposal = story.proposals[index];
  if (!PROPOSAL_DECISIONS.includes(decision)) {
    return { ok: false, errors: [{ path: 'decision', code: 'INVALID_DECISION', message: 'decision must be accept or reject' }] };
  }
  if (proposal.status !== 'pending') {
    return { ok: false, errors: [{ path: 'id', code: 'PROPOSAL_DECIDED', message: `proposal is already ${proposal.status}` }] };
  }
  if (decision === 'reject') {
    const proposals = [...story.proposals];
    proposals[index] = { ...proposal, status: 'rejected' };
    return { ok: true, changed: false, story: canonicalStory({ ...story, proposals }) };
  }
  if (proposalIsStale({ story, proposal })) {
    return {
      ok: false,
      errors: [{ path: 'baseRevision', code: 'PROPOSAL_STALE', message: 'proposal is stale against the current revision' }],
      stale: true,
    };
  }
  const applied = applyTreeUpdate({ story, nodes: proposal.nodes });
  if (!applied.ok) return { ok: false, errors: applied.errors };
  const resolved = new Set(proposal.addressedCommentIds);
  const newlyResolved = new Set(
    applied.story.comments.filter((comment) => resolved.has(comment.id) && comment.status === 'open').map((comment) => comment.id),
  );
  const comments = applied.story.comments.map((comment) =>
    newlyResolved.has(comment.id) ? { ...comment, status: 'resolved', updatedAt: now } : comment,
  );
  const proposals = applied.story.proposals.map((entry) =>
    entry.id === proposal.id ? { ...entry, status: 'accepted' } : entry,
  );
  const baseRevision = applied.story.revision;
  return {
    ok: true,
    changed: applied.changed !== false || newlyResolved.size > 0,
    story: canonicalStory({
      ...applied.story,
      revision: baseRevision + (newlyResolved.size > 0 ? 1 : 0),
      comments,
      proposals,
    }),
  };
}

export function proposalComparison({ round, proposal }) {
  const before = new Map((round?.nodes ?? []).map((node) => [node.id, canonicalNode(node)]));
  const after = new Map(proposal.nodes.map((node) => [node.id, canonicalNode({ ...node, revision: node.revision ?? 1 })]));
  const changes = [];
  for (const [id, node] of after) {
    const previous = before.get(id);
    if (!previous) {
      changes.push({ nodeId: id, change: 'added', title: node.title });
      continue;
    }
    const fields = [];
    if (previous.title !== node.title) fields.push('title');
    if (previous.parentId !== node.parentId) fields.push('parentId');
    if (previous.position !== node.position) fields.push('position');
    if (JSON.stringify(previous.blocks) !== JSON.stringify(node.blocks)) fields.push('blocks');
    if (JSON.stringify(previous.sources) !== JSON.stringify(node.sources)) fields.push('sources');
    if (fields.length > 0) changes.push({ nodeId: id, change: 'changed', fields, title: node.title });
  }
  for (const [id, node] of before) {
    if (!after.has(id)) changes.push({ nodeId: id, change: 'removed', title: node.title });
  }
  return {
    changes,
    addressedCommentIds: proposal.addressedCommentIds,
    stale: false,
  };
}


export function detectAssetMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  const ascii = buffer.subarray(0, 16).toString('binary');
  if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) return 'image/gif';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  const head = buffer.subarray(0, 512).toString('utf8').trimStart();
  if (/^(?:<\?xml[^>]*\?>\s*)?<svg[\s>]/iu.test(head)) return 'image/svg+xml';
  return null;
}

export function sanitizeFilename(filename) {
  if (!isString(filename)) return 'upload';
  const base = filename.split(/[\\/]/u).pop() ?? 'upload';
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/gu, '').trim();
  return cleaned === '' ? 'upload' : cleaned.slice(0, 200);
}


