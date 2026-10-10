#!/usr/bin/env node
/**
 * Standalone whole-deck AI-tell census.
 *
 * Usage: node deck-census.mjs <main.tex>
 *
 * Reads the deck from disk directly (no plugin runtime), prints the report on
 * stdout, and exits 0 on success or 1 with the error on stderr.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { censusDeck, formatDeckCensusReport } from '../../../src/deck-census.js';

function fail(message) {
  process.stderr.write(`${message}\n`);
  return 1;
}

function main(argv) {
  const target = argv[2];
  if (typeof target !== 'string' || target.trim() === '') {
    return fail('Usage: node deck-census.mjs <main.tex>');
  }

  const mainPath = resolve(target);
  let mainText;
  try {
    mainText = readFileSync(mainPath, 'utf8');
  } catch (error) {
    return fail(`Unable to read ${mainPath}: ${error.message}`);
  }

  const census = censusDeck({
    mainPath,
    mainText,
    readFile: (path) => readFileSync(path, 'utf8'),
  });
  if (!census.ok) return fail(census.error);

  process.stdout.write(`${formatDeckCensusReport(census)}\n`);
  return 0;
}

process.exitCode = main(process.argv);
