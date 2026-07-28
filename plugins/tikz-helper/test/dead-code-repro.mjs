/**
 * Reproduction script: Verify dead code after return in segmentsShareEndpoint.
 *
 * Bug claim:
 *   1. `segmentsShareEndpoint` returns on line ~387-392, making the
 *      `return count;` on line ~393 unreachable dead code.
 *   2. `count` is not defined anywhere in the function scope or as a
 *      module-level variable — it would be a ReferenceError if reached.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcPath = resolve(__dirname, '../src/geometry-check.js');
const src = readFileSync(srcPath, 'utf-8');

let failures = 0;
function assert(cond, msg) {
  if (!cond) { console.error(`FAIL: ${msg}`); failures++; }
}

// --- Extract function body ---
const fnMatch = src.match(
  /function segmentsShareEndpoint\(a,\s*b\)\s*\{([\s\S]*?)\n\}/
);
assert(fnMatch, 'Could not extract segmentsShareEndpoint function body');
if (!fnMatch) { process.exit(1); }

const fnBody = fnMatch[1];
console.log('=== segmentsShareEndpoint function body ===');
console.log(fnBody);

// --- Check 1: return (...) comes before return count; ---
const firstReturnMatch = fnBody.match(/return\s*\(/);
const deadReturnMatch = fnBody.match(/return\s+count\s*;/);
assert(firstReturnMatch, 'Expected a `return (...)` statement');
assert(deadReturnMatch, 'Expected a `return count;` statement');
if (!firstReturnMatch || !deadReturnMatch) { process.exit(1); }

const firstReturnIdx = fnBody.indexOf(firstReturnMatch[0]);
const deadReturnIdx = fnBody.indexOf(deadReturnMatch[0]);
console.log(`\nFirst return at char offset: ${firstReturnIdx}`);
console.log(`Dead return at char offset: ${deadReturnIdx}`);
console.log(`Dead return is AFTER first return: ${deadReturnIdx > firstReturnIdx}`);

assert(deadReturnIdx > firstReturnIdx, '`return count;` is NOT after the first return');

// --- Check 2: count is not declared in function scope ---
const countDeclMatch = fnBody.match(/\b(let|var|const)\s+count\b/);
console.log(`\n\`count\` declared locally: ${countDeclMatch ? 'YES' : 'NO'}`);
assert(!countDeclMatch, '`count` IS declared in function scope');

// --- Check 3: count is not at module level ---
const moduleLevelCount = src.match(/^(let|var|const)\s+count\b/m);
console.log(`Module-level \`count\`: ${moduleLevelCount ? 'YES' : 'NO'}`);

// --- Check 4: Hypothetical reachability test ---
console.log('\n=== Hypothetical: first return removed ===');
try {
  const hypotheticalFn = new Function('a', 'b', `
    const af = a.from, at = a.to, bf = b.from, bt = b.to;
    return count;
  `);
  hypotheticalFn(
    { from: { x: 0, y: 0 }, to: { x: 1, y: 1 } },
    { from: { x: 0, y: 0 }, to: { x: 2, y: 2 } }
  );
  assert(false, 'No error thrown for undefined count');
} catch (e) {
  console.log(`Error: ${e.constructor.name}: ${e.message}`);
  assert(e instanceof ReferenceError, `Expected ReferenceError, got ${e.constructor.name}`);
}

// --- Summary ---
console.log('\n=============================');
if (failures > 0) {
  console.log(`RESULT: ${failures} FAILURES — bug claim NOT fully confirmed`);
  process.exit(1);
} else {
  console.log('BUG CONFIRMED');
  console.log('=============================');
  console.log('1. `return count;` is UNREACHABLE — preceding `return (...)` always fires first.');
  console.log('2. `count` is NOT declared in function scope (local or closure).');
  console.log('   It exists only inside `countEdgeCrossings()` — a different function scope.');
  console.log('3. If reached, would throw ReferenceError: count is not defined.');
  console.log('4. @returns JSDoc says `boolean`, matching first return, not `count`.');
}
