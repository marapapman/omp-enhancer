import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export function defaultTestingEnhancerConfig() {
    return {
        version: 2,
        test: {},
        coverage: {},
        browser: {
            headless: true,
            trace: 'retain-on-failure',
            screenshot: 'only-on-failure',
            serviceWorkers: 'block'
        },
        review: {
            indirectTest: 'critical',
            productionEdits: 'critical',
            testCommand: 'critical',
            browserEvidence: 'critical'
        }
    };
}
export function renderTestingEnhancerConfig(config) {
    return [
        'version: 2',
        'test:',
        '  # Expected host-observed command; advisory omp_test_review never executes it.',
        `  command: ${config.test.command ?? ''}`,
        'coverage:',
        `  command: ${config.coverage.command ?? ''}`,
        'browser:',
        `  baseUrl: ${config.browser.baseUrl ?? ''}`,
        `  timeoutMs: ${config.browser.timeoutMs ?? ''}`,
        `  headless: ${config.browser.headless}`,
        `  trace: ${config.browser.trace}`,
        `  screenshot: ${config.browser.screenshot}`,
        `  serviceWorkers: ${config.browser.serviceWorkers}`,
        'review:',
        `  indirectTest: ${config.review.indirectTest}`,
        `  productionEdits: ${config.review.productionEdits}`,
        `  testCommand: ${config.review.testCommand}`,
        `  browserEvidence: ${config.review.browserEvidence}`,
        ''
    ].join('\n');
}
export function parseTestingEnhancerConfig(text) {
    const config = defaultTestingEnhancerConfig();
    let section;
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trimEnd();
        if (!line.trim())
            continue;
        if (!line.startsWith(' ')) {
            const separator = line.indexOf(':');
            const key = separator === -1 ? line : line.slice(0, separator);
            const rawValue = separator === -1 ? '' : line.slice(separator + 1);
            if (key === 'version' && rawValue.trim() === '2')
                config.version = 2;
            section = key === 'test' || key === 'coverage' || key === 'browser' || key === 'review' ? key : undefined;
            continue;
        }
        if (!section)
            continue;
        const trimmed = line.trim();
        const separator = trimmed.indexOf(':');
        const key = separator === -1 ? trimmed : trimmed.slice(0, separator);
        const rawValue = separator === -1 ? '' : trimmed.slice(separator + 1);
        const value = rawValue.trim();
        if (section === 'test' && key === 'command') {
            if (value)
                config.test.command = value;
            else
                delete config.test.command;
        }
        if (section === 'coverage' && key === 'command') {
            if (value)
                config.coverage.command = value;
            else
                delete config.coverage.command;
        }
        if (section === 'browser') {
            if (key === 'baseUrl') {
                if (value)
                    config.browser.baseUrl = value;
                else
                    delete config.browser.baseUrl;
            }
            if (key === 'timeoutMs') {
                const parsed = Number.parseInt(value, 10);
                if (Number.isInteger(parsed) && parsed > 0)
                    config.browser.timeoutMs = parsed;
                else
                    delete config.browser.timeoutMs;
            }
            if (key === 'headless' && (value === 'true' || value === 'false'))
                config.browser.headless = value === 'true';
            if (key === 'trace' && (value === 'off' || value === 'retain-on-failure'))
                config.browser.trace = value;
            if (key === 'screenshot' && (value === 'off' || value === 'only-on-failure'))
                config.browser.screenshot = value;
            if (key === 'serviceWorkers' && (value === 'allow' || value === 'block'))
                config.browser.serviceWorkers = value;
        }
        if (section === 'review') {
            if ((key === 'indirectTest' || key === 'productionEdits' || key === 'testCommand' || key === 'browserEvidence') && (value === 'critical' || value === 'warning')) {
                config.review[key] = value;
            }
        }
    }
    return config;
}
export async function readTestingEnhancerConfig(cwd) {
    try {
        return parseTestingEnhancerConfig(await readFile(join(cwd, '.omp', 'testing-enhancer.yml'), 'utf8'));
    }
    catch (error) {
        if (isNodeError(error) && error.code === 'ENOENT')
            return undefined;
        throw error;
    }
}
function isNodeError(error) {
    return error instanceof Error && 'code' in error;
}
