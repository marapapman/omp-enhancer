import { isRecord } from './utils.js';
const ACTIONS = new Set(['goto', 'click', 'fill', 'press', 'hover', 'check', 'select', 'assertVisible', 'screenshot']);
const LOCATOR_KINDS = new Set(['role', 'text', 'label', 'placeholder', 'altText', 'title', 'testId', 'css']);
export function parseBrowserCheckParams(input) {
    if (!isRecord(input))
        return failure('$', 'Expected an object.');
    const unknown = unknownKey(input, ['baseUrl', 'serverCommand', 'artifactDir', 'setup', 'scenarios', 'targetIds']);
    if (unknown)
        return failure(`$.${unknown}`, 'Unknown field.');
    if (!nonEmptyString(input.baseUrl))
        return failure('$.baseUrl', 'Expected a non-empty absolute URL.');
    try {
        const url = new URL(input.baseUrl);
        if (!['http:', 'https:', 'file:'].includes(url.protocol))
            return failure('$.baseUrl', 'Expected an http, https, or file URL.');
    }
    catch {
        return failure('$.baseUrl', 'Expected a non-empty absolute URL.');
    }
    if (input.serverCommand !== undefined && !nonEmptyString(input.serverCommand))
        return failure('$.serverCommand', 'Expected a non-empty string.');
    if (input.artifactDir !== undefined && !nonEmptyString(input.artifactDir))
        return failure('$.artifactDir', 'Expected a non-empty string.');
    const targetIds = parseTargetIds(input.targetIds, '$.targetIds');
    if (!targetIds.ok)
        return targetIds;
    const setup = parseSetup(input.setup);
    if (!setup.ok)
        return setup;
    if (!Array.isArray(input.scenarios))
        return failure('$.scenarios', 'Expected an array.');
    const scenarios = [];
    for (const [index, value] of input.scenarios.entries()) {
        const scenario = parseScenario(value, `$.scenarios[${index}]`);
        if (!scenario.ok)
            return scenario;
        scenarios.push(scenario.value);
    }
    return {
        ok: true,
        value: {
            baseUrl: input.baseUrl,
            scenarios,
            ...(input.serverCommand !== undefined ? { serverCommand: input.serverCommand } : {}),
            ...(input.artifactDir !== undefined ? { artifactDir: input.artifactDir } : {}),
            ...(setup.value !== undefined ? { setup: setup.value } : {}),
            ...(targetIds.value !== undefined ? { targetIds: targetIds.value } : {})
        }
    };
}
export function invalidBrowserCheckEvidence(input, error, runId = `browser-invalid-${Date.now().toString(36)}`) {
    const record = isRecord(input) ? input : {};
    const targetIds = Array.isArray(record.targetIds)
        ? record.targetIds.filter(nonEmptyString)
        : [];
    return {
        framework: 'playwright',
        status: 'failed',
        runId,
        ...(nonEmptyString(record.baseUrl) ? { baseUrl: record.baseUrl } : {}),
        targetIds: [...new Set(targetIds)],
        scenarioCount: 0,
        stepCount: 0,
        captureCount: 0,
        visualAssertionCount: 0,
        findings: [{
                gate: 'browser-interaction',
                passed: false,
                severity: 'critical',
                category: 'setup',
                summary: 'Invalid browser check parameters.',
                evidence: error,
                repairHint: 'Use the documented browser-check scenario, step, locator, and visual-check schema.'
            }]
    };
}
export function browserCheckExecutionFailureEvidence(params, error, runId = `browser-failed-${Date.now().toString(36)}`) {
    return {
        framework: 'playwright',
        status: 'failed',
        runId,
        baseUrl: params.baseUrl,
        targetIds: params.targetIds ?? [],
        scenarioCount: 0,
        stepCount: 0,
        captureCount: 0,
        visualAssertionCount: 0,
        findings: [{
                gate: 'browser-interaction',
                passed: false,
                severity: 'critical',
                category: 'setup',
                summary: 'Browser check execution failed.',
                evidence: { message: error instanceof Error ? error.message : String(error) },
                repairHint: 'Report the structured browser execution failure and correct the browser setup before retrying.'
            }]
    };
}
export function readBrowserEvidenceValue(value) {
    if (!isRecord(value) || value.framework !== 'playwright')
        return undefined;
    if (value.status !== 'passed' && value.status !== 'failed' && value.status !== 'skipped')
        return undefined;
    if (!Array.isArray(value.targetIds) || !value.targetIds.every(nonEmptyString))
        return undefined;
    if (!isNonNegativeInteger(value.scenarioCount)
        || !isNonNegativeInteger(value.stepCount)
        || !isNonNegativeInteger(value.captureCount)
        || !isNonNegativeInteger(value.visualAssertionCount))
        return undefined;
    if (!Array.isArray(value.findings) || !value.findings.every(isBrowserFindingValue))
        return undefined;
    return value;
}
export function isBrowserFindingValue(value) {
    if (!isRecord(value))
        return false;
    if (value.gate !== 'browser-interaction' && value.gate !== 'browser-visual')
        return false;
    if (typeof value.passed !== 'boolean')
        return false;
    if (value.severity !== 'critical' && value.severity !== 'warning')
        return false;
    if (value.category !== 'actionability'
        && value.category !== 'console-error'
        && value.category !== 'page-error'
        && value.category !== 'network-failure'
        && value.category !== 'accessibility'
        && value.category !== 'visual-diff'
        && value.category !== 'timeout'
        && value.category !== 'setup')
        return false;
    return typeof value.summary === 'string';
}
function parseSetup(value) {
    if (value === undefined)
        return { ok: true };
    if (!isRecord(value))
        return failure('$.setup', 'Expected an object.');
    const unknown = unknownKey(value, ['headless', 'viewport', 'trace', 'screenshot', 'serviceWorkers']);
    if (unknown)
        return failure(`$.setup.${unknown}`, 'Unknown field.');
    if (value.headless !== undefined && typeof value.headless !== 'boolean')
        return failure('$.setup.headless', 'Expected a boolean.');
    if (value.trace !== undefined && value.trace !== 'off' && value.trace !== 'retain-on-failure')
        return failure('$.setup.trace', 'Expected off or retain-on-failure.');
    if (value.screenshot !== undefined && value.screenshot !== 'off' && value.screenshot !== 'only-on-failure')
        return failure('$.setup.screenshot', 'Expected off or only-on-failure.');
    if (value.serviceWorkers !== undefined && value.serviceWorkers !== 'allow' && value.serviceWorkers !== 'block')
        return failure('$.setup.serviceWorkers', 'Expected allow or block.');
    let viewport;
    if (value.viewport !== undefined) {
        if (!isRecord(value.viewport))
            return failure('$.setup.viewport', 'Expected an object.');
        const viewportUnknown = unknownKey(value.viewport, ['width', 'height']);
        if (viewportUnknown)
            return failure(`$.setup.viewport.${viewportUnknown}`, 'Unknown field.');
        if (!isPositiveInteger(value.viewport.width))
            return failure('$.setup.viewport.width', 'Expected a positive integer.');
        if (!isPositiveInteger(value.viewport.height))
            return failure('$.setup.viewport.height', 'Expected a positive integer.');
        viewport = { width: Number(value.viewport.width), height: Number(value.viewport.height) };
    }
    return {
        ok: true,
        value: {
            ...(value.headless !== undefined ? { headless: value.headless } : {}),
            ...(viewport ? { viewport } : {}),
            ...(value.trace !== undefined ? { trace: value.trace } : {}),
            ...(value.screenshot !== undefined ? { screenshot: value.screenshot } : {}),
            ...(value.serviceWorkers !== undefined ? { serviceWorkers: value.serviceWorkers } : {})
        }
    };
}
function parseScenario(value, path) {
    if (!isRecord(value))
        return failure(path, 'Expected an object.');
    const unknown = unknownKey(value, ['name', 'goal', 'steps', 'visualChecks']);
    if (unknown)
        return failure(`${path}.${unknown}`, 'Unknown field.');
    if (!nonEmptyString(value.name))
        return failure(`${path}.name`, 'Expected a non-empty string.');
    if (value.goal !== undefined && !nonEmptyString(value.goal))
        return failure(`${path}.goal`, 'Expected a non-empty string.');
    if (!Array.isArray(value.steps))
        return failure(`${path}.steps`, 'Expected an array.');
    const steps = [];
    for (const [index, item] of value.steps.entries()) {
        const step = parseStep(item, `${path}.steps[${index}]`);
        if (!step.ok)
            return step;
        steps.push(step.value);
    }
    let visualChecks;
    if (value.visualChecks !== undefined) {
        if (!Array.isArray(value.visualChecks))
            return failure(`${path}.visualChecks`, 'Expected an array.');
        visualChecks = [];
        for (const [index, item] of value.visualChecks.entries()) {
            const visual = parseVisualCheck(item, `${path}.visualChecks[${index}]`);
            if (!visual.ok)
                return visual;
            visualChecks.push(visual.value);
        }
    }
    return {
        ok: true,
        value: {
            name: value.name,
            steps,
            ...(value.goal !== undefined ? { goal: value.goal } : {}),
            ...(visualChecks !== undefined ? { visualChecks } : {})
        }
    };
}
function parseStep(value, path) {
    if (!isRecord(value))
        return failure(path, 'Expected an object.');
    const unknown = unknownKey(value, ['action', 'locator', 'url', 'value', 'description']);
    if (unknown)
        return failure(`${path}.${unknown}`, 'Unknown field.');
    if (typeof value.action !== 'string' || !ACTIONS.has(value.action))
        return failure(`${path}.action`, 'Unsupported browser action.');
    if (!nonEmptyString(value.description))
        return failure(`${path}.description`, 'Expected a non-empty string.');
    const action = value.action;
    const locator = parseLocator(value.locator, `${path}.locator`);
    if (!locator.ok)
        return locator;
    if (!['goto', 'screenshot'].includes(action) && locator.value === undefined)
        return failure(`${path}.locator`, `Action ${action} requires a locator.`);
    if (action === 'goto' && locator.value !== undefined)
        return failure(`${path}.locator`, 'goto does not accept a locator.');
    if (value.url !== undefined && (!nonEmptyString(value.url) || action !== 'goto'))
        return failure(`${path}.url`, 'url is only valid for goto and must be non-empty.');
    if (value.value !== undefined && (typeof value.value !== 'string' || !['fill', 'press', 'select'].includes(action)))
        return failure(`${path}.value`, 'value is only valid for fill, press, or select.');
    return {
        ok: true,
        value: {
            action,
            description: value.description,
            ...(locator.value ? { locator: locator.value } : {}),
            ...(value.url !== undefined ? { url: value.url } : {}),
            ...(value.value !== undefined ? { value: value.value } : {})
        }
    };
}
function parseLocator(value, path) {
    if (value === undefined)
        return { ok: true };
    if (!isRecord(value))
        return failure(path, 'Expected an object.');
    const unknown = unknownKey(value, ['kind', 'value', 'role', 'name', 'exact']);
    if (unknown)
        return failure(`${path}.${unknown}`, 'Unknown field.');
    if (typeof value.kind !== 'string' || !LOCATOR_KINDS.has(value.kind))
        return failure(`${path}.kind`, 'Unsupported locator kind.');
    if (value.exact !== undefined && typeof value.exact !== 'boolean')
        return failure(`${path}.exact`, 'Expected a boolean.');
    if (value.name !== undefined && typeof value.name !== 'string')
        return failure(`${path}.name`, 'Expected a string.');
    if (value.kind === 'role') {
        if (!nonEmptyString(value.role))
            return failure(`${path}.role`, 'Role locators require a non-empty role.');
        if (value.value !== undefined)
            return failure(`${path}.value`, 'Role locators do not accept value.');
    }
    else {
        if (!nonEmptyString(value.value))
            return failure(`${path}.value`, `${value.kind} locators require a non-empty value.`);
        if (value.role !== undefined || value.name !== undefined)
            return failure(path, 'Only role locators accept role or name.');
    }
    return {
        ok: true,
        value: {
            kind: value.kind,
            ...(value.value !== undefined ? { value: value.value } : {}),
            ...(value.role !== undefined ? { role: value.role } : {}),
            ...(value.name !== undefined ? { name: value.name } : {}),
            ...(value.exact !== undefined ? { exact: value.exact } : {})
        }
    };
}
function parseVisualCheck(value, path) {
    if (!isRecord(value))
        return failure(path, 'Expected an object.');
    const unknown = unknownKey(value, ['kind', 'name', 'locator', 'expectedPath', 'maxDiffPixels', 'maxDiffPixelRatio', 'threshold']);
    if (unknown)
        return failure(`${path}.${unknown}`, 'Unknown field.');
    if (value.kind !== 'page' && value.kind !== 'locator')
        return failure(`${path}.kind`, 'Expected page or locator.');
    if (!nonEmptyString(value.name))
        return failure(`${path}.name`, 'Expected a non-empty string.');
    const locator = parseLocator(value.locator, `${path}.locator`);
    if (!locator.ok)
        return locator;
    if (value.kind === 'locator' && locator.value === undefined)
        return failure(`${path}.locator`, 'Locator visual checks require a locator.');
    if (value.kind === 'page' && locator.value !== undefined)
        return failure(`${path}.locator`, 'Page visual checks do not accept a locator.');
    if (value.expectedPath !== undefined && !nonEmptyString(value.expectedPath))
        return failure(`${path}.expectedPath`, 'Expected a non-empty string.');
    if (value.maxDiffPixels !== undefined && !isNonNegativeInteger(value.maxDiffPixels))
        return failure(`${path}.maxDiffPixels`, 'Expected a non-negative integer.');
    if (value.maxDiffPixelRatio !== undefined && !isRatio(value.maxDiffPixelRatio))
        return failure(`${path}.maxDiffPixelRatio`, 'Expected a number from 0 to 1.');
    if (value.threshold !== undefined && !isRatio(value.threshold))
        return failure(`${path}.threshold`, 'Expected a number from 0 to 1.');
    return {
        ok: true,
        value: {
            kind: value.kind,
            name: value.name,
            ...(locator.value ? { locator: locator.value } : {}),
            ...(value.expectedPath !== undefined ? { expectedPath: value.expectedPath } : {}),
            ...(value.maxDiffPixels !== undefined ? { maxDiffPixels: Number(value.maxDiffPixels) } : {}),
            ...(value.maxDiffPixelRatio !== undefined ? { maxDiffPixelRatio: Number(value.maxDiffPixelRatio) } : {}),
            ...(value.threshold !== undefined ? { threshold: Number(value.threshold) } : {})
        }
    };
}
function parseTargetIds(value, path) {
    if (value === undefined)
        return { ok: true };
    if (!Array.isArray(value))
        return failure(path, 'Expected an array.');
    if (!value.every(nonEmptyString))
        return failure(path, 'Expected non-empty string target ids.');
    return { ok: true, value: [...new Set(value)] };
}
function failure(path, message) {
    return { ok: false, error: { path, message } };
}
function unknownKey(value, allowed) {
    const allowedSet = new Set(allowed);
    return Object.keys(value).find(key => !allowedSet.has(key));
}
function nonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}
function isNonNegativeInteger(value) {
    return Number.isInteger(value) && Number(value) >= 0;
}
function isPositiveInteger(value) {
    return Number.isInteger(value) && Number(value) > 0;
}
function isRatio(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}
