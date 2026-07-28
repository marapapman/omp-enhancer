import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { collectProjectSnapshot } from '../src/project-snapshot.js';

/**
 * Helper: create a temp directory for a test fixture.
 * Returns the path. Cleanup is the caller's responsibility.
 */
function tempDir(name) {
  return mkdtempSync(join(tmpdir(), `omp-ps-${name}-`));
}

test('collectProjectSnapshot — monorepo fixture', () => {
  const dir = tempDir('monorepo');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'my-mono', workspaces: ['packages/*'] }, null, 2),
    );
    mkdirSync(join(dir, 'packages'), { recursive: true });
    writeFileSync(join(dir, 'index.js'), 'export const x = 1;\n');
    writeFileSync(join(dir, 'app.js'), 'export const y = 2;\n');
    writeFileSync(join(dir, 'packages', 'a.js'), 'export const a = 1;\n');
    writeFileSync(join(dir, 'packages', 'b.mjs'), 'export const b = 2;\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.projectType, 'monorepo');
    assert.equal(result.isMonorepo, true);
    assert.equal(result.workspaceCount, 1);
    assert.ok(result.sourceFileCount >= 4);
    assert.ok(result.languages.includes('js'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — single-package app (bin)', () => {
  const dir = tempDir('app-bin');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'my-app', bin: './index.js', scripts: { start: 'node index.js' } }, null, 2),
    );
    writeFileSync(join(dir, 'index.js'), 'console.log("hello");\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.projectType, 'app');
    assert.equal(result.isMonorepo, false);
    assert.equal(result.workspaceCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — single-package app (scripts.start only)', () => {
  const dir = tempDir('app-start');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'my-app', scripts: { start: 'node server.js' } }, null, 2),
    );
    writeFileSync(join(dir, 'server.js'), 'console.log("running");\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.projectType, 'app');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — library', () => {
  const dir = tempDir('lib');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'my-lib', main: './lib/index.js' }, null, 2),
    );
    mkdirSync(join(dir, 'lib'));
    writeFileSync(join(dir, 'lib', 'index.js'), 'export const greet = () => {};\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.projectType, 'library');
    assert.equal(result.isMonorepo, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — library with exports field', () => {
  const dir = tempDir('lib-exports');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'my-lib', exports: { '.': './index.js' } }, null, 2),
    );
    writeFileSync(join(dir, 'index.js'), 'export const x = 1;\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.projectType, 'library');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — library with module field', () => {
  const dir = tempDir('lib-module');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'my-lib', module: './dist/index.mjs' }, null, 2),
    );
    mkdirSync(join(dir, 'dist'), { recursive: true });
    writeFileSync(join(dir, 'dist', 'index.mjs'), 'export const x = 1;\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.projectType, 'library');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — unknown (no package.json)', () => {
  const dir = tempDir('unknown');
  try {
    writeFileSync(join(dir, 'main.js'), 'const x = 1;\n');
    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.projectType, 'unknown');
    assert.ok(result.languages.includes('js'));
    assert.equal(result.sourceFileCount, 1);
    assert.equal(result.isMonorepo, false);
    assert.equal(result.workspaceCount, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — empty directory', () => {
  const dir = tempDir('empty');
  try {
    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.projectType, 'unknown');
    assert.equal(result.sourceFileCount, 0);
    assert.deepEqual(result.languages, []);
    assert.equal(result.isMonorepo, false);
    assert.equal(result.hasTests, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — missing path returns null', () => {
  const result = collectProjectSnapshot('/tmp/nonexistent-dir-project-snapshot-test-12345');
  assert.equal(result, null);
});

test('collectProjectSnapshot — null rootPath returns null', () => {
  assert.equal(collectProjectSnapshot(null), null);
});

test('collectProjectSnapshot — undefined rootPath returns null', () => {
  assert.equal(collectProjectSnapshot(undefined), null);
});

test('collectProjectSnapshot — empty string rootPath returns null', () => {
  assert.equal(collectProjectSnapshot(''), null);
});

test('collectProjectSnapshot — TypeScript project', () => {
  const dir = tempDir('ts');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'ts-lib', main: './src/index.ts' }, null, 2),
    );
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'index.ts'), 'export const x: number = 1;\n');
    writeFileSync(join(dir, 'src', 'types.ts'), 'export interface Foo {};\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.ok(result.languages.includes('ts'));
    assert.equal(result.projectType, 'library');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — hasTests detects .test.js files', () => {
  const dir = tempDir('test-files');
  try {
    writeFileSync(join(dir, 'main.js'), 'export const x = 1;\n');
    writeFileSync(join(dir, 'main.test.js'), 'import test from "node:test";\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.hasTests, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — hasTests detects __tests__ directory', () => {
  const dir = tempDir('test-dir');
  try {
    writeFileSync(join(dir, 'main.js'), 'export const x = 1;\n');
    mkdirSync(join(dir, '__tests__'));
    writeFileSync(join(dir, '__tests__', 'main.test.js'), 'import test from "node:test";\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.hasTests, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — hasTests is false when no test files', () => {
  const dir = tempDir('no-test');
  try {
    writeFileSync(join(dir, 'main.js'), 'export const x = 1;\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.hasTests, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — testFramework vitest', () => {
  const dir = tempDir('vitest');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'vitest-app', devDependencies: { vitest: '^1.0.0' } }, null, 2),
    );
    writeFileSync(join(dir, 'main.js'), 'export const x = 1;\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.testFramework, 'vitest');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — testFramework jest', () => {
  const dir = tempDir('jest');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'jest-app', devDependencies: { jest: '^29.0.0' } }, null, 2),
    );
    writeFileSync(join(dir, 'main.js'), 'export const x = 1;\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.testFramework, 'jest');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — testFramework node-test from scripts', () => {
  const dir = tempDir('node-test');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'node-test-app', scripts: { test: 'node --test test/' } }, null, 2),
    );

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.testFramework, 'node-test');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — testFramework null when undetermined', () => {
  const dir = tempDir('no-fw');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'bare-app' }, null, 2),
    );
    writeFileSync(join(dir, 'main.js'), 'export const x = 1;\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.testFramework, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — buildSystem npm (package-lock.json)', () => {
  const dir = tempDir('npm-lock');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'npm-app' }, null, 2),
    );
    writeFileSync(join(dir, 'package-lock.json'), '{}');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.buildSystem, 'npm');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — buildSystem bun (bun.lockb)', () => {
  const dir = tempDir('bun-lock');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'bun-app' }, null, 2),
    );
    writeFileSync(join(dir, 'bun.lockb'), 'binary');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.buildSystem, 'bun');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — buildSystem yarn (yarn.lock)', () => {
  const dir = tempDir('yarn-lock');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'yarn-app' }, null, 2),
    );
    writeFileSync(join(dir, 'yarn.lock'), '# yarn lockfile');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.buildSystem, 'yarn');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — buildSystem null when no lockfile', () => {
  const dir = tempDir('no-lock');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'no-lock-app' }, null, 2),
    );
    writeFileSync(join(dir, 'main.js'), 'export const x = 1;\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.buildSystem, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — packageManager from package.json field', () => {
  const dir = tempDir('pm-field');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'pm-app', packageManager: 'pnpm@8.0.0' }, null, 2),
    );
    writeFileSync(join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 5.4');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.packageManager, 'pnpm@8.0.0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — packageManager derived from lockfile when no field', () => {
  const dir = tempDir('pm-derived');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'derived-app' }, null, 2),
    );
    writeFileSync(join(dir, 'yarn.lock'), '');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.packageManager, 'yarn');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — workspaceCount from workspaces array', () => {
  const dir = tempDir('ws-count');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'ws-mono',
        workspaces: ['packages/a', 'packages/b', 'packages/c'],
      }, null, 2),
    );

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.workspaceCount, 3);
    assert.equal(result.isMonorepo, true);
    assert.equal(result.projectType, 'monorepo');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — Go project with test detection', () => {
  const dir = tempDir('go');
  try {
    writeFileSync(join(dir, 'go.mod'), 'module example.com/myapp\n');
    writeFileSync(join(dir, 'main.go'), 'package main\nfunc main() {}\n');
    writeFileSync(join(dir, 'main_test.go'), 'package main\nfunc TestX(t *testing.T) {}\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.ok(result.languages.includes('go'));
    assert.equal(result.buildSystem, 'go');
    assert.equal(result.hasTests, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — Python project with pip build system', () => {
  const dir = tempDir('py');
  try {
    writeFileSync(join(dir, 'requirements.txt'), 'requests>=2.0.0\n');
    writeFileSync(join(dir, 'main.py'), 'print("hello")\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.ok(result.languages.includes('py'));
    assert.equal(result.buildSystem, 'pip');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — error handling: path is a file, not a directory', () => {
  const dir = tempDir('not-dir');
  try {
    const filePath = join(dir, 'somefile.txt');
    writeFileSync(filePath, 'hello');
    const result = collectProjectSnapshot(filePath);
    assert.equal(result, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — Rust project', () => {
  const dir = tempDir('rs');
  try {
    writeFileSync(join(dir, 'Cargo.toml'), '[package]\nname = "my-app"\n');
    writeFileSync(join(dir, 'main.rs'), 'fn main() {}\n');
    writeFileSync(join(dir, 'lib.rs'), 'pub fn add() -> i32 { 1 }\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.ok(result.languages.includes('rs'));
    assert.equal(result.buildSystem, 'cargo');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — Java/Kotlin project', () => {
  const dir = tempDir('java');
  try {
    writeFileSync(join(dir, 'Main.java'), 'public class Main {}\n');
    writeFileSync(join(dir, 'Util.kt'), 'fun util() {}\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.ok(result.languages.includes('java'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — excludes node_modules, .git, dist, build', () => {
  const dir = tempDir('exclude');
  try {
    writeFileSync(join(dir, 'index.js'), 'export const x = 1;\n');
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'node_modules', 'lodash.js'), '// huge lib\n');
    mkdirSync(join(dir, '.git'));
    writeFileSync(join(dir, '.git', 'config'), '[core]\n');
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'dist', 'bundle.js'), '// bundled\n');
    mkdirSync(join(dir, 'build'));
    writeFileSync(join(dir, 'build', 'output.js'), '// built\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    assert.equal(result.sourceFileCount, 1);
    assert.ok(result.languages.includes('js'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — badly nested deep subdirs are capped at 200 entries', () => {
  const dir = tempDir('cap200');
  try {
    // Create a single source file at root, then a subdirectory with 250 entries
    writeFileSync(join(dir, 'main.js'), 'export const x = 1;\n');
    mkdirSync(join(dir, 'deep'));
    for (let i = 0; i < 250; i++) {
      writeFileSync(join(dir, 'deep', `file${i}.js`), 'export const x = 1;\n');
    }

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);
    // The cap is 200, so at most 201 source files (1 root + 200 from deep)
    assert.ok(result.sourceFileCount <= 201);
    // The main.js is counted, and up to 200 from deep are counted
    assert.ok(result.sourceFileCount >= 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectProjectSnapshot — serializes all expected fields', () => {
  const dir = tempDir('all-fields');
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'complete',
        version: '1.0.0',
        workspaces: ['packages/*'],
        packageManager: 'pnpm@9.0.0',
        devDependencies: { vitest: '^1.0.0' },
      }, null, 2),
    );
    mkdirSync(join(dir, 'packages', 'core'), { recursive: true });
    writeFileSync(join(dir, 'index.ts'), 'export const x = 1;\n');
    writeFileSync(join(dir, 'index.test.ts'), 'import { test } from "vitest";\n');
    writeFileSync(join(dir, 'packages', 'core', 'index.ts'), 'export const y = 2;\n');

    const result = collectProjectSnapshot(dir);
    assert.notEqual(result, null);

    // Check that every expected field exists and has the right type
    assert.equal(typeof result.projectType, 'string');
    assert.equal(typeof result.isMonorepo, 'boolean');
    assert.equal(Array.isArray(result.languages), true);
    assert.equal(typeof result.sourceFileCount, 'number');
    assert.equal(typeof result.hasTests, 'boolean');
    assert.ok(result.testFramework === null || typeof result.testFramework === 'string');
    assert.ok(result.buildSystem === null || typeof result.buildSystem === 'string');
    assert.ok(result.packageManager === null || typeof result.packageManager === 'string');
    assert.equal(typeof result.workspaceCount, 'number');

    // Verify specific values
    assert.equal(result.projectType, 'monorepo');
    assert.equal(result.isMonorepo, true);
    assert.ok(result.languages.includes('ts'));
    assert.ok(result.hasTests);
    assert.equal(result.testFramework, 'vitest');
    assert.equal(result.workspaceCount, 1);
    assert.equal(result.packageManager, 'pnpm@9.0.0');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
