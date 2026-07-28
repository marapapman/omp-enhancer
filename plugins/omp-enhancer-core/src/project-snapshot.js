import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);

const EXTENSION_MAP = {
  '.js': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
  '.ts': 'ts',
  '.tsx': 'ts',
  '.py': 'py',
  '.go': 'go',
  '.rs': 'rs',
  '.java': 'java',
  '.kt': 'java',
};

const SOURCE_EXTENSIONS = new Set(Object.keys(EXTENSION_MAP));

const TEST_FILE_PATTERNS = [
  (name) => name.endsWith('.test.js'),
  (name) => name.endsWith('.test.ts'),
  (name) => name.endsWith('.spec.ts'),
  (name) => name.endsWith('.spec.js'),
  (name) => name.startsWith('test_'),
  (name) => name.endsWith('_test.go'),
];

const TEST_DIR_NAMES = new Set(['test', 'tests', '__tests__']);

const MAX_ENTRIES_PER_DIR = 200;
const MAX_TOTAL_FILES = 5000;

/**
 * @typedef {Object} ProjectSnapshot
 * @property {'monorepo'|'single-package'|'library'|'app'|'unknown'} projectType
 * @property {string[]} languages
 * @property {boolean} isMonorepo
 * @property {number} sourceFileCount
 * @property {boolean} hasTests
 * @property {string|null} testFramework
 * @property {string|null} buildSystem
 * @property {string|null} packageManager
 * @property {number} workspaceCount
 */

/**
 * Collect a snapshot of the project at the given root path.
 *
 * Returns a ProjectSnapshot object on success, or `null` on any error
 * (missing path, read error, etc.).
 *
 * @param {string|null|undefined} rootPath
 * @returns {ProjectSnapshot|null}
 */
export function collectProjectSnapshot(rootPath) {
  if (!rootPath) return null;

  try {
    // Verify path exists and is a directory
    const stat = statSync(rootPath);
    if (!stat.isDirectory()) return null;

    const pkg = readPackageJson(rootPath);
    const entries = safeReadDir(rootPath, MAX_ENTRIES_PER_DIR);

    const scanResult = scanDirectory(rootPath, entries);

    const projectType = deriveProjectType(pkg, entries);
    const isMonorepo = Boolean(pkg?.workspaces?.length > 0);
    const workspaceCount = pkg?.workspaces?.length ?? 0;
    const testFramework = detectTestFramework(pkg);
    const buildSystem = detectBuildSystem(rootPath, entries, pkg);
    const packageManager = detectPackageManager(pkg, rootPath, entries);

    return {
      projectType,
      languages: [...scanResult.languages].sort(),
      isMonorepo,
      sourceFileCount: scanResult.sourceFileCount,
      hasTests: scanResult.hasTests,
      testFramework,
      buildSystem,
      packageManager,
      workspaceCount,
    };
  } catch {
    return null;
  }
}

/**
 * Read and parse package.json from rootPath. Returns null if missing or invalid.
 */
function readPackageJson(rootPath) {
  try {
    const raw = readFileSync(join(rootPath, 'package.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Safely read a directory's entries, returning an array of Dirent-like names.
 * Returns empty array on error.
 */
function safeReadDir(dirPath, limit) {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    return entries.slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Scan a directory (root and one level deep) for source files, languages, and test presence.
 */
function scanDirectory(rootPath, entries) {
  const languages = new Set();
  let sourceFileCount = 0;
  let hasTests = false;

  for (const entry of entries) {
    if (sourceFileCount >= MAX_TOTAL_FILES) break;

    const name = entry.name;

    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(name)) continue;
      if (TEST_DIR_NAMES.has(name)) hasTests = true;

      // Scan one level deep (cap at 200)
      const subEntries = safeReadDir(join(rootPath, name), MAX_ENTRIES_PER_DIR);
      for (const sub of subEntries) {
        if (sourceFileCount >= MAX_TOTAL_FILES) break;
        const subName = sub.name;
        if (sub.isDirectory()) {
          if (EXCLUDED_DIRS.has(subName)) continue;
          if (TEST_DIR_NAMES.has(subName)) hasTests = true;
          // Don't recurse further
        } else if (sub.isFile()) {
          if (isTestFileName(subName)) hasTests = true;
          const lang = classifySourceFile(subName);
          if (lang) {
            languages.add(lang);
            sourceFileCount += 1;
          }
        }
      }
    } else if (entry.isFile()) {
      if (isTestFileName(name)) hasTests = true;
      const lang = classifySourceFile(name);
      if (lang) {
        languages.add(lang);
        sourceFileCount += 1;
      }
    }
  }

  return { languages, sourceFileCount, hasTests };
}

/**
 * Classify a file name by extension. Returns the language string or null.
 */
function classifySourceFile(name) {
  const lower = name.toLowerCase();
  for (const [ext, lang] of Object.entries(EXTENSION_MAP)) {
    if (lower.endsWith(ext)) return lang;
  }
  return null;
}

/**
 * Check if a file name matches known test file patterns.
 */
function isTestFileName(name) {
  for (const pattern of TEST_FILE_PATTERNS) {
    if (pattern(name)) return true;
  }
  return false;
}

/**
 * Derive project type from package.json content.
 */
function deriveProjectType(pkg, entries) {
  if (!pkg) return 'unknown';

  if (Array.isArray(pkg.workspaces) && pkg.workspaces.length > 0) {
    return 'monorepo';
  }

  if (pkg.bin || pkg.scripts?.start) {
    return 'app';
  }

  if (pkg.main || pkg.module || pkg.exports) {
    return 'library';
  }

  return 'single-package';
}

/**
 * Detect test framework from package.json.
 */
function detectTestFramework(pkg) {
  if (!pkg) return null;

  const devDeps = pkg.devDependencies;
  if (devDeps) {
    if (devDeps.vitest) return 'vitest';
    if (devDeps.jest) return 'jest';
  }

  const scripts = pkg.scripts;
  if (scripts?.test && typeof scripts.test === 'string' && scripts.test.includes('node --test')) {
    return 'node-test';
  }

  return null;
}

/**
 * Detect build system from lockfiles and project files.
 */
function detectBuildSystem(rootPath, entries, pkg) {
  // Check for known files in the scanned entries
  const fileNames = entries.filter((e) => e.isFile()).map((e) => e.name);

  if (fileNames.includes('package-lock.json')) return 'npm';
  if (fileNames.includes('bun.lockb')) return 'bun';
  if (fileNames.includes('yarn.lock')) return 'yarn';

  // Check for files not necessarily captured in the scan (entry limit might miss them)
  if (existsSync(join(rootPath, 'Cargo.toml'))) return 'cargo';
  if (existsSync(join(rootPath, 'go.mod'))) return 'go';

  // Detect Python via side car files
  if (existsSync(join(rootPath, 'requirements.txt')) || existsSync(join(rootPath, 'pyproject.toml'))) {
    return 'pip';
  }

  return null;
}

/**
 * Detect package manager from packageManager field or lockfiles.
 */
function detectPackageManager(pkg, rootPath, entries) {
  if (pkg?.packageManager) return pkg.packageManager;

  const fileNames = entries.filter((e) => e.isFile()).map((e) => e.name);

  if (fileNames.includes('pnpm-lock.yaml') || existsSync(join(rootPath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fileNames.includes('package-lock.json')) return 'npm';
  if (fileNames.includes('bun.lockb')) return 'bun';
  if (fileNames.includes('yarn.lock')) return 'yarn';

  return null;
}
