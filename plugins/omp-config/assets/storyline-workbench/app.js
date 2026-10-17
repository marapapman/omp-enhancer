// Storyline workbench client.
//
// The page never holds server state beyond the story it fetches: every write
// sends the whole candidate tree with an expected revision, and a 409 keeps
// the local draft until the user decides how to reconcile it.

import { copy } from './copy.zh.js';
import '/vendor/markdown-it/markdown-it.min.js';
import '/vendor/katex/katex.min.js';

const TOKEN_KEY = `storyline-workbench:${location.origin}`;
const NODE_KINDS = ['topic', 'claim', 'evidence'];
const BLOCK_TYPES = ['markdown', 'table', 'image', 'math'];

const state = {
  token: null,
  story: null,
  selectedId: null,
  draft: null,
  dirty: false,
  conflict: null,
  tab: 'tree',
  collapsed: new Set(),
  commentDraft: '',
  editingCommentId: null,
  editingCommentBody: '',
  expandedProposals: new Set(),
  busy: false,
  assetUrls: new Map(),
  pendingImageUpload: null,
};

function t(key, params = {}) {
  const template = copy[key] ?? key;
  return String(template).replace(/\{(\w+)\}/gu, (match, name) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'on') {
      for (const [event, handler] of Object.entries(value)) node.addEventListener(event, handler);
    } else if (key === 'attrs') {
      for (const [name, attribute] of Object.entries(value)) {
        if (attribute === false || attribute === null || attribute === undefined) continue;
        node.setAttribute(name, attribute === true ? '' : String(attribute));
      }
    } else if (key === 'children') {
      for (const child of [].concat(value)) {
        if (child !== null && child !== undefined && child !== false) node.append(child);
      }
    } else node[key] = value;
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

function newId() {
  return crypto.randomUUID();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

/* ------------------------------------------------------------------ */
/* Markdown and math preview                                           */
/* ------------------------------------------------------------------ */

const MarkdownIt = globalThis.markdownit;
const katex = globalThis.katex;

function createMarkdown() {
  const md = new MarkdownIt({ html: false, linkify: false, breaks: false, typographer: false });
  md.validateLink = (url) => /^https?:\/\//iu.test(url) || /^#[A-Za-z0-9_.:-]{1,64}$/u.test(url);
  md.renderer.rules.image = (tokens, idx) => escapeHtml(tokens[idx].content ?? '');
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    tokens[idx].attrSet('rel', 'noopener noreferrer');
    tokens[idx].attrSet('target', '_blank');
    return self.renderToken(tokens, idx, options);
  };
  md.inline.ruler.after('escape', 'math_inline', mathInlineRule);
  md.block.ruler.after('fence', 'math_block', mathBlockRule, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.renderer.rules.math_inline = (tokens, idx) => renderMath(tokens[idx].content, false);
  md.renderer.rules.math_block = (tokens, idx) => `${renderMath(tokens[idx].content, true)}\n`;
  return md;
}

function mathInlineRule(markdownState, silent) {
  const start = markdownState.pos;
  const source = markdownState.src;
  if (source[start] !== '$' || source[start + 1] === '$') return false;
  const match = /^\$((?:\\\$|[^$\n])+?)\$/u.exec(source.slice(start));
  if (!match) return false;
  const content = match[1];
  if (content === '' || /^\s/u.test(content) || /\s$/u.test(content)) return false;
  if (!silent) {
    const token = markdownState.push('math_inline', 'math', 0);
    token.content = content;
  }
  markdownState.pos = start + match[0].length;
  return true;
}

function mathBlockRule(markdownState, startLine, endLine, silent) {
  const start = markdownState.bMarks[startLine] + markdownState.tShift[startLine];
  const max = markdownState.eMarks[startLine];
  if (markdownState.src.slice(start, start + 2) !== '$$') return false;
  if (silent) return true;
  const firstLine = markdownState.src.slice(start + 2, max);
  const inlineClose = firstLine.indexOf('$$');
  let content;
  let nextLine;
  if (inlineClose !== -1) {
    content = firstLine.slice(0, inlineClose);
    nextLine = startLine + 1;
  } else {
    const lines = [firstLine];
    let line = startLine + 1;
    let closed = false;
    for (; line < endLine; line += 1) {
      const lineStart = markdownState.bMarks[line] + markdownState.tShift[line];
      const lineEnd = markdownState.eMarks[line];
      const text = markdownState.src.slice(lineStart, lineEnd);
      const index = text.indexOf('$$');
      if (index !== -1) {
        lines.push(text.slice(0, index));
        closed = true;
        break;
      }
      lines.push(text);
    }
    if (!closed) return false;
    content = lines.join('\n');
    nextLine = line + 1;
  }
  const token = markdownState.push('math_block', 'math', 0);
  token.content = content.trim();
  token.block = true;
  token.map = [startLine, nextLine];
  markdownState.line = nextLine;
  return true;
}

function renderMath(latex, display) {
  const source = String(latex ?? '');
  try {
    const html = katex.renderToString(source, {
      displayMode: display,
      throwOnError: false,
      trust: false,
      strict: 'ignore',
      output: 'html',
    });
    if (html.includes('katex-error')) return mathError(source, html);
    return `<span class="math-block">${html}</span>`;
  } catch (error) {
    return mathError(source, '');
  }
}

function mathError(source, html) {
  return `<span class="math-error">${escapeHtml(t('mathErrorLabel'))}<br><code>${escapeHtml(source)}</code></span>${html}`;
}

const markdown = createMarkdown();

function renderMarkdown(text) {
  try {
    return markdown.render(String(text ?? ''));
  } catch (error) {
    return `<p class="math-error">${escapeHtml(`${t('previewFailedLabel')} ${error.message}`)}</p>`;
  }
}

/* ------------------------------------------------------------------ */
/* Token and API                                                       */
/* ------------------------------------------------------------------ */

function readToken() {
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
  const fromHash = new URLSearchParams(hash).get('token');
  if (fromHash) {
    sessionStorage.setItem(TOKEN_KEY, fromHash);
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    return fromHash;
  }
  return sessionStorage.getItem(TOKEN_KEY);
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { Authorization: `Bearer ${state.token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await response.text();
  let payload = null;
  if (text !== '') {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? `HTTP ${response.status}`);
    error.code = payload?.error?.code ?? 'REQUEST_FAILED';
    error.status = response.status;
    error.revision = payload?.revision;
    throw error;
  }
  return payload;
}

async function uploadAsset(file) {
  const target = `/api/assets?filename=${encodeURIComponent(file.name ?? 'upload')}`;
  const response = await fetch(target, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${state.token}`,
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
    cache: 'no-store',
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text === '' ? null : JSON.parse(text);
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = new Error(payload?.error?.message ?? `HTTP ${response.status}`);
    error.code = payload?.error?.code ?? 'UPLOAD_FAILED';
    error.status = response.status;
    throw error;
  }
  return payload;
}

/* ------------------------------------------------------------------ */
/* Status, notice, dialog                                              */
/* ------------------------------------------------------------------ */

function setStatus(message, tone = 'info') {
  const line = document.getElementById('status-line');
  line.textContent = message ?? '';
  line.dataset.tone = tone;
}

function showNotice({ title, rows = [], pre = null, actions = [] }) {
  const container = document.getElementById('notice');
  container.replaceChildren();
  container.hidden = false;
  container.append(el('strong', { text: title }));
  if (rows.length > 0) {
    const dl = el('dl');
    for (const [label, value] of rows) {
      dl.append(el('dt', { text: label }), el('dd', { text: value }));
    }
    container.append(dl);
  }
  if (pre) container.append(el('pre', { text: pre }));
  if (actions.length > 0) {
    const bar = el('div', { class: 'dialog-actions' });
    for (const action of actions) bar.append(action);
    container.append(bar);
  }
}

function clearNotice() {
  const container = document.getElementById('notice');
  container.hidden = true;
  container.replaceChildren();
}

function showDialog(message, buttons) {
  const dialog = document.getElementById('confirm-dialog');
  const actions = document.getElementById('confirm-actions');
  document.getElementById('confirm-message').textContent = message;
  actions.replaceChildren();
  return new Promise((resolve) => {
    for (const button of buttons) {
      actions.append(
        el('button', {
          type: 'button',
          class: button.primary ? 'button button-primary' : 'button',
          text: button.label,
          on: {
            click: () => {
              dialog.close();
              resolve(button.value);
            },
          },
        }),
      );
    }
    dialog.addEventListener('close', () => resolve(null), { once: true });
    dialog.showModal();
  });
}

/* ------------------------------------------------------------------ */
/* Tree helpers                                                        */
/* ------------------------------------------------------------------ */

function nodesOf() {
  return state.story?.nodes ?? [];
}

function childrenOf(parentId) {
  return nodesOf()
    .filter((node) => node.parentId === parentId)
    .sort((left, right) => left.position - right.position);
}

function nodesById() {
  return new Map(nodesOf().map((node) => [node.id, node]));
}

function ancestorsOf(nodeId) {
  const byId = nodesById();
  const chain = [];
  let current = byId.get(nodeId);
  while (current) {
    chain.unshift(current);
    current = current.parentId === null ? null : byId.get(current.parentId);
  }
  return chain;
}

function nodeRevisionCurrent(nodeId) {
  return nodesById().get(nodeId)?.revision ?? null;
}

function unresolvedCount(nodeId) {
  return (state.story?.comments ?? []).filter((comment) => comment.nodeId === nodeId && comment.status === 'open').length;
}

function laneLabel(kind) {
  if (kind === 'claim') return t('typeClaim');
  if (kind === 'evidence') return t('typeEvidence');
  return t('typeTopic');
}

function displayTitle(node) {
  const title = String(node.title ?? '').trim();
  return title === '' ? laneLabel(node.kind) : title;
}

function subtreeIds(nodeId) {
  const ids = [nodeId];
  const byId = nodesById();
  const walk = (id) => {
    for (const node of nodesOf().filter((entry) => entry.parentId === id)) {
      ids.push(node.id);
      walk(node.id);
    }
  };
  walk(nodeId);
  return { ids, count: ids.length - 1, exists: byId.has(nodeId) };
}

function claimHasEvidence(nodeId) {
  return nodesOf().some((node) => node.parentId === nodeId && node.kind === 'evidence');
}

/* ------------------------------------------------------------------ */
/* Draft handling                                                      */
/* ------------------------------------------------------------------ */

function snapshotDraft(node) {
  return {
    nodeId: node.id,
    title: node.title,
    blocks: structuredClone(node.blocks),
    sources: structuredClone(node.sources),
  };
}

function serializeNode(node) {
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

function candidateTree() {
  const nodes = nodesOf().map((node) => {
    if (state.draft && state.draft.nodeId === node.id) {
      return serializeNode({ ...node, title: state.draft.title, blocks: state.draft.blocks, sources: state.draft.sources });
    }
    return serializeNode(node);
  });
  return nodes;
}

function markDirty(dirty = true) {
  state.dirty = dirty;
  const badge = document.getElementById('dirty-badge');
  badge.hidden = !dirty;
  badge.textContent = t('unsavedBadge');
  document.getElementById('revision-label').textContent = t('revisionLabel', { revision: state.story?.revision ?? 0 });
}

function applyStory(story) {
  state.story = story;
  state.conflict = null;
  markDirty(state.dirty);
  document.getElementById('revision-label').textContent = t('revisionLabel', { revision: story.revision });
  if (state.selectedId && !nodesById().has(state.selectedId)) {
    state.selectedId = story.rootId;
    state.draft = null;
    state.dirty = false;
  }
  if (!state.selectedId) state.selectedId = story.rootId;
  if (!state.draft || state.draft.nodeId !== state.selectedId) {
    const node = nodesById().get(state.selectedId);
    state.draft = node ? snapshotDraft(node) : null;
  }
  render();
}

function currentDraftNode() {
  if (!state.draft) return null;
  const node = nodesById().get(state.draft.nodeId);
  if (!node) return null;
  return serializeNode({ ...node, title: state.draft.title, blocks: state.draft.blocks, sources: state.draft.sources });
}

function draftProblem() {
  if (!state.draft) return null;
  const assetIds = new Set(state.story.assets.map((asset) => asset.id));
  for (const block of state.draft.blocks) {
    if (block.type === 'image' && !assetIds.has(block.assetId)) return t('imageMissingWarning');
  }
  return null;
}

async function commitDraft({ silent = false } = {}) {
  if (!state.dirty || !state.draft) return true;
  const problem = draftProblem();
  if (problem) {
    setStatus(problem, 'error');
    return false;
  }
  setStatus(t('savingLabel'));
  try {
    const result = await api('/api/tree', {
      method: 'PUT',
      body: { expectedRevision: state.story.revision, nodes: candidateTree() },
    });
    state.dirty = false;
    applyStory(result.story);
    if (!silent) setStatus(t('savedLabel'), 'ok');
    return true;
  } catch (error) {
    if (error.status === 409) {
      state.conflict = { revision: error.revision ?? null, message: error.message };
      setStatus(t('conflictTitle'), 'error');
      render();
      return false;
    }
    setStatus(`${t('saveFailedLabel')} ${error.message}`, 'error');
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

const renderers = {};

function render() {
  const story = state.story;
  document.title = t('appTitle');
  document.getElementById('app-title').textContent = t('appTitle');
  document.getElementById('kind-label').textContent = story.kind === 'slides' ? t('kindSlides') : t('kindArticle');
  document.getElementById('revision-label').textContent = t('revisionLabel', { revision: story.revision });
  document.getElementById('tree-heading').textContent = t('treePanelTitle');
  document.getElementById('detail-heading').textContent = t('detailPanelTitle');
  document.getElementById('tab-tree').textContent = t('tabTree');
  document.getElementById('tab-detail').textContent = t('tabDetail');
  document.getElementById('expand-all').textContent = t('expandAllButton');
  document.getElementById('collapse-all').textContent = t('collapseAllButton');
  document.getElementById('submit-round').textContent = t('submitRoundButton');
  document.getElementById('export-story').textContent = t('exportButton');
  document.getElementById('comments-heading').textContent = t('commentsSectionTitle');
  document.getElementById('proposals-heading').textContent = t('proposalsSectionTitle');
  document.getElementById('orphan-comments-heading').textContent = t('commentsSectionTitle');
  const dirtyBadge = document.getElementById('dirty-badge');
  dirtyBadge.textContent = t('unsavedBadge');
  dirtyBadge.hidden = !state.dirty;
  document.getElementById('layout').dataset.tab = state.tab;
  document.getElementById('tab-tree').setAttribute('aria-pressed', String(state.tab === 'tree'));
  document.getElementById('tab-detail').setAttribute('aria-pressed', String(state.tab === 'detail'));
  renderers.tree();
  renderers.breadcrumb();
  renderers.conflict();
  renderers.editor();
  renderers.comments();
  renderers.proposals();
  renderers.orphanComments();
  renderers.assetUrls();
}

function renderTree() {
  const container = document.getElementById('tree');
  container.replaceChildren();
  const byId = nodesById();
  const root = byId.get(state.story.rootId);
  const hasChildren = (id) => childrenOf(id).length > 0;

  const buildRow = (node) => {
    const item = el('li', { role: 'treeitem' });
    const row = el('div', {
      class: 'tree-row',
      dataset: {
        selected: String(state.selectedId === node.id),
        draft: String(state.dirty && state.draft?.nodeId === node.id),
      },
    });
    const kids = childrenOf(node.id);
    const collapsed = state.collapsed.has(node.id);
    if (kids.length > 0) {
      row.append(
        el('button', {
          type: 'button',
          class: 'tree-toggle',
          text: collapsed ? '▸' : '▾',
          attrs: {
            'aria-expanded': String(!collapsed),
            'aria-label': t('collapseToggleAria', { title: displayTitle(node) }),
          },
          on: { click: () => renderers.toggleCollapse(node.id) },
        }),
      );
    } else {
      row.append(el('span', { class: 'tree-toggle', attrs: { 'aria-hidden': 'true' } }));
    }
    row.append(
      el('button', {
        type: 'button',
        class: 'tree-select',
        on: { click: () => void selectNode(node.id) },
        children: [
          el('span', { class: 'tree-kind', text: laneLabel(node.kind) }),
          el('span', { class: 'tree-title', text: displayTitle(node) }),
        ],
      }),
    );
    const unresolved = unresolvedCount(node.id);
    if (unresolved > 0) {
      row.append(el('span', { class: 'tree-badge', text: t('unresolvedCommentsBadge', { count: unresolved }) }));
    }
    if (node.kind === 'claim' && !claimHasEvidence(node.id)) {
      row.append(el('span', { class: 'tree-warn', text: t('missingEvidenceHint') }));
    }
    item.append(row);
    if (kids.length > 0 && !collapsed) {
      const list = el('ul', { role: 'group' });
      for (const child of kids) list.append(buildRow(child));
      item.append(list);
    }
    return item;
  };

  const list = el('ul', { role: 'group' });
  if (root) list.append(buildRow(root));
  container.append(list);

  const hint = document.getElementById('tree-hint');
  hint.textContent = nodesOf().length === 1 ? t('emptyTreeHint') : '';
  renderers.toolbar();
}

function renderToolbar() {
  const bar = document.getElementById('tree-toolbar');
  bar.replaceChildren();
  const node = nodesById().get(state.selectedId);
  if (!node) return;
  const guard = (action) => async () => {
    if (state.busy) return;
    state.busy = true;
    try {
      await action();
    } finally {
      state.busy = false;
    }
  };

  if (node.kind === 'topic') {
    bar.append(el('button', { type: 'button', class: 'button button-small', text: t('addClaimButton'), on: { click: guard(() => addNode('claim', node.id)) } }));
  }
  if (node.kind === 'claim') {
    bar.append(
      el('button', { type: 'button', class: 'button button-small', text: t('addChildClaimButton'), on: { click: guard(() => addNode('claim', node.id)) } }),
      el('button', { type: 'button', class: 'button button-small', text: t('addEvidenceButton'), on: { click: guard(() => addNode('evidence', node.id)) } }),
    );
  }
  const siblings = childrenOf(node.parentId);
  const index = siblings.findIndex((entry) => entry.id === node.id);
  if (index > 0) {
    bar.append(el('button', { type: 'button', class: 'button button-small', text: t('moveUpButton'), on: { click: guard(() => moveNode(node.id, -1)) } }));
  }
  if (index !== -1 && index < siblings.length - 1) {
    bar.append(el('button', { type: 'button', class: 'button button-small', text: t('moveDownButton'), on: { click: guard(() => moveNode(node.id, 1)) } }));
  }
  if (node.id !== state.story.rootId) {
    const options = nodesOf().filter((candidate) => candidate.id !== node.id && candidate.kind !== 'evidence' && !subtreeIds(node.id).ids.includes(candidate.id));
    if (options.length > 0) {
      const select = el('select', { attrs: { 'aria-label': t('reparentLabel') } });
      for (const option of options) {
        select.append(el('option', { value: option.id, text: `${laneLabel(option.kind)} · ${displayTitle(option)}` }));
      }
      bar.append(select);
      bar.append(
        el('button', {
          type: 'button',
          class: 'button button-small',
          text: t('reparentButton'),
          on: { click: guard(() => reparentNode(node.id, select.value)) },
        }),
      );
    }
    bar.append(el('button', { type: 'button', class: 'button button-small button-danger', text: t('deleteNodeButton'), on: { click: guard(() => deleteNode(node.id)) } }));
  }
}

function renderBreadcrumb() {
  const container = document.getElementById('breadcrumb');
  container.replaceChildren();
  for (const [index, node] of ancestorsOf(state.selectedId).entries()) {
    if (index > 0) container.append(el('span', { text: '/' }));
    if (index === ancestorsOf(state.selectedId).length - 1) {
      container.append(el('span', { text: `${livingPrefix(index)}${displayTitle(node)}` }));
      continue;
    }
    container.append(el('button', { type: 'button', text: displayTitle(node), on: { click: () => void selectNode(node.id) } }));
  }
}

function livingPrefix(index) {
  return index === 0 ? `${t('breadcrumbRootLabel')} ` : '';
}

function renderConflict() {
  const banner = document.getElementById('conflict-banner');
  banner.replaceChildren();
  if (!state.conflict) {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  banner.append(el('strong', { text: t('conflictTitle') }));
  banner.append(el('p', { text: t('conflictNotice', { revision: state.conflict.revision ?? '?' }) }));
  const actions = el('div', { class: 'dialog-actions' });
  actions.append(
    el('button', { type: 'button', class: 'button button-primary', text: t('reapplyButton'), on: { click: () => void reapplyDraft() } }),
    el('button', { type: 'button', class: 'button', text: t('discardDraftButton'), on: { click: () => void discardDraft() } }),
  );
  banner.append(actions);
}

function renderEditor() {
  const container = document.getElementById('node-editor');
  container.replaceChildren();
  const node = nodesById().get(state.selectedId);
  if (!node || !state.draft) {
    container.append(el('p', { class: 'hint', text: t('loadingLabel') }));
    return;
  }
  const draft = state.draft;

  const titleInput = el('input', {
    type: 'text',
    id: 'node-title',
    value: draft.title,
    attrs: { placeholder: t('titlePlaceholder') },
    on: {
      input: (event) => {
        draft.title = event.target.value;
        markDirty(true);
        updateTitleHint();
      },
    },
  });
  const titleHint = el('p', { class: 'hint', text: draft.title.trim() === '' ? t('emptyTitleHint') : '' });
  function updateTitleHint() {
    titleHint.textContent = draft.title.trim() === '' ? t('emptyTitleHint') : '';
  }
  container.append(el('div', { class: 'field' }, [el('label', { class: 'field-label', for: 'node-title', text: t('titleLabel') }), titleInput, titleHint]));

  const addRow = el('div', { class: 'dialog-actions' });
  for (const [type, label] of [
    ['markdown', t('addBlockMarkdown')],
    ['table', t('addBlockTable')],
    ['image', t('addBlockImage')],
    ['math', t('addBlockMath')],
  ]) {
    addRow.append(el('button', { type: 'button', class: 'button button-small', text: label, on: { click: () => addBlock(type) } }));
  }
  container.append(el('div', { class: 'field' }, [el('h4', { text: t('blocksSectionTitle') }), addRow]));

  const blocks = el('div', { class: 'blocks' });
  if (draft.blocks.length === 0) blocks.append(el('p', { class: 'hint', text: t('emptyBlocksHint') }));
  draft.blocks.forEach((block, index) => blocks.append(blockEditor(block, index)));
  container.append(blocks);

  container.append(renderSources(draft));

  const saveRow = el('div', { class: 'dialog-actions' });
  saveRow.append(el('button', { type: 'button', class: 'button button-primary', text: t('saveButton'), on: { click: () => void commitDraft() } }));
  container.append(saveRow);
}

function blockEditor(block, index) {
  const typeLabel = {
    markdown: t('blockTypeMarkdown'),
    table: t('blockTypeTable'),
    image: t('blockTypeImage'),
    math: t('blockTypeMath'),
  }[block.type];
  const actions = el('div', { class: 'block-actions' });
  actions.append(
    el('button', {
      type: 'button',
      class: 'button button-small',
      text: '↑',
      attrs: { 'aria-label': t('blockMoveUp', { type: typeLabel }), disabled: index === 0 },
      on: { click: () => moveBlock(index, -1) },
    }),
    el('button', {
      type: 'button',
      class: 'button button-small',
      text: '↓',
      attrs: { 'aria-label': t('blockMoveDown', { type: typeLabel }), disabled: index === state.draft.blocks.length - 1 },
      on: { click: () => moveBlock(index, 1) },
    }),
    el('button', {
      type: 'button',
      class: 'button button-small button-danger',
      text: t('blockDelete', { type: typeLabel }),
      attrs: { 'aria-label': t('blockDelete', { type: typeLabel }) },
      on: { click: () => removeBlock(index) },
    }),
  );
  const body = el('div', { class: 'block-body' });
  if (block.type === 'markdown') body.append(markdownBlockEditor(block));
  else if (block.type === 'table') body.append(tableBlockEditor(block));
  else if (block.type === 'image') body.append(imageBlockEditor(block));
  else body.append(mathBlockEditor(block));
  return el('div', { class: 'block' }, [
    el('div', { class: 'block-head' }, [el('strong', { text: typeLabel }), actions]),
    body,
  ]);
}

function touchBlocks() {
  markDirty(true);
}

// A grid wider than its panel scrolls inside its own box; the stylesheet turns
// this flag into a visible edge hint. Recalculated on every render and resize.
function markScrollableTables() {
  for (const scroller of document.querySelectorAll('.table-editor')) {
    scroller.dataset.scrollable = scroller.scrollWidth > scroller.clientWidth ? 'true' : 'false';
  }
}

function markdownBlockEditor(block) {
  const wrap = el('div');
  const textarea = el('textarea', {
    value: block.text,
    attrs: { 'aria-label': t('markdownLabel') },
    on: {
      input: (event) => {
        block.text = event.target.value;
        touchBlocks();
        preview.innerHTML = renderMarkdown(block.text);
        preview.dataset.fallback = 'false';
      },
    },
  });
  const preview = el('div', { class: 'block-preview' });
  preview.innerHTML = renderMarkdown(block.text);
  wrap.append(el('label', { class: 'field-label', text: t('markdownLabel') }), textarea, el('span', { class: 'field-label', text: t('previewLabel') }), preview);
  return wrap;
}

function tableBlockEditor(block) {
  const wrap = el('div');
  const table = el('table');
  const headRow = el('tr');
  block.columns.forEach((column, columnIndex) => {
    const cell = el('th');
    cell.append(
      el('input', {
        type: 'text',
        value: column,
        attrs: { placeholder: t('tableColumnPlaceholder'), 'aria-label': `${t('tableColumnsLabel')} ${columnIndex + 1}` },
        on: {
          input: (event) => {
            block.columns[columnIndex] = event.target.value;
            touchBlocks();
            refreshPreview();
          },
        },
      }),
    );
    if (block.columns.length > 1) {
      cell.append(
        el('button', {
          type: 'button',
          class: 'button button-small button-danger',
          text: t('deleteColumnButton'),
          on: {
            click: () => {
              block.columns.splice(columnIndex, 1);
              for (const row of block.rows) row.splice(columnIndex, 1);
              refresh();
            },
          },
        }),
      );
    }
    headRow.append(cell);
  });
  const head = el('thead');
  head.append(headRow);
  table.append(head);

  const tbody = el('tbody');
  block.rows.forEach((row, rowIndex) => {
    const tr = el('tr');
    row.forEach((value, columnIndex) => {
      const cell = el('td');
      cell.append(
        el('input', {
          type: 'text',
          value,
          attrs: { placeholder: t('tableCellPlaceholder'), 'aria-label': `${t('tableColumnsLabel')} ${columnIndex + 1} ${rowIndex + 1}` },
          on: {
            input: (event) => {
              block.rows[rowIndex][columnIndex] = event.target.value;
              touchBlocks();
              refreshPreview();
            },
          },
        }),
      );
      tr.append(cell);
    });
    const actions = el('td', { class: 'row-actions' });
    actions.append(
      el('button', {
        type: 'button',
        class: 'button button-small button-danger',
        text: t('deleteRowButton'),
        on: {
          click: () => {
            block.rows.splice(rowIndex, 1);
            refresh();
          },
        },
      }),
    );
    tr.append(actions);
    tbody.append(tr);
  });
  table.append(tbody);

  const foot = el('div', { class: 'table-editor-foot' });
  foot.append(
    el('button', {
      type: 'button',
      class: 'button button-small',
      text: t('addColumnButton'),
      on: {
        click: () => {
          block.columns.push('');
          for (const row of block.rows) row.push('');
          refresh();
        },
      },
    }),
    el('button', {
      type: 'button',
      class: 'button button-small',
      text: t('addRowButton'),
      on: {
        click: () => {
          block.rows.push(block.columns.map(() => ''));
          refresh();
        },
      },
    }),
  );

  const caption = el('input', {
    type: 'text',
    value: block.caption,
    attrs: { placeholder: t('tableCaptionPlaceholder'), 'aria-label': t('tableCaptionLabel') },
    on: {
      input: (event) => {
        block.caption = event.target.value;
        touchBlocks();
        refreshPreview();
      },
    },
  });

  const preview = el('div', { class: 'block-preview' });
  const refreshPreview = () => {
    preview.innerHTML = renderMarkdown(tablePreviewSource(block));
    markScrollableTables();
  };
  const refresh = () => {
    touchBlocks();
    renderEditor();
  };
  refreshPreview();
  wrap.append(
    el('span', { class: 'field-label', text: t('tableColumnsLabel') }),
    el('div', { class: 'table-editor' }, [table, foot]),
    el('div', { class: 'field' }, [el('label', { class: 'field-label', text: t('tableCaptionLabel') }), caption]),
    el('span', { class: 'field-label', text: t('previewLabel') }),
    preview,
  );
  requestAnimationFrame(markScrollableTables);
  return wrap;
}

function tablePreviewSource(block) {
  const cells = (row) => `| ${row.map((value) => String(value).replace(/\|/gu, '\\|').replace(/\n/gu, '<br>')).join(' | ')} |`;
  const lines = [cells(block.columns), `| ${block.columns.map(() => '---').join(' | ')} |`];
  for (const row of block.rows) lines.push(cells(row));
  if (String(block.caption ?? '').trim() !== '') lines.push('', `*${block.caption}*`);
  return lines.join('\n');
}

function imageBlockEditor(block) {
  const wrap = el('div');
  const asset = state.story.assets.find((entry) => entry.id === block.assetId) ?? null;
  const preview = el('img', { class: 'image-preview', alt: block.alt, dataset: { assetId: block.assetId } });
  preview.hidden = true;
  loadAssetUrl(block.assetId).then((url) => {
    if (!url) return;
    preview.src = url;
    preview.hidden = false;
  });
  const fileInput = el('input', {
    type: 'file',
    accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml',
    attrs: { 'aria-label': t('imageUploadButton') },
    on: {
      change: async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setStatus(t('savingLabel'));
        try {
          const result = await uploadAsset(file);
          if (!result?.asset) throw new Error('upload returned no asset');
          state.story = result.story;
          block.assetId = result.asset.id;
          touchBlocks();
          setStatus(t('savedLabel'), 'ok');
          render();
        } catch (error) {
          setStatus(`${t('uploadFailedLabel')} ${error.message}`, 'error');
        } finally {
          event.target.value = '';
        }
      },
    },
  });
  const roleSelect = el('select', {
    attrs: { 'aria-label': t('imageRoleLabel') },
    on: {
      change: (event) => {
        block.role = event.target.value === 'icon' ? 'icon' : 'figure';
        touchBlocks();
      },
    },
  });
  roleSelect.append(el('option', { value: 'figure', text: t('imageRoleFigure') }), el('option', { value: 'icon', text: t('imageRoleIcon') }));
  roleSelect.value = block.role;
  const alt = el('input', {
    type: 'text',
    value: block.alt,
    attrs: { placeholder: t('imageAltPlaceholder'), 'aria-label': t('imageAltLabel') },
    on: {
      input: (event) => {
        block.alt = event.target.value;
        preview.alt = event.target.value;
        touchBlocks();
      },
    },
  });
  const caption = el('input', {
    type: 'text',
    value: block.caption,
    attrs: { placeholder: t('imageCaptionPlaceholder'), 'aria-label': t('imageCaptionLabel') },
    on: {
      input: (event) => {
        block.caption = event.target.value;
        touchBlocks();
      },
    },
  });
  wrap.append(
    el('div', { class: 'field' }, [el('span', { class: 'field-label', text: asset ? t('imageReplaceButton') : t('imageUploadButton') }), fileInput]),
    el('div', { class: 'field' }, [el('label', { class: 'field-label', text: t('imageRoleLabel') }), roleSelect]),
    el('div', { class: 'field' }, [el('label', { class: 'field-label', text: t('imageAltLabel') }), alt]),
    el('div', { class: 'field' }, [el('label', { class: 'field-label', text: t('imageCaptionLabel') }), caption]),
    preview,
    el('div', { class: 'image-meta', text: asset ? `${asset.filename} · ${asset.mime} · ${asset.size} B` : t('imageMissingWarning') }),
  );
  return wrap;
}

function mathBlockEditor(block) {
  const wrap = el('div');
  const textarea = el('textarea', {
    value: block.latex,
    attrs: { 'aria-label': t('mathLatexLabel') },
    on: {
      input: (event) => {
        block.latex = event.target.value;
        touchBlocks();
        refresh();
      },
    },
  });
  const displayBox = el('input', {
    type: 'checkbox',
    id: `math-display-${block.id}`,
    checked: block.display,
    on: {
      change: (event) => {
        block.display = event.target.checked;
        touchBlocks();
        refresh();
      },
    },
  });
  const preview = el('div', { class: 'block-preview' });
  const refresh = () => {
    preview.innerHTML = renderMath(block.latex, block.display);
  };
  refresh();
  wrap.append(
    el('label', { class: 'field-label', for: `math-display-${block.id}`, text: t('mathLatexLabel') }),
    textarea,
    el('div', { class: 'field' }, [
      el('label', { class: 'field-label' }, [displayBox, document.createTextNode(` ${t('mathDisplayLabel')}`)]),
    ]),
    el('span', { class: 'field-label', text: t('previewLabel') }),
    preview,
  );
  return wrap;
}

function renderSources(draft) {
  const wrap = el('div', { class: 'sources' });
  wrap.append(el('h4', { text: t('sourcesSectionTitle') }));
  draft.sources.forEach((source, index) => {
    const row = el('div', { class: 'source-row' });
    row.append(
      el('input', {
        type: 'text',
        value: source.label ?? '',
        attrs: { placeholder: t('sourceLabelPlaceholder'), 'aria-label': t('sourceLabelLabel') },
        on: {
          input: (event) => {
            draft.sources[index].label = event.target.value;
            markDirty(true);
          },
        },
      }),
      el('input', {
        type: 'url',
        value: source.url ?? '',
        attrs: { placeholder: t('sourceUrlPlaceholder'), 'aria-label': t('sourceUrlLabel') },
        on: {
          input: (event) => {
            draft.sources[index].url = event.target.value;
            markDirty(true);
          },
        },
      }),
      el('button', {
        type: 'button',
        class: 'button button-small button-danger',
        text: t('deleteSourceButton'),
        on: {
          click: () => {
            draft.sources.splice(index, 1);
            markDirty(true);
            renderEditor();
          },
        },
      }),
    );
    wrap.append(row);
  });
  wrap.append(
    el('button', {
      type: 'button',
      class: 'button button-small',
      text: t('addSourceButton'),
      on: {
        click: () => {
          draft.sources.push({ label: '', url: '' });
          markDirty(true);
          renderEditor();
        },
      },
    }),
  );
  return wrap;
}

function renderComments() {
  const container = document.getElementById('comments');
  container.replaceChildren();
  const node = nodesById().get(state.selectedId);
  if (!node) return;
  const comments = state.story.comments.filter((comment) => comment.nodeId === node.id);

  const form = el('div', { class: 'field' });
  const input = el('textarea', {
    value: state.commentDraft,
    attrs: { placeholder: t('commentPlaceholder'), 'aria-label': t('commentsSectionTitle') },
    on: {
      input: (event) => {
        state.commentDraft = event.target.value;
      },
    },
  });
  form.append(
    input,
    el('div', { class: 'dialog-actions' }, [
      el('button', {
        type: 'button',
        class: 'button',
        text: t('addCommentButton'),
        on: {
          click: async () => {
            const body = state.commentDraft.trim();
            if (body === '') {
              setStatus(t('commentEmptyWarning'), 'error');
              return;
            }
            try {
              const result = await api('/api/comments', {
                method: 'POST',
                body: { expectedRevision: state.story.revision, nodeId: node.id, body },
              });
              state.commentDraft = '';
              applyStory(result.story);
              setStatus(t('savedLabel'), 'ok');
            } catch (error) {
              handleWriteError(error);
            }
          },
        },
      }),
    ]),
  );
  container.append(form);

  if (comments.length === 0) container.append(el('p', { class: 'hint', text: t('noCommentsHint') }));
  for (const comment of comments) {
    const block = el('div', { class: 'comment' });
    block.append(
      el('div', { class: 'comment-meta' }, [
        el('span', { class: comment.status === 'open' ? 'tag-open' : 'tag-resolved', text: comment.status === 'open' ? t('commentStatusOpen') : t('commentStatusResolved') }),
        el('span', { text: comment.createdAt }),
        el('span', { text: `r${comment.nodeRevision}` }),
      ]),
    );
    if (comment.nodeRevision !== node.revision) {
      block.append(el('p', { class: 'comment-warn', text: t('staleCommentWarning') }));
    }
    if (state.editingCommentId === comment.id) {
      const editor = el('textarea', {
        value: state.editingCommentBody,
        attrs: { 'aria-label': t('editCommentButton') },
        on: {
          input: (event) => {
            state.editingCommentBody = event.target.value;
          },
        },
      });
      block.append(editor);
      block.append(
        el('div', { class: 'comment-actions' }, [
          el('button', {
            type: 'button',
            class: 'button button-small',
            text: t('commentSaveButton'),
            on: {
              click: async () => {
                const body = state.editingCommentBody.trim();
                if (body === '') {
                  setStatus(t('commentEmptyWarning'), 'error');
                  return;
                }
                try {
                  const result = await api(`/api/comments/${encodeURIComponent(comment.id)}`, {
                    method: 'PATCH',
                    body: { expectedRevision: state.story.revision, body },
                  });
                  state.editingCommentId = null;
                  applyStory(result.story);
                } catch (error) {
                  handleWriteError(error);
                }
              },
            },
          }),
          el('button', {
            type: 'button',
            class: 'button button-small',
            text: t('commentCancelButton'),
            on: {
              click: () => {
                state.editingCommentId = null;
                renderComments();
              },
            },
          }),
        ]),
      );
    } else {
      block.append(el('p', { class: 'comment-body', text: comment.body }));
      const actions = el('div', { class: 'comment-actions' });
      actions.append(
        el('button', {
          type: 'button',
          class: 'button button-small',
          text: comment.status === 'open' ? t('resolveCommentButton') : t('reopenCommentButton'),
          on: {
            click: async () => {
              try {
                const result = await api(`/api/comments/${encodeURIComponent(comment.id)}`, {
                  method: 'PATCH',
                  body: { expectedRevision: state.story.revision, status: comment.status === 'open' ? 'resolved' : 'open' },
                });
                applyStory(result.story);
              } catch (error) {
                handleWriteError(error);
              }
            },
          },
        }),
        el('button', {
          type: 'button',
          class: 'button button-small',
          text: t('editCommentButton'),
          on: {
            click: () => {
              state.editingCommentId = comment.id;
              state.editingCommentBody = comment.body;
              renderComments();
            },
          },
        }),
      );
      block.append(actions);
    }
    container.append(block);
  }
}

function renderOrphanComments() {
  const section = document.getElementById('orphan-comments-section');
  const container = document.getElementById('orphan-comments');
  container.replaceChildren();
  const ids = new Set(nodesOf().map((node) => node.id));
  const orphans = state.story.comments.filter((comment) => !ids.has(comment.nodeId));
  section.hidden = orphans.length === 0;
  for (const comment of orphans) {
    const block = el('div', { class: 'comment' });
    block.append(
      el('div', { class: 'comment-meta' }, [el('span', { text: comment.status === 'open' ? t('commentStatusOpen') : t('commentStatusResolved') }), el('span', { text: comment.createdAt })]),
      el('p', { class: 'comment-warn', text: t('deletedTargetWarning') }),
      el('p', { class: 'comment-body', text: comment.body }),
    );
    container.append(block);
  }
}

function compareProposal(proposal) {
  const round = state.story.rounds.find((entry) => entry.id === proposal.roundId) ?? null;
  const before = new Map((round?.nodes ?? []).map((node) => [node.id, node]));
  const after = new Map(proposal.nodes.map((node) => [node.id, node]));
  const changes = [];
  for (const [id, node] of after) {
    const previous = before.get(id);
    if (!previous) {
      changes.push({ nodeId: id, kind: 'added', title: node.title });
      continue;
    }
    const moved = previous.parentId !== node.parentId || previous.position !== node.position;
    const edited =
      previous.title !== node.title ||
      JSON.stringify(previous.blocks) !== JSON.stringify(node.blocks) ||
      JSON.stringify(previous.sources) !== JSON.stringify(node.sources);
    if (edited) changes.push({ nodeId: id, kind: 'changed', title: node.title });
    if (moved) changes.push({ nodeId: id, kind: 'moved', title: node.title });
  }
  for (const [id, node] of before) {
    if (!after.has(id)) changes.push({ nodeId: id, kind: 'removed', title: node.title });
  }
  const stale = round === null || proposal.baseRevision !== state.story.revision || round.baseRevision !== state.story.revision;
  return { changes, stale, round };
}

function renderProposals() {
  const container = document.getElementById('proposals');
  container.replaceChildren();
  const proposals = [...(state.story.proposals ?? [])].reverse();
  if (proposals.length === 0) {
    container.append(el('p', { class: 'hint', text: t('noProposalsHint') }));
    return;
  }
  for (const proposal of proposals) {
    const { changes, stale } = compareProposal(proposal);
    const block = el('div', { class: 'proposal' });
    block.append(
      el('div', { class: 'proposal-meta' }, [
        el('span', { text: proposal.status === 'pending' ? t('commentStatusOpen') : proposal.status }),
        el('span', { text: proposal.createdAt }),
        el('span', { text: `r${proposal.baseRevision}` }),
      ]),
    );
    block.append(el('p', { class: 'field-label', text: t('proposalSummaryLabel') }), el('p', { class: 'proposal-summary', text: proposal.summary ?? '' }));
    if (stale && proposal.status === 'pending') block.append(el('p', { class: 'comment-warn', text: t('staleProposalWarning') }));

    const details = state.expandedProposals.has(proposal.id);
    const list = el('ul', { class: 'proposal-changes' });
    list.hidden = !details;
    for (const change of changes) {
      const label = {
        added: t('changeAdded'),
        removed: t('changeRemoved'),
        changed: t('changeChanged'),
        moved: t('changeMovedBranch'),
      }[change.kind];
      list.append(el('li', { class: `change-${change.kind}`, text: `${label} ${change.title?.trim() === '' ? t('emptyTitleHint') : change.title}` }));
    }
    block.append(
      el('button', {
        type: 'button',
        class: 'button button-small',
        text: t('proposalDetailsLabel'),
        attrs: { 'aria-expanded': String(details) },
        on: {
          click: () => {
            if (details) state.expandedProposals.delete(proposal.id);
            else state.expandedProposals.add(proposal.id);
            renderProposals();
          },
        },
      }),
      list,
    );

    if (proposal.addressedCommentIds.length > 0) {
      const addressedList = el('ul', { class: 'proposal-changes' });
      for (const commentId of proposal.addressedCommentIds) {
        const comment = state.story.comments.find((entry) => entry.id === commentId);
        addressedList.append(el('li', { text: comment ? comment.body : commentId }));
      }
      block.append(el('p', { class: 'field-label', text: t('addressedCommentsLabel') }), addressedList);
    }

    if (proposal.status === 'pending') {
      const actions = el('div', { class: 'proposal-actions' });
      const acceptButton = el('button', {
        type: 'button',
        class: 'button button-primary',
        text: t('acceptProposalButton'),
        attrs: { disabled: stale },
        on: { click: () => void decideProposal(proposal.id, 'accept') },
      });
      actions.append(
        acceptButton,
        el('button', { type: 'button', class: 'button', text: t('rejectProposalButton'), on: { click: () => void decideProposal(proposal.id, 'reject') } }),
      );
      block.append(actions);
    }
    container.append(block);
  }
}

function handleWriteError(error, fallbackLabel = 'saveFailedLabel') {
  if (error.status === 409 && error.code === 'REVISION_CONFLICT') {
    state.conflict = { revision: error.revision ?? null };
    setStatus(t('conflictTitle'), 'error');
    render();
    return;
  }
  if (error.status === 409 && error.code === 'PROPOSAL_STALE') {
    setStatus(t('staleProposalWarning'), 'error');
    render();
    return;
  }
  setStatus(`${t(fallbackLabel)} ${error.message}`, 'error');
}

/* ------------------------------------------------------------------ */
/* Assets                                                             */
/* ------------------------------------------------------------------ */

async function loadAssetUrl(assetId) {
  if (!assetId) return null;
  if (state.assetUrls.has(assetId)) return state.assetUrls.get(assetId);
  try {
    const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, {
      headers: { Authorization: `Bearer ${state.token}` },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    state.assetUrls.set(assetId, url);
    return url;
  } catch {
    return null;
  }
}

function renderAssetUrls() {
  const used = new Set();
  const collect = (blocks) => {
    for (const block of blocks ?? []) if (block.type === 'image' && block.assetId) used.add(block.assetId);
  };
  for (const node of nodesOf()) collect(node.blocks);
  if (state.draft) collect(state.draft.blocks);
  for (const [assetId, url] of state.assetUrls) {
    if (used.has(assetId)) continue;
    URL.revokeObjectURL(url);
    state.assetUrls.delete(assetId);
  }
}

Object.assign(renderers, {
  tree: renderTree,
  toolbar: renderToolbar,
  breadcrumb: renderBreadcrumb,
  conflict: renderConflict,
  editor: renderEditor,
  comments: renderComments,
  proposals: renderProposals,
  orphanComments: renderOrphanComments,
  assetUrls: renderAssetUrls,
});

/* ------------------------------------------------------------------ */
/* Structural edits                                                   */
/* ------------------------------------------------------------------ */

async function addNode(kind, parentId) {
  if (!(await commitDraft({ silent: true }))) return;
  const siblings = childrenOf(parentId);
  const id = newId();
  const node = { id, parentId, kind, position: siblings.length, title: '', blocks: [], sources: [] };
  try {
    const result = await api('/api/tree', {
      method: 'PUT',
      body: { expectedRevision: state.story.revision, nodes: [...candidateTree(), serializeNode(node)] },
    });
    state.selectedId = id;
    state.draft = null;
    state.dirty = false;
    applyStory(result.story);
  } catch (error) {
    handleWriteError(error);
  }
}

async function moveNode(nodeId, delta) {
  if (!(await commitDraft({ silent: true }))) return;
  const node = nodesById().get(nodeId);
  const siblings = childrenOf(node.parentId);
  const index = siblings.findIndex((entry) => entry.id === nodeId);
  const target = index + delta;
  if (target < 0 || target >= siblings.length) return;
  const reordered = [...siblings];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  const nodes = candidateTree().map((entry) => {
    const position = reordered.findIndex((sibling) => sibling.id === entry.id);
    return position === -1 ? entry : { ...entry, position };
  });
  try {
    const result = await api('/api/tree', { method: 'PUT', body: { expectedRevision: state.story.revision, nodes } });
    applyStory(result.story);
  } catch (error) {
    handleWriteError(error);
  }
}

async function reparentNode(nodeId, parentId) {
  if (!(await commitDraft({ silent: true }))) return;
  const payload = candidateTree().map((entry) => {
    if (entry.id !== nodeId) return entry;
    return { ...entry, parentId, position: childrenOf(parentId).length };
  });
  try {
    const result = await api('/api/tree', { method: 'PUT', body: { expectedRevision: state.story.revision, nodes: payload } });
    applyStory(result.story);
  } catch (error) {
    handleWriteError(error);
  }
}

async function deleteNode(nodeId) {
  const node = nodesById().get(nodeId);
  const { ids, count } = subtreeIds(nodeId);
  const choice = await showDialog(
    t('deleteNodeConfirm', { title: displayTitle(node), count }),
    [
      { label: t('deleteNodeButton'), value: 'delete', primary: true },
      { label: t('commentCancelButton'), value: null },
    ],
  );
  if (choice !== 'delete') return;
  if (!(await commitDraft({ silent: true }))) return;
  const remove = new Set(ids);
  const nodes = candidateTree()
    .filter((entry) => !remove.has(entry.id))
    .map((entry) => {
      if (entry.parentId === null || remove.has(entry.parentId)) return entry;
      const siblings = childrenOf(entry.parentId).filter((sibling) => !remove.has(sibling.id));
      const position = siblings.findIndex((sibling) => sibling.id === entry.id);
      return position === -1 ? entry : { ...entry, position: siblings.findIndex((sibling) => sibling.id === entry.id) };
    });
  try {
    const result = await api('/api/tree', { method: 'PUT', body: { expectedRevision: state.story.revision, nodes } });
    if (state.selectedId === nodeId || remove.has(state.selectedId)) {
      state.selectedId = result.story.rootId;
      state.draft = null;
      state.dirty = false;
    }
    applyStory(result.story);
  } catch (error) {
    handleWriteError(error);
  }
}

/* ------------------------------------------------------------------ */
/* Draft reconciliation                                               */
/* ------------------------------------------------------------------ */

async function reapplyDraft() {
  try {
    const latest = await api('/api/story');
    state.story = latest;
    state.conflict = null;
    if (state.draft && nodesById().has(state.draft.nodeId)) {
      state.dirty = true;
    } else {
      state.draft = null;
      state.dirty = false;
    }
    render();
    await commitDraft();
  } catch (error) {
    setStatus(`${t('saveFailedLabel')} ${error.message}`, 'error');
  }
}

async function discardDraft() {
  try {
    const latest = await api('/api/story');
    state.story = latest;
    state.conflict = null;
    state.dirty = false;
    const node = nodesById().get(state.selectedId);
    state.draft = node ? snapshotDraft(node) : null;
    render();
    setStatus('');
  } catch (error) {
    setStatus(`${t('loadFailedLabel')} ${error.message}`, 'error');
  }
}

async function selectNode(nodeId) {
  if (nodeId === state.selectedId) {
    state.tab = 'detail';
    render();
    return;
  }
  if (state.dirty) {
    const choice = await showDialog(t('unsavedTitle'), [
      { label: t('saveAndSwitchButton'), value: 'save', primary: true },
      { label: t('discardAndSwitchButton'), value: 'discard' },
      { label: t('stayHereButton'), value: null },
    ]);
    if (choice === null) return;
    if (choice === 'save') {
      const saved = await commitDraft();
      if (!saved) return;
    } else {
      state.dirty = false;
    }
  }
  state.selectedId = nodeId;
  const node = nodesById().get(nodeId);
  state.draft = node ? snapshotDraft(node) : null;
  state.editingCommentId = null;
  state.commentDraft = '';
  state.tab = 'detail';
  render();
}

/* ------------------------------------------------------------------ */
/* Blocks                                                             */
/* ------------------------------------------------------------------ */

function addBlock(type) {
  const base = { id: newId(), type };
  if (type === 'markdown') state.draft.blocks.push({ ...base, text: '' });
  else if (type === 'table') state.draft.blocks.push({ ...base, columns: [''], rows: [], caption: '' });
  else if (type === 'image') state.draft.blocks.push({ ...base, assetId: '', role: 'figure', alt: '', caption: '' });
  else state.draft.blocks.push({ ...base, latex: '', display: true });
  markDirty(true);
  renderEditor();
}

function removeBlock(index) {
  state.draft.blocks.splice(index, 1);
  markDirty(true);
  renderEditor();
  renderAssetUrls();
}

function moveBlock(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.draft.blocks.length) return;
  const blocks = state.draft.blocks;
  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  markDirty(true);
  renderEditor();
}

/* ------------------------------------------------------------------ */
/* Round, export, proposals                                           */
/* ------------------------------------------------------------------ */

async function submitRound() {
  if (!(await commitDraft())) return;
  try {
    const result = await api('/api/rounds', { method: 'POST', body: { expectedRevision: state.story.revision } });
    applyStory(result.story);
    showNotice({
      title: t('roundReadyTitle'),
      rows: [
        [t('roundIdLabel'), result.round.id],
        [t('projectPathLabel'), result.projectDir ?? ''],
        [t('continueInstructionLabel'), ''],
      ],
      pre: t('continueInstructionText', { roundId: result.round.id, projectPath: result.projectDir ?? '' }).trim(),
    });
    document.getElementById('notice').append(el('p', { class: 'hint', text: t('noModelCallNotice') }));
  } catch (error) {
    handleWriteError(error);
  }
}

async function exportStory() {
  if (!(await commitDraft())) return;
  try {
    const result = await api('/api/exports', { method: 'POST', body: { expectedRevision: state.story.revision } });
    applyStory(result.story);
    showNotice({
      title: t('roundReadyTitle'),
      rows: [
        [t('revisionLabel', { revision: result.export.revision }), result.export.relativeDirectory],
        [t('projectPathLabel'), result.projectDir ?? ''],
        [t('proposalDetailsLabel'), result.export.files.join(', ')],
      ],
    });
  } catch (error) {
    handleWriteError(error);
  }
}

async function decideProposal(proposalId, decision) {
  try {
    const result = await api(`/api/proposals/${encodeURIComponent(proposalId)}/decision`, {
      method: 'POST',
      body: { expectedRevision: state.story.revision, decision },
    });
    applyStory(result.story);
    setStatus(t('savedLabel'), 'ok');
  } catch (error) {
    handleWriteError(error, 'proposalDecisionFailedLabel');
  }
}

/* ------------------------------------------------------------------ */
/* Wiring                                                             */
/* ------------------------------------------------------------------ */

function wire() {
  document.getElementById('expand-all').addEventListener('click', () => {
    state.collapsed.clear();
    render();
  });
  document.getElementById('collapse-all').addEventListener('click', () => {
    for (const node of nodesOf()) {
      if (childrenOf(node.id).length > 0) state.collapsed.add(node.id);
    }
    render();
  });
  document.getElementById('submit-round').addEventListener('click', () => void submitRound());
  document.getElementById('export-story').addEventListener('click', () => void exportStory());
  for (const button of document.querySelectorAll('#tabs button')) {
    button.addEventListener('click', () => {
      state.tab = button.dataset.tab;
      render();
    });
  }
  window.addEventListener('resize', () => markScrollableTables());
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = t('beforeUnloadWarning');
    return t('beforeUnloadWarning');
  });
  document.getElementById('tab-tree').textContent = t('tabTree');
  document.getElementById('tab-detail').textContent = t('tabDetail');
  document.getElementById('app-title').textContent = t('appTitle');
}

renderers.toggleCollapse = (nodeId) => {
  if (state.collapsed.has(nodeId)) state.collapsed.delete(nodeId);
  else state.collapsed.add(nodeId);
  renderTree();
};

async function main() {
  state.token = readToken();
  state.tab = 'tree';
  wire();
  setStatus(t('loadingLabel'));
  if (!state.token) {
    setStatus(t('loadFailedLabel'), 'error');
    document.getElementById('node-editor').append(el('p', { class: 'hint', text: t('loadFailedLabel') }));
    return;
  }
  try {
    const story = await api('/api/story');
    applyStory(story);
    setStatus('');
  } catch (error) {
    setStatus(`${t('loadFailedLabel')} ${error.message}`, 'error');
  }
}

void main();
