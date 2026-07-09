import { existsSync, mkdirSync, readFileSync, readlinkSync, readdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export function defaultOmpRoot() {
  return path.join(os.homedir(), '.omp');
}

function resolvePaths(ompRoot) {
  return {
    skillsDir: path.join(ompRoot, 'skills'),
    managedSkillsDir: path.join(ompRoot, 'agent', 'managed-skills'),
    marketplacesDir: path.join(ompRoot, 'plugins', 'cache', 'marketplaces'),
    pluginsDir: path.join(ompRoot, 'plugins', 'cache', 'plugins'),
  };
}

/**
 * Install marketplace plugin skills into the OMP skill resolution paths.
 *
 * Scans all marketplace catalogs, finds each plugin's cache directory,
 * reads SKILL.md frontmatter names, and creates directory symlinks so the
 * OMP runtime can resolve skill:// URIs.
 *
 * Targets (in order):
 *   <ompRoot>/skills/<name>/     — canonical path
 *   <ompRoot>/agent/managed-skills/<name>/  — confirmed scan path
 *
 * Non-destructive: real directories are left untouched.
 *
 * @param {object} options
 * @param {boolean} [options.dryRun=false]  Print actions without executing.
 * @param {string}  [options.ompRoot]       OMP root dir (default: ~/.omp)
 * @returns {{ installed: string[], skipped: string[], errors: string[], warnings: string[] }}
 */
export async function installPluginSkills({ dryRun = false, ompRoot } = {}) {
  const results = { installed: [], skipped: [], errors: [], warnings: [] };
  const paths = resolvePaths(ompRoot ?? defaultOmpRoot());
  const marketplaces = await discoverMarketplaces(paths.marketplacesDir);

  if (!marketplaces.length) {
    results.warnings.push('No marketplace catalogs found');
    return results;
  }

  for (const catalog of marketplaces) {
    const marketplaceName = catalog.name;
    for (const plugin of catalog.plugins ?? []) {
      const skills = plugin.skills ?? [];
      if (!skills.length) continue;

      const cacheDir = resolvePluginCacheDir(paths.pluginsDir, marketplaceName, plugin);
      if (!cacheDir) {
        results.warnings.push(`${marketplaceName}/${plugin.name} v${plugin.version}: plugin cache dir not found`);
        continue;
      }

      for (const skillRef of skills) {
        const bareRef = String(skillRef).replace(/^\.\//, '');
        const skillDir = path.resolve(cacheDir, bareRef);
        const skillFile = path.join(skillDir, 'SKILL.md');

        if (!existsSync(skillFile)) {
          results.warnings.push(`${plugin.name}: SKILL.md not found at ${skillFile}`);
          continue;
        }

        // Get name from frontmatter — the canonical skill:// URI name
        const name = skillFrontmatterName(readFileSync(skillFile, 'utf8'));
        if (!name) {
          results.warnings.push(`${plugin.name}: no name in frontmatter at ${skillFile}`);
          continue;
        }

        // Install to each target directory
        for (const targetBase of [paths.skillsDir, paths.managedSkillsDir]) {
          installSingle(name, skillDir, targetBase, dryRun, results);
        }
      }
    }
  }

  return results;
}

function installSingle(name, sourceDir, targetBase, dryRun, results) {
  const targetDir = path.join(targetBase, name);

  try {
    if (!existsSync(targetBase)) {
      if (dryRun) {
        results.installed.push(`mkdir -p ${targetBase}`);
      } else {
        mkdirSync(targetBase, { recursive: true });
      }
    }

    // Use readlinkSync to detect symlinks (including broken ones) that
    // existsSync would miss (it follows the link and returns false when
    // the target is missing).
    let isExistingSymlink = false;
    let existingTarget = null;
    try {
      existingTarget = readlinkSync(targetDir);
      isExistingSymlink = true;
    } catch {
      // Not a symlink — check if it's a real dir below
    }

    if (isExistingSymlink) {
      if (existingTarget === sourceDir) {
        results.skipped.push(`${name} (already installed)`);
        return;
      }
      // Stale or wrong symlink — replace
      if (dryRun) {
        results.installed.push(`replace symlink: ${targetDir} -> ${sourceDir}`);
      } else {
        unlinkSync(targetDir);
        symlinkSync(sourceDir, targetDir, 'dir');
        results.installed.push(`${name} (updated)`);
      }
      return;
    }

    if (existsSync(targetDir)) {
      // Real directory — treat as user-created skill (non-destructive)
      results.skipped.push(`${name} (existing real directory)`);
      return;
    }

    // Doesn't exist at all — create symlink
    if (dryRun) {
      results.installed.push(`ln -s ${sourceDir} ${targetDir}`);
    } else {
      symlinkSync(sourceDir, targetDir, 'dir');
      results.installed.push(name);
    }
  } catch (err) {
    results.errors.push(`${name}: ${err.message}`);
  }
}

async function discoverMarketplaces(marketplacesDir) {
  if (!existsSync(marketplacesDir)) return [];

  const entries = await readdir(marketplacesDir, { withFileTypes: true });
  const catalogs = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const marketplaceFile = path.join(marketplacesDir, entry.name, 'marketplace.json');
    if (!existsSync(marketplaceFile)) continue;
    try {
      const text = await readFile(marketplaceFile, 'utf8');
      const data = JSON.parse(text);
      catalogs.push({
        name: data.name ?? entry.name,
        plugins: data.plugins ?? [],
      });
    } catch {
      // skip malformed catalogs
    }
  }

  return catalogs;
}

function resolvePluginCacheDir(pluginsDir, marketplaceName, plugin) {
  if (!existsSync(pluginsDir)) return null;

  // Convention: <marketplace>___<name>___<version>
  const canonical = `${marketplaceName}___${plugin.name}___${plugin.version}`;
  const candidate = path.join(pluginsDir, canonical);
  if (existsSync(candidate)) return candidate;

  // Fuzzy suffix match: find any dir ending with ___<name>___<version>
  const suffix = `___${plugin.name}___${plugin.version}`;
  try {
    const entries = readdirSync(pluginsDir);
    for (const entry of entries) {
      if (entry === canonical) continue;
      if (entry.endsWith(suffix) && existsSync(path.join(pluginsDir, entry))) {
        return path.join(pluginsDir, entry);
      }
    }
  } catch {
    // ignore readdir failures
  }

  return null;
}

function skillFrontmatterName(text) {
  const frontmatter = String(text).match(/^---\s*\n([\s\S]*?)\n---/);
  const source = frontmatter?.[1] ?? String(text);
  const match = source.match(/^name:\s*['"]?([^'"\r\n]+)['"]?\s*$/m);
  return match?.[1]?.trim() ?? '';
}
