import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ADVISOR_BLOCK_END,
  ADVISOR_BLOCK_START,
  AGENTS_BLOCK_END,
  AGENTS_BLOCK_START,
  extractManagedBlock,
} from './workflow-managed-blocks.js';

export async function loadWorkflowContextAssets(pluginRoot) {
  const assetsDir = path.join(pluginRoot, 'assets');
  const [catalog, agentsAsset, watchdogAsset] = await Promise.all([
    readFile(path.join(assetsDir, 'WORKFLOW_CATALOG.md'), 'utf8'),
    readFile(path.join(assetsDir, 'AGENTS.md'), 'utf8'),
    readFile(path.join(assetsDir, 'WATCHDOG.yml'), 'utf8'),
  ]);

  return {
    catalog,
    agentsManagedBlock: extractManagedBlock(agentsAsset, AGENTS_BLOCK_START, AGENTS_BLOCK_END),
    advisorManagedBlock: extractManagedBlock(watchdogAsset, ADVISOR_BLOCK_START, ADVISOR_BLOCK_END),
    watchdogAsset,
  };
}
