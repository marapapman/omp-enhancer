import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

import {
  defaultOmpRoot,
  resolvePaths,
  discoverMarketplaces,
  resolvePluginCacheDir,
} from './install-skills.js';

const NPM_INSTALL_TIMEOUT_MS = 600000;

/**
 * Read the `dependencies` object from a plugin's package.json.
 * Returns {} when package.json is absent or has no dependencies (or is unparseable).
 * @param {string} pluginDir
 * @returns {Record<string, string>}
 */
export function readPluginDependencies(pluginDir) {
  try {
    const pkgPath = path.join(pluginDir, 'package.json');
    if (!existsSync(pkgPath)) return {};
    const data = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const deps = data?.dependencies;
    return isPlainObject(deps) ? { ...deps } : {};
  } catch {
    return {};
  }
}

/**
 * Whether any declared dependency is unresolvable from the plugin's entry point.
 * Uses Node's module resolution (createRequire) so it honors node_modules up the tree.
 * @param {string} pluginDir
 * @param {Record<string, string>} deps
 * @returns {boolean}
 */
export function pluginNeedsInstall(pluginDir, deps) {
  if (!isPlainObject(deps) || Object.keys(deps).length === 0) return false;
  const require_ = createRequire(path.join(pluginDir, 'index.js'));
  for (const dep of Object.keys(deps)) {
    try {
      require_.resolve(dep);
    } catch {
      return true;
    }
  }
  return false;
}

/**
 * Verify which declared dependencies are resolvable from the plugin's entry point.
 * @param {string} pluginDir
 * @param {Record<string, string>} deps
 * @returns {{ ok: boolean, missing: string[] }}
 */
export function verifyDependencies(pluginDir, deps) {
  const missing = [];
  if (isPlainObject(deps)) {
    const require_ = createRequire(path.join(pluginDir, 'index.js'));
    for (const dep of Object.keys(deps)) {
      try {
        require_.resolve(dep);
      } catch {
        missing.push(dep);
      }
    }
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Default real npm install runner. Runs `npm install --omit=dev --no-audit --no-fund`
 * inside the plugin cache dir. Throws on non-zero exit or spawn error, including
 * trimmed stdout/stderr for diagnostics. This is the host-authorized effect; tests
 * inject a fake runner instead.
 * @param {string} pluginDir
 * @param {Record<string, string>} _deps
 * @returns {void}
 */
export function runNpmInstall(pluginDir, _deps) {
  const result = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: pluginDir,
    encoding: 'utf8',
    shell: false,
    timeout: NPM_INSTALL_TIMEOUT_MS,
  });
  if (result.error) {
    throw new Error(`npm install failed to spawn in ${pluginDir}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim();
    const stdout = String(result.stdout ?? '').trim();
    const detail = [stderr, stdout].filter(Boolean).join('\n');
    throw new Error(`npm install failed in ${pluginDir} (exit ${result.status})${detail ? ': ' + detail : ''}`);
  }
}

/**
 * Install runtime npm dependencies for installed marketplace plugins.
 *
 * Reuses the discovery in install-skills.js: each catalog plugin is resolved to its
 * per-version cache dir (the directory the OMP runtime loads the plugin from). When the
 * plugin declares dependencies that don't resolve from there, runs `npm install` IN that
 * cache dir so the produced `<cacheDir>/node_modules` makes imports like `elkjs` work.
 *
 * Advisory-only: invoked explicitly by the user; performs a host-authorized npm install
 * effect (like other exec tools) and returns structured evidence. Never throws for
 * per-plugin failures — they land in `errors`.
 *
 * @param {object} [options]
 * @param {boolean} [options.dryRun=false]    Report would-install without running npm.
 * @param {string}  [options.ompRoot]         OMP root dir (default: ~/.omp).
 * @param {string}  [options.plugin]          Only process the plugin with this name.
 * @param {(pluginDir: string, deps: Record<string,string>) => Promise<void>|void} [options.installRunner]
 *        Injected install runner (default: runNpmInstall). Used by tests.
 * @returns {Promise<{ installed: object[], upToDate: object[], errors: object[], warnings: string[] }>}
 */
export async function installPluginDeps({
  dryRun = false,
  ompRoot,
  plugin,
  installRunner,
} = {}) {
  const root = ompRoot ?? defaultOmpRoot();
  const runner = installRunner ?? runNpmInstall;
  const results = {
    installed: [],
    upToDate: [],
    errors: [],
    warnings: [],
  };

  const paths = resolvePaths(root);
  const marketplaces = await discoverMarketplaces(paths.marketplacesDir);

  if (!marketplaces.length) {
    results.warnings.push('No marketplace catalogs found');
    return results;
  }

  for (const catalog of marketplaces) {
    const marketplaceName = catalog.name;
    for (const entry of catalog.plugins ?? []) {
      if (plugin && entry.name !== plugin) continue;

      const cacheDir = resolvePluginCacheDir(paths.pluginsDir, marketplaceName, entry);
      if (!cacheDir) {
        results.warnings.push(`${marketplaceName}/${entry.name} v${entry.version}: plugin cache dir not found`);
        continue;
      }

      const deps = readPluginDependencies(cacheDir);
      if (!Object.keys(deps).length) {
        continue; // no runtime dependencies declared — nothing to do
      }

      if (!pluginNeedsInstall(cacheDir, deps)) {
        results.upToDate.push({ plugin: entry.name, version: entry.version, dependencies: Object.keys(deps) });
        continue;
      }

      if (dryRun) {
        results.installed.push({ plugin: entry.name, version: entry.version, dependencies: Object.keys(deps), dryRun: true });
        continue;
      }

      try {
        await runner(cacheDir, deps);
      } catch (err) {
        results.errors.push({ plugin: entry.name, version: entry.version, error: err?.message ?? String(err) });
        continue;
      }

      const verification = verifyDependencies(cacheDir, deps);
      if (verification.ok) {
        results.installed.push({ plugin: entry.name, version: entry.version, dependencies: Object.keys(deps) });
      } else {
        results.errors.push({ plugin: entry.name, version: entry.version, error: 'dependencies still unresolvable after install', missing: verification.missing });
      }
    }
  }

  return results;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}