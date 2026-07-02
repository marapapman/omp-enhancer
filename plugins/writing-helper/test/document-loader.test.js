import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { loadWritingLogicDocument } from '../src/document-loader.js';

describe('loadWritingLogicDocument', () => {
  it('uses inline text before reading a path', () => {
    const result = loadWritingLogicDocument(
      { text: 'inline draft', path: 'missing.md' },
      process.cwd(),
    );

    assert.equal(result.ok, true);
    assert.equal(result.text, 'inline draft');
    assert.equal(result.source, 'text');
  });

  it('reads a relative path from cwd', () => {
    const dir = mkdtempSync(join(tmpdir(), 'writing-logic-loader-'));
    try {
      writeFileSync(join(dir, 'paper.md'), 'draft from file', 'utf8');

      const result = loadWritingLogicDocument({ path: 'paper.md' }, dir);

      assert.equal(result.ok, true);
      assert.equal(result.text, 'draft from file');
      assert.equal(result.source, 'paper.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns a structured error when neither text nor path is present', () => {
    const result = loadWritingLogicDocument({}, process.cwd());

    assert.equal(result.ok, false);
    assert.match(result.error, /Either text or path is required/);
  });

  it('returns a structured error for an unreadable path', () => {
    const result = loadWritingLogicDocument({ path: 'missing.md' }, process.cwd());

    assert.equal(result.ok, false);
    assert.match(result.error, /Unable to read/);
    assert.equal(result.source, 'missing.md');
  });
});
