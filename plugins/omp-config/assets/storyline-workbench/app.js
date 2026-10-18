// Storyline workbench client.
//
// The page never holds server state beyond the story it fetches: every write
// sends the whole candidate tree with an expected revision, and a 409 keeps
// the local draft until the user decides how to reconcile it.
//
// Display model: the root is the whole topic, claims are chapters (depth 1)
// and sections (depth 2+), and every evidence node is one leaf paragraph of an
// article or one page of a slide deck, whose title is its topic sentence.

import { copy } from './copy.zh.js';
import '/vendor/markdown-it/markdown-it.min.js';
import '/vendor/katex/katex.min.js';

const TOKEN_KEY = `storyline-workbench:${location.origin}`;
const VIEW_KEY_PREFIX = 'storyline-workbench:view:';

const state = {
  token: null,
  story: null,
  outline: null,
  selectedId: null,
  draft: null,
  dirty: false,
  conflict: null,
  tab: 'story',
  view: 'full',
  tocOpen: false,
  collapsed: new Set(),
  commentDraft: '',
  editingCommentId: null,
  editingCommentBody: '',
  expandedProposals: new Set(),
  workflowDetails: new Set(),
  notice: null,
  busy: false,
  assetUrls: new Map(),
  assetSizes: new Map(),
  savePromise: null,
  liveTimer: null,
  focusTitle: false,
  resetInspectorScroll: false,
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

function tablePreviewSource(block) {
  const cells = (row) => `| ${row.map((value) => String(value).replace(/\|/gu, '\\|').replace(/\n/gu, '<br>')).join(' | ')} |`;
  const lines = [cells(block.columns), `| ${block.columns.map(() => '---').join(' | ')} |`];
  for (const row of block.rows) lines.push(cells(row));
  if (String(block.caption ?? '').trim() !== '') lines.push('', `*${block.caption}*`);
  return lines.join('\n');
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
/* Status and dialog                                                   */
/* ------------------------------------------------------------------ */

function setStatus(message, tone = 'info') {
  const line = document.getElementById('status-line');
  line.textContent = message ?? '';
  line.dataset.tone = tone;
}

function showDialog(message, buttons) {
  const dialog = document.getElementById('confirm-dialog');
  const actions = document.getElementById('confirm-actions');
  document.getElementById('confirm-message').textContent = message;
  actions.replaceChildren();
  return new Promise((resolve) => {
    for (const button of buttons) {
      const className = ['button', button.primary ? 'button-primary' : '', button.danger ? 'button-danger' : '']
        .filter(Boolean)
        .join(' ');
      actions.append(
        el('button', {
          type: 'button',
          class: className,
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
/* Tree and outline                                                    */
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

function subtreeIds(nodeId) {
  const ids = [nodeId];
  const walk = (id) => {
    for (const node of nodesOf()) {
      if (node.parentId !== id) continue;
      ids.push(node.id);
      walk(node.id);
    }
  };
  walk(nodeId);
  return { ids, count: ids.length - 1 };
}

function isSlides() {
  return state.story?.kind === 'slides';
}

// Pure: derived from the story alone and recomputed once per full render.
function buildOutline(story) {
  const byId = new Map(story.nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map(story.nodes.map((node) => [node.id, []]));
  for (const node of story.nodes) {
    if (node.parentId === null) continue;
    const list = childrenByParent.get(node.parentId);
    if (list) list.push(node);
  }
  for (const list of childrenByParent.values()) list.sort((left, right) => left.position - right.position);
  const openCounts = new Map();
  for (const comment of story.comments) {
    if (comment.status !== 'open') continue;
    openCounts.set(comment.nodeId, (openCounts.get(comment.nodeId) ?? 0) + 1);
  }

  const outline = new Map();
  let leafIndex = 0;
  const walk = (node, depth, number) => {
    const role = node.kind === 'topic' ? 'topic' : node.kind === 'evidence' ? 'leaf' : depth === 1 ? 'chapter' : 'section';
    const entry = {
      node,
      depth,
      role,
      number: node.kind === 'claim' ? number : null,
      leafIndex: null,
      leafTotal: 0,
      openComments: openCounts.get(node.id) ?? 0,
      openCommentsInSubtree: 0,
      children: [],
    };
    if (node.kind === 'evidence') {
      leafIndex += 1;
      entry.leafIndex = leafIndex;
    }
    outline.set(node.id, entry);
    let claimNumber = 0;
    for (const child of childrenByParent.get(node.id) ?? []) {
      entry.children.push(child.id);
      let childNumber = null;
      if (child.kind === 'claim') {
        claimNumber += 1;
        childNumber = number === null || number === undefined ? String(claimNumber) : `${number}.${claimNumber}`;
      }
      walk(child, depth + 1, childNumber);
    }
    let leafTotal = node.kind === 'evidence' ? 1 : 0;
    let openTotal = entry.openComments;
    for (const childId of entry.children) {
      const child = outline.get(childId);
      leafTotal += child.leafTotal;
      openTotal += child.openCommentsInSubtree;
    }
    entry.leafTotal = leafTotal;
    entry.openCommentsInSubtree = openTotal;
  };
  const root = byId.get(story.rootId);
  if (root) walk(root, 0, null);
  return outline;
}

function outlineEntry(nodeId) {
  return state.outline?.get(nodeId) ?? null;
}

function fallbackTitle(node) {
  if (node.kind === 'topic') return t('untitledTopic');
  if (node.kind === 'claim') return t('untitledChapter');
  return t('untitledLeaf');
}

function titleOf(node) {
  const title = String(node.title ?? '').trim();
  return title === '' ? fallbackTitle(node) : title;
}

function hasTitle(node) {
  return String(node.title ?? '').trim() !== '';
}

function roleLabel(role) {
  if (role === 'topic') return t('roleTopic');
  if (role === 'chapter') return t('roleChapter');
  if (role === 'section') return t('roleSection');
  return isSlides() ? t('rolePage') : t('roleParagraph');
}

function countText(count) {
  return isSlides()
    ? t('countPages', { count })
    : t('countParagraphs', { count });
}

function leafLabelText(entry) {
  return isSlides()
    ? t('leafLabelPage', { number: entry.leafIndex })
    : t('leafLabelParagraph', { number: entry.leafIndex });
}

function emptyWarningText() {
  return isSlides()
    ? t('emptyChapterPages')
    : t('emptyChapterParagraphs');
}

function titleCopy(role) {
  if (role === 'topic') {
    return {
      label: t('titleLabelTopic'),
      hint: t('titleHintTopic'),
      placeholder: t('titlePlaceholderTopic'),
      content: t('contentLabelTopic'),
    };
  }
  if (role === 'chapter' || role === 'section') {
    return {
      label: t('titleLabelChapter'),
      hint: t('titleHintChapter'),
      placeholder: t('titlePlaceholderChapter'),
      content: t('contentLabelChapter'),
    };
  }
  if (isSlides()) {
    return {
      label: t('titleLabelLeaf'),
      hint: t('titleHintPage'),
      placeholder: t('titlePlaceholderPage'),
      content: t('contentLabelPage'),
    };
  }
  return {
    label: t('titleLabelLeaf'),
    hint: t('titleHintParagraph'),
    placeholder: t('titlePlaceholderParagraph'),
    content: t('contentLabelParagraph'),
  };
}

function liveNode(nodeId) {
  const node = nodesById().get(nodeId);
  if (!node) return null;
  if (state.dirty && state.draft?.nodeId === nodeId) {
    return { ...node, title: state.draft.title, blocks: state.draft.blocks, sources: state.draft.sources };
  }
  return node;
}

const timeFormatter = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' });

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value ?? '') : timeFormatter.format(date);
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
  return nodesOf().map((node) => {
    if (state.draft && state.draft.nodeId === node.id) {
      return serializeNode({ ...node, title: state.draft.title, blocks: state.draft.blocks, sources: state.draft.sources });
    }
    return serializeNode(node);
  });
}

function markDirty(dirty = true) {
  state.dirty = dirty;
  const badge = document.getElementById('dirty-badge');
  if (badge) {
    badge.hidden = !dirty;
    badge.textContent = t('unsavedBadge');
  }
  const indicator = document.getElementById('save-dirty');
  if (indicator) indicator.textContent = dirty ? t('unsavedBadge') : '';
  scheduleCanvasSync();
}

function applyStory(story) {
  state.story = story;
  state.conflict = null;
  const byId = nodesById();
  if (!state.selectedId || !byId.has(state.selectedId)) {
    state.selectedId = story.rootId;
    state.draft = null;
    state.dirty = false;
  }
  if (!state.draft || state.draft.nodeId !== state.selectedId) {
    const node = byId.get(state.selectedId);
    state.draft = node ? snapshotDraft(node) : null;
  } else if (!state.dirty) {
    const node = byId.get(state.selectedId);
    state.draft = node ? snapshotDraft(node) : null;
  }
  render();
}

function draftProblem() {
  if (!state.draft) return null;
  const assetIds = new Set(state.story.assets.map((asset) => asset.id));
  for (const block of state.draft.blocks) {
    if (block.type === 'image' && !assetIds.has(block.assetId)) return t('imageMissingWarning');
  }
  return null;
}

async function commitDraft(options = {}) {
  if (state.savePromise) return state.savePromise;
  const promise = performSave(options);
  state.savePromise = promise;
  try {
    return await promise;
  } finally {
    if (state.savePromise === promise) state.savePromise = null;
  }
}

function draftEquals(left, right) {
  if (!left || !right) return left === right;
  return (
    left.nodeId === right.nodeId &&
    left.title === right.title &&
    JSON.stringify(left.blocks) === JSON.stringify(right.blocks) &&
    JSON.stringify(left.sources) === JSON.stringify(right.sources)
  );
}

async function performSave({ silent = false } = {}) {
  if (!state.dirty || !state.draft) return true;
  const problem = draftProblem();
  if (problem) {
    setStatus(problem, 'error');
    return false;
  }
  setStatus(t('savingLabel'));
  const sentDraft = structuredClone(state.draft);
  try {
    const result = await api('/api/tree', {
      method: 'PUT',
      body: { expectedRevision: state.story.revision, nodes: candidateTree() },
    });
    const focusState = captureFocusState();
    if (!(state.dirty && state.draft && !draftEquals(state.draft, sentDraft))) {
      state.dirty = false;
    }
    applyStory(result.story);
    restoreFocusState(focusState);
    if (!silent) setStatus(t('savedLabel'), 'ok');
    return true;
  } catch (error) {
    if (error.status === 409) {
      const focusState = captureFocusState();
      state.conflict = { revision: error.revision ?? null, message: error.message };
      state.resetInspectorScroll = true;
      setStatus(t('conflictTitle'), 'error');
      render();
      restoreFocusState(focusState);
      return false;
    }
    setStatus(`${t('saveFailedLabel')} ${error.message}`, 'error');
    return false;
  }
}

function handleWriteError(error) {
  if (error.status === 409 && error.code === 'REVISION_CONFLICT') {
    state.conflict = { revision: error.revision ?? null };
    state.resetInspectorScroll = true;
    setStatus(t('conflictTitle'), 'error');
    render();
    return;
  }
  if (error.status === 409 && error.code === 'PROPOSAL_STALE') {
    setStatus(t('staleProposalWarning'), 'error');
    render();
    return;
  }
  setStatus(`${t('saveFailedLabel')} ${error.message}`, 'error');
}

/* ------------------------------------------------------------------ */
/* Canvas live update                                                  */
/* ------------------------------------------------------------------ */

function scheduleCanvasSync() {
  clearTimeout(state.liveTimer);
  state.liveTimer = setTimeout(() => {
    state.liveTimer = null;
    syncSelectedCanvas();
  }, 120);
}

function syncSelectedCanvas() {
  if (!state.story || !state.outline || !state.selectedId) return;
  const entry = state.outline.get(state.selectedId);
  if (!entry) return;
  const selector = `#story-body [data-node-id="${CSS.escape(entry.node.id)}"]`;
  const existing = document.querySelector(selector);
  if (!existing) return;
  if (entry.role === 'leaf') {
    existing.replaceWith(renderLeafElement(entry));
  } else {
    const self = existing.querySelector(':scope > .node-self');
    if (self) self.replaceWith(renderNodeSelf(entry));
  }
  if (entry.role === 'topic') renderRootTitle();
}

/* ------------------------------------------------------------------ */
/* Full render                                                         */
/* ------------------------------------------------------------------ */

function render() {
  if (!state.story) return;
  if (state.liveTimer) {
    clearTimeout(state.liveTimer);
    state.liveTimer = null;
  }
  const canvas = document.getElementById('canvas');
  const tocPanel = document.getElementById('toc-panel');
  const inspector = document.getElementById('inspector');
  const canvasScroll = canvas?.scrollTop ?? 0;
  const tocScroll = tocPanel?.scrollTop ?? 0;
  const inspectorScroll = state.resetInspectorScroll ? 0 : inspector?.scrollTop ?? 0;
  state.resetInspectorScroll = false;

  state.outline = buildOutline(state.story);
  document.title = t('appTitle');
  renderHeader();
  renderTabBar();
  renderCanvasChrome();
  renderWorkflowZone();
  renderStory();
  renderToc();
  renderInspector();
  applyTabState();
  renderAssetUrls();

  if (canvas) canvas.scrollTop = canvasScroll;
  if (tocPanel) tocPanel.scrollTop = tocScroll;
  if (inspector) inspector.scrollTop = inspectorScroll;

  if (state.focusTitle) {
    state.focusTitle = false;
    const field = document.getElementById('inspector-title');
    if (field) {
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    }
  }
}

function renderRootTitle() {
  const root = nodesById().get(state.story.rootId);
  const button = document.getElementById('root-title');
  if (!root || !button) return;
  button.textContent = titleOf(root);
  button.classList.toggle('is-placeholder', !hasTitle(root));
  button.setAttribute('title', titleOf(root));
}

function renderHeader() {
  document.getElementById('app-eyebrow').textContent = t('appTitle');
  renderRootTitle();

  const counts = { chapters: 0, sections: 0, leaves: 0 };
  for (const entry of state.outline.values()) {
    if (entry.role === 'chapter') counts.chapters += 1;
    else if (entry.role === 'section') counts.sections += 1;
    else if (entry.role === 'leaf') counts.leaves += 1;
  }
  const stats = [
    t('countChapters', { count: counts.chapters }),
    counts.sections > 0 ? t('countSections', { count: counts.sections }) : null,
    countText(counts.leaves),
  ].filter(Boolean).join(' · ');

  document.getElementById('header-chips').replaceChildren(
    el('span', { class: 'chip', text: isSlides() ? t('kindSlides') : t('kindArticle') }),
    el('span', { class: 'chip', text: stats }),
    el('span', { id: 'revision-label', class: 'chip', text: t('revisionLabel', { revision: state.story.revision }) }),
    el('span', {
      id: 'dirty-badge',
      class: 'chip chip-warn',
      text: t('unsavedBadge'),
      hidden: !state.dirty,
    }),
  );
  document.getElementById('submit-round').textContent = t('submitRoundButton');
  document.getElementById('export-story').textContent = t('exportButton');
}

function renderTabBar() {
  const bar = document.getElementById('tabbar');
  bar.setAttribute('aria-label', t('tabsAria'));
  const labels = { outline: t('tabOutline'), story: t('tabStory'), editor: t('tabEditor') };
  for (const button of bar.querySelectorAll('button[data-tab]')) {
    button.textContent = labels[button.dataset.tab];
    button.setAttribute('aria-pressed', String(button.dataset.tab === state.tab));
  }
}

function renderCanvasChrome() {
  const canvas = document.getElementById('canvas');
  canvas.setAttribute('aria-label', t('storyAria'));
  const group = document.getElementById('view-switch');
  group.setAttribute('aria-label', t('viewModeAria'));
  const outlineButton = document.getElementById('view-outline');
  outlineButton.textContent = t('viewOutlineButton');
  outlineButton.setAttribute('aria-pressed', String(state.view === 'outline'));
  const fullButton = document.getElementById('view-full');
  fullButton.textContent = t('viewFullButton');
  fullButton.setAttribute('aria-pressed', String(state.view === 'full'));
  const tocToggle = document.getElementById('toc-toggle');
  tocToggle.textContent = t('tocToggleButton');
  tocToggle.setAttribute('aria-pressed', String(state.tocOpen));
}

function applyTabState() {
  const body = document.getElementById('app-body');
  body.dataset.tab = state.tab;
  body.dataset.tocOpen = String(state.tocOpen);
  for (const button of document.querySelectorAll('#tabbar button[data-tab]')) {
    button.setAttribute('aria-pressed', String(button.dataset.tab === state.tab));
  }
  requestAnimationFrame(() => {
    for (const area of document.querySelectorAll('#node-editor textarea')) autoGrow(area);
  });
}

/* ------------------------------------------------------------------ */
/* Canvas content                                                      */
/* ------------------------------------------------------------------ */

function commentBadge(count, full = false) {
  if (count <= 0) return null;
  const fullLabel = t('unresolvedCommentsBadge', { count });
  return el('span', {
    class: `badge badge-accent${full ? ' badge-full' : ''}`,
    text: full ? fullLabel : t('openCommentsShort', { count }),
    attrs: { title: fullLabel, 'aria-label': fullLabel },
  });
}

function dirtyBadge() {
  return el('span', { class: 'badge badge-dirty', text: t('unsavedCardMark') });
}

function markdownDiv(html, className = 'markdown-block') {
  const div = el('div', { class: className });
  div.innerHTML = html;
  return div;
}

function appendBlocks(container, blocks) {
  for (const block of blocks) {
    if (block.type === 'markdown') {
      container.append(markdownDiv(renderMarkdown(block.text)));
    } else if (block.type === 'table') {
      container.append(markdownDiv(renderMarkdown(tablePreviewSource(block))));
    } else if (block.type === 'math') {
      container.append(markdownDiv(renderMath(block.latex, block.display)));
    } else if (block.type === 'image') {
      container.append(imageContent(block));
    }
  }
}

function trackAssetSize(assetId, img) {
  const record = () => {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      state.assetSizes.set(assetId, { width: img.naturalWidth, height: img.naturalHeight });
    }
  };
  img.addEventListener('load', record, { once: true });
  if (img.complete && img.naturalWidth > 0) record();
}

function useCachedAsset(img, assetId) {
  const url = state.assetUrls.get(assetId);
  if (!url) return false;
  const size = state.assetSizes.get(assetId);
  if (size) {
    img.width = size.width;
    img.height = size.height;
  }
  trackAssetSize(assetId, img);
  img.src = url;
  img.hidden = false;
  return true;
}

function imageContent(block) {
  const figure = el('figure', { class: `content-image content-image-${block.role}` });
  const known = state.story.assets.some((asset) => asset.id === block.assetId);
  if (!known) {
    figure.append(el('p', { class: 'content-warn', text: t('imageMissingWarning') }));
    if (String(block.caption ?? '').trim() !== '') figure.append(el('figcaption', { text: block.caption }));
    return figure;
  }
  const img = el('img', { alt: block.alt ?? '' });
  figure.append(img);
  if (!useCachedAsset(img, block.assetId)) {
    img.hidden = true;
    loadAssetUrl(block.assetId).then((url) => {
      if (url) {
        trackAssetSize(block.assetId, img);
        img.src = url;
        img.hidden = false;
      } else {
        img.remove();
        figure.prepend(el('p', { class: 'content-warn', text: t('imageMissingWarning') }));
      }
    });
  }
  if (String(block.caption ?? '').trim() !== '') figure.append(el('figcaption', { text: block.caption }));
  return figure;
}

function sourcesLine(sources) {
  const entries = (sources ?? []).filter((source) => String(source.label ?? '').trim() !== '' || String(source.url ?? '').trim() !== '');
  if (entries.length === 0) return null;
  const line = el('p', { class: 'sources-line' });
  line.append(el('span', { class: 'sources-heading', text: t('sourcesSectionTitle') }));
  entries.forEach((source, index) => {
    if (index > 0) line.append(document.createTextNode(' · '));
    const label = String(source.label ?? '').trim();
    const url = String(source.url ?? '').trim();
    if (/^https?:\/\//iu.test(url)) {
      line.append(el('a', { href: url, text: label || url, attrs: { target: '_blank', rel: 'noopener noreferrer' } }));
    } else {
      line.append(el('span', { text: label || url }));
    }
  });
  return line;
}

function leafContent(node) {
  if (!node.blocks || node.blocks.length === 0) {
    return el('p', { class: 'hint empty-content', text: t('emptyContentHint') });
  }
  const wrap = el('div', { class: 'markdown leaf-content' });
  appendBlocks(wrap, node.blocks);
  return wrap;
}

function renderStory() {
  const body = document.getElementById('story-body');
  body.replaceChildren();
  const root = outlineEntry(state.story.rootId);
  if (!root) return;
  body.append(renderRootBlock(root));
  if (root.children.length === 0) {
    body.append(el('p', { class: 'hint empty-story', text: t('emptyStoryHint') }));
  }
}

function renderRootBlock(entry) {
  const selected = state.selectedId === entry.node.id;
  const wrap = el('section', {
    class: 'root-block node-card',
    dataset: { nodeId: entry.node.id, selected: String(selected) },
    attrs: { 'aria-current': selected ? 'true' : null },
  });
  wrap.append(renderNodeSelf(entry));
  const children = renderChildNodes(entry);
  if (children) wrap.append(children);
  return wrap;
}

function renderNodeSelf(entry) {
  const node = liveNode(entry.node.id) ?? entry.node;
  const selected = state.selectedId === entry.node.id;
  const self = el('div', { class: 'node-self' });

  if (entry.role === 'topic') {
    const head = el('div', { class: 'node-head root-head' });
    head.append(el('span', { class: 'role-tag', text: roleLabel('topic') }));
    const badge = commentBadge(entry.openCommentsInSubtree);
    if (badge) head.append(badge);
    if (selected && state.dirty) head.append(dirtyBadge());
    self.append(head);
    self.append(
      el('h2', { class: 'root-heading' }, [
        el('button', { type: 'button', class: 'title-button', text: titleOf(node), attrs: { title: titleOf(node) } }),
      ]),
    );
    if (state.view === 'full' && node.blocks.length > 0) {
      const content = el('div', { class: 'markdown root-content' });
      appendBlocks(content, node.blocks);
      self.append(content);
    }
    return self;
  }

  const level = entry.role === 'chapter' ? 2 : entry.depth >= 3 ? 4 : 3;
  const head = el('div', { class: 'node-head claim-head' });
  head.append(el('span', { class: 'claim-number', text: entry.number }));
  head.append(
    el(`h${level}`, { class: 'claim-title' }, [
      el('button', {
        type: 'button',
        class: 'title-button',
        text: titleOf(node),
        attrs: { title: titleOf(node) },
      }),
    ]),
  );
  head.append(el('span', { class: 'role-tag', text: roleLabel(entry.role) }));
  head.append(el('span', { class: 'claim-count', text: countText(entry.leafTotal) }));
  const badge = commentBadge(entry.openCommentsInSubtree);
  if (badge) head.append(badge);
  if (entry.leafTotal === 0) head.append(el('span', { class: 'empty-warn', text: emptyWarningText() }));
  if (selected && state.dirty) head.append(dirtyBadge());
  self.append(head);

  if (state.view === 'full' && node.blocks.length > 0) {
    const desc = el('div', { class: 'markdown claim-desc' });
    appendBlocks(desc, node.blocks);
    self.append(desc);
  }
  return self;
}

function renderChildNodes(parentEntry) {
  if (parentEntry.children.length === 0) return null;
  const container = el('div', { class: 'node-children' });
  let run = [];
  const flush = () => {
    if (run.length === 0) return;
    container.append(renderLeafRun(run));
    run = [];
  };
  for (const childId of parentEntry.children) {
    const entry = outlineEntry(childId);
    if (!entry) continue;
    if (entry.role === 'leaf') {
      run.push(entry);
    } else {
      flush();
      container.append(renderClaimNode(entry));
    }
  }
  flush();
  return container;
}

function renderClaimNode(entry) {
  const selected = state.selectedId === entry.node.id;
  const section = el('section', {
    class: `claim-node claim-${entry.role} claim-depth-${entry.depth}`,
    dataset: { nodeId: entry.node.id, selected: String(selected) },
    attrs: { 'aria-current': selected ? 'true' : null },
  });
  section.append(renderNodeSelf(entry));
  const children = renderChildNodes(entry);
  if (children) section.append(children);
  return section;
}

function renderLeafRun(entries) {
  if (state.view === 'outline') {
    if (isSlides()) return el('div', { class: 'leaf-run tile-grid' }, entries.map((entry) => renderLeafElement(entry)));
    return el('ol', { class: 'leaf-run outline-run' }, entries.map((entry) => renderLeafElement(entry)));
  }
  return el('div', {
    class: `leaf-run ${isSlides() ? 'slide-grid' : 'article-run'}`,
  }, entries.map((entry) => renderLeafElement(entry)));
}

function renderLeafElement(entry) {
  const node = liveNode(entry.node.id) ?? entry.node;
  const selected = state.selectedId === entry.node.id;
  const slides = isSlides();

  if (state.view === 'outline') {
    if (slides) {
      const tile = el('article', {
        class: 'leaf slide-tile',
        dataset: { nodeId: entry.node.id, selected: String(selected) },
        attrs: { 'aria-current': selected ? 'true' : null },
      });
      const head = el('div', { class: 'leaf-head' });
      head.append(el('span', { class: 'leaf-label', text: leafLabelText(entry) }));
      const badge = commentBadge(entry.openComments);
      if (badge) head.append(badge);
      if (selected && state.dirty) head.append(dirtyBadge());
      tile.append(head);
      tile.append(
        el('p', { class: 'tile-title' }, [
          el('button', {
            type: 'button',
            class: 'title-button',
            text: titleOf(node),
            attrs: { title: titleOf(node) },
          }),
        ]),
      );
      return tile;
    }
    const item = el('li', {
      class: 'leaf outline-leaf',
      dataset: { nodeId: entry.node.id, selected: String(selected) },
      attrs: { 'aria-current': selected ? 'true' : null },
    });
    item.append(el('span', { class: 'leaf-label', text: leafLabelText(entry) }));
    item.append(
      el('span', { class: 'outline-title' }, [
        el('button', { type: 'button', class: 'title-button', text: titleOf(node) }),
      ]),
    );
    const badge = commentBadge(entry.openComments);
    if (badge) item.append(badge);
    if (selected && state.dirty) item.append(dirtyBadge());
    return item;
  }

  const card = el('article', {
    class: `leaf ${slides ? 'slide-card' : 'paragraph'}`,
    dataset: { nodeId: entry.node.id, selected: String(selected) },
    attrs: { 'aria-current': selected ? 'true' : null },
  });
  const head = el('div', { class: 'leaf-head' });
  head.append(el('span', { class: 'leaf-label', text: leafLabelText(entry) }));
  const badge = commentBadge(entry.openComments);
  if (badge) head.append(badge);
  if (selected && state.dirty) head.append(dirtyBadge());
  card.append(head);
  card.append(
    el('h4', { class: 'leaf-title' }, [
      el('button', {
        type: 'button',
        class: 'title-button',
        text: titleOf(node),
        attrs: { title: titleOf(node) },
      }),
    ]),
  );
  card.append(leafContent(node));
  const sources = sourcesLine(node.sources);
  if (sources) card.append(sources);
  return card;
}

/* ------------------------------------------------------------------ */
/* TOC                                                                 */
/* ------------------------------------------------------------------ */

function currentTocId() {
  const entry = outlineEntry(state.selectedId);
  if (!entry) return null;
  if (entry.role !== 'leaf') return entry.node.id;
  const parent = outlineEntry(entry.node.parentId);
  return parent?.node.id ?? state.story.rootId;
}

function renderToc() {
  const nav = document.getElementById('toc-nav');
  nav.setAttribute('aria-label', t('tocTitle'));
  document.getElementById('toc-heading').textContent = t('tocTitle');
  document.getElementById('expand-all').textContent = t('expandAllButton');
  document.getElementById('collapse-all').textContent = t('collapseAllButton');
  nav.replaceChildren();
  const root = outlineEntry(state.story.rootId);
  if (!root) return;
  nav.append(renderTocRow(root, 0));
}

function renderTocRow(entry, level) {
  const wrap = el('div', { class: 'toc-node' });
  const current = currentTocId() === entry.node.id;
  const row = el('div', {
    class: `toc-row toc-level-${level}`,
    dataset: { nodeId: entry.node.id, current: String(current) },
    attrs: { 'aria-current': current ? 'true' : null },
  });
  const claimChildren = entry.children.filter((id) => outlineEntry(id)?.role !== 'leaf');
  const collapsed = state.collapsed.has(entry.node.id);
  if (claimChildren.length > 0) {
    row.append(
      el('button', {
        type: 'button',
        class: 'toc-toggle',
        text: collapsed ? '▸' : '▾',
        attrs: {
          'aria-expanded': String(!collapsed),
          'aria-label': t('collapseToggleAria', { title: titleOf(entry.node) }),
        },
        on: {
          click: (event) => {
            event.stopPropagation();
            toggleCollapse(entry.node.id);
          },
        },
      }),
    );
  } else {
    row.append(el('span', { class: 'toc-toggle', attrs: { 'aria-hidden': 'true' } }));
  }
  if (entry.role === 'topic') {
    row.append(el('span', { class: 'toc-role', text: roleLabel('topic') }));
  } else {
    row.append(el('span', { class: 'toc-number', text: entry.number }));
  }
  row.append(
    el('button', {
      type: 'button',
      class: 'toc-title',
      text: titleOf(entry.node),
      attrs: { title: titleOf(entry.node) },
      on: { click: () => void selectFromToc(entry.node.id) },
    }),
  );
  row.append(el('span', { class: 'toc-count', text: countText(entry.leafTotal) }));
  const badge = commentBadge(entry.openCommentsInSubtree);
  if (badge) row.append(badge);
  if (entry.role !== 'topic' && entry.leafTotal === 0) {
    row.append(
      el('span', {
        class: 'toc-warn',
        text: '!',
        attrs: { 'aria-hidden': 'true', title: emptyWarningText() },
      }),
    );
    row.append(el('span', { class: 'visually-hidden', text: emptyWarningText() }));
  }
  wrap.append(row);
  if (claimChildren.length > 0 && !collapsed) {
    const children = el('div', { class: 'toc-children' });
    for (const childId of claimChildren) {
      const child = outlineEntry(childId);
      if (child) children.append(renderTocRow(child, level + 1));
    }
    wrap.append(children);
  }
  return wrap;
}

function toggleCollapse(nodeId) {
  if (state.collapsed.has(nodeId)) state.collapsed.delete(nodeId);
  else state.collapsed.add(nodeId);
  const tocScroll = document.getElementById('toc-panel').scrollTop;
  renderToc();
  document.getElementById('toc-panel').scrollTop = tocScroll;
}

/* ------------------------------------------------------------------ */
/* Workflow zone                                                       */
/* ------------------------------------------------------------------ */

function renderWorkflowZone() {
  const zone = document.getElementById('workflow-zone');
  zone.replaceChildren();
  const parts = [];
  if (state.notice) parts.push(renderNotice());
  const pending = (state.story.proposals ?? []).filter((proposal) => proposal.status === 'pending');
  for (const proposal of [...pending].reverse()) parts.push(renderProposalCard(proposal));
  const history = (state.story.proposals ?? []).filter((proposal) => proposal.status !== 'pending');
  if (history.length > 0) parts.push(renderProposalHistory([...history].reverse()));
  const nodeIds = new Set(nodesOf().map((node) => node.id));
  const orphans = (state.story.comments ?? []).filter((comment) => !nodeIds.has(comment.nodeId));
  if (orphans.length > 0) parts.push(renderOrphanComments(orphans));
  zone.hidden = parts.length === 0;
  zone.append(...parts);
}

function noticeRow(label, value) {
  return [el('dt', { text: label }), el('dd', { text: value })];
}

function renderNotice() {
  const notice = state.notice;
  const card = el('div', { class: 'notice', attrs: { role: 'note' } });
  const head = el('div', { class: 'notice-head' });
  head.append(el('strong', { text: notice.kind === 'export' ? t('exportReadyTitle') : t('roundReadyTitle') }));
  if (notice.kind === 'export') {
    head.append(el('span', { class: 'workflow-meta', text: t('revisionLabel', { revision: notice.data.revision }) }));
  }
  head.append(
    el('button', {
      type: 'button',
      class: 'button button-small',
      text: t('dismissNoticeButton'),
      on: {
        click: () => {
          state.notice = null;
          renderWorkflowZone();
        },
      },
    }),
  );
  card.append(head);
  const dl = el('dl');
  if (notice.kind === 'export') {
    dl.append(...noticeRow(t('exportDirectoryLabel'), notice.data.relativeDirectory));
    dl.append(...noticeRow(t('projectPathLabel'), notice.data.projectDir ?? ''));
    dl.append(...noticeRow(t('exportFilesLabel'), (notice.data.files ?? []).join(', ')));
  } else {
    dl.append(...noticeRow(t('roundIdLabel'), notice.data.roundId));
    dl.append(...noticeRow(t('projectPathLabel'), notice.data.projectDir ?? ''));
    dl.append(el('dt', { text: t('continueInstructionLabel') }));
    dl.append(el('dd', {}, [el('pre', { text: t('continueInstructionText', {
      roundId: notice.data.roundId,
      projectPath: notice.data.projectDir ?? '',
    }).trim() })]));
  }
  card.append(dl);
  if (notice.kind === 'export') {
    if (notice.data.reused) card.append(el('p', { class: 'hint', text: t('exportReusedNote') }));
  } else {
    card.append(el('p', { class: 'hint', text: t('noModelCallNotice') }));
  }
  return card;
}

function compareProposal(proposal) {
  const round = state.story.rounds.find((entry) => entry.id === proposal.roundId) ?? null;
  const before = new Map((round?.nodes ?? []).map((node) => [node.id, node]));
  const after = new Map(proposal.nodes.map((node) => [node.id, node]));
  const changes = [];
  for (const [id, node] of after) {
    const previous = before.get(id);
    if (!previous) {
      changes.push({ nodeId: id, kind: 'added', title: node.title, nodeKind: node.kind });
      continue;
    }
    const moved = previous.parentId !== node.parentId || previous.position !== node.position;
    const edited =
      previous.title !== node.title ||
      JSON.stringify(previous.blocks) !== JSON.stringify(node.blocks) ||
      JSON.stringify(previous.sources) !== JSON.stringify(node.sources);
    if (edited) changes.push({ nodeId: id, kind: 'changed', title: node.title, nodeKind: node.kind });
    if (moved) changes.push({ nodeId: id, kind: 'moved', title: node.title, nodeKind: node.kind });
  }
  for (const [id, node] of before) {
    if (!after.has(id)) changes.push({ nodeId: id, kind: 'removed', title: node.title, nodeKind: node.kind });
  }
  const stale = round === null || proposal.baseRevision !== state.story.revision || round.baseRevision !== state.story.revision;
  return { changes, stale };
}

function changeLabel(kind) {
  if (kind === 'added') return t('changeAdded');
  if (kind === 'removed') return t('changeRemoved');
  if (kind === 'moved') return t('changeMovedBranch');
  return t('changeChanged');
}

function changeTitle(change) {
  const title = String(change.title ?? '').trim();
  if (title !== '') return title;
  return fallbackTitle({ kind: change.nodeKind });
}

function renderProposalCard(proposal) {
  const { changes, stale } = compareProposal(proposal);
  const card = el('div', { class: 'proposal-card' });
  const head = el('div', { class: 'workflow-head' });
  head.append(el('strong', { text: t('pendingProposalTitle') }));
  head.append(el('span', { class: 'workflow-meta', text: `${formatTime(proposal.createdAt)} · r${proposal.baseRevision}` }));
  card.append(head);
  card.append(
    el('p', { class: 'proposal-summary' }, [
      el('span', { class: 'field-label', text: t('proposalSummaryLabel') }),
      document.createTextNode(proposal.summary ?? ''),
    ]),
  );
  if (stale) card.append(el('p', { class: 'comment-warn', text: t('staleProposalWarning') }));

  const expanded = state.expandedProposals.has(proposal.id);
  const toggles = el('div', { class: 'proposal-toggles' });
  toggles.append(el('span', { class: 'change-count', text: t('proposalChangeCount', { count: changes.length }) }));
  toggles.append(
    el('button', {
      type: 'button',
      class: 'button button-small',
      text: t('proposalDetailsLabel'),
      attrs: { 'aria-expanded': String(expanded) },
      on: {
        click: () => {
          if (expanded) state.expandedProposals.delete(proposal.id);
          else state.expandedProposals.add(proposal.id);
          renderWorkflowZone();
        },
      },
    }),
  );
  card.append(toggles);

  if (expanded) {
    const list = el('ul', { class: 'proposal-changes' });
    for (const change of changes) {
      const label = `${changeLabel(change.kind)} ${changeTitle(change)}`;
      const item = el('li', { class: `change-${change.kind}` });
      if (outlineEntry(change.nodeId)) {
        item.append(
          el('button', {
            type: 'button',
            class: 'link-button',
            text: label,
            on: { click: () => void selectNode(change.nodeId, { focus: false }) },
          }),
        );
      } else {
        item.append(el('span', { text: label }));
      }
      list.append(item);
    }
    card.append(list);
  }

  if ((proposal.addressedCommentIds ?? []).length > 0) {
    const addressed = el('div', { class: 'addressed-comments' });
    addressed.append(el('span', { class: 'field-label', text: t('addressedCommentsLabel') }));
    const list = el('ul', { class: 'proposal-changes' });
    for (const commentId of proposal.addressedCommentIds) {
      const comment = state.story.comments.find((entry) => entry.id === commentId);
      list.append(el('li', { text: comment ? comment.body : commentId }));
    }
    addressed.append(list);
    card.append(addressed);
  }

  const actions = el('div', { class: 'proposal-actions' });
  actions.append(
    el('button', {
      type: 'button',
      class: 'button button-primary',
      text: t('acceptProposalButton'),
      attrs: { disabled: stale },
      on: { click: () => void decideProposal(proposal.id, 'accept') },
    }),
    el('button', {
      type: 'button',
      class: 'button',
      text: t('rejectProposalButton'),
      on: { click: () => void decideProposal(proposal.id, 'reject') },
    }),
  );
  card.append(actions);
  return card;
}

function workflowDetails(key, summaryText, children) {
  const details = el('details', {
    class: 'workflow-details',
    attrs: { open: state.workflowDetails.has(key) ? true : null },
    on: {
      toggle: (event) => {
        if (event.target.open) state.workflowDetails.add(key);
        else state.workflowDetails.delete(key);
      },
    },
  });
  details.append(el('summary', { text: summaryText }));
  details.append(...children);
  return details;
}

function renderProposalHistory(proposals) {
  const entries = proposals.map((proposal) => {
    const entry = el('div', { class: 'workflow-entry' });
    const status = proposal.status === 'accepted' ? t('proposalStatusAccepted') : t('proposalStatusRejected');
    entry.append(
      el('div', { class: 'workflow-head' }, [
        el('strong', { text: status, attrs: { class: `status status-${proposal.status}` } }),
        el('span', { class: 'workflow-meta', text: `${formatTime(proposal.createdAt)} · r${proposal.baseRevision}` }),
      ]),
    );
    entry.append(el('p', { class: 'proposal-summary', text: proposal.summary ?? '' }));
    return entry;
  });
  return workflowDetails('history', t('proposalHistoryTitle', { count: proposals.length }), entries);
}

function renderOrphanComments(comments) {
  const entries = comments.map((comment) => {
    const entry = el('div', { class: 'workflow-entry' });
    entry.append(
      el('div', { class: 'workflow-head' }, [
        el('span', { text: comment.status === 'open' ? t('commentStatusOpen') : t('commentStatusResolved') }),
        el('span', { class: 'workflow-meta', text: formatTime(comment.createdAt) }),
      ]),
    );
    entry.append(el('p', { class: 'comment-warn', text: t('deletedTargetWarning') }));
    entry.append(el('p', { class: 'comment-body', text: comment.body }));
    return entry;
  });
  return workflowDetails('orphans', t('orphanCommentsTitle', { count: comments.length }), entries);
}

/* ------------------------------------------------------------------ */
/* Inspector                                                           */
/* ------------------------------------------------------------------ */

function renderInspector() {
  const inspector = document.getElementById('inspector');
  inspector.setAttribute('aria-label', t('inspectorAria'));
  const head = document.getElementById('inspector-head');
  head.tabIndex = -1;
  head.replaceChildren();
  renderConflict();
  const editor = document.getElementById('node-editor');
  editor.replaceChildren();
  const bar = document.getElementById('save-bar');
  bar.replaceChildren();

  if (!state.story) {
    editor.append(el('p', { class: 'hint', text: t('loadingLabel') }));
    return;
  }
  const entry = outlineEntry(state.selectedId) ?? outlineEntry(state.story.rootId);
  if (!entry || !state.draft) {
    editor.append(el('p', { class: 'hint', text: t('loadingLabel') }));
    return;
  }

  head.append(el('div', { class: 'inspector-role' }, [
    el('span', { class: 'role-tag', text: roleLabel(entry.role) }),
    entry.role === 'leaf'
      ? el('span', { class: 'claim-number', text: leafLabelText(entry) })
      : entry.number
        ? el('span', { class: 'claim-number', text: entry.number })
        : null,
  ]));
  head.append(renderBreadcrumb(entry));
  head.append(
    el('button', {
      type: 'button',
      class: 'button button-small',
      text: t('locateInStoryButton'),
      on: { click: () => locateInStory() },
    }),
  );

  const copyForRole = titleCopy(entry.role);

  const titleSection = el('div', { class: 'field' });
  titleSection.append(el('label', { class: 'field-label', htmlFor: 'inspector-title', text: copyForRole.label }));
  const titleField = el('textarea', {
    id: 'inspector-title',
    rows: 2,
    value: state.draft.title,
    class: 'title-field',
    dataset: { focusPart: 'title' },
    attrs: { placeholder: copyForRole.placeholder, 'aria-describedby': 'inspector-title-hint' },
    on: {
      input: (event) => {
        const field = event.target;
        const raw = field.value;
        if (/[\r\n]/u.test(raw)) {
          const caret = field.selectionStart ?? raw.length;
          const before = raw.slice(0, caret).replace(/[\r\n]+/gu, ' ').length;
          field.value = raw.replace(/[\r\n]+/gu, ' ');
          const position = Math.max(0, Math.min(field.value.length, before));
          field.setSelectionRange(position, position);
        }
        state.draft.title = field.value;
        markDirty(true);
        autoGrow(field);
      },
      keydown: (event) => {
        if (event.key === 'Enter') event.preventDefault();
      },
    },
  });
  titleSection.append(titleField, el('p', { id: 'inspector-title-hint', class: 'hint', text: copyForRole.hint }));
  bindAutoGrow(titleField);
  editor.append(titleSection);

  const contentSection = el('section', { class: 'inspector-section' });
  contentSection.append(el('h3', { class: 'section-heading', text: copyForRole.content }));
  const blocks = el('div', { class: 'blocks' });
  if (state.draft.blocks.length === 0) blocks.append(el('p', { class: 'hint', text: t('emptyContentHint') }));
  state.draft.blocks.forEach((block, index) => blocks.append(blockEditor(block, index)));
  contentSection.append(blocks);

  const addRow = el('div', { class: 'add-block-row' });
  for (const [type, label] of [
    ['markdown', t('addBlockMarkdown')],
    ['table', t('addBlockTable')],
    ['image', t('addBlockImage')],
    ['math', t('addBlockMath')],
  ]) {
    addRow.append(el('button', { type: 'button', class: 'button button-small', text: label, on: { click: () => addBlock(type) } }));
  }
  contentSection.append(addRow);
  editor.append(contentSection);

  editor.append(renderSources(state.draft));
  editor.append(renderStructure(entry));
  editor.append(renderComments(entry));

  const indicator = el('span', {
    id: 'save-dirty',
    class: 'save-dirty',
    text: state.dirty ? t('unsavedBadge') : '',
  });
  bar.append(indicator);
  bar.append(
    el('button', {
      type: 'button',
      class: 'button button-primary',
      text: t('saveButton'),
      on: { click: () => void commitDraft() },
    }),
  );
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

function ancestorLabel(node) {
  const entry = outlineEntry(node.id);
  if (node.kind === 'topic') return `${t('roleTopic')} · ${titleOf(node)}`;
  if (node.kind === 'claim') return `${entry?.number ?? ''} · ${titleOf(node)}`;
  return titleOf(node);
}

function renderBreadcrumb(entry) {
  const nav = el('nav', { class: 'breadcrumb', attrs: { 'aria-label': t('breadcrumbAria') } });
  const chain = ancestorsOf(entry.node.id);
  chain.forEach((node, index) => {
    const item = el('span', { class: 'breadcrumb-item' });
    if (index > 0) item.append(el('span', { class: 'breadcrumb-sep', text: '/' }));
    const last = index === chain.length - 1;
    if (last) {
      item.append(el('span', { class: 'breadcrumb-current', text: ancestorLabel(node) }));
    } else {
      item.append(
        el('button', {
          type: 'button',
          class: 'breadcrumb-link',
          text: ancestorLabel(node),
          on: {
            click: async () => {
              const selected = await selectNode(node.id, { focus: false });
              if (!selected) return;
              document.getElementById('inspector-head')?.focus({ preventScroll: true });
            },
          },
        }),
      );
    }
    nav.append(item);
  });
  return nav;
}

function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight + 2}px`;
}

function bindAutoGrow(textarea) {
  requestAnimationFrame(() => autoGrow(textarea));
  textarea.addEventListener('input', () => autoGrow(textarea));
}

function captureFocusState() {
  const active = document.activeElement;
  if (!active || active === document.body) return null;
  const part = active.dataset?.focusPart;
  if (!part) return null;
  const blockHost = active.closest('[data-block-id]');
  return {
    nodeId: state.selectedId,
    blockId: blockHost?.dataset.blockId ?? null,
    part,
    start: typeof active.selectionStart === 'number' ? active.selectionStart : null,
    end: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
    scrollTop: active.scrollTop ?? null,
  };
}

function restoreFocusState(snapshot) {
  if (!snapshot || snapshot.nodeId !== state.selectedId) return false;
  const scope = snapshot.blockId ? `[data-block-id="${CSS.escape(snapshot.blockId)}"] ` : '';
  const target = document.querySelector(`#node-editor ${scope}[data-focus-part="${CSS.escape(snapshot.part)}"]`);
  if (!target) return false;
  target.focus({ preventScroll: true });
  if (snapshot.start !== null && typeof target.setSelectionRange === 'function') {
    const length = target.value?.length ?? 0;
    const start = Math.min(snapshot.start, length);
    const end = Math.min(snapshot.end ?? start, length);
    target.setSelectionRange(start, end);
  }
  if (snapshot.scrollTop !== null && 'scrollTop' in target) target.scrollTop = snapshot.scrollTop;
  return true;
}

/* ------------------------------------------------------------------ */
/* Block editors                                                       */
/* ------------------------------------------------------------------ */

function blockTypeLabel(type) {
  if (type === 'markdown') return t('blockTypeMarkdown');
  if (type === 'table') return t('blockTypeTable');
  if (type === 'image') return t('blockTypeImage');
  return t('blockTypeMath');
}

function blockEditor(block, index) {
  const typeLabel = blockTypeLabel(block.type);
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
  return el('div', { class: 'block', dataset: { blockId: block.id } }, [
    el('div', { class: 'block-head' }, [el('strong', { text: typeLabel }), actions]),
    body,
  ]);
}

function markdownBlockEditor(block) {
  const wrap = el('div');
  const textarea = el('textarea', {
    value: block.text,
    class: 'markdown-field',
    dataset: { focusPart: 'text' },
    attrs: { 'aria-label': t('markdownLabel') },
    on: {
      input: (event) => {
        block.text = event.target.value;
        markDirty(true);
      },
    },
  });
  bindAutoGrow(textarea);
  wrap.append(el('label', { class: 'field-label', text: t('markdownLabel') }), textarea);
  return wrap;
}

function markScrollableTables() {
  for (const scroller of document.querySelectorAll('.table-editor')) {
    scroller.dataset.scrollable = scroller.scrollWidth > scroller.clientWidth ? 'true' : 'false';
  }
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
        dataset: { focusPart: `column-${columnIndex}` },
        attrs: { placeholder: t('tableColumnPlaceholder'), 'aria-label': `${t('tableColumnsLabel')} ${columnIndex + 1}` },
        on: {
          input: (event) => {
            block.columns[columnIndex] = event.target.value;
            markDirty(true);
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
              markDirty(true);
              renderInspector();
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
          dataset: { focusPart: `cell-${rowIndex}-${columnIndex}` },
          attrs: { placeholder: t('tableCellPlaceholder'), 'aria-label': `${t('tableColumnsLabel')} ${columnIndex + 1} ${rowIndex + 1}` },
          on: {
            input: (event) => {
              block.rows[rowIndex][columnIndex] = event.target.value;
              markDirty(true);
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
            markDirty(true);
            renderInspector();
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
          markDirty(true);
          renderInspector();
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
          markDirty(true);
          renderInspector();
        },
      },
    }),
  );

  const caption = el('input', {
    type: 'text',
    value: block.caption,
    dataset: { focusPart: 'caption' },
    attrs: { placeholder: t('tableCaptionPlaceholder'), 'aria-label': t('tableCaptionLabel') },
    on: {
      input: (event) => {
        block.caption = event.target.value;
        markDirty(true);
      },
    },
  });

  wrap.append(
    el('span', { class: 'field-label', text: t('tableColumnsLabel') }),
    el('div', { class: 'table-editor' }, [table, foot]),
    el('div', { class: 'field' }, [el('label', { class: 'field-label', text: t('tableCaptionLabel') }), caption]),
  );
  requestAnimationFrame(markScrollableTables);
  return wrap;
}

function imageBlockEditor(block) {
  const wrap = el('div');
  const asset = state.story.assets.find((entry) => entry.id === block.assetId) ?? null;
  const preview = el('img', { class: 'image-preview', alt: block.alt, dataset: { assetId: block.assetId } });
  if (!useCachedAsset(preview, block.assetId)) {
    preview.hidden = true;
    loadAssetUrl(block.assetId).then((url) => {
      if (!url) return;
      trackAssetSize(block.assetId, preview);
      preview.src = url;
      preview.hidden = false;
    });
  }
  const fileInput = el('input', {
    type: 'file',
    accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml',
    dataset: { focusPart: 'file' },
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
          markDirty(true);
          render();
          setStatus(t('savedLabel'), 'ok');
        } catch (error) {
          setStatus(`${t('uploadFailedLabel')} ${error.message}`, 'error');
        } finally {
          event.target.value = '';
        }
      },
    },
  });
  const roleSelect = el('select', {
    dataset: { focusPart: 'role' },
    attrs: { 'aria-label': t('imageRoleLabel') },
    on: {
      change: (event) => {
        block.role = event.target.value === 'icon' ? 'icon' : 'figure';
        markDirty(true);
      },
    },
  });
  roleSelect.append(el('option', { value: 'figure', text: t('imageRoleFigure') }), el('option', { value: 'icon', text: t('imageRoleIcon') }));
  roleSelect.value = block.role;
  const alt = el('input', {
    type: 'text',
    value: block.alt,
    dataset: { focusPart: 'alt' },
    attrs: { placeholder: t('imageAltPlaceholder'), 'aria-label': t('imageAltLabel') },
    on: {
      input: (event) => {
        block.alt = event.target.value;
        preview.alt = event.target.value;
        markDirty(true);
      },
    },
  });
  const caption = el('input', {
    type: 'text',
    value: block.caption,
    dataset: { focusPart: 'caption' },
    attrs: { placeholder: t('imageCaptionPlaceholder'), 'aria-label': t('imageCaptionLabel') },
    on: {
      input: (event) => {
        block.caption = event.target.value;
        markDirty(true);
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
  const latexId = `math-latex-${block.id}`;
  const displayId = `math-display-${block.id}`;
  const textarea = el('textarea', {
    id: latexId,
    value: block.latex,
    class: 'markdown-field',
    dataset: { focusPart: 'latex' },
    on: {
      input: (event) => {
        block.latex = event.target.value;
        markDirty(true);
      },
    },
  });
  bindAutoGrow(textarea);
  const displayBox = el('input', {
    type: 'checkbox',
    id: displayId,
    checked: block.display,
    dataset: { focusPart: 'display' },
    on: {
      change: (event) => {
        block.display = event.target.checked;
        markDirty(true);
      },
    },
  });
  wrap.append(
    el('label', { class: 'field-label', htmlFor: latexId, text: t('mathLatexLabel') }),
    textarea,
    el('div', { class: 'field' }, [
      el('label', { class: 'field-label', htmlFor: displayId }, [displayBox, document.createTextNode(` ${t('mathDisplayLabel')}`)]),
    ]),
  );
  return wrap;
}

function renderSources(draft) {
  const wrap = el('section', { class: 'sources inspector-section' });
  wrap.append(el('h3', { class: 'section-heading', text: t('sourcesSectionTitle') }));
  draft.sources.forEach((source, index) => {
    const row = el('div', { class: 'source-row' });
    row.append(
      el('input', {
        type: 'text',
        value: source.label ?? '',
        dataset: { focusPart: `label-${index}` },
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
        dataset: { focusPart: `url-${index}` },
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
            renderInspector();
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
          renderInspector();
        },
      },
    }),
  );
  return wrap;
}

/* ------------------------------------------------------------------ */
/* Structure actions                                                   */
/* ------------------------------------------------------------------ */

function renderStructure(entry) {
  const section = el('section', { class: 'structure inspector-section' });
  section.append(el('h3', { class: 'section-heading', text: t('structureSectionTitle') }));
  const actions = el('div', { class: 'structure-actions' });
  const node = entry.node;

  if (entry.role === 'topic') {
    actions.append(
      el('button', {
        type: 'button',
        class: 'button button-small',
        text: t('addChapterButton'),
        on: { click: guard(() => addNode('claim', node.id)) },
      }),
    );
  }
  if (entry.role === 'chapter' || entry.role === 'section') {
    actions.append(
      el('button', {
        type: 'button',
        class: 'button button-small',
        text: t('addSectionButton'),
        on: { click: guard(() => addNode('claim', node.id)) },
      }),
      el('button', {
        type: 'button',
        class: 'button button-small',
        text: isSlides() ? t('addPageButton') : t('addParagraphButton'),
        on: { click: guard(() => addNode('evidence', node.id)) },
      }),
      el('button', {
        type: 'button',
        class: 'button button-small',
        text: entry.role === 'chapter' ? t('insertChapterAfterButton') : t('insertSectionAfterButton'),
        on: { click: guard(() => insertAfter('claim', node.id)) },
      }),
    );
  }
  if (entry.role === 'leaf') {
    actions.append(
      el('button', {
        type: 'button',
        class: 'button button-small',
        text: isSlides() ? t('insertPageAfterButton') : t('insertParagraphAfterButton'),
        on: { click: guard(() => insertAfter('evidence', node.id)) },
      }),
    );
  }

  if (entry.role !== 'topic') {
    const siblings = childrenOf(node.parentId);
    const index = siblings.findIndex((sibling) => sibling.id === node.id);
    actions.append(
      el('button', {
        type: 'button',
        class: 'button button-small',
        text: t('moveUpButton'),
        attrs: { disabled: index <= 0 },
        on: { click: guard(() => moveNode(node.id, -1)) },
      }),
      el('button', {
        type: 'button',
        class: 'button button-small',
        text: t('moveDownButton'),
        attrs: { disabled: index === -1 || index >= siblings.length - 1 },
        on: { click: guard(() => moveNode(node.id, 1)) },
      }),
    );
  }
  section.append(actions);

  if (entry.role !== 'topic') {
    const targets = reparentTargets(entry);
    if (targets.length > 0) {
      const row = el('div', { class: 'structure-row' });
      const select = el('select', { class: 'reparent-select', attrs: { 'aria-label': t('reparentLabel') } });
      for (const target of targets) {
        const targetEntry = outlineEntry(target.id);
        const label = target.kind === 'topic'
          ? `${t('roleTopic')} · ${titleOf(target)}`
          : `${roleLabel(targetEntry?.role ?? 'chapter')} ${targetEntry?.number ?? ''} · ${titleOf(target)}`;
        select.append(el('option', { value: target.id, text: label }));
      }
      row.append(select);
      row.append(
        el('button', {
          type: 'button',
          class: 'button button-small',
          text: t('reparentButton'),
          on: { click: guard(() => reparentNode(node.id, select.value)) },
        }),
      );
      section.append(row);
    }
  }

  if (entry.role !== 'topic') {
    section.append(
      el('div', { class: 'structure-row structure-danger' }, [
        el('button', {
          type: 'button',
          class: 'button button-small button-danger',
          text: t('deleteButton'),
          on: { click: guard(() => deleteNode(node.id)) },
        }),
      ]),
    );
  }
  return section;
}

function reparentTargets(entry) {
  const node = entry.node;
  const subtree = entry.role === 'leaf' ? null : new Set(subtreeIds(node.id).ids);
  const targets = [];
  for (const candidateEntry of state.outline?.values() ?? []) {
    const candidate = candidateEntry.node;
    if (candidate.id === node.parentId) continue;
    if (entry.role === 'leaf') {
      if (candidate.kind === 'claim') targets.push(candidate);
      continue;
    }
    if (candidate.kind === 'topic') {
      targets.push(candidate);
      continue;
    }
    if (candidate.kind !== 'claim') continue;
    if (subtree?.has(candidate.id)) continue;
    targets.push(candidate);
  }
  return targets;
}

function guard(action) {
  return async () => {
    if (state.busy) return;
    state.busy = true;
    try {
      await action();
    } finally {
      state.busy = false;
    }
  };
}

function selectAddedNode(id) {
  state.selectedId = id;
  state.draft = null;
  state.dirty = false;
  state.focusTitle = true;
  state.resetInspectorScroll = true;
}

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
    selectAddedNode(id);
    applyStory(result.story);
  } catch (error) {
    handleWriteError(error);
  }
}

async function insertAfter(kind, referenceId) {
  if (!(await commitDraft({ silent: true }))) return;
  const reference = nodesById().get(referenceId);
  if (!reference || reference.parentId === null) return;
  const parentId = reference.parentId;
  const position = reference.position + 1;
  const id = newId();
  const payload = candidateTree().map((entry) => {
    if (entry.parentId === parentId && entry.position >= position) return { ...entry, position: entry.position + 1 };
    return entry;
  });
  payload.push(serializeNode({ id, parentId, kind, position, title: '', blocks: [], sources: [] }));
  try {
    const result = await api('/api/tree', {
      method: 'PUT',
      body: { expectedRevision: state.story.revision, nodes: payload },
    });
    selectAddedNode(id);
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
    if (entry.parentId !== node.parentId) return entry;
    const position = reordered.findIndex((sibling) => sibling.id === entry.id);
    return position === -1 ? entry : { ...entry, position };
  });
  try {
    const result = await api('/api/tree', {
      method: 'PUT',
      body: { expectedRevision: state.story.revision, nodes },
    });
    applyStory(result.story);
  } catch (error) {
    handleWriteError(error);
  }
}

async function reparentNode(nodeId, parentId) {
  if (!parentId) return;
  if (!(await commitDraft({ silent: true }))) return;
  const node = nodesById().get(nodeId);
  const position = childrenOf(parentId).length;
  const payload = candidateTree().map((entry) => {
    if (entry.id === nodeId) return { ...entry, parentId, position };
    if (entry.parentId === node.parentId && entry.position > node.position) {
      return { ...entry, position: entry.position - 1 };
    }
    return entry;
  });
  try {
    const result = await api('/api/tree', {
      method: 'PUT',
      body: { expectedRevision: state.story.revision, nodes: payload },
    });
    state.resetInspectorScroll = true;
    applyStory(result.story);
  } catch (error) {
    handleWriteError(error);
  }
}

async function deleteNode(nodeId) {
  const node = nodesById().get(nodeId);
  if (!node) return;
  const { ids, count } = subtreeIds(nodeId);
  const message = count === 0
    ? t('deleteLeafConfirm', { title: titleOf(node) })
    : t('deleteBranchConfirm', { title: titleOf(node), count });
  const confirmed = await showDialog(message, [
    { label: t('confirmDeleteButton'), value: 'delete', danger: true },
    { label: t('cancelButton'), value: null },
  ]);
  if (confirmed !== 'delete') return;
  if (!(await commitDraft({ silent: true }))) return;
  const remove = new Set(ids);
  const nodes = candidateTree()
    .filter((entry) => !remove.has(entry.id))
    .map((entry) => {
      if (entry.parentId === null || remove.has(entry.parentId)) return entry;
      const siblings = childrenOf(entry.parentId).filter((sibling) => !remove.has(sibling.id));
      const position = siblings.findIndex((sibling) => sibling.id === entry.id);
      return position === -1 ? entry : { ...entry, position };
    });
  try {
    const result = await api('/api/tree', {
      method: 'PUT',
      body: { expectedRevision: state.story.revision, nodes },
    });
    if (remove.has(state.selectedId)) {
      state.selectedId = result.story.rootId;
      state.draft = null;
      state.dirty = false;
      state.resetInspectorScroll = true;
    }
    applyStory(result.story);
  } catch (error) {
    handleWriteError(error);
  }
}

/* ------------------------------------------------------------------ */
/* Draft reconciliation                                                */
/* ------------------------------------------------------------------ */

async function reapplyDraft() {
  try {
    const latest = await api('/api/story');
    state.story = latest;
    state.conflict = null;
    if (!state.selectedId || !nodesById().has(state.selectedId)) {
      state.selectedId = latest.rootId;
      state.resetInspectorScroll = true;
    }
    if (state.draft && nodesById().has(state.draft.nodeId)) {
      state.dirty = true;
    } else {
      const node = nodesById().get(state.selectedId);
      state.draft = node ? snapshotDraft(node) : null;
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
    if (!state.selectedId || !nodesById().has(state.selectedId)) {
      state.selectedId = latest.rootId;
    }
    const node = nodesById().get(state.selectedId);
    state.draft = node ? snapshotDraft(node) : null;
    state.resetInspectorScroll = true;
    render();
    setStatus('');
  } catch (error) {
    setStatus(`${t('loadFailedLabel')} ${error.message}`, 'error');
  }
}

function tocVisible() {
  if (window.innerWidth >= 1200) return true;
  if (window.innerWidth >= 760) return state.tocOpen;
  return state.tab === 'outline';
}

function focusSelected(origin) {
  if (!state.selectedId) return;
  let target = null;
  if (origin === 'toc' && tocVisible()) {
    target = document.querySelector(`#toc-nav [data-node-id="${CSS.escape(state.selectedId)}"] .toc-title`);
  }
  if (!target) {
    target = document.querySelector(`#story-body [data-node-id="${CSS.escape(state.selectedId)}"] .title-button`);
  }
  if (target) target.focus({ preventScroll: true });
}

function refreshCanvasNode(nodeId) {
  const entry = outlineEntry(nodeId);
  if (!entry) return;
  const existing = document.querySelector(`#story-body [data-node-id="${CSS.escape(nodeId)}"]`);
  if (!existing) return;
  const selected = state.selectedId === nodeId;
  existing.dataset.selected = String(selected);
  if (selected) existing.setAttribute('aria-current', 'true');
  else existing.removeAttribute('aria-current');
  if (entry.role === 'leaf') {
    existing.replaceWith(renderLeafElement(entry));
  } else {
    const self = existing.querySelector(':scope > .node-self');
    if (self) self.replaceWith(renderNodeSelf(entry));
  }
  if (entry.role === 'topic') renderRootTitle();
}

function renderSelectionChange(previousId, origin, focus) {
  if (state.liveTimer) {
    clearTimeout(state.liveTimer);
    state.liveTimer = null;
  }
  const canvas = document.getElementById('canvas');
  const tocPanel = document.getElementById('toc-panel');
  const canvasScroll = canvas?.scrollTop ?? 0;
  const tocScroll = tocPanel?.scrollTop ?? 0;
  const inspector = document.getElementById('inspector');
  const inspectorScroll = state.resetInspectorScroll ? 0 : inspector?.scrollTop ?? 0;
  state.resetInspectorScroll = false;

  renderHeader();
  renderToc();
  renderInspector();
  applyTabState();
  if (previousId !== state.selectedId) refreshCanvasNode(previousId);
  refreshCanvasNode(state.selectedId);
  renderAssetUrls();

  if (canvas) canvas.scrollTop = canvasScroll;
  if (tocPanel) tocPanel.scrollTop = tocScroll;
  if (inspector) inspector.scrollTop = inspectorScroll;
  if (focus) focusSelected(origin);
}

async function selectNode(nodeId, { origin = 'canvas', focus = true } = {}) {
  if (!state.story) return false;
  if (nodeId === state.selectedId) {
    state.tab = 'editor';
    applyTabState();
    if (window.innerWidth < 760) window.scrollTo(0, 0);
    return true;
  }
  if (state.dirty) {
    const choice = await showDialog(t('unsavedTitle'), [
      { label: t('saveAndSwitchButton'), value: 'save', primary: true },
      { label: t('discardAndSwitchButton'), value: 'discard' },
      { label: t('stayHereButton'), value: null },
    ]);
    if (choice === null) return false;
    if (choice === 'save') {
      const saved = await commitDraft();
      if (!saved) return false;
    } else {
      state.dirty = false;
    }
  }
  const previousId = state.selectedId;
  state.selectedId = nodeId;
  const node = nodesById().get(nodeId);
  state.draft = node ? snapshotDraft(node) : null;
  state.editingCommentId = null;
  state.commentDraft = '';
  state.tab = 'editor';
  state.resetInspectorScroll = true;
  renderSelectionChange(previousId, origin, focus);
  if (window.innerWidth < 760) window.scrollTo(0, 0);
  return true;
}

async function selectFromToc(nodeId) {
  const selected = await selectNode(nodeId, { origin: 'toc', focus: false });
  if (!selected) return;
  state.tab = 'story';
  state.tocOpen = false;
  applyTabState();
  renderCanvasChrome();
  focusSelected('toc');
  requestAnimationFrame(() => scrollCanvasTo(nodeId));
}

function scrollCanvasTo(nodeId) {
  const canvas = document.getElementById('canvas');
  const target = document.querySelector(`#story-body [data-node-id="${CSS.escape(nodeId)}"]`);
  if (!canvas || !target) return;
  const toolbar = canvas.querySelector('.canvas-toolbar');
  const toolbarHeight = toolbar ? toolbar.getBoundingClientRect().height : 0;
  const margin = 8;
  if (canvas.scrollHeight - canvas.clientHeight > 2) {
    canvas.scrollTop += target.getBoundingClientRect().top - canvas.getBoundingClientRect().top - toolbarHeight - margin;
  } else {
    const top = target.getBoundingClientRect().top + window.scrollY - toolbarHeight - margin;
    window.scrollTo({ top: Math.max(0, top), behavior: 'auto' });
  }
}

function locateInStory() {
  if (!state.selectedId) return;
  state.tab = 'story';
  applyTabState();
  requestAnimationFrame(() => scrollCanvasTo(state.selectedId));
}

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */

function addBlock(type) {
  if (!state.draft) return;
  const base = { id: newId(), type };
  if (type === 'markdown') state.draft.blocks.push({ ...base, text: '' });
  else if (type === 'table') state.draft.blocks.push({ ...base, columns: [''], rows: [], caption: '' });
  else if (type === 'image') state.draft.blocks.push({ ...base, assetId: '', role: 'figure', alt: '', caption: '' });
  else state.draft.blocks.push({ ...base, latex: '', display: true });
  markDirty(true);
  renderInspector();
}

function removeBlock(index) {
  if (!state.draft) return;
  state.draft.blocks.splice(index, 1);
  markDirty(true);
  renderInspector();
  renderAssetUrls();
}

function moveBlock(index, delta) {
  if (!state.draft) return;
  const target = index + delta;
  if (target < 0 || target >= state.draft.blocks.length) return;
  const blocks = state.draft.blocks;
  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  markDirty(true);
  renderInspector();
}

/* ------------------------------------------------------------------ */
/* Round, export, proposals                                            */
/* ------------------------------------------------------------------ */

async function submitRound() {
  if (!state.story) return;
  if (!(await commitDraft())) return;
  try {
    const result = await api('/api/rounds', { method: 'POST', body: { expectedRevision: state.story.revision } });
    applyStory(result.story);
    state.notice = {
      kind: 'round',
      data: { roundId: result.round.id, projectDir: result.projectDir ?? '' },
    };
    renderWorkflowZone();
  } catch (error) {
    handleWriteError(error);
  }
}

async function exportStory() {
  if (!state.story) return;
  if (!(await commitDraft())) return;
  try {
    const result = await api('/api/exports', { method: 'POST', body: { expectedRevision: state.story.revision } });
    applyStory(result.story);
    state.notice = {
      kind: 'export',
      data: {
        revision: result.export.revision,
        relativeDirectory: result.export.relativeDirectory,
        projectDir: result.projectDir ?? '',
        files: result.export.files,
        reused: result.export.reused === true,
      },
    };
    renderWorkflowZone();
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
    if (error.status === 409) {
      handleWriteError(error);
      return;
    }
    setStatus(`${t('proposalDecisionFailedLabel')} ${error.message}`, 'error');
  }
}

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */

function renderComments(entry) {
  const section = el('section', { class: 'comments inspector-section' });
  const openCount = entry.openComments;
  const heading = el('h3', { class: 'section-heading' });
  heading.append(document.createTextNode(t('commentsSectionTitle')));
  if (openCount > 0) {
    heading.append(el('span', {
      class: 'badge badge-accent',
      text: t('unresolvedCommentsBadge', { count: openCount }),
    }));
  }
  section.append(heading);

  const comments = state.story.comments.filter((comment) => comment.nodeId === entry.node.id);
  const form = el('div', { class: 'comment-form' });
  const input = el('textarea', {
    value: state.commentDraft,
    dataset: { focusPart: 'comment-draft' },
    attrs: { placeholder: t('commentPlaceholder'), 'aria-label': t('commentsSectionTitle') },
    on: {
      input: (event) => {
        state.commentDraft = event.target.value;
        autoGrow(event.target);
      },
    },
  });
  bindAutoGrow(input);
  form.append(input);
  form.append(
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
                body: { expectedRevision: state.story.revision, nodeId: entry.node.id, body },
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
  section.append(form);

  if (comments.length === 0) section.append(el('p', { class: 'hint', text: t('noCommentsHint') }));
  for (const comment of comments) {
    const block = el('div', { class: 'comment' });
    block.append(
      el('div', { class: 'comment-meta' }, [
        el('span', { class: comment.status === 'open' ? 'tag-open' : 'tag-resolved', text: comment.status === 'open' ? t('commentStatusOpen') : t('commentStatusResolved') }),
        el('span', { text: formatTime(comment.createdAt) }),
        el('span', { text: `r${comment.nodeRevision}` }),
      ]),
    );
    if (comment.nodeRevision !== entry.node.revision) {
      block.append(el('p', { class: 'comment-warn', text: t('staleCommentWarning') }));
    }
    if (state.editingCommentId === comment.id) {
      const editor = el('textarea', {
        value: state.editingCommentBody,
        dataset: { focusPart: 'comment-edit' },
        attrs: { 'aria-label': t('editCommentButton') },
        on: {
          input: (event) => {
            state.editingCommentBody = event.target.value;
          },
        },
      });
      bindAutoGrow(editor);
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
            text: t('cancelButton'),
            on: {
              click: () => {
                state.editingCommentId = null;
                renderInspector();
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
              renderInspector();
            },
          },
        }),
      );
      block.append(actions);
    }
    section.append(block);
  }
  return section;
}

/* ------------------------------------------------------------------ */
/* Assets                                                              */
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

/* ------------------------------------------------------------------ */
/* View mode                                                           */
/* ------------------------------------------------------------------ */

function viewKey(projectId) {
  return `${VIEW_KEY_PREFIX}${projectId ?? state.story?.projectId ?? ''}`;
}

function loadViewMode(story) {
  let stored = null;
  try {
    stored = localStorage.getItem(viewKey(story.projectId));
  } catch {
    stored = null;
  }
  state.view = stored === 'outline' ? 'outline' : 'full';
}

function setViewMode(view) {
  if (!state.story) return;
  if (state.view === view) return;
  state.view = view;
  try {
    localStorage.setItem(viewKey(), view);
  } catch {
    // Storage can be unavailable; the in-memory choice still applies.
  }
  renderCanvasChrome();
  renderStory();
}

/* ------------------------------------------------------------------ */
/* Wiring and startup                                                  */
/* ------------------------------------------------------------------ */

function applyStaticLabels() {
  document.title = t('appTitle');
  document.getElementById('app-eyebrow').textContent = t('appTitle');
  const rootTitle = document.getElementById('root-title');
  rootTitle.textContent = t('untitledTopic');
  rootTitle.classList.add('is-placeholder');
  document.getElementById('submit-round').textContent = t('submitRoundButton');
  document.getElementById('export-story').textContent = t('exportButton');
  document.getElementById('expand-all').textContent = t('expandAllButton');
  document.getElementById('collapse-all').textContent = t('collapseAllButton');
  document.getElementById('canvas').setAttribute('aria-label', t('storyAria'));
  document.getElementById('view-switch').setAttribute('aria-label', t('viewModeAria'));
  document.getElementById('view-outline').textContent = t('viewOutlineButton');
  document.getElementById('view-full').textContent = t('viewFullButton');
  document.getElementById('toc-toggle').textContent = t('tocToggleButton');
  document.getElementById('toc-heading').textContent = t('tocTitle');
  document.getElementById('toc-nav').setAttribute('aria-label', t('tocTitle'));
  document.getElementById('tabbar').setAttribute('aria-label', t('tabsAria'));
  const labels = { outline: t('tabOutline'), story: t('tabStory'), editor: t('tabEditor') };
  for (const button of document.querySelectorAll('#tabbar button[data-tab]')) {
    button.textContent = labels[button.dataset.tab];
  }
}

function wire() {
  applyStaticLabels();
  document.getElementById('root-title').addEventListener('click', () => {
    if (state.story) void selectNode(state.story.rootId, { focus: false });
  });
  document.getElementById('expand-all').addEventListener('click', () => {
    state.collapsed.clear();
    const tocScroll = document.getElementById('toc-panel').scrollTop;
    renderToc();
    document.getElementById('toc-panel').scrollTop = tocScroll;
  });
  document.getElementById('collapse-all').addEventListener('click', () => {
    for (const entry of state.outline?.values() ?? []) {
      if (entry.role !== 'leaf') state.collapsed.add(entry.node.id);
    }
    const tocScroll = document.getElementById('toc-panel').scrollTop;
    renderToc();
    document.getElementById('toc-panel').scrollTop = tocScroll;
  });
  document.getElementById('submit-round').addEventListener('click', () => void submitRound());
  document.getElementById('export-story').addEventListener('click', () => void exportStory());
  document.getElementById('view-outline').addEventListener('click', () => setViewMode('outline'));
  document.getElementById('view-full').addEventListener('click', () => setViewMode('full'));
  document.getElementById('toc-toggle').addEventListener('click', () => {
    state.tocOpen = !state.tocOpen;
    applyTabState();
    renderCanvasChrome();
  });
  for (const button of document.querySelectorAll('#tabbar button[data-tab]')) {
    button.addEventListener('click', () => {
      state.tab = button.dataset.tab;
      applyTabState();
    });
  }
  document.getElementById('story-body').addEventListener('click', (event) => {
    if (event.target.closest('a')) return;
    const holder = event.target.closest('.leaf, .node-self');
    if (!holder) return;
    const owner = holder.closest('[data-node-id]');
    if (!owner) return;
    const selection = window.getSelection();
    if (event.detail > 0 && selection && !selection.isCollapsed && selection.anchorNode && holder.contains(selection.anchorNode)) {
      return;
    }
    void selectNode(owner.dataset.nodeId);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.tocOpen && !document.getElementById('confirm-dialog').open) {
      const drawer = document.getElementById('toc-panel');
      const active = document.activeElement;
      const wasInDrawer = !active || active === document.body || drawer?.contains(active) === true;
      state.tocOpen = false;
      applyTabState();
      renderCanvasChrome();
      if (wasInDrawer) document.getElementById('toc-toggle')?.focus({ preventScroll: true });
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
    event.preventDefault();
    if (state.dirty) void commitDraft();
  });
  window.addEventListener('resize', () => markScrollableTables());
  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = t('beforeUnloadWarning');
    return t('beforeUnloadWarning');
  });
}

async function main() {
  state.token = readToken();
  wire();
  setStatus(t('loadingLabel'));
  document.title = t('appTitle');
  document.getElementById('app-eyebrow').textContent = t('appTitle');
  if (!state.token) {
    setStatus(t('loadFailedLabel'), 'error');
    document.getElementById('node-editor').append(el('p', { class: 'hint', text: t('loadFailedLabel') }));
    return;
  }
  try {
    const story = await api('/api/story');
    loadViewMode(story);
    applyStory(story);
    setStatus('');
  } catch (error) {
    setStatus(`${t('loadFailedLabel')} ${error.message}`, 'error');
    document.getElementById('node-editor').append(el('p', { class: 'hint', text: t('loadFailedLabel') }));
  }
}

void main();
