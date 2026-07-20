import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
export function defaultTestingEnhancerConfig() {
    return {
        version: 2,
        test: {},
        review: {
            indirectTest: 'critical',
            productionEdits: 'critical',
            testCommand: 'critical',
            browserEvidence: 'critical'
        }
    };
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
            section = key === 'test' || key === 'review' ? key : undefined;
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
