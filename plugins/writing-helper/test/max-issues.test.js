import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { MAX_ISSUES_CONFIG, UNLIMITED, clampMaxIssues } from '../src/max-issues.js';

describe('MAX_ISSUES_CONFIG', () => {
  it('defines layered defaults and bounds for logic and quality', () => {
    assert.deepEqual(MAX_ISSUES_CONFIG.logic, { default: 20, min: 1, max: 100 });
    assert.deepEqual(MAX_ISSUES_CONFIG.quality, { default: 30, min: 1, max: 150 });
  });

  it('exposes the unlimited sentinel', () => {
    assert.equal(UNLIMITED, 'unlimited');
  });
});

describe('clampMaxIssues', () => {
  it('falls back to the configured default for undefined, NaN, and Infinity', () => {
    assert.equal(clampMaxIssues(undefined, MAX_ISSUES_CONFIG.logic), 20);
    assert.equal(clampMaxIssues(Number.NaN, MAX_ISSUES_CONFIG.logic), 20);
    assert.equal(clampMaxIssues(Number.POSITIVE_INFINITY, MAX_ISSUES_CONFIG.quality), 30);
  });

  it('clamps to the layer minimum', () => {
    assert.equal(clampMaxIssues(0, MAX_ISSUES_CONFIG.logic), 1);
    assert.equal(clampMaxIssues(-5, MAX_ISSUES_CONFIG.quality), 1);
  });

  it('clamps to the layer maximum', () => {
    assert.equal(clampMaxIssues(500, MAX_ISSUES_CONFIG.logic), 100);
    assert.equal(clampMaxIssues(500, MAX_ISSUES_CONFIG.quality), 150);
  });

  it('truncates fractional values', () => {
    assert.equal(clampMaxIssues(12.9, MAX_ISSUES_CONFIG.logic), 12);
  });

  it('passes in-range values through unchanged', () => {
    assert.equal(clampMaxIssues(7, MAX_ISSUES_CONFIG.logic), 7);
    assert.equal(clampMaxIssues(42, MAX_ISSUES_CONFIG.quality), 42);
  });
});
