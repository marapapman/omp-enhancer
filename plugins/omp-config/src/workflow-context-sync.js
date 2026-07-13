import { resolvePluginRoot } from './plugin-root.js';
import { loadWorkflowContextAssets } from './workflow-context-assets.js';
import {
  ADVISOR_BLOCK_END,
  ADVISOR_BLOCK_START,
  AGENTS_BLOCK_END,
  AGENTS_BLOCK_START,
  CATALOG_BLOCK_END,
  CATALOG_BLOCK_START,
  mergeManagedCatalog,
  mergeMarkdownManagedBlock,
  mergeWatchdogManagedBlock,
} from './workflow-managed-blocks.js';
import {
  applyWorkflowContextChanges,
  readWorkflowContextTargetFiles,
  resolveWorkflowContextTarget,
} from './workflow-target-files.js';

export {
  ADVISOR_BLOCK_END,
  ADVISOR_BLOCK_START,
  AGENTS_BLOCK_END,
  AGENTS_BLOCK_START,
  CATALOG_BLOCK_END,
  CATALOG_BLOCK_START,
  mergeManagedCatalog,
  mergeMarkdownManagedBlock,
  mergeWatchdogManagedBlock,
};

export async function syncWorkflowContext(input = {}) {
  const pluginRoot = await resolvePluginRoot(input.root);
  const targetDir = await resolveWorkflowContextTarget(input.target);
  const apply = input.apply === true;
  const assets = await loadWorkflowContextAssets(pluginRoot);
  const targets = await readWorkflowContextTargetFiles(targetDir);

  const desiredAgents = mergeMarkdownManagedBlock(targets.existingAgents, assets.agentsManagedBlock);
  const desiredCatalog = mergeManagedCatalog(targets.existingCatalog, assets.catalog);
  const desiredWatchdog = targets.existingWatchdog === null
    ? ensureTrailingNewline(assets.watchdogAsset)
    : mergeWatchdogManagedBlock(targets.existingWatchdog, assets.advisorManagedBlock);
  const files = [
    buildChange(targets.catalogPath, targets.existingCatalog, desiredCatalog, 'managed-file'),
    buildChange(targets.agentsPath, targets.existingAgents, desiredAgents, 'managed-block'),
    buildChange(targets.watchdogPath, targets.existingWatchdog, desiredWatchdog, 'managed-block'),
  ];

  if (apply) await applyWorkflowContextChanges(targetDir, files);

  return {
    ok: true,
    mode: apply ? 'apply' : 'dry-run',
    targetDir,
    changed: files.filter((file) => file.changed).length,
    files: files.map(({ content: _content, ...file }) => file),
  };
}

function buildChange(filePath, existing, content, managed) {
  const changed = existing !== content;
  return {
    path: filePath,
    action: !changed ? 'unchanged' : existing === null ? 'create' : 'update',
    managed,
    changed,
    content,
  };
}

function ensureTrailingNewline(text) {
  return text.endsWith('\n') ? text : `${text}\n`;
}
