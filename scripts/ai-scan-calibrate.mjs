#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { scanAiStyle } from '../plugins/writing-helper/src/ai-scan.js';

function parseArgs(argv) {
  const args = { corpus: '', out: '', l2: 2, iterations: 4000, learningRate: 0.1 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--corpus') args.corpus = argv[++index] ?? '';
    else if (arg === '--out') args.out = argv[++index] ?? '';
    else if (arg === '--l2') args.l2 = Number(argv[++index]);
    else if (arg === '--iterations') args.iterations = Number(argv[++index]);
    else if (arg === '--learning-rate') args.learningRate = Number(argv[++index]);
  }
  if (!args.corpus) {
    console.error('usage: node scripts/ai-scan-calibrate.mjs --corpus <dir> [--out <json>]');
    process.exit(1);
  }
  return args;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values, average) {
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function fitLogistic(rows, labels, { l2, iterations, learningRate }) {
  const width = rows[0].length;
  const weights = new Array(width).fill(0);
  let intercept = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const gradient = new Array(width).fill(0);
    let interceptGradient = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const error = sigmoid(dot(rows[index], weights) + intercept) - labels[index];
      for (let column = 0; column < width; column += 1) {
        gradient[column] += error * rows[index][column];
      }
      interceptGradient += error;
    }
    for (let column = 0; column < width; column += 1) {
      weights[column] -= learningRate * (gradient[column] / rows.length + (l2 * weights[column]) / rows.length);
    }
    intercept -= learningRate * (interceptGradient / rows.length);
  }
  return { weights, intercept };
}

function readCorpus(root) {
  const groups = ['en-human', 'en-ai', 'zh-human', 'zh-ai'];
  const documents = [];
  for (const group of groups) {
    const directory = path.join(root, group);
    if (!fs.existsSync(directory)) continue;
    for (const file of fs.readdirSync(directory).filter((name) => name.endsWith('.txt')).sort()) {
      const text = fs.readFileSync(path.join(directory, file), 'utf8');
      if (!text.trim()) continue;
      const language = group.startsWith('zh') ? 'zh' : 'en';
      const segmenter = language === 'zh' ? new Intl.Segmenter('zh', { granularity: 'word' }) : null;
      const scanned = scanAiStyle({
        text,
        language,
        segmenter,
        includeKeywordRules: false,
        mode: 'standard',
      });
      documents.push({
        group,
        language,
        name: file.replace(/\.txt$/u, ''),
        label: group.endsWith('ai') ? 'ai' : 'human',
        features: scanned.metrics.styleProfile.features,
        score: scanned.score,
        band: scanned.band,
        directional: scanned.metrics.styleProfile.directional,
        lexical: scanned.metrics.wordHabits.lexical,
        tokens: scanned.metrics.tokens,
      });
    }
  }
  return documents;
}

function calibrate(documents, options) {
  const output = {};
  for (const language of ['en', 'zh']) {
    const documentsForLanguage = documents.filter((document) => document.language === language);
    if (documentsForLanguage.length === 0) continue;
    const keys = Object.keys(documentsForLanguage[0].features);
    const human = documentsForLanguage.filter((document) => document.label === 'human');
    const reference = {};
    for (const key of keys) {
      const values = human.map((document) => document.features[key]);
      const average = mean(values);
      reference[key] = {
        mean: Number(average.toFixed(4)),
        sd: Number(standardDeviation(values, average).toFixed(4)),
      };
    }
    const rows = documentsForLanguage.map((document) => keys.map((key) => {
      const floor = Math.max(reference[key].sd, Math.abs(reference[key].mean) * 0.05, 0.05);
      return Math.max(-3, Math.min(3, (document.features[key] - reference[key].mean) / floor));
    }));
    const labels = documentsForLanguage.map((document) => (document.label === 'ai' ? 1 : 0));
    const model = fitLogistic(rows, labels, options);
    const normalizer = model.weights.reduce((sum, weight) => sum + Math.abs(weight), 0);
    output[language] = {
      reference,
      directionWeights: Object.fromEntries(keys.map((key, index) => [key, Number(model.weights[index].toFixed(4))])),
      intercept: Number(model.intercept.toFixed(4)),
      normalizer: Number(normalizer.toFixed(4)),
      documents: documentsForLanguage.map((document, index) => ({
        group: document.group,
        name: document.name,
        label: document.label,
        tokens: document.tokens,
        score: document.score,
        band: document.band,
        directional: document.directional,
        calibrationDirectional: Number((dot(rows[index], model.weights) / normalizer).toFixed(3)),
        lexicalZ: document.lexical.z,
      })),
    };
  }
  return output;
}

const options = parseArgs(process.argv.slice(2));
const documents = readCorpus(options.corpus);
if (documents.length === 0) {
  console.error(`no .txt files found under ${options.corpus}`);
  process.exit(1);
}
const output = {
  generatedAt: new Date().toISOString().slice(0, 10),
  corpus: options.corpus,
  tokenization: 'production scanAiStyle features',
  options: {
    l2: options.l2,
    iterations: options.iterations,
    learningRate: options.learningRate,
  },
  languages: calibrate(documents, options),
};
const text = JSON.stringify(output, null, 2) + '\n';
if (options.out) {
  fs.writeFileSync(options.out, text, 'utf8');
  console.log(`wrote ${options.out}`);
} else {
  process.stdout.write(text);
}
