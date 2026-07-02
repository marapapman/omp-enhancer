import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
export function releaseTagForVersion(version) {
    const normalized = version.trim();
    if (!normalized)
        throw new Error('package version is empty');
    return normalized.startsWith('v') ? normalized : `v${normalized}`;
}
export function syncMarketplaceCatalogRelease(catalog, packageJson) {
    const ref = releaseTagForVersion(packageJson.version);
    let found = false;
    const plugins = catalog.plugins.map(plugin => {
        if (plugin.name !== packageJson.name)
            return plugin;
        found = true;
        return {
            ...plugin,
            version: packageJson.version,
            source: {
                ...plugin.source,
                ref
            }
        };
    });
    if (!found)
        throw new Error(`marketplace plugin ${packageJson.name} was not found`);
    return { ...catalog, plugins };
}
export async function syncMarketplaceRelease(cwd = process.cwd()) {
    const packagePath = join(cwd, 'package.json');
    const catalogPath = join(cwd, '.omp-plugin', 'marketplace.json');
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
    const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
    const synced = syncMarketplaceCatalogRelease(catalog, packageJson);
    await writeFile(catalogPath, `${JSON.stringify(synced, null, 2)}\n`);
    return { version: packageJson.version, ref: releaseTagForVersion(packageJson.version) };
}
