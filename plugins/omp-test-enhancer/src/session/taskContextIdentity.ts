import { isRecord } from '../utils.js'

export const CORE_STATE_ENTRY = 'omp-enhancer-core.state'

export interface SessionEntry {
  type: string
  customType?: string
  data?: unknown
}

/**
 * Derive a diagnostic task-context identity from the current advisory Core
 * snapshot. It only isolates observations from different top-level tasks; it
 * grants no authority and has no effect on tools or session lifecycle.
 */
export function readCoreTaskContextIdentityFromEntries(entries: SessionEntry[]): string | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry?.type !== 'custom' || entry.customType !== CORE_STATE_ENTRY) continue
    if (!isRecord(entry.data)) continue
    if (!isRecord(entry.data.lastTaskContext) || entry.data.lastTaskContext.intent !== 'agent-selected') continue

    const startedAt = entry.data.taskStartedAt
    if (!Number.isFinite(startedAt) || Number(startedAt) <= 0) continue
    return `task:${Number(startedAt)}`
  }

  return undefined
}
