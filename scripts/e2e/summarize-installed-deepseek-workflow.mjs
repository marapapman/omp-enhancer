#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  evaluateWorkflowSummary,
  parseNdjson,
  summarizeWorkflowEvents,
} from './workflow-events.mjs';

export async function summarizeFile(file, { scenarioId = null, expectations = {} } = {}) {
  const text = await readFile(file, 'utf8');
  const parsed = parseNdjson(text);
  const summary = summarizeWorkflowEvents(parsed.events, {
    scenarioId,
    invalidJsonLines: parsed.invalidLines,
  });
  return { summary, evaluation: evaluateWorkflowSummary(summary, expectations) };
}

async function main(argv = process.argv.slice(2)) {
  const file = argv[0];
  if (!file) throw new Error('Usage: summarize-installed-deepseek-workflow.mjs <events.ndjson>');
  const result = await summarizeFile(resolve(file));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
