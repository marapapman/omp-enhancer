import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
export async function readRepoFiles(cwd, files) {
    const safeCwd = await safeRealpath(cwd);
    const results = [];
    for (const file of files) {
        if (!file || file.startsWith('/') || file.includes('\\'))
            continue;
        const absolutePath = resolve(safeCwd, file);
        if (!isInsideDirectory(safeCwd, absolutePath))
            continue;
        try {
            const realPath = await realpath(absolutePath);
            if (!isInsideDirectory(safeCwd, realPath))
                continue;
            results.push({ path: file, content: await readFile(realPath, 'utf8') });
        }
        catch (error) {
            if (!isMissing(error))
                throw error;
        }
    }
    return results;
}
export async function findRelatedTests(cwd, sourceFile) {
    const parsed = parseSourcePath(sourceFile);
    if (!parsed)
        return [];
    const candidates = [
        ...testNameVariants(join(parsed.dir, parsed.base)),
        join(parsed.dir, '__tests__', `${parsed.base}.test.ts`),
        join(parsed.dir, '__tests__', `${parsed.base}.spec.ts`),
        join(parsed.dir, '__tests__', `${parsed.base}.test.tsx`),
        join(parsed.dir, '__tests__', `${parsed.base}.spec.tsx`),
        join('tests', parsed.dir, `${parsed.base}.test.ts`),
        join('tests', parsed.dir, `${parsed.base}.spec.ts`),
        ...browserTestNameVariants(join(parsed.dir, parsed.base)),
        ...browserTestNameVariants(join(parsed.dir, '__tests__', parsed.base)),
        ...browserTestNameVariants(join('tests', parsed.dir, parsed.base)),
        ...browserTestNameVariants(join('tests', 'e2e', parsed.dir, parsed.base)),
        ...browserTestNameVariants(join('tests', 'browser', parsed.dir, parsed.base)),
        ...browserTestNameVariants(join('e2e', parsed.dir, parsed.base)),
        ...browserTestNameVariants(join('playwright', parsed.dir, parsed.base)),
        ...routeRelatedTestCandidates(parsed)
    ].map(toPosix);
    return existingRelativePaths(cwd, candidates);
}
export async function findPublicEntryHints(cwd, sourceFile, symbolName) {
    const hints = [];
    const parsed = parseSourcePath(sourceFile);
    if (parsed) {
        for (const indexFile of [join(parsed.dir, 'index.ts'), join(parsed.dir, 'index.tsx')].map(toPosix)) {
            const content = await readExistingText(cwd, indexFile);
            if (content && exportsSymbol(content, symbolName))
                hints.push(`${indexFile}#${symbolName}`);
        }
    }
    if (isFrontendEntryFile(sourceFile))
        hints.push(sourceFile);
    hints.push(...await findApiContextHints(cwd, sourceFile));
    const rootIndex = await readExistingText(cwd, 'src/index.ts');
    if (rootIndex && (exportsSymbol(rootIndex, symbolName) || rootIndex.includes(sourceFile.replace(/^src\//, './')) || rootIndex.includes(sourceFile))) {
        hints.push('src/index.ts');
    }
    const packageJson = await readExistingText(cwd, 'package.json');
    if (packageJson) {
        try {
            const parsedPackage = JSON.parse(packageJson);
            if (typeof parsedPackage.exports !== 'undefined')
                hints.push('package.json#exports');
        }
        catch {
            // Invalid package.json should not hide other hints.
        }
    }
    return hints;
}
async function findApiContextHints(cwd, sourceFile) {
    if (!/\/(api|routes|controllers?)\//i.test(sourceFile) && !/(api|route|controller|client)/i.test(sourceFile))
        return [];
    const parsed = parseSourcePath(sourceFile);
    const base = parsed?.base;
    const candidates = [
        ['openapi.yaml', 'contract'],
        ['openapi.yml', 'contract'],
        ['openapi.json', 'contract'],
        ['swagger.json', 'contract'],
        ['src/mocks/handlers.ts', 'msw'],
        ['src/mocks/handlers.tsx', 'msw'],
        ['tests/mocks/handlers.ts', 'msw'],
        ...(base ? [
            [join('tests', 'contracts', `${base}.pact.ts`), 'contract'],
            [join('tests', 'contracts', `${base}.contract.ts`), 'contract'],
            [join('pact', `${base}.json`), 'contract']
        ] : [])
    ].map(([path, kind]) => [toPosix(path), kind]);
    const hints = [];
    for (const [path, kind] of candidates) {
        if (await exists(join(cwd, path)))
            hints.push(`${path}#${kind}`);
    }
    return hints;
}
function testNameVariants(prefix) {
    return ['.test.ts', '.test.tsx', '.spec.ts', '.spec.tsx', '.test.js', '.spec.js'].map(suffix => `${prefix}${suffix}`);
}
function browserTestNameVariants(prefix) {
    return ['.browser.test.ts', '.browser.test.tsx', '.browser.spec.ts', '.browser.spec.tsx', '.e2e.test.ts', '.e2e.spec.ts'].map(suffix => `${prefix}${suffix}`);
}
function routeRelatedTestCandidates(parsed) {
    if (!/^(page|layout|template|loading|error|not-found)$/i.test(parsed.base))
        return [];
    const routeBase = parsed.dir.split('/').filter(Boolean).at(-1);
    if (!routeBase)
        return [];
    return [
        ...browserTestNameVariants(join('tests', 'e2e', parsed.dir, routeBase)),
        ...browserTestNameVariants(join('tests', 'browser', parsed.dir, routeBase)),
        ...browserTestNameVariants(join('e2e', parsed.dir, routeBase)),
        ...browserTestNameVariants(join('playwright', parsed.dir, routeBase))
    ];
}
function isFrontendEntryFile(path) {
    return /(^|\/)(app|pages|routes)\//i.test(path) || /(^|\/)(page|layout|template|loading|error|not-found|App|Root|main)\.[cm]?[tj]sx?$/.test(path);
}
async function existingRelativePaths(cwd, candidates) {
    const results = [];
    for (const candidate of candidates) {
        if (await exists(join(cwd, candidate)))
            results.push(candidate);
    }
    return results;
}
async function readExistingText(cwd, relativePath) {
    try {
        return await readFile(join(cwd, relativePath), 'utf8');
    }
    catch (error) {
        if (isMissing(error))
            return undefined;
        throw error;
    }
}
async function exists(path) {
    try {
        await stat(path);
        return true;
    }
    catch (error) {
        if (isMissing(error))
            return false;
        throw error;
    }
}
async function safeRealpath(path) {
    try {
        return await realpath(resolve(path));
    }
    catch (error) {
        if (isMissing(error))
            return resolve(path);
        throw error;
    }
}
function parseSourcePath(sourceFile) {
    if (!sourceFile || sourceFile.startsWith('/') || sourceFile.includes('..'))
        return undefined;
    const dir = toPosix(dirname(sourceFile));
    const fileName = sourceFile.split('/').at(-1);
    if (!fileName)
        return undefined;
    const base = fileName.replace(/\.[^.]+$/, '');
    return { dir: dir === '.' ? '' : dir, base };
}
function exportsSymbol(content, symbolName) {
    return new RegExp(`export\\s+(?:\\{[^}]*\\b${escapeRegExp(symbolName)}\\b|[^;]*\\b${escapeRegExp(symbolName)}\\b)`).test(content);
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function isInsideDirectory(cwd, absolutePath) {
    const rel = relative(cwd, absolutePath);
    return rel !== '' && !rel.startsWith('..') && !rel.startsWith('/');
}
function toPosix(value) {
    return value.replace(/\\/g, '/');
}
function isMissing(error) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
