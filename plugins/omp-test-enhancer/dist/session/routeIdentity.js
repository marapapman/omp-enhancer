import { isRecord } from '../utils.js';
export const CORE_STATE_ENTRY = 'omp-enhancer-core.state';
/**
 * Derive a diagnostic route identity from the current advisory core snapshot.
 * The identity scopes observations to one user turn; it grants no authority and
 * has no effect on tool execution or session lifecycle.
 */
export function readCoreRouteIdentityFromEntries(entries) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry?.type !== 'custom' || entry.customType !== CORE_STATE_ENTRY)
            continue;
        if (!isRecord(entry.data) || entry.data.schemaVersion !== 2)
            continue;
        if (!isRecord(entry.data.lastRoute) || typeof entry.data.lastRoute.intent !== 'string')
            continue;
        const startedAt = entry.data.routeStartedAt;
        if (!Number.isFinite(startedAt) || Number(startedAt) <= 0)
            continue;
        return `route:${Number(startedAt)}`;
    }
    return undefined;
}
