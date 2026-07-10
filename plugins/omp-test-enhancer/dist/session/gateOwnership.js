import { isRecord } from '../utils.js';
export const CORE_GATE_OWNER_ENTRY = 'omp-enhancer-core.gate-owner';
export const CORE_GATE_OWNER_SYMBOL = Symbol.for('omp-enhancer.core.gate-owner');
export const CORE_STATE_ENTRY = 'omp-enhancer-core.state';
export function readCoreGateOwner(pi, entries = []) {
    const symbolMarker = readCoreGateOwnerMarker(Reflect.get(liveOwnerSurface(pi), CORE_GATE_OWNER_SYMBOL));
    if (symbolMarker)
        return symbolMarker;
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry?.type !== 'custom' || entry.customType !== CORE_GATE_OWNER_ENTRY)
            continue;
        const marker = readCoreGateOwnerMarker(entry.data);
        if (marker)
            return marker;
    }
    return undefined;
}
export function hasCoreGateOwner(pi, entries = []) {
    void entries;
    // Persisted markers are useful diagnostics but cannot prove that core is
    // loaded in the current runtime. Only the in-process symbol is a live lease;
    // otherwise standalone bounded gating is safer than silently having no owner.
    return readCoreGateOwnerMarker(Reflect.get(liveOwnerSurface(pi), CORE_GATE_OWNER_SYMBOL)) !== undefined;
}
function liveOwnerSurface(pi) {
    const events = Reflect.get(pi, 'events');
    return events !== null && (typeof events === 'object' || typeof events === 'function')
        ? events
        : pi;
}
export function readCoreRouteIdFromEntries(entries) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry?.type !== 'custom' || entry.customType !== CORE_STATE_ENTRY)
            continue;
        if (!isRecord(entry.data))
            continue;
        if (typeof entry.data.routeId === 'string' && entry.data.routeId.trim() !== '')
            return entry.data.routeId;
        if (!isRecord(entry.data.gateController))
            continue;
        const routeId = entry.data.gateController.routeId;
        if (typeof routeId === 'string' && routeId.trim() !== '')
            return routeId;
    }
    return undefined;
}
function readCoreGateOwnerMarker(value) {
    if (!isRecord(value))
        return undefined;
    if (value.owner !== 'omp-enhancer-core')
        return undefined;
    if (!Number.isInteger(value.schemaVersion) || Number(value.schemaVersion) < 1)
        return undefined;
    if (!Number.isInteger(value.controllerSchemaVersion) || Number(value.controllerSchemaVersion) < 2)
        return undefined;
    return {
        schemaVersion: Number(value.schemaVersion),
        owner: 'omp-enhancer-core',
        controllerSchemaVersion: Number(value.controllerSchemaVersion)
    };
}
