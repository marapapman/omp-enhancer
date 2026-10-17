// Deterministic export of one confirmed story revision.
//
// renderStoryMarkdown() walks the tree depth-first by sibling position and
// keeps every node's identity, content, sources, and media paths recoverable
// from the Markdown alone. Nothing here writes files; server.js stages the
// returned contents into the export directory.

import { SCHEMA_VERSION, canonicalNode } from './model.js';

const MAX_HEADING_LEVEL = 6;

function snapshotNode(node) {
  return canonicalNode({ ...node, revision: node.revision ?? 1 });
}

export function exportStoryJson(snapshot) {
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: snapshot.projectId,
    kind: snapshot.kind,
    revision: snapshot.revision,
    rootId: snapshot.rootId,
    nodes: snapshot.nodes.map(snapshotNode),
    assets: snapshot.assets.map((asset) => ({
      id: asset.id,
      filename: asset.filename,
      mime: asset.mime,
      size: asset.size,
      storedName: asset.storedName,
    })),
  };
}

export function escapeTableCell(value) {
  return String(value)
    .replace(/\r\n?|\n/gu, '<br>')
    .replace(/\|/gu, '\\|');
}

function collapseWhitespace(value) {
  return String(value).replace(/\s+/gu, ' ').trim();
}

function headingFor(node, depth) {
  const level = Math.min(depth, MAX_HEADING_LEVEL);
  const title = collapseWhitespace(node.title);
  return `${'#'.repeat(level)} ${title === '' ? '(untitled)' : title}`;
}

function nodeMetadataLine(node, depth) {
  const parts = [
    `id=${node.id}`,
    `parentId=${node.parentId ?? 'null'}`,
    `kind=${node.kind}`,
    `revision=${node.revision ?? 1}`,
  ];
  if (depth > MAX_HEADING_LEVEL) {
    parts.push(`headingLevel=${MAX_HEADING_LEVEL}`, `depth=${depth}`);
  }
  return `<!-- node ${parts.join(' ')} -->`;
}

function renderTableBlock(block) {
  const lines = [
    `| ${block.columns.map(escapeTableCell).join(' | ')} |`,
    `| ${block.columns.map(() => '---').join(' | ')} |`,
  ];
  for (const row of block.rows) {
    lines.push(`| ${row.map(escapeTableCell).join(' | ')} |`);
  }
  const caption = collapseWhitespace(block.caption);
  if (caption !== '') lines.push('', `*${caption}*`);
  return lines.join('\n');
}

// Asset files stay in .storyline/assets; a snapshot at
// .storyline/exports/r<revision>/ reaches them through ../../assets.
function assetRelativePath(storedName) {
  return `../../assets/${storedName}`;
}

function renderImageBlock(block, storedNameFor) {
  const alt = collapseWhitespace(block.alt);
  const lines = [
    `![${alt}](${assetRelativePath(storedNameFor(block.assetId))})`,
    '',
    `<!-- image role=${block.role} assetId=${block.assetId} -->`,
  ];
  const caption = collapseWhitespace(block.caption);
  if (caption !== '') lines.push('', `*${caption}*`);
  return lines.join('\n');
}

function renderMathBlock(block) {
  if (block.display) return `$$\n${block.latex}\n$$`;
  return `$${block.latex}$`;
}

function renderBlock(block, storedNameFor) {
  switch (block.type) {
    case 'markdown':
      return block.text;
    case 'table':
      return renderTableBlock(block);
    case 'image':
      return renderImageBlock(block, storedNameFor);
    default:
      return renderMathBlock(block);
  }
}

function renderSources(sources) {
  const usable = sources.filter(
    (source) => source && (source.url !== '' || collapseWhitespace(source.label ?? '') !== ''),
  );
  if (usable.length === 0) return null;
  const lines = ['**Sources**'];
  for (const source of usable) {
    const label = collapseWhitespace(source.label ?? '');
    if (source.url === '') {
      lines.push(`- ${label === '' ? '(no label)' : label}`);
    } else {
      lines.push(`- [${label === '' ? source.url : label}](${source.url})`);
    }
  }
  return lines.join('\n');
}

export function renderStoryMarkdown(snapshot) {
  const names = new Map(snapshot.assets.map((asset) => [asset.id, asset.storedName]));
  const storedNameFor = (assetId) => names.get(assetId) ?? `${assetId}.bin`;
  const nodes = [...snapshot.nodes].map(snapshotNode);
  const byParent = new Map();
  for (const node of nodes) {
    const key = node.parentId ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(node);
  }
  for (const list of byParent.values()) list.sort((left, right) => left.position - right.position);

  const sections = [];
  const visit = (node, depth) => {
    const parts = [headingFor(node, depth), '', nodeMetadataLine(node, depth)];
    for (const block of node.blocks) parts.push('', renderBlock(block, storedNameFor));
    const sources = renderSources(node.sources ?? []);
    if (sources) parts.push('', sources);
    sections.push(parts.join('\n').trimEnd());
    for (const child of byParent.get(node.id) ?? []) visit(child, depth + 1);
  };

  const root = nodes.find((node) => node.id === snapshot.rootId);
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (root) visit(root, 1);
  for (const node of nodes) {
    if (node.id === root?.id) continue;
    if (node.parentId === null || !nodeIds.has(node.parentId)) visit(node, 1);
  }
  return `${sections.join('\n\n')}\n`;
}

export function buildFeedbackJson(snapshot, { generatedAt }) {
  const revisions = new Map(snapshot.nodes.map((node) => [node.id, node.revision ?? 1]));
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: snapshot.projectId,
    revision: snapshot.revision,
    generatedAt,
    comments: snapshot.comments.map((comment) => ({
      id: comment.id,
      nodeId: comment.nodeId,
      nodeRevision: comment.nodeRevision,
      body: comment.body,
      status: comment.status,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      nodeMissing: !revisions.has(comment.nodeId),
      writtenAgainstCurrentRevision: revisions.get(comment.nodeId) === comment.nodeRevision,
    })),
  };
}

export function buildExportFiles(snapshot, { generatedAt }) {
  return {
    'story.json': `${JSON.stringify(exportStoryJson(snapshot), null, 2)}\n`,
    'storyline.md': renderStoryMarkdown(snapshot),
    'feedback.json': `${JSON.stringify(buildFeedbackJson(snapshot, { generatedAt }), null, 2)}\n`,
  };
}
