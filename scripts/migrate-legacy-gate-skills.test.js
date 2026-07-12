import test from 'node:test';
import assert from 'node:assert/strict';

import { LEGACY_GATE_SKILL_NAMES } from '../plugins/omp-enhancer-core/src/install-skills.js';
import { mergeIgnoredSkills } from './migrate-legacy-gate-skills.mjs';

test('legacy gate skill migration merges exact names idempotently', () => {
  const current = ['gateguard', 'omp-gate-unblock'];
  const merged = mergeIgnoredSkills(current);
  assert.deepEqual(merged, [
    'gateguard',
    'omp-gate-unblock',
    ...LEGACY_GATE_SKILL_NAMES.filter((name) => name !== 'omp-gate-unblock'),
  ]);
  assert.deepEqual(mergeIgnoredSkills(merged), merged);
  assert.equal(merged.includes('omp-testing-enhancer-audit'), false);
  assert.equal(merged.some((name) => name.includes('*')), false);
});

test('legacy gate skill migration normalizes invalid current values without wildcards', () => {
  assert.deepEqual(mergeIgnoredSkills(null), [...LEGACY_GATE_SKILL_NAMES]);
  assert.deepEqual(mergeIgnoredSkills(['', '  gateguard  ', 'gateguard']), [
    'gateguard',
    ...LEGACY_GATE_SKILL_NAMES,
  ]);
});
